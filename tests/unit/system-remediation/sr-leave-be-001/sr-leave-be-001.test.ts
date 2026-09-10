import { describe, it, expect, beforeEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  DRIVER_LEAVE_TYPES,
  DRIVER_LEAVE_STATUSES,
  DRIVER_LEAVE_ERROR_CODES,
  MAX_PAST_APPLICATION_GRACE_MS,
  DriverLeaveService,
  DriverLeaveRepository,
  DriverLeaveController,
} from "../../../../apps/api/src/modules/driver-leave";
import { ApiRequestError } from "../../../../apps/api/src/common/api-envelope";
import type { BootstrapRequestIdentity } from "../../../../apps/api/src/common/auth";

describe("SR-LEAVE-BE-001: 請假資料與審核／班次連動服務", () => {
  const repoRoot = path.resolve(__dirname, "../../../../");
  const migrationPath = path.join(
    repoRoot,
    "infra/migrations/V0094__sr_driver_leave.sql",
  );
  const schemaAllocPath = path.join(
    repoRoot,
    "docs/04-uat/system-remediation-20260906/schema-allocation.json",
  );

  describe("1. Schema Allocation & Migration Invariants", () => {
    it("allocates V0094__sr_driver_leave.sql in schema-allocation.json without conflict", () => {
      expect(fs.existsSync(schemaAllocPath)).toBe(true);
      const allocData = JSON.parse(fs.readFileSync(schemaAllocPath, "utf-8"));
      const leaveAlloc = allocData.allocations.find(
        (a: any) => a.task_id === "SR-LEAVE-BE-001",
      );
      expect(leaveAlloc).toBeDefined();
      expect(leaveAlloc.version).toBe("V0094");
      expect(leaveAlloc.migration_filename).toBe("V0094__sr_driver_leave.sql");
      expect(leaveAlloc.domain).toBe("driver_leave");
      expect(leaveAlloc.target_schema).toBe("ops");
      expect(leaveAlloc.primary_tables).toContain("ops.phase1_driver_leave_requests");
    });

    it("verifies V0094__sr_driver_leave.sql migration file exists and has correct DDL", () => {
      expect(fs.existsSync(migrationPath)).toBe(true);
      const sql = fs.readFileSync(migrationPath, "utf-8");

      expect(sql).toContain("CREATE TABLE IF NOT EXISTS ops.phase1_driver_leave_requests");
      expect(sql).toContain("leave_id                    varchar(100) PRIMARY KEY");
      expect(sql).toContain("driver_id                   varchar(100) NOT NULL");
      expect(sql).toContain("leave_type                  varchar(50) NOT NULL");
      expect(sql).toContain("start_time                  timestamptz NOT NULL");
      expect(sql).toContain("end_time                    timestamptz NOT NULL");
      expect(sql).toContain("reason                      text NOT NULL");
      expect(sql).toContain("status                      varchar(30) NOT NULL DEFAULT 'pending'");
      expect(sql).toContain("impacted_shift_ids          text[] NOT NULL DEFAULT '{}'");
      expect(sql).toContain("record                      jsonb NOT NULL");

      // Indexes
      expect(sql).toContain("CREATE INDEX IF NOT EXISTS idx_driver_leave_requests_driver");
      expect(sql).toContain("CREATE INDEX IF NOT EXISTS idx_driver_leave_requests_status");
      expect(sql).toContain("CREATE INDEX IF NOT EXISTS idx_driver_leave_requests_driver_status");
      expect(sql).toContain("CREATE INDEX IF NOT EXISTS idx_driver_leave_requests_time_range");

      // Foreign key relaxation for matching suppressions
      expect(sql).toContain("ALTER TABLE ops.phase1_driver_matching_suppressions");
      expect(sql).toContain("DROP CONSTRAINT IF EXISTS phase1_driver_matching_suppressions_source_incident_id_fkey");
    });
  });

  describe("2. DriverLeaveService: AC-LEAVE-POS-1 (司機申請與撤回)", () => {
    let repo: DriverLeaveRepository;
    let service: DriverLeaveService;
    const now = new Date("2026-09-10T10:00:00.000Z");

    beforeEach(() => {
      repo = new DriverLeaveRepository();
      service = new DriverLeaveService(repo);
    });

    it("creates a valid leave request within grace period, resulting in status 'pending'", async () => {
      // 10 minutes in the past is within the 15m grace window
      const startTime = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
      const endTime = new Date(now.getTime() + 8 * 3600 * 1000).toISOString();

      const leave = await service.createLeave(
        "driver_001",
        {
          leaveType: "personal",
          startTime,
          endTime,
          reason: "Urgent personal family matter",
        },
        now,
      );

      expect(leave.leaveId).toMatch(/^lv_/);
      expect(leave.driverId).toBe("driver_001");
      expect(leave.leaveType).toBe("personal");
      expect(leave.status).toBe("pending");
      expect(leave.startTime).toBe(startTime);
      expect(leave.endTime).toBe(endTime);
      expect(leave.reason).toBe("Urgent personal family matter");
      expect(leave.reviewedByPrincipalId).toBeNull();
      expect(leave.reviewedAt).toBeNull();
      expect(leave.reviewNotes).toBeNull();
      expect(leave.impactedShiftIds).toEqual([]);
      expect(leave.createdAt).toBe(now.toISOString());
    });

    it("allows the applicant driver to withdraw a pending leave request", async () => {
      const startTime = new Date(now.getTime() + 3600 * 1000).toISOString();
      const endTime = new Date(now.getTime() + 5 * 3600 * 1000).toISOString();

      const created = await service.createLeave(
        "driver_001",
        {
          leaveType: "annual",
          startTime,
          endTime,
          reason: "Planned vacation",
        },
        now,
      );

      const withdrawn = await service.withdrawLeave(
        created.leaveId,
        "driver_001",
        { reason: "Plans changed" },
        now,
      );

      expect(withdrawn.leaveId).toBe(created.leaveId);
      expect(withdrawn.status).toBe("withdrawn");
      expect(withdrawn.reviewNotes).toContain("Plans changed");
    });
  });

  describe("3. DriverLeaveService: AC-LEAVE-POS-2 (主管審核與班表連動)", () => {
    let repo: DriverLeaveRepository;
    let service: DriverLeaveService;
    const now = new Date("2026-09-10T10:00:00.000Z");

    beforeEach(() => {
      repo = new DriverLeaveRepository();
      service = new DriverLeaveService(repo);
    });

    it("approves pending leave, annotates overlapping shifts with leaveReassigned, and populates impactedShiftIds", async () => {
      const leaveStart = new Date("2026-09-11T08:00:00.000Z").toISOString();
      const leaveEnd = new Date("2026-09-11T17:00:00.000Z").toISOString();

      // Seed mock shifts
      repo.seedShifts([
        {
          shiftId: "shift_overlap_01",
          driverId: "driver_001",
          scheduledStart: "2026-09-11T07:00:00.000Z",
          scheduledEnd: "2026-09-11T12:00:00.000Z",
          clockInAt: "2026-09-11T07:00:00.000Z",
          clockOutAt: null,
          record: { vehicleId: "veh_123" },
        },
        {
          shiftId: "shift_overlap_02",
          driverId: "driver_001",
          scheduledStart: "2026-09-11T13:00:00.000Z",
          scheduledEnd: "2026-09-11T20:00:00.000Z",
          clockInAt: "2026-09-11T13:00:00.000Z",
          clockOutAt: null,
          record: { vehicleId: "veh_123" },
        },
        {
          shiftId: "shift_no_overlap_03",
          driverId: "driver_001",
          scheduledStart: "2026-09-12T08:00:00.000Z",
          scheduledEnd: "2026-09-12T17:00:00.000Z",
          clockInAt: "2026-09-12T08:00:00.000Z",
          clockOutAt: null,
          record: { vehicleId: "veh_123" },
        },
        {
          shiftId: "shift_other_driver_04",
          driverId: "driver_002",
          scheduledStart: "2026-09-11T09:00:00.000Z",
          scheduledEnd: "2026-09-11T15:00:00.000Z",
          clockInAt: "2026-09-11T09:00:00.000Z",
          clockOutAt: null,
          record: { vehicleId: "veh_456" },
        },
      ]);

      const created = await service.createLeave(
        "driver_001",
        {
          leaveType: "sick",
          startTime: leaveStart,
          endTime: leaveEnd,
          reason: "Fever and rest",
        },
        now,
      );

      const approved = await service.reviewLeave(
        created.leaveId,
        "ops_manager_999",
        { decision: "approve", reviewNotes: "Get well soon" },
        now,
      );

      expect(approved.status).toBe("approved");
      expect(approved.reviewedByPrincipalId).toBe("ops_manager_999");
      expect(approved.reviewNotes).toBe("Get well soon");
      expect(approved.impactedShiftIds).toEqual([
        "shift_overlap_01",
        "shift_overlap_02",
      ]);

      // Check annotated shift records
      const shift1 = repo.getMemoryShift("shift_overlap_01");
      expect(shift1?.record.leaveReassigned).toBe(true);
      expect(shift1?.record.reassignedReason).toBe("DRIVER_ON_LEAVE");
      expect(shift1?.record.leaveId).toBe(created.leaveId);

      const shift3 = repo.getMemoryShift("shift_no_overlap_03");
      expect(shift3?.record.leaveReassigned).toBeUndefined();

      const shift4 = repo.getMemoryShift("shift_other_driver_04");
      expect(shift4?.record.leaveReassigned).toBeUndefined();
    });

    it("rejects pending leave, setting status to 'rejected' without impacting shifts", async () => {
      const created = await service.createLeave(
        "driver_001",
        {
          leaveType: "emergency",
          startTime: new Date(now.getTime() + 3600 * 1000).toISOString(),
          endTime: new Date(now.getTime() + 6 * 3600 * 1000).toISOString(),
          reason: "Need half day off",
        },
        now,
      );

      const rejected = await service.reviewLeave(
        created.leaveId,
        "ops_manager_999",
        { decision: "reject", reviewNotes: "Staffing shortage" },
        now,
      );

      expect(rejected.status).toBe("rejected");
      expect(rejected.reviewNotes).toBe("Staffing shortage");
      expect(rejected.impactedShiftIds).toEqual([]);
    });
  });

  describe("4. DriverLeaveService: AC-LEAVE-POS-3 & POS-4 (出勤防護與在線資格壓制)", () => {
    let repo: DriverLeaveRepository;
    let service: DriverLeaveService;
    const leaveStart = new Date("2026-09-10T12:00:00.000Z");
    const leaveEnd = new Date("2026-09-10T18:00:00.000Z");

    beforeEach(async () => {
      repo = new DriverLeaveRepository();
      service = new DriverLeaveService(repo);

      const leave = await service.createLeave(
        "driver_001",
        {
          leaveType: "sick",
          startTime: leaveStart.toISOString(),
          endTime: leaveEnd.toISOString(),
          reason: "Medical appointment",
        },
        new Date("2026-09-10T11:50:00.000Z"),
      );

      await service.reviewLeave(
        leave.leaveId,
        "ops_manager",
        { decision: "approve" },
        new Date("2026-09-10T11:55:00.000Z"),
      );
    });

    it("AC-LEAVE-POS-3: blocks clock-in with 409 DRIVER_ON_LEAVE during approved leave period", async () => {
      const insideLeave = new Date("2026-09-10T14:00:00.000Z");
      await expect(
        service.assertDriverCanClockIn("driver_001", insideLeave),
      ).rejects.toThrow(ApiRequestError);

      try {
        await service.assertDriverCanClockIn("driver_001", insideLeave);
      } catch (err: any) {
        expect(err.getStatus()).toBe(409);
        expect(err.code).toBe(DRIVER_LEAVE_ERROR_CODES.DRIVER_ON_LEAVE);
      }

      // Outside leave window is allowed
      const outsideLeave = new Date("2026-09-10T19:00:00.000Z");
      await expect(
        service.assertDriverCanClockIn("driver_001", outsideLeave),
      ).resolves.toBeUndefined();
    });

    it("AC-LEAVE-POS-3: marks eligibility as 'ineligible' during approved leave period", async () => {
      const insideLeave = new Date("2026-09-10T15:00:00.000Z");
      const eligibility = await service.getDriverPresenceEligibility(
        "driver_001",
        insideLeave,
      );

      expect(eligibility.onLeave).toBe(true);
      expect(eligibility.eligibility).toBe("ineligible");
      expect(eligibility.activeLeave).not.toBeNull();

      // Outside leave window
      const outsideLeave = new Date("2026-09-10T19:00:00.000Z");
      const outsideEligibility = await service.getDriverPresenceEligibility(
        "driver_001",
        outsideLeave,
      );
      expect(outsideEligibility.onLeave).toBe(false);
      expect(outsideEligibility.eligibility).toBe("eligible");
    });

    it("AC-LEAVE-POS-4: records matching suppression in ops.phase1_driver_matching_suppressions", async () => {
      const suppression = repo.getMemorySuppression(expect.any(String) as any) ||
        Array.from((repo as any).suppressions.values())[0] as any;

      expect(suppression).toBeDefined();
      expect(suppression.driverId).toBe("driver_001");
      expect(suppression.reasonCode).toBe("DRIVER_ON_LEAVE");
      expect(suppression.active).toBe(true);
      expect(suppression.expiresAt).toBe(leaveEnd.toISOString());
    });
  });

  describe("5. DriverLeaveService: AC-LEAVE-NEG-1 (非法日期與逾期阻擋)", () => {
    let service: DriverLeaveService;
    const now = new Date("2026-09-10T10:00:00.000Z");

    beforeEach(() => {
      const repo = new DriverLeaveRepository();
      service = new DriverLeaveService(repo);
    });

    it("rejects endTime <= startTime with 400 LEAVE_INVALID_TIME_RANGE", async () => {
      const startTime = "2026-09-10T12:00:00.000Z";
      const endTime = "2026-09-10T11:00:00.000Z";

      await expect(
        service.createLeave(
          "driver_001",
          {
            leaveType: "personal",
            startTime,
            endTime,
            reason: "Invalid end time",
          },
          now,
        ),
      ).rejects.toMatchObject({
        status: 400,
        code: DRIVER_LEAVE_ERROR_CODES.LEAVE_INVALID_TIME_RANGE,
      });
    });

    it("rejects startTime older than 15 minutes with 400 LEAVE_INVALID_TIME_RANGE", async () => {
      // 16 minutes in past exceeds MAX_PAST_APPLICATION_GRACE_MS
      const startTime = new Date(now.getTime() - 16 * 60 * 1000).toISOString();
      const endTime = new Date(now.getTime() + 4 * 3600 * 1000).toISOString();

      await expect(
        service.createLeave(
          "driver_001",
          {
            leaveType: "personal",
            startTime,
            endTime,
            reason: "Too late application",
          },
          now,
        ),
      ).rejects.toMatchObject({
        status: 400,
        code: DRIVER_LEAVE_ERROR_CODES.LEAVE_INVALID_TIME_RANGE,
      });
    });

    it("rejects invalid date strings with 400 LEAVE_INVALID_TIME_RANGE", async () => {
      await expect(
        service.createLeave(
          "driver_001",
          {
            leaveType: "sick",
            startTime: "not-a-date",
            endTime: "2026-09-10T15:00:00.000Z",
            reason: "Invalid start string",
          },
          now,
        ),
      ).rejects.toMatchObject({
        status: 400,
        code: DRIVER_LEAVE_ERROR_CODES.LEAVE_INVALID_TIME_RANGE,
      });
    });

    it("rejects missing required fields with 400 LEAVE_MISSING_REQUIRED_FIELDS", async () => {
      await expect(
        service.createLeave(
          "driver_001",
          {
            leaveType: "sick",
            startTime: "2026-09-10T11:00:00.000Z",
            endTime: "2026-09-10T15:00:00.000Z",
            reason: "   ",
          },
          now,
        ),
      ).rejects.toMatchObject({
        status: 400,
        code: DRIVER_LEAVE_ERROR_CODES.LEAVE_MISSING_REQUIRED_FIELDS,
      });
    });

    it("rejects invalid leaveType with 400 LEAVE_MISSING_REQUIRED_FIELDS", async () => {
      await expect(
        service.createLeave(
          "driver_001",
          {
            leaveType: "sabbatical" as any,
            startTime: "2026-09-10T11:00:00.000Z",
            endTime: "2026-09-10T15:00:00.000Z",
            reason: "Time off",
          },
          now,
        ),
      ).rejects.toMatchObject({
        status: 400,
        code: DRIVER_LEAVE_ERROR_CODES.LEAVE_MISSING_REQUIRED_FIELDS,
      });
    });
  });

  describe("6. DriverLeaveService: AC-LEAVE-NEG-2 (重疊假單阻擋)", () => {
    let service: DriverLeaveService;
    const now = new Date("2026-09-10T10:00:00.000Z");

    beforeEach(async () => {
      const repo = new DriverLeaveRepository();
      service = new DriverLeaveService(repo);

      await service.createLeave(
        "driver_001",
        {
          leaveType: "personal",
          startTime: "2026-09-11T09:00:00.000Z",
          endTime: "2026-09-11T17:00:00.000Z",
          reason: "Existing leave",
        },
        now,
      );
    });

    it("rejects overlapping leave for the same driver with 409 LEAVE_OVERLAPPING_REQUEST", async () => {
      await expect(
        service.createLeave(
          "driver_001",
          {
            leaveType: "sick",
            startTime: "2026-09-11T12:00:00.000Z",
            endTime: "2026-09-11T14:00:00.000Z",
            reason: "Doctor appointment during leave",
          },
          now,
        ),
      ).rejects.toMatchObject({
        status: 409,
        code: DRIVER_LEAVE_ERROR_CODES.LEAVE_OVERLAPPING_REQUEST,
      });
    });

    it("allows another driver to submit leave in the same time range", async () => {
      const leave = await service.createLeave(
        "driver_002",
        {
          leaveType: "annual",
          startTime: "2026-09-11T09:00:00.000Z",
          endTime: "2026-09-11T17:00:00.000Z",
          reason: "Different driver vacation",
        },
        now,
      );

      expect(leave.driverId).toBe("driver_002");
      expect(leave.status).toBe("pending");
    });

    it("allows new leave after previous overlapping leave is withdrawn", async () => {
      const existing = (await service.listLeaves({ driverId: "driver_001" })).items[0]!;
      await service.withdrawLeave(existing.leaveId, "driver_001", undefined, now);

      const replacement = await service.createLeave(
        "driver_001",
        {
          leaveType: "sick",
          startTime: "2026-09-11T10:00:00.000Z",
          endTime: "2026-09-11T16:00:00.000Z",
          reason: "Replacement request after withdraw",
        },
        now,
      );

      expect(replacement.status).toBe("pending");
    });
  });

  describe("7. DriverLeaveService: AC-LEAVE-NEG-3 (越權與非法狀態轉移防護)", () => {
    let service: DriverLeaveService;
    let pendingLeaveId: string;
    const now = new Date("2026-09-10T10:00:00.000Z");

    beforeEach(async () => {
      const repo = new DriverLeaveRepository();
      service = new DriverLeaveService(repo);

      const created = await service.createLeave(
        "driver_001",
        {
          leaveType: "personal",
          startTime: "2026-09-11T09:00:00.000Z",
          endTime: "2026-09-11T17:00:00.000Z",
          reason: "Driver 1 leave",
        },
        now,
      );
      pendingLeaveId = created.leaveId;
    });

    it("prevents Driver B from withdrawing Driver A's leave with 403 LEAVE_FORBIDDEN_ACCESS", async () => {
      await expect(
        service.withdrawLeave(pendingLeaveId, "driver_002", undefined, now),
      ).rejects.toMatchObject({
        status: 403,
        code: DRIVER_LEAVE_ERROR_CODES.LEAVE_FORBIDDEN_ACCESS,
      });
    });

    it("prevents withdrawing an already withdrawn leave with 409 LEAVE_INVALID_STATE_TRANSITION", async () => {
      await service.withdrawLeave(pendingLeaveId, "driver_001", undefined, now);

      await expect(
        service.withdrawLeave(pendingLeaveId, "driver_001", undefined, now),
      ).rejects.toMatchObject({
        status: 409,
        code: DRIVER_LEAVE_ERROR_CODES.LEAVE_INVALID_STATE_TRANSITION,
      });
    });

    it("prevents reviewing an already reviewed leave with 409 LEAVE_INVALID_STATE_TRANSITION", async () => {
      await service.reviewLeave(
        pendingLeaveId,
        "ops_manager",
        { decision: "approve" },
        now,
      );

      await expect(
        service.reviewLeave(
          pendingLeaveId,
          "ops_manager",
          { decision: "reject" },
          now,
        ),
      ).rejects.toMatchObject({
        status: 409,
        code: DRIVER_LEAVE_ERROR_CODES.LEAVE_INVALID_STATE_TRANSITION,
      });
    });

    it("prevents withdrawing an approved leave with 409 LEAVE_INVALID_STATE_TRANSITION", async () => {
      await service.reviewLeave(
        pendingLeaveId,
        "ops_manager",
        { decision: "approve" },
        now,
      );

      await expect(
        service.withdrawLeave(pendingLeaveId, "driver_001", undefined, now),
      ).rejects.toMatchObject({
        status: 409,
        code: DRIVER_LEAVE_ERROR_CODES.LEAVE_INVALID_STATE_TRANSITION,
      });
    });

    it("returns 404 LEAVE_NOT_FOUND when querying or acting on non-existent leave", async () => {
      await expect(service.getLeaveById("lv_nonexistent")).rejects.toMatchObject({
        status: 404,
        code: DRIVER_LEAVE_ERROR_CODES.LEAVE_NOT_FOUND,
      });
    });
  });

  describe("8. DriverLeaveController: RBAC & Envelope Testing", () => {
    let controller: DriverLeaveController;
    let service: DriverLeaveService;
    const now = new Date("2026-09-10T10:00:00.000Z");

    beforeEach(() => {
      const repo = new DriverLeaveRepository();
      service = new DriverLeaveService(repo);
      controller = new DriverLeaveController(service);
    });

    it("allows driver_user to submit leave and encapsulates response in ApiSuccessEnvelope", async () => {
      const identity: BootstrapRequestIdentity = {
        realm: "driver",
        actorType: "driver_user",
        actorId: "driver_001",
        roles: ["driver_user"],
        scopes: ["driver:read", "driver:write"],
        tenantId: null,
        partnerId: null,
        partnerProgramId: null,
        partnerEntrySlug: null,
        drtsPassengerId: null,
        roleFamilies: ["driver_user"],
        requestId: "req_test_001",
        authTime: null,
        amr: [],
        sessionId: null,
      };

      const result = await controller.createDriverLeave(
        {
          leaveType: "personal",
          startTime: new Date(now.getTime() + 3600 * 1000).toISOString(),
          endTime: new Date(now.getTime() + 5 * 3600 * 1000).toISOString(),
          reason: "Dentist appointment",
        },
        identity,
        "req_test_001",
      );

      expect(result.meta.requestId).toBe("req_test_001");
      expect(result.data.driverId).toBe("driver_001");
      expect(result.data.status).toBe("pending");
    });

    it("enforces driver isolation on GET /api/driver-leave/requests", async () => {
      // Driver identity
      const driverIdentity: BootstrapRequestIdentity = {
        realm: "driver",
        actorType: "driver_user",
        actorId: "driver_001",
        roles: ["driver_user"],
        scopes: ["driver:read"],
        tenantId: null,
        partnerId: null,
        partnerProgramId: null,
        partnerEntrySlug: null,
        drtsPassengerId: null,
        roleFamilies: ["driver_user"],
        requestId: "req_test_002",
        authTime: null,
        amr: [],
        sessionId: null,
      };

      // Driver trying to query driver_002's leaves throws 403
      await expect(
        controller.listDriverLeaves({ driverId: "driver_002" }, driverIdentity),
      ).rejects.toMatchObject({
        status: 403,
        code: DRIVER_LEAVE_ERROR_CODES.LEAVE_FORBIDDEN_ACCESS,
      });

      // Query without filter automatically restricted to driver_001
      const listRes = await controller.listDriverLeaves({}, driverIdentity);
      expect(listRes.data).toBeDefined();
    });

    it("prevents driver from calling review endpoint with 403 LEAVE_FORBIDDEN_ACCESS", async () => {
      const driverIdentity: BootstrapRequestIdentity = {
        realm: "driver",
        actorType: "driver_user",
        actorId: "driver_001",
        roles: ["driver_user"],
        scopes: ["driver:write"],
        tenantId: null,
        partnerId: null,
        partnerProgramId: null,
        partnerEntrySlug: null,
        drtsPassengerId: null,
        roleFamilies: ["driver_user"],
        requestId: "req_test_003",
        authTime: null,
        amr: [],
        sessionId: null,
      };

      await expect(
        controller.reviewDriverLeave(
          "lv_123",
          { decision: "approve" },
          driverIdentity,
        ),
      ).rejects.toMatchObject({
        status: 403,
        code: DRIVER_LEAVE_ERROR_CODES.LEAVE_FORBIDDEN_ACCESS,
      });
    });

    it("allows ops_user to review leave requests", async () => {
      // Create pending leave first
      const created = await service.createLeave(
        "driver_001",
        {
          leaveType: "annual",
          startTime: new Date(now.getTime() + 3600 * 1000).toISOString(),
          endTime: new Date(now.getTime() + 6 * 3600 * 1000).toISOString(),
          reason: "Day off",
        },
        now,
      );

      const opsIdentity: BootstrapRequestIdentity = {
        realm: "ops",
        actorType: "ops_user",
        actorId: "ops_manager_01",
        roles: ["ops_user"],
        scopes: ["driver:read", "driver:write"],
        tenantId: "tenant_001",
        partnerId: null,
        partnerProgramId: null,
        partnerEntrySlug: null,
        drtsPassengerId: null,
        roleFamilies: ["ops_user"],
        requestId: "req_test_004",
        authTime: null,
        amr: [],
        sessionId: null,
      };

      const res = await controller.reviewDriverLeave(
        created.leaveId,
        { decision: "approve", reviewNotes: "Approved by manager" },
        opsIdentity,
        "req_test_004",
      );

      expect(res.data.status).toBe("approved");
      expect(res.data.reviewedByPrincipalId).toBe("ops_manager_01");
      expect(res.data.reviewNotes).toBe("Approved by manager");
    });
  });

  describe("9. DB Restart and Persistence Invariant", () => {
    it("preserves leaves and shift annotations across repository instances (simulating restart)", async () => {
      const repo1 = new DriverLeaveRepository();
      const service1 = new DriverLeaveService(repo1);

      repo1.seedShifts([
        {
          shiftId: "shift_persisted_01",
          driverId: "driver_001",
          scheduledStart: "2026-09-11T08:00:00.000Z",
          scheduledEnd: "2026-09-11T17:00:00.000Z",
          clockInAt: "2026-09-11T08:00:00.000Z",
          clockOutAt: null,
          record: { note: "original shift" },
        },
      ]);

      const created = await service1.createLeave(
        "driver_001",
        {
          leaveType: "sick",
          startTime: "2026-09-11T08:00:00.000Z",
          endTime: "2026-09-11T17:00:00.000Z",
          reason: "Health checkup",
        },
        new Date("2026-09-10T10:00:00.000Z"),
      );

      const approved = await service1.reviewLeave(
        created.leaveId,
        "mgr_1",
        { decision: "approve" },
        new Date("2026-09-10T10:30:00.000Z"),
      );

      expect(approved.status).toBe("approved");
      expect(approved.impactedShiftIds).toContain("shift_persisted_01");

      // Serialize state from repo1 and load into repo2
      const serializedLeaves = await repo1.findByDriver("driver_001");
      const repo2 = new DriverLeaveRepository();
      for (const l of serializedLeaves) {
        await repo2.save(l);
      }
      const service2 = new DriverLeaveService(repo2);

      const reloadedLeave = await service2.getLeaveById(created.leaveId);
      expect(reloadedLeave.leaveId).toBe(created.leaveId);
      expect(reloadedLeave.status).toBe("approved");
      expect(reloadedLeave.impactedShiftIds).toContain("shift_persisted_01");
      expect(reloadedLeave.reviewedByPrincipalId).toBe("mgr_1");

      // Verify presence eligibility is still ineligible on reloaded service
      const eligibility = await service2.getDriverPresenceEligibility(
        "driver_001",
        new Date("2026-09-11T10:00:00.000Z"),
      );
      expect(eligibility.onLeave).toBe(true);
      expect(eligibility.eligibility).toBe("ineligible");
    });
  });
});
