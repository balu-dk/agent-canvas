#!/bin/bash
# Docker entrypoint for the all-in-one Agent Canvas image.
#
# Starts:
#   1. Agent Server (via uvx) on an internal port
#   2. Automation Backend (via uvx) on an internal port
#   3. Static frontend + ingress proxy on $PORT (default 8000)
#
# All services are managed as background processes; the script waits for
# any to exit and shuts down the others.

set -u

PORT="${PORT:-8000}"
AGENT_SERVER_PORT=18000
AUTOMATION_PORT=18001
FRONTEND_PORT=3001

# Secret key for settings encryption
export OH_SECRET_KEY="${OH_SECRET_KEY:-openhands-dev-secret-key-change-in-prod}"

# Generate a random session API key if not provided
if [ -z "${SESSION_API_KEY:-}" ] && [ -z "${OH_SESSION_API_KEYS_0:-}" ]; then
  SESSION_API_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))")
fi
export SESSION_API_KEY="${SESSION_API_KEY:-}"
export OH_SESSION_API_KEYS_0="${OH_SESSION_API_KEYS_0:-$SESSION_API_KEY}"

# State directory for conversations, workspaces, etc.
STATE_DIR="${HOME}/.openhands/agent-canvas"
mkdir -p "$STATE_DIR/conversations" "$STATE_DIR/workspaces" "$STATE_DIR/bash_events" "$STATE_DIR/storage"

echo "Starting Agent Canvas..."
echo "  Port: $PORT"
echo "  State: $STATE_DIR"
echo ""

# ── 1. Agent Server ──────────────────────────────────────────────────────

AGENT_SERVER_VERSION="${AGENT_SERVER_VERSION:-1.22.1}"

OH_PERSISTENCE_DIR="$STATE_DIR" \
OH_CONVERSATIONS_DIR="$STATE_DIR/conversations" \
OH_WORKSPACE_BASE="$STATE_DIR/workspaces" \
OH_BASH_EVENTS_DIR="$STATE_DIR/bash_events" \
OH_SECRET_KEY="$OH_SECRET_KEY" \
OH_SESSION_API_KEYS_0="$OH_SESSION_API_KEYS_0" \
OPENHANDS_SUPPRESS_BANNER=1 \
uvx --from "openhands-agent-server==${AGENT_SERVER_VERSION}" \
    --with "openhands-tools==${AGENT_SERVER_VERSION}" \
    --with "openhands-workspace==${AGENT_SERVER_VERSION}" \
    agent-server --host 0.0.0.0 --port "$AGENT_SERVER_PORT" &
AGENT_PID=$!

# Wait for agent-server to be ready
echo "Waiting for agent-server..."
for i in $(seq 1 60); do
  if curl -sf "http://localhost:$AGENT_SERVER_PORT/server_info" > /dev/null 2>&1; then
    echo "Agent server ready."
    break
  fi
  sleep 1
done

# ── 2. Automation Backend ────────────────────────────────────────────────

AUTOMATION_VERSION="${AUTOMATION_VERSION:-1.0.0a3}"
AUTOMATION_API_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))")

AUTOMATION_AGENT_SERVER_URL="http://localhost:$AGENT_SERVER_PORT" \
AUTOMATION_AGENT_SERVER_API_KEY="$OH_SESSION_API_KEYS_0" \
AUTOMATION_DB_URL="sqlite+aiosqlite:///${STATE_DIR}/automations.db" \
AUTOMATION_BASE_URL="http://localhost:$PORT" \
AUTOMATION_WORKSPACE_BASE="$STATE_DIR/workspaces" \
AUTOMATION_LOCAL_API_KEY="$AUTOMATION_API_KEY" \
AUTOMATION_CORS_ORIGINS="http://localhost:$PORT,http://127.0.0.1:$PORT" \
FILE_STORE=local \
LOCAL_STORAGE_PATH="$STATE_DIR/storage" \
OPENHANDS_SUPPRESS_BANNER=1 \
uvx --from "openhands-automation==${AUTOMATION_VERSION}" \
    automation-server --host 0.0.0.0 --port "$AUTOMATION_PORT" &
AUTOMATION_PID=$!

# ── 3. Static Frontend ──────────────────────────────────────────────────

node /app/scripts/static-server.mjs \
  --dir /app/build \
  --host 0.0.0.0 \
  --port "$FRONTEND_PORT" \
  --route "/api/automation=http://localhost:$AUTOMATION_PORT" \
  --route "/api=http://localhost:$AGENT_SERVER_PORT" \
  --route "/sockets=http://localhost:$AGENT_SERVER_PORT" \
  --route "/server_info=http://localhost:$AGENT_SERVER_PORT" \
  --route "/health=http://localhost:$AGENT_SERVER_PORT" \
  --route "/ready=http://localhost:$AGENT_SERVER_PORT" \
  --route "/alive=http://localhost:$AGENT_SERVER_PORT" \
  --route "/docs=http://localhost:$AGENT_SERVER_PORT" \
  --route "/redoc=http://localhost:$AGENT_SERVER_PORT" \
  --route "/openapi.json=http://localhost:$AGENT_SERVER_PORT" &
FRONTEND_PID=$!

# ── 4. Ingress Proxy ────────────────────────────────────────────────────

sleep 2

node /app/scripts/ingress.mjs \
  --port "$PORT" \
  --route "/api/automation=http://localhost:$AUTOMATION_PORT" \
  --route "/api=http://localhost:$AGENT_SERVER_PORT" \
  --route "/sockets=http://localhost:$AGENT_SERVER_PORT" \
  --route "/server_info=http://localhost:$AGENT_SERVER_PORT" \
  --route "/health=http://localhost:$AGENT_SERVER_PORT" \
  --route "/ready=http://localhost:$AGENT_SERVER_PORT" \
  --route "/alive=http://localhost:$AGENT_SERVER_PORT" \
  --route "/docs=http://localhost:$AGENT_SERVER_PORT" \
  --route "/redoc=http://localhost:$AGENT_SERVER_PORT" \
  --route "/openapi.json=http://localhost:$AGENT_SERVER_PORT" \
  --default "http://localhost:$FRONTEND_PORT" &
INGRESS_PID=$!

sleep 1

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Agent Canvas                                               ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║                                                              ║"
echo "║  Open http://localhost:$PORT/ in your browser                  ║"
echo "║                                                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# ── Shutdown handler ─────────────────────────────────────────────────────

cleanup() {
  echo "Shutting down..."
  kill "$INGRESS_PID" "$FRONTEND_PID" "$AUTOMATION_PID" "$AGENT_PID" 2>/dev/null
  wait
  exit 0
}

trap cleanup SIGINT SIGTERM

# Wait for any child to exit
wait -n
cleanup
