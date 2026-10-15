import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { DatabaseService } from "../../../apps/api/src/common/db";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { TenantPartnerRepository } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.repository";
import { TenantPartnerService } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.service";

// The existing mandatory unit CI job migrates the official schema and supplies
// this disposable database. Never connect to PostgreSQL on the worker VM.
const hosted =
  process.env.GITHUB_ACTIONS === "true" && Boolean(process.env.DATABASE_URL);
describe.skipIf(!hosted)(
  "C028 official-schema PostgreSQL transaction boundary (hosted only)",
  () => {
    it("rolls back a partial reorder, recovers a lost COMMIT ACK, and reconstructs canonical state", async () => {
      const tenantId = `tenant-durable-pg-${randomUUID()}`;
      const database = new DatabaseService();
      const repository = new TenantPartnerRepository(database);
      const audit = new AuditNotificationService();
      const service = new TenantPartnerService(audit, repository);
      const originalConnect = database.connect.bind(database);
      let rejectSecondRule = false;
      let loseCommitAck = false;
      vi.spyOn(database, "connect").mockImplementation(async () => {
        const client = await originalConnect();
        const query = client.query.bind(client);
        let ruleWrites = 0;
        // Only the failure/ACK boundary is injected; every accepted SQL statement
        // and BEGIN/COMMIT/ROLLBACK uses the actual pg client and official schema.
        return new Proxy(client, {
          get(target, key) {
            if (key === "query")
              return async (sql: string, values?: unknown[]) => {
                if (
                  sql.includes(
                    "INSERT INTO core.phase1_tenant_approval_rules",
                  ) &&
                  ++ruleWrites === 2 &&
                  rejectSecondRule
                ) {
                  rejectSecondRule = false;
                  throw new Error("injected second rule rejection");
                }
                const result = await query(sql, values);
                if (sql === "COMMIT" && loseCommitAck) {
                  loseCommitAck = false;
                  throw new Error("injected lost COMMIT ACK");
                }
                return result;
              };
            const value = Reflect.get(target, key);
            return typeof value === "function" ? value.bind(target) : value;
          },
        });
      });
      try {
        const rule = {
          ruleName: "PG rule",
          priority: 10,
          conditions: [],
          action: "warn" as const,
        };
        const first = await service.upsertApprovalRule(
          tenantId,
          rule,
          "pg-first",
        );
        const second = await service.upsertApprovalRule(
          tenantId,
          { ...rule, priority: 20 },
          "pg-second",
        );
        const before = service.listApprovalRules(tenantId);
        rejectSecondRule = true;
        await expect(
          service.reorderApprovalRules(tenantId, {
            orderedRuleIds: [second.ruleId, first.ruleId],
          }),
        ).rejects.toThrow("second rule rejection");
        expect(service.listApprovalRules(tenantId)).toEqual(before);
        expect(
          (await repository.loadState()).approvalRules
            .filter((item) => item.tenantId === tenantId)
            .sort((a, b) => a.priority - b.priority),
        ).toEqual(before);
        loseCommitAck = true;
        await expect(
          service.reorderApprovalRules(tenantId, {
            orderedRuleIds: [second.ruleId, first.ruleId],
          }),
        ).rejects.toThrow("lost COMMIT ACK");
        expect(
          service.listApprovalRules(tenantId).map((item) => item.ruleId),
        ).toEqual([second.ruleId, first.ruleId]);
        await service.reorderApprovalRules(tenantId, {
          orderedRuleIds: [second.ruleId, first.ruleId],
        });
        await service.upsertTenantQuotaPolicy(tenantId, {
          period: "monthly",
          limit: {
            bookingCountLimit: 2,
            amountMinorLimit: null,
            currency: "TWD",
            enforcementMode: "hard_block",
          },
        });
        await service.updateSlaProfile(tenantId, { waitThresholdMin: 19 });
        const canonical = await repository.loadState();
        expect(
          canonical.quotaPolicies.find((item) => item.tenantId === tenantId)
            ?.limit.bookingCountLimit,
        ).toBe(2);
        expect(
          canonical.slaProfiles.find((item) => item.tenantId === tenantId)
            ?.waitThresholdMin,
        ).toBe(19);
        const freshRepository = new TenantPartnerRepository(database);
        const originalLoad = freshRepository.loadState.bind(freshRepository);
        vi.spyOn(freshRepository, "loadState").mockImplementation(async () => {
          const state = await originalLoad();
          // Restrict this fixture's boot scheduling to its own namespace while
          // keeping the full production repository read and hydration contract.
          for (const key of Object.keys(state) as Array<keyof typeof state>) {
            (state[key] as Array<{ tenantId?: string }>).splice(
              0,
              state[key].length,
              ...(state[key] as Array<{ tenantId?: string }>).filter(
                (item) => item.tenantId === tenantId,
              ),
            );
          }
          return state;
        });
        const restarted = new TenantPartnerService(
          new AuditNotificationService(),
          freshRepository,
        );
        try {
          await restarted.onModuleInit();
          expect(restarted.listApprovalRules(tenantId)).toEqual(
            service.listApprovalRules(tenantId),
          );
          expect(restarted.getSlaProfile(tenantId)).toEqual(
            service.getSlaProfile(tenantId),
          );
        } finally {
          restarted.onModuleDestroy();
        }
      } finally {
        service.onModuleDestroy();
        await repository.persistChanges({ deletedTenantIds: [tenantId] });
        await database.onModuleDestroy();
        vi.restoreAllMocks();
      }
    });
  },
);
