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

const canvasDispatchSrc =
  "/drts-design-canvas/Ops%20Console.html#dispatch-ready";

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

const mainGridStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.45fr) minmax(300px, 0.85fr)",
  gap: "16px",
  alignItems: "start" as const,
};

const filterRowStyle = {
  display: "flex",
  flexWrap: "wrap" as const,
  gap: "8px",
};

type DispatchRow = {
  order: ReactNode;
  tenant: string;
  pickup: string;
  window: string;
  state: ReactNode;
  supply: string;
  eta: string;
  gate: ReactNode;
  _selected?: boolean;
};

const dispatchColumns: CanvasTableColumn<DispatchRow>[] = [
  { h: "Order", k: "order", w: 170 },
  { h: "Tenant", k: "tenant", w: 140 },
  { h: "Pickup", k: "pickup", w: 150 },
  { h: "Window", k: "window", w: 155 },
  { h: "State", k: "state", w: 120 },
  { h: "Supply", k: "supply", w: 160 },
  { h: "ETA", k: "eta", mono: true, w: 80 },
  { h: "Gate", k: "gate", w: 150 },
];

const dispatchRows: DispatchRow[] = [
  {
    order: (
      <div style={{ display: "grid", gap: "2px" }}>
        <strong>ord_8233</strong>
        <span style={{ color: theme.textDim, fontSize: "11px" }}>
          enterprise airport transfer
        </span>
      </div>
    ),
    tenant: "Acme Mobility",
    pickup: "南港展覽館",
    window: "13:20 → 13:35",
    state: <CanvasPill theme={theme} tone="warn">queued</CanvasPill>,
    supply: "6 candidate drivers",
    eta: "12m",
    gate: <CanvasPill theme={theme} tone="danger">SLA risk</CanvasPill>,
    _selected: true,
  },
  {
    order: (
      <div style={{ display: "grid", gap: "2px" }}>
        <strong>ord_8237</strong>
        <span style={{ color: theme.textDim, fontSize: "11px" }}>
          hotel concierge
        </span>
      </div>
    ),
    tenant: "Grand Prestige",
    pickup: "松山機場",
    window: "13:25 → 13:40",
    state: <CanvasPill theme={theme} tone="info">broadcasting</CanvasPill>,
    supply: "3 candidate drivers",
    eta: "9m",
    gate: <CanvasPill theme={theme} tone="info">healthy</CanvasPill>,
  },
  {
    order: (
      <div style={{ display: "grid", gap: "2px" }}>
        <strong>ord_8241</strong>
        <span style={{ color: theme.textDim, fontSize: "11px" }}>
          wheelchair accessible
        </span>
      </div>
    ),
    tenant: "City Hospital",
    pickup: "台大兒醫",
    window: "13:30 → 13:50",
    state: <CanvasPill theme={theme} tone="danger">no_supply</CanvasPill>,
    supply: "0 eligible vehicles",
    eta: "—",
    gate: <CanvasPill theme={theme} tone="danger">manual action</CanvasPill>,
  },
  {
    order: (
      <div style={{ display: "grid", gap: "2px" }}>
        <strong>ord_8248</strong>
        <span style={{ color: theme.textDim, fontSize: "11px" }}>
          forwarded mirror
        </span>
      </div>
    ),
    tenant: "Hotel Sandbox",
    pickup: "W Taipei",
    window: "13:18 → 13:28",
    state: <CanvasPill theme={theme} tone="accent">accept_pending</CanvasPill>,
    supply: "adapter mirror",
    eta: "5m",
    gate: <CanvasPill theme={theme} tone="accent">sync watch</CanvasPill>,
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

function DispatchBuiltView() {
  return (
    <CanvasShell
      theme={theme}
      nav={shellNav}
      currentPath="/dispatch"
      brandLabel="DRTS Fleet"
      brandSubLabel="Ops Console"
      brandMark="OC"
      env="production"
      versionLabel="storybook parity"
      avatarLabel="YS"
      breadcrumb={["Live Ops", "Dispatch"]}
      searchPlaceholder="搜尋派遣單、司機、鏡像訂單…"
    >
      <CanvasPageHeader
        theme={theme}
        title="Dispatch Workspace"
        subtitle="Ready queue board with owned + forwarded visibility, supply ranking, governance gates, and mirrored adapter signals."
        tabs={[
          "Ready queue",
          "Assigned",
          "Exception hold",
          "No supply",
          "Governance blocked",
          "Forwarded mirror",
        ]}
        activeTab="Ready queue"
        actions={
          <>
            <CanvasBtn theme={theme} variant="secondary">
              Refresh candidates
            </CanvasBtn>
            <CanvasBtn theme={theme} variant="primary">
              Open work item
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
            hint="view = owned"
          />
          <CanvasKPI
            theme={theme}
            label="Assigned"
            value="42"
            delta="+6"
            deltaTone="neutral"
            sub="11 delayed ETA refresh"
            hint="active trips"
          />
          <CanvasKPI
            theme={theme}
            label="No supply"
            value="4"
            delta="+1"
            deltaTone="down"
            sub="2 WAV constrained"
            hint="manual recovery"
          />
          <CanvasKPI
            theme={theme}
            label="Forwarded attention"
            value="3"
            delta="1 fail"
            deltaTone="down"
            sub="accept_pending or sync_failed"
            hint="adapter mirror"
          />
        </div>

        <CanvasBanner
          theme={theme}
          tone="warn"
          title="ord_8233 is the next SLA breach candidate"
          body="The selected order has six eligible drivers but two are proof_pending and one has an active delay signal. Dispatch should assign inside 90 seconds."
        />

        <div style={filterRowStyle}>
          <CanvasPill theme={theme} tone="warn" dot>
            state = queued
          </CanvasPill>
          <CanvasPill theme={theme} tone="neutral">
            tenant = all
          </CanvasPill>
          <CanvasPill theme={theme} tone="info">
            vehicle capability = any
          </CanvasPill>
          <CanvasPill theme={theme} tone="accent">
            mirrored adapters visible
          </CanvasPill>
        </div>

        <div style={mainGridStyle}>
          <CanvasCard
            theme={theme}
            title="Dispatch queue"
            subtitle="The queue remains a first-class board with selected-row emphasis and gate posture visible at scan speed."
          >
            <CanvasTable
              theme={theme}
              columns={dispatchColumns}
              rows={dispatchRows}
            />
          </CanvasCard>

          <div style={{ display: "grid", gap: "16px" }}>
            <CanvasCard
              theme={theme}
              title="Selected work item"
              subtitle="ord_8233 · owned dispatch lane"
            >
              <CanvasDL
                theme={theme}
                cols={1}
                items={[
                  { label: "Pickup", value: "南港展覽館 1 館" },
                  { label: "Dropoff", value: "桃園機場 T2" },
                  { label: "Service", value: "Enterprise airport transfer" },
                  { label: "Reason required", value: "No" },
                  { label: "Available actions", value: "assign_driver · open_detail" },
                ]}
              />
            </CanvasCard>

            <CanvasCard
              theme={theme}
              title="Candidate ranking"
              subtitle="Expose readiness, ETA, and reason posture together."
            >
              <div style={{ display: "grid", gap: "10px" }}>
                <div
                  style={{
                    border: `1px solid ${theme.accentBorder}`,
                    background: theme.accentBg,
                    borderRadius: "10px",
                    padding: "10px 12px",
                    display: "grid",
                    gap: "4px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <strong>drv_1023 · 陳怡廷</strong>
                    <CanvasPill theme={theme} tone="success">
                      best ETA 8m
                    </CanvasPill>
                  </div>
                  <span style={{ fontSize: "11px", color: theme.textMuted }}>
                    Tesla Model Y · battery 84% · docs current
                  </span>
                </div>
                <div
                  style={{
                    border: `1px solid ${theme.border}`,
                    background: theme.surfaceLo,
                    borderRadius: "10px",
                    padding: "10px 12px",
                    display: "grid",
                    gap: "4px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <strong>drv_1190 · 李承恩</strong>
                    <CanvasPill theme={theme} tone="warn">
                      proof pending
                    </CanvasPill>
                  </div>
                  <span style={{ fontSize: "11px", color: theme.textMuted }}>
                    ETA 9m · can assign only after proof receipt
                  </span>
                </div>
                <div
                  style={{
                    border: `1px solid ${theme.border}`,
                    background: theme.surfaceLo,
                    borderRadius: "10px",
                    padding: "10px 12px",
                    display: "grid",
                    gap: "4px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <strong>drv_1211 · 王語辰</strong>
                    <CanvasPill theme={theme} tone="danger">
                      incident hold
                    </CanvasPill>
                  </div>
                  <span style={{ fontSize: "11px", color: theme.textMuted }}>
                    hidden from normal assignment until supervisor releases hold
                  </span>
                </div>
              </div>
            </CanvasCard>

            <CanvasCard
              theme={theme}
              title="Manual lanes"
              subtitle="Governance and mirrored adapter notes stay adjacent to the queue."
            >
              <div style={{ display: "grid", gap: "8px" }}>
                <CanvasBanner
                  theme={theme}
                  tone="danger"
                  title="no_supply ord_8241"
                  body="WAV requirement remains unsatisfied. Manual fallback queue opened with reason code `vehicle_capability_gap`."
                />
                <CanvasBanner
                  theme={theme}
                  tone="accent"
                  title="forwarded mirror ord_8248"
                  body="Adapter is still waiting for external acceptance callback. Cross-app adapter inspection should open in a new tab."
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
  title: "Ops Console/Dispatch",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Ops Console dispatch parity target for `UI-FE-OPS-STORYBOOK-PARITY`. The built review surface sits beside the `#dispatch-ready` artboard in `docs/05-ui/drts-design-canvas/Ops Console.html`.",
      },
    },
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const OpsDispatchParity: Story = {
  name: "OC_Dispatch parity",
  render: () => (
    <ParityLayout
      title="Built dispatch board with queue scan, selected-row context, candidate ranking, and mirrored adapter attention."
      description="The built dispatch story preserves the dark Ops Console shell and the multi-lane dispatch posture expected by the ready-queue artboard."
      canvasSrc={canvasDispatchSrc}
      canvasTitle="Ops Console dispatch ready-queue artboard"
      built={<DispatchBuiltView />}
    />
  ),
};
