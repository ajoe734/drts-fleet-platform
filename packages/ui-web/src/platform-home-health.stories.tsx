import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { ReactNode } from "react";
import { ManagementShell } from "./management-shell";
import type { ManagementSidebarSection } from "./management-sidebar";
import {
  CalloutBanner,
  DataCellStack,
  DataTable,
  DataViewCard,
  DetailMetadataGrid,
  KpiCard,
  KpiRow,
  PageHeader,
  StatusChip,
  Td,
  Tr,
  WorkflowPanel,
  WorkflowSplitLayout,
} from "./index";

const canvasHomeSrc = "/drts-design-canvas/Platform%20Admin.html#home";
const canvasHealthSrc = "/drts-design-canvas/Platform%20Admin.html#health";

const shellSections: ManagementSidebarSection[] = [
  {
    key: "workspace",
    title: "Workspace",
    items: [
      { href: "/", label: "Home" },
      {
        href: "/health",
        label: "Health & Alerts",
        badge: "2",
        badgeTone: "warning",
      },
    ],
  },
  {
    key: "tenant-governance",
    title: "Tenant Governance",
    items: [
      { href: "/tenants", label: "Tenants" },
      { href: "/partners", label: "Partners" },
      { href: "/users", label: "Users" },
    ],
  },
  {
    key: "fleet-compliance",
    title: "Fleet & Compliance",
    items: [
      { href: "/fleet", label: "Fleet & Devices" },
      { href: "/switchboard", label: "Switchboard" },
    ],
  },
  {
    key: "pricing-settlement",
    title: "Pricing & Settlement",
    items: [
      { href: "/pricing", label: "Pricing" },
      { href: "/payments", label: "Payments", badge: "3", badgeTone: "danger" },
    ],
  },
  {
    key: "platform-layer",
    title: "Platform Layer",
    items: [
      { href: "/notices", label: "Notices" },
      { href: "/audit", label: "Audit Trail" },
      { href: "/feature-flags", label: "Feature Flags" },
      { href: "/adapter-registry", label: "Adapter Registry" },
    ],
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

function StoryShell({
  currentPath,
  breadcrumb,
  children,
}: {
  currentPath: string;
  breadcrumb: { label: string }[];
  children: ReactNode;
}) {
  return (
    <ManagementShell
      sidebar={{
        brand: "DRTS Fleet",
        brandSub: "Platform Admin",
        brandIcon: (
          <span
            style={{
              fontSize: "11px",
              fontWeight: 700,
              letterSpacing: "0.08em",
            }}
          >
            PA
          </span>
        ),
        sections: shellSections,
        currentPath,
      }}
      topbar={{
        breadcrumb,
        envLabel: "production",
        envTone: "platform",
      }}
    >
      <div
        style={{
          maxWidth: "1160px",
          margin: "0 auto",
          display: "grid",
          gap: "20px",
        }}
      >
        {children}
      </div>
    </ManagementShell>
  );
}

function PlatformHomeBuiltView() {
  return (
    <StoryShell
      currentPath="/"
      breadcrumb={[{ label: "Platform Admin" }, { label: "Home" }]}
    >
      <PageHeader
        eyebrow="首頁姿態"
        title="平台治理工作首頁"
        subtitle="DRTS 平台控制平面，目前有 3 件治理事項需要處理。"
        meta={[
          { label: "活躍租戶", value: "142" },
          { label: "合作夥伴 entry", value: "38" },
          { label: "待處理對帳", value: "3" },
        ]}
      />
      <KpiRow>
        <KpiCard
          label="活躍租戶"
          value="142"
          detail="8 在 pilot · 12 在 sandbox"
          tone="info"
        />
        <KpiCard
          label="合作夥伴 entry"
          value="38"
          detail="2 待 readiness"
          tone="tenant"
        />
        <KpiCard
          label="可派司機"
          value="884"
          detail="42 license 30 天內到期"
          tone="warning"
        />
        <KpiCard
          label="待結算對帳"
          value="3"
          detail="2 partner · 1 forwarded"
          tone="danger"
        />
      </KpiRow>
      <CalloutBanner
        tone="warning"
        eyebrow="Home posture"
        title="本頁對齊 PA_Home：先看治理佇列，再做模組 drill-through。"
        description="平台路由告警、rollback hold、partner readiness 與結算例外，被壓進同一條 operator triage lane。"
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          <StatusChip tone="warning" label="Rollback hold · 1" />
          <StatusChip tone="warning" label="Partner 補件 · 2" />
          <StatusChip tone="danger" label="重大告警 · 1" />
        </div>
      </CalloutBanner>
      <WorkflowSplitLayout
        main={
          <>
            <WorkflowPanel
              eyebrow="Today"
              title="今日治理待辦"
              description="跨模組需要平台治理人介入的事項。"
            >
              <div style={{ display: "grid", gap: "10px" }}>
                <CalloutBanner
                  tone="danger"
                  title="BGMT 派遣回報 token 將於 6 天內到期"
                  description="需於 5/14 前提交新的 client credential，否則無法回報今日完成單。"
                />
                <CalloutBanner
                  tone="warning"
                  title="GoCab forwarded 介接 24h sync_failed 比率 4.2%"
                  description="超過 3% 警戒值。建議檢查 adapter 健康並啟動 manual fallback 觀察。"
                />
                <CalloutBanner
                  tone="info"
                  title="NTU_HOSP 處於 rollback_hold"
                  description="客訴升級後 rollout 已暫停，需平台與營運共識下一步。"
                />
              </div>
            </WorkflowPanel>

            <DataViewCard
              title="近期高敏感操作"
              subtitle="平台層審計足跡 · 最近 24h"
              tone="neutral"
            >
              <DataTable
                minWidth={760}
                columns={[
                  { label: "時間", width: "180px" },
                  { label: "模組", width: "140px" },
                  { label: "動作", width: "220px" },
                  { label: "操作者", width: "180px" },
                  { label: "request", width: "160px" },
                ]}
              >
                {[
                  {
                    id: "1",
                    at: "2026-05-10 18:05",
                    module: "pricing",
                    action: "publish_rule",
                    actor: "karen@drts.io",
                    request: "req_1032",
                  },
                  {
                    id: "2",
                    at: "2026-05-10 17:42",
                    module: "partners",
                    action: "rotate_credential",
                    actor: "linda@drts.io",
                    request: "req_1028",
                  },
                ].map((row) => (
                  <Tr key={row.id}>
                    <Td mono>{row.at}</Td>
                    <Td>{row.module}</Td>
                    <Td mono>{row.action}</Td>
                    <Td>{row.actor}</Td>
                    <Td mono>{row.request}</Td>
                  </Tr>
                ))}
              </DataTable>
            </DataViewCard>
          </>
        }
        side={
          <DataViewCard
            title="治理捷徑"
            subtitle="直接跳進各個治理工作面。"
            tone="neutral"
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "10px",
              }}
            >
              {[
                "租戶",
                "合作夥伴",
                "計價",
                "結算治理",
                "車隊與合規",
                "稽核",
              ].map((label) => (
                <div
                  key={label}
                  style={{
                    padding: "12px",
                    borderRadius: "14px",
                    border: "1px solid #dbeafe",
                    background: "#f8fafc",
                    display: "grid",
                    gap: "6px",
                  }}
                >
                  <strong style={{ fontSize: "13px", color: "#0f172a" }}>
                    {label}
                  </strong>
                  <span style={{ fontSize: "12px", color: "#64748b" }}>
                    Open module
                  </span>
                </div>
              ))}
            </div>
          </DataViewCard>
        }
      />
    </StoryShell>
  );
}

function PlatformHealthBuiltView() {
  return (
    <StoryShell
      currentPath="/health"
      breadcrumb={[{ label: "Platform Admin" }, { label: "Health" }]}
    >
      <PageHeader
        eyebrow="治理控制面"
        title="平台健康"
        subtitle="alert list · dispatch lag · webhook queue · eligibility queue · reporting · adapters"
        meta={[
          { label: "快照時間", value: "2026-05-10 19:10" },
          { label: "重點面向", value: "dispatch / adapters / webhook" },
          { label: "上次刷新", value: "19:10:14" },
        ]}
      />
      <CalloutBanner
        tone="warning"
        eyebrow="Control-plane governance"
        title="目前有 queue 或 adapter 需要平台介入。"
        description="先從 threshold breach 判斷告警，再用 adapter preview 區分這是暫時性的 live-health 問題，還是 registry 層級的 readiness 風險。"
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          <StatusChip tone="danger" label="Critical · 1" />
          <StatusChip tone="warning" label="Warning · 2" />
          <StatusChip tone="warning" label="Adapters · 2" />
        </div>
      </CalloutBanner>
      <KpiRow minWidth="180px">
        <KpiCard
          label="dispatch lag p95"
          value="2.4 min"
          detail="3 lagged orders"
          tone="warning"
        />
        <KpiCard
          label="webhook queue"
          value="118"
          detail="6 failed deliveries"
          tone="warning"
        />
        <KpiCard
          label="eligibility queue"
          value="4"
          detail="2 manual review"
          tone="warning"
        />
        <KpiCard
          label="reporting failures 24h"
          value="0"
          detail="12 jobs still queued"
          tone="success"
        />
      </KpiRow>
      <WorkflowSplitLayout
        main={
          <>
            <DataViewCard
              title="Active alerts"
              subtitle="Cross-module alert posture kept in a compact operator triage lane."
              tone="warning"
            >
              <div style={{ display: "grid", gap: "10px" }}>
                {[
                  {
                    id: "1",
                    route: "platform / ops",
                    title: "GoCab forwarded sync_failed ratio above threshold",
                    thresholds: "warn 3.0% · critical 4.0%",
                    measured: "4.2%",
                  },
                  {
                    id: "2",
                    route: "platform",
                    title:
                      "Webhook delivery backlog is above warning threshold",
                    thresholds: "warn 80 · critical 120",
                    measured: "118",
                  },
                ].map((alert, index) => (
                  <div
                    key={alert.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "auto minmax(0, 1fr) auto",
                      alignItems: "center",
                      gap: "12px",
                      padding: "12px 0",
                      borderBottom:
                        index === 1
                          ? "none"
                          : "1px solid rgba(148,163,184,0.18)",
                    }}
                  >
                    <StatusChip
                      tone={index === 0 ? "danger" : "warning"}
                      label={alert.route}
                    />
                    <DataCellStack
                      primary={<strong>{alert.title}</strong>}
                      secondary={alert.thresholds}
                    />
                    <span style={{ fontSize: "12.5px", fontWeight: 700 }}>
                      {alert.measured}
                    </span>
                  </div>
                ))}
              </div>
            </DataViewCard>

            <DataViewCard
              title="Adapter inventory"
              subtitle="Global adapter posture with live controls state and last-check context."
              tone="info"
            >
              <DataTable
                minWidth={920}
                columns={[
                  { label: "ADAPTER", width: "24%" },
                  { label: "STATUS", width: "18%" },
                  { label: "CONTROLS", width: "30%" },
                  { label: "LAST CHECK", width: "16%" },
                  { label: "DRILL-THROUGH", width: "12%" },
                ]}
              >
                {[
                  {
                    id: "BGMT",
                    status: "degraded",
                    tone: "warning" as const,
                    controls: [
                      "credential valid",
                      "auth reauth_required",
                      "webhook healthy",
                    ],
                    lastCheck: "2026-05-10 19:08",
                  },
                  {
                    id: "GoCab",
                    status: "down",
                    tone: "danger" as const,
                    controls: [
                      "credential expired",
                      "auth invalid",
                      "webhook failing",
                    ],
                    lastCheck: "2026-05-10 19:06",
                  },
                ].map((adapter) => (
                  <Tr key={adapter.id} highlighted>
                    <Td mono>
                      <DataCellStack
                        primary={<strong>{adapter.id}</strong>}
                        secondary="Registry remains the editable inventory surface."
                      />
                    </Td>
                    <Td>
                      <StatusChip tone={adapter.tone} label={adapter.status} />
                    </Td>
                    <Td>
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "6px",
                        }}
                      >
                        {adapter.controls.map((control) => (
                          <StatusChip
                            key={control}
                            tone="neutral"
                            label={control}
                          />
                        ))}
                      </div>
                    </Td>
                    <Td mono>{adapter.lastCheck}</Td>
                    <Td align="right">
                      <span style={{ fontSize: "12px", color: "#475569" }}>
                        Open
                      </span>
                    </Td>
                  </Tr>
                ))}
              </DataTable>
            </DataViewCard>
          </>
        }
        side={
          <>
            <DataViewCard
              title="Health posture"
              subtitle="Compact read of platform-scoped thresholds, queues, and focus areas."
              tone="info"
            >
              <DetailMetadataGrid
                columns={1}
                minColumnWidth="100%"
                items={[
                  {
                    id: "critical",
                    label: "Critical",
                    value: "1",
                    tone: "danger",
                  },
                  {
                    id: "warning",
                    label: "Warning",
                    value: "2",
                    tone: "warning",
                  },
                  {
                    id: "adapters",
                    label: "Unhealthy adapters",
                    value: "2",
                    tone: "warning",
                  },
                  {
                    id: "focus",
                    label: "Focus areas",
                    value: "dispatch / adapters / webhook",
                  },
                ]}
              />
            </DataViewCard>

            <WorkflowPanel
              eyebrow="Control-plane governance"
              title="Forwarder pressure"
              description="Live queue pressure stays separate from the adapter registry so operators can triage health without mutating rollout truth."
              tone="warning"
            >
              <DetailMetadataGrid
                columns={1}
                minColumnWidth="100%"
                items={[
                  { id: "forwarded", label: "Forwarded orders", value: "18" },
                  {
                    id: "failed",
                    label: "Sync failures",
                    value: "4",
                    tone: "danger",
                  },
                  {
                    id: "pending",
                    label: "Accept pending",
                    value: "3",
                    tone: "warning",
                  },
                  {
                    id: "recon",
                    label: "Reconciliation queue",
                    value: "2",
                    tone: "warning",
                  },
                ]}
              />
            </WorkflowPanel>
          </>
        }
      />
    </StoryShell>
  );
}

const meta = {
  title: "Platform Admin/Home + Health",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Platform Admin home and health parity targets for `ADM-UI-RD-003`. Each built view is rendered beside the corresponding `PA_Home` or `PA_Health` artboard from `docs/05-ui/drts-design-canvas/Platform Admin.html`.",
      },
    },
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

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
            Platform Admin Review
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
            {built}
          </ComparisonFrame>
          <ComparisonFrame
            title="Designed"
            subtitle={`docs/05-ui/drts-design-canvas/Platform Admin.html${canvasSrc.split("Platform%20Admin.html")[1]}`}
          >
            <iframe
              src={canvasSrc}
              title={canvasTitle}
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

export const PlatformHomeParity: Story = {
  name: "PA_Home parity",
  render: () => (
    <ParityLayout
      title="Built platform home with governance queue, quick links, and audit strip."
      description="The built page posture is rendered beside the Platform Admin home artboard for manual visual comparison."
      canvasSrc={canvasHomeSrc}
      canvasTitle="Platform Admin home artboard"
      built={<PlatformHomeBuiltView />}
    />
  ),
};

export const PlatformHealthParity: Story = {
  name: "PA_Health parity",
  render: () => (
    <ParityLayout
      title="Built platform health with alert triage and adapter inventory."
      description="The built page posture is rendered beside the Platform Admin health artboard for manual visual comparison."
      canvasSrc={canvasHealthSrc}
      canvasTitle="Platform Admin health artboard"
      built={<PlatformHealthBuiltView />}
    />
  ),
};
