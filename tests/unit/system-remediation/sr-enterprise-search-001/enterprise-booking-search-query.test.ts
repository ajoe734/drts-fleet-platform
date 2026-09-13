import { describe, expect, it } from "vitest";
import {
  buildEnterpriseBookingSearchQuery,
  computeEnterpriseBookingPageRangeLabel,
  DEFAULT_ENTERPRISE_BOOKING_SEARCH_FILTERS,
  formatEnterpriseBookingTime,
  hasActiveEnterpriseBookingFilters,
  validateEnterpriseBookingDateRange,
  type EnterpriseBookingSearchFilters,
} from "../../../../apps/enterprise-dispatch-web/lib/enterprise-booking-search";

describe("SR-ENTERPRISE-SEARCH-001 — 企業歷史查詢條件與結果一致", () => {
  describe("hasActiveEnterpriseBookingFilters", () => {
    it("回報 false 當所有篩選皆為預設值", () => {
      expect(
        hasActiveEnterpriseBookingFilters(
          DEFAULT_ENTERPRISE_BOOKING_SEARCH_FILTERS,
        ),
      ).toBe(false);
    });

    it("回報 true 當乘客搜尋字串非空白（trim 後）", () => {
      expect(
        hasActiveEnterpriseBookingFilters({
          ...DEFAULT_ENTERPRISE_BOOKING_SEARCH_FILTERS,
          passenger: "  ",
        }),
      ).toBe(false);
      expect(
        hasActiveEnterpriseBookingFilters({
          ...DEFAULT_ENTERPRISE_BOOKING_SEARCH_FILTERS,
          passenger: "Alice",
        }),
      ).toBe(true);
    });

    it("回報 true 當狀態或任一日期已設定", () => {
      expect(
        hasActiveEnterpriseBookingFilters({
          ...DEFAULT_ENTERPRISE_BOOKING_SEARCH_FILTERS,
          status: "completed",
        }),
      ).toBe(true);
      expect(
        hasActiveEnterpriseBookingFilters({
          ...DEFAULT_ENTERPRISE_BOOKING_SEARCH_FILTERS,
          dateFrom: "2026-09-01",
        }),
      ).toBe(true);
      expect(
        hasActiveEnterpriseBookingFilters({
          ...DEFAULT_ENTERPRISE_BOOKING_SEARCH_FILTERS,
          dateTo: "2026-09-01",
        }),
      ).toBe(true);
    });
  });

  describe("validateEnterpriseBookingDateRange", () => {
    it("視為有效當任一端點缺失", () => {
      expect(validateEnterpriseBookingDateRange("", "")).toBe(true);
      expect(validateEnterpriseBookingDateRange("2026-09-10", "")).toBe(true);
      expect(validateEnterpriseBookingDateRange("", "2026-09-10")).toBe(true);
    });

    it("接受起始日等於或早於結束日", () => {
      expect(
        validateEnterpriseBookingDateRange("2026-09-10", "2026-09-12"),
      ).toBe(true);
      expect(
        validateEnterpriseBookingDateRange("2026-09-10", "2026-09-10"),
      ).toBe(true);
    });

    it("拒絕起始日晚於結束日", () => {
      expect(
        validateEnterpriseBookingDateRange("2026-09-12", "2026-09-10"),
      ).toBe(false);
    });
  });

  describe("buildEnterpriseBookingSearchQuery", () => {
    const base: EnterpriseBookingSearchFilters = {
      ...DEFAULT_ENTERPRISE_BOOKING_SEARCH_FILTERS,
    };

    it("清除篩選時僅送出分頁參數，不冒充全域篩選", () => {
      const query = buildEnterpriseBookingSearchQuery(base, 2, 20);
      expect(query).toEqual({ page: 2, pageSize: 20 });
    });

    it("trim 乘客搜尋字串並省略空白輸入", () => {
      const query = buildEnterpriseBookingSearchQuery(
        { ...base, passenger: "  Alice  " },
        1,
        10,
      );
      expect(query.passenger).toBe("Alice");

      const blankQuery = buildEnterpriseBookingSearchQuery(
        { ...base, passenger: "   " },
        1,
        10,
      );
      expect(blankQuery.passenger).toBeUndefined();
    });

    it("傳遞狀態篩選", () => {
      const query = buildEnterpriseBookingSearchQuery(
        { ...base, status: "cancelled" },
        1,
        10,
      );
      expect(query.status).toBe("cancelled");
    });

    it("同時設定 dateFrom/dateTo 時，轉為 start-inclusive/end-exclusive 的顯式 ISO instant", () => {
      const query = buildEnterpriseBookingSearchQuery(
        { ...base, dateFrom: "2026-09-10", dateTo: "2026-09-12" },
        1,
        10,
        "Asia/Taipei",
      );
      expect(query.dateFrom).toBe("2026-09-10T00:00:00+08:00");
      expect(query.dateTo).toBe("2026-09-13T00:00:00+08:00");
    });

    it("僅設定 dateFrom 時，只送出起始邊界（開放式區間，非單日）", () => {
      const query = buildEnterpriseBookingSearchQuery(
        { ...base, dateFrom: "2026-09-10", dateTo: "" },
        1,
        10,
        "Asia/Taipei",
      );
      expect(query.dateFrom).toBe("2026-09-10T00:00:00+08:00");
      expect(query.dateTo).toBeUndefined();
    });

    it("僅設定 dateTo 時，只送出結束邊界（次日 00:00 exclusive）", () => {
      const query = buildEnterpriseBookingSearchQuery(
        { ...base, dateFrom: "", dateTo: "2026-09-12" },
        1,
        10,
        "Asia/Taipei",
      );
      expect(query.dateFrom).toBeUndefined();
      expect(query.dateTo).toBe("2026-09-13T00:00:00+08:00");
    });

    it("組合乘客／狀態／日期／分頁", () => {
      const query = buildEnterpriseBookingSearchQuery(
        {
          passenger: "Bob",
          status: "active",
          dateFrom: "2026-09-01",
          dateTo: "2026-09-30",
        },
        3,
        5,
        "Asia/Taipei",
      );
      expect(query).toEqual({
        page: 3,
        pageSize: 5,
        passenger: "Bob",
        status: "active",
        dateFrom: "2026-09-01T00:00:00+08:00",
        dateTo: "2026-10-01T00:00:00+08:00",
      });
    });
  });

  describe("formatEnterpriseBookingTime", () => {
    it("回傳 '-' 當輸入為 null/undefined/空字串", () => {
      expect(formatEnterpriseBookingTime(null)).toBe("-");
      expect(formatEnterpriseBookingTime(undefined)).toBe("-");
      expect(formatEnterpriseBookingTime("")).toBe("-");
    });

    it("原樣回傳無法解析的字串", () => {
      expect(formatEnterpriseBookingTime("not-a-date")).toBe("not-a-date");
    });

    it("格式化為 MM/DD HH:mm", () => {
      const iso = new Date(2026, 8, 6, 14, 5).toISOString();
      expect(formatEnterpriseBookingTime(iso)).toBe("09/06 14:05");
    });
  });

  describe("computeEnterpriseBookingPageRangeLabel", () => {
    it("回傳空字串當總數或本頁項目數為 0", () => {
      expect(
        computeEnterpriseBookingPageRangeLabel(
          { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 },
          0,
        ),
      ).toBe("");
    });

    it("計算第一頁範圍", () => {
      expect(
        computeEnterpriseBookingPageRangeLabel(
          { page: 1, pageSize: 10, totalItems: 25, totalPages: 3 },
          10,
        ),
      ).toBe("1-10");
    });

    it("計算最後一頁（不足整頁）範圍", () => {
      expect(
        computeEnterpriseBookingPageRangeLabel(
          { page: 3, pageSize: 10, totalItems: 25, totalPages: 3 },
          5,
        ),
      ).toBe("21-25");
    });
  });
});
