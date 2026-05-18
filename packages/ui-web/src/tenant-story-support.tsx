import type { ReactNode } from "react";
import { ManagementShell } from "./management-shell";
import type { ManagementSidebarSection } from "./management-sidebar";

const canvasBaseSrc = "/drts-design-canvas/Tenant%20Console.html";

export const tenantSections: ManagementSidebarSection[] = [
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
    items: [
      { href: "/passengers", label: "Passengers" },
      { href: "/addresses", label: "Addresses" },
    ],
  },
  {
    key: "billing",
    title: "Billing",
    items: [
      { href: "/invoices", label: "Invoices" },
      { href: "/reports", label: "Reports" },
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
      { href: "/rules", label: "Rules" },
      { href: "/audit", label: "Audit" },
      { href: "/users", label: "Users" },
      { href: "/settings", label: "Settings" },
    ],
  },
];

export const tenantBrandIcon = (
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
  children: ReactNode;
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

export function StoryChrome({
  heading,
  summary,
  built,
  anchor,
}: {
  heading: string;
  summary: string;
  built: ReactNode;
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

export function TenantStoryShell({
  currentPath,
  breadcrumb,
  children,
}: {
  currentPath: string;
  breadcrumb: string;
  children: ReactNode;
}) {
  return (
    <ManagementShell
      sidebar={{
        brand: "Tenant Console",
        brandSub: "Bookings, billing, and team access",
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
