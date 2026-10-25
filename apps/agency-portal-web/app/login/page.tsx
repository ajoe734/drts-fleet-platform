import { Card, CardBody, CardHeader } from "@drts/ui-web";

import { LanguageSwitch } from "@/components/language-switch";
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
        </CardBody>
      </Card>
    </main>
  );
}
