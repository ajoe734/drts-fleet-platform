import { CanvasCard, CanvasPageHeader } from "@drts/ui-web";
import { PortalForgotPasswordForm } from "@drts/ui-web/client";
import { buildFleetTheme } from "@/lib/fleet-portal-theme";
import { buildPortalAuthMessages } from "@/lib/portal-auth-messages";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

export const dynamic = "force-dynamic";

const th = buildFleetTheme();

export default async function ForgotPasswordPage() {
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
          <CanvasPageHeader theme={th} title={t("forgotPassword.title", locale)} subtitle={t("forgotPassword.description", locale)} />
          <div style={{ marginTop: 20 }}>
            <PortalForgotPasswordForm
              messages={buildPortalAuthMessages(locale)}
              endpoint="/api/auth/password-reset/request"
            />
          </div>
          <div style={{ marginTop: 20 }}>
            <a href="/login" style={{ fontSize: 13, color: th.textDim }}>
              {t("passwordSetup.backToLogin", locale)}
            </a>
          </div>
        </CanvasCard>
      </div>
    </main>
  );
}
