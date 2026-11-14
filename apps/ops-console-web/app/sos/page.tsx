"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type {
  DriverRegistryRecord,
  DriverSosAlertLatencySummary,
  DriverSosEventRecord,
  IdentityContext,
  IncidentRecord,
  RecordDriverSosOpsAlertRenderedResult,
  SosDutyAcknowledgement,
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
} from "../../lib/api-client";
import {
  applyCanonicalSosDuty,
  buildDriverNameMap,
  buildSosQueueRows,
  buildVehiclePlateMap,
  collectUnreportedSosIncidentIds,
  formatSosActorLabel,
  isSosIncident,
  unwrapListItems,
  type SosPillTone,
  type SosQueueRow,
} from "../../lib/sos-view-model";
import { useTranslation } from "../../lib/i18n";

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

type NoticeState =
  | { kind: "ack_won"; actor: string }
  | { kind: "ack_competing"; actor: string }
  | { kind: "ack_failed" }
  | null;

type RenderedNotice = {
  tone: SosPillTone;
  title: string;
  body: string;
} | null;

function resolveQueueNotice(
  notice: NoticeState,
  t: (key: string, params?: Record<string, string | number>) => string,
): RenderedNotice {
  if (!notice) {
    return null;
  }
  switch (notice.kind) {
    case "ack_won":
      return {
        tone: "success",
        title: t("sos.notice.acknowledged"),
        body: t("sos.notice.acknowledgedBody", { actor: notice.actor }),
      };
    case "ack_competing":
      return {
        tone: "warn",
        title: t("sos.notice.alreadyOwnedTitle"),
        body: t("sos.notice.alreadyOwnedBody", { actor: notice.actor }),
      };
    case "ack_failed":
      return {
        tone: "danger",
        title: t("sos.notice.ackFailed"),
        body: t("sos.notice.ackFailedBody"),
      };
  }
}

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
  const { locale, t } = useTranslation();
  const activeLocale = locale ?? "zh";
  const router = useRouter();
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [drivers, setDrivers] = useState<DriverRegistryRecord[]>([]);
  const [vehicles, setVehicles] = useState<VehicleRegistryRecord[]>([]);
  const [identity, setIdentity] = useState<IdentityContext | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [soundOff, setSoundOff] = useState<boolean>(false);
  const [soundBlocked, setSoundBlocked] = useState<boolean>(false);
  const [nowMs, setNowMs] = useState<number>(Date.now());
  const [hasLoadError, setHasLoadError] = useState<boolean>(false);
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
    locale: activeLocale,
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

      const sosIncidents =
        unwrapListItems<IncidentRecord>(incidentRes).filter(isSosIncident);
      const canonical = await Promise.all(
        sosIncidents.map(async (incident) => {
          const { event } = await client.get<{ event: DriverSosEventRecord }>(
            `/api/ops/driver-sos/by-incident/${encodeURIComponent(incident.incidentId)}`,
          );
          return applyCanonicalSosDuty(incident, event);
        }),
      );
      setIncidents(canonical);
      setDrivers(unwrapListItems<DriverRegistryRecord>(driverRes));
      setVehicles(unwrapListItems<VehicleRegistryRecord>(vehicleRes));
      setIdentity(identityRes);
      setLatencySummary(latencyRes);
      setHasLoadError(false);
    } catch (error) {
      console.error("Failed to load SOS incidents", error);
      setHasLoadError(true);
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
      const { event } = await client.get<{ event: DriverSosEventRecord }>(
        `/api/ops/driver-sos/by-incident/${encodeURIComponent(incidentId)}`,
      );
      const ack = await client.post<{
        dutyAcknowledgement: SosDutyAcknowledgement;
        wonAcknowledgement: boolean;
      }>(
        `/api/ops/driver-sos/${encodeURIComponent(event.sosEventId)}/duty-ack`,
        { body: {} },
      );

      if (ack.wonAcknowledgement) {
        setNotice({
          kind: "ack_won",
          actor: currentActorLabel,
        });
      } else {
        setNotice({
          kind: "ack_competing",
          actor: formatSosActorLabel(
            ack.dutyAcknowledgement.acknowledgedByActorId,
          ),
        });
      }
      await fetchRuntime();
    } catch (error) {
      console.error("Failed to acknowledge SOS incident", error);
      setNotice({ kind: "ack_failed" });
    }
  };

  const soundTone: CanvasTone = soundBlocked
    ? "warn"
    : soundOff
      ? "warn"
      : "success";
  const soundLabel = soundBlocked
    ? t("sos.sound.blocked")
    : soundOff
      ? t("sos.sound.off")
      : t("sos.sound.on");
  const soundCode = soundBlocked
    ? "sound_blocked"
    : soundOff
      ? "sound_off"
      : "sound_on";

  const soundNotice: RenderedNotice = soundBlocked
    ? {
        tone: "warn",
        title: t("sos.sound.blockedTitle"),
        body: t("sos.sound.blockedBody"),
      }
    : soundOff
      ? {
          tone: "warn",
          title: t("sos.sound.offTitle"),
          body: t("sos.sound.offBody"),
        }
      : null;
  const loadError = hasLoadError ? t("sos.queue.loadError") : null;
  const renderedNotice = resolveQueueNotice(notice, t);
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
          subtitle={t("sos.queue.subtitle")}
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
                  {soundOff ? t("sos.sound.enable") : t("sos.sound.recheck")}
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

          {renderedNotice ? (
            <Banner
              theme={theme}
              tone={renderedNotice.tone}
              icon={renderedNotice.tone === "success" ? "check" : "warn"}
              title={renderedNotice.title}
              body={renderedNotice.body}
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
            title={
              loading ? t("sos.common.loading") : t("sos.queue.tableTitle")
            }
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
                  h: t("sos.field.eventNo"),
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
                  h: t("sos.field.status"),
                  w: 110,
                  r: (row: SosQueueRow) => (
                    <Pill theme={theme} tone={row.statusTone} dot>
                      {row.statusLabel}
                    </Pill>
                  ),
                },
                {
                  h: t("sos.field.wait"),
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
                { h: t("sos.field.driver"), k: "driverLabel", w: 110 },
                {
                  h: t("sos.field.plate"),
                  k: "plateLabel",
                  w: 108,
                  mono: true,
                },
                {
                  h: t("sos.field.trip"),
                  k: "orderLabel",
                  w: 158,
                  mono: true,
                },
                { h: t("sos.field.location"), k: "locationLabel", w: 220 },
                { h: t("sos.field.type"), k: "typeLabel", w: 110 },
                {
                  h: t("sos.field.severity"),
                  w: 92,
                  r: (row: SosQueueRow) => (
                    <Pill theme={theme} tone={row.severityTone}>
                      {row.severityLabel}
                    </Pill>
                  ),
                },
                { h: t("sos.field.owner"), k: "ackLabel", w: 124 },
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
                { k: t("sos.field.driver"), v: pendingAlert.driverLabel },
                {
                  k: t("sos.field.plate"),
                  v: pendingAlert.plateLabel,
                  mono: true,
                },
                {
                  k: t("sos.field.trip"),
                  v: pendingAlert.orderLabel,
                  mono: true,
                },
                { k: t("sos.field.location"), v: pendingAlert.locationLabel },
                { k: t("sos.field.severity"), v: pendingAlert.severityLabel },
                {
                  k: t("sos.field.triggeredAt"),
                  v: pendingAlert.occurredAtLabel,
                  mono: true,
                },
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
