import { defineConfig, devices } from "@playwright/test";

/**
 * PAX-PSP-SANDBOX-EVIDENCE-20261101: real ECPay Stage bind/charge evidence.
 *
 * Executed only by .github/workflows/psp-sandbox-acceptance.yml on a
 * GitHub-hosted runner. No webServer: the spec starts its own minimal
 * 127.0.0.1 harness page inside the runner and calls the merged adapter
 * in-process. Trace, video and automatic screenshots are disabled because
 * they would capture keystrokes typed into the ECPay card iframe; the spec
 * takes its own masked screenshots instead. No retries: a retry would bind
 * another Stage card for the same run.
 */
export default defineConfig({
  testDir: "./tests/e2e/pax-psp-sandbox",
  testMatch: /ecpay-stage-sandbox\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 10 * 60_000,
  expect: { timeout: 30_000 },
  // Not uploaded: Playwright failure context may contain page snapshots.
  outputDir: ".artifacts/pax-psp-sandbox-playwright-output",
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    headless: true,
    locale: "zh-TW",
    timezoneId: "Asia/Taipei",
    trace: "off",
    video: "off",
    screenshot: "off",
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
  },
});
