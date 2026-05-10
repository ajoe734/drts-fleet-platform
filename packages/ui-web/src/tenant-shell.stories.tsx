import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ManagementShell } from "./management-shell";
import type { ManagementSidebarSection } from "./management-sidebar";
import { PageHeader } from "./page-header";
import { KpiCard, KpiRow, SectionHeader } from "./management-primitives";

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

const tenantSidebarFooter = (
  <div style={{ display: "grid", gap: "10px", lineHeight: 1.5 }}>
    <div>
      Partner entry stays constrained to eligibility and booking intake. Tenant
      admin navigation does not bleed into partner mode.
    </div>
    <div>
      Current production traffic remains in <code>tenant-commute-hub</code>;
      this app is the in-repo target shell.
    </div>
  </div>
);

function tenantSearchSlot(note: string) {
  return (
    <div
      style={{
        minWidth: "320px",
        maxWidth: "560px",
        padding: "9px 12px",
        borderRadius: "14px",
        border: "1px solid #ccfbf1",
        background: "#f0fdfa",
        color: "#115e59",
        fontSize: "12.5px",
        lineHeight: 1.4,
      }}
    >
      {note}
    </div>
  );
}

const meta = {
  title: "Tenant Console/Shell",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Tenant Console shell parity target — composed from `ManagementShell` " +
          "with the tenant nav structure used by " +
          "`apps/tenant-console-web/components/tenant-shell.tsx`. Acts as the " +
          "Storybook side-by-side reference for the `TN_Home` artboard during " +
          "TEN-UI-RD-001 acceptance.",
      },
    },
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const TenantHomeShell: Story = {
  name: "TN_Home shell",
  render: () => (
    <ManagementShell
      sidebar={{
        brand: "Tenant Console",
        brandSub: "Phase 1 tenant admin",
        brandIcon: tenantBrandIcon,
        sections: tenantSections,
        currentPath: "/",
        footer: tenantSidebarFooter,
      }}
      topbar={{
        breadcrumb: [{ label: "Tenant Console" }, { label: "Home" }],
        searchSlot: tenantSearchSlot(
          "Identity context, module framing, and quick-entry guidance.",
        ),
        envLabel: "tenant",
        envTone: "tenant",
      }}
    >
      <div
        style={{
          maxWidth: "1080px",
          margin: "0 auto",
          display: "grid",
          gap: "20px",
        }}
      >
        <PageHeader
          eyebrow="Tenant home"
          title="Daily booking oversight"
          subtitle="Identity context, partner-safe entry framing, and the modules a tenant admin reaches first when opening the console."
          meta={[
            { label: "Tenant", value: "CTBC World Elite" },
            { label: "Partner mode", value: "Eligibility + intake only" },
            { label: "Production traffic", value: "tenant-commute-hub" },
          ]}
        />
        <SectionHeader
          eyebrow="Today"
          title="Booking pulse"
          subtitle="Volume and routing posture across the tenant's owned and forwarded lanes."
        />
        <KpiRow>
          <KpiCard
            label="Open bookings"
            value="42"
            detail="Owned + forwarded combined"
            tone="tenant"
          />
          <KpiCard
            label="Pending intake"
            value="8"
            detail="Awaiting policy gate"
            tone="info"
          />
          <KpiCard
            label="At-risk"
            value="1"
            detail="SLA window narrowing"
            tone="warning"
          />
          <KpiCard
            label="Closed today"
            value="17"
            detail="Across the last 24h"
            tone="success"
          />
        </KpiRow>
      </div>
    </ManagementShell>
  ),
};
