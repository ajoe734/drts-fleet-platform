import { defineConfig } from "@playwright/test";

const localOpsAssistantBaseURL = "http://127.0.0.1:3202";
const opsAssistantBaseURL =
  process.env.DRTS_DEV_OPS_CONSOLE_BASE_URL ??
  process.env.OPS_CONSOLE_BASE_URL ??
  localOpsAssistantBaseURL;
const shouldStartLocalOpsAssistant =
  opsAssistantBaseURL === localOpsAssistantBaseURL ||
  opsAssistantBaseURL === "http://localhost:3202";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /ops-assistant\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  projects: [
    {
      name: "ops-assistant-on",
      use: {
        baseURL: opsAssistantBaseURL,
      },
    },
    {
      name: "ops-assistant-off",
      use: {
        baseURL: opsAssistantBaseURL,
      },
    },
  ],
  use: {
    viewport: {
      width: 1440,
      height: 960,
    },
    trace: "retain-on-failure",
  },
  ...(shouldStartLocalOpsAssistant
    ? {
        webServer: {
          command:
            "pnpm --filter @drts/contracts build && pnpm --filter @drts/ui-tokens build && cd apps/ops-console-web && NEXT_PUBLIC_OPS_ASSISTANT_ENABLED=true pnpm exec next dev --hostname 127.0.0.1 --port 3202",
          url: localOpsAssistantBaseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 300_000,
        },
      }
    : {}),
  timeout: 180_000,
});
