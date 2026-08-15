import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type {
  CrossAppResourceLink,
  EmptyReason,
  ResourceActionDescriptor,
  TenantPassengerQualityIssue,
  TenantPassengerRecord,
  UiRefreshMetadata,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasCard,
  CanvasDL,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  type CanvasTableColumn,
  type CanvasTone,
  buildCanvasTheme,
} from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";
import { getServerLocale } from "@/lib/server-locale";
import { t, type Locale } from "@/lib/translations";

export const dynamic = "force-dynamic";

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "grid",
  gap: 16,
};

const kpiGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 12,
};

const filterBarStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns:
    "minmax(220px, 1.4fr) repeat(3, minmax(160px, 0.8fr)) auto",
  gap: 12,
  alignItems: "end",
};

const fieldStackStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const fieldLabelStyle: CSSProperties = {
  fontSize: 11.5,
  fontWeight: 600,
  letterSpacing: 0.2,
  color: th.textMuted,
  textTransform: "uppercase",
};

const fieldStyle: CSSProperties = {
  height: 34,
  borderRadius: 8,
  border: `1px solid ${th.border}`,
  background: th.bgRaised,
  color: th.text,
  padding: "0 10px",
  fontSize: 12.5,
  fontFamily: th.fontFamily,
};

const stackedLayoutStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.7fr) minmax(280px, 0.9fr)",
  gap: 16,
  alignItems: "start",
};

const cardStyle: CSSProperties = {
  overflow: "hidden",
};

const detailCardStyle: CSSProperties = {
  position: "sticky",
  top: 24,
};

const primaryCellStyle: CSSProperties = {
  color: th.text,
  fontWeight: 600,
};

const subtleTextStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 11.5,
};

const helperTextStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 12,
  lineHeight: 1.5,
};

const tabLinkStyle: CSSProperties = {
  color: "inherit",
  textDecoration: "none",
};

const tableActionCellStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
};

const linkButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  height: 24,
  padding: "0 8px",
  borderRadius: 7,
  border: `1px solid ${th.border}`,
  background: th.bgRaised,
  color: th.text,
  fontSize: 11.5,
  fontWeight: 600,
  textDecoration: "none",
  whiteSpace: "nowrap",
};

const actionChipStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  height: 24,
  padding: "0 8px",
  borderRadius: 7,
  border: `1px solid ${th.border}`,
  background: th.bgRaised,
  color: th.text,
  fontSize: 11.5,
  fontWeight: 600,
};

const disabledActionStyle: CSSProperties = {
  ...actionChipStyle,
  opacity: 0.55,
  cursor: "not-allowed",
};

const actionsWrapStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const infoListStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const emptyStateWrapStyle: CSSProperties = {
  padding: 24,
  display: "grid",
  gap: 14,
  justifyItems: "start",
};

const emptyStateAccentStyle: CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 12,
  background: `linear-gradient(135deg, ${th.accent}22, ${th.accentHi}33)`,
  border: `1px solid ${th.border}`,
  display: "grid",
  placeItems: "center",
  color: th.accentHi,
  fontWeight: 800,
  letterSpacing: 0.3,
};

type PassengerTabKey = "all" | "employee" | "visitor" | "disabled";

type RuntimePassengerRecord = TenantPassengerRecord & {
  availableActions?: ResourceActionDescriptor[];
  editableUntil?: string | null;
  readOnlyReasonCode?: string | null;
  metadata: PassengerMetadata;
};

type PassengerRow = RuntimePassengerRecord &
  Record<string, unknown> & {
    duplicateName: boolean;
    kindLabel: string;
    stateLabel: string;
    stateTone: CanvasTone;
  };

type PassengerPageData = {
  passengers: RuntimePassengerRecord[];
  errors: string[];
  fetchedAt: string;
  refreshMetadata: UiRefreshMetadata | null;
};

type PassengerFilters = {
  q: string;
  department: string;
  activeState: "all" | "active" | "inactive";
  selectedPassengerId: string;
  emptyReasonOverride: PassengerEmptyReason | null;
};

type PassengerEmptyReason = Exclude<EmptyReason, "driver_not_eligible">;

type EmptyStateView = {
  titleKey: string;
  bodyKey: string;
  accent: string;
  tone: CanvasTone;
  ctaLabelKey?: string;
  ctaHref?: string;
  usePrimaryAction?: boolean;
};

type PassengerTabDefinition = {
  key: PassengerTabKey;
  label: string;
};

type PassengerMetadata = Record<string, unknown> & {
  auditLink?: CrossAppResourceLink | null;
  availableActions?: ResourceActionDescriptor[];
  consentVersion?: string | null;
  crossAppLinks?: CrossAppResourceLink[];
  refreshMetadata?: UiRefreshMetadata;
};

type PassengerDeepLink = {
  href: string;
  labelKey?: string;
  label?: string;
  newTab: boolean;
  tone: CanvasTone;
};

const PASSENGER_TABS: PassengerTabDefinition[] = [
  { key: "all", label: "passengers.tab.all" },
  { key: "employee", label: "passengers.tab.employee" },
  { key: "visitor", label: "passengers.tab.visitor" },
  { key: "disabled", label: "passengers.tab.disabled" },
];

const EMPTY_STATE_VIEWS: Record<PassengerEmptyReason, EmptyStateView> = {
  no_data: {
    titleKey: "passengers.empty.noData.title",
    bodyKey: "passengers.empty.noData.body",
    accent: "ND",
    tone: "info",
    usePrimaryAction: true,
  },
  not_provisioned: {
    titleKey: "passengers.empty.notProvisioned.title",
    bodyKey: "passengers.empty.notProvisioned.body",
    accent: "NP",
    tone: "warn",
    ctaLabelKey: "passengers.empty.notProvisioned.cta",
    ctaHref: "/settings",
  },
  fetch_failed: {
    titleKey: "passengers.empty.fetchFailed.title",
    bodyKey: "passengers.empty.fetchFailed.body",
    accent: "FF",
    tone: "danger",
  },
  permission_denied: {
    titleKey: "passengers.empty.permissionDenied.title",
    bodyKey: "passengers.empty.permissionDenied.body",
    accent: "PD",
    tone: "neutral",
    usePrimaryAction: true,
  },
  external_unavailable: {
    titleKey: "passengers.empty.externalUnavailable.title",
    bodyKey: "passengers.empty.externalUnavailable.body",
    accent: "EU",
    tone: "danger",
  },
  filtered_empty: {
    titleKey: "passengers.empty.filteredEmpty.title",
    bodyKey: "passengers.empty.filteredEmpty.body",
    accent: "FE",
    tone: "accent",
    ctaLabelKey: "passengers.empty.filteredEmpty.cta",
    ctaHref: "/passengers",
  },
};

function toErrorMessage(error: unknown, locale: Locale) {
  return error instanceof Error ? error.message : t("passengers.error.unknown", locale);
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatUpdated(value: string | null | undefined) {
  const parsed = parseDate(value);
  if (!parsed) return "—";
  return new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(parsed);
}

function isEmployeePassenger(passenger: TenantPassengerRecord) {
  if (passenger.roles?.includes("employee")) {
    return true;
  }
  return Boolean(passenger.employeeNo || passenger.departmentName);
}

function getStateTone(activeFlag: boolean): CanvasTone {
  return activeFlag ? "success" : "neutral";
}

function getStateLabel(activeFlag: boolean, locale: Locale) {
  return t(
    activeFlag ? "passengers.state.active" : "passengers.state.deactivated",
    locale,
  );
}

function getKindLabel(passenger: TenantPassengerRecord, locale: Locale) {
  return t(
    isEmployeePassenger(passenger)
      ? "passengers.kind.employee"
      : "passengers.kind.visitor",
    locale,
  );
}

function comparePassengers(
  left: TenantPassengerRecord,
  right: TenantPassengerRecord,
) {
  if (left.activeFlag !== right.activeFlag) {
    return left.activeFlag ? -1 : 1;
  }

  const leftEmployee = isEmployeePassenger(left);
  const rightEmployee = isEmployeePassenger(right);
  if (leftEmployee !== rightEmployee) {
    return leftEmployee ? -1 : 1;
  }

  const leftUpdated = parseDate(left.updatedAt)?.getTime() ?? 0;
  const rightUpdated = parseDate(right.updatedAt)?.getTime() ?? 0;
  if (leftUpdated !== rightUpdated) {
    return rightUpdated - leftUpdated;
  }

  return left.fullName.localeCompare(right.fullName, "zh-Hant");
}

function matchesTab(passenger: TenantPassengerRecord, tab: PassengerTabKey) {
  if (tab === "all") return true;
  if (tab === "disabled") return !passenger.activeFlag;
  if (!passenger.activeFlag) return false;
  if (tab === "employee") return isEmployeePassenger(passenger);
  return !isEmployeePassenger(passenger);
}

function getSingleQueryValue(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function getSelectedTab(rawTab: string | undefined): PassengerTabKey {
  const matched = PASSENGER_TABS.find((tab) => tab.key === rawTab);
  return matched?.key ?? "all";
}

function getFilters(
  searchParams: Record<string, string | string[] | undefined>,
) {
  const activeState = getSingleQueryValue(searchParams.state)?.trim();

  return {
    q: getSingleQueryValue(searchParams.q)?.trim() ?? "",
    department: getSingleQueryValue(searchParams.department)?.trim() ?? "",
    activeState:
      activeState === "active" || activeState === "inactive"
        ? activeState
        : "all",
    selectedPassengerId:
      getSingleQueryValue(searchParams.selected)?.trim() ?? "",
    emptyReasonOverride: normalizeEmptyReason(
      getSingleQueryValue(searchParams.emptyReason),
    ),
  } satisfies PassengerFilters;
}

function normalizeEmptyReason(
  value: string | undefined,
): PassengerEmptyReason | null {
  switch (value) {
    case "no_data":
    case "not_provisioned":
    case "fetch_failed":
    case "permission_denied":
    case "external_unavailable":
    case "filtered_empty":
      return value;
    default:
      return null;
  }
}

function buildPassengersHref(
  selectedTab: PassengerTabKey,
  filters: PassengerFilters,
  overrides: Partial<{
    q: string;
    department: string;
    activeState: PassengerFilters["activeState"];
    selectedPassengerId: string;
    emptyReasonOverride: PassengerEmptyReason | null;
  }> = {},
) {
  const params = new URLSearchParams();
  const q = overrides.q ?? filters.q;
  const department = overrides.department ?? filters.department;
  const activeState = overrides.activeState ?? filters.activeState;
  const selectedPassengerId =
    overrides.selectedPassengerId ?? filters.selectedPassengerId;
  const emptyReasonOverride =
    overrides.emptyReasonOverride ?? filters.emptyReasonOverride;

  if (selectedTab !== "all") {
    params.set("tab", selectedTab);
  }
  if (q) {
    params.set("q", q);
  }
  if (department) {
    params.set("department", department);
  }
  if (activeState !== "all") {
    params.set("state", activeState);
  }
  if (selectedPassengerId) {
    params.set("selected", selectedPassengerId);
  }
  if (emptyReasonOverride) {
    params.set("emptyReason", emptyReasonOverride);
  }

  const query = params.toString();
  return `/passengers${query ? `?${query}` : ""}`;
}

function getDisabledReasonLabel(code: string | undefined, locale: Locale) {
  switch (code) {
    case "already_deactivated":
      return t("passengers.disabledReason.alreadyDeactivated", locale);
    case "requires_tenant_admin":
      return t("passengers.disabledReason.requiresTenantAdmin", locale);
    case "read_only_mode":
      return t("passengers.disabledReason.readOnlyMode", locale);
    case "not_wired_yet":
      return t("passengers.disabledReason.notWiredYet", locale);
    default:
      return code
        ? t("passengers.disabledReason.code", locale, { code })
        : t("passengers.disabledReason.default", locale);
  }
}

function isCrossAppResourceLink(value: unknown): value is CrossAppResourceLink {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.targetApp === "string" &&
    typeof candidate.route === "string" &&
    typeof candidate.resourceType === "string" &&
    typeof candidate.resourceId === "string" &&
    typeof candidate.openMode === "string" &&
    typeof candidate.label === "string"
  );
}

function inferDefaultPassengerActions(
  passenger: TenantPassengerRecord,
): ResourceActionDescriptor[] {
  return [
    {
      action: "edit",
      enabled: false,
      disabledReasonCode: "not_wired_yet",
      riskLevel: "medium",
    },
    passenger.activeFlag
      ? {
          action: "deactivate",
          enabled: false,
          disabledReasonCode: "not_wired_yet",
          requiresReason: true,
          riskLevel: "high",
        }
      : {
          action: "reactivate",
          enabled: false,
          disabledReasonCode: "not_wired_yet",
          riskLevel: "medium",
        },
  ];
}

function isActionDescriptor(value: unknown): value is ResourceActionDescriptor {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.action === "string" &&
    typeof candidate.enabled === "boolean" &&
    typeof candidate.riskLevel === "string"
  );
}

function getPassengerActions(
  passenger: RuntimePassengerRecord,
): ResourceActionDescriptor[] {
  const inlineActions = passenger.availableActions;
  if (Array.isArray(inlineActions) && inlineActions.every(isActionDescriptor)) {
    return inlineActions;
  }

  const metadataActions = passenger.metadata?.availableActions;
  if (
    Array.isArray(metadataActions) &&
    metadataActions.every(isActionDescriptor)
  ) {
    return metadataActions;
  }

  return inferDefaultPassengerActions(passenger);
}

function getPageActions(passengers: RuntimePassengerRecord[]) {
  const pageActionSource = passengers
    .map((passenger) => passenger.metadata?.availableActions)
    .find(
      (actions): actions is ResourceActionDescriptor[] =>
        Array.isArray(actions) && actions.every(isActionDescriptor),
    );

  if (pageActionSource) {
    const createActions = pageActionSource.filter(
      (action) => action.action === "create",
    );
    if (createActions.length > 0) {
      return createActions;
    }
  }

  const source = passengers[0];
  if (!source) {
    return [
      {
        action: "create",
        enabled: false,
        disabledReasonCode: "not_wired_yet",
        riskLevel: "medium",
      },
    ] satisfies ResourceActionDescriptor[];
  }

  const sourceActions = getPassengerActions(source);
  return [
    sourceActions.find((action) => action.action === "create") ?? {
      action: "create",
      enabled: false,
      disabledReasonCode: "not_wired_yet",
      riskLevel: "medium",
    },
  ];
}

function buildTabNodes(
  selectedTab: PassengerTabKey,
  filters: PassengerFilters,
  counts: Record<PassengerTabKey, number>,
  locale: Locale,
) {
  const tabs = PASSENGER_TABS.map((tab) => {
    const params = new URLSearchParams();
    if (tab.key !== "all") {
      params.set("tab", tab.key);
    }
    if (filters.q) {
      params.set("q", filters.q);
    }
    if (filters.department) {
      params.set("department", filters.department);
    }
    if (filters.activeState !== "all") {
      params.set("state", filters.activeState);
    }
    if (filters.selectedPassengerId) {
      params.set("selected", filters.selectedPassengerId);
    }
    if (filters.emptyReasonOverride) {
      params.set("emptyReason", filters.emptyReasonOverride);
    }

    const href = `/passengers${params.toString() ? `?${params.toString()}` : ""}`;

    return (
      <Link key={tab.key} href={href} style={tabLinkStyle}>
        {t(tab.label, locale)} · {counts[tab.key]}
      </Link>
    );
  });

  const activeIndex = PASSENGER_TABS.findIndex(
    (tab) => tab.key === selectedTab,
  );

  return {
    tabs,
    activeTab: tabs[activeIndex] ?? tabs[0],
  };
}

function buildDepartmentOptions(passengers: TenantPassengerRecord[]) {
  return Array.from(
    new Set(
      passengers
        .map((passenger) => passenger.departmentName?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  ).sort((left, right) => left.localeCompare(right, "zh-Hant"));
}

function findDuplicateNames(passengers: TenantPassengerRecord[]) {
  const counts = new Map<string, number>();
  for (const passenger of passengers) {
    const key = passenger.fullName.trim().toLocaleLowerCase("zh-Hant");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return new Set(
    Array.from(counts.entries())
      .filter(([, count]) => count > 1)
      .map(([name]) => name),
  );
}

function matchesFilters(
  passenger: TenantPassengerRecord,
  filters: PassengerFilters,
  selectedTab: PassengerTabKey,
) {
  if (!matchesTab(passenger, selectedTab)) {
    return false;
  }

  if (
    filters.department &&
    (passenger.departmentName ?? "").trim() !== filters.department
  ) {
    return false;
  }

  if (filters.activeState === "active" && !passenger.activeFlag) {
    return false;
  }

  if (filters.activeState === "inactive" && passenger.activeFlag) {
    return false;
  }

  if (!filters.q) {
    return true;
  }

  const haystacks = [
    passenger.fullName,
    passenger.employeeNo ?? "",
    passenger.mobile ?? "",
  ].map((value) => value.toLocaleLowerCase("zh-Hant"));

  const needle = filters.q.toLocaleLowerCase("zh-Hant");
  return haystacks.some((value) => value.includes(needle));
}

async function loadPassengersData(locale: Locale): Promise<PassengerPageData> {
  const client = await getTenantClient();
  const errors: string[] = [];
  const fetchedAt = new Date().toISOString();
  const [passengersResult] = await Promise.allSettled([
    client.listPassengers() as Promise<RuntimePassengerRecord[]>,
  ]);

  const passengers =
    passengersResult.status === "fulfilled"
      ? [...passengersResult.value].sort(comparePassengers)
      : [];

  if (passengersResult.status === "rejected") {
    errors.push(
      t("passengers.error.directory", locale, {
        message: toErrorMessage(passengersResult.reason, locale),
      }),
    );
  }

  return {
    passengers,
    errors,
    fetchedAt,
    refreshMetadata: getRefreshMetadata(passengers),
  };
}

function resolveEmptyReason(params: {
  errors: string[];
  hasAnyPassengers: boolean;
  hasFilteredRows: boolean;
  emptyReasonOverride: PassengerEmptyReason | null;
}) {
  if (params.emptyReasonOverride) {
    return params.emptyReasonOverride;
  }

  if (params.errors.length > 0) {
    const joined = params.errors.join(" ").toLowerCase();
    if (joined.includes("403") || joined.includes("forbidden")) {
      return "permission_denied" satisfies EmptyReason;
    }
    if (
      joined.includes("503") ||
      joined.includes("timeout") ||
      joined.includes("unavailable")
    ) {
      return "external_unavailable" satisfies EmptyReason;
    }
    return "fetch_failed" satisfies EmptyReason;
  }

  if (!params.hasAnyPassengers) {
    return "no_data" satisfies EmptyReason;
  }

  if (!params.hasFilteredRows) {
    return "filtered_empty" satisfies EmptyReason;
  }

  return null;
}

function toPassengerRow(
  passenger: RuntimePassengerRecord,
  duplicateNames: Set<string>,
  locale: Locale,
): PassengerRow {
  return {
    ...passenger,
    duplicateName: duplicateNames.has(
      passenger.fullName.trim().toLocaleLowerCase("zh-Hant"),
    ),
    kindLabel: getKindLabel(passenger, locale),
    stateLabel: getStateLabel(passenger.activeFlag, locale),
    stateTone: getStateTone(passenger.activeFlag),
  };
}

function renderActionDescriptor(
  descriptor: ResourceActionDescriptor,
  label: string,
  locale: Locale,
) {
  const helper = descriptor.requiresReason
    ? t("passengers.action.requiresReason", locale, { label })
    : descriptor.riskLevel === "high"
      ? t("passengers.action.highRisk", locale, { label })
      : label;

  if (descriptor.enabled) {
    return (
      <span key={descriptor.action} style={actionChipStyle} title={helper}>
        {label}
      </span>
    );
  }

  return (
    <span
      key={descriptor.action}
      style={disabledActionStyle}
      title={getDisabledReasonLabel(descriptor.disabledReasonCode, locale)}
    >
      {label}
    </span>
  );
}

function getActionLabel(action: string, locale: Locale) {
  switch (action) {
    case "create":
      return t("passengers.action.create", locale);
    case "edit":
      return t("passengers.action.edit", locale);
    case "deactivate":
      return t("passengers.action.deactivate", locale);
    case "reactivate":
      return t("passengers.action.reactivate", locale);
    case "view":
      return t("passengers.action.view", locale);
    default:
      return action;
  }
}

function renderEmptyState(
  reason: PassengerEmptyReason,
  primaryAction: ResourceActionDescriptor | null,
  locale: Locale,
) {
  const view: EmptyStateView =
    EMPTY_STATE_VIEWS[reason] ?? EMPTY_STATE_VIEWS.fetch_failed!;

  return (
    <div style={emptyStateWrapStyle}>
      <div style={emptyStateAccentStyle}>{view.accent}</div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: th.text }}>
          {t(view.titleKey, locale)}
        </div>
        <div
          style={{
            marginTop: 6,
            fontSize: 12.5,
            lineHeight: 1.55,
            color: th.textMuted,
            maxWidth: 520,
          }}
        >
          {t(view.bodyKey, locale)}
        </div>
      </div>
      {view.ctaHref && view.ctaLabelKey ? (
        <Link href={view.ctaHref} style={linkButtonStyle}>
          {t(view.ctaLabelKey, locale)}
        </Link>
      ) : view.usePrimaryAction && primaryAction ? (
        renderActionDescriptor(
          primaryAction,
          getActionLabel(primaryAction.action, locale),
          locale,
        )
      ) : null}
      <CanvasPill theme={th} tone={view.tone}>
        {t("passengers.empty.reasonBadge", locale, { reason })}
      </CanvasPill>
    </div>
  );
}

function isRefreshMetadata(value: unknown): value is UiRefreshMetadata {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.generatedAt === "string" &&
    typeof candidate.staleAfterMs === "number" &&
    typeof candidate.dataFreshness === "string" &&
    typeof candidate.source === "string"
  );
}

function getRefreshMetadata(
  passengers: RuntimePassengerRecord[],
): UiRefreshMetadata | null {
  const candidate = passengers
    .map((passenger) => passenger.metadata?.refreshMetadata)
    .find((value): value is UiRefreshMetadata => isRefreshMetadata(value));
  return candidate ?? null;
}

function getRefreshTone(
  refreshMetadata: UiRefreshMetadata | null,
  errors: string[],
): CanvasTone {
  if (errors.length > 0) {
    return "warn";
  }

  switch (refreshMetadata?.dataFreshness) {
    case "stale":
      return "warn";
    case "degraded":
      return "danger";
    case "unknown":
      return "neutral";
    case "fresh":
    default:
      return "success";
  }
}

function getRefreshSummary(
  refreshMetadata: UiRefreshMetadata | null,
  fetchedAt: string,
  locale: Locale,
) {
  if (!refreshMetadata) {
    return t("passengers.refresh.summaryFallback", locale, {
      time: formatUpdated(fetchedAt),
    });
  }

  return t("passengers.refresh.summary", locale, {
    freshness: t(
      `passengers.refresh.freshness.${refreshMetadata.dataFreshness}`,
      locale,
    ),
    time: formatUpdated(refreshMetadata.generatedAt),
    source: t(`passengers.refresh.source.${refreshMetadata.source}`, locale),
  });
}

function getRefreshTierLabel(
  refreshMetadata: UiRefreshMetadata | null,
  locale: Locale,
) {
  if (!refreshMetadata) {
    return t("passengers.refresh.tier.fallback", locale);
  }

  switch (refreshMetadata.source) {
    case "live":
      return t("passengers.refresh.tier.live", locale);
    case "cache":
      return t("passengers.refresh.tier.cache", locale);
    case "sandbox":
      return t("passengers.refresh.tier.sandbox", locale);
    case "static":
    default:
      return t("passengers.refresh.tier.static", locale);
  }
}

function getRefreshBannerCopy(
  refreshMetadata: UiRefreshMetadata | null,
  locale: Locale,
) {
  if (!refreshMetadata || refreshMetadata.dataFreshness === "fresh") {
    return null;
  }

  switch (refreshMetadata.dataFreshness) {
    case "stale":
      return {
        tone: "warn" as const,
        title: t("passengers.refresh.banner.stale.title", locale),
        body: t("passengers.refresh.banner.stale.body", locale, {
          time: formatUpdated(refreshMetadata.generatedAt),
          source: t(`passengers.refresh.source.${refreshMetadata.source}`, locale),
        }),
      };
    case "degraded":
      return {
        tone: "danger" as const,
        title: t("passengers.refresh.banner.degraded.title", locale),
        body: t("passengers.refresh.banner.degraded.body", locale, {
          source: t(`passengers.refresh.source.${refreshMetadata.source}`, locale),
        }),
      };
    case "unknown":
    default:
      return {
        tone: "info" as const,
        title: t("passengers.refresh.banner.unknown.title", locale),
        body: t("passengers.refresh.banner.unknown.body", locale),
      };
  }
}

function getRecordActions(passenger: RuntimePassengerRecord) {
  return getPassengerActions(passenger).filter(
    (action) => action.action !== "create",
  );
}

function getTargetAppLabel(
  targetApp: CrossAppResourceLink["targetApp"],
  locale: Locale,
) {
  switch (targetApp) {
    case "ops-console":
      return t("passengers.targetApp.opsConsole", locale);
    case "platform-admin":
      return t("passengers.targetApp.platformAdmin", locale);
    case "tenant-console":
    default:
      return t("passengers.targetApp.tenantConsole", locale);
  }
}

function toPassengerDeepLinks(
  passenger: RuntimePassengerRecord,
  refreshHref: string,
  locale: Locale,
): PassengerDeepLink[] {
  const deepLinks: PassengerDeepLink[] = [
    {
      href: `/bookings/new?passengerId=${encodeURIComponent(passenger.passengerId)}`,
      labelKey: "passengers.deepLink.newBooking",
      newTab: false,
      tone: "accent",
    },
    {
      href: `/audit?resourceType=tenant_passenger&resourceId=${encodeURIComponent(passenger.passengerId)}`,
      labelKey: "passengers.deepLink.audit",
      newTab: false,
      tone: "info",
    },
    {
      href: refreshHref,
      labelKey: "passengers.deepLink.refresh",
      newTab: false,
      tone: "neutral",
    },
  ];

  const metadataLinks = [
    passenger.metadata?.auditLink,
    ...(passenger.metadata?.crossAppLinks ?? []),
  ].filter((link): link is CrossAppResourceLink =>
    isCrossAppResourceLink(link),
  );

  for (const link of metadataLinks) {
    deepLinks.push({
      href: link.route,
      label: t("passengers.deepLink.crossApp", locale, {
        label: link.label,
        app: getTargetAppLabel(link.targetApp, locale),
      }),
      newTab: link.openMode === "new_tab",
      tone: link.targetApp === "tenant-console" ? "info" : "accent",
    });
  }

  return deepLinks.filter(
    (link, index, source) =>
      source.findIndex(
        (candidate) =>
          candidate.href === link.href && candidate.label === link.label,
      ) === index,
  );
}

function getQualityIssueLabel(
  issue: TenantPassengerQualityIssue,
  locale: Locale,
) {
  switch (issue) {
    case "duplicate_employee_no":
      return t("passengers.quality.duplicateEmployeeNo", locale);
    case "missing_contact":
      return t("passengers.quality.missingContact", locale);
    case "missing_employee_no":
    default:
      return t("passengers.quality.missingEmployeeNo", locale);
  }
}

export default async function PassengersPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await getServerLocale();
  const resolvedSearchParams = (await searchParams) ?? {};
  const selectedTab = getSelectedTab(
    getSingleQueryValue(resolvedSearchParams.tab),
  );
  const filters = getFilters(resolvedSearchParams);
  const { passengers, errors, fetchedAt, refreshMetadata } =
    await loadPassengersData(locale);
  const duplicateNames = findDuplicateNames(passengers);
  const filteredPassengers = passengers.filter((passenger) =>
    matchesFilters(passenger, filters, selectedTab),
  );
  const rows = filteredPassengers.map((passenger) =>
    toPassengerRow(passenger, duplicateNames, locale),
  );
  const selectedPassenger =
    rows.find(
      (passenger) => passenger.passengerId === filters.selectedPassengerId,
    ) ??
    rows[0] ??
    null;
  const selectedActions = selectedPassenger
    ? getPassengerActions(selectedPassenger)
    : [];
  const pageActions = getPageActions(passengers);
  const primaryPageAction = pageActions[0] ?? null;
  const departmentOptions = buildDepartmentOptions(passengers);
  const counts = {
    all: passengers.filter((passenger) => matchesTab(passenger, "all")).length,
    employee: passengers.filter((passenger) =>
      matchesTab(passenger, "employee"),
    ).length,
    visitor: passengers.filter((passenger) => matchesTab(passenger, "visitor"))
      .length,
    disabled: passengers.filter((passenger) =>
      matchesTab(passenger, "disabled"),
    ).length,
  } satisfies Record<PassengerTabKey, number>;
  const { tabs, activeTab } = buildTabNodes(selectedTab, filters, counts, locale);
  const activeCount = passengers.filter(
    (passenger) => passenger.activeFlag,
  ).length;
  const inactiveCount = passengers.length - activeCount;
  const employeeCount = passengers.filter((passenger) =>
    isEmployeePassenger(passenger),
  ).length;
  const emptyReason = resolveEmptyReason({
    errors,
    hasAnyPassengers: passengers.length > 0,
    hasFilteredRows: rows.length > 0,
    emptyReasonOverride: filters.emptyReasonOverride,
  });
  const refreshHref = buildPassengersHref(selectedTab, filters);
  const refreshTone = getRefreshTone(refreshMetadata, errors);
  const refreshSummary = getRefreshSummary(refreshMetadata, fetchedAt, locale);
  const refreshTierLabel = getRefreshTierLabel(refreshMetadata, locale);
  const refreshBanner = getRefreshBannerCopy(refreshMetadata, locale);

  const columns: CanvasTableColumn<PassengerRow>[] = [
    {
      h: t("passengers.column.name", locale),
      w: 190,
      r: (row: PassengerRow) => (
        <div style={{ display: "grid", gap: 5 }}>
          <Link
            href={buildPassengersHref(selectedTab, filters, {
              selectedPassengerId: row.passengerId,
            })}
            style={{
              ...primaryCellStyle,
              textDecoration: "none",
            }}
          >
            {row.fullName}
          </Link>
          <div style={infoListStyle}>
            <CanvasPill theme={th} tone="info">
              {row.kindLabel}
            </CanvasPill>
            {row.duplicateName ? (
              <CanvasPill theme={th} tone="warn">
                {t("passengers.duplicateName", locale)}
              </CanvasPill>
            ) : null}
          </div>
        </div>
      ),
    },
    {
      h: t("passengers.column.employeeNo", locale),
      w: 110,
      mono: true,
      r: (row: PassengerRow) =>
        row.employeeNo ?? t("passengers.value.empty", locale),
    },
    {
      h: t("passengers.column.department", locale),
      w: 150,
      r: (row: PassengerRow) =>
        row.departmentName ?? t("passengers.value.empty", locale),
    },
    {
      h: t("passengers.column.mobile", locale),
      w: 140,
      mono: true,
      r: (row: PassengerRow) =>
        row.mobile ?? t("passengers.value.empty", locale),
    },
    {
      h: t("passengers.column.email", locale),
      mono: true,
      r: (row: PassengerRow) => row.email ?? t("passengers.value.empty", locale),
    },
    {
      h: t("passengers.column.state", locale),
      w: 110,
      r: (row: PassengerRow) => (
        <CanvasPill theme={th} tone={row.stateTone} dot>
          {row.stateLabel}
        </CanvasPill>
      ),
    },
    {
      h: t("passengers.column.updatedAt", locale),
      w: 150,
      mono: true,
      r: (row: PassengerRow) => formatUpdated(row.updatedAt),
    },
    {
      h: t("passengers.column.actions", locale),
      w: 220,
      r: (row: PassengerRow) => (
        <div style={tableActionCellStyle}>
          <Link
            href={buildPassengersHref(selectedTab, filters, {
              selectedPassengerId: row.passengerId,
            })}
            style={linkButtonStyle}
          >
            {t("passengers.action.view", locale)}
          </Link>
          {getRecordActions(row).map((action) =>
            renderActionDescriptor(
              action,
              getActionLabel(action.action, locale),
              locale,
            ),
          )}
        </div>
      ),
    },
  ];

  const selectedQualityIssues: TenantPassengerQualityIssue[] =
    selectedPassenger?.qualityIssues ?? [];
  const selectedDepartment =
    selectedPassenger?.departmentName ?? t("passengers.value.empty", locale);
  const selectedEditableUntil = selectedPassenger?.editableUntil ?? null;
  const selectedConsentVersion =
    selectedPassenger?.metadata?.consentVersion ?? null;
  const selectedReadOnlyReason = selectedPassenger?.readOnlyReasonCode ?? null;
  const selectedPassengerDuplicate = selectedPassenger
    ? duplicateNames.has(
        selectedPassenger.fullName.trim().toLocaleLowerCase("zh-Hant"),
      )
    : false;
  const selectedDeepLinks = selectedPassenger
    ? toPassengerDeepLinks(selectedPassenger, refreshHref, locale)
    : [];

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title={t("passengers.header.title", locale)}
        subtitle={t("passengers.header.subtitle", locale)}
        tabs={tabs as ReactNode[]}
        activeTab={activeTab}
        actions={
          <div style={actionsWrapStyle}>
            <Link href={refreshHref} style={linkButtonStyle}>
              {t("passengers.action.refresh", locale)}
            </Link>
            {pageActions.map((action) =>
              renderActionDescriptor(
                action,
                getActionLabel(action.action, locale),
                locale,
              ),
            )}
          </div>
        }
      />

      <div style={pageBodyStyle}>
        {errors.length > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title={t("passengers.banner.errors.title", locale)}
            body={errors.join(" · ")}
          />
        ) : null}

        {duplicateNames.size > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title={t("passengers.banner.duplicate.title", locale)}
            body={t("passengers.banner.duplicate.body", locale)}
          />
        ) : null}

        {refreshBanner ? (
          <CanvasBanner
            theme={th}
            tone={refreshBanner.tone}
            icon="warn"
            title={refreshBanner.title}
            body={refreshBanner.body}
          />
        ) : null}

        <div style={kpiGridStyle}>
          <CanvasKPI
            theme={th}
            label={t("passengers.kpi.total.label", locale)}
            value={String(passengers.length)}
            sub={t("passengers.kpi.total.sub", locale, {
              active: activeCount,
              inactive: inactiveCount,
            })}
          />
          <CanvasKPI
            theme={th}
            label={t("passengers.kpi.employee.label", locale)}
            value={String(employeeCount)}
            sub={t("passengers.kpi.employee.sub", locale, {
              visitor: passengers.length - employeeCount,
            })}
          />
          <CanvasKPI
            theme={th}
            label={t("passengers.kpi.refresh.label", locale)}
            value="T5"
            sub={t("passengers.kpi.refresh.sub", locale, {
              tier: refreshTierLabel,
              summary: refreshSummary,
            })}
          />
          <CanvasKPI
            theme={th}
            label={t("passengers.kpi.selected.label", locale)}
            value={
              selectedPassenger
                ? t("passengers.kpi.selected.ready", locale)
                : t("passengers.kpi.selected.none", locale)
            }
            sub={
              selectedPassenger
                ? selectedPassenger.fullName
                : t("passengers.kpi.selected.pickRow", locale)
            }
          />
        </div>

        <CanvasCard
          theme={th}
          title={t("passengers.filters.title", locale)}
          subtitle={t("passengers.filters.subtitle", locale)}
        >
          <form action="/passengers" method="get" style={filterBarStyle}>
            {selectedTab !== "all" ? (
              <input name="tab" type="hidden" value={selectedTab} />
            ) : null}
            {filters.emptyReasonOverride ? (
              <input
                name="emptyReason"
                type="hidden"
                value={filters.emptyReasonOverride}
              />
            ) : null}
            <label style={fieldStackStyle}>
              <span style={fieldLabelStyle}>
                {t("passengers.filters.search", locale)}
              </span>
              <input
                defaultValue={filters.q}
                name="q"
                placeholder={t("passengers.filters.searchPlaceholder", locale)}
                style={fieldStyle}
              />
            </label>
            <label style={fieldStackStyle}>
              <span style={fieldLabelStyle}>
                {t("passengers.filters.department", locale)}
              </span>
              <select
                defaultValue={filters.department}
                name="department"
                style={fieldStyle}
              >
                <option value="">
                  {t("passengers.filters.departmentAll", locale)}
                </option>
                {departmentOptions.map((department) => (
                  <option key={department} value={department}>
                    {department}
                  </option>
                ))}
              </select>
            </label>
            <label style={fieldStackStyle}>
              <span style={fieldLabelStyle}>
                {t("passengers.filters.state", locale)}
              </span>
              <select
                defaultValue={filters.activeState}
                name="state"
                style={fieldStyle}
              >
                <option value="all">{t("passengers.filters.stateAll", locale)}</option>
                <option value="active">
                  {t("passengers.filters.stateActive", locale)}
                </option>
                <option value="inactive">
                  {t("passengers.filters.stateInactive", locale)}
                </option>
              </select>
            </label>
            <label style={fieldStackStyle}>
              <span style={fieldLabelStyle}>
                {t("passengers.filters.refreshTier", locale)}
              </span>
              <div
                style={{
                  ...fieldStyle,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span>{refreshTierLabel}</span>
                <CanvasPill theme={th} tone={refreshTone}>
                  {t(
                    `passengers.refresh.freshness.${refreshMetadata?.dataFreshness ?? "fallback"}`,
                    locale,
                  )}
                </CanvasPill>
              </div>
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={fieldStyle} type="submit">
                {t("passengers.action.apply", locale)}
              </button>
              <Link href="/passengers" style={linkButtonStyle}>
                {t("passengers.action.clear", locale)}
              </Link>
            </div>
          </form>
        </CanvasCard>

        <div style={stackedLayoutStyle}>
          <CanvasCard
            theme={th}
            padding={0}
            style={cardStyle}
            title={t("passengers.list.title", locale)}
            subtitle={t("passengers.list.subtitle", locale, {
              count: rows.length,
              state: t(`passengers.filters.stateValue.${filters.activeState}`, locale),
            })}
          >
            {emptyReason ? (
              renderEmptyState(emptyReason, primaryPageAction, locale)
            ) : (
              <CanvasTable<PassengerRow>
                theme={th}
                columns={columns}
                rows={rows}
              />
            )}
          </CanvasCard>

          <CanvasCard
            theme={th}
            title={t("passengers.detail.title", locale)}
            subtitle={
              selectedPassenger
                ? t("passengers.detail.subtitleSelected", locale, {
                    name: selectedPassenger.fullName,
                    state: t(
                      selectedPassenger.activeFlag
                        ? "passengers.state.active"
                        : "passengers.state.deactivated",
                      locale,
                    ),
                  })
                : t("passengers.detail.subtitleEmpty", locale)
            }
            style={detailCardStyle}
          >
            {selectedPassenger ? (
              <div style={{ display: "grid", gap: 14 }}>
                <div style={infoListStyle}>
                  <CanvasPill
                    theme={th}
                    tone={selectedPassenger.activeFlag ? "success" : "neutral"}
                    dot
                  >
                    {t(
                      selectedPassenger.activeFlag
                        ? "passengers.state.active"
                        : "passengers.state.deactivated",
                      locale,
                    )}
                  </CanvasPill>
                  <CanvasPill theme={th} tone="info">
                    {getKindLabel(selectedPassenger, locale)}
                  </CanvasPill>
                  {selectedPassengerDuplicate ? (
                    <CanvasPill theme={th} tone="warn">
                      {t("passengers.duplicateName", locale)}
                    </CanvasPill>
                  ) : null}
                </div>

                <CanvasDL
                  theme={th}
                  cols={1}
                  items={[
                    {
                      k: t("passengers.detail.passengerId", locale),
                      v: selectedPassenger.passengerId,
                      mono: true,
                    },
                    {
                      k: t("passengers.detail.employeeNo", locale),
                      v: selectedPassenger.employeeNo ?? t("passengers.value.empty", locale),
                      mono: true,
                    },
                    { k: t("passengers.detail.department", locale), v: selectedDepartment },
                    {
                      k: t("passengers.detail.mobile", locale),
                      v: selectedPassenger.mobile ?? t("passengers.value.empty", locale),
                      mono: true,
                    },
                    {
                      k: t("passengers.detail.email", locale),
                      v: selectedPassenger.email ?? t("passengers.value.empty", locale),
                      mono: true,
                    },
                    {
                      k: t("passengers.detail.editableUntil", locale),
                      v: formatUpdated(selectedEditableUntil),
                      mono: true,
                    },
                    {
                      k: t("passengers.detail.consentVersion", locale),
                      v: selectedConsentVersion ?? t("passengers.value.empty", locale),
                    },
                    {
                      k: t("passengers.detail.readOnlyReason", locale),
                      v: selectedReadOnlyReason ?? t("passengers.value.empty", locale),
                    },
                    {
                      k: t("passengers.detail.updatedAt", locale),
                      v: formatUpdated(selectedPassenger.updatedAt),
                      mono: true,
                    },
                  ]}
                />

                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ ...fieldLabelStyle, color: th.text }}>
                    {t("passengers.detail.availableActions", locale)}
                  </div>
                  <div style={actionsWrapStyle}>
                    {selectedActions.map((action) =>
                      renderActionDescriptor(
                        action,
                        getActionLabel(action.action, locale),
                        locale,
                      ),
                    )}
                  </div>
                  <div style={subtleTextStyle}>
                    {t("passengers.detail.actionsHelp", locale)}
                  </div>
                  <div style={helperTextStyle}>
                    {t("passengers.detail.softDeactivateHelp", locale)}
                  </div>
                </div>

                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ ...fieldLabelStyle, color: th.text }}>
                    {t("passengers.detail.deepLinks", locale)}
                  </div>
                  <div style={actionsWrapStyle}>
                    {selectedDeepLinks.map((link) => (
                      <Link
                        key={`${link.href}:${link.label}`}
                        href={link.href}
                        style={linkButtonStyle}
                        target={link.newTab ? "_blank" : undefined}
                        rel={link.newTab ? "noreferrer" : undefined}
                      >
                        {link.labelKey ? t(link.labelKey, locale) : link.label}
                      </Link>
                    ))}
                  </div>
                  <div style={helperTextStyle}>
                    {t("passengers.detail.deepLinksHelp", locale)}
                  </div>
                </div>

                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ ...fieldLabelStyle, color: th.text }}>
                    {t("passengers.detail.qualityIssues", locale)}
                  </div>
                  {selectedQualityIssues.length > 0 ? (
                    <div style={infoListStyle}>
                      {selectedQualityIssues.map((issue) => (
                        <CanvasPill
                          key={issue}
                          theme={th}
                          tone={getQualityIssueTone(issue)}
                        >
                          {getQualityIssueLabel(issue, locale)}
                        </CanvasPill>
                      ))}
                    </div>
                  ) : (
                    <div style={subtleTextStyle}>
                      {t("passengers.detail.noQualityIssues", locale)}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div style={subtleTextStyle}>
                {t("passengers.detail.noSelection", locale)}
              </div>
            )}
          </CanvasCard>
        </div>
      </div>
    </div>
  );
}

function getQualityIssueTone(issue: TenantPassengerQualityIssue): CanvasTone {
  switch (issue) {
    case "duplicate_employee_no":
      return "warn";
    case "missing_contact":
    case "missing_employee_no":
    default:
      return "neutral";
  }
}
