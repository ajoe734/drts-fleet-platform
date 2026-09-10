import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { ApiRequestError } from "../../../../apps/api/src/common/api-envelope";
import { DatabaseService } from "../../../../apps/api/src/common/db";
import {
  DriverLeaveRepository,
  DriverLeaveService,
  DriverLeaveController,
  DRIVER_LEAVE_ERROR_CODES,
  type DriverLeaveRecord,
} from "../../../../apps/api/src/modules/driver-leave";

// Use createRequire scoped to apps/api to resolve pg pool cleanly
const require = createRequire(
  new URL("../../../../apps/api/package.json", import.meta.url),
);
const { Pool } = require("pg") as typeof import("pg");

const connectionString =
  process.env.DRTS_LEAVE_TEST_DATABASE_URL || process.env.DATABASE_URL;

const fixedNow = new Date("2026-09-10T10:00:00.000Z");

describe("SR-LEAVE-BE-001-ACCEPTANCE-RUNNER: Real PostgreSQL Race, Persistence & Invariants", () => {
  let pool: InstanceType<typeof Pool>;
  let dbInstance1: DatabaseService;
  let dbInstance2: DatabaseService;
  let repo1: DriverLeaveRepository;
  let repo2: DriverLeaveRepository;
  let service1: DriverLeaveService;
  let service2: DriverLeaveService;
  let controller1: DriverLeaveController;

  beforeAll(async () => {
    if (!connectionString) {
      throw new Error(
        "SR-LEAVE-BE-001 Acceptance Requirement: DATABASE_URL or DRTS_LEAVE_TEST_DATABASE_URL " +
          "must be explicitly configured with a migrated PostGIS/PostgreSQL database. " +
          "Suite fails explicitly when DB is unconfigured or unreachable. Fake receipts are forbidden.",
      );
    }

    pool = new Pool({ connectionString });
    try {
      await pool.query("SELECT 1");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `SR-LEAVE-BE-001 Acceptance Requirement: Failed to connect to PostgreSQL at ${connectionString}: ${msg}. ` +
          "Suite fails explicitly when DB is unreachable.",
      );
    }

    // Initialize two independent DatabaseService instances simulating two app instances
    dbInstance1 = new DatabaseService();
    dbInstance2 = new DatabaseService();

    repo1 = new DriverLeaveRepository(dbInstance1);
    repo2 = new DriverLeaveRepository(dbInstance2);

    service1 = new DriverLeaveService(repo1);
    service2 = new DriverLeaveService(repo2);

    controller1 = new DriverLeaveController(service1);
  });

  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
    if (dbInstance1) {
      await dbInstance1.onModuleDestroy();
    }
    if (dbInstance2) {
      await dbInstance2.onModuleDestroy();
    }
  });

  describe("Suite 1: Dedicated PostgreSQL Schema & Baseline Invariants", () => {
    it("proves migrated database connection and verifies table structures", async () => {
      const tablesResult = await pool.query<{ table_name: string }>(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'ops'
          AND table_name IN (
            'phase1_driver_leave_requests',
            'phase1_driver_shifts',
            'phase1_driver_matching_suppressions'
          )
        ORDER BY table_name;
      `);
      const names = tablesResult.rows.map((r: { table_name: string }) => r.table_name);
      expect(names).toContain("phase1_driver_leave_requests");
      expect(names).toContain("phase1_driver_shifts");
      expect(names).toContain("phase1_driver_matching_suppressions");

      expect(repo1.isEnabled()).toBe(true);
      expect(repo2.isEnabled()).toBe(true);
    });
  });

  describe("Suite 2: Guarded Controller Lifecycle, Permissions & Illegal State Transitions", () => {
    it("rejects driver attempting to create or withdraw leave for another driver (LEAVE_FORBIDDEN_ACCESS)", async () => {
      const command = {
        driverId: "drv_victim_001",
        leaveType: "personal" as const,
        startTime: "2026-09-10T12:00:00.000Z",
        endTime: "2026-09-10T15:00:00.000Z",
        reason: "cross driver submission attempt",
      };

      const attackerIdentity = {
        realm: "driver" as const,
        actorType: "driver_user" as const,
        actorId: "drv_attacker_001",
      };

      await expect(
        controller1.createDriverLeave(command, attackerIdentity as any),
      ).rejects.toThrow(ApiRequestError);

      try {
        await controller1.createDriverLeave(command, attackerIdentity as any);
      } catch (err: any) {
        expect(err.statusCode).toBe(403);
        expect(err.errorCode).toBe(DRIVER_LEAVE_ERROR_CODES.LEAVE_FORBIDDEN_ACCESS);
      }
    });

    it("rejects ops users attempting to withdraw driver leave (LEAVE_FORBIDDEN_ACCESS)", async () => {
      const opsIdentity = {
        realm: "ops" as const,
        actorType: "ops_user" as const,
        actorId: "ops_dispatcher_001",
      };

      await expect(
        controller1.withdrawDriverLeave("lv_any_001", {}, opsIdentity as any),
      ).rejects.toThrow(ApiRequestError);

      try {
        await controller1.withdrawDriverLeave("lv_any_001", {}, opsIdentity as any);
      } catch (err: any) {
        expect(err.statusCode).toBe(403);
        expect(err.errorCode).toBe(DRIVER_LEAVE_ERROR_CODES.LEAVE_FORBIDDEN_ACCESS);
      }
    });

    it("rejects drivers attempting to review or approve leave requests (LEAVE_FORBIDDEN_ACCESS)", async () => {
      const driverIdentity = {
        realm: "driver" as const,
        actorType: "driver_user" as const,
        actorId: "drv_regular_001",
      };

      await expect(
        controller1.reviewDriverLeave(
          "lv_any_002",
          { decision: "approve" },
          driverIdentity as any,
        ),
      ).rejects.toThrow(ApiRequestError);

      try {
        await controller1.reviewDriverLeave(
          "lv_any_002",
          { decision: "approve" },
          driverIdentity as any,
        );
      } catch (err: any) {
        expect(err.statusCode).toBe(403);
        expect(err.errorCode).toBe(DRIVER_LEAVE_ERROR_CODES.LEAVE_FORBIDDEN_ACCESS);
      }
    });

    it("rejects invalid state transitions on terminal leaves (LEAVE_INVALID_STATE_TRANSITION)", async () => {
      const driverId = `drv_trans_${randomUUID().slice(0, 8)}`;
      const leave = await service1.createLeave(
        driverId,
        {
          leaveType: "personal",
          startTime: "2026-09-10T12:00:00.000Z",
          endTime: "2026-09-10T15:00:00.000Z",
          reason: "transition test",
        },
        fixedNow,
      );

      // Transition to withdrawn
      await service1.withdrawLeave(leave.leaveId, driverId, undefined, fixedNow);

      // Attempt to withdraw again -> 409 CONFLICT
      await expect(
        service1.withdrawLeave(leave.leaveId, driverId, undefined, fixedNow),
      ).rejects.toThrow(ApiRequestError);

      try {
        await service1.withdrawLeave(leave.leaveId, driverId, undefined, fixedNow);
      } catch (err: any) {
        expect(err.statusCode).toBe(409);
        expect(err.errorCode).toBe(
          DRIVER_LEAVE_ERROR_CODES.LEAVE_INVALID_STATE_TRANSITION,
        );
      }

      // Attempt to review a withdrawn leave -> 409 CONFLICT
      await expect(
        service1.reviewLeave(
          leave.leaveId,
          "ops_mgr",
          { decision: "approve" },
          fixedNow,
        ),
      ).rejects.toThrow(ApiRequestError);

      try {
        await service1.reviewLeave(
          leave.leaveId,
          "ops_mgr",
          { decision: "approve" },
          fixedNow,
        );
      } catch (err: any) {
        expect(err.statusCode).toBe(409);
        expect(err.errorCode).toBe(
          DRIVER_LEAVE_ERROR_CODES.LEAVE_INVALID_STATE_TRANSITION,
        );
      }
    });
  });

  describe("Suite 3: Concurrent Same-Leave Approve vs Withdraw Across Two Instances", () => {
    it("permits exactly one conflicting transition when approval and withdrawal race across two instances", async () => {
      const driverId = `drv_race_${randomUUID().slice(0, 8)}`;
      const shiftId = `sh_race_${randomUUID().slice(0, 8)}`;

      // Seed deterministic shift in ops.phase1_driver_shifts
      await pool.query(
        `
        INSERT INTO ops.phase1_driver_shifts (
          shift_id,
          driver_id,
          scheduled_start,
          scheduled_end,
          clock_in_at,
          clock_out_at,
          status,
          record,
          created_at,
          updated_at
        ) VALUES (
          $1, $2, '2026-09-10T11:00:00.000Z', '2026-09-10T16:00:00.000Z',
          '2026-09-10T11:00:00.000Z', null, 'scheduled',
          '{"shiftId": "${shiftId}", "driverId": "${driverId}"}'::jsonb,
          now(), now()
        )
      `,
        [shiftId, driverId],
      );

      // Create a pending leave request using service 1
      const createdLeave = await service1.createLeave(
        driverId,
        {
          leaveType: "personal",
          startTime: "2026-09-10T12:00:00.000Z",
          endTime: "2026-09-10T15:00:00.000Z",
          reason: "concurrency race probe",
        },
        fixedNow,
      );

      expect(createdLeave.status).toBe("pending");

      // Race: Instance 1 reviews/approves while Instance 2 withdraws simultaneously
      const results = await Promise.allSettled([
        service1.reviewLeave(
          createdLeave.leaveId,
          "ops_reviewer_1",
          { decision: "approve" },
          fixedNow,
        ),
        service2.withdrawLeave(
          createdLeave.leaveId,
          driverId,
          { reason: "withdrawing in race" },
          fixedNow,
        ),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      // Inspect the rejection reason: must be CONFLICT (LEAVE_INVALID_STATE_TRANSITION)
      const rejReason = (rejected[0] as PromiseRejectedResult).reason;
      expect(rejReason).toBeInstanceOf(ApiRequestError);
      expect(rejReason.statusCode).toBe(409);
      expect(rejReason.errorCode).toBe(
        DRIVER_LEAVE_ERROR_CODES.LEAVE_INVALID_STATE_TRANSITION,
      );

      // Inspect raw PostgreSQL table row
      const sqlLeaveResult = await pool.query<DriverLeaveRecord>(
        `SELECT record FROM ops.phase1_driver_leave_requests WHERE leave_id = $1`,
        [createdLeave.leaveId],
      );
      expect(sqlLeaveResult.rows).toHaveLength(1);
      const persistedLeave = (sqlLeaveResult.rows[0] as any).record as DriverLeaveRecord;

      expect(["approved", "withdrawn"]).toContain(persistedLeave.status);

      // Authoritative shift & suppression verification:
      if (persistedLeave.status === "approved") {
        expect(persistedLeave.impactedShiftIds).toContain(shiftId);

        const suppressionResult = await pool.query(
          `SELECT active, reason_code FROM ops.phase1_driver_matching_suppressions WHERE source_incident_id = $1`,
          [createdLeave.leaveId],
        );
        expect(suppressionResult.rows).toHaveLength(1);
        expect(suppressionResult.rows[0].active).toBe(true);
        expect(suppressionResult.rows[0].reason_code).toBe("DRIVER_ON_LEAVE");

        const shiftRowResult = await pool.query(
          `SELECT record FROM ops.phase1_driver_shifts WHERE shift_id = $1`,
          [shiftId],
        );
        expect(shiftRowResult.rows[0].record.leaveReassigned).toBe(true);
      } else {
        // Withdrawn: no suppression should exist
        const suppressionResult = await pool.query(
          `SELECT active FROM ops.phase1_driver_matching_suppressions WHERE source_incident_id = $1`,
          [createdLeave.leaveId],
        );
        expect(suppressionResult.rows).toHaveLength(0);
      }
    });
  });

  describe("Suite 4: Concurrent Overlapping Leave Creation Prevention", () => {
    it("accepts only one of two concurrent overlapping requests for the same driver across two instances", async () => {
      const driverId = `drv_ovl_${randomUUID().slice(0, 8)}`;

      // Simultaneously dispatch two overlapping leave requests for the SAME driver
      const req1 = {
        leaveType: "personal" as const,
        startTime: "2026-09-10T12:00:00.000Z",
        endTime: "2026-09-10T15:00:00.000Z",
        reason: "overlap request 1",
      };
      const req2 = {
        leaveType: "sick" as const,
        startTime: "2026-09-10T13:00:00.000Z",
        endTime: "2026-09-10T16:00:00.000Z",
        reason: "overlap request 2",
      };

      const outcomes = await Promise.allSettled([
        service1.createLeave(driverId, req1, fixedNow),
        service2.createLeave(driverId, req2, fixedNow),
      ]);

      const fulfilled = outcomes.filter((o) => o.status === "fulfilled");
      const rejected = outcomes.filter((o) => o.status === "rejected");

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const rejErr = (rejected[0] as PromiseRejectedResult).reason;
      expect(rejErr).toBeInstanceOf(ApiRequestError);
      expect(rejErr.statusCode).toBe(409);
      expect(rejErr.errorCode).toBe(
        DRIVER_LEAVE_ERROR_CODES.LEAVE_OVERLAPPING_REQUEST,
      );

      // Verify SQL: exactly 1 active leave row in PostgreSQL
      const persisted = await pool.query(
        `SELECT leave_id, status FROM ops.phase1_driver_leave_requests WHERE driver_id = $1`,
        [driverId],
      );
      expect(persisted.rows).toHaveLength(1);
    });

    it("allows concurrent overlapping leaves for different drivers", async () => {
      const driverA = `drv_diffA_${randomUUID().slice(0, 8)}`;
      const driverB = `drv_diffB_${randomUUID().slice(0, 8)}`;

      const req = {
        leaveType: "annual" as const,
        startTime: "2026-09-10T12:00:00.000Z",
        endTime: "2026-09-10T15:00:00.000Z",
        reason: "concurrent different drivers",
      };

      const outcomes = await Promise.allSettled([
        service1.createLeave(driverA, req, fixedNow),
        service2.createLeave(driverB, req, fixedNow),
      ]);

      expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(2);
    });

    it("allows adjacent non-overlapping half-open intervals for the same driver", async () => {
      const driverId = `drv_adj_${randomUUID().slice(0, 8)}`;

      const leave1 = await service1.createLeave(
        driverId,
        {
          leaveType: "personal",
          startTime: "2026-09-10T12:00:00.000Z",
          endTime: "2026-09-10T15:00:00.000Z",
          reason: "first block",
        },
        fixedNow,
      );

      // Adjacent: starts exactly when leave1 ends (15:00:00.000Z)
      const leave2 = await service2.createLeave(
        driverId,
        {
          leaveType: "personal",
          startTime: "2026-09-10T15:00:00.000Z",
          endTime: "2026-09-10T18:00:00.000Z",
          reason: "adjacent block",
        },
        fixedNow,
      );

      expect(leave1.status).toBe("pending");
      expect(leave2.status).toBe("pending");

      const rows = await pool.query(
        `SELECT leave_id FROM ops.phase1_driver_leave_requests WHERE driver_id = $1`,
        [driverId],
      );
      expect(rows.rows).toHaveLength(2);
    });
  });

  describe("Suite 5: Atomic Rollback on Failure & Fail-Closed Invariants", () => {
    it("does not acknowledge a successful save when enabled database rejects the write", async () => {
      const rejectingDb = {
        isEnabled: () => true,
        query: async () => {
          throw new Error("injected database write rejection");
        },
      } as unknown as DatabaseService;

      const failingRepo = new DriverLeaveRepository(rejectingDb);
      const testRecord: DriverLeaveRecord = {
        leaveId: "lv_rejection_probe",
        driverId: "drv_rejection_probe",
        leaveType: "personal",
        startTime: "2026-09-10T12:00:00.000Z",
        endTime: "2026-09-10T15:00:00.000Z",
        reason: "rejection test",
        status: "pending",
        reviewedByPrincipalId: null,
        reviewedAt: null,
        reviewNotes: null,
        impactedShiftIds: [],
        createdAt: fixedNow.toISOString(),
        updatedAt: fixedNow.toISOString(),
      };

      await expect(failingRepo.save(testRecord)).rejects.toThrow(
        "injected database write rejection",
      );
    });

    it("enforces atomic rollback in transaction when review encounters a failure", async () => {
      const driverId = `drv_tx_${randomUUID().slice(0, 8)}`;
      const leave = await service1.createLeave(
        driverId,
        {
          leaveType: "sick",
          startTime: "2026-09-10T12:00:00.000Z",
          endTime: "2026-09-10T15:00:00.000Z",
          reason: "tx rollback probe",
        },
        fixedNow,
      );

      // Intercept repository review with simulated failure during transaction
      const failingDb = {
        isEnabled: () => true,
        connect: async () => {
          const client = await pool.connect();
          const origQuery = client.query.bind(client);
          client.query = (async (sql: any, params?: any) => {
            if (typeof sql === "string" && sql.includes("phase1_driver_matching_suppressions")) {
              throw new Error("simulated suppression insertion failure");
            }
            return (origQuery as any)(sql, params);
          }) as any;
          return client;
        },
      } as unknown as DatabaseService;

      const failingRepo = new DriverLeaveRepository(failingDb);
      const failingService = new DriverLeaveService(failingRepo);

      await expect(
        failingService.reviewLeave(
          leave.leaveId,
          "ops_lead",
          { decision: "approve" },
          fixedNow,
        ),
      ).rejects.toThrow("simulated suppression insertion failure");

      // Verify PostgreSQL state rolled back: leave status MUST remain 'pending'
      const checkResult = await pool.query(
        `SELECT status FROM ops.phase1_driver_leave_requests WHERE leave_id = $1`,
        [leave.leaveId],
      );
      expect(checkResult.rows[0].status).toBe("pending");

      // No suppression row created
      const suppResult = await pool.query(
        `SELECT source_incident_id FROM ops.phase1_driver_matching_suppressions WHERE source_incident_id = $1`,
        [leave.leaveId],
      );
      expect(suppResult.rows).toHaveLength(0);
    });
  });

  describe("Suite 6: Durable Reload Verification", () => {
    it("preserves authoritative leave, shift suppression, and zero stale memory across reload", async () => {
      const driverId = `drv_reload_${randomUUID().slice(0, 8)}`;
      const shiftId = `sh_reload_${randomUUID().slice(0, 8)}`;

      // Seed shift in PostgreSQL
      await pool.query(
        `
        INSERT INTO ops.phase1_driver_shifts (
          shift_id, driver_id, scheduled_start, scheduled_end, clock_in_at,
          clock_out_at, status, record, created_at, updated_at
        ) VALUES (
          $1, $2, '2026-09-10T12:00:00.000Z', '2026-09-10T18:00:00.000Z',
          '2026-09-10T12:00:00.000Z', null, 'scheduled',
          '{"shiftId": "${shiftId}", "driverId": "${driverId}"}'::jsonb,
          now(), now()
        )
      `,
        [shiftId, driverId],
      );

      // Create and approve leave
      const leave = await service1.createLeave(
        driverId,
        {
          leaveType: "annual",
          startTime: "2026-09-10T13:00:00.000Z",
          endTime: "2026-09-10T17:00:00.000Z",
          reason: "durable reload test",
        },
        fixedNow,
      );

      const approvedLeave = await service1.reviewLeave(
        leave.leaveId,
        "ops_manager_reload",
        { decision: "approve", reviewNotes: "approved for durable reload" },
        fixedNow,
      );

      expect(approvedLeave.status).toBe("approved");

      // Spawn a brand new DatabaseService and DriverLeaveRepository (Instance 3)
      // simulating a fresh process after reload with completely empty memory
      const freshDb = new DatabaseService();
      const freshRepo = new DriverLeaveRepository(freshDb);
      const freshService = new DriverLeaveService(freshRepo);

      try {
        const reloadedLeave = await freshRepo.findById(leave.leaveId);
        expect(reloadedLeave).not.toBeNull();
        expect(reloadedLeave!.status).toBe("approved");
        expect(reloadedLeave!.impactedShiftIds).toContain(shiftId);
        expect(reloadedLeave!.reviewNotes).toBe("approved for durable reload");

        // Verify shift reassignment
        const shiftRow = await pool.query(
          `SELECT record FROM ops.phase1_driver_shifts WHERE shift_id = $1`,
          [shiftId],
        );
        expect(shiftRow.rows[0].record.leaveReassigned).toBe(true);
        expect(shiftRow.rows[0].record.reassignedReason).toBe("DRIVER_ON_LEAVE");
        expect(shiftRow.rows[0].record.leaveId).toBe(leave.leaveId);

        // Verify matching suppression row
        const suppRow = await pool.query(
          `SELECT active, reason_code, expires_at FROM ops.phase1_driver_matching_suppressions WHERE source_incident_id = $1`,
          [leave.leaveId],
        );
        expect(suppRow.rows).toHaveLength(1);
        expect(suppRow.rows[0].active).toBe(true);
        expect(suppRow.rows[0].reason_code).toBe("DRIVER_ON_LEAVE");
      } finally {
        await freshDb.onModuleDestroy();
      }
    });
  });
});
