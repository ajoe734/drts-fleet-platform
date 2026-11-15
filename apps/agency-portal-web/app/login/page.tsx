import { Card, CardBody, CardHeader } from "@drts/ui-web";
import { PortalPasswordLoginForm } from "@drts/ui-web/client";

import { LanguageSwitch } from "@/components/language-switch";
import { buildPortalAuthMessages } from "@/lib/portal-auth-messages";
import { getServerLocale } from "@/lib/server-locale";
import { firstParam } from "@/lib/session.server";
import { type Locale, type TranslationKey, t } from "@/lib/translations";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const LOGIN_ERROR_KEYS: Record<string, TranslationKey> = {
  AUTH_STATE_MISMATCH: "login.error.stateMismatch",
  AUTH_SESSION_EXCHANGE_DENIED: "login.error.exchangeDenied",
};

function loginErrorMessage(error: string, locale: Locale): string {
  const key = LOGIN_ERROR_KEYS[error] ?? "login.error.default";
  return t(key, undefined, locale);
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const [params, locale] = await Promise.all([searchParams, getServerLocale()]);
  const error = firstParam(params.error);
  const redirectUri = firstParam(params.redirect_uri) ?? "/";
  const loginHref = `/api/auth/agency/login?redirect_uri=${encodeURIComponent(redirectUri)}`;
  return (
    <main style={{ maxWidth: 480, margin: "80px auto", padding: 16 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginBottom: 12,
        }}
      >
        <LanguageSwitch locale={locale} />
      </div>
      <Card>
        <CardHeader>
          <h1 style={{ fontSize: 20, margin: 0 }}>
            {t("login.title", undefined, locale)}
          </h1>
        </CardHeader>
        <CardBody>
          <p style={{ marginTop: 0 }}>
            {t("login.description", undefined, locale)}
          </p>
          {error ? (
            <p role="alert" style={{ color: "#b91c1c" }}>
              {loginErrorMessage(error, locale)}
            </p>
          ) : null}
          <a
            href={loginHref}
            style={{
              display: "inline-block",
              padding: "10px 16px",
              borderRadius: 8,
              background: "#1d4ed8",
              color: "#ffffff",
              textDecoration: "none",
            }}
          >
            {t("login.cta", undefined, locale)}
          </a>

          <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid #E4E7EC" }}>
            <p style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.7 }}>
              {t("login.password.divider", undefined, locale)}
            </p>
            <PortalPasswordLoginForm
              messages={buildPortalAuthMessages(locale)}
              endpoint="/api/auth/agency/password-login"
              forgotPasswordHref="/forgot-password"
              successHref={redirectUri}
            />
          </div>
        </CardBody>
      </Card>
    </main>
  );
}
