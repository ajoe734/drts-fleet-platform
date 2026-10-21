import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, it } from "vitest";

const execute = promisify(execFile);

it.each([
  "",
  "-completed",
  "-fallback",
  "-forwarded",
  "-refused",
  "-unavailable",
])(
  "actual Home loads owned task order facts and preserves reader boundaries: home%s",
  async (suffix) => {
    const result = await execute(
      process.execPath,
      [
        "tests/unit/pax-review-shared-order-demo-20261015/driver-acceptance-probe.cjs",
        `completion-home${suffix}`,
      ],
      { timeout: 25_000 },
    ).catch((error: unknown) => {
      const failure = error as { stdout?: string; stderr?: string };
      throw new Error(
        `${failure.stdout ?? ""}\n${failure.stderr ?? String(error)}`,
      );
    });
    const report = JSON.parse(result.stdout.trim());
    expect(report.actualFunction).toBe("Home.loadWorkspaceData");
    expect(report.actualSDK).toBe(true);
    expect(report.upstreamHTTP).toContain("no runtime acceptance credit");
  },
  30_000,
);
