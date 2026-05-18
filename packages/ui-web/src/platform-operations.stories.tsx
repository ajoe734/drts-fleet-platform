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

const canvasUsersSrc = "/drts-design-canvas/Platform%20Admin.html#users";
const canvasFleetSrc = "/drts-design-canvas/Platform%20Admin.html#fleet";
const canvasSwitchboardSrc =
  "/drts-design-canvas/Platform%20Admin.html#switchboard";

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

const reviewCanvasStyle = {
  width: "100%",
  minWidth: "720px",
  height: "920px",
  border: "1px solid #cbd5e1",
  borderRadius: "22px",
  background: "#ffffff",
};

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
            title="Designed"
            subtitle={`docs/05-ui/drts-design-canvas/Platform Admin.html${canvasSrc.split("Platform%20Admin.html")[1]}`}
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

function PlatformUsersBuiltView() {
  const rows = [
    [
      "林宜君",
      "yc.lin@drts.io",
      "platform_super_admin",
      "active",
      "2026-05-08",
    ],
    ["王芳", "fang.wang@drts.io", "ops_lead", "active", "2026-05-08"],
    ["張薇", "wei.chang@drts.io", "finance_governance", "active", "2026-05-08"],
    ["李俊", "jun.li@drts.io", "tenant_onboarding", "active", "2026-05-07"],
    ["陳維", "wei.chen@drts.io", "sre", "active", "2026-05-04"],
    [
      "游雅琪",
      "yc.yu@drts.io",
      "compliance_governance",
      "active",
      "2026-05-02",
    ],
    [
      "Ken Liao",
      "ken.liao@drts.io",
      "partner_governance",
      "active",
      "2026-04-30",
    ],
    ["黃啟賢", "cs.huang@drts.io", "support_lead", "suspended", "2026-04-21"],
  ] as const;

  return (
    <StoryShell
      currentPath="/users"
      breadcrumb={[{ label: "Tenant Governance" }, { label: "Platform Users" }]}
    >
      <PageHeader
        eyebrow="Identity Governance"
        title="平台人員"
        subtitle="平台內部使用者與角色治理；RBAC 真值仍由後端 authority 決定。"
        actions={<StatusChip tone="platform" label="Invite-only" />}
      />
      <KpiRow minWidth="180px">
        <KpiCard
          label="Active staff"
          value="7"
          detail="1 suspended"
          tone="success"
        />
        <KpiCard
          label="Admin coverage"
          value="3"
          detail="superadmin + admin lane"
          tone="info"
        />
        <KpiCard
          label="Platform functions"
          value="6"
          detail="ops, finance, onboarding, SRE"
          tone="platform"
        />
      </KpiRow>
      <DataViewCard
        title="Platform staff roster"
        subtitle="保留 artboard 的純表格姿態，但補進目前真實治理所需的角色/狀態 framing。"
      >
        <DataTable
          minWidth={920}
          columns={[
            { label: "Name", width: "220px" },
            { label: "Email", width: "260px" },
            { label: "Role", width: "220px" },
            { label: "Status", width: "140px" },
            { label: "Updated", width: "140px" },
          ]}
        >
          {rows.map(([name, email, role, status, updated]) => (
            <Tr key={email}>
              <Td>
                <DataCellStack
                  primary={<strong>{name}</strong>}
                  secondary={email}
                  tertiary={name.slice(0, 2).toUpperCase()}
                />
              </Td>
              <Td mono>{email}</Td>
              <Td mono>{role}</Td>
              <Td>
                <StatusChip
                  tone={status === "active" ? "success" : "warning"}
                  label={status}
                />
              </Td>
              <Td mono>{updated}</Td>
            </Tr>
          ))}
        </DataTable>
      </DataViewCard>
    </StoryShell>
  );
}

function PlatformFleetBuiltView() {
  const driverRows = [
    [
      "林志偉",
      "drv_001",
      "ARJ-2891",
      "available",
      "day",
      "valid",
      "declared",
      "4.92",
    ],
    [
      "黃佩玲",
      "drv_002",
      "BTQ-1042",
      "on_trip",
      "swing",
      "valid",
      "pending",
      "4.86",
    ],
    [
      "陳柏翰",
      "drv_014",
      "CEU-8840",
      "break",
      "day",
      "expiring_soon",
      "declared",
      "4.78",
    ],
    [
      "周品妤",
      "drv_118",
      "DGD-2201",
      "offline",
      "night",
      "valid",
      "declared",
      "4.81",
    ],
  ] as const;

  return (
    <StoryShell
      currentPath="/fleet"
      breadcrumb={[
        { label: "Fleet & Compliance" },
        { label: "Fleet & Devices" },
      ]}
    >
      <PageHeader
        eyebrow="Fleet Governance"
        title="車隊與合規"
        subtitle="vehicles · drivers · contracts · device binding · exclusivity · offboarding"
        actions={
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <StatusChip tone="warning" label="Drivers tab" />
            <StatusChip tone="info" label="Governed exports" />
          </div>
        }
      />
      <CalloutBanner
        tone="warning"
        title="42 位司機 license 將於 30 天內到期"
        description="dispatch.compliance.license_warn_30d 已啟用；ops 端會擋下不合規派遣。"
      />
      <KpiRow minWidth="180px">
        <KpiCard
          label="Blocked vehicles"
          value="12"
          detail="dispatch hold or compliance block"
          tone="warning"
        />
        <KpiCard
          label="Blocked drivers"
          value="9"
          detail="eligibility review required"
          tone="warning"
        />
        <KpiCard
          label="Pending exclusivity"
          value="5"
          detail="review queue"
          tone="info"
        />
        <KpiCard
          label="Pending offboarding"
          value="3"
          detail="debranding or effectiveAt outstanding"
          tone="danger"
        />
      </KpiRow>
      <WorkflowSplitLayout
        main={
          <DataViewCard
            title="Driver posture"
            subtitle="對齊 artboard 的 driver-first 入口，但保留實際治理上需要的 dispatch/compliance 欄位。"
          >
            <DataTable
              minWidth={1120}
              columns={[
                { label: "Driver", width: "200px" },
                { label: "Vehicle", width: "120px" },
                { label: "Status", width: "120px" },
                { label: "Shift", width: "120px" },
                { label: "License", width: "140px" },
                { label: "Exclusivity", width: "140px" },
                { label: "Rating", width: "110px", align: "right" },
              ]}
            >
              {driverRows.map(
                ([
                  name,
                  driverId,
                  vehicle,
                  status,
                  shift,
                  license,
                  exclusivity,
                  rating,
                ]) => (
                  <Tr key={driverId}>
                    <Td>
                      <DataCellStack
                        primary={<strong>{name}</strong>}
                        secondary={driverId}
                        tertiary="platform-admin-web"
                      />
                    </Td>
                    <Td mono>{vehicle}</Td>
                    <Td>
                      <StatusChip
                        tone={
                          status === "available"
                            ? "success"
                            : status === "on_trip"
                              ? "info"
                              : status === "break"
                                ? "warning"
                                : "neutral"
                        }
                        label={status}
                      />
                    </Td>
                    <Td mono>{shift}</Td>
                    <Td>
                      <StatusChip
                        tone={license === "valid" ? "success" : "warning"}
                        label={license}
                      />
                    </Td>
                    <Td>
                      <StatusChip
                        tone={
                          exclusivity === "declared" ? "success" : "warning"
                        }
                        label={exclusivity}
                      />
                    </Td>
                    <Td align="right" mono>
                      {rating}
                    </Td>
                  </Tr>
                ),
              )}
            </DataTable>
          </DataViewCard>
        }
        side={
          <>
            <WorkflowPanel
              title="Export posture"
              description="受治理的匯出工作保留在 fleet lane 內，不直接暴露 unmanaged download。"
              tone="info"
            >
              <DetailMetadataGrid
                columns={1}
                items={[
                  {
                    id: "vehicles",
                    label: "Vehicle roster",
                    value: "artifact ready",
                    hint: "expires 2026-05-11 09:15",
                  },
                  {
                    id: "drivers",
                    label: "Driver roster",
                    value: "artifact ready",
                    hint: "expires 2026-05-11 09:18",
                  },
                  {
                    id: "contracts",
                    label: "Contract roster",
                    value: "pending",
                    hint: "governed report job in progress",
                  },
                ]}
              />
            </WorkflowPanel>
            <WorkflowPanel
              title="Immediate warnings"
              description="把真正會擋 dispatch 的異常列在同一個視窗。"
              tone="warning"
            >
              <div style={{ display: "grid", gap: "10px" }}>
                <CalloutBanner
                  tone="warning"
                  title="CEU-8840 license 30 天內到期"
                  description="續審完成前應維持人工監看。"
                />
                <CalloutBanner
                  tone="danger"
                  title="veh_034 offboarding requires debranding ticket"
                  description="effectiveAt 已到，但 debranding 尚未完成。"
                />
              </div>
            </WorkflowPanel>
          </>
        }
      />
    </StoryShell>
  );
}

function PlatformSwitchboardBuiltView() {
  return (
    <StoryShell
      currentPath="/switchboard"
      breadcrumb={[{ label: "Fleet & Compliance" }, { label: "Switchboard" }]}
    >
      <PageHeader
        eyebrow="Disclosure Governance"
        title="法定資訊與牌貼"
        subtitle="public info versioning · placard generation · publish"
        actions={
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <StatusChip tone="warning" label="Public info tab" />
            <StatusChip tone="success" label="placard v9 live" />
          </div>
        }
      />
      <CalloutBanner
        tone="info"
        title="公開揭露版本與牌貼沿革一起維護"
        description="草稿、發布與牌貼生成都在同一頁被檢查，避免 rider disclosure 與實體貼紙脫鉤。"
      />
      <KpiRow minWidth="180px">
        <KpiCard
          label="Published versions"
          value="3"
          detail="1 live"
          tone="success"
        />
        <KpiCard
          label="Draft versions"
          value="1"
          detail="awaiting publish"
          tone="warning"
        />
        <KpiCard
          label="Placard versions"
          value="9"
          detail="seatback-default lineage"
          tone="info"
        />
        <KpiCard
          label="Tied to live"
          value="8"
          detail="source status = published"
          tone="platform"
        />
      </KpiRow>
      <WorkflowSplitLayout
        main={
          <DataViewCard
            title="Public info versions"
            subtitle="版本、effective 區間、公開聯絡與狀態維持表格化，對齊 PA_Switchboard 的主畫面節奏。"
          >
            <DataTable
              minWidth={980}
              columns={[
                { label: "Version", width: "120px" },
                { label: "Effective from", width: "140px" },
                { label: "Effective to", width: "140px" },
                { label: "Call", width: "140px" },
                { label: "Complaint", width: "140px" },
                { label: "Status", width: "120px" },
                { label: "Updated", width: "140px" },
              ]}
            >
              {[
                [
                  "pi_v18",
                  "2026-04-01",
                  "2026-09-30",
                  "02-2543-9988",
                  "0800-088-122",
                  "published",
                  "2026-05-09",
                ],
                [
                  "pi_v17",
                  "2026-01-01",
                  "2026-03-31",
                  "02-2543-9988",
                  "0800-088-122",
                  "retired",
                  "2026-04-01",
                ],
                [
                  "pi_v19",
                  "2026-10-01",
                  "open ended",
                  "02-2543-9988",
                  "0800-088-122",
                  "draft",
                  "2026-05-10",
                ],
              ].map(([version, from, to, call, complaint, status, updated]) => (
                <Tr key={version}>
                  <Td mono>{version}</Td>
                  <Td mono>{from}</Td>
                  <Td mono>{to}</Td>
                  <Td mono>{call}</Td>
                  <Td mono>{complaint}</Td>
                  <Td>
                    <StatusChip
                      tone={
                        status === "published"
                          ? "success"
                          : status === "draft"
                            ? "warning"
                            : "neutral"
                      }
                      label={status}
                    />
                  </Td>
                  <Td mono>{updated}</Td>
                </Tr>
              ))}
            </DataTable>
          </DataViewCard>
        }
        side={
          <>
            <WorkflowPanel
              title="目前發行牌貼"
              description="依 pi_v18 生成的現行 placard，保留 artboard 的 card posture。"
              tone="info"
            >
              <div
                style={{
                  background: "#fcfaf2",
                  border: "1px solid #d7d0bd",
                  borderRadius: "12px",
                  padding: "14px",
                  display: "grid",
                  gap: "8px",
                  color: "#1a1a1a",
                  fontSize: "11.5px",
                  lineHeight: 1.55,
                }}
              >
                <strong style={{ textAlign: "center", fontSize: "13px" }}>
                  大威多元計程車
                </strong>
                <div
                  style={{
                    borderTop: "1px solid #1a1a1a",
                    borderBottom: "1px solid #1a1a1a",
                    padding: "6px 0",
                    textAlign: "center",
                    fontWeight: 600,
                  }}
                >
                  叫車：02-2543-9988 客訴：0800-088-122
                </div>
                <div>車輛編號 ARJ-2891 / 駕駛 林志偉</div>
                <div>計費方式：起跳 NT$85，續跳 NT$5/250m</div>
                <div>支付：現金、台灣 Pay、街口、信用卡</div>
                <div style={{ color: "#666" }}>
                  本牌貼依 pi_v18 (2026-04-01 ~ 2026-09-30) 生成
                </div>
              </div>
            </WorkflowPanel>
            <WorkflowPanel
              title="History framing"
              description="草稿可刪除；published 版本維持 immutable lineage。"
              tone="neutral"
            >
              <DetailMetadataGrid
                columns={1}
                items={[
                  {
                    id: "live-version",
                    label: "Live disclosure",
                    value: "pi_v18",
                    hint: "published 2026-04-01 00:00",
                  },
                  {
                    id: "live-placard",
                    label: "Current placard",
                    value: "placard v9",
                    hint: "seatback-default",
                  },
                  {
                    id: "draft-posture",
                    label: "Draft posture",
                    value: "pi_v19",
                    hint: "editable until publish",
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

const meta: Meta = {
  title: "Platform Admin/Users + Fleet + Switchboard",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Platform Admin parity targets for `ADM-UI-RD-006`. Each built view is rendered beside the corresponding `PA_Users`, `PA_Fleet`, or `PA_Switchboard` artboard from `docs/05-ui/drts-design-canvas/Platform Admin.html`.",
      },
    },
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const PlatformUsersParity: Story = {
  name: "PA_Users parity",
  render: () => (
    <ParityLayout
      title="Built platform users roster with governance framing and role/status posture."
      description="The built platform users view is rendered beside the `PA_Users` artboard for manual visual comparison."
      canvasSrc={canvasUsersSrc}
      canvasTitle="Platform Admin users artboard"
      built={<PlatformUsersBuiltView />}
    />
  ),
};

export const PlatformFleetParity: Story = {
  name: "PA_Fleet parity",
  render: () => (
    <ParityLayout
      title="Built fleet governance view with driver-first roster, compliance warnings, and governed exports."
      description="The built fleet view is rendered beside the `PA_Fleet` artboard for manual visual comparison."
      canvasSrc={canvasFleetSrc}
      canvasTitle="Platform Admin fleet artboard"
      built={<PlatformFleetBuiltView />}
    />
  ),
};

export const PlatformSwitchboardParity: Story = {
  name: "PA_Switchboard parity",
  render: () => (
    <ParityLayout
      title="Built disclosure and placard governance view with live posture, version table, and current placard card."
      description="The built switchboard view is rendered beside the `PA_Switchboard` artboard for manual visual comparison."
      canvasSrc={canvasSwitchboardSrc}
      canvasTitle="Platform Admin switchboard artboard"
      built={<PlatformSwitchboardBuiltView />}
    />
  ),
};
