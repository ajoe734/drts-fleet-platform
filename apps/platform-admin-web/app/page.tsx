import Link from "next/link";
import { AppShellCard } from "@drts/ui-web";

const ROUTES = [
  {
    href: "/tenants",
    title: "Tenants",
    desc: "Tenant CRUD, provisioning, and lifecycle management",
  },
  {
    href: "/users",
    title: "Users & Roles",
    desc: "Platform user administration and role assignment",
  },
  {
    href: "/fleet",
    title: "Fleet & Devices",
    desc: "Vehicle registry, driver registry, and contract management",
  },
  {
    href: "/switchboard",
    title: "Switchboard",
    desc: "Public information, placards, and platform-wide broadcasts",
  },
  {
    href: "/pricing",
    title: "Pricing & Split",
    desc: "Pricing rules, revenue split configuration, and payment admin",
  },
  {
    href: "/payments",
    title: "Payments",
    desc: "Payment records, settlement status, and financial operations",
  },
  {
    href: "/health",
    title: "Health & Quotas",
    desc: "System health monitoring, forwarder adapter status, and quotas",
  },
  {
    href: "/notices",
    title: "Notices & Maintenance",
    desc: "Platform-wide notices, incident broadcasts, and maintenance mode",
  },
  {
    href: "/audit",
    title: "Audit Trail",
    desc: "Platform audit log with filtering and record inspection",
  },
  {
    href: "/feature-flags",
    title: "Feature Flags",
    desc: "Feature flag management with tenant-level overrides",
  },
];

export default function HomePage() {
  return (
    <div className="app-grid">
      <div style={{ marginBottom: 8 }}>
        <span className="pill">Platform Admin Control Plane</span>
      </div>
      <AppShellCard
        title="Platform Administration"
        description="Full control plane for platform-wide operations. Select an area below to begin."
      >
        <div className="route-list" style={{ marginTop: 16 }}>
          {ROUTES.map((route) => (
            <Link key={route.href} href={route.href} className="route-link">
              <strong>{route.title}</strong>
              <span style={{ fontSize: 13, color: "#6b7280" }}>
                {route.desc}
              </span>
            </Link>
          ))}
        </div>
      </AppShellCard>
    </div>
  );
}
