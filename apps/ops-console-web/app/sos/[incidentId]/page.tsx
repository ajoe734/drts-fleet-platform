"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type {
  DriverRegistryRecord,
  DriverSosEventRecord,
  IdentityContext,
  IncidentRecord,
  IncidentTimelineEntry,
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
  buildCanvasTheme,
  type CanvasTone,
} from "@drts/ui-web";
import {
  DEFAULT_OPS_ACTOR_ID,
  createOpsDispatchEventSource,
  getOpsClient,
} from "../../../lib/api-client";
import {
  applyCanonicalSosDuty,
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
} from "../../../lib/sos-view-model";
import { useTranslation } from "../../../lib/i18n";

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

type NoticeState =
  | { kind: "ack_won"; actor: string }
  | { kind: "ack_competing"; actor: string }
  | { kind: "ack_failed" }
  | { kind: "investigation_started" }
  | { kind: "investigation_failed" }
  | { kind: "closed" }
  | { kind: "close_failed" }
  | null;

type RenderedNotice = {
  tone: SosPillTone;
  title: string;
  body: string;
} | null;

function resolveDetailNotice(
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
    case "investigation_started":
      return {
        tone: "success",
        title: t("sos.notice.investigationStarted"),
        body: t("sos.notice.investigationStartedBody"),
      };
    case "investigation_failed":
      return {
        tone: "danger",
        title: t("sos.notice.investigationFailed"),
        body: t("sos.notice.statusFailedBody"),
      };
    case "closed":
      return {
        tone: "success",
        title: t("sos.status.closed"),
        body: t("sos.notice.closedBody"),
      };
    case "close_failed":
      return {
        tone: "danger",
        title: t("sos.notice.closeFailed"),
        body: t("sos.notice.statusFailedBody"),
      };
  }
}

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
  const { locale, t } = useTranslation();
  const activeLocale = locale ?? "zh";
  const { incidentId } = useParams() as { incidentId: string };
  const router = useRouter();
  const [incident, setIncident] = useState<IncidentRecord | null>(null);
  const [timeline, setTimeline] = useState<IncidentTimelineEntry[]>([]);
  const [drivers, setDrivers] = useState<DriverRegistryRecord[]>([]);
  const [vehicles, setVehicles] = useState<VehicleRegistryRecord[]>([]);
  const [identity, setIdentity] = useState<IdentityContext | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [hasLoadError, setHasLoadError] = useState<boolean>(false);
  const [notice, setNotice] = useState<NoticeState>(null);
  const [nowMs, setNowMs] = useState<number>(Date.now());

  const driverNamesById = buildDriverNameMap(drivers);
  const platesByVehicleId = buildVehiclePlateMap(vehicles);
  const sosRow = incident
    ? buildSosQueueRows([incident], {
        nowMs,
        driverNamesById,
        platesByVehicleId,
        locale: activeLocale,
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

      const canonical = isSosIncident(incidentRes)
        ? await client.get<{ event: DriverSosEventRecord }>(
            `/api/ops/driver-sos/by-incident/${encodeURIComponent(incidentId)}`,
          )
        : null;
      setIncident(
        canonical
          ? applyCanonicalSosDuty(incidentRes, canonical.event)
          : incidentRes,
      );
      setTimeline(unwrapListItems<IncidentTimelineEntry>(timelineRes));
      setDrivers(unwrapListItems<DriverRegistryRecord>(driverRes));
      setVehicles(unwrapListItems<VehicleRegistryRecord>(vehicleRes));
      setIdentity(identityRes);
      setHasLoadError(false);
    } catch (error) {
      console.error("Failed to load SOS incident detail", error);
      setHasLoadError(true);
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
      await fetchData();
    } catch (error) {
      console.error("Failed to acknowledge SOS incident", error);
      setNotice({ kind: "ack_failed" });
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

      setNotice({ kind: "investigation_started" });
      await fetchData();
    } catch (error) {
      console.error("Failed to start SOS investigation", error);
      setNotice({ kind: "investigation_failed" });
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

      setNotice({ kind: "closed" });
      await fetchData();
    } catch (error) {
      console.error("Failed to close SOS incident", error);
      setNotice({ kind: "close_failed" });
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

  if (hasLoadError || !incident) {
    return (
      <div style={{ minHeight: "100%", background: theme.bg, padding: 24 }}>
        <Banner
          theme={theme}
          tone="danger"
          icon="warn"
          title={t("sos.detail.loadErrorTitle")}
          body={
            hasLoadError ? t("sos.detail.loadError") : t("sos.detail.notFound")
          }
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
          body={t("sos.detail.notSos")}
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
  const renderedNotice = resolveDetailNotice(notice, t);
  const timelineEntries: TimelineView[] =
    timeline.length > 0
      ? timeline.map((entry) => ({
          at: formatSosTimestamp(entry.createdAt, undefined, activeLocale),
          tone: getSosTimelineTone(entry),
          title: getSosTimelineTitle(entry, activeLocale),
          body: entry.note || "—",
          actor: entry.actor || null,
          actorRealm: inferSosTimelineActorRealm(entry),
        }))
      : [
          {
            at: sosRow.occurredAtLabel,
            tone: "danger",
            title: t("sos.timeline.received"),
            body: t("sos.timeline.linkedFrom", { eventNo: sosRow.eventNo }),
            actor: incident.relatedDriverId,
            actorRealm: "driver",
          },
          ...(incident.assignedTo
            ? [
                {
                  at: formatSosTimestamp(
                    incident.updatedAt,
                    undefined,
                    activeLocale,
                  ),
                  tone: "success" as const,
                  title: t("sos.timeline.acknowledged"),
                  body: t("sos.timeline.takenBy", {
                    actor: formatSosActorLabel(incident.assignedTo),
                  }),
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
                {t("sos.detail.ackBy", {
                  actor: formatSosActorLabel(incident.assignedTo),
                })}
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
            {!isAcked ? (
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
        {renderedNotice ? (
          <Banner
            theme={theme}
            tone={renderedNotice.tone}
            icon={renderedNotice.tone === "success" ? "check" : "warn"}
            title={renderedNotice.title}
            body={renderedNotice.body}
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
                  {incident.location || t("sos.detail.locationPending")} ·{" "}
                  {sosRow.occurredAtLabel}
                </div>
              </div>
            </Card>

            <Card
              theme={theme}
              title={t("sos.detail.timelineTitle")}
              subtitle={t("sos.detail.timelineSubtitle")}
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
                  { k: t("sos.field.eventNo"), v: sosRow.eventNo, mono: true },
                  { k: t("sos.field.status"), v: sosRow.statusLabel },
                  { k: t("sos.field.severity"), v: sosRow.severityLabel },
                  {
                    k: t("sos.field.elapsed"),
                    v: sosRow.elapsedLabel,
                    mono: true,
                  },
                  { k: t("sos.field.owner"), v: sosRow.ackLabel },
                  { k: t("sos.field.reportedBy"), v: sosRow.driverLabel },
                ]}
              />
            </Card>

            <Card theme={theme} title={t("sos.detail.contextTitle")}>
              <DL
                theme={theme}
                cols={1}
                items={[
                  { k: t("sos.field.driver"), v: sosRow.driverLabel },
                  {
                    k: t("sos.field.plate"),
                    v: sosRow.plateLabel,
                    mono: true,
                  },
                  {
                    k: t("sos.field.trip"),
                    v: sosRow.orderLabel,
                    mono: true,
                  },
                  { k: t("sos.field.location"), v: sosRow.locationLabel },
                  {
                    k: t("sos.field.reportedAt"),
                    v: sosRow.occurredAtLabel,
                    mono: true,
                  },
                  {
                    k: t("sos.field.incidentId"),
                    v: incident.incidentId,
                    mono: true,
                  },
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
                    k: t("sos.field.incidentCase"),
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
                    k: t("sos.field.complaint"),
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
                    k: t("sos.field.recovery"),
                    v:
                      incident.serviceRecoveryActions.length > 0
                        ? t("sos.detail.recoveryCount", {
                            count: incident.serviceRecoveryActions.length,
                          })
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
