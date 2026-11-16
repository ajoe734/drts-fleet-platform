import { CanvasCard, CanvasPageHeader, buildCanvasTheme } from "@drts/ui-web";
import { PortalResetPasswordForm } from "@drts/ui-web/client";

import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import { buildPortalAuthMessages } from "@/lib/portal-auth-messages";

export const dynamic = "force-dynamic";

const th = buildCanvasTheme({ surface: "tenant", dark: true, density: "compact" });

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstParam(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] ?? "" : "";
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const [params, locale] = await Promise.all([searchParams, getServerLocale()]);
  const token = firstParam(params.token);
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
          <CanvasPageHeader theme={th} title={t("resetPassword.title", locale)} subtitle={t("resetPassword.description", locale)} />
          <div style={{ marginTop: 20 }}>
            {token ? (
              <PortalResetPasswordForm
                messages={messages}
                endpoint="/api/auth/tenant/password-reset/confirm"
                token={token}
                successHref="/login"
              />
            ) : (
              <p role="alert">{t("resetPassword.invalidLink", locale)}</p>
            )}
          </div>
        </CanvasCard>
      </div>
    </main>
  );
}
