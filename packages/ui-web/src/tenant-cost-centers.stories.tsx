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

function CostCentersBuiltView() {
  return (
    <TenantStoryShell currentPath="/cost-centers" breadcrumb="Cost Centers">
      <PageHeader
        eyebrow="Cost centers"
        title="Cost Centers"
        subtitle="Directory, quota posture, and coverage follow-up stay grounded in `/api/tenant/cost-centers` plus the published quota and rule slices."
        meta={[
          { label: "Cost centers", value: "3" },
          { label: "Direct quota overrides", value: "2", tone: "tenant" },
          { label: "Unresolved legacy values", value: "1", tone: "warning" },
        ]}
      />
      <KpiRow minWidth="170px">
        <KpiCard
          label="Cost centers"
          value="3"
          detail="Directory rows visible to the tenant"
          tone="tenant"
        />
        <KpiCard
          label="Active"
          value="3"
          detail="All published rows remain available"
          tone="success"
        />
        <KpiCard
          label="Owners assigned"
          value="3"
          detail="Rule resolution can rely on owner metadata"
          tone="info"
        />
        <KpiCard
          label="Coverage unresolved"
          value="1"
          detail="One legacy booking value still needs mapping"
          tone="warning"
        />
      </KpiRow>
      <CalloutBanner
        title="Approval stays a cross-slice summary"
        description="The built route shows quota and directory truth directly, while the approval column only summarizes active rules that explicitly target a cost center or rely on `cost_center_owner`."
        tone="warning"
        density="compact"
      />
      <DataViewCard
        title="Tenant cost-center roster"
        subtitle="Read-only parity surface built from directory, quota, and rule contracts."
        tone="tenant"
        density="compact"
        summary="3 rows · 2 direct quota overrides · 1 unresolved legacy sample."
        footer="Inline create, edit, and disable remain outside this route even though the command contract is published."
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          <StatusChip tone="tenant" label="All · 3" />
          <StatusChip tone="neutral" label="Direct quota · 2" />
          <StatusChip tone="warning" label="Coverage gaps · 1" />
        </div>
        <DataTable
          density="compact"
          tone="tenant"
          columns={[
            { label: "Code", width: "132px" },
            { label: "Name", width: "190px" },
            { label: "Owner", width: "180px" },
            { label: "Quota", width: "190px" },
            { label: "Used", width: "210px" },
            { label: "Approval" },
          ]}
        >
          <Tr>
            <Td density="compact" mono>
              CC-FIN-04
            </Td>
            <Td density="compact">
              <DataCellStack
                primary={<strong>財務處</strong>}
                secondary="財務與季度稽核差旅"
              />
            </Td>
            <Td density="compact">
              <DataCellStack
                primary="財務管理員"
                secondary="tenant-user-demo-003"
              />
            </Td>
            <Td density="compact">
              <DataCellStack
                primary="300 rides · TWD 240,000"
                secondary="Cost-center override · Needs approval"
              />
            </Td>
            <Td density="compact">
              <DataCellStack
                primary="218 rides · TWD 176,000"
                secondary="82 rides left · 27% remaining"
              />
            </Td>
            <Td density="compact">
              <DataCellStack
                primary="1 code-targeted rule"
                secondary="Airport / overnight escalation"
              />
            </Td>
          </Tr>
          <Tr>
            <Td density="compact" mono>
              CC-OPS-02
            </Td>
            <Td density="compact">
              <DataCellStack
                primary={<strong>營運處</strong>}
                secondary="營運調度與站點巡檢"
              />
            </Td>
            <Td density="compact">
              <DataCellStack
                primary="營運管理員"
                secondary="tenant-user-demo-002"
              />
            </Td>
            <Td density="compact">
              <DataCellStack
                primary="500 rides"
                secondary="Inherited from tenant · Warn only"
              />
            </Td>
            <Td density="compact">
              <DataCellStack
                primary="380 rides · TWD 204,000"
                secondary="120 rides left · 24% remaining"
              />
            </Td>
            <Td density="compact">
              <DataCellStack
                primary="Shared owner-based rules"
                secondary="Owner can be resolved from the directory record"
              />
            </Td>
          </Tr>
          <Tr>
            <Td density="compact" mono>
              CC-EXEC-01
            </Td>
            <Td density="compact">
              <DataCellStack
                primary={<strong>高階主管</strong>}
                secondary="總經理室與高階接待"
              />
            </Td>
            <Td density="compact">
              <DataCellStack
                primary="CEO Office"
                secondary="No owner user id"
              />
            </Td>
            <Td density="compact">
              <DataCellStack
                primary="No hard limit"
                secondary="Cost-center override · Warn only"
              />
            </Td>
            <Td density="compact">
              <DataCellStack
                primary="142 rides · TWD 98,000"
                secondary="No % limit remaining"
              />
            </Td>
            <Td density="compact">
              <DataCellStack
                primary="Shared owner-based rules"
                secondary="Owner-driven rules exist, but no owner user is assigned"
              />
            </Td>
          </Tr>
        </DataTable>
      </DataViewCard>
    </TenantStoryShell>
  );
}

const meta = {
  title: "Tenant Console/Cost Centers",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Side-by-side parity story for the `TN_CostCenter` artboard. The Built panel captures the contract-safe route: tenant cost-center directory, quota posture, and cross-slice approval summaries without inventing an unpublished editor.",
      },
    },
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const CostCenters: Story = {
  render: () => (
    <StoryChrome
      heading="Tenant Cost Centers Parity Review"
      summary="Built implementation and the `TN_CostCenter` artboard are rendered together for side-by-side review."
      built={<CostCentersBuiltView />}
      anchor="costcenter"
    />
  ),
};
