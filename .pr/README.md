PR-specific QA artifacts for pull request #951.

These screenshots were captured locally after deleting
`~/.openhands/agent-canvas` and starting from a clean agent-canvas state.

## Screenshots

- `qa/01-npm-run-dev-clean-start-onboarding.png` - `npm run dev` clean first load.
- `qa/02-npm-run-dev-onboarding-backend-connected.png` - full-stack default backend connected during onboarding.
- `qa/03-npm-run-dev-home-connected.png` - full-stack home screen after dismissing onboarding.
- `qa/04-npm-run-dev-backend-selector.png` - full-stack backend selector showing the same-origin Local backend.
- `qa/05-npm-run-dev-frontend-no-backend-dialog.png` - `npm run dev:frontend` with no launcher defaults, showing the add-backend dialog.
- `qa/06-npm-run-dev-frontend-add-remote-backend.png` - adding a separately running agent-server as a remote backend.
- `qa/07-npm-run-dev-frontend-home-remote-connected.png` - frontend-only home screen after remote backend connection.
- `qa/08-npm-run-dev-frontend-backend-selector.png` - frontend-only backend selector showing the remote backend.
