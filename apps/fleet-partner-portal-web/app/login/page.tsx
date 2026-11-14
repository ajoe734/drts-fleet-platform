import { CanvasCard, CanvasPageHeader } from "@drts/ui-web";
import { buildFleetTheme } from "@/lib/fleet-portal-theme";
import { loginReturnPath } from "@/lib/login-return-path";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

export const dynamic = "force-dynamic";

const th = buildFleetTheme();

export default async function FleetLoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ redirect_uri?: string; error?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const locale = await getServerLocale();

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
            title={t("login.title", locale)}
            subtitle={t("login.subtitle", locale)}
          />

          {params.error ? (
            <div
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
              <strong>{t("login.error.title", locale)}</strong> {params.error}
            </div>
          ) : null}

          <form
            action="/api/auth/login"
            method="GET"
            style={{ marginTop: 24, display: "grid" }}
          >
            <input
              type="hidden"
              name="redirect_uri"
              value={loginReturnPath(params.redirect_uri)}
            />
            <button
              type="submit"
              style={{
                padding: "12px 18px",
                borderRadius: 6,
                background: th.accent,
                color: th.accentBg,
                border: "none",
                fontWeight: 700,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              {t("login.google", locale)}
            </button>
          </form>

          <p
            style={{
              marginTop: 24,
              paddingTop: 16,
              borderTop: `1px solid ${th.border}`,
              fontSize: 12,
              color: th.textDim,
              lineHeight: 1.6,
            }}
          >
            {t("login.securityNote", locale)}
          </p>
        </CanvasCard>
      </div>
    </main>
  );
}
