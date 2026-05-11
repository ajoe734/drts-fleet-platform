import Link from "next/link";
import { OWNED_ORDER_STATUSES, type OwnedOrderStatus } from "@drts/contracts";
import {
  CalloutBanner,
  DataCellStack,
  DataViewCard,
  FilterPill,
  FilterPillRow,
  PageHeader,
  StatusChip,
  managementPageStackStyle,
} from "@drts/ui-web";
import {
  formatOrderStatusLabel,
  getOrderStatusTone,
  getSourceTone,
  isActiveOrderStatus,
} from "@/lib/booking-surface";
import {
  applyBookingListQuery,
  buildBookingListQueryString,
  parseBookingListQuery,
  toggleStatus,
} from "@/lib/booking-list";
import { getTenantClient } from "@/lib/api-client";
import { formatDateTime } from "@/lib/formatters";
import { getBookingSourceVisibility } from "@/lib/source-domain";

export const dynamic = "force-dynamic";

const pageStackStyle = {
  ...managementPageStackStyle(),
  maxWidth: "1180px",
  margin: "0 auto",
};

const filterGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: "12px",
};

const fieldStyle = {
  display: "grid",
  gap: "6px",
};

const fieldLabelStyle = {
  fontSize: "12px",
  fontWeight: 700,
  color: "#475569",
  textTransform: "uppercase" as const,
  letterSpacing: "0.08em",
};

const inputStyle = {
  width: "100%",
  minHeight: "42px",
  borderRadius: "14px",
  border: "1px solid #cbd5e1",
  background: "#ffffff",
  color: "#0f172a",
  padding: "0 12px",
  fontSize: "13px",
};

const tableStyle = {
  width: "100%",
  minWidth: "1080px",
  borderCollapse: "collapse" as const,
  fontSize: "13px",
};

const tableHeaderStyle = {
  padding: "10px 12px",
  textAlign: "left" as const,
  fontSize: "11.5px",
  fontWeight: 600,
  color: "#64748b",
  textTransform: "uppercase" as const,
  letterSpacing: "0.05em",
  borderBottom: "1px solid #dbe5ef",
  background: "#f0fdfa",
  whiteSpace: "nowrap" as const,
};

const tableCellStyle = {
  padding: "11px 12px",
  verticalAlign: "top" as const,
  borderBottom: "1px solid #eef2f7",
};

function actionLinkStyle(primary = false) {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "40px",
    padding: "0 16px",
    borderRadius: "999px",
    border: primary ? "1px solid transparent" : "1px solid #99f6e4",
    background: primary ? "#0f766e" : "#f0fdfa",
    color: primary ? "#ffffff" : "#115e59",
    fontSize: "13px",
    fontWeight: 700,
    textDecoration: "none",
  };
}

function matchesStatuses(
  current: OwnedOrderStatus[],
  target: readonly OwnedOrderStatus[],
) {
  return (
    current.length === target.length &&
    target.every((status) => current.includes(status))
  );
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
  const hasForwardedAuthority = result.items.some(
    (booking) =>
      getBookingSourceVisibility(booking).domain === "forwarded_authority",
  );
  const activeCount = bookings.filter((booking) =>
    isActiveOrderStatus(booking.orderStatus),
  ).length;
  const forwardedCount = bookings.filter((booking) => {
    return getBookingSourceVisibility(booking).domain !== "owned";
  }).length;

  const tabGroups = [
    { label: "All", statuses: [] as OwnedOrderStatus[] },
    {
      label: "In progress",
      statuses: OWNED_ORDER_STATUSES.filter((status) =>
        isActiveOrderStatus(status),
      ),
    },
    {
      label: "Scheduled",
      statuses: [
        "created",
        "recording_pending",
        "ready_for_dispatch",
        "preassigned",
        "assigned",
        "driver_accepted",
        "enroute_pickup",
        "arrived_pickup",
      ] as OwnedOrderStatus[],
    },
    { label: "Completed", statuses: ["completed"] as OwnedOrderStatus[] },
    { label: "Cancelled", statuses: ["cancelled"] as OwnedOrderStatus[] },
  ];

  return (
    <div style={pageStackStyle}>
      <PageHeader
        eyebrow="Bookings"
        title="Bookings"
        subtitle="Tenant booking oversight redesigned to match the TN_Bookings table-first route."
        meta={[
          { label: "Rows", value: String(result.total), tone: "tenant" },
          { label: "Active", value: String(activeCount) },
          {
            label: "Forwarded",
            value: String(forwardedCount),
            tone: "warning",
          },
        ]}
        actions={
          <>
            <Link href="/bookings" style={actionLinkStyle()}>
              Reset filters
            </Link>
            <Link href="/bookings/new" style={actionLinkStyle(true)}>
              Create booking
            </Link>
          </>
        }
      />

      <DataViewCard
        title="Filter lane"
        subtitle="The upper lane keeps TN_Bookings tabs while retaining the canonical shared list-query contract."
        tone="tenant"
        summary="Tabs handle high-level slices; the search form and status chips still speak in real OwnedOrderStatus values."
      >
        <FilterPillRow>
          {tabGroups.map((tab) => {
            const hrefQuery = buildBookingListQueryString(query, {
              statuses: tab.statuses,
              page: 1,
            });
            return (
              <Link
                href={hrefQuery ? `/bookings?${hrefQuery}` : "/bookings"}
                key={tab.label}
                style={{ textDecoration: "none" }}
              >
                <FilterPill
                  label={tab.label}
                  active={matchesStatuses(query.statuses, tab.statuses)}
                  tone="tenant"
                />
              </Link>
            );
          })}
        </FilterPillRow>

        <form action="/bookings" style={{ display: "grid", gap: "16px" }}>
          <div style={filterGridStyle}>
            <label style={fieldStyle}>
              <span style={fieldLabelStyle}>Search</span>
              <input
                defaultValue={query.q}
                name="q"
                placeholder="Booking ID, order ID, passenger, route"
                style={inputStyle}
                type="text"
              />
            </label>
            <label style={fieldStyle}>
              <span style={fieldLabelStyle}>Date field</span>
              <select
                defaultValue={query.dateField}
                name="dateField"
                style={inputStyle}
              >
                <option value="reservationStart">Reservation start</option>
                <option value="createdAt">Created at</option>
              </select>
            </label>
            <label style={fieldStyle}>
              <span style={fieldLabelStyle}>From</span>
              <input
                defaultValue={query.dateFrom}
                name="dateFrom"
                style={inputStyle}
                type="date"
              />
            </label>
            <label style={fieldStyle}>
              <span style={fieldLabelStyle}>To</span>
              <input
                defaultValue={query.dateTo}
                name="dateTo"
                style={inputStyle}
                type="date"
              />
            </label>
            <label style={fieldStyle}>
              <span style={fieldLabelStyle}>Page size</span>
              <select
                defaultValue={String(query.pageSize)}
                name="pageSize"
                style={inputStyle}
              >
                <option value="10">10</option>
                <option value="25">25</option>
                <option value="50">50</option>
              </select>
            </label>
          </div>
          {query.statuses.length > 0 ? (
            <input
              name="status"
              type="hidden"
              value={query.statuses.join(",")}
            />
          ) : null}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
            }}
          >
            <FilterPillRow>
              {OWNED_ORDER_STATUSES.map((status) => {
                const nextStatuses = toggleStatus(query.statuses, status);
                const hrefQuery = buildBookingListQueryString(query, {
                  statuses: nextStatuses,
                  page: 1,
                });
                return (
                  <Link
                    href={hrefQuery ? `/bookings?${hrefQuery}` : "/bookings"}
                    key={status}
                    style={{ textDecoration: "none" }}
                  >
                    <FilterPill
                      label={formatOrderStatusLabel(status)}
                      active={query.statuses.includes(status)}
                      count={result.statusCounts[status] ?? 0}
                      tone={getOrderStatusTone(status)}
                    />
                  </Link>
                );
              })}
            </FilterPillRow>
            <button
              style={{
                ...actionLinkStyle(true),
                border: "1px solid transparent",
                cursor: "pointer",
              }}
              type="submit"
            >
              Apply filters
            </button>
          </div>
        </form>
      </DataViewCard>

      <DataViewCard
        title={`Showing ${result.items.length} of ${result.total} booking row(s)`}
        subtitle="The table is reshaped to the TN_Bookings artboard while keeping detail drill-in and authority boundaries intact."
        tone="tenant"
        summary="Booking rows stay read-only on this surface. Mutations remain limited to the supported detail-page command lane."
      >
        {hasForwardedAuthority ? (
          <CalloutBanner
            title="Forwarded rows keep external-platform authority"
            description="The table still shows forwarded business records, but adapter-native recovery states remain outside tenant mutation authority."
            tone="warning"
            density="compact"
          />
        ) : null}
        {result.items.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={{ ...tableHeaderStyle, width: "116px" }}>BK</th>
                  <th style={{ ...tableHeaderStyle, width: "124px" }}>Order</th>
                  <th style={{ ...tableHeaderStyle, width: "146px" }}>Type</th>
                  <th style={tableHeaderStyle}>Pickup -&gt; drop</th>
                  <th style={{ ...tableHeaderStyle, width: "180px" }}>Win</th>
                  <th style={{ ...tableHeaderStyle, width: "150px" }}>Pass.</th>
                  <th style={{ ...tableHeaderStyle, width: "130px" }}>CC</th>
                  <th style={{ ...tableHeaderStyle, width: "174px" }}>State</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((booking) => {
                  const source = getBookingSourceVisibility(booking);
                  return (
                    <tr key={booking.bookingId}>
                      <td style={tableCellStyle}>
                        <DataCellStack
                          primary={
                            <Link
                              href={`/bookings/${booking.bookingId}`}
                              style={{
                                color: "#0f766e",
                                fontWeight: 700,
                                textDecoration: "none",
                              }}
                            >
                              {booking.bookingId}
                            </Link>
                          }
                          secondary={
                            <StatusChip
                              label={source.badge}
                              tone={getSourceTone(source)}
                            />
                          }
                        />
                      </td>
                      <td
                        style={{ ...tableCellStyle, fontFamily: "monospace" }}
                      >
                        {booking.orderId}
                      </td>
                      <td style={tableCellStyle}>
                        <DataCellStack
                          primary={booking.businessDispatchSubtype}
                          secondary={booking.bookingType}
                        />
                      </td>
                      <td style={tableCellStyle}>
                        <DataCellStack
                          primary={booking.pickup.address}
                          secondary={`Drop ${booking.dropoff.address}`}
                        />
                      </td>
                      <td style={tableCellStyle}>
                        <DataCellStack
                          primary={formatDateTime(
                            booking.reservationWindowStart,
                          )}
                          secondary={formatDateTime(
                            booking.reservationWindowEnd,
                          )}
                        />
                      </td>
                      <td style={tableCellStyle}>
                        <DataCellStack
                          primary={<strong>{booking.passenger.name}</strong>}
                          secondary={booking.passenger.phone}
                        />
                      </td>
                      <td
                        style={{ ...tableCellStyle, fontFamily: "monospace" }}
                      >
                        {booking.costCenter ?? "Not set"}
                      </td>
                      <td style={tableCellStyle}>
                        <DataCellStack
                          primary={
                            <StatusChip
                              label={formatOrderStatusLabel(
                                booking.orderStatus,
                              )}
                              tone={getOrderStatusTone(booking.orderStatus)}
                            />
                          }
                          secondary={`Booking ${booking.status}`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <CalloutBanner
            title="No rows matched the current query"
            description="Clear one or more status filters or widen the date window to return tenant booking rows."
            tone="info"
            density="compact"
          />
        )}

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
          }}
        >
          <span style={{ color: "#64748b", fontSize: "12.5px" }}>
            Page {result.page} of {result.totalPages}
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {result.page > 1 ? (
              <Link
                href={`/bookings?${buildBookingListQueryString(query, {
                  page: result.page - 1,
                })}`}
                style={actionLinkStyle()}
              >
                Previous
              </Link>
            ) : null}
            {result.page < result.totalPages ? (
              <Link
                href={`/bookings?${buildBookingListQueryString(query, {
                  page: result.page + 1,
                })}`}
                style={actionLinkStyle()}
              >
                Next
              </Link>
            ) : null}
          </div>
        </div>
      </DataViewCard>
    </div>
  );
}
