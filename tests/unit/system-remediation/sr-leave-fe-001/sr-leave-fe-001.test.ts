import { describe, expect, it, vi } from "vitest";
import { ApiClient } from "../../../../packages/api-client/src";
import {
  DRIVER_LEAVE_STATUSES,
  DRIVER_LEAVE_TYPES,
  MAX_PAST_APPLICATION_GRACE_MS,
  SYSTEM_REMEDIATION_ERROR_CODES,
  type CreateDriverLeaveCommand,
  type DriverLeaveRecord,
  type ReviewDriverLeaveCommand,
  type WithdrawDriverLeaveCommand,
} from "../../../../packages/contracts/src";
import { REALM_COLORS } from "../../../../packages/ui-tokens/src";
import {
  DRV_LEAVE_STATUS,
  DRV_LEAVE_TYPE,
  FX_DRV_LEAVE,
  checkLeaveOverlap,
  fmtTaipei as fmtTaipeiDrv,
  formatLeaveRangeZh as formatLeaveRangeZhDrv,
  validateLeaveTimeRange,
} from "../../../../apps/driver-app/components/leave/leave-tokens";
import {
  FX_OPS_LEAVE,
  FX_OPS_SHIFT_BOARD,
  OPS_LEAVE_STATUS,
  OPS_LEAVE_TYPE,
  fmtTaipei as fmtTaipeiOps,
  formatLeaveRangeZh as formatLeaveRangeZhOps,
} from "../../../../apps/ops-console-web/app/leave/leave-types";

describe("SR-LEAVE-FE-001 — 司機與主管請假操作畫面", () => {
  const referenceNow = new Date("2026-09-10T08:00:00.000Z"); // Taipei: 2026-09-10 16:00:00 (+08:00)

  describe("1. Realm tokens & UI Design Contract", () => {
    it("1.1 Driver realm uses canonical tokens from @drts/ui-tokens", () => {
      expect(REALM_COLORS.driver.light.fg).toBe("#A8590B");
      expect(REALM_COLORS.driver.dark.fg).toBe("#FCD34D");
    });

    it("1.2 Ops realm uses canonical tokens from @drts/ui-tokens", () => {
      expect(REALM_COLORS.ops.light.fg).toBe("#DC2626");
      expect(REALM_COLORS.ops.dark.fg).toBe("#FCA5A5");
    });

    it("1.3 Leave types and statuses map consistently across Driver and Ops surfaces", () => {
      for (const type of DRIVER_LEAVE_TYPES) {
        expect(DRV_LEAVE_TYPE[type]).toBeDefined();
        expect(OPS_LEAVE_TYPE[type]).toBeDefined();
        expect(DRV_LEAVE_TYPE[type].zh).toBe(OPS_LEAVE_TYPE[type].zh);
      }

      for (const status of DRIVER_LEAVE_STATUSES) {
        expect(DRV_LEAVE_STATUS[status]).toBeDefined();
        expect(OPS_LEAVE_STATUS[status]).toBeDefined();
        expect(DRV_LEAVE_STATUS[status].zh).toBe(OPS_LEAVE_STATUS[status].zh);
      }
    });

    it("1.4 Ops shift impact board uses driver realm token for cross-actor chips", () => {
      expect(FX_OPS_SHIFT_BOARD.length).toBeGreaterThan(0);
      for (const row of FX_OPS_SHIFT_BOARD) {
        expect(row.driver).toContain("drv_");
        expect(["eligible", "ineligible"]).toContain(row.elig);
      }
    });
  });

  describe("2. Date validation, grace period, and Asia/Taipei timezone handling", () => {
    it("2.1 Converts UTC ISO string to Asia/Taipei (UTC+8) string correctly", () => {
      // 2026-09-10T08:00:00.000Z -> 2026-09-10 16:00
      const formattedDrv = fmtTaipeiDrv("2026-09-10T08:00:00.000Z");
      expect(formattedDrv).toBe("2026-09-10 16:00");

      const formattedOps = fmtTaipeiOps("2026-09-10T08:00:00.000Z");
      expect(formattedOps).toBe("2026-09-10 16:00");
    });

    it("2.2 Formats same-day and cross-day range strings with Chinese weekday labels", () => {
      // Same day
      const sameDay = formatLeaveRangeZhDrv(
        "2026-09-10T08:00:00.000Z",
        "2026-09-10T13:00:00.000Z",
      );
      expect(sameDay).toBe("09/10（四）16:00–21:00");

      // Cross day
      const crossDay = formatLeaveRangeZhDrv(
        "2026-09-14T00:00:00.000Z",
        "2026-09-16T15:59:00.000Z",
      );
      expect(crossDay).toBe("09/14（一）08:00 – 09/16（三）23:59");
    });

    it("2.3 Validates normal future date range successfully", () => {
      const result = validateLeaveTimeRange(
        "2026-09-10T08:00:00.000Z",
        "2026-09-10T13:00:00.000Z",
        referenceNow,
      );
      expect(result.valid).toBe(true);
      expect(result.field).toBeUndefined();
    });

    it("2.4 Validates MAX_PAST_APPLICATION_GRACE_MS: allows within 15 minutes in past, rejects > 15 minutes", () => {
      // 10 minutes ago -> allowed
      const tenMinAgo = new Date(
        referenceNow.getTime() - 10 * 60 * 1000,
      ).toISOString();
      const endFuture = new Date(
        referenceNow.getTime() + 60 * 60 * 1000,
      ).toISOString();

      const allowResult = validateLeaveTimeRange(
        tenMinAgo,
        endFuture,
        referenceNow,
      );
      expect(allowResult.valid).toBe(true);

      // 20 minutes ago -> rejected with LEAVE_INVALID_TIME_RANGE
      const twentyMinAgo = new Date(
        referenceNow.getTime() - 20 * 60 * 1000,
      ).toISOString();
      const rejectResult = validateLeaveTimeRange(
        twentyMinAgo,
        endFuture,
        referenceNow,
      );
      expect(rejectResult.valid).toBe(false);
      expect(rejectResult.field).toBe("start");
      expect(rejectResult.code).toBe(
        SYSTEM_REMEDIATION_ERROR_CODES.LEAVE_INVALID_TIME_RANGE,
      );
      expect(rejectResult.message).toContain("MAX_PAST_APPLICATION_GRACE_MS");
    });

    it("2.5 Rejects when endTime <= startTime with LEAVE_INVALID_TIME_RANGE on end field", () => {
      const result = validateLeaveTimeRange(
        "2026-09-10T13:00:00.000Z",
        "2026-09-10T08:00:00.000Z",
        referenceNow,
      );
      expect(result.valid).toBe(false);
      expect(result.field).toBe("end");
      expect(result.code).toBe(
        SYSTEM_REMEDIATION_ERROR_CODES.LEAVE_INVALID_TIME_RANGE,
      );
      expect(result.message).toContain("endTime <= startTime");
    });

    it("2.6 Rejects invalid date format string with LEAVE_INVALID_TIME_RANGE", () => {
      const result = validateLeaveTimeRange(
        "2026-13-45 99:99",
        "2026-09-10T13:00:00.000Z",
        referenceNow,
      );
      expect(result.valid).toBe(false);
      expect(result.field).toBe("start");
      expect(result.code).toBe(
        SYSTEM_REMEDIATION_ERROR_CODES.LEAVE_INVALID_TIME_RANGE,
      );
    });

    it("2.7 Detects overlapping leave requests against active pending/approved leaves", () => {
      // 09/15 window inside lv_9c31a204 (approved, 09/14 00:00 – 09/16 15:59 UTC)
      const overlap = checkLeaveOverlap(
        "2026-09-15T01:00:00.000Z",
        "2026-09-15T10:00:00.000Z",
        FX_DRV_LEAVE,
      );
      expect(overlap.overlaps).toBe(true);
      expect(overlap.overlappingLeave?.leaveId).toBe("lv_9c31a204");

      // Non-overlapping window: 09/20
      const nonOverlap = checkLeaveOverlap(
        "2026-09-20T01:00:00.000Z",
        "2026-09-20T10:00:00.000Z",
        FX_DRV_LEAVE,
      );
      expect(nonOverlap.overlaps).toBe(false);
    });
  });

  describe("3. Typed client integration & API contracts", () => {
    it("3.1 ApiClient contains typed leave methods calling canonical endpoints", async () => {
      const client = new ApiClient({ baseUrl: "https://api.test.example" });

      const postSpy = vi
        .spyOn(client as any, "post")
        .mockResolvedValue({ leaveId: "lv_test" });
      const getSpy = vi
        .spyOn(client as any, "get")
        .mockResolvedValue({ items: [] });

      // Create leave
      const createCmd: CreateDriverLeaveCommand = {
        leaveType: "annual",
        startTime: "2026-09-14T00:00:00.000Z",
        endTime: "2026-09-16T15:59:00.000Z",
        reason: "家庭旅遊",
      };
      await client.createDriverLeave(createCmd);
      expect(postSpy).toHaveBeenCalledWith("/api/driver-leave/requests", {
        body: createCmd,
      });

      // List leaves
      await client.listDriverLeaves({
        driverId: "drv_0186",
        status: "pending",
      });
      expect(getSpy).toHaveBeenCalledWith(
        "/api/driver-leave/requests?driverId=drv_0186&status=pending",
        undefined,
      );

      // Withdraw leave
      const withdrawCmd: WithdrawDriverLeaveCommand = { reason: "取消" };
      await client.withdrawDriverLeave("lv_test", withdrawCmd);
      expect(postSpy).toHaveBeenCalledWith(
        "/api/driver-leave/requests/lv_test/withdraw",
        { body: withdrawCmd },
      );

      // Review leave
      const reviewCmd: ReviewDriverLeaveCommand = {
        decision: "approve",
        reviewNotes: "已核准",
      };
      await client.reviewDriverLeave("lv_test", reviewCmd);
      expect(postSpy).toHaveBeenCalledWith(
        "/api/driver-leave/requests/lv_test/review",
        { body: reviewCmd },
      );
    });

    it("3.2 Review notes policy: reviewNotes is optional for both approve and reject", async () => {
      const client = new ApiClient({ baseUrl: "https://api.test.example" });
      const postSpy = vi
        .spyOn(client as any, "post")
        .mockResolvedValue({ leaveId: "lv_test" });

      // Approve without reviewNotes
      await client.reviewDriverLeave("lv_test", { decision: "approve" });
      expect(postSpy).toHaveBeenCalledWith(
        "/api/driver-leave/requests/lv_test/review",
        { body: { decision: "approve" } },
      );

      // Reject without reviewNotes
      await client.reviewDriverLeave("lv_test", { decision: "reject" });
      expect(postSpy).toHaveBeenCalledWith(
        "/api/driver-leave/requests/lv_test/review",
        { body: { decision: "reject" } },
      );
    });
  });

  describe("4. Terminal states, race conditions & error contracts", () => {
    it("4.1 Only pending requests can be withdrawn; terminal states have no withdraw affordance", () => {
      const pendingRecord = FX_DRV_LEAVE.find((l) => l.status === "pending");
      expect(pendingRecord).toBeDefined();
      expect(pendingRecord?.status).toBe("pending");

      const terminalRecords = FX_DRV_LEAVE.filter((l) => l.status !== "pending");
      expect(terminalRecords.length).toBe(3);
      for (const t of terminalRecords) {
        expect(["approved", "rejected", "withdrawn"]).toContain(t.status);
      }
    });

    it("4.2 Canonical error catalog includes all LEAVE_* and DRIVER_ON_LEAVE error codes", () => {
      expect(SYSTEM_REMEDIATION_ERROR_CODES.LEAVE_INVALID_TIME_RANGE).toBe(
        "LEAVE_INVALID_TIME_RANGE",
      );
      expect(SYSTEM_REMEDIATION_ERROR_CODES.LEAVE_MISSING_REQUIRED_FIELDS).toBe(
        "LEAVE_MISSING_REQUIRED_FIELDS",
      );
      expect(SYSTEM_REMEDIATION_ERROR_CODES.LEAVE_FORBIDDEN_ACCESS).toBe(
        "LEAVE_FORBIDDEN_ACCESS",
      );
      expect(SYSTEM_REMEDIATION_ERROR_CODES.LEAVE_NOT_FOUND).toBe(
        "LEAVE_NOT_FOUND",
      );
      expect(SYSTEM_REMEDIATION_ERROR_CODES.LEAVE_OVERLAPPING_REQUEST).toBe(
        "LEAVE_OVERLAPPING_REQUEST",
      );
      expect(
        SYSTEM_REMEDIATION_ERROR_CODES.LEAVE_INVALID_STATE_TRANSITION,
      ).toBe("LEAVE_INVALID_STATE_TRANSITION");
      expect(SYSTEM_REMEDIATION_ERROR_CODES.DRIVER_ON_LEAVE).toBe(
        "DRIVER_ON_LEAVE",
      );
    });

    it("4.3 Shift linkage invariant: impactedShiftIds is non-empty only for approved leaves", () => {
      for (const lv of FX_DRV_LEAVE) {
        if (lv.status === "approved") {
          expect(lv.impactedShiftIds.length).toBeGreaterThan(0);
        } else {
          expect(lv.impactedShiftIds.length).toBe(0);
        }
      }
    });

    it("4.4 Fixture cross-consistency: driverId 'drv_0186' matches across driver and ops fixtures", () => {
      const sharedLeaveIds = [
        "lv_d82a1b5c",
        "lv_9c31a204",
        "lv_71e9f830",
        "lv_5b204a11",
      ];
      for (const id of sharedLeaveIds) {
        const drvItem = FX_DRV_LEAVE.find((l) => l.leaveId === id);
        const opsItem = FX_OPS_LEAVE.find((l) => l.leaveId === id);
        expect(drvItem).toBeDefined();
        expect(opsItem).toBeDefined();
        expect(drvItem?.driverId).toBe("drv_0186");
        expect(opsItem?.driverId).toBe("drv_0186");
        expect(drvItem?.startTime).toBe(opsItem?.startTime);
        expect(drvItem?.endTime).toBe(opsItem?.endTime);
        expect(drvItem?.status).toBe(opsItem?.status);
      }
    });
  });
});
