import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, it } from "vitest";

const execute = promisify(execFile);

it("the real Nest rating caller injects complaint storage and preserves seven rating scenarios", async () => {
  const result = await execute(
    process.execPath,
    [
      "tests/unit/pax-review-shared-order-demo-20261015/rating-injection-probe.cjs",
    ],
    { timeout: 60_000, maxBuffer: 2_000_000 },
  ).catch((error: unknown) => {
    const failure = error as { stdout?: string; stderr?: string };
    throw new Error(
      `${failure.stdout ?? ""}\n${failure.stderr ?? String(error)}`,
    );
  });
  const report = JSON.parse(result.stdout.trim());
  expect(report.failures).toEqual([]);
  expect(
    report.scenarios.map((scenario: { mode: string }) => scenario.mode),
  ).toEqual([
    "high",
    "low",
    "low-no-contact",
    "foreign-owner",
    "invalid-score",
    "missing-provider",
    "disabled-storage",
  ]);
  for (const scenario of report.scenarios) {
    expect(scenario.actualAppModuleImport).toBe(true);
    expect(scenario.actualNestInjector).toBe(true);
    expect(scenario.complaintInjected).toBe(
      scenario.mode !== "missing-provider",
    );
    expect(scenario.limits).toContain(
      "no lifecycle hooks or PG/browser/runtime acceptance credit",
    );
  }
}, 65_000);
