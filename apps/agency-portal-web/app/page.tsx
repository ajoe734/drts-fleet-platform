import { Card, CardBody, CardHeader, PageHeader } from "@drts/ui-web";
import { resolveTenantApiUrl } from "@drts/tenant-auth/api-fetch";
import { verifyAgencySession } from "@drts/agency-auth/verified-agency-session.server";
import { redirect } from "next/navigation";

import { PortalShell } from "@/components/portal-shell";
import { display, displayDateTime, displayRoleCode } from "@/lib/format";
import { getAgencyNav } from "@/lib/navigation";
import { getServerLocale } from "@/lib/server-locale";
import { readAgencyProfile, requireAgencyToken } from "@/lib/session.server";
import { t } from "@/lib/translations";

export default async function HomePage() {
  const token = await requireAgencyToken("/");
  const { session } = await verifyAgencySession(token, resolveTenantApiUrl());
  if (!session) {
    redirect("/login");
  }
  const [profile, locale] = await Promise.all([
    readAgencyProfile(),
    getServerLocale(),
  ]);
  const roleCode = session.roles[0] ?? profile?.roleCode ?? null;
  const navItems = getAgencyNav(locale);
  return (
    <PortalShell
      agencyName={profile?.agencyDisplayName ?? null}
      locale={locale}
    >
      <PageHeader
        title={t("home.title", undefined, locale)}
        subtitle={t("home.subtitle", undefined, locale)}
      />
      <Card>
        <CardHeader>
          <strong>{display(profile?.agencyDisplayName, locale)}</strong>
        </CardHeader>
        <CardBody>
          <dl
            style={{
              display: "grid",
              gridTemplateColumns: "160px 1fr",
              gap: 8,
              margin: 0,
            }}
          >
            <dt>{t("home.agencyId", undefined, locale)}</dt>
            <dd style={{ margin: 0 }}>{session.agencyId}</dd>
            <dt>{t("home.role", undefined, locale)}</dt>
            <dd style={{ margin: 0 }}>{displayRoleCode(roleCode, locale)}</dd>
            <dt>{t("home.accessValidTo", undefined, locale)}</dt>
            <dd style={{ margin: 0 }}>
              {displayDateTime(profile?.accessValidTo, locale)}
            </dd>
          </dl>
        </CardBody>
      </Card>
      <ul style={{ marginTop: 24, lineHeight: 1.9 }}>
        {navItems
          .filter((item) => item.href !== "/")
          .map((item) => (
            <li key={item.href}>
              <a href={item.href}>{item.label}</a>
            </li>
          ))}
      </ul>
    </PortalShell>
  );
}
