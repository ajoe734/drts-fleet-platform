import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
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

function AddressesBuiltView() {
  return (
    <TenantStoryShell currentPath="/addresses" breadcrumb="Addresses">
      <PageHeader
        eyebrow="Address book"
        title="Addresses"
        subtitle="Saved tenant locations, tags, and ownership read straight from `/api/tenant/addresses`."
        meta={[
          { label: "Saved", value: "5" },
          { label: "Active", value: "5", tone: "success" },
          { label: "Sensitive", value: "0" },
        ]}
      />
      <KpiRow minWidth="170px">
        <KpiCard
          label="Saved"
          value="5"
          detail="Visible to the tenant scope"
          tone="tenant"
        />
        <KpiCard
          label="Active"
          value="5"
          detail="Available for booking selection"
          tone="success"
        />
        <KpiCard
          label="Sensitive"
          value="0"
          detail="No masked rows in this view"
          tone="info"
        />
        <KpiCard
          label="Quality flagged"
          value="0"
          detail="No geocode or duplicate issues"
          tone="success"
        />
      </KpiRow>
      <DataViewCard
        title="Tenant address roster"
        subtitle="Records remain command-driven through `UpsertTenantAddressCommand`."
        tone="tenant"
        density="compact"
        summary="5 saved · 5 active · 0 sensitive · 0 flagged."
        footer="Mutations stay outside this read-only parity surface."
      >
        <DataTable
          density="compact"
          tone="tenant"
          columns={[
            { label: "Name", width: "180px" },
            { label: "Address" },
            { label: "Tags", width: "180px" },
            { label: "Owner", width: "140px" },
            { label: "State", width: "120px" },
          ]}
        >
          <Tr>
            <Td density="compact">
              <DataCellStack
                primary={<strong>總部</strong>}
                secondary="a_001"
              />
            </Td>
            <Td density="compact">
              <DataCellStack
                primary="台北市信義區松仁路 100 號"
                secondary="Geocode: provider"
              />
            </Td>
            <Td density="compact">
              <StatusChip tone="info" label="HQ" />
            </Td>
            <Td density="compact" muted>
              Tenant-shared
            </Td>
            <Td density="compact">
              <StatusChip tone="success" label="active" />
            </Td>
          </Tr>
          <Tr>
            <Td density="compact">
              <DataCellStack
                primary={<strong>桃園機場 T2 接送點</strong>}
                secondary="a_002"
              />
            </Td>
            <Td density="compact">
              <DataCellStack
                primary="桃園機場 第二航廈 抵境大廳 7 號門"
                secondary="Geocode: provider"
              />
            </Td>
            <Td density="compact">
              <StatusChip tone="info" label="airport" />
            </Td>
            <Td density="compact" muted>
              Tenant-shared
            </Td>
            <Td density="compact">
              <StatusChip tone="success" label="active" />
            </Td>
          </Tr>
          <Tr>
            <Td density="compact">
              <DataCellStack
                primary={<strong>新竹研發中心</strong>}
                secondary="a_004"
              />
            </Td>
            <Td density="compact">
              <DataCellStack
                primary="新竹科學園區 力行六路 8 號 B 棟"
                secondary="Geocode: provider"
              />
            </Td>
            <Td density="compact">
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                <StatusChip tone="info" label="HQ" />
                <StatusChip tone="info" label="tsmc" />
              </div>
            </Td>
            <Td density="compact">劉怡君</Td>
            <Td density="compact">
              <StatusChip tone="success" label="active" />
            </Td>
          </Tr>
        </DataTable>
      </DataViewCard>
    </TenantStoryShell>
  );
}

const meta = {
  title: "Tenant Console/Addresses",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Side-by-side parity story for the `TN_Addresses` artboard. The Built panel mirrors the address-book view that ships in `apps/tenant-console-web/app/addresses/page.tsx` (composed from `@drts/ui-web` primitives) and the Canvas panel embeds `Tenant Console.html#addresses` for TEN-UI-RD-012 review.",
      },
    },
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Addresses: Story = {
  render: () => (
    <StoryChrome
      heading="Tenant Addresses Parity Review"
      summary="Built implementation and the `TN_Addresses` artboard are rendered in the same Storybook view for manual side-by-side review."
      built={<AddressesBuiltView />}
      anchor="addresses"
    />
  ),
};
