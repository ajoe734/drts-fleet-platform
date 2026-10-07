import type { ArgumentsHost } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { PublishDriverFeePlanCommand } from "@drts/contracts";
import { ApiRequestError } from "../../src/common/api-envelope";
import { SnakeCaseExceptionFilter } from "../../src/common/snake-case.exception-filter";
import { deepToSnakeCase } from "../../src/common/snake-case.interceptor";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { BillingSettlementController } from "../../src/modules/billing-settlement/billing-settlement.controller";
import type { BillingSettlementRepository } from "../../src/modules/billing-settlement/billing-settlement.repository";
import { BillingSettlementService } from "../../src/modules/billing-settlement/billing-settlement.service";

const command: PublishDriverFeePlanCommand = {
  planName: "Controller regression plan",
  version: "v1",
  serviceFeeBps: 1250,
  reimbursementMode: "platform_funded",
};

function createController(persistChanges = vi.fn(async () => {})) {
  const audit = new AuditNotificationService();
  // Only the persistence boundary is mocked; controller, service, audit and
  // exception serialization all use the production implementations.
  const repository = { persistChanges } as unknown as BillingSettlementRepository;
  const service = new BillingSettlementService(audit, repository);
  return { controller: new BillingSettlementController(service), audit };
}

function serializeError(error: unknown) {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  new SnakeCaseExceptionFilter().catch(error, {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost);
  return { status: status.mock.calls[0]?.[0], body: json.mock.calls[0]?.[0] };
}

describe("BillingSettlementController.publishDriverFeePlan", () => {
  it("returns the published plan and request metadata as serializable data", async () => {
    const { controller, audit } = createController();
    const result = await controller.publishDriverFeePlan(command, null, "req-plan");

    expect(JSON.parse(JSON.stringify(deepToSnakeCase(result)))).toMatchObject({
      data: {
        fee_plan_id: expect.stringMatching(/^fee-plan-/),
        plan_name: command.planName,
        version: command.version,
        service_fee_bps: command.serviceFeeBps,
        reimbursement_mode: command.reimbursementMode,
        status: "published",
        published_at: expect.any(String),
      },
      meta: { request_id: "req-plan", timestamp: expect.any(String) },
    });
    expect(audit.listAuditLogs()[0]).toMatchObject({
      actionName: "publish_driver_fee_plan",
      resourceId: result.data.feePlanId,
    });
  });

  it("does not report success before persistence completes", async () => {
    let release!: () => void;
    const persisted = new Promise<void>((resolve) => { release = resolve; });
    const { controller } = createController(vi.fn(() => persisted));
    let completed = false;
    const response = Promise.resolve(controller.publishDriverFeePlan(command)).then(
      (result) => { completed = true; return result; },
    );
    await Promise.resolve();
    await Promise.resolve();
    const completedBeforePersistence = completed;
    release();
    await response;
    expect(completedBeforePersistence).toBe(false);
    expect(completed).toBe(true);
  });

  it("propagates validation errors as HTTP 400 error envelopes", async () => {
    const { controller } = createController();
    const error = await controller.publishDriverFeePlan({ ...command, planName: " " })
      .then(() => undefined, (error: unknown) => error);
    expect(serializeError(error)).toMatchObject({
      status: 400,
      body: { error: { code: "VALIDATION_ERROR", details: { field: "planName" } } },
    });
  });

  it("propagates immutable-version conflicts as HTTP 409", async () => {
    const { controller } = createController();
    await controller.publishDriverFeePlan(command);
    const error = await controller.publishDriverFeePlan(command)
      .then(() => undefined, (error: unknown) => error);
    expect(serializeError(error)).toMatchObject({
      status: 409,
      body: { error: { code: "FEE_PLAN_IMMUTABLE", details: { plan_name: command.planName } } },
    });
  });

  it.each([
    [new ApiRequestError(503, "PERSISTENCE_UNAVAILABLE", "Try again", undefined, true), 503, "PERSISTENCE_UNAVAILABLE"],
    [new Error("private database failure"), 500, "INTERNAL_SERVER_ERROR"],
  ])("propagates asynchronous persistence failure %# through the HTTP filter", async (failure, status, code) => {
    const { controller, audit } = createController(vi.fn(async () => {
      await Promise.resolve();
      throw failure;
    }));
    const error = await controller.publishDriverFeePlan(command)
      .then(() => undefined, (error: unknown) => error);
    expect(error).toBe(failure);
    const response = serializeError(error);
    expect(response).toMatchObject({ status, body: { error: { code } } });
    expect(JSON.stringify(response)).not.toContain("private database failure");
    expect(audit.listAuditLogs()).toHaveLength(0);
  });
});
