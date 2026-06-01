# agent-canvas sandbox broker

A small standalone Node service that provisions one **Kubernetes Agent Sandbox**
(`Sandbox` CR, group `agents.x-k8s.io`) per agent-canvas conversation, and acts
as a same-origin HTTP + WebSocket reverse proxy into each running sandbox.

It is the control plane and data-plane proxy for the `k8s` backend kind. The
browser only ever talks to `http://localhost:8000`; the ingress forwards
`/api/k8s/*` and `/sandbox-runtime/*` to this broker (default port **18002**),
which holds the kubeconfig and reaches the cluster.

## How it runs

No build step — it runs directly with `tsx`:

```bash
tsx broker/src/index.ts
```

In the dev stack it is started by `scripts/dev-with-automation.mjs` (Phase C),
gated behind `OH_ENABLE_K8S_BROKER`, with ingress routes
`--route /api/k8s=http://localhost:18002` and
`--route /sandbox-runtime=http://localhost:18002` (longest-prefix wins, so
`/api/k8s` matches before `/api`).

Quick standalone smoke test:

```bash
BROKER_SESSION_API_KEY=devkey LLM_MODEL=anthropic/claude-3-5-sonnet-20241022 \
LLM_API_KEY=sk-... tsx broker/src/index.ts
# then
curl -s http://localhost:18002/api/k8s/health   # -> {"status":"ok"}
```

## Environment variables

| Variable                 | Default                              | Purpose                                                                                  |
| ------------------------ | ------------------------------------ | ---------------------------------------------------------------------------------------- |
| `PORT`                   | `18002`                              | HTTP port the broker listens on.                                                         |
| `KUBE_CONTEXT`           | `orbstack`                           | kubeconfig context to use (pinned explicitly — never the implicit current-context).      |
| `NAMESPACE`              | `agent-canvas`                       | Namespace where `Sandbox` CRs + pods live.                                               |
| `BROKER_SESSION_API_KEY` | _(required)_                         | Shared secret the frontend sends as `X-Session-API-Key` on every `/api/k8s/*` call.      |
| `AGENT_SERVER_IMAGE`     | `ghcr.io/openhands/agent-server`     | Agent-server image repository.                                                            |
| `AGENT_SERVER_IMAGE_TAG` | `1.24.0-python`                      | Agent-server image tag (multi-arch; pulls on Apple-Silicon OrbStack).                    |
| `LLM_MODEL`              | _(required)_                         | LLM model injected into each sandbox's native conversation.                              |
| `LLM_API_KEY`            | _(required)_                         | LLM API key injected into each sandbox's native conversation (broker-held secret).       |
| `LLM_BASE_URL`           | _(unset)_                            | Optional LLM base URL for proxies; omit for first-party Anthropic/OpenAI.                |
| `SANDBOX_API_VERSION`    | _(auto-discovered, then `v1alpha1`)_ | Override the served `Sandbox` CRD version instead of discovering it from the CRD.         |
| `BROKER_PUBLIC_ORIGIN`   | `http://localhost:8000`              | Browser-facing origin used to build `conversation_url` (`<origin>/sandbox-runtime/<id>`). |

`BROKER_SESSION_API_KEY`, `LLM_MODEL`, and `LLM_API_KEY` are **secrets / runtime
config and live in env only** — never in `config/defaults.json`. The broker warns
(but still starts) if any are missing; with no broker key, every `/api/k8s/*`
call is rejected `401` (fail-closed).

## What it does

- **Control plane** (`/api/k8s/*`, requires the broker key except `/health`):
  - `POST /api/k8s/app-conversations` — create a `Sandbox` CR (`conv-<uuid>`,
    `spec.replicas:1`, `spec.service:true`, `/workspace` PVC) and return a
    `WORKING` start-task immediately (never blocks on pod readiness).
  - `GET /api/k8s/app-conversations/start-tasks?ids=` — the reconcile loop. Maps
    pod phase → start-task status (`WAITING_FOR_SANDBOX` → `STARTING_CONVERSATION`
    → `READY`) and, once the pod is Ready, fires the native
    `POST /api/conversations` exactly once (guarded by a `native-created`
    annotation + an in-flight set). Image pulls keep returning
    `WAITING_FOR_SANDBOX` — never a premature `ERROR`.
  - `GET …/search`, `GET …/app-conversations?ids=`, `DELETE …/{id}`,
    `PATCH …/{id}` (title), `GET …/{id}/file?file_path=`, `GET …/{id}/download`.
  - `POST /api/k8s/sandboxes/{id}/pause|resume` — patch `spec.replicas` 0↔1.
    While paused, the mapped `AppConversation` has `conversation_url` /
    `session_api_key` = `null`; they re-populate once a resumed pod is Ready. The
    native conversation already exists on the PVC, so resume does **not**
    re-create it (the stable per-sandbox `OH_SECRET_KEY` annotation lets the
    agent decrypt its state).
- **Data plane** (`/sandbox-runtime/<uuid>/*`, no broker-key check — the sandbox
  checks its own session key): an HTTP + WebSocket reverse proxy that strips the
  `/sandbox-runtime/<uuid>` prefix and forwards to the sandbox's `:8000`.

The broker is **stateless**: every piece of per-conversation state (title,
created-at, session key, secret key, selected repository, native-created flag,
pending initial message) lives in `Sandbox` labels/annotations and is
reconstructed from the cluster on each request.

## Host → cluster reachability

The macOS OrbStack host cannot resolve `*.svc.cluster.local` (NXDOMAIN) nor route
the pod CIDR, so the in-cluster `status.serviceFQDN` is not directly reachable
from where the broker runs. The broker therefore maintains a per-conversation
**in-process `kubectl port-forward` equivalent** (via
`@kubernetes/client-node`'s `PortForward` over a loopback `net.Server`) and points
the runtime proxy / native-create at `127.0.0.1:<localPort>`. Tunnels are rebuilt
automatically when a pod changes (e.g. after pause→resume) and torn down on pause
/ delete. If a future OrbStack networking mode resolves cluster DNS from the host,
the proxy could target `<serviceFQDN>:8000` directly instead.

## Tests

Pure helpers (CR ⇄ `AppConversation` mapper, pod-phase → start-task-status,
`/sandbox-runtime` prefix strip, native-create body builder, auth) have Vitest
unit tests:

```bash
npx vitest run --config broker/vitest.config.ts
```

## Security notes (local dev)

- The LLM API key lives only in broker env. Each sandbox's per-conversation
  session key is generated by the broker and returned to the browser (same model
  as OpenHands Cloud).
- Sandbox env (`OH_SESSION_API_KEYS_0`, `OH_SECRET_KEY`) is visible via
  `kubectl describe pod` — acceptable for local dev.
