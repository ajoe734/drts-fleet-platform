import { describe, expect, it } from "vitest";

import {
  PAYMENT_STATUSES,
  classifyPaymentExceptionError,
  isPaidPaymentStatus,
  parsePaymentExceptionView,
  parsePaymentRecoveryReceipt,
  paymentRecoveryCommandPath,
} from "../../app/payments/[orderId]/payment-exception-model";

const fixture = {
  paymentId: "payment-001",
  orderId: "ZX-240720-0186",
  tripId: "trip-001",
  status: "failed",
  amount: { amountMinor: 35500, currency: "NTD" },
  safeProviderReference: "pay_...88f2",
  attemptCount: 3,
  updatedAt: "2026-07-20T07:12:00.000Z",
  availableActions: [],
  auditTimeline: [],
};

describe("payment exception presentation model", () => {
  it("keeps the canonical six payment states", () => {
    expect(PAYMENT_STATUSES).toEqual([
      "not_selected",
      "authorized",
      "captured",
      "failed",
      "refunded",
      "manual_recovery",
    ]);
  });

  it("never treats failed or manual recovery as paid", () => {
    expect(isPaidPaymentStatus("captured")).toBe(true);
    expect(isPaidPaymentStatus("failed")).toBe(false);
    expect(isPaidPaymentStatus("manual_recovery")).toBe(false);
  });

  it("drops unmasked provider references and invented mark-paid controls", () => {
    const parsed = parsePaymentExceptionView({
      ...fixture,
      safeProviderReference: "raw-provider-reference-123456",
      availableActions: [
        { action: "mark_paid", enabled: true, riskLevel: "high" },
        { action: "mark-paid", enabled: true, riskLevel: "high" },
        {
          action: "retry_capture",
          enabled: false,
          disabledReasonCode: "payment_recovery_command_pending",
          riskLevel: "medium",
        },
      ],
    });

    expect(parsed?.safeProviderReference).toBeNull();
    expect(parsed?.availableActions).toEqual([
      expect.objectContaining({
        action: "retry_capture",
        enabled: false,
      }),
    ]);
  });

  it("maps only the two approved backend recovery actions to command paths", () => {
    expect(paymentRecoveryCommandPath("ZX/240720", "retry_capture")).toBe(
      "/api/payment-exceptions/ZX%2F240720/actions/retry-capture",
    );
    expect(
      paymentRecoveryCommandPath("ZX-240720-0186", "begin_manual_recovery"),
    ).toBe(
      "/api/payment-exceptions/ZX-240720-0186/actions/begin-manual-recovery",
    );
    expect(
      paymentRecoveryCommandPath("ZX-240720-0186", "mark_paid"),
    ).toBeNull();
  });

  it("accepts only audit-backed successful recovery receipts", () => {
    expect(
      parsePaymentRecoveryReceipt({
        actionId: "idem-payment-001",
        auditId: "audit-payment-001",
        resourceType: "multi_taxi_payment_exception",
        resourceId: "payment-001",
        status: "accepted",
        message: "Payment capture retry accepted.",
      }),
    ).toMatchObject({
      actionId: "idem-payment-001",
      auditId: "audit-payment-001",
    });
    expect(
      parsePaymentRecoveryReceipt({
        actionId: "idem-payment-001",
        auditId: "audit-payment-001",
        resourceType: "multi_taxi_payment_exception",
        resourceId: "payment-001",
        status: "failed",
        message: "not accepted",
      }),
    ).toBeNull();
  });

  it("classifies permission, not-found, and unavailable failures", () => {
    expect(classifyPaymentExceptionError({ statusCode: 403 })).toBe(
      "forbidden",
    );
    expect(classifyPaymentExceptionError({ statusCode: 404 })).toBe(
      "not_found",
    );
    expect(classifyPaymentExceptionError({ statusCode: 503 })).toBe(
      "unavailable",
    );
    expect(classifyPaymentExceptionError(new Error("network"))).toBe("unknown");
  });
});
