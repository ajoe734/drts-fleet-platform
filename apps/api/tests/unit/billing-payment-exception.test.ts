import { Reflector } from "@nestjs/core";
import { describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../src/common/api-envelope";
import {
  BootstrapAuthGuard,
  type AuthenticatedRequestLike,
  type BootstrapRequestIdentity,
} from "../../src/common/auth";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { BillingSettlementController } from "../../src/modules/billing-settlement/billing-settlement.controller";
import { BillingSettlementRepository } from "../../src/modules/billing-settlement/billing-settlement.repository";
import { BillingSettlementService } from "../../src/modules/billing-settlement/billing-settlement.service";
import type { PaymentRecoveryPort } from "../../src/modules/billing-settlement/payment-recovery.port";

const platformIdentity: BootstrapRequestIdentity = {
  authMode: "bootstrap_headers",
  actorType: "platform_admin",
  actorId: "platform-finance-001",
  realm: "platform",
  tenantId: null,
  partnerId: null,
  partnerProgramId: null,
  partnerEntrySlug: null,
  roleFamilies: ["platform"],
  roles: ["platform_admin"],
  scopes: ["billing:read"],
  requestId: "req-payment-read-001",
};

const platformWriteIdentity: BootstrapRequestIdentity = {
  ...platformIdentity,
  scopes: ["billing:read", "billing:write"],
};

function createExecutionContext(
  request: AuthenticatedRequestLike,
  handler: keyof BillingSettlementController = "getMultiTaxiPaymentException",
) {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: () => BillingSettlementController.prototype[handler],
    getClass: () => BillingSettlementController,
  } as never;
}

describe("multi-taxi payment exception read authority", () => {
  it("queries only safe payment fields and parses backend action descriptors", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM billing.multi_taxi_passenger_payments")) {
        return {
          rows: [
            {
              payment_id: "payment-001",
              order_id: "ZX-240720-0186",
              trip_id: "trip-001",
              provider_payment_ref: "pay_provider_secret_88f2",
              status: "failed",
              amount_minor: 35500,
              currency: "NTD",
              attempt_count: 3,
              available_actions: [
                {
                  action: "retry_capture",
                  enabled: true,
                  riskLevel: "medium",
                },
                {
                  action: "mark_paid",
                  enabled: true,
                  riskLevel: "high",
                },
              ],
              updated_at: "2026-07-20T07:12:00.000Z",
            },
          ],
        };
      }
      return {
        rows: [
          {
            audit_id: "audit-payment-001",
            actor_id: "payment-provider",
            actor_type: "system",
            action_name: "payment_capture_failed",
            request_id: "provider-request-003",
            created_at: "2026-07-20T07:12:00.000Z",
          },
        ],
      };
    });
    const repository = new BillingSettlementRepository({
      isEnabled: () => true,
      query,
    } as never);

    const payment =
      await repository.findMultiTaxiPaymentException("ZX-240720-0186");
    const timeline = await repository.listMultiTaxiPaymentAuditTrail(
      "ZX-240720-0186",
      "payment-001",
    );

    const paymentSql = String(query.mock.calls[0]?.[0]);
    expect(paymentSql).not.toContain("payment_method_token_ref");
    expect(payment).toEqual(
      expect.objectContaining({
        orderId: "ZX-240720-0186",
        attemptCount: 3,
        availableActions: [
          expect.objectContaining({ action: "retry_capture", enabled: true }),
        ],
      }),
    );
    expect(payment).not.toHaveProperty("paymentMethodTokenRef");
    expect(timeline).toEqual([
      expect.objectContaining({
        actionName: "payment_capture_failed",
      }),
    ]);
  });

  it("claims and completes recovery in a durable transaction without sensitive provider fields", async () => {
    const query = vi.fn(async (sql: string) => {
      if (
        sql.includes("INSERT INTO billing.multi_taxi_payment_recovery_commands")
      ) {
        return {
          rows: [
            {
              recovery_command_id: "ff25d453-d371-499c-a6cc-5f9cfa537acd",
              payment_id: "payment-001",
              order_id: "ZX-240720-0186",
              action: "retry_capture",
              idempotency_key: "idem-payment-001",
              state: "processing",
              action_receipt: null,
              created_at: "2026-07-24T00:00:00.000Z",
              updated_at: "2026-07-24T00:00:00.000Z",
            },
          ],
        };
      }
      return { rows: [] };
    });
    const transactionQuery = vi.fn(async (sql: string) => ({
      rows: [],
      rowCount: sql.includes(
        "UPDATE billing.multi_taxi_payment_recovery_commands",
      )
        ? 1
        : 0,
    }));
    const release = vi.fn();
    const repository = new BillingSettlementRepository({
      isEnabled: () => true,
      query,
      connect: vi.fn(async () => ({
        query: transactionQuery,
        release,
      })),
    } as never);

    const claim = await repository.claimMultiTaxiPaymentRecoveryCommand({
      recoveryCommandId: "ff25d453-d371-499c-a6cc-5f9cfa537acd",
      paymentId: "payment-001",
      orderId: "ZX-240720-0186",
      action: "retry_capture",
      idempotencyKey: "idem-payment-001",
      actorId: "platform-finance-001",
      requestId: "req-payment-write-001",
    });
    await repository.completeMultiTaxiPaymentRecoveryCommand({
      recoveryCommandId: claim.command.recoveryCommandId,
      paymentId: claim.command.paymentId,
      action: claim.command.action,
      state: "completed",
      receipt: {
        actionId: "idem-payment-001",
        auditId: "audit-payment-001",
        resourceType: "multi_taxi_payment_exception",
        resourceId: "payment-001",
        status: "completed",
        message: "Payment capture retry completed.",
      },
    });

    expect(claim.claimed).toBe(true);
    expect(transactionQuery.mock.calls.map(([sql]) => sql)).toEqual([
      "BEGIN",
      expect.stringContaining(
        "UPDATE billing.multi_taxi_payment_recovery_commands",
      ),
      expect.stringContaining("UPDATE billing.multi_taxi_passenger_payments"),
      "COMMIT",
    ]);
    expect(release).toHaveBeenCalledOnce();
    const allSql = [
      ...query.mock.calls.map(([sql]) => sql),
      ...transactionQuery.mock.calls.map(([sql]) => sql),
    ].join("\n");
    expect(allSql).not.toMatch(
      /payment_method_token|card_number|raw_provider/i,
    );
  });

  it("masks provider references and fail-closes recovery for a read-only actor", async () => {
    const auditService = new AuditNotificationService();
    const repository = {
      isEnabled: () => true,
      findMultiTaxiPaymentException: vi.fn(async () => ({
        paymentId: "payment-001",
        orderId: "ZX-240720-0186",
        tripId: "trip-001",
        providerPaymentRef: "pay_provider_secret_88f2",
        status: "failed",
        amountMinor: 35500,
        currency: "NTD",
        attemptCount: 3,
        availableActions: [
          {
            action: "retry_capture",
            enabled: true,
            riskLevel: "medium",
          },
        ],
        recoveryState: null,
        lastRecoveryAction: null,
        updatedAt: "2026-07-20T07:12:00.000Z",
      })),
      listMultiTaxiPaymentAuditTrail: vi.fn(async () => [
        {
          auditId: "audit-payment-001",
          actorId: "payment-provider",
          actorType: "system",
          actionName: "payment_capture_failed",
          requestId: "provider-request-003",
          createdAt: "2026-07-20T07:12:00.000Z",
        },
      ]),
    };
    const service = new BillingSettlementService(
      auditService,
      repository as never,
    );

    const view = await service.getMultiTaxiPaymentException(
      "ZX-240720-0186",
      platformIdentity,
      "req-payment-read-001",
    );

    expect(view.safeProviderReference).toBe("pay_...88f2");
    expect(JSON.stringify(view)).not.toContain("pay_provider_secret_88f2");
    expect(view.availableActions).toEqual([
      expect.objectContaining({
        action: "retry_capture",
        enabled: false,
        disabledReasonCode: "payment_recovery_write_authority_required",
      }),
    ]);
    expect(view.auditTimeline).toHaveLength(1);
    expect(auditService.getAuditLogsSnapshot()[0]).toMatchObject({
      actorId: "platform-finance-001",
      actionName: "read_multi_taxi_payment_exception",
      resourceId: "payment-001",
    });
  });

  it("keeps supported commands disabled when no provider port is provisioned", async () => {
    const repository = {
      isEnabled: () => true,
      findMultiTaxiPaymentException: vi.fn(async () => ({
        paymentId: "payment-001",
        orderId: "ZX-240720-0186",
        tripId: null,
        providerPaymentRef: "pay_provider_secret_88f2",
        status: "failed",
        amountMinor: 35500,
        currency: "NTD",
        attemptCount: 3,
        availableActions: [
          {
            action: "retry_capture",
            enabled: true,
            riskLevel: "medium",
          },
        ],
        recoveryState: null,
        lastRecoveryAction: null,
        updatedAt: "2026-07-20T07:12:00.000Z",
      })),
      listMultiTaxiPaymentAuditTrail: vi.fn(async () => []),
    };
    const service = new BillingSettlementService(
      new AuditNotificationService(),
      repository as never,
    );

    const view = await service.getMultiTaxiPaymentException(
      "ZX-240720-0186",
      platformWriteIdentity,
    );

    expect(view.availableActions).toEqual([
      expect.objectContaining({
        action: "retry_capture",
        enabled: false,
        disabledReasonCode: "payment_recovery_provider_not_provisioned",
      }),
    ]);
  });

  it("executes an enabled recovery through the port and durably records its receipt", async () => {
    const completeCommand = vi.fn(async () => undefined);
    const repository = {
      isEnabled: () => true,
      findMultiTaxiPaymentException: vi.fn(async () => ({
        paymentId: "payment-001",
        orderId: "ZX-240720-0186",
        tripId: null,
        providerPaymentRef: "pay_provider_secret_88f2",
        status: "failed",
        amountMinor: 35500,
        currency: "NTD",
        attemptCount: 3,
        availableActions: [
          {
            action: "retry_capture",
            enabled: true,
            riskLevel: "medium",
          },
        ],
        recoveryState: null,
        lastRecoveryAction: null,
        updatedAt: "2026-07-20T07:12:00.000Z",
      })),
      findMultiTaxiPaymentRecoveryCommand: vi.fn(async () => null),
      claimMultiTaxiPaymentRecoveryCommand: vi.fn(async (input) => ({
        claimed: true,
        command: {
          recoveryCommandId: input.recoveryCommandId,
          paymentId: input.paymentId,
          orderId: input.orderId,
          action: input.action,
          idempotencyKey: input.idempotencyKey,
          state: "processing",
          receipt: null,
          createdAt: "2026-07-24T00:00:00.000Z",
          updatedAt: "2026-07-24T00:00:00.000Z",
        },
      })),
      completeMultiTaxiPaymentRecoveryCommand: completeCommand,
      failMultiTaxiPaymentRecoveryCommand: vi.fn(async () => undefined),
    };
    const recover = vi.fn(async () => ({ status: "completed" as const }));
    const recoveryPort: PaymentRecoveryPort = {
      isAvailable: () => true,
      recover,
    };
    const service = new BillingSettlementService(
      new AuditNotificationService(),
      repository as never,
      undefined,
      recoveryPort,
    );

    const receipt = await service.executeMultiTaxiPaymentRecovery(
      "ZX-240720-0186",
      "retry-capture",
      undefined,
      platformWriteIdentity,
      {
        idempotencyKey: "idem-payment-001",
        requestId: "req-payment-write-001",
      },
    );

    expect(receipt).toMatchObject({
      actionId: "idem-payment-001",
      resourceType: "multi_taxi_payment_exception",
      resourceId: "payment-001",
      status: "completed",
    });
    expect(recover).toHaveBeenCalledWith(
      "retry_capture",
      expect.not.objectContaining({
        providerPaymentRef: expect.anything(),
        paymentMethodTokenRef: expect.anything(),
      }),
      expect.objectContaining({
        actorId: "platform-finance-001",
        idempotencyKey: "idem-payment-001",
      }),
    );
    expect(completeCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentId: "payment-001",
        action: "retry_capture",
        state: "completed",
        receipt,
      }),
    );
  });

  it("replays a durable receipt before current payment status gates", async () => {
    const durableReceipt = {
      actionId: "idem-payment-replay-001",
      auditId: "audit-payment-replay-001",
      resourceType: "multi_taxi_payment_exception",
      resourceId: "payment-001",
      status: "completed" as const,
      message: "Payment capture retry completed.",
    };
    const recover = vi.fn();
    const repository = {
      isEnabled: () => true,
      findMultiTaxiPaymentException: vi.fn(async () => ({
        paymentId: "payment-001",
        orderId: "ZX-240720-0186",
        tripId: null,
        providerPaymentRef: null,
        status: "captured",
        amountMinor: 35500,
        currency: "NTD",
        attemptCount: 4,
        availableActions: [
          {
            action: "retry_capture",
            enabled: true,
            riskLevel: "medium",
          },
        ],
        recoveryState: "completed",
        lastRecoveryAction: "retry_capture",
        updatedAt: "2026-07-24T00:00:00.000Z",
      })),
      findMultiTaxiPaymentRecoveryCommand: vi.fn(async () => ({
        recoveryCommandId: "ff25d453-d371-499c-a6cc-5f9cfa537acd",
        paymentId: "payment-001",
        orderId: "ZX-240720-0186",
        action: "retry_capture",
        idempotencyKey: "idem-payment-replay-001",
        state: "completed",
        receipt: durableReceipt,
        createdAt: "2026-07-24T00:00:00.000Z",
        updatedAt: "2026-07-24T00:00:01.000Z",
      })),
    };
    const service = new BillingSettlementService(
      new AuditNotificationService(),
      repository as never,
      undefined,
      {
        isAvailable: () => true,
        recover,
      },
    );

    await expect(
      service.executeMultiTaxiPaymentRecovery(
        "ZX-240720-0186",
        "retry_capture",
        undefined,
        platformWriteIdentity,
        { idempotencyKey: "idem-payment-replay-001" },
      ),
    ).resolves.toEqual(durableReceipt);
    expect(recover).not.toHaveBeenCalled();
  });

  it("requires idempotency and rejects arbitrary payment or mark-paid payloads", async () => {
    const repository = {
      isEnabled: () => true,
    };
    const service = new BillingSettlementService(
      new AuditNotificationService(),
      repository as never,
      undefined,
      {
        isAvailable: () => true,
        recover: vi.fn(),
      },
    );

    await expect(
      service.executeMultiTaxiPaymentRecovery(
        "ZX-240720-0186",
        "retry_capture",
        undefined,
        platformWriteIdentity,
        {},
      ),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.executeMultiTaxiPaymentRecovery(
        "ZX-240720-0186",
        "mark_paid",
        undefined,
        platformWriteIdentity,
        { idempotencyKey: "idem-payment-002" },
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      service.executeMultiTaxiPaymentRecovery(
        "ZX-240720-0186",
        "retry_capture",
        { paymentMethodTokenRef: "forbidden" },
        platformWriteIdentity,
        { idempotencyKey: "idem-payment-003" },
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("returns a wrapped controller response without exposing a write path", async () => {
    const view = {
      paymentId: "payment-001",
      orderId: "ZX-240720-0186",
      tripId: null,
      status: "manual_recovery",
      amount: null,
      safeProviderReference: null,
      attemptCount: 1,
      updatedAt: "2026-07-20T07:12:00.000Z",
      availableActions: [],
      auditTimeline: [],
    };
    const service = {
      getMultiTaxiPaymentException: vi.fn(async () => view),
    } as unknown as BillingSettlementService;
    const controller = new BillingSettlementController(service);

    const response = await controller.getMultiTaxiPaymentException(
      "ZX-240720-0186",
      platformIdentity,
      "req-payment-read-001",
    );

    expect(response.data).toEqual(view);
    expect(service.getMultiTaxiPaymentException).toHaveBeenCalledWith(
      "ZX-240720-0186",
      platformIdentity,
      "req-payment-read-001",
    );
  });

  it("rejects a platform actor without billing:read with 403", () => {
    const guard = new BootstrapAuthGuard(new Reflector());
    const request: AuthenticatedRequestLike = {
      headers: {
        "x-actor-type": "platform_admin",
        "x-actor-id": "platform-readonly-001",
        "x-realm": "platform",
        "x-roles": "platform_admin",
        "x-scopes": "foundation:read",
      },
      method: "GET",
      originalUrl: "/api/payment-exceptions/ZX-240720-0186",
    };

    expect(() => guard.canActivate(createExecutionContext(request))).toThrow(
      ApiRequestError,
    );
    try {
      guard.canActivate(createExecutionContext(request));
    } catch (error) {
      expect((error as ApiRequestError).getStatus()).toBe(403);
      expect((error as ApiRequestError).getResponse()).toMatchObject({
        error: { code: "AUTH_SCOPE_DENIED" },
      });
    }
  });

  it("rejects a payment recovery POST without platform billing:write", () => {
    const guard = new BootstrapAuthGuard(new Reflector());
    const request: AuthenticatedRequestLike = {
      headers: {
        "x-actor-type": "platform_admin",
        "x-actor-id": "platform-readonly-001",
        "x-realm": "platform",
        "x-roles": "platform_admin",
        "x-scopes": "billing:read",
      },
      method: "POST",
      originalUrl:
        "/api/payment-exceptions/ZX-240720-0186/actions/retry-capture",
    };

    expect(() =>
      guard.canActivate(
        createExecutionContext(request, "executeMultiTaxiPaymentRecovery"),
      ),
    ).toThrow(ApiRequestError);
  });

  it("fails closed when persistence is unavailable", async () => {
    const service = new BillingSettlementService(
      new AuditNotificationService(),
    );

    await expect(
      service.getMultiTaxiPaymentException("ZX-240720-0186", platformIdentity),
    ).rejects.toMatchObject({
      status: 503,
    });
  });
});
