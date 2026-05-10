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
  FilterPill,
  FilterPillRow,
  KpiCard,
  KpiRow,
  PageHeader,
  StatusChip,
  Stepper,
  Td,
  Tr,
  WorkflowPanel,
  WorkflowSplitLayout,
} from "./index";

const canvasTenantsSrc = "/drts-design-canvas/Platform%20Admin.html#tenants";
const canvasTenantDetailSrc =
  "/drts-design-canvas/Platform%20Admin.html#tenant-detail";

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
      { href: "/tenants", label: "Tenants", badge: "3", badgeTone: "warning" },
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

const pageStackStyle = {
  maxWidth: "1160px",
  margin: "0 auto",
  display: "grid",
  gap: "20px",
};

const comparisonGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(720px, 1fr))",
  gap: "16px",
  alignItems: "start" as const,
  overflowX: "auto" as const,
};

const watchlistGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "12px",
};

const watchlistCardStyle = {
  display: "grid",
  gap: "8px",
  padding: "14px 16px",
  borderRadius: "16px",
  border: "1px solid #dbe4ee",
  background: "#f8fafc",
};

const heroGridStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.35fr) minmax(320px, 1fr)",
  gap: "16px",
  alignItems: "start" as const,
};

const anchorSectionStyle = {
  display: "grid",
  gap: "12px",
};

const statusSummaryGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "12px",
};

const tenants = [
  {
    id: "tenant_ntu_hosp",
    code: "NTU_HOSP",
    name: "台大醫院 病患接送",
    stage: "rollback_hold",
    stageTone: "danger" as const,
    modules: "11/13",
    quota: "18,000 bookings",
    drivers: "420 drivers",
    apiCalls: "180,000 API calls",
    integration: "api_key_and_webhook",
    sandboxBaseUrl: "https://sbx.drts.io/t/ntu_hosp",
    productionBaseUrl: "https://api.drts.io/t/ntu_hosp",
    updatedAt: "2026-05-10 19:42",
    status: "rollback hold",
    statusTone: "danger" as const,
    tertiary: "rollout 已停在治理審視中",
  },
  {
    id: "tenant_yamato",
    code: "YAMATO",
    name: "Yamato Hospital Shuttle",
    stage: "pilot",
    stageTone: "info" as const,
    modules: "9/13",
    quota: "12,000 bookings",
    drivers: "210 drivers",
    apiCalls: "90,000 API calls",
    integration: "api_key_and_webhook",
    sandboxBaseUrl: "https://sbx.drts.io/t/yamato",
    productionBaseUrl: "https://api.drts.io/t/yamato",
    updatedAt: "2026-05-10 18:30",
    status: "active",
    statusTone: "success" as const,
  },
  {
    id: "tenant_tsmc_fab18",
    code: "TSMC_FAB18",
    name: "TSMC Fab 18 Shuttle",
    stage: "production",
    stageTone: "success" as const,
    modules: "13/13",
    quota: "26,000 bookings",
    drivers: "560 drivers",
    apiCalls: "260,000 API calls",
    integration: "partner_managed",
    sandboxBaseUrl: "https://sbx.drts.io/t/tsmc_fab18",
    productionBaseUrl: "https://api.drts.io/t/tsmc_fab18",
    updatedAt: "2026-05-10 16:12",
    status: "active",
    statusTone: "success" as const,
  },
];

const roleRows = [
  {
    role: "Tenant Admin",
    roleCode: "tenant_admin",
    required: "Required",
    requiredTone: "warning" as const,
    state: "Acknowledged",
    stateTone: "success" as const,
    timestamp: "2026-05-08 09:14",
    action: "Complete",
    actionTone: "success" as const,
  },
  {
    role: "Tenant Operations",
    roleCode: "tenant_operator",
    required: "Required",
    requiredTone: "warning" as const,
    state: "Acknowledged",
    stateTone: "success" as const,
    timestamp: "2026-05-08 11:06",
    action: "Complete",
    actionTone: "success" as const,
  },
  {
    role: "Tenant Finance",
    roleCode: "tenant_finance",
    required: "Required",
    requiredTone: "warning" as const,
    state: "Invited",
    stateTone: "info" as const,
    timestamp: "2026-05-09 14:20",
    action: "Acknowledge",
  },
  {
    role: "Integration Manager",
    roleCode: "integration_manager",
    required: "Optional",
    requiredTone: "neutral" as const,
    state: "Pending",
    stateTone: "warning" as const,
    timestamp: "—",
    action: "Invite",
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
      <div style={pageStackStyle}>{children}</div>
    </ManagementShell>
  );
}

function PlatformTenantsBuiltView() {
  return (
    <StoryShell
      currentPath="/tenants"
      breadcrumb={[{ label: "Platform Admin" }, { label: "Tenants" }]}
    >
      <PageHeader
        eyebrow="租戶治理"
        title="租戶"
        subtitle="管理 tenant 從建立到 sandbox、pilot、production rollout 的完整生命週期。"
      />

      <KpiRow>
        <KpiCard
          label="活躍租戶"
          value="142"
          detail="136 啟用 · 6 暫停"
          tone="platform"
        />
        <KpiCard
          label="Production lane"
          value="119"
          detail="8 pilot · 12 sandbox"
          tone="success"
        />
        <KpiCard
          label="Pilot 與 sandbox"
          value="20"
          detail="仍在 rollout gate 中前進的租戶"
          tone="info"
        />
        <KpiCard
          label="Rollback hold"
          value="3"
          detail="需要平台治理判讀的租戶"
          tone="danger"
        />
      </KpiRow>

      <WorkflowPanel
        title="Rollout watchlist"
        description="在進入 tenant detail 前，先把 sandbox、pilot 與 rollback hold 租戶集中在同一條治理 watchlist。"
        tone="platform"
        meta={
          <FilterPillRow>
            <FilterPill label="All tenants" count={142} tone="neutral" active />
            <FilterPill label="sandbox" count={12} tone="warning" />
            <FilterPill label="pilot" count={8} tone="info" />
            <FilterPill label="production" count={119} tone="success" />
            <FilterPill label="rollback hold" count={3} tone="danger" />
          </FilterPillRow>
        }
      >
        <div style={watchlistGridStyle}>
          {tenants.slice(0, 2).map((tenant) => (
            <div key={tenant.id} style={watchlistCardStyle}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "8px",
                  alignItems: "flex-start",
                }}
              >
                <DataCellStack
                  primary={<strong>{tenant.name}</strong>}
                  secondary={`${tenant.code} · ${tenant.id}`}
                />
                <StatusChip label={tenant.stage} tone={tenant.stageTone} />
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <StatusChip label={tenant.status} tone={tenant.statusTone} />
                <StatusChip label={tenant.integration} tone="neutral" />
              </div>
              <div style={{ color: "#64748b", fontSize: "12.5px" }}>
                最近更新: {tenant.updatedAt}
              </div>
            </div>
          ))}
        </div>
      </WorkflowPanel>

      <CalloutBanner
        tone="warning"
        title="Rollback hold 需優先審視"
        description="3 個租戶目前處於 rollback hold，推進新 rollout 前應先完成治理判讀。"
      />

      <DataViewCard
        title="治理清單"
        subtitle="平台治理名單，集中呈現 rollout posture、模組覆蓋、配額基線與介接模式。"
        tone="platform"
        summary="目前顯示 3 筆租戶；進入 detail 後可治理 rollout、onboarding defaults 與角色確認。"
      >
        <DataTable
          columns={[
            { label: "租戶", width: "260px" },
            { label: "階段", width: "160px" },
            { label: "模組", width: "150px" },
            { label: "配額 / 月", width: "180px" },
            { label: "介接", width: "220px" },
            { label: "更新", width: "160px" },
            { label: "操作", width: "200px" },
          ]}
        >
          {tenants.map((tenant) => (
            <Tr key={tenant.id} highlighted={tenant.statusTone === "danger"}>
              <Td>
                <DataCellStack
                  primary={<strong>{tenant.name}</strong>}
                  secondary={`${tenant.code} · ${tenant.id}`}
                  tertiary={tenant.tertiary}
                />
              </Td>
              <Td>
                <div style={{ display: "grid", gap: "8px" }}>
                  <StatusChip label={tenant.stage} tone={tenant.stageTone} />
                  <StatusChip label={tenant.status} tone={tenant.statusTone} />
                </div>
              </Td>
              <Td>
                <DataCellStack
                  primary={tenant.modules}
                  secondary="enterprise dispatch · billing · reporting"
                />
              </Td>
              <Td>
                <DataCellStack
                  primary={tenant.quota}
                  secondary={tenant.drivers}
                  tertiary={tenant.apiCalls}
                />
              </Td>
              <Td>
                <DataCellStack
                  primary={tenant.integration}
                  secondary={tenant.sandboxBaseUrl}
                  tertiary={tenant.productionBaseUrl}
                />
              </Td>
              <Td>{tenant.updatedAt}</Td>
              <Td>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  <StatusChip label="Open detail" tone="neutral" />
                  <StatusChip label="Rollback hold" tone="warning" />
                </div>
              </Td>
            </Tr>
          ))}
        </DataTable>
      </DataViewCard>
    </StoryShell>
  );
}

function PlatformTenantDetailBuiltView() {
  return (
    <StoryShell
      currentPath="/tenants"
      breadcrumb={[
        { label: "Platform Admin" },
        { label: "Tenants" },
        { label: "TSMC Fab 18 Shuttle" },
      ]}
    >
      <PageHeader
        eyebrow="租戶詳情"
        title="TSMC Fab 18 Shuttle"
        subtitle="TSMC_FAB18 · tenant_tsmc_fab18"
        meta={[
          { label: "狀態", value: "active", tone: "success" },
          { label: "Rollout", value: "production", tone: "success" },
          { label: "更新", value: "2026-05-10 16:12", tone: "neutral" },
        ]}
      />

      <KpiRow>
        <KpiCard
          label="啟用模組"
          value="13"
          detail="dispatch · billing · reporting · webhooks"
          tone="info"
        />
        <KpiCard
          label="每月配額"
          value="26,000"
          detail="560 drivers · 260,000 API"
          tone="neutral"
        />
        <KpiCard
          label="角色確認"
          value="3/4"
          detail="3 個必要角色 · 3 個已邀請"
          tone="warning"
        />
        <KpiCard
          label="已通過的 rollout gate"
          value="3/3"
          detail="2026-05-09 22:00"
          tone="success"
        />
      </KpiRow>

      <WorkflowPanel
        title="深頁區段"
        description="用 anchor sections 在 overview、modules、onboarding、rollout、roles、billing、webhooks、audit 之間切換。"
      >
        <FilterPillRow>
          <FilterPill label="Overview" tone="neutral" active />
          <FilterPill label="Modules" tone="info" />
          <FilterPill label="Onboarding" tone="warning" />
          <FilterPill label="Rollout" tone="success" />
          <FilterPill label="Roles" tone="warning" />
          <FilterPill label="Billing" tone="neutral" />
          <FilterPill label="Webhooks" tone="info" />
          <FilterPill label="Audit" tone="neutral" count={6} />
        </FilterPillRow>
      </WorkflowPanel>

      <div style={anchorSectionStyle}>
        <div style={heroGridStyle}>
          <DataViewCard
            title="Rollout workflow"
            subtitle="Progression 仍由後端掌控；此頁只呈現 gate 證據並發出正式 stage command。"
            tone="platform"
            actions={
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <StatusChip label="推進到 sandbox" tone="neutral" />
                <StatusChip label="推進到 pilot" tone="neutral" />
                <StatusChip label="推進到 production" tone="success" />
              </div>
            }
          >
            <Stepper
              items={[
                {
                  id: "created",
                  title: "租戶已建立",
                  description: "2026-04-12 08:10",
                  state: "complete",
                  tone: "success",
                },
                {
                  id: "sandbox",
                  title: "sandbox",
                  description: "Gate: approved",
                  state: "complete",
                  tone: "success",
                  timestamp: "2026-04-13 09:18",
                },
                {
                  id: "pilot",
                  title: "pilot",
                  description: "Gate: approved",
                  state: "complete",
                  tone: "success",
                  timestamp: "2026-04-20 13:44",
                },
                {
                  id: "production",
                  title: "production",
                  description: "Gate: approved",
                  state: "current",
                  tone: "success",
                  timestamp: "2026-05-09 22:00",
                },
                {
                  id: "rollback",
                  title: "Rollback ready",
                  description: "owner: Ken Liao",
                  state: "complete",
                  tone: "success",
                },
              ]}
            />
            <div style={statusSummaryGridStyle}>
              <CalloutBanner
                tone="success"
                title="Rollback readiness"
                description="Rollback owner 與 fallback posture 已經記錄。"
              />
              <CalloutBanner
                tone="warning"
                title="角色確認狀態"
                description="3/4 個角色已確認"
              />
              <CalloutBanner
                tone="info"
                title="Cutover 備註"
                description="本次 cutover 於 05-09 22:00 完成，未觸發重大 SLO。"
              />
            </div>
            <DetailMetadataGrid
              minColumnWidth="180px"
              items={[
                {
                  id: "cutover-owner",
                  label: "Cutover owner",
                  value: "Yi-Chun Lin",
                },
                {
                  id: "rollback-owner",
                  label: "Rollback owner",
                  value: "Ken Liao",
                },
                {
                  id: "last-promoted",
                  label: "最近推進時間",
                  value: "2026-05-09 22:00",
                },
                {
                  id: "current-stage",
                  label: "目前階段",
                  value: "production",
                },
              ]}
            />
          </DataViewCard>

          <DataViewCard
            title="Onboarding package"
            subtitle="在每次正式 promotion 前，用來檢視 integration package、billing baseline 與 rollout owner。"
            tone="info"
            summary="在 rollout review 時持續把 onboarding package 放在同一屏，避免 cutover owner、API scope 與 billing defaults 漂移。"
          >
            <DetailMetadataGrid
              minColumnWidth="220px"
              items={[
                {
                  id: "integration-mode",
                  label: "整合模式",
                  value: "api_key_and_webhook",
                },
                {
                  id: "sandbox-url",
                  label: "Sandbox URL",
                  value: "https://sbx.drts.io/t/tsmc_fab18",
                },
                {
                  id: "production-url",
                  label: "Production URL",
                  value: "https://api.drts.io/t/tsmc_fab18",
                },
                {
                  id: "billing-baseline",
                  label: "帳務基線",
                  value: "TSMC Fab 18 Shuttle",
                  hint: "Mina Huang · billing@tsmc.example",
                },
                {
                  id: "api-scopes",
                  label: "API scopes",
                  value: "bookings.write, bookings.read, audit.read",
                  columnSpan: 2,
                },
                {
                  id: "rollout-note",
                  label: "Rollout 備註",
                  value: "台中廠區 cutover 後，production 48h 無重大告警。",
                  columnSpan: 2,
                },
              ]}
            />
          </DataViewCard>
        </div>
      </div>

      <div style={anchorSectionStyle}>
        <DataViewCard
          title="角色與確認"
          subtitle="以表格保留 roles 與 invite state，讓 rollout reviewer 在 production promotion 前快速掃描待確認項。"
          tone="warning"
          summary="此表刻意維持 contract-safe：目前資料契約沒有角色 email，因此以 role / required / state / timestamp 呈現。"
        >
          <KpiRow minWidth="160px">
            <KpiCard label="必要角色" value="3" tone="warning" />
            <KpiCard label="已邀請" value="3" tone="info" />
            <KpiCard label="已確認" value="3" tone="success" />
          </KpiRow>
          <DataTable
            columns={[
              { label: "角色", width: "220px" },
              { label: "要求", width: "120px" },
              { label: "狀態", width: "140px" },
              { label: "時間", width: "180px" },
              { label: "操作", width: "140px" },
            ]}
          >
            {roleRows.map((row) => (
              <Tr key={row.roleCode}>
                <Td>
                  <DataCellStack
                    primary={<strong>{row.role}</strong>}
                    secondary={row.roleCode}
                  />
                </Td>
                <Td>
                  <StatusChip label={row.required} tone={row.requiredTone} />
                </Td>
                <Td>
                  <StatusChip label={row.state} tone={row.stateTone} />
                </Td>
                <Td muted>{row.timestamp}</Td>
                <Td>
                  {"actionTone" in row ? (
                    <StatusChip
                      label={row.action}
                      tone={row.actionTone ?? "neutral"}
                    />
                  ) : (
                    <StatusChip label={row.action} tone="neutral" />
                  )}
                </Td>
              </Tr>
            ))}
          </DataTable>
        </DataViewCard>
      </div>

      <WorkflowSplitLayout
        main={
          <>
            <WorkflowPanel
              title="概況"
              description="此 tenant 的核心識別、生命週期時間點與目前治理姿態。"
            >
              <DetailMetadataGrid
                minColumnWidth="220px"
                items={[
                  {
                    id: "tenant-id",
                    label: "Tenant ID",
                    value: "tenant_tsmc_fab18",
                  },
                  { id: "tenant-code", label: "租戶代碼", value: "TSMC_FAB18" },
                  {
                    id: "created-at",
                    label: "建立時間",
                    value: "2026-04-12 08:10",
                  },
                  {
                    id: "updated-at",
                    label: "最近更新",
                    value: "2026-05-10 16:12",
                  },
                  {
                    id: "integration-mode",
                    label: "整合模式",
                    value: "partner_managed",
                  },
                  {
                    id: "current-rollout",
                    label: "目前 rollout",
                    value: "production",
                  },
                  {
                    id: "cutover-owner",
                    label: "Cutover owner",
                    value: "Yi-Chun Lin",
                  },
                  {
                    id: "rollback-owner",
                    label: "Rollback owner",
                    value: "Ken Liao",
                  },
                ]}
              />
            </WorkflowPanel>

            <WorkflowPanel
              title="模組與配額"
              description="產品模組啟用範圍與每月配額基線仍由平台端維護。"
            >
              <KpiRow minWidth="180px">
                <KpiCard
                  label="已啟用範圍"
                  value="13"
                  detail="dispatch · billing · reporting"
                  tone="info"
                />
                <KpiCard
                  label="未啟用範圍"
                  value="0"
                  detail="—"
                  tone="neutral"
                />
                <KpiCard
                  label="司機配額"
                  value="560"
                  detail="26,000 bookings"
                  tone="warning"
                />
              </KpiRow>
            </WorkflowPanel>

            <WorkflowPanel
              title="Audit 面"
              description="顯示此 tenant 最近的治理事件、request 與 resource 脈絡。"
            >
              <DataTable
                columns={[
                  { label: "時間", width: "180px" },
                  { label: "模組", width: "120px" },
                  { label: "動作", width: "220px" },
                  { label: "資源", width: "200px" },
                  { label: "Request", width: "140px" },
                ]}
              >
                {[
                  {
                    id: "1",
                    at: "2026-05-09 22:01",
                    module: "tenants",
                    action: "set_platform_tenant_rollout_stage",
                    resource: "tenant_tsmc_fab18",
                    request: "req_4312",
                  },
                  {
                    id: "2",
                    at: "2026-05-09 18:42",
                    module: "tenants",
                    action: "update_platform_tenant_onboarding",
                    resource: "tenant_tsmc_fab18",
                    request: "req_4298",
                  },
                ].map((row) => (
                  <Tr key={row.id}>
                    <Td muted>{row.at}</Td>
                    <Td>{row.module}</Td>
                    <Td>{row.action}</Td>
                    <Td>{row.resource}</Td>
                    <Td mono>{row.request}</Td>
                  </Tr>
                ))}
              </DataTable>
            </WorkflowPanel>
          </>
        }
        side={
          <>
            <WorkflowPanel
              title="Billing baseline"
              description="Tenant bootstrap defaults 使用的 invoice title、聯絡窗口與通知姿態。"
            >
              <DetailMetadataGrid
                columns={1}
                minColumnWidth="100%"
                items={[
                  {
                    id: "invoice-title",
                    label: "Invoice title",
                    value: "TSMC Fab 18 Shuttle",
                  },
                  {
                    id: "billing-contact",
                    label: "帳務聯絡人",
                    value: "Mina Huang",
                  },
                  {
                    id: "billing-email",
                    label: "帳務 Email",
                    value: "billing@tsmc.example",
                  },
                  { id: "subscriptions", label: "通知訂閱設定", value: "4" },
                ]}
              />
            </WorkflowPanel>

            <WorkflowPanel
              title="Webhook baseline"
              description="治理 webhook event scope 與 notification channel，但不把這頁混成 delivery operations。"
            >
              <DetailMetadataGrid
                columns={1}
                minColumnWidth="100%"
                items={[
                  {
                    id: "events",
                    label: "事件範圍",
                    value: "booking.created, booking.completed, invoice.ready",
                  },
                  {
                    id: "scopes",
                    label: "API 金鑰 scopes",
                    value: "bookings.write, bookings.read, audit.read",
                  },
                ]}
              />
            </WorkflowPanel>

            <WorkflowPanel
              title="Lifecycle controls"
              description="這些動作會直接改變 control-plane availability，應依照上方 rollout 證據操作。"
            >
              <div style={{ display: "grid", gap: "10px" }}>
                <CalloutBanner
                  tone="warning"
                  title="Lifecycle actions remain platform-owned"
                  description="切換 active、paused 或 rollback_hold 前，先比對 rollout 與 audit 證據。"
                />
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <StatusChip label="Activate" tone="success" />
                  <StatusChip label="Suspend" tone="neutral" />
                  <StatusChip label="Rollback hold" tone="danger" />
                </div>
              </div>
            </WorkflowPanel>
          </>
        }
      />
    </StoryShell>
  );
}

const meta = {
  title: "Platform Admin/Tenants + Rollout",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Platform Admin tenant list and tenant detail parity targets for `ADM-UI-RD-004`. Each built view is rendered beside the corresponding `PA_Tenants` or `PA_TenantDetail` artboard from `docs/05-ui/drts-design-canvas/Platform Admin.html`.",
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
        <div style={comparisonGridStyle}>
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

export const PlatformTenantsParity: Story = {
  name: "PA_Tenants parity",
  render: () => (
    <ParityLayout
      title="Built platform tenants roster with rollout watchlist and governance table."
      description="The built page posture is rendered beside the Platform Admin tenants artboard for manual visual comparison."
      canvasSrc={canvasTenantsSrc}
      canvasTitle="Platform Admin tenants artboard"
      built={<PlatformTenantsBuiltView />}
    />
  ),
};

export const PlatformTenantDetailParity: Story = {
  name: "PA_TenantDetail parity",
  render: () => (
    <ParityLayout
      title="Built tenant detail with rollout stepper, onboarding DL, and roles/invites table."
      description="The built page posture is rendered beside the Platform Admin tenant detail artboard for manual visual comparison."
      canvasSrc={canvasTenantDetailSrc}
      canvasTitle="Platform Admin tenant detail artboard"
      built={<PlatformTenantDetailBuiltView />}
    />
  ),
};
