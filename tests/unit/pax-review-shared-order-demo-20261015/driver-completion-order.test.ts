import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, it } from "vitest";

const execute = promisify(execFile);

it.each(["metered", "fixed", "unavailable", "mismatch"])(
  "actual Trip and SDK load assigned completion requirements: %s",
  async (scenario) => {
    const result = await execute(
      process.execPath,
      [
        "tests/unit/pax-review-shared-order-demo-20261015/driver-acceptance-probe.cjs",
        `completion-${scenario}`,
      ],
      { timeout: 25_000 },
    ).catch((error: unknown) => {
      const failure = error as { stdout?: string; stderr?: string };
      throw new Error(
        `${failure.stdout ?? ""}\n${failure.stderr ?? String(error)}`,
      );
    });
    const report = JSON.parse(result.stdout.trim());
    expect(report.actualScreens).toBe(true);
    expect(report.actualSDK).toBe(true);
    expect(report.upstreamHTTP).toContain("no runtime acceptance credit");
  },
  30_000,
);
