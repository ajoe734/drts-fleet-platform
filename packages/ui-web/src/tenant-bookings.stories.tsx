import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  CalloutBanner,
  DataCellStack,
  DataViewCard,
  FilterPill,
  FilterPillRow,
  PageHeader,
  StatusChip,
} from "./index";
import { StoryChrome, TenantStoryShell } from "./tenant-story-support";
import {
  storyActionStyle,
  storyFieldGridStyle,
  storyFieldLabelStyle,
  storyFieldStyle,
  storyInputStyle,
  storyTableCellStyle,
  storyTableHeaderStyle,
  storyTableStyle,
  tenantStoryBookings,
} from "./tenant-booking-story-support";

function BookingsBuiltView() {
  return (
    <TenantStoryShell currentPath="/bookings" breadcrumb="Bookings">
      <PageHeader
        eyebrow="Bookings"
        title="Bookings"
        subtitle="TN_Bookings parity target with tabbed filter lane and table-first list layout."
        meta={[
          { label: "Rows", value: "42", tone: "tenant" },
          { label: "Active", value: "14" },
          { label: "Forwarded", value: "5", tone: "warning" },
        ]}
        actions={
          <>
            <span style={storyActionStyle()}>Reset filters</span>
            <span style={storyActionStyle(true)}>Create booking</span>
          </>
        }
      />

      <DataViewCard
        title="Filter lane"
        subtitle="The upper lane keeps TN_Bookings tabs while retaining the canonical query model."
        tone="tenant"
      >
        <FilterPillRow>
          <FilterPill label="All" active tone="tenant" />
          <FilterPill label="In progress" tone="tenant" />
          <FilterPill label="Scheduled" tone="tenant" />
          <FilterPill label="Completed" tone="tenant" />
          <FilterPill label="Cancelled" tone="tenant" />
        </FilterPillRow>
        <div style={storyFieldGridStyle}>
          <label style={storyFieldStyle}>
            <span style={storyFieldLabelStyle}>Search</span>
            <input
              defaultValue="BK-240508"
              style={storyInputStyle}
              type="text"
            />
          </label>
          <label style={storyFieldStyle}>
            <span style={storyFieldLabelStyle}>Date field</span>
            <select defaultValue="reservationStart" style={storyInputStyle}>
              <option>Reservation start</option>
            </select>
          </label>
          <label style={storyFieldStyle}>
            <span style={storyFieldLabelStyle}>From</span>
            <input
              defaultValue="2026-05-01"
              style={storyInputStyle}
              type="date"
            />
          </label>
          <label style={storyFieldStyle}>
            <span style={storyFieldLabelStyle}>To</span>
            <input
              defaultValue="2026-05-31"
              style={storyInputStyle}
              type="date"
            />
          </label>
          <label style={storyFieldStyle}>
            <span style={storyFieldLabelStyle}>Page size</span>
            <select defaultValue="25" style={storyInputStyle}>
              <option>25</option>
            </select>
          </label>
        </div>
        <FilterPillRow>
          <FilterPill label="created" count={2} tone="tenant" />
          <FilterPill label="ready_for_dispatch" count={5} tone="info" />
          <FilterPill label="assigned" count={8} tone="success" />
          <FilterPill label="on_trip" count={3} tone="success" />
          <FilterPill label="proof_pending" count={1} tone="warning" />
          <FilterPill label="completed" count={17} tone="success" />
          <FilterPill label="cancelled" count={2} tone="danger" />
        </FilterPillRow>
      </DataViewCard>

      <DataViewCard
        title="Showing 25 of 42 booking row(s)"
        subtitle="The table matches the TN_Bookings BK / ORDER / TYPE / PICKUP->DROP / WIN / PASS. / CC / STATE structure."
        tone="tenant"
      >
        <CalloutBanner
          title="Forwarded rows keep external-platform authority"
          description="The list still shows mirrored business records, but platform recovery states stay outside tenant mutation authority."
          tone="warning"
          density="compact"
        />
        <div style={{ overflowX: "auto" }}>
          <table style={{ ...storyTableStyle, minWidth: "1080px" }}>
            <thead>
              <tr>
                <th style={{ ...storyTableHeaderStyle, width: "116px" }}>BK</th>
                <th style={{ ...storyTableHeaderStyle, width: "124px" }}>
                  Order
                </th>
                <th style={{ ...storyTableHeaderStyle, width: "146px" }}>
                  Type
                </th>
                <th style={storyTableHeaderStyle}>Pickup -&gt; drop</th>
                <th style={{ ...storyTableHeaderStyle, width: "180px" }}>
                  Win
                </th>
                <th style={{ ...storyTableHeaderStyle, width: "150px" }}>
                  Pass.
                </th>
                <th style={{ ...storyTableHeaderStyle, width: "130px" }}>CC</th>
                <th style={{ ...storyTableHeaderStyle, width: "174px" }}>
                  State
                </th>
              </tr>
            </thead>
            <tbody>
              {tenantStoryBookings.map((booking) => (
                <tr key={booking.bookingId}>
                  <td style={storyTableCellStyle}>
                    <DataCellStack
                      primary={
                        <span style={{ color: "#0f766e", fontWeight: 700 }}>
                          {booking.bookingId}
                        </span>
                      }
                      secondary={
                        <StatusChip
                          label={booking.source}
                          tone={booking.sourceTone}
                        />
                      }
                    />
                  </td>
                  <td
                    style={{ ...storyTableCellStyle, fontFamily: "monospace" }}
                  >
                    {booking.orderId}
                  </td>
                  <td style={storyTableCellStyle}>
                    <DataCellStack
                      primary={booking.subtype}
                      secondary={booking.bookingType}
                    />
                  </td>
                  <td style={storyTableCellStyle}>
                    <DataCellStack
                      primary={booking.pickup}
                      secondary={`Drop ${booking.dropoff}`}
                    />
                  </td>
                  <td style={storyTableCellStyle}>
                    <DataCellStack
                      primary={booking.windowStart}
                      secondary={booking.windowEnd}
                    />
                  </td>
                  <td style={storyTableCellStyle}>
                    <DataCellStack
                      primary={<strong>{booking.passenger}</strong>}
                      secondary={booking.phone}
                    />
                  </td>
                  <td
                    style={{ ...storyTableCellStyle, fontFamily: "monospace" }}
                  >
                    {booking.costCenter}
                  </td>
                  <td style={storyTableCellStyle}>
                    <DataCellStack
                      primary={
                        <StatusChip label={booking.state} tone="success" />
                      }
                      secondary={`Booking ${booking.bookingState}`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DataViewCard>
    </TenantStoryShell>
  );
}

const meta = {
  title: "Tenant Console/Bookings",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Side-by-side parity story for the `TN_Bookings` artboard. The Built panel mirrors the redesigned booking list route, while the Canvas panel embeds `Tenant Console.html#bookings`.",
      },
    },
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Bookings: Story = {
  render: () => (
    <StoryChrome
      heading="Tenant Bookings Parity Review"
      summary="Built implementation and the `TN_Bookings` artboard are rendered together for manual side-by-side review."
      built={<BookingsBuiltView />}
      anchor="bookings"
    />
  ),
};
