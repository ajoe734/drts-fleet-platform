import { Card, CardBody, CardHeader } from "@drts/ui-web";

import { LanguageSwitch } from "@/components/language-switch";
import { getServerLocale } from "@/lib/server-locale";
import { firstParam } from "@/lib/session.server";
import { t } from "@/lib/translations";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Invitation acceptance: the one-time token is bound to the OIDC state. */
export default async function InvitePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const [params, locale] = await Promise.all([searchParams, getServerLocale()]);
  const token = firstParam(params.token);
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
            {t("invite.title", undefined, locale)}
          </h1>
        </CardHeader>
        <CardBody>
          {token ? (
            <>
              <p style={{ marginTop: 0 }}>
                {t("invite.description", undefined, locale)}
              </p>
              <a
                href={`/api/auth/agency/login?token=${encodeURIComponent(token)}`}
                style={{
                  display: "inline-block",
                  padding: "10px 16px",
                  borderRadius: 8,
                  background: "#1d4ed8",
                  color: "#ffffff",
                  textDecoration: "none",
                }}
              >
                {t("invite.cta", undefined, locale)}
              </a>
            </>
          ) : (
            <p role="alert">{t("invite.invalidLink", undefined, locale)}</p>
          )}
        </CardBody>
      </Card>
    </main>
  );
}
