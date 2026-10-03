import { defineConfig } from "@playwright/test";

// Hosted API/IMAP checks only. No webServer, browser fixture or product hosting.
export default defineConfig({
  testDir: ".",
  testMatch: "live-mail.spec.ts",
  workers: 1,
  retries: 0,
  timeout: 900_000,
  reporter: "line",
  outputDir: "../../../../.artifacts/live-mail-acceptance/playwright",
});
