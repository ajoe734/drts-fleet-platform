import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { DatabaseService } from "../../../apps/api/src/common/db";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { TenantPartnerRepository } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.repository";
import { TenantPartnerService } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import { WebhookDispatchService } from "../../../apps/api/src/modules/tenant-partner/webhook-dispatch.service";

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

    it("durably deletes a webhook endpoint in PostgreSQL without restart or in-flight resurrection while preserving sibling/cross-tenant state and delivery history", async () => {
      const tenantId = `tenant-webhook-delete-pg-${randomUUID()}`;
      const otherTenantId = `tenant-webhook-delete-pg-other-${randomUUID()}`;
      const database = new DatabaseService();
      const repository = new TenantPartnerRepository(database);
      const fetcherA = vi.fn<
        (
          url: string,
          init?: RequestInit,
        ) => Promise<{ ok: boolean; status: number }>
      >(async () => ({
        ok: true,
        status: 204,
      }));
      const fetcherB = vi.fn<
        (
          url: string,
          init?: RequestInit,
        ) => Promise<{ ok: boolean; status: number }>
      >(async () => ({
        ok: true,
        status: 204,
      }));
      const auditA = new AuditNotificationService();
      const service = new TenantPartnerService(
        auditA,
        repository,
        new WebhookDispatchService(fetcherA),
        [],
      );
      const originalConnect = database.connect.bind(database);
      let rejectDeleteSql = false;
      let loseDeleteCommitAck = false;
      vi.spyOn(database, "connect").mockImplementation(async () => {
        const client = await originalConnect();
        const query = client.query.bind(client);
        let sawDeleteInTx = false;
        return new Proxy(client, {
          get(target, key) {
            if (key === "query")
              return async (sql: string, values?: unknown[]) => {
                if (sql === "BEGIN") {
                  sawDeleteInTx = false;
                }
                if (
                  sql.includes(
                    "DELETE FROM admin.phase1_tenant_webhook_endpoints",
                  )
                ) {
                  sawDeleteInTx = true;
                  if (rejectDeleteSql) {
                    rejectDeleteSql = false;
                    throw new Error("injected webhook delete SQL rejection");
                  }
                }
                const result = await query(sql, values);
                if (sql === "COMMIT" && sawDeleteInTx && loseDeleteCommitAck) {
                  loseDeleteCommitAck = false;
                  throw new Error("injected lost webhook delete COMMIT ACK");
                }
                return result;
              };
            const value = Reflect.get(target, key);
            return typeof value === "function" ? value.bind(target) : value;
          },
        });
      });

      const scopedRepositoryFor = (tenants: readonly string[]) => {
        const scoped = new TenantPartnerRepository(database);
        const originalLoad = scoped.loadState.bind(scoped);
        vi.spyOn(scoped, "loadState").mockImplementation(async () => {
          const state = await originalLoad();
          for (const key of Object.keys(state) as Array<keyof typeof state>) {
            (state[key] as Array<{ tenantId?: string }>).splice(
              0,
              state[key].length,
              ...(state[key] as Array<{ tenantId?: string }>).filter(
                (item) => item.tenantId && tenants.includes(item.tenantId),
              ),
            );
          }
          return state;
        });
        return scoped;
      };

      try {
        const target = await service.createWebhookEndpoint(tenantId, {
          url: "https://receiver.example.test/pg-target",
          secret: "pg-target-webhook-secret",
          events: ["dispatch.assigned"],
        });
        const sibling = await service.createWebhookEndpoint(tenantId, {
          url: "https://receiver.example.test/pg-sibling",
          secret: "pg-sibling-webhook-secret",
          events: ["dispatch.assigned"],
        });
        const other = await service.createWebhookEndpoint(otherTenantId, {
          url: "https://receiver.example.test/pg-other",
          secret: "pg-other-webhook-secret",
          events: ["dispatch.assigned"],
        });
        await service.sendTestWebhook(tenantId, {
          webhookId: target.webhookId,
        });
        await service.sendTestWebhook(tenantId, {
          webhookId: sibling.webhookId,
        });
        await service.sendTestWebhook(otherTenantId, {
          webhookId: other.webhookId,
        });

        // Create a retryable failure on target so a queued delivery with nextAttemptAt exists in PG.
        fetcherA.mockImplementation(async (url: string) =>
          url === "https://receiver.example.test/pg-target"
            ? { ok: false, status: 503 }
            : { ok: true, status: 204 },
        );
        await service.publishWebhookEvent(tenantId, {
          eventType: "dispatch.assigned",
          data: { orderId: "pg-before-delete" },
        });
        fetcherA.mockImplementation(async () => ({ ok: true, status: 204 }));

        // SQL rejection during DELETE rolls back and preserves the canonical row.
        rejectDeleteSql = true;
        await expect(
          service.deleteWebhookEndpoint(tenantId, target.webhookId, {
            reason: "rejected delete",
          }),
        ).rejects.toThrow("injected webhook delete SQL rejection");
        expect(
          service
            .listWebhookEndpoints(tenantId)
            .map((item) => item.webhookId)
            .sort(),
        ).toEqual([sibling.webhookId, target.webhookId].sort());

        // Durable DELETE removes the row from admin.phase1_tenant_webhook_endpoints.
        const deleted = await service.deleteWebhookEndpoint(
          tenantId,
          target.webhookId,
          { reason: "durable pg delete" },
        );
        expect(deleted).toEqual({
          status: "deleted",
          webhookId: target.webhookId,
        });
        expect(
          await service.deleteWebhookEndpoint(tenantId, target.webhookId, {
            reason: "repeated pg delete",
          }),
        ).toBeNull();
        expect(
          await service.deleteWebhookEndpoint(tenantId, other.webhookId, {
            reason: "cross-tenant pg delete",
          }),
        ).toBeNull();

        const countRow = async (webhookId: string) => {
          const res = await database.query<{ count: number }>(
            `SELECT count(*)::int AS count
             FROM admin.phase1_tenant_webhook_endpoints
             WHERE webhook_id = $1`,
            [webhookId],
          );
          return res.rows[0]?.count ?? 0;
        };
        expect(await countRow(target.webhookId)).toBe(0);
        expect(await countRow(sibling.webhookId)).toBe(1);
        expect(await countRow(other.webhookId)).toBe(1);

        // Lost COMMIT ACK on DELETE reconciles canonical absence without false success audit.
        const lostAckTarget = await service.createWebhookEndpoint(tenantId, {
          url: "https://receiver.example.test/pg-lost-ack",
          secret: "pg-lost-ack-webhook-secret",
          events: ["dispatch.assigned"],
        });
        expect(await countRow(lostAckTarget.webhookId)).toBe(1);
        const auditSpy = vi.spyOn(auditA, "recordAuditLog");
        loseDeleteCommitAck = true;
        await expect(
          service.deleteWebhookEndpoint(tenantId, lostAckTarget.webhookId, {
            reason: "lost ack pg delete",
          }),
        ).rejects.toThrow("injected lost webhook delete COMMIT ACK");
        expect(await countRow(lostAckTarget.webhookId)).toBe(0);
        expect(
          service.listWebhookEndpoints(tenantId).map((item) => item.webhookId),
        ).toEqual([sibling.webhookId]);
        expect(
          auditSpy.mock.calls.some(
            ([entry]) => entry.actionName === "delete_webhook_endpoint",
          ),
        ).toBe(false);

        // Historical deliveries for the deleted endpoint remain in PostgreSQL.
        const historyRes = await database.query<{ count: number }>(
          `SELECT count(*)::int AS count
           FROM admin.phase1_tenant_webhook_deliveries
           WHERE webhook_id = $1`,
          [target.webhookId],
        );
        expect(historyRes.rows[0]?.count ?? 0).toBeGreaterThanOrEqual(2);

        // Cross-instance in-flight HTTP delivery cannot reinsert a concurrently deleted endpoint.
        const peerScopedRepo = scopedRepositoryFor([tenantId, otherTenantId]);
        const staleSiblingSnapshot =
          await peerScopedRepo.findNotificationWebhookEndpoint(
            tenantId,
            sibling.webhookId,
          );
        expect(staleSiblingSnapshot?.webhookId).toBe(sibling.webhookId);
        const peer = new TenantPartnerService(
          new AuditNotificationService(),
          peerScopedRepo,
          new WebhookDispatchService(fetcherB),
          [],
        );
        try {
          await peer.onModuleInit();
          let releasePeerHttp!: (result: {
            ok: boolean;
            status: number;
          }) => void;
          const peerHttpEntered = new Promise<void>((resolveEnter) => {
            fetcherB.mockImplementationOnce(
              () =>
                new Promise((resolveHttp) => {
                  releasePeerHttp = resolveHttp;
                  resolveEnter();
                }),
            );
          });
          const inFlight = peer.publishWebhookEvent(tenantId, {
            eventType: "dispatch.assigned",
            data: { orderId: "pg-inflight-cross-instance" },
          });
          await peerHttpEntered;
          await service.deleteWebhookEndpoint(tenantId, sibling.webhookId, {
            reason: "concurrent delete while peer HTTP in flight",
          });
          expect(await countRow(sibling.webhookId)).toBe(0);
          releasePeerHttp({ ok: true, status: 204 });
          await inFlight;
          expect(await countRow(sibling.webhookId)).toBe(0);
          expect(peer.listWebhookEndpoints(tenantId)).toEqual([]);
          await peerScopedRepo.persistChanges({
            webhookEndpoints: [staleSiblingSnapshot!],
            requireExistingWebhookEndpoints: true,
          });
          expect(await countRow(sibling.webhookId)).toBe(0);
        } finally {
          peer.onModuleDestroy();
        }

        // Fresh service restart does not resurrect either deleted endpoint or resume retries.
        const restartFetcher = vi.fn<
          (
            url: string,
            init?: RequestInit,
          ) => Promise<{ ok: boolean; status: number }>
        >(async () => ({ ok: true, status: 204 }));
        const restarted = new TenantPartnerService(
          new AuditNotificationService(),
          scopedRepositoryFor([tenantId, otherTenantId]),
          new WebhookDispatchService(restartFetcher),
          [],
        );
        try {
          await restarted.onModuleInit();
          expect(restarted.listWebhookEndpoints(tenantId)).toEqual([]);
          expect(
            restarted
              .listWebhookEndpoints(otherTenantId)
              .map((item) => item.webhookId),
          ).toEqual([other.webhookId]);
          expect(
            restarted
              .listWebhookDeliveries(tenantId)
              .filter((item) => item.webhookId === target.webhookId),
          ).toHaveLength(2);
          const publishedAfterDelete = await restarted.publishWebhookEvent(
            tenantId,
            {
              eventType: "dispatch.assigned",
              data: { orderId: "pg-after-delete" },
            },
          );
          expect(publishedAfterDelete).toEqual([]);
          expect(restartFetcher).not.toHaveBeenCalled();
        } finally {
          restarted.onModuleDestroy();
        }
      } finally {
        service.onModuleDestroy();
        await repository.persistChanges({
          deletedTenantIds: [tenantId, otherTenantId],
        });
        await database.onModuleDestroy();
        vi.restoreAllMocks();
      }
    });
  },
);
