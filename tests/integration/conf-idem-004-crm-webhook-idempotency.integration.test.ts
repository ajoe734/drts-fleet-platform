import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  CreateCallCenterOrderCommand,
  CreateComplaintCaseCommand,
  SendTestWebhookCommand,
} from "@drts/contracts";
import { IDEMPOTENCY_REPLAY_HEADER } from "@drts/contracts";

import { JwtAuthService } from "../../apps/api/src/common/auth/jwt-auth.service";
import {
  IdempotencyRepository,
  IdempotencyService,
} from "../../apps/api/src/common/idempotency";
import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { ComplaintController } from "../../apps/api/src/modules/complaint/complaint.controller";
import { ComplaintService } from "../../apps/api/src/modules/complaint/complaint.service";
import { OwnedMobilityController } from "../../apps/api/src/modules/owned-mobility/owned-mobility.controller";
import type { OwnedMobilityService } from "../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { TenantPartnerController } from "../../apps/api/src/modules/tenant-partner/tenant-partner.controller";
import type { TenantPartnerService } from "../../apps/api/src/modules/tenant-partner/tenant-partner.service";

function fakeResponse() {
  const headers: Record<string, string> = {};
  let statusCode = 0;
  return {
    response: {
      status(code: number) {
        statusCode = code;
        return this;
      },
      setHeader(name: string, value: string) {
        headers[name] = value;
        return this;
      },
    },
    getStatus: () => statusCode,
    getHeaders: () => headers,
  };
}

function getErrorCode(error: unknown) {
  return (
    (
      error as {
        getResponse?: () => { error?: { code?: string } };
      }
    ).getResponse?.().error?.code ?? null
  );
}

async function expectThrows(fn: () => unknown) {
  try {
    await fn();
  } catch (error) {
    return error;
  }
  throw new Error("expected function to throw");
}

describe("CONF-IDEM-004: CRM & webhook command idempotency", () => {
  describe("Complaint case creation (POST /complaints)", () => {
    let complaintService: ComplaintService;
    let controller: ComplaintController;
    const baseCommand: CreateComplaintCaseCommand = {
      caseSource: "web",
      category: "fare_dispute",
      severity: "normal",
      description: "乘客認為費用不正確",
    };

    beforeEach(() => {
      const auditService = new AuditNotificationService();
      complaintService = new ComplaintService(auditService);
      const idempotencyService = new IdempotencyService(
        new IdempotencyRepository(),
      );
      controller = new ComplaintController(
        complaintService,
        {} as never,
        idempotencyService,
      );
    });

    it("rejects a missing Idempotency-Key with IDEMPOTENCY_KEY_REQUIRED", async () => {
      const { response } = fakeResponse();
      const error = await expectThrows(() =>
        controller.createComplaintCase(baseCommand, response, undefined, "req-1"),
      );
      expect(getErrorCode(error)).toBe("IDEMPOTENCY_KEY_REQUIRED");
      expect(complaintService.listComplaintCases()).toHaveLength(0);
    });

    it("one retry with the same key and payload yields exactly one case_no and one SLA timer", async () => {
      const { response: response1 } = fakeResponse();
      const first = await controller.createComplaintCase(
        baseCommand,
        response1,
        "complaint-key-001",
        "req-1",
      );

      const { response: response2, getHeaders } = fakeResponse();
      const second = await controller.createComplaintCase(
        baseCommand,
        response2,
        "complaint-key-001",
        "req-2",
      );

      expect(first.data.caseNo).toBe(second.data.caseNo);
      expect(getHeaders()[IDEMPOTENCY_REPLAY_HEADER]).toBe("true");

      const cases = complaintService.listComplaintCases();
      expect(cases).toHaveLength(1);
      expect(
        complaintService.getComplaintTimeline(cases[0]!.caseNo),
      ).toHaveLength(1);
    });

    it("returns conflict when the same key is reused with a different payload", async () => {
      const { response: response1 } = fakeResponse();
      await controller.createComplaintCase(
        baseCommand,
        response1,
        "complaint-key-002",
        "req-1",
      );

      const { response: response2 } = fakeResponse();
      const error = await expectThrows(() =>
        controller.createComplaintCase(
          { ...baseCommand, description: "different description" },
          response2,
          "complaint-key-002",
          "req-2",
        ),
      );
      expect(getErrorCode(error)).toBe("IDEMPOTENCY_KEY_REUSED");
      expect(complaintService.listComplaintCases()).toHaveLength(1);
    });
  });

  describe("Call-center order creation (POST /call-center/orders)", () => {
    let createCallCenterOrder: ReturnType<typeof vi.fn>;
    let controller: OwnedMobilityController;
    const baseCommand: CreateCallCenterOrderCommand = {
      callId: "CALL-20260410-000120",
      agentId: "agent-001",
      pickup: { address: "台北市中正區忠孝東路一段1號" },
      dropoff: { address: "台北市信義區信義路五段7號" },
      passenger: { name: "Alice", phone: "0912345678" },
    };

    beforeEach(() => {
      createCallCenterOrder = vi.fn(() => ({
        orderId: "order-001",
        orderSource: "phone",
        callId: baseCommand.callId,
        recordingId: null,
        status: "ready_for_dispatch",
      }));
      const ownedMobilityService = {
        createCallCenterOrder,
      } as unknown as OwnedMobilityService;
      const idempotencyService = new IdempotencyService(
        new IdempotencyRepository(),
      );
      controller = new OwnedMobilityController(
        ownedMobilityService,
        idempotencyService,
      );
    });

    it("rejects a missing Idempotency-Key with IDEMPOTENCY_KEY_REQUIRED", async () => {
      const { response } = fakeResponse();
      const error = await expectThrows(() =>
        controller.createCallCenterOrder(baseCommand, response, undefined, "req-1"),
      );
      expect(getErrorCode(error)).toBe("IDEMPOTENCY_KEY_REQUIRED");
      expect(createCallCenterOrder).not.toHaveBeenCalled();
    });

    it("replays the stored response without re-running the full orchestration on retry", async () => {
      const { response: response1 } = fakeResponse();
      const first = await controller.createCallCenterOrder(
        baseCommand,
        response1,
        "callcenter-key-001",
        "req-1",
      );

      const { response: response2, getHeaders } = fakeResponse();
      const second = await controller.createCallCenterOrder(
        baseCommand,
        response2,
        "callcenter-key-001",
        "req-2",
      );

      // The orchestration call (order creation + call-session link, in one
      // synchronous service call) only runs once — not just the Order
      // Service half of it.
      expect(createCallCenterOrder).toHaveBeenCalledTimes(1);
      expect(second.data).toEqual(first.data);
      expect(getHeaders()[IDEMPOTENCY_REPLAY_HEADER]).toBe("true");
    });

    it("returns conflict when the same key is reused with a different payload", async () => {
      const { response: response1 } = fakeResponse();
      await controller.createCallCenterOrder(
        baseCommand,
        response1,
        "callcenter-key-002",
        "req-1",
      );

      const { response: response2 } = fakeResponse();
      const error = await expectThrows(() =>
        controller.createCallCenterOrder(
          { ...baseCommand, agentId: "agent-002" },
          response2,
          "callcenter-key-002",
          "req-2",
        ),
      );
      expect(getErrorCode(error)).toBe("IDEMPOTENCY_KEY_REUSED");
      expect(createCallCenterOrder).toHaveBeenCalledTimes(1);
    });
  });

  describe("Tenant webhook test delivery (POST /tenant/webhooks/test)", () => {
    let sendTestWebhook: ReturnType<typeof vi.fn>;
    let controller: TenantPartnerController;
    const command: SendTestWebhookCommand = { webhookId: "wh-001" };

    beforeEach(() => {
      sendTestWebhook = vi.fn(async () => ({
        deliveryId: "delivery-001",
        httpStatus: 200,
        attempt: 1,
        nextAttemptAt: null,
      }));
      const tenantPartnerService = {
        sendTestWebhook,
      } as unknown as TenantPartnerService;
      const idempotencyService = new IdempotencyService(
        new IdempotencyRepository(),
      );
      controller = new TenantPartnerController(
        tenantPartnerService,
        {} as never,
        {} as never,
        new JwtAuthService(),
        idempotencyService,
      );
    });

    it("rejects a missing Idempotency-Key with IDEMPOTENCY_KEY_REQUIRED", async () => {
      const { response } = fakeResponse();
      const error = await expectThrows(() =>
        controller.sendTestWebhook(
          command,
          response,
          "tenant-alpha",
          undefined,
          "req-1",
        ),
      );
      expect(getErrorCode(error)).toBe("IDEMPOTENCY_KEY_REQUIRED");
      expect(sendTestWebhook).not.toHaveBeenCalled();
    });

    it("replays the stored response and creates no second delivery on retry", async () => {
      const { response: response1 } = fakeResponse();
      const first = await controller.sendTestWebhook(
        command,
        response1,
        "tenant-alpha",
        "webhook-key-001",
        "req-1",
      );

      const { response: response2, getHeaders } = fakeResponse();
      const second = await controller.sendTestWebhook(
        command,
        response2,
        "tenant-alpha",
        "webhook-key-001",
        "req-2",
      );

      expect(sendTestWebhook).toHaveBeenCalledTimes(1);
      expect(second.data).toEqual(first.data);
      expect(getHeaders()[IDEMPOTENCY_REPLAY_HEADER]).toBe("true");
    });

    it("returns conflict when the same key is reused with a different payload", async () => {
      const { response: response1 } = fakeResponse();
      await controller.sendTestWebhook(
        command,
        response1,
        "tenant-alpha",
        "webhook-key-002",
        "req-1",
      );

      const { response: response2 } = fakeResponse();
      const error = await expectThrows(() =>
        controller.sendTestWebhook(
          { webhookId: "wh-002" },
          response2,
          "tenant-alpha",
          "webhook-key-002",
          "req-2",
        ),
      );
      expect(getErrorCode(error)).toBe("IDEMPOTENCY_KEY_REUSED");
      expect(sendTestWebhook).toHaveBeenCalledTimes(1);
    });

    it("scopes idempotency keys per tenant so different tenants do not collide", async () => {
      const { response: response1 } = fakeResponse();
      await controller.sendTestWebhook(
        command,
        response1,
        "tenant-alpha",
        "shared-key",
        "req-1",
      );

      const { response: response2 } = fakeResponse();
      await controller.sendTestWebhook(
        command,
        response2,
        "tenant-beta",
        "shared-key",
        "req-2",
      );

      expect(sendTestWebhook).toHaveBeenCalledTimes(2);
    });
  });
});
