import { defineConfig } from "@playwright/test";

const localBankConsoleBaseURL = "http://127.0.0.1:3008";
const bankConsoleBaseURL =
  process.env.DRTS_DEV_BANK_CONSOLE_BASE_URL ??
  process.env.BANK_CONSOLE_BASE_URL ??
  localBankConsoleBaseURL;
const shouldStartLocalBankConsole =
  bankConsoleBaseURL === localBankConsoleBaseURL ||
  bankConsoleBaseURL === "http://localhost:3008";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /bank-console-depth\.spec\.ts/,
  timeout: 90_000,
  use: {
    baseURL: bankConsoleBaseURL,
    trace: "retain-on-failure",
  },
  ...(shouldStartLocalBankConsole
    ? {
        webServer: {
          command:
            "pnpm --filter @drts/contracts build && pnpm --filter @drts/ui-tokens build && cd apps/bank-console-web && pnpm exec next dev --webpack --hostname 127.0.0.1 --port 3008",
          url: `${localBankConsoleBaseURL}/login`,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }
    : {}),
});
