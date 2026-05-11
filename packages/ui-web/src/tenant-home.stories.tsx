import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  CalloutBanner,
  DataCellStack,
  DataViewCard,
  DetailMetadataGrid,
  KpiCard,
  KpiRow,
  PageHeader,
  StatusChip,
  WorkflowSplitLayout,
} from "./index";
import { StoryChrome, TenantStoryShell } from "./tenant-story-support";
import {
  storyActionStyle,
  storyCompactGridStyle,
  storyTableCellStyle,
  storyTableHeaderStyle,
  storyTableStyle,
  tenantStoryBookings,
  tenantStoryNotices,
} from "./tenant-booking-story-support";

function HomeBuiltView() {
  return (
    <TenantStoryShell currentPath="/" breadcrumb="Home">
      <PageHeader
        eyebrow="Tenant home"
        title="Home"
        subtitle="TN_Home parity target with KPI row, active bookings table, and reminder stack."
        meta={[
          { label: "Tenant", value: "YAMATO Group", tone: "tenant" },
          { label: "Realm", value: "tenant" },
          { label: "Auth mode", value: "tenant_session" },
        ]}
        actions={
          <>
            <span style={storyActionStyle()}>Help & settings</span>
            <span style={storyActionStyle(true)}>Create booking</span>
          </>
        }
      />

      <KpiRow minWidth="180px">
        <KpiCard
          label="In progress"
          value="14"
          detail="3 broadcasting · 11 assigned"
          tone="tenant"
        />
        <KpiCard
          label="Completed today"
          value="38"
          detail="↑ 6 vs. yesterday"
          tone="success"
        />
        <KpiCard
          label="This month"
          value="3,820"
          detail="76% of 5,000 quota"
          tone="info"
        />
        <KpiCard
          label="Current invoice"
          value="NT$ 1.22M"
          detail="2026-04 · pending review"
          tone="warning"
        />
      </KpiRow>

      <WorkflowSplitLayout
        main={
          <DataViewCard
            title="Ongoing bookings"
            subtitle="The main TN_Home card keeps active bookings visible first."
            tone="tenant"
            actions={<span style={storyActionStyle()}>Open bookings</span>}
          >
            <div style={{ overflowX: "auto" }}>
              <table style={storyTableStyle}>
                <thead>
                  <tr>
                    <th style={{ ...storyTableHeaderStyle, width: "120px" }}>
                      BK
                    </th>
                    <th style={storyTableHeaderStyle}>Passenger</th>
                    <th style={storyTableHeaderStyle}>Pickup</th>
                    <th style={{ ...storyTableHeaderStyle, width: "160px" }}>
                      Window
                    </th>
                    <th style={{ ...storyTableHeaderStyle, width: "170px" }}>
                      State
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {tenantStoryBookings.slice(0, 5).map((booking) => (
                    <tr key={booking.bookingId}>
                      <td style={storyTableCellStyle}>
                        <DataCellStack
                          primary={
                            <span style={{ color: "#0f766e", fontWeight: 700 }}>
                              {booking.bookingId}
                            </span>
                          }
                          secondary={`Order ${booking.orderId}`}
                          tertiary={booking.source}
                        />
                      </td>
                      <td style={storyTableCellStyle}>
                        <DataCellStack
                          primary={<strong>{booking.passenger}</strong>}
                          secondary={booking.phone}
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
                        <div style={{ display: "grid", gap: "8px" }}>
                          <StatusChip label={booking.state} tone="success" />
                          <StatusChip
                            label={booking.source}
                            tone={booking.sourceTone}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DataViewCard>
        }
        side={
          <DataViewCard
            title="Reminders"
            subtitle="Webhook, SLA, and maintenance reminders stay in the right rail."
            tone="tenant"
          >
            {tenantStoryNotices.map((notice) => (
              <CalloutBanner
                key={notice.title}
                title={notice.title}
                description={notice.description}
                tone={notice.tone}
                density="compact"
                footer={notice.footer}
              />
            ))}
          </DataViewCard>
        }
      />

      <div style={storyCompactGridStyle}>
        <DataViewCard
          title="Authority context"
          subtitle="Identity and integration ownership remain visible on Home."
          tone="tenant"
          density="compact"
        >
          <DetailMetadataGrid
            dense
            minColumnWidth="180px"
            items={[
              { id: "tenant", label: "Tenant", value: "tenant-demo-001" },
              { id: "realm", label: "Realm", value: "tenant" },
              { id: "actor", label: "Actor", value: "tenant_admin" },
              { id: "auth", label: "Auth mode", value: "tenant_session" },
              { id: "events", label: "Webhook events", value: "4" },
              { id: "routes", label: "Notification routes", value: "3" },
            ]}
          />
        </DataViewCard>
        <DataViewCard
          title="Workspace posture"
          subtitle="Feature posture and onboarding checklist stay below the KPI lane."
          tone="tenant"
          density="compact"
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            <StatusChip label="billing_exports" tone="tenant" />
            <StatusChip label="tenant_webhooks" tone="tenant" />
            <StatusChip label="report_artifacts" tone="info" />
            <StatusChip label="audit_read" tone="neutral" />
          </div>
          <CalloutBanner
            title="Checklist items still frame readiness"
            description="Issue sandbox credentials, validate delivery, confirm owner, and document rotation."
            tone="warning"
            density="compact"
          />
        </DataViewCard>
      </div>
    </TenantStoryShell>
  );
}

const meta = {
  title: "Tenant Console/Home",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Side-by-side parity story for the `TN_Home` artboard. The Built panel mirrors the redesigned tenant home route, while the Canvas panel embeds `Tenant Console.html#home`.",
      },
    },
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Home: Story = {
  render: () => (
    <StoryChrome
      heading="Tenant Home Parity Review"
      summary="Built implementation and the `TN_Home` artboard are rendered together for manual side-by-side review."
      built={<HomeBuiltView />}
      anchor="home"
    />
  ),
};
