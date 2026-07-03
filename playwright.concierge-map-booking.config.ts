import { defineConfig } from "@playwright/test";

/**
 * MAP-FE-CON-001 concierge assisted-entry booking map alignment e2e.
 *
 * Boots the concierge portal dev server and runs
 * `concierge-map-booking-ui.spec.ts`, which seeds a repo-local desk session and
 * stubs the `/api/geo/*` provider proxy plus `/api/service-area/evaluate` so the
 * shared picker flow is deterministic without a live geo backend.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /concierge-map-booking-ui\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    viewport: { width: 1440, height: 960 },
    baseURL: "http://127.0.0.1:3006",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command:
        "pnpm --filter @drts/contracts build && pnpm --filter @drts/ui-tokens build && cd apps/concierge-portal-web && pnpm exec next dev --webpack --hostname 127.0.0.1 --port 3006",
      url: "http://127.0.0.1:3006",
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
    },
  ],
});
