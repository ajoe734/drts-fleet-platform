import { execFileSync } from "node:child_process";
import path from "node:path";
import { expect, it } from "vitest";

it("runs the real orchestration against offline CLI boundaries, including cleanup and missing evidence", () => {
  const output = execFileSync(
    "python3",
    [
      path.resolve(
        "tests/unit/system-remediation/sr-live-ops-001/test_drill.py",
      ),
      "-v",
    ],
    { encoding: "utf8", timeout: 90_000, stdio: ["ignore", "pipe", "pipe"] },
  );
  expect(output).not.toContain("TOP-SECRET-PASSWORD");
}, 95_000);
