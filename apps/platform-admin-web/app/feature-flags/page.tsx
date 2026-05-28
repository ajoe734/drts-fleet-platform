"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ComponentProps,
  type ReactNode,
} from "react";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import type {
  CrossAppResourceLink,
  EmptyReason,
  FeatureFlag,
  FeatureFlagSummary,
  PlatformAdminTenantRecord,
  RefreshTier,
  ResourceActionDescriptor,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasCard,
  CanvasDL,
  CanvasField,
  CanvasIcon,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  CanvasShell,
  CanvasTable,
  buildCanvasTheme,
  type CanvasShellNavItem,
  type CanvasTableColumn,
  type CanvasTheme,
} from "@drts/ui-web";

type CanvasIconName = ComponentProps<typeof CanvasIcon>["name"];

type ScopeFilter =
  | "all"
  | "platform_default"
  | "tenant_overrides"
  | "selected_tenant"
  | "mid_rollout"
  | "deprecated";

type RolloutState =
  | "mid_rollout"
  | "fully_rolled_out"
  | "deprecated"
  | "tenant_only";

type FeatureFlagOverrideRecord = {
  tenantId: string;
  tenantCode: string;
  tenantName: string;
  enabled: boolean;
  description: string;
  updatedAt: string;
  crossLink: CrossAppResourceLink;
};

type FeatureFlagRow = {
  key: string;
  description: string;
  global: FeatureFlag | null;
  overrides: FeatureFlagOverrideRecord[];
  selectedTenantOverride: FeatureFlagOverrideRecord | null;
  rolloutState: RolloutState;
  latestUpdatedAt: string;
  updatedBy: string;
  availableActions: ResourceActionDescriptor[];
};

type FeatureFlagTableRow = FeatureFlagRow &
  Record<string, unknown> & {
    _selected?: boolean;
  };

type PendingAction =
  | {
      kind: "toggle_global";
      row: FeatureFlagRow;
      descriptor: ResourceActionDescriptor;
      nextEnabled: boolean;
    }
  | {
      kind: "add_tenant_override";
      row: FeatureFlagRow;
      descriptor: ResourceActionDescriptor;
      tenantId: string;
      enabled: boolean;
      description: string;
    }
  | {
      kind: "remove_tenant_override";
      row: FeatureFlagRow;
      descriptor: ResourceActionDescriptor;
      tenantId: string;
    };

type ReceiptState = {
  status: "completed" | "failed";
  title: string;
  message: string;
  auditHref: string;
  resourceLink?: CrossAppResourceLink | null;
};

type SnapshotIssue = {
  tenantId: string;
  tenantCode: string;
  message: string;
};

type ActionMeta = {
  labelZh: string;
  labelEn: string;
  icon: CanvasIconName;
};

type EmptyReasonMeta = {
  icon: CanvasIconName;
  tone: "neutral" | "info" | "warn" | "danger";
  labelZh: string;
  labelEn: string;
  hintZh: string;
  hintEn: string;
};

const REFRESH_TIER: RefreshTier = "medium_slow";
const REFRESH_TIER_CODE = REFRESH_TIER === "medium_slow" ? "T4" : REFRESH_TIER;
const REFRESH_INTERVAL_MS = 30_000;
const OPS_CONSOLE_BASE_URL =
  process.env.NEXT_PUBLIC_OPS_CONSOLE_URL ?? "http://localhost:3003";

const ACTION_META: Record<string, ActionMeta> = {
  toggle_global: {
    labelZh: "切換全域",
    labelEn: "Toggle global",
    icon: "flags",
  },
  add_tenant_override: {
    labelZh: "套用 tenant override",
    labelEn: "Apply override",
    icon: "plus",
  },
  remove_tenant_override: {
    labelZh: "移除 override",
    labelEn: "Remove override",
    icon: "x",
  },
  view_change_history: {
    labelZh: "變更歷史",
    labelEn: "History",
    icon: "audit",
  },
};

const EMPTY_REASON_ORDER: EmptyReason[] = [
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
  "filtered_empty",
];

const EMPTY_REASON_META: Record<EmptyReason, EmptyReasonMeta> = {
  no_data: {
    icon: "check",
    tone: "neutral",
    labelZh: "尚無資料",
    labelEn: "No data",
    hintZh: "目前沒有任何功能旗標，這是一個合法的空狀態。",
    hintEn: "No feature flags exist yet. This is a valid empty state.",
  },
  not_provisioned: {
    icon: "search",
    tone: "info",
    labelZh: "尚未設定",
    labelEn: "Not provisioned",
    hintZh: "目前 scope 尚未開通旗標治理資料，請先建立或選擇其他範圍。",
    hintEn:
      "The selected scope is not provisioned yet. Create the scope or choose another one.",
  },
  fetch_failed: {
    icon: "warn",
    tone: "danger",
    labelZh: "讀取失敗",
    labelEn: "Fetch failed",
    hintZh: "後端未成功回傳資料，請稍後重試或查看稽核與系統狀態。",
    hintEn:
      "The backend did not return data successfully. Retry later or inspect audit and health.",
  },
  permission_denied: {
    icon: "warn",
    tone: "warn",
    labelZh: "無權限",
    labelEn: "Permission denied",
    hintZh: "當前 actor 沒有這個區段的讀取或寫入權限。",
    hintEn: "The current actor does not have permission for this section.",
  },
  external_unavailable: {
    icon: "ext",
    tone: "warn",
    labelZh: "外部失聯",
    labelEn: "External unavailable",
    hintZh: "跨系統依賴目前不可用，請先確認外部服務與 proxy 狀態。",
    hintEn:
      "An external dependency is currently unavailable. Check the dependent service and proxy.",
  },
  filtered_empty: {
    icon: "filter",
    tone: "neutral",
    labelZh: "篩選過嚴",
    labelEn: "Filtered empty",
    hintZh: "目前的 key 搜尋或 scope 條件沒有任何結果，請放寬條件。",
    hintEn:
      "The current key search or scope filter produced no results. Relax the filter.",
  },
  driver_not_eligible: {
    icon: "warn",
    tone: "warn",
    labelZh: "司機不合資格",
    labelEn: "Driver not eligible",
    hintZh: "此狀態不適用於平台治理頁，但仍由 shared contract 定義。",
    hintEn:
      "This state does not apply to platform governance pages, but exists in the shared contract.",
  },
};

const theme = buildCanvasTheme({
  surface: "platform",
  density: "compact",
});

const shellStyle = {
  margin: "-32px",
  minHeight: "calc(100vh - 64px)",
} satisfies CSSProperties;

const bodyStyle = {
  display: "grid",
  gap: 16,
  padding: 24,
} satisfies CSSProperties;

const kpiGridStyle = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
} satisfies CSSProperties;

const topGridStyle = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
} satisfies CSSProperties;

const bottomGridStyle = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
} satisfies CSSProperties;

const fieldGridStyle = {
  display: "grid",
  gap: 14,
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
} satisfies CSSProperties;

const loadingStateStyle = {
  color: theme.textMuted,
  fontSize: 12.5,
  padding: "8px 0",
} satisfies CSSProperties;

const helperTextStyle = {
  marginTop: 6,
  color: theme.textMuted,
  fontSize: 11.5,
  lineHeight: 1.45,
} satisfies CSSProperties;

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  borderRadius: 7,
  border: `1px solid ${theme.border}`,
  background: theme.bgRaised,
  color: theme.text,
  fontFamily: theme.fontFamily,
  fontSize: 12.5,
  padding: "8px 10px",
  outline: "none",
} satisfies CSSProperties;

const textareaStyle = {
  ...inputStyle,
  minHeight: 88,
  resize: "vertical",
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

const keyButtonStyle = {
  display: "grid",
  gap: 4,
  border: 0,
  padding: 0,
  background: "transparent",
  textAlign: "left",
  cursor: "pointer",
} satisfies CSSProperties;

const stackedCellStyle = {
  display: "grid",
  gap: 4,
  minWidth: 0,
} satisfies CSSProperties;

const secondaryTextStyle = {
  color: theme.textMuted,
  fontSize: 11.5,
  lineHeight: 1.45,
  whiteSpace: "normal",
} satisfies CSSProperties;

const secondaryMonoStyle = {
  color: theme.textDim,
  fontFamily: theme.monoFamily,
  fontSize: 11,
  whiteSpace: "normal",
} satisfies CSSProperties;

const pillRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  alignItems: "center",
} satisfies CSSProperties;

const actionRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  alignItems: "center",
} satisfies CSSProperties;

const deepLinkStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  color: theme.accent,
  textDecoration: "none",
  fontWeight: 600,
  fontSize: 11.5,
} satisfies CSSProperties;

const metaRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
} satisfies CSSProperties;

const noteListStyle = {
  margin: 0,
  paddingInlineStart: 18,
  display: "grid",
  gap: 6,
  color: theme.textMuted,
  fontSize: 12,
  lineHeight: 1.45,
} satisfies CSSProperties;

const modalBackdropStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(11, 18, 32, 0.52)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  zIndex: 40,
} satisfies CSSProperties;

const modalCardStyle = {
  width: "min(560px, 100%)",
  maxHeight: "calc(100vh - 48px)",
  overflow: "auto",
  background: theme.surface,
  border: `1px solid ${theme.border}`,
  borderRadius: 12,
  boxShadow: "0 20px 60px rgba(15, 23, 42, 0.18)",
} satisfies CSSProperties;

const modalHeaderStyle = {
  padding: "16px 18px 12px",
  borderBottom: `1px solid ${theme.border}`,
  display: "grid",
  gap: 4,
} satisfies CSSProperties;

const modalBodyStyle = {
  padding: 18,
  display: "grid",
  gap: 16,
} satisfies CSSProperties;

const modalFooterStyle = {
  padding: "0 18px 18px",
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  flexWrap: "wrap",
} satisfies CSSProperties;

function buttonStyle(
  th: CanvasTheme,
  descriptor: ResourceActionDescriptor,
  size: "xs" | "sm" | "md" = "sm",
): CSSProperties {
  const sizing =
    size === "xs"
      ? { padding: "4px 8px", fontSize: 11.5, height: 24 }
      : size === "md"
        ? { padding: "8px 14px", fontSize: 13, height: 34 }
        : { padding: "5px 10px", fontSize: 12, height: 28 };

  const intent =
    descriptor.riskLevel === "high"
      ? { bg: th.danger, fg: "#ffffff", bd: th.danger }
      : descriptor.riskLevel === "medium"
        ? { bg: th.accent, fg: "#ffffff", bd: th.accent }
        : { bg: th.surface, fg: th.text, bd: th.border };

  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: sizing.padding,
    fontSize: sizing.fontSize,
    height: sizing.height,
    fontWeight: 500,
    lineHeight: 1,
    borderRadius: 7,
    border: `1px solid ${intent.bd}`,
    background: intent.bg,
    color: intent.fg,
    cursor: descriptor.enabled ? "pointer" : "not-allowed",
    opacity: descriptor.enabled ? 1 : 0.5,
    fontFamily: th.fontFamily,
  };
}

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
    {
      key: "tenants",
      href: "/tenants",
      label: labels.tenants,
      icon: "tenants",
    },
    {
      key: "partners",
      href: "/partners",
      label: labels.partners,
      icon: "partners",
    },
    { key: "users", href: "/users", label: labels.users, icon: "users" },
    { divider: labels.fleetGroup },
    { key: "fleet", href: "/fleet", label: labels.fleet, icon: "fleet" },
    {
      key: "switchboard",
      href: "/switchboard",
      label: labels.switchboard,
      icon: "switchboard",
    },
    { divider: labels.pricingGroup },
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
    { divider: labels.platformGroup },
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
      matchPaths: ["/feature-flags"],
    },
    {
      key: "adapters",
      href: "/adapter-registry",
      label: labels.adapters,
      icon: "adapters",
    },
  ];
}

function buildOpsDeepLink(
  tenant: PlatformAdminTenantRecord,
  key: string,
): CrossAppResourceLink {
  const params = new URLSearchParams({
    tenantId: tenant.id,
    tenantCode: tenant.code,
    flagKey: key,
    source: "platform-admin",
  });

  return {
    targetApp: "ops-console",
    route: `/dispatch?${params.toString()}`,
    resourceType: "tenant_dispatch_context",
    resourceId: tenant.id,
    openMode: "new_tab",
    label: `Ops dispatch context · ${tenant.code}`,
  };
}

function crossAppHref(link: CrossAppResourceLink) {
  return `${OPS_CONSOLE_BASE_URL.replace(/\/$/, "")}${link.route}`;
}

function auditHref(key: string) {
  const params = new URLSearchParams({
    module: "feature_flag",
    resourceType: "feature_flag",
    resourceId: key,
  });
  return `/audit?${params.toString()}`;
}

function classifyErrorReason(message: string | null): EmptyReason {
  if (!message) {
    return "fetch_failed";
  }

  const text = message.toLowerCase();
  if (
    text.includes("403") ||
    text.includes("forbidden") ||
    text.includes("permission")
  ) {
    return "permission_denied";
  }
  if (
    text.includes("502") ||
    text.includes("503") ||
    text.includes("504") ||
    text.includes("gateway") ||
    text.includes("unavailable")
  ) {
    return "external_unavailable";
  }
  return "fetch_failed";
}

function sortFlags(flags: FeatureFlag[]) {
  return [...flags].sort((left, right) => left.key.localeCompare(right.key));
}

function isDeprecatedFlag(key: string, description: string) {
  const text = `${key} ${description}`.toLowerCase();
  return (
    text.includes("deprecated") ||
    text.includes("legacy") ||
    text.includes("sunset") ||
    text.includes("retired")
  );
}

function buildAvailableActions({
  global,
  selectedTenantId,
  selectedTenantOverride,
}: {
  global: FeatureFlag | null;
  selectedTenantId: string;
  selectedTenantOverride: FeatureFlagOverrideRecord | null;
}): ResourceActionDescriptor[] {
  return [
    {
      action: "toggle_global",
      enabled: Boolean(global),
      disabledReasonCode: global ? undefined : "global_default_missing",
      requiresReason: true,
      riskLevel: "high",
    },
    {
      action: "add_tenant_override",
      enabled: Boolean(selectedTenantId),
      disabledReasonCode: selectedTenantId
        ? undefined
        : "select_tenant_scope_first",
      requiresReason: true,
      riskLevel: "high",
    },
    {
      action: "remove_tenant_override",
      enabled: Boolean(selectedTenantOverride),
      disabledReasonCode: !selectedTenantId
        ? "select_tenant_scope_first"
        : !selectedTenantOverride
          ? "no_override_for_selected_scope"
          : undefined,
      requiresReason: true,
      riskLevel: "high",
    },
    {
      action: "view_change_history",
      enabled: true,
      riskLevel: "low",
    },
  ];
}

function getActionDescriptor(
  actions: ResourceActionDescriptor[],
  action: string,
) {
  return actions.find((descriptor) => descriptor.action === action) ?? null;
}

function buildRows({
  globalFlags,
  tenants,
  tenantSummaries,
  selectedTenantId,
}: {
  globalFlags: FeatureFlag[];
  tenants: PlatformAdminTenantRecord[];
  tenantSummaries: Record<string, FeatureFlagSummary>;
  selectedTenantId: string;
}): FeatureFlagRow[] {
  const globalByKey = new Map(
    sortFlags(globalFlags).map((flag) => [flag.key, flag]),
  );
  const overridesByKey = new Map<string, FeatureFlagOverrideRecord[]>();
  const allKeys = new Set<string>(globalByKey.keys());

  for (const tenant of tenants) {
    const summary = tenantSummaries[tenant.id];
    if (!summary) {
      continue;
    }

    for (const flag of summary.flags) {
      allKeys.add(flag.key);
      if (!flag.tenantId) {
        continue;
      }

      const existing = overridesByKey.get(flag.key) ?? [];
      existing.push({
        tenantId: tenant.id,
        tenantCode: tenant.code,
        tenantName: tenant.name,
        enabled: flag.enabled,
        description: flag.description,
        updatedAt: flag.updatedAt,
        crossLink: buildOpsDeepLink(tenant, flag.key),
      });
      overridesByKey.set(flag.key, existing);
    }
  }

  return [...allKeys]
    .sort((left, right) => left.localeCompare(right))
    .map((key) => {
      const global = globalByKey.get(key) ?? null;
      const overrides = [...(overridesByKey.get(key) ?? [])].sort(
        (left, right) => left.tenantCode.localeCompare(right.tenantCode),
      );
      const selectedTenantOverride =
        overrides.find((override) => override.tenantId === selectedTenantId) ??
        null;
      const description =
        global?.description ??
        selectedTenantOverride?.description ??
        overrides[0]?.description ??
        "—";
      const deprecated = isDeprecatedFlag(key, description);
      const effectiveStates = new Set<boolean>();
      if (global) {
        effectiveStates.add(global.enabled);
      }
      for (const override of overrides) {
        effectiveStates.add(override.enabled);
      }

      const rolloutState: RolloutState = deprecated
        ? "deprecated"
        : !global && overrides.length > 0
          ? "tenant_only"
          : effectiveStates.size > 1
            ? "mid_rollout"
            : "fully_rolled_out";

      const timestamps = [
        global?.updatedAt ?? "",
        ...overrides.map((override) => override.updatedAt),
      ].filter(Boolean);
      const latestUpdatedAt =
        timestamps.sort((left, right) => right.localeCompare(left))[0] ?? "";

      return {
        key,
        description,
        global,
        overrides,
        selectedTenantOverride,
        rolloutState,
        latestUpdatedAt,
        updatedBy: selectedTenantOverride
          ? `tenant:${selectedTenantOverride.tenantCode} · actor pending contract`
          : overrides.length > 0
            ? `${overrides.length} override scope(s) · actor pending contract`
            : "platform default · actor pending contract",
        availableActions: buildAvailableActions({
          global,
          selectedTenantId,
          selectedTenantOverride,
        }),
      };
    });
}

function filterRows(
  rows: FeatureFlagRow[],
  search: string,
  scopeFilter: ScopeFilter,
  selectedTenantId: string,
) {
  const query = search.trim().toLowerCase();

  return rows.filter((row) => {
    const matchesQuery =
      !query ||
      row.key.toLowerCase().includes(query) ||
      row.description.toLowerCase().includes(query) ||
      row.overrides.some(
        (override) =>
          override.tenantCode.toLowerCase().includes(query) ||
          override.tenantName.toLowerCase().includes(query),
      );

    if (!matchesQuery) {
      return false;
    }

    switch (scopeFilter) {
      case "platform_default":
        return Boolean(row.global);
      case "tenant_overrides":
        return row.overrides.length > 0;
      case "selected_tenant":
        return Boolean(selectedTenantId) && Boolean(row.selectedTenantOverride);
      case "mid_rollout":
        return row.rolloutState === "mid_rollout";
      case "deprecated":
        return row.rolloutState === "deprecated";
      case "all":
      default:
        return true;
    }
  });
}

function rolloutTone(state: RolloutState) {
  switch (state) {
    case "mid_rollout":
      return "warn";
    case "deprecated":
      return "danger";
    case "tenant_only":
      return "info";
    case "fully_rolled_out":
    default:
      return "success";
  }
}

function rolloutLabel(locale: string, state: RolloutState) {
  if (locale === "en") {
    switch (state) {
      case "mid_rollout":
        return "Mid-rollout";
      case "deprecated":
        return "Deprecated";
      case "tenant_only":
        return "Tenant-only";
      case "fully_rolled_out":
      default:
        return "Fully rolled-out";
    }
  }

  switch (state) {
    case "mid_rollout":
      return "部分 rollout";
    case "deprecated":
      return "已棄用";
    case "tenant_only":
      return "僅 tenant";
    case "fully_rolled_out":
    default:
      return "已全量 rollout";
  }
}

function refreshMeta(
  locale: string,
  freshness: "fresh" | "stale" | "degraded" | "unknown",
) {
  if (locale === "en") {
    switch (freshness) {
      case "fresh":
        return {
          label: `${REFRESH_TIER_CODE} · 30s · fresh`,
          tone: "success" as const,
        };
      case "stale":
        return {
          label: `${REFRESH_TIER_CODE} · 30s · stale`,
          tone: "warn" as const,
        };
      case "degraded":
        return {
          label: `${REFRESH_TIER_CODE} · 30s · degraded`,
          tone: "danger" as const,
        };
      case "unknown":
      default:
        return {
          label: `${REFRESH_TIER_CODE} · 30s · unknown`,
          tone: "neutral" as const,
        };
    }
  }

  switch (freshness) {
    case "fresh":
      return {
        label: `${REFRESH_TIER_CODE} · 30s · 即時`,
        tone: "success" as const,
      };
    case "stale":
      return {
        label: `${REFRESH_TIER_CODE} · 30s · 過時`,
        tone: "warn" as const,
      };
    case "degraded":
      return {
        label: `${REFRESH_TIER_CODE} · 30s · 降級`,
        tone: "danger" as const,
      };
    case "unknown":
    default:
      return {
        label: `${REFRESH_TIER_CODE} · 30s · 未知`,
        tone: "neutral" as const,
      };
  }
}

function timeSinceMs(ms: number, locale: string) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) {
    return locale === "en" ? `${seconds}s ago` : `${seconds} 秒前`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return locale === "en" ? `${minutes}m ago` : `${minutes} 分前`;
  }
  const hours = Math.floor(minutes / 60);
  return locale === "en" ? `${hours}h ago` : `${hours} 小時前`;
}

function DescriptorButton({
  theme: th,
  locale,
  descriptor,
  onClick,
  size = "sm",
}: {
  theme: CanvasTheme;
  locale: string;
  descriptor: ResourceActionDescriptor | null;
  onClick: () => void;
  size?: "xs" | "sm" | "md";
}) {
  if (!descriptor) {
    return null;
  }

  const meta = ACTION_META[descriptor.action] ?? {
    labelZh: descriptor.action,
    labelEn: descriptor.action,
    icon: "more",
  };
  const tooltip = !descriptor.enabled
    ? (descriptor.disabledReasonCode ?? undefined)
    : descriptor.requiresReason
      ? locale === "en"
        ? "Reason required"
        : "需填寫原因"
      : undefined;

  return (
    <button
      type="button"
      title={tooltip}
      disabled={!descriptor.enabled}
      onClick={descriptor.enabled ? onClick : undefined}
      style={buttonStyle(th, descriptor, size)}
    >
      <CanvasIcon name={meta.icon} size={size === "xs" ? 12 : 13} />
      <span style={{ display: "inline-flex", alignItems: "baseline", gap: 5 }}>
        <span>{locale === "en" ? meta.labelEn : meta.labelZh}</span>
        <span style={{ fontSize: 10, opacity: 0.7, fontFamily: th.monoFamily }}>
          · {meta.labelEn.toLowerCase()}
        </span>
      </span>
    </button>
  );
}

function EmptyStateCard({
  theme: th,
  locale,
  reason,
  compact = false,
  messageOverride,
  actionNode,
}: {
  theme: CanvasTheme;
  locale: string;
  reason: EmptyReason;
  compact?: boolean;
  messageOverride?: string;
  actionNode?: ReactNode;
}) {
  const meta = EMPTY_REASON_META[reason] ?? EMPTY_REASON_META.no_data;
  if (!meta) {
    return null;
  }
  const dimensions = compact
    ? { paddingY: 16, icon: 22, gap: 10, title: 13, body: 12 }
    : { paddingY: 32, icon: 32, gap: 14, title: 15, body: 13 };
  const tonesByLevel = {
    neutral: {
      fg: th.textMuted,
      bg: th.surfaceLo,
      bd: th.border,
    },
    info: {
      fg: th.info,
      bg: th.infoBg,
      bd: th.infoBorder,
    },
    warn: {
      fg: th.warn,
      bg: th.warnBg,
      bd: th.warnBorder,
    },
    danger: {
      fg: th.danger,
      bg: th.dangerBg,
      bd: th.dangerBorder,
    },
  };
  const tones = tonesByLevel[meta.tone];

  return (
    <div
      style={{
        padding: `${dimensions.paddingY}px 16px`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: dimensions.gap,
        textAlign: "center",
        background: tones.bg,
        border: `1px dashed ${tones.bd}`,
        borderRadius: 10,
      }}
    >
      <div
        style={{
          width: dimensions.icon + 16,
          height: dimensions.icon + 16,
          borderRadius: 999,
          background: th.surface,
          color: tones.fg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: `1px solid ${tones.bd}`,
        }}
      >
        <CanvasIcon name={meta.icon} size={dimensions.icon} stroke={1.45} />
      </div>
      <div>
        <div
          style={{
            fontSize: dimensions.title,
            fontWeight: 600,
            color: th.text,
            display: "flex",
            alignItems: "baseline",
            gap: 6,
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          <span>{locale === "en" ? meta.labelEn : meta.labelZh}</span>
          <span
            style={{
              fontFamily: th.monoFamily,
              fontSize: dimensions.title - 3,
              color: th.textDim,
              fontWeight: 500,
            }}
          >
            · {reason}
          </span>
        </div>
        <div
          style={{
            fontSize: dimensions.body,
            color: th.textMuted,
            marginTop: 4,
            maxWidth: 420,
            lineHeight: 1.5,
          }}
        >
          {messageOverride ?? (locale === "en" ? meta.hintEn : meta.hintZh)}
        </div>
      </div>
      {actionNode}
    </div>
  );
}

export default function FeatureFlagsPage() {
  const { t, locale } = useTranslation();
  const client = usePlatformAdminClient();
  const [globalSummary, setGlobalSummary] = useState<FeatureFlagSummary | null>(
    null,
  );
  const [tenants, setTenants] = useState<PlatformAdminTenantRecord[]>([]);
  const [tenantSummaries, setTenantSummaries] = useState<
    Record<string, FeatureFlagSummary>
  >({});
  const [snapshotIssues, setSnapshotIssues] = useState<SnapshotIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("all");
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [selectedFlagKey, setSelectedFlagKey] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(
    null,
  );
  const [actionReason, setActionReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptState | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<number | null>(null);
  const [clockNow, setClockNow] = useState(() => Date.now());

  const copy =
    locale === "en"
      ? {
          pageTitle: "Feature Flags · WRITE authority",
          pageSubtitle:
            "Only this page can mutate flag state. Ops, tenant, and driver surfaces stay read-only per Q-X16.",
          breadcrumbParent: "Platform Operations",
          loading: "Loading feature flags…",
          refresh: "Refresh",
          refreshing: "Refreshing…",
          searchLabel: "Search by key",
          searchPlaceholder: "Search key or tenant scope",
          scopeLabel: "Scope filter",
          tenantLabel: "Tenant focus",
          tenantDefault: "All tenant scopes",
          tenantRequired: "Select a tenant to enable tenant override actions.",
          scopeHint:
            "Packet §5 requires scope filtering plus key search. Selected tenant focus also drives availableActions.",
          summaryTitle: "Governance scope",
          summarySubtitle:
            "T4 refresh, reason-required writes, and cross-app ops context all live in this surface.",
          selectedTitle: "Selected flag",
          selectedSubtitle:
            "Use availableActions instead of role hard-coding. High-risk writes always require a reason.",
          notesTitle: "Contract notes",
          notesSubtitle:
            "Current API still exposes the legacy feature-flag summary shape; this page wraps it into governance UI state.",
          notesFallback:
            "No contract notes returned. Governance behavior still follows packet §5.",
          overrideMatrixTitle: "Tenant override matrix",
          overrideMatrixSubtitle:
            "Per-tenant override rows remain visible for blast-radius review and cross-app deep linking.",
          emptyCoverageTitle: "EmptyReason coverage",
          emptyCoverageSubtitle:
            "Six admin-relevant EmptyReason states rendered distinctly for QA and reviewer verification.",
          guardrailTitle: "Write authority stays here.",
          guardrailBody:
            "Global default toggles and tenant overrides are governed on this page only. Other apps read filtered endpoints.",
          degradedTitle: "Some tenant scopes did not refresh cleanly.",
          degradedBody:
            "The page still shows the latest successful global snapshot, but at least one tenant override scope is degraded.",
          errorTitle: "Feature flag governance failed to refresh.",
          selectPrompt:
            "Select a flag row to inspect override depth and write actions.",
          latestReceipt: "Latest action receipt",
          viewAudit: "View audit trail",
          viewOps: "Open ops context",
          clearFilters: "Clear filters",
          noDescription: "No description provided",
          noGlobal: "No global default",
          noGlobalBody:
            "This key exists only as a tenant override, so global toggle remains disabled.",
          enabled: "Enabled",
          disabled: "Disabled",
          globalDefault: "Platform default",
          overrideCount: "override(s)",
          selectedOverride: "selected scope",
          updatedByFallback: "actor pending contract",
          tableTitle: "Feature flag registry",
          tableSubtitle:
            "KEY, rollout state, per-tenant overrides, last changed by, last changed at, and availableActions.",
          rolloutCol: "Rollout",
          overrideCol: "Overrides",
          updatedByCol: "Updated by",
          atCol: "Changed at",
          actionsCol: "Actions",
          globalState: "Global state",
          overrideState: "Override state",
          lastLoaded: "Last loaded",
          refreshTier: "Refresh tier",
          selectedTenantScope: "Selected tenant scope",
          openAudit: "Open audit",
          removeUnsupported:
            "Remove override returns the selected tenant to platform default while keeping the global flag unchanged.",
          toggleConfirmTitle: "Confirm global default change",
          toggleConfirmBody:
            "This changes the platform-issued default. Existing tenant overrides remain visible and are not removed.",
          overrideConfirmTitle: "Apply tenant override",
          overrideConfirmBody:
            "This writes a tenant-specific override for the selected scope and keeps the global default intact.",
          removeConfirmTitle: "Remove tenant override",
          removeConfirmBody:
            "This deletes the tenant-specific override for the selected scope and falls back to the platform default.",
          reasonLabel: "Reason",
          reasonHint:
            "Required for high-risk actions. The reason should be audit-safe and reviewer-readable.",
          descriptionLabel: "Override description",
          stateLabel: "Override state",
          cancel: "Cancel",
          submitToggle: "Confirm change",
          submitOverride: "Apply override",
          submitRemove: "Remove override",
          selectedScopeOnly: "Selected tenant overrides",
          platformOnly: "Platform defaults",
          tenantOverridesOnly: "Tenant overrides",
          midRolloutOnly: "Mid-rollout",
          deprecatedOnly: "Deprecated",
          allScopes: "All flags",
        }
      : {
          pageTitle: "Feature Flags · WRITE authority",
          pageSubtitle:
            "只有這個頁面能改寫旗標狀態；ops / tenant / driver 端依 Q-X16 僅能讀取過濾後結果。",
          breadcrumbParent: "平台維運",
          loading: "載入功能旗標中…",
          refresh: "重新整理",
          refreshing: "重新整理中…",
          searchLabel: "依 key 搜尋",
          searchPlaceholder: "搜尋 key 或 tenant scope",
          scopeLabel: "範圍篩選",
          tenantLabel: "Tenant focus",
          tenantDefault: "全部 tenant 範圍",
          tenantRequired: "選擇 tenant 後，tenant override 相關操作才會啟用。",
          scopeHint:
            "依 packet §5，同時提供 scope 篩選與 key 搜尋；selected tenant 也會直接影響 availableActions。",
          summaryTitle: "治理範圍",
          summarySubtitle:
            "這個頁面同時承接 T4 refresh、需原因的高風險寫入，以及 cross-app ops context。",
          selectedTitle: "選取中的旗標",
          selectedSubtitle:
            "所有 CTA 由 availableActions 決定，不用角色硬編碼；高風險寫入一律需填原因。",
          notesTitle: "Contract 備註",
          notesSubtitle:
            "目前 API 仍是 legacy feature-flag summary shape；頁面層將它包成治理用 UI 狀態。",
          notesFallback:
            "目前沒有回傳 contract notes，但治理行為仍依 packet §5 落實。",
          overrideMatrixTitle: "Tenant override matrix",
          overrideMatrixSubtitle:
            "保留各 tenant override 可見性，方便判斷 blast radius 並直接跳去 ops context。",
          emptyCoverageTitle: "EmptyReason 覆蓋",
          emptyCoverageSubtitle:
            "把 admin 適用的 6 種 EmptyReason 都做成 distinct state，方便 QA 與 reviewer 驗證。",
          guardrailTitle: "寫入權限只在這裡。",
          guardrailBody:
            "全域預設 toggle 與 tenant override 只在這個頁面治理；其他 app 僅讀取過濾後端點。",
          degradedTitle: "部分 tenant scope 重新整理失敗。",
          degradedBody:
            "頁面仍保留最近一次成功的 global snapshot，但至少有一個 tenant override scope 正在降級。",
          errorTitle: "功能旗標治理畫面重新整理失敗。",
          selectPrompt:
            "先選一筆 flag row，再往下看 override 深度與可執行動作。",
          latestReceipt: "最近一次動作收據",
          viewAudit: "查看稽核軌跡",
          viewOps: "開啟 ops context",
          clearFilters: "清除篩選",
          noDescription: "尚未提供描述",
          noGlobal: "沒有 global default",
          noGlobalBody:
            "這個 key 目前只存在 tenant override，因此 global toggle 會維持停用。",
          enabled: "啟用",
          disabled: "停用",
          globalDefault: "平台預設",
          overrideCount: "筆 override",
          selectedOverride: "目前 scope",
          updatedByFallback: "actor contract 未提供",
          tableTitle: "Feature flag registry",
          tableSubtitle:
            "呈現 KEY、rollout state、tenant override、最後變更者、最後變更時間，以及 availableActions。",
          rolloutCol: "Rollout",
          overrideCol: "Overrides",
          updatedByCol: "Updated by",
          atCol: "變更時間",
          actionsCol: "Actions",
          globalState: "Global state",
          overrideState: "Override state",
          lastLoaded: "最近載入",
          refreshTier: "Refresh tier",
          selectedTenantScope: "目前 tenant scope",
          openAudit: "開啟稽核",
          removeUnsupported:
            "移除 override 會讓所選 tenant 回退到平台預設值，不會改動全域旗標。",
          toggleConfirmTitle: "確認切換全域預設值",
          toggleConfirmBody:
            "這會改變平台發出的預設值；既有 tenant override 仍會保留並持續可見。",
          overrideConfirmTitle: "套用 tenant override",
          overrideConfirmBody:
            "這會為所選 tenant 寫入專屬 override，不會覆寫平台預設值。",
          removeConfirmTitle: "移除 tenant override",
          removeConfirmBody:
            "這會刪除所選 scope 的 tenant-specific override，並回退到平台預設值。",
          reasonLabel: "原因",
          reasonHint:
            "高風險操作必填；原因內容應可直接寫入 audit，讓 reviewer 能讀懂決策脈絡。",
          descriptionLabel: "Override 描述",
          stateLabel: "Override 狀態",
          cancel: "取消",
          submitToggle: "確認變更",
          submitOverride: "套用 override",
          submitRemove: "移除 override",
          selectedScopeOnly: "所選 tenant 的 override",
          platformOnly: "平台預設",
          tenantOverridesOnly: "Tenant override",
          midRolloutOnly: "部分 rollout",
          deprecatedOnly: "已棄用",
          allScopes: "全部旗標",
        };

  const loadData = useCallback(
    async (mode: "initial" | "manual" | "poll" = "manual") => {
      if (mode === "initial") {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      try {
        const [tenantList, nextGlobalSummary] = await Promise.all([
          client.listPlatformTenants(),
          client.getFeatureFlags(),
        ]);

        const settled = await Promise.allSettled(
          tenantList.map(async (tenant: PlatformAdminTenantRecord) => ({
            tenant,
            summary: await client.getFeatureFlags({ tenantId: tenant.id }),
          })),
        );

        const nextTenantSummaries: Record<string, FeatureFlagSummary> = {};
        const nextSnapshotIssues: SnapshotIssue[] = [];

        settled.forEach(
          (
            result: PromiseSettledResult<{
              tenant: PlatformAdminTenantRecord;
              summary: FeatureFlagSummary;
            }>,
            index: number,
          ) => {
            if (result.status === "fulfilled") {
              nextTenantSummaries[result.value.tenant.id] =
                result.value.summary;
              return;
            }

            const failedTenant = tenantList[index];
            if (!failedTenant) {
              return;
            }
            nextSnapshotIssues.push({
              tenantId: failedTenant.id,
              tenantCode: failedTenant.code,
              message:
                result.reason instanceof Error
                  ? result.reason.message
                  : String(result.reason),
            });
          },
        );

        setGlobalSummary(nextGlobalSummary);
        setTenants(tenantList);
        setTenantSummaries(nextTenantSummaries);
        setSnapshotIssues(nextSnapshotIssues);
        setError(null);
        setLastLoadedAt(Date.now());
      } catch (nextError: unknown) {
        setError(
          nextError instanceof Error ? nextError.message : String(nextError),
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [client],
  );

  useEffect(() => {
    void loadData("initial");
  }, [loadData]);

  useEffect(() => {
    const refreshId = window.setInterval(() => {
      void loadData("poll");
    }, REFRESH_INTERVAL_MS);
    const clockId = window.setInterval(() => {
      setClockNow(Date.now());
    }, 5_000);

    return () => {
      window.clearInterval(refreshId);
      window.clearInterval(clockId);
    };
  }, [loadData]);

  useEffect(() => {
    if (!selectedTenantId && scopeFilter === "selected_tenant") {
      setScopeFilter("all");
    }
  }, [scopeFilter, selectedTenantId]);

  const rows = useMemo(
    () =>
      buildRows({
        globalFlags: globalSummary?.flags ?? [],
        tenants,
        tenantSummaries,
        selectedTenantId,
      }),
    [globalSummary, selectedTenantId, tenantSummaries, tenants],
  );

  const filteredRows = useMemo(
    () => filterRows(rows, search, scopeFilter, selectedTenantId),
    [rows, search, scopeFilter, selectedTenantId],
  );

  useEffect(() => {
    if (!filteredRows.length) {
      setSelectedFlagKey(null);
      return;
    }
    if (
      !selectedFlagKey ||
      !filteredRows.some((row) => row.key === selectedFlagKey)
    ) {
      setSelectedFlagKey(filteredRows[0]?.key ?? null);
    }
  }, [filteredRows, selectedFlagKey]);

  const selectedTenant =
    tenants.find((tenant) => tenant.id === selectedTenantId) ?? null;
  const selectedRow =
    rows.find((row) => row.key === selectedFlagKey) ??
    filteredRows.find((row) => row.key === selectedFlagKey) ??
    null;

  const totalOverrideCount = rows.reduce(
    (sum, row) => sum + row.overrides.length,
    0,
  );
  const midRolloutCount = rows.filter(
    (row) => row.rolloutState === "mid_rollout",
  ).length;
  const deprecatedCount = rows.filter(
    (row) => row.rolloutState === "deprecated",
  ).length;
  const enabledGlobalCount = rows.filter((row) => row.global?.enabled).length;

  const dataFreshness = useMemo(() => {
    if (error) {
      const reason = classifyErrorReason(error);
      return reason === "external_unavailable" ? "degraded" : "unknown";
    }
    if (snapshotIssues.length > 0) {
      return "degraded";
    }
    if (!lastLoadedAt) {
      return "unknown";
    }
    if (clockNow - lastLoadedAt > REFRESH_INTERVAL_MS * 2) {
      return "stale";
    }
    return "fresh";
  }, [clockNow, error, lastLoadedAt, snapshotIssues.length]);

  const refreshChip = refreshMeta(locale, dataFreshness);

  const activeEmptyReason = useMemo(() => {
    if (filteredRows.length > 0) {
      return null;
    }
    if (error) {
      return classifyErrorReason(error);
    }
    if (scopeFilter === "selected_tenant" || selectedTenantId) {
      return "not_provisioned";
    }
    if (search.trim() || scopeFilter !== "all") {
      return "filtered_empty";
    }
    return rows.length === 0 ? "no_data" : "filtered_empty";
  }, [
    error,
    filteredRows.length,
    rows.length,
    scopeFilter,
    search,
    selectedTenantId,
  ]);

  const selectedRowActions = selectedRow?.availableActions ?? [];
  const selectedAddOverride = getActionDescriptor(
    selectedRowActions,
    "add_tenant_override",
  );
  const selectedHistory = getActionDescriptor(
    selectedRowActions,
    "view_change_history",
  );
  const selectedToggle = getActionDescriptor(
    selectedRowActions,
    "toggle_global",
  );
  const selectedRemoveOverride = getActionDescriptor(
    selectedRowActions,
    "remove_tenant_override",
  );

  const tableRows = useMemo<FeatureFlagTableRow[]>(
    () =>
      filteredRows.map((row) => ({
        ...row,
        _selected: row.key === selectedFlagKey,
      })),
    [filteredRows, selectedFlagKey],
  );

  const scopeOptions: { value: ScopeFilter; label: string }[] = [
    { value: "all", label: copy.allScopes },
    { value: "platform_default", label: copy.platformOnly },
    { value: "tenant_overrides", label: copy.tenantOverridesOnly },
    { value: "selected_tenant", label: copy.selectedScopeOnly },
    { value: "mid_rollout", label: copy.midRolloutOnly },
    { value: "deprecated", label: copy.deprecatedOnly },
  ];

  const emptyActionNode =
    activeEmptyReason === "filtered_empty" ? (
      <button
        type="button"
        onClick={() => {
          setSearch("");
          setScopeFilter("all");
        }}
        style={buttonStyle(theme, {
          action: "clear_filters",
          enabled: true,
          riskLevel: "low",
        })}
      >
        <CanvasIcon name="filter" size={13} />
        {copy.clearFilters}
      </button>
    ) : null;

  const columns: CanvasTableColumn<FeatureFlagTableRow>[] = [
    {
      h: "KEY",
      w: 280,
      r: (row) => (
        <button
          type="button"
          onClick={() => setSelectedFlagKey(row.key)}
          style={keyButtonStyle}
        >
          <code style={codeStyle}>{row.key}</code>
          <div style={secondaryTextStyle}>
            {row.description === "—" ? copy.noDescription : row.description}
          </div>
        </button>
      ),
    },
    {
      h: copy.rolloutCol,
      w: 220,
      r: (row) => (
        <div style={stackedCellStyle}>
          <div style={pillRowStyle}>
            <CanvasPill theme={theme} tone={rolloutTone(row.rolloutState)} dot>
              {rolloutLabel(locale, row.rolloutState)}
            </CanvasPill>
            <CanvasPill
              theme={theme}
              tone={row.global?.enabled ? "success" : "neutral"}
            >
              {row.global
                ? row.global.enabled
                  ? copy.enabled
                  : copy.disabled
                : copy.noGlobal}
            </CanvasPill>
          </div>
          <div style={secondaryTextStyle}>
            {row.global
              ? `${copy.globalDefault} · ${
                  row.global.enabled ? copy.enabled : copy.disabled
                }`
              : copy.noGlobalBody}
          </div>
        </div>
      ),
    },
    {
      h: copy.overrideCol,
      w: 260,
      r: (row) => (
        <div style={stackedCellStyle}>
          <div style={pillRowStyle}>
            <CanvasPill theme={theme} tone="accent">
              {row.overrides.length} {copy.overrideCount}
            </CanvasPill>
            {row.selectedTenantOverride ? (
              <CanvasPill theme={theme} tone="info">
                {copy.selectedOverride}
              </CanvasPill>
            ) : null}
          </div>
          {row.overrides.length > 0 ? (
            <div style={secondaryTextStyle}>
              {row.overrides
                .slice(0, 3)
                .map((override) => override.tenantCode)
                .join(", ")}
              {row.overrides.length > 3 ? ` +${row.overrides.length - 3}` : ""}
            </div>
          ) : (
            <div style={secondaryTextStyle}>{copy.tenantRequired}</div>
          )}
        </div>
      ),
    },
    {
      h: copy.updatedByCol,
      w: 220,
      r: (row) => (
        <div style={stackedCellStyle}>
          <span style={secondaryTextStyle}>{row.updatedBy}</span>
          <span style={secondaryMonoStyle}>{copy.updatedByFallback}</span>
        </div>
      ),
    },
    {
      h: copy.atCol,
      w: 160,
      mono: true,
      r: (row) => formatDateTime(row.latestUpdatedAt),
    },
    {
      h: copy.actionsCol,
      w: 360,
      r: (row) => (
        <div style={actionRowStyle}>
          <DescriptorButton
            theme={theme}
            locale={locale}
            descriptor={getActionDescriptor(
              row.availableActions,
              "toggle_global",
            )}
            size="xs"
            onClick={() => {
              setSelectedFlagKey(row.key);
              setPendingAction({
                kind: "toggle_global",
                row,
                descriptor: getActionDescriptor(
                  row.availableActions,
                  "toggle_global",
                )!,
                nextEnabled: !(row.global?.enabled ?? false),
              });
              setActionReason("");
            }}
          />
          <DescriptorButton
            theme={theme}
            locale={locale}
            descriptor={getActionDescriptor(
              row.availableActions,
              "add_tenant_override",
            )}
            size="xs"
            onClick={() => {
              if (!selectedTenantId) {
                return;
              }
              setSelectedFlagKey(row.key);
              setPendingAction({
                kind: "add_tenant_override",
                row,
                descriptor: getActionDescriptor(
                  row.availableActions,
                  "add_tenant_override",
                )!,
                tenantId: selectedTenantId,
                enabled:
                  row.selectedTenantOverride?.enabled ??
                  !(row.global?.enabled ?? false),
                description:
                  row.selectedTenantOverride?.description ??
                  row.global?.description ??
                  "",
              });
              setActionReason("");
            }}
          />
          <DescriptorButton
            theme={theme}
            locale={locale}
            descriptor={getActionDescriptor(
              row.availableActions,
              "remove_tenant_override",
            )}
            size="xs"
            onClick={() => {
              if (!selectedTenantId || !row.selectedTenantOverride) {
                return;
              }
              setSelectedFlagKey(row.key);
              setPendingAction({
                kind: "remove_tenant_override",
                row,
                descriptor: getActionDescriptor(
                  row.availableActions,
                  "remove_tenant_override",
                )!,
                tenantId: selectedTenantId,
              });
              setActionReason("");
            }}
          />
          <DescriptorButton
            theme={theme}
            locale={locale}
            descriptor={getActionDescriptor(
              row.availableActions,
              "view_change_history",
            )}
            size="xs"
            onClick={() => {
              window.open(auditHref(row.key), "_blank", "noopener,noreferrer");
            }}
          />
        </div>
      ),
    },
  ];

  const submitPendingAction = useCallback(async () => {
    if (!pendingAction) {
      return;
    }
    if (pendingAction.descriptor.requiresReason && !actionReason.trim()) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      if (pendingAction.kind === "toggle_global") {
        await client.updateFeatureFlag(
          pendingAction.row.key,
          pendingAction.nextEnabled,
        );
        setReceipt({
          status: "completed",
          title:
            locale === "en" ? "Global default updated" : "已更新全域預設值",
          message:
            locale === "en"
              ? `${pendingAction.row.key} now resolves ${pendingAction.nextEnabled ? "enabled" : "disabled"} by default.`
              : `${pendingAction.row.key} 的平台預設已切換為${
                  pendingAction.nextEnabled ? "啟用" : "停用"
                }。`,
          auditHref: auditHref(pendingAction.row.key),
          resourceLink:
            pendingAction.row.selectedTenantOverride?.crossLink ??
            pendingAction.row.overrides[0]?.crossLink ??
            null,
        });
      } else if (pendingAction.kind === "add_tenant_override") {
        await client.upsertFeatureFlagTenantOverride(
          pendingAction.row.key,
          pendingAction.tenantId,
          {
            enabled: pendingAction.enabled,
            description: pendingAction.description.trim() || undefined,
          },
        );

        const targetTenant =
          tenants.find((tenant) => tenant.id === pendingAction.tenantId) ??
          null;

        setReceipt({
          status: "completed",
          title:
            locale === "en"
              ? "Tenant override applied"
              : "已套用 tenant override",
          message:
            locale === "en"
              ? `${pendingAction.row.key} now carries a tenant-specific value for ${targetTenant?.code ?? pendingAction.tenantId}.`
              : `${pendingAction.row.key} 已為 ${
                  targetTenant?.code ?? pendingAction.tenantId
                } 寫入 tenant-specific override。`,
          auditHref: auditHref(pendingAction.row.key),
          resourceLink: targetTenant
            ? buildOpsDeepLink(targetTenant, pendingAction.row.key)
            : null,
        });
      } else {
        await client.removeFeatureFlagTenantOverride(
          pendingAction.row.key,
          pendingAction.tenantId,
        );

        const targetTenant =
          tenants.find((tenant) => tenant.id === pendingAction.tenantId) ??
          null;

        setReceipt({
          status: "completed",
          title:
            locale === "en"
              ? "Tenant override removed"
              : "已移除 tenant override",
          message:
            locale === "en"
              ? `${pendingAction.row.key} now falls back to the platform default for ${targetTenant?.code ?? pendingAction.tenantId}.`
              : `${pendingAction.row.key} 已為 ${
                  targetTenant?.code ?? pendingAction.tenantId
                } 移除 tenant override，並回退到平台預設值。`,
          auditHref: auditHref(pendingAction.row.key),
          resourceLink: targetTenant
            ? buildOpsDeepLink(targetTenant, pendingAction.row.key)
            : null,
        });
      }

      setPendingAction(null);
      setActionReason("");
      await loadData("manual");
    } catch (nextError: unknown) {
      const message =
        nextError instanceof Error ? nextError.message : String(nextError);
      setError(message);
      setReceipt({
        status: "failed",
        title: locale === "en" ? "Write failed" : "寫入失敗",
        message,
        auditHref:
          pendingAction.kind === "toggle_global"
            ? auditHref(pendingAction.row.key)
            : auditHref(pendingAction.row.key),
        resourceLink: null,
      });
    } finally {
      setSubmitting(false);
    }
  }, [actionReason, client, loadData, locale, pendingAction, tenants]);

  return (
    <CanvasShell
      theme={theme}
      nav={buildPlatformNav(locale)}
      active="flags"
      brandLabel={t("app.name")}
      brandSubLabel={t("app.sub")}
      breadcrumb={[copy.breadcrumbParent, copy.pageTitle]}
      env="production"
      versionLabel="canvas"
      searchPlaceholder={
        locale === "en"
          ? "Search key, tenant, or ops scope…"
          : "搜尋 key、tenant 或 ops scope…"
      }
      avatarLabel={locale === "en" ? "PA" : "平台"}
      style={shellStyle}
    >
      <CanvasPageHeader
        theme={theme}
        title={copy.pageTitle}
        subtitle={copy.pageSubtitle}
        actions={
          <>
            <CanvasPill theme={theme} tone={refreshChip.tone} dot>
              {refreshChip.label}
            </CanvasPill>
            <button
              type="button"
              onClick={() => void loadData("manual")}
              style={buttonStyle(theme, {
                action: "refresh",
                enabled: true,
                riskLevel: "low",
              })}
            >
              <CanvasIcon name="arrow" size={13} />
              {refreshing ? copy.refreshing : copy.refresh}
            </button>
          </>
        }
      />

      <div style={bodyStyle}>
        {loading && !globalSummary ? (
          <CanvasCard
            theme={theme}
            title={copy.pageTitle}
            subtitle={copy.loading}
          >
            <div style={loadingStateStyle}>{copy.loading}</div>
          </CanvasCard>
        ) : (
          <>
            {error ? (
              <CanvasBanner
                theme={theme}
                tone="danger"
                title={copy.errorTitle}
                body={error}
              />
            ) : null}

            {snapshotIssues.length > 0 ? (
              <CanvasBanner
                theme={theme}
                tone="warn"
                icon="warn"
                title={copy.degradedTitle}
                body={`${copy.degradedBody} ${snapshotIssues
                  .map((issue) => issue.tenantCode)
                  .join(", ")}`}
              />
            ) : null}

            {receipt ? (
              <CanvasBanner
                theme={theme}
                tone={receipt.status === "failed" ? "danger" : "success"}
                icon={receipt.status === "failed" ? "warn" : "check"}
                title={`${copy.latestReceipt} · ${receipt.title}`}
                body={
                  <div style={stackedCellStyle}>
                    <span>{receipt.message}</span>
                    <div style={metaRowStyle}>
                      <a href={receipt.auditHref} style={deepLinkStyle}>
                        {copy.viewAudit}
                        <CanvasIcon name="audit" size={12} />
                      </a>
                      {receipt.resourceLink ? (
                        <a
                          href={crossAppHref(receipt.resourceLink)}
                          target="_blank"
                          rel="noreferrer"
                          style={deepLinkStyle}
                        >
                          {copy.viewOps}
                          <CanvasIcon name="ext" size={12} />
                        </a>
                      ) : null}
                    </div>
                  </div>
                }
              />
            ) : null}

            <CanvasBanner
              theme={theme}
              tone="info"
              icon="flags"
              title={copy.guardrailTitle}
              body={copy.guardrailBody}
            />

            <div style={kpiGridStyle}>
              <CanvasKPI
                theme={theme}
                label="flag keys"
                value={rows.length}
                sub={copy.tableTitle}
              />
              <CanvasKPI
                theme={theme}
                label={copy.globalState}
                value={enabledGlobalCount}
                delta={`${rows.length - enabledGlobalCount} ${copy.disabled.toLowerCase()}`}
                deltaTone={enabledGlobalCount > 0 ? "up" : "neutral"}
                sub={copy.globalDefault}
              />
              <CanvasKPI
                theme={theme}
                label="mid-rollout"
                value={midRolloutCount}
                delta={`${deprecatedCount} deprecated`}
                deltaTone={midRolloutCount > 0 ? "down" : "neutral"}
                sub={`${totalOverrideCount} ${copy.overrideCount}`}
              />
              <CanvasKPI
                theme={theme}
                label={copy.refreshTier}
                value="T4"
                sub={
                  lastLoadedAt
                    ? formatDateTime(new Date(lastLoadedAt).toISOString())
                    : "—"
                }
                hint={
                  lastLoadedAt
                    ? timeSinceMs(clockNow - lastLoadedAt, locale)
                    : undefined
                }
              />
            </div>

            <div style={topGridStyle}>
              <CanvasCard
                theme={theme}
                title={copy.summaryTitle}
                subtitle={copy.summarySubtitle}
              >
                <div style={fieldGridStyle}>
                  <CanvasField theme={theme} label={copy.searchLabel}>
                    <input
                      type="text"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder={copy.searchPlaceholder}
                      style={inputStyle}
                    />
                  </CanvasField>
                  <CanvasField theme={theme} label={copy.scopeLabel}>
                    <select
                      value={scopeFilter}
                      onChange={(event) =>
                        setScopeFilter(event.target.value as ScopeFilter)
                      }
                      style={inputStyle}
                    >
                      {scopeOptions.map((option) => (
                        <option
                          key={option.value}
                          value={option.value}
                          disabled={
                            option.value === "selected_tenant" &&
                            !selectedTenantId
                          }
                        >
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </CanvasField>
                  <CanvasField theme={theme} label={copy.tenantLabel}>
                    <select
                      value={selectedTenantId}
                      onChange={(event) =>
                        setSelectedTenantId(event.target.value)
                      }
                      style={inputStyle}
                    >
                      <option value="">{copy.tenantDefault}</option>
                      {tenants.map((tenant) => (
                        <option key={tenant.id} value={tenant.id}>
                          {tenant.name} ({tenant.code})
                        </option>
                      ))}
                    </select>
                  </CanvasField>
                </div>
                <div style={helperTextStyle}>{copy.scopeHint}</div>
                <div style={{ marginTop: 16 }}>
                  <CanvasDL
                    theme={theme}
                    cols={2}
                    items={[
                      {
                        label: copy.selectedTenantScope,
                        value: selectedTenant
                          ? `${selectedTenant.name} (${selectedTenant.code})`
                          : copy.tenantDefault,
                      },
                      {
                        label: copy.lastLoaded,
                        value: lastLoadedAt
                          ? formatDateTime(new Date(lastLoadedAt).toISOString())
                          : "—",
                      },
                      {
                        label: copy.refreshTier,
                        value: "T4 · 30s",
                      },
                      {
                        label: copy.scopeLabel,
                        value:
                          scopeOptions.find(
                            (option) => option.value === scopeFilter,
                          )?.label ?? copy.allScopes,
                      },
                    ]}
                  />
                </div>
              </CanvasCard>

              <CanvasCard
                theme={theme}
                title={copy.selectedTitle}
                subtitle={copy.selectedSubtitle}
                actions={
                  <div style={actionRowStyle}>
                    <DescriptorButton
                      theme={theme}
                      locale={locale}
                      descriptor={selectedToggle}
                      onClick={() => {
                        if (!selectedRow || !selectedToggle) {
                          return;
                        }
                        setPendingAction({
                          kind: "toggle_global",
                          row: selectedRow,
                          descriptor: selectedToggle,
                          nextEnabled: !(selectedRow.global?.enabled ?? false),
                        });
                        setActionReason("");
                      }}
                    />
                    <DescriptorButton
                      theme={theme}
                      locale={locale}
                      descriptor={selectedAddOverride}
                      onClick={() => {
                        if (
                          !selectedRow ||
                          !selectedAddOverride ||
                          !selectedTenantId
                        ) {
                          return;
                        }
                        setPendingAction({
                          kind: "add_tenant_override",
                          row: selectedRow,
                          descriptor: selectedAddOverride,
                          tenantId: selectedTenantId,
                          enabled:
                            selectedRow.selectedTenantOverride?.enabled ??
                            !(selectedRow.global?.enabled ?? false),
                          description:
                            selectedRow.selectedTenantOverride?.description ??
                            selectedRow.global?.description ??
                            "",
                        });
                        setActionReason("");
                      }}
                    />
                    <DescriptorButton
                      theme={theme}
                      locale={locale}
                      descriptor={selectedRemoveOverride}
                      onClick={() => {
                        if (
                          !selectedRow ||
                          !selectedRemoveOverride ||
                          !selectedTenantId ||
                          !selectedRow.selectedTenantOverride
                        ) {
                          return;
                        }
                        setPendingAction({
                          kind: "remove_tenant_override",
                          row: selectedRow,
                          descriptor: selectedRemoveOverride,
                          tenantId: selectedTenantId,
                        });
                        setActionReason("");
                      }}
                    />
                  </div>
                }
              >
                {selectedRow ? (
                  <div style={stackedCellStyle}>
                    <div style={pillRowStyle}>
                      <code style={codeStyle}>{selectedRow.key}</code>
                      <CanvasPill
                        theme={theme}
                        tone={rolloutTone(selectedRow.rolloutState)}
                        dot
                      >
                        {rolloutLabel(locale, selectedRow.rolloutState)}
                      </CanvasPill>
                    </div>
                    <CanvasDL
                      theme={theme}
                      cols={2}
                      items={[
                        {
                          label: copy.globalState,
                          value: selectedRow.global
                            ? selectedRow.global.enabled
                              ? copy.enabled
                              : copy.disabled
                            : copy.noGlobal,
                        },
                        {
                          label: copy.overrideState,
                          value: selectedRow.selectedTenantOverride
                            ? selectedRow.selectedTenantOverride.enabled
                              ? copy.enabled
                              : copy.disabled
                            : copy.noGlobal,
                        },
                        {
                          label: copy.selectedTenantScope,
                          value: selectedTenant
                            ? `${selectedTenant.name} (${selectedTenant.code})`
                            : copy.tenantDefault,
                        },
                        {
                          label: copy.updatedByCol,
                          value: selectedRow.updatedBy,
                        },
                        {
                          label: copy.atCol,
                          value: formatDateTime(selectedRow.latestUpdatedAt),
                        },
                        {
                          label: copy.notesTitle,
                          value:
                            selectedRow.description === "—"
                              ? copy.noDescription
                              : selectedRow.description,
                        },
                      ]}
                    />
                    <div style={metaRowStyle}>
                      <a
                        href={auditHref(selectedRow.key)}
                        style={deepLinkStyle}
                      >
                        {copy.openAudit}
                        <CanvasIcon name="audit" size={12} />
                      </a>
                      {selectedRow.selectedTenantOverride ? (
                        <a
                          href={crossAppHref(
                            selectedRow.selectedTenantOverride.crossLink,
                          )}
                          target="_blank"
                          rel="noreferrer"
                          style={deepLinkStyle}
                        >
                          {copy.viewOps}
                          <CanvasIcon name="ext" size={12} />
                        </a>
                      ) : null}
                    </div>
                    <div style={helperTextStyle}>{copy.removeUnsupported}</div>
                    {selectedHistory ? (
                      <div style={actionRowStyle}>
                        <DescriptorButton
                          theme={theme}
                          locale={locale}
                          descriptor={selectedHistory}
                          onClick={() => {
                            window.open(
                              auditHref(selectedRow.key),
                              "_blank",
                              "noopener,noreferrer",
                            );
                          }}
                        />
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <EmptyStateCard
                    theme={theme}
                    locale={locale}
                    reason="no_data"
                    compact
                    messageOverride={copy.selectPrompt}
                  />
                )}
              </CanvasCard>
            </div>

            <CanvasCard
              theme={theme}
              title={copy.tableTitle}
              subtitle={copy.tableSubtitle}
              style={{ overflow: "hidden" }}
            >
              {filteredRows.length === 0 && activeEmptyReason ? (
                <EmptyStateCard
                  theme={theme}
                  locale={locale}
                  reason={activeEmptyReason}
                  {...(error ? { messageOverride: error } : {})}
                  actionNode={emptyActionNode}
                />
              ) : (
                <CanvasTable<FeatureFlagTableRow>
                  theme={theme}
                  columns={columns}
                  rows={tableRows}
                />
              )}
            </CanvasCard>

            <div style={bottomGridStyle}>
              <CanvasCard
                theme={theme}
                title={copy.overrideMatrixTitle}
                subtitle={copy.overrideMatrixSubtitle}
              >
                {selectedRow?.overrides.length ? (
                  <div style={{ display: "grid", gap: 12 }}>
                    {selectedRow.overrides.map((override) => (
                      <div
                        key={`${selectedRow.key}-${override.tenantId}`}
                        style={{
                          padding: 12,
                          borderRadius: 8,
                          border: `1px solid ${theme.border}`,
                          background: theme.surfaceLo,
                          display: "grid",
                          gap: 8,
                        }}
                      >
                        <div style={pillRowStyle}>
                          <CanvasPill theme={theme} tone="accent">
                            {override.tenantCode}
                          </CanvasPill>
                          <CanvasPill
                            theme={theme}
                            tone={override.enabled ? "success" : "neutral"}
                            dot
                          >
                            {override.enabled ? copy.enabled : copy.disabled}
                          </CanvasPill>
                          {selectedTenantId === override.tenantId ? (
                            <CanvasPill theme={theme} tone="info">
                              {copy.selectedOverride}
                            </CanvasPill>
                          ) : null}
                        </div>
                        <div style={secondaryTextStyle}>
                          {override.tenantName}
                        </div>
                        <div style={secondaryMonoStyle}>
                          {formatDateTime(override.updatedAt)}
                        </div>
                        <div style={metaRowStyle}>
                          <a
                            href={crossAppHref(override.crossLink)}
                            target="_blank"
                            rel="noreferrer"
                            style={deepLinkStyle}
                          >
                            {copy.viewOps}
                            <CanvasIcon name="ext" size={12} />
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyStateCard
                    theme={theme}
                    locale={locale}
                    reason={selectedTenantId ? "not_provisioned" : "no_data"}
                    compact
                    messageOverride={
                      selectedTenantId ? copy.tenantRequired : copy.selectPrompt
                    }
                  />
                )}
              </CanvasCard>

              <CanvasCard
                theme={theme}
                title={copy.emptyCoverageTitle}
                subtitle={copy.emptyCoverageSubtitle}
              >
                <div style={{ display: "grid", gap: 12 }}>
                  {EMPTY_REASON_ORDER.map((reason) => (
                    <EmptyStateCard
                      key={reason}
                      theme={theme}
                      locale={locale}
                      reason={reason}
                      compact
                    />
                  ))}
                </div>
              </CanvasCard>
            </div>

            <CanvasCard
              theme={theme}
              title={copy.notesTitle}
              subtitle={copy.notesSubtitle}
            >
              {globalSummary?.notes?.length ? (
                <ul style={noteListStyle}>
                  {globalSummary.notes.map((note: string, index: number) => (
                    <li key={`${note}-${index}`}>{note}</li>
                  ))}
                </ul>
              ) : (
                <div style={secondaryTextStyle}>{copy.notesFallback}</div>
              )}
            </CanvasCard>
          </>
        )}
      </div>

      {pendingAction ? (
        <div style={modalBackdropStyle}>
          <div style={modalCardStyle}>
            <div style={modalHeaderStyle}>
              <div style={{ fontSize: 15, fontWeight: 700, color: theme.text }}>
                {pendingAction.kind === "toggle_global"
                  ? copy.toggleConfirmTitle
                  : pendingAction.kind === "add_tenant_override"
                    ? copy.overrideConfirmTitle
                    : copy.removeConfirmTitle}
              </div>
              <div style={secondaryTextStyle}>
                {pendingAction.kind === "toggle_global"
                  ? copy.toggleConfirmBody
                  : pendingAction.kind === "add_tenant_override"
                    ? copy.overrideConfirmBody
                    : copy.removeConfirmBody}
              </div>
            </div>

            <div style={modalBodyStyle}>
              <CanvasDL
                theme={theme}
                cols={2}
                items={[
                  {
                    label: "KEY",
                    value: pendingAction.row.key,
                    mono: true,
                  },
                  {
                    label: copy.refreshTier,
                    value: "T4 · 30s",
                  },
                  {
                    label: copy.selectedTenantScope,
                    value: selectedTenant
                      ? `${selectedTenant.name} (${selectedTenant.code})`
                      : copy.tenantDefault,
                  },
                  {
                    label: copy.globalState,
                    value: pendingAction.row.global
                      ? pendingAction.row.global.enabled
                        ? copy.enabled
                        : copy.disabled
                      : copy.noGlobal,
                  },
                ]}
              />

              {pendingAction.kind === "add_tenant_override" ? (
                <>
                  <CanvasField theme={theme} label={copy.stateLabel}>
                    <select
                      value={pendingAction.enabled ? "enabled" : "disabled"}
                      onChange={(event) =>
                        setPendingAction((current) =>
                          current?.kind === "add_tenant_override"
                            ? {
                                ...current,
                                enabled: event.target.value === "enabled",
                              }
                            : current,
                        )
                      }
                      style={inputStyle}
                    >
                      <option value="enabled">{copy.enabled}</option>
                      <option value="disabled">{copy.disabled}</option>
                    </select>
                  </CanvasField>

                  <CanvasField theme={theme} label={copy.descriptionLabel}>
                    <textarea
                      value={pendingAction.description}
                      onChange={(event) =>
                        setPendingAction((current) =>
                          current?.kind === "add_tenant_override"
                            ? {
                                ...current,
                                description: event.target.value,
                              }
                            : current,
                        )
                      }
                      style={textareaStyle}
                    />
                  </CanvasField>
                </>
              ) : null}

              <CanvasField
                theme={theme}
                label={copy.reasonLabel}
                hint={copy.reasonHint}
              >
                <textarea
                  value={actionReason}
                  onChange={(event) => setActionReason(event.target.value)}
                  style={textareaStyle}
                />
              </CanvasField>
            </div>

            <div style={modalFooterStyle}>
              <button
                type="button"
                disabled={submitting}
                onClick={() => {
                  setPendingAction(null);
                  setActionReason("");
                }}
                style={buttonStyle(theme, {
                  action: "cancel",
                  enabled: !submitting,
                  riskLevel: "low",
                })}
              >
                {copy.cancel}
              </button>
              <button
                type="button"
                disabled={submitting || !actionReason.trim()}
                onClick={() => void submitPendingAction()}
                style={buttonStyle(theme, {
                  action: "confirm",
                  enabled: !submitting && Boolean(actionReason.trim()),
                  riskLevel: "high",
                })}
              >
                <CanvasIcon name="check" size={13} />
                {submitting
                  ? locale === "en"
                    ? "Submitting…"
                    : "送出中…"
                  : pendingAction.kind === "toggle_global"
                    ? copy.submitToggle
                    : pendingAction.kind === "add_tenant_override"
                      ? copy.submitOverride
                      : copy.submitRemove}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </CanvasShell>
  );
}
