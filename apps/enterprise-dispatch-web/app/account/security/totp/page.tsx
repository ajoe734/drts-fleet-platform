import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ECard } from "@/components/ent-kit";
import { PortalTotpSetupPanel } from "@drts/ui-web/client";
import { TENANT_CSRF_COOKIE_NAME } from "@drts/tenant-auth/constants";
import {
  ENTERPRISE_TENANT_SESSION_COOKIE,
  verifyEnterpriseTenantSession,
} from "@/lib/enterprise-session.server";
import { enterpriseTheme as th } from "@/lib/enterprise-theme";
import { buildPortalAuthMessages } from "@/lib/portal-auth-messages";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

export const dynamic = "force-dynamic";

export default async function TotpSetupPage() {
  const cookieStore = await cookies();
  const verified = await verifyEnterpriseTenantSession(
    cookieStore.get(ENTERPRISE_TENANT_SESSION_COOKIE)?.value,
  );
  if (!verified.session) {
    redirect("/login?redirect_uri=%2Faccount%2Fsecurity%2Ftotp");
  }
  const csrfToken = cookieStore.get(TENANT_CSRF_COOKIE_NAME)?.value;
  const locale = await getServerLocale();

  return (
    <main style={{ padding: 24, background: th.bg, color: th.ink, minHeight: "100dvh", fontFamily: th.sans }}>
      <div style={{ width: "min(520px, 100%)", margin: "0 auto" }}>
        <ECard t={th} title={t("totp.enrollTitle", undefined, locale)}>
          <PortalTotpSetupPanel
            messages={buildPortalAuthMessages(locale)}
            csrfToken={csrfToken}
            enrollEndpoint="/api/auth/tenant/mfa/totp/enroll"
            confirmEndpoint="/api/auth/tenant/mfa/totp/confirm"
          />
          <div style={{ marginTop: 16 }}>
            <a href="/account/security" style={{ fontSize: 13, color: th.muted }}>
              {t("accountSecurity.title", undefined, locale)}
            </a>
          </div>
        </ECard>
      </div>
    </main>
  );
}
