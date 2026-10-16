import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, it } from "vitest";

const execute = promisify(execFile);

it.each(["success", "missing-job", "navigation-failed", "accept-refused"])(
  "the real hosted caller and Driver screens retain precise diagnosis: %s",
  async (scenario) => {
    const result = await execute(
      process.execPath,
      [
        "tests/unit/pax-review-shared-order-demo-20261015/driver-acceptance-probe.cjs",
        scenario,
        ...(process.env.PAX_REVIEW_DRIVER_CALLER_SOURCE_REF
          ? [process.env.PAX_REVIEW_DRIVER_CALLER_SOURCE_REF]
          : []),
      ],
      { timeout: 25_000 },
    );
    const report = JSON.parse(result.stdout.trim());
    expect(report.actualScreens).toBe(true);
    expect(report.actualSDK).toBe(true);
    expect(report.upstreamHTTP).toContain("no runtime acceptance credit");
  },
  30_000,
);
