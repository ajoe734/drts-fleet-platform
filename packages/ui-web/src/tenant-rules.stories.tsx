import type { Meta, StoryObj } from "@storybook/nextjs-vite";
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
  WorkflowSplitLayout,
} from "./index";
import { StoryChrome, TenantStoryShell } from "./tenant-story-support";

const actionStyle = (primary = false) => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "34px",
  padding: "0 12px",
  borderRadius: "999px",
  border: primary ? "1px solid #0f766e" : "1px solid #cbd5e1",
  background: primary ? "#0f766e" : "#ffffff",
  color: primary ? "#ffffff" : "#0f172a",
  fontSize: "12.5px",
  fontWeight: 700,
});

const ruleRows = [
  {
    priority: 10,
    rule: "High-value finance approval",
    summary:
      "booking.amount_minor gte 100000 AND cost_center.code eq CC-FIN",
    action: "require_approval",
    approvalMode: "any_of",
    approvers: "tenant_finance_admin",
    state: "active",
    updatedAt: "2026-05-14 10:12",
  },
  {
    priority: 20,
    rule: "Overnight dual-sign",
    summary: "booking.direction eq pickup AND booking.flight_no_present eq true",
    action: "require_approval",
    approvalMode: "ordered_chain",
    approvers: "cost_center_owner + tenant_admin",
    state: "active",
    updatedAt: "2026-05-14 09:40",
  },
  {
    priority: 30,
    rule: "Quota pressure heads-up",
    summary: "tenant.monthly_quota_remaining_percent lte 10",
    action: "warn",
    approvalMode: "n/a",
    approvers: "No approver chain",
    state: "paused",
    updatedAt: "2026-05-13 18:05",
  },
] as const;

const approvalRows = [
  {
    bookingId: "booking-4419",
    status: "pending",
    mode: "any_of",
    rules: "rule_finance_high_value",
    due: "2026-05-14 18:00",
  },
  {
    bookingId: "booking-4421",
    status: "pending",
    mode: "ordered_chain",
    rules: "rule_overnight_dual_sign",
    due: "2026-05-14 21:30",
  },
] as const;

const ledgerRows = [
  {
    bookingId: "booking-4419",
    dimension: "amount_minor",
    entryType: "reserve",
    amount: "180000",
    createdAt: "2026-05-14 10:13",
  },
  {
    bookingId: "booking-4421",
    dimension: "booking_count",
    entryType: "reserve",
    amount: "1",
    createdAt: "2026-05-14 09:43",
  },
] as const;

function RulesBuiltView() {
  return (
    <TenantStoryShell currentPath="/rules" breadcrumb="Rules">
      <PageHeader
        eyebrow="Governance"
        title="Rules"
        subtitle="Approval rules, quota posture, pending approvals, and dry-run semantics stay on one tenant governance surface."
        meta={[
          { label: "Rules", value: "3", tone: "tenant" },
          { label: "Active", value: "2", tone: "success" },
          { label: "Pending approvals", value: "2", tone: "warning" },
        ]}
        actions={
          <>
            <span style={actionStyle()}>Edit rule</span>
            <span style={actionStyle(true)}>Dry-run</span>
          </>
        }
      />

      <KpiRow minWidth="180px">
        <KpiCard
          label="Rules"
          value="3"
          detail="Priority-ordered tenant governance rules"
          tone="tenant"
        />
        <KpiCard
          label="Remaining quota"
          value="12%"
          detail="Tenant-wide monthly remaining percentage"
          tone="success"
        />
        <KpiCard
          label="Approval backlog"
          value="2"
          detail="Requests still waiting for decision"
          tone="warning"
        />
        <KpiCard
          label="Ledger rows"
          value="2"
          detail="Recent quota reservation evidence"
          tone="info"
        />
      </KpiRow>

      <CalloutBanner
        title="All governance state is backend-owned"
        description="The built route keeps rule order, quota policy, approval backlog, and dry-run semantics aligned to the published tenant-governance contract."
        tone="tenant"
        density="compact"
      />

      <WorkflowSplitLayout
        main={
          <DataViewCard
            title="Rule register"
            subtitle="Rule priority, condition summary, action, approver path, and state stay visible in one table."
            tone="tenant"
            density="compact"
            summary="The artboard's simple table is expanded just enough to expose the approval-mode and update signal that now exist in contract."
          >
            <DataTable
              density="compact"
              tone="tenant"
              columns={[
                { label: "PRI", width: "70px" },
                { label: "Rule", width: "220px" },
                { label: "Conditions", width: "320px" },
                { label: "Action", width: "140px" },
                { label: "Approvers", width: "220px" },
                { label: "State", width: "100px" },
                { label: "Updated", width: "130px" },
              ]}
            >
              {ruleRows.map((row) => (
                <Tr key={`${row.priority}-${row.rule}`}>
                  <Td density="compact" mono>
                    {row.priority}
                  </Td>
                  <Td density="compact">
                    <DataCellStack
                      primary={<strong>{row.rule}</strong>}
                      secondary={row.updatedAt}
                    />
                  </Td>
                  <Td density="compact">{row.summary}</Td>
                  <Td density="compact">
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                      <StatusChip tone="tenant" label={row.action} />
                      <StatusChip tone="info" label={row.approvalMode} />
                    </div>
                  </Td>
                  <Td density="compact">{row.approvers}</Td>
                  <Td density="compact">
                    <StatusChip
                      tone={row.state === "active" ? "success" : "neutral"}
                      label={row.state}
                    />
                  </Td>
                  <Td density="compact" mono>
                    {row.updatedAt}
                  </Td>
                </Tr>
              ))}
            </DataTable>

            <DataViewCard
              title="Dry-run snapshot"
              subtitle="A representative booking sample shows matched rules, quota impacts, and approval plan output."
              tone="tenant"
              density="compact"
            >
              <DetailMetadataGrid
                dense
                minColumnWidth="170px"
                items={[
                  {
                    id: "decision",
                    label: "Decision",
                    value: <StatusChip tone="tenant" label="require_approval" />,
                  },
                  { id: "matched", label: "Matched rules", value: "2" },
                  {
                    id: "quota",
                    label: "Quota trigger",
                    value: <StatusChip tone="warning" label="warn" />,
                  },
                  { id: "mode", label: "Approval mode", value: "any_of" },
                  {
                    id: "approvers",
                    label: "Approvers",
                    value: "tenant_finance_admin + cost_center_owner",
                    columnSpan: 2,
                  },
                ]}
              />
            </DataViewCard>
          </DataViewCard>
        }
        side={
          <>
            <DataViewCard
              title="Quota posture"
              subtitle="Tenant quota limit, remaining headroom, and enforcement mode stay adjacent to rule editing."
              tone="tenant"
              density="compact"
            >
              <DetailMetadataGrid
                dense
                minColumnWidth="170px"
                items={[
                  { id: "period", label: "Period", value: "monthly:2026-05" },
                  { id: "count", label: "Booking limit", value: "120" },
                  { id: "amount", label: "Amount limit", value: "2,400,000" },
                  {
                    id: "mode",
                    label: "Enforcement",
                    value: "require_approval",
                  },
                  { id: "remain", label: "Remaining %", value: "12%" },
                  { id: "refreshed", label: "Refreshed", value: "2026-05-14 10:15" },
                ]}
              />
            </DataViewCard>

            <DataViewCard
              title="Pending approval queue"
              subtitle="Live backlog stays visible so policy changes are judged against operational reality."
              tone="tenant"
              density="compact"
            >
              <DataTable
                density="compact"
                tone="tenant"
                columns={[
                  { label: "Booking", width: "120px" },
                  { label: "State", width: "110px" },
                  { label: "Mode", width: "130px" },
                  { label: "Due", width: "130px" },
                ]}
              >
                {approvalRows.map((row) => (
                  <Tr key={row.bookingId}>
                    <Td density="compact" mono>
                      {row.bookingId}
                    </Td>
                    <Td density="compact">
                      <StatusChip tone="warning" label={row.status} />
                    </Td>
                    <Td density="compact">{row.mode}</Td>
                    <Td density="compact" mono>
                      {row.due}
                    </Td>
                  </Tr>
                ))}
              </DataTable>
            </DataViewCard>

            <DataViewCard
              title="Recent quota ledger"
              subtitle="Reserve evidence remains inspectable without leaving the rule route."
              tone="tenant"
              density="compact"
            >
              <DataTable
                density="compact"
                tone="tenant"
                columns={[
                  { label: "Booking", width: "110px" },
                  { label: "Dim", width: "90px" },
                  { label: "Type", width: "90px" },
                  { label: "Amount", width: "90px" },
                  { label: "Created", width: "120px" },
                ]}
              >
                {ledgerRows.map((row) => (
                  <Tr key={`${row.bookingId}-${row.createdAt}`}>
                    <Td density="compact" mono>
                      {row.bookingId}
                    </Td>
                    <Td density="compact">{row.dimension}</Td>
                    <Td density="compact">{row.entryType}</Td>
                    <Td density="compact" mono>
                      {row.amount}
                    </Td>
                    <Td density="compact" mono>
                      {row.createdAt}
                    </Td>
                  </Tr>
                ))}
              </DataTable>
            </DataViewCard>
          </>
        }
      />
    </TenantStoryShell>
  );
}

const meta = {
  title: "Tenant Console/Rules",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Side-by-side parity story for the `TN_Rules` artboard. The Built panel mirrors the approval-rule register plus quota posture tenant governance screen, while the Canvas panel embeds `Tenant Console.html#rules` for review.",
      },
    },
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Rules: Story = {
  render: () => (
    <StoryChrome
      heading="Tenant Rules Parity Review"
      summary="Built implementation and the `TN_Rules` artboard are rendered together for manual side-by-side review."
      built={<RulesBuiltView />}
      anchor="rules"
    />
  ),
};
