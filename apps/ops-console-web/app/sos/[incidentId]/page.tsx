"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiClientError } from "@drts/api-client";
import type {
  DriverRegistryRecord,
  IdentityContext,
  IncidentRecord,
  IncidentTimelineEntry,
  VehicleRegistryRecord,
} from "@drts/contracts";
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
import {
  DEFAULT_OPS_ACTOR_ID,
  createOpsDispatchEventSource,
  getOpsClient,
} from "@/lib/api-client";
import {
import { useTranslation } from "@/lib/i18n";
  buildDriverNameMap,
  buildSosQueueRows,
  buildVehiclePlateMap,
  formatSosActorLabel,
  formatSosTimestamp,
  getSosSupplementText,
  getSosTimelineTitle,
  getSosTimelineTone,
  inferSosTimelineActorRealm,
  isSosIncident,
  unwrapListItems,
  type SosPillTone,
} from "@/lib/sos-view-model";

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

type NoticeState = {
  tone: SosPillTone;
  title: string;
  body: string;
} | null;

type TimelineView = {
  at: string;
  tone: CanvasTone;
  title: string;
  body: string;
  actor: string | null;
  actorRealm: ReturnType<typeof inferSosTimelineActorRealm>;
};

function ActorChip({ realm }: { realm: TimelineView["actorRealm"] }) {
  const palette = theme.realm[realm];

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: 999,
        border: `1px solid ${palette.bd}`,
        background: palette.bg,
        color: palette.fg,
        fontSize: 10.5,
        lineHeight: 1,
        padding: "3px 7px",
        textTransform: "uppercase",
      }}
    >
      {realm}
    </span>
  );
}

export default function SosDetailPage() {
  const { t } = useTranslation();
  const { incidentId } = useParams() as { incidentId: string };
  const router = useRouter();
  const [incident, setIncident] = useState<IncidentRecord | null>(null);
  const [timeline, setTimeline] = useState<IncidentTimelineEntry[]>([]);
  const [drivers, setDrivers] = useState<DriverRegistryRecord[]>([]);
  const [vehicles, setVehicles] = useState<VehicleRegistryRecord[]>([]);
  const [identity, setIdentity] = useState<IdentityContext | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeState>(null);
  const [nowMs, setNowMs] = useState<number>(Date.now());

  const driverNamesById = buildDriverNameMap(drivers);
  const platesByVehicleId = buildVehiclePlateMap(vehicles);
  const sosRow = incident
    ? buildSosQueueRows([incident], {
        nowMs,
        driverNamesById,
        platesByVehicleId,
      })[0]
    : undefined;
  const currentActorId = identity?.actorId?.trim() || DEFAULT_OPS_ACTOR_ID;
  const currentActorLabel = formatSosActorLabel(currentActorId);

  const fetchData = async () => {
    try {
      const client = getOpsClient();
      const [incidentRes, timelineRes, driverRes, vehicleRes, identityRes] =
        await Promise.all([
          client.get<IncidentRecord>(`/api/incidents/${incidentId}`),
          client.get<any>(`/api/incidents/${incidentId}/timeline`),
          client.get<any>("/api/regulatory-registry/drivers").catch(() => []),
          client.get<any>("/api/regulatory-registry/vehicles").catch(() => []),
          client
            .get<IdentityContext>("/api/identity/context")
            .catch(() => null as IdentityContext | null),
        ]);

      setIncident(incidentRes);
      setTimeline(unwrapListItems<IncidentTimelineEntry>(timelineRes));
      setDrivers(unwrapListItems<DriverRegistryRecord>(driverRes));
      setVehicles(unwrapListItems<VehicleRegistryRecord>(vehicleRes));
      setIdentity(identityRes);
      setErrorMsg(null);
    } catch (error) {
      console.error("Failed to load SOS incident detail", error);
      setErrorMsg("無法載入 SOS 詳情，請確認事件編號或後端連線。");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();

    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 5000);

    let sse: EventSource | null = null;
    try {
      sse = createOpsDispatchEventSource();
      sse.addEventListener("message", () => {
        void fetchData();
      });
      sse.addEventListener("incident_created", () => {
        void fetchData();
      });
      sse.addEventListener("incident_updated", () => {
        void fetchData();
      });
      sse.addEventListener("driver_location_updated", () => {
        void fetchData();
      });
    } catch (error) {
      console.error("Failed to initialize SOS detail SSE", error);
    }

    return () => {
      clearInterval(timer);
      if (sse) {
        sse.close();
      }
    };
  }, [incidentId]);

  const handleAcknowledge = async () => {
    setNotice(null);

    try {
      const client = getOpsClient();
      await client.patch(`/api/incidents/${incidentId}`, {
        body: {
          assignedTo: currentActorId,
        },
      });

      setNotice({
        tone: "success",
        title: "已確認接手",
        body: `${currentActorLabel} 已取得此 SOS 事件的處理權。`,
      });
      await fetchData();
    } catch (error) {
      if (
        error instanceof ApiClientError &&
        error.code === "INCIDENT_ASSIGNMENT_CONFLICT"
      ) {
        const winner =
          typeof error.details?.existingAssignment === "string"
            ? error.details.existingAssignment
            : "其他值班人員";
        setNotice({
          tone: "warn",
          title: "First-writer-wins",
          body: `${winner} 已先確認此事件，畫面已同步最新處理權。`,
        });
        await fetchData();
        return;
      }

      console.error("Failed to acknowledge SOS incident", error);
      setNotice({
        tone: "danger",
        title: "確認接手失敗",
        body: "系統未能完成處理權寫入，請稍後再試。",
      });
    }
  };

  const handleStartInvestigation = async () => {
    setNotice(null);

    try {
      const client = getOpsClient();
      await client.patch(`/api/incidents/${incidentId}`, {
        body: {
          status: "investigating",
        },
      });

      setNotice({
        tone: "success",
        title: "已開始調查",
        body: "事件狀態已切換為調查中。",
      });
      await fetchData();
    } catch (error) {
      console.error("Failed to start SOS investigation", error);
      setNotice({
        tone: "danger",
        title: "開始調查失敗",
        body: "系統未能更新事件狀態，請稍後再試。",
      });
    }
  };

  const handleClose = async () => {
    setNotice(null);

    try {
      const client = getOpsClient();
      await client.patch(`/api/incidents/${incidentId}`, {
        body: {
          status: "closed",
        },
      });

      setNotice({
        tone: "success",
        title: "已結案",
        body: "SOS 事件已完成 closeout。",
      });
      await fetchData();
    } catch (error) {
      console.error("Failed to close SOS incident", error);
      setNotice({
        tone: "danger",
        title: "結案失敗",
        body: "系統未能更新事件狀態，請稍後再試。",
      });
    }
  };

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100%",
          background: theme.bg,
          color: theme.textMuted,
          padding: 24,
        }}
      >
        {t("sos.detail.loading")}
      </div>
    );
  }

  if (errorMsg || !incident) {
    return (
      <div style={{ minHeight: "100%", background: theme.bg, padding: 24 }}>
        <Banner
          theme={theme}
          tone="danger"
          icon="warn"
          title={t("sos.detail.loadErrorTitle")}
          body={errorMsg || "找不到該 SOS 事件。"}
        />
        <div style={{ marginTop: 14 }}>
          <Btn theme={theme} onClick={() => router.push("/sos")}>
            {t("sos.detail.backToQueue")}
          </Btn>
        </div>
      </div>
    );
  }

  if (!isSosIncident(incident) || !sosRow) {
    return (
      <div style={{ minHeight: "100%", background: theme.bg, padding: 24 }}>
        <Banner
          theme={theme}
          tone="warn"
          icon="warn"
          title={t("sos.detail.notSosTitle")}
          body="此案件不屬於 SOS 值班佇列，請返回事故中心或 SOS 佇列。"
        />
        <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
          <Btn theme={theme} onClick={() => router.push("/sos")}>
            {t("sos.detail.backToQueue")}
          </Btn>
          <Btn
            theme={theme}
            onClick={() => router.push(`/incidents/${incident.incidentId}`)}
          >
            {t("sos.detail.openIncident")}
          </Btn>
        </div>
      </div>
    );
  }

  const isAcked = Boolean(incident.assignedTo);
  const isInvestigating = incident.status === "investigating";
  const isClosed =
    incident.status === "resolved" || incident.status === "closed";
  const supplementText = getSosSupplementText(incident);
  const timelineEntries: TimelineView[] =
    timeline.length > 0
      ? timeline.map((entry) => ({
          at: formatSosTimestamp(entry.createdAt),
          tone: getSosTimelineTone(entry),
          title: getSosTimelineTitle(entry),
          body: entry.note || "—",
          actor: entry.actor || null,
          actorRealm: inferSosTimelineActorRealm(entry),
        }))
      : [
          {
            at: sosRow.occurredAtLabel,
            tone: "danger",
            title: "系統收到通報",
            body: `關聯自 ${sosRow.eventNo}`,
            actor: incident.relatedDriverId,
            actorRealm: "driver",
          },
          ...(incident.assignedTo
            ? [
                {
                  at: formatSosTimestamp(incident.updatedAt),
                  tone: "success" as const,
                  title: "值班人員已確認",
                  body: `${formatSosActorLabel(incident.assignedTo)} 接手處理`,
                  actor: incident.assignedTo,
                  actorRealm: "ops" as const,
                },
              ]
            : []),
        ];

  return (
    <div style={{ minHeight: "100%", background: theme.bg }}>
      <PageHeader
        theme={theme}
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span>{sosRow.eventNo}</span>
            <Pill theme={theme} tone={sosRow.statusTone} dot>
              {sosRow.statusLabel}
            </Pill>
            <Pill theme={theme} tone={sosRow.severityTone}>
              {sosRow.severityLabel}
            </Pill>
            {incident.assignedTo ? (
              <Pill theme={theme} tone="success">
                {t("sos.detail.ackBy", { actor: formatSosActorLabel(incident.assignedTo) })}
              </Pill>
            ) : null}
          </div>
        }
        subtitle={`${sosRow.typeLabel} · ${sosRow.driverLabel} · ${sosRow.plateLabel} · ${sosRow.orderLabel}`}
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <Btn
              theme={theme}
              icon="arrow-left"
              onClick={() => router.push("/sos")}
            >
              {t("sos.detail.backToQueueShort")}
            </Btn>
            {!isAcked && !isClosed ? (
              <Btn theme={theme} variant="primary" onClick={handleAcknowledge}>
                {t("sos.action.acknowledge")}
              </Btn>
            ) : null}
            {isAcked && !isInvestigating && !isClosed ? (
              <Btn
                theme={theme}
                variant="primary"
                onClick={handleStartInvestigation}
              >
                {t("sos.action.investigate")}
              </Btn>
            ) : null}
            {isInvestigating ? (
              <Btn theme={theme} variant="primary" onClick={handleClose}>
                {t("sos.action.close")}
              </Btn>
            ) : null}
            <Btn
              theme={theme}
              onClick={() => router.push(`/incidents/${incidentId}`)}
            >
              {t("sos.detail.openIncident")}
            </Btn>
          </div>
        }
      />

      <div
        style={{
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {notice ? (
          <Banner
            theme={theme}
            tone={notice.tone}
            icon={notice.tone === "success" ? "check" : "warn"}
            title={notice.title}
            body={notice.body}
          />
        ) : null}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.45fr 1fr",
            gap: 16,
            alignItems: "start",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Card theme={theme} padding={0} title={t("sos.detail.mapTitle")}>
              <div
                style={{
                  height: 210,
                  background: `linear-gradient(135deg, ${theme.accentBg}, ${theme.surfaceLo})`,
                  position: "relative",
                  borderRadius: "0 0 12px 12px",
                  overflow: "hidden",
                  borderTop: `1px solid ${theme.border}`,
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    backgroundImage: `radial-gradient(${theme.borderStrong} 1px, transparent 1px)`,
                    backgroundSize: "24px 24px",
                    opacity: 0.35,
                  }}
                />
                {incident.location ? (
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
                ) : null}
                <div
                  style={{
                    position: "absolute",
                    left: 12,
                    right: 12,
                    bottom: 10,
                    fontSize: 11,
                    background: theme.surface,
                    padding: "6px 9px",
                    borderRadius: 6,
                    color: theme.textMuted,
                    border: `1px solid ${theme.border}`,
                    boxShadow: theme.shadowSm,
                  }}
                >
                  {incident.location || "尚未收到定位地址"} ·{" "}
                  {sosRow.occurredAtLabel}
                </div>
              </div>
            </Card>

            <Card
              theme={theme}
              title={t("sos.detail.timelineTitle")}
              subtitle="SSE 驅動更新；事件、處理權與狀態變更全部保留在同一路徑"
            >
              <ol
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                {timelineEntries.map((entry, index) => (
                  <li
                    key={`${entry.title}-${entry.at}-${index}`}
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
                            entry.tone === "success"
                              ? theme.success
                              : entry.tone === "danger"
                                ? theme.danger
                                : entry.tone === "warn"
                                  ? theme.warn
                                  : theme.accent,
                          boxShadow: `0 0 0 3px ${
                            entry.tone === "success"
                              ? theme.successBg
                              : entry.tone === "danger"
                                ? theme.dangerBg
                                : entry.tone === "warn"
                                  ? theme.warnBg
                                  : theme.accentBg
                          }`,
                        }}
                      />
                      {index < timelineEntries.length - 1 ? (
                        <span
                          style={{
                            flex: 1,
                            width: 1,
                            background: theme.border,
                            margin: "6px 0",
                          }}
                        />
                      ) : null}
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
                          {entry.title}
                        </span>
                        <span
                          style={{
                            fontSize: 10.5,
                            color: theme.textDim,
                            fontFamily: theme.monoFamily,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {entry.at}
                        </span>
                      </div>
                      {entry.actor ? (
                        <div
                          style={{
                            marginTop: 4,
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            color: theme.textMuted,
                            fontSize: 11,
                          }}
                        >
                          <ActorChip realm={entry.actorRealm} />
                          <span>{entry.actor}</span>
                        </div>
                      ) : null}
                      <div
                        style={{
                          marginTop: 5,
                          color: theme.textMuted,
                          fontSize: 12,
                          lineHeight: 1.5,
                        }}
                      >
                        {entry.body}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </Card>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Card theme={theme} title={t("sos.detail.summaryTitle")}>
              <DL
                theme={theme}
                cols={1}
                items={[
                  { k: "事件編號", v: sosRow.eventNo, mono: true },
                  { k: "狀態", v: sosRow.statusLabel },
                  { k: "嚴重度", v: sosRow.severityLabel },
                  { k: "已經過", v: sosRow.elapsedLabel, mono: true },
                  { k: "值班確認人", v: sosRow.ackLabel },
                  { k: "回報來源", v: sosRow.driverLabel },
                ]}
              />
            </Card>

            <Card theme={theme} title={t("sos.detail.contextTitle")}>
              <DL
                theme={theme}
                cols={1}
                items={[
                  { k: "駕駛", v: sosRow.driverLabel },
                  { k: "車牌", v: sosRow.plateLabel, mono: true },
                  { k: "行程", v: sosRow.orderLabel, mono: true },
                  { k: "位置", v: sosRow.locationLabel },
                  { k: "通報時間", v: sosRow.occurredAtLabel, mono: true },
                  { k: "事故中心 ID", v: incident.incidentId, mono: true },
                ]}
              />
            </Card>

            <Card theme={theme} title={t("sos.detail.supplementTitle")}>
              {supplementText ? (
                <div
                  style={{
                    color: theme.text,
                    lineHeight: 1.6,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {supplementText}
                </div>
              ) : (
                <div style={{ color: theme.textMuted, lineHeight: 1.6 }}>
                  {t("sos.detail.noSupplement")}
                </div>
              )}
            </Card>

            <Card theme={theme} title={t("sos.detail.attachmentsTitle")}>
              <div style={{ color: theme.textMuted, lineHeight: 1.6 }}>
                {t("sos.detail.noAttachments")}
              </div>
            </Card>

            <Card theme={theme} title={t("sos.detail.linkedIncidentTitle")}>
              <DL
                theme={theme}
                cols={1}
                items={[
                  {
                    k: "事故中心案件",
                    v: (
                      <Link
                        href={`/incidents/${incident.incidentId}`}
                        style={{ color: theme.accent, textDecoration: "none" }}
                      >
                        {incident.incidentId}
                      </Link>
                    ),
                  },
                  {
                    k: "申訴案件",
                    v: incident.relatedComplaintCaseNo ? (
                      <Link
                        href={`/complaints?caseNo=${encodeURIComponent(
                          incident.relatedComplaintCaseNo,
                        )}`}
                        style={{ color: theme.accent, textDecoration: "none" }}
                      >
                        {incident.relatedComplaintCaseNo}
                      </Link>
                    ) : (
                      "—"
                    ),
                  },
                  {
                    k: "服務補救",
                    v:
                      incident.serviceRecoveryActions.length > 0
                        ? `${incident.serviceRecoveryActions.length} 筆`
                        : "—",
                  },
                ]}
              />
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
