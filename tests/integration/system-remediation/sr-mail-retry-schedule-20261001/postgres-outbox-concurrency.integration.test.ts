import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type {
  TenantBookingApprovalRequestRecord,
  TenantUserRoleRecord,
} from "@drts/contracts";

import { AuditNotificationEmailAdapter } from "../../../../apps/api/src/modules/audit-notification/audit-notification.email-adapter";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { JwtAuthService } from "../../../../apps/api/src/common/auth/jwt-auth.service";
import { NotificationDeliveryService } from "../../../../apps/api/src/modules/notification-delivery/notification-delivery.service";
import { PostgresMailOutbox } from "../../../../apps/api/src/modules/notification-delivery/postgres-mail-outbox";
import type { ProviderAcknowledgement } from "../../../../apps/api/src/modules/notification-delivery/notification-delivery.types";
import { TenantPartnerController } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.controller";
import { TenantPartnerService } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import type { BootstrapRequestIdentity } from "../../../../apps/api/src/common/auth";

// SR-MAIL-RETRY-SCHEDULE-20261001 R1-03 (Codex R1 review): the unit test's
// "two instances race / two overlapping scheduler calls" coverage used
// FileMailOutbox (flock-serialized) and asserted the result is "the
// Postgres-equivalent" by comment only. V0103's actual concurrency
// guarantee -- `ops.phase1_notification_mail_outbox_lock` row-level
// serialization plus the persisted per-delivery lease -- only exists in
// real PostgreSQL. This suite reproduces the same two scenarios
// (concurrent mail-outbox drain trigger, racing approval-timeout reminder
// sweep) against the real V0103 schema and two independent
// PostgresMailOutbox-backed delivery/service/controller instances sharing
// one database, exactly as two separate Cloud Run replicas would.
//
// Opt-in real PostgreSQL only, same pattern as
// sr-partner-notify-nav-20260917.integration.test.ts: provisions its own
// throwaway database and replays the full migration ledger via
// db-apply.sh, so this can never drift from the real V0103 migration.
// Never starts a server on the worker VM; this file is a no-op unless
// DATABASE_URL already points at a reachable PostgreSQL instance (true in
// CI's `unit` job, false on a dev VM with no local Postgres).
const apiRequire = createRequire(
  new URL("../../../../apps/api/package.json", import.meta.url),
);
const { Pool } = apiRequire("pg") as typeof import("pg");

const repoRoot = path.resolve(__dirname, "..", "..", "..", "..");
const seedDatabaseUrl = process.env.DATABASE_URL;

describe.skipIf(!seedDatabaseUrl)(
  "SR-MAIL-RETRY-SCHEDULE-20261001 R1-03 real PostgreSQL V0103 outbox concurrency",
  () => {
    const dbName = `sr_mail_retry_schedule_${process.pid}_${Date.now()}`;
    const adminUrl = (() => {
      if (!seedDatabaseUrl) return new URL("postgres://localhost");
      const url = new URL(seedDatabaseUrl);
      url.pathname = "/postgres";
      return url;
    })();
    const databaseUrl = (() => {
      if (!seedDatabaseUrl) return "postgres://localhost";
      const url = new URL(seedDatabaseUrl);
      url.pathname = `/${dbName}`;
      return url.toString();
    })();

    let admin: InstanceType<typeof Pool>;
    let pool: InstanceType<typeof Pool>;

    beforeAll(async () => {
      admin = new Pool({ connectionString: adminUrl.toString() });
      await admin.query(`CREATE DATABASE "${dbName}"`);

      execFileSync("./operations/database/db-apply.sh", [], {
        cwd: repoRoot,
        env: { ...process.env, DATABASE_URL: databaseUrl },
        encoding: "utf8",
        stdio: "pipe",
      });

      // A pool scoped to this suite's own throwaway database, shared by the
      // two independent PostgresMailOutbox instances below -- exactly how
      // two Cloud Run replicas would share one Cloud SQL database, never
      // the process.env.DATABASE_URL that other concurrently-running test
      // files and their own pools rely on.
      pool = new Pool({ connectionString: databaseUrl, max: 8 });
    }, 120_000);

    afterAll(async () => {
      await pool.end();
      await admin.query(`DROP DATABASE IF EXISTS "${dbName}"`);
      await admin.end();
    }, 30_000);

    function systemIdentity(): BootstrapRequestIdentity {
      return {
        authMode: "jwt_bearer",
        actorType: "system",
        actorId: "scheduler",
        realm: "system",
        tenantId: null,
        roleFamilies: [],
        roles: [],
        scopes: [
          "notification-delivery:drain",
          "tenant-partner:approval-timeout-reminders:run",
        ],
        requestId: null,
      };
    }

    function acknowledgement(providerMessageId: string): ProviderAcknowledgement {
      return {
        provider: "test-provider",
        response: "250 Accepted",
        providerMessageId,
        acceptedAt: new Date().toISOString(),
      };
    }

    function buildMailController(
      notificationDeliveryService: NotificationDeliveryService,
    ) {
      const tenantPartnerService = new TenantPartnerService(
        new AuditNotificationService(),
      );
      return new TenantPartnerController(
        tenantPartnerService,
        {} as never,
        {} as never,
        new JwtAuthService(),
        {} as never,
        undefined,
        undefined,
        undefined,
        undefined,
        notificationDeliveryService,
      );
    }

    it("does not double-send a retryable mail when two independent PostgresMailOutbox-backed instances drain concurrently against the real V0103 schema", async () => {
      let resolveSend!: (value: ProviderAcknowledgement) => void;
      const send = vi.fn(
        () =>
          new Promise<ProviderAcknowledgement>((resolve) => {
            resolveSend = resolve;
          }),
      );

      // Two independent delivery/controller instances, each with its own
      // PostgresMailOutbox, sharing only the underlying database pool --
      // the real-world shape of two Cloud Run replicas, not one warm
      // instance called twice.
      const deliveryServiceA = new NotificationDeliveryService(
        new PostgresMailOutbox(pool),
        { provider: "test-provider", send },
        { maxAttempts: 5, retryDelayMs: 1_000, leaseMs: 60_000 },
      );
      const deliveryServiceB = new NotificationDeliveryService(
        new PostgresMailOutbox(pool),
        { provider: "test-provider", send },
        { maxAttempts: 5, retryDelayMs: 1_000, leaseMs: 60_000 },
      );

      await deliveryServiceA.enqueue({
        tenantId: "tenant-pg-drain-001",
        idempotencyKey: "pg-drain-trigger-001",
        recipientEmail: "ops@example.test",
        fromEmail: "notifications@example.test",
        subject: "Pending retryable mail (real PostgreSQL V0103 outbox)",
        body: "Two real replicas must still send this exactly once.",
      });

      const controllerA = buildMailController(deliveryServiceA);
      const controllerB = buildMailController(deliveryServiceB);

      const first = controllerA.drainMailOutbox(systemIdentity());
      // Wait for the first call's dispatch to actually claim the lease
      // (reach the transport) before the second replica races it.
      await vi.waitFor(
        () => {
          if (send.mock.calls.length === 0) {
            throw new Error("first call has not reached the transport yet");
          }
        },
        { timeout: 10_000, interval: 25 },
      );
      const second = controllerB.drainMailOutbox(systemIdentity());
      resolveSend(acknowledgement("msg-pg-drain-001"));

      type DrainResult = { data: { drained: number; sent: number; failed: number } };
      const [firstResult, secondResult] = (await Promise.all([
        first,
        second,
      ])) as [DrainResult, DrainResult];

      expect(send).toHaveBeenCalledTimes(1);
      expect(firstResult.data.sent + secondResult.data.sent).toBe(1);
    }, 30_000);

    function approvalRequestNearingTimeout(): TenantBookingApprovalRequestRecord {
      return {
        approvalRequestId: "approval-request-pg-sweep-001",
        tenantId: "tenant-pg-sweep-001",
        bookingId: "booking-pg-sweep-001",
        orderId: "order-pg-sweep-001",
        evaluationId: "eval-pg-sweep-001",
        ruleIds: ["rule-001"],
        status: "pending",
        approvalMode: "any_one",
        approvers: [],
        resolvedApproverUserIds: ["user-pg-sweep-001"],
        previousApprovers: [],
        decisions: [],
        evaluationSnapshot: { matchedRules: [] } as never,
        timeoutAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        escalatedAt: null,
        fallbackPolicy: "escalate",
        escalationTarget: null,
        createdAt: new Date().toISOString(),
        resolvedAt: null,
      } as unknown as TenantBookingApprovalRequestRecord;
    }

    function approverUserRole(): TenantUserRoleRecord {
      return {
        userId: "user-pg-sweep-001",
        tenantId: "tenant-pg-sweep-001",
        email: "approver-pg@example.test",
        displayName: "Approver",
        roleCode: "tenant_admin",
        status: "active",
        approvalNotificationOptOut: false,
        invitedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    it("does not double-send the same approval-timeout reminder when two independent cold-started TenantPartnerService instances race against the real V0103 outbox", async () => {
      const send = vi.fn(async () => acknowledgement("msg-pg-sweep-001"));

      function buildRacingService() {
        const deliveryService = new NotificationDeliveryService(
          new PostgresMailOutbox(pool),
          { provider: "test-provider", send },
          { maxAttempts: 5, retryDelayMs: 1_000, leaseMs: 60_000 },
        );
        const emailAdapter = new AuditNotificationEmailAdapter(deliveryService);
        // No shared AuditLogRepository between the two instances: each
        // one's in-memory hasApprovalNotificationDispatch pre-check
        // independently believes "not yet dispatched" -- the worst-case
        // race. Only the shared real Postgres V0103 outbox lock on the
        // shared `pool` can prevent a duplicate send here.
        const auditNotificationService = new AuditNotificationService(
          undefined,
          emailAdapter,
        );
        const service = new TenantPartnerService(auditNotificationService);
        (
          service as unknown as {
            approvalRequests: TenantBookingApprovalRequestRecord[];
          }
        ).approvalRequests = [approvalRequestNearingTimeout()];
        (
          service as unknown as { userRoles: TenantUserRoleRecord[] }
        ).userRoles = [approverUserRole()];
        return service;
      }

      const instanceA = buildRacingService();
      const instanceB = buildRacingService();

      await Promise.all([
        instanceA.runApprovalTimeoutNotificationSweep(),
        instanceB.runApprovalTimeoutNotificationSweep(),
      ]);

      expect(send).toHaveBeenCalledTimes(1);
    }, 30_000);
  },
);
