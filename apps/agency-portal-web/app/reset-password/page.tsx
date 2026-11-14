import { Card, CardBody, CardHeader } from "@drts/ui-web";
import { PortalResetPasswordForm } from "@drts/ui-web/client";

import { LanguageSwitch } from "@/components/language-switch";
import { buildPortalAuthMessages } from "@/lib/portal-auth-messages";
import { getServerLocale } from "@/lib/server-locale";
import { firstParam } from "@/lib/session.server";
import { t } from "@/lib/translations";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const [params, locale] = await Promise.all([searchParams, getServerLocale()]);
  const token = firstParam(params.token);

  return (
    <main style={{ maxWidth: 480, margin: "80px auto", padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <LanguageSwitch locale={locale} />
      </div>
      <Card>
        <CardHeader>
          <h1 style={{ fontSize: 20, margin: 0 }}>{t("resetPassword.title", undefined, locale)}</h1>
        </CardHeader>
        <CardBody>
          <p style={{ marginTop: 0 }}>{t("resetPassword.description", undefined, locale)}</p>
          {token ? (
            <PortalResetPasswordForm
              messages={buildPortalAuthMessages(locale)}
              endpoint="/api/auth/agency/password-reset/confirm"
              token={token}
              successHref="/login"
            />
          ) : (
            <p role="alert">{t("resetPassword.invalidLink", undefined, locale)}</p>
          )}
        </CardBody>
      </Card>
    </main>
  );
}
