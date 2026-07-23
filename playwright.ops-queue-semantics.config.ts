import { defineConfig } from "@playwright/test";

const localOpsConsoleBaseURL = "http://127.0.0.1:3003";
const opsConsoleBaseURL =
  process.env.DRTS_DEV_OPS_CONSOLE_BASE_URL ??
  process.env.OPS_CONSOLE_BASE_URL ??
  localOpsConsoleBaseURL;
const shouldStartLocalOpsConsole =
  opsConsoleBaseURL === localOpsConsoleBaseURL ||
  opsConsoleBaseURL === "http://localhost:3003";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /ops-queue-semantics\.spec\.ts/,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: opsConsoleBaseURL,
    trace: "retain-on-failure",
  },
  ...(shouldStartLocalOpsConsole
    ? {
        webServer: {
          command:
            "cd apps/ops-console-web && NEXT_PUBLIC_OPS_ASSISTANT_ENABLED=true pnpm exec next dev --webpack --hostname 127.0.0.1 --port 3003",
          url: localOpsConsoleBaseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }
    : {}),
  timeout: 180_000,
});
