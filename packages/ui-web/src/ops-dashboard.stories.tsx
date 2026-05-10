import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ManagementShell } from "./management-shell";
import type { ManagementSidebarSection } from "./management-sidebar";
import {
  CalloutBanner,
  DataViewCard,
  KpiCard,
  KpiRow,
  PageHeader,
  StatusChip,
} from "./index";

const canvasDashboardSrc = "/drts-design-canvas/Ops%20Console.html#dashboard";

const opsSections: ManagementSidebarSection[] = [
  {
    key: "workspace",
    title: "Workspace",
    items: [
      {
        href: "/dashboard",
        label: "Dashboard",
        badge: "4",
        badgeTone: "warning",
      },
    ],
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
      {
        href: "/incidents",
        label: "Incidents",
        badge: "2",
        badgeTone: "danger",
      },
      { href: "/reports", label: "Reports" },
    ],
  },
];

const pendingItems = [
  {
    key: "incident",
    tone: "danger" as const,
    title: "2 active incidents awaiting supervisor follow-through",
    description:
      "One is already critical, and one has a narrowed SLA window after repeated dispatch retries.",
    cta: "Open incidents",
  },
  {
    key: "queue",
    tone: "warning" as const,
    title: "3 owned dispatch rows are blocked in exception or timeout",
    description:
      "The owned queue is carrying time-sensitive rows that will distort downstream SLA reporting if left untouched.",
    cta: "Handle owned queue",
  },
  {
    key: "forwarded",
    tone: "warning" as const,
    title: "4 forwarded sync failures need triage",
    description:
      "Manual fallback volume is rising and reconciliation is already open for the worst adapter lane.",
    cta: "Open forwarded board",
  },
];

const healthSignals = [
  {
    key: "runtime",
    label: "API runtime",
    value: "healthy",
    tone: "success" as const,
    detail: "live · supervisor_managed_execution",
  },
  {
    key: "lag",
    label: "Dispatch lag",
    value: "Oldest 2 min",
    tone: "warning" as const,
    detail: "3 rows are over the ready-to-assign threshold.",
  },
  {
    key: "driver",
    label: "Driver state lag",
    value: "4",
    tone: "warning" as const,
    detail: "Oldest stale location is now 6 min old.",
  },
  {
    key: "webhook",
    label: "Webhook queue",
    value: "7",
    tone: "success" as const,
    detail: "No failed deliveries in the last hour.",
  },
  {
    key: "adapter",
    label: "GoCab",
    value: "degraded",
    tone: "warning" as const,
    detail: "Reason: sync latency",
  },
];

const queueRows = [
  {
    orderNo: "ORD-8234",
    tenant: "tenant-a",
    pickup: "Taipei Nangang Exhibition Center",
    window: "05/10 17:20 - 05/10 17:40",
    state: "Exception hold",
    tone: "danger" as const,
    driver: "unassigned",
    eta: "pending",
  },
  {
    orderNo: "ORD-8237",
    tenant: "tenant-b",
    pickup: "Songshan Airport Terminal 1",
    window: "05/10 17:35 - 05/10 17:50",
    state: "Queued",
    tone: "owned" as const,
    driver: "drv_4021",
    eta: "8 min",
  },
  {
    orderNo: "ORD-8240",
    tenant: "tenant-c",
    pickup: "Xinyi District City Hall",
    window: "05/10 17:40 - 05/10 18:00",
    state: "No supply",
    tone: "danger" as const,
    driver: "unassigned",
    eta: "pending",
  },
  {
    orderNo: "ORD-8243",
    tenant: "tenant-a",
    pickup: "Neihu Science Park",
    window: "05/10 17:50 - 05/10 18:05",
    state: "Assigned",
    tone: "owned" as const,
    driver: "drv_1994",
    eta: "5 min",
  },
];

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
    <section
      style={{
        display: "grid",
        gap: "12px",
        alignContent: "start",
      }}
    >
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

function OpsDashboardBuiltView() {
  return (
    <ManagementShell
      sidebar={{
        brand: "Operations Console",
        brandSub: "Phase 1 dispatch ops",
        brandIcon: (
          <span style={{ fontSize: "11px", fontWeight: 700 }}>OC</span>
        ),
        sections: opsSections,
        currentPath: "/dashboard",
      }}
      topbar={{
        breadcrumb: [{ label: "Operations Console" }, { label: "Dashboard" }],
        envLabel: "ops",
        envTone: "ops",
      }}
    >
      <div
        style={{
          maxWidth: "1180px",
          margin: "0 auto",
          display: "grid",
          gap: "20px",
        }}
      >
        <PageHeader
          eyebrow="Ops dashboard"
          title="Dashboard"
          subtitle="Six KPI strip, pending handoff work, health signals, and the current dispatch queue."
          meta={[
            { label: "API", value: "healthy" },
            { label: "Realm", value: "ops-console" },
            { label: "Shift windows", value: "12" },
          ]}
        />

        <KpiRow minWidth="168px">
          <KpiCard
            label="Active orders"
            value="217"
            detail="Orders already in progress"
            tone="ops"
          />
          <KpiCard
            label="Dispatch queue"
            value="23"
            detail="8 min average ETA"
            tone="info"
          />
          <KpiCard
            label="Dispatch eligible drivers"
            value="146"
            detail="163 available now"
            tone="success"
          />
          <KpiCard
            label="Driver state lag"
            value="4"
            detail="Oldest 6 min"
            tone="warning"
          />
          <KpiCard
            label="Open incidents"
            value="2"
            detail="1 overdue maintenance carry-over"
            tone="danger"
          />
          <KpiCard
            label="Adapters needing attention"
            value="3"
            detail="6 healthy / 1 down / 9 total"
            tone="warning"
          />
        </KpiRow>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.55fr) minmax(280px, 1fr)",
            gap: "16px",
            alignItems: "start",
          }}
        >
          <DataViewCard
            title="Today's pending work"
            subtitle="Sorted by criticality, SLA risk, and queue blocking impact."
            tone="warning"
          >
            {pendingItems.map((item) => (
              <CalloutBanner
                key={item.key}
                title={item.title}
                description={item.description}
                tone={item.tone}
                actions={
                  <span
                    style={{
                      display: "inline-flex",
                      padding:
                        item.tone === "danger" ? "10px 14px" : "9px 12px",
                      borderRadius: "999px",
                      border:
                        item.tone === "danger"
                          ? "1px solid #0f172a"
                          : "1px solid #cbd5e1",
                      background:
                        item.tone === "danger" ? "#0f172a" : "#ffffff",
                      color: item.tone === "danger" ? "#ffffff" : "#0f172a",
                      fontSize: "12.5px",
                      fontWeight: 600,
                    }}
                  >
                    {item.cta}
                  </span>
                }
              />
            ))}
          </DataViewCard>

          <DataViewCard
            title="Health signals"
            subtitle="05/10 17:42 UTC"
            tone="ops"
          >
            <div style={{ display: "grid", gap: "10px" }}>
              {healthSignals.map((signal) => (
                <div
                  key={signal.key}
                  style={{
                    display: "grid",
                    gap: "6px",
                    padding: "12px 14px",
                    border: "1px solid #dbe2ea",
                    borderRadius: "14px",
                    background: "#f8fafc",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "8px",
                      alignItems: "center",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "12px",
                        fontWeight: 600,
                        color: "#334155",
                      }}
                    >
                      {signal.label}
                    </span>
                    <StatusChip label={signal.value} tone={signal.tone} />
                  </div>
                  <span
                    style={{
                      fontSize: "12px",
                      color: "#64748b",
                      lineHeight: 1.5,
                    }}
                  >
                    {signal.detail}
                  </span>
                </div>
              ))}
            </div>
          </DataViewCard>
        </div>

        <DataViewCard
          title="Current dispatch queue"
          subtitle="Owned queue rows prioritized by exception, timeout, and fresh updates."
          tone="ops"
        >
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "12.5px",
              }}
            >
              <thead>
                <tr
                  style={{
                    background: "#f8fafc",
                    color: "#64748b",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    fontSize: "10.5px",
                  }}
                >
                  {[
                    "Order",
                    "Tenant",
                    "Pickup",
                    "Win",
                    "State",
                    "Driver",
                    "ETA",
                  ].map((label) => (
                    <th
                      key={label}
                      style={{
                        padding: "10px 12px",
                        textAlign: "left",
                        borderBottom: "1px solid #e2e8f0",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {queueRows.map((row) => (
                  <tr
                    key={row.orderNo}
                    style={{ borderBottom: "1px solid #eef2f7" }}
                  >
                    <td
                      style={{
                        padding: "12px",
                        color: "#f97316",
                        fontWeight: 700,
                      }}
                    >
                      {row.orderNo}
                    </td>
                    <td
                      style={{
                        padding: "12px",
                        color: "#475569",
                        fontFamily:
                          "ui-monospace, SFMono-Regular, Menlo, monospace",
                      }}
                    >
                      {row.tenant}
                    </td>
                    <td style={{ padding: "12px", color: "#0f172a" }}>
                      {row.pickup}
                    </td>
                    <td
                      style={{
                        padding: "12px",
                        color: "#475569",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {row.window}
                    </td>
                    <td style={{ padding: "12px" }}>
                      {row.tone === "owned" ? (
                        <StatusChip authority="owned" label={row.state} />
                      ) : (
                        <StatusChip
                          label={row.state}
                          tone={row.tone === "danger" ? "danger" : "warning"}
                        />
                      )}
                    </td>
                    <td
                      style={{
                        padding: "12px",
                        color: "#0f172a",
                        fontFamily:
                          "ui-monospace, SFMono-Regular, Menlo, monospace",
                      }}
                    >
                      {row.driver}
                    </td>
                    <td style={{ padding: "12px", color: "#475569" }}>
                      {row.eta}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DataViewCard>
      </div>
    </ManagementShell>
  );
}

const meta = {
  title: "OpsDashboard",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Built parity target for the OC_Dashboard redesign. Use beside the design canvas artboard during OPS-UI-RD-003 review.",
      },
    },
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Built: Story = {
  render: () => (
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
            Ops Dashboard Parity Review
          </div>
          <div style={{ fontSize: "13px", color: "#475569", lineHeight: 1.5 }}>
            Built implementation and the `OC_Dashboard` artboard are rendered in
            the same Storybook view for manual side-by-side review.
          </div>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(720px, 1fr))",
            gap: "16px",
            alignItems: "start",
            overflowX: "auto",
          }}
        >
          <ComparisonFrame
            title="Built"
            subtitle="`@drts/ui-web` parity target composed with the Wave 2 ops shell."
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
              <OpsDashboardBuiltView />
            </div>
          </ComparisonFrame>
          <ComparisonFrame
            title="Canvas"
            subtitle="`docs/05-ui/drts-design-canvas/Ops Console.html#dashboard`"
          >
            <iframe
              src={canvasDashboardSrc}
              title="OC_Dashboard canvas reference"
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
  ),
};
