import { Card, CardBody, CardHeader } from "@drts/ui-web";
import { PortalForgotPasswordForm } from "@drts/ui-web/client";

import { LanguageSwitch } from "@/components/language-switch";
import { buildPortalAuthMessages } from "@/lib/portal-auth-messages";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

export default async function ForgotPasswordPage() {
  const locale = await getServerLocale();

  return (
    <main style={{ maxWidth: 480, margin: "80px auto", padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <LanguageSwitch locale={locale} />
      </div>
      <Card>
        <CardHeader>
          <h1 style={{ fontSize: 20, margin: 0 }}>{t("forgotPassword.title", undefined, locale)}</h1>
        </CardHeader>
        <CardBody>
          <PortalForgotPasswordForm
            messages={buildPortalAuthMessages(locale)}
            endpoint="/api/auth/agency/password-reset/request"
          />
          <div style={{ marginTop: 16 }}>
            <a href="/login" style={{ fontSize: 13 }}>
              {t("passwordSetup.backToLogin", undefined, locale)}
            </a>
          </div>
        </CardBody>
      </Card>
    </main>
  );
}
