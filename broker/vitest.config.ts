import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { defineConfig } from "vitest/config";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Dedicated Vitest config for the broker. Runs in a Node environment (the
 * broker is a plain Node service, not a browser bundle) and only collects the
 * broker's own test files. The broker is deliberately isolated from the
 * frontend's jsdom/React test setup. Run from the repo root with:
 *
 *   npx vitest run --config broker/vitest.config.ts
 *
 * The project root stays at the repo root so `vitest` and
 * `@kubernetes/client-node` resolve from the repo's node_modules; only the test
 * file glob is scoped to the broker.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: [join(here, "src/**/*.test.ts")],
  },
});
