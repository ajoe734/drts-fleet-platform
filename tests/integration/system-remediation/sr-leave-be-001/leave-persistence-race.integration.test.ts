import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../../../../apps/api/src/common/db";
import {
  DriverLeaveRepository,
  DriverLeaveService,
  DRIVER_LEAVE_ERROR_CODES,
  type DriverLeaveRecord,
} from "../../../../apps/api/src/modules/driver-leave";
import {
  apiRequest,
  createLeaveAcceptanceApp,
  driverIdentity,
  futureIso,
  mintAccessToken,
  opsReadOnlyIdentity,
  opsReviewerIdentity,
  type LeaveAcceptanceApp,
} from "./leave-acceptance-test-harness";

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

    // Two independent DatabaseService/Repository/Service instances sharing
    // the same real PostgreSQL database, simulating two app instances.
    dbInstance1 = new DatabaseService();
    dbInstance2 = new DatabaseService();
    repo1 = new DriverLeaveRepository(dbInstance1);
    repo2 = new DriverLeaveRepository(dbInstance2);
    service1 = new DriverLeaveService(repo1);
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

  describe("Suite 2: Guarded Controller Lifecycle via Real HTTP, Decorators & Guards", () => {
    let harness: LeaveAcceptanceApp;

    beforeAll(async () => {
      harness = await createLeaveAcceptanceApp();
    });

    afterAll(async () => {
      await harness.app.close();
    });

    it("rejects unauthenticated requests with no bearer token (401 AUTH_REQUIRED)", async () => {
      const res = await apiRequest(harness.baseUrl, "GET", "/api/driver-leave/requests");
      expect(res.status).toBe(401);
      expect((res.body as any).error.code).toBe("AUTH_REQUIRED");
    });

    it("rejects a driver submitting a leave request for another driver (403 LEAVE_FORBIDDEN_ACCESS)", async () => {
      const attackerToken = await mintAccessToken(
        harness.jwtAuthService,
        driverIdentity("drv_attacker_001"),
      );

      const res = await apiRequest(harness.baseUrl, "POST", "/api/driver-leave/requests", {
        token: attackerToken,
        body: {
          driverId: "drv_victim_001",
          leaveType: "personal",
          startTime: futureIso(3_600_000),
          endTime: futureIso(7_200_000),
          reason: "cross driver submission attempt",
        },
      });

      expect(res.status).toBe(403);
      expect((res.body as any).error.code).toBe(
        DRIVER_LEAVE_ERROR_CODES.LEAVE_FORBIDDEN_ACCESS,
      );
    });

    it("blocks an ops-realm token from withdrawing driver leave at the route guard (403 AUTH_REALM_DENIED)", async () => {
      // The withdraw route is decorated @RequireRealms("driver", "system"); a
      // real ops-realm token is rejected by BootstrapAuthGuard before the
      // controller body ever runs.
      const opsToken = await mintAccessToken(
        harness.jwtAuthService,
        opsReviewerIdentity("ops_dispatcher_001"),
      );

      const res = await apiRequest(
        harness.baseUrl,
        "POST",
        "/api/driver-leave/requests/lv_any_001/withdraw",
        { token: opsToken, body: {} },
      );

      expect(res.status).toBe(403);
      expect((res.body as any).error.code).toBe("AUTH_REALM_DENIED");
    });

    it("blocks a driver-realm token from reviewing leave requests at the route guard (403 AUTH_REALM_DENIED)", async () => {
      // The review route is decorated @RequireRealms("ops", "system"); a real
      // driver-realm token is rejected before the controller body runs.
      const driverToken = await mintAccessToken(
        harness.jwtAuthService,
        driverIdentity("drv_regular_001"),
      );

      const res = await apiRequest(
        harness.baseUrl,
        "POST",
        "/api/driver-leave/requests/lv_any_002/review",
        { token: driverToken, body: { decision: "approve" } },
      );

      expect(res.status).toBe(403);
      expect((res.body as any).error.code).toBe("AUTH_REALM_DENIED");
    });

    it("blocks an ops token missing dispatch:write from reviewing leave requests (403 AUTH_SCOPE_DENIED)", async () => {
      const readOnlyToken = await mintAccessToken(
        harness.jwtAuthService,
        opsReadOnlyIdentity("ops_viewer_001"),
      );

      const res = await apiRequest(
        harness.baseUrl,
        "POST",
        "/api/driver-leave/requests/lv_any_003/review",
        { token: readOnlyToken, body: { decision: "approve" } },
      );

      expect(res.status).toBe(403);
      expect((res.body as any).error.code).toBe("AUTH_SCOPE_DENIED");
    });

    it("rejects invalid state transitions on terminal leaves via real HTTP (409 LEAVE_INVALID_STATE_TRANSITION)", async () => {
      const driverId = `drv_trans_${randomUUID().slice(0, 8)}`;
      const driverToken = await mintAccessToken(harness.jwtAuthService, driverIdentity(driverId));
      const opsToken = await mintAccessToken(
        harness.jwtAuthService,
        opsReviewerIdentity("ops_mgr_trans"),
      );

      const created = await apiRequest(harness.baseUrl, "POST", "/api/driver-leave/requests", {
        token: driverToken,
        body: {
          leaveType: "personal",
          startTime: futureIso(3_600_000),
          endTime: futureIso(7_200_000),
          reason: "transition test",
        },
      });
      expect(created.status).toBe(201);
      const leaveId = (created.body as any).data.leaveId as string;

      const withdrawn = await apiRequest(
        harness.baseUrl,
        "POST",
        `/api/driver-leave/requests/${leaveId}/withdraw`,
        { token: driverToken, body: {} },
      );
      expect(withdrawn.status).toBe(201);

      const withdrawAgain = await apiRequest(
        harness.baseUrl,
        "POST",
        `/api/driver-leave/requests/${leaveId}/withdraw`,
        { token: driverToken, body: {} },
      );
      expect(withdrawAgain.status).toBe(409);
      expect((withdrawAgain.body as any).error.code).toBe(
        DRIVER_LEAVE_ERROR_CODES.LEAVE_INVALID_STATE_TRANSITION,
      );

      const reviewWithdrawn = await apiRequest(
        harness.baseUrl,
        "POST",
        `/api/driver-leave/requests/${leaveId}/review`,
        { token: opsToken, body: { decision: "approve" } },
      );
      expect(reviewWithdrawn.status).toBe(409);
      expect((reviewWithdrawn.body as any).error.code).toBe(
        DRIVER_LEAVE_ERROR_CODES.LEAVE_INVALID_STATE_TRANSITION,
      );
    });
  });

  describe("Suite 3: Concurrent Same-Leave Approve vs Withdraw Across Two Real Guarded HTTP App Instances", () => {
    let harness1: LeaveAcceptanceApp;
    let harness2: LeaveAcceptanceApp;

    beforeAll(async () => {
      harness1 = await createLeaveAcceptanceApp();
      harness2 = await createLeaveAcceptanceApp();
    });

    afterAll(async () => {
      await harness1.app.close();
      await harness2.app.close();
    });

    it("permits exactly one HTTP-guarded transition when approval (instance 1) and withdrawal (instance 2) race", async () => {
      const driverId = `drv_race_${randomUUID().slice(0, 8)}`;
      const shiftId = `sh_race_${randomUUID().slice(0, 8)}`;
      // Anchored to the same Date.now() clock as the leave window below
      // (futureIso(3_600_000)..futureIso(10_800_000)), not a hardcoded
      // absolute timestamp: a fixed calendar window drifts out of overlap
      // with a real-wall-clock leave window depending on when CI executes.
      const shiftWindowStart = futureIso(0);
      const shiftWindowEnd = futureIso(14_400_000);

      await pool.query(
        `
        INSERT INTO ops.phase1_driver_shifts (
          shift_id, shift_no, driver_id, scheduled_start, scheduled_end, clock_in_at,
          clock_out_at, status, record, created_at, updated_at
        ) VALUES (
          $1, $3, $2, $4, $5,
          $4, null, 'scheduled',
          '{"shiftId": "${shiftId}", "driverId": "${driverId}"}'::jsonb,
          now(), now()
        )
      `,
        [shiftId, driverId, `SFT-${shiftId}`, shiftWindowStart, shiftWindowEnd],
      );

      const driverToken = await mintAccessToken(harness1.jwtAuthService, driverIdentity(driverId));
      const opsToken = await mintAccessToken(
        harness1.jwtAuthService,
        opsReviewerIdentity("ops_reviewer_1"),
      );

      const created = await apiRequest(harness1.baseUrl, "POST", "/api/driver-leave/requests", {
        token: driverToken,
        body: {
          leaveType: "personal",
          startTime: futureIso(3_600_000),
          endTime: futureIso(10_800_000),
          reason: "concurrency race probe",
        },
      });
      expect(created.status).toBe(201);
      const leaveId = (created.body as any).data.leaveId as string;

      const [approveRes, withdrawRes] = await Promise.all([
        apiRequest(harness1.baseUrl, "POST", `/api/driver-leave/requests/${leaveId}/review`, {
          token: opsToken,
          body: { decision: "approve" },
        }),
        apiRequest(harness2.baseUrl, "POST", `/api/driver-leave/requests/${leaveId}/withdraw`, {
          token: driverToken,
          body: { reason: "withdrawing in race" },
        }),
      ]);

      const statuses = [approveRes.status, withdrawRes.status];
      expect(statuses.filter((s) => s === 201)).toHaveLength(1);
      expect(statuses.filter((s) => s === 409)).toHaveLength(1);

      const loser = approveRes.status === 409 ? approveRes : withdrawRes;
      expect((loser.body as any).error.code).toBe(
        DRIVER_LEAVE_ERROR_CODES.LEAVE_INVALID_STATE_TRANSITION,
      );

      // Inspect raw PostgreSQL table row
      const sqlLeaveResult = await pool.query<{ record: DriverLeaveRecord }>(
        `SELECT record FROM ops.phase1_driver_leave_requests WHERE leave_id = $1`,
        [leaveId],
      );
      expect(sqlLeaveResult.rows).toHaveLength(1);
      const persistedLeave = sqlLeaveResult.rows[0]!.record;
      expect(["approved", "withdrawn"]).toContain(persistedLeave.status);

      if (persistedLeave.status === "approved") {
        expect(persistedLeave.impactedShiftIds).toContain(shiftId);

        const suppressionResult = await pool.query(
          `SELECT active, reason_code FROM ops.phase1_driver_matching_suppressions WHERE source_incident_id = $1`,
          [leaveId],
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
        const suppressionResult = await pool.query(
          `SELECT active FROM ops.phase1_driver_matching_suppressions WHERE source_incident_id = $1`,
          [leaveId],
        );
        expect(suppressionResult.rows).toHaveLength(0);
      }
    });
  });

  describe("Suite 4: Concurrent Overlapping Leave Creation Prevention Across Two Real Guarded HTTP App Instances", () => {
    let harness1: LeaveAcceptanceApp;
    let harness2: LeaveAcceptanceApp;

    beforeAll(async () => {
      harness1 = await createLeaveAcceptanceApp();
      harness2 = await createLeaveAcceptanceApp();
    });

    afterAll(async () => {
      await harness1.app.close();
      await harness2.app.close();
    });

    it("accepts only one of two concurrent overlapping HTTP creation requests for the same driver", async () => {
      const driverId = `drv_ovl_${randomUUID().slice(0, 8)}`;
      const driverToken = await mintAccessToken(harness1.jwtAuthService, driverIdentity(driverId));

      const [r1, r2] = await Promise.all([
        apiRequest(harness1.baseUrl, "POST", "/api/driver-leave/requests", {
          token: driverToken,
          body: {
            leaveType: "personal",
            startTime: futureIso(3_600_000),
            endTime: futureIso(10_800_000),
            reason: "overlap request 1",
          },
        }),
        apiRequest(harness2.baseUrl, "POST", "/api/driver-leave/requests", {
          token: driverToken,
          body: {
            leaveType: "sick",
            startTime: futureIso(7_200_000),
            endTime: futureIso(14_400_000),
            reason: "overlap request 2",
          },
        }),
      ]);

      const statuses = [r1.status, r2.status];
      expect(statuses.filter((s) => s === 201)).toHaveLength(1);
      expect(statuses.filter((s) => s === 409)).toHaveLength(1);

      const loser = r1.status === 409 ? r1 : r2;
      expect((loser.body as any).error.code).toBe(
        DRIVER_LEAVE_ERROR_CODES.LEAVE_OVERLAPPING_REQUEST,
      );

      const persisted = await pool.query(
        `SELECT leave_id, status FROM ops.phase1_driver_leave_requests WHERE driver_id = $1`,
        [driverId],
      );
      expect(persisted.rows).toHaveLength(1);
    });

    it("allows concurrent overlapping HTTP creation for different drivers across two instances", async () => {
      const driverA = `drv_diffA_${randomUUID().slice(0, 8)}`;
      const driverB = `drv_diffB_${randomUUID().slice(0, 8)}`;
      const tokenA = await mintAccessToken(harness1.jwtAuthService, driverIdentity(driverA));
      const tokenB = await mintAccessToken(harness1.jwtAuthService, driverIdentity(driverB));

      const body = {
        leaveType: "annual" as const,
        startTime: futureIso(3_600_000),
        endTime: futureIso(10_800_000),
        reason: "concurrent different drivers",
      };

      const [r1, r2] = await Promise.all([
        apiRequest(harness1.baseUrl, "POST", "/api/driver-leave/requests", {
          token: tokenA,
          body,
        }),
        apiRequest(harness2.baseUrl, "POST", "/api/driver-leave/requests", {
          token: tokenB,
          body,
        }),
      ]);

      expect([r1.status, r2.status].every((s) => s === 201)).toBe(true);
    });

    it("allows adjacent non-overlapping half-open intervals for the same driver across two instances", async () => {
      const driverId = `drv_adj_${randomUUID().slice(0, 8)}`;
      const driverToken = await mintAccessToken(harness1.jwtAuthService, driverIdentity(driverId));
      const boundary = futureIso(10_800_000);

      const first = await apiRequest(harness1.baseUrl, "POST", "/api/driver-leave/requests", {
        token: driverToken,
        body: {
          leaveType: "personal",
          startTime: futureIso(3_600_000),
          endTime: boundary,
          reason: "first block",
        },
      });
      expect(first.status).toBe(201);

      // Adjacent: starts exactly when the first block ends.
      const second = await apiRequest(harness2.baseUrl, "POST", "/api/driver-leave/requests", {
        token: driverToken,
        body: {
          leaveType: "personal",
          startTime: boundary,
          endTime: futureIso(21_600_000),
          reason: "adjacent block",
        },
      });
      expect(second.status).toBe(201);

      const rows = await pool.query(
        `SELECT leave_id FROM ops.phase1_driver_leave_requests WHERE driver_id = $1`,
        [driverId],
      );
      expect(rows.rows).toHaveLength(2);
    });
  });

  describe("Suite 5: Atomic Rollback & Fail-Closed Invariants Against Real PostgreSQL Faults", () => {
    it("rejects a real PostgreSQL CHECK-constraint write and persists no row (no stub, no mock)", async () => {
      const invalidRecord: DriverLeaveRecord = {
        leaveId: `lv_checkfail_${randomUUID().slice(0, 8)}`,
        driverId: `drv_checkfail_${randomUUID().slice(0, 8)}`,
        // Violates `CHECK (leave_type IN (...))` on ops.phase1_driver_leave_requests
        // for real; this is a genuine PostgreSQL constraint rejection, not a stub.
        leaveType: "not_a_real_leave_type" as unknown as DriverLeaveRecord["leaveType"],
        startTime: "2026-09-10T12:00:00.000Z",
        endTime: "2026-09-10T15:00:00.000Z",
        reason: "real db check-constraint probe",
        status: "pending",
        reviewedByPrincipalId: null,
        reviewedAt: null,
        reviewNotes: null,
        impactedShiftIds: [],
        createdAt: fixedNow.toISOString(),
        updatedAt: fixedNow.toISOString(),
      };

      await expect(repo1.save(invalidRecord)).rejects.toThrow();

      const check = await pool.query(
        `SELECT 1 FROM ops.phase1_driver_leave_requests WHERE leave_id = $1`,
        [invalidRecord.leaveId],
      );
      expect(check.rows).toHaveLength(0);
    });

    it("rolls back the entire approve transaction (status, shift annotation, suppression) when a real PostgreSQL trigger fails the suppression insert mid-transaction", async () => {
      const FAULT_TRIGGER_FN = "sr_leave_acceptance_force_fail_suppression";
      const FAULT_TRIGGER_NAME = "trg_sr_leave_acceptance_force_fail_suppression";
      const driverId = `drv_fault_${randomUUID().slice(0, 8)}`;
      const shiftId = `sh_fault_${randomUUID().slice(0, 8)}`;

      // Real PostgreSQL fixture trigger: fails the suppression INSERT for this
      // specific driver only, so the same transaction that already updated
      // the shift row must observe a genuine mid-transaction PostgreSQL error
      // (not a stubbed repository/DatabaseService).
      await pool.query(`
        CREATE OR REPLACE FUNCTION ${FAULT_TRIGGER_FN}() RETURNS trigger AS $$
        BEGIN
          IF NEW.driver_id = '${driverId}' THEN
            RAISE EXCEPTION 'SR_LEAVE_ACCEPTANCE_INJECTED_SUPPRESSION_FAILURE';
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `);
      await pool.query(`
        CREATE TRIGGER ${FAULT_TRIGGER_NAME}
        BEFORE INSERT ON ops.phase1_driver_matching_suppressions
        FOR EACH ROW EXECUTE FUNCTION ${FAULT_TRIGGER_FN}();
      `);

      try {
        await pool.query(
          `
          INSERT INTO ops.phase1_driver_shifts (
            shift_id, shift_no, driver_id, scheduled_start, scheduled_end, clock_in_at,
            clock_out_at, status, record, created_at, updated_at
          ) VALUES (
            $1, $3, $2, '2026-09-10T11:00:00.000Z', '2026-09-10T16:00:00.000Z',
            '2026-09-10T11:00:00.000Z', null, 'scheduled',
            '{"shiftId": "${shiftId}", "driverId": "${driverId}"}'::jsonb,
            now(), now()
          )
        `,
          [shiftId, driverId, `SFT-${shiftId}`],
        );

        const leave = await service1.createLeave(
          driverId,
          {
            leaveType: "sick",
            startTime: "2026-09-10T12:00:00.000Z",
            endTime: "2026-09-10T15:00:00.000Z",
            reason: "real trigger rollback probe",
          },
          fixedNow,
        );

        await expect(
          service1.reviewLeave(
            leave.leaveId,
            "ops_fault_probe",
            { decision: "approve" },
            fixedNow,
          ),
        ).rejects.toThrow(/SR_LEAVE_ACCEPTANCE_INJECTED_SUPPRESSION_FAILURE/);

        const leaveRow = await pool.query(
          `SELECT status FROM ops.phase1_driver_leave_requests WHERE leave_id = $1`,
          [leave.leaveId],
        );
        expect(leaveRow.rows[0].status).toBe("pending");

        const suppRow = await pool.query(
          `SELECT 1 FROM ops.phase1_driver_matching_suppressions WHERE source_incident_id = $1`,
          [leave.leaveId],
        );
        expect(suppRow.rows).toHaveLength(0);

        const shiftRow = await pool.query(
          `SELECT record FROM ops.phase1_driver_shifts WHERE shift_id = $1`,
          [shiftId],
        );
        expect(Boolean(shiftRow.rows[0].record.leaveReassigned)).toBe(false);
      } finally {
        await pool.query(
          `DROP TRIGGER IF EXISTS ${FAULT_TRIGGER_NAME} ON ops.phase1_driver_matching_suppressions`,
        );
        await pool.query(`DROP FUNCTION IF EXISTS ${FAULT_TRIGGER_FN}()`);
      }
    });
  });
});
