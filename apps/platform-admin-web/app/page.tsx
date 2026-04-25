"use client";

import Link from "next/link";
import { PageHeader, Card, CardBody } from "@drts/ui-web";
import { useTranslation } from "@/lib/i18n";

export default function HomePage() {
  const { t } = useTranslation();

  const ROUTES = [
    {
      href: "/tenants",
      titleKey: "home.tenants.title",
      descKey: "home.tenants.desc",
    },
    {
      href: "/users",
      titleKey: "home.users.title",
      descKey: "home.users.desc",
    },
    {
      href: "/fleet",
      titleKey: "home.fleet.title",
      descKey: "home.fleet.desc",
    },
    {
      href: "/switchboard",
      titleKey: "home.switchboard.title",
      descKey: "home.switchboard.desc",
    },
    {
      href: "/pricing",
      titleKey: "home.pricing.title",
      descKey: "home.pricing.desc",
    },
    {
      href: "/payments",
      titleKey: "home.payments.title",
      descKey: "home.payments.desc",
    },
    {
      href: "/health",
      titleKey: "home.health.title",
      descKey: "home.health.desc",
    },
    {
      href: "/notices",
      titleKey: "home.notices.title",
      descKey: "home.notices.desc",
    },
    {
      href: "/audit",
      titleKey: "home.audit.title",
      descKey: "home.audit.desc",
    },
    {
      href: "/feature-flags",
      titleKey: "home.featureFlags.title",
      descKey: "home.featureFlags.desc",
    },
  ];

  return (
    <>
      <PageHeader title={t("home.title")} subtitle={t("home.subtitle")} />
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
                  {t(route.titleKey)}
                </div>
                <div
                  style={{
                    fontSize: "12.5px",
                    color: "#64748b",
                    lineHeight: 1.5,
                  }}
                >
                  {t(route.descKey)}
                </div>
              </Link>
            ))}
          </div>
        </CardBody>
      </Card>
    </>
  );
}
