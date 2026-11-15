import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CanvasCard, CanvasPageHeader, buildCanvasTheme } from "@drts/ui-web";
import { PortalAccountSecurityPanel } from "@drts/ui-web/client";

import { getTenantSession } from "@/lib/api-client";
import { TENANT_CSRF_COOKIE_NAME, TENANT_LOGIN_PATH } from "@/lib/auth/constants";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import { buildPortalAuthMessages } from "@/lib/portal-auth-messages";

export const dynamic = "force-dynamic";

const th = buildCanvasTheme({ surface: "tenant", dark: true, density: "compact" });

export default async function AccountSecurityPage() {
  const session = await getTenantSession();
  if (!session) {
    redirect(TENANT_LOGIN_PATH);
  }

  const [cookieStore, locale] = await Promise.all([cookies(), getServerLocale()]);
  const csrfToken = cookieStore.get(TENANT_CSRF_COOKIE_NAME)?.value;
  const messages = buildPortalAuthMessages(locale);

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
              messages={messages}
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
