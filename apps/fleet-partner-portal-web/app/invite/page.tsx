import { CanvasCard, CanvasPageHeader } from "@drts/ui-web";
import { PortalInvitationPasswordForm } from "@drts/ui-web/client";
import { buildFleetTheme } from "@/lib/fleet-portal-theme";
import { loginReturnPath } from "@/lib/login-return-path";
import { buildPortalAuthMessages } from "@/lib/portal-auth-messages";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

export const dynamic = "force-dynamic";

const th = buildFleetTheme();

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Fleet staff invitation acceptance: "set a password" / "bind Google"
 * (SA/SD §9), mirroring apps/agency-portal-web/app/invite/page.tsx. Both
 * branches consume the same one-time invitation token via the existing
 * BFF: the Google branch forwards to /api/auth/login?token=..., which
 * resolves the Fleet entry from the invitation itself (FLEET-ONB-008); the
 * password branch posts to /api/auth/invitation/accept-with-password and
 * then signs in through the ordinary password-login endpoint. */
type SearchParams = Record<string, string | string[] | undefined>;

export default async function FleetInvitePage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const [params, locale] = await Promise.all([
    searchParams ?? Promise.resolve<SearchParams>({}),
    getServerLocale(),
  ]);
  const token = firstParam(params.token)?.trim() ?? "";
  const returnPath = loginReturnPath(firstParam(params.redirect_uri));
  const googleQuery = new URLSearchParams({
    token,
    redirect_uri: returnPath,
  });

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        boxSizing: "border-box",
        background: th.bg,
        color: th.text,
        fontFamily: th.fontFamily,
      }}
    >
      <div style={{ width: "min(480px, 100%)" }}>
        <CanvasCard theme={th} style={{ padding: 28 }}>
          <CanvasPageHeader
            theme={th}
            title={t("invite.title", locale)}
            subtitle={t("invite.description", locale)}
          />

          {!token ? (
            <p
              role="alert"
              style={{
                marginTop: 16,
                padding: "12px 16px",
                borderRadius: 8,
                background: th.dangerBg,
                border: `1px solid ${th.dangerBorder}`,
                color: th.danger,
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              {t("invite.invalidLink", locale)}
            </p>
          ) : (
            <>
              <a
                href={`/api/auth/login?${googleQuery}`}
                style={{
                  display: "inline-block",
                  marginTop: 20,
                  padding: "12px 18px",
                  borderRadius: 6,
                  background: th.accent,
                  color: th.accentBg,
                  fontWeight: 700,
                  fontSize: 14,
                  textDecoration: "none",
                }}
              >
                {t("invite.cta", locale)}
              </a>

              <div
                style={{
                  marginTop: 24,
                  paddingTop: 20,
                  borderTop: `1px solid ${th.border}`,
                }}
              >
                <p
                  style={{
                    fontSize: 12,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    opacity: 0.7,
                  }}
                >
                  {t("invite.passwordSectionTitle", locale)}
                </p>
                <PortalInvitationPasswordForm
                  messages={buildPortalAuthMessages(locale)}
                  endpoint="/api/auth/invitation/accept-with-password"
                  loginEndpoint="/api/auth/password-login"
                  token={token}
                  successHref={returnPath}
                />
              </div>
            </>
          )}
        </CanvasCard>
      </div>
    </main>
  );
}
