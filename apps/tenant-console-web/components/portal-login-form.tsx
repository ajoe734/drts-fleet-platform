"use client";

import { PortalPasswordLoginForm } from "@drts/ui-web/client";

import { t, type Locale } from "@/lib/translations";
import { buildPortalAuthMessages } from "@/lib/portal-auth-messages";

/** PWD-LOGIN-009: password login section rendered alongside the existing
 * Google/OIDC form on /login. A client component because the form needs
 * fetch + local state; the Google/OIDC form stays a plain server-rendered
 * GET form above it. */
export function PortalLoginFormSection({
  locale,
  redirectUri,
}: {
  locale: Locale;
  redirectUri: string;
}) {
  const messages = buildPortalAuthMessages(locale);

  return (
    <div style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid rgba(255,255,255,0.12)" }}>
      <p style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.7 }}>
        {t("login.password.divider", locale)}
      </p>
      <PortalPasswordLoginForm
        messages={messages}
        endpoint="/api/auth/tenant/password-login"
        forgotPasswordHref="/forgot-password"
        successHref={redirectUri}
      />
    </div>
  );
}
