import Link from "next/link";
import { AppShellCard } from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

export default async function FeatureFlagsPage() {
  const locale = await getServerLocale();
  const client = await getTenantClient();

  let flags: unknown[] = [];
  let error: string | null = null;

  try {
    const summary = await client.getFeatureFlags();
    flags = summary.flags;
  } catch (e) {
    error = e instanceof Error ? e.message : t("featureFlags.error.unknown", locale);
  }

  return (
    <main className="app-grid">
      <AppShellCard
        title={t("featureFlags.title", locale)}
        description={t("featureFlags.description", locale, { count: flags.length })}
      >
        {error && (
          <div className="error-banner">
            <strong>{t("featureFlags.error.label", locale)}</strong> {error}
          </div>
        )}

        {flags.length > 0 ? (
          <div className="data-table">
            <table>
              <thead>
                <tr>
                  <th>{t("featureFlags.table.key", locale)}</th>
                  <th>{t("featureFlags.table.status", locale)}</th>
                  <th>{t("featureFlags.table.description", locale)}</th>
                  <th>{t("featureFlags.table.updated", locale)}</th>
                </tr>
              </thead>
              <tbody>
                {flags.map((flag: any, i: number) => (
                  <tr key={i}>
                    <td>
                      <code>{flag.key}</code>
                    </td>
                    <td>
                      {flag.enabled
                        ? t("featureFlags.status.enabled", locale)
                        : t("featureFlags.status.disabled", locale)}
                    </td>
                    <td>{flag.description}</td>
                    <td>
                      {flag.updatedAt
                        ? new Date(flag.updatedAt).toLocaleString()
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-state">{t("featureFlags.empty", locale)}</p>
        )}

        <Link className="route-link" href="/">
          <strong>{t("featureFlags.backHome.title", locale)}</strong>
          {t("featureFlags.backHome.description", locale)}
        </Link>
      </AppShellCard>
    </main>
  );
}
