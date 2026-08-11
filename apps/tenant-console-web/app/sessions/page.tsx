import type { TenantSessionInventoryRecord } from "@drts/contracts";
import { CanvasCard, CanvasPageHeader, CanvasPill, buildCanvasTheme } from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import { revokeTenantSessionAction } from "./actions";

export const dynamic = "force-dynamic";

const th = buildCanvasTheme({ surface: "tenant", dark: true, density: "compact" });

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

export default async function SessionsPage() {
  const locale = await getServerLocale();
  let sessions: TenantSessionInventoryRecord[] = [];
  let loadError = "";
  try {
    sessions = await getTenantClient().listTenantSessions();
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Unable to load tenant sessions.";
  }

  return (
    <main style={{ padding: 24, display: "grid", gap: 16 }}>
      <CanvasPageHeader
        theme={th}
        title={t("sessions.header.title", locale)}
        subtitle={t("sessions.header.subtitle", locale)}
      />
      <CanvasCard theme={th}>
        {loadError ? (
          <p style={{ color: th.danger }}>{loadError}</p>
        ) : sessions.length === 0 ? (
          <p style={{ color: th.textMuted }}>{t("sessions.empty", locale)}</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", color: th.text }}>
              <thead>
                <tr>
                  {['Subject', 'Auth method', 'Status', 'Last seen', 'Expires', 'Action'].map((label) => (
                    <th key={label} style={{ padding: "10px 8px", textAlign: "left", color: th.textMuted, fontSize: 12 }}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => (
                  <tr key={session.sessionId} style={{ borderTop: `1px solid ${th.border}` }}>
                    <td style={{ padding: "12px 8px" }}>{session.subject ?? session.principalId}</td>
                    <td style={{ padding: "12px 8px" }}>{session.authMethod}</td>
                    <td style={{ padding: "12px 8px" }}><CanvasPill theme={th} tone={session.status === "active" ? "success" : "neutral"}>{session.status}</CanvasPill></td>
                    <td style={{ padding: "12px 8px" }}>{formatDate(session.lastSeenAt)}</td>
                    <td style={{ padding: "12px 8px" }}>{formatDate(session.expiresAt)}</td>
                    <td style={{ padding: "12px 8px" }}>
                      {session.status === "active" ? (
                        <form action={revokeTenantSessionAction} style={{ display: "grid", gap: 6 }}>
                          <input type="hidden" name="sessionId" value={session.sessionId} />
                          <input name="reason" placeholder="Reason" aria-label={`Reason for revoking ${session.subject ?? session.sessionId}`} />
                          <button type="submit">Revoke</button>
                        </form>
                      ) : <span style={{ color: th.textMuted }}>{t("sessions.noAction", locale)}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CanvasCard>
    </main>
  );
}
