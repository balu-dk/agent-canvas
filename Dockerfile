# All-in-one Agent Canvas Docker image
#
# Packages the Agent Canvas frontend, OpenHands Agent Server, and Automation
# Server into a single container. Run with:
#
#   docker run -p 8000:8000 ghcr.io/openhands/agent-canvas
#
# Then open http://localhost:8000 in your browser.
#
# LLM settings and workspace folders are configured through the web UI —
# no environment variables are required to get started.
#
# Optional environment variables:
#   OH_SECRET_KEY          - Secret key for encrypting persisted settings
#   PORT                   - Port to listen on (default: 8000)

# ── Stage 1: Build the frontend ──────────────────────────────────────────

FROM node:22-bookworm-slim AS frontend-build

WORKDIR /app

# Install dependencies first (layer caching)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# ── Stage 2: Runtime ─────────────────────────────────────────────────────

FROM python:3.12-slim-bookworm AS runtime

# Install Node.js 22 (needed for the static server and ingress scripts)
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl \
        git \
        ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Install uv
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:${PATH}"

# Pre-install Python packages (agent-server + automation) so startup is fast
ARG AGENT_SERVER_VERSION=1.22.1
ARG AUTOMATION_VERSION=1.0.0a3
RUN uvx --from "openhands-agent-server==${AGENT_SERVER_VERSION}" \
        --with "openhands-tools==${AGENT_SERVER_VERSION}" \
        --with "openhands-workspace==${AGENT_SERVER_VERSION}" \
        agent-server --help > /dev/null 2>&1 || true
RUN uvx --from "openhands-automation==${AUTOMATION_VERSION}" \
        automation-server --help > /dev/null 2>&1 || true

WORKDIR /app

# Copy the built frontend and required runtime files
COPY --from=frontend-build /app/build ./build
COPY --from=frontend-build /app/scripts ./scripts
COPY --from=frontend-build /app/bin ./bin
COPY --from=frontend-build /app/package.json ./package.json
COPY --from=frontend-build /app/tools ./tools

# Install only production Node.js dependencies needed by the scripts
RUN npm install --omit=dev --ignore-scripts 2>/dev/null || true

# Default port
ENV PORT=8000

EXPOSE 8000

# The entrypoint script starts agent-server, automation backend, and static
# frontend, then runs an ingress proxy on $PORT.
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENTRYPOINT ["/docker-entrypoint.sh"]
