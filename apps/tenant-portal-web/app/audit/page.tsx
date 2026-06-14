import Link from "next/link";
import { getAuditLogs } from "./actions";
import {
  describeRoleSnapshot,
  getTenantRoleSnapshot,
  roleCatalogLabels,
} from "@/lib/rbac";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import { AppShellCard } from "@drts/ui-web";

export default async function AuditPage() {
  const locale = await getServerLocale();
  const { logs, error } = await getAuditLogs();
  const roleSnapshot = await getTenantRoleSnapshot();
  const combinedError = [error, roleSnapshot.identityError]
    .filter(Boolean)
    .join(" | ");
  const catalogLabels = roleCatalogLabels(roleSnapshot, locale);

  return (
    <main className="app-grid">
      <AppShellCard
        title={t("audit.title", locale)}
        description={t("audit.description", locale, {
          role: describeRoleSnapshot(roleSnapshot, locale),
        })}
      >
        <div className="callout-panel">
          <strong>{t("audit.governance.heading", locale)}</strong>
          <p>{t("audit.governance.body", locale)}</p>
          <div className="chip-row">
            {catalogLabels.length > 0 ? (
              catalogLabels.map((roleLabel) => (
                <span className="status-chip" key={roleLabel}>
                  {roleLabel}
                </span>
              ))
            ) : (
              <span className="status-chip">
                {t("audit.authority.unavailable", locale)}
              </span>
            )}
          </div>
        </div>

        {combinedError && (
          <div className="error-banner">
            <strong>{t("audit.error.label", locale)}</strong> {combinedError}
          </div>
        )}

        {logs.length > 0 ? (
          <div className="data-table">
            <table>
              <thead>
                <tr>
                  <th>{t("audit.table.time", locale)}</th>
                  <th>{t("audit.table.actor", locale)}</th>
                  <th>{t("audit.table.module", locale)}</th>
                  <th>{t("audit.table.action", locale)}</th>
                  <th>{t("audit.table.resource", locale)}</th>
                  <th>{t("audit.table.requestId", locale)}</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.auditId}>
                    <td>{new Date(log.createdAt).toLocaleString()}</td>
                    <td>
                      {log.actorId ? (
                        <span title={log.actorId}>{log.actorType}</span>
                      ) : (
                        <span className="muted">{log.actorType}</span>
                      )}
                    </td>
                    <td>{log.moduleName}</td>
                    <td>
                      <code>{log.actionName}</code>
                    </td>
                    <td>
                      {log.resourceType}
                      {log.resourceId ? `: ${log.resourceId}` : ""}
                    </td>
                    <td>
                      <code className="muted">{log.requestId}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-state">{t("audit.empty.logs", locale)}</p>
        )}

        <Link className="route-link" href="/" style={{ marginTop: "1rem" }}>
          <strong>{t("audit.link.home.title", locale)}</strong>
          {t("audit.link.home.desc", locale)}
        </Link>
        <Link className="route-link" href="/settings">
          <strong>{t("audit.link.settings.title", locale)}</strong>
          {t("audit.link.settings.desc", locale)}
        </Link>
      </AppShellCard>
    </main>
  );
}
