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
  testDir: "./tests/e2e",
  testMatch: /dev-runtime-matrix\.spec\.ts/,
  fullyParallel: true,
  retries: 0,
  workers: readPositiveIntEnv(
    process.env.DRTS_DEV_RUNTIME_MATRIX_WORKERS,
    defaultWorkers,
  ),
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    trace: "retain-on-failure",
  },
  timeout: 30_000,
});
