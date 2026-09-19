"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { usePlatformAdminClient, formatDateTime } from "@/lib/admin-client";
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
  const theme = buildCanvasTheme("platform");
  const [binding, setBinding] = useState<any>(null);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchState = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const b = await client.getPartnerEntryNotificationBinding(entrySlug).catch(() => null);
      setBinding(b);
      const d = await client.listPartnerNotificationDeliveries(entrySlug, { pageSize: 10 }).catch(() => ({ rows: [] as any[], total: 0 }));
      setDeliveries(d.rows || []);
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [client, entrySlug]);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  const handleTest = async () => {
    await client.testPartnerEntryNotificationBinding(entrySlug);
    fetchState();
  };
  const handleEnable = async () => {
    await client.enablePartnerEntryNotificationBinding(entrySlug);
    fetchState();
  };
  const handleDisable = async () => {
    await client.disablePartnerEntryNotificationBinding(entrySlug);
    fetchState();
  };
  const handleRetry = async (outboxId: string) => {
    await client.retryPartnerNotificationDelivery(entrySlug, outboxId);
    fetchState();
  };

  const deliveryColumns: CanvasTableColumn<any>[] = [
    { k: "outboxId", h: "Outbox ID", r: (row: any) => row.outboxId },
    { k: "status", h: "Status", r: (row: any) => (
      <Pill theme={theme} tone={row.status === "failed" ? "danger" : row.status === "delivered" ? "success" : "neutral"}>
        {row.status}
      </Pill>
    )},
    { k: "stage", h: "Delivery Stage", r: (row: any) => row.deliveryStage || "unknown" },
    { h: "Failure Reason", r: (row: any) => row.failureReason || "—" },
    { h: "Retry", r: (row: any) => (
      <Btn theme={theme} size="xs" disabled={row.status !== 'failed'} onClick={() => handleRetry(row.outboxId)}>Retry</Btn>
    )}
  ];

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {error && <Banner theme={theme} tone="danger" title="Error" body={error} />}
      <Card theme={theme} title="Notification Binding" subtitle="Manage webhook bindings for passenger notifications">
        {binding ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <DL theme={theme} cols={2} items={[
              { label: "State", value: binding.state },
              { label: "Webhook ID", value: binding.webhookId },
            ]} />
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <Btn theme={theme} onClick={handleTest}>Test Binding</Btn>
              <Btn theme={theme} onClick={handleEnable} disabled={binding.state === "ready"}>Enable</Btn>
              <Btn theme={theme} onClick={handleDisable} variant="secondary" disabled={binding.state === "disabled"}>Disable</Btn>
            </div>
          </div>
        ) : (
          <Banner theme={theme} tone="warn" title="No binding configured" body="This entry has no passenger notification binding." />
        )}
      </Card>
      <Card theme={theme} title="Recent Deliveries" subtitle="Shows recent delivery attempts (unknown device status)">
        <Banner theme={theme} tone="info" title="Privacy notice" body="Device delivery status is unknown. Do not claim the resident has received or read the notification." />
        <Table theme={theme} dense columns={deliveryColumns} rows={deliveries} />
      </Card>
    </div>
  );
}
