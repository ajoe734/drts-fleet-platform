import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/tenant-localization",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    viewport: {
      width: 1440,
      height: 960,
    },
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "tenant-console-localization",
      use: {
        baseURL: "http://127.0.0.1:3304",
      },
    },
    {
      name: "partner-booking-localization",
      use: {
        baseURL: "http://127.0.0.1:3307",
      },
    },
    {
      name: "enterprise-dispatch-localization",
      use: {
        baseURL: "http://127.0.0.1:3310",
      },
    },
  ],
  webServer: [
    {
      command:
        "pnpm --filter @drts/contracts build && pnpm --filter @drts/ui-tokens build && cd apps/tenant-console-web && DRTS_API_URL=https://drts-dev-api-waji3fer3a-uc.a.run.app NEXT_PUBLIC_API_URL=/control-plane-proxy pnpm exec next dev --webpack --hostname 127.0.0.1 --port 3304",
      url: "http://127.0.0.1:3304",
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
    },
    {
      command:
        "pnpm --filter @drts/contracts build && pnpm --filter @drts/ui-tokens build && cd apps/partner-booking-web && DRTS_API_URL=https://drts-dev-api-waji3fer3a-uc.a.run.app NEXT_PUBLIC_API_URL=/control-plane-proxy pnpm exec next dev --hostname 127.0.0.1 --port 3307",
      url: "http://127.0.0.1:3307",
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
    },
    {
      command:
        "pnpm --filter @drts/ui-tokens build && cd apps/enterprise-dispatch-web && DRTS_API_URL=https://drts-dev-api-waji3fer3a-uc.a.run.app NEXT_PUBLIC_API_URL=/control-plane-proxy pnpm exec next dev --webpack --hostname 127.0.0.1 --port 3310",
      url: "http://127.0.0.1:3310",
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
    },
  ],
});
