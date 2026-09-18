import { defineConfig } from "@playwright/test";

const testPort = process.env.TEST_PORT ?? "3098";
const localBankConsoleBaseURL = `http://127.0.0.1:${testPort}`;
const bankConsoleBaseURL =
  process.env.DRTS_DEV_BANK_CONSOLE_BASE_URL ??
  process.env.BANK_CONSOLE_BASE_URL ??
  localBankConsoleBaseURL;
const shouldStartLocalBankConsole =
  bankConsoleBaseURL === localBankConsoleBaseURL ||
  bankConsoleBaseURL === `http://localhost:${testPort}`;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /bank-console-auth-boundary\.spec\.ts/,
  fullyParallel: false,
  retries: 0,
  timeout: 60_000,
  use: {
    baseURL: bankConsoleBaseURL,
    viewport: {
      width: 1440,
      height: 960,
    },
    trace: "retain-on-failure",
  },
  ...(shouldStartLocalBankConsole
    ? {
        webServer: {
          command:
            `cd apps/bank-console-web && pnpm exec next dev --webpack --hostname 127.0.0.1 --port ${testPort}`,
          url: `${localBankConsoleBaseURL}/login`,
          reuseExistingServer: !process.env.CI,
          timeout: 300_000,
        },
      }
    : {}),
});
