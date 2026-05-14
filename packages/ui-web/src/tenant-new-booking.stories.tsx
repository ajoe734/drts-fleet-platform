import type { CSSProperties } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  CalloutBanner,
  DataCellStack,
  DataViewCard,
  DetailList,
  PageHeader,
  StatusChip,
} from "./index";
import { StoryChrome, TenantStoryShell } from "./tenant-story-support";
import {
  storyActionStyle,
  storyCompactGridStyle,
  storyFieldGridStyle,
  storyFieldLabelStyle,
  storyFieldStyle,
  storyInputStyle,
} from "./tenant-booking-story-support";

const selectStyle: CSSProperties = {
  ...storyInputStyle,
  appearance: "none",
};

const textareaStyle: CSSProperties = {
  ...storyInputStyle,
  minHeight: "88px",
  padding: "12px",
  resize: "vertical",
};

function NewBookingBuiltView() {
  return (
    <TenantStoryShell currentPath="/bookings/new" breadcrumb="New Booking">
      <PageHeader
        eyebrow="New booking"
        title="Create a booking"
        subtitle="Booking-on-behalf, canonical cost center, approval posture, and quota impact are handled in one route without inventing a local draft system."
        meta={[
          { label: "Passengers", value: "24" },
          { label: "Saved addresses", value: "16" },
          { label: "Cost centers", value: "3", tone: "tenant" },
        ]}
      />

      <CalloutBanner
        title="Estimated spend is preview-only"
        description="The built route can preview quota and approval impact from a tenant-entered estimate, but booking create still leaves canonical quoted fare to the backend pricing authority."
        tone="warning"
        density="compact"
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.4fr) minmax(320px, 1fr)",
          gap: "16px",
          alignItems: "start",
        }}
      >
        <div style={{ display: "grid", gap: "16px" }}>
          <DataViewCard
            title="Trip"
            subtitle="Service bucket, booking-on-behalf selection, timing, and address-book-assisted routing stay editable in one place."
            tone="tenant"
          >
            <div style={storyFieldGridStyle}>
              <label style={storyFieldStyle}>
                <span style={storyFieldLabelStyle}>Service subtype</span>
                <select
                  defaultValue="credit_card_airport_transfer"
                  style={selectStyle}
                >
                  <option value="credit_card_airport_transfer">
                    Credit-card airport transfer
                  </option>
                  <option value="enterprise_dispatch">
                    Enterprise dispatch
                  </option>
                </select>
              </label>
              <label style={storyFieldStyle}>
                <span style={storyFieldLabelStyle}>Passenger</span>
                <select defaultValue="lin" style={selectStyle}>
                  <option value="lin">林士群 · Y2103</option>
                  <option value="wang">王思穎 · R1128</option>
                </select>
              </label>
              <label style={storyFieldStyle}>
                <span style={storyFieldLabelStyle}>Reservation start</span>
                <input
                  defaultValue="2026-05-15T17:30"
                  readOnly
                  style={storyInputStyle}
                />
              </label>
              <label style={storyFieldStyle}>
                <span style={storyFieldLabelStyle}>Reservation end</span>
                <input
                  defaultValue="2026-05-15T18:00"
                  readOnly
                  style={storyInputStyle}
                />
              </label>
              <label style={storyFieldStyle}>
                <span style={storyFieldLabelStyle}>Passenger name</span>
                <input defaultValue="林士群" readOnly style={storyInputStyle} />
              </label>
              <label style={storyFieldStyle}>
                <span style={storyFieldLabelStyle}>Passenger phone</span>
                <input
                  defaultValue="0912-345-678"
                  readOnly
                  style={storyInputStyle}
                />
              </label>
            </div>
          </DataViewCard>

          <DataViewCard
            title="Pickup and drop"
            subtitle="Directory-backed addresses can be selected first, then fine-tuned inline without a separate geocoding flow."
            tone="tenant"
          >
            <div style={storyFieldGridStyle}>
              <label style={storyFieldStyle}>
                <span style={storyFieldLabelStyle}>Saved pickup</span>
                <select defaultValue="hq" style={selectStyle}>
                  <option value="hq">台北總部</option>
                </select>
              </label>
              <label style={storyFieldStyle}>
                <span style={storyFieldLabelStyle}>Saved drop-off</span>
                <select defaultValue="tpe" style={selectStyle}>
                  <option value="tpe">桃園機場 第二航廈</option>
                </select>
              </label>
              <label style={{ ...storyFieldStyle, gridColumn: "1 / -1" }}>
                <span style={storyFieldLabelStyle}>Pickup address</span>
                <input
                  defaultValue="台北市信義區松仁路 100 號"
                  readOnly
                  style={storyInputStyle}
                />
              </label>
              <label style={{ ...storyFieldStyle, gridColumn: "1 / -1" }}>
                <span style={storyFieldLabelStyle}>Drop-off address</span>
                <input
                  defaultValue="桃園機場 第二航廈 出境大廳"
                  readOnly
                  style={storyInputStyle}
                />
              </label>
            </div>
          </DataViewCard>

          <DataViewCard
            title="Governance"
            subtitle="Cost center, finance references, and delegate-booking metadata stay inside the published tenant booking command."
            tone="tenant"
          >
            <div style={storyFieldGridStyle}>
              <label style={storyFieldStyle}>
                <span style={storyFieldLabelStyle}>Cost center</span>
                <select defaultValue="CC-FIN-04" style={selectStyle}>
                  <option value="CC-FIN-04">CC-FIN-04 · 財務處</option>
                </select>
              </label>
              <label style={storyFieldStyle}>
                <span style={storyFieldLabelStyle}>Estimated spend (TWD)</span>
                <input defaultValue="1580" readOnly style={storyInputStyle} />
              </label>
              <label style={storyFieldStyle}>
                <span style={storyFieldLabelStyle}>Benefit reference</span>
                <input
                  defaultValue="PRJ-2026-Q2-AUDIT"
                  readOnly
                  style={storyInputStyle}
                />
              </label>
              <label style={storyFieldStyle}>
                <span style={storyFieldLabelStyle}>Booked by</span>
                <input
                  defaultValue="王小美 · may@example.com"
                  readOnly
                  style={storyInputStyle}
                />
              </label>
              <label style={{ ...storyFieldStyle, gridColumn: "1 / -1" }}>
                <span style={storyFieldLabelStyle}>Notes</span>
                <textarea
                  defaultValue="季度稽核啟動會議"
                  readOnly
                  style={textareaStyle}
                />
              </label>
            </div>
          </DataViewCard>
        </div>

        <div style={{ display: "grid", gap: "16px" }}>
          <DataViewCard
            title="Policy evaluation"
            subtitle="Approval posture and quota impact come from the backend preview directly."
            tone="tenant"
          >
            <div style={storyCompactGridStyle}>
              <DataCellStack
                primary={
                  <StatusChip label="Approval required" tone="warning" />
                }
                secondary="Airport pickup + finance cost center"
              />
              <DataCellStack
                primary={<StatusChip label="Auto refresh" tone="tenant" />}
                secondary="Runs after the required booking context is present"
              />
            </div>
            <DetailList
              items={[
                {
                  id: "service",
                  label: "Service",
                  value: "Credit-card airport transfer",
                },
                {
                  id: "passengerRole",
                  label: "Passenger role",
                  value: "employee",
                },
                {
                  id: "estimate",
                  label: "Estimated spend",
                  value: "TWD 1,580",
                },
              ]}
            />
            <div style={{ display: "grid", gap: "10px" }}>
              <strong style={{ fontSize: "13px", color: "#0f172a" }}>
                Approval plan
              </strong>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                <StatusChip label="Mode: any_of" tone="tenant" />
                <StatusChip label="Timeout: 24h" tone="info" />
                <StatusChip
                  label="Fallback: escalate_to_tenant_admin"
                  tone="warning"
                />
              </div>
              <ul style={{ margin: 0, paddingLeft: "18px", color: "#475569" }}>
                <li>財務管理員</li>
                <li>Cost-center owner</li>
              </ul>
            </div>
          </DataViewCard>

          <DataViewCard
            title="Quota impact"
            subtitle="The built route keeps the backend preview vocabulary visible instead of replacing it with a local forecast."
            tone="tenant"
          >
            <DetailList
              items={[
                {
                  id: "tenantQuota",
                  label: "Tenant",
                  value: "Before 42 / 60 · after 41 · 68% remaining",
                },
                {
                  id: "costCenterQuota",
                  label: "CC-FIN-04",
                  value: "Before 82 / 300 · after 81 · 27% remaining",
                },
              ]}
            />
          </DataViewCard>

          <DataViewCard
            title="Create the booking"
            subtitle="Blocked outcomes stay client-blocked. Approval-required outcomes still submit, but the approval workflow remains backend-owned."
            tone="tenant"
          >
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              <StatusChip label="Approval required" tone="warning" />
              <StatusChip label="CC-FIN-04" tone="tenant" />
            </div>
            <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
              <span style={storyActionStyle()}>No draft action</span>
              <span style={{ flex: 1 }} />
              <span style={storyActionStyle(true)}>Submit for approval</span>
            </div>
          </DataViewCard>
        </div>
      </div>
    </TenantStoryShell>
  );
}

const meta = {
  title: "Tenant Console/New Booking",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Side-by-side parity story for the `TN_NewBooking` artboard. The built panel keeps booking-on-behalf, cost-center, quota, and approval scope inside the published tenant contracts and omits the unpublished draft-save affordance.",
      },
    },
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const NewBooking: Story = {
  render: () => (
    <StoryChrome
      heading="Tenant New Booking Parity Review"
      summary="Built implementation and the `TN_NewBooking` artboard are rendered together for manual side-by-side review."
      built={<NewBookingBuiltView />}
      anchor="newbooking"
    />
  ),
};
