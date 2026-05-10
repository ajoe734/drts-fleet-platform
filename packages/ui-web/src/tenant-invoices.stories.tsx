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
} from "./index";
import { StoryChrome, TenantStoryShell } from "./tenant-story-support";

const splitCardGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: "16px",
};

function InvoicesBuiltView() {
  return (
    <TenantStoryShell currentPath="/invoices" breadcrumb="Invoices">
      <PageHeader
        eyebrow="Billing & invoices"
        title="Invoices"
        subtitle="Billing profile, monthly invoice rows, and short-lived artifact downloads stay grounded in `/api/tenant/billing/profile` and `/api/tenant/invoices`."
        meta={[
          { label: "Focused period", value: "2026-04", tone: "tenant" },
          { label: "Visible invoices", value: "3" },
          { label: "Signed artifacts", value: "2", tone: "success" },
        ]}
      />
      <KpiRow minWidth="170px">
        <KpiCard
          label="Current period"
          value="NT$ 1,224,800"
          detail="Apr 2026 snapshot"
          tone="tenant"
        />
        <KpiCard
          label="Visible invoices"
          value="3"
          detail="Published rows in scope"
          tone="info"
        />
        <KpiCard
          label="Invoice lines"
          value="9"
          detail="Order-linked line items"
          tone="tenant"
        />
        <KpiCard
          label="Artifact ready"
          value="2"
          detail="Signed URLs currently published"
          tone="success"
        />
      </KpiRow>
      <div style={splitCardGridStyle}>
        <DataViewCard
          title="Billing profile"
          subtitle="Published billing recipient for the tenant."
          tone="tenant"
          density="compact"
          summary="Invoice title, contact, tax ID, and billing email come directly from the billing profile contract."
          footer="Profile edits remain command-driven through the tenant billing profile endpoint."
        >
          <DetailMetadataGrid
            dense
            minColumnWidth="180px"
            items={[
              {
                id: "invoice-title",
                label: "Invoice title",
                value: "CTBC World Elite",
              },
              {
                id: "contact",
                label: "Contact",
                value: "林怡安",
              },
              {
                id: "email",
                label: "Billing email",
                value: "billing@ctbc-world-elite.example.com",
              },
              {
                id: "tax-id",
                label: "Tax ID",
                value: "12345678",
              },
              {
                id: "address",
                label: "Address",
                value: "台北市信義區松仁路 100 號",
                columnSpan: 2,
              },
              {
                id: "updated",
                label: "Updated",
                value: "2026-05-08 11:03",
              },
            ]}
          />
        </DataViewCard>
        <DataViewCard
          title="Period focus"
          subtitle="Local period framing over the published invoice list."
          tone="tenant"
          density="compact"
          summary="The shipped route keeps period selection client-side and treats signed artifacts as short-lived downloads."
          footer="The built view replaces the artboard's unpublished due-date column with contract-safe source and artifact cues."
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            <StatusChip tone="tenant" label="2026-04" />
            <StatusChip tone="neutral" label="2026-03" />
            <StatusChip tone="neutral" label="2026-02" />
          </div>
          <CalloutBanner
            title="External settlement authority stays visible but unchanged"
            description="1 line remains under external-platform settlement ownership; reconciliation still lives on ops and finance lanes."
            tone="warning"
            density="compact"
          />
        </DataViewCard>
      </div>
      <DataViewCard
        title="Invoice register"
        subtitle="Published invoice rows with artifact-readiness and line-count cues."
        tone="tenant"
        density="compact"
        summary="3 invoices visible for review."
        footer="Signed artifact URLs are surfaced as availability only; expiry metadata is not invented in the UI."
      >
        <DataTable
          density="compact"
          tone="tenant"
          columns={[
            { label: "Invoice", width: "190px" },
            { label: "Period", width: "150px" },
            { label: "Amount", width: "140px", align: "right" },
            { label: "Status", width: "110px" },
            { label: "Lines", width: "90px" },
            { label: "Source", width: "220px" },
            { label: "Artifact", width: "130px" },
            { label: "Updated", width: "140px" },
          ]}
        >
          <Tr>
            <Td density="compact">
              <DataCellStack
                primary={<strong>inv_2026_05_001</strong>}
                secondary="Pricing v2026.04.01"
              />
            </Td>
            <Td density="compact">
              <DataCellStack
                primary="Apr 2026"
                secondary="2026-04-01 to 2026-04-30"
              />
            </Td>
            <Td density="compact" align="right">
              NT$ 1,224,800
            </Td>
            <Td density="compact">
              <StatusChip tone="info" label="issued" />
            </Td>
            <Td density="compact">4</Td>
            <Td density="compact">
              <DataCellStack
                primary="External finance authority present"
                secondary="1 line remains under external settlement ownership."
              />
            </Td>
            <Td density="compact">
              <StatusChip tone="success" label="signed URL ready" />
            </Td>
            <Td density="compact" mono>
              2026-05-08 11:00
            </Td>
          </Tr>
          <Tr>
            <Td density="compact">
              <DataCellStack
                primary={<strong>inv_2026_04_001</strong>}
                secondary="Pricing v2026.03.01"
              />
            </Td>
            <Td density="compact">
              <DataCellStack
                primary="Mar 2026"
                secondary="2026-03-01 to 2026-03-31"
              />
            </Td>
            <Td density="compact" align="right">
              NT$ 1,038,500
            </Td>
            <Td density="compact">
              <StatusChip tone="success" label="paid" />
            </Td>
            <Td density="compact">3</Td>
            <Td density="compact">
              <DataCellStack
                primary="DRTS operated only"
                secondary="3 DRTS-operated line(s)."
              />
            </Td>
            <Td density="compact">
              <StatusChip tone="success" label="signed URL ready" />
            </Td>
            <Td density="compact" mono>
              2026-04-08 11:00
            </Td>
          </Tr>
          <Tr>
            <Td density="compact">
              <DataCellStack
                primary={<strong>inv_2026_03_001</strong>}
                secondary="Pricing v2026.02.01"
              />
            </Td>
            <Td density="compact">
              <DataCellStack
                primary="Feb 2026"
                secondary="2026-02-01 to 2026-02-28"
              />
            </Td>
            <Td density="compact" align="right">
              NT$ 982,200
            </Td>
            <Td density="compact">
              <StatusChip tone="success" label="paid" />
            </Td>
            <Td density="compact">2</Td>
            <Td density="compact">
              <DataCellStack
                primary="DRTS operated only"
                secondary="2 DRTS-operated line(s)."
              />
            </Td>
            <Td density="compact" muted>
              Not published
            </Td>
            <Td density="compact" mono>
              2026-03-08 11:00
            </Td>
          </Tr>
        </DataTable>
      </DataViewCard>
    </TenantStoryShell>
  );
}

const meta = {
  title: "Tenant Console/Invoices",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Side-by-side parity story for the `TN_Invoices` artboard. The Built panel mirrors the contract-safe invoices route that ships in `apps/tenant-console-web/app/invoices/page.tsx`, while the Canvas panel embeds `Tenant Console.html#invoices` for TEN-UI-RD-015 review.",
      },
    },
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Invoices: Story = {
  render: () => (
    <StoryChrome
      heading="Tenant Invoices Parity Review"
      summary="Built implementation and the `TN_Invoices` artboard are rendered together for manual side-by-side review."
      built={<InvoicesBuiltView />}
      anchor="invoices"
    />
  ),
};
