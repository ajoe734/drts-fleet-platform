import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { ReactNode } from "react";
import { ManagementShell } from "./management-shell";
import type { ManagementSidebarSection } from "./management-sidebar";
import {
  ArtifactChipList,
  CalloutBanner,
  DataCellStack,
  DataFilterBar,
  DataTable,
  DataViewCard,
  DetailMetadataGrid,
  KpiCard,
  KpiRow,
  PageHeader,
  StatusChip,
  Td,
  Timeline,
  Tr,
  WorkflowPanel,
  WorkflowSplitLayout,
} from "./index";

const canvasPaymentsSrc = "/drts-design-canvas/Platform%20Admin.html#payments";
const canvasReconDetailSrc =
  "/drts-design-canvas/Platform%20Admin.html#recon-detail";

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

const pageStackStyle = {
  maxWidth: "1160px",
  margin: "0 auto",
  display: "grid",
  gap: "20px",
};

const compareGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(720px, 1fr))",
  gap: "16px",
  alignItems: "start" as const,
  overflowX: "auto" as const,
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

function PlatformPaymentsShell({
  currentPath,
  breadcrumb,
  children,
}: {
  currentPath: string;
  breadcrumb: string[];
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
        breadcrumb: breadcrumb.map((label) => ({ label })),
        envLabel: "production",
        envTone: "platform",
      }}
    >
      <div style={pageStackStyle}>{children}</div>
    </ManagementShell>
  );
}

function PaymentsBuiltView() {
  return (
    <PlatformPaymentsShell
      currentPath="/payments"
      breadcrumb={["Platform Admin", "Payments"]}
    >
      <PageHeader
        eyebrow="結算治理"
        title="Payments"
        subtitle="tenant invoices · driver statements · reimbursements · settlement matrix · reconciliation issues"
        meta={[
          { label: "Open issues", value: "3", tone: "warning" },
          { label: "shadow lanes", value: "1", tone: "platform" },
          { label: "Remittance backlog", value: "2", tone: "warning" },
        ]}
      />
      <CalloutBanner
        tone="platform"
        eyebrow="Finance authority"
        title="Operator queue stays visible without rewriting accounting truth."
        description="Invoice generation, statement releases, reimbursement evidence, and reconciliation routing all stay in one governance lane."
        meta={
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            <StatusChip tone="warning" label="backlog · 3" />
            <StatusChip tone="platform" label="shadow · 1" />
            <StatusChip tone="warning" label="remittance · 2" />
          </div>
        }
        footer="Forwarded shadow orders need explicit reconciliation before remittance can be treated as complete."
      />
      <KpiRow minWidth="170px">
        <KpiCard
          label="Invoice total"
          value="1,254,200 minor"
          detail="4 invoice rows"
          tone="info"
        />
        <KpiCard
          label="Statement net"
          value="988,740 minor"
          detail="3 statement snapshots"
          tone="platform"
        />
        <KpiCard
          label="Pending reimbursements"
          value="222,300 minor"
          detail="2 batches pending"
          tone="warning"
        />
        <KpiCard
          label="Paid reimbursements"
          value="481,900 minor"
          detail="1 settled"
          tone="success"
        />
        <KpiCard
          label="DRTS payable"
          value="17"
          detail="owned + partner lines"
          tone="neutral"
        />
        <KpiCard
          label="Shadow lines"
          value="4"
          detail="forwarded oversight"
          tone="info"
        />
      </KpiRow>
      <WorkflowSplitLayout
        main={
          <>
            <DataViewCard
              title="Reconciliation workflow"
              subtitle="Open, assign, and close exceptions from one queue before drilling into the evidence trail."
              tone="warning"
              summary="Filtered queue: 3"
              footer="The queue stays biased toward unresolved issues so reopened items stay visible."
              filters={
                <div style={{ display: "grid", gap: "10px" }}>
                  <DataFilterBar
                    value="open"
                    filters={[
                      { value: "all", label: "All", count: 4 },
                      {
                        value: "open",
                        label: "Open",
                        count: 2,
                        tone: "warning",
                      },
                      {
                        value: "assigned",
                        label: "Assigned",
                        count: 1,
                        tone: "info",
                      },
                      {
                        value: "reopened",
                        label: "Reopened",
                        count: 1,
                        tone: "danger",
                      },
                      {
                        value: "resolved",
                        label: "Resolved",
                        count: 1,
                        tone: "success",
                      },
                    ]}
                  />
                  <DataFilterBar
                    value="partner_sponsor_mismatch"
                    filters={[
                      { value: "all", label: "All types" },
                      {
                        value: "partner_sponsor_mismatch",
                        label: "partner_sponsor_mismatch",
                        count: 2,
                      },
                      {
                        value: "forwarder_status_mismatch",
                        label: "forwarder_status_mismatch",
                        count: 2,
                      },
                    ]}
                  />
                </div>
              }
            >
              <DetailMetadataGrid
                minColumnWidth="180px"
                items={[
                  {
                    id: "actor",
                    label: "Finance actor ID",
                    value: "finance.console",
                  },
                  {
                    id: "filtered",
                    label: "Filtered queue",
                    value: "3",
                    tone: "warning",
                  },
                  {
                    id: "backlog",
                    label: "Open backlog",
                    value: "3",
                    tone: "warning",
                  },
                  {
                    id: "reopened",
                    label: "Reopened",
                    value: "1",
                    tone: "danger",
                  },
                ]}
              />
              <DataTable
                tone="warning"
                minWidth={1120}
                columns={[
                  { label: "Issue", width: "16%" },
                  { label: "Summary", width: "24%" },
                  { label: "Owner", width: "14%" },
                  { label: "Context", width: "20%" },
                  { label: "Status", width: "12%" },
                  { label: "Action", width: "14%" },
                ]}
              >
                {[
                  {
                    issueId: "rec_0091",
                    summary: "Forwarder fare mismatch >5%",
                    issueType: "forwarder_status_mismatch",
                    owner: "張薇 Finance",
                    order: "SRX-9921098",
                    partner: "shadow.srx",
                    status: "reopened",
                    statusTone: "danger" as const,
                    detail: "shadow · srx",
                  },
                  {
                    issueId: "rec_0094",
                    summary: "Sponsor reference missing",
                    issueType: "partner_sponsor_mismatch",
                    owner: "王芳 Finance",
                    order: "ORD-772118",
                    partner: "partner.tpe-airport",
                    status: "open",
                    statusTone: "warning" as const,
                    detail: "partner_airport",
                  },
                  {
                    issueId: "rec_0097",
                    summary: "Invoice vs reimbursement amount drift",
                    issueType: "partner_sponsor_mismatch",
                    owner: "finance.lead",
                    order: "INV-202605-14",
                    partner: "tenant.enterprise",
                    status: "assigned",
                    statusTone: "info" as const,
                    detail: "tenant_enterprise",
                  },
                ].map((issue) => (
                  <Tr
                    key={issue.issueId}
                    highlighted={issue.status !== "resolved"}
                  >
                    <Td mono>
                      <DataCellStack
                        primary={<strong>{issue.issueId}</strong>}
                        secondary={issue.issueType}
                        tertiary="2026-05-10 18:42"
                      />
                    </Td>
                    <Td>
                      <DataCellStack
                        primary={issue.summary}
                        secondary={issue.detail}
                        tertiary={issue.order}
                      />
                    </Td>
                    <Td>
                      <DataCellStack
                        primary={issue.owner}
                        secondary="finance.console"
                        tertiary="2 evidence artifact(s)"
                      />
                    </Td>
                    <Td>
                      <DataCellStack
                        primary={issue.order}
                        secondary={issue.partner}
                        tertiary="recon_job_2026_05_10_03"
                      />
                    </Td>
                    <Td>
                      <StatusChip
                        tone={issue.statusTone}
                        label={issue.status}
                      />
                    </Td>
                    <Td align="right">
                      <span
                        style={{
                          display: "inline-flex",
                          padding: "6px 10px",
                          borderRadius: "999px",
                          border: "1px solid #cbd5e1",
                          fontSize: "12px",
                          fontWeight: 700,
                          color: "#1e293b",
                        }}
                      >
                        Open detail
                      </span>
                    </Td>
                  </Tr>
                ))}
              </DataTable>
            </DataViewCard>

            <DataViewCard
              title="Settlement matrix"
              subtitle="Each channel keeps payer, invoice, payout, and reconciliation ownership visible in one grid."
              tone="info"
              summary="4 matrix rows"
              footer="Matrix rows are ordered by tenant, partner, phone, then forwarded shadow channels."
            >
              <DataTable
                tone="info"
                minWidth={980}
                columns={[
                  { label: "Channel", width: "16%" },
                  { label: "Payer", width: "16%" },
                  { label: "Invoice", width: "17%" },
                  { label: "Payout", width: "17%" },
                  { label: "Reconciliation", width: "17%" },
                  { label: "Ledger", width: "17%" },
                ]}
              >
                {[
                  [
                    "tenant_enterprise",
                    "tenant",
                    "tenant invoice",
                    "platform payout",
                    "ops + finance",
                    "full_service",
                  ],
                  [
                    "partner_airport",
                    "partner",
                    "partner settlement",
                    "partner payout",
                    "finance queue",
                    "full_service",
                  ],
                  [
                    "phone_dispatch",
                    "tenant",
                    "tenant invoice",
                    "platform payout",
                    "dispatch review",
                    "full_service",
                  ],
                  [
                    "forwarded_shadow",
                    "external",
                    "shadow mirror",
                    "external payout",
                    "shadow recon",
                    "shadow_only",
                  ],
                ].map((row) => (
                  <Tr key={row[0]} highlighted={row[0] === "forwarded_shadow"}>
                    <Td>{row[0]}</Td>
                    <Td>{row[1]}</Td>
                    <Td>{row[2]}</Td>
                    <Td>{row[3]}</Td>
                    <Td>{row[4]}</Td>
                    <Td>{row[5]}</Td>
                  </Tr>
                ))}
              </DataTable>
            </DataViewCard>
          </>
        }
        side={
          <>
            <WorkflowPanel
              title="Release controls"
              description="Generate invoices and statements without leaving the finance governance route."
              footer="All generation actions refresh the same dataset used by the tables."
            >
              <div style={{ display: "grid", gap: "12px" }}>
                <StaticField label="Tenant ID" value="tenant-demo-001" />
                <StaticField label="Period start" value="2026-04-01" />
                <StaticField label="Period end" value="2026-04-30" />
                <StaticAction label="Generate invoice" tone="primary" />
              </div>
              <div style={{ display: "grid", gap: "12px", marginTop: "16px" }}>
                <StaticField label="Period month" value="2026-04" />
                <StaticAction label="Generate statements" tone="primary" />
              </div>
            </WorkflowPanel>
            <DataViewCard
              title="Reimbursement batches"
              subtitle="Approval and remittance proof stay coupled to the driver statement record."
              tone="platform"
              footer="2 reimbursement batches currently need operator attention."
            >
              <div style={{ display: "grid", gap: "12px" }}>
                {[
                  {
                    id: "rb_2026_04_01",
                    amount: "222,300 TWD",
                    statementId: "stmt_2026_04_77",
                    status: "pending",
                    tone: "warning" as const,
                  },
                  {
                    id: "rb_2026_04_02",
                    amount: "481,900 TWD",
                    statementId: "stmt_2026_04_81",
                    status: "paid",
                    tone: "success" as const,
                  },
                ].map((batch) => (
                  <div
                    key={batch.id}
                    style={{
                      display: "grid",
                      gap: "10px",
                      padding: "14px",
                      borderRadius: "16px",
                      border: "1px solid rgba(148,163,184,0.22)",
                      background: "#f8fafc",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "10px",
                      }}
                    >
                      <DataCellStack
                        primary={<strong>{batch.id}</strong>}
                        secondary={batch.amount}
                        tertiary={batch.statementId}
                      />
                      <StatusChip tone={batch.tone} label={batch.status} />
                    </div>
                    <StaticField
                      label="Remittance proof ID"
                      value={`remit-${batch.id.slice(-4)}`}
                    />
                  </div>
                ))}
              </div>
            </DataViewCard>
            <WorkflowPanel
              title="Open reconciliation issue"
              description="Seed the detail workflow with actor, context, and the first evidence note."
              footer="Issue creation stays lightweight; detailed resolution actions live in the drill-through view."
            >
              <div style={{ display: "grid", gap: "12px" }}>
                <StaticField label="Finance actor ID" value="finance.console" />
                <StaticField
                  label="Issue type"
                  value="forwarder_status_mismatch"
                />
                <StaticField label="Channel" value="forwarded_shadow" />
                <StaticField
                  label="Summary"
                  value="Forwarder fare mismatch >5%"
                />
                <StaticField label="External order ID" value="SRX-9921098" />
                <StaticField
                  label="Linked reconciliation job"
                  value="recon_job_2026_05_10_03"
                />
                <StaticField label="Artifact IDs" value="art_882, art_883" />
                <StaticAction label="Open issue" tone="primary" />
              </div>
            </WorkflowPanel>
          </>
        }
      />
    </PlatformPaymentsShell>
  );
}

function ReconDetailBuiltView() {
  return (
    <PlatformPaymentsShell
      currentPath="/payments"
      breadcrumb={["Platform Admin", "Payments", "rec_0091"]}
    >
      <PageHeader
        eyebrow="Resolution workflow"
        title="rec_0091 · forwarder_status_mismatch"
        subtitle="Review linked finance references, evidence, and workflow actions for this issue. · SRX-9921098"
        meta={[
          { label: "Current state", value: "reopened", tone: "danger" },
          { label: "Assignee ID", value: "張薇 Finance" },
          { label: "Channel", value: "forwarded_shadow", tone: "platform" },
        ]}
      />
      <CalloutBanner
        tone="platform"
        eyebrow="Summary"
        title="Forwarder fare mismatch >5%"
        description="Forwarded shadow context"
        meta={
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            <StatusChip tone="danger" label="reopened" />
            <StatusChip tone="neutral" label="2 evidence artifact(s)" />
          </div>
        }
        footer="Available actions change by status so assignment, resolution, and reopen stay aligned with the audit workflow."
      />
      <KpiRow minWidth="220px">
        <KpiCard
          label="Current state"
          value="reopened"
          detail="available actions stay state-aware"
          tone="danger"
        />
        <KpiCard label="Assignee ID" value="張薇 Finance" detail="rec_0091" />
        <KpiCard
          label="Channel"
          value="forwarded_shadow"
          detail="forwarder_status_mismatch"
          tone="platform"
        />
      </KpiRow>
      <WorkflowSplitLayout
        main={
          <>
            <WorkflowPanel title="Summary">
              <DetailMetadataGrid
                minColumnWidth="200px"
                items={[
                  {
                    id: "summary",
                    label: "Summary",
                    value: "Forwarder fare mismatch >5%",
                    columnSpan: 2,
                  },
                  {
                    id: "issue-type",
                    label: "Issue type",
                    value: "forwarder_status_mismatch",
                  },
                  {
                    id: "actor",
                    label: "Finance actor ID",
                    value: "finance.console",
                  },
                  {
                    id: "updated",
                    label: "Updated",
                    value: "2026-05-10 18:42",
                  },
                  {
                    id: "resolution",
                    label: "mirror_resynced",
                    value:
                      "Awaiting SRX webhook replay and audit confirmation.",
                    columnSpan: 2,
                    tone: "success",
                  },
                ]}
              />
            </WorkflowPanel>
            <WorkflowPanel title="Linked references">
              <DetailMetadataGrid
                minColumnWidth="200px"
                items={[
                  { id: "issue-id", label: "Issue ID", value: "rec_0091" },
                  {
                    id: "external",
                    label: "External order ID",
                    value: "SRX-9921098",
                  },
                  { id: "mirror", label: "Mirror order ID", value: "fwd_4476" },
                  {
                    id: "job",
                    label: "Linked reconciliation job",
                    value: "recon_job_2026_05_10_03",
                  },
                  {
                    id: "invoice",
                    label: "Tenant invoices",
                    value: "inv_2026_04_017",
                  },
                  {
                    id: "reimbursement",
                    label: "Reimbursements",
                    value: "rb_2026_04_01",
                  },
                ]}
              />
            </WorkflowPanel>
            <WorkflowPanel title="Timeline">
              <Timeline
                items={[
                  {
                    id: "open",
                    title: "Issue opened",
                    detail: "finance.console · Forwarder fare mismatch >5%",
                    eyebrow: "finance.console",
                    timestamp: "2026-05-10 14:55",
                    tone: "info",
                    supportingContent: (
                      <ArtifactChipList
                        artifactIds={["art_882", "art_883"]}
                        tone="info"
                      />
                    ),
                  },
                  {
                    id: "comment",
                    title: "張薇 Finance",
                    detail:
                      "SRX corrected fare to 7,592 TWD while local mirror remained at 7,180.",
                    eyebrow: "張薇 Finance",
                    timestamp: "2026-05-10 15:30",
                    tone: "neutral",
                  },
                  {
                    id: "reopen",
                    title: "Issue reopened",
                    detail: "1×",
                    eyebrow: "Issue reopened",
                    timestamp: "2026-05-10 18:42",
                    tone: "warning",
                  },
                ]}
              />
            </WorkflowPanel>
          </>
        }
        side={
          <>
            <WorkflowPanel title="Resolution workflow">
              <div style={{ display: "grid", gap: "12px" }}>
                <StaticField label="Finance actor ID" value="finance.console" />
                <StaticField label="Assignee ID" value="張薇 Finance" />
                <StaticAction label="Assign" />
                <StaticField
                  label="Comment"
                  value="Waiting on SRX webhook replay."
                />
                <StaticAction label="Add comment" />
                <StaticField label="Resolution code" value="mirror_resynced" />
                <StaticField
                  label="Resolution summary"
                  value="Replay webhook, confirm diff is eliminated, then close."
                />
                <StaticAction label="Resolve" tone="primary" />
              </div>
            </WorkflowPanel>
            <WorkflowPanel title="Evidence">
              <ArtifactChipList
                artifactIds={["art_882", "art_883", "art_901"]}
                tone="success"
              />
            </WorkflowPanel>
            <WorkflowPanel title="Settlement linkage">
              <DetailMetadataGrid
                minColumnWidth="180px"
                items={[
                  {
                    id: "channel",
                    label: "Channel",
                    value: "forwarded_shadow",
                  },
                  { id: "payer", label: "Payer", value: "external" },
                  { id: "invoice", label: "Invoice", value: "shadow mirror" },
                  {
                    id: "recon",
                    label: "Reconciliation",
                    value: "shadow recon",
                  },
                ]}
              />
            </WorkflowPanel>
          </>
        }
      />
    </PlatformPaymentsShell>
  );
}

function StaticField({ label, value }: { label: string; value: string }) {
  return (
    <label style={{ display: "grid", gap: "6px" }}>
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
          color: "#0f172a",
          fontSize: "13px",
        }}
      >
        {value}
      </div>
    </label>
  );
}

function StaticAction({
  label,
  tone = "secondary",
}: {
  label: string;
  tone?: "secondary" | "primary";
}) {
  const primary = tone === "primary";

  return (
    <div
      style={{
        display: "inline-flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "38px",
        padding: "0 14px",
        borderRadius: "10px",
        border: primary ? "1px solid #1d4ed8" : "1px solid #cbd5e1",
        background: primary ? "#1d4ed8" : "#ffffff",
        color: primary ? "#ffffff" : "#1e293b",
        fontSize: "13px",
        fontWeight: 700,
      }}
    >
      {label}
    </div>
  );
}

const meta: Meta = {
  title: "Platform Admin/Payments",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Platform Admin payments and reconciliation-detail parity targets for `ADM-UI-RD-008`. Each built governance surface is rendered beside the matching `PA_Payments` or `PA_ReconDetail` artboard.",
      },
    },
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const PlatformPaymentsGovernance: Story = {
  name: "PA_Payments parity",
  render: () => (
    <div
      style={{
        padding: "24px",
        background: "#e2e8f0",
        display: "grid",
        gap: "16px",
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
          Payments Governance Review
        </div>
        <div style={{ fontSize: "13px", color: "#475569", lineHeight: 1.5 }}>
          The built payments surface is rendered beside the `PA_Payments`
          artboard for queue, matrix, and side-panel comparison.
        </div>
      </div>
      <div style={compareGridStyle}>
        <ComparisonFrame
          title="Built"
          subtitle="ManagementShell composition with governance KPIs, reconciliation queue, settlement matrix, and finance side panels."
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
            <PaymentsBuiltView />
          </div>
        </ComparisonFrame>
        <ComparisonFrame
          title="Designed"
          subtitle="`docs/05-ui/drts-design-canvas/Platform Admin.html#payments`"
        >
          <iframe
            src={canvasPaymentsSrc}
            title="Platform Admin payments artboard"
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
  ),
};

export const PlatformReconciliationDetail: Story = {
  name: "PA_ReconDetail parity",
  render: () => (
    <div
      style={{
        padding: "24px",
        background: "#e2e8f0",
        display: "grid",
        gap: "16px",
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
          Reconciliation Detail Review
        </div>
        <div style={{ fontSize: "13px", color: "#475569", lineHeight: 1.5 }}>
          The built detail workflow is rendered beside the `PA_ReconDetail`
          artboard for timeline, linked-reference, and action-drawer comparison.
        </div>
      </div>
      <div style={compareGridStyle}>
        <ComparisonFrame
          title="Built"
          subtitle="Issue detail surface with timeline, evidence, settlement linkage, and workflow actions."
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
            <ReconDetailBuiltView />
          </div>
        </ComparisonFrame>
        <ComparisonFrame
          title="Designed"
          subtitle="`docs/05-ui/drts-design-canvas/Platform Admin.html#recon-detail`"
        >
          <iframe
            src={canvasReconDetailSrc}
            title="Platform Admin reconciliation detail artboard"
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
  ),
};
