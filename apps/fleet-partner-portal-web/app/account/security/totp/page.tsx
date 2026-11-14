import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CanvasCard, CanvasPageHeader } from "@drts/ui-web";
import { PortalTotpSetupPanel } from "@drts/ui-web/client";
import { buildFleetTheme } from "@/lib/fleet-portal-theme";
import { buildPortalAuthMessages } from "@/lib/portal-auth-messages";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

export const dynamic = "force-dynamic";

const th = buildFleetTheme();

export default async function TotpSetupPage() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("drts_session")?.value;
  if (!sessionCookie) {
    redirect("/login?redirect_uri=%2Faccount%2Fsecurity%2Ftotp");
  }
  const csrfToken = cookieStore.get("drts_csrf")?.value;
  const locale = await getServerLocale();

  return (
    <main style={{ padding: 24, background: th.bg, color: th.text, minHeight: "100dvh" }}>
      <div style={{ width: "min(520px, 100%)", margin: "0 auto" }}>
        <CanvasCard theme={th} style={{ padding: 28 }}>
          <CanvasPageHeader theme={th} title={t("totp.enrollTitle", locale)} />
          <div style={{ marginTop: 20 }}>
            <PortalTotpSetupPanel
              messages={buildPortalAuthMessages(locale)}
              csrfToken={csrfToken}
              enrollEndpoint="/api/auth/mfa/totp/enroll"
              confirmEndpoint="/api/auth/mfa/totp/confirm"
            />
          </div>
          <div style={{ marginTop: 20 }}>
            <a href="/account/security" style={{ fontSize: 13, color: th.textDim }}>
              {t("accountSecurity.title", locale)}
            </a>
          </div>
        </CanvasCard>
      </div>
    </main>
  );
}
