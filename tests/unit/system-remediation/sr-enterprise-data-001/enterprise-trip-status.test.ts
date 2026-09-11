import { describe, expect, it } from "vitest";
import type { OwnedOrderStatus, TenantBookingSummary } from "@drts/contracts";
import {
  classifyEnterpriseBookingFetchError,
  classifyEnterpriseDashboardFetchError,
  getEnterpriseOrderStatusTone,
  getEnterpriseTripProgressStage,
  isEnterpriseActiveTripStatus,
  selectActiveEnterpriseTrip,
} from "../../../../apps/enterprise-dispatch-web/lib/enterprise-trip-status";

function booking(
  status: OwnedOrderStatus,
  bookingId = "BK-0001",
): TenantBookingSummary {
  return {
    bookingId,
    orderId: `ORD-${bookingId}`,
    serviceProduct: "enterprise_dispatch",
    status,
    reservationWindowStart: "2026-09-11T06:00:00.000Z",
    reservationWindowEnd: "2026-09-11T06:30:00.000Z",
    passengerName: "Test Passenger",
    pickupAddress: "Taipei HQ",
    dropoffAddress: "Taoyuan T2",
    costCenterCode: "CC-PRD-01",
    tenantServiceProgramId: null,
  };
}

describe("SR-ENTERPRISE-DATA-001 — 企業首頁／行程真資料及聯絡入口", () => {
  describe("isEnterpriseActiveTripStatus / selectActiveEnterpriseTrip", () => {
    it("視進行中的派車/行程狀態為 active", () => {
      const activeStatuses: OwnedOrderStatus[] = [
        "preassigned",
        "assigned",
        "driver_accepted",
        "enroute_pickup",
        "arrived_pickup",
        "on_trip",
        "proof_pending",
      ];
      for (const status of activeStatuses) {
        expect(isEnterpriseActiveTripStatus(status)).toBe(true);
      }
    });

    it("視終態與例外狀態為非 active（不可冒充為進行中行程）", () => {
      const inactiveStatuses: OwnedOrderStatus[] = [
        "created",
        "recording_pending",
        "ready_for_dispatch",
        "completed",
        "cancelled",
        "redispatch_required",
        "dispatch_failed",
        "dispatch_timeout",
        "no_supply",
        "delayed_queue",
        "exception_hold",
      ];
      for (const status of inactiveStatuses) {
        expect(isEnterpriseActiveTripStatus(status)).toBe(false);
      }
    });

    it("從 upcomingBookings 中選出第一筆 active 行程", () => {
      const bookings = [
        booking("completed", "BK-DONE"),
        booking("enroute_pickup", "BK-ACTIVE"),
        booking("cancelled", "BK-CANCELLED"),
      ];
      expect(selectActiveEnterpriseTrip(bookings)?.bookingId).toBe(
        "BK-ACTIVE",
      );
    });

    it("回傳 null 當沒有任何 active 行程（誠實的空狀態，不得顯示假行程）", () => {
      const bookings = [
        booking("completed", "BK-DONE"),
        booking("cancelled", "BK-CANCELLED"),
      ];
      expect(selectActiveEnterpriseTrip(bookings)).toBeNull();
      expect(selectActiveEnterpriseTrip([])).toBeNull();
    });
  });

  describe("getEnterpriseTripProgressStage", () => {
    it("將派車中狀態對應到 5 階進度軌的正確 index", () => {
      expect(getEnterpriseTripProgressStage("assigned")).toBe(0);
      expect(getEnterpriseTripProgressStage("driver_accepted")).toBe(0);
      expect(getEnterpriseTripProgressStage("enroute_pickup")).toBe(1);
      expect(getEnterpriseTripProgressStage("arrived_pickup")).toBe(2);
      expect(getEnterpriseTripProgressStage("on_trip")).toBe(3);
      expect(getEnterpriseTripProgressStage("proof_pending")).toBe(3);
      expect(getEnterpriseTripProgressStage("completed")).toBe(4);
    });

    it("回傳 null 當狀態不屬於進度軌（例外狀態不可強塞進度）", () => {
      expect(getEnterpriseTripProgressStage("no_supply")).toBeNull();
      expect(getEnterpriseTripProgressStage("exception_hold")).toBeNull();
      expect(getEnterpriseTripProgressStage("cancelled")).toBeNull();
    });
  });

  describe("getEnterpriseOrderStatusTone", () => {
    it("涵蓋所有 OwnedOrderStatus 且回傳合法 tone", () => {
      const allStatuses: OwnedOrderStatus[] = [
        "created",
        "recording_pending",
        "ready_for_dispatch",
        "preassigned",
        "assigned",
        "driver_accepted",
        "enroute_pickup",
        "arrived_pickup",
        "on_trip",
        "proof_pending",
        "completed",
        "cancelled",
        "redispatch_required",
        "dispatch_failed",
        "dispatch_timeout",
        "no_supply",
        "delayed_queue",
        "exception_hold",
      ];
      const validTones = new Set([
        "primary",
        "success",
        "warn",
        "info",
        "neutral",
        "danger",
      ]);
      for (const status of allStatuses) {
        expect(validTones.has(getEnterpriseOrderStatusTone(status))).toBe(
          true,
        );
      }
      expect(getEnterpriseOrderStatusTone("no_supply")).toBe("danger");
      expect(getEnterpriseOrderStatusTone("completed")).toBe("success");
    });
  });

  describe("classifyEnterpriseBookingFetchError — 404 不可被當成可重試的暫時故障", () => {
    it("statusCode 404 分類為 not-found", () => {
      expect(
        classifyEnterpriseBookingFetchError({ statusCode: 404, code: "not_found" }),
      ).toBe("not-found");
    });

    it("quota/policy 錯誤碼分類為 quota-blocked", () => {
      expect(
        classifyEnterpriseBookingFetchError({
          statusCode: 403,
          code: "quota_exceeded",
        }),
      ).toBe("quota-blocked");
      expect(
        classifyEnterpriseBookingFetchError({
          statusCode: 403,
          code: "policy_violation",
        }),
      ).toBe("quota-blocked");
    });

    it("supply/vehicle_unavailable 錯誤碼分類為 no-supply", () => {
      expect(
        classifyEnterpriseBookingFetchError({
          statusCode: 409,
          code: "vehicle_unavailable",
        }),
      ).toBe("no-supply");
    });

    it("500 級或未知錯誤分類為 degraded（真正可重試的暫時故障）", () => {
      expect(
        classifyEnterpriseBookingFetchError({
          statusCode: 500,
          code: "internal_error",
        }),
      ).toBe("degraded");
      expect(classifyEnterpriseBookingFetchError(new Error("network"))).toBe(
        "degraded",
      );
      expect(classifyEnterpriseBookingFetchError(undefined)).toBe("degraded");
    });
  });

  describe("classifyEnterpriseDashboardFetchError", () => {
    it("401/403 分類為 auth-required", () => {
      expect(
        classifyEnterpriseDashboardFetchError({ statusCode: 401, code: "unauthorized" }),
      ).toBe("auth-required");
      expect(
        classifyEnterpriseDashboardFetchError({ statusCode: 403, code: "forbidden" }),
      ).toBe("auth-required");
    });

    it("其餘錯誤分類為 degraded", () => {
      expect(
        classifyEnterpriseDashboardFetchError({ statusCode: 500, code: "internal_error" }),
      ).toBe("degraded");
      expect(classifyEnterpriseDashboardFetchError(new Error("network"))).toBe(
        "degraded",
      );
    });
  });
});
