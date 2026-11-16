import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, it } from "vitest";

const execute = promisify(execFile);

it.each(
  ["reload", "empty", "malformed", "unreadable"].flatMap((identity) =>
    ["web", "native"].flatMap((platform) =>
      ["jobs", "trip", "settings"].map(
        (screen) => `${identity}-${platform}-${screen}`,
      ),
    ),
  ),
)(
  "the actual Driver screen restores identity before redirecting: %s",
  async (scenario) => {
    const result = await execute(
      process.execPath,
      [
        "tests/unit/pax-review-shared-order-demo-20261015/driver-acceptance-probe.cjs",
        scenario,
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

it("the actual Driver Settings retains the provisioned in-app session", async () => {
  const result = await execute(
    process.execPath,
    [
      "tests/unit/pax-review-shared-order-demo-20261015/driver-acceptance-probe.cjs",
      "settings-spa",
    ],
    { timeout: 25_000 },
  );
  const report = JSON.parse(result.stdout.trim());
  expect(report.actualScreens).toBe(true);
  expect(report.actualSDK).toBe(true);
  expect(report.upstreamHTTP).toContain("no runtime acceptance credit");
}, 30_000);
