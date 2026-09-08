import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { expect, it } from "vitest";

it("validates readiness coverage, source evidence and missing live gates", () => {
  const result = spawnSync(
    "python3",
    [
      resolve(
        "tests/unit/system-remediation/sr-readiness-001/inventory_checks.py",
      ),
    ],
    { encoding: "utf8", timeout: 20_000 },
  );
  expect(result.error).toBeUndefined();
  expect(result.status, result.stdout + result.stderr).toBe(0);
  expect(result.stderr).toContain("Ran 6 tests");
}, 25_000);
