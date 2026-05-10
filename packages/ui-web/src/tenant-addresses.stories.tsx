import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ManagementShell } from "./management-shell";
import type { ManagementSidebarSection } from "./management-sidebar";
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

const canvasBaseSrc = "/drts-design-canvas/Tenant%20Console.html";

const tenantSections: ManagementSidebarSection[] = [
  {
    key: "workspace",
    title: "Workspace",
    items: [
      { href: "/", label: "Home" },
      { href: "/bookings", label: "Bookings" },
      { href: "/bookings/new", label: "New Booking" },
    ],
  },
  {
    key: "directory",
    title: "Directory",
    items: [{ href: "/addresses", label: "Addresses" }],
  },
  {
    key: "integrations",
    title: "Integrations",
    items: [
      { href: "/api-keys", label: "API Keys" },
      { href: "/webhooks", label: "Webhooks" },
    ],
  },
  {
    key: "governance",
    title: "Governance",
    items: [
      { href: "/audit", label: "Audit" },
      { href: "/users", label: "Users" },
      { href: "/settings", label: "Settings" },
    ],
  },
];

const tenantBrandIcon = (
  <span
    style={{
      fontSize: "11px",
      fontWeight: 700,
      letterSpacing: "0.08em",
    }}
  >
    TC
  </span>
);

const pageStackStyle = {
  maxWidth: "1180px",
  margin: "0 auto",
  display: "grid",
  gap: "20px",
};

const comparisonGridStyle = {
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
  children: React.ReactNode;
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

function StoryChrome({
  heading,
  summary,
  built,
  anchor,
}: {
  heading: string;
  summary: string;
  built: React.ReactNode;
  anchor: string;
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
            {heading}
          </div>
          <div style={{ fontSize: "13px", color: "#475569", lineHeight: 1.5 }}>
            {summary}
          </div>
        </div>
        <div style={comparisonGridStyle}>
          <ComparisonFrame
            title="Built"
            subtitle="`@drts/ui-web` parity target composed with the tenant shell."
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
              {built}
            </div>
          </ComparisonFrame>
          <ComparisonFrame
            title="Canvas"
            subtitle={`\`docs/05-ui/drts-design-canvas/Tenant Console.html#${anchor}\``}
          >
            <iframe
              src={`${canvasBaseSrc}#${anchor}`}
              title={`${anchor} canvas reference`}
              style={{
                width: "100%",
                minWidth: "720px",
                height: "900px",
                border: "1px solid #cbd5e1",
                borderRadius: "22px",
                background: "#ffffff",
              }}
            />
          </ComparisonFrame>
        </div>
      </div>
    </div>
  );
}

function TenantStoryShell({
  currentPath,
  breadcrumb,
  children,
}: {
  currentPath: string;
  breadcrumb: string;
  children: React.ReactNode;
}) {
  return (
    <ManagementShell
      sidebar={{
        brand: "Tenant Console",
        brandSub: "Phase 1 tenant admin",
        brandIcon: tenantBrandIcon,
        sections: tenantSections,
        currentPath,
      }}
      topbar={{
        breadcrumb: [{ label: "Tenant Console" }, { label: breadcrumb }],
        envLabel: "tenant",
        envTone: "tenant",
      }}
    >
      <div style={pageStackStyle}>{children}</div>
    </ManagementShell>
  );
}

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
