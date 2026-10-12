import { describe, expect, it } from "vitest";
import {
  captureDisposition,
  validatePaymentCapturePolicy,
} from "../../../apps/api/src/modules/passenger-app/payment/payment-capture.policy";
import type { MoneyResult } from "../../../apps/api/src/modules/passenger-app/payment/payment-provider.port";
import { FakePaymentProvider } from "../../../apps/api/src/modules/passenger-app/payment/fake-payment-provider";

// Delays are an explicit synthetic TEST policy, not approved product defaults.
const synthetic = () =>
  validatePaymentCapturePolicy({
    retryDelaysMs: [17, 43],
    retryDefinitiveDeclines: false,
    unknownReadbackDelaysMs: [29, 71],
  });
const now = new Date("2026-10-11T10:00:00Z");
const unavailable: MoneyResult = {
  status: "failed",
  error: "unavailable",
  retryable: true,
};

describe("explicit capture retry policy boundary", () => {
  it.each([
    undefined,
    null,
    {},
    [],
    { retryDelaysMs: [] },
    {
      retryDelaysMs: [],
      retryDefinitiveDeclines: false,
      unknownReadbackDelaysMs: [],
      maxAttempts: 3,
    },
    {
      retryDelaysMs: [-1],
      retryDefinitiveDeclines: false,
      unknownReadbackDelaysMs: [],
    },
    {
      retryDelaysMs: [Infinity],
      retryDefinitiveDeclines: false,
      unknownReadbackDelaysMs: [],
    },
    {
      retryDelaysMs: [1.5],
      retryDefinitiveDeclines: false,
      unknownReadbackDelaysMs: [],
    },
    {
      retryDelaysMs: [],
      retryDefinitiveDeclines: "false",
      unknownReadbackDelaysMs: [],
    },
    {
      retryDelaysMs: [],
      retryDefinitiveDeclines: false,
      unknownReadbackDelaysMs: [NaN],
    },
    {
      retryDelaysMs: new Array(1),
      retryDefinitiveDeclines: false,
      unknownReadbackDelaysMs: [],
    },
  ])(
    "rejects missing/partial/invalid policy without fallback (%j)",
    (value) => {
      expect(() => validatePaymentCapturePolicy(value)).toThrow(
        "payment_capture_policy_invalid",
      );
    },
  );

  it("copies and freezes the injected schedule so caller mutation cannot alter financial decisions", () => {
    const input = {
      retryDelaysMs: [17],
      retryDefinitiveDeclines: true,
      unknownReadbackDelaysMs: [29],
    };
    const policy = validatePaymentCapturePolicy(input);
    input.retryDelaysMs[0] = 999;
    expect(
      captureDisposition(policy, {
        result: unavailable,
        attemptCount: 1,
        readbackCount: 0,
        now,
      }).retryAt,
    ).toBe("2026-10-11T10:00:00.017Z");
    expect(() => (policy.retryDelaysMs as number[]).push(1)).toThrow();
  });

  it("uses durable capture count, exhausts retries and requests a recovery notice", () => {
    const p = synthetic();
    expect(
      captureDisposition(p, {
        result: unavailable,
        attemptCount: 2,
        readbackCount: 0,
        now,
      }),
    ).toMatchObject({
      status: "failed",
      nextOperation: "capture",
      retryAt: "2026-10-11T10:00:00.043Z",
      requestRecoveryNotice: false,
    });
    expect(
      captureDisposition(p, {
        result: unavailable,
        attemptCount: 3,
        readbackCount: 0,
        now,
      }),
    ).toMatchObject({
      status: "manual_recovery",
      retryAt: null,
      nextOperation: null,
      requestRecoveryNotice: true,
    });
  });

  it.each([false, true])(
    "retries definitive decline only when policy explicitly allows it (%j)",
    (allowed) => {
      const p = validatePaymentCapturePolicy({
        ...synthetic(),
        retryDefinitiveDeclines: allowed,
      });
      expect(
        captureDisposition(p, {
          result: { status: "failed", error: "card_declined", retryable: true },
          attemptCount: 1,
          readbackCount: 0,
          now,
        }).status,
      ).toBe(allowed ? "failed" : "manual_recovery");
    },
  );

  it("does not retry a provider's definitive nonretryable refusal", () => {
    expect(
      captureDisposition(synthetic(), {
        result: { status: "failed", error: "invalid_method", retryable: false },
        attemptCount: 1,
        readbackCount: 0,
        now,
      }).status,
    ).toBe("manual_recovery");
  });

  it.each(["unknown", "pending"] as const)(
    "%s acknowledgement uses only the separate original-key readback schedule",
    (status) => {
      const p = synthetic();
      expect(
        captureDisposition(p, {
          result: { status },
          attemptCount: 999,
          readbackCount: 0,
          now,
        }),
      ).toMatchObject({
        status: "failed",
        error: "unknown",
        nextOperation: "readback",
        retryAt: "2026-10-11T10:00:00.029Z",
      });
      expect(
        captureDisposition(p, {
          result: { status },
          attemptCount: 1,
          readbackCount: 2,
          now,
        }),
      ).toMatchObject({
        status: "manual_recovery",
        nextOperation: null,
        retryAt: null,
        requestRecoveryNotice: true,
      });
    },
  );

  it("a lost PSP acknowledgement becomes captured only after reading the completed original key", async () => {
    const provider = new FakePaymentProvider({ DRTS_ENV: "test" });
    const binding = await provider.bind(
      "synthetic_credential_probe",
      "synthetic_bind_key",
    );
    if (binding.status !== "completed")
      throw new Error("synthetic binding failed");
    const capture = {
      idempotencyKey: "pax:capture:synthetic_order",
      token: binding.card.token,
      amountMinor: 123,
      currency: "TWD" as const,
    };
    const completed = await provider.capture(capture);
    // External PSP completed but its response was lost: never report captured
    // from the local timeout; reconcile the same key without another capture.
    expect(
      captureDisposition(synthetic(), {
        result: { status: "unknown" },
        attemptCount: 1,
        readbackCount: 0,
        now,
      }).status,
    ).toBe("failed");
    const readback = await provider.readCapture(capture.idempotencyKey);
    expect(readback).toEqual(completed);
    expect(
      captureDisposition(synthetic(), {
        result: readback,
        attemptCount: 1,
        readbackCount: 1,
        now,
      }),
    ).toMatchObject({
      status: "captured",
      retryAt: null,
      nextOperation: null,
      requestRecoveryNotice: false,
    });
  });

  it.each([0, -1, 1.5, NaN])(
    "rejects invalid durable attempt count %j",
    (attemptCount) => {
      expect(() =>
        captureDisposition(synthetic(), {
          result: unavailable,
          attemptCount,
          readbackCount: 0,
          now,
        }),
      ).toThrow("payment_capture_outcome_invalid");
    },
  );

  it("does not accept a foreign/accepted provider outcome as successful capture", () => {
    expect(() =>
      captureDisposition(synthetic(), {
        result: { status: "accepted" } as never,
        attemptCount: 1,
        readbackCount: 0,
        now,
      }),
    ).toThrow("payment_capture_outcome_invalid");
    expect(() =>
      captureDisposition(synthetic(), {
        result: { status: "completed", providerRef: "" },
        attemptCount: 1,
        readbackCount: 0,
        now,
      }),
    ).toThrow("payment_capture_outcome_invalid");
  });
});
