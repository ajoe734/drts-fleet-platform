import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { PLATFORM_CURRENCY } from "@drts/contracts";
import {
  emptyActualFareDraft,
  parseActualFareMinor,
  readActualFareInput,
} from "../../../apps/driver-app/lib/actual-fare-input";

const draft = {
  startMinor: "35",
  distanceMinor: "55.50",
  delayMinor: "10",
  nightMinor: "0",
  aggregate: "107",
};
describe("exact driver-reported actual fare inputs", () => {
  it.each([
    ["0", 0],
    ["0.00", 0],
    [" 35.50 ", 3550],
    ["1.1", 110],
    ["0001.01", 101],
    ["90071992547409.91", Number.MAX_SAFE_INTEGER],
  ])("parses %s without rounding", (value, expected) => {
    expect(parseActualFareMinor(value)).toBe(expected);
  });
  it.each([
    "",
    " ",
    "-1",
    "+1",
    "NaN",
    "Infinity",
    "1e2",
    "1,000",
    ".50",
    "1.",
    "0.001",
    "1.005",
    "90071992547409.92",
    "1000000000000000",
  ])("rejects %s", (value) => {
    expect(parseActualFareMinor(value)).toBeNull();
    expect(
      readActualFareInput({ ...draft, startMinor: value }, false).issue,
    ).not.toBeNull();
  });
  it("preserves absence, explicit zeros, and a separately reported differing total", () => {
    expect(readActualFareInput(emptyActualFareDraft(), false)).toEqual({
      issue: null,
      command: {},
    });
    expect(readActualFareInput(draft, false)).toEqual({
      issue: null,
      command: {
        actualFareBreakdown: {
          startMinor: 3500,
          distanceMinor: 5550,
          delayMinor: 1000,
          nightMinor: 0,
        },
        fare: { currency: PLATFORM_CURRENCY, amountMinor: 10700 },
      },
    });
    expect(
      readActualFareInput(
        {
          startMinor: "0",
          distanceMinor: "0",
          delayMinor: "0",
          nightMinor: "0",
          aggregate: "0",
        },
        false,
      ),
    ).toEqual({
      issue: null,
      command: {
        actualFareBreakdown: {
          startMinor: 0,
          distanceMinor: 0,
          delayMinor: 0,
          nightMinor: 0,
        },
        fare: { currency: PLATFORM_CURRENCY, amountMinor: 0 },
      },
    });
  });
  it("requires all components and independently entered total for metered capture", () => {
    expect(
      readActualFareInput({ ...draft, nightMinor: " " }, false).issue,
    ).toBe("partial");
    expect(
      readActualFareInput(
        { ...emptyActualFareDraft(), aggregate: "107" },
        false,
      ).issue,
    ).toBe("partial");
    expect(readActualFareInput({ ...draft, aggregate: "" }, false).issue).toBe(
      "aggregate",
    );
    expect(
      readActualFareInput({ ...draft, aggregate: "107.001" }, false).issue,
    ).toBe("aggregate");
  });
  it("rejects a sum overflow even when each entered amount is safe", () => {
    expect(
      readActualFareInput({ ...draft, startMinor: "90071992547409.91" }, false)
        .issue,
    ).toBe("overflow");
  });
  it("keeps canonical fixed-price authority without sending a fare override", () => {
    for (const currency of [PLATFORM_CURRENCY, "NTD"]) {
      expect(
        readActualFareInput(
          { ...draft, aggregate: "invalid stale value" },
          true,
          { currency, amountMinor: 12000 },
        ),
      ).toEqual({
        issue: null,
        command: {
          actualFareBreakdown: {
            startMinor: 3500,
            distanceMinor: 5550,
            delayMinor: 1000,
            nightMinor: 0,
          },
        },
      });
    }
    for (const quotedFare of [
      null,
      { currency: "USD", amountMinor: 12000 },
      { currency: PLATFORM_CURRENCY, amountMinor: -1 },
      { currency: PLATFORM_CURRENCY, amountMinor: 0.5 },
    ]) {
      expect(readActualFareInput(draft, true, quotedFare).issue).toBe(
        "fixedFare",
      );
    }
  });
});

const probe = path.resolve(__dirname, "trip-caller-probe.cjs");
describe("real Trip caller, RN controls, SecureStore codec and SDK fetch", () => {
  it.each([
    "capture",
    "zero",
    "legacy",
    "fixed",
    "fixed-invalid",
    "remount",
    "identity-clear",
    "same-task-refresh",
    "partial",
    "invalid",
    "missing-total",
    "overflow",
    "reset",
    "storage-failure",
    "replay",
    "auto-replay",
    "legacy-replay",
    "zero-replay",
    "forwarded",
    "tracking",
    "proof",
    "order-switch",
    "server-error",
  ])(
    "executes %s through production logic",
    (scenario) => {
      const output = execFileSync(process.execPath, [probe, scenario], {
        encoding: "utf8",
        timeout: 25000,
      });
      expect(output).toContain(`PASS ${scenario}`);
    },
    30000,
  );
  it("reproduces original 116132 caller omission after a real completion request", () => {
    let failure: unknown;
    try {
      execFileSync(
        process.execPath,
        [probe, "capture", "116132df18b6bc0b64bb3311a44a84697c653985"],
        { encoding: "utf8", timeout: 25000, stdio: "pipe" },
      );
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeDefined();
    expect((failure as { stderr: string }).stderr).toContain(
      "actual completion command lost entered components",
    );
    expect((failure as { status: number }).status).toBe(1);
  }, 30000);
  it("executes the original legacy caller as a positive baseline control", () => {
    expect(
      execFileSync(
        process.execPath,
        [probe, "legacy", "116132df18b6bc0b64bb3311a44a84697c653985"],
        { encoding: "utf8", timeout: 25000 },
      ),
    ).toContain("PASS legacy");
  }, 30000);
});
