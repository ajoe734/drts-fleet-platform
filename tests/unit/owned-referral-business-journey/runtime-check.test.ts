import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { expect, it } from "vitest";

it("checks the real Python collector against socket-free controlled traffic allocations", () => {
  const result = spawnSync(
    "python3",
    [
      "-B",
      resolve(
        "tests/unit/owned-referral-business-journey/test_runtime_check.py",
      ),
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 10_000,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
    },
  );
  expect(result.error).toBeUndefined();
  expect(result.signal).toBeNull();
  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  expect(result.stderr).toContain("Ran 8 tests");
  expect(result.stderr).toContain("OK");
});
