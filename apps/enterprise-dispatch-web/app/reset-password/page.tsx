import { ECard } from "@/components/ent-kit";
import { PortalResetPasswordForm } from "@drts/ui-web/client";
import { enterpriseTheme as th } from "@/lib/enterprise-theme";
import { buildPortalAuthMessages } from "@/lib/portal-auth-messages";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

export const dynamic = "force-dynamic";

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
        <ECard t={th} title={t("resetPassword.title", undefined, locale)} sub={t("resetPassword.description", undefined, locale)}>
          {token ? (
            <PortalResetPasswordForm
              messages={buildPortalAuthMessages(locale)}
              endpoint="/api/auth/tenant/password-reset/confirm"
              token={token}
              successHref="/login"
            />
          ) : (
            <p role="alert">{t("resetPassword.invalidLink", undefined, locale)}</p>
          )}
        </ECard>
      </div>
    </main>
  );
}
