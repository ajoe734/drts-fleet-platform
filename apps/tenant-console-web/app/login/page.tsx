import { redirect } from "next/navigation";
import {
  CanvasCard,
  CanvasPageHeader,
  CanvasPill,
  buildCanvasTheme,
} from "@drts/ui-web";
import { REALM_COLORS } from "@drts/ui-tokens";
import { getTenantSession } from "@/lib/api-client";
import { sanitizeReturnPath } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{
    redirect_uri?: string;
    return_url?: string;
    error?: string;
    message?: string;
  }>;
}) {
  const session = await getTenantSession();
  const params = (await searchParams) ?? {};
  const rawRedirectUri = params.redirect_uri || params.return_url || "/";
  const sanitizedRedirect = sanitizeReturnPath(rawRedirectUri);

  if (session) {
    redirect(sanitizedRedirect);
  }

  const tenantColors = REALM_COLORS.tenant.dark;

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
      <div style={{ width: "min(520px, 100%)", display: "grid", gap: 20 }}>
        <CanvasCard theme={th} style={{ padding: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <CanvasPill
              theme={th}
              tone="neutral"
              style={{
                background: tenantColors.bg,
                color: tenantColors.fg,
                borderColor: tenantColors.border,
                fontWeight: 700,
              }}
            >
              TENANT REALM
            </CanvasPill>
          </div>

          <CanvasPageHeader
            theme={th}
            title="Tenant Console Sign-In"
            subtitle="Sign in with your organization's managed OIDC identity to access tenant operations, billing, and fulfillment controls."
          />

          {params.error ? (
            <div
              style={{
                marginTop: 16,
                padding: "12px 16px",
                borderRadius: 8,
                background: "rgba(248, 113, 113, 0.12)",
                border: "1px solid rgba(252, 165, 165, 0.34)",
                color: "#FCA5A5",
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              <strong>Authentication Error:</strong> {params.error}
              {params.message ? <p style={{ marginTop: 4 }}>{params.message}</p> : null}
            </div>
          ) : null}

          <form
            action="/api/auth/tenant/login"
            method="GET"
            style={{ marginTop: 24, display: "grid", gap: 16 }}
          >
            <input
              type="hidden"
              name="redirect_uri"
              value={sanitizedRedirect}
            />

            <div style={{ display: "grid", gap: 6 }}>
              <label
                htmlFor="tenant_id"
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: th.textMuted,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Tenant ID / Hint (Optional)
              </label>
              <input
                id="tenant_id"
                name="tenant_id"
                type="text"
                placeholder="e.g. tenant-acme-001"
                style={{
                  background: th.surfaceLo,
                  border: `1px solid ${th.border}`,
                  borderRadius: 6,
                  padding: "10px 12px",
                  color: th.text,
                  fontSize: 13,
                  outline: "none",
                }}
              />
            </div>

            <button
              type="submit"
              style={{
                marginTop: 8,
                padding: "12px 18px",
                borderRadius: 6,
                background: tenantColors.fg,
                color: "#0F2A28",
                border: "none",
                fontWeight: 700,
                fontSize: 14,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                transition: "opacity 0.15s ease",
              }}
            >
              Sign in with OIDC · 透過 OIDC 登入
            </button>
          </form>

          <div
            style={{
              marginTop: 24,
              paddingTop: 16,
              borderTop: `1px solid ${th.border}`,
              fontSize: 12,
              color: th.textDim,
              lineHeight: 1.6,
            }}
          >
            <p>
              Managed HttpOnly session cookies and same-origin CSRF protection
              are enforced. Browser clients never receive readable bearer tokens.
            </p>
          </div>
        </CanvasCard>
      </div>
    </main>
  );
}
