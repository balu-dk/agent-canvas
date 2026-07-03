#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# oh-deploy.sh — safe upstream-sync + build + deploy for a self-hosted
# Agent Canvas fork, driven by OpenClaw.
#
# The daily server runs the all-in-one agent-canvas Docker image via
# docker compose. This script keeps a merged fork build deployed WITHOUT ever
# risking the running server:
#
#   check         Is there a new upstream commit we haven't deployed? (summary)
#   build         Merge upstream into the fork checkout, verify, build a
#                 CANDIDATE image, and smoke-test it in a throwaway container.
#                 Never touches production. Stops (non-zero) on merge conflict
#                 or any failed check.
#   deploy        Promote the already-built candidate: back up compose + record
#                 the current image digest, swap the image, `up -d`, health-check,
#                 and AUTO-ROLLBACK if the new container is unhealthy.
#   rollback      Restore the last compose backup and `up -d`.
#   status        Show current image, deployed vs upstream SHA, candidate state.
#   mark-notified <sha>   Record that the user was told about <sha> (watcher use).
#
# Production changes ONLY in `deploy`, and only after a clean merge, passing
# checks, and a healthy candidate. Everything is parameterised via the env
# block below (defaults match the current server inventory).
#
# FIRST RUN SHOULD BE SUPERVISED. See deploy/README.md for the OpenClaw prompts.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Config (override via environment) ────────────────────────────────────────
COMPOSE_FILE="${COMPOSE_FILE:-/opt/openhands/docker-compose.yml}"
COMPOSE_DIR="${COMPOSE_DIR:-$(dirname "$COMPOSE_FILE")}"
ENV_FILE="${ENV_FILE:-$COMPOSE_DIR/.env}"
SERVICE="${SERVICE:-agent-canvas}"
CONTAINER="${CONTAINER:-openhands-agent-canvas}"

SRC_DIR="${SRC_DIR:-/opt/agent-canvas-src}"
FORK_URL="${FORK_URL:-https://github.com/balu-dk/agent-canvas.git}"
FORK_BRANCH="${FORK_BRANCH:-main}"
UPSTREAM_URL="${UPSTREAM_URL:-https://github.com/OpenHands/agent-canvas.git}"
# Track upstream `main` by default; set to a release tag (e.g. v1.2.0) for a
# lower-noise signal.
UPSTREAM_REF="${UPSTREAM_REF:-main}"

IMAGE_TAG="${IMAGE_TAG:-agent-canvas:balu}"
CANDIDATE_TAG="${CANDIDATE_TAG:-agent-canvas:candidate}"

STATE_DIR="${STATE_DIR:-/var/lib/oh-deploy}"
HEALTH_PORT="${HEALTH_PORT:-18099}"          # temp host port for the candidate
HEALTH_PATH="${HEALTH_PATH:-/health}"
HEALTH_RETRIES="${HEALTH_RETRIES:-45}"       # ~90s at 2s intervals
RUN_TESTS="${RUN_TESTS:-0}"                   # 1 = run full vitest suite too

log()  { printf '\033[36m[oh-deploy]\033[0m %s\n' "$*"; }
warn() { printf '\033[33m[oh-deploy] WARN:\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[31m[oh-deploy] ERROR:\033[0m %s\n' "$*" >&2; exit 1; }

mkdir -p "$STATE_DIR"
DEPLOYED_SHA_FILE="$STATE_DIR/deployed-upstream.sha"
NOTIFIED_SHA_FILE="$STATE_DIR/notified-upstream.sha"

# ── Helpers ──────────────────────────────────────────────────────────────────

ensure_src() {
  # Idempotent working checkout of the fork with an `upstream` remote.
  if [[ ! -d "$SRC_DIR/.git" ]]; then
    log "Cloning fork into $SRC_DIR"
    git clone "$FORK_URL" "$SRC_DIR"
  fi
  cd "$SRC_DIR"
  git remote get-url upstream >/dev/null 2>&1 || git remote add upstream "$UPSTREAM_URL"
  git remote set-url origin "$FORK_URL"
  git remote set-url upstream "$UPSTREAM_URL"
  log "Fetching fork + upstream"
  git fetch --quiet origin
  git fetch --quiet upstream
}

upstream_sha() { git -C "$SRC_DIR" rev-parse "upstream/$UPSTREAM_REF"; }

read_agent_server_image() {
  # AGENT_SERVER_IMAGE = <images.agentServer>:<versions.agentServer>-python
  python3 - "$SRC_DIR/config/defaults.json" <<'PY'
import json, sys
c = json.load(open(sys.argv[1]))
print(f"{c['images']['agentServer']}:{c['versions']['agentServer']}-python")
PY
}
read_automation_version() {
  python3 - "$SRC_DIR/config/defaults.json" <<'PY'
import json, sys
c = json.load(open(sys.argv[1]))
print(c["versions"]["automation"])
PY
}

health_ok() {
  # $1 = base url (e.g. http://127.0.0.1:8000)
  local url="$1" i code
  for ((i=0; i<HEALTH_RETRIES; i++)); do
    code="$(curl -s -o /dev/null -w '%{http_code}' "$url$HEALTH_PATH" 2>/dev/null || true)"
    [[ "$code" == "200" ]] && return 0
    sleep 2
  done
  return 1
}

current_deployed_digest() {
  # RepoDigest of the image the running container was created from.
  docker inspect --format '{{index .RepoDigests 0}}' "$(docker inspect --format '{{.Image}}' "$CONTAINER" 2>/dev/null)" 2>/dev/null || true
}

compose() { docker compose -f "$COMPOSE_FILE" "$@"; }

set_compose_image() {
  # Rewrite the image: line under the target service. Python edit (not sed) so
  # we only touch the right service's image key.
  python3 - "$COMPOSE_FILE" "$SERVICE" "$1" <<'PY'
import re, sys
path, service, new_image = sys.argv[1], sys.argv[2], sys.argv[3]
lines = open(path).read().splitlines(keepends=True)
out, in_service, svc_indent = [], False, None
for line in lines:
    stripped = line.lstrip()
    indent = len(line) - len(stripped)
    if re.match(rf'^{re.escape(service)}:\s*$', stripped):
        in_service, svc_indent = True, indent
        out.append(line); continue
    if in_service and stripped and indent <= svc_indent and not line[:svc_indent+1].isspace():
        # dedented to a sibling/service boundary -> left the service block
        if indent <= svc_indent:
            in_service = False
    if in_service and re.match(r'^image:\s', stripped):
        out.append(' ' * indent + f'image: {new_image}\n'); continue
    out.append(line)
open(path, 'w').writelines(out)
print(f'set {service}.image = {new_image}')
PY
}

# ── Subcommands ──────────────────────────────────────────────────────────────

cmd_check() {
  ensure_src
  local up dep
  up="$(upstream_sha)"
  dep="$(cat "$DEPLOYED_SHA_FILE" 2>/dev/null || echo '')"
  echo "upstream_ref=$UPSTREAM_REF"
  echo "upstream_sha=$up"
  echo "deployed_upstream_sha=${dep:-<none>}"
  if [[ "$up" == "$dep" ]]; then
    echo "status=up-to-date"
    return 10
  fi
  echo "status=update-available"
  echo "--- new upstream commits (deployed..upstream) ---"
  if [[ -n "$dep" ]]; then
    git -C "$SRC_DIR" log --oneline --no-merges "$dep..upstream/$UPSTREAM_REF" | head -40 || true
  else
    git -C "$SRC_DIR" log --oneline --no-merges -20 "upstream/$UPSTREAM_REF" || true
  fi
  # Surface the two things most likely to matter to the user.
  echo "--- pinned versions on upstream/$UPSTREAM_REF ---"
  git -C "$SRC_DIR" show "upstream/$UPSTREAM_REF:config/defaults.json" 2>/dev/null \
    | python3 -c "import json,sys; d=json.load(sys.stdin); print('versions:', json.dumps(d.get('versions',{})))" 2>/dev/null || true
  git -C "$SRC_DIR" show "upstream/$UPSTREAM_REF:package.json" 2>/dev/null \
    | python3 -c "import json,sys; d=json.load(sys.stdin); print('typescript-client:', d.get('dependencies',{}).get('@openhands/typescript-client'))" 2>/dev/null || true
  return 0
}

# Shared: install deps, verify, build the candidate image, and smoke-test it
# in a throwaway container. Never touches production. Exits 30 on unhealthy.
verify_build_smoke() {
  log "Installing deps + verifying"
  npm ci
  npm run typecheck
  npm run lint
  if [[ "$RUN_TESTS" == "1" ]]; then npm test; fi

  log "Building candidate image $CANDIDATE_TAG"
  local asi av
  asi="$(read_agent_server_image)"
  av="$(read_automation_version)"
  log "  agent-server: $asi   automation: $av"
  docker build -f docker/Dockerfile \
    --build-arg "AGENT_SERVER_IMAGE=$asi" \
    --build-arg "AUTOMATION_VERSION=$av" \
    --build-arg "AGENT_CANVAS_VERSION=balu-$(git rev-parse --short HEAD)" \
    -t "$CANDIDATE_TAG" .

  log "Smoke-testing candidate on 127.0.0.1:$HEALTH_PORT (no volumes)"
  docker rm -f oh-candidate >/dev/null 2>&1 || true
  docker run -d --name oh-candidate \
    -p "127.0.0.1:$HEALTH_PORT:8000" \
    --env-file "$ENV_FILE" \
    "$CANDIDATE_TAG" >/dev/null
  if health_ok "http://127.0.0.1:$HEALTH_PORT"; then
    log "Candidate healthy ✓"
    docker rm -f oh-candidate >/dev/null 2>&1 || true
  else
    warn "Candidate did NOT become healthy — discarding. Production untouched."
    docker logs --tail 40 oh-candidate 2>&1 || true
    docker rm -f oh-candidate >/dev/null 2>&1 || true
    exit 30
  fi
}

cmd_build() {
  ensure_src
  cd "$SRC_DIR"
  local up branch
  up="$(upstream_sha)"
  branch="sync/$(date +%Y%m%d-%H%M%S)"

  log "Resetting working tree to fork/$FORK_BRANCH"
  git checkout -B "$branch" "origin/$FORK_BRANCH"
  git config user.email "deploy@balu.dk" >/dev/null 2>&1 || true
  git config user.name "oh-deploy" >/dev/null 2>&1 || true

  log "Merging upstream/$UPSTREAM_REF ($up) …"
  if ! git merge --no-edit "upstream/$UPSTREAM_REF"; then
    warn "Merge conflict — aborting, production untouched. Conflicted files:"
    git diff --name-only --diff-filter=U || true
    git merge --abort || true
    exit 20
  fi

  verify_build_smoke

  # Stash the upstream sha this candidate embeds, for `deploy` to record.
  echo "$up" > "$STATE_DIR/candidate-upstream.sha"
  log "BUILD OK. Candidate $CANDIDATE_TAG is ready to deploy."
}

# Build the fork's own main as-is, WITHOUT merging upstream. Use this to
# deploy your own merged changes (a PR you just merged) without pulling
# untested upstream work. Same safety as `build` (verify + smoke test).
cmd_rebuild() {
  ensure_src
  cd "$SRC_DIR"

  log "Checking out fork/$FORK_BRANCH (no upstream merge)"
  git checkout -B "deploy-$(date +%Y%m%d-%H%M%S)" "origin/$FORK_BRANCH"

  verify_build_smoke

  # A rebuild doesn't advance the deployed upstream marker — carry the
  # existing value forward so `deploy` leaves it unchanged.
  if [[ -f "$DEPLOYED_SHA_FILE" ]]; then
    cp "$DEPLOYED_SHA_FILE" "$STATE_DIR/candidate-upstream.sha"
  else
    rm -f "$STATE_DIR/candidate-upstream.sha"
  fi
  log "REBUILD OK. Candidate $CANDIDATE_TAG (fork main) is ready to deploy."
}

cmd_deploy() {
  [[ -n "$(docker images -q "$CANDIDATE_TAG" 2>/dev/null)" ]] \
    || die "No candidate image ($CANDIDATE_TAG). Run 'build' first."

  local ts backup digest
  ts="$(date +%Y%m%d-%H%M%S)"
  backup="$STATE_DIR/docker-compose.yml.bak-$ts"
  cp "$COMPOSE_FILE" "$backup"
  digest="$(current_deployed_digest)"
  [[ -n "$digest" ]] && echo "$digest" > "$STATE_DIR/last-good-digest"
  log "Backup: $backup   rollback digest: ${digest:-<unknown>}"

  log "Promoting candidate -> $IMAGE_TAG and updating compose"
  docker tag "$CANDIDATE_TAG" "$IMAGE_TAG"
  set_compose_image "$IMAGE_TAG"

  log "Recreating container"
  ( cd "$COMPOSE_DIR" && compose up -d )

  log "Post-deploy health check on 127.0.0.1:8000"
  if health_ok "http://127.0.0.1:8000"; then
    log "Deploy healthy ✓"
    [[ -f "$STATE_DIR/candidate-upstream.sha" ]] && \
      cp "$STATE_DIR/candidate-upstream.sha" "$DEPLOYED_SHA_FILE"
    log "DEPLOY OK. Running image: $IMAGE_TAG"
  else
    warn "New container unhealthy — ROLLING BACK to $backup"
    cp "$backup" "$COMPOSE_FILE"
    if [[ -n "$digest" ]]; then set_compose_image "$digest"; fi
    ( cd "$COMPOSE_DIR" && compose up -d )
    health_ok "http://127.0.0.1:8000" && log "Rollback healthy ✓" || warn "Rollback health check failed — inspect manually!"
    exit 40
  fi
}

cmd_rollback() {
  local backup
  backup="$(ls -1t "$STATE_DIR"/docker-compose.yml.bak-* 2>/dev/null | head -1 || true)"
  [[ -n "$backup" ]] || die "No compose backup found in $STATE_DIR."
  log "Restoring $backup"
  cp "$backup" "$COMPOSE_FILE"
  ( cd "$COMPOSE_DIR" && compose up -d )
  health_ok "http://127.0.0.1:8000" && log "Rollback healthy ✓" || warn "Rollback health check failed — inspect manually!"
}

cmd_status() {
  ensure_src
  echo "current_image=$(docker inspect --format '{{.Config.Image}}' "$CONTAINER" 2>/dev/null || echo '<not running>')"
  echo "deployed_upstream_sha=$(cat "$DEPLOYED_SHA_FILE" 2>/dev/null || echo '<none>')"
  echo "upstream_${UPSTREAM_REF}_sha=$(upstream_sha)"
  echo "candidate_present=$([[ -n "$(docker images -q "$CANDIDATE_TAG" 2>/dev/null)" ]] && echo yes || echo no)"
  echo "last_notified_sha=$(cat "$NOTIFIED_SHA_FILE" 2>/dev/null || echo '<none>')"
}

cmd_mark_notified() { echo "${1:?sha required}" > "$NOTIFIED_SHA_FILE"; log "Recorded notified sha ${1}"; }

# ── Dispatch ─────────────────────────────────────────────────────────────────
case "${1:-}" in
  check)         cmd_check ;;
  build)         cmd_build ;;
  rebuild)       cmd_rebuild ;;
  deploy)        cmd_deploy ;;
  rollback)      cmd_rollback ;;
  status)        cmd_status ;;
  mark-notified) shift; cmd_mark_notified "${1:-}" ;;
  *) cat >&2 <<EOF
usage: $0 <check|build|rebuild|deploy|rollback|status|mark-notified <sha>>
  check          exit 0 if an undeployed upstream update exists (prints summary),
                 exit 10 if already up to date.
  build          merge upstream + verify + build & smoke-test candidate (safe).
  rebuild        build the fork's own main as-is (no upstream merge) — deploy
                 your own merged changes; verify + smoke-test (safe).
  deploy         promote the candidate to production (auto-rollback on failure).
  rollback       restore the last compose backup.
  status         show current vs upstream state.
See deploy/README.md for the OpenClaw watcher/approval prompts.
EOF
     exit 2 ;;
esac
