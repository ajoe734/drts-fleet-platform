import { cookies } from "next/headers";
import { Card, CardBody, CardHeader } from "@drts/ui-web";
import { PortalAccountSecurityPanel } from "@drts/ui-web/client";
import { AGENCY_CSRF_COOKIE_NAME } from "@drts/agency-auth/constants";

import { LanguageSwitch } from "@/components/language-switch";
import { buildPortalAuthMessages } from "@/lib/portal-auth-messages";
import { getServerLocale } from "@/lib/server-locale";
import { requireAgencyToken } from "@/lib/session.server";
import { t } from "@/lib/translations";

export default async function AccountSecurityPage() {
  await requireAgencyToken("/account/security");
  const [cookieStore, locale] = await Promise.all([cookies(), getServerLocale()]);
  const csrfToken = cookieStore.get(AGENCY_CSRF_COOKIE_NAME)?.value;

  return (
    <main style={{ maxWidth: 640, margin: "40px auto", padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <LanguageSwitch locale={locale} />
      </div>
      <Card>
        <CardHeader>
          <h1 style={{ fontSize: 20, margin: 0 }}>{t("accountSecurity.title", undefined, locale)}</h1>
        </CardHeader>
        <CardBody>
          <div>
            <h2 style={{ fontSize: 15 }}>{t("accountSecurity.passwordSectionTitle", undefined, locale)}</h2>
            <p style={{ fontSize: 13, opacity: 0.85 }}>{t("accountSecurity.passwordSectionBody", undefined, locale)}</p>
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
        </CardBody>
      </Card>
    </main>
  );
}
