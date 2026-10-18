import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Driver retains its loaded order through temporary refresh failures", () => {
  it.each(["429", "web-429", "503", "recover", "different", "403"])(
    "actual TripScreen and SDK: %s",
    (scenario) => {
      const output = execFileSync(
        process.execPath,
        [path.join(__dirname, "trip-order-refresh-probe.cjs"), scenario],
        { encoding: "utf8", timeout: 12000 },
      );
      expect(JSON.parse(output).actualTripAndSDK).toBe(true);
    },
    15000,
  );
});
