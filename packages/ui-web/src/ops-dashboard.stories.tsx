import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { ReactNode } from "react";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  CanvasShell,
  CanvasTable,
  buildCanvasTheme,
  type CanvasShellNavItem,
  type CanvasTableColumn,
} from "./index";

const canvasDashboardSrc = "/drts-design-canvas/Ops%20Console.html#dashboard";

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const shellNav: CanvasShellNavItem[] = [
  { key: "dashboard", label: "Dashboard", href: "/dashboard", icon: "dashboard" },
  {
    key: "dispatch",
    label: "Dispatch",
    href: "/dispatch",
    icon: "car",
    badge: "12",
    badgeTone: "danger",
  },
  { key: "callcenter", label: "Callcenter", href: "/callcenter", icon: "phone" },
  {
    key: "complaints",
    label: "Complaints",
    href: "/complaints",
    icon: "warn",
    badge: "4",
    badgeTone: "warn",
  },
  { key: "incidents", label: "Incidents", href: "/incidents", icon: "bolt" },
  { key: "drivers", label: "Drivers", href: "/drivers", icon: "user" },
  { key: "vehicles", label: "Vehicles", href: "/vehicles", icon: "truck" },
  { key: "revenue", label: "Revenue", href: "/revenue", icon: "coins" },
];

const reviewCanvasStyle = {
  width: "100%",
  minWidth: "720px",
  height: "920px",
  border: "1px solid #cbd5e1",
  borderRadius: "22px",
  background: "#ffffff",
};

const kpiGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: "10px",
};

const splitGridStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.5fr) minmax(280px, 1fr)",
  gap: "16px",
  alignItems: "start" as const,
};

const metricStackStyle = {
  display: "grid",
  gap: "10px",
};

type QueueRow = {
  board: string;
  count: string;
  commitment: string;
  owner: string;
  risk: ReactNode;
};

const queueColumns: CanvasTableColumn<QueueRow>[] = [
  { h: "Board", k: "board", w: 160 },
  { h: "Volume", k: "count", mono: true, w: 90 },
  { h: "Commitment", k: "commitment", w: 180 },
  { h: "Current owner", k: "owner", w: 160 },
  { h: "Risk lane", k: "risk", w: 160 },
];

const queueRows: QueueRow[] = [
  {
    board: "Ready queue",
    count: "18",
    commitment: "< 3 min assign",
    owner: "北區 dispatcher",
    risk: <CanvasPill theme={theme} tone="danger">3 breaching</CanvasPill>,
  },
  {
    board: "Assigned",
    count: "42",
    commitment: "ETA tracking",
    owner: "Shift watch",
    risk: <CanvasPill theme={theme} tone="info">11 delayed</CanvasPill>,
  },
  {
    board: "Exception hold",
    count: "5",
    commitment: "approval needed",
    owner: "Ops supervisor",
    risk: <CanvasPill theme={theme} tone="warn">2 waiting reason</CanvasPill>,
  },
  {
    board: "Forwarded mirror",
    count: "7",
    commitment: "adapter sync",
    owner: "Adapter watch",
    risk: <CanvasPill theme={theme} tone="accent">1 sync failed</CanvasPill>,
  },
];

function ComparisonFrame({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
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

function ParityLayout({
  title,
  description,
  canvasSrc,
  canvasTitle,
  built,
}: {
  title: string;
  description: string;
  canvasSrc: string;
  canvasTitle: string;
  built: ReactNode;
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
            Ops Console Review
          </div>
          <div style={{ fontSize: "13px", color: "#475569", lineHeight: 1.5 }}>
            {description}
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
          <ComparisonFrame title="Built" subtitle={title}>
            <div
              style={{
                minWidth: "720px",
                borderRadius: "22px",
                overflow: "hidden",
                border: "1px solid #cbd5e1",
                background: "#0a0e16",
              }}
            >
              {built}
            </div>
          </ComparisonFrame>
          <ComparisonFrame
            title="Designed"
            subtitle={`docs/05-ui/drts-design-canvas/Ops Console.html${canvasSrc.split("Ops%20Console.html")[1]}`}
          >
            <iframe
              src={canvasSrc}
              title={canvasTitle}
              style={reviewCanvasStyle}
            />
          </ComparisonFrame>
        </div>
      </div>
    </div>
  );
}

function DashboardBuiltView() {
  return (
    <CanvasShell
      theme={theme}
      nav={shellNav}
      currentPath="/dashboard"
      brandLabel="DRTS Fleet"
      brandSubLabel="Ops Console"
      brandMark="OC"
      env="production"
      versionLabel="storybook parity"
      avatarLabel="YS"
      breadcrumb={["Workspace", "Dashboard"]}
      searchPlaceholder="搜尋訂單、司機、車輛、事件…"
    >
      <CanvasPageHeader
        theme={theme}
        title="Operations Dashboard"
        subtitle="T3 refresh cadence · dispatch watch · incident escalation · adapter readiness"
        actions={
          <>
            <CanvasBtn theme={theme} variant="secondary">
              Export shift brief
            </CanvasBtn>
            <CanvasBtn theme={theme} variant="primary">
              Open dispatch queue
            </CanvasBtn>
          </>
        }
      />

      <div style={{ padding: "18px 24px 24px", display: "grid", gap: "16px" }}>
        <div style={kpiGridStyle}>
          <CanvasKPI
            theme={theme}
            label="Ready queue"
            value="18"
            delta="+3"
            deltaTone="down"
            sub="3 breaching assignment SLA"
            hint="target < 20"
          />
          <CanvasKPI
            theme={theme}
            label="Assigned trips"
            value="42"
            delta="+6"
            deltaTone="neutral"
            sub="11 delayed ETA refresh"
            hint="2 with rider callback"
          />
          <CanvasKPI
            theme={theme}
            label="Exception hold"
            value="5"
            delta="+2"
            deltaTone="down"
            sub="governance or fare approval"
            hint="2 > 10 min"
          />
          <CanvasKPI
            theme={theme}
            label="Forwarded sync"
            value="7"
            delta="1 fail"
            deltaTone="down"
            sub="adapter reconciliation"
            hint="mirror latency 38s"
          />
        </div>

        <CanvasBanner
          theme={theme}
          tone="danger"
          title="北區 dispatch queue 正在累積 breach risk"
          body="三筆企業接送單已接近 3 分鐘派車承諾。先處理 ready queue，再回到 governance blocked lane。"
          actions={
            <div style={{ display: "flex", gap: "8px" }}>
              <CanvasBtn theme={theme} size="xs" variant="primary">
                Review ready queue
              </CanvasBtn>
              <CanvasBtn theme={theme} size="xs" variant="secondary">
                Notify supervisor
              </CanvasBtn>
            </div>
          }
        />

        <div style={splitGridStyle}>
          <div style={metricStackStyle}>
            <CanvasCard
              theme={theme}
              title="Board health"
              subtitle="Keep the six dispatch boards visible from the dashboard rather than burying them behind a single aggregate number."
            >
              <CanvasTable theme={theme} columns={queueColumns} rows={queueRows} />
            </CanvasCard>

            <CanvasCard
              theme={theme}
              title="Shift watch"
              subtitle="Dispatcher-facing operational signals pulled into one lane."
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                  gap: "10px",
                }}
              >
                <CanvasCard
                  theme={theme}
                  padding={12}
                  style={{ background: theme.surfaceLo }}
                >
                  <CanvasDL
                    theme={theme}
                    cols={1}
                    items={[
                      { label: "Drivers online", value: "63", mono: true },
                      { label: "Proof pending", value: "4", mono: true },
                      { label: "Offline by incident", value: "2", mono: true },
                    ]}
                  />
                </CanvasCard>
                <CanvasCard
                  theme={theme}
                  padding={12}
                  style={{ background: theme.surfaceLo }}
                >
                  <CanvasDL
                    theme={theme}
                    cols={1}
                    items={[
                      { label: "Vehicles maintenance", value: "3", mono: true },
                      { label: "Battery alerts", value: "6", mono: true },
                      { label: "ADAS upload lag", value: "1", mono: true },
                    ]}
                  />
                </CanvasCard>
                <CanvasCard
                  theme={theme}
                  padding={12}
                  style={{ background: theme.surfaceLo }}
                >
                  <CanvasDL
                    theme={theme}
                    cols={1}
                    items={[
                      { label: "Complaints today", value: "9", mono: true },
                      { label: "SLA warning", value: "2", mono: true },
                      { label: "Critical incidents", value: "1", mono: true },
                    ]}
                  />
                </CanvasCard>
              </div>
            </CanvasCard>
          </div>

          <div style={metricStackStyle}>
            <CanvasCard
              theme={theme}
              title="Priority receipts"
              subtitle="Actionable queues with risk-coded posture."
            >
              <div style={{ display: "grid", gap: "10px" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Approval requests</span>
                  <CanvasPill theme={theme} tone="warn">
                    2 pending
                  </CanvasPill>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Callback tasks</span>
                  <CanvasPill theme={theme} tone="info">
                    3 due in 15m
                  </CanvasPill>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Adapter degraded</span>
                  <CanvasPill theme={theme} tone="accent">
                    1 mirrored tenant
                  </CanvasPill>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Audit deep links</span>
                  <CanvasPill theme={theme} tone="success">
                    enabled
                  </CanvasPill>
                </div>
              </div>
            </CanvasCard>

            <CanvasCard
              theme={theme}
              title="Escalation notes"
              subtitle="The dashboard still needs a dense operator note lane."
            >
              <div style={{ display: "grid", gap: "8px" }}>
                <CanvasBanner
                  theme={theme}
                  tone="warn"
                  title="governance_blocked order ord_8294"
                  body="Fare override above tenant threshold. Awaiting reasoned approval from ops supervisor."
                />
                <CanvasBanner
                  theme={theme}
                  tone="info"
                  title="forwarded mirror sync delayed"
                  body="Adapter `fwd-hotel-sandbox` has one order stuck at accept_pending for 38 seconds."
                />
              </div>
            </CanvasCard>
          </div>
        </div>
      </div>
    </CanvasShell>
  );
}

const meta: Meta = {
  title: "Ops Console/Dashboard",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Ops Console dashboard parity target for `UI-FE-OPS-STORYBOOK-PARITY`. The built review surface sits beside the `#dashboard` artboard in `docs/05-ui/drts-design-canvas/Ops Console.html`.",
      },
    },
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const OpsDashboardParity: Story = {
  name: "OC_Dashboard parity",
  render: () => (
    <ParityLayout
      title="Built dashboard with dispatch board health, shift watch, escalations, and receipt queues."
      description="The built dashboard keeps the operations-first dark shell and exposes the same high-signal lanes used by the Ops Console dashboard artboard."
      canvasSrc={canvasDashboardSrc}
      canvasTitle="Ops Console dashboard artboard"
      built={<DashboardBuiltView />}
    />
  ),
};
