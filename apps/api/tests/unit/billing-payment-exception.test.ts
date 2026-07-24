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

function createExecutionContext(request: AuthenticatedRequestLike) {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: () =>
      BillingSettlementController.prototype.getMultiTaxiPaymentException,
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

  it("masks provider references and fail-closes recovery commands", async () => {
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
        disabledReasonCode: "payment_recovery_command_pending",
      }),
    ]);
    expect(view.auditTimeline).toHaveLength(1);
    expect(auditService.getAuditLogsSnapshot()[0]).toMatchObject({
      actorId: "platform-finance-001",
      actionName: "read_multi_taxi_payment_exception",
      resourceId: "payment-001",
    });
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
