import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { expect, it } from "vitest";

it("preserves DNS/TLS/HTTP and cloud discovery failure semantics", () => {
  const result = spawnSync(
    "python3",
    [
      resolve(
        "tests/unit/system-remediation/sr-public-001/diagnostics_test.py",
      ),
    ],
    { encoding: "utf8", timeout: 20_000 },
  );
  expect(result.error).toBeUndefined();
  expect(result.status, result.stdout + result.stderr).toBe(0);
  expect(result.stderr).toContain("Ran 7 tests");
});
