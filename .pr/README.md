PR-specific QA artifacts for pull request #951.

These screenshots were captured locally from clean browser profiles and
isolated temporary agent-canvas state directories.

## Launcher Paths

- `qa/launch-npm-run-dev.png` - `npm run dev`; Vite-served frontend with launcher-injected same-origin backend.
- `qa/launch-npm-run-dev-frontend.png` - `npm run dev:frontend`; Vite-served frontend with no launcher backend.
- `qa/launch-static-same-origin.png` - `npm run dev:static -- --skip-build`; static frontend served locally with runtime-injected same-origin backend.
- `qa/launch-static-no-backend.png` - `node scripts/static-server.mjs --dir build`; static frontend served without launcher backend, matching dumb static hosting.
