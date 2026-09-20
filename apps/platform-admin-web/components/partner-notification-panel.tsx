"use client";

import React, { useEffect, useState, useCallback } from "react";
import { usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import {
  CanvasBanner as Banner,
  CanvasBtn as Btn,
  CanvasCard as Card,
  CanvasDL as DL,
  CanvasPill as Pill,
  CanvasTable as Table,
  buildCanvasTheme,
  type CanvasTableColumn,
} from "@drts/ui-web";

export function PartnerNotificationPanel({ entrySlug }: { entrySlug: string }) {
  const client = usePlatformAdminClient();
  const theme = buildCanvasTheme({ surface: "platform" });
  const { t } = useTranslation();
  
  const [binding, setBinding] = useState<any>(null);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ kind: "error" | "404" | "403" | "409", message: string } | null>(null);
  const [actionInFlight, setActionInFlight] = useState(false);

  const fetchState = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [bReq, dReq] = await Promise.allSettled([
        client.getPartnerEntryNotificationBinding(entrySlug),
        client.listPartnerNotificationDeliveries(entrySlug, { pageSize: 10 })
      ]);
      
      if (bReq.status === 'rejected') {
        const status = bReq.reason?.status;
        if (status === 404) {
          setBinding(null);
        } else if (status === 403) {
          setError({ kind: "403", message: "Forbidden" });
          setLoading(false);
          return;
        } else {
          setError({ kind: "error", message: bReq.reason?.message || "Failed to load binding" });
        }
      } else {
        setBinding(bReq.value);
      }

      if (dReq.status === 'rejected') {
        if (!error && dReq.reason?.status !== 404) {
          setError({ kind: "error", message: dReq.reason?.message || "Failed to load deliveries" });
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
  }, [client, entrySlug, error]);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  const handleTest = async () => {
    setActionInFlight(true);
    try {
      const res = await client.testPartnerEntryNotificationBinding(entrySlug);
      if (res?.kind === "failed") {
        setError({ kind: "error", message: res.failure?.detail || "Test failed" });
      } else {
        await fetchState();
      }
    } catch (e: any) {
      setError({ kind: e.status === 409 ? "409" : "error", message: e.message });
    } finally {
      setActionInFlight(false);
    }
  };
  
  const handleEnable = async () => {
    if (!binding) return;
    setActionInFlight(true);
    try {
      await client.enablePartnerEntryNotificationBinding(entrySlug, binding.version);
      await fetchState();
    } catch (e: any) {
      setError({ kind: e.status === 409 ? "409" : "error", message: e.message });
    } finally {
      setActionInFlight(false);
    }
  };
  
  const handleDisable = async () => {
    if (!binding) return;
    setActionInFlight(true);
    try {
      await client.disablePartnerEntryNotificationBinding(entrySlug, binding.version);
      await fetchState();
    } catch (e: any) {
      setError({ kind: e.status === 409 ? "409" : "error", message: e.message });
    } finally {
      setActionInFlight(false);
    }
  };
  
  const handleRetry = async (outboxId: string) => {
    setActionInFlight(true);
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

  const deliveryColumns: CanvasTableColumn<any>[] = [
    { k: "outboxId", h: t("partnerNotification.outboxId"), r: (row: any) => row.outboxId },
    { k: "status", h: t("partnerNotification.status"), r: (row: any) => {
      let label = row.status;
      if (label === "delivered") {
        label = t("partnerNotification.delivered");
      }
      return (
        <Pill theme={theme} tone={row.status === "failed" ? "danger" : row.status === "delivered" ? "success" : "neutral"}>
          {label}
        </Pill>
      );
    }},
    { k: "stage", h: t("partnerNotification.stage"), r: (row: any) => row.deliveryStage || "unknown" },
    { h: t("partnerNotification.reason"), r: (row: any) => row.failureReason || "—" },
    { h: t("partnerNotification.retry"), r: (row: any) => {
      const canRetry = row.status === "failed" && 
                       ["automatic", "manual_only", "configuration_blocked"].includes(row.retryDisposition) &&
                       new Date(row.expiresAt) > new Date();
      return (
        <Btn theme={theme} size="xs" disabled={!canRetry || actionInFlight} onClick={() => handleRetry(row.outboxId)}>
          {t("partnerNotification.retry")}
        </Btn>
      );
    }}
  ];

  if (loading) {
    return <div data-testid="loading-state">Loading...</div>;
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {error && (
        <Banner 
          theme={theme} 
          tone="danger" 
          title={error.kind === "409" ? "Conflict" : "Error"} 
          body={error.message} 
        />
      )}
      <Card theme={theme} title={t("partnerNotification.title")} subtitle={t("partnerNotification.subtitle")}>
        {binding ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <DL theme={theme} cols={2} items={[
              { label: t("partnerNotification.state"), value: binding.state },
              { label: t("partnerNotification.webhookId"), value: binding.webhookId },
            ]} />
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <Btn theme={theme} onClick={handleTest} disabled={actionInFlight}>{t("partnerNotification.test")}</Btn>
              <Btn theme={theme} onClick={handleEnable} disabled={binding.state === "ready" || actionInFlight}>{t("partnerNotification.enable")}</Btn>
              <Btn theme={theme} onClick={handleDisable} variant="secondary" disabled={binding.state === "disabled" || actionInFlight}>{t("partnerNotification.disable")}</Btn>
            </div>
          </div>
        ) : (
          <Banner theme={theme} tone="warn" title={t("partnerNotification.noBinding")} body={t("partnerNotification.noBindingBody")} />
        )}
      </Card>
      <Card theme={theme} title={t("partnerNotification.recent")} subtitle={t("partnerNotification.recentSubtitle")}>
        <Banner theme={theme} tone="info" title={t("partnerNotification.privacyNotice")} body={t("partnerNotification.privacyBody")} />
        <Table theme={theme} dense columns={deliveryColumns} rows={deliveries} />
      </Card>
    </div>
  );
}
