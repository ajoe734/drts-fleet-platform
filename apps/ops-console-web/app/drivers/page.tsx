import Link from "next/link";
import type { CSSProperties } from "react";
import type {
  DriverLocationSnapshot,
  DriverMatchingSuppression,
  DriverRegistryRecord,
  EmptyReason,
  EmptyStateEnvelope,
  ForwardedOrderRecord,
  PlatformCode,
  PlatformPresenceRecord,
  PlatformPresenceSummary,
  RefreshTier,
  ResourceActionDescriptor,
  UiRefreshMetadata,
} from "@drts/contracts";
import { PLATFORM_CODE_REGISTRY } from "@drts/contracts";
import { RefreshOnInterval } from "@/components/refresh-on-interval";
import { getServerOpsClient } from "@/lib/api-client.server";
import { formatOpsCodeLabel, getOpsLabel } from "@/lib/localized-labels";
import { getRefreshIntervalMs } from "@/lib/refresh-tier";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import {
  CanvasCard as Card,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasTable as Table,
  buildCanvasTheme,
  type CanvasTableColumn,
  type CanvasTheme,
  type CanvasTone,
} from "@drts/ui-web";

const STALE_LOCATION_THRESHOLD_MS = 5 * 60 * 1000;
const DRIVERS_REFRESH_TIER: RefreshTier = "medium";
const DRIVERS_REFRESH_INTERVAL_MS =
  getRefreshIntervalMs(DRIVERS_REFRESH_TIER) ?? 15_000;
const PAGE_SIZE = 12;
const PLATFORM_ADMIN_ADAPTER_REGISTRY_ROUTE = "/adapter-registry";
const theme = buildCanvasTheme({
  surface: "ops",
  dark: false,
  density: "compact",
});

type Locale = "en" | "zh";

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
  driver: DriverRegistryRecord;
  location: DriverLocationSnapshot | undefined;
  locationState: "live" | "stale" | "missing" | "unknown";
  presences: PlatformPresenceRecord[];
  presenceLoadFailed: boolean;
  activeForwardedOrders: ForwardedOrderRecord[];
  matchingSuppression: DriverMatchingSuppression | null;
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

type LoadedListEnvelope<T> = {
  items: T[];
  emptyState: EmptyStateEnvelope | null;
  refreshMetadata: UiRefreshMetadata | null;
};

type DriverTableRow = Record<string, unknown> & {
  _selected?: boolean;
  row: DriverRowModel;
};

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "grid",
  gap: 16,
};

const signalGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const signalCardStyle: CSSProperties = {
  padding: "14px 16px",
  borderRadius: 10,
  border: `1px solid ${theme.border}`,
  background: theme.surface,
  display: "grid",
  gap: 6,
};

const signalValueStyle: CSSProperties = {
  fontSize: 24,
  fontWeight: 700,
  color: theme.text,
  letterSpacing: -0.3,
};

const signalLabelStyle: CSSProperties = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: 0.45,
  color: theme.textMuted,
};

const signalDetailStyle: CSSProperties = {
  fontSize: 12,
  color: theme.textDim,
  lineHeight: 1.45,
};

const bannerStackStyle: CSSProperties = {
  display: "grid",
  gap: 10,
};

const filterGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns:
    "minmax(240px, 1.4fr) repeat(3, minmax(140px, 0.8fr)) auto auto",
  gap: 10,
  alignItems: "end",
};

const fieldLabelStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: 0.45,
  color: theme.textMuted,
};

const filterControlStyle: CSSProperties = {
  minHeight: 34,
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: theme.surfaceLo,
  color: theme.text,
  padding: "0 10px",
  fontSize: 12.5,
  fontFamily: theme.fontFamily,
};

const filterActionsStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  justifyContent: "flex-end",
};

const chipRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const driverPrimaryStyle: CSSProperties = {
  color: theme.text,
  textDecoration: "none",
  fontWeight: 700,
};

const driverSecondaryStyle: CSSProperties = {
  fontSize: 11.5,
  color: theme.textDim,
  fontFamily: theme.monoFamily,
};

const stackStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  minWidth: 0,
};

const inlineLinkStyle: CSSProperties = {
  color: theme.accent,
  textDecoration: "none",
  fontWeight: 600,
};

const actionsWrapStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const footerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
};

const footerTextStyle: CSSProperties = {
  fontSize: 12,
  color: theme.textDim,
  lineHeight: 1.45,
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
  locale: Locale,
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

function readMatchingSuppression(
  value: unknown,
): DriverMatchingSuppression | null | undefined {
  if (value == null) {
    return null;
  }
  if (!isRecord(value)) {
    return undefined;
  }
  if (
    typeof value.active !== "boolean" ||
    (value.reasonCode !== "incident" &&
      value.reasonCode !== "compliance_hold" &&
      value.reasonCode !== "manual_ops_hold") ||
    typeof value.expiresAt !== "string" ||
    !(typeof value.liftedAt === "string" || value.liftedAt === null)
  ) {
    return undefined;
  }

  return {
    active: value.active,
    reasonCode: value.reasonCode,
    expiresAt: value.expiresAt,
    liftedAt: value.liftedAt,
    ...(typeof value.sourceIncidentId === "string" ||
    value.sourceIncidentId === null
      ? { sourceIncidentId: value.sourceIncidentId }
      : {}),
  };
}

function readDriverRegistryListItem(
  value: unknown,
): DriverRegistryRecord | null {
  if (
    !isRecord(value) ||
    typeof value.driverId !== "string" ||
    typeof value.name !== "string"
  ) {
    return null;
  }

  const availableActions = readActions(value.availableActions);
  const matchingSuppression = readMatchingSuppression(
    value.matchingSuppression,
  );

  return {
    ...(value as unknown as DriverRegistryRecord),
    ...(availableActions ? { availableActions } : {}),
    ...(matchingSuppression !== undefined ? { matchingSuppression } : {}),
  };
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

function presenceTone(presence: PlatformPresenceRecord): CanvasTone {
  if (presence.reauthRequired) return "warn";
  if (presence.status === "online" && presence.eligibility === "eligible") {
    return "success";
  }
  if (presence.status === "online") return "info";
  return "neutral";
}

function presenceLabel(
  presence: PlatformPresenceRecord,
  locale: Locale,
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
    ? "reauth"
    : formatOpsCodeLabel(locale, presence.status);
  return `${name ?? presence.platformCode} · ${status} · ${binding}`;
}

function matchesView(row: DriverRowModel, view: DriversViewKey): boolean {
  if (view === "available") return row.driver.dispatchEligible;
  if (view === "on_trip") return row.driver.workState === "on_trip";
  if (view === "offline") return row.driver.workState === "offline";
  if (view === "license_warn") return !row.driver.licensesValid;
  if (view === "suppression") return row.suppressionActive;
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
      row.driver.phone ?? "",
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

function getEmptyStateActionPresentation(
  action: ResourceActionDescriptor,
  filters: DriverListFilters,
) {
  if (action.action === "clear_filters") {
    return { href: "/drivers" };
  }
  if (action.action === "refresh_list") {
    return { href: buildHref(filters, { page: 1 }) };
  }
  if (
    action.action === "open_adapter_registry" ||
    action.action === "inspect_adapter_registry" ||
    action.action === "open_platform_admin_adapter_registry"
  ) {
    const href = buildPlatformAdminHref(PLATFORM_ADMIN_ADAPTER_REGISTRY_ROUTE);
    return href ? { href, target: "_blank" as const } : {};
  }
  return {};
}

function buildEmptyStateModel(
  reason: EmptyReason,
  locale: Locale,
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
        ? "#b45309"
        : reason === "filtered_empty"
          ? theme.accent
          : "#0f766e";
  const background =
    reason === "fetch_failed" || reason === "permission_denied"
      ? "#fff1f2"
      : reason === "external_unavailable"
        ? "#fff7ed"
        : reason === "filtered_empty"
          ? "#eef6ff"
          : "#ecfdf5";

  const nextAction =
    emptyStateEnvelope?.nextAction ??
    (reason === "filtered_empty"
      ? { action: "clear_filters", enabled: true, riskLevel: "low" as const }
      : reason === "external_unavailable"
        ? {
            action: "open_adapter_registry",
            enabled: true,
            riskLevel: "low" as const,
          }
        : reason === "fetch_failed"
          ? { action: "refresh_list", enabled: true, riskLevel: "low" as const }
          : undefined);
  const nextActionPresentation = nextAction
    ? getEmptyStateActionPresentation(nextAction, filters)
    : null;

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
    ...(nextActionPresentation?.href
      ? { nextHref: nextActionPresentation.href }
      : {}),
    ...(nextActionPresentation?.target
      ? { nextTarget: nextActionPresentation.target }
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
  locale: Locale,
) {
  if (!refreshMetadata) {
    return null;
  }

  const stale = isRefreshMetadataStale(refreshMetadata);
  if (refreshMetadata.dataFreshness === "degraded") {
    return {
      title: t("drivers.refreshBanner.degradedTitle", locale),
      body: t("drivers.refreshBanner.degradedBody", locale),
      tone: "warn" as const,
    };
  }
  if (refreshMetadata.dataFreshness === "unknown") {
    return {
      title: t("drivers.refreshBanner.unknownTitle", locale),
      body: t("drivers.refreshBanner.unknownBody", locale),
      tone: "neutral" as const,
    };
  }
  if (refreshMetadata.dataFreshness === "stale" || stale) {
    return {
      title: t("drivers.refreshBanner.staleTitle", locale),
      body: t("drivers.refreshBanner.staleBody", locale, {
        source: refreshMetadata.source,
      }),
      tone: "warn" as const,
    };
  }
  return null;
}

function getDriverActionPresentation(
  row: DriverRowModel,
  action: ResourceActionDescriptor,
  locale: Locale,
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
      : { label: t("drivers.list.openDispatch", locale) };
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
      : { label: t("drivers.list.openAdapterRegistry", locale) };
  }
  return {
    label: formatOpsCodeLabel(locale, action.action),
  };
}

function getPrimaryDriverDetailPresentation(
  row: DriverRowModel,
  locale: Locale,
) {
  const action = row.availableActions.find(
    (candidate) =>
      candidate.enabled &&
      (candidate.action === "open_driver_detail" ||
        candidate.action === "open_driver" ||
        candidate.action === "view_driver_detail"),
  );

  return action ? getDriverActionPresentation(row, action, locale) : null;
}

function getLocationTone(state: DriverRowModel["locationState"]): CanvasTone {
  if (state === "live") return "success";
  if (state === "unknown") return "neutral";
  return "warn";
}

function getStatusTone(
  workState: DriverRegistryRecord["workState"],
): CanvasTone {
  if (workState === "available") return "success";
  if (workState === "on_trip") return "info";
  if (workState === "incident_hold" || workState === "suspended") {
    return "danger";
  }
  if (workState === "offline") return "neutral";
  return "warn";
}

function buttonLinkStyle(
  currentTheme: CanvasTheme,
  variant: "primary" | "secondary" = "secondary",
  disabled = false,
): CSSProperties {
  const styles =
    variant === "primary"
      ? {
          background: currentTheme.accent,
          color: "#fff",
          borderColor: currentTheme.accent,
        }
      : {
          background: currentTheme.surface,
          color: currentTheme.text,
          borderColor: currentTheme.border,
        };

  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 28,
    padding: "5px 10px",
    fontSize: 12,
    fontWeight: 500,
    textDecoration: "none",
    borderRadius: 7,
    border: `1px solid ${styles.borderColor}`,
    background: styles.background,
    color: styles.color,
    lineHeight: 1,
    opacity: disabled ? 0.5 : 1,
    pointerEvents: disabled ? "none" : "auto",
  };
}

function toneBannerStyle(tone: "neutral" | "warn" | "danger" | "success") {
  if (tone === "danger") {
    return {
      background: "#fff1f2",
      borderColor: "#fecdd3",
      color: "#9f1239",
    };
  }
  if (tone === "warn") {
    return {
      background: "#fff7ed",
      borderColor: "#fdba74",
      color: "#9a3412",
    };
  }
  if (tone === "success") {
    return {
      background: "#ecfdf5",
      borderColor: "#86efac",
      color: "#166534",
    };
  }
  return {
    background: "#f8fafc",
    borderColor: "#cbd5e1",
    color: "#475569",
  };
}

function renderBanner(
  title: string,
  body: string,
  tone: "neutral" | "warn" | "danger" | "success",
) {
  const style = toneBannerStyle(tone);
  return (
    <div
      style={{
        ...style,
        border: `1px solid ${style.borderColor}`,
        borderRadius: 10,
        padding: "12px 14px",
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>{body}</div>
    </div>
  );
}

function renderEmptyState(model: EmptyStateModel, locale: Locale) {
  return (
    <Card
      theme={theme}
      padding={20}
      style={{
        background: model.background,
        borderColor: model.accent,
      }}
    >
      <div
        style={{
          display: "grid",
          gap: 14,
          gridTemplateColumns: "40px minmax(0, 1fr)",
          alignItems: "start",
        }}
      >
        <div
          aria-hidden
          style={{
            width: 40,
            height: 40,
            borderRadius: 999,
            display: "grid",
            placeItems: "center",
            background: model.accent,
            color: "#fff",
            fontWeight: 800,
          }}
        >
          {model.icon}
        </div>
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gap: 4 }}>
            <strong style={{ color: model.accent, fontSize: 14 }}>
              {t(model.titleKey, locale)}
            </strong>
            <span
              style={{ color: theme.text, fontSize: 12.5, lineHeight: 1.6 }}
            >
              {t(model.bodyKey, locale)}
            </span>
          </div>
          {model.nextAction?.enabled && model.nextHref ? (
            <div>
              <Link
                href={model.nextHref}
                target={model.nextTarget}
                rel={model.nextTarget === "_blank" ? "noreferrer" : undefined}
                style={buttonLinkStyle(theme)}
              >
                {t(
                  `drivers.emptyState.action.${model.nextAction.action}`,
                  locale,
                )}
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </Card>
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
    loadWithError<LoadedListEnvelope<DriverRegistryRecord>>(
      () =>
        client.listDriversEnvelope().then((envelope) => ({
          items: envelope.items,
          emptyState: envelope.emptyState ?? null,
          refreshMetadata: envelope.refreshMetadata ?? null,
        })),
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
  const drivers = (driversEnvelope?.items ?? []).flatMap((driver) => {
    const parsed = readDriverRegistryListItem(driver);
    return parsed ? [parsed] : [];
  });

  const locationByDriver = new Map<string, DriverLocationSnapshot>();
  for (const snapshot of locationsResult.data ?? []) {
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
    return {
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
      matchingSuppression: driver.matchingSuppression ?? null,
      suppressionActive: driver.matchingSuppression?.active === true,
      availableActions: driver.availableActions ?? [],
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
  const suppressedCount = rows.filter((row) => row.suppressionActive).length;
  const eligibleCount = rows.filter(
    (row) => row.driver.dispatchEligible,
  ).length;
  const blockedCount = rows.length - eligibleCount;
  const presenceErrorCount = presenceResults.filter(
    (entry) => entry.result.error,
  ).length;

  const backendEmptyState =
    rows.length === 0 ? (driversEnvelope?.emptyState ?? null) : null;
  const emptyReason: EmptyReason | null = filters.emptyReason
    ? filters.emptyReason
    : driversResult.error
      ? "fetch_failed"
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

  const tableRows: DriverTableRow[] = pagedRows.map((row) => ({
    row,
    _selected: row.suppressionActive,
  }));

  const tableColumns: CanvasTableColumn<DriverTableRow>[] = [
    {
      h: t("drivers.col.driver", locale),
      w: 250,
      r: ({ row }) => {
        const detailPresentation = getPrimaryDriverDetailPresentation(
          row,
          locale,
        );

        return (
          <div style={stackStyle}>
            {detailPresentation?.href ? (
              <Link
                href={detailPresentation.href}
                target={detailPresentation.target}
                rel={
                  detailPresentation.target === "_blank"
                    ? "noreferrer"
                    : undefined
                }
                style={driverPrimaryStyle}
              >
                {row.driver.name}
              </Link>
            ) : (
              <span style={driverPrimaryStyle}>{row.driver.name}</span>
            )}
            <span style={driverSecondaryStyle}>
              {row.driver.driverId}
              {row.driver.phone ? ` · ${row.driver.phone}` : ""}
            </span>
            <div style={chipRowStyle}>
              <Pill
                theme={theme}
                tone={getStatusTone(row.driver.workState)}
                dot
              >
                {formatOpsCodeLabel(locale, row.driver.workState)}
              </Pill>
              <Pill
                theme={theme}
                tone={row.driver.licensesValid ? "success" : "warn"}
              >
                {row.driver.licensesValid
                  ? t("common.valid", locale)
                  : t("common.invalid", locale)}
              </Pill>
              {row.suppressionActive ? (
                <Pill theme={theme} tone="danger">
                  {t("drivers.list.suppressionActive", locale)}
                </Pill>
              ) : null}
            </div>
          </div>
        );
      },
    },
    {
      h: t("drivers.col.shift", locale),
      w: 150,
      r: ({ row }) => (
        <div style={stackStyle}>
          <Pill theme={theme} tone={getStatusTone(row.driver.workState)} dot>
            {formatOpsCodeLabel(locale, row.driver.workState)}
          </Pill>
          <span style={signalDetailStyle}>
            {formatOpsCodeLabel(locale, row.driver.lifecycleStatus)}
          </span>
        </div>
      ),
    },
    {
      h: t("drivers.col.platformsOnline", locale),
      w: 270,
      r: ({ row }) =>
        row.presences.length > 0 ? (
          <div style={stackStyle}>
            <div style={chipRowStyle}>
              {row.presences.map((presence) => (
                <Pill
                  key={`${row.driver.driverId}:${presence.platformCode}`}
                  theme={theme}
                  tone={presenceTone(presence)}
                  dot
                >
                  {PLATFORM_CODE_REGISTRY[presence.platformCode]?.displayName ??
                    presence.platformCode}
                </Pill>
              ))}
            </div>
            <span style={signalDetailStyle}>
              {row.presences
                .map((presence) => presenceLabel(presence, locale))
                .join(" · ")}
            </span>
            {row.presenceLoadFailed ? (
              <span style={{ ...signalDetailStyle, color: "#b45309" }}>
                {t("drivers.list.platformStatusPartial", locale)}
              </span>
            ) : null}
          </div>
        ) : row.presenceLoadFailed ? (
          <div style={stackStyle}>
            <span style={{ fontWeight: 600, color: theme.text }}>
              {t("drivers.list.platformStatusUnknown", locale)}
            </span>
            <span style={signalDetailStyle}>
              {t("drivers.list.platformStatusUnknownBody", locale)}
            </span>
          </div>
        ) : (
          <div style={stackStyle}>
            <span style={{ fontWeight: 600, color: theme.text }}>
              {t("drivers.list.noPlatformBindings", locale)}
            </span>
            <span style={signalDetailStyle}>
              {t("drivers.list.bindingMissing", locale)}
            </span>
          </div>
        ),
    },
    {
      h: t("drivers.col.eligibilityBuckets", locale),
      w: 230,
      r: ({ row }) => (
        <div style={stackStyle}>
          <Pill
            theme={theme}
            tone={row.driver.dispatchEligible ? "success" : "warn"}
          >
            {row.driver.dispatchEligible
              ? t("drivers.list.eligibilityClear", locale)
              : row.driver.eligibilityBlockedReasons
                  .map((reason) => formatOpsCodeLabel(locale, reason))
                  .join("、")}
          </Pill>
          <span style={signalDetailStyle}>
            {row.driver.supportedServiceBuckets.join(" · ")}
          </span>
        </div>
      ),
    },
    {
      h: t("drivers.col.activeOrders", locale),
      w: 220,
      r: ({ row }) =>
        row.activeForwardedOrders.length > 0 ? (
          <div style={stackStyle}>
            {row.activeForwardedOrders.slice(0, 2).map((order) => (
              <Link
                key={order.mirrorOrderId}
                href={`/dispatch/${encodeURIComponent(order.mirrorOrderId)}`}
                style={inlineLinkStyle}
              >
                {PLATFORM_CODE_REGISTRY[order.platformCode]?.displayName ??
                  order.platformCode}
                {" · "}
                {order.mirrorOrderId}
              </Link>
            ))}
          </div>
        ) : (
          <div style={stackStyle}>
            <span style={{ fontWeight: 600, color: theme.text }}>
              {t("drivers.list.noActiveOrders", locale)}
            </span>
            <span style={signalDetailStyle}>
              {t("drivers.list.activeOrdersFallback", locale)}
            </span>
          </div>
        ),
    },
    {
      h: t("drivers.col.locationSignal", locale),
      w: 170,
      r: ({ row }) => {
        const locationLabel =
          row.locationState === "unknown"
            ? t("drivers.list.locationUnknown", locale)
            : row.locationState === "missing"
              ? t("drivers.list.locationMissing", locale)
              : row.locationState === "stale"
                ? t("drivers.list.locationStale", locale)
                : t("drivers.list.locationLive", locale);

        return (
          <div style={stackStyle}>
            <Pill theme={theme} tone={getLocationTone(row.locationState)} dot>
              {locationLabel}
            </Pill>
            <span style={signalDetailStyle}>
              {row.location?.recordedAt
                ? t("driverDetail.summary.locationRecordedAt", locale, {
                    recordedAt: row.location.recordedAt,
                  })
                : t("driverDetail.summary.locationNoSample", locale)}
            </span>
          </div>
        );
      },
    },
    {
      h: t("common.actions", locale),
      w: 230,
      r: ({ row }) => (
        <div style={actionsWrapStyle}>
          {row.availableActions.length === 0 ? (
            <span style={signalDetailStyle}>{t("common.dash", locale)}</span>
          ) : (
            row.availableActions.map((action) => {
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
                    style={buttonLinkStyle(theme)}
                    aria-label={presentation.ariaLabel}
                  >
                    {presentation.label}
                  </Link>
                );
              }

              return (
                <span
                  key={action.action}
                  style={buttonLinkStyle(theme, "secondary", true)}
                  title={
                    action.disabledReasonCode
                      ? formatOpsCodeLabel(locale, action.disabledReasonCode)
                      : action.enabled
                        ? action.action
                        : undefined
                  }
                >
                  {presentation.label}
                </span>
              );
            })
          )}
        </div>
      ),
    },
  ];

  const headerTabDefs: Array<[DriversViewKey, string]> = [
    ["all", "drivers.tabs.all"],
    ["available", "drivers.tabs.available"],
    ["on_trip", "drivers.tabs.onTrip"],
    ["offline", "drivers.tabs.offline"],
    ["license_warn", "drivers.tabs.licenseWarn"],
    ["suppression", "drivers.tabs.suppression"],
  ];
  const headerTabs = headerTabDefs.map(([viewKey, labelKey]) => (
    <Link
      key={viewKey}
      href={buildHref(filters, {
        view: viewKey,
        page: 1,
      })}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        textDecoration: "none",
        color: filters.view === viewKey ? theme.text : theme.textMuted,
      }}
    >
      <span>{t(labelKey, locale)}</span>
      <Pill
        theme={theme}
        tone={
          viewKey === "available"
            ? "accent"
            : viewKey === "license_warn"
              ? "warn"
              : viewKey === "suppression"
                ? "danger"
                : "neutral"
        }
      >
        {tabCounts[viewKey]}
      </Pill>
    </Link>
  ));

  return (
    <>
      <RefreshOnInterval intervalMs={DRIVERS_REFRESH_INTERVAL_MS} />

      <PageHeader
        theme={theme}
        title={locale === "zh" ? "司機" : "Drivers"}
        subtitle={t("drivers.pageSubtitle", locale, {
          count: filteredRows.length,
          total: rows.length,
        })}
        tabs={headerTabs}
        activeTab={
          headerTabs[
            headerTabDefs.findIndex(([viewKey]) => viewKey === filters.view)
          ]
        }
        actions={
          <>
            <Link href="#drivers-filters" style={buttonLinkStyle(theme)}>
              {t("drivers.actions.filter", locale)}
            </Link>
            <Link
              href={buildHref(filters, { page: 1 })}
              style={buttonLinkStyle(theme, "primary")}
            >
              {t("drivers.actions.refresh", locale)}
            </Link>
          </>
        }
      />

      <div style={pageBodyStyle}>
        <div style={signalGridStyle}>
          <div style={signalCardStyle}>
            <span style={signalLabelStyle}>
              {t("drivers.signals.total", locale)}
            </span>
            <span style={signalValueStyle}>{rows.length}</span>
            <span style={signalDetailStyle}>
              {t("drivers.signals.totalDetail", locale, {
                visible: filteredRows.length,
              })}
            </span>
          </div>
          <div style={signalCardStyle}>
            <span style={signalLabelStyle}>
              {t("drivers.signals.eligible", locale)}
            </span>
            <span style={signalValueStyle}>{eligibleCount}</span>
            <span style={signalDetailStyle}>
              {t("drivers.signals.eligibleDetail", locale, {
                blocked: blockedCount,
              })}
            </span>
          </div>
          <div style={signalCardStyle}>
            <span style={signalLabelStyle}>
              {t("drivers.signals.location", locale)}
            </span>
            <span style={signalValueStyle}>{liveLocationCount}</span>
            <span style={signalDetailStyle}>
              {t("drivers.signals.locationDetail", locale, {
                stale: staleLocationCount,
              })}
            </span>
          </div>
          <div style={signalCardStyle}>
            <span style={signalLabelStyle}>
              {t("drivers.signals.suppression", locale)}
            </span>
            <span style={signalValueStyle}>{suppressedCount}</span>
            <span style={signalDetailStyle}>
              {t("drivers.signals.suppressionDetail", locale, {
                degraded: presenceErrorCount,
              })}
            </span>
          </div>
        </div>

        <div style={bannerStackStyle}>
          {driversResult.error
            ? renderBanner(
                t("drivers.list.registryUnavailable", locale),
                driversResult.error,
                "danger",
              )
            : null}
          {locationsResult.error
            ? renderBanner(
                t("drivers.list.locationsUnavailable", locale),
                locationsResult.error,
                "warn",
              )
            : null}
          {presenceErrorCount > 0
            ? renderBanner(
                t("drivers.list.platformStatusUnavailable", locale, {
                  count: presenceErrorCount,
                }),
                t("drivers.list.platformStatusUnavailableBody", locale),
                "warn",
              )
            : null}
          {refreshBanner
            ? renderBanner(
                refreshBanner.title,
                refreshBanner.body,
                refreshBanner.tone,
              )
            : null}
          {staleSurge
            ? renderBanner(
                t("drivers.list.staleSurgeTitle", locale),
                t("drivers.list.staleSurgeBody", locale, {
                  stale: staleLocationCount,
                  total: rows.length,
                }),
                "warn",
              )
            : null}
        </div>

        <Card
          theme={theme}
          title={t("drivers.filters.title", locale)}
          subtitle={t("drivers.filters.subtitle", locale)}
          actions={
            <div style={footerTextStyle}>
              {t("drivers.meta.refreshValue", locale)}
              {" · "}
              {refreshMetadata?.generatedAt ?? generatedAt}
            </div>
          }
        >
          <form id="drivers-filters" method="get" style={filterGridStyle}>
            <label style={fieldLabelStyle}>
              <span>{t("drivers.filters.searchLabel", locale)}</span>
              <input
                name="q"
                defaultValue={filters.query}
                placeholder={t("drivers.filters.searchPlaceholder", locale)}
                style={filterControlStyle}
              />
            </label>
            <label style={fieldLabelStyle}>
              <span>{t("drivers.filters.shiftLabel", locale)}</span>
              <select
                name="shift"
                defaultValue={filters.shift}
                style={filterControlStyle}
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
            </label>
            <label style={fieldLabelStyle}>
              <span>{t("drivers.filters.platformLabel", locale)}</span>
              <select
                name="platform"
                defaultValue={filters.platform}
                style={filterControlStyle}
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
            </label>
            <label style={fieldLabelStyle}>
              <span>{t("drivers.filters.eligibilityLabel", locale)}</span>
              <select
                name="eligibility"
                defaultValue={filters.eligibility}
                style={filterControlStyle}
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
            </label>
            <div style={filterActionsStyle}>
              <button type="submit" style={buttonLinkStyle(theme, "primary")}>
                {t("common.search", locale)}
              </button>
            </div>
            <div style={filterActionsStyle}>
              <Link href="/drivers" style={buttonLinkStyle(theme)}>
                {t("drivers.filters.reset", locale)}
              </Link>
            </div>
          </form>
        </Card>

        <Card
          theme={theme}
          title={t("drivers.registry.title", locale)}
          subtitle={t("drivers.registry.subtitle", locale)}
        >
          {emptyStateModel ? (
            renderEmptyState(emptyStateModel, locale)
          ) : (
            <div style={{ display: "grid", gap: 14 }}>
              <Table theme={theme} columns={tableColumns} rows={tableRows} />

              <div style={footerStyle}>
                <span style={footerTextStyle}>
                  {t("drivers.registrySummary", locale, {
                    eligible: eligibleCount,
                    blocked: blockedCount,
                    live: liveLocationCount,
                    stale: staleLocationCount,
                  })}
                </span>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Link
                    href={buildHref(filters, {
                      page: Math.max(1, currentPage - 1),
                    })}
                    style={buttonLinkStyle(
                      theme,
                      "secondary",
                      currentPage === 1,
                    )}
                  >
                    {t("drivers.pagination.prev", locale)}
                  </Link>
                  <span style={footerTextStyle}>
                    {t("drivers.pagination.summary", locale, {
                      page: currentPage,
                      totalPages,
                    })}
                  </span>
                  <Link
                    href={buildHref(filters, {
                      page: Math.min(totalPages, currentPage + 1),
                    })}
                    style={buttonLinkStyle(
                      theme,
                      "secondary",
                      currentPage === totalPages,
                    )}
                  >
                    {t("drivers.pagination.next", locale)}
                  </Link>
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
