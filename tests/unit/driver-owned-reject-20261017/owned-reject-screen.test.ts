import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("owned Driver trip rejection uses its existing same-order backend", () => {
  it.each([
    "success",
    "web-success",
    "no-note",
    "legacy",
    "cancel",
    "error",
    "busy",
    "accepted",
    "forwarded",
    "not-allowed",
    "terminal-completed",
    "terminal-cancelled",
    "terminal-rejected",
  ])(
    "actual trip and SDK: %s",
    (scenario) => {
      const output = execFileSync(
        process.execPath,
        [path.join(__dirname, "trip-reject-probe.cjs"), scenario],
        { encoding: "utf8", timeout: 12_000 },
      );
      expect(JSON.parse(output).actualTripAndSDK).toBe(true);
    },
    15_000,
  );
});
