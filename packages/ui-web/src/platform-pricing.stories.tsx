import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { ReactNode } from "react";
import { ManagementShell } from "./management-shell";
import type { ManagementSidebarSection } from "./management-sidebar";
import {
  CalloutBanner,
  DataCellStack,
  DataTable,
  DataViewCard,
  DetailList,
  KpiCard,
  KpiRow,
  PageHeader,
  StatusChip,
  Stepper,
  Td,
  Tr,
  WorkflowPanel,
} from "./index";

const canvasPricingSrc = "/drts-design-canvas/Platform%20Admin.html#pricing";

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
      { href: "/pricing", label: "Pricing", badge: "1", badgeTone: "warning" },
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

const cardGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: "16px",
  alignItems: "start" as const,
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

function PlatformPricingShell({ children }: { children: ReactNode }) {
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
        currentPath: "/pricing",
      }}
      topbar={{
        breadcrumb: [{ label: "Platform Admin" }, { label: "Pricing" }],
        envLabel: "production",
        envTone: "platform",
      }}
    >
      <div style={pageStackStyle}>{children}</div>
    </ManagementShell>
  );
}

function PricingBuiltView() {
  return (
    <PlatformPricingShell>
      <PageHeader
        eyebrow="計價治理"
        title="計價"
        subtitle="pricing rules · driver fee plans · publish windows"
        meta={[
          { label: "草稿佇列", value: "1", tone: "warning" },
          { label: "生效規則", value: "2", tone: "success" },
          { label: "Fee-plan snapshots", value: "3", tone: "info" },
        ]}
      />
      <CalloutBanner
        tone="platform"
        eyebrow="權威與 override guardrails"
        title="Quoted fare authority remains backend-owned"
        description="即使平台端可以安排 publish window，quoted fare 真值仍由 canonical pricing authority 控制。"
        meta={
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            <StatusChip tone="platform" label="shadow_pricing_catalog_v1" />
            <StatusChip tone="success" label="pricing-rule-v23" />
          </div>
        }
        footer="Tenant 與 partner booking channels 對 quoted fare 一律 read-only。"
      />
      <KpiRow minWidth="170px">
        <KpiCard
          label="草稿佇列"
          value="1"
          detail="pr_v24 · enterprise rollout"
          tone="warning"
        />
        <KpiCard
          label="生效規則"
          value="2"
          detail="1 live · 1 warm standby"
          tone="success"
        />
        <KpiCard
          label="Fee-plan snapshots"
          value="3"
          detail="Driver settlement locked by version"
          tone="info"
        />
        <KpiCard
          label="Override fields"
          value="3"
          detail="actor · reason · traceId"
          tone="platform"
        />
      </KpiRow>
      <div style={cardGridStyle}>
        <WorkflowPanel
          title="發布流程"
          description="把 pricing draft、publish window、driver fee-plan publication 放在同一條治理路徑裡檢視。"
          tone="info"
          footer="Draft row 會打開 publish-window form；其餘版本保持 immutable history。"
        >
          <Stepper
            density="compact"
            items={[
              {
                id: "draft",
                title: "定價草稿已建立",
                description: "新版本、scope 與報銷模式先在草稿區隔離。",
                state: "complete",
                stateLabel: "可發布",
                supportingContent: (
                  <DataCellStack
                    primary={<strong>Enterprise launch · v24</strong>}
                    secondary="all tenants"
                    tertiary="新 enterprise split 與 surcharge note"
                  />
                ),
              },
              {
                id: "window",
                title: "Publish window 已確認",
                description: "確認 effective from / to 後才能切成 live rule。",
                state: "current",
                stateLabel: "編輯中",
                supportingContent: (
                  <DataCellStack
                    primary={
                      <strong>2026-05-11 09:00 {"->"} open ended</strong>
                    }
                    secondary="staged from PA_Pricing"
                  />
                ),
              },
              {
                id: "plan",
                title: "司機費用方案已發布",
                description:
                  "Fee-plan snapshot 與 pricing publication 維持同步。",
                state: "complete",
                stateLabel: "生效中",
                supportingContent: (
                  <DataCellStack
                    primary={<strong>Default plan · drv-fee-v7</strong>}
                    secondary="15.00% · mixed"
                    tertiary="Published 2026-05-10 18:05"
                  />
                ),
              },
            ]}
          />
        </WorkflowPanel>
        <DataViewCard
          title="Authority guardrails"
          subtitle="Canonical pricing truth and manual override constraints."
          tone="platform"
          density="compact"
          summary="Quoted fare authority stays contract-owned; this console only stages publication."
          footer="Override actors: platform_admin / ops_user"
        >
          <DetailList
            columns={1}
            dense
            items={[
              {
                id: "source",
                label: "Quoted fare source",
                value: <code>shadow_pricing_catalog_v1</code>,
              },
              {
                id: "version",
                label: "Rule version",
                value: <code>pricing-rule-v23</code>,
              },
              {
                id: "actors",
                label: "Override actors",
                value: "platform_admin / ops_user",
              },
              {
                id: "fields",
                label: "Required fields",
                value: "actor, reason, traceId",
              },
            ]}
          />
        </DataViewCard>
        <DataViewCard
          title="Create draft platform pricing rule"
          subtitle="Author the next version without mutating the live rule."
          tone="platform"
          density="compact"
          footer="Drafts remain isolated until the publish window is confirmed."
        >
          <div style={{ display: "grid", gap: "12px" }}>
            <div style={fieldGridStyle}>
              <Field label="Rule name" value="Enterprise launch" />
              <Field label="Version" value="v24" />
              <Field label="Applicable to" value="all" />
              <Field label="Service Fee (bps)" value="1600" />
            </div>
            <Field
              label="Notes"
              value="Applies surcharge cleanup before tenant rollout."
              fullWidth
            />
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <StaticButton tone="primary">Create draft</StaticButton>
            </div>
          </div>
        </DataViewCard>
        <DataViewCard
          title="Publish settlement fee plan"
          subtitle="Immutable snapshot for downstream driver settlement."
          tone="platform"
          density="compact"
          footer="Append-only snapshots avoid operator drift during payout review."
        >
          <div style={{ display: "grid", gap: "12px" }}>
            <div style={fieldGridStyle}>
              <Field label="Plan name" value="Default plan" />
              <Field label="Version" value="drv-fee-v7" />
              <Field label="Service Fee (bps)" value="1500" />
              <Field label="Reimbursement Mode" value="mixed" />
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <StaticButton tone="primary">
                Publish settlement plan
              </StaticButton>
            </div>
          </div>
        </DataViewCard>
      </div>
      <DataViewCard
        title="Platform pricing rules"
        subtitle="Primary pricing governance table aligned to version, scope, effective window, and publish action state."
        tone="platform"
        density="compact"
        summary="The built view keeps the artboard's publish-flow emphasis while showing the actual publication controls inline."
        footer="Only draft rows expose the publish-window form."
      >
        <DataTable
          density="compact"
          tone="platform"
          minWidth={1180}
          columns={[
            { label: "Rule", width: "220px" },
            { label: "Version", width: "110px" },
            { label: "Status", width: "120px" },
            { label: "Service Fee", width: "120px", align: "right" },
            { label: "Reimb. Mode", width: "140px" },
            { label: "Scope", width: "140px" },
            { label: "Effective window", width: "220px" },
            { label: "Notes", width: "220px" },
            { label: "Actions", width: "280px" },
          ]}
        >
          <Tr>
            <Td density="compact">
              <DataCellStack
                primary={<strong>Enterprise launch</strong>}
                secondary="pr_rule_20260510_24"
                tertiary="platform-admin-web"
              />
            </Td>
            <Td density="compact" mono>
              v24
            </Td>
            <Td density="compact">
              <StatusChip tone="warning" label="draft" />
            </Td>
            <Td density="compact" mono align="right">
              16.00%
            </Td>
            <Td density="compact">
              <StatusChip tone="info" label="mixed" />
            </Td>
            <Td density="compact">all tenants</Td>
            <Td density="compact">
              <DataCellStack
                primary="2026-05-11 09:00 -> open ended"
                secondary="staged for morning rollout"
              />
            </Td>
            <Td density="compact">Enterprise split cleanup before release.</Td>
            <Td density="compact">
              <div style={inlineActionStackStyle}>
                <StaticButton>Hide publish form</StaticButton>
                <div style={inlinePublishCardStyle}>
                  <Field label="Effective from" value="2026-05-11T09:00" />
                  <Field label="Effective to" value="" />
                  <div style={helperTextStyle}>
                    Leave blank to preserve the draft's open-ended range.
                  </div>
                  <div
                    style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}
                  >
                    <StaticButton>Cancel</StaticButton>
                    <StaticButton tone="primary">Confirm publish</StaticButton>
                  </div>
                </div>
              </div>
            </Td>
          </Tr>
          <Tr>
            <Td density="compact">
              <DataCellStack
                primary={<strong>Default platform pricing</strong>}
                secondary="pr_rule_20260429_23"
                tertiary="pricing.release-bot"
              />
            </Td>
            <Td density="compact" mono>
              v23
            </Td>
            <Td density="compact">
              <StatusChip tone="success" label="active" />
            </Td>
            <Td density="compact" mono align="right">
              15.00%
            </Td>
            <Td density="compact">
              <StatusChip tone="info" label="platform_funded" />
            </Td>
            <Td density="compact">all tenants</Td>
            <Td density="compact">
              <DataCellStack
                primary="2026-05-01 00:00 -> open ended"
                secondary="published 2026-05-01 00:00"
              />
            </Td>
            <Td density="compact">Current live pricing authority.</Td>
            <Td density="compact" muted>
              Immutable history
            </Td>
          </Tr>
        </DataTable>
      </DataViewCard>
      <div style={cardGridStyle}>
        <DataViewCard
          title="Published settlement fee plans"
          subtitle="Driver settlement snapshots."
          tone="platform"
          density="compact"
          footer="Published fee plans stay immutable for downstream statements."
        >
          <DataTable
            density="compact"
            tone="platform"
            minWidth={760}
            columns={[
              { label: "Plan", width: "220px" },
              { label: "Version", width: "120px" },
              { label: "Service Fee", width: "120px", align: "right" },
              { label: "Reimb. Mode", width: "150px" },
              { label: "Status", width: "120px" },
              { label: "Published at", width: "180px" },
            ]}
          >
            <Tr>
              <Td density="compact">
                <DataCellStack
                  primary={<strong>Default plan</strong>}
                  secondary="fee_plan_0007"
                />
              </Td>
              <Td density="compact" mono>
                drv-fee-v7
              </Td>
              <Td density="compact" mono align="right">
                15.00%
              </Td>
              <Td density="compact">
                <StatusChip tone="info" label="mixed" />
              </Td>
              <Td density="compact">
                <StatusChip tone="success" label="published" />
              </Td>
              <Td density="compact" mono>
                2026-05-10 18:05
              </Td>
            </Tr>
            <Tr>
              <Td density="compact">
                <DataCellStack
                  primary={<strong>Airport pooled plan</strong>}
                  secondary="fee_plan_0006"
                />
              </Td>
              <Td density="compact" mono>
                drv-fee-v6
              </Td>
              <Td density="compact" mono align="right">
                12.50%
              </Td>
              <Td density="compact">
                <StatusChip tone="info" label="platform_funded" />
              </Td>
              <Td density="compact">
                <StatusChip tone="success" label="published" />
              </Td>
              <Td density="compact" mono>
                2026-04-28 09:20
              </Td>
            </Tr>
          </DataTable>
        </DataViewCard>
        <DataViewCard
          title="Release posture"
          subtitle="Live rule, next candidate, fee-plan snapshot, and service-bucket scope."
          tone="info"
          density="compact"
          footer="Use this panel to confirm pricing publication and settlement publication remain in lockstep."
        >
          <DetailList
            columns={1}
            dense
            items={[
              {
                id: "live",
                label: "Live rule",
                value: (
                  <DataCellStack
                    primary={<strong>Default platform pricing · v23</strong>}
                    secondary="2026-05-01 00:00 -> open ended"
                    tertiary="pricing.release-bot"
                  />
                ),
              },
              {
                id: "candidate",
                label: "Next candidate",
                value: (
                  <DataCellStack
                    primary={<strong>Enterprise launch · v24</strong>}
                    secondary="all tenants"
                    tertiary="Pending publish window"
                  />
                ),
              },
              {
                id: "plan",
                label: "Latest fee plan",
                value: (
                  <DataCellStack
                    primary={<strong>Default plan · drv-fee-v7</strong>}
                    secondary="15.00% · mixed"
                    tertiary="Published 2026-05-10 18:05"
                  />
                ),
              },
              {
                id: "buckets",
                label: "Service buckets",
                value: "standard / business / airport / wheelchair",
                hint: "Phase 1 service buckets remain contract-owned; this surface only decides which pricing version becomes effective.",
              },
            ]}
          />
        </DataViewCard>
      </div>
    </PlatformPricingShell>
  );
}

function Field({
  label,
  value,
  fullWidth = false,
}: {
  label: string;
  value: string;
  fullWidth?: boolean;
}) {
  return (
    <label
      style={{
        display: "grid",
        gap: "6px",
        gridColumn: fullWidth ? "1 / -1" : undefined,
      }}
    >
      <span
        style={{
          fontSize: "11px",
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "#475569",
        }}
      >
        {label}
      </span>
      <div
        style={{
          minHeight: "38px",
          display: "flex",
          alignItems: "center",
          padding: "9px 12px",
          borderRadius: "10px",
          border: "1px solid #cbd5e1",
          background: "#ffffff",
          color: value ? "#0f172a" : "#94a3b8",
          fontSize: "14px",
        }}
      >
        {value || " "}
      </div>
    </label>
  );
}

function StaticButton({
  children,
  tone = "secondary",
}: {
  children: ReactNode;
  tone?: "primary" | "secondary";
}) {
  const isPrimary = tone === "primary";
  return (
    <button
      type="button"
      style={{
        appearance: "none",
        border: isPrimary ? "1px solid #1d4ed8" : "1px solid #cbd5e1",
        background: isPrimary ? "#1d4ed8" : "#ffffff",
        color: isPrimary ? "#ffffff" : "#1e293b",
        borderRadius: "10px",
        padding: "8px 14px",
        fontSize: "13px",
        fontWeight: 600,
        lineHeight: 1.2,
        boxShadow: isPrimary ? "0 8px 24px rgba(29, 78, 216, 0.16)" : "none",
      }}
    >
      {children}
    </button>
  );
}

const fieldGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "12px",
};

const inlineActionStackStyle = {
  display: "grid",
  gap: "10px",
  minWidth: "260px",
};

const inlinePublishCardStyle = {
  display: "grid",
  gap: "8px",
  padding: "12px",
  borderRadius: "16px",
  background: "#f8fafc",
  border: "1px solid rgba(148,163,184,0.24)",
};

const helperTextStyle = {
  color: "#64748b",
  fontSize: "12px",
  lineHeight: 1.5,
};

const metaGridStyle = {
  display: "grid",
  gap: "16px",
};

const meta: Meta = {
  title: "Platform Admin/Pricing",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Platform Admin pricing parity target for `ADM-UI-RD-007`. The built governance view is compared against `docs/05-ui/drts-design-canvas/Platform Admin.html#pricing`.",
      },
    },
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const PlatformPricingGovernance: Story = {
  name: "PA_Pricing governance",
  render: () => (
    <div style={{ padding: "24px", background: "#e2e8f0" }}>
      <div style={metaGridStyle}>
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
            Pricing Governance Review
          </div>
          <div style={{ fontSize: "13px", color: "#475569", lineHeight: 1.5 }}>
            The built pricing surface is rendered beside the `PA_Pricing`
            artboard for manual publish-flow comparison.
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
            subtitle="Platform pricing governance composed with ManagementShell, publish stepper, and rule tables."
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
              <PricingBuiltView />
            </div>
          </ComparisonFrame>
          <ComparisonFrame
            title="Designed"
            subtitle="`docs/05-ui/drts-design-canvas/Platform Admin.html#pricing`"
          >
            <iframe
              src={canvasPricingSrc}
              title="Platform Admin pricing artboard"
              style={{
                width: "100%",
                minWidth: "720px",
                height: "960px",
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
