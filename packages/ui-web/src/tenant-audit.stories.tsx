import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  CalloutBanner,
  DataCellStack,
  DataTable,
  DataViewCard,
  KpiCard,
  KpiRow,
  PageHeader,
  StatusChip,
  Td,
  Tr,
} from "./index";
import { StoryChrome, TenantStoryShell } from "./tenant-story-support";

function AuditBuiltView() {
  return (
    <TenantStoryShell currentPath="/audit" breadcrumb="Audit">
      <PageHeader
        eyebrow="Governance ledger"
        title="Audit"
        subtitle="Append-only tenant evidence rows, request correlation, and actor scope stay grounded in `/api/tenant/audit`."
        meta={[
          { label: "Visible rows", value: "6", tone: "tenant" },
          { label: "Modules", value: "4" },
          { label: "Request-linked", value: "6", tone: "success" },
        ]}
      />
      <KpiRow minWidth="170px">
        <KpiCard
          label="Visible rows"
          value="6"
          detail="Current tenant audit snapshot"
          tone="tenant"
        />
        <KpiCard
          label="Modules"
          value="4"
          detail="Distinct backend modules represented"
          tone="info"
        />
        <KpiCard
          label="Actor types"
          value="3"
          detail="tenant_admin, ops_user, system"
          tone="tenant"
        />
        <KpiCard
          label="Request IDs"
          value="6"
          detail="Every visible row retains trace correlation"
          tone="success"
        />
      </KpiRow>
      <CalloutBanner
        title="Evidence governance remains platform-owned"
        description="The built route surfaces request, actor, and module context, but legal hold, deletion exceptions, and retention policy stay off this tenant-admin surface."
        tone="warning"
        density="compact"
      />
      <DataViewCard
        title="Recent audit rows"
        subtitle="Flat ledger shape aligned to the `TN_Audit` artboard."
        tone="tenant"
        density="compact"
        summary="Timestamp-first table with actor, module, action, resource, and request correlation."
        footer="Export remains an evidence workflow concern; this built view focuses on inspection fidelity."
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          <StatusChip tone="tenant" label="tenant-partner · 3" />
          <StatusChip tone="info" label="billing · 1" />
          <StatusChip tone="info" label="reports · 1" />
          <StatusChip tone="neutral" label="auth · 1" />
        </div>
        <DataTable
          density="compact"
          tone="tenant"
          columns={[
            { label: "At", width: "155px" },
            { label: "Actor", width: "185px" },
            { label: "Type", width: "120px" },
            { label: "Module", width: "140px" },
            { label: "Action", width: "180px" },
            { label: "Resource", width: "160px" },
            { label: "Req", width: "150px" },
          ]}
        >
          <Tr>
            <Td density="compact" mono>
              2026-05-08 09:41
            </Td>
            <Td density="compact">
              <DataCellStack
                primary={<strong>Acme Tenant Admin</strong>}
                secondary="tenant-user-demo-001"
              />
            </Td>
            <Td density="compact">
              <StatusChip tone="tenant" label="tenant_admin" />
            </Td>
            <Td density="compact" mono>
              tenant-partner
            </Td>
            <Td density="compact" mono>
              update_notification_preferences
            </Td>
            <Td density="compact">
              <DataCellStack
                primary="tenant_settings"
                secondary="tenant-demo-001"
              />
            </Td>
            <Td density="compact" mono>
              req_tn_a_001
            </Td>
          </Tr>
          <Tr>
            <Td density="compact" mono>
              2026-05-08 08:22
            </Td>
            <Td density="compact">
              <DataCellStack
                primary={<strong>Ops Supervisor</strong>}
                secondary="ops-user-demo-002"
              />
            </Td>
            <Td density="compact">
              <StatusChip tone="info" label="ops_user" />
            </Td>
            <Td density="compact" mono>
              reports
            </Td>
            <Td density="compact" mono>
              create_report_job
            </Td>
            <Td density="compact">
              <DataCellStack primary="report_job" secondary="report-job-001" />
            </Td>
            <Td density="compact" mono>
              req_tn_a_002
            </Td>
          </Tr>
          <Tr>
            <Td density="compact" mono>
              2026-05-07 16:10
            </Td>
            <Td density="compact">
              <DataCellStack
                primary={<strong>System</strong>}
                secondary="Seed bootstrap"
              />
            </Td>
            <Td density="compact">
              <StatusChip tone="neutral" label="system" />
            </Td>
            <Td density="compact" mono>
              billing
            </Td>
            <Td density="compact" mono>
              issue_invoice
            </Td>
            <Td density="compact">
              <DataCellStack primary="invoice" secondary="inv_2026_05_001" />
            </Td>
            <Td density="compact" mono>
              req_tn_a_003
            </Td>
          </Tr>
        </DataTable>
      </DataViewCard>
    </TenantStoryShell>
  );
}

const meta = {
  title: "Tenant Console/Audit",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Side-by-side parity story for the `TN_Audit` artboard. The Built panel mirrors the tenant audit route with request-first evidence framing, while the Canvas panel embeds `Tenant Console.html#audit` for review.",
      },
    },
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Audit: Story = {
  render: () => (
    <StoryChrome
      heading="Tenant Audit Parity Review"
      summary="Built implementation and the `TN_Audit` artboard are rendered together for manual parity review."
      built={<AuditBuiltView />}
      anchor="audit"
    />
  ),
};
