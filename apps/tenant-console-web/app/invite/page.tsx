import { CanvasCard, CanvasPageHeader, buildCanvasTheme } from "@drts/ui-web";
import { PortalInvitationPasswordForm } from "@drts/ui-web/client";

import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import { buildPortalAuthMessages } from "@/lib/portal-auth-messages";

export const dynamic = "force-dynamic";

const th = buildCanvasTheme({ surface: "tenant", dark: true, density: "compact" });

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstParam(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] ?? "" : "";
}

/** PWD-LOGIN-009 / SA/SD §5: invitation landing page offering both the
 * existing Google/OIDC accept flow and the new set-password branch. */
export default async function InvitePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const [params, locale] = await Promise.all([searchParams, getServerLocale()]);
  const token = firstParam(params.token);
  const messages = buildPortalAuthMessages(locale);

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: th.bg,
        color: th.text,
        fontFamily: '"Inter", "Noto Sans TC", system-ui, sans-serif',
      }}
    >
      <div style={{ width: "min(520px, 100%)" }}>
        <CanvasCard theme={th} style={{ padding: 28 }}>
          <CanvasPageHeader theme={th} title={t("invite.title", locale)} subtitle={t("invite.description", locale)} />
          {token ? (
            <>
              <div style={{ marginTop: 20 }}>
                <a
                  href={`/api/auth/tenant/login?token=${encodeURIComponent(token)}`}
                  style={{
                    display: "inline-block",
                    padding: "10px 16px",
                    borderRadius: 6,
                    background: th.text,
                    color: th.bg,
                    fontWeight: 700,
                    textDecoration: "none",
                  }}
                >
                  {t("invite.googleCta", locale)}
                </a>
              </div>
              <div style={{ marginTop: 24, paddingTop: 20, borderTop: `1px solid ${th.border}` }}>
                <h2 style={{ fontSize: 15 }}>{t("invite.passwordSectionTitle", locale)}</h2>
                <PortalInvitationPasswordForm
                  messages={messages}
                  endpoint="/api/auth/tenant/invitation/accept-with-password"
                  loginEndpoint="/api/auth/tenant/password-login"
                  token={token}
                  successHref="/"
                />
              </div>
            </>
          ) : (
            <p role="alert" style={{ marginTop: 20 }}>
              {t("invite.invalidLink", locale)}
            </p>
          )}
        </CanvasCard>
      </div>
    </main>
  );
}
