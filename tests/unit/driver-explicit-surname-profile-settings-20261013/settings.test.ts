import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";

const probe = path.resolve(__dirname, "settings-caller-probe.cjs");
describe("actual SettingsScreen explicit surname and SDK PATCH/readback", () => {
  it.each([
    "legacy-control",
    "legacy",
    "capture",
    "compound",
    "preserve",
    "clear",
    "invalid",
    "patch-failure",
    "partial-success",
    "saving",
    "load-failure",
    "existing-validation",
    "unprovisioned",
    "expired",
    "identity-clear",
  ])(
    "%s through real caller and native input props",
    (scenario) => {
      const output = execFileSync(process.execPath, [probe, scenario], {
        encoding: "utf8",
        timeout: 20000,
      });
      expect(output).toContain(`PASS ${scenario}`);
    },
    25000,
  );
});
