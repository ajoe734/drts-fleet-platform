import { describe, expect, it, vi } from "vitest";

import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { TenantPartnerController } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.controller";
import { TenantPartnerRepository } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.repository";
import { TenantPartnerService } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.service";

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
