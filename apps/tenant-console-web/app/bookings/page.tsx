import Link from "next/link";
import type { CSSProperties } from "react";
import type { BookingRecord, OwnedOrderStatus } from "@drts/contracts";
import {
  CanvasBtn,
  CanvasCard,
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
} from "@/lib/booking-list";
import { getTenantClient } from "@/lib/api-client";
import { formatDateTime } from "@/lib/formatters";

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

const emptyStateStyle: CSSProperties = {
  padding: 24,
  color: th.textMuted,
  fontSize: 12.5,
  textAlign: "center",
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
      r: (row) => formatWindow(row),
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
        <CanvasCard theme={th} padding={0}>
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
        </CanvasCard>
      </div>
    </div>
  );
}
