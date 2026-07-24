import type {
  DriverRegistryRecord,
  IncidentRecord,
  IncidentSeverity,
  IncidentTimelineEntry,
  VehicleRegistryRecord,
} from "@drts/contracts";
import type { CanvasTone } from "@drts/ui-web";

const SOS_EVENT_NO_PATTERN = /SOS-\d{8}-\d{4}/;
const GENERATED_DESCRIPTION_PATTERN =
  /^Driver SOS SOS-\d{8}-\d{4} submitted from the driver app\.$/;

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

export function getSosStatusMeta(incident: IncidentRecord): SosStatusMeta {
  if (incident.status === "open" && !incident.assignedTo) {
    return {
      label: "待確認",
      tone: "danger",
      isPending: true,
      isAcked: false,
      isClosed: false,
    };
  }

  if (incident.status === "open" && incident.assignedTo) {
    return {
      label: "已確認",
      tone: "accent",
      isPending: false,
      isAcked: true,
      isClosed: false,
    };
  }

  if (incident.status === "investigating") {
    return {
      label: "調查中",
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
      label: isFalseAlarm ? "駕駛回報誤觸" : "已處理",
      tone: "info",
      isPending: false,
      isAcked: true,
      isClosed: true,
    };
  }

  return {
    label: "已結案",
    tone: "success",
    isPending: false,
    isAcked: true,
    isClosed: true,
  };
}

export function getSosSeverityLabel(severity: IncidentSeverity): string {
  switch (severity) {
    case "critical":
      return "重大";
    case "high":
      return "高";
    case "medium":
      return "中";
    default:
      return "低";
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

export function getSosTypeLabel(incident: IncidentRecord): string {
  switch (incident.category) {
    case "traffic":
      return "交通事故";
    case "passenger_injury":
      return "乘客急病";
    case "driver_injury":
      return "駕駛受傷";
    case "safety":
      return "治安事件";
    case "vehicle_damage":
      return "車損事件";
    default:
      return "其他";
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
): string {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  return parsed.toLocaleString("zh-TW", options);
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
  },
): SosQueueRow[] {
  const driverNamesById = options.driverNamesById ?? new Map();
  const platesByVehicleId = options.platesByVehicleId ?? new Map();

  const rows = incidents
    .filter((incident) => isSosIncident(incident))
    .map((incident) => {
      const status = getSosStatusMeta(incident);
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
        typeLabel: getSosTypeLabel(incident),
        severityLabel: getSosSeverityLabel(incident.severity),
        severityTone: getSosSeverityTone(incident.severity),
        ackLabel: formatSosActorLabel(incident.assignedTo),
        occurredAtLabel: formatSosTimestamp(occurredAt),
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

export function getSosTimelineTitle(entry: IncidentTimelineEntry): string {
  switch (entry.action) {
    case "incident_created":
    case "created":
      return "系統收到通報";
    case "incident_assigned":
    case "assigned":
      return "值班人員已確認";
    case "status_changed":
    case "statusChanged":
      if (
        entry.note.toLowerCase().includes("investigating") ||
        entry.note.toLowerCase().includes("investigation")
      ) {
        return "開始調查";
      }
      if (entry.note.toLowerCase().includes("closed")) {
        return "已結案";
      }
      if (entry.note.toLowerCase().includes("resolved")) {
        return "已處理";
      }
      return "狀態更新";
    case "incident_resolved":
    case "resolved":
      return "已處理";
    case "incident_closed":
    case "closed":
      return "已結案";
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
