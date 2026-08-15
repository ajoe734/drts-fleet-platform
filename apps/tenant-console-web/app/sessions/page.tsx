import type { TenantSessionInventoryRecord } from "@drts/contracts";
import { CanvasCard, CanvasPageHeader, CanvasPill, buildCanvasTheme } from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";
import { formatDateTime } from "@/lib/formatters";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import { revokeTenantSessionAction } from "./actions";

export const dynamic = "force-dynamic";

const th = buildCanvasTheme({ surface: "tenant", dark: true, density: "compact" });

function sessionStatusLabel(status: TenantSessionInventoryRecord["status"], locale: Parameters<typeof t>[1]) {
  return t(`sessions.status.${status}`, locale);
}

function sessionStatusTone(status: TenantSessionInventoryRecord["status"]) {
  if (status === "active") return "success" as const;
  if (status === "compromised") return "danger" as const;
  return "neutral" as const;
}

export default async function SessionsPage() {
  const locale = await getServerLocale();
  let sessions: TenantSessionInventoryRecord[] = [];
  let loadError = "";
  try {
    const client = await getTenantClient();
    sessions = await client.listTenantSessions();
  } catch (error) {
    loadError = error instanceof Error ? error.message : t("sessions.error.loadFailed", locale);
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
                  {[
                    t("sessions.table.subject", locale),
                    t("sessions.table.authMethod", locale),
                    t("sessions.table.status", locale),
                    t("sessions.table.lastSeen", locale),
                    t("sessions.table.expires", locale),
                    t("sessions.table.action", locale),
                  ].map((label) => (
                    <th key={label} style={{ padding: "10px 8px", textAlign: "left", color: th.textMuted, fontSize: 12 }}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => (
                  <tr key={session.sessionId} style={{ borderTop: `1px solid ${th.border}` }}>
                    <td style={{ padding: "12px 8px" }}>{session.subject ?? session.principalId}</td>
                    <td style={{ padding: "12px 8px" }}>{session.authMethod}</td>
                    <td style={{ padding: "12px 8px" }}><CanvasPill theme={th} tone={sessionStatusTone(session.status)}>{sessionStatusLabel(session.status, locale)}</CanvasPill></td>
                    <td style={{ padding: "12px 8px" }}>{formatDateTime(session.lastSeenAt, locale)}</td>
                    <td style={{ padding: "12px 8px" }}>{formatDateTime(session.expiresAt, locale)}</td>
                    <td style={{ padding: "12px 8px" }}>
                      {session.status === "active" ? (
                        <form action={revokeTenantSessionAction} style={{ display: "grid", gap: 6 }}>
                          <input type="hidden" name="sessionId" value={session.sessionId} />
                          <input
                            name="reason"
                            placeholder={t("sessions.action.reasonPlaceholder", locale)}
                            aria-label={t("sessions.action.reasonAriaLabel", locale, {
                              subject: session.subject ?? session.sessionId,
                            })}
                          />
                          <button type="submit">{t("sessions.action.revoke", locale)}</button>
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
