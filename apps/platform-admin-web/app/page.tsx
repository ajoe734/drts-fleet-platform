import Link from "next/link";
import { PageHeader, Card, CardBody } from "@drts/ui-web";

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
    <>
      <PageHeader
        title="Platform Administration"
        subtitle="Full control plane for platform-wide operations"
      />
      <Card>
        <CardBody>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "12px",
            }}
          >
            {ROUTES.map((route) => (
              <Link
                key={route.href}
                href={route.href}
                style={{
                  display: "block",
                  padding: "16px",
                  borderRadius: "10px",
                  border: "1px solid #e2e8f0",
                  textDecoration: "none",
                  background: "#f8fafc",
                  transition: "background 0.1s, border-color 0.1s",
                }}
              >
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: "14px",
                    color: "#0f172a",
                    marginBottom: "6px",
                  }}
                >
                  {route.title}
                </div>
                <div
                  style={{
                    fontSize: "12.5px",
                    color: "#64748b",
                    lineHeight: 1.5,
                  }}
                >
                  {route.desc}
                </div>
              </Link>
            ))}
          </div>
        </CardBody>
      </Card>
    </>
  );
}
