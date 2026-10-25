import { Card, CardBody, CardHeader, PageHeader } from "@drts/ui-web";
import { resolveTenantApiUrl } from "@drts/tenant-auth/api-fetch";
import { verifyAgencySession } from "@drts/agency-auth/verified-agency-session.server";
import { redirect } from "next/navigation";

import { PortalShell } from "@/components/portal-shell";
import { display, displayDateTime } from "@/lib/format";
import { AGENCY_NAV } from "@/lib/navigation";
import { readAgencyProfile, requireAgencyToken } from "@/lib/session.server";

const ROLE_LABELS: Record<string, string> = {
  agency_viewer: "唯讀查詢",
  agency_exporter: "唯讀查詢與受控匯出",
};

export default async function HomePage() {
  const token = await requireAgencyToken("/");
  const { session } = await verifyAgencySession(token, resolveTenantApiUrl());
  if (!session) {
    redirect("/login");
  }
  const profile = await readAgencyProfile();
  const roleCode = session.roles[0] ?? profile?.roleCode ?? null;
  return (
    <PortalShell agencyName={profile?.agencyDisplayName ?? null}>
      <PageHeader title="首頁" subtitle="機關帳號與存取期限" />
      <Card>
        <CardHeader>
          <strong>{display(profile?.agencyDisplayName)}</strong>
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
            <dt>機關代號</dt>
            <dd style={{ margin: 0 }}>{session.agencyId}</dd>
            <dt>角色</dt>
            <dd style={{ margin: 0 }}>
              {roleCode ? (ROLE_LABELS[roleCode] ?? roleCode) : display(null)}
            </dd>
            <dt>存取到期日</dt>
            <dd style={{ margin: 0 }}>
              {displayDateTime(profile?.accessValidTo)}
            </dd>
          </dl>
        </CardBody>
      </Card>
      <ul style={{ marginTop: 24, lineHeight: 1.9 }}>
        {AGENCY_NAV.filter((item) => item.href !== "/").map((item) => (
          <li key={item.href}>
            <a href={item.href}>{item.label}</a>
          </li>
        ))}
      </ul>
    </PortalShell>
  );
}
