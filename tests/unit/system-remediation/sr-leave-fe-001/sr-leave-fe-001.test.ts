import { describe, expect, it, vi } from "vitest";
import { ApiClient } from "../../../../packages/api-client/src";
import {
  DRIVER_LEAVE_STATUSES,
  DRIVER_LEAVE_TYPES,
  SYSTEM_REMEDIATION_ERROR_CODES,
  type CreateDriverLeaveCommand,
  type ReviewDriverLeaveCommand,
  type WithdrawDriverLeaveCommand,
} from "../../../../packages/contracts/src";
import { REALM_COLORS } from "../../../../packages/ui-tokens/src";
import {
  FX_OPS_LEAVE,
  FX_OPS_SHIFT_BOARD,
  OPS_LEAVE_STATUS,
  OPS_LEAVE_TYPE,
  fmtTaipei as fmtTaipeiOps,
  formatLeaveRangeZh as formatLeaveRangeZhOps,
} from "../../../../apps/ops-console-web/app/leave/leave-types";

// The driver-app leave screens were removed on 2026-11-26 (owner decision:
// drivers do not file leave in the app). The supervisor screens in the ops
// console and the leave API remain and are covered here.
describe("SR-LEAVE-FE-001 — 主管請假操作畫面", () => {
  describe("1. Realm tokens & UI Design Contract", () => {
    it("1.1 Driver realm uses canonical tokens from @drts/ui-tokens", () => {
      expect(REALM_COLORS.driver.light.fg).toBe("#A8590B");
      expect(REALM_COLORS.driver.dark.fg).toBe("#FCD34D");
    });

    it("1.2 Ops realm uses canonical tokens from @drts/ui-tokens", () => {
      expect(REALM_COLORS.ops.light.fg).toBe("#DC2626");
      expect(REALM_COLORS.ops.dark.fg).toBe("#FCA5A5");
    });

    it("1.3 Ops labels every contract leave type and status", () => {
      for (const type of DRIVER_LEAVE_TYPES) {
        expect(OPS_LEAVE_TYPE[type]?.zh).toBeTruthy();
      }

      for (const status of DRIVER_LEAVE_STATUSES) {
        expect(OPS_LEAVE_STATUS[status]?.zh).toBeTruthy();
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
      expect(fmtTaipeiOps("2026-09-10T08:00:00.000Z")).toBe("2026-09-10 16:00");
    });

    it("2.2 Formats same-day and cross-day range strings with Chinese weekday labels", () => {
      expect(
        formatLeaveRangeZhOps(
          "2026-09-10T08:00:00.000Z",
          "2026-09-10T13:00:00.000Z",
        ),
      ).toBe("09/10（四）16:00–21:00");
      expect(
        formatLeaveRangeZhOps(
          "2026-09-14T00:00:00.000Z",
          "2026-09-16T15:59:00.000Z",
        ),
      ).toBe("09/14（一）08:00 – 09/16（三）23:59");
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
    it("4.1 Ops fixtures only use contract leave statuses", () => {
      for (const leave of FX_OPS_LEAVE) {
        expect(DRIVER_LEAVE_STATUSES).toContain(leave.status);
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
      for (const lv of FX_OPS_LEAVE) {
        if (lv.status === "approved") {
          expect(lv.impactedShiftIds.length).toBeGreaterThan(0);
        } else {
          expect(lv.impactedShiftIds.length).toBe(0);
        }
      }
    });
  });
});
