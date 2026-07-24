import type {
  DispatchQueueMode,
  QueueEntryRecord,
  ResourceActionDescriptor,
  RuntimeProfileCode,
} from "@drts/contracts";
import { isForbiddenStatutoryOverrideAction } from "./queue-semantics";

export type QueueEligibilityDecision = "eligible" | "denied" | "unknown";

export type QueueEligibilitySnapshot = {
  decision: QueueEligibilityDecision;
  reasonCode?: string | null;
  evaluatedAt?: string | null;
};

export type OpsQueueEntryRecord = QueueEntryRecord & {
  driverId?: string | null;
  driverName?: string | null;
  vehiclePlateNo?: string | null;
  serviceAreaCode?: string | null;
  lastUpdatedAt?: string | null;
  eligibility?: QueueEligibilitySnapshot | null;
  availableActions?: ResourceActionDescriptor[];
};

export type QueueListPayload =
  | OpsQueueEntryRecord[]
  | {
      items?: OpsQueueEntryRecord[];
    };

export type QueueFilters = {
  mode: "all" | DispatchQueueMode;
  profile: "all" | RuntimeProfileCode;
  area: string;
  site: string;
  eligibility: "all" | QueueEligibilityDecision;
  query: string;
};

const QUEUE_MODES = new Set<DispatchQueueMode>([
  "virtual_matching",
  "physical_rank",
  "taxi_stand",
]);

const RUNTIME_PROFILES = new Set<RuntimeProfileCode>([
  "ordinary_taxi",
  "multi_taxi_direct",
  "business_dispatch",
]);

const ELIGIBILITY_DECISIONS = new Set<QueueEligibilityDecision>([
  "eligible",
  "denied",
  "unknown",
]);

const SAFE_NAVIGATION_ACTIONS = new Set([
  "back_to_queue_overview",
  "open_authorization",
  "open_driver",
  "open_vehicle",
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isQueueEntry(value: unknown): value is OpsQueueEntryRecord {
  const record = asRecord(value);
  return Boolean(
    record &&
    asOptionalString(record.queueEntryId) &&
    asOptionalString(record.vehicleId) &&
    asOptionalString(record.checkedInAt),
  );
}

export function readQueueEntries(payload: unknown): OpsQueueEntryRecord[] {
  const record = asRecord(payload);
  const items = Array.isArray(payload)
    ? payload
    : record && Array.isArray(record.items)
      ? record.items
      : [];
  return items.filter(isQueueEntry);
}

export function readQueueEntry(payload: unknown): OpsQueueEntryRecord | null {
  return isQueueEntry(payload) ? payload : null;
}

export function parseQueueFilters(
  searchParams: Record<string, string | string[] | undefined>,
): QueueFilters {
  const first = (key: string) => {
    const value = searchParams[key];
    return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
  };
  const mode = first("mode");
  const profile = first("profile");
  const eligibility = first("eligibility");

  return {
    mode: QUEUE_MODES.has(mode as DispatchQueueMode)
      ? (mode as DispatchQueueMode)
      : "all",
    profile: RUNTIME_PROFILES.has(profile as RuntimeProfileCode)
      ? (profile as RuntimeProfileCode)
      : "all",
    area: first("area").trim(),
    site: first("site").trim(),
    eligibility: ELIGIBILITY_DECISIONS.has(
      eligibility as QueueEligibilityDecision,
    )
      ? (eligibility as QueueEligibilityDecision)
      : "all",
    query: first("q").trim(),
  };
}

export function filterQueueEntries(
  entries: readonly OpsQueueEntryRecord[],
  filters: QueueFilters,
): OpsQueueEntryRecord[] {
  const query = filters.query.toLocaleLowerCase();
  const area = filters.area.toLocaleLowerCase();
  const site = filters.site.toLocaleLowerCase();

  return entries.filter((entry) => {
    if (filters.mode !== "all" && entry.queueMode !== filters.mode) {
      return false;
    }
    if (
      filters.profile !== "all" &&
      entry.runtimeProfileCode !== filters.profile
    ) {
      return false;
    }
    if (
      filters.eligibility !== "all" &&
      (entry.eligibility?.decision ?? "unknown") !== filters.eligibility
    ) {
      return false;
    }
    if (
      area &&
      !String(entry.serviceAreaCode ?? "")
        .toLocaleLowerCase()
        .includes(area)
    ) {
      return false;
    }
    if (
      site &&
      !String(entry.siteId ?? "")
        .toLocaleLowerCase()
        .includes(site)
    ) {
      return false;
    }
    if (!query) {
      return true;
    }

    return [
      entry.queueEntryId,
      entry.driverId,
      entry.driverName,
      entry.vehicleId,
      entry.vehiclePlateNo,
      entry.operatingAuthorizationId,
    ].some((value) =>
      String(value ?? "")
        .toLocaleLowerCase()
        .includes(query),
    );
  });
}

export function isServerStatutoryQueueDenial(
  entry: OpsQueueEntryRecord,
): boolean {
  return (
    entry.eligibility?.decision === "denied" &&
    entry.runtimeProfileCode === "multi_taxi_direct" &&
    (entry.queueMode === "physical_rank" || entry.queueMode === "taxi_stand")
  );
}

export function hasUnresolvedMultiTaxiQueueConflict(
  entry: OpsQueueEntryRecord,
): boolean {
  return (
    entry.runtimeProfileCode === "multi_taxi_direct" &&
    (entry.queueMode === "physical_rank" || entry.queueMode === "taxi_stand") &&
    entry.eligibility?.decision !== "denied"
  );
}

export function getSafeQueueNavigationActions(
  entry: OpsQueueEntryRecord,
): ResourceActionDescriptor[] {
  return (entry.availableActions ?? []).filter(
    (descriptor) =>
      descriptor.enabled &&
      SAFE_NAVIGATION_ACTIONS.has(descriptor.action) &&
      !isForbiddenStatutoryOverrideAction(descriptor.action),
  );
}

export function getQueueNavigationHref(
  action: string,
  entry: OpsQueueEntryRecord,
  options: {
    platformAdminBaseUrl?: string | null;
  } = {},
): string | null {
  switch (action) {
    case "back_to_queue_overview":
      return "/dispatch/queue";
    case "open_authorization":
      if (
        !entry.operatingAuthorizationId ||
        !options.platformAdminBaseUrl?.trim()
      ) {
        return null;
      }
      return `${options.platformAdminBaseUrl.replace(/\/$/, "")}/multi-taxi-authorizations/${encodeURIComponent(entry.operatingAuthorizationId)}`;
    case "open_driver":
      return entry.driverId
        ? `/drivers/${encodeURIComponent(entry.driverId)}`
        : null;
    case "open_vehicle":
      return `/vehicles/${encodeURIComponent(entry.vehicleId)}`;
    default:
      return null;
  }
}
