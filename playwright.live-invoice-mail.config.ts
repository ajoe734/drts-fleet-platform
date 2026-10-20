import { defineConfig } from "@playwright/test";

// Hosted API/IMAP checks only. No webServer, browser fixture or product hosting.
export default defineConfig({
  testDir: "tests/e2e/system-remediation/sr-live-invoice-mail-20261007",
  testMatch: "live-invoice-mail.spec.ts",
  workers: 1,
  retries: 0,
  timeout: 900_000,
  reporter: "line",
  outputDir: "../../../../.artifacts/live-invoice-mail-acceptance/playwright",
});
