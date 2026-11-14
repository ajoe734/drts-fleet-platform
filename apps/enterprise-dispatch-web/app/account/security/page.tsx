import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ECard } from "@/components/ent-kit";
import { PortalAccountSecurityPanel } from "@drts/ui-web/client";
import { TENANT_CSRF_COOKIE_NAME } from "@drts/tenant-auth/constants";
import {
  ENTERPRISE_TENANT_SESSION_COOKIE,
  verifyEnterpriseTenantSession,
} from "@/lib/enterprise-session.server";
import { enterpriseTheme as th } from "@/lib/enterprise-theme";
import { buildPortalAuthMessages } from "@/lib/portal-auth-messages";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

export const dynamic = "force-dynamic";

export default async function AccountSecurityPage() {
  const cookieStore = await cookies();
  const verified = await verifyEnterpriseTenantSession(
    cookieStore.get(ENTERPRISE_TENANT_SESSION_COOKIE)?.value,
  );
  if (!verified.session) {
    redirect("/login?redirect_uri=%2Faccount%2Fsecurity");
  }
  const csrfToken = cookieStore.get(TENANT_CSRF_COOKIE_NAME)?.value;
  const locale = await getServerLocale();

  return (
    <main style={{ padding: 24, background: th.bg, color: th.ink, minHeight: "100dvh", fontFamily: th.sans }}>
      <div style={{ width: "min(640px, 100%)", margin: "0 auto" }}>
        <ECard t={th} title={t("accountSecurity.title", undefined, locale)}>
          <div>
            <h2 style={{ fontSize: 15 }}>{t("accountSecurity.passwordSectionTitle", undefined, locale)}</h2>
            <p style={{ fontSize: 13, color: th.muted }}>{t("accountSecurity.passwordSectionBody", undefined, locale)}</p>
            <a href="/forgot-password" style={{ fontSize: 13 }}>
              {t("accountSecurity.passwordCta", undefined, locale)}
            </a>
          </div>

          <div style={{ marginTop: 24 }}>
            <PortalAccountSecurityPanel
              messages={buildPortalAuthMessages(locale)}
              csrfToken={csrfToken}
              sessionsEndpoint="/api/auth/sessions"
              sessionRevokeBase="/api/auth/sessions"
              logoutAllEndpoint="/api/auth/logout-all"
              totpSetupHref="/account/security/totp"
            />
          </div>
        </ECard>
      </div>
    </main>
  );
}
