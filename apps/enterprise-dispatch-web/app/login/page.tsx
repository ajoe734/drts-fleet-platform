import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { ECard, EBtnContent, entBtnStyle } from "@/components/ent-kit";
import { PortalPasswordLoginForm } from "@drts/ui-web/client";
import {
  ENTERPRISE_TENANT_SESSION_COOKIE,
  verifyEnterpriseTenantSession,
} from "@/lib/enterprise-session.server";
import { enterpriseTheme as th } from "@/lib/enterprise-theme";
import { buildPortalAuthMessages } from "@/lib/portal-auth-messages";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

export const dynamic = "force-dynamic";

function sanitizeReturnPath(value: string | undefined): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }
  return value;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ redirect_uri?: string; error?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const redirectUri = sanitizeReturnPath(params.redirect_uri);

  const cookieStore = await cookies();
  const verified = await verifyEnterpriseTenantSession(
    cookieStore.get(ENTERPRISE_TENANT_SESSION_COOKIE)?.value,
  );
  if (verified.session) {
    redirect(redirectUri);
  }

  const locale = await getServerLocale();
  const googleHref = `/api/auth/tenant/login?redirect_uri=${encodeURIComponent(redirectUri)}`;

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
        <ECard t={th} title={t("login.title", undefined, locale)} sub={t("login.subtitle", undefined, locale)}>
          {params.error ? (
            <div role="alert" style={{ marginBottom: 16, color: th.danger, fontSize: 13 }}>
              {params.error}
            </div>
          ) : null}

          <a
            href={googleHref}
            style={{ ...entBtnStyle(th, { variant: "primary", block: true }), textDecoration: "none" }}
          >
            <EBtnContent>{t("login.password.signInWithGoogle", undefined, locale)}</EBtnContent>
          </a>

          <div style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid " + th.line }}>
            <p style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em", color: th.muted }}>
              {t("login.password.divider", undefined, locale)}
            </p>
            <PortalPasswordLoginForm
              messages={buildPortalAuthMessages(locale)}
              endpoint="/api/auth/tenant/password-login"
              forgotPasswordHref="/forgot-password"
              successHref={redirectUri}
            />
          </div>
        </ECard>
      </div>
    </main>
  );
}
