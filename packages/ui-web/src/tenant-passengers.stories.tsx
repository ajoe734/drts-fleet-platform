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

function PassengersBuiltView() {
  return (
    <TenantStoryShell currentPath="/passengers" breadcrumb="Passengers">
      <PageHeader
        eyebrow="Passenger directory"
        title="Passengers"
        subtitle="Identity, department, contact, role tags, and active state stay grounded in `/api/tenant/passengers`."
        meta={[
          { label: "Passengers", value: "5" },
          { label: "Employees", value: "3", tone: "tenant" },
          { label: "Flagged", value: "2", tone: "warning" },
          { label: "Disabled", value: "1" },
        ]}
      />
      <KpiRow minWidth="170px">
        <KpiCard
          label="Passengers"
          value="5"
          detail="Visible to the tenant scope"
          tone="tenant"
        />
        <KpiCard
          label="Active"
          value="4"
          detail="Available for booking selection"
          tone="success"
        />
        <KpiCard
          label="Employees"
          value="3"
          detail="Rows carrying the employee role"
          tone="tenant"
        />
        <KpiCard
          label="Quality flagged"
          value="2"
          detail="Contact or employee-number cleanup needed"
          tone="warning"
        />
      </KpiRow>
      <CalloutBanner
        title="Consent version and CSV import stay out of scope"
        description="The artboard references consent/version, import actions, and a visitor segment, but the shipped route stays on published passenger fields plus `UpsertTenantPassengerCommand`."
        tone="warning"
        density="compact"
      />
      <DataViewCard
        title="Tenant passenger roster"
        subtitle="Directory parity with contract-safe omissions called out explicitly."
        tone="tenant"
        density="compact"
        summary="All / Employee / Flagged / Disabled remain view framing; edits stay outside this read-only surface."
        footer="The built route surfaces role and quality chips instead of reintroducing sunset-only consent/import logic."
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          <StatusChip tone="tenant" label="All · 5" />
          <StatusChip tone="neutral" label="Employee · 3" />
          <StatusChip tone="warning" label="Flagged · 2" />
          <StatusChip tone="neutral" label="Disabled · 1" />
        </div>
        <DataTable
          density="compact"
          tone="tenant"
          columns={[
            { label: "Name", width: "180px" },
            { label: "Emp ID", width: "100px" },
            { label: "Department", width: "150px" },
            { label: "Mobile", width: "130px" },
            { label: "Email", width: "220px" },
            { label: "Roles", width: "210px" },
            { label: "Quality", width: "180px" },
            { label: "State", width: "120px" },
          ]}
        >
          <Tr>
            <Td density="compact">
              <DataCellStack
                primary={<strong>王小美</strong>}
                secondary="passenger-demo-001"
              />
            </Td>
            <Td density="compact" mono>
              E1001
            </Td>
            <Td density="compact">總務部</Td>
            <Td density="compact" mono>
              0911-000-001
            </Td>
            <Td density="compact">xiaomei.wang@acme.example</Td>
            <Td density="compact">
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                <StatusChip tone="tenant" label="Passenger" />
                <StatusChip tone="info" label="Employee" />
              </div>
            </Td>
            <Td density="compact" muted>
              Clean
            </Td>
            <Td density="compact">
              <StatusChip tone="success" label="active" />
            </Td>
          </Tr>
          <Tr>
            <Td density="compact">
              <DataCellStack
                primary={<strong>林佳恩</strong>}
                secondary="passenger-demo-014"
              />
            </Td>
            <Td density="compact" mono>
              V3001
            </Td>
            <Td density="compact">訪客管理</Td>
            <Td density="compact" mono>
              0922-010-014
            </Td>
            <Td density="compact">guest.liaison@acme.example</Td>
            <Td density="compact">
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                <StatusChip tone="tenant" label="Passenger" />
              </div>
            </Td>
            <Td density="compact">
              <StatusChip tone="warning" label="Missing employee no" />
            </Td>
            <Td density="compact">
              <StatusChip tone="success" label="active" />
            </Td>
          </Tr>
          <Tr>
            <Td density="compact">
              <DataCellStack
                primary={<strong>陳奕廷</strong>}
                secondary="passenger-demo-021"
              />
            </Td>
            <Td density="compact" mono>
              E2008
            </Td>
            <Td density="compact">財務部</Td>
            <Td density="compact" muted>
              —
            </Td>
            <Td density="compact" muted>
              —
            </Td>
            <Td density="compact">
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                <StatusChip tone="tenant" label="Passenger" />
                <StatusChip tone="info" label="Employee" />
              </div>
            </Td>
            <Td density="compact">
              <StatusChip tone="warning" label="Missing contact" />
            </Td>
            <Td density="compact">
              <StatusChip tone="neutral" label="disabled" />
            </Td>
          </Tr>
        </DataTable>
      </DataViewCard>
    </TenantStoryShell>
  );
}

const meta = {
  title: "Tenant Console/Passengers",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Side-by-side parity story for the `TN_Passengers` artboard. The Built panel mirrors the passenger-directory route that ships in `apps/tenant-console-web/app/passengers/page.tsx`, while explicitly omitting unpublished consent-version and CSV-import behavior from the sunset portal.",
      },
    },
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Passengers: Story = {
  render: () => (
    <StoryChrome
      heading="Tenant Passengers Parity Review"
      summary="Built implementation and the `TN_Passengers` artboard are rendered together for side-by-side review."
      built={<PassengersBuiltView />}
      anchor="passengers"
    />
  ),
};
