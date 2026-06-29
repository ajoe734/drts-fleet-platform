import { defineConfig, type PlaywrightTestConfig } from "@playwright/test";

const devApiBaseURL =
  process.env.DRTS_DEV_API_BASE_URL ??
  "https://drts-dev-api-waji3fer3a-uc.a.run.app";

const rocBaseURL =
  process.env.DRTS_V9_VERIFY_ROC_BASE_URL ?? "http://127.0.0.1:3010";
const platformAdminBaseURL =
  process.env.DRTS_V9_VERIFY_PLATFORM_ADMIN_BASE_URL ??
  process.env.DRTS_DEV_PLATFORM_ADMIN_BASE_URL ??
  "http://127.0.0.1:3002";
const opsBaseURL =
  process.env.DRTS_V9_VERIFY_OPS_BASE_URL ??
  process.env.DRTS_DEV_OPS_CONSOLE_BASE_URL ??
  "http://127.0.0.1:3003";
const tenantBaseURL =
  process.env.DRTS_V9_VERIFY_TENANT_BASE_URL ??
  process.env.DRTS_DEV_TENANT_CONSOLE_BASE_URL ??
  "http://127.0.0.1:3004";
const referralBaseURL =
  process.env.DRTS_V9_VERIFY_REFERRAL_BASE_URL ??
  process.env.DRTS_DEV_REFERRAL_EMBED_BASE_URL ??
  "http://127.0.0.1:3014";

function isLocalUrl(url: string, port: number) {
  return (
    url === `http://127.0.0.1:${port}` || url === `http://localhost:${port}`
  );
}

const webServers: NonNullable<PlaywrightTestConfig["webServer"]> = [];

if (isLocalUrl(rocBaseURL, 3010)) {
  webServers.push({
    command:
      `pnpm --filter @drts/control-plane-auth build && ` +
      `pnpm --filter @drts/contracts build && ` +
      `pnpm --filter @drts/ui-tokens build && ` +
      `cd apps/roc-console-web && ` +
      `DRTS_API_URL=${devApiBaseURL} ` +
      `pnpm exec next dev --hostname 127.0.0.1 --port 3010`,
    url: "http://127.0.0.1:3010",
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  });
}

if (isLocalUrl(platformAdminBaseURL, 3002)) {
  webServers.push({
    command:
      `pnpm --filter @drts/contracts build && ` +
      `pnpm --filter @drts/ui-tokens build && ` +
      `cd apps/platform-admin-web && ` +
      `DRTS_API_URL=${devApiBaseURL} ` +
      `pnpm exec next dev --hostname 127.0.0.1 --port 3002`,
    url: "http://127.0.0.1:3002",
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  });
}

if (isLocalUrl(opsBaseURL, 3003)) {
  webServers.push({
    command:
      `pnpm --filter @drts/control-plane-auth build && ` +
      `pnpm --filter @drts/contracts build && ` +
      `pnpm --filter @drts/ui-tokens build && ` +
      `cd apps/ops-console-web && ` +
      `DRTS_API_URL=${devApiBaseURL} ` +
      `pnpm exec next dev --hostname 127.0.0.1 --port 3003`,
    url: "http://127.0.0.1:3003",
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  });
}

if (isLocalUrl(tenantBaseURL, 3004)) {
  webServers.push({
    command:
      `pnpm --filter @drts/contracts build && ` +
      `pnpm --filter @drts/ui-tokens build && ` +
      `cd apps/tenant-console-web && ` +
      `DRTS_API_URL=${devApiBaseURL} ` +
      `pnpm exec next dev --hostname 127.0.0.1 --port 3004`,
    url: "http://127.0.0.1:3004",
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  });
}

if (isLocalUrl(referralBaseURL, 3014)) {
  webServers.push({
    command:
      `cd apps/referral-embed-web && ` +
      `DRTS_API_URL=${devApiBaseURL} ` +
      `REFERRAL_EMBED_ALLOWED_HOSTS=community-app.example.test,localhost:3014,127.0.0.1:3014 ` +
      `pnpm exec next dev --hostname 127.0.0.1 --port 3014`,
    url: "http://127.0.0.1:3014",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  });
}

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /v9-ui-verify\.spec\.ts/,
  fullyParallel: false,
  retries: 0,
  workers: 1,
  timeout: 60_000,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    trace: "retain-on-failure",
    viewport: {
      width: 1600,
      height: 1100,
    },
  },
  ...(webServers.length > 0 ? { webServer: webServers } : {}),
});
