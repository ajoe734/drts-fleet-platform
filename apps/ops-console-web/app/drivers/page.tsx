import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type {
  DriverLocationSnapshot,
  DriverRegistryRecord,
  EmptyReason,
  EmptyStateEnvelope,
  ForwardedOrderRecord,
  PlatformCode,
  PlatformPresenceRecord,
  PlatformPresenceSummary,
  ResourceActionDescriptor,
  UiRefreshMetadata,
} from "@drts/contracts";
import { PLATFORM_CODE_REGISTRY } from "@drts/contracts";
import { RefreshOnInterval } from "@/components/refresh-on-interval";
import { getServerOpsClient } from "@/lib/api-client.server";
import { formatOpsCodeLabel, getOpsLabel } from "@/lib/localized-labels";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import {
  DataCellStack,
  DataTable,
  PageHeader,
  StatusChip,
  Td,
  Tr,
} from "@drts/ui-web";

const STALE_LOCATION_THRESHOLD_MS = 5 * 60 * 1000;
const REFRESH_INTERVAL_MS = 15_000;
const PAGE_SIZE = 12;
const PLATFORM_ADMIN_ADAPTER_REGISTRY_ROUTE = "/adapter-registry";

type DriversPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type DriversViewKey =
  | "all"
  | "available"
  | "on_trip"
  | "offline"
  | "license_warn"
  | "suppression";

type DriverListFilters = {
  query: string;
  view: DriversViewKey;
  shift: string;
  platform: string;
  eligibility: string;
  page: number;
  emptyReason: EmptyReason | null;
};

type DriverRowModel = {
  driver: DriverRegistryListItem;
  location: DriverLocationSnapshot | undefined;
  locationState: "live" | "stale" | "missing" | "unknown";
  presences: PlatformPresenceRecord[];
  presenceLoadFailed: boolean;
  activeForwardedOrders: ForwardedOrderRecord[];
  suppressionActive: boolean;
  availableActions: ResourceActionDescriptor[];
};

type EmptyStateModel = {
  reason: EmptyReason;
  titleKey: string;
  bodyKey: string;
  accent: string;
  background: string;
  icon: string;
  nextAction?: ResourceActionDescriptor;
  nextHref?: string;
  nextTarget?: "_blank";
};

type LoadResult<T> = {
  data: T | null;
  error: string | null;
};

type DriverRegistryListItem = DriverRegistryRecord & {
  availableActions?: ResourceActionDescriptor[];
};

type LoadedListEnvelope<T> = {
  items: T[];
  emptyState: EmptyStateEnvelope | null;
  refreshMetadata: UiRefreshMetadata | null;
};

const shellStyle: CSSProperties = {
  display: "grid",
  gap: "1rem",
};

const panelStyle: CSSProperties = {
  border: "1px solid #d7dde6",
  borderRadius: "1rem",
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.98) 100%)",
  boxShadow: "0 18px 40px rgba(15, 23, 42, 0.06)",
};

const alertBaseStyle: CSSProperties = {
  borderRadius: "0.95rem",
  padding: "0.9rem 1rem",
  fontSize: "0.9rem",
  lineHeight: 1.55,
};

const filterBarStyle: CSSProperties = {
  display: "grid",
  gap: "0.9rem",
  padding: "1rem 1.1rem 1.1rem",
};

const filterRowStyle: CSSProperties = {
  display: "flex",
  gap: "0.75rem",
  flexWrap: "wrap",
  alignItems: "center",
};

const tabsRowStyle: CSSProperties = {
  display: "flex",
  gap: "0.55rem",
  flexWrap: "wrap",
};

const tabBaseStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.45rem",
  padding: "0.6rem 0.85rem",
  borderRadius: "999px",
  border: "1px solid #dbe4ee",
  textDecoration: "none",
  color: "#334155",
  background: "#fff",
  fontSize: "0.88rem",
  fontWeight: 600,
};

const filterInputStyle: CSSProperties = {
  minHeight: "42px",
  borderRadius: "0.8rem",
  border: "1px solid #cbd5e1",
  background: "#fff",
  padding: "0 0.9rem",
  fontSize: "0.92rem",
  color: "#0f172a",
};

const searchInputStyle: CSSProperties = {
  ...filterInputStyle,
  minWidth: "280px",
  flex: "1 1 280px",
};

const selectStyle: CSSProperties = {
  ...filterInputStyle,
  minWidth: "160px",
};

const primaryButtonStyle: CSSProperties = {
  minHeight: "42px",
  borderRadius: "999px",
  border: "1px solid #0f172a",
  background: "#0f172a",
  color: "#fff",
  padding: "0 1rem",
  fontSize: "0.9rem",
  fontWeight: 700,
  cursor: "pointer",
};

const subtleButtonStyle: CSSProperties = {
  ...primaryButtonStyle,
  border: "1px solid #d7dde6",
  background: "#fff",
  color: "#334155",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const bannerStrongStyle: CSSProperties = {
  display: "block",
  fontWeight: 700,
  marginBottom: "0.1rem",
};

const actionListStyle: CSSProperties = {
  display: "flex",
  gap: "0.45rem",
  flexWrap: "wrap",
};

const actionLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "34px",
  padding: "0 0.8rem",
  borderRadius: "999px",
  border: "1px solid #bfdbfe",
  color: "#1d4ed8",
  background: "#eff6ff",
  textDecoration: "none",
  fontSize: "0.82rem",
  fontWeight: 700,
};

const disabledActionStyle: CSSProperties = {
  ...actionLinkStyle,
  color: "#94a3b8",
  borderColor: "#e2e8f0",
  background: "#f8fafc",
  cursor: "not-allowed",
};

const pageFooterStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "0.75rem",
  flexWrap: "wrap",
  padding: "0 1.1rem 1.1rem",
};

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isEmptyReason(value: string | null | undefined): value is EmptyReason {
  return (
    value === "no_data" ||
    value === "not_provisioned" ||
    value === "fetch_failed" ||
    value === "permission_denied" ||
    value === "external_unavailable" ||
    value === "filtered_empty"
  );
}

function resolveFilters(
  searchParams?: Record<string, string | string[] | undefined>,
): DriverListFilters {
  const rawPage = Number.parseInt(firstParam(searchParams?.page) ?? "1", 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const rawView = firstParam(searchParams?.view);
  const view: DriversViewKey =
    rawView === "available" ||
    rawView === "on_trip" ||
    rawView === "offline" ||
    rawView === "license_warn" ||
    rawView === "suppression"
      ? rawView
      : "all";
  const emptyReasonParam = firstParam(searchParams?.emptyReason);

  return {
    query: (firstParam(searchParams?.q) ?? "").trim(),
    view,
    shift: (firstParam(searchParams?.shift) ?? "all").trim(),
    platform: (firstParam(searchParams?.platform) ?? "all").trim(),
    eligibility: (firstParam(searchParams?.eligibility) ?? "all").trim(),
    page,
    emptyReason: isEmptyReason(emptyReasonParam) ? emptyReasonParam : null,
  };
}

async function loadWithError<T>(
  loader: () => Promise<T>,
  locale: "en" | "zh",
): Promise<LoadResult<T>> {
  try {
    return { data: await loader(), error: null };
  } catch (error) {
    return {
      data: null,
      error:
        error instanceof Error ? error.message : t("common.unknown", locale),
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRiskLevel(
  value: unknown,
): value is ResourceActionDescriptor["riskLevel"] {
  return value === "low" || value === "medium" || value === "high";
}

function readActions(value: unknown): ResourceActionDescriptor[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }
    if (
      typeof entry.action !== "string" ||
      typeof entry.enabled !== "boolean" ||
      !isRiskLevel(entry.riskLevel)
    ) {
      return [];
    }

    return [
      {
        action: entry.action,
        enabled: entry.enabled,
        riskLevel: entry.riskLevel,
        ...(typeof entry.disabledReasonCode === "string"
          ? { disabledReasonCode: entry.disabledReasonCode }
          : {}),
        ...(typeof entry.requiresReason === "boolean"
          ? { requiresReason: entry.requiresReason }
          : {}),
      },
    ];
  });
}

function readRefreshMetadata(value: unknown): UiRefreshMetadata | null {
  if (!isRecord(value)) {
    return null;
  }
  if (
    typeof value.generatedAt !== "string" ||
    typeof value.staleAfterMs !== "number" ||
    (value.dataFreshness !== "fresh" &&
      value.dataFreshness !== "stale" &&
      value.dataFreshness !== "degraded" &&
      value.dataFreshness !== "unknown") ||
    (value.source !== "live" &&
      value.source !== "cache" &&
      value.source !== "sandbox" &&
      value.source !== "static")
  ) {
    return null;
  }

  return {
    generatedAt: value.generatedAt,
    staleAfterMs: value.staleAfterMs,
    dataFreshness: value.dataFreshness,
    source: value.source,
  };
}

function readEmptyStateEnvelope(value: unknown): EmptyStateEnvelope | null {
  if (!isRecord(value)) {
    return null;
  }
  const reason =
    typeof value.reason === "string" && isEmptyReason(value.reason)
      ? value.reason
      : null;
  if (!reason || typeof value.messageCode !== "string") {
    return null;
  }
  const nextAction = readActions(
    value.nextAction ? [value.nextAction] : undefined,
  )?.[0];

  return {
    reason,
    messageCode: value.messageCode,
    ...(nextAction ? { nextAction } : {}),
  };
}

async function loadListWithEnvelope<T>(
  loader: () => Promise<unknown>,
  locale: "en" | "zh",
): Promise<LoadResult<LoadedListEnvelope<T>>> {
  try {
    const value = await loader();
    if (Array.isArray(value)) {
      return {
        data: {
          items: value as T[],
          emptyState: null,
          refreshMetadata: null,
        },
        error: null,
      };
    }

    if (isRecord(value) && Array.isArray(value.items)) {
      return {
        data: {
          items: value.items as T[],
          emptyState: readEmptyStateEnvelope(value.emptyState),
          refreshMetadata: readRefreshMetadata(value.refreshMetadata),
        },
        error: null,
      };
    }

    return {
      data: {
        items: [],
        emptyState: null,
        refreshMetadata: null,
      },
      error: t("common.unknown", locale),
    };
  } catch (error) {
    return {
      data: null,
      error:
        error instanceof Error ? error.message : t("common.unknown", locale),
    };
  }
}

function isLocationStale(
  snapshot: DriverLocationSnapshot | undefined,
): boolean {
  if (!snapshot) {
    return true;
  }
  const recorded = new Date(snapshot.recordedAt).getTime();
  if (!Number.isFinite(recorded)) {
    return true;
  }
  return Date.now() - recorded > STALE_LOCATION_THRESHOLD_MS;
}

function resolveLocationState(
  snapshot: DriverLocationSnapshot | undefined,
  locationsError: string | null,
): DriverRowModel["locationState"] {
  if (locationsError) {
    return "unknown";
  }
  if (!snapshot) {
    return "missing";
  }
  return isLocationStale(snapshot) ? "stale" : "live";
}

function workStateTone(workState: DriverRegistryRecord["workState"]) {
  if (workState === "available") return "success" as const;
  if (workState === "incident_hold" || workState === "suspended") {
    return "danger" as const;
  }
  if (workState === "offline") return "neutral" as const;
  if (workState === "on_trip") return "info" as const;
  return "warning" as const;
}

function locationTone(state: DriverRowModel["locationState"]) {
  if (state === "live") return "success" as const;
  if (state === "unknown") return "neutral" as const;
  return "warning" as const;
}

function presenceTone(presence: PlatformPresenceRecord) {
  if (presence.reauthRequired) return "warning" as const;
  if (presence.status === "online" && presence.eligibility === "eligible") {
    return "success" as const;
  }
  if (presence.status === "online") return "info" as const;
  return "neutral" as const;
}

function presenceLabel(
  presence: PlatformPresenceRecord,
  locale: "en" | "zh",
): string {
  const name = PLATFORM_CODE_REGISTRY[presence.platformCode]?.displayName;
  const binding = presence.accountId
    ? locale === "zh"
      ? "已綁定"
      : "bound"
    : locale === "zh"
      ? "未綁定"
      : "unbound";
  const status = presence.reauthRequired
    ? locale === "zh"
      ? "reauth"
      : "reauth"
    : formatOpsCodeLabel(locale, presence.status);
  return `${name ?? presence.platformCode} · ${status} · ${binding}`;
}

function buildFallbackDriverActions(
  row: Omit<DriverRowModel, "availableActions">,
): ResourceActionDescriptor[] {
  return [
    {
      action: "open_driver_detail",
      enabled: true,
      riskLevel: "low",
    },
    {
      action: "open_active_dispatch",
      enabled: row.activeForwardedOrders.length > 0,
      riskLevel: "low",
      ...(row.activeForwardedOrders.length > 0
        ? {}
        : { disabledReasonCode: "no_active_forwarded_order" }),
    },
    {
      action: "open_adapter_registry",
      enabled: row.presences.length > 0 || row.presenceLoadFailed,
      riskLevel: "low",
      ...(row.presences.length > 0 || row.presenceLoadFailed
        ? {}
        : { disabledReasonCode: "no_platform_binding" }),
    },
  ];
}

function resolveDriverActions(
  row: Omit<DriverRowModel, "availableActions">,
): ResourceActionDescriptor[] {
  return row.driver.availableActions ?? buildFallbackDriverActions(row);
}

function matchesView(row: DriverRowModel, view: DriversViewKey): boolean {
  if (view === "available") {
    return row.driver.dispatchEligible;
  }
  if (view === "on_trip") {
    return row.driver.workState === "on_trip";
  }
  if (view === "offline") {
    return row.driver.workState === "offline";
  }
  if (view === "license_warn") {
    return !row.driver.licensesValid;
  }
  if (view === "suppression") {
    return row.suppressionActive;
  }
  return true;
}

function matchesFilters(
  row: DriverRowModel,
  filters: DriverListFilters,
): boolean {
  if (!matchesView(row, filters.view)) {
    return false;
  }

  if (filters.shift !== "all" && row.driver.workState !== filters.shift) {
    return false;
  }

  if (filters.platform !== "all") {
    const targetPlatform = filters.platform as PlatformCode;
    if (
      !row.presences.some(
        (presence) => presence.platformCode === targetPlatform,
      )
    ) {
      return false;
    }
  }

  if (filters.eligibility === "eligible" && !row.driver.dispatchEligible) {
    return false;
  }
  if (filters.eligibility === "blocked" && row.driver.dispatchEligible) {
    return false;
  }

  if (filters.query) {
    const normalized = filters.query.toLowerCase();
    const haystack = [
      row.driver.driverId,
      row.driver.name,
      ...row.driver.supportedServiceBuckets,
      ...row.presences.map((presence) => presence.accountId ?? ""),
      ...row.presences.map((presence) => presence.platformCode),
      ...row.activeForwardedOrders.map((order) => order.mirrorOrderId),
    ]
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(normalized)) {
      return false;
    }
  }

  return true;
}

function buildHref(
  filters: DriverListFilters,
  overrides: Partial<DriverListFilters>,
) {
  const next: DriverListFilters = { ...filters, ...overrides };
  const params = new URLSearchParams();
  if (next.query) params.set("q", next.query);
  if (next.view !== "all") params.set("view", next.view);
  if (next.shift !== "all") params.set("shift", next.shift);
  if (next.platform !== "all") params.set("platform", next.platform);
  if (next.eligibility !== "all") params.set("eligibility", next.eligibility);
  if (next.page > 1) params.set("page", String(next.page));
  if (next.emptyReason) params.set("emptyReason", next.emptyReason);
  const query = params.toString();
  return query ? `/drivers?${query}` : "/drivers";
}

function buildPlatformAdminHref(route: string) {
  const base = process.env.DRTS_PLATFORM_ADMIN_ORIGIN?.trim();
  if (!base) {
    return null;
  }
  return `${base.replace(/\/$/, "")}${route}`;
}

function buildEmptyStateModel(
  reason: EmptyReason,
  locale: "en" | "zh",
  filters: DriverListFilters,
  emptyStateEnvelope?: EmptyStateEnvelope | null,
): EmptyStateModel {
  const titleKey =
    reason === "no_data"
      ? "drivers.emptyState.noDataTitle"
      : reason === "not_provisioned"
        ? "drivers.emptyState.notProvisionedTitle"
        : reason === "fetch_failed"
          ? "drivers.emptyState.fetchFailedTitle"
          : reason === "permission_denied"
            ? "drivers.emptyState.permissionDeniedTitle"
            : reason === "external_unavailable"
              ? "drivers.emptyState.externalUnavailableTitle"
              : "drivers.emptyState.filteredEmptyTitle";
  const bodyKey =
    reason === "no_data"
      ? "drivers.emptyState.noDataBody"
      : reason === "not_provisioned"
        ? "drivers.emptyState.notProvisionedBody"
        : reason === "fetch_failed"
          ? "drivers.emptyState.fetchFailedBody"
          : reason === "permission_denied"
            ? "drivers.emptyState.permissionDeniedBody"
            : reason === "external_unavailable"
              ? "drivers.emptyState.externalUnavailableBody"
              : "drivers.emptyState.filteredEmptyBody";
  const accent =
    reason === "fetch_failed" || reason === "permission_denied"
      ? "#b91c1c"
      : reason === "external_unavailable"
        ? "#9a3412"
        : reason === "filtered_empty"
          ? "#1d4ed8"
          : "#0f766e";
  const background =
    reason === "fetch_failed" || reason === "permission_denied"
      ? "#fff1f2"
      : reason === "external_unavailable"
        ? "#fff7ed"
        : reason === "filtered_empty"
          ? "#eff6ff"
          : "#f0fdf4";

  const adapterRegistryHref = buildPlatformAdminHref(
    PLATFORM_ADMIN_ADAPTER_REGISTRY_ROUTE,
  );
  const clearFiltersHref = "/drivers";
  const refreshHref = buildHref(filters, { page: 1 });

  const nextAction =
    emptyStateEnvelope?.nextAction ??
    (reason === "filtered_empty"
      ? {
          action: "clear_filters",
          enabled: true,
          riskLevel: "low" as const,
        }
      : reason === "external_unavailable" && adapterRegistryHref
        ? {
            action: "open_adapter_registry",
            enabled: true,
            riskLevel: "low" as const,
          }
        : reason === "fetch_failed"
          ? {
              action: "refresh_list",
              enabled: true,
              riskLevel: "low" as const,
            }
          : undefined);

  const nextHref =
    reason === "filtered_empty"
      ? clearFiltersHref
      : reason === "external_unavailable"
        ? (adapterRegistryHref ?? undefined)
        : reason === "fetch_failed"
          ? refreshHref
          : undefined;

  return {
    reason,
    titleKey,
    bodyKey,
    accent,
    background,
    icon:
      reason === "fetch_failed"
        ? "!"
        : reason === "external_unavailable"
          ? "↗"
          : reason === "permission_denied"
            ? "⛔"
            : reason === "filtered_empty"
              ? "⌕"
              : reason === "not_provisioned"
                ? "⋯"
                : "○",
    ...(nextAction ? { nextAction } : {}),
    ...(nextHref ? { nextHref } : {}),
    ...(reason === "external_unavailable" && adapterRegistryHref
      ? { nextTarget: "_blank" as const }
      : {}),
  };
}

function isRefreshMetadataStale(
  refreshMetadata: UiRefreshMetadata | null,
): boolean {
  if (!refreshMetadata) {
    return false;
  }
  if (refreshMetadata.dataFreshness !== "fresh") {
    return true;
  }
  const generatedAt = new Date(refreshMetadata.generatedAt).getTime();
  if (!Number.isFinite(generatedAt)) {
    return false;
  }
  return Date.now() - generatedAt > refreshMetadata.staleAfterMs;
}

function getRefreshBannerModel(
  refreshMetadata: UiRefreshMetadata | null,
  locale: "en" | "zh",
) {
  if (!refreshMetadata) {
    return null;
  }

  const stale = isRefreshMetadataStale(refreshMetadata);
  if (refreshMetadata.dataFreshness === "degraded") {
    return {
      title: t("drivers.refreshBanner.degradedTitle", locale),
      body: t("drivers.refreshBanner.degradedBody", locale),
      background: "#fff7ed",
      border: "#fdba74",
      color: "#9a3412",
    };
  }
  if (refreshMetadata.dataFreshness === "unknown") {
    return {
      title: t("drivers.refreshBanner.unknownTitle", locale),
      body: t("drivers.refreshBanner.unknownBody", locale),
      background: "#f8fafc",
      border: "#cbd5e1",
      color: "#475569",
    };
  }
  if (refreshMetadata.dataFreshness === "stale" || stale) {
    return {
      title: t("drivers.refreshBanner.staleTitle", locale),
      body: t("drivers.refreshBanner.staleBody", locale, {
        source: refreshMetadata.source,
      }),
      background: "#fffbeb",
      border: "#fcd34d",
      color: "#92400e",
    };
  }

  return null;
}

function getDriverActionPresentation(
  row: DriverRowModel,
  action: ResourceActionDescriptor,
  locale: "en" | "zh",
) {
  if (
    action.action === "open_driver_detail" ||
    action.action === "open_driver" ||
    action.action === "view_driver_detail"
  ) {
    return {
      href: `/drivers/${encodeURIComponent(row.driver.driverId)}`,
      label: t("drivers.list.openDetail", locale),
      ariaLabel: getOpsLabel(locale, "openDriverDetail", {
        driverId: row.driver.driverId,
      }),
    };
  }

  if (
    action.action === "open_active_dispatch" ||
    action.action === "open_dispatch" ||
    action.action === "view_dispatch_detail"
  ) {
    return row.activeForwardedOrders[0]
      ? {
          href: `/dispatch/${encodeURIComponent(row.activeForwardedOrders[0].mirrorOrderId)}`,
          label: t("drivers.list.openDispatch", locale),
        }
      : {
          label: t("drivers.list.openDispatch", locale),
        };
  }

  if (
    action.action === "open_adapter_registry" ||
    action.action === "inspect_adapter_registry" ||
    action.action === "open_platform_admin_adapter_registry"
  ) {
    const href = buildPlatformAdminHref(PLATFORM_ADMIN_ADAPTER_REGISTRY_ROUTE);
    return href
      ? {
          href,
          target: "_blank" as const,
          label: t("drivers.list.openAdapterRegistry", locale),
        }
      : {
          label: t("drivers.list.openAdapterRegistry", locale),
        };
  }

  return {
    label: formatOpsCodeLabel(locale, action.action),
  };
}

function renderEmptyState(
  model: EmptyStateModel,
  locale: "en" | "zh",
): ReactNode {
  return (
    <div
      style={{
        borderRadius: "1rem",
        border: `1px dashed ${model.accent}`,
        background: model.background,
        color: "#0f172a",
        padding: "1.5rem",
        margin: "0 1.1rem 1.1rem",
        display: "grid",
        gap: "0.9rem",
      }}
    >
      <div
        style={{ display: "flex", gap: "0.85rem", alignItems: "flex-start" }}
      >
        <div
          aria-hidden
          style={{
            width: "2rem",
            height: "2rem",
            borderRadius: "999px",
            display: "grid",
            placeItems: "center",
            color: "#fff",
            fontWeight: 800,
            background: model.accent,
            flex: "0 0 auto",
          }}
        >
          {model.icon}
        </div>
        <div style={{ display: "grid", gap: "0.35rem" }}>
          <strong style={{ display: "block", color: model.accent }}>
            {t(model.titleKey, locale)}
          </strong>
          <span style={{ fontSize: "0.92rem", lineHeight: 1.55 }}>
            {t(model.bodyKey, locale)}
          </span>
        </div>
      </div>
      {model.nextAction?.enabled && model.nextHref ? (
        <div>
          <Link
            href={model.nextHref}
            target={model.nextTarget}
            rel={model.nextTarget === "_blank" ? "noreferrer" : undefined}
            style={subtleButtonStyle}
          >
            {t(`drivers.emptyState.action.${model.nextAction.action}`, locale)}
          </Link>
        </div>
      ) : null}
    </div>
  );
}

export default async function DriversPage({ searchParams }: DriversPageProps) {
  const resolvedSearchParams = await (searchParams ?? Promise.resolve({}));
  const filters = resolveFilters(resolvedSearchParams);
  const [client, locale] = await Promise.all([
    getServerOpsClient(),
    getServerLocale(),
  ]);

  const generatedAt = new Date().toISOString();

  const [driversResult, locationsResult, forwardedResult] = await Promise.all([
    loadListWithEnvelope<DriverRegistryListItem>(
      () => client.listDrivers() as Promise<unknown>,
      locale,
    ),
    loadWithError<DriverLocationSnapshot[]>(
      () => client.listDriverLocations(),
      locale,
    ),
    loadWithError<ForwardedOrderRecord[]>(
      () => client.listForwarderOrders(),
      locale,
    ),
  ]);

  const driversEnvelope = driversResult.data;
  const drivers = driversEnvelope?.items ?? [];
  const locations = locationsResult.data ?? [];
  const locationByDriver = new Map<string, DriverLocationSnapshot>();
  for (const snapshot of locations) {
    locationByDriver.set(snapshot.driverId, snapshot);
  }

  const presenceResults = await Promise.all(
    drivers.map(async (driver) => ({
      driverId: driver.driverId,
      result: await loadWithError<PlatformPresenceSummary>(
        () => client.getPlatformPresence({ driverId: driver.driverId }),
        locale,
      ),
    })),
  );
  const presenceByDriver = new Map(
    presenceResults.map((entry) => [entry.driverId, entry.result]),
  );
  const activeForwardedStatuses = new Set<ForwardedOrderRecord["status"]>([
    "broadcasted",
    "accept_pending",
    "confirmed_by_platform",
    "sync_failed",
  ]);

  const rows = drivers.map<DriverRowModel>((driver) => {
    const presenceResult = presenceByDriver.get(driver.driverId);
    const presences = presenceResult?.data?.presences ?? [];
    const baseRow = {
      driver,
      location: locationByDriver.get(driver.driverId),
      locationState: resolveLocationState(
        locationByDriver.get(driver.driverId),
        locationsResult.error,
      ),
      presences,
      presenceLoadFailed: Boolean(presenceResult?.error),
      activeForwardedOrders: (forwardedResult.data ?? []).filter(
        (order) =>
          order.acceptedDriverId === driver.driverId &&
          activeForwardedStatuses.has(order.status),
      ),
      suppressionActive: driver.workState === "incident_hold",
    };
    return {
      ...baseRow,
      availableActions: resolveDriverActions(baseRow),
    };
  });

  const tabCounts: Record<DriversViewKey, number> = {
    all: rows.length,
    available: rows.filter((row) => row.driver.dispatchEligible).length,
    on_trip: rows.filter((row) => row.driver.workState === "on_trip").length,
    offline: rows.filter((row) => row.driver.workState === "offline").length,
    license_warn: rows.filter((row) => !row.driver.licensesValid).length,
    suppression: rows.filter((row) => row.suppressionActive).length,
  };

  const filteredRows = filters.emptyReason
    ? []
    : rows.filter((row) => matchesFilters(row, filters));
  const liveLocationCount = rows.filter(
    (row) => row.locationState === "live",
  ).length;
  const staleLocationCount = rows.filter(
    (row) => row.locationState === "stale",
  ).length;
  const presenceErrorCount = presenceResults.filter(
    (entry) => entry.result.error,
  ).length;
  const forceExternalUnavailable =
    filters.platform !== "all" &&
    filteredRows.length === 0 &&
    presenceErrorCount > 0 &&
    !driversResult.error;

  const backendEmptyState =
    rows.length === 0 ? (driversEnvelope?.emptyState ?? null) : null;
  const emptyReason: EmptyReason | null = filters.emptyReason
    ? filters.emptyReason
    : driversResult.error
      ? "fetch_failed"
      : forceExternalUnavailable
        ? "external_unavailable"
        : (backendEmptyState?.reason ??
          (rows.length === 0
            ? "no_data"
            : filteredRows.length === 0
              ? "filtered_empty"
              : null));
  const emptyStateModel = emptyReason
    ? buildEmptyStateModel(emptyReason, locale, filters, backendEmptyState)
    : null;
  const refreshMetadata = driversEnvelope?.refreshMetadata ?? null;
  const refreshBanner = getRefreshBannerModel(refreshMetadata, locale);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(filters.page, totalPages);
  const pagedRows = filteredRows.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const staleSurge = rows.length > 0 && staleLocationCount / rows.length >= 0.3;
  const shiftOptions = Array.from(
    new Set(rows.map((row) => row.driver.workState)),
  );
  const platformOptions = Array.from(
    new Set(
      rows.flatMap((row) =>
        row.presences.map((presence) => presence.platformCode),
      ),
    ),
  ).sort();

  return (
    <>
      <RefreshOnInterval intervalMs={REFRESH_INTERVAL_MS} />

      <PageHeader
        title={locale === "zh" ? "司機" : "Drivers"}
        eyebrow={locale === "zh" ? "主資料" : "Registry"}
        subtitle={t("drivers.pageSubtitle", locale, {
          count: filteredRows.length,
          total: rows.length,
        })}
        actions={
          <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
            <Link
              href={buildHref(filters, { page: 1 })}
              style={subtleButtonStyle}
            >
              {t("drivers.actions.refresh", locale)}
            </Link>
            <Link href="#drivers-filters" style={subtleButtonStyle}>
              {t("drivers.actions.filter", locale)}
            </Link>
          </div>
        }
        meta={[
          {
            label: t("drivers.meta.refreshTier", locale),
            value: t("drivers.meta.refreshValue", locale),
            tone: "info",
          },
          {
            label: t("drivers.meta.generatedAt", locale),
            value: refreshMetadata?.generatedAt ?? generatedAt,
            tone: isRefreshMetadataStale(refreshMetadata)
              ? "warning"
              : "neutral",
          },
          {
            label: t("drivers.meta.visible", locale),
            value: t("common.visible", locale, { count: filteredRows.length }),
            tone: "ops",
          },
        ]}
      />

      <div style={shellStyle}>
        {driversResult.error ? (
          <div
            style={{
              ...alertBaseStyle,
              background: "#fff1f2",
              border: "1px solid #fecdd3",
              color: "#9f1239",
            }}
          >
            <span style={bannerStrongStyle}>
              {t("drivers.list.registryUnavailable", locale)}
            </span>
            {driversResult.error}
          </div>
        ) : null}

        {locationsResult.error ? (
          <div
            style={{
              ...alertBaseStyle,
              background: "#fff7ed",
              border: "1px solid #fdba74",
              color: "#9a3412",
            }}
          >
            <span style={bannerStrongStyle}>
              {t("drivers.list.locationsUnavailable", locale)}
            </span>
            {locationsResult.error}
          </div>
        ) : null}

        {presenceErrorCount > 0 ? (
          <div
            style={{
              ...alertBaseStyle,
              background: "#fff7ed",
              border: "1px solid #fed7aa",
              color: "#9a3412",
            }}
          >
            <span style={bannerStrongStyle}>
              {t("drivers.list.platformStatusUnavailable", locale, {
                count: presenceErrorCount,
              })}
            </span>
            {t("drivers.list.platformStatusUnavailableBody", locale)}
          </div>
        ) : null}

        {refreshBanner ? (
          <div
            style={{
              ...alertBaseStyle,
              background: refreshBanner.background,
              border: `1px solid ${refreshBanner.border}`,
              color: refreshBanner.color,
            }}
          >
            <span style={bannerStrongStyle}>{refreshBanner.title}</span>
            {refreshBanner.body}
          </div>
        ) : null}

        {staleSurge ? (
          <div
            style={{
              ...alertBaseStyle,
              background: "#fffbeb",
              border: "1px solid #fcd34d",
              color: "#92400e",
            }}
          >
            <span style={bannerStrongStyle}>
              {t("drivers.list.staleSurgeTitle", locale)}
            </span>
            {t("drivers.list.staleSurgeBody", locale, {
              stale: staleLocationCount,
              total: rows.length,
            })}
          </div>
        ) : null}

        <section style={panelStyle}>
          <div id="drivers-filters" style={filterBarStyle}>
            <div style={tabsRowStyle}>
              {(
                [
                  ["all", "drivers.tabs.all"],
                  ["available", "drivers.tabs.available"],
                  ["on_trip", "drivers.tabs.onTrip"],
                  ["offline", "drivers.tabs.offline"],
                  ["license_warn", "drivers.tabs.licenseWarn"],
                  ["suppression", "drivers.tabs.suppression"],
                ] as const
              ).map(([viewKey, labelKey]) => {
                const active = filters.view === viewKey;
                return (
                  <Link
                    key={viewKey}
                    href={buildHref(filters, { view: viewKey, page: 1 })}
                    style={{
                      ...tabBaseStyle,
                      borderColor: active ? "#0f172a" : "#dbe4ee",
                      background: active ? "#0f172a" : "#fff",
                      color: active ? "#fff" : "#334155",
                    }}
                  >
                    <span>{t(labelKey, locale)}</span>
                    <span
                      style={{
                        display: "inline-flex",
                        minWidth: "1.6rem",
                        justifyContent: "center",
                        padding: "0.1rem 0.35rem",
                        borderRadius: "999px",
                        background: active
                          ? "rgba(255,255,255,0.16)"
                          : "#f1f5f9",
                        color: active ? "#fff" : "#475569",
                        fontSize: "0.8rem",
                      }}
                    >
                      {tabCounts[viewKey]}
                    </span>
                  </Link>
                );
              })}
            </div>

            <form method="get" style={filterRowStyle}>
              <input
                name="q"
                defaultValue={filters.query}
                placeholder={t("drivers.filters.searchPlaceholder", locale)}
                style={searchInputStyle}
              />
              <select
                name="shift"
                defaultValue={filters.shift}
                style={selectStyle}
              >
                <option value="all">
                  {t("drivers.filters.allShift", locale)}
                </option>
                {shiftOptions.map((shift) => (
                  <option key={shift} value={shift}>
                    {formatOpsCodeLabel(locale, shift)}
                  </option>
                ))}
              </select>
              <select
                name="platform"
                defaultValue={filters.platform}
                style={selectStyle}
              >
                <option value="all">
                  {t("drivers.filters.allPlatforms", locale)}
                </option>
                {platformOptions.map((platformCode) => (
                  <option key={platformCode} value={platformCode}>
                    {PLATFORM_CODE_REGISTRY[platformCode]?.displayName ??
                      platformCode}
                  </option>
                ))}
              </select>
              <select
                name="eligibility"
                defaultValue={filters.eligibility}
                style={selectStyle}
              >
                <option value="all">
                  {t("drivers.filters.allEligibility", locale)}
                </option>
                <option value="eligible">
                  {t("drivers.filters.eligibleOnly", locale)}
                </option>
                <option value="blocked">
                  {t("drivers.filters.blockedOnly", locale)}
                </option>
              </select>
              <button type="submit" style={primaryButtonStyle}>
                {t("common.search", locale)}
              </button>
              <Link href="/drivers" style={subtleButtonStyle}>
                {t("drivers.filters.reset", locale)}
              </Link>
            </form>
          </div>

          {emptyStateModel ? (
            renderEmptyState(emptyStateModel, locale)
          ) : (
            <>
              <DataTable
                density="compact"
                tone="ops"
                minWidth={1220}
                columns={[
                  { label: t("drivers.col.driver", locale), width: "220px" },
                  { label: t("drivers.col.shift", locale), width: "140px" },
                  {
                    label: t("drivers.col.platformsOnline", locale),
                    width: "260px",
                  },
                  {
                    label: t("drivers.col.eligibilityBuckets", locale),
                    width: "200px",
                  },
                  {
                    label: t("drivers.col.activeOrders", locale),
                    width: "180px",
                  },
                  {
                    label: t("drivers.col.locationSignal", locale),
                    width: "150px",
                  },
                  { label: t("common.actions", locale), width: "220px" },
                ]}
              >
                {pagedRows.map((row) => {
                  const locationLabel =
                    row.locationState === "unknown"
                      ? t("drivers.list.locationUnknown", locale)
                      : row.locationState === "missing"
                        ? t("drivers.list.locationMissing", locale)
                        : row.locationState === "stale"
                          ? t("drivers.list.locationStale", locale)
                          : t("drivers.list.locationLive", locale);

                  return (
                    <Tr
                      key={row.driver.driverId}
                      highlighted={row.suppressionActive}
                    >
                      <Td density="compact">
                        <DataCellStack
                          primary={<strong>{row.driver.name}</strong>}
                          secondary={`${row.driver.driverId} · ${formatOpsCodeLabel(
                            locale,
                            row.driver.lifecycleStatus,
                          )}`}
                          tertiary={
                            row.suppressionActive
                              ? t("drivers.list.suppressionActive", locale)
                              : row.driver.supportedServiceBuckets.join(" · ")
                          }
                        />
                      </Td>
                      <Td density="compact">
                        <div style={{ display: "grid", gap: "0.35rem" }}>
                          <StatusChip
                            tone={workStateTone(row.driver.workState)}
                            authorityLabel={locale === "zh" ? "班次" : "shift"}
                            label={formatOpsCodeLabel(
                              locale,
                              row.driver.workState,
                            )}
                          />
                          <StatusChip
                            tone={
                              row.driver.licensesValid ? "success" : "warning"
                            }
                            authorityLabel={
                              locale === "zh" ? "license" : "license"
                            }
                            label={
                              row.driver.licensesValid
                                ? t("common.valid", locale)
                                : t("common.invalid", locale)
                            }
                          />
                        </div>
                      </Td>
                      <Td density="compact">
                        {row.presences.length > 0 ? (
                          <DataCellStack
                            primary={
                              <div style={actionListStyle}>
                                {row.presences.map((presence) => (
                                  <StatusChip
                                    key={`${row.driver.driverId}:${presence.platformCode}`}
                                    tone={presenceTone(presence)}
                                    authorityLabel={
                                      PLATFORM_CODE_REGISTRY[
                                        presence.platformCode
                                      ]?.displayName ?? presence.platformCode
                                    }
                                    label={
                                      presence.reauthRequired
                                        ? locale === "zh"
                                          ? "reauth"
                                          : "reauth"
                                        : formatOpsCodeLabel(
                                            locale,
                                            presence.status,
                                          )
                                    }
                                  />
                                ))}
                              </div>
                            }
                            secondary={row.presences
                              .map((presence) =>
                                presenceLabel(presence, locale),
                              )
                              .join(" · ")}
                            tertiary={
                              row.presenceLoadFailed
                                ? t(
                                    "drivers.list.platformStatusPartial",
                                    locale,
                                  )
                                : undefined
                            }
                          />
                        ) : (
                          <DataCellStack
                            primary={t(
                              "drivers.list.noPlatformBindings",
                              locale,
                            )}
                            secondary={
                              row.presenceLoadFailed
                                ? t(
                                    "drivers.list.platformStatusPartial",
                                    locale,
                                  )
                                : t("drivers.list.bindingMissing", locale)
                            }
                          />
                        )}
                      </Td>
                      <Td density="compact" muted={row.driver.dispatchEligible}>
                        <DataCellStack
                          primary={
                            row.driver.dispatchEligible
                              ? t("drivers.list.eligibilityClear", locale)
                              : row.driver.eligibilityBlockedReasons
                                  .map((reason) =>
                                    formatOpsCodeLabel(locale, reason),
                                  )
                                  .join("、")
                          }
                          secondary={row.driver.supportedServiceBuckets.join(
                            " · ",
                          )}
                        />
                      </Td>
                      <Td density="compact">
                        {row.activeForwardedOrders.length > 0 ? (
                          <div style={{ display: "grid", gap: "0.35rem" }}>
                            {row.activeForwardedOrders
                              .slice(0, 2)
                              .map((order) => (
                                <Link
                                  key={order.mirrorOrderId}
                                  href={`/dispatch/${encodeURIComponent(order.mirrorOrderId)}`}
                                  style={{
                                    color: "#1d4ed8",
                                    textDecoration: "none",
                                    fontWeight: 600,
                                  }}
                                >
                                  {PLATFORM_CODE_REGISTRY[order.platformCode]
                                    ?.displayName ?? order.platformCode}
                                  {" · "}
                                  {order.mirrorOrderId}
                                </Link>
                              ))}
                          </div>
                        ) : (
                          <DataCellStack
                            primary={t("drivers.list.noActiveOrders", locale)}
                            secondary={t(
                              "drivers.list.activeOrdersFallback",
                              locale,
                            )}
                          />
                        )}
                      </Td>
                      <Td density="compact">
                        <DataCellStack
                          primary={
                            <StatusChip
                              tone={locationTone(row.locationState)}
                              authorityLabel={
                                locale === "zh" ? "定位" : "location"
                              }
                              label={locationLabel}
                            />
                          }
                          secondary={
                            row.location?.recordedAt
                              ? t(
                                  "driverDetail.summary.locationRecordedAt",
                                  locale,
                                  {
                                    recordedAt: row.location.recordedAt,
                                  },
                                )
                              : undefined
                          }
                        />
                      </Td>
                      <Td density="compact">
                        <div style={actionListStyle}>
                          {row.availableActions.map((action) => {
                            const presentation = getDriverActionPresentation(
                              row,
                              action,
                              locale,
                            );

                            if (action.enabled && presentation.href) {
                              return (
                                <Link
                                  key={action.action}
                                  href={presentation.href}
                                  target={presentation.target}
                                  rel={
                                    presentation.target === "_blank"
                                      ? "noreferrer"
                                      : undefined
                                  }
                                  style={actionLinkStyle}
                                  aria-label={presentation.ariaLabel}
                                >
                                  {presentation.label}
                                </Link>
                              );
                            }

                            return (
                              <span
                                key={action.action}
                                style={disabledActionStyle}
                                title={
                                  action.disabledReasonCode
                                    ? formatOpsCodeLabel(
                                        locale,
                                        action.disabledReasonCode,
                                      )
                                    : action.enabled
                                      ? action.action
                                      : undefined
                                }
                              >
                                {presentation.label}
                              </span>
                            );
                          })}
                        </div>
                      </Td>
                    </Tr>
                  );
                })}
              </DataTable>

              <div style={pageFooterStyle}>
                <span style={{ color: "#64748b", fontSize: "0.88rem" }}>
                  {t("drivers.registrySummary", locale, {
                    eligible: rows.filter((row) => row.driver.dispatchEligible)
                      .length,
                    blocked:
                      rows.length -
                      rows.filter((row) => row.driver.dispatchEligible).length,
                    live: liveLocationCount,
                    stale: staleLocationCount,
                  })}
                </span>
                <div
                  style={{
                    display: "flex",
                    gap: "0.6rem",
                    alignItems: "center",
                  }}
                >
                  <Link
                    href={buildHref(filters, {
                      page: Math.max(1, currentPage - 1),
                    })}
                    style={{
                      ...subtleButtonStyle,
                      pointerEvents: currentPage === 1 ? "none" : "auto",
                      opacity: currentPage === 1 ? 0.45 : 1,
                    }}
                  >
                    {t("drivers.pagination.prev", locale)}
                  </Link>
                  <span
                    style={{
                      color: "#334155",
                      fontSize: "0.88rem",
                      fontWeight: 600,
                    }}
                  >
                    {t("drivers.pagination.summary", locale, {
                      page: currentPage,
                      totalPages,
                    })}
                  </span>
                  <Link
                    href={buildHref(filters, {
                      page: Math.min(totalPages, currentPage + 1),
                    })}
                    style={{
                      ...subtleButtonStyle,
                      pointerEvents:
                        currentPage === totalPages ? "none" : "auto",
                      opacity: currentPage === totalPages ? 0.45 : 1,
                    }}
                  >
                    {t("drivers.pagination.next", locale)}
                  </Link>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </>
  );
}
