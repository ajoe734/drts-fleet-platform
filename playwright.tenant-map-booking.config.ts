import { defineConfig } from "@playwright/test";

/**
 * MAP-FE-TEN-001 tenant console booking map alignment e2e.
 *
 * Boots the tenant console dev server (against the configured backend for the
 * page shell) and runs `tenant-map-booking-ui.spec.ts`, which stubs the
 * `/api/geo/*` provider proxy so the shared picker flow is deterministic.
 * Override `DRTS_API_URL` to point at a reachable backend when running.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /tenant-map-booking-ui\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    viewport: { width: 1440, height: 960 },
    baseURL: "http://127.0.0.1:3304",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command:
        "MAP_BOOKING_AUTHORITY_PORT=3305 node tests/e2e/mock-map-booking-authority-server.mjs",
      url: "http://127.0.0.1:3305/api/auth/session",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command:
        "pnpm --filter @drts/contracts build && pnpm --filter @drts/ui-tokens build && cd apps/tenant-console-web && AUTH_MODE=test DRTS_API_URL=http://127.0.0.1:3305 NEXT_PUBLIC_API_URL=/control-plane-proxy pnpm exec next dev --webpack --hostname 127.0.0.1 --port 3304",
      url: "http://127.0.0.1:3304",
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
    },
  ],
});
