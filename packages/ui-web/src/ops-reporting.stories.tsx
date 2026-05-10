import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ManagementShell } from "./management-shell";
import type { ManagementSidebarSection } from "./management-sidebar";
import {
  CalloutBanner,
  DataCellStack,
  DataFilterBar,
  DataTable,
  DataViewCard,
  KpiCard,
  KpiRow,
  PageHeader,
  StatusChip,
  Td,
  Tr,
} from "./index";

const canvasBaseSrc = "/drts-design-canvas/Ops%20Console.html";

const opsSections: ManagementSidebarSection[] = [
  {
    key: "workspace",
    title: "Workspace",
    items: [{ href: "/dashboard", label: "Dashboard" }],
  },
  {
    key: "dispatch",
    title: "Realtime Dispatch",
    items: [
      {
        href: "/dispatch",
        label: "Dispatch",
        badge: "23",
        badgeTone: "accent",
      },
      {
        href: "/callcenter",
        label: "Callcenter",
        badge: "5",
        badgeTone: "info",
      },
    ],
  },
  {
    key: "monitoring",
    title: "Monitoring",
    items: [
      { href: "/reports", label: "Reports" },
      { href: "/revenue", label: "Revenue" },
      { href: "/attendance", label: "Attendance" },
      { href: "/maintenance", label: "Maintenance" },
    ],
  },
];

const pageStackStyle = {
  maxWidth: "1180px",
  margin: "0 auto",
  display: "grid",
  gap: "20px",
};

const splitGridStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.45fr) minmax(280px, 0.95fr)",
  gap: "16px",
  alignItems: "start" as const,
};

const comparisonGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(720px, 1fr))",
  gap: "16px",
  alignItems: "start" as const,
  overflowX: "auto" as const,
};

const listCardStyle = {
  display: "grid",
  gap: "8px",
  padding: "12px 14px",
  border: "1px solid #dbe2ea",
  borderRadius: "14px",
  background: "#f8fafc",
};

function ComparisonFrame({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ display: "grid", gap: "12px", alignContent: "start" }}>
      <div style={{ display: "grid", gap: "4px" }}>
        <div
          style={{
            fontSize: "12px",
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#475569",
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: "13px", color: "#64748b", lineHeight: 1.5 }}>
          {subtitle}
        </div>
      </div>
      {children}
    </section>
  );
}

function StoryChrome({
  heading,
  summary,
  built,
  anchor,
}: {
  heading: string;
  summary: string;
  built: React.ReactNode;
  anchor: string;
}) {
  return (
    <div style={{ padding: "24px", background: "#e2e8f0" }}>
      <div style={{ display: "grid", gap: "16px" }}>
        <div style={{ display: "grid", gap: "4px" }}>
          <div
            style={{
              fontSize: "12px",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#475569",
            }}
          >
            {heading}
          </div>
          <div style={{ fontSize: "13px", color: "#475569", lineHeight: 1.5 }}>
            {summary}
          </div>
        </div>
        <div style={comparisonGridStyle}>
          <ComparisonFrame
            title="Built"
            subtitle="`@drts/ui-web` reporting parity target composed with the Wave 2 ops shell."
          >
            <div
              style={{
                minWidth: "720px",
                borderRadius: "22px",
                overflow: "hidden",
                border: "1px solid #cbd5e1",
                background: "#f8fafc",
              }}
            >
              {built}
            </div>
          </ComparisonFrame>
          <ComparisonFrame
            title="Canvas"
            subtitle={`\`docs/05-ui/drts-design-canvas/Ops Console.html#${anchor}\``}
          >
            <iframe
              src={`${canvasBaseSrc}#${anchor}`}
              title={`${anchor} canvas reference`}
              style={{
                width: "100%",
                minWidth: "720px",
                height: "900px",
                border: "1px solid #cbd5e1",
                borderRadius: "22px",
                background: "#ffffff",
              }}
            />
          </ComparisonFrame>
        </div>
      </div>
    </div>
  );
}

function OpsStoryShell({
  currentPath,
  breadcrumb,
  children,
}: {
  currentPath: string;
  breadcrumb: string;
  children: React.ReactNode;
}) {
  return (
    <ManagementShell
      sidebar={{
        brand: "Operations Console",
        brandSub: "Phase 1 reporting",
        brandIcon: (
          <span style={{ fontSize: "11px", fontWeight: 700 }}>OC</span>
        ),
        sections: opsSections,
        currentPath,
      }}
      topbar={{
        breadcrumb: [{ label: "Operations Console" }, { label: breadcrumb }],
        envLabel: "ops",
        envTone: "ops",
      }}
    >
      <div style={pageStackStyle}>{children}</div>
    </ManagementShell>
  );
}

function ReportsBuiltView() {
  return (
    <OpsStoryShell currentPath="/reports" breadcrumb="Reports">
      <PageHeader
        eyebrow="Compliance exports"
        title="Reports"
        subtitle="Queue posture, signed artifact access, and immutable filing packages in one export surface."
        meta={[
          { label: "Jobs", value: "31" },
          { label: "Queued", value: "4", tone: "warning" },
          { label: "Ready artifacts", value: "18", tone: "success" },
        ]}
      />
      <KpiRow minWidth="170px">
        <KpiCard
          label="Queued jobs"
          value="4"
          detail="2 regulatory bundles"
          tone="warning"
        />
        <KpiCard
          label="Completed reports"
          value="19"
          detail="Latest run 7 min ago"
          tone="success"
        />
        <KpiCard
          label="Regulatory jobs"
          value="12"
          detail="Signed access only"
          tone="ops"
        />
        <KpiCard
          label="Expiring URLs"
          value="3"
          detail="Refresh before handoff"
          tone="warning"
        />
      </KpiRow>
      <CalloutBanner
        tone="warning"
        title="3 artifact links expire within 12 hours"
        description="Refresh signed URLs before sending regulator-facing bundles outside the console."
      />
      <div style={splitGridStyle}>
        <DataViewCard
          title="Report job supervision"
          subtitle="Queued, running, and failed export workload is surfaced before the full registry."
          tone="ops"
          density="compact"
          summary="4 queued, 2 running, 1 failed."
          filters={
            <DataFilterBar
              ariaLabel="Report job views"
              value="all"
              filters={[
                { value: "all", label: "All", count: 31, tone: "ops" },
                { value: "queued", label: "Queued", count: 4, tone: "warning" },
                { value: "running", label: "Running", count: 2, tone: "info" },
                { value: "failed", label: "Failed", count: 1, tone: "danger" },
              ]}
            />
          }
        >
          <DataTable
            density="compact"
            tone="ops"
            columns={[
              { label: "Job", width: "210px" },
              { label: "Category", width: "150px" },
              { label: "Period", width: "180px" },
              { label: "Status", width: "140px" },
              { label: "Artifact" },
            ]}
          >
            <Tr>
              <Td density="compact">
                <DataCellStack
                  primary={<strong>job_20260510_21</strong>}
                  secondary="revenue_summary"
                />
              </Td>
              <Td density="compact">Operational</Td>
              <Td density="compact">2026-05 closed month</Td>
              <Td density="compact">
                <StatusChip
                  tone="warning"
                  authorityLabel="worker"
                  label="queued"
                />
              </Td>
              <Td density="compact" muted>
                Awaiting background pickup
              </Td>
            </Tr>
            <Tr>
              <Td density="compact">
                <DataCellStack
                  primary={<strong>job_20260510_18</strong>}
                  secondary="vehicle_roster"
                />
              </Td>
              <Td density="compact">Regulatory</Td>
              <Td density="compact">2026-05 closed month</Td>
              <Td density="compact">
                <StatusChip
                  tone="success"
                  authorityLabel="worker"
                  label="completed"
                />
              </Td>
              <Td density="compact" muted>
                Signed XLSX ready
              </Td>
            </Tr>
          </DataTable>
        </DataViewCard>
        <DataViewCard
          title="Artifact and filing controls"
          subtitle="Immutable package families and access rules stay visible beside the queue."
          tone="neutral"
          density="compact"
        >
          <div style={{ display: "grid", gap: "10px" }}>
            {[
              ["Monthly report", "8 packages", "append-only"],
              ["Six-month statistics", "2 packages", "regulator handoff"],
              ["Insurance roster", "3 packages", "signed download"],
            ].map(([title, value, note]) => (
              <div key={title} style={listCardStyle}>
                <DataCellStack
                  primary={<strong>{title}</strong>}
                  secondary={value}
                  tertiary={note}
                />
                <StatusChip tone="info" authorityLabel="filing" label={note} />
              </div>
            ))}
          </div>
        </DataViewCard>
      </div>
    </OpsStoryShell>
  );
}

function RevenueBuiltView() {
  return (
    <OpsStoryShell currentPath="/revenue" breadcrumb="Revenue">
      <PageHeader
        eyebrow="Revenue controls"
        title="Revenue"
        subtitle="Settlement-matrix-first monitoring keeps payout authority and reconciliation debt visible before statement close."
        meta={[
          { label: "Trips", value: "1,284" },
          { label: "Revenue", value: "NT$ 1.86M", tone: "success" },
          { label: "Mismatch queue", value: "7", tone: "warning" },
        ]}
      />
      <DataViewCard
        title="Revenue view controls"
        subtitle="Slice payout posture by period, product, and vehicle."
        tone="ops"
        density="compact"
        filters={
          <DataFilterBar
            ariaLabel="Revenue filter chips"
            value="7d"
            filters={[
              { value: "today", label: "Today", count: 182, tone: "neutral" },
              { value: "7d", label: "7 days", count: 1284, tone: "ops" },
              { value: "30d", label: "30 days", count: 5420, tone: "neutral" },
            ]}
          />
        }
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          <StatusChip
            tone="info"
            authorityLabel="product"
            label="all products"
          />
          <StatusChip
            tone="info"
            authorityLabel="vehicle"
            label="all vehicles"
          />
          <StatusChip
            tone="warning"
            authorityLabel="recon"
            label="7 mismatch jobs"
          />
        </div>
      </DataViewCard>
      <KpiRow minWidth="170px">
        <KpiCard
          label="Completed trips"
          value="1,284"
          detail="7-day window"
          tone="success"
        />
        <KpiCard
          label="Recognized revenue"
          value="NT$ 1.86M"
          detail="Owned + forwarded"
          tone="ops"
        />
        <KpiCard
          label="Average trip"
          value="NT$ 1,448"
          detail="Completed trips only"
          tone="info"
        />
        <KpiCard
          label="Queued pipeline"
          value="NT$ 218K"
          detail="Waiting on completion"
          tone="warning"
        />
      </KpiRow>
      <div style={splitGridStyle}>
        <DataViewCard
          title="Settlement matrix"
          subtitle="Channel-level payout, receipt, and reconciliation authority."
          tone="ops"
          density="compact"
          summary="4 channels, 1 shadow-only, 7 mismatch follow-ups."
        >
          <DataTable
            density="compact"
            tone="ops"
            columns={[
              { label: "Channel", width: "180px" },
              { label: "Ledger", width: "140px" },
              { label: "Payout owner", width: "180px" },
              { label: "Receipt", width: "130px" },
              { label: "Evidence" },
            ]}
          >
            <Tr>
              <Td density="compact">
                <DataCellStack
                  primary={<strong>tenant_enterprise</strong>}
                  secondary="enterprise dispatch"
                />
              </Td>
              <Td density="compact">
                <StatusChip
                  tone="success"
                  authorityLabel="ledger"
                  label="full service"
                />
              </Td>
              <Td density="compact">DRTS settlement</Td>
              <Td density="compact">Internal</Td>
              <Td density="compact" muted>
                426 orders · 42 statements
              </Td>
            </Tr>
            <Tr>
              <Td density="compact">
                <DataCellStack
                  primary={<strong>forwarded_shadow</strong>}
                  secondary="partner shadow lane"
                />
              </Td>
              <Td density="compact">
                <StatusChip
                  tone="warning"
                  authorityLabel="ledger"
                  label="shadow only"
                />
              </Td>
              <Td density="compact">External partner</Td>
              <Td density="compact">Partner issued</Td>
              <Td density="compact" muted>
                7 mismatch jobs · 3 sync_failed
              </Td>
            </Tr>
          </DataTable>
        </DataViewCard>
        <DataViewCard
          title="Monitoring posture"
          subtitle="Short queue for the highest-risk revenue lanes."
          tone="warning"
          density="compact"
        >
          <div style={{ display: "grid", gap: "10px" }}>
            {[
              [
                "Mismatch queue",
                "7 jobs",
                "Forwarded orders waiting on reconciliation follow-up.",
              ],
              [
                "Shadow ledger lanes",
                "1 channel",
                "Still settled externally; review receipt evidence.",
              ],
              [
                "Sync failures",
                "3",
                "Adapter mirrors failed during the current close window.",
              ],
            ].map(([title, value, note]) => (
              <div key={title} style={listCardStyle}>
                <DataCellStack
                  primary={<strong>{title}</strong>}
                  secondary={value}
                  tertiary={note}
                />
                <StatusChip
                  tone="warning"
                  authorityLabel="attention"
                  label={value}
                />
              </div>
            ))}
          </div>
        </DataViewCard>
      </div>
    </OpsStoryShell>
  );
}

function AttendanceBuiltView() {
  return (
    <OpsStoryShell currentPath="/attendance" breadcrumb="Attendance">
      <PageHeader
        eyebrow="Workforce monitor"
        title="Attendance"
        subtitle="Live clock-ins, exception prompts, and gantt-style attendance visibility for shift supervision."
        meta={[
          { label: "Shifts", value: "121" },
          { label: "Active", value: "48", tone: "ops" },
          { label: "Exceptions", value: "6", tone: "warning" },
        ]}
      />
      <KpiRow minWidth="170px">
        <KpiCard
          label="Active shifts"
          value="48"
          detail="Drivers currently on duty"
          tone="ops"
        />
        <KpiCard
          label="Attendance exceptions"
          value="6"
          detail="Partial or absent rows"
          tone="danger"
        />
        <KpiCard
          label="Extended shifts"
          value="4"
          detail="Already over 10 hours"
          tone="warning"
        />
        <KpiCard
          label="Tracked hours"
          value="418.5h"
          detail="Attendance ledger total"
          tone="success"
        />
      </KpiRow>
      <CalloutBanner
        tone="warning"
        title="2 active shifts still have no vehicle pairing"
        description="Resolve these rows before dispatch confidence drifts further into the evening shift."
      />
      <div style={splitGridStyle}>
        <DataViewCard
          title="Live clock-in board"
          subtitle="Current on-duty shifts with vehicle pairing, duration, and origin snapshot."
          tone="ops"
          density="compact"
          summary="48 active shifts, 2 still waiting on vehicle assignment."
        >
          <DataTable
            density="compact"
            tone="ops"
            columns={[
              { label: "Driver", width: "180px" },
              { label: "Vehicle", width: "140px" },
              { label: "Clocked in", width: "180px" },
              { label: "Duty span", width: "120px" },
              { label: "Location" },
            ]}
          >
            <Tr>
              <Td density="compact">
                <DataCellStack
                  primary={<strong>drv_4410</strong>}
                  secondary="shift_20260510_11"
                />
              </Td>
              <Td density="compact">veh_2040</Td>
              <Td density="compact" muted>
                2026-05-10 09:00
              </Td>
              <Td density="compact">
                <StatusChip tone="info" authorityLabel="duty" label="8.4h" />
              </Td>
              <Td density="compact" muted>
                Taipei Main Station
              </Td>
            </Tr>
            <Tr>
              <Td density="compact">
                <DataCellStack
                  primary={<strong>drv_4488</strong>}
                  secondary="shift_20260510_14"
                />
              </Td>
              <Td density="compact">unassigned</Td>
              <Td density="compact" muted>
                2026-05-10 11:10
              </Td>
              <Td density="compact">
                <StatusChip tone="warning" authorityLabel="duty" label="7.0h" />
              </Td>
              <Td density="compact" muted>
                Songshan
              </Td>
            </Tr>
          </DataTable>
        </DataViewCard>
        <DataViewCard
          title="Attention queue"
          subtitle="Supervisor prompts derived from live attendance and shift state."
          tone="warning"
          density="compact"
        >
          <div style={{ display: "grid", gap: "10px" }}>
            {[
              ["Completed today", "62", "Present attendance rows dated today."],
              [
                "No-vehicle active shifts",
                "2",
                "Clocked-in drivers still waiting on vehicle pairing.",
              ],
              [
                "Attendance exceptions",
                "6",
                "Partial and absent rows need follow-up.",
              ],
            ].map(([title, value, note]) => (
              <div key={title} style={listCardStyle}>
                <DataCellStack
                  primary={<strong>{title}</strong>}
                  secondary={value}
                  tertiary={note}
                />
                <StatusChip
                  tone="warning"
                  authorityLabel="attention"
                  label={value}
                />
              </div>
            ))}
          </div>
        </DataViewCard>
      </div>
    </OpsStoryShell>
  );
}

function MaintenanceBuiltView() {
  return (
    <OpsStoryShell currentPath="/maintenance" breadcrumb="Maintenance">
      <PageHeader
        eyebrow="Fleet readiness"
        title="Maintenance"
        subtitle="Dispatch-impact watchlist, workshop occupancy, and work-order backlog in one operational surface."
        meta={[
          { label: "Records", value: "42" },
          { label: "Overdue", value: "5", tone: "warning" },
          { label: "Dispatch impact", value: "11", tone: "ops" },
        ]}
      />
      <KpiRow minWidth="170px">
        <KpiCard
          label="Active orders"
          value="11"
          detail="Scheduled or in progress"
          tone="ops"
        />
        <KpiCard
          label="Overdue"
          value="5"
          detail="Hold dispatch if unresolved"
          tone="warning"
        />
        <KpiCard
          label="Completed"
          value="24"
          detail="Ready to return to supply"
          tone="success"
        />
        <KpiCard
          label="Dispatch-impact backlog"
          value="11"
          detail="Vehicles currently constrained"
          tone="danger"
        />
      </KpiRow>
      <CalloutBanner
        tone="warning"
        title="5 overdue maintenance items remain open"
        description="Dispatch should avoid these vehicles until technicians clear the backlog or confirm fallback capacity."
      />
      <div style={splitGridStyle}>
        <DataViewCard
          title="Operational watchlist"
          subtitle="Dispatch impact cues derived from overdue, in-progress, and scheduled work orders."
          tone="warning"
          density="compact"
          summary="6 affected vehicles across overdue and active workshop rows."
        >
          <div style={{ display: "grid", gap: "10px" }}>
            {[
              [
                "veh_2061",
                "mnt_5011 · brake system",
                "Dispatch hold recommended",
              ],
              [
                "veh_2104",
                "mnt_5018 · tire replacement",
                "Vehicle in workshop",
              ],
              [
                "veh_2112",
                "mnt_5022 · annual inspection",
                "Schedule around service slot",
              ],
            ].map(([vehicle, meta, cue]) => (
              <div key={meta} style={listCardStyle}>
                <DataCellStack
                  primary={<strong>{vehicle}</strong>}
                  secondary={meta}
                  tertiary={cue}
                />
                <StatusChip
                  tone="warning"
                  authorityLabel="dispatch"
                  label={cue}
                />
              </div>
            ))}
          </div>
        </DataViewCard>
        <DataViewCard
          title="Today and next actions"
          subtitle="Workshop occupancy and vehicles returning to supply."
          tone="ops"
          density="compact"
        >
          <div style={{ display: "grid", gap: "10px" }}>
            {[
              ["Due today", "4", "Work orders scheduled for today."],
              ["In workshop", "6", "Vehicles currently unavailable."],
              [
                "Ready to return",
                "24",
                "Completed work orders awaiting dispatch reuse.",
              ],
            ].map(([title, value, note]) => (
              <div key={title} style={listCardStyle}>
                <DataCellStack
                  primary={<strong>{title}</strong>}
                  secondary={value}
                  tertiary={note}
                />
                <StatusChip
                  tone="info"
                  authorityLabel="planning"
                  label={value}
                />
              </div>
            ))}
          </div>
        </DataViewCard>
      </div>
      <DataViewCard
        title="Maintenance backlog"
        subtitle="Filtered work-order registry with dispatch-facing cues."
        tone="ops"
        density="compact"
        filters={
          <DataFilterBar
            ariaLabel="Maintenance status tabs"
            value="all"
            filters={[
              { value: "all", label: "All", count: 42, tone: "ops" },
              {
                value: "scheduled",
                label: "Scheduled",
                count: 6,
                tone: "info",
              },
              {
                value: "in_progress",
                label: "In progress",
                count: 5,
                tone: "warning",
              },
              { value: "overdue", label: "Overdue", count: 5, tone: "danger" },
            ]}
          />
        }
      >
        <DataTable
          density="compact"
          tone="ops"
          columns={[
            { label: "Work order", width: "220px" },
            { label: "Status", width: "140px" },
            { label: "Dispatch cue", width: "220px" },
            { label: "Vehicle", width: "130px" },
            { label: "Schedule" },
          ]}
        >
          <Tr>
            <Td density="compact">
              <DataCellStack
                primary={<strong>mnt_5011</strong>}
                secondary="brake system"
                tertiary="tech_007"
              />
            </Td>
            <Td density="compact">
              <StatusChip
                tone="danger"
                authorityLabel="status"
                label="overdue"
              />
            </Td>
            <Td density="compact">Dispatch hold recommended</Td>
            <Td density="compact">veh_2061</Td>
            <Td density="compact" muted>
              2026-05-10 13:00
            </Td>
          </Tr>
        </DataTable>
      </DataViewCard>
    </OpsStoryShell>
  );
}

const meta = {
  title: "OpsReporting",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Built parity targets for the Wave 2 ops reporting redesign. Use these stories beside `OC_Reports`, `OC_Revenue`, `OC_Attendance`, and `OC_Maintenance` during OPS-UI-RD-007 review.",
      },
    },
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Reports: Story = {
  render: () => (
    <StoryChrome
      heading="Ops Reporting Parity Review"
      summary="Built implementation and the `OC_Reports` artboard are rendered together for manual side-by-side review."
      built={<ReportsBuiltView />}
      anchor="reports"
    />
  ),
};

export const Revenue: Story = {
  render: () => (
    <StoryChrome
      heading="Ops Reporting Parity Review"
      summary="Built implementation and the `OC_Revenue` artboard are rendered together for manual side-by-side review."
      built={<RevenueBuiltView />}
      anchor="revenue"
    />
  ),
};

export const Attendance: Story = {
  render: () => (
    <StoryChrome
      heading="Ops Reporting Parity Review"
      summary="Built implementation and the `OC_Attendance` artboard are rendered together for manual side-by-side review."
      built={<AttendanceBuiltView />}
      anchor="attendance"
    />
  ),
};

export const Maintenance: Story = {
  render: () => (
    <StoryChrome
      heading="Ops Reporting Parity Review"
      summary="Built implementation and the `OC_Maintenance` artboard are rendered together for manual side-by-side review."
      built={<MaintenanceBuiltView />}
      anchor="maintenance"
    />
  ),
};
