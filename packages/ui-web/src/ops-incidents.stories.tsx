import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ManagementShell } from "./management-shell";
import type { ManagementSidebarSection } from "./management-sidebar";
import {
  CalloutBanner,
  DataCellStack,
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
    key: "casework",
    title: "Casework",
    items: [
      {
        href: "/complaints",
        label: "Complaints",
        badge: "3",
        badgeTone: "warning",
      },
      {
        href: "/incidents",
        label: "Incidents",
        badge: "1",
        badgeTone: "danger",
      },
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
            subtitle="`@drts/ui-web` casework parity target composed with the Wave 2 ops shell."
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
        brandSub: "Phase 1 casework",
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

function ComplaintsBuiltView() {
  return (
    <OpsStoryShell currentPath="/complaints" breadcrumb="Complaints">
      <PageHeader
        eyebrow="Complaint workspace"
        title="Complaints"
        subtitle="Case lifecycle, SLA, escalation, and reopen-safe history in one casework surface."
        meta={[
          { label: "Active", value: "12" },
          { label: "SLA breach", value: "2", tone: "danger" },
          { label: "Escalation ready", value: "3", tone: "warning" },
          { label: "Unassigned", value: "4", tone: "warning" },
        ]}
      />
      <KpiRow minWidth="170px">
        <KpiCard
          label="Active cases"
          value="12"
          detail="Open in ops queue"
          tone="ops"
        />
        <KpiCard
          label="Hotline-linked"
          value="6"
          detail="Phone-originated cases"
          tone="info"
        />
        <KpiCard
          label="SLA breach"
          value="2"
          detail="Need immediate response"
          tone="danger"
        />
        <KpiCard
          label="Closed export-ready"
          value="18"
          detail="Audit packet prepared"
          tone="success"
        />
      </KpiRow>
      <CalloutBanner
        tone="info"
        title="Authority and escalation guardrails"
        description="Complaint ownership stays in ops until the audit-export packet is ready. Escalate to incidents only when safety, operational outage, or service recovery coordination crosses the complaint boundary."
      />
      <DataViewCard
        title="Immediate complaints requiring ops attention"
        subtitle="SLA breach and high-severity cases ready for incident escalation."
        tone="warning"
        density="compact"
        summary="3 shown of 3"
      >
        <div style={{ display: "grid", gap: "10px" }}>
          {[
            ["cmp_0894", "fare_dispute · AGENT-OPS-002", "SLA breach"],
            ["cmp_0921", "service_quality · unassigned", "high"],
            ["cmp_0932", "driver_conduct · AGENT-OPS-005", "high"],
          ].map(([caseNo, meta, badge]) => (
            <div key={caseNo} style={listCardStyle}>
              <DataCellStack
                primary={<strong>{caseNo}</strong>}
                secondary={meta}
                tertiary="SLA due in 12 min"
              />
              <StatusChip
                tone={badge === "SLA breach" ? "danger" : "warning"}
                label={badge}
              />
            </div>
          ))}
        </div>
      </DataViewCard>
      <div style={splitGridStyle}>
        <DataViewCard
          title="Registry and SLA queue"
          subtitle="Filtered complaints registry with priority, severity, and assignee context."
          tone="ops"
          density="compact"
          summary="Visible: 12"
        >
          <DataTable
            density="compact"
            tone="ops"
            columns={[
              { label: "Case", width: "150px" },
              { label: "Category", width: "150px" },
              { label: "Status", width: "150px" },
              { label: "SLA", width: "120px" },
              { label: "Created" },
            ]}
          >
            <Tr>
              <Td density="compact">
                <DataCellStack
                  primary={<strong>cmp_0894</strong>}
                  secondary="high"
                />
              </Td>
              <Td density="compact">fare_dispute</Td>
              <Td density="compact">
                <StatusChip
                  tone="warning"
                  authorityLabel="status"
                  label="under_investigation"
                />
              </Td>
              <Td density="compact">
                <StatusChip tone="danger" label="BREACH" />
              </Td>
              <Td density="compact" muted>
                2026-05-08 13:22
              </Td>
            </Tr>
            <Tr>
              <Td density="compact">
                <DataCellStack
                  primary={<strong>cmp_0921</strong>}
                  secondary="high"
                />
              </Td>
              <Td density="compact">service_quality</Td>
              <Td density="compact">
                <StatusChip
                  tone="info"
                  authorityLabel="status"
                  label="assigned"
                />
              </Td>
              <Td density="compact" muted>
                SLA due in 1h 12m
              </Td>
              <Td density="compact" muted>
                2026-05-09 08:45
              </Td>
            </Tr>
          </DataTable>
        </DataViewCard>
        <DataViewCard
          title="Embedded case workspace"
          subtitle="Selected case detail, assign, note, resolve, reopen, escalate, and audit timeline."
          tone="neutral"
          density="compact"
          summary="cmp_0894"
        >
          <div style={{ display: "grid", gap: "12px" }}>
            <div style={listCardStyle}>
              <DataCellStack
                primary={<strong>Status</strong>}
                secondary="under_investigation"
                tertiary="SLA due 2026-05-10 16:00"
              />
              <StatusChip tone="danger" label="SLA breach" />
            </div>
            <div style={listCardStyle}>
              <DataCellStack
                primary={<strong>Assignee</strong>}
                secondary="AGENT-OPS-002"
                tertiary="reopen count 1"
              />
              <StatusChip
                tone="info"
                authorityLabel="action"
                label="prepare incident handoff"
              />
            </div>
          </div>
        </DataViewCard>
      </div>
    </OpsStoryShell>
  );
}

function IncidentDetailBuiltView() {
  return (
    <OpsStoryShell currentPath="/incidents" breadcrumb="Incidents">
      <PageHeader
        eyebrow="Incident workspace"
        title="inc_0214 · driver SOS · passenger conflict"
        subtitle="critical · safety · in_response · 14:42 opened"
        meta={[
          { label: "Active", value: "4" },
          { label: "Critical", value: "1", tone: "danger" },
          { label: "Linked entities", value: "3", tone: "info" },
          { label: "Recovery pending", value: "2", tone: "warning" },
        ]}
      />
      <KpiRow minWidth="170px">
        <KpiCard
          label="Active incidents"
          value="4"
          detail="Open or investigating"
          tone="ops"
        />
        <KpiCard
          label="Critical"
          value="1"
          detail="SOS-grade priority"
          tone="danger"
        />
        <KpiCard
          label="Linked entities"
          value="3"
          detail="Order / vehicle / complaint"
          tone="info"
        />
      </KpiRow>
      <CalloutBanner
        tone="info"
        title="Authority and service recovery guardrails"
        description="Driver SOS and dispatch-exception incidents remain ops-owned even when linked orders or complaints exist. Service recovery actions document passenger remediation; they do not replace timeline updates or formal resolution notes."
      />
      <DataViewCard
        title="Critical SOS queue"
        subtitle="Priority queue · critical only"
        tone="danger"
        density="compact"
        summary="1 active critical"
      >
        <div style={listCardStyle}>
          <DataCellStack
            primary={
              <strong>inc_0214 · driver SOS · passenger conflict</strong>
            }
            secondary="d_8843 triggered SOS at Taipei Xinyi · safety lead engaged"
            tertiary="critical · in_response"
          />
          <StatusChip tone="danger" label="critical" />
        </div>
      </DataViewCard>
      <div style={splitGridStyle}>
        <DataViewCard
          title="Backlog"
          subtitle="Incident registry with severity and escalation state."
          tone="ops"
          density="compact"
          summary="Visible: 4"
        >
          <DataTable
            density="compact"
            tone="ops"
            columns={[
              { label: "Incident", width: "220px" },
              { label: "Severity", width: "140px" },
              { label: "Status", width: "140px" },
              { label: "Escalation" },
            ]}
          >
            <Tr>
              <Td density="compact">
                <DataCellStack
                  primary={<strong>driver SOS · passenger conflict</strong>}
                  secondary="inc_0214 · safety"
                />
              </Td>
              <Td density="compact">
                <StatusChip tone="danger" label="critical" />
              </Td>
              <Td density="compact">in_response</Td>
              <Td density="compact" muted>
                safety_lead
              </Td>
            </Tr>
            <Tr>
              <Td density="compact">
                <DataCellStack
                  primary={<strong>collision report · minor</strong>}
                  secondary="inc_0218 · property"
                />
              </Td>
              <Td density="compact">
                <StatusChip tone="warning" label="medium" />
              </Td>
              <Td density="compact">investigating</Td>
              <Td density="compact" muted>
                tenant_business
              </Td>
            </Tr>
          </DataTable>
        </DataViewCard>
        <DataViewCard
          title="inc_0214"
          subtitle="Embedded incident workspace · timeline + service recovery"
          tone="neutral"
          density="compact"
        >
          <div style={{ display: "grid", gap: "12px" }}>
            <div style={listCardStyle}>
              <DataCellStack
                primary={<strong>Status</strong>}
                secondary="in_response"
                tertiary="opened 14:42"
              />
              <StatusChip tone="danger" label="critical" />
            </div>
            <div style={listCardStyle}>
              <DataCellStack
                primary={<strong>Service recovery</strong>}
                secondary="2 actions recorded"
                tertiary="redispatch + voucher"
              />
              <StatusChip
                tone="warning"
                authorityLabel="recovery"
                label="EAP pending"
              />
            </div>
          </div>
        </DataViewCard>
      </div>
    </OpsStoryShell>
  );
}

const meta = {
  title: "OpsIncidents",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Built parity targets for the Wave 2 ops casework redesign. Use these stories beside `OC_Complaints` and `OC_IncidentDetail` during OPS-UI-RD-006 review.",
      },
    },
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Complaints: Story = {
  render: () => (
    <StoryChrome
      heading="Ops Complaints Parity Review"
      summary="Built implementation and the `OC_Complaints` artboard are rendered together for manual side-by-side review."
      built={<ComplaintsBuiltView />}
      anchor="complaints"
    />
  ),
};

export const IncidentDetail: Story = {
  render: () => (
    <StoryChrome
      heading="Ops Incident Detail Parity Review"
      summary="Built implementation and the `OC_IncidentDetail` artboard are rendered together for manual side-by-side review. The console preserves the embedded workspace pattern beyond the canvas mock."
      built={<IncidentDetailBuiltView />}
      anchor="incident-detail"
    />
  ),
};
