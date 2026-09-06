"use client";

import type { BookingRecord } from "@drts/contracts";
import { ApiClientError } from "@drts/api-client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  EBtnContent,
  ECard,
  EIcon,
  EPill,
  entBtnStyle,
  type EntTone,
} from "@/components/ent-kit";
import { EntPageHead } from "@/components/enterprise-shell";
import { getEnterpriseDispatchTenantClient } from "@/lib/api-client";
import { enterpriseTenant, enterpriseUser } from "@/lib/enterprise-fixtures";
import { enterpriseTheme as t } from "@/lib/enterprise-theme";
import { useTranslation } from "@/lib/i18n";

export type GatewayState = "quota-blocked" | "no-supply" | "degraded";

export type EnterpriseSearchScope = "all" | "mine" | "byme";

export type EnterpriseBookingStatusFilter =
  | "all"
  | "reserved"
  | "approval"
  | "assigned"
  | "enroute"
  | "completed"
  | "cancelled"
  | "nosupply";

export interface EnterpriseBookingFilterCriteria {
  scope: EnterpriseSearchScope;
  q: string;
  status: EnterpriseBookingStatusFilter;
  dateFrom: string;
  dateTo: string;
  dateField: "reservationStart" | "createdAt";
}

export const DEFAULT_BOOKING_FILTER_CRITERIA: EnterpriseBookingFilterCriteria = {
  scope: "all",
  q: "",
  status: "all",
  dateFrom: "",
  dateTo: "",
  dateField: "reservationStart",
};

export function gatewayHref(error: unknown): string | null {
  if (!(error instanceof ApiClientError)) return "/degraded";
  const code = (error.code ?? "").toLowerCase();
  if (code.includes("quota") || code.includes("policy")) return "/quota-blocked";
  if (code.includes("supply") || code.includes("vehicle_unavailable"))
    return "/no-supply";
  return error.statusCode >= 500 ? "/degraded" : null;
}

export function getBookingStateMeta(record: BookingRecord): {
  key: EnterpriseBookingStatusFilter;
  label: string;
  tone: EntTone;
} {
  if (record.status === "cancelled" || record.orderStatus === "cancelled") {
    return { key: "cancelled", label: "已取消", tone: "neutral" };
  }
  if (
    record.orderStatus === "no_supply" ||
    record.orderStatus === "dispatch_failed"
  ) {
    return { key: "nosupply", label: "無法派車", tone: "danger" };
  }
  if (record.approvalState === "pending") {
    return { key: "approval", label: "待審批", tone: "warn" };
  }
  if (record.orderStatus === "completed" || record.status === "completed") {
    return { key: "completed", label: "已完成", tone: "success" };
  }
  if (record.orderStatus === "on_trip") {
    return { key: "enroute", label: "行程中", tone: "info" };
  }
  if (
    record.orderStatus === "enroute_pickup" ||
    record.orderStatus === "arrived_pickup"
  ) {
    return { key: "enroute", label: "前往上車", tone: "info" };
  }
  if (
    record.orderStatus === "assigned" ||
    record.orderStatus === "driver_accepted" ||
    record.orderStatus === "preassigned"
  ) {
    return { key: "assigned", label: "已派車", tone: "primary" };
  }
  if (record.status === "active") {
    return { key: "reserved", label: "已預約", tone: "warn" };
  }
  return {
    key: "reserved",
    label: record.orderStatus ?? record.status ?? "已預約",
    tone: "primary",
  };
}

export function matchesBookingSearch(
  record: BookingRecord,
  query: string,
): boolean {
  if (!query.trim()) return true;
  const needle = query.trim().toLowerCase();
  const haystack = [
    record.bookingId,
    record.orderId,
    record.passenger.name,
    record.passenger.phone,
    record.bookedBy?.name ?? "",
    record.bookedBy?.email ?? "",
    record.pickup.address,
    record.dropoff.address,
    record.costCenter ?? "",
    record.notes ?? "",
    record.flightNo ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

export function matchesBookingDateRange(
  record: BookingRecord,
  dateFrom: string,
  dateTo: string,
  dateField: "reservationStart" | "createdAt" = "reservationStart",
): boolean {
  if (!dateFrom && !dateTo) return true;
  const rawValue =
    dateField === "createdAt"
      ? record.createdAt
      : record.reservationWindowStart;
  if (!rawValue) return false;
  const timestamp = new Date(rawValue).getTime();
  if (Number.isNaN(timestamp)) return false;

  if (dateFrom) {
    const fromTime = new Date(`${dateFrom}T00:00:00Z`).getTime();
    if (timestamp < fromTime) return false;
  }
  if (dateTo) {
    const toTime = new Date(`${dateTo}T23:59:59.999Z`).getTime();
    if (timestamp > toTime) return false;
  }
  return true;
}

export function hasActiveFilters(
  criteria: EnterpriseBookingFilterCriteria,
): boolean {
  return Boolean(
    criteria.scope !== "all" ||
      criteria.q.trim() !== "" ||
      criteria.status !== "all" ||
      criteria.dateFrom !== "" ||
      criteria.dateTo !== "",
  );
}

export function filterEnterpriseBookings(
  bookings: BookingRecord[],
  criteria: EnterpriseBookingFilterCriteria,
  currentUser: string = enterpriseUser.name,
): BookingRecord[] {
  return bookings
    .filter((record) => {
      // 1. Scope filter
      if (criteria.scope === "mine") {
        if (record.passenger.name !== currentUser) return false;
      } else if (criteria.scope === "byme") {
        const isByMe = Boolean(
          record.bookedBy &&
            record.bookedBy.name === currentUser &&
            record.passenger.name !== currentUser,
        );
        if (!isByMe) return false;
      }

      // 2. Status filter
      if (criteria.status !== "all") {
        const state = getBookingStateMeta(record);
        if (state.key !== criteria.status) return false;
      }

      // 3. Search query
      if (!matchesBookingSearch(record, criteria.q)) {
        return false;
      }

      // 4. Date range
      if (
        !matchesBookingDateRange(
          record,
          criteria.dateFrom,
          criteria.dateTo,
          criteria.dateField,
        )
      ) {
        return false;
      }

      return true;
    })
    .sort((a, b) => {
      const timeA = new Date(
        criteria.dateField === "createdAt"
          ? a.createdAt
          : a.reservationWindowStart,
      ).getTime();
      const timeB = new Date(
        criteria.dateField === "createdAt"
          ? b.createdAt
          : b.reservationWindowStart,
      ).getTime();
      return timeB - timeA;
    });
}

export function paginateEnterpriseBookings<T>(
  items: T[],
  page: number,
  pageSize: number,
) {
  const safePageSize = Math.max(1, pageSize);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const startIndex = (safePage - 1) * safePageSize;
  const endIndex = Math.min(startIndex + safePageSize, total);
  const pagedItems = items.slice(startIndex, endIndex);

  return {
    items: pagedItems,
    total,
    totalPages,
    page: safePage,
    pageSize: safePageSize,
    startIndex,
    endIndex,
  };
}

export function formatBookingTime(isoString: string): string {
  if (!isoString) return "-";
  try {
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return isoString;
    const pad = (n: number) => String(n).padStart(2, "0");
    const m = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const h = pad(d.getHours());
    const min = pad(d.getMinutes());
    return `${m}/${day} ${h}:${min}`;
  } catch {
    return isoString;
  }
}

function errorContent(
  state: GatewayState,
  tr: ReturnType<typeof useTranslation>["t"],
) {
  const href = `/${state}`;
  return (
    <ECard t={t} accent={state === "no-supply" ? t.danger : t.warn}>
      <div data-testid="enterprise-booking-api-state">
        <strong>
          {state === "quota-blocked"
            ? "額度或政策限制"
            : state === "no-supply"
              ? "目前無法派車"
              : "服務暫時不穩定"}
        </strong>
        <p style={{ color: t.muted, lineHeight: 1.6 }}>
          {tr("bookingLifecycle.gateway.body")}
        </p>
        <Link href={href} style={entBtnStyle(t, { variant: "default" })}>
          <EBtnContent>{tr("bookingLifecycle.gateway.action")}</EBtnContent>
        </Link>
      </div>
    </ECard>
  );
}

export default function BookingsHistoryPage() {
  const { t: tr } = useTranslation();
  const [bookings, setBookings] = useState<BookingRecord[] | null>(null);
  const [state, setState] = useState<GatewayState | null>(null);

  const [criteria, setCriteria] = useState<EnterpriseBookingFilterCriteria>(
    DEFAULT_BOOKING_FILTER_CRITERIA,
  );
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    getEnterpriseDispatchTenantClient(enterpriseTenant.id)
      .listBookings()
      .then(setBookings)
      .catch((error: unknown) =>
        setState(
          (gatewayHref(error)?.slice(1) as GatewayState | undefined) ??
            "degraded",
        ),
      );
  }, []);

  const filteredBookings = useMemo(() => {
    if (!bookings) return [];
    return filterEnterpriseBookings(bookings, criteria);
  }, [bookings, criteria]);

  const pagination = useMemo(() => {
    return paginateEnterpriseBookings(filteredBookings, page, pageSize);
  }, [filteredBookings, page, pageSize]);

  const active = hasActiveFilters(criteria);

  const handleClearFilters = () => {
    setCriteria(DEFAULT_BOOKING_FILTER_CRITERIA);
    setPage(1);
  };

  const handleScopeChange = (nextScope: EnterpriseSearchScope) => {
    setCriteria((prev) => ({ ...prev, scope: nextScope }));
    setPage(1);
  };

  const handleStatusChange = (nextStatus: EnterpriseBookingStatusFilter) => {
    setCriteria((prev) => ({ ...prev, status: nextStatus }));
    setPage(1);
  };

  const handleSearchChange = (q: string) => {
    setCriteria((prev) => ({ ...prev, q }));
    setPage(1);
  };

  const handleDateFromChange = (dateFrom: string) => {
    setCriteria((prev) => ({ ...prev, dateFrom }));
    setPage(1);
  };

  const handleDateToChange = (dateTo: string) => {
    setCriteria((prev) => ({ ...prev, dateTo }));
    setPage(1);
  };

  const handlePageSizeChange = (nextSize: number) => {
    setPageSize(nextSize);
    setPage(1);
  };

  if (state) return errorContent(state, tr);

  const scopeOptions: { value: EnterpriseSearchScope; label: string }[] = [
    { value: "all", label: "全部" },
    { value: "mine", label: "我預約的" },
    { value: "byme", label: "我代訂的" },
  ];

  return (
    <>
      <EntPageHead
        title={tr("bookings.title")}
        sub="前台歷史檢視 · 非派遣看板 · 支援組合搜尋與全域分頁"
        actions={
          <Link
            href="/bookings/new"
            style={entBtnStyle(t, { variant: "primary" })}
          >
            <EBtnContent icon="plus">{tr("bookings.create")}</EBtnContent>
          </Link>
        }
      />

      {/* Filter and Search Bar */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          {/* Scope Segmented Control */}
          <div
            role="tablist"
            aria-label="預約對象篩選"
            style={{
              display: "inline-flex",
              background: t.surfaceLo,
              border: "1px solid " + t.line,
              borderRadius: t.radiusSm,
              padding: 3,
              gap: 2,
            }}
          >
            {scopeOptions.map((opt) => {
              const selected = criteria.scope === opt.value;
              return (
                <button
                  type="button"
                  key={opt.value}
                  onClick={() => handleScopeChange(opt.value)}
                  role="tab"
                  aria-selected={selected}
                  data-testid={`enterprise-scope-${opt.value}`}
                  style={{
                    border: "none",
                    cursor: "pointer",
                    background: selected ? t.surface : "transparent",
                    color: selected ? t.primary : t.muted,
                    fontWeight: 600,
                    fontSize: 13,
                    padding: "8px 14px",
                    borderRadius: t.radiusSm - 3,
                    boxShadow: selected ? t.shadowSm : "none",
                    fontFamily: t.sans,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* Status Dropdown */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <label
              htmlFor="booking-status-filter"
              style={{ fontSize: 12, color: t.muted, fontWeight: 500 }}
            >
              狀態:
            </label>
            <select
              id="booking-status-filter"
              data-testid="enterprise-status-select"
              value={criteria.status}
              onChange={(e) =>
                handleStatusChange(
                  e.target.value as EnterpriseBookingStatusFilter,
                )
              }
              style={{
                height: 36,
                padding: "0 10px",
                borderRadius: t.radiusSm,
                border: "1px solid " + t.line,
                background: t.surface,
                color: t.ink,
                fontSize: 13,
                fontFamily: t.sans,
                cursor: "pointer",
                outline: "none",
              }}
            >
              <option value="all">全部狀態</option>
              <option value="reserved">已預約</option>
              <option value="approval">待審批</option>
              <option value="assigned">已派車</option>
              <option value="enroute">行程中 / 前往上車</option>
              <option value="completed">已完成</option>
              <option value="cancelled">已取消</option>
              <option value="nosupply">無法派車</option>
            </select>
          </div>

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Search Box */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "0 12px",
              height: 36,
              background: t.surface,
              border: "1px solid " + t.line,
              borderRadius: t.radiusSm,
              minWidth: 240,
            }}
          >
            <span style={{ color: t.faint, display: "flex" }}>
              <EIcon name="search" size={15} />
            </span>
            <input
              type="text"
              aria-label="搜尋乘客姓名、電話、預約編號、地點"
              data-testid="enterprise-search-input"
              value={criteria.q}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="搜尋乘客 / 編號 / 地點"
              style={{
                border: "none",
                background: "transparent",
                outline: "none",
                fontSize: 13,
                fontFamily: t.sans,
                color: t.ink,
                width: "100%",
              }}
            />
            {criteria.q && (
              <button
                type="button"
                onClick={() => handleSearchChange("")}
                aria-label="清除關鍵字"
                style={{
                  border: "none",
                  background: "transparent",
                  color: t.muted,
                  cursor: "pointer",
                  padding: 2,
                  display: "flex",
                }}
              >
                <EIcon name="x" size={14} />
              </button>
            )}
          </div>

          {/* Date Filter Range */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: t.surface,
              border: "1px solid " + t.line,
              borderRadius: t.radiusSm,
              padding: "0 8px",
              height: 36,
            }}
          >
            <span style={{ color: t.faint, display: "flex" }}>
              <EIcon name="cal" size={15} />
            </span>
            <input
              type="date"
              aria-label="預約起始日期"
              data-testid="enterprise-date-from"
              value={criteria.dateFrom}
              onChange={(e) => handleDateFromChange(e.target.value)}
              style={{
                border: "none",
                background: "transparent",
                color: t.ink,
                fontSize: 12.5,
                fontFamily: t.sans,
                outline: "none",
              }}
            />
            <span style={{ color: t.muted, fontSize: 12 }}>–</span>
            <input
              type="date"
              aria-label="預約結束日期"
              data-testid="enterprise-date-to"
              value={criteria.dateTo}
              onChange={(e) => handleDateToChange(e.target.value)}
              style={{
                border: "none",
                background: "transparent",
                color: t.ink,
                fontSize: 12.5,
                fontFamily: t.sans,
                outline: "none",
              }}
            />
          </div>

          {/* Reset Filters Button */}
          {active && (
            <button
              type="button"
              onClick={handleClearFilters}
              data-testid="enterprise-clear-filters"
              style={{
                height: 36,
                padding: "0 12px",
                border: "1px solid " + t.line,
                borderRadius: t.radiusSm,
                background: t.surfaceLo,
                color: t.muted,
                fontSize: 12.5,
                fontWeight: 600,
                fontFamily: t.sans,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <EIcon name="refresh" size={13} />
              清除篩選
            </button>
          )}
        </div>

        {/* Query Summary and Count */}
        <div
          data-testid="enterprise-result-count"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 12.5,
            color: t.muted,
            padding: "2px 4px",
          }}
        >
          <span>
            {bookings === null ? (
              "讀取預約列表中..."
            ) : active ? (
              <>
                符合條件：
                <strong style={{ color: t.primary }}>
                  {filteredBookings.length}
                </strong>{" "}
                筆（全域總數 {bookings.length} 筆）
              </>
            ) : (
              <>
                共{" "}
                <strong style={{ color: t.ink }}>{bookings.length}</strong>{" "}
                筆預約
              </>
            )}
          </span>
          {pagination.total > 0 && (
            <span>
              顯示第 {pagination.startIndex + 1}–{pagination.endIndex} 筆，共{" "}
              {pagination.totalPages} 頁
            </span>
          )}
        </div>
      </div>

      {/* Bookings Table / Cards */}
      <ECard t={t} pad={0}>
        {bookings === null ? (
          <div style={{ padding: 24, textAlign: "center", color: t.muted }}>
            <div
              style={{
                marginBottom: 8,
                display: "flex",
                justifyContent: "center",
              }}
            >
              <EIcon name="refresh" size={24} />
            </div>
            {tr("bookingLifecycle.history.loading")}
          </div>
        ) : bookings.length === 0 ? (
          /* Total Empty State */
          <div
            data-testid="enterprise-empty-state"
            style={{
              padding: "48px 24px",
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                background: t.surfaceLo,
                color: t.faint,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <EIcon name="car" size={24} />
            </div>
            <strong style={{ fontSize: 16, color: t.ink }}>
              {tr("bookingLifecycle.history.empty")}
            </strong>
            <p
              style={{
                color: t.muted,
                fontSize: 13,
                maxWidth: 360,
                margin: 0,
              }}
            >
              目前尚未建立任何企業預約。您可以為自己或公司同仁建立新行程。
            </p>
            <div style={{ marginTop: 8 }}>
              <Link
                href="/bookings/new"
                style={entBtnStyle(t, { variant: "primary", size: "sm" })}
              >
                <EBtnContent icon="plus">{tr("bookings.create")}</EBtnContent>
              </Link>
            </div>
          </div>
        ) : filteredBookings.length === 0 ? (
          /* Filter Empty State */
          <div
            data-testid="enterprise-filtered-empty-state"
            style={{
              padding: "48px 24px",
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                background: t.surfaceLo,
                color: t.warn,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <EIcon name="search" size={24} />
            </div>
            <strong style={{ fontSize: 16, color: t.ink }}>
              找不到符合條件的預約
            </strong>
            <p
              style={{
                color: t.muted,
                fontSize: 13,
                maxWidth: 380,
                margin: 0,
              }}
            >
              沒有任何預約符合您所指定的篩選條件、搜尋字詞或日期區間。
            </p>
            <button
              type="button"
              onClick={handleClearFilters}
              data-testid="enterprise-filter-empty-clear"
              style={entBtnStyle(t, { variant: "default", size: "sm" })}
            >
              <EBtnContent icon="refresh">清除所有篩選條件</EBtnContent>
            </button>
          </div>
        ) : (
          <>
            {/* Header row */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "110px 1.1fr 1.5fr 110px 130px 110px",
                gap: 12,
                padding: "11px 18px",
                borderBottom: "1px solid " + t.line,
                background: t.surfaceLo,
                fontSize: 11,
                fontWeight: 700,
                color: t.muted,
                letterSpacing: 0.3,
              }}
            >
              <span>編號</span>
              <span>乘客 / 下單</span>
              <span>行程</span>
              <span>時間</span>
              <span>成本中心</span>
              <span>狀態</span>
            </div>

            {/* List rows */}
            {pagination.items.map((booking, index) => {
              const display = getBookingStateMeta(booking);
              const isSelf =
                !booking.bookedBy ||
                booking.bookedBy.name === booking.passenger.name;
              const isAirport =
                booking.businessDispatchSubtype ===
                  "credit_card_airport_transfer" ||
                booking.pickup.address.includes("機場") ||
                booking.dropoff.address.includes("機場") ||
                Boolean(booking.flightNo);

              return (
                <Link
                  key={booking.bookingId}
                  href={`/bookings/${encodeURIComponent(booking.bookingId)}`}
                  data-testid={`enterprise-booking-row-${booking.bookingId}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "110px 1.1fr 1.5fr 110px 130px 110px",
                    gap: 12,
                    alignItems: "center",
                    padding: "13px 18px",
                    borderTop: index ? `1px solid ${t.lineSoft}` : "none",
                    textDecoration: "none",
                    color: t.ink,
                  }}
                >
                  <span
                    style={{
                      fontFamily: t.mono,
                      fontSize: 12,
                      color: t.primary,
                      fontWeight: 600,
                    }}
                  >
                    {booking.bookingId}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {booking.passenger.name}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: isSelf ? t.muted : t.warn,
                      }}
                    >
                      {isSelf
                        ? "本人"
                        : `${booking.bookedBy?.name ?? "同仁"} 代訂`}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: t.ink2, minWidth: 0 }}>
                    <span
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {booking.pickup.address}{" "}
                      <EIcon
                        name="arrow"
                        size={11}
                        style={{ color: t.faint, flexShrink: 0 }}
                      />{" "}
                      {booking.dropoff.address}
                      {isAirport && (
                        <EIcon
                          name="flag"
                          size={12}
                          style={{ color: t.info, flexShrink: 0 }}
                        />
                      )}
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: 12,
                      fontFamily: t.mono,
                      color: t.ink2,
                    }}
                  >
                    {formatBookingTime(booking.reservationWindowStart)}
                  </span>
                  <span
                    style={{
                      fontSize: 11.5,
                      fontFamily: t.mono,
                      color: t.muted,
                    }}
                  >
                    {booking.costCenter || "-"}
                  </span>
                  <div>
                    <EPill t={t} tone={display.tone} dot>
                      {display.label}
                    </EPill>
                  </div>
                </Link>
              );
            })}
          </>
        )}
      </ECard>

      {/* Pagination Bar */}
      {bookings !== null && filteredBookings.length > 0 && (
        <div
          data-testid="enterprise-pagination"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
            marginTop: 16,
            padding: "8px 4px",
          }}
        >
          {/* Page size picker */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: t.muted }}>每頁顯示:</span>
            <select
              aria-label="每頁顯示筆數"
              data-testid="enterprise-page-size"
              value={pageSize}
              onChange={(e) => handlePageSizeChange(Number(e.target.value))}
              style={{
                height: 32,
                padding: "0 8px",
                borderRadius: t.radiusSm,
                border: "1px solid " + t.line,
                background: t.surface,
                color: t.ink,
                fontSize: 12.5,
                fontFamily: t.sans,
                cursor: "pointer",
                outline: "none",
              }}
            >
              <option value={5}>5 筆</option>
              <option value={10}>10 筆</option>
              <option value={20}>20 筆</option>
            </select>
          </div>

          {/* Page navigation */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={pagination.page <= 1}
              data-testid="enterprise-page-prev"
              style={{
                ...entBtnStyle(t, {
                  variant: "default",
                  size: "sm",
                  disabled: pagination.page <= 1,
                }),
                cursor: pagination.page <= 1 ? "not-allowed" : "pointer",
                opacity: pagination.page <= 1 ? 0.5 : 1,
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <EIcon
                  name="arrow"
                  size={13}
                  style={{ transform: "rotate(180deg)" }}
                />
                上一頁
              </span>
            </button>

            <span
              style={{
                fontSize: 13,
                fontFamily: t.mono,
                color: t.ink2,
                padding: "0 6px",
              }}
            >
              {pagination.page} / {pagination.totalPages}
            </span>

            <button
              type="button"
              onClick={() =>
                setPage((p) => Math.min(pagination.totalPages, p + 1))
              }
              disabled={pagination.page >= pagination.totalPages}
              data-testid="enterprise-page-next"
              style={{
                ...entBtnStyle(t, {
                  variant: "default",
                  size: "sm",
                  disabled: pagination.page >= pagination.totalPages,
                }),
                cursor:
                  pagination.page >= pagination.totalPages
                    ? "not-allowed"
                    : "pointer",
                opacity: pagination.page >= pagination.totalPages ? 0.5 : 1,
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                下一頁
                <EIcon name="arrow" size={13} />
              </span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
