"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { formatDateTime } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import type { EmptyReason, ResourceActionDescriptor } from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasField,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  CanvasShell,
  buildCanvasTheme,
  type CanvasShellNavItem,
  type CanvasTone,
} from "@drts/ui-web";

type AdapterHealth = "healthy" | "degraded" | "down";
type EnvironmentStage = "sandbox" | "pilot" | "production";
type CredentialState = "configured" | "missing" | "expiring" | "expired";
type WebhookState = "configured" | "missing" | "degraded";
type AdapterAction =
  | "create_adapter_config"
  | "edit_credentials"
  | "enable_adapter"
  | "disable_adapter"
  | "edit_config"
  | "pause_operational_traffic"
  | "retry_failed_callback"
  | "rotate_credentials";

type AdapterRecord = {
  id: string;
  platformCode: string;
  displayName: string;
  environment: EnvironmentStage;
  enabled: boolean;
  adapterType: string;
  webhookUrlStatus: WebhookState;
  credentialStatus: CredentialState;
  rotatedAt: string | null;
  rotationOwner: string | null;
  lastHealthCheck: string;
  supportedActions: string[];
  health: AdapterHealth;
  capabilityFlags: {
    canRelayAccept: boolean;
    canRelayReject: boolean;
  };
  featureFlags: {
    driverExternalOrderAcceptEnabled: boolean;
    driverExternalOrderRejectEnabled: boolean;
    platformEarningsEnabled: boolean;
    platformPresenceEnabled: boolean;
  };
  configMetadata: {
    allowedServiceBuckets: string[];
    driverEligibilityRules: string;
    maxCandidates: number;
    acceptTimeoutSeconds: number;
    manualFallbackThreshold: number;
    financeAuthorityMode: string;
  };
  pauseState: {
    owner: string;
    ttlMinutes: number;
    reason: string;
    pausedAt: string;
  } | null;
  lastFailedCallbackAt: string | null;
  opsQueueDepth: number;
};

type DecoratedAdapter = AdapterRecord & {
  availableActions: ResourceActionDescriptor[];
  deepLinks: {
    label: string;
    href: string;
    tone: CanvasTone;
  }[];
};

type ActionComposerState = {
  adapterId: string | null;
  action: ResourceActionDescriptor;
};

const theme = buildCanvasTheme({
  surface: "platform",
  density: "compact",
});

const shellStyle = {
  margin: "-32px",
  minHeight: "calc(100vh - 64px)",
} satisfies CSSProperties;

const pageStackStyle = {
  display: "grid",
  gap: 16,
  padding: 24,
} satisfies CSSProperties;

const kpiGridStyle = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
} satisfies CSSProperties;

const contentGridStyle = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "minmax(0, 1.6fr) minmax(320px, 1fr)",
} satisfies CSSProperties;

const cardGridStyle = {
  display: "grid",
  gap: 12,
} satisfies CSSProperties;

const filterRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
} satisfies CSSProperties;

const adapterMetaGridStyle = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
} satisfies CSSProperties;

const actionRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
} satisfies CSSProperties;

const sectionTextStyle = {
  color: theme.textMuted,
  fontSize: 12,
  lineHeight: 1.5,
} satisfies CSSProperties;

const smallMonoStyle = {
  color: theme.textDim,
  fontFamily: theme.monoFamily,
  fontSize: 11.5,
  lineHeight: 1.45,
} satisfies CSSProperties;

const bulletListStyle = {
  margin: 0,
  paddingInlineStart: 18,
  display: "grid",
  gap: 6,
  color: theme.textMuted,
  fontSize: 12,
  lineHeight: 1.45,
} satisfies CSSProperties;

const flagGridStyle = {
  display: "grid",
  gap: 10,
} satisfies CSSProperties;

const flagRowStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "8px 0",
  borderBottom: `1px solid ${theme.border}`,
} satisfies CSSProperties;

const linkListStyle = {
  display: "grid",
  gap: 8,
} satisfies CSSProperties;

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: theme.bgRaised,
  color: theme.text,
  padding: "8px 10px",
  fontSize: 12.5,
  fontFamily: theme.fontFamily,
  outline: "none",
} satisfies CSSProperties;

const textAreaStyle = {
  ...inputStyle,
  minHeight: 92,
  resize: "vertical",
} satisfies CSSProperties;

const emptyStateBodyStyle = {
  display: "grid",
  gap: 14,
  placeItems: "start",
} satisfies CSSProperties;

const actionCatalog: Record<
  AdapterAction,
  { labelEn: string; labelZh: string; icon?: "plus" | "refresh" | "check" }
> = {
  create_adapter_config: {
    labelEn: "Create adapter config",
    labelZh: "建立 adapter config",
    icon: "plus",
  },
  edit_credentials: {
    labelEn: "Edit credentials",
    labelZh: "編輯 credentials",
  },
  enable_adapter: {
    labelEn: "Enable adapter",
    labelZh: "啟用 adapter",
    icon: "check",
  },
  disable_adapter: {
    labelEn: "Disable adapter",
    labelZh: "停用 adapter",
  },
  edit_config: {
    labelEn: "Edit config",
    labelZh: "編輯 config",
  },
  pause_operational_traffic: {
    labelEn: "Pause operational traffic",
    labelZh: "暫停 operational traffic",
  },
  retry_failed_callback: {
    labelEn: "Retry failed callback",
    labelZh: "重試 failed callback",
    icon: "refresh",
  },
  rotate_credentials: {
    labelEn: "Rotate credentials",
    labelZh: "輪替 credentials",
    icon: "refresh",
  },
};

const seedAdapters: AdapterRecord[] = [
  {
    id: "mof-bgmt-prod",
    platformCode: "MOF-BGMT",
    displayName: "BGMT Dispatch Forwarder",
    environment: "production",
    enabled: true,
    adapterType: "external_combined",
    webhookUrlStatus: "configured",
    credentialStatus: "expiring",
    rotatedAt: "2026-04-14T08:30:00.000Z",
    rotationOwner: "王詠心 · pa_super_admin",
    lastHealthCheck: "2026-05-27T03:55:00.000Z",
    supportedActions: ["accept", "reject", "proof_upload", "status_sync"],
    health: "degraded",
    capabilityFlags: {
      canRelayAccept: true,
      canRelayReject: true,
    },
    featureFlags: {
      driverExternalOrderAcceptEnabled: true,
      driverExternalOrderRejectEnabled: true,
      platformEarningsEnabled: true,
      platformPresenceEnabled: true,
    },
    configMetadata: {
      allowedServiceBuckets: ["airport", "premium", "accessible"],
      driverEligibilityRules: "partner_certified && document_set=forwarder_v2",
      maxCandidates: 4,
      acceptTimeoutSeconds: 25,
      manualFallbackThreshold: 90,
      financeAuthorityMode: "shadow",
    },
    pauseState: {
      owner: "陳佑安 · pa_ops_risk_gov",
      ttlMinutes: 90,
      reason: "callback error burst > 12 in 10m",
      pausedAt: "2026-05-27T03:05:00.000Z",
    },
    lastFailedCallbackAt: "2026-05-27T03:12:00.000Z",
    opsQueueDepth: 18,
  },
  {
    id: "city-taxi-pilot",
    platformCode: "CITY",
    displayName: "CityTaxi Pilot Adapter",
    environment: "pilot",
    enabled: true,
    adapterType: "external_rest",
    webhookUrlStatus: "configured",
    credentialStatus: "configured",
    rotatedAt: "2026-05-11T09:10:00.000Z",
    rotationOwner: "王詠心 · pa_super_admin",
    lastHealthCheck: "2026-05-27T03:58:00.000Z",
    supportedActions: ["quote", "accept", "cancel"],
    health: "healthy",
    capabilityFlags: {
      canRelayAccept: true,
      canRelayReject: false,
    },
    featureFlags: {
      driverExternalOrderAcceptEnabled: true,
      driverExternalOrderRejectEnabled: false,
      platformEarningsEnabled: true,
      platformPresenceEnabled: false,
    },
    configMetadata: {
      allowedServiceBuckets: ["standard", "business"],
      driverEligibilityRules: "pilot_cohort=ct-2026q2",
      maxCandidates: 3,
      acceptTimeoutSeconds: 18,
      manualFallbackThreshold: 60,
      financeAuthorityMode: "owned",
    },
    pauseState: null,
    lastFailedCallbackAt: null,
    opsQueueDepth: 0,
  },
  {
    id: "harbor-sbx",
    platformCode: "HARBOR",
    displayName: "Harbor Sandbox Ingress",
    environment: "sandbox",
    enabled: false,
    adapterType: "external_webhook",
    webhookUrlStatus: "missing",
    credentialStatus: "missing",
    rotatedAt: null,
    rotationOwner: null,
    lastHealthCheck: "2026-05-27T03:30:00.000Z",
    supportedActions: ["accept"],
    health: "down",
    capabilityFlags: {
      canRelayAccept: false,
      canRelayReject: false,
    },
    featureFlags: {
      driverExternalOrderAcceptEnabled: false,
      driverExternalOrderRejectEnabled: false,
      platformEarningsEnabled: false,
      platformPresenceEnabled: false,
    },
    configMetadata: {
      allowedServiceBuckets: ["sandbox"],
      driverEligibilityRules: "sandbox_only",
      maxCandidates: 1,
      acceptTimeoutSeconds: 30,
      manualFallbackThreshold: 120,
      financeAuthorityMode: "external",
    },
    pauseState: null,
    lastFailedCallbackAt: "2026-05-26T15:20:00.000Z",
    opsQueueDepth: 4,
  },
];

const pageCreateAction: ResourceActionDescriptor = {
  action: "create_adapter_config",
  enabled: true,
  requiresReason: true,
  riskLevel: "high",
};

const emptyStateCatalog: Record<
  Exclude<EmptyReason, "driver_not_eligible">,
  {
    tone: CanvasTone;
    titleEn: string;
    titleZh: string;
    bodyEn: string;
    bodyZh: string;
    nextAction?: ResourceActionDescriptor;
    linkHref?: string;
    linkLabelEn?: string;
    linkLabelZh?: string;
  }
> = {
  no_data: {
    tone: "neutral",
    titleEn: "No adapters registered yet",
    titleZh: "目前尚未註冊任何 adapter",
    bodyEn:
      "The registry exists, but no platform adapters have been provisioned for this environment.",
    bodyZh: "registry 已啟用，但這個環境尚未建立任何 platform adapter。",
    nextAction: pageCreateAction,
  },
  not_provisioned: {
    tone: "accent",
    titleEn: "Registry contract not provisioned",
    titleZh: "registry contract 尚未 provision",
    bodyEn:
      "Platform Admin can read the route, but no adapter config exists yet for the selected rollout lane.",
    bodyZh:
      "Platform Admin 可進入此 route，但選定 rollout lane 尚未建立任何 adapter config。",
    nextAction: pageCreateAction,
  },
  fetch_failed: {
    tone: "danger",
    titleEn: "Adapter data could not be refreshed",
    titleZh: "adapter 資料刷新失敗",
    bodyEn:
      "Keep the previous audit evidence, then refresh again after checking platform health.",
    bodyZh:
      "請保留目前 audit evidence，檢查 platform health 後再重新整理一次。",
    nextAction: {
      action: "retry_failed_callback",
      enabled: true,
      riskLevel: "medium",
    },
  },
  permission_denied: {
    tone: "warn",
    titleEn: "Current role is read-only here",
    titleZh: "目前角色在這裡只有 read-only 權限",
    bodyEn:
      "Adapter list is hidden until an owner with platform-admin authority or ops risk authority opens this screen.",
    bodyZh:
      "需由具 platform-admin authority 或 ops risk authority 的角色開啟此頁，adapter list 才會顯示。",
  },
  external_unavailable: {
    tone: "danger",
    titleEn: "External adapter status feed is unavailable",
    titleZh: "外部 adapter 狀態來源目前不可用",
    bodyEn:
      "Operational traffic status is stale. Open health and ops dispatch in a new tab before taking action.",
    bodyZh:
      "operational traffic 狀態已過期。採取動作前，先在新分頁打開 health 與 ops dispatch。",
    linkHref: "https://ops.drts.app/dispatch?board=forwarded",
    linkLabelEn: "Open ops dispatch",
    linkLabelZh: "開啟 ops dispatch",
  },
  filtered_empty: {
    tone: "info",
    titleEn: "No adapters match the current filter",
    titleZh: "目前篩選條件下沒有 adapter",
    bodyEn:
      "Clear environment and health filters to return to the full registry view.",
    bodyZh: "請清除 environment 與 health 篩選條件，回到完整 registry 檢視。",
  },
};

function buildPlatformNav(locale: string): CanvasShellNavItem[] {
  const labels =
    locale === "en"
      ? {
          workspace: "Workspace",
          home: "Governance Home",
          health: "Platform Health",
          tenantGroup: "Tenant Governance",
          tenants: "Tenants",
          partners: "Partner entry",
          users: "Platform staff",
          fleetGroup: "Fleet & Compliance",
          fleet: "Fleet & compliance",
          switchboard: "Public info & placards",
          pricingGroup: "Pricing & Settlement",
          pricing: "Pricing",
          payments: "Settlement governance",
          platformGroup: "Platform Layer",
          notices: "Notices & maintenance",
          audit: "Audit & evidence",
          flags: "Feature flags",
          adapters: "Adapter registry",
        }
      : {
          workspace: "工作面",
          home: "工作首頁",
          health: "平台健康",
          tenantGroup: "租戶治理",
          tenants: "租戶",
          partners: "合作夥伴 entry",
          users: "平台人員",
          fleetGroup: "車隊與法遵",
          fleet: "車隊與合規",
          switchboard: "法定資訊與牌貼",
          pricingGroup: "計價與結算",
          pricing: "計價",
          payments: "結算治理",
          platformGroup: "平台層",
          notices: "公告與維護",
          audit: "稽核與證據",
          flags: "功能旗標",
          adapters: "介接登錄",
        };

  return [
    { divider: labels.workspace },
    { key: "home", href: "/", label: labels.home, icon: "dashboard" },
    { key: "health", href: "/health", label: labels.health, icon: "health" },
    { divider: labels.tenantGroup },
    { key: "tenants", href: "/tenants", label: labels.tenants, icon: "users" },
    {
      key: "partners",
      href: "/partners",
      label: labels.partners,
      icon: "briefcase",
    },
    { key: "users", href: "/users", label: labels.users, icon: "shield" },
    { divider: labels.fleetGroup },
    { key: "fleet", href: "/fleet", label: labels.fleet, icon: "car" },
    {
      key: "switchboard",
      href: "/switchboard",
      label: labels.switchboard,
      icon: "clipboard",
    },
    { divider: labels.pricingGroup },
    { key: "pricing", href: "/pricing", label: labels.pricing, icon: "coins" },
    {
      key: "payments",
      href: "/payments",
      label: labels.payments,
      icon: "wallet",
    },
    { divider: labels.platformGroup },
    { key: "notices", href: "/notices", label: labels.notices, icon: "bell" },
    { key: "audit", href: "/audit", label: labels.audit, icon: "file" },
    {
      key: "flags",
      href: "/feature-flags",
      label: labels.flags,
      icon: "toggle",
    },
    {
      key: "adapters",
      href: "/adapter-registry",
      label: labels.adapters,
      icon: "link",
    },
  ];
}

function getActionCopy(locale: string, action: string) {
  const fallback = {
    labelEn: action,
    labelZh: action,
  };
  const resolved = actionCatalog[action as AdapterAction] ?? fallback;
  return locale === "en" ? resolved.labelEn : resolved.labelZh;
}

function getHealthTone(health: AdapterHealth): CanvasTone {
  if (health === "healthy") return "success";
  if (health === "degraded") return "warn";
  return "danger";
}

function getCredentialTone(status: CredentialState): CanvasTone {
  if (status === "configured") return "success";
  if (status === "expiring") return "warn";
  return "danger";
}

function getWebhookTone(status: WebhookState): CanvasTone {
  if (status === "configured") return "success";
  if (status === "degraded") return "warn";
  return "neutral";
}

function toBannerTone(tone: CanvasTone): Exclude<CanvasTone, "neutral"> {
  return tone === "neutral" ? "info" : tone;
}

function makeAction(
  action: AdapterAction,
  enabled: boolean,
  riskLevel: ResourceActionDescriptor["riskLevel"],
  options: Partial<ResourceActionDescriptor> = {},
): ResourceActionDescriptor {
  return {
    action,
    enabled,
    riskLevel,
    ...options,
  };
}

function decorateAdapter(adapter: AdapterRecord): DecoratedAdapter {
  return {
    ...adapter,
    availableActions: [
      makeAction("edit_credentials", true, "high", { requiresReason: true }),
      adapter.enabled
        ? makeAction("disable_adapter", true, "high", { requiresReason: true })
        : makeAction("enable_adapter", true, "high", { requiresReason: true }),
      makeAction("edit_config", true, "medium"),
      makeAction("pause_operational_traffic", true, "high", {
        requiresReason: true,
      }),
      makeAction(
        "retry_failed_callback",
        Boolean(adapter.lastFailedCallbackAt),
        "medium",
        !adapter.lastFailedCallbackAt
          ? { disabledReasonCode: "no_failed_callback" }
          : {},
      ),
      makeAction("rotate_credentials", true, "high", { requiresReason: true }),
    ],
    deepLinks: [
      {
        label: "Ops dispatch",
        href: "https://ops.drts.app/dispatch?board=forwarded",
        tone: "info",
      },
      {
        label: "Platform health",
        href: "/health",
        tone: "neutral",
      },
      {
        label: "Audit history",
        href: `/audit?resourceType=adapter&resourceId=${adapter.id}`,
        tone: "accent",
      },
    ],
  };
}

function externalLinkStyle(tone: CanvasTone): CSSProperties {
  const palette =
    tone === "accent"
      ? {
          background: theme.accentBg,
          border: theme.accentBorder,
          color: theme.accent,
        }
      : tone === "info"
        ? {
            background: theme.infoBg,
            border: theme.infoBorder,
            color: theme.info,
          }
        : {
            background: theme.surfaceLo,
            border: theme.border,
            color: theme.text,
          };

  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 28,
    padding: "6px 10px",
    borderRadius: 8,
    border: `1px solid ${palette.border}`,
    background: palette.background,
    color: palette.color,
    fontSize: 12,
    fontWeight: 500,
    textDecoration: "none",
  };
}

function forceReasonOptions(locale: string) {
  return [
    { value: "live", label: locale === "en" ? "Live data" : "即時資料" },
    {
      value: "no_data",
      label: locale === "en" ? "No data" : "無資料",
    },
    {
      value: "not_provisioned",
      label: locale === "en" ? "Not provisioned" : "未 provision",
    },
    {
      value: "fetch_failed",
      label: locale === "en" ? "Fetch failed" : "抓取失敗",
    },
    {
      value: "permission_denied",
      label: locale === "en" ? "Permission denied" : "權限不足",
    },
    {
      value: "external_unavailable",
      label: locale === "en" ? "External unavailable" : "外部不可用",
    },
    {
      value: "filtered_empty",
      label: locale === "en" ? "Filtered empty" : "篩選為空",
    },
  ] as const;
}

export default function AdapterRegistryPage() {
  const { locale } = useTranslation();
  const [adapters, setAdapters] = useState<AdapterRecord[]>(seedAdapters);
  const [selectedAdapterId, setSelectedAdapterId] = useState(
    seedAdapters[0]?.id,
  );
  const [environmentFilter, setEnvironmentFilter] = useState<
    "all" | EnvironmentStage
  >("all");
  const [healthFilter, setHealthFilter] = useState<
    "all" | AdapterHealth | "paused"
  >("all");
  const [forcedEmptyReason, setForcedEmptyReason] = useState<
    "live" | Exclude<EmptyReason, "driver_not_eligible">
  >("live");
  const [lastRefreshedAt, setLastRefreshedAt] = useState(
    "2026-05-27T04:10:00.000Z",
  );
  const [composer, setComposer] = useState<ActionComposerState | null>(null);
  const [reasonInput, setReasonInput] = useState("");
  const [ttlInput, setTtlInput] = useState("90");
  const [receipt, setReceipt] = useState<string | null>(null);

  const copy =
    locale === "en"
      ? {
          title: "External Platform Adapter Registry",
          subtitle:
            "Split authority per Q-ADM17: Platform Admin owns config, credentials, enablement; ops owns operational pause and callback recovery.",
          refresh: "Refresh",
          filter: "Filter",
          clearFilters: "Clear filters",
          refreshTierLabel: "Refresh tier",
          entryLinksTitle: "Entry / exit links",
          listTitle: "Adapter registry",
          listSubtitle:
            "Availability-first registry with health, credentials, feature flags, and split-authority CTAs driven only by availableActions.",
          detailTitle: "Adapter detail",
          detailSubtitle:
            "Config metadata, capability flags, feature flags, operational pause state, and cross-app exits.",
          previewTitle: "EmptyReason exercise",
          previewSubtitle:
            "Force each packet-required empty state to confirm distinct rendering in the same route.",
          actionConsoleTitle: "Action console",
          actionConsoleSubtitle:
            "High-risk actions require a reason. Ops pause also requires TTL.",
          filters: {
            all: "All",
            sandbox: "Sandbox",
            pilot: "Pilot",
            production: "Production",
            healthy: "Healthy",
            degraded: "Degraded",
            down: "Down",
            paused: "Paused",
          },
          kpis: {
            total: "Total adapters",
            attention: "Needs attention",
            paused: "Ops paused",
            production: "Production",
          },
          emptyAction: "Preview empty state",
          selected: "Selected adapter",
          noneSelected: "No adapter selected",
          reason: "Reason",
          ttl: "TTL minutes",
          submit: "Execute action",
          cancel: "Cancel",
          noReason: "Reason is required for this action.",
          noTtl: "TTL is required for ops pause.",
          openNewTab: "Open in new tab",
        }
      : {
          title: "External Platform Adapter Registry",
          subtitle:
            "依 Q-ADM17 採 split authority：Platform Admin 管 config、credentials、enable/disable；ops 管 operational pause 與 callback recovery。",
          refresh: "重新整理",
          filter: "篩選",
          clearFilters: "清除篩選",
          refreshTierLabel: "Refresh tier",
          entryLinksTitle: "Entry / exit links",
          listTitle: "Adapter registry",
          listSubtitle:
            "availability-first registry，顯示 health、credentials、feature flags，以及完全由 availableActions 驅動的 split-authority CTA。",
          detailTitle: "Adapter detail",
          detailSubtitle:
            "包含 config metadata、capability flags、feature flags、operational pause state 與跨 app exit。",
          previewTitle: "EmptyReason 演練",
          previewSubtitle:
            "強制切換 packet 要求的每種 empty state，確認同一路由都能 distinct render。",
          actionConsoleTitle: "Action console",
          actionConsoleSubtitle:
            "high-risk action 需要 reason；ops pause 額外需要 TTL。",
          filters: {
            all: "全部",
            sandbox: "Sandbox",
            pilot: "Pilot",
            production: "Production",
            healthy: "Healthy",
            degraded: "Degraded",
            down: "Down",
            paused: "Paused",
          },
          kpis: {
            total: "Adapter 總數",
            attention: "需關注",
            paused: "Ops 暫停中",
            production: "Production",
          },
          emptyAction: "預覽 empty state",
          selected: "目前選定",
          noneSelected: "目前沒有選定 adapter",
          reason: "原因",
          ttl: "TTL 分鐘",
          submit: "執行 action",
          cancel: "取消",
          noReason: "這個 action 必須填寫 reason。",
          noTtl: "ops pause 必須填寫 TTL。",
          openNewTab: "以新分頁開啟",
        };

  const navItems = useMemo(() => buildPlatformNav(locale), [locale]);
  const decoratedAdapters = useMemo(
    () => adapters.map((adapter) => decorateAdapter(adapter)),
    [adapters],
  );

  const visibleAdapters = useMemo(() => {
    return decoratedAdapters.filter((adapter) => {
      const environmentMatch =
        environmentFilter === "all" ||
        adapter.environment === environmentFilter;
      const healthMatch =
        healthFilter === "all"
          ? true
          : healthFilter === "paused"
            ? Boolean(adapter.pauseState)
            : adapter.health === healthFilter;

      return environmentMatch && healthMatch;
    });
  }, [decoratedAdapters, environmentFilter, healthFilter]);

  const selectedAdapter = useMemo(() => {
    if (!visibleAdapters.length) {
      return null;
    }
    return (
      visibleAdapters.find((adapter) => adapter.id === selectedAdapterId) ??
      visibleAdapters[0]
    );
  }, [selectedAdapterId, visibleAdapters]);

  const emptyReason =
    forcedEmptyReason === "live" && visibleAdapters.length === 0
      ? "filtered_empty"
      : forcedEmptyReason === "live"
        ? null
        : forcedEmptyReason;

  useEffect(() => {
    if (selectedAdapter) {
      setSelectedAdapterId(selectedAdapter.id);
    }
  }, [selectedAdapter]);

  function refreshRegistry() {
    setLastRefreshedAt(new Date().toISOString());
    setReceipt(
      locale === "en"
        ? "Registry refreshed at current client time."
        : "registry 已依目前 client time 重新整理。",
    );
  }

  function openActionComposer(
    action: ResourceActionDescriptor,
    adapterId: string | null,
  ) {
    setComposer({ action, adapterId });
    setReasonInput("");
    setTtlInput("90");
    setReceipt(null);
  }

  function applyActionMutation(targetId: string | null, action: string) {
    if (!targetId) {
      return;
    }

    setAdapters((current) =>
      current.map((adapter) => {
        if (adapter.id !== targetId) {
          return adapter;
        }

        const now = new Date().toISOString();

        if (action === "enable_adapter") {
          return {
            ...adapter,
            enabled: true,
            lastHealthCheck: now,
          };
        }

        if (action === "disable_adapter") {
          return {
            ...adapter,
            enabled: false,
            pauseState: null,
            lastHealthCheck: now,
          };
        }

        if (action === "pause_operational_traffic") {
          return {
            ...adapter,
            pauseState: {
              owner: "Codex2 · pa_ops_risk_gov",
              ttlMinutes: Number(ttlInput),
              reason: reasonInput.trim(),
              pausedAt: now,
            },
            lastHealthCheck: now,
          };
        }

        if (action === "retry_failed_callback") {
          return {
            ...adapter,
            lastFailedCallbackAt: null,
            opsQueueDepth: 0,
            health: adapter.health === "down" ? "degraded" : adapter.health,
            lastHealthCheck: now,
          };
        }

        if (action === "rotate_credentials") {
          return {
            ...adapter,
            credentialStatus: "configured",
            rotatedAt: now,
            rotationOwner: "Codex2 · pa_super_admin",
            lastHealthCheck: now,
          };
        }

        return {
          ...adapter,
          lastHealthCheck: now,
        };
      }),
    );
  }

  function submitAction() {
    if (!composer) {
      return;
    }

    if (composer.action.requiresReason && !reasonInput.trim()) {
      setReceipt(copy.noReason);
      return;
    }

    if (
      composer.action.action === "pause_operational_traffic" &&
      (!ttlInput.trim() || Number(ttlInput) <= 0)
    ) {
      setReceipt(copy.noTtl);
      return;
    }

    applyActionMutation(composer.adapterId, composer.action.action);
    setLastRefreshedAt(new Date().toISOString());
    setReceipt(
      `${getActionCopy(locale, composer.action.action)} · ${composer.action.riskLevel}`,
    );
    setComposer(null);
    setReasonInput("");
  }

  const attentionCount = decoratedAdapters.filter(
    (adapter) =>
      adapter.health !== "healthy" ||
      adapter.credentialStatus !== "configured" ||
      adapter.pauseState,
  ).length;

  const pausedCount = decoratedAdapters.filter(
    (adapter) => adapter.pauseState,
  ).length;
  const productionCount = decoratedAdapters.filter(
    (adapter) => adapter.environment === "production",
  ).length;

  const activeEmptyState = emptyReason ? emptyStateCatalog[emptyReason] : null;

  return (
    <CanvasShell
      theme={theme}
      nav={navItems}
      active="adapters"
      currentPath="/adapter-registry"
      breadcrumb={[
        locale === "en" ? "Platform Layer" : "平台層",
        locale === "en" ? "Adapter registry" : "介接登錄",
      ]}
      searchPlaceholder={
        locale === "en"
          ? "Search adapter, platform code, owner…"
          : "搜尋 adapter、platform code、owner…"
      }
      avatarLabel="PA"
      style={shellStyle}
    >
      <CanvasPageHeader
        theme={theme}
        title={copy.title}
        subtitle={copy.subtitle}
        sticky={false}
        actions={
          <>
            <CanvasBtn theme={theme} icon="refresh" onClick={refreshRegistry}>
              {copy.refresh}
            </CanvasBtn>
            <CanvasBtn
              theme={theme}
              variant="primary"
              icon="plus"
              onClick={() => openActionComposer(pageCreateAction, null)}
            >
              {getActionCopy(locale, pageCreateAction.action)}
            </CanvasBtn>
          </>
        }
      />

      <div style={pageStackStyle}>
        <CanvasBanner
          theme={theme}
          tone="warn"
          title={
            locale === "en"
              ? "BGMT production adapter is paused by ops with expiring credentials"
              : "BGMT production adapter 目前由 ops 暫停，且 credentials 即將到期"
          }
          body={
            locale === "en"
              ? "Use disable only for platform-level cutover; use ops pause for time-boxed traffic control with TTL."
              : "只有在 platform-level cutover 才用 disable；若是限時 traffic control，應使用帶 TTL 的 ops pause。"
          }
          actions={
            <div style={actionRowStyle}>
              <a
                href="https://ops.drts.app/dispatch?board=forwarded"
                target="_blank"
                rel="noreferrer"
                style={externalLinkStyle("info")}
              >
                Ops dispatch
              </a>
              <a
                href="/audit?resourceType=adapter&resourceId=mof-bgmt-prod"
                target="_blank"
                rel="noreferrer"
                style={externalLinkStyle("accent")}
              >
                Audit history
              </a>
            </div>
          }
        />

        <div style={kpiGridStyle}>
          <CanvasKPI
            theme={theme}
            label={copy.kpis.total}
            value={decoratedAdapters.length}
            sub={
              locale === "en"
                ? "T4 medium-slow registry"
                : "T4 medium-slow registry"
            }
          />
          <CanvasKPI
            theme={theme}
            label={copy.kpis.attention}
            value={attentionCount}
            delta={attentionCount > 0 ? `${attentionCount}` : undefined}
            deltaTone={attentionCount > 0 ? "down" : "neutral"}
            sub={
              locale === "en"
                ? "Health, credential, or pause state needs action"
                : "health、credential 或 pause state 需要處理"
            }
          />
          <CanvasKPI
            theme={theme}
            label={copy.kpis.paused}
            value={pausedCount}
            sub={
              locale === "en"
                ? "Ops-owned TTL pause"
                : "由 ops 持有的 TTL pause"
            }
          />
          <CanvasKPI
            theme={theme}
            label={copy.kpis.production}
            value={productionCount}
            sub={
              locale === "en"
                ? "Production rollout lanes"
                : "Production rollout lane"
            }
          />
        </div>

        <div style={contentGridStyle}>
          <div style={cardGridStyle}>
            <CanvasCard
              theme={theme}
              title={copy.listTitle}
              subtitle={copy.listSubtitle}
            >
              <div style={filterRowStyle}>
                <span style={sectionTextStyle}>{copy.filter}</span>
                {(["all", "sandbox", "pilot", "production"] as const).map(
                  (value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setEnvironmentFilter(value)}
                      style={{ all: "unset", cursor: "pointer" }}
                    >
                      <CanvasPill
                        theme={theme}
                        tone={
                          environmentFilter === value ? "accent" : "neutral"
                        }
                        dot={value !== "all"}
                      >
                        {copy.filters[value]}
                      </CanvasPill>
                    </button>
                  ),
                )}
                <span style={{ width: 8 }} />
                {(
                  ["all", "healthy", "degraded", "down", "paused"] as const
                ).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setHealthFilter(value)}
                    style={{ all: "unset", cursor: "pointer" }}
                  >
                    <CanvasPill
                      theme={theme}
                      tone={healthFilter === value ? "accent" : "neutral"}
                      dot={value !== "all"}
                    >
                      {copy.filters[value]}
                    </CanvasPill>
                  </button>
                ))}
                <span style={{ flex: 1 }} />
                <CanvasBtn
                  theme={theme}
                  size="xs"
                  onClick={() => {
                    setEnvironmentFilter("all");
                    setHealthFilter("all");
                  }}
                >
                  {copy.clearFilters}
                </CanvasBtn>
              </div>

              <div style={{ height: 14 }} />

              {activeEmptyState ? (
                <div style={emptyStateBodyStyle}>
                  <CanvasBanner
                    theme={theme}
                    tone={toBannerTone(activeEmptyState.tone)}
                    title={
                      locale === "en"
                        ? activeEmptyState.titleEn
                        : activeEmptyState.titleZh
                    }
                    body={
                      locale === "en"
                        ? activeEmptyState.bodyEn
                        : activeEmptyState.bodyZh
                    }
                  />
                  <div style={actionRowStyle}>
                    {activeEmptyState.nextAction ? (
                      <CanvasBtn
                        theme={theme}
                        variant="primary"
                        onClick={() =>
                          openActionComposer(activeEmptyState.nextAction!, null)
                        }
                      >
                        {getActionCopy(
                          locale,
                          activeEmptyState.nextAction.action,
                        )}
                      </CanvasBtn>
                    ) : null}
                    {activeEmptyState.linkHref ? (
                      <a
                        href={activeEmptyState.linkHref}
                        target="_blank"
                        rel="noreferrer"
                        style={externalLinkStyle("info")}
                      >
                        {locale === "en"
                          ? activeEmptyState.linkLabelEn
                          : activeEmptyState.linkLabelZh}
                      </a>
                    ) : null}
                    {emptyReason === "filtered_empty" ? (
                      <CanvasBtn
                        theme={theme}
                        onClick={() => {
                          setEnvironmentFilter("all");
                          setHealthFilter("all");
                          setForcedEmptyReason("live");
                        }}
                      >
                        {copy.clearFilters}
                      </CanvasBtn>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div style={cardGridStyle}>
                  {visibleAdapters.map((adapter) => (
                    <button
                      key={adapter.id}
                      type="button"
                      onClick={() => setSelectedAdapterId(adapter.id)}
                      style={{
                        all: "unset",
                        display: "block",
                        cursor: "pointer",
                        borderRadius: 12,
                        border:
                          selectedAdapter?.id === adapter.id
                            ? `1px solid ${theme.accent}`
                            : `1px solid ${theme.border}`,
                        background:
                          selectedAdapter?.id === adapter.id
                            ? theme.accentBg
                            : theme.surface,
                        padding: 14,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 12,
                          alignItems: "start",
                        }}
                      >
                        <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 15,
                              fontWeight: 700,
                              letterSpacing: -0.2,
                            }}
                          >
                            {adapter.displayName}
                          </div>
                          <div style={smallMonoStyle}>
                            {adapter.platformCode} · {adapter.adapterType} ·{" "}
                            {adapter.environment}
                          </div>
                        </div>
                        <CanvasPill
                          theme={theme}
                          tone={getHealthTone(adapter.health)}
                          dot
                        >
                          {adapter.health}
                        </CanvasPill>
                      </div>

                      <div style={{ height: 12 }} />

                      <div style={adapterMetaGridStyle}>
                        <div>
                          <div style={smallMonoStyle}>credential</div>
                          <CanvasPill
                            theme={theme}
                            tone={getCredentialTone(adapter.credentialStatus)}
                            dot
                          >
                            {adapter.credentialStatus}
                          </CanvasPill>
                        </div>
                        <div>
                          <div style={smallMonoStyle}>webhook</div>
                          <CanvasPill
                            theme={theme}
                            tone={getWebhookTone(adapter.webhookUrlStatus)}
                            dot
                          >
                            {adapter.webhookUrlStatus}
                          </CanvasPill>
                        </div>
                        <div>
                          <div style={smallMonoStyle}>enabled</div>
                          <CanvasPill
                            theme={theme}
                            tone={adapter.enabled ? "success" : "neutral"}
                            dot={adapter.enabled}
                          >
                            {adapter.enabled ? "enabled" : "disabled"}
                          </CanvasPill>
                        </div>
                        <div>
                          <div style={smallMonoStyle}>last health</div>
                          <div style={sectionTextStyle}>
                            {formatDateTime(adapter.lastHealthCheck)}
                          </div>
                        </div>
                      </div>

                      <div style={{ height: 12 }} />

                      <div style={actionRowStyle}>
                        {adapter.availableActions.slice(0, 4).map((action) => (
                          <span
                            key={action.action}
                            title={
                              action.enabled
                                ? `${action.riskLevel}${
                                    action.requiresReason ? " · reason" : ""
                                  }`
                                : (action.disabledReasonCode ?? "disabled")
                            }
                          >
                            <CanvasBtn
                              theme={theme}
                              size="xs"
                              variant={
                                action.riskLevel === "high"
                                  ? "primary"
                                  : "secondary"
                              }
                              disabled={!action.enabled}
                              onClick={() =>
                                action.enabled
                                  ? openActionComposer(action, adapter.id)
                                  : undefined
                              }
                            >
                              {getActionCopy(locale, action.action)}
                            </CanvasBtn>
                          </span>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CanvasCard>

            <CanvasCard
              theme={theme}
              title={copy.previewTitle}
              subtitle={copy.previewSubtitle}
            >
              <div style={filterRowStyle}>
                {forceReasonOptions(locale).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() =>
                      setForcedEmptyReason(
                        option.value as
                          | "live"
                          | Exclude<EmptyReason, "driver_not_eligible">,
                      )
                    }
                    style={{ all: "unset", cursor: "pointer" }}
                  >
                    <CanvasPill
                      theme={theme}
                      tone={
                        forcedEmptyReason === option.value
                          ? "accent"
                          : "neutral"
                      }
                      dot={option.value !== "live"}
                    >
                      {option.label}
                    </CanvasPill>
                  </button>
                ))}
              </div>
            </CanvasCard>
          </div>

          <div style={cardGridStyle}>
            <CanvasCard
              theme={theme}
              title={copy.detailTitle}
              subtitle={copy.detailSubtitle}
            >
              {selectedAdapter ? (
                <div style={{ display: "grid", gap: 16 }}>
                  <div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        alignItems: "start",
                      }}
                    >
                      <div style={{ display: "grid", gap: 6 }}>
                        <div
                          style={{
                            fontSize: 16,
                            fontWeight: 700,
                            letterSpacing: -0.2,
                          }}
                        >
                          {selectedAdapter.displayName}
                        </div>
                        <div style={smallMonoStyle}>{selectedAdapter.id}</div>
                      </div>
                      <CanvasPill
                        theme={theme}
                        tone={getHealthTone(selectedAdapter.health)}
                        dot
                      >
                        {selectedAdapter.health}
                      </CanvasPill>
                    </div>
                  </div>

                  <CanvasDL
                    theme={theme}
                    cols={2}
                    items={[
                      {
                        label: "environment",
                        value: selectedAdapter.environment,
                        mono: true,
                      },
                      {
                        label: "finance mode",
                        value:
                          selectedAdapter.configMetadata.financeAuthorityMode,
                        mono: true,
                      },
                      {
                        label: "service buckets",
                        value:
                          selectedAdapter.configMetadata.allowedServiceBuckets.join(
                            ", ",
                          ),
                      },
                      {
                        label: "driver eligibility",
                        value:
                          selectedAdapter.configMetadata.driverEligibilityRules,
                        mono: true,
                      },
                      {
                        label: "max candidates",
                        value: String(
                          selectedAdapter.configMetadata.maxCandidates,
                        ),
                        mono: true,
                      },
                      {
                        label: "accept timeout",
                        value: `${selectedAdapter.configMetadata.acceptTimeoutSeconds}s`,
                        mono: true,
                      },
                      {
                        label: "manual fallback",
                        value: `${selectedAdapter.configMetadata.manualFallbackThreshold}s`,
                        mono: true,
                      },
                      {
                        label: "rotation owner",
                        value: selectedAdapter.rotationOwner ?? "—",
                      },
                    ]}
                  />

                  <div style={flagGridStyle}>
                    <div style={smallMonoStyle}>capability flags</div>
                    <div style={flagRowStyle}>
                      <span>canRelayAccept</span>
                      <CanvasPill
                        theme={theme}
                        tone={
                          selectedAdapter.capabilityFlags.canRelayAccept
                            ? "success"
                            : "neutral"
                        }
                      >
                        {String(selectedAdapter.capabilityFlags.canRelayAccept)}
                      </CanvasPill>
                    </div>
                    <div style={flagRowStyle}>
                      <span>canRelayReject</span>
                      <CanvasPill
                        theme={theme}
                        tone={
                          selectedAdapter.capabilityFlags.canRelayReject
                            ? "success"
                            : "neutral"
                        }
                      >
                        {String(selectedAdapter.capabilityFlags.canRelayReject)}
                      </CanvasPill>
                    </div>
                  </div>

                  <div style={flagGridStyle}>
                    <div style={smallMonoStyle}>feature flags</div>
                    {(
                      Object.entries(selectedAdapter.featureFlags) as [
                        keyof DecoratedAdapter["featureFlags"],
                        boolean,
                      ][]
                    ).map(([key, value]) => (
                      <div key={key} style={flagRowStyle}>
                        <span>{key}</span>
                        <CanvasPill
                          theme={theme}
                          tone={value ? "success" : "neutral"}
                        >
                          {value ? "enabled" : "disabled"}
                        </CanvasPill>
                      </div>
                    ))}
                  </div>

                  <div style={flagGridStyle}>
                    <div style={smallMonoStyle}>operational pause</div>
                    {selectedAdapter.pauseState ? (
                      <CanvasBanner
                        theme={theme}
                        tone="warn"
                        title={`${selectedAdapter.pauseState.owner} · ${selectedAdapter.pauseState.ttlMinutes}m TTL`}
                        body={`${selectedAdapter.pauseState.reason} · ${formatDateTime(
                          selectedAdapter.pauseState.pausedAt,
                        )}`}
                      />
                    ) : (
                      <CanvasBanner
                        theme={theme}
                        tone="success"
                        title={
                          locale === "en"
                            ? "Operational traffic is live"
                            : "Operational traffic 目前正常"
                        }
                        body={
                          locale === "en"
                            ? "Use ops pause only when traffic should stop temporarily without disabling the adapter."
                            : "只有在暫時停止 traffic、但不打算 disable adapter 時才應使用 ops pause。"
                        }
                      />
                    )}
                  </div>

                  <div style={flagGridStyle}>
                    <div style={smallMonoStyle}>supported actions</div>
                    <ul style={bulletListStyle}>
                      {selectedAdapter.supportedActions.map((action) => (
                        <li key={action}>{action}</li>
                      ))}
                    </ul>
                  </div>

                  <div style={linkListStyle}>
                    <div style={smallMonoStyle}>{copy.entryLinksTitle}</div>
                    <div style={actionRowStyle}>
                      {selectedAdapter.deepLinks.map((link) => (
                        <a
                          key={link.label}
                          href={link.href}
                          target="_blank"
                          rel="noreferrer"
                          style={externalLinkStyle(link.tone)}
                        >
                          {link.label}
                        </a>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div style={sectionTextStyle}>{copy.noneSelected}</div>
              )}
            </CanvasCard>

            <CanvasCard
              theme={theme}
              title={copy.actionConsoleTitle}
              subtitle={copy.actionConsoleSubtitle}
            >
              <div style={{ display: "grid", gap: 14 }}>
                <CanvasDL
                  theme={theme}
                  cols={2}
                  items={[
                    {
                      label: copy.selected,
                      value: selectedAdapter?.displayName ?? "—",
                    },
                    {
                      label: copy.refreshTierLabel,
                      value: "T4 · medium_slow",
                      mono: true,
                    },
                    {
                      label: "last refresh",
                      value: formatDateTime(lastRefreshedAt),
                      mono: true,
                    },
                    {
                      label: "deep-link policy",
                      value: copy.openNewTab,
                    },
                  ]}
                />

                {composer ? (
                  <>
                    <CanvasBanner
                      theme={theme}
                      tone={
                        composer.action.riskLevel === "high" ? "warn" : "info"
                      }
                      title={getActionCopy(locale, composer.action.action)}
                      body={`${composer.action.riskLevel}${
                        composer.action.requiresReason
                          ? " · reason required"
                          : ""
                      }`}
                    />
                    {composer.action.requiresReason ? (
                      <CanvasField theme={theme} label={copy.reason} required>
                        <textarea
                          value={reasonInput}
                          onChange={(event) =>
                            setReasonInput(event.target.value)
                          }
                          style={textAreaStyle}
                        />
                      </CanvasField>
                    ) : null}
                    {composer.action.action === "pause_operational_traffic" ? (
                      <CanvasField theme={theme} label={copy.ttl} required>
                        <input
                          value={ttlInput}
                          onChange={(event) => setTtlInput(event.target.value)}
                          inputMode="numeric"
                          style={inputStyle}
                        />
                      </CanvasField>
                    ) : null}
                    <div style={actionRowStyle}>
                      <CanvasBtn
                        theme={theme}
                        variant="primary"
                        onClick={submitAction}
                      >
                        {copy.submit}
                      </CanvasBtn>
                      <CanvasBtn
                        theme={theme}
                        onClick={() => {
                          setComposer(null);
                          setReasonInput("");
                          setReceipt(null);
                        }}
                      >
                        {copy.cancel}
                      </CanvasBtn>
                    </div>
                  </>
                ) : (
                  <div style={sectionTextStyle}>
                    {locale === "en"
                      ? "Choose any available action from the list or empty-state preview."
                      : "請從左側清單或 empty-state preview 選擇任何 available action。"}
                  </div>
                )}

                {receipt ? (
                  <CanvasBanner theme={theme} tone="accent" title={receipt} />
                ) : null}
              </div>
            </CanvasCard>

            <CanvasCard
              theme={theme}
              title={
                locale === "en" ? "Spec coverage notes" : "Spec coverage notes"
              }
            >
              <ul style={bulletListStyle}>
                <li>
                  {locale === "en"
                    ? "Create, edit credentials, enable/disable, edit config, ops pause, retry callback, and credential rotation all render from availableActions."
                    : "create、edit credentials、enable/disable、edit config、ops pause、retry callback、rotate credentials 全部由 availableActions 驅動。"}
                </li>
                <li>
                  {locale === "en"
                    ? "Six EmptyReason variants are previewable in-route, with distinct banner copy and CTA behavior."
                    : "六種 EmptyReason 都可在同一路由內預覽，且有 distinct banner copy 與 CTA 行為。"}
                </li>
                <li>
                  {locale === "en"
                    ? "Cross-app deep links default to new tabs for ops dispatch and audit follow-through."
                    : "cross-app deep link 預設以新分頁開啟 ops dispatch 與 audit follow-through。"}
                </li>
              </ul>
            </CanvasCard>
          </div>
        </div>
      </div>
    </CanvasShell>
  );
}
