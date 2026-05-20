import Link from "next/link";
import type { CSSProperties } from "react";
import type {
  BookingRecord,
  MoneyAmount,
  OwnedOrderStatus,
} from "@drts/contracts";
import { OWNED_ORDER_STATUSES } from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasField,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  type CanvasTableColumn,
  type CanvasTone,
  buildCanvasTheme,
} from "@drts/ui-web";
import {
  applyBookingListQuery,
  buildBookingListQueryString,
  parseBookingListQuery,
  toggleStatus,
} from "@/lib/booking-list";
import { getTenantClient } from "@/lib/api-client";
import { formatDateInput, formatDateTime, formatMoney } from "@/lib/formatters";
import { getBookingSourceVisibility } from "@/lib/source-domain";

export const dynamic = "force-dynamic";

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "grid",
  gap: 16,
};

const topGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.45fr) minmax(280px, 0.9fr)",
  gap: 16,
  alignItems: "start",
};

const kpiGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 12,
};

const filterGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const fieldInputStyle: CSSProperties = {
  width: "100%",
  borderRadius: 7,
  border: `1px solid ${th.border}`,
  background: th.bgRaised,
  color: th.text,
  padding: "8px 10px",
  fontSize: 12.5,
  fontFamily: th.fontFamily,
  boxSizing: "border-box",
};

const monoInputStyle: CSSProperties = {
  ...fieldInputStyle,
  fontFamily: th.monoFamily,
  fontSize: 11.5,
};

const controlRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
};

const primaryLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  height: 28,
  padding: "5px 10px",
  borderRadius: 7,
  border: `1px solid ${th.accent}`,
  background: th.accent,
  color: "#fff",
  fontSize: 12,
  fontWeight: 500,
  textDecoration: "none",
  lineHeight: 1,
};

const secondaryLinkStyle: CSSProperties = {
  ...primaryLinkStyle,
  background: th.surface,
  borderColor: th.border,
  color: th.text,
};

const submitButtonStyle: CSSProperties = {
  ...secondaryLinkStyle,
  cursor: "pointer",
  fontFamily: th.fontFamily,
};

const statusChipRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const statusChipStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "4px 8px",
  borderRadius: 7,
  border: `1px solid ${th.border}`,
  color: th.textMuted,
  background: th.surface,
  fontSize: 11.5,
  textDecoration: "none",
  fontFamily: th.monoFamily,
};

const bookingLinkStyle: CSSProperties = {
  color: th.accent,
  fontWeight: 600,
  fontFamily: th.monoFamily,
  textDecoration: "none",
};

const stackCellStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  whiteSpace: "normal",
  lineHeight: 1.35,
};

const secondaryTextStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 11.5,
};

const subtleTextStyle: CSSProperties = {
  color: th.textDim,
  fontSize: 11,
};

const emptyStateStyle: CSSProperties = {
  padding: 24,
  color: th.textMuted,
  fontSize: 12.5,
  textAlign: "center",
};

const paginationStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "14px 16px 0",
  color: th.textMuted,
  fontSize: 11.5,
};

const paginationLinksStyle: CSSProperties = {
  display: "flex",
  gap: 12,
  alignItems: "center",
};

const tableMetaStyle: CSSProperties = {
  padding: "14px 16px 0",
  color: th.textMuted,
  fontSize: 11.5,
};

type BookingRow = BookingRecord & Record<string, unknown>;

type BookingTab = {
  label: string;
  statuses: OwnedOrderStatus[];
};

const BOOKING_TABS: BookingTab[] = [
  { label: "全部", statuses: [] },
  {
    label: "進行中",
    statuses: [
      "ready_for_dispatch",
      "preassigned",
      "assigned",
      "driver_accepted",
      "enroute_pickup",
      "arrived_pickup",
      "on_trip",
      "proof_pending",
      "redispatch_required",
      "delayed_queue",
      "exception_hold",
    ],
  },
  {
    label: "預約",
    statuses: [
      "created",
      "recording_pending",
      "ready_for_dispatch",
      "preassigned",
      "assigned",
      "driver_accepted",
      "delayed_queue",
    ],
  },
  { label: "已完成", statuses: ["completed"] },
  {
    label: "取消",
    statuses: ["cancelled", "dispatch_failed", "dispatch_timeout", "no_supply"],
  },
];

const DEFAULT_BOOKING_TAB = BOOKING_TABS[0]!;
const ACTIVE_BOOKING_STATUSES = BOOKING_TABS[1]!.statuses;
const CANCELLED_BOOKING_STATUSES = BOOKING_TABS[4]!.statuses;

function formatCanvasCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatSubtype(booking: BookingRecord) {
  return (booking.businessDispatchSubtype ?? booking.serviceBucket)
    .replaceAll("_", " ")
    .toUpperCase();
}

function formatWindow(booking: BookingRecord) {
  if (!booking.reservationWindowStart) {
    return "—";
  }

  const start = formatDateTime(booking.reservationWindowStart);
  const end = booking.reservationWindowEnd
    ? formatDateTime(booking.reservationWindowEnd)
    : null;

  return end ? `${start} -> ${end}` : start;
}

function getOrderStatusTone(status: OwnedOrderStatus): CanvasTone {
  switch (status) {
    case "completed":
      return "success";
    case "cancelled":
    case "dispatch_failed":
    case "dispatch_timeout":
    case "no_supply":
      return "danger";
    case "assigned":
    case "driver_accepted":
    case "enroute_pickup":
    case "arrived_pickup":
    case "on_trip":
    case "proof_pending":
      return "success";
    case "redispatch_required":
    case "exception_hold":
      return "warn";
    case "created":
    case "recording_pending":
    case "ready_for_dispatch":
    case "preassigned":
    case "delayed_queue":
    default:
      return "info";
  }
}

function buildAverageFare(bookings: BookingRecord[]): MoneyAmount | null {
  const quotedFares = bookings
    .map((booking) => booking.quotedFare)
    .filter((fare): fare is MoneyAmount => Boolean(fare));

  if (quotedFares.length === 0) {
    return null;
  }

  const total = quotedFares.reduce((sum, fare) => sum + fare.amountMinor, 0);

  return {
    amountMinor: Math.floor(total / quotedFares.length),
    currency: quotedFares[0]!.currency,
  };
}

function areSameStatuses(left: OwnedOrderStatus[], right: OwnedOrderStatus[]) {
  return (
    left.length === right.length &&
    left.every((status, index) => status === right[index])
  );
}

function getActiveTab(queryStatuses: OwnedOrderStatus[]) {
  return (
    BOOKING_TABS.find((tab) => areSameStatuses(queryStatuses, tab.statuses)) ??
    DEFAULT_BOOKING_TAB
  );
}

function buildTabHref(
  query: ReturnType<typeof parseBookingListQuery>,
  statuses: OwnedOrderStatus[],
) {
  const params = buildBookingListQueryString(query, {
    statuses,
    page: 1,
  });

  return params ? `/bookings?${params}` : "/bookings";
}

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const client = getTenantClient();
  const query = parseBookingListQuery(await searchParams);
  const bookings = await client.listTenantBookings();
  const result = applyBookingListQuery(bookings, query);
  const activeTab = getActiveTab(query.statuses);
  const hasForwardedAuthority = result.items.some(
    (booking) =>
      getBookingSourceVisibility(booking).domain === "forwarded_authority",
  );

  const activeCount = bookings.filter((booking) =>
    ACTIVE_BOOKING_STATUSES.includes(booking.orderStatus),
  ).length;
  const completedCount = bookings.filter(
    (booking) => booking.orderStatus === "completed",
  ).length;
  const cancelledCount = bookings.filter((booking) =>
    CANCELLED_BOOKING_STATUSES.includes(booking.orderStatus),
  ).length;
  const costCenterCoverage = bookings.filter(
    (booking) => booking.costCenter,
  ).length;
  const averageFare = buildAverageFare(result.items);

  const tabNodes = BOOKING_TABS.map((tab) => (
    <Link
      href={buildTabHref(query, tab.statuses)}
      key={tab.label}
      style={{
        color: "inherit",
        textDecoration: "none",
      }}
    >
      {tab.label}
    </Link>
  ));
  const activeTabNode =
    tabNodes[BOOKING_TABS.findIndex((tab) => tab.label === activeTab.label)] ??
    tabNodes[0]!;

  const columns: CanvasTableColumn<BookingRow>[] = [
    {
      h: "BK",
      w: 112,
      mono: true,
      r: (row) => (
        <Link href={`/bookings/${row.bookingId}`} style={bookingLinkStyle}>
          {row.bookingId}
        </Link>
      ),
    },
    {
      h: "ORDER",
      k: "orderId",
      w: 120,
      mono: true,
    },
    {
      h: "TYPE",
      w: 140,
      mono: true,
      r: (row) => formatSubtype(row),
    },
    {
      h: "PICKUP -> DROP",
      w: 360,
      r: (row) => (
        <div style={stackCellStyle}>
          <span>{row.pickup.address}</span>
          <span style={secondaryTextStyle}>↓ {row.dropoff.address}</span>
        </div>
      ),
    },
    {
      h: "WIN",
      w: 170,
      mono: true,
      r: (row) => (
        <div style={stackCellStyle}>
          <span>{formatDateTime(row.reservationWindowStart)}</span>
          <span style={secondaryTextStyle}>
            {row.reservationWindowEnd
              ? formatDateTime(row.reservationWindowEnd)
              : "—"}
          </span>
        </div>
      ),
    },
    {
      h: "PASS.",
      w: 132,
      r: (row) => (
        <div style={stackCellStyle}>
          <span>{row.passenger.name}</span>
          <span style={secondaryTextStyle}>{row.passenger.phone}</span>
        </div>
      ),
    },
    {
      h: "CC",
      w: 112,
      mono: true,
      r: (row) => row.costCenter ?? "—",
    },
    {
      h: "STATE",
      w: 164,
      r: (row) => (
        <div style={stackCellStyle}>
          <CanvasPill theme={th} tone={getOrderStatusTone(row.orderStatus)} dot>
            {row.orderStatus}
          </CanvasPill>
          <span style={secondaryTextStyle}>Booking {row.status}</span>
        </div>
      ),
    },
  ];

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="叫車"
        subtitle="本月所有預約 · 含進行中與已完成"
        tabs={tabNodes}
        activeTab={activeTabNode}
        actions={
          <>
            <CanvasBtn theme={th} icon="filter" size="sm">
              篩選
            </CanvasBtn>
            <CanvasBtn theme={th} icon="export" size="sm">
              匯出
            </CanvasBtn>
            <Link href="/bookings/new" style={primaryLinkStyle}>
              新增
            </Link>
          </>
        }
      />

      <div style={pageBodyStyle}>
        {hasForwardedAuthority ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title="Forwarded bookings keep external-platform authority"
            body="Tenant console continues to show the canonical booking record, but adapter-native lifecycle recovery still belongs to ops and driver surfaces."
          />
        ) : null}

        <div style={kpiGridStyle}>
          <CanvasKPI
            theme={th}
            label="Visible rows"
            value={formatCanvasCount(result.total)}
            sub="Current query result"
            hint={`page ${result.page}/${result.totalPages}`}
          />
          <CanvasKPI
            theme={th}
            label="In progress"
            value={formatCanvasCount(activeCount)}
            delta={`${formatCanvasCount(result.statusCounts.assigned ?? 0)} assigned`}
            deltaTone="up"
            sub="Owned workflow active"
          />
          <CanvasKPI
            theme={th}
            label="Completed"
            value={formatCanvasCount(completedCount)}
            delta={`${formatCanvasCount(cancelledCount)} cancelled`}
            deltaTone={cancelledCount > 0 ? "down" : "neutral"}
            sub="Across all fetched bookings"
          />
          <CanvasKPI
            theme={th}
            label="Cost center"
            value={`${formatCanvasCount(costCenterCoverage)}/${formatCanvasCount(bookings.length)}`}
            sub="Rows with mapped CC"
            hint={
              query.dateField === "createdAt" ? "created_at" : "reservation"
            }
          />
        </div>

        <div style={topGridStyle}>
          <CanvasCard
            theme={th}
            title="查詢與狀態"
            subtitle="Search、date field、page size 與 owned order status 保持既有 query contract。"
          >
            <form action="/bookings" style={{ display: "grid", gap: 14 }}>
              <div style={filterGridStyle}>
                <CanvasField theme={th} label="Search">
                  <input
                    defaultValue={query.q}
                    name="q"
                    placeholder="Booking ID, order ID, passenger, route"
                    style={fieldInputStyle}
                  />
                </CanvasField>
                <CanvasField theme={th} label="Date field">
                  <select
                    defaultValue={query.dateField}
                    name="dateField"
                    style={fieldInputStyle}
                  >
                    <option value="reservationStart">Reservation start</option>
                    <option value="createdAt">Created at</option>
                  </select>
                </CanvasField>
                <CanvasField theme={th} label="From">
                  <input
                    defaultValue={query.dateFrom}
                    name="dateFrom"
                    type="date"
                    style={monoInputStyle}
                  />
                </CanvasField>
                <CanvasField theme={th} label="To">
                  <input
                    defaultValue={query.dateTo}
                    name="dateTo"
                    type="date"
                    style={monoInputStyle}
                  />
                </CanvasField>
                <CanvasField theme={th} label="Page size">
                  <select
                    defaultValue={String(query.pageSize)}
                    name="pageSize"
                    style={fieldInputStyle}
                  >
                    <option value="10">10</option>
                    <option value="25">25</option>
                    <option value="50">50</option>
                  </select>
                </CanvasField>
              </div>

              {query.statuses.length > 0 ? (
                <input
                  name="status"
                  type="hidden"
                  value={query.statuses.join(",")}
                />
              ) : null}

              <div style={statusChipRowStyle}>
                {OWNED_ORDER_STATUSES.map((status) => {
                  const nextStatuses = toggleStatus(query.statuses, status);
                  const href = buildTabHref(query, nextStatuses);
                  const selected = query.statuses.includes(status);

                  return (
                    <Link
                      href={href}
                      key={status}
                      style={{
                        ...statusChipStyle,
                        color: selected ? th.accent : th.textMuted,
                        background: selected ? th.accentBg : th.surface,
                        borderColor: selected ? th.accentBorder : th.border,
                      }}
                    >
                      <span>{status}</span>
                      <span style={subtleTextStyle}>
                        {formatCanvasCount(result.statusCounts[status] ?? 0)}
                      </span>
                    </Link>
                  );
                })}
              </div>

              <div style={controlRowStyle}>
                <button style={submitButtonStyle} type="submit">
                  Apply filters
                </button>
                <Link href="/bookings" style={secondaryLinkStyle}>
                  Reset
                </Link>
              </div>
            </form>
          </CanvasCard>

          <CanvasCard
            theme={th}
            title="List summary"
            subtitle="Table columns align to TN_Bookings while preserving the live backend-backed row set."
          >
            <CanvasDL
              theme={th}
              cols={1}
              items={[
                {
                  k: "TAB",
                  v: activeTab.label,
                  mono: true,
                },
                {
                  k: "VISIBLE",
                  v: `${formatCanvasCount(result.items.length)} / ${formatCanvasCount(result.total)}`,
                  mono: true,
                },
                {
                  k: "DATE FIELD",
                  v:
                    query.dateField === "createdAt"
                      ? "createdAt"
                      : "reservationStart",
                  mono: true,
                },
                {
                  k: "WINDOW",
                  v:
                    query.dateFrom || query.dateTo
                      ? `${query.dateFrom || "—"} -> ${query.dateTo || "—"}`
                      : "current default range",
                  mono: true,
                },
                {
                  k: "ACTIVE FILTERS",
                  v:
                    query.statuses.length > 0
                      ? query.statuses.join(", ")
                      : "all owned order statuses",
                  mono: true,
                },
                {
                  k: "LATEST ROW",
                  v: result.items[0] ? formatWindow(result.items[0]) : "—",
                  mono: true,
                },
                {
                  k: "LAST CREATED",
                  v: result.items[0]
                    ? formatDateInput(result.items[0].createdAt) || "—"
                    : "—",
                  mono: true,
                },
                {
                  k: "AVG FARE",
                  v: formatMoney(averageFare),
                  mono: true,
                },
              ]}
            />
          </CanvasCard>
        </div>

        <CanvasCard theme={th} padding={0}>
          <div style={tableMetaStyle}>
            Showing {formatCanvasCount(result.items.length)} of{" "}
            {formatCanvasCount(result.total)} booking row(s)
          </div>
          <CanvasTable<BookingRow>
            theme={th}
            columns={columns}
            rows={result.items as BookingRow[]}
          />
          {result.items.length === 0 ? (
            <div style={emptyStateStyle}>
              No booking matched the current query. Clear status filters or
              broaden the date window.
            </div>
          ) : null}
          <div style={paginationStyle}>
            <span>
              Page {result.page} of {result.totalPages}
            </span>
            <div style={paginationLinksStyle}>
              {result.page > 1 ? (
                <Link
                  href={`/bookings?${buildBookingListQueryString(query, {
                    page: result.page - 1,
                  })}`}
                  style={bookingLinkStyle}
                >
                  Previous
                </Link>
              ) : null}
              {result.page < result.totalPages ? (
                <Link
                  href={`/bookings?${buildBookingListQueryString(query, {
                    page: result.page + 1,
                  })}`}
                  style={bookingLinkStyle}
                >
                  Next
                </Link>
              ) : null}
            </div>
          </div>
        </CanvasCard>
      </div>
    </div>
  );
}
