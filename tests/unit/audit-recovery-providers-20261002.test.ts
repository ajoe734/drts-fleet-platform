import { describe, expect, it, vi } from "vitest";
import type { RouteFareDisclosureSnapshot } from "@drts/contracts";

import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { BillingSettlementRepository } from "../../apps/api/src/modules/billing-settlement/billing-settlement.repository";
import { BillingSettlementService } from "../../apps/api/src/modules/billing-settlement/billing-settlement.service";
import {
  PlatformManualPaymentRecoveryPort,
  UnavailablePaymentRecoveryPort,
  type PaymentRecoveryPort,
  type PaymentRecoveryResult,
} from "../../apps/api/src/modules/billing-settlement/payment-recovery.port";
import type { BootstrapRequestIdentity } from "../../apps/api/src/common/auth";

import { FareAnomalyRepository } from "../../apps/api/src/modules/product-rule/fare-anomaly.repository";
import { FareAnomalyService } from "../../apps/api/src/modules/product-rule/fare-anomaly.service";
import { UnavailableFareQuoteRecoveryPort } from "../../apps/api/src/modules/product-rule/fare-quote-recovery.port";

/**
 * AUDIT-RECOVERY-PROVIDERS-20261002: confirmed_provider_contracts,
 * real_adapter_or_explicit_blocker and denial_and_idempotency_regressions
 * acceptance keys. No external payment processor or fare-quote vendor is
 * configured anywhere in this repository (see
 * docs/04-uat/audit-recovery-providers-20261002.md); these regressions
 * confirm that the one internal-only recovery action is real, that the
 * still-unprovisioned actions genuinely fail closed, and that neither
 * attempts an external call twice for the same idempotency key.
 */

const PLATFORM_IDENTITY = {
  authMode: "jwt",
  actorType: "staff",
  actorId: "platform-admin-001",
  realm: "platform",
  tenantId: null,
  roleFamilies: [],
  roles: [],
  scopes: ["billing:write"],
  requestId: null,
} as unknown as BootstrapRequestIdentity;

describe("PlatformManualPaymentRecoveryPort (confirmed boundary)", () => {
  it("only begin_manual_recovery is available; retry_capture stays unprovisioned", () => {
    const port = new PlatformManualPaymentRecoveryPort();
    expect(port.isAvailable("retry_capture")).toBe(false);
    expect(port.isAvailable("begin_manual_recovery")).toBe(true);
  });

  it("accepts begin_manual_recovery without claiming any external provider success", async () => {
    const port: PaymentRecoveryPort = new PlatformManualPaymentRecoveryPort();
    const result = await port.recover(
      "begin_manual_recovery",
      {
        paymentId: "payment-001",
        orderId: "order-001",
        status: "failed",
        amountMinor: 50_000,
        currency: "TWD",
        attemptCount: 1,
      },
      { actorId: "platform-admin-001", idempotencyKey: "idem-001" },
    );
    const expected: PaymentRecoveryResult = { status: "accepted" };
    expect(result).toEqual(expected);
  });

  it("rejects retry_capture rather than fabricating a capture", async () => {
    const port: PaymentRecoveryPort = new PlatformManualPaymentRecoveryPort();
    await expect(
      port.recover(
        "retry_capture",
        {
          paymentId: "payment-001",
          orderId: "order-001",
          status: "failed",
          amountMinor: 50_000,
          currency: "TWD",
          attemptCount: 1,
        },
        { actorId: "platform-admin-001", idempotencyKey: "idem-002" },
      ),
    ).rejects.toThrow("Payment recovery adapter is not provisioned.");
  });
});

function buildPaymentRepositoryDouble(options: {
  action: "retry_capture" | "begin_manual_recovery";
  recoverSpy: ReturnType<typeof vi.fn>;
}) {
  const payment = {
    paymentId: "payment-001",
    orderId: "order-001",
    tripId: null,
    providerPaymentRef: null,
    status: "failed" as const,
    amountMinor: 50_000,
    currency: "TWD",
    attemptCount: 1,
    availableActions: [
      { action: "retry_capture", enabled: true, riskLevel: "high" as const },
      {
        action: "begin_manual_recovery",
        enabled: true,
        riskLevel: "medium" as const,
      },
    ],
    recoveryState: null,
    lastRecoveryAction: null,
    updatedAt: "2026-10-03T00:00:00.000Z",
  };

  const commands = new Map<
    string,
    {
      state: "processing" | "accepted" | "completed" | "failed";
      receipt: unknown;
    }
  >();
  const commandKey = (idempotencyKey: string) =>
    `${payment.paymentId}:${options.action}:${idempotencyKey}`;

  const claimSpy = vi.fn(
    async (input: {
      recoveryCommandId: string;
      paymentId: string;
      idempotencyKey: string;
    }) => {
      const key = commandKey(input.idempotencyKey);
      commands.set(key, { state: "processing", receipt: null });
      return {
        claimed: true,
        command: {
          recoveryCommandId: input.recoveryCommandId,
          paymentId: input.paymentId,
          orderId: payment.orderId,
          action: options.action,
          idempotencyKey: input.idempotencyKey,
          state: "processing" as const,
          receipt: null,
          createdAt: "2026-10-03T00:00:00.000Z",
          updatedAt: "2026-10-03T00:00:00.000Z",
        },
      };
    },
  );
  const completeSpy = vi.fn(
    async (input: {
      idempotencyKey?: string;
      state: "accepted" | "completed";
      receipt: unknown;
    }) => {
      // Locate by scanning: the service only ever completes the command it
      // just claimed in the same call, so the most recent "processing" entry
      // is the one being completed.
      for (const [key, value] of commands) {
        if (value.state === "processing") {
          commands.set(key, { state: input.state, receipt: input.receipt });
          break;
        }
      }
    },
  );

  const repository = {
    isEnabled: () => true,
    findMultiTaxiPaymentException: vi.fn(async () => payment),
    findMultiTaxiPaymentRecoveryCommand: vi.fn(
      async (paymentId: string, action: string, idempotencyKey: string) => {
        const existing = commands.get(commandKey(idempotencyKey));
        if (!existing) {
          return null;
        }
        return {
          recoveryCommandId: "recovery-cmd-001",
          paymentId,
          orderId: payment.orderId,
          action,
          idempotencyKey,
          state: existing.state,
          receipt: existing.receipt,
          createdAt: "2026-10-03T00:00:00.000Z",
          updatedAt: "2026-10-03T00:00:00.000Z",
        };
      },
    ),
    claimMultiTaxiPaymentRecoveryCommand: claimSpy,
    completeMultiTaxiPaymentRecoveryCommand: completeSpy,
    failMultiTaxiPaymentRecoveryCommand: vi.fn(async () => undefined),
  } as unknown as BillingSettlementRepository;

  return { repository, claimSpy, completeSpy };
}

describe("BillingSettlementService.executeMultiTaxiPaymentRecovery (denial and idempotency)", () => {
  it("denies retry_capture without ever claiming a command or calling the port, since no PSP is provisioned", async () => {
    const audit = new AuditNotificationService();
    const recoverSpy = vi.fn();
    const { repository, claimSpy } = buildPaymentRepositoryDouble({
      action: "retry_capture",
      recoverSpy,
    });
    const service = new BillingSettlementService(
      audit,
      repository,
      undefined,
      new PlatformManualPaymentRecoveryPort(),
    );

    await expect(
      service.executeMultiTaxiPaymentRecovery(
        "order-001",
        "retry_capture",
        undefined,
        PLATFORM_IDENTITY,
        { idempotencyKey: "idem-deny-001" },
      ),
    ).rejects.toMatchObject({
      status: 409,
      response: {
        error: { code: "payment_recovery_provider_not_provisioned" },
      },
    });

    expect(claimSpy).not.toHaveBeenCalled();
  });

  it("completes begin_manual_recovery once and replays the cached receipt for a repeated idempotency key", async () => {
    const audit = new AuditNotificationService();
    const recoverSpy = vi.fn();
    const { repository, claimSpy, completeSpy } = buildPaymentRepositoryDouble({
      action: "begin_manual_recovery",
      recoverSpy,
    });
    const service = new BillingSettlementService(
      audit,
      repository,
      undefined,
      new PlatformManualPaymentRecoveryPort(),
    );

    const first = await service.executeMultiTaxiPaymentRecovery(
      "order-001",
      "begin_manual_recovery",
      undefined,
      PLATFORM_IDENTITY,
      { idempotencyKey: "idem-manual-001" },
    );
    expect(first.status).toBe("accepted");
    expect(claimSpy).toHaveBeenCalledTimes(1);
    expect(completeSpy).toHaveBeenCalledTimes(1);

    const second = await service.executeMultiTaxiPaymentRecovery(
      "order-001",
      "begin_manual_recovery",
      undefined,
      PLATFORM_IDENTITY,
      { idempotencyKey: "idem-manual-001" },
    );

    expect(second).toEqual(first);
    // Idempotent replay must short-circuit before claiming a new command or
    // invoking the provider port again.
    expect(claimSpy).toHaveBeenCalledTimes(1);
    expect(completeSpy).toHaveBeenCalledTimes(1);
  });
});

function buildFareAnomalySnapshot(
  quoteSnapshotId: string,
): RouteFareDisclosureSnapshot {
  return {
    routeSnapshotId: `route-${quoteSnapshotId}`,
    quoteSnapshotId,
    orderId: `order-${quoteSnapshotId}`,
    pickup: {
      address: "台北市信義區市府路1號",
      lat: 25.037,
      lng: 121.563,
      coordinateSource: "provider_candidate",
      geocodeConfidence: "exact",
      resolvedAt: "2026-10-03T08:00:00.000Z",
    },
    dropoff: {
      address: "台北市南港區經貿二路1號",
      lat: 25.056,
      lng: 121.618,
      coordinateSource: "provider_candidate",
      geocodeConfidence: "exact",
      resolvedAt: "2026-10-03T08:01:00.000Z",
    },
    estimatedDistanceMeters: 7500,
    estimatedDurationSeconds: 1200,
    encodedPolyline: null,
    chargingMode: "fixed_quote",
    estimatedFareMinor: 32_000,
    payableFareMinor: 32_000,
    currency: "TWD",
    farePolicyId: "fare-policy-standard",
    farePolicyVersion: "v1.2",
    fareChangeRuleId: "none",
    fareChangeRuleVersion: "v1",
    fareChangeRuleDisplayText: "無費率變更",
    passengerConfirmedAt: null,
    generatedAt: "2026-10-03T08:02:00.000Z",
  };
}

describe("FareQuoteRecoveryPort (confirmed boundary)", () => {
  it("denies retry_quote fail-closed when no fare-quote provider is configured", async () => {
    const audit = new AuditNotificationService();
    const repository = new FareAnomalyRepository();
    const service = new FareAnomalyService(
      repository,
      audit,
      new UnavailableFareQuoteRecoveryPort(),
    );
    await service.onModuleInit();

    const snapshot = buildFareAnomalySnapshot("quote-deny-001");
    await service.recordQuoteAnomaly({
      reason: "quote_provider_unavailable",
      snapshot,
    });

    const view = service.get("quote-deny-001");
    expect(view.availableActions).toEqual([
      {
        action: "retry_quote",
        enabled: false,
        disabledReasonCode: "FARE_QUOTE_PROVIDER_NOT_PROVISIONED",
        riskLevel: "medium",
      },
    ]);

    await expect(
      service.retryQuote("quote-deny-001", {
        actorId: "platform-admin-001",
        idempotencyKey: "idem-quote-deny-001",
      }),
    ).rejects.toMatchObject({
      status: 409,
      response: {
        error: { code: "FARE_QUOTE_PROVIDER_NOT_PROVISIONED" },
      },
    });
  });

  it("replays the cached receipt for a repeated idempotency key instead of re-invoking the provider", async () => {
    const audit = new AuditNotificationService();
    const repository = new FareAnomalyRepository();
    const recoverSpy = vi.fn(async () => ({
      status: "accepted" as const,
      message: "Recovered via provider re-quote",
    }));
    const service = new FareAnomalyService(repository, audit, {
      isAvailable: () => true,
      recover: recoverSpy,
    });
    await service.onModuleInit();

    const snapshot = buildFareAnomalySnapshot("quote-idem-001");
    await service.recordQuoteAnomaly({
      reason: "quote_provider_unavailable",
      snapshot,
    });

    const first = await service.retryQuote("quote-idem-001", {
      actorId: "platform-admin-001",
      idempotencyKey: "idem-quote-001",
    });
    const second = await service.retryQuote("quote-idem-001", {
      actorId: "platform-admin-001",
      idempotencyKey: "idem-quote-001",
    });

    expect(second).toEqual(first);
    expect(recoverSpy).toHaveBeenCalledTimes(1);
  });
});

describe("UnavailablePaymentRecoveryPort regression guard", () => {
  it("still rejects every action when no adapter at all is wired (DI-less default)", async () => {
    const port: PaymentRecoveryPort = new UnavailablePaymentRecoveryPort();
    expect(port.isAvailable("retry_capture")).toBe(false);
    expect(port.isAvailable("begin_manual_recovery")).toBe(false);
    await expect(
      port.recover(
        "retry_capture",
        {
          paymentId: "payment-001",
          orderId: "order-001",
          status: "failed",
          amountMinor: 50_000,
          currency: "TWD",
          attemptCount: 1,
        },
        { actorId: "platform-admin-001", idempotencyKey: "idem-003" },
      ),
    ).rejects.toThrow("Payment recovery adapter is not provisioned.");
  });
});
