import { redirect } from "next/navigation";
import { AppShellCard } from "@drts/ui-web";
import { signInTenantPortal } from "./actions";
import {
  getTenantPortalSession,
  TENANT_PORTAL_LOGIN_PATH,
} from "@/lib/api-client";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

const SEEDED_EMAILS = [
  "admin@acme.example",
  "ops@acme.example",
  "finance@acme.example",
  "viewer@acme.example",
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const session = await getTenantPortalSession();
  if (session) {
    redirect("/");
  }

  const locale = await getServerLocale();
  const resolvedSearchParams = (await searchParams) ?? {};

  return (
    <main
      className="app-grid"
      style={{ minHeight: "100vh", placeItems: "center" }}
    >
      <div style={{ width: "min(560px, 100%)" }}>
        <AppShellCard
          title={t("login.card.title", locale)}
          description={t("login.card.description", locale)}
        >
          {resolvedSearchParams.error ? (
            <div className="error-banner">
              <strong>{t("login.error.label", locale)}</strong>{" "}
              {resolvedSearchParams.error}
            </div>
          ) : null}

          <form action={signInTenantPortal} className="form-grid">
            <div className="form-row">
              <label htmlFor="email">{t("login.field.email.label", locale)}</label>
              <input
                id="email"
                name="email"
                type="email"
                placeholder="admin@acme.example"
                required
              />
            </div>
            <div className="form-row">
              <label htmlFor="tenantId">
                {t("login.field.tenantId.label", locale)}
              </label>
              <input
                id="tenantId"
                name="tenantId"
                type="text"
                placeholder={t("login.field.tenantId.placeholder", locale)}
              />
            </div>
            <button type="submit" className="btn-primary">
              {t("login.submit", locale)}
            </button>
          </form>

          <div className="callout-panel" style={{ marginTop: "1rem" }}>
            <strong>{t("login.seeded.title", locale)}</strong>
            <p>{t("login.seeded.description", locale)}</p>
            <div className="chip-row">
              {SEEDED_EMAILS.map((email) => (
                <span className="status-chip" key={email}>
                  {email}
                </span>
              ))}
            </div>
            <p className="muted-copy">
              {t("login.seeded.routeNotice.before", locale)}{" "}
              <code>{TENANT_PORTAL_LOGIN_PATH}</code>{" "}
              {t("login.seeded.routeNotice.after", locale)}
            </p>
          </div>
        </AppShellCard>
      </div>
    </main>
  );
}
