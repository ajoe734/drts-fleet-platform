import { defineConfig } from "@playwright/test";

function readPositiveIntEnv(
  value: string | undefined,
  fallback: number,
): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const defaultWorkers = process.env.CI ? 2 : 4;

export default defineConfig({
  testDir: "./tests/e2e/system-remediation",
  testMatch: /.*\.spec\.ts/,
  fullyParallel: true,
  retries: 0,
  workers: readPositiveIntEnv(
    process.env.DRTS_UAT_WORKERS,
    defaultWorkers,
  ),
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/system-remediation-report.json" }],
  ],
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  timeout: 30_000,
});
