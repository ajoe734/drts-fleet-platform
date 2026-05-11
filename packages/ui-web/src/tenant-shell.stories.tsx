import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ManagementShell } from "./management-shell";
import { PageHeader } from "./page-header";
import { KpiCard, KpiRow, SectionHeader } from "./management-primitives";
import { tenantBrandIcon, tenantSections } from "./tenant-story-support";

const tenantSidebarFooter = (
  <div style={{ display: "grid", gap: "10px", lineHeight: 1.5 }}>
    <div>
      Partner booking stays focused on eligibility checks and trip requests.
      Team administration stays here.
    </div>
    <div>
      Manage bookings, people, billing, and integrations for your organization
      from one workspace.
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
        brandSub: "Bookings, billing, and team access",
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
            { label: "Workspace", value: "Bookings, billing, and access" },
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
