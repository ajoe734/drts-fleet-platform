import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CanvasCard, CanvasPageHeader } from "@drts/ui-web";
import { PortalAccountSecurityPanel } from "@drts/ui-web/client";
import { buildFleetTheme } from "@/lib/fleet-portal-theme";
import { buildPortalAuthMessages } from "@/lib/portal-auth-messages";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

export const dynamic = "force-dynamic";

const th = buildFleetTheme();

export default async function AccountSecurityPage() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("drts_session")?.value;
  if (!sessionCookie) {
    redirect("/login?redirect_uri=%2Faccount%2Fsecurity");
  }
  const csrfToken = cookieStore.get("drts_csrf")?.value;
  const locale = await getServerLocale();

  return (
    <main style={{ padding: 24, background: th.bg, color: th.text, minHeight: "100dvh" }}>
      <div style={{ width: "min(640px, 100%)", margin: "0 auto" }}>
        <CanvasCard theme={th} style={{ padding: 28 }}>
          <CanvasPageHeader theme={th} title={t("accountSecurity.title", locale)} />

          <div style={{ marginTop: 20 }}>
            <h2 style={{ fontSize: 15 }}>{t("accountSecurity.passwordSectionTitle", locale)}</h2>
            <p style={{ fontSize: 13, opacity: 0.85 }}>{t("accountSecurity.passwordSectionBody", locale)}</p>
            <a href="/forgot-password" style={{ fontSize: 13 }}>
              {t("accountSecurity.passwordCta", locale)}
            </a>
          </div>

          <div style={{ marginTop: 24 }}>
            <PortalAccountSecurityPanel
              messages={buildPortalAuthMessages(locale)}
              csrfToken={csrfToken}
              sessionsEndpoint="/api/auth/sessions"
              sessionRevokeBase="/api/auth/sessions"
              logoutAllEndpoint="/api/auth/logout-all"
              totpSetupHref="/account/security/totp"
            />
          </div>
        </CanvasCard>
      </div>
    </main>
  );
}
