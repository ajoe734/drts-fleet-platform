"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  CanvasBanner as Banner,
  CanvasBtn as Btn,
  CanvasCard as Card,
  CanvasDL as DL,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasTable as Table,
  buildCanvasTheme,
  type CanvasTone,
} from "@drts/ui-web";
import type { IncidentRecord } from "@drts/contracts";
import { getOpsClient } from "@/lib/api-client";
import { useSosSound } from "@/components/sos-sound-context";

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

interface SosRow {
  id: string;
  no: string;
  status: string;
  tone: CanvasTone;
  wait: string;
  driver: string;
  plate: string;
  order: string;
  loc: string;
  type: string;
  ack: string;
  hl: boolean;
  originalRecord: IncidentRecord;
}

function formatAttachmentsSummary(incident: IncidentRecord): string {
  const attachments = (incident as any).attachments;
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return "無";
  }
  const photos = attachments.filter((a: any) => a.type === "image" || a.type === "photo").length;
  const audios = attachments.filter((a: any) => a.type === "audio" || a.type === "voice").length;
  const parts: string[] = [];
  if (photos > 0) parts.push(`照片 ${photos}`);
  if (audios > 0) parts.push(`語音 ${audios}`);
  return parts.length > 0 ? parts.join(" · ") : "無";
}

export default function SosQueuePage() {
  const router = useRouter();
  const {
    incidents,
    soundOff,
    audioBlocked,
    toggleSound,
    handleEnableSound,
    soundTone,
    soundLabel,
    soundTag,
    fetchIncidents,
  } = useSosSound();

  const [nowTime, setNowTime] = useState<number>(Date.now());
  const [errorMsg] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setNowTime(Date.now());
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  // Filter for SOS incidents
  const sosIncidents = incidents.filter(
    (inc: IncidentRecord) =>
      inc.category === "safety" ||
      inc.category === "traffic" ||
      inc.category === "passenger_injury" ||
      (inc.title && inc.title.includes("SOS")),
  );

  // Map to SosRow
  const rows: SosRow[] = sosIncidents.map((incident: IncidentRecord) => {
    const title = incident.title || "";
    let eventNo = incident.incidentId;
    const match = title.match(/SOS-\d+-\w+/);
    if (match) {
      eventNo = match[0];
    }

    let statusText = "待確認";
    let tone: CanvasTone = "danger";
    if (incident.status === "open" && incident.assignedTo) {
      statusText = "已確認";
      tone = "accent";
    } else if (incident.status === "investigating") {
      statusText = "調查中";
      tone = "warn";
    } else if (incident.status === "resolved") {
      statusText = "駕駛回報誤觸";
      tone = "neutral";
    } else if (incident.status === "closed") {
      statusText = "已結案";
      tone = "success";
    }

    // Elapsed wait time: if status === "open" and assignedTo === null
    let waitText = "—";
    if (incident.status === "open" && !incident.assignedTo) {
      const occurred = new Date(incident.occurredAt || incident.createdAt);
      const diff = Math.max(
        0,
        Math.floor((nowTime - occurred.getTime()) / 1000),
      );
      const mins = Math.floor(diff / 60)
        .toString()
        .padStart(2, "0");
      const secs = (diff % 60).toString().padStart(2, "0");
      waitText = `${mins}:${secs}`;
    }

    let typeText = "其他";
    if (incident.category === "traffic") typeText = "交通事故";
    else if (incident.category === "passenger_injury") typeText = "乘客急病";
    else if (incident.category === "safety") typeText = "治安事件";

    return {
      id: incident.incidentId,
      no: eventNo,
      status: statusText,
      tone,
      wait: waitText,
      driver: incident.relatedDriverId || "—",
      plate: incident.relatedVehicleId || "—",
      order: incident.relatedOrderId || "—",
      loc: incident.location || "—",
      type: typeText,
      ack: incident.assignedTo || "—",
      hl: incident.status === "open" && !incident.assignedTo,
      originalRecord: incident,
    };
  });

  // Sort rows: active unacknowledged first, then by trigger time
  rows.sort((a, b) => {
    if (a.hl && !b.hl) return -1;
    if (!a.hl && b.hl) return 1;
    const aTime = new Date(
      a.originalRecord.occurredAt || a.originalRecord.createdAt,
    ).getTime();
    const bTime = new Date(
      b.originalRecord.occurredAt || b.originalRecord.createdAt,
    ).getTime();
    return bTime - aTime;
  });

  // Top unacknowledged event for overlay
  const pendingAlert = rows.find((r) => r.hl);

  const handleAcknowledge = async (incidentId: string) => {
    try {
      const client = getOpsClient();
      // First check if it's already assigned
      const current = incidents.find((i: IncidentRecord) => i.incidentId === incidentId);
      if (current?.assignedTo) {
        alert(
          `確認失敗：已由 ${current.assignedTo} 先行接手！ (First-Writer-Wins)`,
        );
        void fetchIncidents();
        return;
      }

      await client.patch(`/api/incidents/${incidentId}`, {
        body: {
          assignedTo: "王小明", // S3O_ACTOR display name
        },
      });
      void fetchIncidents();
    } catch (err: any) {
      console.error("Failed to acknowledge incident:", err);
      alert("確認接手失敗，請重新整理頁面。");
    }
  };

  return (
    <div
      style={{ position: "relative", minHeight: "100%", background: theme.bg }}
    >
      {/* Background Page Body */}
      <div
        style={{
          opacity: pendingAlert ? 0.35 : 1,
          pointerEvents: pendingAlert ? "none" : "auto",
        }}
      >
        <PageHeader
          theme={theme}
          title={
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span>SOS 緊急事件</span>
              <Pill theme={theme} tone="danger" dot>
                {rows.filter((r) => r.hl).length} 件待確認
              </Pill>
            </div>
          }
          subtitle="線上通報 p95 ≤ 5 秒送達值班端 · 先確認者取得處理權"
          actions={
            <div style={{ display: "flex", gap: 8 }}>
              <Btn theme={theme} icon="filter">
                篩選
              </Btn>
            </div>
          }
        />

        <div
          style={{
            padding: 24,
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          {(soundOff || audioBlocked) && (
            <Banner
              theme={theme}
              tone="warn"
              icon="warn"
              title="SOS 提示音尚未啟用"
              body={
                audioBlocked
                  ? "瀏覽器已封鎖自動播放音效。請點此或與頁面互動以啟用提示音。啟用前系統仍會以持續視覺警示呈現新事件，不會僅依聲音。"
                  : "請點此啟用瀏覽器提示音。啟用前系統仍會以持續視覺警示呈現新事件，不會僅依聲音。"
              }
              actions={
                <Btn
                  theme={theme}
                  size="xs"
                  variant="primary"
                  onClick={handleEnableSound}
                >
                  啟用提示音
                </Btn>
              }
            />
          )}

          {errorMsg && (
            <Banner
              theme={theme}
              tone="danger"
              icon="warn"
              title="系統錯誤"
              body={errorMsg}
            />
          )}

          <Card
            theme={theme}
            padding={0}
            title="SOS 佇列"
            actions={
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  paddingRight: 12,
                }}
              >
                <div onClick={toggleSound} style={{ cursor: "pointer" }}>
                  <Pill theme={theme} tone={soundTone} dot>
                    {soundLabel}
                    <span
                      style={{
                        marginLeft: 4,
                        opacity: 0.6,
                        fontFamily: theme.monoFamily,
                        fontSize: 9,
                      }}
                    >
                      {soundTag}
                    </span>
                  </Pill>
                </div>
              </div>
            }
          >
            <Table
              theme={theme}
              columns={[
                {
                  h: "事件編號",
                  w: 170,
                  mono: true,
                  r: (r: SosRow) => (
                    <Link
                      href={`/sos/${r.id}`}
                      style={{ textDecoration: "none" }}
                    >
                      <span
                        style={{
                          color: r.hl ? theme.danger : theme.accent,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        {r.no}
                      </span>
                    </Link>
                  ),
                },
                {
                  h: "狀態",
                  w: 120,
                  r: (r: SosRow) => (
                    <Pill theme={theme} tone={r.tone} dot>
                      {r.status}
                    </Pill>
                  ),
                },
                {
                  h: "等待",
                  w: 70,
                  mono: true,
                  r: (r: SosRow) => (
                    <span
                      style={{
                        color: r.hl ? theme.danger : theme.text,
                        fontWeight: r.hl ? 700 : 400,
                      }}
                    >
                      {r.wait}
                    </span>
                  ),
                },
                { h: "駕駛", k: "driver", w: 100 },
                { h: "車牌", k: "plate", w: 110, mono: true },
                { h: "行程", k: "order", w: 160, mono: true },
                { h: "位置", k: "loc", w: 220 },
                { h: "事件類型", k: "type", w: 100 },
                { h: "值班確認人", k: "ack", w: 110 },
              ]}
              rows={rows}
            />
          </Card>
        </div>
      </div>

      {/* O01 · Critical Alert Overlay */}
      {pendingAlert && (
        <div
          style={{
            position: "absolute",
            top: "10%",
            left: "50%",
            transform: "translateX(-50%)",
            width: 640,
            background: theme.surface,
            border: `2px solid ${theme.danger}`,
            borderRadius: 14,
            boxShadow: "0 24px 60px -18px rgba(150,20,12,.45)",
            overflow: "hidden",
            zIndex: 9999,
          }}
        >
          {/* Header */}
          <div
            style={{
              background: theme.danger,
              color: "#ffffff",
              padding: "10px 16px",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span style={{ fontSize: 16, display: "inline-flex" }}>⚠️</span>
            <span style={{ fontSize: 14.5, fontWeight: 800, flex: 1 }}>
              SOS 緊急通報 · 待確認
            </span>
            <span
              style={{
                fontFamily: theme.monoFamily,
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              已等待 {pendingAlert.wait}
            </span>
          </div>

          {/* Body */}
          <div style={{ padding: 16 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 14,
              }}
            >
              <span
                style={{
                  fontFamily: theme.monoFamily,
                  fontSize: 16,
                  fontWeight: 800,
                  color: theme.danger,
                }}
              >
                {pendingAlert.no}
              </span>
              <Pill theme={theme} tone="danger" dot>
                {pendingAlert.type} · 重大
              </Pill>
              <span style={{ flex: 1 }} />
              <div onClick={toggleSound} style={{ cursor: "pointer" }}>
                <Pill theme={theme} tone={soundTone} dot>
                  {soundLabel}
                </Pill>
              </div>
            </div>

            <DL
              theme={theme}
              cols={3}
              items={[
                { k: "駕駛", v: pendingAlert.driver },
                { k: "車牌", v: pendingAlert.plate, mono: true },
                { k: "行程", v: pendingAlert.order, mono: true },
                { k: "位置", v: pendingAlert.loc },
                {
                  k: "觸發時間",
                  v: new Date(
                    pendingAlert.originalRecord.occurredAt ||
                      pendingAlert.originalRecord.createdAt,
                  ).toLocaleTimeString("zh-TW"),
                  mono: true,
                },
                { k: "附件", v: formatAttachmentsSummary(pendingAlert.originalRecord) },
              ]}
            />

            {/* Actions */}
            <div
              style={{
                display: "flex",
                gap: 9,
                marginTop: 18,
                alignItems: "center",
              }}
            >
              <Btn
                theme={theme}
                variant="primary"
                onClick={() => void handleAcknowledge(pendingAlert.id)}
              >
                確認接手 · Acknowledge
              </Btn>
              <Btn
                theme={theme}
                onClick={() => router.push(`/sos/${pendingAlert.id}`)}
              >
                開啟詳情
              </Btn>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 11, color: theme.textDim }}>
                此警示不會自動消失
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
