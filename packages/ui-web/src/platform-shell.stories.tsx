import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { ReactNode } from "react";
import { ManagementShell } from "./management-shell";
import type { ManagementSidebarSection } from "./management-sidebar";
import { PageHeader } from "./page-header";
import {
  CalloutBanner,
  KpiCard,
  KpiRow,
  WorkflowPanel,
} from "./management-primitives";

const canvasShellSrc = "/drts-design-canvas/Platform%20Admin.html#home";

const shellSections: ManagementSidebarSection[] = [
  {
    key: "workspace",
    title: "Workspace",
    items: [
      { href: "/", label: "Home" },
      {
        href: "/health",
        label: "Health & Alerts",
        badge: "2",
        badgeTone: "warning",
      },
    ],
  },
  {
    key: "tenant-governance",
    title: "Tenant Governance",
    items: [
      { href: "/tenants", label: "Tenants" },
      { href: "/partners", label: "Partners" },
      { href: "/users", label: "Users" },
    ],
  },
  {
    key: "fleet-compliance",
    title: "Fleet & Compliance",
    items: [
      { href: "/fleet", label: "Fleet & Devices" },
      { href: "/switchboard", label: "Switchboard" },
    ],
  },
  {
    key: "pricing-settlement",
    title: "Pricing & Settlement",
    items: [
      { href: "/pricing", label: "Pricing & Split" },
      { href: "/payments", label: "Payments", badge: "3", badgeTone: "danger" },
    ],
  },
  {
    key: "platform-layer",
    title: "Platform Layer",
    items: [
      { href: "/notices", label: "Notices" },
      { href: "/audit", label: "Audit Trail" },
      { href: "/feature-flags", label: "Feature Flags" },
      { href: "/adapter-registry", label: "Adapter Registry" },
    ],
  },
];

const quickLinks = [
  "Tenants",
  "Partners",
  "Pricing",
  "Payments",
  "Fleet",
  "Audit",
];

function ComparisonFrame({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section style={{ display: "grid", gap: "10px", alignContent: "start" }}>
      <div style={{ display: "grid", gap: "4px" }}>
        <strong
          style={{
            fontSize: "12px",
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#0f172a",
          }}
        >
          {title}
        </strong>
        <span style={{ fontSize: "12.5px", color: "#475569", lineHeight: 1.5 }}>
          {subtitle}
        </span>
      </div>
      {children}
    </section>
  );
}

function QuickLinkCard({ label }: { label: string }) {
  return (
    <div
      style={{
        padding: "10px 12px",
        border: "1px solid #dbeafe",
        borderRadius: "12px",
        background: "#ffffff",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "10px",
      }}
    >
      <span
        style={{
          width: "28px",
          height: "28px",
          borderRadius: "8px",
          background: "#dbeafe",
          color: "#1d4ed8",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "11px",
          fontWeight: 700,
        }}
      >
        {label.slice(0, 2).toUpperCase()}
      </span>
      <span
        style={{ flex: 1, color: "#0f172a", fontSize: "13px", fontWeight: 600 }}
      >
        {label}
      </span>
      <span style={{ color: "#64748b", fontSize: "12px" }}>Open</span>
    </div>
  );
}

function BuiltShellView() {
  return (
    <ManagementShell
      sidebar={{
        brand: "DRTS Fleet",
        brandSub: "Platform Admin",
        brandIcon: (
          <span
            style={{
              fontSize: "11px",
              fontWeight: 700,
              letterSpacing: "0.08em",
            }}
          >
            PA
          </span>
        ),
        sections: shellSections,
        currentPath: "/",
        footer: (
          <div style={{ display: "grid", gap: "10px", lineHeight: 1.5 }}>
            <div>
              Grouped navigation, route context, and environment framing.
            </div>
            <div>
              Visual parity target for <code>ADM-UI-RD-001</code>.
            </div>
          </div>
        ),
      }}
      topbar={{
        breadcrumb: [{ label: "Platform Admin" }, { label: "Home" }],
        searchSlot: (
          <div
            style={{
              minWidth: "320px",
              maxWidth: "560px",
              padding: "9px 12px",
              borderRadius: "14px",
              border: "1px solid #bfdbfe",
              background: "#eff6ff",
              color: "#1d4ed8",
              fontSize: "12.5px",
              lineHeight: 1.4,
            }}
          >
            Governance queue, cross-module shortcuts, and the latest sensitive
            platform activity.
          </div>
        ),
        envLabel: "production",
        envTone: "success",
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
          eyebrow="Platform home"
          title="Platform governance home"
          subtitle="DRTS control plane. Three governance items need review today."
          meta={[
            { label: "Active tenants", value: "142" },
            { label: "Partner entries", value: "38" },
            { label: "Open reconciliation", value: "3" },
          ]}
        />
        <KpiRow>
          <KpiCard
            label="Active tenants"
            value="142"
            detail="8 pilot, 12 sandbox"
            tone="info"
          />
          <KpiCard
            label="Partner entries"
            value="38"
            detail="2 need readiness review"
            tone="tenant"
          />
          <KpiCard
            label="Active drivers"
            value="884"
            detail="42 licenses expire within 30 days"
            tone="warning"
          />
          <KpiCard
            label="Settlement backlog"
            value="3"
            detail="2 partner, 1 forwarded"
            tone="danger"
          />
        </KpiRow>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.5fr 1fr",
            gap: "16px",
            alignItems: "start",
          }}
        >
          <WorkflowPanel
            eyebrow="Today"
            title="Governance queue"
            description="Cross-module items where a platform operator should intervene."
          >
            <CalloutBanner
              tone="danger"
              title="BGMT callback token expires in 6 days"
              description="Refresh the partner credential before it blocks daily completion reporting."
            />
            <CalloutBanner
              tone="warning"
              title="GoCab forwarded sync_failed is above threshold"
              description="Adapter health needs manual fallback review before the rate climbs further."
            />
            <CalloutBanner
              tone="info"
              title="NTU_HOSP remains in rollback_hold"
              description="Platform and ops still need the next-step decision after the escalated complaint."
            />
          </WorkflowPanel>
          <WorkflowPanel
            eyebrow="Modules"
            title="Governance shortcuts"
            description="Jump directly into the primary control surfaces."
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "10px",
              }}
            >
              {quickLinks.map((label) => (
                <QuickLinkCard key={label} label={label} />
              ))}
            </div>
          </WorkflowPanel>
        </div>
      </div>
    </ManagementShell>
  );
}

const meta = {
  title: "Platform Admin/Shell",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Platform Admin shell parity target for `ADM-UI-RD-001`. The built shell is compared against the `PA_Home` artboard from `docs/05-ui/drts-design-canvas/Platform Admin.html#home`.",
      },
    },
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const PlatformHomeShell: Story = {
  name: "PA_Home shell",
  render: () => (
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
            Platform Shell Review
          </div>
          <div style={{ fontSize: "13px", color: "#475569", lineHeight: 1.5 }}>
            The built shell is rendered beside the Platform Admin home artboard
            for manual chrome comparison.
          </div>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(720px, 1fr))",
            gap: "16px",
            alignItems: "start",
            overflowX: "auto",
          }}
        >
          <ComparisonFrame
            title="Built"
            subtitle="ManagementShell composition with grouped sidebar, topbar context, and home framing."
          >
            <BuiltShellView />
          </ComparisonFrame>
          <ComparisonFrame
            title="Designed"
            subtitle="`docs/05-ui/drts-design-canvas/Platform Admin.html#home`"
          >
            <iframe
              src={canvasShellSrc}
              title="Platform Admin shell design reference"
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
  ),
};
