# Live ACP-in-Docker e2e

Proves the containerized ACP credential path **through Canvas's own code** —
each credential is saved to the agent-server's secret store (as onboarding does)
and `buildStartConversationRequest` references it as a `LookupSecret` the server
resolves at spawn time — against a real agent-server container, with real
provider API calls. It's the "it actually works" companion to the unit tests in
`__tests__/api/agent-server-adapter.test.ts` — those assert the request shape;
this asserts a real agent reply.

> **Requires `agent-server:1.25.0-python` or newer** (software-agent-sdk#3510):
> the ACP credentials ride as loopback LookupSecrets, and only #3510 resolves
> them off the event loop. An older image deadlocks the first turn.

It is **not** part of `npm test` (it lives under `tests/`, which Vitest excludes,
and needs a running container + real host credentials).

## Run it

```bash
# 1. Agent-server container with the canvas_ui tool mounted (as the dev stack does).
#    Minimum 1.25.0-python (software-agent-sdk#3510); override for a newer build.
docker run -d --name oh-acp -p 8010:8000 \
  -v oh-acp-data:/workspace \
  -v "$(pwd)/tools:/canvas-tools:ro" -e OH_EXTRA_PYTHON_PATH=/canvas-tools \
  ghcr.io/openhands/agent-server:1.25.0-python

# 2. Run the e2e (all providers, or a subset).
npx vite-node -c tests/e2e/live-acp/vite-node.config.mts \
  tests/e2e/live-acp/acp-docker-e2e.mts -- codex claude gemini

# 3. Tear down (holds real creds).
docker rm -f oh-acp
```

Credentials are read from the host and **never printed**: Codex `~/.codex/auth.json`,
the Claude Code OAuth token from the macOS keychain, and the gcloud ADC for Gemini
Vertex (`gcloud auth application-default login` first). A provider whose creds
aren't present is skipped.

## Last validated result (agent-server `1.25.0-python`, unified LookupSecret path)

Re-validated 2026-06-05 against `ghcr.io/openhands/agent-server:1.25.0-python`
(the first release with software-agent-sdk#3510). Each credential rides as a
loopback `LookupSecret`; the logs confirm the agent-server resolved it
(`GET /api/settings/secrets/<name>` 200) during ACP cold-start — **no deadlock,
no "Failed to start ACP server: timed out"**, which is exactly what #3510 fixes.

| Provider | Result | Evidence (agent-server logs) |
|---|---|---|
| **Codex** | ✅ real reply `ACPOK-CODEX` | `Materialised ACP file-secret 'CODEX_AUTH_JSON' -> …/acp/codex/auth.json`; codex-acp 0.15.0; `Authenticating with ACP method: chatgpt` |
| **Claude Code** | ✅ real reply `ACPOK-CLAUDE` | claude-agent-acp 0.30.0; `CLAUDE_CODE_OAUTH_TOKEN` env path (no `ANTHROPIC_BASE_URL`) |
| **Gemini CLI** | ⚠️ credential path proven; blocked downstream on model selection¹ | `Materialised ACP file-secret 'GOOGLE_APPLICATION_CREDENTIALS_JSON' -> …/acp/gemini-cli/gcloud-credentials.json`; gemini-cli 0.45.1; `Authenticating with ACP method: vertex-ai` ✅ → `Publisher Model …/gemini-3-flash was not found` |

¹ **Gemini caveat (credential path proven; model selection was the blocker).**
The credential **delivery is fully validated**: the LookupSecret resolves, the
ADC blob materialises to disk, and gemini-cli authenticates via `vertex-ai`.
With a **fresh** host ADC (`gcloud auth application-default login`) the earlier
`invalid_rapt` is gone and the turn reaches real Vertex inference. That run then
failed because it requested `acp_model=gemini-2.5-flash` and gemini-cli 0.45.x
**re-resolves any `*-flash` id at generation time to its current default flash**
(`gemini-3-flash`, not served by the test project —
software-agent-sdk#3532). Only a non-flash id sticks, so the e2e (and Canvas's
preselected default) now uses **`gemini-2.5-pro`**. Run with
`ACP_E2E_GEMINI_SESSION_MODE=default` to also clear the separate gemini-cli
≥0.43 `set_session_mode("yolo")` headless-init blocker.

## Knobs

- `ACP_E2E_BASE_URL` (default `http://localhost:8010`)
- `ACP_E2E_CODEX_MODEL` / `ACP_E2E_CLAUDE_MODEL` / `ACP_E2E_GEMINI_MODEL`
- `ACP_E2E_GEMINI_SESSION_MODE` (set `default` to bypass the SDK `yolo` blocker)
- `GOOGLE_CLOUD_PROJECT` / `GOOGLE_CLOUD_LOCATION` (else read from gcloud / `us-central1`)
