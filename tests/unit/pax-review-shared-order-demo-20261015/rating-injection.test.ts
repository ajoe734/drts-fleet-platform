import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, it } from "vitest";

const execute = promisify(execFile);

it.each([
  "high",
  "low",
  "low-no-contact",
  "foreign-owner",
  "invalid-score",
  "missing-provider",
  "disabled-storage",
])(
  "the real Nest rating caller preserves %s behavior",
  async (mode) => {
    const result = await execute(
      process.execPath,
      [
        "tests/unit/pax-review-shared-order-demo-20261015/rating-injection-probe.cjs",
        mode,
      ],
      { timeout: 60_000, maxBuffer: 2_000_000 },
    ).catch((error: unknown) => {
      const failure = error as { stdout?: string; stderr?: string };
      throw new Error(
        `${failure.stdout ?? ""}\n${failure.stderr ?? String(error)}`,
      );
    });
    const report = JSON.parse(result.stdout.trim());
    expect(report.actualAppModuleImport).toBe(true);
    expect(report.actualNestInjector).toBe(true);
    expect(report.complaintInjected).toBe(mode !== "missing-provider");
    expect(report.limits).toContain(
      "no lifecycle hooks or PG/browser/runtime acceptance credit",
    );
  },
  65_000,
);
