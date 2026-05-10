import type { Meta, StoryObj } from "@storybook/nextjs-vite";
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
  Td,
  Tr,
} from "./index";
import { StoryChrome, TenantStoryShell } from "./tenant-story-support";

const splitCardGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: "16px",
};

function ReportsBuiltView() {
  return (
    <TenantStoryShell currentPath="/reports" breadcrumb="Reports">
      <PageHeader
        eyebrow="Reporting"
        title="Reports"
        subtitle="Tenant report jobs, export artifacts, and background execution now stay inside the existing `/api/tenant/reports/*` contract."
        meta={[
          { label: "Visible jobs", value: "4", tone: "tenant" },
          { label: "Artifacts ready", value: "2", tone: "success" },
          { label: "Queued / running", value: "2", tone: "info" },
        ]}
      />
      <KpiRow minWidth="170px">
        <KpiCard
          label="Jobs"
          value="4"
          detail="Tenant-scoped history rows"
          tone="tenant"
        />
        <KpiCard
          label="Queued / running"
          value="2"
          detail="Background jobs still executing"
          tone="info"
        />
        <KpiCard
          label="Artifacts ready"
          value="2"
          detail="Short-lived downloads issued"
          tone="success"
        />
        <KpiCard
          label="Failures"
          value="1"
          detail="Needs regeneration"
          tone="warning"
        />
      </KpiRow>
      <div style={splitCardGridStyle}>
        <DataViewCard
          title="Create report job"
          subtitle="Queue a contract-backed tenant export."
          tone="tenant"
          density="compact"
          summary="The built route narrows the artboard's broad reporting idea into existing report job types instead of inventing a tenant-only scheduler."
          footer="Submission captures job type, output format, and optional `from` / `to` / `cost_center` filters that round-trip through the report job record."
        >
          <DetailList
            items={[
              {
                id: "monthly",
                label: "Monthly usage",
                value: "monthly_trip_report",
                hint: "Tenant monthly trip volume snapshot.",
              },
              {
                id: "revenue",
                label: "Cost center split",
                value: "revenue_summary",
                hint: "Finance-friendly export framing.",
              },
              {
                id: "sla",
                label: "SLA summary",
                value: "trip_summary",
                hint: "Trip-level service and fulfillment summary.",
              },
              {
                id: "period",
                label: "Period",
                value: "from / to",
                hint: "Optional date-window filters round-trip through the existing report-job contract keys.",
              },
              {
                id: "cost-center",
                label: "Cost center",
                value: "cost_center",
                hint: "Finance-driven slice stays contract-backed instead of becoming a UI-local-only field.",
              },
            ]}
          />
          <CalloutBanner
            title="Contract boundary preserved"
            description="Period and retention semantics remain backend-owned; the UI only surfaces artifact expiry once the report service publishes it."
            tone="tenant"
            density="compact"
          />
        </DataViewCard>
        <DataViewCard
          title="Execution notes"
          subtitle="How the route maps to the existing reporting pipeline."
          tone="tenant"
          density="compact"
          summary="The tenant console now exposes report jobs as a real governance lane."
          footer="This replaces the artboard's generic create-work CTA with explicit contract-backed job creation."
        >
          <DetailList
            items={[
              {
                id: "artifact",
                label: "Artifact TTL",
                value: "Published by report artifact",
              },
              {
                id: "scope",
                label: "Scope",
                value: "x-tenant-id enforced",
              },
              {
                id: "history",
                label: "History",
                value: "Append-only job register",
              },
            ]}
          />
        </DataViewCard>
      </div>
      <DataViewCard
        title="Report jobs"
        subtitle="Tenant-scoped export history with artifact readiness."
        tone="tenant"
        density="compact"
        summary="4 report jobs currently visible."
        footer="The built view uses artifact readiness and timestamps in place of unpublished local expiry logic."
      >
        <DataTable
          density="compact"
          tone="tenant"
          columns={[
            { label: "Job", width: "170px" },
            { label: "Kind", width: "180px" },
            { label: "Filters", width: "240px" },
            { label: "Format", width: "90px" },
            { label: "Status", width: "110px" },
            { label: "Artifact", width: "240px" },
            { label: "Created", width: "150px" },
            { label: "Updated", width: "150px" },
          ]}
        >
          <Tr>
            <Td density="compact">
              <DataCellStack
                primary={<strong>JOB-7A11</strong>}
                secondary="Tenant-scoped reporting job"
              />
            </Td>
            <Td density="compact">
              <DataCellStack
                primary="Monthly usage"
                secondary="monthly_trip_report"
              />
            </Td>
            <Td density="compact">
              <DataCellStack
                primary="From: 2026-05-01T00:00:00Z"
                secondary="To: 2026-05-31T23:59:59Z"
              />
            </Td>
            <Td density="compact">XLSX</Td>
            <Td density="compact">
              <StatusChip tone="success" label="completed" />
            </Td>
            <Td density="compact">
              <DataCellStack
                primary={
                  <a
                    href="https://downloads.example.test/reports/JOB-7A11.xlsx?signature=abc123"
                    rel="noreferrer noopener"
                    target="_blank"
                  >
                    Download artifact
                  </a>
                }
                secondary="Ready until 2026-05-10 18:30"
              />
            </Td>
            <Td density="compact" mono>
              2026-05-10 17:54
            </Td>
            <Td density="compact" mono>
              2026-05-10 18:00
            </Td>
          </Tr>
          <Tr>
            <Td density="compact">
              <DataCellStack
                primary={<strong>JOB-7A08</strong>}
                secondary="Tenant-scoped reporting job"
              />
            </Td>
            <Td density="compact">
              <DataCellStack
                primary="Cost center split"
                secondary="revenue_summary"
              />
            </Td>
            <Td density="compact">
              <DataCellStack
                primary="Cost center: FIN-APAC"
                secondary="cost_center filter"
              />
            </Td>
            <Td density="compact">CSV</Td>
            <Td density="compact">
              <StatusChip tone="success" label="completed" />
            </Td>
            <Td density="compact">
              <DataCellStack
                primary={
                  <a
                    href="https://downloads.example.test/reports/JOB-7A08.csv?signature=def456"
                    rel="noreferrer noopener"
                    target="_blank"
                  >
                    Download artifact
                  </a>
                }
                secondary="Ready until 2026-05-10 17:10"
              />
            </Td>
            <Td density="compact" mono>
              2026-05-10 16:42
            </Td>
            <Td density="compact" mono>
              2026-05-10 16:48
            </Td>
          </Tr>
          <Tr>
            <Td density="compact">
              <DataCellStack
                primary={<strong>JOB-7A04</strong>}
                secondary="Tenant-scoped reporting job"
              />
            </Td>
            <Td density="compact">
              <DataCellStack primary="SLA summary" secondary="trip_summary" />
            </Td>
            <Td density="compact">
              <DataCellStack
                primary="Period start: 2026-05-10"
                secondary="Period end: 2026-05-10, Tenant: tenant-demo-001"
              />
            </Td>
            <Td density="compact">PDF</Td>
            <Td density="compact">
              <StatusChip tone="info" label="running" />
            </Td>
            <Td density="compact" muted>
              Pending
            </Td>
            <Td density="compact" mono>
              2026-05-10 16:05
            </Td>
            <Td density="compact" mono>
              2026-05-10 16:06
            </Td>
          </Tr>
          <Tr>
            <Td density="compact">
              <DataCellStack
                primary={<strong>JOB-79FE</strong>}
                secondary="Tenant-scoped reporting job"
              />
            </Td>
            <Td density="compact">
              <DataCellStack
                primary="Monthly usage"
                secondary="monthly_trip_report"
              />
            </Td>
            <Td density="compact">
              <DataCellStack
                primary="No explicit filters"
                secondary="Backend defaults determined export scope"
              />
            </Td>
            <Td density="compact">XLSX</Td>
            <Td density="compact">
              <StatusChip tone="warning" label="failed" />
            </Td>
            <Td density="compact" muted>
              No artifact generated
            </Td>
            <Td density="compact" mono>
              2026-05-10 15:31
            </Td>
            <Td density="compact" mono>
              2026-05-10 15:33
            </Td>
          </Tr>
        </DataTable>
      </DataViewCard>
    </TenantStoryShell>
  );
}

const meta = {
  title: "Tenant Console/Reports",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Built parity target for the tenant reporting route. Review this story beside `TN_Reports` during TEN-UI-RD-016.",
      },
    },
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Reports: Story = {
  render: () => (
    <StoryChrome
      heading="Tenant Reports Parity Review"
      summary="Built implementation and the `TN_Reports` artboard are rendered together for manual side-by-side review."
      built={<ReportsBuiltView />}
      anchor="reports"
    />
  ),
};
