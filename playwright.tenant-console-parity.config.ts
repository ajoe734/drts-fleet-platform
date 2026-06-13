import { defineConfig } from "@playwright/test";

const tenantConsoleBaseUrl =
  process.env.TENANT_CONSOLE_BASE_URL ??
  process.env.DRTS_DEV_TENANT_CONSOLE_BASE_URL ??
  "https://drts-dev-tenant-console-web-waji3fer3a-uc.a.run.app";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /tenant-console-parity\.spec\.ts/,
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  projects: [
    {
      name: "tenant-console",
      use: {
        baseURL: tenantConsoleBaseUrl,
        viewport: {
          width: 1440,
          height: 950,
        },
        trace: "retain-on-failure",
      },
    },
  ],
  timeout: 180_000,
});
