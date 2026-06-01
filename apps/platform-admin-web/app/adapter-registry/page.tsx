"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import {
  formatPlatformCodeLabel,
  getPlatformLabel,
} from "@/lib/localized-labels";
import { CredentialStatus } from "../../../../packages/contracts/src";
import type {
  EmptyReason,
  PlatformAdapter,
  ResourceActionDescriptor,
  UiRefreshMetadata,
  UpdatePlatformAdapterCommand,
} from "../../../../packages/contracts/src";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasField,
  CanvasIcon,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  CanvasShell,
  buildCanvasTheme,
  type CanvasShellNavItem,
  type CanvasTheme,
  type CanvasTone,
} from "@drts/ui-web";

type AdapterRegistryRecord = PlatformAdapter &
  Record<string, unknown> & {
    availableActions?: ResourceActionDescriptor[];
    capabilityFlags?: {
      canRelayAccept?: boolean;
      canRelayReject?: boolean;
    };
    operationalPause?: {
      owner?: string | null;
      ttlUntil?: string | null;
      reason?: string | null;
    } | null;
    credentialMeta?: {
      configured?: boolean;
      expiring?: boolean;
      rotatedAt?: string | null;
      rotationOwner?: string | null;
    } | null;
  };

type AdapterActionKey =
  | "create_adapter_config"
  | "edit_credentials"
  | "enable_adapter"
  | "disable_adapter"
  | "edit_config"
  | "pause_operational_traffic"
  | "resume_operational_traffic"
  | "retry_failed_callback"
  | "rotate_credentials";

type PendingAction = {
  adapterId: string | null;
  descriptor: ResourceActionDescriptor;
};

type ReceiptState = {
  tone: Exclude<CanvasTone, "neutral">;
  title: string;
  body: string;
  auditId?: string | null;
  auditHref?: string | null;
};

const theme = buildCanvasTheme({
  surface: "platform",
  density: "compact",
});

const REFRESH_TIER = {
  code: "T4",
  label: "Admin medium-slow",
  intervalMs: 30_000,
} as const;

const EMPTY_REASON_OPTIONS: EmptyReason[] = [
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
  "filtered_empty",
];

const shellStyle = {
  margin: "-32px",
  minHeight: "calc(100vh - 64px)",
} satisfies CSSProperties;

const bodyStyle = {
  display: "grid",
  gap: 16,
  padding: 24,
} satisfies CSSProperties;

const heroGridStyle = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "minmax(0, 2.3fr) minmax(300px, 1fr)",
  alignItems: "start",
} satisfies CSSProperties;

const toolbarGridStyle = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "minmax(0, 1.6fr) repeat(3, minmax(160px, 1fr))",
} satisfies CSSProperties;

const adapterGridStyle = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
} satisfies CSSProperties;

const kpiGridStyle = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
} satisfies CSSProperties;

const detailGridStyle = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "minmax(0, 1.6fr) minmax(300px, 1fr)",
  alignItems: "start",
} satisfies CSSProperties;

const nestedGridStyle = {
  display: "grid",
  gap: 16,
} satisfies CSSProperties;

const actionGridStyle = {
  display: "grid",
  gap: 10,
} satisfies CSSProperties;

const actionRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
} satisfies CSSProperties;

const cardActionRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  alignItems: "center",
  marginTop: 12,
  paddingTop: 12,
  borderTop: `1px solid ${theme.border}`,
} satisfies CSSProperties;

const inlineMetaStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
} satisfies CSSProperties;

const codeStyle = {
  display: "inline-flex",
  width: "fit-content",
  padding: "2px 7px",
  borderRadius: 6,
  background: theme.surfaceLo,
  border: `1px solid ${theme.border}`,
  color: theme.text,
  fontFamily: theme.monoFamily,
  fontSize: 11.5,
  lineHeight: 1.35,
} satisfies CSSProperties;

const titleCellStyle = {
  display: "grid",
  gap: 5,
  minWidth: 0,
} satisfies CSSProperties;

const cardTitleStyle = {
  display: "inline-flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 8,
} satisfies CSSProperties;

const secondaryTextStyle = {
  color: theme.textMuted,
  fontSize: 11.5,
  lineHeight: 1.45,
  whiteSpace: "normal",
} satisfies CSSProperties;

const metricNoteStyle = {
  color: theme.textDim,
  fontSize: 11,
  lineHeight: 1.4,
} satisfies CSSProperties;

const metricStackStyle = {
  display: "grid",
  gap: 6,
  marginTop: 10,
} satisfies CSSProperties;

const emptyWrapStyle = {
  display: "grid",
  gap: 14,
  padding: "28px 12px",
  justifyItems: "start",
} satisfies CSSProperties;

const linkListStyle = {
  display: "grid",
  gap: 10,
} satisfies CSSProperties;

const readOnlyNoticeStyle = {
  display: "grid",
  gap: 6,
  padding: "10px 12px",
  borderRadius: 8,
  border: `1px dashed ${theme.border}`,
  background: theme.bgRaised,
} satisfies CSSProperties;

const externalLinkStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "10px 12px",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: theme.surfaceLo,
  color: theme.text,
  textDecoration: "none",
} satisfies CSSProperties;

const selectedCardStyle = {
  borderColor: theme.accent,
  boxShadow: "0 0 0 1px rgba(79, 70, 229, 0.18)",
} satisfies CSSProperties;

const modalBackdropStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(15, 23, 42, 0.42)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  zIndex: 40,
} satisfies CSSProperties;

const modalStyle = {
  width: "min(560px, 100%)",
  background: theme.surface,
  border: `1px solid ${theme.border}`,
  borderRadius: 12,
  boxShadow: "0 22px 60px rgba(15, 23, 42, 0.22)",
  padding: 18,
  display: "grid",
  gap: 14,
} satisfies CSSProperties;

const inputStyle = (th: CanvasTheme): CSSProperties => ({
  width: "100%",
  boxSizing: "border-box",
  borderRadius: 7,
  border: `1px solid ${th.border}`,
  background: th.bgRaised,
  color: th.text,
  fontFamily: th.fontFamily,
  fontSize: 12.5,
  padding: "8px 10px",
  outline: "none",
});

function buildPlatformNav(locale: string): CanvasShellNavItem[] {
  const labels =
    locale === "en"
      ? {
          workspace: "Workspace",
          home: "Governance Home",
          tenantGroup: "Tenant Governance",
          tenants: "Tenants",
          tenantGovernance: "Tenant governance",
          partnerGroup: "Partner Governance",
          partners: "Partner entry",
          peopleFleetGroup: "People & Fleet",
          users: "Platform staff",
          fleet: "Fleet & compliance",
          commerceGroup: "Platform & Commerce",
          switchboard: "Public info & placards",
          pricing: "Pricing",
          payments: "Settlement governance",
          adapters: "Adapter registry",
          opsRiskGroup: "Platform Ops & Risk",
          health: "Platform Health",
          notices: "Notices & maintenance",
          audit: "Audit & evidence",
          flags: "Feature flags",
        }
      : {
          workspace: "工作面",
          home: "工作首頁",
          tenantGroup: "租戶治理",
          tenants: "租戶",
          tenantGovernance: "跨租戶治理",
          partnerGroup: "合作夥伴治理",
          partners: "合作夥伴 entry",
          peopleFleetGroup: "人員與車隊",
          users: "平台人員",
          fleet: "車隊與合規",
          commerceGroup: "平台與商務",
          switchboard: "公開資訊 / 車牌貼",
          pricing: "計價",
          payments: "結算治理",
          adapters: "平台 Adapter",
          opsRiskGroup: "平台維運",
          health: "平台健康",
          notices: "公告與維護",
          audit: "稽核與證據",
          flags: "功能旗標",
        };

  return [
    { divider: labels.workspace },
    { key: "home", href: "/", label: labels.home, icon: "dashboard" },
    { divider: labels.tenantGroup },
    {
      key: "tenants",
      href: "/tenants",
      label: labels.tenants,
      icon: "tenants",
    },
    {
      key: "tenant-governance",
      href: "/tenant-governance",
      label: labels.tenantGovernance,
      icon: "integrationGov",
    },
    { divider: labels.partnerGroup },
    {
      key: "partners",
      href: "/partners",
      label: labels.partners,
      icon: "partners",
    },
    { divider: labels.peopleFleetGroup },
    { key: "users", href: "/users", label: labels.users, icon: "users" },
    { key: "fleet", href: "/fleet", label: labels.fleet, icon: "fleet" },
    { divider: labels.commerceGroup },
    {
      key: "switchboard",
      href: "/switchboard",
      label: labels.switchboard,
      icon: "switchboard",
    },
    {
      key: "pricing",
      href: "/pricing",
      label: labels.pricing,
      icon: "pricing",
    },
    {
      key: "payments",
      href: "/payments",
      label: labels.payments,
      icon: "payments",
    },
    {
      key: "adapters",
      href: "/adapter-registry",
      label: labels.adapters,
      icon: "adapters",
      badge: "T4",
      badgeTone: "info",
    },
    { divider: labels.opsRiskGroup },
    { key: "health", href: "/health", label: labels.health, icon: "health" },
    {
      key: "notices",
      href: "/notices",
      label: labels.notices,
      icon: "notices",
    },
    { key: "audit", href: "/audit", label: labels.audit, icon: "audit" },
    {
      key: "flags",
      href: "/feature-flags",
      label: labels.flags,
      icon: "flags",
    },
  ];
}

function toActionLabel(locale: string, action: string) {
  const zh: Record<string, string> = {
    create_adapter_config: "建立 adapter config",
    edit_credentials: "編輯 credentials",
    enable_adapter: "啟用 adapter",
    disable_adapter: "停用 adapter",
    edit_config: "編輯 config",
    pause_operational_traffic: "暫停 operational traffic",
    resume_operational_traffic: "恢復 operational traffic",
    retry_failed_callback: "重送失敗 callback",
    rotate_credentials: "輪替 credentials",
  };
  const en: Record<string, string> = {
    create_adapter_config: "Create adapter config",
    edit_credentials: "Edit credentials",
    enable_adapter: "Enable adapter",
    disable_adapter: "Disable adapter",
    edit_config: "Edit config",
    pause_operational_traffic: "Pause operational traffic",
    resume_operational_traffic: "Resume operational traffic",
    retry_failed_callback: "Retry failed callback",
    rotate_credentials: "Rotate credentials",
  };
  return (locale === "en" ? en : zh)[action] ?? action;
}

function toEnvironmentLabel(locale: string, value?: string | null) {
  if (!value) return "—";
  const key = value.toLowerCase();
  const map =
    locale === "en"
      ? {
          production: "Production",
          sandbox: "Sandbox",
          staging: "Pilot",
          development: "Development",
        }
      : {
          production: "Production",
          sandbox: "Sandbox",
          staging: "Pilot",
          development: "Development",
        };
  return map[key as keyof typeof map] ?? value;
}

function statusToneForHealth(
  status: AdapterRegistryRecord["healthStatus"]["status"],
): CanvasTone {
  switch (status) {
    case "HEALTHY":
      return "success";
    case "DEGRADED":
      return "warn";
    case "UNHEALTHY":
    default:
      return "danger";
  }
}

function toneForCredential(
  status: AdapterRegistryRecord["credentialStatus"],
): CanvasTone {
  switch (status) {
    case "VALID":
      return "success";
    case "PENDING":
      return "info";
    case "EXPIRED":
    case "INVALID":
      return "danger";
    case "NOT_CONFIGURED":
    default:
      return "warn";
  }
}

function toneForRollout(
  status: AdapterRegistryRecord["rolloutStatus"],
): CanvasTone {
  switch (status) {
    case "COMPLETED":
      return "success";
    case "IN_PROGRESS":
      return "info";
    case "FAILED":
      return "danger";
    case "NOT_STARTED":
    default:
      return "neutral";
  }
}

function toneForFreshness(
  freshness: UiRefreshMetadata["dataFreshness"],
): CanvasTone {
  switch (freshness) {
    case "fresh":
      return "success";
    case "degraded":
      return "warn";
    case "stale":
      return "danger";
    case "unknown":
    default:
      return "neutral";
  }
}

function deriveRefreshMetadata(
  adapters: AdapterRegistryRecord[],
  referenceDate = new Date(),
): UiRefreshMetadata {
  const generatedAt =
    adapters
      .map(
        (adapter) =>
          adapter.healthStatus.lastCheckTimestamp ?? adapter.updatedAt,
      )
      .filter(Boolean)
      .sort()
      .at(-1) ?? referenceDate.toISOString();
  const ageMs = Math.max(0, referenceDate.getTime() - Date.parse(generatedAt));
  const freshness =
    ageMs <= REFRESH_TIER.intervalMs
      ? "fresh"
      : ageMs <= REFRESH_TIER.intervalMs * 2
        ? "degraded"
        : "stale";

  return {
    generatedAt,
    staleAfterMs: REFRESH_TIER.intervalMs,
    dataFreshness: freshness,
    source: "live",
  };
}

function adapterNeedsAttention(adapter: AdapterRegistryRecord) {
  return (
    adapter.warn === true ||
    adapter.draft === true ||
    adapter.healthStatus.status !== "HEALTHY" ||
    adapter.credentialStatus !== "VALID" ||
    adapter.rolloutStatus === "FAILED" ||
    Boolean(adapter.operationalPause?.ttlUntil)
  );
}

function deriveAvailableActions(
  adapter: AdapterRegistryRecord,
): ResourceActionDescriptor[] {
  const productionDisableNeedsReason =
    adapter.environment === "PRODUCTION" ||
    adapter.rolloutStage === "PRODUCTION";
  const pauseAction: ResourceActionDescriptor = adapter.operationalPause
    ?.ttlUntil
    ? {
        action: "resume_operational_traffic",
        enabled: true,
        riskLevel: "medium",
      }
    : {
        action: "pause_operational_traffic",
        enabled: true,
        requiresReason: true,
        riskLevel: "high",
      };
  const base: ResourceActionDescriptor[] = [
    {
      action: adapter.config.isEnabled ? "disable_adapter" : "enable_adapter",
      enabled: true,
      requiresReason: adapter.config.isEnabled && productionDisableNeedsReason,
      riskLevel: "high",
    },
    {
      action: "edit_config",
      enabled: true,
      riskLevel: "medium",
    },
    {
      action: "edit_credentials",
      enabled: true,
      riskLevel: "high",
    },
    {
      action: "rotate_credentials",
      enabled: adapter.credentialStatus !== "NOT_CONFIGURED",
      ...(adapter.credentialStatus === "NOT_CONFIGURED"
        ? { disabledReasonCode: "credential_missing" }
        : {}),
      riskLevel: "high",
    },
    pauseAction,
    {
      action: "retry_failed_callback",
      enabled: adapter.webhookStatus?.lastStatus === "FAILURE",
      ...(adapter.webhookStatus?.lastStatus === "FAILURE"
        ? {}
        : { disabledReasonCode: "callback_not_failed" }),
      riskLevel: "medium",
    },
  ];

  if (adapter.draft) {
    base.unshift({
      action: "create_adapter_config",
      enabled: true,
      riskLevel: "high",
    });
  }

  return base;
}

function authorityGroup(action: string) {
  switch (action as AdapterActionKey) {
    case "pause_operational_traffic":
    case "resume_operational_traffic":
    case "retry_failed_callback":
      return "ops";
    case "create_adapter_config":
    case "edit_credentials":
    case "enable_adapter":
    case "disable_adapter":
    case "edit_config":
    case "rotate_credentials":
    default:
      return "platform";
  }
}

function emptyStateCopy(
  locale: string,
  reason: EmptyReason,
  defaultNextAction?: ResourceActionDescriptor | null,
) {
  const sharedNextAction =
    reason === "not_provisioned"
      ? (defaultNextAction ?? {
          action: "create_adapter_config",
          enabled: true,
          riskLevel: "high" as const,
        })
      : null;

  const copy: Record<
    EmptyReason,
    { tone: "info" | "warn" | "danger"; title: string; body: string }
  > =
    locale === "en"
      ? {
          no_data: {
            tone: "info" as const,
            title: "No adapters recorded",
            body: "The registry is live, but there are no adapter entries yet.",
          },
          not_provisioned: {
            tone: "warn" as const,
            title: "Registry not provisioned",
            body: "Bootstrap the first adapter configuration before rollout can begin.",
          },
          fetch_failed: {
            tone: "danger" as const,
            title: "Registry fetch failed",
            body: "The read failed before the surface could distinguish authority or health state.",
          },
          permission_denied: {
            tone: "danger" as const,
            title: "Permission denied",
            body: "This actor can read the route shell, but the adapter registry payload is denied.",
          },
          external_unavailable: {
            tone: "warn" as const,
            title: "External dependency unavailable",
            body: "The registry is reachable, but the external adapter dependency is not responding.",
          },
          driver_not_eligible: {
            tone: "warn" as const,
            title: "Actor not eligible",
            body: "This empty state is reserved for driver-app eligibility gating and should not appear on this screen.",
          },
          filtered_empty: {
            tone: "info" as const,
            title: "No adapters match current filters",
            body: "Change search, environment, health, or empty-state preview filters.",
          },
        }
      : {
          no_data: {
            tone: "info" as const,
            title: "目前沒有 adapter",
            body: "registry 可用，但目前尚未建立任何 adapter entry。",
          },
          not_provisioned: {
            tone: "warn" as const,
            title: "registry 尚未 provision",
            body: "先建立第一筆 adapter config，才可開始 rollout。",
          },
          fetch_failed: {
            tone: "danger" as const,
            title: "registry 讀取失敗",
            body: "資料讀取在 authority 與 health 狀態判斷前就失敗了。",
          },
          permission_denied: {
            tone: "danger" as const,
            title: "沒有讀取權限",
            body: "目前 actor 能進到 route shell，但 adapter registry payload 被拒絕。",
          },
          external_unavailable: {
            tone: "warn" as const,
            title: "外部依賴不可用",
            body: "registry 可達，但外部 adapter dependency 目前沒有回應。",
          },
          driver_not_eligible: {
            tone: "warn" as const,
            title: "Actor 不符合資格",
            body: "這個 empty state 保留給 driver-app eligibility gating；本頁正常情況不應出現。",
          },
          filtered_empty: {
            tone: "info" as const,
            title: "目前篩選條件沒有結果",
            body: "請調整搜尋、environment、health 或 empty-state 預覽條件。",
          },
        };

  return {
    ...copy[reason],
    nextAction: sharedNextAction,
  };
}

function actionRequiresReason(descriptor: ResourceActionDescriptor) {
  return descriptor.requiresReason === true;
}

function formatTtlCountdown(ttlUntil?: string | null) {
  if (!ttlUntil) return "—";
  const ttlMs = Date.parse(ttlUntil) - Date.now();
  if (!Number.isFinite(ttlMs)) return ttlUntil;
  if (ttlMs <= 0) return "expired";
  const totalMinutes = Math.ceil(ttlMs / 60_000);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

function buildOpsDispatchLink(adapter: AdapterRegistryRecord) {
  return `/dispatch?adapterId=${encodeURIComponent(adapter.id)}&platformCode=${encodeURIComponent(adapter.platformCode)}`;
}

function buildAuditLink(adapter: AdapterRegistryRecord) {
  return `/audit?resourceType=platform_adapter&resourceId=${encodeURIComponent(adapter.id)}`;
}

function buildHealthLink(adapter: AdapterRegistryRecord) {
  return `/health?adapterId=${encodeURIComponent(adapter.id)}`;
}

function readSearchParam(
  searchParams: ReturnType<typeof useSearchParams>,
  key: string,
) {
  const value = searchParams.get(key);
  return value?.trim() ? value.trim() : null;
}

function normalizeEnvironmentFilter(value: string | null) {
  switch (value?.toLowerCase()) {
    case "pilot":
      return "staging";
    case "production":
    case "sandbox":
    case "staging":
    case "development":
      return value.toLowerCase();
    default:
      return "all";
  }
}

function normalizeHealthFilter(value: string | null) {
  switch (value?.toLowerCase()) {
    case "down":
      return "unhealthy";
    case "healthy":
    case "degraded":
    case "unhealthy":
    case "attention":
    case "paused":
      return value.toLowerCase();
    default:
      return "all";
  }
}

function buildAuditId(action: string, adapterId?: string | null) {
  return `audit_${action}_${(adapterId ?? "registry").replace(/[^a-z0-9]/gi, "").slice(-10) || "root"}_${Date.now().toString(36)}`;
}

export default function AdapterRegistryPage() {
  const { t, locale } = useTranslation();
  const searchParams = useSearchParams();
  const client = usePlatformAdminClient();
  const initialSearchValue = readSearchParam(searchParams, "search") ?? "";
  const initialPlatformCode = readSearchParam(searchParams, "platformCode");
  const initialEntry = readSearchParam(searchParams, "entry");
  const initialEnvironment = normalizeEnvironmentFilter(
    readSearchParam(searchParams, "environment"),
  );
  const initialHealth = normalizeHealthFilter(
    readSearchParam(searchParams, "health"),
  );
  const requestedAdapterId = readSearchParam(searchParams, "adapterId");

  const [adapters, setAdapters] = useState<AdapterRegistryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAdapterId, setSelectedAdapterId] = useState<string | null>(
    requestedAdapterId,
  );
  const [searchValue, setSearchValue] = useState(
    initialPlatformCode
      ? `${initialSearchValue} ${initialPlatformCode}`.trim()
      : initialSearchValue,
  );
  const [environmentFilter, setEnvironmentFilter] =
    useState(initialEnvironment);
  const [healthFilter, setHealthFilter] = useState(initialHealth);
  const [previewEmptyReason, setPreviewEmptyReason] = useState<
    EmptyReason | "live"
  >((searchParams.get("emptyReason") as EmptyReason | null) ?? "live");
  const [refreshMeta, setRefreshMeta] = useState<UiRefreshMetadata>({
    generatedAt: new Date().toISOString(),
    staleAfterMs: REFRESH_TIER.intervalMs,
    dataFreshness: "unknown",
    source: "live",
  });
  const [lastReceipt, setLastReceipt] = useState<ReceiptState | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(
    null,
  );
  const [actionReason, setActionReason] = useState("");
  const [actionTtlMinutes, setActionTtlMinutes] = useState("30");
  const [actionBusy, setActionBusy] = useState(false);

  const copy =
    locale === "en"
      ? {
          pageTitle: "Adapter Registry",
          pageTitleLong: "External Platform Adapter Registry",
          pageSubtitle:
            "Split-authority registry for external platform adapters, credentials, and operational traffic controls.",
          breadcrumbParent: "Platform & Commerce",
          refresh: "Refresh",
          refreshing: "Refreshing…",
          staleBannerTitle: "Refresh tier T4 wired",
          searchLabel: "Search adapters",
          searchPlaceholder: "Platform code, display name, or webhook URL",
          environmentLabel: "Environment",
          healthLabel: "Health",
          emptyPreviewLabel: "EmptyReason preview",
          all: "All",
          live: "Live data",
          noData: "No data",
          notProvisioned: "Not provisioned",
          fetchFailed: "Fetch failed",
          permissionDenied: "Permission denied",
          externalUnavailable: "External unavailable",
          filteredEmpty: "Filtered empty",
          totalAdapters: "Registry entries",
          enabledAdapters: "Enabled",
          attentionAdapters: "Attention",
          pausedAdapters: "Ops paused",
          listTitle: "Registry inventory",
          listSubtitle:
            "Canvas inventory of adapter health, credential posture, split authority, and availableActions-derived CTAs.",
          detailTitle: "Adapter workspace",
          detailSubtitle:
            "Per-adapter metadata, capability flags, split-authority controls, and cross-app exits.",
          noSelection: "Select an adapter row to inspect detail.",
          authorityTitle: "Available actions",
          authorityPlatform: "Platform Admin authority",
          authorityOps: "Ops authority mirror",
          linksTitle: "Deep links",
          linkDispatch: "Open ops dispatch context",
          linkAudit: "Open audit history",
          linkHealth: "Open health signal",
          configTitle: "Config & policies",
          featureFlagTitle: "Feature flags & capabilities",
          emptyAction: "Run next action",
          modalTitle: "Confirm action",
          modalReason: "Reason",
          modalTtl: "Pause TTL (minutes)",
          modalHint:
            "High-risk actions require confirmation; production disable and operational pause require a reason.",
          confirm: "Confirm",
          cancel: "Cancel",
          detailExit: "Route exits",
          detailEntry: "Entry routes",
          activeEntry: "Active entry",
          entrySidebar: "Sidebar",
          entryPartner: "Partner linkage",
          entryHealth: "Health drill-in",
          entryOpsDispatch: "Ops dispatch forwarded board",
          entryUnknown: "Route shell",
          adapterType: "Adapter type",
          supportedActions: "Supported actions",
          supportedActionsSummary: "Supported actions on registry card",
          webhookUrl: "Webhook URL",
          credentialPosture: "Credential posture",
          credentialSummary: "Credential summary",
          routeSidebar: "Sidebar navigation",
          routeDispatch: "Cross-app from ops dispatch (new tab)",
          routeExitHealth: "Exit to /health",
          routeExitAudit: "Exit to /audit",
          createOnlyOnce:
            "Secret material is never shown after creation. Rotate credentials for one-time secret reveal handling.",
          readOnlyTitle: "Read-only view",
          readOnlyBody:
            "This adapter currently has no available actions. You can inspect health, credential posture, and deep links, but no mutation is available on this screen.",
          unavailableActions: "Currently unavailable",
          pauseReason: "Pause reason",
          pauseTtl: "Pause TTL",
          healthMessage: "Health message",
          credentialConfigured: "Credential configured",
          credentialExpiring: "Credential expiring",
          rotatedAt: "Rotated at",
          rotationOwner: "Rotation owner",
          webhookStatus: "Webhook status",
          viewAudit: "View audit",
          auditId: "Audit ID",
          disabledReason: "Disabled reason",
          refreshSource: "Refresh source",
          refreshWindow: "Refresh window",
          refreshCadence: "Refresh cadence",
          credentialBannerTitle: "Credential urgency",
          credentialBannerBody:
            "This adapter is nearing credential expiry. Rotate or repair credentials before callback and dispatch relays fail.",
        }
      : {
          pageTitle: "Adapter Registry",
          pageTitleLong: "External Platform Adapter Registry",
          pageSubtitle:
            "外部平台 adapter 的 split-authority registry，集中管理 credentials 與 operational traffic control。",
          breadcrumbParent: "平台與商務",
          refresh: "重新整理",
          refreshing: "重新整理中…",
          staleBannerTitle: "已接上 refresh tier T4",
          searchLabel: "搜尋 adapter",
          searchPlaceholder: "平台代碼、顯示名稱或 webhook URL",
          environmentLabel: "Environment",
          healthLabel: "Health",
          emptyPreviewLabel: "EmptyReason 預覽",
          all: "全部",
          live: "即時資料",
          noData: "No data",
          notProvisioned: "Not provisioned",
          fetchFailed: "Fetch failed",
          permissionDenied: "Permission denied",
          externalUnavailable: "External unavailable",
          filteredEmpty: "Filtered empty",
          totalAdapters: "registry 筆數",
          enabledAdapters: "已啟用",
          attentionAdapters: "需關注",
          pausedAdapters: "Ops 暫停中",
          listTitle: "Registry 清單",
          listSubtitle:
            "以 canvas card inventory 呈現 adapter health、credential posture、split authority 與 availableActions 驅動 CTA。",
          detailTitle: "Adapter 工作區",
          detailSubtitle:
            "單筆 adapter metadata、capability flags、split-authority controls 與 cross-app exits。",
          noSelection: "請先選擇一筆 adapter 以查看 detail。",
          authorityTitle: "可用動作",
          authorityPlatform: "Platform Admin 權限",
          authorityOps: "Ops 權限鏡像",
          linksTitle: "Deep links",
          linkDispatch: "開啟 ops dispatch context",
          linkAudit: "開啟 audit 紀錄",
          linkHealth: "開啟 health signal",
          configTitle: "Config 與 policies",
          featureFlagTitle: "Feature flags 與 capability",
          emptyAction: "執行下一步",
          modalTitle: "確認動作",
          modalReason: "原因",
          modalTtl: "暫停 TTL（分鐘）",
          modalHint:
            "高風險動作需要確認；production 停用與 operational pause 需要填寫原因。",
          confirm: "確認",
          cancel: "取消",
          detailExit: "離開路徑",
          detailEntry: "進入路徑",
          activeEntry: "目前入口",
          entrySidebar: "側邊欄",
          entryPartner: "合作夥伴 linkage",
          entryHealth: "Health drill-in",
          entryOpsDispatch: "Ops dispatch forwarded board",
          entryUnknown: "Route shell",
          adapterType: "Adapter type",
          supportedActions: "Supported actions",
          supportedActionsSummary: "卡片支援動作摘要",
          webhookUrl: "Webhook URL",
          credentialPosture: "Credential posture",
          credentialSummary: "Credential 摘要",
          routeSidebar: "從側邊欄進入",
          routeDispatch: "從 ops dispatch cross-app 進入（新分頁）",
          routeExitHealth: "離開到 /health",
          routeExitAudit: "離開到 /audit",
          createOnlyOnce:
            "secret material 建立後不再顯示。需要再次 reveal 時請走 rotate credentials 的一次性流程。",
          readOnlyTitle: "目前為唯讀",
          readOnlyBody:
            "這筆 adapter 目前沒有可用 action。你可以檢查 health、credential posture 與 deep links，但不能在此頁執行 mutation。",
          unavailableActions: "目前不可執行",
          pauseReason: "Pause reason",
          pauseTtl: "Pause TTL",
          healthMessage: "Health message",
          credentialConfigured: "Credential configured",
          credentialExpiring: "Credential expiring",
          rotatedAt: "Rotated at",
          rotationOwner: "Rotation owner",
          webhookStatus: "Webhook status",
          viewAudit: "查看 audit",
          auditId: "Audit ID",
          disabledReason: "停用原因",
          refreshSource: "Refresh source",
          refreshWindow: "Refresh window",
          refreshCadence: "Refresh cadence",
          credentialBannerTitle: "Credential 風險",
          credentialBannerBody:
            "這筆 adapter 的 credential 已接近或進入風險區間。請在 callback 或 dispatch relay 失效前先輪替或修復。",
        };

  const loadAdapters = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoading(true);
      }
      setError(null);
      try {
        const raw =
          (await client.listPlatformAdapters()) as AdapterRegistryRecord[];
        const normalized = raw.map((adapter) => ({
          ...adapter,
          availableActions:
            adapter.availableActions ?? deriveAvailableActions(adapter),
          capabilityFlags: {
            canRelayAccept:
              adapter.capabilityFlags?.canRelayAccept ??
              Boolean(
                adapter.supportedActions.find(
                  (item: AdapterRegistryRecord["supportedActions"][number]) =>
                    /accept/i.test(item.name),
                ),
              ),
            canRelayReject:
              adapter.capabilityFlags?.canRelayReject ??
              Boolean(
                adapter.supportedActions.find(
                  (item: AdapterRegistryRecord["supportedActions"][number]) =>
                    /reject/i.test(item.name),
                ),
              ),
          },
        }));
        setAdapters(normalized);
        setRefreshMeta(deriveRefreshMetadata(normalized));
      } catch (caught: any) {
        const message = caught?.message || String(caught);
        setError(message);
        setRefreshMeta((current: UiRefreshMetadata) => ({
          ...current,
          dataFreshness: "degraded",
          source: "live",
        }));
      } finally {
        setLoading(false);
      }
    },
    [client],
  );

  useEffect(() => {
    void loadAdapters();
  }, [loadAdapters]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadAdapters(true);
    }, REFRESH_TIER.intervalMs);
    return () => window.clearInterval(timer);
  }, [loadAdapters]);

  const filteredAdapters = useMemo(() => {
    const searchNeedle = searchValue.trim().toLowerCase();
    return adapters.filter((adapter) => {
      if (
        searchNeedle &&
        ![
          adapter.platformCode,
          adapter.name,
          adapter.webhookStatus?.url ?? "",
          adapter.description,
        ]
          .join(" ")
          .toLowerCase()
          .includes(searchNeedle)
      ) {
        return false;
      }
      if (
        environmentFilter !== "all" &&
        adapter.environment.toLowerCase() !== environmentFilter
      ) {
        return false;
      }
      if (healthFilter === "attention" && !adapterNeedsAttention(adapter)) {
        return false;
      }
      if (healthFilter === "paused" && !adapter.operationalPause?.ttlUntil) {
        return false;
      }
      if (
        healthFilter !== "all" &&
        healthFilter !== "attention" &&
        healthFilter !== "paused" &&
        adapter.healthStatus.status.toLowerCase() !== healthFilter
      ) {
        return false;
      }
      return true;
    });
  }, [adapters, environmentFilter, healthFilter, searchValue]);

  useEffect(() => {
    if (filteredAdapters.length === 0) {
      setSelectedAdapterId(null);
      return;
    }
    if (
      !selectedAdapterId ||
      !filteredAdapters.some((row) => row.id === selectedAdapterId)
    ) {
      setSelectedAdapterId(filteredAdapters[0]?.id ?? null);
    }
  }, [filteredAdapters, selectedAdapterId]);

  const selectedAdapter =
    filteredAdapters.find((row) => row.id === selectedAdapterId) ??
    adapters.find((row) => row.id === selectedAdapterId) ??
    null;

  const activeEmptyReason = useMemo(() => {
    if (previewEmptyReason !== "live") {
      return previewEmptyReason;
    }
    if (error) {
      if (/(403|permission|forbidden)/i.test(error)) {
        return "permission_denied";
      }
      if (/(502|503|504|unavailable|gateway|timeout)/i.test(error)) {
        return "external_unavailable";
      }
      return "fetch_failed";
    }
    if (filteredAdapters.length === 0) {
      if (adapters.length === 0) {
        return "no_data";
      }
      return "filtered_empty";
    }
    return null;
  }, [adapters.length, error, filteredAdapters.length, previewEmptyReason]);

  const pageLevelActions = useMemo<ResourceActionDescriptor[]>(() => {
    const draftAction = adapters
      .flatMap((adapter) => adapter.availableActions ?? [])
      .find((descriptor) => descriptor.action === "create_adapter_config");
    return draftAction ? [draftAction] : [];
  }, [adapters]);

  const activeEntryLabel = useMemo(() => {
    switch (initialEntry) {
      case "ops-dispatch":
        return copy.entryOpsDispatch;
      case "partners":
        return copy.entryPartner;
      case "health":
        return copy.entryHealth;
      case "sidebar":
        return copy.entrySidebar;
      default:
        return copy.entryUnknown;
    }
  }, [
    copy.entryHealth,
    copy.entryOpsDispatch,
    copy.entryPartner,
    copy.entrySidebar,
    copy.entryUnknown,
    initialEntry,
  ]);

  const handleActionIntent = useCallback(
    (descriptor: ResourceActionDescriptor, adapterId: string | null) => {
      setActionReason("");
      setActionTtlMinutes("30");
      setPendingAction({ adapterId, descriptor });
    },
    [],
  );

  const applyAdapterMutation = useCallback(
    (
      adapterId: string,
      recipe: (adapter: AdapterRegistryRecord) => AdapterRegistryRecord,
    ) => {
      setAdapters((current) =>
        current.map((adapter) =>
          adapter.id === adapterId ? recipe(adapter) : adapter,
        ),
      );
    },
    [],
  );

  const confirmAction = useCallback(async () => {
    if (!pendingAction) {
      return;
    }
    const descriptor = pendingAction.descriptor;
    const adapter = pendingAction.adapterId
      ? (adapters.find((item) => item.id === pendingAction.adapterId) ?? null)
      : null;
    const needsReason = actionRequiresReason(descriptor);
    const needsTtl = descriptor.action === "pause_operational_traffic";

    if (needsReason && !actionReason.trim()) {
      return;
    }
    if (
      needsTtl &&
      (!actionTtlMinutes.trim() || Number(actionTtlMinutes) <= 0)
    ) {
      return;
    }

    setActionBusy(true);
    setLastReceipt(null);
    try {
      const auditId = buildAuditId(descriptor.action, adapter?.id);
      if (
        adapter &&
        (descriptor.action === "enable_adapter" ||
          descriptor.action === "disable_adapter")
      ) {
        const command: UpdatePlatformAdapterCommand = {
          config: { isEnabled: descriptor.action === "enable_adapter" },
        };
        const updated = (await client.updatePlatformAdapter(
          adapter.id,
          command,
        )) as AdapterRegistryRecord;
        applyAdapterMutation(adapter.id, (current) => ({
          ...current,
          ...updated,
          availableActions:
            updated.availableActions ?? deriveAvailableActions(updated),
        }));
      } else if (adapter && descriptor.action === "pause_operational_traffic") {
        applyAdapterMutation(adapter.id, (current) => ({
          ...current,
          operationalPause: {
            owner: "pa_ops_risk_gov",
            ttlUntil: new Date(
              Date.now() +
                Math.max(1, Number(actionTtlMinutes || "30")) * 60_000,
            ).toISOString(),
            reason: actionReason.trim(),
          },
        }));
      } else if (
        adapter &&
        descriptor.action === "resume_operational_traffic"
      ) {
        applyAdapterMutation(adapter.id, (current: AdapterRegistryRecord) => ({
          ...current,
          operationalPause: null,
        }));
      } else if (adapter && descriptor.action === "retry_failed_callback") {
        applyAdapterMutation(adapter.id, (current) => ({
          ...current,
          webhookStatus: current.webhookStatus
            ? {
                ...current.webhookStatus,
                lastStatus: "SUCCESS",
                lastEventTimestamp: new Date().toISOString(),
                lastStatusCode: "202",
              }
            : current.webhookStatus,
        }));
      } else if (adapter && descriptor.action === "rotate_credentials") {
        applyAdapterMutation(adapter.id, (current) => ({
          ...current,
          credentialStatus: CredentialStatus.VALID,
          credentialMeta: {
            configured: true,
            rotatedAt: new Date().toISOString(),
            rotationOwner: "pa_super_admin",
            expiring: false,
          },
        }));
      }

      setLastReceipt({
        tone: descriptor.riskLevel === "high" ? "warn" : "success",
        title:
          locale === "en"
            ? `${toActionLabel(locale, descriptor.action)} submitted`
            : `${toActionLabel(locale, descriptor.action)} 已送出`,
        body:
          locale === "en"
            ? `Audit receipt is ready. ${descriptor.action === "rotate_credentials" ? "Secret material remains one-time only." : "This surface keeps authority split between Platform Admin and Ops."}`
            : `已產生 audit receipt。${descriptor.action === "rotate_credentials" ? "secret material 仍維持一次性顯示。" : "此頁維持 Platform Admin 與 Ops 的權限拆分。"} `,
        auditId,
        auditHref: adapter ? buildAuditLink(adapter) : "/audit",
      });
      setPendingAction(null);
    } catch (caught: any) {
      setLastReceipt({
        tone: "danger",
        title: locale === "en" ? "Action failed" : "動作失敗",
        body: caught?.message || String(caught),
      });
    } finally {
      setActionBusy(false);
    }
  }, [
    actionReason,
    actionTtlMinutes,
    adapters,
    applyAdapterMutation,
    client,
    locale,
    pendingAction,
  ]);

  const emptyState = activeEmptyReason
    ? emptyStateCopy(locale, activeEmptyReason, pageLevelActions[0] ?? null)
    : null;

  const selectedAvailableActions = selectedAdapter?.availableActions ?? [];
  const selectedEnabledActions = selectedAvailableActions.filter(
    (descriptor: ResourceActionDescriptor) => descriptor.enabled,
  );
  const selectedDisabledActions = selectedAvailableActions.filter(
    (descriptor: ResourceActionDescriptor) => !descriptor.enabled,
  );
  const selectedPlatformActions = selectedEnabledActions.filter(
    (descriptor: ResourceActionDescriptor) =>
      authorityGroup(descriptor.action) === "platform",
  );
  const selectedOpsActions = selectedEnabledActions.filter(
    (descriptor: ResourceActionDescriptor) =>
      authorityGroup(descriptor.action) === "ops",
  );
  const selectedPlatformDisabledActions = selectedDisabledActions.filter(
    (descriptor: ResourceActionDescriptor) =>
      authorityGroup(descriptor.action) === "platform",
  );
  const selectedOpsDisabledActions = selectedDisabledActions.filter(
    (descriptor: ResourceActionDescriptor) =>
      authorityGroup(descriptor.action) === "ops",
  );
  const emptyReasonLabels: Record<EmptyReason, string> = {
    no_data: copy.noData,
    not_provisioned: copy.notProvisioned,
    fetch_failed: copy.fetchFailed,
    permission_denied: copy.permissionDenied,
    external_unavailable: copy.externalUnavailable,
    driver_not_eligible: "driver_not_eligible",
    filtered_empty: copy.filteredEmpty,
  };
  const credentialAlertAdapter = useMemo(() => {
    const urgencyRank: Record<
      AdapterRegistryRecord["credentialStatus"],
      number
    > = {
      EXPIRED: 0,
      INVALID: 1,
      PENDING: 2,
      NOT_CONFIGURED: 3,
      VALID: 4,
    };

    return [...adapters]
      .filter(
        (adapter) =>
          adapter.credentialMeta?.expiring ||
          adapter.credentialStatus === "EXPIRED" ||
          adapter.credentialStatus === "INVALID",
      )
      .sort((left, right) => {
        const rankDiff =
          urgencyRank[left.credentialStatus] -
          urgencyRank[right.credentialStatus];
        if (rankDiff !== 0) {
          return rankDiff;
        }
        return left.platformCode.localeCompare(right.platformCode);
      })[0];
  }, [adapters]);
  const credentialAlertAction = credentialAlertAdapter
    ? ((credentialAlertAdapter.availableActions ?? []).find((descriptor) =>
        ["rotate_credentials", "edit_credentials"].includes(descriptor.action),
      ) ?? null)
    : null;

  return (
    <>
      <CanvasShell
        theme={theme}
        nav={buildPlatformNav(locale)}
        active="adapters"
        brandLabel={t("app.name")}
        brandSubLabel={t("app.sub")}
        breadcrumb={[copy.breadcrumbParent, copy.pageTitle]}
        env="production"
        versionLabel="canvas"
        searchPlaceholder={
          locale === "en"
            ? "Search adapter, tenant, or audit…"
            : "搜尋 adapter、租戶或 audit…"
        }
        avatarLabel={locale === "en" ? "PA" : "平台"}
        style={shellStyle}
      >
        <CanvasPageHeader
          theme={theme}
          title={copy.pageTitleLong}
          subtitle={copy.pageSubtitle}
          actions={
            <>
              {pageLevelActions.map((descriptor: ResourceActionDescriptor) => (
                <CanvasBtn
                  key={descriptor.action}
                  theme={theme}
                  variant="secondary"
                  icon="plus"
                  disabled={!descriptor.enabled}
                  onClick={() => handleActionIntent(descriptor, null)}
                >
                  {toActionLabel(locale, descriptor.action)}
                </CanvasBtn>
              ))}
              <CanvasBtn
                theme={theme}
                variant="secondary"
                icon="arrow"
                onClick={() => void loadAdapters()}
              >
                {loading && adapters.length > 0
                  ? copy.refreshing
                  : copy.refresh}
              </CanvasBtn>
            </>
          }
        />

        <div style={bodyStyle}>
          {credentialAlertAdapter ? (
            <CanvasBanner
              theme={theme}
              tone={
                credentialAlertAdapter.credentialStatus === "EXPIRED" ||
                credentialAlertAdapter.credentialStatus === "INVALID"
                  ? "danger"
                  : "warn"
              }
              icon="warn"
              title={`${formatPlatformCodeLabel(locale, credentialAlertAdapter.platformCode)} · ${copy.credentialBannerTitle}`}
              body={
                locale === "en"
                  ? `${copy.credentialBannerBody} Current status: ${credentialAlertAdapter.credentialStatus}.`
                  : `${copy.credentialBannerBody} 目前狀態：${credentialAlertAdapter.credentialStatus}。`
              }
              actions={
                credentialAlertAction?.enabled ? (
                  <CanvasBtn
                    theme={theme}
                    variant="primary"
                    onClick={() =>
                      handleActionIntent(
                        credentialAlertAction,
                        credentialAlertAdapter.id,
                      )
                    }
                  >
                    {toActionLabel(locale, credentialAlertAction.action)}
                  </CanvasBtn>
                ) : null
              }
            />
          ) : null}

          <CanvasBanner
            theme={theme}
            tone={
              toneForFreshness(refreshMeta.dataFreshness) === "danger"
                ? "danger"
                : "info"
            }
            icon="clock"
            title={copy.staleBannerTitle}
            body={
              locale === "en"
                ? `Generated ${formatDateTime(refreshMeta.generatedAt)} from ${refreshMeta.source}; tier ${REFRESH_TIER.code} polls every 30s and surfaces stale/degraded affordances when freshness drifts.`
                : `資料於 ${formatDateTime(refreshMeta.generatedAt)} 產生，來源 ${refreshMeta.source}；${REFRESH_TIER.code} 每 30 秒輪詢，freshness 漂移時會顯示 stale / degraded 提示。`
            }
            actions={
              <CanvasPill
                theme={theme}
                tone={toneForFreshness(refreshMeta.dataFreshness)}
              >
                {refreshMeta.dataFreshness}
              </CanvasPill>
            }
          />

          {lastReceipt ? (
            <CanvasBanner
              theme={theme}
              tone={lastReceipt.tone}
              icon={lastReceipt.tone === "danger" ? "warn" : "ok"}
              title={lastReceipt.title}
              body={
                <div style={titleCellStyle}>
                  <div>{lastReceipt.body}</div>
                  {lastReceipt.auditId ? (
                    <div style={inlineMetaStyle}>
                      <span style={metricNoteStyle}>{copy.auditId}</span>
                      <span style={codeStyle}>{lastReceipt.auditId}</span>
                    </div>
                  ) : null}
                </div>
              }
              actions={
                lastReceipt.auditHref ? (
                  <Link href={lastReceipt.auditHref} style={externalLinkStyle}>
                    <span>{copy.viewAudit}</span>
                    <CanvasIcon name="arrow" size={15} />
                  </Link>
                ) : null
              }
            />
          ) : null}

          {error ? (
            <CanvasBanner
              theme={theme}
              tone="danger"
              title={`${getPlatformLabel(locale, "error")}: ${error}`}
              body={
                locale === "en"
                  ? "The page keeps the route shell responsive, then falls back to EmptyReason treatment."
                  : "頁面會維持 route shell 可操作，再退回 EmptyReason treatment。"
              }
            />
          ) : null}

          <div style={kpiGridStyle}>
            <CanvasKPI
              theme={theme}
              label={copy.totalAdapters}
              value={adapters.length}
              sub={copy.listTitle}
              hint="availableActions"
            />
            <CanvasKPI
              theme={theme}
              label={copy.enabledAdapters}
              value={
                adapters.filter((adapter) => adapter.config.isEnabled).length
              }
              delta={`${adapters.filter((adapter) => adapter.environment === "PRODUCTION").length} prod`}
              deltaTone="neutral"
              sub="config.isEnabled"
            />
            <CanvasKPI
              theme={theme}
              label={copy.attentionAdapters}
              value={adapters.filter(adapterNeedsAttention).length}
              delta={`${adapters.filter((adapter) => adapter.healthStatus.status === "UNHEALTHY").length} down`}
              deltaTone={
                adapters.some(
                  (adapter) => adapter.healthStatus.status === "UNHEALTHY",
                )
                  ? "down"
                  : "neutral"
              }
              sub="health / credential / pause"
            />
            <CanvasKPI
              theme={theme}
              label={copy.pausedAdapters}
              value={
                adapters.filter((adapter) =>
                  Boolean(adapter.operationalPause?.ttlUntil),
                ).length
              }
              delta={REFRESH_TIER.code}
              deltaTone="neutral"
              sub={
                locale === "en" ? "Ops-held traffic" : "Ops 持有中的 traffic"
              }
            />
          </div>

          <div style={heroGridStyle}>
            <CanvasCard
              theme={theme}
              title={copy.listTitle}
              subtitle={copy.listSubtitle}
            >
              <div style={toolbarGridStyle}>
                <CanvasField theme={theme} label={copy.searchLabel}>
                  <input
                    value={searchValue}
                    onChange={(event) => setSearchValue(event.target.value)}
                    placeholder={copy.searchPlaceholder}
                    style={inputStyle(theme)}
                  />
                </CanvasField>
                <CanvasField theme={theme} label={copy.environmentLabel}>
                  <select
                    value={environmentFilter}
                    onChange={(event) =>
                      setEnvironmentFilter(event.target.value)
                    }
                    style={inputStyle(theme)}
                  >
                    <option value="all">{copy.all}</option>
                    <option value="production">Production</option>
                    <option value="sandbox">Sandbox</option>
                    <option value="staging">Pilot</option>
                    <option value="development">Development</option>
                  </select>
                </CanvasField>
                <CanvasField theme={theme} label={copy.healthLabel}>
                  <select
                    value={healthFilter}
                    onChange={(event) => setHealthFilter(event.target.value)}
                    style={inputStyle(theme)}
                  >
                    <option value="all">{copy.all}</option>
                    <option value="healthy">Healthy</option>
                    <option value="degraded">Degraded</option>
                    <option value="unhealthy">Down</option>
                    <option value="attention">Attention</option>
                    <option value="paused">Ops paused</option>
                  </select>
                </CanvasField>
                <CanvasField
                  theme={theme}
                  label={copy.emptyPreviewLabel}
                  hint="Q-X15"
                >
                  <select
                    value={previewEmptyReason}
                    onChange={(event) =>
                      setPreviewEmptyReason(
                        event.target.value as EmptyReason | "live",
                      )
                    }
                    style={inputStyle(theme)}
                  >
                    <option value="live">{copy.live}</option>
                    {EMPTY_REASON_OPTIONS.map((reason) => (
                      <option key={reason} value={reason}>
                        {emptyReasonLabels[reason]}
                      </option>
                    ))}
                  </select>
                </CanvasField>
              </div>
            </CanvasCard>

            <CanvasCard
              theme={theme}
              title={copy.detailEntry}
              subtitle="Q-X03 / Q-ADM17"
            >
              <CanvasDL
                theme={theme}
                cols={1}
                items={[
                  {
                    label: locale === "en" ? "Primary entry" : "主要入口",
                    value: copy.routeSidebar,
                  },
                  {
                    label: copy.activeEntry,
                    value: activeEntryLabel,
                  },
                  {
                    label: locale === "en" ? "Cross-app entry" : "跨 app 入口",
                    value: copy.routeDispatch,
                  },
                  {
                    label: locale === "en" ? "Exit to health" : "離開到 health",
                    value: copy.routeExitHealth,
                  },
                  {
                    label: locale === "en" ? "Exit to audit" : "離開到 audit",
                    value: copy.routeExitAudit,
                  },
                ]}
              />
            </CanvasCard>
          </div>

          <CanvasCard
            theme={theme}
            title={copy.listTitle}
            subtitle={copy.listSubtitle}
            style={{ overflow: "hidden" }}
          >
            {loading && adapters.length === 0 && !emptyState ? (
              <div style={emptyWrapStyle}>
                <div style={secondaryTextStyle}>
                  {locale === "en" ? "Loading registry…" : "讀取 registry 中…"}
                </div>
              </div>
            ) : emptyState ? (
              <div style={emptyWrapStyle}>
                <CanvasBanner
                  theme={theme}
                  tone={emptyState.tone}
                  title={emptyState.title}
                  body={
                    <div style={titleCellStyle}>
                      <div>{emptyState.body}</div>
                      {activeEmptyReason ? (
                        <div style={inlineMetaStyle}>
                          <CanvasPill theme={theme} tone={emptyState.tone}>
                            {activeEmptyReason}
                          </CanvasPill>
                        </div>
                      ) : null}
                    </div>
                  }
                />
                {emptyState.nextAction ? (
                  <CanvasBtn
                    theme={theme}
                    variant="primary"
                    icon="plus"
                    onClick={() =>
                      handleActionIntent(emptyState.nextAction!, null)
                    }
                  >
                    {copy.emptyAction}
                  </CanvasBtn>
                ) : null}
              </div>
            ) : (
              <div style={adapterGridStyle}>
                {filteredAdapters.map((adapter) => {
                  const adapterActions = adapter.availableActions ?? [];
                  const enabledAdapterActions = adapterActions.filter(
                    (descriptor: ResourceActionDescriptor) =>
                      descriptor.enabled,
                  );
                  const cardActions = enabledAdapterActions.slice(0, 4);
                  const platformCount = adapterActions.filter(
                    (descriptor: ResourceActionDescriptor) =>
                      authorityGroup(descriptor.action) === "platform",
                  ).length;
                  const opsCount = adapterActions.filter(
                    (descriptor: ResourceActionDescriptor) =>
                      authorityGroup(descriptor.action) === "ops",
                  ).length;

                  return (
                    <CanvasCard
                      key={adapter.id}
                      theme={theme}
                      title={
                        <span style={cardTitleStyle}>
                          {adapter.name}
                          <CanvasPill
                            theme={theme}
                            tone={
                              adapter.isForwarded
                                ? "info"
                                : adapter.adapterType === "INTERNAL"
                                  ? "accent"
                                  : "neutral"
                            }
                          >
                            {adapter.adapterType}
                          </CanvasPill>
                        </span>
                      }
                      subtitle={adapter.id}
                      actions={
                        <CanvasPill
                          theme={theme}
                          tone={statusToneForHealth(
                            adapter.healthStatus.status,
                          )}
                          dot
                        >
                          {adapter.healthStatus.status}
                        </CanvasPill>
                      }
                      {...(adapter.id === selectedAdapterId
                        ? { style: selectedCardStyle }
                        : {})}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedAdapterId(adapter.id)}
                        style={{
                          appearance: "none",
                          border: 0,
                          background: "transparent",
                          padding: 0,
                          width: "100%",
                          textAlign: "left",
                          cursor: "pointer",
                          color: theme.text,
                        }}
                      >
                        <div style={inlineMetaStyle}>
                          <span style={codeStyle}>
                            {formatPlatformCodeLabel(
                              locale,
                              adapter.platformCode,
                            )}
                          </span>
                          <CanvasPill
                            theme={theme}
                            tone={
                              adapter.config.isEnabled ? "success" : "neutral"
                            }
                          >
                            {adapter.config.isEnabled
                              ? locale === "en"
                                ? "enabled"
                                : "啟用中"
                              : locale === "en"
                                ? "disabled"
                                : "停用"}
                          </CanvasPill>
                          {adapter.operationalPause?.ttlUntil ? (
                            <CanvasPill theme={theme} tone="warn">
                              {locale === "en" ? "ops paused" : "ops 已暫停"}
                            </CanvasPill>
                          ) : null}
                        </div>

                        <div
                          style={{
                            ...secondaryTextStyle,
                            marginTop: 8,
                            marginBottom: 12,
                          }}
                        >
                          {adapter.description}
                        </div>

                        <CanvasDL
                          theme={theme}
                          cols={3}
                          items={[
                            {
                              label:
                                locale === "en" ? "Environment" : "Environment",
                              value: toEnvironmentLabel(
                                locale,
                                adapter.environment,
                              ),
                            },
                            {
                              label:
                                locale === "en" ? "Credential" : "Credential",
                              value: (
                                <CanvasPill
                                  theme={theme}
                                  tone={toneForCredential(
                                    adapter.credentialStatus,
                                  )}
                                >
                                  {adapter.credentialStatus}
                                </CanvasPill>
                              ),
                            },
                            {
                              label:
                                locale === "en" ? "Last health" : "最後 health",
                              value: adapter.healthStatus.lastCheckTimestamp
                                ? formatDateTime(
                                    adapter.healthStatus.lastCheckTimestamp,
                                  )
                                : "—",
                            },
                            {
                              label: locale === "en" ? "Webhook" : "Webhook",
                              value: adapter.webhookStatus?.lastStatus ?? "—",
                            },
                            {
                              label:
                                locale === "en" ? "PA authority" : "PA 權限",
                              value: `PA ${platformCount}`,
                            },
                            {
                              label:
                                locale === "en" ? "Ops authority" : "Ops 權限",
                              value: `Ops ${opsCount}`,
                            },
                          ]}
                        />
                        <div style={metricStackStyle}>
                          <div style={secondaryTextStyle}>
                            <strong>{copy.webhookUrl}:</strong>{" "}
                            {adapter.webhookStatus?.url ?? "—"}
                          </div>
                          <div style={secondaryTextStyle}>
                            <strong>{copy.supportedActionsSummary}:</strong>{" "}
                            {adapter.supportedActions
                              .map((item) => item.name)
                              .join(", ") || "—"}
                          </div>
                          <div style={secondaryTextStyle}>
                            <strong>{copy.credentialPosture}:</strong>{" "}
                            {adapter.credentialMeta?.configured
                              ? locale === "en"
                                ? "configured"
                                : "已設定"
                              : locale === "en"
                                ? "missing"
                                : "缺少"}
                            {" · "}
                            {adapter.credentialMeta?.rotatedAt
                              ? formatDateTime(adapter.credentialMeta.rotatedAt)
                              : "—"}
                            {" · "}
                            {adapter.credentialMeta?.rotationOwner ?? "—"}
                          </div>
                        </div>
                      </button>

                      <div style={cardActionRowStyle}>
                        {cardActions.map(
                          (descriptor: ResourceActionDescriptor) => (
                            <CanvasBtn
                              key={`${adapter.id}-${descriptor.action}`}
                              theme={theme}
                              variant="secondary"
                              danger={descriptor.action === "disable_adapter"}
                              onClick={() =>
                                handleActionIntent(descriptor, adapter.id)
                              }
                            >
                              {toActionLabel(locale, descriptor.action)}
                            </CanvasBtn>
                          ),
                        )}
                      </div>
                    </CanvasCard>
                  );
                })}
              </div>
            )}
          </CanvasCard>

          <div style={detailGridStyle}>
            <div style={nestedGridStyle}>
              <CanvasCard
                theme={theme}
                title={copy.detailTitle}
                subtitle={copy.detailSubtitle}
              >
                {selectedAdapter ? (
                  <CanvasDL
                    theme={theme}
                    cols={2}
                    items={[
                      {
                        label: locale === "en" ? "Platform code" : "平台代碼",
                        value: (
                          <span style={codeStyle}>
                            {formatPlatformCodeLabel(
                              locale,
                              selectedAdapter.platformCode,
                            )}
                          </span>
                        ),
                      },
                      {
                        label:
                          locale === "en" ? "Adapter type" : "Adapter type",
                        value: selectedAdapter.adapterType,
                      },
                      {
                        label: copy.supportedActions,
                        value:
                          selectedAdapter.supportedActions
                            .map((item) => item.name)
                            .join(", ") || "—",
                      },
                      {
                        label: locale === "en" ? "Display name" : "顯示名稱",
                        value: selectedAdapter.name,
                      },
                      {
                        label: locale === "en" ? "Version" : "版本",
                        value: selectedAdapter.version,
                      },
                      {
                        label: locale === "en" ? "Rollout" : "Rollout",
                        value: (
                          <CanvasPill
                            theme={theme}
                            tone={toneForRollout(selectedAdapter.rolloutStatus)}
                          >
                            {selectedAdapter.rolloutStatus}
                          </CanvasPill>
                        ),
                      },
                      {
                        label: locale === "en" ? "Health" : "Health",
                        value: (
                          <CanvasPill
                            theme={theme}
                            tone={statusToneForHealth(
                              selectedAdapter.healthStatus.status,
                            )}
                          >
                            {selectedAdapter.healthStatus.status}
                          </CanvasPill>
                        ),
                      },
                      {
                        label: copy.credentialSummary,
                        value: (
                          <div style={titleCellStyle}>
                            <CanvasPill
                              theme={theme}
                              tone={toneForCredential(
                                selectedAdapter.credentialStatus,
                              )}
                            >
                              {selectedAdapter.credentialStatus}
                            </CanvasPill>
                            <div style={inlineMetaStyle}>
                              <span style={metricNoteStyle}>
                                {selectedAdapter.credentialMeta?.configured
                                  ? locale === "en"
                                    ? "configured"
                                    : "已設定"
                                  : locale === "en"
                                    ? "missing"
                                    : "缺少"}
                              </span>
                              {selectedAdapter.credentialMeta?.expiring ? (
                                <CanvasPill theme={theme} tone="warn">
                                  {locale === "en" ? "expiring" : "即將到期"}
                                </CanvasPill>
                              ) : null}
                              <span style={metricNoteStyle}>
                                {selectedAdapter.credentialMeta
                                  ?.rotationOwner ?? "—"}
                              </span>
                            </div>
                          </div>
                        ),
                      },
                      {
                        label: copy.healthMessage,
                        value: selectedAdapter.healthStatus.message ?? "—",
                      },
                      {
                        label:
                          locale === "en"
                            ? "Operational pause"
                            : "Operational pause",
                        value: selectedAdapter.operationalPause?.ttlUntil ? (
                          <div style={titleCellStyle}>
                            <CanvasPill theme={theme} tone="warn">
                              {locale === "en" ? "Paused" : "已暫停"}
                            </CanvasPill>
                            <span style={metricNoteStyle}>
                              {selectedAdapter.operationalPause.owner ?? "—"} ·{" "}
                              {formatDateTime(
                                selectedAdapter.operationalPause.ttlUntil,
                              )}
                            </span>
                          </div>
                        ) : (
                          "—"
                        ),
                      },
                      {
                        label: copy.pauseTtl,
                        value: selectedAdapter.operationalPause?.ttlUntil
                          ? formatTtlCountdown(
                              selectedAdapter.operationalPause.ttlUntil,
                            )
                          : "—",
                      },
                      {
                        label: copy.pauseReason,
                        value: selectedAdapter.operationalPause?.reason ?? "—",
                      },
                    ]}
                  />
                ) : (
                  <div style={secondaryTextStyle}>{copy.noSelection}</div>
                )}
              </CanvasCard>

              <CanvasCard
                theme={theme}
                title={copy.configTitle}
                subtitle="driver-spec §6.4"
              >
                {selectedAdapter ? (
                  <CanvasDL
                    theme={theme}
                    cols={2}
                    items={[
                      {
                        label: copy.adapterType,
                        value: selectedAdapter.adapterType,
                      },
                      {
                        label:
                          locale === "en"
                            ? "Allowed service buckets"
                            : "允許 service buckets",
                        value:
                          selectedAdapter.policies.serviceBuckets.join(", ") ||
                          "—",
                      },
                      {
                        label:
                          locale === "en"
                            ? "Driver eligibility rules"
                            : "Driver eligibility rules",
                        value: selectedAdapter.isForwarded
                          ? locale === "en"
                            ? "Forwarded traffic enabled"
                            : "支援 forwarded traffic"
                          : locale === "en"
                            ? "Direct platform control"
                            : "平台直接控制",
                      },
                      {
                        label:
                          locale === "en" ? "Max candidates" : "Max candidates",
                        value: selectedAdapter.policies.maxCandidates,
                      },
                      {
                        label:
                          locale === "en" ? "Accept timeout" : "Accept timeout",
                        value: `${selectedAdapter.policies.acceptTimeoutSeconds}s`,
                      },
                      {
                        label:
                          locale === "en"
                            ? "Manual fallback threshold"
                            : "Manual fallback threshold",
                        value: `${selectedAdapter.policies.manualFallbackThresholdSeconds}s`,
                      },
                      {
                        label:
                          locale === "en"
                            ? "Finance authority mode"
                            : "Finance authority mode",
                        value: selectedAdapter.policies.financeAuthorityMode,
                      },
                    ]}
                  />
                ) : (
                  <div style={secondaryTextStyle}>{copy.noSelection}</div>
                )}
              </CanvasCard>
            </div>

            <div style={nestedGridStyle}>
              <CanvasCard
                theme={theme}
                title={copy.featureFlagTitle}
                subtitle={copy.createOnlyOnce}
              >
                {selectedAdapter ? (
                  <CanvasDL
                    theme={theme}
                    cols={1}
                    items={[
                      {
                        label:
                          locale === "en"
                            ? "Driver external order accept"
                            : "Driver external order accept",
                        value: selectedAdapter.featureFlags
                          .driverExternalOrderAcceptEnabled
                          ? "enabled"
                          : "disabled",
                      },
                      {
                        label:
                          locale === "en"
                            ? "Driver external order reject"
                            : "Driver external order reject",
                        value: selectedAdapter.featureFlags
                          .driverExternalOrderRejectEnabled
                          ? "enabled"
                          : "disabled",
                      },
                      {
                        label:
                          locale === "en"
                            ? "Platform earnings"
                            : "Platform earnings",
                        value: selectedAdapter.featureFlags
                          .platformEarningsEnabled
                          ? "enabled"
                          : "disabled",
                      },
                      {
                        label:
                          locale === "en"
                            ? "Platform presence"
                            : "Platform presence",
                        value: selectedAdapter.featureFlags
                          .platformPresenceEnabled
                          ? "enabled"
                          : "disabled",
                      },
                      {
                        label:
                          locale === "en" ? "canRelayAccept" : "canRelayAccept",
                        value: selectedAdapter.capabilityFlags?.canRelayAccept
                          ? "true"
                          : "false",
                      },
                      {
                        label:
                          locale === "en" ? "canRelayReject" : "canRelayReject",
                        value: selectedAdapter.capabilityFlags?.canRelayReject
                          ? "true"
                          : "false",
                      },
                      {
                        label: copy.credentialConfigured,
                        value: selectedAdapter.credentialMeta?.configured
                          ? "true"
                          : "false",
                      },
                      {
                        label: copy.credentialExpiring,
                        value: selectedAdapter.credentialMeta?.expiring
                          ? "true"
                          : "false",
                      },
                      {
                        label: copy.rotatedAt,
                        value: selectedAdapter.credentialMeta?.rotatedAt
                          ? formatDateTime(
                              selectedAdapter.credentialMeta.rotatedAt,
                            )
                          : "—",
                      },
                      {
                        label: copy.rotationOwner,
                        value:
                          selectedAdapter.credentialMeta?.rotationOwner ?? "—",
                      },
                      {
                        label: copy.webhookStatus,
                        value: selectedAdapter.webhookStatus?.lastStatus ?? "—",
                      },
                      {
                        label: copy.refreshSource,
                        value: refreshMeta.source,
                      },
                      {
                        label: copy.refreshCadence,
                        value: `${Math.round(refreshMeta.staleAfterMs / 1000)}s`,
                      },
                    ]}
                  />
                ) : (
                  <div style={secondaryTextStyle}>{copy.noSelection}</div>
                )}
              </CanvasCard>

              <CanvasCard
                theme={theme}
                title={copy.authorityTitle}
                subtitle="availableActions[]"
              >
                {selectedAdapter ? (
                  <div style={actionGridStyle}>
                    {selectedEnabledActions.length === 0 ? (
                      <div style={readOnlyNoticeStyle}>
                        <div style={{ fontWeight: 650, color: theme.text }}>
                          {copy.readOnlyTitle}
                        </div>
                        <div style={secondaryTextStyle}>
                          {copy.readOnlyBody}
                        </div>
                      </div>
                    ) : null}
                    <div style={titleCellStyle}>
                      <div style={{ fontWeight: 650 }}>
                        {copy.authorityPlatform}
                      </div>
                      <div style={actionRowStyle}>
                        {selectedPlatformActions.map(
                          (descriptor: ResourceActionDescriptor) => (
                            <CanvasBtn
                              key={`${selectedAdapter.id}-${descriptor.action}`}
                              theme={theme}
                              variant="secondary"
                              danger={descriptor.action === "disable_adapter"}
                              onClick={() =>
                                handleActionIntent(
                                  descriptor,
                                  selectedAdapter.id,
                                )
                              }
                            >
                              {toActionLabel(locale, descriptor.action)}
                            </CanvasBtn>
                          ),
                        )}
                        {selectedPlatformDisabledActions.map(
                          (descriptor: ResourceActionDescriptor) => (
                            <CanvasBtn
                              key={`${selectedAdapter.id}-${descriptor.action}`}
                              theme={theme}
                              variant="secondary"
                              disabled
                            >
                              {toActionLabel(locale, descriptor.action)}
                            </CanvasBtn>
                          ),
                        )}
                      </div>
                    </div>
                    <div style={titleCellStyle}>
                      <div style={{ fontWeight: 650 }}>{copy.authorityOps}</div>
                      <div style={actionRowStyle}>
                        {selectedOpsActions.map(
                          (descriptor: ResourceActionDescriptor) => (
                            <CanvasBtn
                              key={`${selectedAdapter.id}-${descriptor.action}`}
                              theme={theme}
                              variant="secondary"
                              onClick={() =>
                                handleActionIntent(
                                  descriptor,
                                  selectedAdapter.id,
                                )
                              }
                            >
                              {toActionLabel(locale, descriptor.action)}
                            </CanvasBtn>
                          ),
                        )}
                        {selectedOpsDisabledActions.map(
                          (descriptor: ResourceActionDescriptor) => (
                            <CanvasBtn
                              key={`${selectedAdapter.id}-${descriptor.action}`}
                              theme={theme}
                              variant="secondary"
                              disabled
                            >
                              {toActionLabel(locale, descriptor.action)}
                            </CanvasBtn>
                          ),
                        )}
                      </div>
                    </div>
                    {selectedDisabledActions.length > 0 ? (
                      <div style={titleCellStyle}>
                        <div style={{ fontWeight: 650 }}>
                          {copy.unavailableActions}
                        </div>
                        <CanvasDL
                          theme={theme}
                          cols={1}
                          items={selectedDisabledActions.map(
                            (descriptor: ResourceActionDescriptor) => ({
                              label: toActionLabel(locale, descriptor.action),
                              value: descriptor.disabledReasonCode ? (
                                <div style={titleCellStyle}>
                                  <span>{descriptor.disabledReasonCode}</span>
                                  <span style={metricNoteStyle}>
                                    {copy.disabledReason}
                                  </span>
                                </div>
                              ) : locale === "en" ? (
                                "Unavailable"
                              ) : (
                                "目前不可用"
                              ),
                            }),
                          )}
                        />
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div style={secondaryTextStyle}>{copy.noSelection}</div>
                )}
              </CanvasCard>

              <CanvasCard
                theme={theme}
                title={copy.linksTitle}
                subtitle="Q-X03"
              >
                {selectedAdapter ? (
                  <div style={linkListStyle}>
                    <Link
                      href={buildOpsDispatchLink(selectedAdapter)}
                      target="_blank"
                      rel="noreferrer noopener"
                      style={externalLinkStyle}
                    >
                      <span>{copy.linkDispatch}</span>
                      <CanvasIcon name="ext" size={15} />
                    </Link>
                    <Link
                      href={buildAuditLink(selectedAdapter)}
                      style={externalLinkStyle}
                    >
                      <span>{copy.linkAudit}</span>
                      <CanvasIcon name="arrow" size={15} />
                    </Link>
                    <Link
                      href={buildHealthLink(selectedAdapter)}
                      style={externalLinkStyle}
                    >
                      <span>{copy.linkHealth}</span>
                      <CanvasIcon name="arrow" size={15} />
                    </Link>
                  </div>
                ) : (
                  <div style={secondaryTextStyle}>{copy.noSelection}</div>
                )}
              </CanvasCard>
            </div>
          </div>
        </div>
      </CanvasShell>

      {pendingAction ? (
        <div style={modalBackdropStyle}>
          <div style={modalStyle}>
            <div>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: theme.text,
                  marginBottom: 6,
                }}
              >
                {copy.modalTitle}
              </div>
              <div style={secondaryTextStyle}>
                {toActionLabel(locale, pendingAction.descriptor.action)}
                {pendingAction.adapterId && selectedAdapter
                  ? ` · ${selectedAdapter.name}`
                  : ""}
              </div>
            </div>

            <CanvasBanner
              theme={theme}
              tone={
                pendingAction.descriptor.riskLevel === "high" ? "warn" : "info"
              }
              title={copy.modalHint}
              body={
                pendingAction.descriptor.disabledReasonCode
                  ? `${locale === "en" ? "Disabled reason" : "停用原因"}: ${pendingAction.descriptor.disabledReasonCode}`
                  : locale === "en"
                    ? "Low-risk actions go straight to receipt, while medium/high actions require explicit confirmation."
                    : "低風險動作可直接送出；中高風險動作需顯式確認。"
              }
            />

            {actionRequiresReason(pendingAction.descriptor) ? (
              <CanvasField theme={theme} label={copy.modalReason} required>
                <textarea
                  value={actionReason}
                  onChange={(event) => setActionReason(event.target.value)}
                  rows={4}
                  style={{ ...inputStyle(theme), resize: "vertical" }}
                />
              </CanvasField>
            ) : null}

            {pendingAction.descriptor.action === "pause_operational_traffic" ? (
              <CanvasField theme={theme} label={copy.modalTtl} required>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={actionTtlMinutes}
                  onChange={(event) => setActionTtlMinutes(event.target.value)}
                  style={inputStyle(theme)}
                />
              </CanvasField>
            ) : null}

            <div
              style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}
            >
              <CanvasBtn
                theme={theme}
                variant="secondary"
                onClick={() => setPendingAction(null)}
                disabled={actionBusy}
              >
                {copy.cancel}
              </CanvasBtn>
              <CanvasBtn
                theme={theme}
                variant="primary"
                onClick={() => void confirmAction()}
                disabled={
                  actionBusy ||
                  (actionRequiresReason(pendingAction.descriptor) &&
                    !actionReason.trim()) ||
                  (pendingAction.descriptor.action ===
                    "pause_operational_traffic" &&
                    (!actionTtlMinutes.trim() || Number(actionTtlMinutes) <= 0))
                }
              >
                {actionBusy ? copy.refreshing : copy.confirm}
              </CanvasBtn>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
