import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CanvasCard, CanvasPageHeader, buildCanvasTheme } from "@drts/ui-web";
import { PortalTotpSetupPanel } from "@drts/ui-web/client";

import { getTenantSession } from "@/lib/api-client";
import { TENANT_CSRF_COOKIE_NAME, TENANT_LOGIN_PATH } from "@/lib/auth/constants";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import { buildPortalAuthMessages } from "@/lib/portal-auth-messages";

export const dynamic = "force-dynamic";

const th = buildCanvasTheme({ surface: "tenant", dark: true, density: "compact" });

export default async function TotpSetupPage() {
  const session = await getTenantSession();
  if (!session) {
    redirect(TENANT_LOGIN_PATH);
  }

  const [cookieStore, locale] = await Promise.all([cookies(), getServerLocale()]);
  const csrfToken = cookieStore.get(TENANT_CSRF_COOKIE_NAME)?.value;
  const messages = buildPortalAuthMessages(locale);

  return (
    <main style={{ padding: 24, background: th.bg, color: th.text, minHeight: "100dvh" }}>
      <div style={{ width: "min(520px, 100%)", margin: "0 auto" }}>
        <CanvasCard theme={th} style={{ padding: 28 }}>
          <CanvasPageHeader theme={th} title={t("totp.enrollTitle", locale)} />
          <div style={{ marginTop: 20 }}>
            <PortalTotpSetupPanel
              messages={messages}
              csrfToken={csrfToken}
              enrollEndpoint="/api/auth/tenant/mfa/totp/enroll"
              confirmEndpoint="/api/auth/tenant/mfa/totp/confirm"
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
