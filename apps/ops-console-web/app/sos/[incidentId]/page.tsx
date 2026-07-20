"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  CanvasBanner as Banner,
  CanvasBtn as Btn,
  CanvasCard as Card,
  CanvasDL as DL,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  buildCanvasTheme,
  type CanvasTone,
} from "@drts/ui-web";
import type { IncidentRecord, IncidentTimelineEntry } from "@drts/contracts";
import { getOpsClient, createOpsDispatchEventSource } from "@/lib/api-client";
import { ExternalLink, Play } from "lucide-react";
import { useSosSound } from "@/components/sos-sound-context";

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

interface TimelineEvent {
  at: string;
  tone: CanvasTone;
  t: string;
  body: string;
  actor?: string;
  actorRealm?: string;
}

export default function SosDetailPage() {
  const { incidentId } = useParams() as { incidentId: string };
  const router = useRouter();
  const { soundOff, audioBlocked, handleEnableSound } = useSosSound();

  const [incident, setIncident] = useState<IncidentRecord | null>(null);
  const [timeline, setTimeline] = useState<IncidentTimelineEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Fetch incident details & timeline
  const fetchData = async () => {
    try {
      const client = getOpsClient();
      const incRes = await client.get<any>(`/api/incidents/${incidentId}`);
      setIncident(incRes);

      const timelineRes = await client.get<any>(
        `/api/incidents/${incidentId}/timeline`,
      );
      const items = Array.isArray(timelineRes)
        ? timelineRes
        : timelineRes?.items || [];
      setTimeline(items);
      setErrorMsg(null);
    } catch (err: any) {
      console.error("Failed to fetch incident details:", err);
      setErrorMsg("無法載入事件詳情，請確認事件編號或後端連線。");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();

    // Wire SSE stream for live updates
    let sse: EventSource | null = null;
    try {
      sse = createOpsDispatchEventSource();
      sse.addEventListener("message", () => {
        void fetchData();
      });
      sse.addEventListener("order_created", () => {
        void fetchData();
      });
      sse.addEventListener("order_updated", () => {
        void fetchData();
      });
      sse.addEventListener("dispatch_job_updated", () => {
        void fetchData();
      });
      sse.addEventListener("driver_location_updated", () => {
        void fetchData();
      });
      sse.addEventListener("supply_lifecycle_updated", () => {
        void fetchData();
      });
      sse.addEventListener("incident_created", () => {
        void fetchData();
      });
      sse.addEventListener("incident_updated", () => {
        void fetchData();
      });
    } catch (e) {
      console.error("SSE connection error:", e);
    }

    return () => {
      if (sse) sse.close();
    };
  }, [incidentId]);

  if (loading) {
    return (
      <div
        style={{
          padding: 24,
          color: theme.textMuted,
          background: theme.bg,
          minHeight: "100%",
        }}
      >
        正在載入事件資料...
      </div>
    );
  }

  if (errorMsg || !incident) {
    return (
      <div style={{ padding: 24, background: theme.bg, minHeight: "100%" }}>
        <Banner
          theme={theme}
          tone="danger"
          icon="warn"
          title="載入錯誤"
          body={errorMsg || "找不到該事件。"}
        />
        <div style={{ marginTop: 14 }}>
          <Btn theme={theme} onClick={() => router.push("/sos")}>
            返回 SOS 佇列
          </Btn>
        </div>
      </div>
    );
  }

  // Parse event number
  let eventNo = incident.incidentId;
  const match = incident.title.match(/SOS-\d+-\w+/);
  if (match) {
    eventNo = match[0];
  }

  const isAcked = !!incident.assignedTo;
  const isInvestigating = incident.status === "investigating";
  const isClosed =
    incident.status === "closed" || incident.status === "resolved";

  // Actions
  const handleAcknowledge = async () => {
    try {
      const client = getOpsClient();
      const freshInc = await client.get<IncidentRecord>(
        `/api/incidents/${incidentId}`,
      );
      if (freshInc.assignedTo) {
        alert(
          `確認失敗：已由 ${freshInc.assignedTo} 先行接手！ (First-Writer-Wins)`,
        );
        void fetchData();
        return;
      }
      await client.patch(`/api/incidents/${incidentId}`, {
        body: {
          assignedTo: "王小明", // S3O_ACTOR display name
        },
      });
      void fetchData();
    } catch (err) {
      console.error(err);
      alert("確認接手失敗。");
    }
  };

  const handleStartInvestigation = async () => {
    try {
      const client = getOpsClient();
      await client.patch(`/api/incidents/${incidentId}`, {
        body: {
          status: "investigating",
        },
      });
      void fetchData();
    } catch (err) {
      console.error(err);
      alert("啟動調查失敗。");
    }
  };

  const handleClose = async () => {
    try {
      const client = getOpsClient();
      await client.patch(`/api/incidents/${incidentId}`, {
        body: {
          status: "closed",
        },
      });
      void fetchData();
    } catch (err) {
      console.error(err);
      alert("結案失敗。");
    }
  };

  // Map backend status to SOS labels
  let statusLabel = "待確認";
  let statusTone: CanvasTone = "danger";
  if (incident.status === "open" && incident.assignedTo) {
    statusLabel = "已確認";
    statusTone = "accent";
  } else if (incident.status === "investigating") {
    statusLabel = "調查中";
    statusTone = "warn";
  } else if (incident.status === "resolved") {
    statusLabel = "駕駛回報誤觸";
    statusTone = "neutral";
  } else if (incident.status === "closed") {
    statusLabel = "已結案";
    statusTone = "success";
  }

  // Mapped category
  let categoryLabel = "其他";
  if (incident.category === "traffic") categoryLabel = "交通事故";
  else if (incident.category === "passenger_injury") categoryLabel = "乘客急病";
  else if (incident.category === "safety") categoryLabel = "治安事件";

  // Mapped severity
  const severityLabel = incident.severity === "critical" ? "重大" : "一般";

  // Map timeline events
  const timelineEvents: TimelineEvent[] = timeline.map((entry) => {
    let tone: CanvasTone = "info";
    const isCreated =
      entry.action === "incident_created" || entry.action === "created";
    const isAssigned =
      entry.action === "incident_assigned" || entry.action === "assigned";
    const isStatusChanged =
      entry.action === "status_changed" || entry.action === "statusChanged";
    const isResolved =
      entry.action === "incident_resolved" || entry.action === "resolved";
    const isClosed =
      entry.action === "incident_closed" || entry.action === "closed";

    if (isCreated) {
      tone = "danger";
    } else if (isAssigned) {
      tone = "success";
    } else if (
      isStatusChanged &&
      (entry.note.includes("investigating") ||
        entry.note.includes("investigation"))
    ) {
      tone = "warn";
    } else if (isResolved || isClosed) {
      tone = "success";
    }

    const tTime = new Date(entry.createdAt).toLocaleTimeString("zh-TW");

    // Clean up title
    let actionTitle = entry.action;
    if (isCreated) {
      actionTitle = "系統收到通報";
    } else if (isAssigned) {
      actionTitle = "值班人員已確認";
    } else if (
      isStatusChanged &&
      (entry.note.includes("investigating") ||
        entry.note.includes("investigation"))
    ) {
      actionTitle = "開始調查";
    } else if (isResolved) {
      actionTitle = "已處理";
    } else if (isClosed) {
      actionTitle = "已結案";
    }

    return {
      at: tTime,
      tone,
      t: actionTitle,
      body: entry.note,
      actor: entry.actor,
      actorRealm: "ops",
    };
  });

  // If no timeline events exist, add a stub matching design
  if (timelineEvents.length === 0) {
    timelineEvents.push({
      at: new Date(
        incident.occurredAt || incident.createdAt,
      ).toLocaleTimeString("zh-TW"),
      tone: "danger",
      t: "駕駛啟動 SOS",
      body: "行程中長按啟動",
      actor: incident.relatedDriverId || "d_8843",
      actorRealm: "driver",
    });
    timelineEvents.push({
      at: new Date(
        new Date(incident.occurredAt || incident.createdAt).getTime() + 2000,
      ).toLocaleTimeString("zh-TW"),
      tone: "info",
      t: "系統收到通報",
      body: `事件編號 ${eventNo}`,
    });
    if (incident.assignedTo) {
      timelineEvents.push({
        at: new Date(incident.updatedAt).toLocaleTimeString("zh-TW"),
        tone: "success",
        t: "值班人員已確認",
        body: `${incident.assignedTo} 接手處理`,
        actor: incident.assignedTo,
        actorRealm: "ops",
      });
    }
  }

  return (
    <div style={{ background: theme.bg, minHeight: "100%" }}>
      <PageHeader
        theme={theme}
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span>{eventNo}</span>
            <Pill theme={theme} tone={statusTone} dot>
              {statusLabel}
            </Pill>
            {isAcked && (
              <Pill theme={theme} tone="success">
                已由 {incident.assignedTo} 確認接手
              </Pill>
            )}
          </div>
        }
        subtitle={`${categoryLabel} · ${severityLabel} · ${incident.relatedDriverId || "—"} · ${incident.relatedVehicleId || "—"} · ${incident.relatedOrderId || "—"}`}
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <Btn
              theme={theme}
              icon="arrow-left"
              onClick={() => router.push("/sos")}
            >
              返回佇列
            </Btn>
            {!isAcked && (
              <Btn theme={theme} variant="primary" onClick={handleAcknowledge}>
                確認接手
              </Btn>
            )}
            {isAcked && !isInvestigating && !isClosed && (
              <Btn
                theme={theme}
                variant="primary"
                onClick={handleStartInvestigation}
              >
                開始調查
              </Btn>
            )}
            {isInvestigating && (
              <Btn theme={theme} variant="primary" onClick={handleClose}>
                結案
              </Btn>
            )}
            <Link href={`/incidents/${incidentId}`} passHref legacyBehavior>
              <Btn theme={theme}>
                關聯事件案件{" "}
                <ExternalLink size={12} style={{ marginLeft: 4 }} />
              </Btn>
            </Link>
          </div>
        }
      />

      {(soundOff || audioBlocked) && (
        <div style={{ padding: "0 24px 14px 24px" }}>
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
        </div>
      )}

      <div
        style={{
          padding: 24,
          display: "grid",
          gridTemplateColumns: "1.45fr 1fr",
          gap: 16,
          alignItems: "start",
        }}
      >
        {/* Left Column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Map Coordinates Card */}
          <Card theme={theme} padding={0} title="位置 · 通報當下座標">
            <div
              style={{
                height: 190,
                background: `linear-gradient(135deg, ${theme.accentBg}, ${theme.surfaceLo})`,
                position: "relative",
                borderRadius: "0 0 12px 12px",
                overflow: "hidden",
                borderTop: `1px solid ${theme.border}`,
              }}
            >
              {/* Map Mock Grid lines */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  backgroundImage: `radial-gradient(${theme.borderStrong} 1px, transparent 1px)`,
                  backgroundSize: "24px 24px",
                  opacity: 0.35,
                }}
              />
              {/* Red marker in the center */}
              <div
                style={{
                  position: "absolute",
                  left: "46%",
                  top: "40%",
                  transform: "translate(-50%, -50%)",
                }}
              >
                <span
                  style={{
                    display: "block",
                    width: 16,
                    height: 16,
                    borderRadius: 8,
                    background: theme.danger,
                    border: `3px solid ${theme.surface}`,
                    boxShadow: `0 0 0 6px ${theme.danger}33`,
                  }}
                />
              </div>
              {/* Location Tag */}
              <div
                style={{
                  position: "absolute",
                  left: 12,
                  bottom: 10,
                  fontSize: 11,
                  background: theme.surface,
                  padding: "4px 9px",
                  borderRadius: 6,
                  color: theme.textMuted,
                  border: `1px solid ${theme.border}`,
                  boxShadow: theme.shadowSm,
                }}
              >
                {incident.location || "—"} · 精度 12m ·{" "}
                {new Date(
                  incident.occurredAt || incident.createdAt,
                ).toLocaleTimeString("zh-TW")}
              </div>
            </div>
          </Card>

          {/* Timeline Card */}
          <Card
            theme={theme}
            title="SOS 時間軸"
            subtitle="occurredAt / actor / source 完整入稽核"
          >
            <ol
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                display: "flex",
                flexDirection: "column",
                gap: 0,
              }}
            >
              {timelineEvents.map((e, i) => (
                <li
                  key={i}
                  style={{
                    display: "flex",
                    gap: 12,
                    position: "relative",
                    padding: "8px 0",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      flexShrink: 0,
                    }}
                  >
                    <span
                      style={{
                        width: 9,
                        height: 9,
                        borderRadius: 5,
                        marginTop: 4,
                        background:
                          e.tone === "success"
                            ? theme.success
                            : e.tone === "danger"
                              ? theme.danger
                              : e.tone === "warn"
                                ? theme.warn
                                : theme.accent,
                        boxShadow: `0 0 0 3px ${
                          e.tone === "success"
                            ? theme.successBg
                            : e.tone === "danger"
                              ? theme.dangerBg
                              : e.tone === "warn"
                                ? theme.warnBg
                                : theme.accentBg
                        }`,
                      }}
                    />
                    {i < timelineEvents.length - 1 && (
                      <span
                        style={{
                          flex: 1,
                          width: 1,
                          background: theme.border,
                          margin: "6px 0",
                        }}
                      />
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0, paddingBottom: 6 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "baseline",
                        gap: 8,
                        justifyContent: "space-between",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: theme.text,
                        }}
                      >
                        {e.t}
                      </span>
                      <span
                        style={{
                          fontSize: 10.5,
                          color: theme.textDim,
                          fontFamily: theme.monoFamily,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {e.at}
                      </span>
                    </div>
                    {e.actor && (
                      <div
                        style={{
                          fontSize: 11,
                          color: theme.textMuted,
                          marginTop: 2,
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        {e.actorRealm && (
                          <Pill theme={theme} tone={e.actorRealm as any}>
                            {e.actorRealm}
                          </Pill>
                        )}
                        {e.actor}
                      </div>
                    )}
                    {e.body && (
                      <div
                        style={{
                          fontSize: 12,
                          color: theme.textMuted,
                          marginTop: 4,
                          lineHeight: 1.45,
                        }}
                      >
                        {e.body}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        {/* Right Column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Automated Context Card */}
          <Card theme={theme} title="自動附帶內容">
            <DL
              theme={theme}
              cols={1}
              items={[
                {
                  k: "行程編號",
                  v: incident.relatedOrderId || "—",
                  mono: true,
                },
                {
                  k: "車牌",
                  v: incident.relatedVehicleId || "—",
                  mono: true,
                },
                { k: "駕駛", v: incident.relatedDriverId || "—" },
                {
                  k: "原始觸發時間",
                  v: new Date(
                    incident.occurredAt || incident.createdAt,
                  ).toLocaleString("zh-TW"),
                  mono: true,
                },
                { k: "觸發時網路", v: "連線中 · 即時送達" },
              ]}
            />
          </Card>

          {/* Supplements Card */}
          <Card theme={theme} title="駕駛補充 / 附件">
            {isInvestigating || isClosed ? (
              <>
                <DL
                  theme={theme}
                  cols={1}
                  items={[
                    { k: "事件類型", v: `${categoryLabel} · ${severityLabel}` },
                    {
                      k: "說明",
                      v: incident.description || "無說明",
                    },
                  ]}
                />
                {(() => {
                  const attachments = (incident as any).attachments || [];
                  if (!Array.isArray(attachments) || attachments.length === 0) {
                    return (
                      <div
                        style={{
                          padding: "16px 8px",
                          textAlign: "center",
                          border: `1px dashed ${theme.border}`,
                          borderRadius: 8,
                          background: theme.surfaceLo,
                          color: theme.textDim,
                          fontSize: 12,
                          marginTop: 12,
                        }}
                      >
                        無附件
                      </div>
                    );
                  }
                  return (
                    <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                      {attachments.map((a: any, i: number) => {
                        const isAudio = a.type === "audio" || a.type === "voice";
                        if (isAudio) {
                          return (
                            <div
                              key={i}
                              style={{
                                flex: 1,
                                minWidth: 100,
                                borderRadius: 9,
                                background: theme.surfaceLo,
                                border: `1px solid ${theme.border}`,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 6,
                                fontSize: 11.5,
                                color: theme.textMuted,
                                cursor: "pointer",
                                padding: "8px 12px",
                              }}
                            >
                              <Play size={13} fill="currentColor" />
                              <span>{a.label || `語音 ${i + 1}`}</span>
                            </div>
                          );
                        }
                        return (
                          <div
                            key={i}
                            style={{
                              width: 74,
                              height: 74,
                              borderRadius: 9,
                              background: theme.surfaceLo,
                              border: `1px solid ${theme.border}`,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 11,
                              color: theme.textMuted,
                            }}
                          >
                            {a.label || `照片 ${i + 1}`}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </>
            ) : (
              <div
                style={{
                  padding: "16px 8px",
                  textAlign: "center",
                  border: `1px dashed ${theme.border}`,
                  borderRadius: 8,
                  background: theme.surfaceLo,
                  color: theme.textDim,
                  fontSize: 12,
                }}
              >
                駕駛尚未補充；不影響值班處置。
              </div>
            )}
          </Card>

          {/* Assignment / Ownership Card */}
          <Card theme={theme} title="處理權">
            <Banner
              theme={theme}
              tone={isAcked ? "success" : "info"}
              icon={isAcked ? "ok" : "info"}
              body={
                isAcked
                  ? `已由 ${incident.assignedTo} 確認接手；其他值班人員不再顯示主要確認按鈕。`
                  : "先確認者取得處理權；其他人將看到目前負責人。"
              }
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
