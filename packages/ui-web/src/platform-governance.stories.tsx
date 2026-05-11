import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { ReactNode } from "react";
import { ManagementShell } from "./management-shell";
import type { ManagementSidebarSection } from "./management-sidebar";
import {
  AuthorityBadge,
  CalloutBanner,
  DataCellStack,
  DataTable,
  DataViewCard,
  DetailList,
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

const canvasNoticesSrc = "/drts-design-canvas/Platform%20Admin.html#notices";
const canvasAuditSrc = "/drts-design-canvas/Platform%20Admin.html#audit";
const canvasFlagsSrc = "/drts-design-canvas/Platform%20Admin.html#flags";
const canvasAdaptersSrc = "/drts-design-canvas/Platform%20Admin.html#adapters";

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

const codePillStyle = {
  fontSize: "12px",
  padding: "2px 8px",
  borderRadius: "8px",
  background: "#eff6ff",
  color: "#1d4ed8",
  fontFamily: 'ui-monospace, "SFMono-Regular", "SF Mono", Menlo, monospace',
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

function PlatformNoticesBuiltView() {
  const rows: Array<{
    id: string;
    title: string;
    severity: "critical" | "warning" | "info";
    audience: string;
    status: "active" | "scheduled" | "resolved";
    updated: string;
  }> = [
    {
      id: "ntc_104",
      title: "Partner callback retry lane is degraded",
      severity: "critical",
      audience: "ops + partner",
      status: "active",
      updated: "2026-05-11 08:42",
    },
    {
      id: "ntc_103",
      title: "Maintenance window staged for switchboard publish",
      severity: "warning",
      audience: "all",
      status: "scheduled",
      updated: "2026-05-11 02:00",
    },
    {
      id: "ntc_099",
      title: "Driver fee-plan publication completed",
      severity: "info",
      audience: "finance",
      status: "resolved",
      updated: "2026-05-10 18:05",
    },
  ];

  return (
    <StoryShell
      currentPath="/notices"
      breadcrumb={[{ label: "Platform Layer" }, { label: "Notices" }]}
    >
      <PageHeader
        eyebrow="Platform-issued communications"
        title="公告與維護"
        subtitle="platform notices · global maintenance mode"
        meta={[
          { label: "Active notices", value: "1", tone: "danger" },
          { label: "Scheduled", value: "1", tone: "warning" },
          { label: "Maintenance state", value: "staged", tone: "info" },
        ]}
        actions={
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <StatusChip tone="info" label="Notice ledger" />
            <StatusChip tone="warning" label="Maintenance staged" />
          </div>
        }
      />
      <CalloutBanner
        tone="warning"
        eyebrow="Maintenance window"
        title="A platform-wide maintenance window is staged but not active"
        description="Notice timing, switchboard copy, and backend maintenance state stay aligned so the operator is not inventing local-only truth."
      >
        <DetailMetadataGrid
          columns={3}
          minColumnWidth="180px"
          items={[
            {
              id: "window",
              label: "Window",
              value: "2026-05-15 02:00 -> 04:00 UTC",
            },
            {
              id: "reason",
              label: "Reason",
              value: "Pricing publish + adapter credential rotation",
            },
            {
              id: "state",
              label: "Current state",
              value: <StatusChip tone="warning" label="scheduled" />,
            },
          ]}
        />
      </CalloutBanner>
      <KpiRow minWidth="170px">
        <KpiCard
          label="Audience-safe notices"
          value="3"
          detail="ops, all users, finance"
          tone="info"
        />
        <KpiCard
          label="Critical comms"
          value="1"
          detail="partner callback lane"
          tone="danger"
        />
        <KpiCard
          label="Scheduled publish"
          value="1"
          detail="switchboard follows same window"
          tone="warning"
        />
        <KpiCard
          label="Maintenance mode"
          value="off"
          detail="scheduled for 05-15 02:00 UTC"
          tone="success"
        />
      </KpiRow>
      <WorkflowSplitLayout
        main={
          <DataViewCard
            title="Notice ledger"
            subtitle="對齊 PA_Notices 的 notice table，但補進目前後台實作實際需要的 severity / audience / state framing。"
            tone="info"
            summary="Resolved rows stay visible so operators can compare current messaging against recent publish history."
          >
            <DataTable
              tone="info"
              minWidth={920}
              columns={[
                { label: "ID", width: "110px" },
                { label: "Title", width: "330px" },
                { label: "Severity", width: "130px" },
                { label: "Audience", width: "150px" },
                { label: "Status", width: "120px" },
                { label: "Updated", width: "160px" },
              ]}
            >
              {rows.map((row) => (
                <Tr
                  key={row.id}
                  highlighted={
                    row.status !== "resolved" || row.severity === "critical"
                  }
                >
                  <Td mono>{row.id}</Td>
                  <Td>
                    <DataCellStack
                      primary={<strong>{row.title}</strong>}
                      secondary="Issued from platform notice command"
                    />
                  </Td>
                  <Td>
                    <StatusChip
                      tone={
                        row.severity === "critical"
                          ? "danger"
                          : row.severity === "warning"
                            ? "warning"
                            : "info"
                      }
                      label={row.severity}
                    />
                  </Td>
                  <Td mono>{row.audience}</Td>
                  <Td>
                    <StatusChip
                      tone={
                        row.status === "active"
                          ? "success"
                          : row.status === "scheduled"
                            ? "warning"
                            : "neutral"
                      }
                      label={row.status}
                    />
                  </Td>
                  <Td mono>{row.updated}</Td>
                </Tr>
              ))}
            </DataTable>
          </DataViewCard>
        }
        side={
          <>
            <WorkflowPanel
              title="Publish notice"
              description="The operator still stages one notice command at a time: title, severity, audience, and optional scheduled publish."
              tone="info"
            >
              <DetailList
                columns={1}
                items={[
                  {
                    id: "title",
                    label: "Draft title",
                    value: "Scheduled platform maintenance",
                  },
                  {
                    id: "audience",
                    label: "Audience",
                    value: "all",
                  },
                  {
                    id: "publish-at",
                    label: "Schedule",
                    value: "2026-05-15 01:30 UTC",
                  },
                ]}
              />
            </WorkflowPanel>
            <WorkflowPanel
              title="Maintenance mode control"
              description="The same backend record drives the live toggle, reason, and maintenance start/end window."
              tone="warning"
            >
              <DetailList
                columns={1}
                items={[
                  {
                    id: "pause",
                    label: "Blast radius",
                    value: "dispatch · webhook delivery · partner ingress",
                  },
                  {
                    id: "owner",
                    label: "Updated by",
                    value: "platform.sre.oncall",
                  },
                  {
                    id: "guardrail",
                    label: "Guardrail",
                    value: "Publish notice before enabling maintenance mode",
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

function PlatformAuditBuiltView() {
  const ledgerRows = [
    [
      "2026-05-11 08:50",
      "platform_admin",
      "yc.lin@drts.io",
      "feature_flag",
      "updateFeatureFlag",
      "tenant/passenger_live_board",
      "req_8841",
    ],
    [
      "2026-05-11 08:42",
      "system",
      "platform.maintenance",
      "notices",
      "setMaintenanceMode",
      "maintenance_window",
      "req_8830",
    ],
    [
      "2026-05-11 08:33",
      "partner_api_key",
      "bgmt_callback",
      "adapters",
      "rotateCredential",
      "adapter/bgmt",
      "req_8819",
    ],
    [
      "2026-05-11 08:14",
      "ops_user",
      "ops-night-17",
      "reconciliation",
      "exportSettlementCsv",
      "settlement/batch-204",
      "req_8798",
    ],
  ] as const;

  return (
    <StoryShell
      currentPath="/audit"
      breadcrumb={[{ label: "Platform Layer" }, { label: "Audit Trail" }]}
    >
      <PageHeader
        eyebrow="Evidence governance"
        title="稽核與證據"
        subtitle="append-only · review surface · retention visibility"
        meta={[
          { label: "Policy families", value: "5", tone: "neutral" },
          { label: "Active holds", value: "2", tone: "warning" },
          { label: "Active exceptions", value: "1", tone: "warning" },
        ]}
        actions={
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <StatusChip tone="info" label="Append-only" />
            <StatusChip tone="warning" label="CSV export reviewed" />
          </div>
        }
      />
      <CalloutBanner
        tone="info"
        eyebrow="Audit guardrail"
        title="Governance writes stay outside this surface"
        description="The frontend reviews retention policies, legal holds, deletion exceptions, and immutable audit history without becoming a source of truth itself."
      />
      <KpiRow minWidth="170px">
        <KpiCard
          label="Signed download families"
          value="3"
          detail="evidence export requires signed URL"
          tone="info"
        />
        <KpiCard
          label="Legal holds"
          value="2"
          detail="reconciliation + incident evidence"
          tone="warning"
        />
        <KpiCard
          label="Deletion exceptions"
          value="1"
          detail="manual retention pause"
          tone="warning"
        />
        <KpiCard
          label="Visible audit rows"
          value="12,442"
          detail="request-linked history"
          tone="platform"
        />
      </KpiRow>
      <WorkflowSplitLayout
        main={
          <DataViewCard
            title="Audit ledger"
            subtitle="延續 PA_Audit 的 append-only table 姿態，並保留 request / actor / module 三條追蹤線索。"
            tone="neutral"
            summary="Module filters stay outside the table because the most important review need is correlating a governance action back to its request id."
          >
            <DataTable
              minWidth={1080}
              columns={[
                { label: "When", width: "160px" },
                { label: "Actor type", width: "130px" },
                { label: "Actor", width: "220px" },
                { label: "Module", width: "120px" },
                { label: "Action", width: "180px" },
                { label: "Resource", width: "170px" },
                { label: "Request", width: "120px" },
              ]}
            >
              {ledgerRows.map(
                ([
                  when,
                  actorType,
                  actor,
                  moduleName,
                  action,
                  resource,
                  request,
                ]) => (
                  <Tr key={`${request}-${action}`}>
                    <Td mono>{when}</Td>
                    <Td mono>{actorType}</Td>
                    <Td>
                      <DataCellStack
                        primary={<strong>{actor}</strong>}
                        secondary="immutable audit actor"
                      />
                    </Td>
                    <Td mono>{moduleName}</Td>
                    <Td>
                      <span style={codePillStyle}>{action}</span>
                    </Td>
                    <Td mono>{resource}</Td>
                    <Td mono>{request}</Td>
                  </Tr>
                ),
              )}
            </DataTable>
          </DataViewCard>
        }
        side={
          <>
            <DataViewCard
              title="Retention posture"
              subtitle="Policy families"
              tone="info"
            >
              <DetailList
                columns={1}
                items={[
                  {
                    id: "evidence",
                    label: "Reconciliation evidence",
                    value: "hot 90d / archive 365d",
                  },
                  {
                    id: "download",
                    label: "Download mode",
                    value: "signed_url · 15 minutes",
                  },
                  {
                    id: "hold",
                    label: "Legal hold support",
                    value: "enabled",
                  },
                ]}
              />
            </DataViewCard>
            <DataViewCard
              title="Active retention exceptions"
              subtitle="Current legal-hold and deletion-exception context"
              tone="warning"
            >
              <DetailList
                columns={1}
                items={[
                  {
                    id: "hold-1",
                    label: "case-22018",
                    value: "driver_receipt family · subject rcpt_1881",
                  },
                  {
                    id: "hold-2",
                    label: "case-22041",
                    value: "incident family · subject inc_204",
                  },
                  {
                    id: "exception",
                    label: "retention pause",
                    value: "ops export mismatch investigation",
                  },
                ]}
              />
            </DataViewCard>
          </>
        }
      />
    </StoryShell>
  );
}

function PlatformFlagsBuiltView() {
  const rows = [
    {
      key: "ops.driver_reassign_v2",
      state: "enabled",
      overrides: "3 tenants",
      updatedBy: "platform.release",
      updatedAt: "2026-05-11 07:42",
    },
    {
      key: "tenant.concierge_mode",
      state: "disabled",
      overrides: "1 tenant",
      updatedBy: "ops.launch-control",
      updatedAt: "2026-05-10 21:08",
    },
    {
      key: "billing.split_invoice_shadow",
      state: "enabled",
      overrides: "0",
      updatedBy: "finance.governance",
      updatedAt: "2026-05-10 18:12",
    },
    {
      key: "passenger.live_board_beta",
      state: "disabled",
      overrides: "2 tenants",
      updatedBy: "platform.release",
      updatedAt: "2026-05-09 15:44",
    },
  ] as const;

  return (
    <StoryShell
      currentPath="/feature-flags"
      breadcrumb={[{ label: "Platform Layer" }, { label: "Feature Flags" }]}
    >
      <PageHeader
        eyebrow="Scope-safe governance"
        title="功能旗標"
        subtitle="global defaults · tenant override review · confirmation before blast-radius changes"
        meta={[
          { label: "Flag groups", value: "4", tone: "neutral" },
          { label: "Enabled globals", value: "2", tone: "success" },
          { label: "Override groups", value: "3", tone: "warning" },
        ]}
        actions={
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <StatusChip tone="warning" label="Global toggle only" />
            <StatusChip tone="info" label="Tenant overrides visible" />
          </div>
        }
      />
      <CalloutBanner
        tone="warning"
        eyebrow="Guardrail"
        title="Tenant overrides stay visible but read-only"
        description="The operator can change only the global default on this surface; tenant-specific override edits remain outside the slice so blast radius remains explicit."
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          <StatusChip tone="success" label="global default editable" />
          <StatusChip tone="info" label="tenant override read-only" />
          <StatusChip tone="neutral" label="owner metadata not in contract" />
        </div>
      </CalloutBanner>
      <KpiRow minWidth="170px">
        <KpiCard
          label="Editable globals"
          value="4"
          detail="platform-issued defaults"
          tone="success"
        />
        <KpiCard
          label="Groups with overrides"
          value="3"
          detail="tenant exception review"
          tone="warning"
        />
        <KpiCard
          label="Override rows"
          value="6"
          detail="kept for blast-radius context"
          tone="info"
        />
        <KpiCard
          label="Contract notes"
          value="2"
          detail="no override owner metadata"
          tone="neutral"
        />
      </KpiRow>
      <DataViewCard
        title="Flag registry"
        subtitle="保留 PA_Flags 的 flag-table 視覺核心，但用 grouped rows 表達目前平台實作的 global vs tenant override 差異。"
        tone="warning"
        summary="A grouped table makes override context visible without implying that tenant rows are editable from the same action lane."
      >
        <DataTable
          tone="warning"
          minWidth={1040}
          columns={[
            { label: "Key", width: "330px" },
            { label: "State", width: "120px" },
            { label: "Tenant overrides", width: "180px" },
            { label: "Global scope", width: "140px" },
            { label: "Updated by", width: "160px" },
            { label: "Updated at", width: "140px" },
          ]}
        >
          {rows.map((row) => (
            <Tr
              key={row.key}
              highlighted={row.overrides !== "0" || row.state === "enabled"}
            >
              <Td>
                <DataCellStack
                  primary={<code style={codePillStyle}>{row.key}</code>}
                  secondary="grouped key"
                />
              </Td>
              <Td>
                <StatusChip
                  tone={row.state === "enabled" ? "success" : "neutral"}
                  label={row.state}
                />
              </Td>
              <Td>
                <StatusChip
                  tone={row.overrides === "0" ? "neutral" : "warning"}
                  label={row.overrides}
                />
              </Td>
              <Td>
                <StatusChip tone="platform" label="platform default" />
              </Td>
              <Td mono>{row.updatedBy}</Td>
              <Td mono>{row.updatedAt}</Td>
            </Tr>
          ))}
        </DataTable>
      </DataViewCard>
    </StoryShell>
  );
}

function PlatformAdaptersBuiltView() {
  const rows = [
    {
      name: "BGMT callback gateway",
      code: "bgmt",
      live: "degraded",
      credential: "reauth_required",
      authority: "SHADOW",
      category: "forwarded",
      rollout: "IN_PROGRESS",
      latency: "812ms",
    },
    {
      name: "Tax receipt filing",
      code: "receipt_filer",
      live: "healthy",
      credential: "authenticated",
      authority: "OWNED",
      category: "owned",
      rollout: "COMPLETED",
      latency: "146ms",
    },
    {
      name: "Partner payout forwarder",
      code: "partner_payout",
      live: "healthy",
      credential: "authenticated",
      authority: "EXTERNAL",
      category: "forwarded",
      rollout: "NOT_STARTED",
      latency: "271ms",
    },
  ] as const;

  return (
    <StoryShell
      currentPath="/adapter-registry"
      breadcrumb={[{ label: "Platform Layer" }, { label: "Adapter Registry" }]}
    >
      <PageHeader
        eyebrow="Adapter governance"
        title="介接登錄"
        subtitle="adapter inventory · auth health · finance authority · rollout posture"
        meta={[
          { label: "Registered adapters", value: "3", tone: "neutral" },
          { label: "Forwarded posture", value: "2", tone: "warning" },
          { label: "Needs attention", value: "1", tone: "danger" },
        ]}
        actions={
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <StatusChip tone="info" label="Shared primitive table" />
            <StatusChip tone="warning" label="One degraded lane" />
          </div>
        }
      />
      <CalloutBanner
        tone="warning"
        eyebrow="Registry posture"
        title="Adapter edits are scoped to the selected registry row"
        description="Health, credential, webhook, and rollout context stay visible while the operator edits only the supported config and policy fields."
      />
      <KpiRow minWidth="170px">
        <KpiCard
          label="Forwarded adapters"
          value="2"
          detail="finance authority stays external or shadow"
          tone="warning"
        />
        <KpiCard
          label="Owned lanes"
          value="1"
          detail="platform-controlled filing adapter"
          tone="success"
        />
        <KpiCard
          label="Live incidents"
          value="1"
          detail="BGMT callback credential attention"
          tone="danger"
        />
        <KpiCard
          label="Editable policy fields"
          value="4"
          detail="service buckets · thresholds · rollout"
          tone="platform"
        />
      </KpiRow>
      <DataViewCard
        title="Adapter registry"
        subtitle="從 PA_Adapters 的 inventory card 出發，但壓成 Wave 3 平台頁一致的 compact registry table。"
        tone="warning"
        summary="Authority, live auth posture, and rollout state stay visible in the same row so operators can review ownership before changing config."
      >
        <DataTable
          tone="warning"
          minWidth={1100}
          columns={[
            { label: "Adapter", width: "240px" },
            { label: "Live readiness", width: "280px" },
            { label: "Authority", width: "150px" },
            { label: "Rollout", width: "150px" },
            { label: "Latency", width: "100px", align: "right" },
            { label: "Action lane", width: "180px" },
          ]}
        >
          {rows.map((row) => (
            <Tr key={row.code} highlighted={row.live !== "healthy"}>
              <Td>
                <DataCellStack
                  primary={<strong>{row.name}</strong>}
                  secondary={row.code}
                  tertiary="platform-admin-web"
                />
              </Td>
              <Td>
                <div style={{ display: "grid", gap: "8px" }}>
                  <div
                    style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}
                  >
                    <StatusChip
                      tone={row.live === "healthy" ? "success" : "warning"}
                      label={row.live}
                    />
                    <StatusChip
                      tone={
                        row.credential === "authenticated"
                          ? "success"
                          : "warning"
                      }
                      label={row.credential}
                    />
                  </div>
                  <span style={{ color: "#64748b", fontSize: "12.5px" }}>
                    webhook delivery and credential posture stay on the same row
                  </span>
                </div>
              </Td>
              <Td>
                <AuthorityBadge
                  tone={
                    row.authority === "OWNED"
                      ? "success"
                      : row.authority === "SHADOW"
                        ? "warning"
                        : "info"
                  }
                  category={row.category}
                  label={row.authority}
                />
              </Td>
              <Td>
                <StatusChip
                  tone={
                    row.rollout === "COMPLETED"
                      ? "success"
                      : row.rollout === "IN_PROGRESS"
                        ? "info"
                        : "neutral"
                  }
                  label={row.rollout}
                />
              </Td>
              <Td align="right" mono>
                {row.latency}
              </Td>
              <Td>
                <DataCellStack
                  primary={<strong>Edit selected adapter</strong>}
                  secondary="config + policy only"
                />
              </Td>
            </Tr>
          ))}
        </DataTable>
      </DataViewCard>
    </StoryShell>
  );
}

const meta = {
  title: "Platform Admin/Platform Layer",
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const NoticesParity: Story = {
  render: () => (
    <ParityLayout
      title="PA_Notices parity"
      description="Review the built notices + maintenance surface against the PA_Notices artboard anchor."
      canvasSrc={canvasNoticesSrc}
      canvasTitle="Platform Admin notices artboard"
      built={<PlatformNoticesBuiltView />}
    />
  ),
};

export const AuditParity: Story = {
  render: () => (
    <ParityLayout
      title="PA_Audit parity"
      description="Review the built append-only audit + evidence governance surface against the PA_Audit artboard anchor."
      canvasSrc={canvasAuditSrc}
      canvasTitle="Platform Admin audit artboard"
      built={<PlatformAuditBuiltView />}
    />
  ),
};

export const FeatureFlagsParity: Story = {
  render: () => (
    <ParityLayout
      title="PA_Flags parity"
      description="Review the built feature-flag governance surface against the PA_Flags artboard anchor."
      canvasSrc={canvasFlagsSrc}
      canvasTitle="Platform Admin feature flags artboard"
      built={<PlatformFlagsBuiltView />}
    />
  ),
};

export const AdapterRegistryParity: Story = {
  render: () => (
    <ParityLayout
      title="PA_Adapters parity"
      description="Review the built adapter-registry governance surface against the PA_Adapters artboard anchor."
      canvasSrc={canvasAdaptersSrc}
      canvasTitle="Platform Admin adapters artboard"
      built={<PlatformAdaptersBuiltView />}
    />
  ),
};
