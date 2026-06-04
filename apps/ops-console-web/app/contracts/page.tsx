import Link from "next/link";
import type { CSSProperties } from "react";
import type {
  CrossAppResourceLink,
  EmptyReason,
  EmptyStateEnvelope,
  PartnerChannelEntryRecord,
  PartnerEligibilityReviewQueueItem,
  ResourceActionDescriptor,
  UiHealthEnvelope,
  UiRefreshMetadata,
  VehicleContractRecord,
} from "@drts/contracts";
import { getServerOpsClient } from "@/lib/api-client.server";
import { formatOpsCodeLabel } from "@/lib/localized-labels";
import { getServerLocale } from "@/lib/server-locale";
import { t, type Locale } from "@/lib/translations";
import { ContractsTable, PartnerRelationsTable } from "./contracts-tables";
import {
  CanvasBanner as Banner,
  CanvasCard as Card,
  CanvasIcon,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  buildCanvasTheme,
  type CanvasTone,
} from "@drts/ui-web";

type ContractsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type ContractListPayload = VehicleContractRecord[] | ContractListEnvelope;

type ContractListEnvelope = {
  items: ContractRuntimeRecord[];
  refresh?: UiRefreshMetadata;
  health?: UiHealthEnvelope;
  emptyState?: EmptyStateEnvelope;
};

type ContractRuntimeRecord = VehicleContractRecord & {
  availableActions?: ResourceActionDescriptor[];
  crossAppLinks?: CrossAppResourceLink[];
  partnerDisplayName?: string | null;
  partnerEntrySlug?: string | null;
  keyTerms?: string | null;
};

type ContractFilterTab = "all" | "expiring" | "partner";
type ContractFilterStatus =
  | "all"
  | "active"
  | "draft"
  | "expiring"
  | "terminated";
type ContractFilterExpiring = "all" | "yes" | "no";

type ContractFilters = {
  tab: ContractFilterTab;
  q: string;
  status: ContractFilterStatus;
  type: string;
  expiring: ContractFilterExpiring;
  emptyReason: EmptyReason | null;
};

type PartnerRelationRow = Record<string, unknown> & {
  partnerId: string;
  displayName: string;
  entrySlug: string;
  programId: string;
  partnerTypeLabel: string;
  eligibilityLabel: string;
  authLabel: string;
  statusLabel: string;
  statusTone: CanvasTone;
  governanceHref: string;
};

type LoadResult<T> = {
  data: T | null;
  error: string | null;
};

type HealthLoadResult = {
  health: UiHealthEnvelope | null;
  error: string | null;
};

type ContractRow = Record<string, unknown> & {
  contractId: string;
  serviceScope: string;
  operatingAreaId: string | null;
  kindKey: string;
  kindLabel: string;
  partnerId: string;
  partnerDisplayName: string;
  partnerType: string;
  partnerEntrySlug: string | null;
  vehicleId: string;
  statusKey: ContractFilterStatus;
  statusLabel: string;
  statusTone: CanvasTone;
  lifecycleLabel: string;
  startAt: string;
  endAt: string;
  termLabel: string;
  effectiveFromLabel: string;
  effectiveToLabel: string;
  daysToExpiry: number | null;
  expiringSoon: boolean;
  expired: boolean;
  keyTermsLabel: string;
  availableActions: ResourceActionDescriptor[];
  crossAppLinks: CrossAppResourceLink[];
};

const EXPIRING_SOON_DAYS = 45;

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const summaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 10,
};

const summaryCardStyle: CSSProperties = {
  padding: "14px 16px",
  borderRadius: 10,
  border: `1px solid ${theme.border}`,
  background: theme.surface,
  display: "grid",
  gap: 4,
};

const summaryLabelStyle: CSSProperties = {
  fontSize: 11,
  letterSpacing: 0.6,
  textTransform: "uppercase",
  color: theme.textMuted,
};

const summaryValueStyle: CSSProperties = {
  fontSize: 24,
  fontWeight: 700,
  lineHeight: 1.05,
  color: theme.text,
};

const summaryFootStyle: CSSProperties = {
  fontSize: 11.5,
  color: theme.textDim,
};

const filterGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(220px, 1.7fr) repeat(3, minmax(0, 1fr)) auto",
  gap: 10,
  alignItems: "end",
};

const fieldStackStyle: CSSProperties = {
  display: "grid",
  gap: 6,
};

const fieldLabelStyle: CSSProperties = {
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: 0.5,
  textTransform: "uppercase",
  color: theme.textMuted,
};

const fieldStyle: CSSProperties = {
  width: "100%",
  height: 34,
  padding: "0 10px",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: theme.bgRaised,
  color: theme.text,
  fontSize: 12.5,
  fontFamily: theme.fontFamily,
};

const helperRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  marginTop: 10,
};

const helperTextStyle: CSSProperties = {
  fontSize: 11.5,
  color: theme.textDim,
};

const monoTextStyle: CSSProperties = {
  fontFamily: theme.monoFamily,
};

const emptyStateStyle: CSSProperties = {
  display: "grid",
  justifyItems: "center",
  textAlign: "center",
  gap: 10,
  padding: "28px 20px",
};

const EMPTY_REASONS = new Set<EmptyReason>([
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
  "filtered_empty",
]);

const EMPTY_OVERRIDE_REASON_CODES: Record<EmptyReason, string> = {
  no_data: "contract_registry_empty",
  not_provisioned: "contract_registry_not_provisioned",
  fetch_failed: "contract_registry_fetch_failed",
  permission_denied: "contract_registry_permission_denied",
  external_unavailable: "contract_registry_external_unavailable",
  filtered_empty: "contract_registry_filtered_empty",
  driver_not_eligible: "driver_not_eligible",
};

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isEmptyReason(value: string | null | undefined): value is EmptyReason {
  return (
    value !== null &&
    value !== undefined &&
    EMPTY_REASONS.has(value as EmptyReason)
  );
}

function resolveFilters(
  searchParams: Record<string, string | string[] | undefined>,
): ContractFilters {
  const tabParam = firstParam(searchParams.tab);
  const statusParam = firstParam(searchParams.status);
  const expiringParam = firstParam(searchParams.expiring);
  const emptyReasonParam = firstParam(searchParams.emptyReason);

  return {
    tab: tabParam === "expiring" || tabParam === "partner" ? tabParam : "all",
    q: firstParam(searchParams.q)?.trim() ?? "",
    status:
      statusParam === "active" ||
      statusParam === "draft" ||
      statusParam === "expiring" ||
      statusParam === "terminated"
        ? statusParam
        : "all",
    type: firstParam(searchParams.type)?.trim() ?? "all",
    expiring:
      expiringParam === "yes" || expiringParam === "no" ? expiringParam : "all",
    emptyReason: isEmptyReason(emptyReasonParam) ? emptyReasonParam : null,
  };
}

function buildHref(
  filters: ContractFilters,
  overrides: Partial<ContractFilters>,
) {
  const next = { ...filters, ...overrides };
  const params = new URLSearchParams();
  if (next.tab !== "all") params.set("tab", next.tab);
  if (next.q) params.set("q", next.q);
  if (next.status !== "all") params.set("status", next.status);
  if (next.type !== "all") params.set("type", next.type);
  if (next.expiring !== "all") params.set("expiring", next.expiring);
  if (next.emptyReason) params.set("emptyReason", next.emptyReason);
  const query = params.toString();
  return query ? `/contracts?${query}` : "/contracts";
}

function hasActiveFilters(filters: ContractFilters) {
  return (
    filters.tab !== "all" ||
    filters.q.length > 0 ||
    filters.status !== "all" ||
    filters.type !== "all" ||
    filters.expiring !== "all"
  );
}

function buttonStyle(
  variant: "primary" | "secondary" | "ghost" = "secondary",
): CSSProperties {
  const styles =
    variant === "primary"
      ? {
          background: theme.accent,
          color: "#ffffff",
          borderColor: theme.accent,
        }
      : variant === "ghost"
        ? {
            background: "transparent",
            color: theme.textMuted,
            borderColor: "transparent",
          }
        : {
            background: theme.surface,
            color: theme.text,
            borderColor: theme.border,
          };

  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 34,
    padding: "0 12px",
    borderRadius: 8,
    border: `1px solid ${styles.borderColor}`,
    background: styles.background,
    color: styles.color,
    fontSize: 12.5,
    fontWeight: 600,
    textDecoration: "none",
    cursor: "pointer",
    fontFamily: theme.fontFamily,
  };
}

function linkButtonStyle(
  tone: CanvasTone = "neutral",
  disabled = false,
): CSSProperties {
  const palette: Record<CanvasTone, { bg: string; fg: string; bd: string }> = {
    success: {
      bg: theme.successBg,
      fg: theme.success,
      bd: theme.successBorder,
    },
    warn: { bg: theme.warnBg, fg: theme.warn, bd: theme.warnBorder },
    danger: {
      bg: theme.dangerBg,
      fg: theme.danger,
      bd: theme.dangerBorder,
    },
    info: { bg: theme.infoBg, fg: theme.info, bd: theme.infoBorder },
    accent: {
      bg: theme.accentBg,
      fg: theme.accent,
      bd: theme.accentBorder,
    },
    neutral: {
      bg: theme.surfaceLo,
      fg: theme.textMuted,
      bd: theme.border,
    },
  };

  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 26,
    padding: "4px 9px",
    borderRadius: 7,
    border: `1px solid ${palette[tone].bd}`,
    background: palette[tone].bg,
    color: palette[tone].fg,
    textDecoration: "none",
    fontSize: 11.5,
    fontWeight: 600,
    opacity: disabled ? 0.48 : 1,
    cursor: disabled ? "not-allowed" : "pointer",
    pointerEvents: disabled ? "none" : "auto",
  };
}

function tinyMetaStyle(tone: CanvasTone = "neutral"): CSSProperties {
  const colors: Record<CanvasTone, string> = {
    success: theme.success,
    warn: theme.warn,
    danger: theme.danger,
    info: theme.info,
    accent: theme.accent,
    neutral: theme.textMuted,
  };

  return {
    fontSize: 10.5,
    color: colors[tone],
    letterSpacing: 0.2,
  };
}

function toneColor(tone: CanvasTone) {
  const colors: Record<CanvasTone, string> = {
    success: theme.success,
    warn: theme.warn,
    danger: theme.danger,
    info: theme.info,
    accent: theme.accent,
    neutral: theme.textMuted,
  };

  return colors[tone];
}

function formatDate(locale: Locale, value: string | null | undefined) {
  if (!value) {
    return t("contracts.status.openEnded", locale);
  }

  return new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "UTC",
  })
    .format(new Date(value))
    .replace(/,/g, "");
}

function formatLongDateTime(locale: Locale, value: string | null | undefined) {
  if (!value) {
    return t("contracts.status.unknown", locale);
  }

  return new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  })
    .format(new Date(value))
    .replace(",", "");
}

function deriveKind(contract: ContractRuntimeRecord): {
  key: string;
  label: (locale: Locale) => string;
} {
  const raw = `${contract.contractType} ${contract.partnerType}`.toLowerCase();
  if (raw.includes("partner") || raw.includes("program")) {
    return {
      key: "partner",
      label: (currentLocale) =>
        t("contracts.kind.partnerProgram", currentLocale),
    };
  }
  if (raw.includes("forward")) {
    return {
      key: "forwarder",
      label: (currentLocale) => t("contracts.kind.forwarded", currentLocale),
    };
  }
  if (raw.includes("driver")) {
    return {
      key: "driver",
      label: (currentLocale) => t("contracts.kind.driver", currentLocale),
    };
  }
  return {
    key: "vehicle",
    label: (currentLocale) => t("contracts.kind.vehicleFleet", currentLocale),
  };
}

function daysBetween(fromIso: string, toIso: string | null): number | null {
  if (!toIso) {
    return null;
  }
  const to = new Date(toIso).getTime();
  const from = new Date(fromIso).getTime();
  if (Number.isNaN(to) || Number.isNaN(from)) {
    return null;
  }
  return Math.round((to - from) / (1000 * 60 * 60 * 24));
}

function deriveContractStatus(
  contract: ContractRuntimeRecord,
  expiringSoon: boolean,
  expired: boolean,
  locale: Locale,
): { key: ContractFilterStatus; label: string; tone: CanvasTone } {
  if (contract.status === "terminated") {
    return {
      key: "terminated",
      label: t("contracts.status.terminated", locale),
      tone: "neutral",
    };
  }
  if (expired || contract.lifecycleStatus === "expired") {
    return {
      key: "terminated",
      label: t("contracts.status.expired", locale),
      tone: "danger",
    };
  }
  if (contract.status === "draft") {
    return {
      key: "draft",
      label: t("contracts.status.draft", locale),
      tone: "warn",
    };
  }
  if (expiringSoon) {
    return {
      key: "expiring",
      label: t("contracts.status.expiringSoon", locale),
      tone: "warn",
    };
  }
  return {
    key: "active",
    label: t("contracts.status.active", locale),
    tone: "success",
  };
}

function deriveKeyTerms(
  contract: ContractRuntimeRecord,
  partnerEntry: PartnerChannelEntryRecord | undefined,
  locale: Locale,
): string {
  if (contract.keyTerms && contract.keyTerms.trim().length > 0) {
    return contract.keyTerms;
  }

  const parts: string[] = [];
  parts.push(
    `${t("contracts.keyTerms.scope", locale)}: ${contract.serviceScope || formatOpsCodeLabel(locale, contract.contractType)}`,
  );
  if (contract.operatingAreaId) {
    parts.push(
      `${t("contracts.keyTerms.area", locale)}: ${contract.operatingAreaId}`,
    );
  }
  if (partnerEntry) {
    parts.push(
      `${t("contracts.keyTerms.eligibilityMode", locale)}: ${formatOpsCodeLabel(locale, partnerEntry.eligibilityMode)}`,
    );
  }
  return parts.join(" · ");
}

function resolveAppOrigin(targetApp: CrossAppResourceLink["targetApp"]) {
  const envCandidates =
    targetApp === "platform-admin"
      ? [
          process.env.NEXT_PUBLIC_PLATFORM_ADMIN_ORIGIN,
          process.env.PLATFORM_ADMIN_ORIGIN,
          process.env.DEV_PLATFORM_ADMIN_ORIGIN,
          process.env.STAGING_PLATFORM_ADMIN_ORIGIN,
          process.env.PROD_PLATFORM_ADMIN_ORIGIN,
        ]
      : targetApp === "tenant-console"
        ? [
            process.env.NEXT_PUBLIC_TENANT_CONSOLE_ORIGIN,
            process.env.TENANT_CONSOLE_ORIGIN,
          ]
        : [
            process.env.NEXT_PUBLIC_OPS_CONSOLE_ORIGIN,
            process.env.OPS_CONSOLE_ORIGIN,
            process.env.DEV_OPS_CONSOLE_ORIGIN,
            process.env.STAGING_OPS_CONSOLE_ORIGIN,
            process.env.PROD_OPS_CONSOLE_ORIGIN,
          ];
  const resolved = envCandidates.find(
    (candidate) => typeof candidate === "string" && candidate.trim().length > 0,
  );

  if (resolved) {
    return resolved.replace(/\/$/, "");
  }

  if (targetApp === "platform-admin") return "http://localhost:3002";
  if (targetApp === "tenant-console") return "http://localhost:3004";
  return "http://localhost:3003";
}

function synthesizeCrossAppLinks(
  contract: ContractRuntimeRecord,
  kindKey: string,
  locale: Locale,
): CrossAppResourceLink[] {
  if (contract.crossAppLinks && contract.crossAppLinks.length > 0) {
    return contract.crossAppLinks;
  }

  if (kindKey === "partner" || kindKey === "forwarder") {
    return [
      {
        targetApp: "platform-admin",
        route: `/partners?partnerId=${encodeURIComponent(contract.partnerId)}`,
        resourceType: "partner_program",
        resourceId: contract.partnerId,
        openMode: "new_tab",
        label: t("contracts.link.partnerGovernance", locale),
      },
    ];
  }

  return [
    {
      targetApp: "platform-admin",
      route: `/fleet?vehicleId=${encodeURIComponent(contract.vehicleId)}`,
      resourceType: "vehicle_contract",
      resourceId: contract.contractId,
      openMode: "new_tab",
      label: t("contracts.link.fleetGovernance", locale),
    },
  ];
}

function synthesizeAvailableActions(
  contract: ContractRuntimeRecord,
  seed: {
    kindKey: string;
    crossAppLinks: CrossAppResourceLink[];
  },
): ResourceActionDescriptor[] {
  const actions: ResourceActionDescriptor[] = [
    {
      action: "open_contract_detail",
      enabled: false,
      disabledReasonCode: "contract_detail_pending",
      riskLevel: "low",
    },
  ];

  if (seed.crossAppLinks.length > 0) {
    actions.push({
      action:
        seed.kindKey === "partner" || seed.kindKey === "forwarder"
          ? "open_partner_governance"
          : "open_fleet_governance",
      enabled: true,
      riskLevel: "medium",
    });
  }

  return actions;
}

function refreshBadgeLabel(refresh: UiRefreshMetadata, locale: Locale) {
  const freshness =
    locale === "zh"
      ? formatOpsCodeLabel(locale, refresh.dataFreshness)
      : refresh.dataFreshness.toUpperCase();

  return t("contracts.refresh.badge", locale, { freshness });
}

function refreshBody(refresh: UiRefreshMetadata, locale: Locale) {
  return t("contracts.refresh.body", locale, {
    generatedAt: formatLongDateTime(locale, refresh.generatedAt),
    source:
      locale === "zh"
        ? formatOpsCodeLabel(locale, refresh.source)
        : refresh.source,
  });
}

function synthesizeRefreshMetadata(
  generatedAt: string,
  freshness: UiRefreshMetadata["dataFreshness"] = "fresh",
): UiRefreshMetadata {
  return {
    generatedAt,
    staleAfterMs: 15_000,
    dataFreshness: freshness,
    source: "live",
  };
}

function normalizeContractPayload(
  payload: ContractListPayload | null,
  fallbackGeneratedAt: string,
): ContractListEnvelope {
  if (!payload) {
    return {
      items: [],
      refresh: synthesizeRefreshMetadata(fallbackGeneratedAt, "unknown"),
    };
  }

  if (Array.isArray(payload)) {
    return {
      items: payload,
      refresh: synthesizeRefreshMetadata(fallbackGeneratedAt, "fresh"),
    };
  }

  const normalized: ContractListEnvelope = {
    items: payload.items ?? [],
    refresh:
      payload.refresh ??
      synthesizeRefreshMetadata(fallbackGeneratedAt, "fresh"),
  };

  if (payload.health) {
    normalized.health = payload.health;
  }
  if (payload.emptyState) {
    normalized.emptyState = payload.emptyState;
  }

  return normalized;
}

async function loadWithError<T>(
  loader: () => Promise<T>,
): Promise<LoadResult<T>> {
  try {
    return { data: await loader(), error: null };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function normalizeLegacyHealthStatus(status: string | undefined) {
  if (status === "healthy" || status === "ok") return "healthy";
  if (status === "down" || status === "unhealthy") return "down";
  if (status === "degraded") return "degraded";
  return "degraded";
}

function normalizeHealthPayload(payload: unknown): UiHealthEnvelope | null {
  const unwrapped =
    isRecord(payload) && "data" in payload ? payload.data : payload;

  if (!isRecord(unwrapped)) {
    return null;
  }

  if (
    typeof unwrapped.status === "string" &&
    Array.isArray(unwrapped.degradedServices) &&
    typeof unwrapped.lastCheckedAt === "string"
  ) {
    return {
      status:
        unwrapped.status === "healthy" ||
        unwrapped.status === "degraded" ||
        unwrapped.status === "down"
          ? unwrapped.status
          : "degraded",
      degradedServices: unwrapped.degradedServices
        .filter(isRecord)
        .map((entry) => ({
          service: String(entry.service ?? "service"),
          impact: String(entry.impact ?? "degraded"),
          severity: entry.severity === "critical" ? "critical" : "warning",
        })),
      lastCheckedAt: unwrapped.lastCheckedAt,
    };
  }

  if (typeof unwrapped.status === "string") {
    const timestamp =
      typeof unwrapped.timestamp === "string"
        ? unwrapped.timestamp
        : new Date().toISOString();
    const service =
      typeof unwrapped.service === "string" ? unwrapped.service : "api";
    const normalizedStatus = normalizeLegacyHealthStatus(unwrapped.status);

    return {
      status: normalizedStatus,
      degradedServices:
        normalizedStatus === "healthy"
          ? []
          : [
              {
                service,
                impact: `health=${unwrapped.status}`,
                severity: normalizedStatus === "down" ? "critical" : "warning",
              },
            ],
      lastCheckedAt: timestamp,
    };
  }

  return null;
}

async function loadHealthEnvelope(): Promise<HealthLoadResult> {
  const apiBaseUrl = process.env.DRTS_API_URL ?? "http://localhost:3001";

  try {
    const response = await fetch(new URL("/api/health", apiBaseUrl), {
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        health: {
          status: "down",
          degradedServices: [
            {
              service: "api",
              impact: `status=${response.status}`,
              severity: "critical",
            },
          ],
          lastCheckedAt: new Date().toISOString(),
        },
        error: `health status ${response.status}`,
      };
    }

    const payload = await response.json();
    return {
      health: normalizeHealthPayload(payload),
      error: null,
    };
  } catch (error) {
    return {
      health: {
        status: "down",
        degradedServices: [
          {
            service: "api",
            impact:
              error instanceof Error ? error.message : "health fetch failed",
            severity: "critical",
          },
        ],
        lastCheckedAt: new Date().toISOString(),
      },
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function mergeHealthSignals(
  baseHealth: UiHealthEnvelope | null,
  supplementalServices: UiHealthEnvelope["degradedServices"],
): UiHealthEnvelope | null {
  if (!baseHealth && supplementalServices.length === 0) {
    return null;
  }

  const degradedServices = [
    ...(baseHealth?.degradedServices ?? []),
    ...supplementalServices,
  ];

  if (degradedServices.length === 0 && baseHealth?.status === "healthy") {
    return baseHealth;
  }

  const status =
    baseHealth?.status === "down" ||
    degradedServices.some((service) => service.severity === "critical")
      ? "down"
      : degradedServices.length > 0
        ? "degraded"
        : "healthy";

  return {
    status,
    degradedServices,
    lastCheckedAt: baseHealth?.lastCheckedAt ?? new Date().toISOString(),
  };
}

function buildEmptyStateViewModel(
  reason: EmptyReason,
  locale: Locale,
  filters: ContractFilters,
  rawMessage: string | null,
) {
  switch (reason) {
    case "not_provisioned":
      return {
        tone: "info" as const,
        icon: "partners" as const,
        title: t("contracts.emptyState.notProvisioned.title", locale),
        description: t(
          "contracts.emptyState.notProvisioned.description",
          locale,
        ),
        actionLabel: t("contracts.emptyState.notProvisioned.action", locale),
        actionHref: `${resolveAppOrigin("platform-admin")}/partners`,
        actionNewTab: true,
      };
    case "fetch_failed":
      return {
        tone: "danger" as const,
        icon: "warn" as const,
        title: t("contracts.emptyState.fetchFailed.title", locale),
        description:
          rawMessage ??
          t("contracts.emptyState.fetchFailed.description", locale),
        actionLabel: t("contracts.emptyState.fetchFailed.action", locale),
        actionHref: buildHref(filters, {}),
        actionNewTab: false,
      };
    case "permission_denied":
      return {
        tone: "warn" as const,
        icon: "users" as const,
        title: t("contracts.emptyState.permissionDenied.title", locale),
        description: t(
          "contracts.emptyState.permissionDenied.description",
          locale,
        ),
        actionLabel: t("contracts.emptyState.permissionDenied.action", locale),
        actionHref: "/dashboard",
        actionNewTab: false,
      };
    case "external_unavailable":
      return {
        tone: "warn" as const,
        icon: "health" as const,
        title: t("contracts.emptyState.externalUnavailable.title", locale),
        description: t(
          "contracts.emptyState.externalUnavailable.description",
          locale,
        ),
        actionLabel: t(
          "contracts.emptyState.externalUnavailable.action",
          locale,
        ),
        actionHref: `${resolveAppOrigin("platform-admin")}/partners`,
        actionNewTab: true,
      };
    case "filtered_empty":
      return {
        tone: "accent" as const,
        icon: "filter" as const,
        title: t("contracts.emptyState.filteredEmpty.title", locale),
        description: t(
          "contracts.emptyState.filteredEmpty.description",
          locale,
        ),
        actionLabel: t("contracts.emptyState.filteredEmpty.action", locale),
        actionHref: "/contracts",
        actionNewTab: false,
      };
    case "no_data":
    default:
      return {
        tone: "neutral" as const,
        icon: "contracts" as const,
        title: t("contracts.emptyState.noData.title", locale),
        description: t("contracts.emptyState.noData.description", locale),
        actionLabel: t("contracts.emptyState.noData.action", locale),
        actionHref: "/revenue",
        actionNewTab: false,
      };
  }
}

export default async function ContractsPage({
  searchParams,
}: ContractsPageProps) {
  const resolvedSearchParams = await (searchParams ??
    Promise.resolve({} as Record<string, string | string[] | undefined>));
  const filters = resolveFilters(resolvedSearchParams);
  const [client, locale] = await Promise.all([
    getServerOpsClient(),
    getServerLocale(),
  ]);
  const requestStartedAt = new Date().toISOString();

  const [
    contractsResult,
    partnerEntriesResult,
    reviewQueueResult,
    healthResult,
  ] = await Promise.all([
    loadWithError(() =>
      client.get<ContractListPayload>("/api/regulatory-registry/contracts"),
    ),
    loadWithError(() => client.listPartnerEntries()),
    loadWithError(() => client.listPartnerEligibilityReviewQueue()),
    loadHealthEnvelope(),
  ]);

  const contractPayload = normalizeContractPayload(
    contractsResult.data,
    requestStartedAt,
  );
  const partnerEntries =
    partnerEntriesResult.data ?? ([] as PartnerChannelEntryRecord[]);
  const reviewQueue =
    reviewQueueResult.data ?? ([] as PartnerEligibilityReviewQueueItem[]);

  const degradedServices: UiHealthEnvelope["degradedServices"] = [];
  if (contractsResult.error) {
    degradedServices.push({
      service: "contract_registry",
      impact: contractsResult.error,
      severity: "critical",
    });
  }
  if (partnerEntriesResult.error) {
    degradedServices.push({
      service: "partner_directory",
      impact: partnerEntriesResult.error,
      severity: "warning",
    });
  }
  if (reviewQueueResult.error) {
    degradedServices.push({
      service: "partner_eligibility_review",
      impact: reviewQueueResult.error,
      severity: "warning",
    });
  }
  if (healthResult.error) {
    degradedServices.push({
      service: "api",
      impact: healthResult.error,
      severity: "critical",
    });
  }

  const health = mergeHealthSignals(
    contractPayload.health ?? healthResult.health,
    degradedServices,
  );

  const partnerEntryById = new Map<string, PartnerChannelEntryRecord>();
  const partnerEntryBySlug = new Map<string, PartnerChannelEntryRecord>();
  for (const entry of partnerEntries) {
    partnerEntryById.set(entry.partnerId, entry);
    partnerEntryBySlug.set(entry.entrySlug, entry);
  }

  const manualReviewCount = reviewQueue.filter(
    (item) => item.verificationStatus === "manual_review",
  ).length;

  const rows: ContractRow[] = contractPayload.items.map((contract) => {
    const kind = deriveKind(contract);
    const partnerEntry =
      partnerEntryById.get(contract.partnerId) ??
      (contract.partnerEntrySlug
        ? partnerEntryBySlug.get(contract.partnerEntrySlug)
        : undefined);
    const daysToExpiry = daysBetween(requestStartedAt, contract.endAt);
    const expired =
      daysToExpiry !== null &&
      daysToExpiry < 0 &&
      contract.status !== "terminated";
    const expiringSoon =
      !expired &&
      daysToExpiry !== null &&
      daysToExpiry >= 0 &&
      daysToExpiry <= EXPIRING_SOON_DAYS &&
      contract.status === "active";
    const status = deriveContractStatus(
      contract,
      expiringSoon,
      expired,
      locale,
    );
    const crossAppLinks = synthesizeCrossAppLinks(contract, kind.key, locale);

    const provisionalRow = {
      contractId: contract.contractId,
      serviceScope:
        contract.serviceScope ||
        formatOpsCodeLabel(locale, contract.contractType),
      operatingAreaId: contract.operatingAreaId,
      kindKey: kind.key,
      kindLabel: kind.label(locale),
      partnerId: contract.partnerId,
      partnerDisplayName:
        contract.partnerDisplayName ??
        partnerEntry?.displayName ??
        contract.partnerId,
      partnerType: contract.partnerType,
      partnerEntrySlug:
        contract.partnerEntrySlug ?? partnerEntry?.entrySlug ?? null,
      vehicleId: contract.vehicleId,
      statusKey: status.key,
      statusLabel: status.label,
      statusTone: status.tone,
      lifecycleLabel: formatOpsCodeLabel(locale, contract.lifecycleStatus),
      startAt: contract.startAt,
      endAt: contract.endAt,
      termLabel: `${formatDate(locale, contract.startAt)} → ${formatDate(locale, contract.endAt)}`,
      effectiveFromLabel: formatDate(locale, contract.startAt),
      effectiveToLabel: formatDate(locale, contract.endAt),
      daysToExpiry,
      expiringSoon,
      expired,
      keyTermsLabel: deriveKeyTerms(contract, partnerEntry, locale),
      crossAppLinks,
    };

    const nextRow: ContractRow = {
      ...provisionalRow,
      availableActions:
        contract.availableActions && contract.availableActions.length > 0
          ? contract.availableActions
          : synthesizeAvailableActions(contract, {
              kindKey: kind.key,
              crossAppLinks,
            }),
    };

    return nextRow;
  });

  const typeOptions = Array.from(new Set(rows.map((row) => row.kindKey))).sort(
    (left, right) => left.localeCompare(right),
  );

  const filteredRows = rows.filter((row) => {
    if (filters.tab === "expiring" && !(row.expiringSoon || row.expired)) {
      return false;
    }
    if (
      filters.tab === "partner" &&
      row.kindKey !== "partner" &&
      row.kindKey !== "forwarder"
    ) {
      return false;
    }
    if (filters.status !== "all" && row.statusKey !== filters.status) {
      return false;
    }
    if (filters.type !== "all" && row.kindKey !== filters.type) {
      return false;
    }
    if (filters.expiring === "yes" && !(row.expiringSoon || row.expired)) {
      return false;
    }
    if (filters.expiring === "no" && (row.expiringSoon || row.expired)) {
      return false;
    }

    if (!filters.q) {
      return true;
    }

    const haystack = [
      row.contractId,
      row.serviceScope,
      row.partnerId,
      row.partnerDisplayName,
      row.partnerEntrySlug ?? "",
      row.vehicleId,
      row.kindLabel,
      row.statusLabel,
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(filters.q.toLowerCase());
  });

  const tabCounts = {
    all: rows.length,
    expiring: rows.filter((row) => row.expiringSoon || row.expired).length,
    partner: rows.filter(
      (row) => row.kindKey === "partner" || row.kindKey === "forwarder",
    ).length,
  };

  const activeCount = rows.filter((row) => row.statusKey === "active").length;
  const expiringCount = rows.filter((row) => row.expiringSoon).length;

  let emptyReason = filters.emptyReason;
  if (!emptyReason && filteredRows.length === 0) {
    if (contractsResult.error) {
      emptyReason = "fetch_failed";
    } else if (
      contractPayload.emptyState?.reason &&
      isEmptyReason(contractPayload.emptyState.reason)
    ) {
      emptyReason = contractPayload.emptyState.reason;
    } else if (hasActiveFilters(filters)) {
      emptyReason = "filtered_empty";
    } else if (
      health &&
      health.status !== "healthy" &&
      health.degradedServices.some(
        (service: UiHealthEnvelope["degradedServices"][number]) =>
          service.service === "partner_directory",
      )
    ) {
      emptyReason = "external_unavailable";
    } else {
      emptyReason = "no_data";
    }
  }

  if (filters.emptyReason && filteredRows.length > 0) {
    emptyReason = filters.emptyReason;
  }

  const displayedRows = emptyReason ? [] : filteredRows;
  const emptyView = emptyReason
    ? buildEmptyStateViewModel(
        emptyReason,
        locale,
        filters,
        contractsResult.error ??
          (contractPayload.emptyState?.messageCode
            ? formatOpsCodeLabel(locale, contractPayload.emptyState.messageCode)
            : null),
      )
    : null;

  const refresh =
    contractPayload.refresh ?? synthesizeRefreshMetadata(requestStartedAt);
  const refreshHref = buildHref(filters, {});

  const tabs = [
    {
      key: "all" as const,
      node: (
        <Link
          href={buildHref(filters, { tab: "all" })}
          style={{
            color: theme.text,
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {t("contracts.tab.all", locale)}
          <span style={tinyMetaStyle()}>{tabCounts.all}</span>
        </Link>
      ),
    },
    {
      key: "expiring" as const,
      node: (
        <Link
          href={buildHref(filters, { tab: "expiring" })}
          style={{
            color: theme.text,
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {t("contracts.tab.expiring", locale)}
          <span style={tinyMetaStyle("warn")}>{tabCounts.expiring}</span>
        </Link>
      ),
    },
    {
      key: "partner" as const,
      node: (
        <Link
          href={buildHref(filters, { tab: "partner" })}
          style={{
            color: theme.text,
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {t("contracts.tab.partner", locale)}
          <span style={tinyMetaStyle("info")}>{tabCounts.partner}</span>
        </Link>
      ),
    },
  ];
  const defaultTab = tabs[0]!;
  const activeTab = (tabs.find((tab) => tab.key === filters.tab) ?? defaultTab)
    .node;

  const appOrigins = {
    opsConsole: resolveAppOrigin("ops-console"),
    platformAdmin: resolveAppOrigin("platform-admin"),
    tenantConsole: resolveAppOrigin("tenant-console"),
  };

  const partnerRelationRows: PartnerRelationRow[] = partnerEntries
    .slice(0, 8)
    .map((entry) => ({
      partnerId: entry.partnerId,
      displayName: entry.displayName,
      entrySlug: entry.entrySlug,
      programId: entry.programId,
      partnerTypeLabel: formatOpsCodeLabel(locale, entry.partnerType),
      eligibilityLabel: formatOpsCodeLabel(locale, entry.eligibilityMode),
      authLabel: formatOpsCodeLabel(locale, entry.authMode),
      statusLabel: formatOpsCodeLabel(locale, entry.status),
      statusTone:
        entry.status === "active" && entry.activeFlag
          ? ("success" as CanvasTone)
          : entry.status === "revoked"
            ? ("danger" as CanvasTone)
            : ("warn" as CanvasTone),
      governanceHref: `${resolveAppOrigin("platform-admin")}/partners?partnerId=${encodeURIComponent(entry.partnerId)}`,
    }));

  return (
    <>
      <PageHeader
        theme={theme}
        title={t("contracts.title", locale)}
        subtitle={t("contracts.page.subtitle", locale)}
        tabs={tabs.map((tab) => tab.node)}
        activeTab={activeTab}
        actions={
          <>
            <Pill
              theme={theme}
              tone={refresh.dataFreshness === "fresh" ? "success" : "warn"}
            >
              {refreshBadgeLabel(refresh, locale)}
            </Pill>
            <a href={refreshHref} style={buttonStyle("secondary")}>
              <CanvasIcon name="arrow" size={12} />
              {t("common.refresh", locale)}
            </a>
          </>
        }
      />

      <div style={pageBodyStyle}>
        {health && health.status !== "healthy" ? (
          <Banner
            theme={theme}
            tone={health.status === "down" ? "danger" : "warn"}
            icon={health.status === "down" ? "warn" : "health"}
            title={t("contracts.banner.degraded.title", locale)}
            body={t("contracts.banner.degraded.body", locale, {
              details:
                health.degradedServices
                  .map(
                    (service: UiHealthEnvelope["degradedServices"][number]) =>
                      `${service.service}: ${service.impact}`,
                  )
                  .join(" · ") ||
                t("contracts.banner.degraded.unknown", locale),
              checkedAt: formatLongDateTime(locale, health.lastCheckedAt),
            })}
          />
        ) : null}

        {refresh.dataFreshness !== "fresh" ? (
          <Banner
            theme={theme}
            tone={refresh.dataFreshness === "degraded" ? "warn" : "info"}
            icon={refresh.dataFreshness === "degraded" ? "warn" : "clock"}
            title={t("contracts.banner.snapshotNotFresh", locale)}
            body={refreshBody(refresh, locale)}
          />
        ) : null}

        {expiringCount > 0 ? (
          <Banner
            theme={theme}
            tone="warn"
            icon="clock"
            title={t("contracts.banner.expiring.title", locale)}
            body={t("contracts.banner.expiring.body", locale, {
              count: expiringCount,
              days: EXPIRING_SOON_DAYS,
            })}
            actions={
              <Link
                href={buildHref(filters, { tab: "expiring" })}
                style={linkButtonStyle("warn")}
              >
                {t("contracts.banner.expiring.action", locale)}
              </Link>
            }
          />
        ) : null}

        <div style={summaryGridStyle}>
          <div style={summaryCardStyle}>
            <span style={summaryLabelStyle}>
              {t("contracts.summary.registered", locale)}
            </span>
            <span style={summaryValueStyle}>{rows.length}</span>
            <span style={summaryFootStyle}>
              {t("contracts.summary.registeredSub", locale)}
            </span>
          </div>
          <div style={summaryCardStyle}>
            <span style={summaryLabelStyle}>
              {t("contracts.summary.active", locale)}
            </span>
            <span style={{ ...summaryValueStyle, color: theme.success }}>
              {activeCount}
            </span>
            <span style={summaryFootStyle}>
              {t("contracts.summary.activeSub", locale)}
            </span>
          </div>
          <div style={summaryCardStyle}>
            <span style={summaryLabelStyle}>
              {t("contracts.summary.expiring", locale)}
            </span>
            <span
              style={{
                ...summaryValueStyle,
                color: expiringCount > 0 ? theme.warn : theme.text,
              }}
            >
              {expiringCount}
            </span>
            <span style={summaryFootStyle}>
              {t("contracts.summary.withinDays", locale, {
                days: EXPIRING_SOON_DAYS,
              })}
            </span>
          </div>
          <div style={summaryCardStyle}>
            <span style={summaryLabelStyle}>
              {t("contracts.summary.partnerEntries", locale)}
            </span>
            <span style={{ ...summaryValueStyle, color: theme.info }}>
              {partnerEntries.length}
            </span>
            <span style={summaryFootStyle}>
              {manualReviewCount > 0
                ? t("contracts.summary.manualReviewPending", locale, {
                    count: manualReviewCount,
                  })
                : t("contracts.summary.noReviewBacklog", locale)}
            </span>
          </div>
        </div>

        <Card
          theme={theme}
          title={t("contracts.filters.title", locale)}
          subtitle={t("contracts.filters.subtitle", locale)}
        >
          <form method="get" style={{ display: "grid", gap: 0 }}>
            <input type="hidden" name="tab" value={filters.tab} />
            {filters.emptyReason ? (
              <input
                type="hidden"
                name="emptyReason"
                value={filters.emptyReason}
              />
            ) : null}
            <div style={filterGridStyle}>
              <label style={fieldStackStyle}>
                <span style={fieldLabelStyle}>
                  {t("contracts.filters.searchLabel", locale)}
                </span>
                <input
                  name="q"
                  defaultValue={filters.q}
                  placeholder={t("contracts.filters.searchPlaceholder", locale)}
                  style={fieldStyle}
                />
              </label>

              <label style={fieldStackStyle}>
                <span style={fieldLabelStyle}>
                  {t("contracts.filters.statusLabel", locale)}
                </span>
                <select
                  name="status"
                  defaultValue={filters.status}
                  style={fieldStyle}
                >
                  <option value="all">{t("common.all", locale)}</option>
                  <option value="active">
                    {t("contracts.status.active", locale)}
                  </option>
                  <option value="draft">
                    {t("contracts.status.draft", locale)}
                  </option>
                  <option value="expiring">
                    {t("contracts.status.expiringSoon", locale)}
                  </option>
                  <option value="terminated">
                    {t("contracts.filters.option.terminated", locale)}
                  </option>
                </select>
              </label>

              <label style={fieldStackStyle}>
                <span style={fieldLabelStyle}>
                  {t("contracts.filters.kindLabel", locale)}
                </span>
                <select
                  name="type"
                  defaultValue={filters.type}
                  style={fieldStyle}
                >
                  <option value="all">{t("common.all", locale)}</option>
                  {typeOptions.map((value) => (
                    <option key={value} value={value}>
                      {formatOpsCodeLabel(locale, value)}
                    </option>
                  ))}
                </select>
              </label>

              <label style={fieldStackStyle}>
                <span style={fieldLabelStyle}>
                  {t("contracts.filters.expiringLabel", locale)}
                </span>
                <select
                  name="expiring"
                  defaultValue={filters.expiring}
                  style={fieldStyle}
                >
                  <option value="all">{t("common.all", locale)}</option>
                  <option value="yes">{t("common.yes", locale)}</option>
                  <option value="no">{t("common.no", locale)}</option>
                </select>
              </label>

              <div style={{ display: "flex", gap: 8 }}>
                <button type="submit" style={buttonStyle("primary")}>
                  <CanvasIcon name="search" size={12} />
                  {t("contracts.filters.apply", locale)}
                </button>
                <Link href="/contracts" style={buttonStyle("ghost")}>
                  {t("contracts.filters.reset", locale)}
                </Link>
              </div>
            </div>
          </form>

          <div style={helperRowStyle}>
            <span style={helperTextStyle}>
              {t("contracts.filters.visibleSummary", locale, {
                visible: displayedRows.length,
                total: rows.length,
              })}
            </span>
            <span style={{ ...helperTextStyle, ...monoTextStyle }}>
              {t("contracts.filters.generatedAt", locale)} ·{" "}
              {formatLongDateTime(locale, refresh.generatedAt)} UTC
            </span>
            <span style={helperTextStyle}>
              {t("contracts.filters.availableActionsHint", locale)}
            </span>
          </div>
        </Card>

        <Card
          theme={theme}
          title={t("contracts.registry.title", locale)}
          subtitle={t("contracts.registry.subtitle", locale)}
        >
          {emptyView ? (
            <div style={emptyStateStyle}>
              <CanvasIcon
                name={emptyView.icon}
                size={26}
                style={{ color: toneColor(emptyView.tone) }}
              />
              <strong style={{ color: theme.text, fontSize: 15 }}>
                {emptyView.title}
              </strong>
              <span
                style={{
                  color: theme.textMuted,
                  maxWidth: 520,
                  fontSize: 12.5,
                  lineHeight: 1.5,
                }}
              >
                {emptyView.description}
              </span>
              <Link
                href={emptyView.actionHref}
                target={emptyView.actionNewTab ? "_blank" : undefined}
                rel={emptyView.actionNewTab ? "noreferrer" : undefined}
                style={linkButtonStyle(emptyView.tone)}
              >
                {emptyView.actionLabel}
                {emptyView.actionNewTab ? (
                  <CanvasIcon name="ext" size={11} />
                ) : null}
              </Link>
              <span style={tinyMetaStyle(emptyView.tone)}>
                {t("contracts.registry.emptyReason", locale)} ·{" "}
                {EMPTY_OVERRIDE_REASON_CODES[emptyReason ?? "no_data"]}
              </span>
            </div>
          ) : (
            <ContractsTable
              locale={locale}
              rows={displayedRows}
              appOrigins={appOrigins}
            />
          )}
        </Card>

        <Card
          theme={theme}
          title={t("contracts.partnerRelations.title", locale)}
          subtitle={t("contracts.partnerRelations.subtitle", locale)}
        >
          {partnerRelationRows.length === 0 ? (
            <div style={emptyStateStyle}>
              <CanvasIcon
                name="partners"
                size={24}
                style={{ color: theme.textMuted }}
              />
              <strong style={{ color: theme.text, fontSize: 14 }}>
                {t("contracts.partnerRelations.empty.title", locale)}
              </strong>
              <span
                style={{
                  color: theme.textMuted,
                  maxWidth: 460,
                  fontSize: 12.5,
                }}
              >
                {partnerEntriesResult.error
                  ? t("contracts.partnerRelations.empty.degraded", locale)
                  : t("contracts.partnerRelations.empty.provisioned", locale)}
              </span>
            </div>
          ) : (
            <PartnerRelationsTable locale={locale} rows={partnerRelationRows} />
          )}
        </Card>
      </div>
    </>
  );
}
