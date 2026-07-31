"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ApiClientError } from "@drts/api-client";
import type {
  DriverRegistryRecord,
  DriverSosAlertLatencySummary,
  IdentityContext,
  IncidentRecord,
  RecordDriverSosOpsAlertRenderedResult,
  VehicleRegistryRecord,
} from "@drts/contracts";
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
import {
  DEFAULT_OPS_ACTOR_ID,
  createOpsDispatchEventSource,
  getOpsClient,
} from "@/lib/api-client";
import {
  buildDriverNameMap,
  buildSosQueueRows,
  buildVehiclePlateMap,
  collectUnreportedSosIncidentIds,
  formatSosActorLabel,
  isSosIncident,
  unwrapListItems,
  type SosPillTone,
  type SosQueueRow,
} from "@/lib/sos-view-model";
import { useTranslation } from "@/lib/i18n";

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

async function playAlertBeep(): Promise<boolean> {
  if (typeof window === "undefined") {
    return false;
  }

  const audioCtor =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!audioCtor) {
    return false;
  }

  const audioContext = new audioCtor();

  try {
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    await new Promise<void>((resolve) => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();

      oscillator.connect(gain);
      gain.connect(audioContext.destination);

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
      gain.gain.setValueAtTime(0.28, audioContext.currentTime);

      oscillator.onended = () => resolve();
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.22);
    });

    return true;
  } catch {
    return false;
  } finally {
    await audioContext.close().catch(() => undefined);
  }
}

export default function SosQueuePage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [drivers, setDrivers] = useState<DriverRegistryRecord[]>([]);
  const [vehicles, setVehicles] = useState<VehicleRegistryRecord[]>([]);
  const [identity, setIdentity] = useState<IdentityContext | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [soundOff, setSoundOff] = useState<boolean>(false);
  const [soundBlocked, setSoundBlocked] = useState<boolean>(false);
  const [nowMs, setNowMs] = useState<number>(Date.now());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeState>(null);
  const [latencySummary, setLatencySummary] =
    useState<DriverSosAlertLatencySummary | null>(null);
  const [renderReceiptRetry, setRenderReceiptRetry] = useState(0);
  const reportedAlertIdsRef = useRef(new Set<string>());

  const driverNamesById = buildDriverNameMap(drivers);
  const platesByVehicleId = buildVehiclePlateMap(vehicles);
  const rows = buildSosQueueRows(incidents, {
    nowMs,
    driverNamesById,
    platesByVehicleId,
  });
  const pendingCount = rows.filter((row) => row.isPending).length;
  const pendingAlert = rows.find((row) => row.isCriticalAlert);
  const currentActorId = identity?.actorId?.trim() || DEFAULT_OPS_ACTOR_ID;
  const currentActorLabel = formatSosActorLabel(currentActorId);
  const renderedIncidentKey = collectUnreportedSosIncidentIds(
    rows,
    reportedAlertIdsRef.current,
  ).join("|");

  const fetchRuntime = async () => {
    try {
      const client = getOpsClient();
      const [incidentRes, driverRes, vehicleRes, identityRes, latencyRes] =
        await Promise.all([
          client.get<any>("/api/incidents"),
          client.get<any>("/api/regulatory-registry/drivers").catch(() => []),
          client.get<any>("/api/regulatory-registry/vehicles").catch(() => []),
          client
            .get<IdentityContext>("/api/identity/context")
            .catch(() => null as IdentityContext | null),
          client
            .get<DriverSosAlertLatencySummary>(
              "/api/ops/driver-sos/metrics/alert-latency",
            )
            .catch(() => null as DriverSosAlertLatencySummary | null),
        ]);

      setIncidents(
        unwrapListItems<IncidentRecord>(incidentRes).filter((incident) =>
          isSosIncident(incident),
        ),
      );
      setDrivers(unwrapListItems<DriverRegistryRecord>(driverRes));
      setVehicles(unwrapListItems<VehicleRegistryRecord>(vehicleRes));
      setIdentity(identityRes);
      setLatencySummary(latencyRes);
      setLoadError(null);
    } catch (error) {
      console.error("Failed to load SOS incidents", error);
      setLoadError("無法載入 SOS 事件佇列，請檢查後端連線。");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchRuntime();

    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 5000);

    const savedSound = localStorage.getItem("drts-sos-sound-off");
    if (savedSound === "true") {
      setSoundOff(true);
    }

    let sse: EventSource | null = null;
    try {
      sse = createOpsDispatchEventSource();
      sse.addEventListener("message", () => {
        void fetchRuntime();
      });
      sse.addEventListener("driver_location_updated", () => {
        void fetchRuntime();
      });
      sse.addEventListener("order_updated", () => {
        void fetchRuntime();
      });
      sse.addEventListener("incident_created", () => {
        void fetchRuntime();
      });
      sse.addEventListener("incident_updated", () => {
        void fetchRuntime();
      });
    } catch (error) {
      console.error("Failed to initialize SOS SSE", error);
    }

    return () => {
      clearInterval(timer);
      if (sse) {
        sse.close();
      }
    };
  }, []);

  useEffect(() => {
    if (!pendingAlert || soundOff) {
      return;
    }

    let active = true;
    const runBeep = async () => {
      const success = await playAlertBeep();
      if (!active) {
        return;
      }
      setSoundBlocked(!success);
    };

    void runBeep();
    const timer = setInterval(() => {
      void runBeep();
    }, 4000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [pendingAlert, soundOff]);

  useEffect(() => {
    const incidentIds = renderedIncidentKey
      .split("|")
      .filter((incidentId) => incidentId.length > 0);
    if (incidentIds.length === 0) {
      return;
    }

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const frameId = window.requestAnimationFrame(() => {
      if (cancelled) {
        return;
      }
      const renderedAt = new Date().toISOString();
      for (const incidentId of incidentIds) {
        reportedAlertIdsRef.current.add(incidentId);
      }
      void getOpsClient()
        .post<RecordDriverSosOpsAlertRenderedResult>(
          "/api/ops/driver-sos/alerts/rendered",
          { body: { incidentIds, renderedAt } },
        )
        .catch((error) => {
          for (const incidentId of incidentIds) {
            reportedAlertIdsRef.current.delete(incidentId);
          }
          console.error("Failed to record SOS alert render receipt", error);
          if (!cancelled) {
            retryTimer = setTimeout(() => {
              setRenderReceiptRetry((current) => current + 1);
            }, 5000);
          }
        });
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frameId);
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
    };
  }, [renderedIncidentKey, renderReceiptRetry]);

  const toggleSound = async () => {
    const nextSoundOff = !soundOff;
    setSoundOff(nextSoundOff);
    localStorage.setItem("drts-sos-sound-off", String(nextSoundOff));

    if (!nextSoundOff) {
      const success = await playAlertBeep();
      setSoundBlocked(!success);
    } else {
      setSoundBlocked(false);
    }
  };

  const handleAcknowledge = async (incidentId: string) => {
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
      await fetchRuntime();
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
        await fetchRuntime();
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

  const soundTone: CanvasTone = soundBlocked
    ? "warn"
    : soundOff
      ? "warn"
      : "success";
  const soundLabel = soundBlocked
    ? "提示音受阻"
    : soundOff
      ? "提示音未啟用"
      : "提示音已啟用";
  const soundCode = soundBlocked
    ? "sound_blocked"
    : soundOff
      ? "sound_off"
      : "sound_on";

  const soundNotice: NoticeState = soundBlocked
    ? {
        tone: "warn",
        title: "瀏覽器尚未允許 SOS 提示音",
        body: "視覺警示仍會持續顯示；請點一次提示音晶片啟用瀏覽器音訊。",
      }
    : soundOff
      ? {
          tone: "warn",
          title: "SOS 提示音尚未啟用",
          body: "啟用前系統仍會以持續視覺警示呈現新事件，不會僅依聲音。",
        }
      : null;
  const latencyHasSamples =
    latencySummary !== null && latencySummary.sampleCount > 0;
  const latencyWithinTarget =
    latencySummary?.p95LatencyMs !== null &&
    latencySummary?.p95LatencyMs !== undefined &&
    latencySummary.p95LatencyMs <= latencySummary.targetLatencyMs;
  const formatLatency = (value: number | null | undefined) =>
    value === null || value === undefined ? "—" : `${Math.round(value)} ms`;
  const formatRate = (value: number | null | undefined) =>
    value === null || value === undefined
      ? "—"
      : `${(value * 100).toFixed(1)}%`;

  return (
    <div
      style={{ position: "relative", minHeight: "100%", background: theme.bg }}
    >
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
              <span>{t("sos.queue.title")}</span>
              <Pill theme={theme} tone="danger" dot>
                {t("sos.queue.pendingCount", { count: pendingCount })}
              </Pill>
            </div>
          }
          subtitle="線上通報 p95 ≤ 5 秒送達值班端 · 重大事件以持續警示顯示 · 先確認者取得處理權"
          actions={
            <Btn theme={theme} icon="filter">
              {t("sos.queue.filter")}
            </Btn>
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
          {soundNotice ? (
            <Banner
              theme={theme}
              tone={soundNotice.tone}
              icon="warn"
              title={soundNotice.title}
              body={soundNotice.body}
              actions={
                <Btn
                  theme={theme}
                  size="xs"
                  variant="primary"
                  onClick={toggleSound}
                >
                  {soundOff ? "啟用提示音" : "重新檢查提示音"}
                </Btn>
              }
            />
          ) : null}

          {loadError ? (
            <Banner
              theme={theme}
              tone="danger"
              icon="warn"
              title={t("sos.queue.systemErrorTitle")}
              body={loadError}
            />
          ) : null}

          {notice ? (
            <Banner
              theme={theme}
              tone={notice.tone}
              icon={notice.tone === "success" ? "check" : "warn"}
              title={notice.title}
              body={notice.body}
            />
          ) : null}

          <Card
            theme={theme}
            title={t("sos.latency.title")}
            subtitle={t("sos.latency.subtitle")}
            actions={
              <Pill
                theme={theme}
                tone={
                  !latencyHasSamples
                    ? "neutral"
                    : latencyWithinTarget
                      ? "success"
                      : "danger"
                }
                dot
              >
                {t(
                  !latencyHasSamples
                    ? "sos.latency.noEvidence"
                    : latencyWithinTarget
                      ? "sos.latency.withinTarget"
                      : "sos.latency.overTarget",
                )}
              </Pill>
            }
          >
            <DL
              theme={theme}
              cols={5}
              items={[
                {
                  k: t("sos.latency.samples"),
                  v: latencySummary?.sampleCount ?? 0,
                  mono: true,
                },
                {
                  k: "p50",
                  v: formatLatency(latencySummary?.p50LatencyMs),
                  mono: true,
                },
                {
                  k: "p95",
                  v: formatLatency(latencySummary?.p95LatencyMs),
                  mono: true,
                },
                {
                  k: t("sos.latency.maximum"),
                  v: formatLatency(latencySummary?.maxLatencyMs),
                  mono: true,
                },
                {
                  k: t("sos.latency.targetRate"),
                  v: formatRate(latencySummary?.withinTargetRate),
                  mono: true,
                },
              ]}
            />
          </Card>

          <Card
            theme={theme}
            padding={0}
            title={loading ? "載入中..." : "SOS 佇列"}
            actions={
              <button
                type="button"
                onClick={() => {
                  void toggleSound();
                }}
                style={{
                  border: 0,
                  background: "transparent",
                  cursor: "pointer",
                  padding: 12,
                }}
              >
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
                    {soundCode}
                  </span>
                </Pill>
              </button>
            }
          >
            <Table
              theme={theme}
              columns={[
                {
                  h: "事件編號",
                  w: 170,
                  mono: true,
                  r: (row: SosQueueRow) => (
                    <Link
                      href={`/sos/${row.id}`}
                      style={{ textDecoration: "none" }}
                    >
                      <span
                        style={{
                          color: row.highlight ? theme.danger : theme.accent,
                          fontWeight: 700,
                        }}
                      >
                        {row.eventNo}
                      </span>
                    </Link>
                  ),
                },
                {
                  h: "狀態",
                  w: 110,
                  r: (row: SosQueueRow) => (
                    <Pill theme={theme} tone={row.statusTone} dot>
                      {row.statusLabel}
                    </Pill>
                  ),
                },
                {
                  h: "等待",
                  w: 92,
                  mono: true,
                  r: (row: SosQueueRow) => (
                    <span
                      style={{
                        color: row.highlight ? theme.danger : theme.text,
                        fontWeight: row.highlight ? 700 : 400,
                      }}
                    >
                      {row.waitLabel}
                    </span>
                  ),
                },
                { h: "駕駛", k: "driverLabel", w: 110 },
                { h: "車牌", k: "plateLabel", w: 108, mono: true },
                { h: "行程", k: "orderLabel", w: 158, mono: true },
                { h: "位置", k: "locationLabel", w: 220 },
                { h: "事件類型", k: "typeLabel", w: 110 },
                {
                  h: "嚴重度",
                  w: 92,
                  r: (row: SosQueueRow) => (
                    <Pill theme={theme} tone={row.severityTone}>
                      {row.severityLabel}
                    </Pill>
                  ),
                },
                { h: "值班確認人", k: "ackLabel", w: 124 },
              ]}
              rows={rows}
            />
          </Card>
        </div>
      </div>

      {pendingAlert ? (
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
          <div
            style={{
              background: theme.danger,
              color: theme.invert,
              padding: "10px 16px",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span style={{ fontSize: 16 }}>⚠️</span>
            <span style={{ fontSize: 14.5, fontWeight: 800, flex: 1 }}>
              {t("sos.alert.banner")}
            </span>
            <span
              style={{
                fontFamily: theme.monoFamily,
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              {t("sos.alert.waited")} {pendingAlert.waitLabel}
            </span>
          </div>

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
                {pendingAlert.eventNo}
              </span>
              <Pill theme={theme} tone="danger" dot>
                {pendingAlert.typeLabel} · {pendingAlert.severityLabel}
              </Pill>
              <span style={{ flex: 1 }} />
              <button
                type="button"
                onClick={() => {
                  void toggleSound();
                }}
                style={{
                  border: 0,
                  background: "transparent",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                <Pill theme={theme} tone={soundTone} dot>
                  {soundLabel}
                </Pill>
              </button>
            </div>

            <DL
              theme={theme}
              cols={3}
              items={[
                { k: "駕駛", v: pendingAlert.driverLabel },
                { k: "車牌", v: pendingAlert.plateLabel, mono: true },
                { k: "行程", v: pendingAlert.orderLabel, mono: true },
                { k: "位置", v: pendingAlert.locationLabel },
                { k: "嚴重度", v: pendingAlert.severityLabel },
                { k: "觸發時間", v: pendingAlert.occurredAtLabel, mono: true },
              ]}
            />

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
                icon="check"
                onClick={() => void handleAcknowledge(pendingAlert.id)}
              >
                {t("sos.action.acknowledge")}
              </Btn>
              <Btn
                theme={theme}
                onClick={() => router.push(`/sos/${pendingAlert.id}`)}
              >
                {t("sos.action.openDetail")}
              </Btn>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 10.5, color: theme.textDim }}>
                {t("sos.alert.persistentNote")}
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
