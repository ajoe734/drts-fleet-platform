import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { expect, it } from "vitest";

it("validates the driver-web-acceptance workflow's structure and gate/status logic", () => {
  const result = spawnSync(
    "python3",
    [resolve("tools/ci/test_driver_web_acceptance_workflow.py")],
    { encoding: "utf8", timeout: 30_000 },
  );
  expect(result.error).toBeUndefined();
  expect(result.status, result.stdout + result.stderr).toBe(0);
  expect(result.stderr).toContain("Ran 30 tests");
}, 35_000);
