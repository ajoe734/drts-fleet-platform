import { defineConfig } from "@playwright/test";

// S3-VERIFY-001 — S-3 Ops screen evidence capture.
//
// RUNTIME SOURCE (this is the whole point of the acceptance item):
//   * ops-console-web built from the current-head worktree, `next dev`
//   * talking to a REAL current-head @drts/api process on DRTS_API_URL
//   * backed by a REAL Postgres database migrated from infra/migrations
//   * whose SOS rows were written by this task's own runtime verification run
//
// No page.route() interception and no fixture injection are used, so the
// screenshots show what the landed code renders from real persisted rows.
// This is local hermetic evidence, NOT production evidence.

const baseURL = "http://127.0.0.1:3413";
const apiUrl = process.env.DRTS_API_URL ?? "http://localhost:3972";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /s3-verify-ops-evidence\.spec\.ts/,
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL,
    locale: "zh-TW",
    timezoneId: "Asia/Taipei",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: [
      "pnpm --filter @drts/contracts build",
      "pnpm --filter @drts/ui-tokens build",
      "pnpm --filter @drts/ui-web build",
      "pnpm --filter @drts/ops-console-web exec next dev --webpack --hostname 127.0.0.1 --port 3413",
    ].join(" && "),
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: {
      DRTS_API_URL: apiUrl,
      JWT_SECRET: process.env.JWT_SECRET ?? "ci-e2e-secret",
      JWT_ISSUER: process.env.JWT_ISSUER ?? "drts-local",
      JWT_AUDIENCE: process.env.JWT_AUDIENCE ?? "drts-api",
    },
  },
  timeout: 120_000,
});
