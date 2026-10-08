import { describe, expect, it, vi } from "vitest";
import type { BootstrapRequestIdentity } from "../../src/common/auth";
import { ApiRequestError } from "../../src/common/api-envelope";
import { BillingSettlementController } from "../../src/modules/billing-settlement/billing-settlement.controller";
import type { BillingSettlementService } from "../../src/modules/billing-settlement/billing-settlement.service";
import { OwnedMobilityController } from "../../src/modules/owned-mobility/owned-mobility.controller";
import type { OwnedMobilityService } from "../../src/modules/owned-mobility/owned-mobility.service";
import { TenantPartnerController } from "../../src/modules/tenant-partner/tenant-partner.controller";
import type { TenantPartnerService } from "../../src/modules/tenant-partner/tenant-partner.service";

const tenant = {
  realm: "tenant",
  tenantId: "tenant-a",
} as BootstrapRequestIdentity;
const command = { actorId: "actor", summary: "Mismatch", openedBy: "actor" };
const requestId = "req-async-response";

// Services are the mock boundary in this sweep. Each case calls the real
// controller method, including tenant checks and response envelope construction.
const cases = [
  ...[
    "createReconciliationIssue",
    "assignReconciliationIssue",
    "addReconciliationIssueComment",
    "resolveReconciliationIssue",
    "reopenReconciliationIssue",
  ].map((method) => ({
    method,
    create: (serviceCall: ReturnType<typeof vi.fn>, identity = tenant) => {
      const service = {
        [method]: serviceCall,
        listReconciliationIssues: () => [
          { issueId: "issue-a", tenantId: "tenant-a" },
        ],
      } as unknown as BillingSettlementService;
      const controller = new BillingSettlementController(service);
      const args =
        method === "createReconciliationIssue"
          ? [{ ...command }, identity, requestId]
          : ["issue-a", command, identity, requestId];
      return () => (controller as any)[method](...args);
    },
  })),
  ...["resolveExceptionHold", "approveExceptionOverride"].map((method) => ({
    method,
    create: (serviceCall: ReturnType<typeof vi.fn>) => {
      const controller = new OwnedMobilityController(
        { [method]: serviceCall } as unknown as OwnedMobilityService,
        undefined as never,
      );
      return () =>
        (controller as any)[method]("order-a", command, tenant, requestId);
    },
  })),
  {
    method: "retryWebhookDelivery",
    create: (serviceCall: ReturnType<typeof vi.fn>) => {
      const controller = new TenantPartnerController(
        {
          retryWebhookDelivery: serviceCall,
        } as unknown as TenantPartnerService,
        undefined as never,
        undefined as never,
        undefined as never,
        undefined as never,
      );
      return () =>
        controller.retryWebhookDelivery(
          "webhook-a",
          "delivery-a",
          tenant,
          "tenant-a",
          requestId,
        );
    },
  },
];

describe.each(cases)("$method asynchronous response", ({ create }) => {
  it("waits for the service and serializes its actual result", async () => {
    let release!: (data: unknown) => void;
    const pending = new Promise((resolve) => {
      release = resolve;
    });
    const serviceCall = vi.fn(() => pending);
    const invoke = create(serviceCall);
    let finished = false;
    const response = Promise.resolve(invoke()).then((value) => {
      finished = true;
      return value;
    });
    await Promise.resolve();
    await Promise.resolve();
    const finishedEarly = finished;
    const record = { id: "saved-record", status: "completed" };
    release(record);
    const envelope = await response;
    expect(finishedEarly).toBe(false);
    expect(JSON.parse(JSON.stringify(envelope))).toMatchObject({
      data: record,
      meta: { requestId },
    });
    expect(serviceCall).toHaveBeenCalledOnce();
    expect(serviceCall.mock.calls[0]).toContain(requestId);
  });

  it("propagates a rejected service Promise to the request caller", async () => {
    const failure = new ApiRequestError(503, "UNAVAILABLE", "Retry later");
    const invoke = create(
      vi.fn(async () => {
        await Promise.resolve();
        throw failure;
      }),
    );
    await expect(invoke()).rejects.toBe(failure);
  });
});

describe("reconciliation tenant boundaries", () => {
  it.each(cases.slice(0, 5))(
    "$method still denies a missing tenant scope before calling the service",
    async ({ create }) => {
      const serviceCall = vi.fn();
      const invoke = create(serviceCall, {
        realm: "tenant",
        tenantId: null,
      } as BootstrapRequestIdentity);
      await expect(invoke()).rejects.toMatchObject({
        code: "TENANT_SCOPE_REQUIRED",
      });
      expect(serviceCall).not.toHaveBeenCalled();
    },
  );
  it.each(cases.slice(1, 5))(
    "$method still denies another tenant's issue",
    async ({ create }) => {
      const serviceCall = vi.fn();
      const invoke = create(serviceCall, { ...tenant, tenantId: "tenant-b" });
      await expect(invoke()).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(serviceCall).not.toHaveBeenCalled();
    },
  );
});
