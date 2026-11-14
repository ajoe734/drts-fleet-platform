import type {
  DriverRegistryRecord,
  DriverSosEventRecord,
  IncidentRecord,
  IncidentSeverity,
  IncidentTimelineEntry,
  VehicleRegistryRecord,
} from "@drts/contracts";
import type { CanvasTone } from "@drts/ui-web";
import { t, type Locale } from "./translations";

// Accept the actual API producer and the original displayed event numbers.
const SOS_EVENT_NO_PATTERN = /SOS-(?:\d{14}-[0-9A-Fa-f]{6}|\d{8}-\d{4})\b/;
const GENERATED_DESCRIPTION_PATTERN = new RegExp(
  `^Driver SOS ${SOS_EVENT_NO_PATTERN.source} submitted from the driver app\\.$`,
);

export type SosPillTone = Exclude<CanvasTone, "neutral">;

type DriverNameById = Map<string, string>;
type PlateByVehicleId = Map<string, string>;

export interface SosStatusMeta {
  label: string;
  tone: SosPillTone;
  isPending: boolean;
  isAcked: boolean;
  isClosed: boolean;
}

export interface SosQueueRow {
  id: string;
  eventNo: string;
  statusLabel: string;
  statusTone: CanvasTone;
  waitLabel: string;
  elapsedLabel: string;
  driverLabel: string;
  plateLabel: string;
  orderLabel: string;
  locationLabel: string;
  typeLabel: string;
  severityLabel: string;
  severityTone: SosPillTone;
  ackLabel: string;
  occurredAtLabel: string;
  isPending: boolean;
  isCriticalAlert: boolean;
  highlight: boolean;
  incident: IncidentRecord;
}

export function collectUnreportedSosIncidentIds(
  rows: readonly SosQueueRow[],
  reportedIncidentIds: ReadonlySet<string>,
): string[] {
  return rows
    .map((row) => row.id)
    .filter(
      (incidentId, index, incidentIds) =>
        !reportedIncidentIds.has(incidentId) &&
        incidentIds.indexOf(incidentId) === index,
    );
}

export type SosTimelineActorRealm = "driver" | "ops" | "system";

export function unwrapListItems<T>(
  value: T[] | { items?: T[] | null } | null | undefined,
): T[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (Array.isArray(value?.items)) {
    return value.items;
  }

  return [];
}

export function extractSosEventNo(
  incident: Pick<IncidentRecord, "title" | "description">,
): string | null {
  return (
    incident.title.match(SOS_EVENT_NO_PATTERN)?.[0] ??
    incident.description.match(SOS_EVENT_NO_PATTERN)?.[0] ??
    null
  );
}

/** Ops duty ownership comes from the canonical SOS acknowledgment, not a
 * generic Incident assignment which can exist before any operator ACK. */
export function applyCanonicalSosDuty(
  incident: IncidentRecord,
  event: Pick<DriverSosEventRecord, "status" | "dutyAcknowledgement">,
): IncidentRecord {
  const status =
    event.status === "investigating" ||
    event.status === "resolved" ||
    event.status === "closed"
      ? event.status
      : incident.status;
  return {
    ...incident,
    status,
    assignedTo: event.dutyAcknowledgement.acknowledgedByActorId,
  };
}

export function isSosIncident(
  incident: Pick<IncidentRecord, "title" | "description">,
): boolean {
  return extractSosEventNo(incident) !== null;
}

export function buildDriverNameMap(
  drivers: readonly DriverRegistryRecord[],
): DriverNameById {
  return new Map(
    drivers.map(
      (driver) => [driver.driverId, driver.name || driver.driverId] as const,
    ),
  );
}

export function buildVehiclePlateMap(
  vehicles: readonly VehicleRegistryRecord[],
): PlateByVehicleId {
  return new Map(
    vehicles.map(
      (vehicle) =>
        [vehicle.vehicleId, vehicle.plateNo || vehicle.vehicleId] as const,
    ),
  );
}

export function getSosStatusMeta(
  incident: IncidentRecord,
  locale: Locale = "zh",
): SosStatusMeta {
  if (incident.status === "open" && !incident.assignedTo) {
    return {
      label: t("sos.status.pending", locale),
      tone: "danger",
      isPending: true,
      isAcked: false,
      isClosed: false,
    };
  }

  if (incident.status === "open" && incident.assignedTo) {
    return {
      label: t("sos.status.acknowledged", locale),
      tone: "accent",
      isPending: false,
      isAcked: true,
      isClosed: false,
    };
  }

  if (incident.status === "investigating") {
    return {
      label: t("sos.status.investigating", locale),
      tone: "warn",
      isPending: false,
      isAcked: true,
      isClosed: false,
    };
  }

  if (incident.status === "resolved") {
    const isFalseAlarm =
      incident.resolutionNote?.toLowerCase().includes("false alarm") === true;
    return {
      label: isFalseAlarm
        ? t("sos.status.falseAlarm", locale)
        : t("sos.status.resolved", locale),
      tone: "info",
      isPending: false,
      isAcked: true,
      isClosed: true,
    };
  }

  return {
    label: t("sos.status.closed", locale),
    tone: "success",
    isPending: false,
    isAcked: true,
    isClosed: true,
  };
}

export function getSosSeverityLabel(
  severity: IncidentSeverity,
  locale: Locale = "zh",
): string {
  switch (severity) {
    case "critical":
      return t("sos.severity.critical", locale);
    case "high":
      return t("sos.severity.high", locale);
    case "medium":
      return t("sos.severity.medium", locale);
    default:
      return t("sos.severity.low", locale);
  }
}

export function getSosSeverityTone(severity: IncidentSeverity): SosPillTone {
  switch (severity) {
    case "critical":
      return "danger";
    case "high":
      return "warn";
    case "medium":
      return "accent";
    default:
      return "info";
  }
}

export function getSosTypeLabel(
  incident: IncidentRecord,
  locale: Locale = "zh",
): string {
  switch (incident.category) {
    case "traffic":
      return t("sos.type.traffic", locale);
    case "passenger_injury":
      return t("sos.type.passengerInjury", locale);
    case "driver_injury":
      return t("sos.type.driverInjury", locale);
    case "safety":
      return t("sos.type.safety", locale);
    case "vehicle_damage":
      return t("sos.type.vehicleDamage", locale);
    default:
      return t("sos.type.other", locale);
  }
}

export function formatSosActorLabel(
  actorId: string | null | undefined,
): string {
  const normalized = actorId?.trim();
  return normalized && normalized.length > 0 ? normalized : "—";
}

export function formatSosTimestamp(
  value: string | null | undefined,
  options: Intl.DateTimeFormatOptions = {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  },
  locale: Locale = "zh",
): string {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  const intlLocale = locale === "en" ? "en-US" : "zh-TW";
  return parsed.toLocaleString(intlLocale, options);
}

export function formatSosElapsedSince(
  value: string | null | undefined,
  nowMs: number,
): string {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value).getTime();
  if (Number.isNaN(parsed)) {
    return "—";
  }

  const totalSeconds = Math.max(0, Math.floor((nowMs - parsed) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }

  return `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
}

export function getSosSupplementText(
  incident: Pick<IncidentRecord, "description">,
): string | null {
  const description = incident.description?.trim();
  if (!description || GENERATED_DESCRIPTION_PATTERN.test(description)) {
    return null;
  }

  return description;
}

export function buildSosQueueRows(
  incidents: readonly IncidentRecord[],
  options: {
    nowMs: number;
    driverNamesById?: DriverNameById;
    platesByVehicleId?: PlateByVehicleId;
    locale?: Locale;
  },
): SosQueueRow[] {
  const driverNamesById = options.driverNamesById ?? new Map();
  const platesByVehicleId = options.platesByVehicleId ?? new Map();
  const locale = options.locale ?? "zh";

  const rows = incidents
    .filter((incident) => isSosIncident(incident))
    .map((incident) => {
      const status = getSosStatusMeta(incident, locale);
      const driverLabel = resolveDriverLabel(incident, driverNamesById);
      const plateLabel = resolvePlateLabel(incident, platesByVehicleId);
      const occurredAt = incident.occurredAt ?? incident.createdAt;
      const elapsedLabel = formatSosElapsedSince(occurredAt, options.nowMs);

      return {
        id: incident.incidentId,
        eventNo: extractSosEventNo(incident) ?? incident.incidentId,
        statusLabel: status.label,
        statusTone: status.tone,
        waitLabel: status.isPending ? elapsedLabel : "—",
        elapsedLabel,
        driverLabel,
        plateLabel,
        orderLabel: incident.relatedOrderId ?? "—",
        locationLabel: incident.location ?? "—",
        typeLabel: getSosTypeLabel(incident, locale),
        severityLabel: getSosSeverityLabel(incident.severity, locale),
        severityTone: getSosSeverityTone(incident.severity),
        ackLabel: formatSosActorLabel(incident.assignedTo),
        occurredAtLabel: formatSosTimestamp(occurredAt, undefined, locale),
        isPending: status.isPending,
        isCriticalAlert: status.isPending && incident.severity === "critical",
        highlight: status.isPending,
        incident,
      };
    });

  rows.sort((left, right) => {
    if (left.isCriticalAlert !== right.isCriticalAlert) {
      return left.isCriticalAlert ? -1 : 1;
    }

    if (left.isPending !== right.isPending) {
      return left.isPending ? -1 : 1;
    }

    const leftTime = new Date(
      left.incident.occurredAt ?? left.incident.createdAt,
    ).getTime();
    const rightTime = new Date(
      right.incident.occurredAt ?? right.incident.createdAt,
    ).getTime();
    return rightTime - leftTime;
  });

  return rows;
}

export function getSosTimelineTitle(
  entry: IncidentTimelineEntry,
  locale: Locale = "zh",
): string {
  switch (entry.action) {
    case "incident_created":
    case "created":
      return t("sos.timeline.received", locale);
    case "incident_assigned":
    case "assigned":
      return t("sos.timeline.acknowledged", locale);
    case "status_changed":
    case "statusChanged":
      if (
        entry.note.toLowerCase().includes("investigating") ||
        entry.note.toLowerCase().includes("investigation")
      ) {
        return t("sos.timeline.investigating", locale);
      }
      if (entry.note.toLowerCase().includes("closed")) {
        return t("sos.status.closed", locale);
      }
      if (entry.note.toLowerCase().includes("resolved")) {
        return t("sos.status.resolved", locale);
      }
      return t("sos.timeline.statusChanged", locale);
    case "incident_resolved":
    case "resolved":
      return t("sos.status.resolved", locale);
    case "incident_closed":
    case "closed":
      return t("sos.status.closed", locale);
    default:
      return entry.action;
  }
}

export function getSosTimelineTone(entry: IncidentTimelineEntry): CanvasTone {
  if (entry.action === "incident_created" || entry.action === "created") {
    return "danger";
  }

  if (entry.action === "incident_assigned" || entry.action === "assigned") {
    return "success";
  }

  if (entry.action === "incident_resolved" || entry.action === "closed") {
    return "success";
  }

  if (
    entry.action === "status_changed" ||
    entry.action === "statusChanged" ||
    entry.action === "incident_closed"
  ) {
    const note = entry.note.toLowerCase();
    if (note.includes("investigating") || note.includes("investigation")) {
      return "warn";
    }
    if (note.includes("closed") || note.includes("resolved")) {
      return "success";
    }
  }

  return "info";
}

export function inferSosTimelineActorRealm(
  entry: IncidentTimelineEntry,
): SosTimelineActorRealm {
  if (entry.action === "incident_created" || entry.action === "created") {
    return "driver";
  }

  if (entry.actor === "system" || entry.actor.startsWith("system.")) {
    return "system";
  }

  return "ops";
}

function resolveDriverLabel(
  incident: IncidentRecord,
  driverNamesById: DriverNameById,
): string {
  const driverId = incident.relatedDriverId?.trim();
  if (!driverId) {
    return "—";
  }

  return driverNamesById.get(driverId) ?? driverId;
}

function resolvePlateLabel(
  incident: IncidentRecord,
  platesByVehicleId: PlateByVehicleId,
): string {
  const vehicleId = incident.relatedVehicleId?.trim();
  if (!vehicleId) {
    return "—";
  }

  return platesByVehicleId.get(vehicleId) ?? vehicleId;
}
