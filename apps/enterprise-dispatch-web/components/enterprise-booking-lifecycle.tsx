"use client";

import type {
  BookingRecord,
  BookingStatus,
  TenantBookingsPageRecord,
} from "@drts/contracts";
import { ApiClientError } from "@drts/api-client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  EBtnContent,
  ECard,
  EIcon,
  EPill,
  ERow,
  entBtnStyle,
} from "@/components/ent-kit";
import { EntRoute } from "@/components/ent-screen-bits";
import { EntPageHead } from "@/components/enterprise-shell";
import {
  buildEnterpriseBookingSearchQuery,
  computeEnterpriseBookingPageRangeLabel,
  DEFAULT_ENTERPRISE_BOOKING_SEARCH_FILTERS,
  DEFAULT_ENTERPRISE_BOOKING_SEARCH_PAGE_SIZE,
  ENTERPRISE_BOOKING_SEARCH_PAGE_SIZE_OPTIONS,
  formatEnterpriseBookingTime,
  getEnterpriseDispatchTenantClient,
  hasActiveEnterpriseBookingFilters,
  validateEnterpriseBookingDateRange,
  type EnterpriseBookingSearchFilters,
} from "@/lib/api-client";
import {
  createEnterpriseBookingDraftFromRecord,
  serializeEnterpriseBookingDraft,
} from "@/lib/enterprise-booking-draft";
import { enterpriseTenant } from "@/lib/enterprise-fixtures";
import { enterpriseTheme as t } from "@/lib/enterprise-theme";
import { useTranslation } from "@/lib/i18n";

type GatewayState = "quota-blocked" | "no-supply" | "degraded";

function gatewayHref(error: unknown): string | null {
  if (!(error instanceof ApiClientError)) return "/degraded";
  const code = error.code.toLowerCase();
  if (code.includes("quota") || code.includes("policy"))
    return "/quota-blocked";
  if (code.includes("supply") || code.includes("vehicle_unavailable"))
    return "/no-supply";
  return error.statusCode >= 500 ? "/degraded" : null;
}

function actionAllowed(record: BookingRecord, action: "edit" | "cancel") {
  const cutoff =
    action === "edit" ? record.modifiableUntil : record.cancelableUntil;
  return Boolean(
    cutoff &&
    new Date(cutoff).getTime() > Date.now() &&
    record.status !== "cancelled",
  );
}

function bookingState(record: BookingRecord) {
  if (record.status === "cancelled")
    return { label: "已取消", tone: "neutral" as const };
  if (record.orderStatus === "no_supply")
    return { label: "暫無可派車輛", tone: "danger" as const };
  if (record.approvalState === "pending")
    return { label: "待審批", tone: "warn" as const };
  return {
    label: record.orderStatus ?? record.status,
    tone: "primary" as const,
  };
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

export function EnterpriseBookingHistory() {
  const { t: tr } = useTranslation();
  const [filters, setFilters] = useState<EnterpriseBookingSearchFilters>(
    DEFAULT_ENTERPRISE_BOOKING_SEARCH_FILTERS,
  );
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(
    DEFAULT_ENTERPRISE_BOOKING_SEARCH_PAGE_SIZE,
  );
  const [result, setResult] = useState<TenantBookingsPageRecord | null>(null);
  const [state, setState] = useState<GatewayState | null>(null);

  const dateRangeValid = validateEnterpriseBookingDateRange(
    filters.dateFrom,
    filters.dateTo,
  );
  const active = hasActiveEnterpriseBookingFilters(filters);

  useEffect(() => {
    if (!dateRangeValid) {
      setResult(null);
      return;
    }
    const controller = new AbortController();
    const query = buildEnterpriseBookingSearchQuery(filters, page, pageSize);
    getEnterpriseDispatchTenantClient(enterpriseTenant.id)
      .queryBookings(query, { signal: controller.signal })
      .then((pageRecord) => {
        if (!controller.signal.aborted) setResult(pageRecord);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState(
          (gatewayHref(error)?.slice(1) as GatewayState | undefined) ??
            "degraded",
        );
      });
    return () => controller.abort();
  }, [
    filters.passenger,
    filters.status,
    filters.dateFrom,
    filters.dateTo,
    page,
    pageSize,
    dateRangeValid,
  ]);

  function updateFilters(patch: Partial<EnterpriseBookingSearchFilters>) {
    setFilters((prev) => ({ ...prev, ...patch }));
    setPage(1);
  }

  function clearFilters() {
    setFilters(DEFAULT_ENTERPRISE_BOOKING_SEARCH_FILTERS);
    setPage(1);
  }

  if (state) return errorContent(state, tr);

  const items = result?.items ?? [];
  const pagination = result?.pagination ?? null;
  const rangeLabel = pagination
    ? computeEnterpriseBookingPageRangeLabel(pagination, items.length)
    : "";

  return (
    <>
      <EntPageHead
        title={tr("bookings.title")}
        sub={tr("bookingLifecycle.history.sub")}
        actions={
          <Link
            href="/bookings/new"
            style={entBtnStyle(t, { variant: "primary" })}
          >
            <EBtnContent icon="plus">{tr("bookings.create")}</EBtnContent>
          </Link>
        }
      />

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
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "0 12px",
              height: 36,
              background: t.surface,
              border: `1px solid ${t.line}`,
              borderRadius: t.radiusSm,
              minWidth: 240,
            }}
          >
            <span style={{ color: t.faint, display: "flex" }}>
              <EIcon name="search" size={15} />
            </span>
            <input
              type="text"
              aria-label={tr("bookingLifecycle.history.searchPlaceholder")}
              data-testid="enterprise-search-input"
              value={filters.passenger}
              onChange={(e) => updateFilters({ passenger: e.target.value })}
              placeholder={tr("bookingLifecycle.history.searchPlaceholder")}
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
            {filters.passenger && (
              <button
                type="button"
                onClick={() => updateFilters({ passenger: "" })}
                aria-label={tr("bookingLifecycle.history.clearFilters")}
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

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <label
              htmlFor="booking-status-filter"
              style={{ fontSize: 12, color: t.muted, fontWeight: 500 }}
            >
              {tr("bookingLifecycle.history.statusLabel")}
            </label>
            <select
              id="booking-status-filter"
              data-testid="enterprise-status-select"
              value={filters.status}
              onChange={(e) =>
                updateFilters({
                  status: e.target.value as BookingStatus | "",
                })
              }
              style={{
                height: 36,
                padding: "0 10px",
                borderRadius: t.radiusSm,
                border: `1px solid ${t.line}`,
                background: t.surface,
                color: t.ink,
                fontSize: 13,
                fontFamily: t.sans,
                cursor: "pointer",
                outline: "none",
              }}
            >
              <option value="">{tr("bookingLifecycle.history.statusAll")}</option>
              <option value="active">
                {tr("bookingLifecycle.history.statusActive")}
              </option>
              <option value="completed">
                {tr("bookingLifecycle.history.statusCompleted")}
              </option>
              <option value="cancelled">
                {tr("bookingLifecycle.history.statusCancelled")}
              </option>
            </select>
          </div>

          <div style={{ flex: 1 }} />

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: t.surface,
              border: `1px solid ${t.line}`,
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
              value={filters.dateFrom}
              onChange={(e) => updateFilters({ dateFrom: e.target.value })}
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
              value={filters.dateTo}
              onChange={(e) => updateFilters({ dateTo: e.target.value })}
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

          {active && (
            <button
              type="button"
              onClick={clearFilters}
              data-testid="enterprise-clear-filters"
              style={{
                height: 36,
                padding: "0 12px",
                border: `1px solid ${t.line}`,
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
              {tr("bookingLifecycle.history.clearFilters")}
            </button>
          )}
        </div>

        {!dateRangeValid && (
          <div
            data-testid="enterprise-date-range-error"
            style={{ fontSize: 12.5, color: t.danger }}
          >
            {tr("bookingLifecycle.history.dateRangeError")}
          </div>
        )}

        {dateRangeValid && (
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
              {result === null
                ? tr("bookingLifecycle.history.loading")
                : active
                  ? tr("bookingLifecycle.history.resultCount", {
                      count: pagination?.totalItems ?? 0,
                      total: pagination?.totalItems ?? 0,
                    })
                  : tr("bookingLifecycle.history.resultCountAll", {
                      total: pagination?.totalItems ?? 0,
                    })}
            </span>
            {pagination && pagination.totalItems > 0 && (
              <span>
                顯示第 {rangeLabel} 筆，共 {pagination.totalPages} 頁
              </span>
            )}
          </div>
        )}
      </div>

      <ECard t={t} pad={0}>
        {!dateRangeValid ? null : result === null ? (
          <div style={{ padding: 18, color: t.muted }}>
            {tr("bookingLifecycle.history.loading")}
          </div>
        ) : items.length === 0 && !active ? (
          <div
            data-testid="enterprise-empty-state"
            style={{ padding: 18, color: t.muted }}
          >
            {tr("bookingLifecycle.history.empty")}
          </div>
        ) : items.length === 0 ? (
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
            <strong style={{ fontSize: 16, color: t.ink }}>
              {tr("bookingLifecycle.history.filteredEmpty.title")}
            </strong>
            <p style={{ color: t.muted, fontSize: 13, maxWidth: 380, margin: 0 }}>
              {tr("bookingLifecycle.history.filteredEmpty.body")}
            </p>
            <button
              type="button"
              onClick={clearFilters}
              data-testid="enterprise-filter-empty-clear"
              style={entBtnStyle(t, { variant: "default", size: "sm" })}
            >
              <EBtnContent icon="refresh">
                {tr("bookingLifecycle.history.clearFilters")}
              </EBtnContent>
            </button>
          </div>
        ) : (
          items.map((booking, index) => {
            const display = bookingState(booking);
            return (
              <Link
                key={booking.bookingId}
                href={`/bookings/${encodeURIComponent(booking.bookingId)}`}
                data-testid={`enterprise-booking-row-${booking.bookingId}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "140px 1fr auto",
                  gap: 14,
                  alignItems: "center",
                  padding: "14px 18px",
                  borderTop: index ? `1px solid ${t.lineSoft}` : "none",
                  textDecoration: "none",
                  color: t.ink,
                }}
              >
                <span style={{ fontFamily: t.mono, color: t.primary }}>
                  {booking.bookingId}
                </span>
                <span>
                  <strong>{booking.passenger.name}</strong>
                  <small style={{ display: "block", color: t.muted }}>
                    {booking.pickup.address} → {booking.dropoff.address} ·{" "}
                    {formatEnterpriseBookingTime(booking.reservationWindowStart)}
                  </small>
                </span>
                <EPill t={t} tone={display.tone} dot>
                  {display.label}
                </EPill>
              </Link>
            );
          })
        )}
      </ECard>

      {dateRangeValid && pagination && pagination.totalItems > 0 && (
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
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: t.muted }}>每頁顯示:</span>
            <select
              aria-label="每頁顯示筆數"
              data-testid="enterprise-page-size"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              style={{
                height: 32,
                padding: "0 8px",
                borderRadius: t.radiusSm,
                border: `1px solid ${t.line}`,
                background: t.surface,
                color: t.ink,
                fontSize: 12.5,
                fontFamily: t.sans,
                cursor: "pointer",
                outline: "none",
              }}
            >
              {ENTERPRISE_BOOKING_SEARCH_PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size} 筆
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
              上一頁
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
              下一頁
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export function EnterpriseBookingDetail({ bookingId }: { bookingId: string }) {
  const { t: tr } = useTranslation();
  const [booking, setBooking] = useState<BookingRecord | null>(null);
  const [state, setState] = useState<GatewayState | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  useEffect(() => {
    getEnterpriseDispatchTenantClient(enterpriseTenant.id)
      .getBooking(bookingId)
      .then(setBooking)
      .catch((error: unknown) =>
        setState(
          (gatewayHref(error)?.slice(1) as GatewayState | undefined) ??
            "degraded",
        ),
      );
  }, [bookingId]);

  const editHref = useMemo(
    () =>
      booking
        ? `/bookings/new?${serializeEnterpriseBookingDraft(createEnterpriseBookingDraftFromRecord(booking)).toString()}&bookingId=${encodeURIComponent(booking.bookingId)}`
        : "#",
    [booking],
  );
  if (state) return errorContent(state, tr);
  if (!booking)
    return (
      <ECard t={t}>
        <span style={{ color: t.muted }}>
          {tr("bookingLifecycle.detail.loading")}
        </span>
      </ECard>
    );
  const display = bookingState(booking);
  const canEdit = actionAllowed(booking, "edit");
  const canCancel = actionAllowed(booking, "cancel");

  async function cancel() {
    if (!canCancel || isCancelling) return;
    const bookingToCancel = booking;
    if (!bookingToCancel) return;
    setIsCancelling(true);
    try {
      const result = await getEnterpriseDispatchTenantClient(
        enterpriseTenant.id,
      ).cancelBooking(bookingToCancel.bookingId, {
        reason: "Cancelled from Enterprise Dispatch",
      });
      setBooking(result);
    } catch (error) {
      setState(
        (gatewayHref(error)?.slice(1) as GatewayState | undefined) ??
          "degraded",
      );
    } finally {
      setIsCancelling(false);
    }
  }

  return (
    <>
      <EntPageHead
        back="我的預約"
        title={
          <span>
            {booking.bookingId} {tr("bookingLifecycle.detail.enterpriseTag")}{" "}
            <EPill t={t} tone={display.tone} dot>
              {display.label}
            </EPill>
          </span>
        }
        sub={`${booking.pickup.address} → ${booking.dropoff.address}`}
        actions={
          <>
            <Link
              href={editHref}
              aria-disabled={!canEdit}
              style={entBtnStyle(t, { variant: "default", disabled: !canEdit })}
            >
              <EBtnContent icon="edit">
                {tr("bookingLifecycle.detail.edit")}
              </EBtnContent>
            </Link>
            <button
              type="button"
              data-testid="enterprise-booking-cancel"
              data-drt-operation="enterprise-cancel"
              disabled={!canCancel || isCancelling}
              onClick={cancel}
              style={entBtnStyle(t, {
                variant: "danger",
                disabled: !canCancel || isCancelling,
              })}
            >
              <EBtnContent icon="ban">
                {isCancelling ? "取消中…" : "取消預約"}
              </EBtnContent>
            </button>
          </>
        }
      />
      <div
        style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 18 }}
      >
        <ECard
          t={t}
          title={tr("bookingLifecycle.detail.tripTitle")}
          sub="tenant booking record"
        >
          <EntRoute
            t={t}
            from={booking.pickup.address}
            to={booking.dropoff.address}
            win={booking.reservationWindowStart}
            airportLabel={
              booking.flightNo
                ? `${booking.flightNo} · ${booking.terminal ?? ""}`
                : undefined
            }
          />
        </ECard>
        <ECard
          t={t}
          title={tr("bookingLifecycle.detail.contactTitle")}
          sub="persisted values"
        >
          <ERow t={t} k="乘客" v={booking.passenger.name} />
          <ERow t={t} k="下單人" v={booking.bookedBy?.name ?? "—"} />
          <ERow t={t} k="成本中心" v={booking.costCenter ?? "—"} mono />
          <ERow
            t={t}
            k="現場聯絡"
            v={booking.onsiteContact?.phone ?? "—"}
            mono
            last
          />
        </ECard>
      </div>
    </>
  );
}
