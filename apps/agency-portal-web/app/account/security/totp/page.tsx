import { cookies } from "next/headers";
import { Card, CardBody, CardHeader } from "@drts/ui-web";
import { PortalTotpSetupPanel } from "@drts/ui-web/client";
import { AGENCY_CSRF_COOKIE_NAME } from "@drts/agency-auth/constants";

import { LanguageSwitch } from "@/components/language-switch";
import { buildPortalAuthMessages } from "@/lib/portal-auth-messages";
import { getServerLocale } from "@/lib/server-locale";
import { requireAgencyToken } from "@/lib/session.server";
import { t } from "@/lib/translations";

export default async function TotpSetupPage() {
  await requireAgencyToken("/account/security/totp");
  const [cookieStore, locale] = await Promise.all([cookies(), getServerLocale()]);
  const csrfToken = cookieStore.get(AGENCY_CSRF_COOKIE_NAME)?.value;

  return (
    <main style={{ maxWidth: 480, margin: "40px auto", padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <LanguageSwitch locale={locale} />
      </div>
      <Card>
        <CardHeader>
          <h1 style={{ fontSize: 20, margin: 0 }}>{t("totp.enrollTitle", undefined, locale)}</h1>
        </CardHeader>
        <CardBody>
          <PortalTotpSetupPanel
            messages={buildPortalAuthMessages(locale)}
            csrfToken={csrfToken}
            enrollEndpoint="/api/auth/agency/mfa/totp/enroll"
            confirmEndpoint="/api/auth/agency/mfa/totp/confirm"
          />
          <div style={{ marginTop: 16 }}>
            <a href="/account/security" style={{ fontSize: 13 }}>
              {t("accountSecurity.title", undefined, locale)}
            </a>
          </div>
        </CardBody>
      </Card>
    </main>
  );
}
