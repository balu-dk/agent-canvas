# Self-hosted deploy + safe upstream sync (OpenClaw)

Keeps this fork's build deployed on the OpenClaw server and pulls upstream
OpenHands updates **only when you approve them** — never risking the running
server. Lives in `deploy/` so upstream merges never conflict with it.

## What runs where

The server runs the all-in-one `agent-canvas` image (canvas frontend + SDK
`openhands-agent-server` + automation) via `docker compose` at
`/opt/openhands/docker-compose.yml`. State volumes and `.env` are reused across
deploys, so conversations, secrets and projects survive every rebuild.

`oh-deploy.sh` is the deterministic engine; OpenClaw provides the judgment
(deciding what to notify about, and whether to proceed on a merge conflict).

## The two loops

### 1. Watcher (scheduled — the "let me know" loop)

Run `check`. It compares upstream against the **last deployed** upstream SHA and
prints a summary of the new commits plus the pinned `agent-server` / automation /
`typescript-client` versions on upstream. If there's something new that you
haven't already been told about, OpenClaw messages you and asks.

**OpenClaw prompt (schedule daily, or run on demand):**

> Run `/opt/agent-canvas-src/deploy/oh-deploy.sh check` (clone the repo to that
> path first if missing). If it reports `status=up-to-date`, do nothing. If it
> reports `status=update-available`, compare the printed `upstream_sha` to the
> value from `oh-deploy.sh status` field `last_notified_sha`: if they're the
> same, stay quiet (you already told me). Otherwise, message me with a short
> plain-language summary of the new commits and any version bumps (especially
> `typescript-client` and `agent-server`, since those change available models),
> then ask: **"Build and deploy this update, or wait?"** After messaging me, run
> `oh-deploy.sh mark-notified <upstream_sha>` so you don't repeat yourself.
> Do NOT build or deploy anything in this loop.

### 2. Build + deploy (on your approval — the "do it" loop)

**OpenClaw prompt (run when you say yes):**

> Run `/opt/agent-canvas-src/deploy/oh-deploy.sh build`.
> - If it exits with a **merge conflict** (exit 20), do NOT force anything.
>   Show me the conflicted files it listed and summarise what upstream changed
>   in them vs our fork, and wait for my guidance. Production is untouched.
> - If it exits on a **failed check or unhealthy candidate** (exit 30/other),
>   show me the tail of the error and stop. Production is untouched.
> - If it prints **"BUILD OK"**, tell me the candidate is built and healthy and
>   ask for final go-ahead to promote it.
>
> On my go-ahead, run `oh-deploy.sh deploy`. Report the final `DEPLOY OK` line
> and the running image, or — if it auto-rolled-back (exit 40) — tell me it
> rolled back and the server is on the previous image. If I ever ask, run
> `oh-deploy.sh rollback`.

## Safety model (one sentence)

Production changes **only** in `deploy`, and only after a clean merge, passing
`typecheck`/`lint`(/tests), and a healthy throwaway candidate container — any
failure stops with the server untouched, and a post-deploy health failure
auto-rolls-back to the previous image digest.

## One-time setup on the server

1. `git clone https://github.com/balu-dk/agent-canvas.git /opt/agent-canvas-src`
   (the script also does this on first run).
2. Ensure `docker`, `python3`, `node`+`npm`, `curl`, `git` are available to the
   user OpenClaw runs as, and that user can `docker` + write `/opt/openhands`.
3. First `build` + `deploy` should be **supervised** (watch the candidate
   health check pass before promoting).

Config is env-overridable at the top of `oh-deploy.sh` (compose path, service
name, image tags, `UPSTREAM_REF`, `HEALTH_*`, `RUN_TESTS`). Defaults match the
current server. Set `UPSTREAM_REF` to a release tag instead of `main` for a
lower-noise signal.

## Persisting the merge back to the fork (optional)

`build` merges upstream into a local `sync/<timestamp>` branch **on the server
only** — it does not push. To keep `balu-dk/agent-canvas` `main` in step with
what's deployed, push that branch from a machine with fork write access and open
a PR, or give the server a fork-scoped token and push from there. The deployed
image records its source SHA via the `AGENT_CANVAS_VERSION=balu-<sha>` build
arg regardless.

## Commands quick-reference

```
oh-deploy.sh check     # update available? (exit 0 yes / 10 no) + summary
oh-deploy.sh build     # merge + verify + candidate image + smoke test (safe)
oh-deploy.sh deploy    # promote candidate (auto-rollback on failure)
oh-deploy.sh rollback  # restore last compose backup
oh-deploy.sh status    # current vs upstream state
oh-deploy.sh mark-notified <sha>
```
