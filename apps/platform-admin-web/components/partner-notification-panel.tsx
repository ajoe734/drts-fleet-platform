"use client";

import { useEffect, useState, useCallback } from "react";
import { usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import { CanvasBanner, buildCanvasTheme } from "@drts/ui-web";
import { formInputStyle, formLabelStyle, nestedCardStyle } from "@/components/governance-form-styles";

export function PartnerNotificationPanel({ entrySlug }: { entrySlug: string }) {
  const client = usePlatformAdminClient();
  const theme = buildCanvasTheme({ surface: "platform" });
  const { t } = useTranslation();

  const [binding, setBinding] = useState<any>(null);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ kind: "error" | "404" | "403" | "409", message: string } | null>(null);
  const [actionInFlight, setActionInFlight] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editWebhookId, setEditWebhookId] = useState("");

  const safeTranslate = useCallback((key: string, fallback: string) => {
    const translation = t(key);
    return translation === key ? fallback : translation;
  }, [t]);

  const fetchState = useCallback(async () => {
    setLoading(true);
    try {
      const [bReq, dReq] = await Promise.allSettled([
        client.getPartnerEntryNotificationBinding(entrySlug),
        client.listPartnerNotificationDeliveries(entrySlug, { pageSize: 10 })
      ]);

      if (bReq.status === 'rejected') {
        const statusCode = bReq.reason?.statusCode;
        if (statusCode === 404) {
          setBinding(null);
          // Only clear 404/403 so we don't erase action errors
          setError((prev) => (prev?.kind === "404" || prev?.kind === "403" ? null : prev));
        } else if (statusCode === 403) {
          setError({ kind: "403", message: "Forbidden" });
        } else {
          setError({ kind: "error", message: bReq.reason?.message || "Failed to load binding" });
        }
      } else {
        setBinding(bReq.value);
        setEditWebhookId(bReq.value?.webhookId || "");
        setError((prev) => (prev?.kind === "404" || prev?.kind === "403" ? null : prev));
      }

      if (dReq.status === 'rejected') {
        if (dReq.reason?.statusCode !== 404) {
          setError((prev) => prev || { kind: "error", message: dReq.reason?.message || "Failed to load deliveries" });
        }
        setDeliveries([]);
      } else {
        setDeliveries(dReq.value?.items || []);
      }
    } catch (e: any) {
      setError({ kind: "error", message: e.message || String(e) });
    } finally {
      setLoading(false);
    }
  }, [client, entrySlug]);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  const handleTest = async () => {
    setActionInFlight(true);
    setError(null);
    try {
      const res = await client.testPartnerEntryNotificationBinding(entrySlug);
      if (res?.kind === "failed") {
        setError({ kind: "error", message: res.failure?.detail || res.failure?.failureReason || "Test failed" });
      } else {
        await fetchState();
      }
    } catch (e: any) {
      setError({ kind: e.statusCode === 409 ? "409" : "error", message: e.message });
    } finally {
      setActionInFlight(false);
    }
  };

  const handleEnable = async () => {
    if (!binding) return;
    setActionInFlight(true);
    setError(null);
    try {
      await client.enablePartnerEntryNotificationBinding(entrySlug, binding.version);
      await fetchState();
    } catch (e: any) {
      setError({ kind: e.statusCode === 409 ? "409" : "error", message: e.message });
      if (e.statusCode === 409) await fetchState();
    } finally {
      setActionInFlight(false);
    }
  };

  const handleDisable = async () => {
    if (!binding) return;
    setActionInFlight(true);
    setError(null);
    try {
      await client.disablePartnerEntryNotificationBinding(entrySlug, binding.version);
      await fetchState();
    } catch (e: any) {
      setError({ kind: e.statusCode === 409 ? "409" : "error", message: e.message });
      if (e.statusCode === 409) await fetchState();
    } finally {
      setActionInFlight(false);
    }
  };

  const handleUpdate = async () => {
    setActionInFlight(true);
    setError(null);
    try {
      const payload = {
        webhookId: editWebhookId,
        eventTypes: binding?.eventTypes || ["ride_assigned", "eta_changed", "ride_arriving", "ride_started", "ride_completed"],
        expectedVersion: binding?.version || 0
      };
      await client.updatePartnerEntryNotificationBinding(entrySlug, payload);
      setIsEditing(false);
      await fetchState();
    } catch (e: any) {
      setError({ kind: e.statusCode === 409 ? "409" : "error", message: e.message });
      if (e.statusCode === 409) await fetchState();
    } finally {
      setActionInFlight(false);
    }
  };

  const handleRetry = async (outboxId: string) => {
    setActionInFlight(true);
    setError(null);
    try {
      const res = await client.retryPartnerNotificationDelivery(entrySlug, outboxId);
      if (res?.kind === "failed") {
        setError({ kind: "error", message: res.failure?.failureReason || "Retry failed" });
      } else {
        await fetchState();
      }
    } catch (e: any) {
      setError({ kind: "error", message: e.message });
    } finally {
      setActionInFlight(false);
    }
  };

  if (loading && !binding && deliveries.length === 0) {
    return <div data-testid="loading-state" style={{ padding: 16 }}>{t("partnerNotification.loading")}</div>;
  }

  return (
    <div data-testid="partner-notification-placeholder" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
      <CanvasBanner 
        theme={theme} 
        tone="info" 
        title="Pending Design Handoff" 
        body={`The canonical notification canvas for partner ${entrySlug} is currently missing. A functional unstyled interface is provided for API interaction.`} 
      />

      {error && (
        <div data-testid="error-banner" style={{ padding: 12, background: "#fee2e2", color: "#991b1b", borderRadius: 8 }}>
          <strong>{error.kind === "409" ? t("partnerNotification.conflict") : t("partnerNotification.error")}</strong>: {error.message}
        </div>
      )}

      <div style={nestedCardStyle}>
        <h3 style={{ margin: "0 0 12px 0" }}>{t("partnerNotification.title")}</h3>
        <p style={{ color: "#64748b", margin: "0 0 16px 0", fontSize: 13 }}>{t("partnerNotification.subtitle")}</p>

        {binding ? (
          isEditing ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <label style={{ display: "block" }}>
                <div style={formLabelStyle}>{t("partnerNotification.webhookId")}</div>
                <input 
                  style={formInputStyle} 
                  value={editWebhookId} 
                  onChange={(e) => setEditWebhookId(e.target.value)} 
                  disabled={actionInFlight} 
                />
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={handleUpdate} disabled={actionInFlight}>{t("partnerNotification.save")}</button>
                <button onClick={() => setIsEditing(false)} disabled={actionInFlight}>{t("partnerNotification.cancel")}</button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div><strong>{t("partnerNotification.state")}:</strong> {safeTranslate(`partnerNotification.state.${binding.state}`, binding.state)}</div>
              <div><strong>{t("partnerNotification.webhookId")}:</strong> {binding.webhookId}</div>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button onClick={handleTest} disabled={actionInFlight}>{t("partnerNotification.test")}</button>
                <button onClick={handleEnable} disabled={binding.state === "ready" || actionInFlight}>{t("partnerNotification.enable")}</button>
                <button onClick={handleDisable} disabled={binding.state === "disabled" || actionInFlight}>{t("partnerNotification.disable")}</button>
                <button onClick={() => setIsEditing(true)} disabled={actionInFlight}>{t("partnerNotification.edit")}</button>
              </div>
            </div>
          )
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ padding: 12, background: "#fffbeb", color: "#b45309", borderRadius: 8 }}>
              <strong>{t("partnerNotification.noBinding")}</strong>
              <p style={{ margin: "4px 0 0 0" }}>{t("partnerNotification.noBindingBody")}</p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <label style={{ display: "block" }}>
                <div style={formLabelStyle}>{t("partnerNotification.webhookId")}</div>
                <input 
                  style={formInputStyle} 
                  value={editWebhookId} 
                  onChange={(e) => setEditWebhookId(e.target.value)} 
                  disabled={actionInFlight} 
                />
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={handleUpdate} disabled={actionInFlight}>{t("partnerNotification.create")}</button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div style={nestedCardStyle}>
        <h3 style={{ margin: "0 0 12px 0" }}>{t("partnerNotification.recent")}</h3>
        <p style={{ color: "#64748b", margin: "0 0 16px 0", fontSize: 13 }}>{t("partnerNotification.recentSubtitle")}</p>
        <div style={{ padding: 12, background: "#f0f9ff", color: "#0369a1", borderRadius: 8, marginBottom: 16 }}>
          <strong>{t("partnerNotification.privacyNotice")}</strong>
          <p style={{ margin: "4px 0 0 0" }}>{t("partnerNotification.privacyBody")}</p>
        </div>
        
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #e2e8f0", textAlign: "left" }}>
              <th style={{ padding: 8 }}>{t("partnerNotification.outboxId")}</th>
              <th style={{ padding: 8 }}>{t("partnerNotification.status")}</th>
              <th style={{ padding: 8 }}>{t("partnerNotification.stage")}</th>
              <th style={{ padding: 8 }}>{t("partnerNotification.reason")}</th>
              <th style={{ padding: 8 }}>{t("partnerNotification.retry")}</th>
            </tr>
          </thead>
          <tbody>
            {deliveries.map((row) => {
              const canRetry = row.status === "failed" &&
                               ["automatic", "manual_only", "configuration_blocked"].includes(row.retryDisposition) &&
                               new Date(row.expiresAt) > new Date();
              return (
                <tr key={row.outboxId} style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <td style={{ padding: 8 }}>{row.outboxId.slice(0, 8)}...</td>
                  <td style={{ padding: 8 }}>
                    {row.status === "delivered" ? t("partnerNotification.delivered") : safeTranslate(`partnerNotification.state.${row.status}`, row.status)}
                  </td>
                  <td style={{ padding: 8 }}>{row.deliveryStage ? safeTranslate(`partnerNotification.stage.${row.deliveryStage}`, row.deliveryStage) : t("common.na")}</td>
                  <td style={{ padding: 8 }}>{row.failureReason ? safeTranslate(`partnerNotification.reason.${row.failureReason}`, row.failureReason) : "—"}</td>
                  <td style={{ padding: 8 }}>
                    <button disabled={!canRetry || actionInFlight} onClick={() => handleRetry(row.outboxId)}>
                      {t("partnerNotification.retry")}
                    </button>
                  </td>
                </tr>
              );
            })}
            {deliveries.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: 16, textAlign: "center", color: "#64748b" }}>
                  {t("common.na")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
