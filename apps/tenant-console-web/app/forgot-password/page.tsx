import { CanvasCard, CanvasPageHeader, buildCanvasTheme } from "@drts/ui-web";
import { PortalForgotPasswordForm } from "@drts/ui-web/client";

import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import { buildPortalAuthMessages } from "@/lib/portal-auth-messages";

export const dynamic = "force-dynamic";

const th = buildCanvasTheme({ surface: "tenant", dark: true, density: "compact" });

export default async function ForgotPasswordPage() {
  const locale = await getServerLocale();
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
      <div style={{ width: "min(480px, 100%)" }}>
        <CanvasCard theme={th} style={{ padding: 28 }}>
          <CanvasPageHeader theme={th} title={t("forgotPassword.title", locale)} />
          <div style={{ marginTop: 20 }}>
            <PortalForgotPasswordForm
              messages={messages}
              endpoint="/api/auth/tenant/password-reset/request"
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
