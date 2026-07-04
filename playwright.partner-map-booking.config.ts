import { defineConfig } from "@playwright/test";

/**
 * MAP-FE-CON-001 partner assisted-entry booking map alignment e2e.
 *
 * Boots the partner booking dev server (local shell fallback, no live authority
 * backend) and runs `partner-map-booking-ui.spec.ts`. The partner funnel uses
 * the deterministic network-free mock geo provider, so no route stubs are
 * needed.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /partner-map-booking-ui\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    viewport: { width: 1440, height: 960 },
    baseURL: "http://127.0.0.1:3007",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command:
        // Use webpack here: in isolated git worktrees the default Turbopack
        // dev server rejects the app's node_modules symlink as outside the
        // filesystem root, which makes this review-time acceptance check fail
        // before the partner map-booking specs can even start. Force the
        // authority URL to a closed local port so this dedicated lane always
        // exercises the intended local reference fallback instead of depending
        // on any ambient API process already running on localhost:3001.
        "pnpm --filter @drts/contracts build && pnpm --filter @drts/ui-tokens build && cd apps/partner-booking-web && DRTS_API_URL=http://127.0.0.1:9 pnpm exec next dev --webpack --hostname 127.0.0.1 --port 3007",
      url: "http://127.0.0.1:3007",
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
    },
  ],
});
