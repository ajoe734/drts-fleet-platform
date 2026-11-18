import type { CSSProperties } from "react";
import { CanvasIcon, PageHeader } from "@drts/ui-web";
import { resolveTenantApiUrl } from "@drts/tenant-auth/api-fetch";
import { verifyAgencySession } from "@drts/agency-auth/verified-agency-session.server";
import { redirect } from "next/navigation";

import { PortalShell } from "@/components/portal-shell";
import { display, displayDateTime, displayRoleCode } from "@/lib/format";
import { getAgencyNav } from "@/lib/navigation";
import { getServerLocale } from "@/lib/server-locale";
import { readAgencyProfile, requireAgencyToken } from "@/lib/session.server";
import { t } from "@/lib/translations";

const tileStyle: CSSProperties = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 10,
  padding: "14px 16px",
  minWidth: 0,
};
const tileLabelStyle: CSSProperties = {
  fontSize: 12,
  color: "#64748b",
  marginBottom: 6,
};
const tileValueStyle: CSSProperties = {
  fontSize: 17,
  fontWeight: 650,
  overflowWrap: "anywhere",
};
const tileNoteStyle: CSSProperties = {
  marginTop: 6,
  fontSize: 11,
  color: "#94a3b8",
  overflowWrap: "anywhere",
};
const sectionCardStyle: CSSProperties = {
  display: "flex",
  gap: 12,
  alignItems: "flex-start",
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 10,
  padding: "14px 16px",
  color: "#0f172a",
  textDecoration: "none",
};
const sectionIconStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 32,
  height: 32,
  flex: "0 0 32px",
  borderRadius: 8,
  background: "#eff6ff",
  color: "#1d4ed8",
};

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
      <section
        aria-label={t("home.subtitle", undefined, locale)}
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
        }}
      >
        {[
          {
            label: t("home.agency", undefined, locale),
            value: display(profile?.agencyDisplayName, locale),
            note: (
              <>
                {t("home.agencyId", undefined, locale)}{" "}
                <span data-testid="agency-system-id">{session.agencyId}</span>
              </>
            ),
          },
          {
            label: t("home.role", undefined, locale),
            value: displayRoleCode(roleCode, locale),
            note: null,
          },
          {
            label: t("home.accessValidTo", undefined, locale),
            value: displayDateTime(profile?.accessValidTo, locale),
            note: null,
          },
        ].map((item) => (
          <div key={item.label} style={tileStyle}>
            <div style={tileLabelStyle}>{item.label}</div>
            <div style={tileValueStyle}>{item.value}</div>
            {item.note ? <div style={tileNoteStyle}>{item.note}</div> : null}
          </div>
        ))}
      </section>
      <h2 style={{ fontSize: 15, margin: "28px 0 12px" }}>
        {t("home.sections", undefined, locale)}
      </h2>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 12,
        }}
      >
        {navItems
          .filter((item) => item.href !== "/")
          .map((item) => (
            <a key={item.href} href={item.href} style={sectionCardStyle}>
              <span style={sectionIconStyle} aria-hidden="true">
                <CanvasIcon name={item.icon} size={16} />
              </span>
              <span style={{ display: "grid", gap: 4, minWidth: 0 }}>
                <strong style={{ fontSize: 14 }}>{item.label}</strong>
                <span style={{ fontSize: 12.5, color: "#475569" }}>
                  {item.description}
                </span>
              </span>
            </a>
          ))}
      </div>
    </PortalShell>
  );
}
