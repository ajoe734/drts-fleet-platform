import { describe, expect, it, vi } from "vitest";

import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { TenantPartnerController } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.controller";
import { TenantPartnerRepository } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.repository";
import { TenantPartnerService } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import { persistenceHarness } from "./persistence-harness";

const tenantId = "tenant-durable-test";
const quota = {
  period: "monthly" as const,
  limit: {
    bookingCountLimit: 7,
    amountMinorLimit: null,
    currency: "TWD",
    enforcementMode: "hard_block" as const,
  },
};
const rule = {
  ruleName: "Durable approval",
  priority: 10,
  action: "allow" as const,
  conditions: [],
};

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

// Only the SQL connection is doubled. The service, controller, production SQL
// and repository ACK propagation execute unchanged; this is not a PG claim.
function harness() {
  const gate = deferred();
  let enabled = false;
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("INSERT INTO")) await gate.promise;
    return { rows: [], rowCount: 0 };
  });
  const client = { query, release: vi.fn() };
  const database = {
    isEnabled: () => enabled,
    query,
    connect: async () => client,
  };
  const repository = new TenantPartnerRepository(database as never);
  const audit = new AuditNotificationService();
  const auditSpy = vi.spyOn(audit, "recordAuditLog");
  const service = new TenantPartnerService(audit, repository);
  const controller = new TenantPartnerController(
    service,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return {
    gate,
    query,
    auditSpy,
    service,
    controller,
    enable: () => {
      enabled = true;
    },
  };
}

describe("C028 production command ACK", () => {
  it("rule update, reorder and disable hold the old order/version until ACK, reject coherently and retry", async () => {
    const p = persistenceHarness();
    const service = new TenantPartnerService(
      new AuditNotificationService(),
      p.repository,
    );
    const controller = new TenantPartnerController(
      service,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    try {
      const first = await service.upsertApprovalRule(tenantId, rule);
      const second = await service.upsertApprovalRule(tenantId, {
        ...rule,
        ruleName: "Second rule",
        priority: 20,
      });
      const version = () =>
        service.evaluateApprovalRules(tenantId, {
          subject: {
            subjectType: "booking",
            bookingId: "version-probe",
            operation: "dry_run",
          },
          inputSnapshot: {
            amountMinor: 100,
            currency: "TWD",
            reservationWindowStart: "2026-10-15T12:00:00Z",
          },
        } as never).auditSummary!.ruleVersionSnapshot;
      for (const kind of ["update", "reorder", "disable"] as const) {
        const before = service.listApprovalRules(tenantId);
        const oldVersion = version();
        const auditSpy = vi.spyOn(
          service["auditNotificationService"],
          "recordAuditLog",
        );
        auditSpy.mockClear();
        const command = () =>
          kind === "update"
            ? controller.updateApprovalRule(
                first.ruleId,
                { ...rule, ruleName: "Updated" },
                tenantId,
              )
            : kind === "reorder"
              ? controller.reorderApprovalRules(
                  { orderedRuleIds: [second.ruleId, first.ruleId] },
                  tenantId,
                )
              : controller.disableApprovalRule(first.ruleId, tenantId);
        p.failInsert(kind === "reorder" ? 2 : 1);
        await expect(command()).rejects.toThrow("SQL rejected");
        expect(service.listApprovalRules(tenantId)).toEqual(before);
        expect(version()).toBe(oldVersion);
        // evaluateApprovalRules emits its own audit; command success is absent.
        expect(
          auditSpy.mock.calls.some(([event]) =>
            /updated|reordered|disabled/.test(event.actionName),
          ),
        ).toBe(false);
        let release!: () => void;
        p.holdCommit(
          () =>
            new Promise<void>((resolve) => {
              release = resolve;
            }),
        );
        const pending = command();
        await new Promise((resolve) => setImmediate(resolve));
        expect(service.listApprovalRules(tenantId)).toEqual(before);
        expect(version()).toBe(oldVersion);
        release();
        await pending;
        p.holdCommit();
        const canonical = await p.repository.loadState();
        expect(
          canonical.approvalRules.sort((a, b) => a.priority - b.priority),
        ).toEqual(service.listApprovalRules(tenantId));
      }
    } finally {
      service.onModuleDestroy();
    }
  });

  it("lost COMMIT ACK reconciles committed rule/quota/SLA state and normal same-request create retry converges", async () => {
    const p = persistenceHarness();
    const audit = new AuditNotificationService();
    const service = new TenantPartnerService(audit, p.repository);
    try {
      p.loseCommitAck();
      await expect(
        service.upsertApprovalRule(tenantId, rule, "same-create-request"),
      ).rejects.toThrow("COMMIT ACK lost");
      const original = service.listApprovalRules(tenantId)[0]!;
      expect(original).toBeTruthy();
      const retried = await service.upsertApprovalRule(
        tenantId,
        rule,
        "same-create-request",
      );
      expect(retried.ruleId).toBe(original.ruleId);
      expect(service.listApprovalRules(tenantId)).toHaveLength(1);
      p.loseCommitAck();
      await expect(
        service.upsertTenantQuotaPolicy(tenantId, quota),
      ).rejects.toThrow("COMMIT ACK lost");
      expect(
        service.listQuotaPolicies(tenantId)[0]?.limit.bookingCountLimit,
      ).toBe(7);
      p.loseCommitAck();
      await expect(
        service.updateSlaProfile(tenantId, { waitThresholdMin: 29 }),
      ).rejects.toThrow("COMMIT ACK lost");
      expect(service.getSlaProfile(tenantId).waitThresholdMin).toBe(29);
      const restarted = new TenantPartnerService(
        new AuditNotificationService(),
        p.repository,
      );
      try {
        await restarted.onModuleInit();
        expect(restarted.listApprovalRules(tenantId)).toEqual(
          service.listApprovalRules(tenantId),
        );
        expect(restarted.listQuotaPolicies(tenantId)).toEqual(
          service.listQuotaPolicies(tenantId),
        );
        expect(restarted.getSlaProfile(tenantId)).toEqual(
          service.getSlaProfile(tenantId),
        );
      } finally {
        restarted.onModuleDestroy();
      }
    } finally {
      service.onModuleDestroy();
    }
  });

  it.each(["quota", "rule", "sla"] as const)(
    "%s controller holds success/cache/audit until the repository ACK",
    async (kind) => {
      const h = harness();
      const before = kind === "sla" ? h.service.getSlaProfile(tenantId) : null;
      h.enable();
      const pending =
        kind === "quota"
          ? h.controller.upsertTenantQuotaPolicy(
              quota,
              tenantId,
              "quota-request",
            )
          : kind === "rule"
            ? h.controller.upsertApprovalRule(rule, tenantId, "rule-request")
            : h.controller.updateSlaProfile(
                { waitThresholdMin: 29 },
                null,
                tenantId,
              );
      let settled = false;
      void Promise.resolve(pending).then(() => {
        settled = true;
      });
      await new Promise((resolve) => setImmediate(resolve));
      expect(settled).toBe(false);
      expect(h.auditSpy).not.toHaveBeenCalled();
      if (kind === "quota")
        expect(h.service.listQuotaPolicies(tenantId)).toEqual([]);
      if (kind === "rule")
        expect(h.service.listApprovalRules(tenantId)).toEqual([]);
      if (kind === "sla")
        expect(h.service.getSlaProfile(tenantId)).toEqual(before);
      h.gate.resolve();
      const result = await pending;
      expect(result.data).not.toBeInstanceOf(Promise);
      expect(h.auditSpy).toHaveBeenCalledOnce();
    },
  );

  it.each(["quota", "rule", "sla"] as const)(
    "%s rejects a failed durable write without publishing success",
    async (kind) => {
      const h = harness();
      const before = h.service.getSlaProfile(tenantId);
      h.enable();
      const pending =
        kind === "quota"
          ? h.controller.upsertTenantQuotaPolicy(quota, tenantId)
          : kind === "rule"
            ? h.controller.upsertApprovalRule(rule, tenantId)
            : h.controller.updateSlaProfile(
                { waitThresholdMin: 29 },
                null,
                tenantId,
              );
      const assertion = expect(Promise.resolve(pending)).rejects.toThrow(
        "write rejected",
      );
      h.gate.reject(new Error("write rejected"));
      await assertion;
      expect(h.auditSpy).not.toHaveBeenCalled();
      expect(h.service.listQuotaPolicies(tenantId)).toEqual([]);
      expect(h.service.listApprovalRules(tenantId)).toEqual([]);
      expect(h.service.getSlaProfile(tenantId)).toEqual(before);
    },
  );
});
