import { ECard } from "@/components/ent-kit";
import { PortalForgotPasswordForm } from "@drts/ui-web/client";
import { enterpriseTheme as th } from "@/lib/enterprise-theme";
import { buildPortalAuthMessages } from "@/lib/portal-auth-messages";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

export const dynamic = "force-dynamic";

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
        color: th.ink,
        fontFamily: th.sans,
      }}
    >
      <div style={{ width: "min(480px, 100%)" }}>
        <ECard t={th} title={t("forgotPassword.title", undefined, locale)} sub={t("forgotPassword.description", undefined, locale)}>
          <PortalForgotPasswordForm
            messages={buildPortalAuthMessages(locale)}
            endpoint="/api/auth/tenant/password-reset/request"
          />
          <div style={{ marginTop: 16 }}>
            <a href="/login" style={{ fontSize: 13, color: th.muted }}>
              {t("passwordSetup.backToLogin", undefined, locale)}
            </a>
          </div>
        </ECard>
      </div>
    </main>
  );
}
