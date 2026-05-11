import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  CalloutBanner,
  DataViewCard,
  DetailMetadataGrid,
  PageHeader,
  StatusChip,
  Stepper,
  Timeline,
  WorkflowSplitLayout,
} from "./index";
import { StoryChrome, TenantStoryShell } from "./tenant-story-support";
import {
  storyActionStyle,
  tenantStoryActivity,
  tenantStoryLifecycle,
} from "./tenant-booking-story-support";

function BookingDetailBuiltView() {
  return (
    <TenantStoryShell currentPath="/bookings" breadcrumb="Booking detail">
      <PageHeader
        eyebrow="Booking detail"
        title="BK-240508-001"
        subtitle="airport_pickup · 台北市信義區松仁路 100 號 -> 桃園機場 第二航廈 出境大廳"
        meta={[
          {
            label: "Order state",
            value: <StatusChip label="assigned" tone="success" />,
            tone: "tenant",
          },
          {
            label: "Booking state",
            value: <StatusChip label="confirmed" tone="neutral" />,
          },
          {
            label: "Source",
            value: <StatusChip label="DRTS operated" tone="tenant" />,
          },
        ]}
        actions={
          <>
            <span style={storyActionStyle()}>Back to list</span>
            <span style={storyActionStyle()}>Duplicate as new</span>
            <span style={storyActionStyle(true)}>Command lane</span>
          </>
        }
      />

      <WorkflowSplitLayout
        main={
          <>
            <DataViewCard
              title="Trip information"
              subtitle="The main detail card mirrors the TN_BookingDetail trip-information block."
              tone="tenant"
            >
              <DetailMetadataGrid
                dense
                minColumnWidth="190px"
                items={[
                  { id: "booking", label: "Booking", value: "BK-240508-001" },
                  { id: "order", label: "Order", value: "ORD-902144" },
                  {
                    id: "passenger",
                    label: "Passenger",
                    value: "林士群 · 0912-345-678",
                  },
                  {
                    id: "cost-center",
                    label: "Cost center",
                    value: "CC-FIN-04",
                  },
                  {
                    id: "pickup",
                    label: "Pickup",
                    value: "台北市信義區松仁路 100 號",
                  },
                  {
                    id: "drop",
                    label: "Drop",
                    value: "桃園機場 第二航廈 出境大廳",
                  },
                  {
                    id: "window",
                    label: "Window",
                    value: "2026-05-08 17:30 -> 2026-05-08 18:00",
                    columnSpan: 2,
                  },
                  {
                    id: "service",
                    label: "Service",
                    value: "airport_pickup",
                  },
                  {
                    id: "fare",
                    label: "Quoted fare",
                    value: "NT$ 1,580",
                  },
                  {
                    id: "payment",
                    label: "Finance authority",
                    value: "DRTS billing and settlement authority",
                    columnSpan: 2,
                  },
                ]}
              />
            </DataViewCard>

            <DataViewCard
              title="Lifecycle"
              subtitle="Step states are derived from the published order status."
              tone="tenant"
            >
              <Stepper
                density="compact"
                items={tenantStoryLifecycle.map((item) => ({
                  id: item.id,
                  title: item.title,
                  description: item.description,
                  state: item.state,
                  ...(item.stateLabel ? { stateLabel: item.stateLabel } : {}),
                  ...(item.tone ? { tone: item.tone } : {}),
                }))}
                orientation="horizontal"
              />
            </DataViewCard>

            <DataViewCard
              title="Published activity"
              subtitle="The activity lane is built from published checkpoints rather than hidden dispatch events."
              tone="tenant"
            >
              <Timeline
                density="compact"
                items={tenantStoryActivity.map((item) => ({ ...item }))}
              />
            </DataViewCard>

            <DataViewCard
              title="Business context"
              subtitle="Optional reservation attributes stay readable without leaking dispatch-only controls."
              tone="tenant"
              density="compact"
            >
              <DetailMetadataGrid
                dense
                minColumnWidth="190px"
                items={[
                  {
                    id: "vehicle-preference",
                    label: "Vehicle preference",
                    value: "Executive sedan",
                  },
                  {
                    id: "benefit-reference",
                    label: "Benefit reference",
                    value: "BT-ELITE-001",
                  },
                  { id: "direction", label: "Direction", value: "pickup" },
                  { id: "flight", label: "Flight", value: "CI 102" },
                  { id: "terminal", label: "Terminal", value: "T2" },
                  { id: "luggage", label: "Luggage", value: "2 bag(s)" },
                  {
                    id: "booked-by",
                    label: "Booked by",
                    value: "張俐萱 · admin@yamatogroup.example",
                    columnSpan: 2,
                  },
                  {
                    id: "notes",
                    label: "Notes",
                    value: "Quarterly audit kickoff meeting.",
                    columnSpan: 2,
                  },
                ]}
              />
            </DataViewCard>
          </>
        }
        side={
          <>
            <DataViewCard
              title="Published fulfillment snapshot"
              subtitle="This replaces the artboard's driver card because tenant contracts do not publish driver or vehicle identity here."
              tone="tenant"
              density="compact"
            >
              <DetailMetadataGrid
                dense
                minColumnWidth="180px"
                items={[
                  { id: "source", label: "Source", value: "DRTS operated" },
                  {
                    id: "path",
                    label: "Fulfillment path",
                    value: "DRTS dispatch and fulfillment",
                  },
                  {
                    id: "partner",
                    label: "Partner program",
                    value: "Not applicable",
                  },
                  {
                    id: "entry",
                    label: "Partner entry",
                    value: "Not applicable",
                  },
                  {
                    id: "eligibility",
                    label: "Eligibility",
                    value: "elig_00219",
                  },
                  {
                    id: "issuer",
                    label: "Issuer auth",
                    value: "Not applicable",
                  },
                  {
                    id: "fare-source",
                    label: "Fare source",
                    value: "quote_engine",
                  },
                  {
                    id: "pricing-version",
                    label: "Pricing version",
                    value: "pr_v23",
                  },
                ]}
              />
              <CalloutBanner
                title="Authority boundary"
                description="Driver identity, vehicle, and direct contact stay hidden until a tenant-cleared fulfillment read model is published."
                tone="warning"
                density="compact"
              />
            </DataViewCard>

            <DataViewCard
              title="Billing snapshot"
              subtitle="Quoted fare, manual override posture, and linked invoices stay in the right rail."
              tone="tenant"
              density="compact"
            >
              <DetailMetadataGrid
                dense
                minColumnWidth="180px"
                items={[
                  { id: "fare", label: "Quoted fare", value: "NT$ 1,580" },
                  { id: "source", label: "Fare source", value: "quote_engine" },
                  { id: "version", label: "Pricing version", value: "pr_v23" },
                  {
                    id: "override",
                    label: "Manual override",
                    value: "None",
                    columnSpan: 2,
                  },
                ]}
              />
              <CalloutBanner
                title="INV-2026-05-001 · NT$ 1,580"
                description="paid · 2026-05-01 -> 2026-05-31"
                tone="success"
                density="compact"
              />
            </DataViewCard>
          </>
        }
      />

      <DataViewCard
        title="Tenant command lane"
        subtitle="Only supported tenant update and cancel commands remain visible on the detail route."
        tone="tenant"
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          <span style={storyActionStyle()}>Update booking</span>
          <span style={storyActionStyle(true)}>Cancel booking</span>
        </div>
      </DataViewCard>
    </TenantStoryShell>
  );
}

const meta = {
  title: "Tenant Console/Booking Detail",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Side-by-side parity story for the `TN_BookingDetail` artboard. The Built panel mirrors the redesigned booking detail route, while the Canvas panel embeds `Tenant Console.html#booking-detail`.",
      },
    },
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const BookingDetail: Story = {
  render: () => (
    <StoryChrome
      heading="Tenant Booking Detail Parity Review"
      summary="Built implementation and the `TN_BookingDetail` artboard are rendered together for manual side-by-side review."
      built={<BookingDetailBuiltView />}
      anchor="booking-detail"
    />
  ),
};
