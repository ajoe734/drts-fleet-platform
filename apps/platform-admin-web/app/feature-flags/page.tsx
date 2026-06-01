"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentProps,
  type CSSProperties,
} from "react";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import { getPlatformLabel } from "@/lib/localized-labels";
import type {
  CrossAppResourceLink,
  EmptyReason,
  FeatureFlag,
  FeatureFlagSummary,
  PlatformAdminTenantRecord,
  RefreshTier,
  ResourceActionDescriptor,
  UiRefreshMetadata,
} from "@drts/contracts";
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
  CanvasTable,
  buildCanvasTheme,
  type CanvasShellNavItem,
  type CanvasTableColumn,
  type CanvasTheme,
  type CanvasTone,
} from "@drts/ui-web";

// CanvasIconName is not re-exported from @drts/ui-web's top-level barrel;
// derive the icon-name union from the CanvasIcon component props.
type CanvasIconName = ComponentProps<typeof CanvasIcon>["name"];

// ── Refresh tier (Q-X02) — packet §3.2: /feature-flags is T4 medium-slow (30s)
const REFRESH_TIER: RefreshTier = "medium_slow";
const REFRESH_CADENCE_MS: Record<RefreshTier, number | null> = {
  urgent: 5000,
  fast: 3000,
  dispatch: 5000,
  medium: 15000,
  medium_slow: 30000,
  slow: 30000,
  manual: null,
};

// ── Action kinds for this surface (packet §5.17 must-support actions) ────────
type FlagActionKind =
  | "toggle_global"
  | "toggle_override"
  | "add_override"
  | "remove_override"
  | "view_history";

// ── EmptyReason (Q-X15) — six platform treatments (driver_not_eligible is
//    driver-app only and never produced here). Each reason is rendered
//    distinctly (icon + tone + mono reason code + optional next action).
type PlatformEmptyReason = Exclude<EmptyReason, "driver_not_eligible">;

const EMPTY_TREATMENTS: Record<
  PlatformEmptyReason,
  { icon: CanvasIconName; tone: CanvasTone; nextAction?: "retry" | "clear" }
> = {
  no_data: { icon: "check", tone: "neutral" },
  not_provisioned: { icon: "adapters", tone: "info", nextAction: "clear" },
  fetch_failed: { icon: "warn", tone: "danger", nextAction: "retry" },
  permission_denied: { icon: "apiKeys", tone: "warn" },
  external_unavailable: {
    icon: "webhooks",
    tone: "accent",
    nextAction: "retry",
  },
  filtered_empty: { icon: "filter", tone: "neutral", nextAction: "clear" },
};

type RolloutState =
  | "fully_rolled_out"
  | "mid_rollout"
  | "global_only"
  | "override_only"
  | "deprecated";

type ScopeFilter = "all" | "platform" | "tenant_override";

type PendingAction =
  | {
      mode: "toggle";
      kind: FlagActionKind;
      key: string;
      tenantId: string | null;
      scope: "platform" | "tenant_override";
      nextEnabled: boolean;
      requiresReason: boolean;
    }
  | {
      mode: "add_override";
      kind: FlagActionKind;
      key: string;
      tenantId: string;
      enabled: boolean;
      requiresReason: boolean;
    };

type ActionReceiptState = {
  status: "completed" | "failed";
  key: string;
  message: string;
};

type FlagRow = {
  id: string;
  key: string;
  scope: "platform" | "tenant_override";
  tenantId: string | null;
  tenantLabel: string;
  enabled: boolean;
  description: string;
  updatedAt: string;
  updatedBy: string;
  rollout: RolloutState;
  actions: ResourceActionDescriptor[];
} & Record<string, unknown>;

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

const filterRowStyle = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  alignItems: "end",
} satisfies CSSProperties;

const headerActionsStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
} satisfies CSSProperties;

const loadingStateStyle = {
  color: theme.textMuted,
  fontSize: 12.5,
} satisfies CSSProperties;

const fieldHintStyle = {
  marginTop: 6,
  color: theme.textMuted,
  fontSize: 11.5,
  lineHeight: 1.45,
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

const keyCellStyle = {
  display: "grid",
  gap: 4,
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

const secondaryTextStyle = {
  color: theme.textMuted,
  fontSize: 11.5,
  lineHeight: 1.45,
  whiteSpace: "normal",
} satisfies CSSProperties;

const monoMutedStyle = {
  color: theme.textDim,
  fontFamily: theme.monoFamily,
  fontSize: 11,
  whiteSpace: "normal",
} satisfies CSSProperties;

const inlinePillRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  alignItems: "center",
} satisfies CSSProperties;

const stateCellStyle = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  minWidth: 0,
} satisfies CSSProperties;

const actionsCellStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
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

const overlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(8, 15, 31, 0.55)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  zIndex: 50,
} satisfies CSSProperties;

const dialogStyle = {
  width: "min(520px, 100%)",
  maxHeight: "calc(100vh - 64px)",
  overflow: "auto",
  background: theme.bg,
  border: `1px solid ${theme.border}`,
  borderRadius: 12,
  boxShadow: "0 24px 60px rgba(8, 15, 31, 0.45)",
  padding: 20,
  display: "grid",
  gap: 14,
} satisfies CSSProperties;

const reasonInputStyle = (th: CanvasTheme, valid: boolean): CSSProperties => ({
  width: "100%",
  minHeight: 72,
  boxSizing: "border-box",
  borderRadius: 7,
  border: `1px solid ${valid ? th.border : th.danger}`,
  background: th.bgRaised,
  color: th.text,
  fontFamily: th.fontFamily,
  fontSize: 12.5,
  padding: 10,
  resize: "vertical",
  outline: "none",
});

const linkRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  alignItems: "center",
} satisfies CSSProperties;

function toggleButtonStyle(
  th: CanvasTheme,
  enabled: boolean,
  disabled: boolean,
): CSSProperties {
  return {
    width: 42,
    height: 24,
    borderRadius: 999,
    border: `1px solid ${enabled ? th.accent : th.border}`,
    background: enabled ? th.accent : th.surfaceLo,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: enabled ? "flex-end" : "flex-start",
    padding: 2,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.55 : 1,
    transition: "all 120ms ease",
    flexShrink: 0,
  };
}

const toggleKnobStyle = {
  width: 18,
  height: 18,
  borderRadius: "50%",
  background: "#ffffff",
  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.25)",
  flexShrink: 0,
} satisfies CSSProperties;

const TONE_COLOR: Record<CanvasTone, string> = {
  neutral: theme.textMuted,
  info: theme.info,
  success: theme.success,
  warn: theme.warn,
  danger: theme.danger,
  accent: theme.accent,
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

function isDeprecated(flag: FeatureFlag): boolean {
  const text = `${flag.key} ${flag.description ?? ""}`.toLowerCase();
  return (
    text.includes("deprecated") ||
    text.includes("retired") ||
    text.includes("棄用") ||
    text.includes("淘汰")
  );
}

// Rollout state across every record sharing this key (Q-X16 mid-rollout view).
function computeRollout(key: string, allFlags: FeatureFlag[]): RolloutState {
  const peers = allFlags.filter((flag) => flag.key === key);
  if (peers.some(isDeprecated)) return "deprecated";

  const global = peers.find((flag) => !flag.tenantId) ?? null;
  const overrides = peers.filter((flag) => flag.tenantId);

  if (!global && overrides.length > 0) return "override_only";
  if (global && overrides.length === 0) return "global_only";

  const states = peers.map((flag) => flag.enabled);
  const allOn = states.every(Boolean);
  const allOff = states.every((value) => !value);
  if (allOn || allOff) return "fully_rolled_out";
  return "mid_rollout";
}

function rolloutTone(state: RolloutState): CanvasTone {
  switch (state) {
    case "mid_rollout":
      return "warn";
    case "deprecated":
      return "danger";
    case "override_only":
      return "info";
    default:
      return "neutral";
  }
}

// availableActions per row (Q-X13). Prefer a backend-provided descriptor list
// if the record ever carries one; otherwise derive the write-authority set for
// this surface. CTA visibility is descriptor-driven, never hard-coded by role.
function buildRowActions(
  flag: FeatureFlag,
  scope: "platform" | "tenant_override",
): ResourceActionDescriptor[] {
  const provided = (flag as { availableActions?: ResourceActionDescriptor[] })
    .availableActions;
  if (Array.isArray(provided)) return provided;

  const toggleAction: ResourceActionDescriptor =
    scope === "platform"
      ? {
          action: "toggle_global",
          enabled: true,
          requiresReason: true,
          riskLevel: "high",
        }
      : {
          action: "toggle_override",
          enabled: true,
          requiresReason: true,
          riskLevel: "high",
        };

  const history: ResourceActionDescriptor = {
    action: "view_history",
    enabled: true,
    riskLevel: "low",
  };

  if (scope === "tenant_override") {
    return [
      toggleAction,
      // Backend exposes upsert but no delete endpoint yet (Q-X16) — surfaced
      // disabled with a reason code per §3.5 rather than hidden.
      {
        action: "remove_override",
        enabled: false,
        disabledReasonCode: "remove_override_unsupported",
        requiresReason: true,
        riskLevel: "high",
      },
      history,
    ];
  }
  return [toggleAction, history];
}

// Cross-app deep links (Q-X03 / §4.2): flipping a flag has downstream impact in
// the read-only consumer apps. Linked in new tab; platform-admin owns the write.
function buildDownstreamLinks(key: string): CrossAppResourceLink[] {
  return [
    {
      targetApp: "ops-console",
      route: `/feature-flags?key=${encodeURIComponent(key)}`,
      resourceType: "feature_flag",
      resourceId: key,
      openMode: "new_tab",
      label: "Ops Console",
    },
    {
      targetApp: "tenant-console",
      route: `/feature-flags?key=${encodeURIComponent(key)}`,
      resourceType: "feature_flag",
      resourceId: key,
      openMode: "new_tab",
      label: "Tenant Console",
    },
  ];
}

function auditHref(key: string): string {
  return `/audit?resourceType=feature_flag&resourceId=${encodeURIComponent(key)}`;
}

function classifyError(message: string): PlatformEmptyReason {
  const lower = message.toLowerCase();
  if (
    lower.includes("403") ||
    lower.includes("forbidden") ||
    lower.includes("permission") ||
    lower.includes("unauthor")
  ) {
    return "permission_denied";
  }
  if (
    lower.includes("failed to fetch") ||
    lower.includes("network") ||
    lower.includes("timeout") ||
    lower.includes("econn") ||
    lower.includes("503") ||
    lower.includes("502")
  ) {
    return "external_unavailable";
  }
  return "fetch_failed";
}

// ── Refresh tier badge: tier + freshness + last refreshed (Q-X01/X02) ────────
function RefreshTierBadge({
  meta,
  locale,
}: {
  meta: UiRefreshMetadata;
  locale: string;
}) {
  const tone: CanvasTone =
    meta.dataFreshness === "fresh"
      ? "success"
      : meta.dataFreshness === "stale"
        ? "warn"
        : meta.dataFreshness === "degraded"
          ? "danger"
          : "neutral";
  const freshnessLabel =
    locale === "en"
      ? {
          fresh: "fresh",
          stale: "stale",
          degraded: "degraded",
          unknown: "unknown",
        }[meta.dataFreshness]
      : {
          fresh: "最新",
          stale: "已過期",
          degraded: "降級",
          unknown: "未知",
        }[meta.dataFreshness];

  return (
    <span style={inlinePillRowStyle}>
      <CanvasPill theme={theme} tone="neutral">
        {locale === "en" ? "T4 · medium-slow · 30s" : "T4 · 中慢速 · 30 秒"}
      </CanvasPill>
      <CanvasPill theme={theme} tone={tone} dot>
        {freshnessLabel}
      </CanvasPill>
      {meta.generatedAt ? (
        <span style={monoMutedStyle}>
          {(locale === "en" ? "synced " : "同步於 ") +
            formatDateTime(meta.generatedAt)}
        </span>
      ) : null}
    </span>
  );
}

// ── Descriptor-driven CTA (Q-X13): hidden when absent, disabled+tooltip when
//    not enabled, danger emphasis on high risk, reason dot when reason required.
function ActionCTA({
  descriptor,
  label,
  icon,
  onAction,
}: {
  descriptor: ResourceActionDescriptor | undefined;
  label: string;
  icon?: CanvasIconName;
  onAction: (descriptor: ResourceActionDescriptor) => void;
}) {
  if (!descriptor) return null;
  const high = descriptor.riskLevel === "high";
  const medium = descriptor.riskLevel === "medium";
  const tooltip = !descriptor.enabled
    ? (descriptor.disabledReasonCode ?? "disabled")
    : descriptor.requiresReason
      ? "requires reason"
      : undefined;

  const button = (
    <CanvasBtn
      theme={theme}
      size="xs"
      variant={medium ? "primary" : "secondary"}
      danger={high}
      icon={icon}
      disabled={!descriptor.enabled}
      onClick={() => descriptor.enabled && onAction(descriptor)}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
        <span>{label}</span>
        {descriptor.requiresReason && descriptor.enabled ? (
          <span
            aria-hidden
            style={{
              width: 5,
              height: 5,
              borderRadius: 3,
              background: "currentColor",
              opacity: 0.7,
            }}
          />
        ) : null}
      </span>
    </CanvasBtn>
  );

  if (tooltip) {
    return <span title={tooltip}>{button}</span>;
  }
  return button;
}

// ── EmptyState driven by EmptyReason (Q-X15) — six distinct treatments ───────
function FlagEmptyState({
  reason,
  locale,
  onRetry,
  onClearFilters,
}: {
  reason: PlatformEmptyReason;
  locale: string;
  onRetry: () => void;
  onClearFilters: () => void;
}) {
  const treatment = EMPTY_TREATMENTS[reason];
  const color = TONE_COLOR[treatment.tone];
  const copy: Record<PlatformEmptyReason, { title: string; body: string }> =
    locale === "en"
      ? {
          no_data: {
            title: "No feature flags yet",
            body: "No flag keys are registered for this realm.",
          },
          not_provisioned: {
            title: "Tenant scope not provisioned",
            body: "This tenant has no flag overrides provisioned. Clear the scope to view platform defaults.",
          },
          fetch_failed: {
            title: "Couldn't load feature flags",
            body: "The request failed. Retry to fetch the latest flag registry.",
          },
          permission_denied: {
            title: "Not authorised",
            body: "Write authority for feature flags is limited to pa_super_admin (Q-X16).",
          },
          external_unavailable: {
            title: "Flag service unavailable",
            body: "The flag registry is temporarily unreachable. Retry shortly.",
          },
          filtered_empty: {
            title: "No flags match these filters",
            body: "No keys match the current search / scope filter. Clear filters to see all flags.",
          },
        }
      : {
          no_data: {
            title: "尚無功能旗標",
            body: "此 realm 尚未登錄任何 flag key。",
          },
          not_provisioned: {
            title: "租戶範圍尚未佈建",
            body: "此租戶尚無 flag override。清除範圍即可檢視平台預設。",
          },
          fetch_failed: {
            title: "無法載入功能旗標",
            body: "請求失敗。重試以取得最新 flag registry。",
          },
          permission_denied: {
            title: "權限不足",
            body: "Feature flags 寫入權限僅限 pa_super_admin（Q-X16）。",
          },
          external_unavailable: {
            title: "Flag 服務暫時無法使用",
            body: "Flag registry 暫時無法連線，請稍後重試。",
          },
          filtered_empty: {
            title: "沒有符合篩選的 flag",
            body: "目前的搜尋 / 範圍篩選沒有符合的 key。清除篩選以檢視全部。",
          },
        };
  const text = copy[reason];

  return (
    <div
      role="status"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
        textAlign: "center",
        padding: "36px 16px",
        borderRadius: 12,
        border: `1px dashed ${color}`,
        background: theme.surfaceLo,
      }}
    >
      <span
        style={{
          width: 52,
          height: 52,
          borderRadius: 26,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color,
          background: theme.surface,
          border: `1px solid ${color}`,
        }}
      >
        <CanvasIcon name={treatment.icon} size={26} stroke={1.4} />
      </span>
      <div>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: theme.text,
            display: "flex",
            alignItems: "baseline",
            gap: 6,
            justifyContent: "center",
          }}
        >
          <span>{text.title}</span>
          <span style={monoMutedStyle}>· {reason}</span>
        </div>
        <div
          style={{
            marginTop: 4,
            maxWidth: 420,
            fontSize: 12.5,
            color: theme.textMuted,
            lineHeight: 1.5,
          }}
        >
          {text.body}
        </div>
      </div>
      {treatment.nextAction === "retry" ? (
        <CanvasBtn
          theme={theme}
          variant="primary"
          icon="arrow"
          onClick={onRetry}
        >
          {locale === "en" ? "Retry" : "重試"}
        </CanvasBtn>
      ) : null}
      {treatment.nextAction === "clear" ? (
        <CanvasBtn
          theme={theme}
          variant="secondary"
          icon="filter"
          onClick={onClearFilters}
        >
          {locale === "en" ? "Clear filters" : "清除篩選"}
        </CanvasBtn>
      ) : null}
    </div>
  );
}

export default function FeatureFlagsPage() {
  const { t, locale } = useTranslation();
  const client = usePlatformAdminClient();
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [tenants, setTenants] = useState<PlatformAdminTenantRecord[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("all");
  const [loading, setLoading] = useState(true);
  const [tenantLoading, setTenantLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(
    null,
  );
  const [reasonText, setReasonText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<ActionReceiptState | null>(null);

  const loadFlags = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      setError(null);
      try {
        const summary: FeatureFlagSummary = await client.getFeatureFlags(
          selectedTenantId ? { tenantId: selectedTenantId } : undefined,
        );
        setFlags(summary.flags || []);
        setNotes(summary.notes || []);
        setLastLoadedAt(new Date().toISOString());
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [client, selectedTenantId],
  );

  const loadTenants = useCallback(async () => {
    setTenantLoading(true);
    try {
      const result = await client.listPlatformTenants();
      setTenants(result ?? []);
    } catch (e: unknown) {
      setError(
        (previous) => previous ?? (e instanceof Error ? e.message : String(e)),
      );
    } finally {
      setTenantLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void loadFlags();
  }, [loadFlags]);

  useEffect(() => {
    void loadTenants();
  }, [loadTenants]);

  // Refresh tier T4 (medium_slow) — poll every 30s in the background.
  useEffect(() => {
    const cadence = REFRESH_CADENCE_MS[REFRESH_TIER];
    if (!cadence) return;
    const id = setInterval(() => {
      if (!pendingAction && !submitting) {
        void loadFlags({ silent: true });
      }
    }, cadence);
    return () => clearInterval(id);
  }, [loadFlags, pendingAction, submitting]);

  const tenantNameById = useCallback(
    (tenantId: string) => {
      const tenant = tenants.find((item) => item.id === tenantId);
      return tenant ? `${tenant.name} (${tenant.code})` : tenantId;
    },
    [tenants],
  );

  const allRows = useMemo<FlagRow[]>(() => {
    return [...flags]
      .sort(
        (left, right) =>
          left.key.localeCompare(right.key) ||
          (left.tenantId ?? "").localeCompare(right.tenantId ?? ""),
      )
      .map((flag) => {
        const scope: "platform" | "tenant_override" = flag.tenantId
          ? "tenant_override"
          : "platform";
        return {
          id: `${flag.key}::${flag.tenantId ?? "global"}`,
          key: flag.key,
          scope,
          tenantId: flag.tenantId ?? null,
          tenantLabel: flag.tenantId ? tenantNameById(flag.tenantId) : "",
          enabled: flag.enabled,
          description: flag.description || "",
          updatedAt: flag.updatedAt,
          updatedBy: "—",
          rollout: computeRollout(flag.key, flags),
          actions: buildRowActions(flag, scope),
        };
      });
  }, [flags, tenantNameById]);

  const rows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return allRows.filter((row) => {
      if (scopeFilter !== "all" && row.scope !== scopeFilter) return false;
      if (!query) return true;
      return (
        row.key.toLowerCase().includes(query) ||
        row.description.toLowerCase().includes(query)
      );
    });
  }, [allRows, scopeFilter, searchQuery]);

  const emptyReason = useMemo<PlatformEmptyReason | null>(() => {
    if (rows.length > 0) return null;
    if (error) return classifyError(error);
    if (allRows.length === 0) {
      if (selectedTenantId) return "not_provisioned";
      return "no_data";
    }
    return "filtered_empty";
  }, [rows.length, error, allRows.length, selectedTenantId]);

  const refreshMeta = useMemo<UiRefreshMetadata>(() => {
    const staleAfterMs = REFRESH_CADENCE_MS[REFRESH_TIER] ?? 0;
    let dataFreshness: UiRefreshMetadata["dataFreshness"] = "unknown";
    if (error) {
      dataFreshness = "degraded";
    } else if (lastLoadedAt) {
      const age = Date.now() - Date.parse(lastLoadedAt);
      dataFreshness = age > staleAfterMs ? "stale" : "fresh";
    }
    return {
      generatedAt: lastLoadedAt ?? "",
      staleAfterMs,
      dataFreshness,
      source: "live",
    };
  }, [error, lastLoadedAt]);

  const enabledCount = allRows.filter((row) => row.enabled).length;
  const globalCount = allRows.filter((row) => row.scope === "platform").length;
  const overrideCount = allRows.filter(
    (row) => row.scope === "tenant_override",
  ).length;
  const midRolloutKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const flag of flags) {
      if (computeRollout(flag.key, flags) === "mid_rollout") keys.add(flag.key);
    }
    return keys.size;
  }, [flags]);

  const flagKeys = useMemo(
    () => [...new Set(flags.map((flag) => flag.key))].sort(),
    [flags],
  );

  const selectedTenant =
    tenants.find((tenant) => tenant.id === selectedTenantId) ?? null;

  const copy =
    locale === "en"
      ? {
          pageTitle: "Feature Flags · WRITE authority",
          pageSubtitle:
            "Writable only here · ops / tenant / driver read GET /api/{realm}/feature-flags filtered (Q-X16)",
          writable: "writable · only here",
          breadcrumbParent: "Platform Layer",
          refresh: t("common.refresh"),
          refreshing: "Refreshing…",
          addOverride: "New tenant override",
          searchLabel: "Search by key",
          searchPlaceholder: "key or description…",
          scopeColLabel: "Tenant scope",
          scopeColHint:
            "Choose a tenant to load its override rows beside platform defaults.",
          scopeAll: "Platform defaults only",
          scopeFilterLabel: "Scope filter",
          scopeFilterAll: "All scopes",
          scopeFilterPlatform: "Platform defaults",
          scopeFilterOverride: "Tenant overrides",
          colKey: t("flags.col.flag"),
          colScope: t("flags.col.tenant"),
          colState: t("flags.col.status"),
          colUpdatedBy: "Updated by",
          colUpdatedAt: t("flags.col.updated"),
          colActions: t("flags.col.actions"),
          platformDefault: "platform",
          tenantOverride: "tenant_override",
          updatedByFallback: "Contract not exposed",
          notesTitle: "Contract notes",
          notesFallback:
            "Current API notes remain visible here without changing the fetch contract.",
          stateLabel: "Write authority",
          stateValue: "pa_super_admin only",
          rollout: {
            fully_rolled_out: "fully rolled out",
            mid_rollout: "mid-rollout",
            global_only: "global only",
            override_only: "override only",
            deprecated: "deprecated",
          } as Record<RolloutState, string>,
          toggleHigh: "Toggle",
          history: "History",
          remove: "Remove",
          confirmToggleTitle: "Confirm flag state change",
          confirmAddTitle: "Add tenant override",
          confirmEnable: "Enable",
          confirmDisable: "Disable",
          riskTag: "HIGH · reason required",
          reasonLabel: "Reason · reason",
          reasonHint:
            "High-risk action — the reason is recorded to the audit trail.",
          reasonPlaceholder: "Explain why this flag is changing…",
          downstreamTitle: "Downstream impact",
          downstreamBody:
            "Read-only consumer apps will pick up this flag. Inspect their view (opens in new tab):",
          keyField: "Flag key",
          tenantField: "Tenant",
          enabledField: "Override value",
          cancel: t("common.cancel"),
          confirm: "Confirm",
          submitting: t("common.updating"),
          receiptOk: "Flag updated",
          receiptFail: "Flag update failed",
          viewAudit: "View audit",
          empty: t("flags.empty"),
          loading: t("flags.loading"),
          chooseKey: "Select a flag key",
          chooseTenant: "Select a tenant",
        }
      : {
          pageTitle: "功能旗標 · 寫入權限",
          pageSubtitle:
            "僅此處可寫入 · ops / tenant / driver 走 GET /api/{realm}/feature-flags 唯讀過濾（Q-X16）",
          writable: "可寫入 · 僅此處",
          breadcrumbParent: "平台層",
          refresh: t("common.refresh"),
          refreshing: "重新整理中…",
          addOverride: "新增 tenant override",
          searchLabel: "依 key 搜尋",
          searchPlaceholder: "key 或說明…",
          scopeColLabel: "Tenant 範圍",
          scopeColHint:
            "選擇 tenant 後，會把該 tenant 的 override 與平台預設一起載入。",
          scopeAll: "只看平台預設",
          scopeFilterLabel: "範圍篩選",
          scopeFilterAll: "全部範圍",
          scopeFilterPlatform: "平台預設",
          scopeFilterOverride: "租戶覆寫",
          colKey: t("flags.col.flag"),
          colScope: t("flags.col.tenant"),
          colState: t("flags.col.status"),
          colUpdatedBy: "更新者",
          colUpdatedAt: t("flags.col.updated"),
          colActions: t("flags.col.actions"),
          platformDefault: "platform",
          tenantOverride: "tenant_override",
          updatedByFallback: "目前 contract 未提供",
          notesTitle: "Contract 備註",
          notesFallback:
            "保留目前 API notes，可檢視但不變更既有 fetch contract。",
          stateLabel: "寫入權限",
          stateValue: "僅 pa_super_admin",
          rollout: {
            fully_rolled_out: "已全面上線",
            mid_rollout: "灰度中",
            global_only: "僅全域",
            override_only: "僅覆寫",
            deprecated: "已棄用",
          } as Record<RolloutState, string>,
          toggleHigh: "切換",
          history: "歷史",
          remove: "移除",
          confirmToggleTitle: "確認切換 flag 狀態",
          confirmAddTitle: "新增 tenant override",
          confirmEnable: "啟用",
          confirmDisable: "停用",
          riskTag: "HIGH · 需填寫原因",
          reasonLabel: "原因 · reason",
          reasonHint: "此為高風險操作，原因將寫入稽核紀錄。",
          reasonPlaceholder: "請說明變更此 flag 的原因…",
          downstreamTitle: "下游影響",
          downstreamBody:
            "唯讀的消費端 app 會套用此 flag。檢視它們的畫面（於新分頁開啟）：",
          keyField: "Flag key",
          tenantField: "租戶",
          enabledField: "Override 值",
          cancel: t("common.cancel"),
          confirm: "確認",
          submitting: t("common.updating"),
          receiptOk: "Flag 已更新",
          receiptFail: "Flag 更新失敗",
          viewAudit: "檢視稽核",
          empty: t("flags.empty"),
          loading: t("flags.loading"),
          chooseKey: "選擇 flag key",
          chooseTenant: "選擇租戶",
        };

  const openAction = useCallback(
    (descriptor: ResourceActionDescriptor, row: FlagRow) => {
      setReceipt(null);
      setReasonText("");
      if (descriptor.action === "view_history") return; // handled via link
      if (
        descriptor.action === "toggle_global" ||
        descriptor.action === "toggle_override"
      ) {
        setPendingAction({
          mode: "toggle",
          kind: descriptor.action as FlagActionKind,
          key: row.key,
          tenantId: row.tenantId,
          scope: row.scope,
          nextEnabled: !row.enabled,
          requiresReason: descriptor.requiresReason ?? false,
        });
      }
    },
    [],
  );

  const openAddOverride = useCallback(() => {
    setReceipt(null);
    setReasonText("");
    setPendingAction({
      mode: "add_override",
      kind: "add_override",
      key: flagKeys[0] ?? "",
      tenantId: selectedTenantId || tenants[0]?.id || "",
      enabled: true,
      requiresReason: true,
    });
  }, [flagKeys, selectedTenantId, tenants]);

  const reasonValid =
    !pendingAction?.requiresReason || reasonText.trim().length > 0;
  const addReady =
    pendingAction?.mode !== "add_override" ||
    (pendingAction.key.length > 0 && pendingAction.tenantId.length > 0);

  async function handleConfirm() {
    if (!pendingAction || !reasonValid || !addReady) return;
    setSubmitting(true);
    setError(null);
    const reason = reasonText.trim();
    try {
      if (pendingAction.mode === "toggle") {
        if (pendingAction.scope === "platform") {
          await client.updateFeatureFlag(
            pendingAction.key,
            pendingAction.nextEnabled,
          );
        } else if (pendingAction.tenantId) {
          await client.post<FeatureFlag>(
            `/api/admin/flags/${encodeURIComponent(pendingAction.key)}/tenant-overrides?tenantId=${encodeURIComponent(pendingAction.tenantId)}`,
            {
              body: { enabled: pendingAction.nextEnabled, description: reason },
            },
          );
        }
      } else {
        await client.post<FeatureFlag>(
          `/api/admin/flags/${encodeURIComponent(pendingAction.key)}/tenant-overrides?tenantId=${encodeURIComponent(pendingAction.tenantId)}`,
          { body: { enabled: pendingAction.enabled, description: reason } },
        );
      }
      setReceipt({
        status: "completed",
        key: pendingAction.key,
        message: copy.receiptOk,
      });
      setPendingAction(null);
      setReasonText("");
      await loadFlags({ silent: true });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      setReceipt({
        status: "failed",
        key: pendingAction.key,
        message: `${copy.receiptFail}: ${message}`,
      });
    } finally {
      setSubmitting(false);
    }
  }

  function resetFilters() {
    setScopeFilter("all");
    setSearchQuery("");
    setSelectedTenantId("");
  }

  const columns: CanvasTableColumn<FlagRow>[] = [
    {
      h: copy.colKey,
      w: 320,
      r: (row) => (
        <div style={keyCellStyle}>
          <code style={codeStyle}>{row.key}</code>
          {row.description ? (
            <div style={secondaryTextStyle}>{row.description}</div>
          ) : null}
          <div style={inlinePillRowStyle}>
            <CanvasPill theme={theme} tone={rolloutTone(row.rollout)}>
              {copy.rollout[row.rollout]}
            </CanvasPill>
          </div>
        </div>
      ),
    },
    {
      h: copy.colScope,
      w: 200,
      r: (row) => (
        <div style={keyCellStyle}>
          <CanvasPill
            theme={theme}
            tone={row.scope === "platform" ? "neutral" : "info"}
          >
            {row.scope === "platform"
              ? copy.platformDefault
              : copy.tenantOverride}
          </CanvasPill>
          {row.scope === "tenant_override" ? (
            <span style={secondaryTextStyle}>{row.tenantLabel}</span>
          ) : null}
        </div>
      ),
    },
    {
      h: copy.colState,
      w: 150,
      r: (row) => {
        const toggle = row.actions.find(
          (action) =>
            action.action === "toggle_global" ||
            action.action === "toggle_override",
        );
        const disabled = !toggle?.enabled || submitting;
        return (
          <div style={stateCellStyle}>
            <button
              type="button"
              aria-label={`${row.enabled ? copy.confirmDisable : copy.confirmEnable} ${row.key}`}
              onClick={() => toggle && openAction(toggle, row)}
              disabled={disabled}
              style={toggleButtonStyle(theme, row.enabled, disabled)}
            >
              <span style={toggleKnobStyle} />
            </button>
            <CanvasPill
              theme={theme}
              tone={row.enabled ? "success" : "neutral"}
              dot
            >
              {row.enabled ? t("common.enabled") : t("common.disabled")}
            </CanvasPill>
          </div>
        );
      },
    },
    {
      h: copy.colUpdatedBy,
      w: 150,
      r: () => <span style={secondaryTextStyle}>{copy.updatedByFallback}</span>,
    },
    {
      h: copy.colUpdatedAt,
      w: 150,
      mono: true,
      r: (row) => formatDateTime(row.updatedAt),
    },
    {
      h: copy.colActions,
      w: 230,
      r: (row) => (
        <div style={actionsCellStyle}>
          <ActionCTA
            descriptor={row.actions.find(
              (action) =>
                action.action === "toggle_global" ||
                action.action === "toggle_override",
            )}
            label={copy.toggleHigh}
            icon="arrow"
            onAction={(descriptor) => openAction(descriptor, row)}
          />
          <a
            href={auditHref(row.key)}
            style={{ textDecoration: "none" }}
            title={copy.history}
          >
            <CanvasBtn theme={theme} size="xs" variant="secondary" icon="clock">
              {copy.history}
            </CanvasBtn>
          </a>
          <ActionCTA
            descriptor={row.actions.find(
              (action) => action.action === "remove_override",
            )}
            label={copy.remove}
            icon="x"
            onAction={(descriptor) => openAction(descriptor, row)}
          />
        </div>
      ),
    },
  ];

  const confirmIsEnable =
    pendingAction?.mode === "toggle"
      ? pendingAction.nextEnabled
      : pendingAction?.mode === "add_override"
        ? pendingAction.enabled
        : false;

  return (
    <CanvasShell
      theme={theme}
      nav={buildPlatformNav(locale)}
      active="flags"
      brandLabel={t("app.name")}
      brandSubLabel={t("app.sub")}
      breadcrumb={[copy.breadcrumbParent, t("flags.title")]}
      env="production"
      versionLabel="canvas"
      searchPlaceholder={
        locale === "en"
          ? "Search keys or tenant scope…"
          : "搜尋 key 或 tenant scope…"
      }
      avatarLabel={locale === "en" ? "PA" : "平台"}
      style={shellStyle}
    >
      <CanvasPageHeader
        theme={theme}
        title={copy.pageTitle}
        subtitle={copy.pageSubtitle}
        actions={
          <div style={headerActionsStyle}>
            <CanvasPill theme={theme} tone="accent" dot>
              {copy.writable}
            </CanvasPill>
            <RefreshTierBadge meta={refreshMeta} locale={locale} />
            <CanvasBtn
              theme={theme}
              variant="primary"
              icon="plus"
              disabled={tenantLoading || flagKeys.length === 0}
              onClick={openAddOverride}
            >
              {copy.addOverride}
            </CanvasBtn>
            <CanvasBtn
              theme={theme}
              variant="secondary"
              icon="arrow"
              onClick={() => void loadFlags()}
            >
              {loading && flags.length > 0 ? copy.refreshing : copy.refresh}
            </CanvasBtn>
          </div>
        }
      />

      <div style={bodyStyle}>
        {loading && flags.length === 0 ? (
          <CanvasCard
            theme={theme}
            title={t("flags.title")}
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
                icon="warn"
                title={`${getPlatformLabel(locale, "error")}: ${error}`}
                body={copy.pageSubtitle}
              />
            ) : null}

            {receipt ? (
              <CanvasBanner
                theme={theme}
                tone={receipt.status === "completed" ? "success" : "danger"}
                icon={receipt.status === "completed" ? "check" : "warn"}
                title={receipt.message}
                body={
                  <span style={linkRowStyle}>
                    <code style={codeStyle}>{receipt.key}</code>
                    <a
                      href={auditHref(receipt.key)}
                      style={{
                        color: theme.accent,
                        fontWeight: 600,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      {copy.viewAudit}
                      <CanvasIcon name="audit" size={12} />
                    </a>
                  </span>
                }
              />
            ) : null}

            <div style={kpiGridStyle}>
              <CanvasKPI
                theme={theme}
                label={locale === "en" ? "Flag records" : "Flag 紀錄"}
                value={allRows.length}
                sub={`${globalCount} ${copy.platformDefault} · ${overrideCount} override`}
              />
              <CanvasKPI
                theme={theme}
                label={t("common.enabled")}
                value={enabledCount}
                delta={`${allRows.length - enabledCount} ${locale === "en" ? "disabled" : "停用"}`}
                deltaTone={enabledCount > 0 ? "up" : "neutral"}
                sub={copy.stateValue}
              />
              <CanvasKPI
                theme={theme}
                label={locale === "en" ? "Mid-rollout keys" : "灰度中的 key"}
                value={midRolloutKeys}
                deltaTone={midRolloutKeys > 0 ? "neutral" : "up"}
                sub={
                  locale === "en"
                    ? "partial value across tenants"
                    : "跨租戶部分啟用"
                }
              />
              <CanvasKPI
                theme={theme}
                label={copy.notesTitle}
                value={notes.length}
                sub={selectedTenant?.code ?? copy.scopeAll}
              />
            </div>

            <CanvasCard
              theme={theme}
              title={copy.scopeColLabel}
              subtitle={copy.scopeColHint}
            >
              <div style={filterRowStyle}>
                <CanvasField theme={theme} label={copy.scopeColLabel}>
                  <select
                    value={selectedTenantId}
                    onChange={(event) =>
                      setSelectedTenantId(event.target.value)
                    }
                    disabled={tenantLoading}
                    style={inputStyle(theme)}
                  >
                    <option value="">{copy.scopeAll}</option>
                    {tenants.map((tenant) => (
                      <option key={tenant.id} value={tenant.id}>
                        {tenant.name} ({tenant.code})
                      </option>
                    ))}
                  </select>
                </CanvasField>
                <CanvasField theme={theme} label={copy.scopeFilterLabel}>
                  <select
                    value={scopeFilter}
                    onChange={(event) =>
                      setScopeFilter(event.target.value as ScopeFilter)
                    }
                    style={inputStyle(theme)}
                  >
                    <option value="all">{copy.scopeFilterAll}</option>
                    <option value="platform">{copy.scopeFilterPlatform}</option>
                    <option value="tenant_override">
                      {copy.scopeFilterOverride}
                    </option>
                  </select>
                </CanvasField>
                <CanvasField theme={theme} label={copy.searchLabel}>
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder={copy.searchPlaceholder}
                    style={inputStyle(theme)}
                  />
                </CanvasField>
              </div>
              <div style={fieldHintStyle}>{copy.scopeColHint}</div>
              <div style={{ marginTop: 16 }}>
                <CanvasDL
                  theme={theme}
                  cols={2}
                  items={[
                    {
                      label: copy.stateLabel,
                      value: copy.stateValue,
                    },
                    {
                      label: locale === "en" ? "Current scope" : "目前範圍",
                      value: selectedTenant
                        ? `${selectedTenant.name} (${selectedTenant.code})`
                        : copy.scopeAll,
                    },
                  ]}
                />
              </div>
            </CanvasCard>

            <CanvasCard
              theme={theme}
              title={
                locale === "en"
                  ? "Feature flag registry"
                  : "Feature flag registry"
              }
              subtitle={copy.pageSubtitle}
              style={{ overflow: "hidden" }}
            >
              {emptyReason ? (
                <FlagEmptyState
                  reason={emptyReason}
                  locale={locale}
                  onRetry={() => void loadFlags()}
                  onClearFilters={resetFilters}
                />
              ) : (
                <CanvasTable<FlagRow>
                  theme={theme}
                  columns={columns}
                  rows={rows}
                />
              )}
            </CanvasCard>

            {notes.length > 0 ? (
              <CanvasCard
                theme={theme}
                title={copy.notesTitle}
                subtitle={copy.notesFallback}
              >
                <ul style={noteListStyle}>
                  {notes.map((note, index) => (
                    <li key={`${note}-${index}`}>{note}</li>
                  ))}
                </ul>
              </CanvasCard>
            ) : null}
          </>
        )}
      </div>

      {pendingAction ? (
        <div
          style={overlayStyle}
          role="presentation"
          onClick={() => {
            if (!submitting) setPendingAction(null);
          }}
        >
          <div
            style={dialogStyle}
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: theme.text }}>
                {pendingAction.mode === "add_override"
                  ? copy.confirmAddTitle
                  : copy.confirmToggleTitle}
              </div>
              <div style={{ marginTop: 4 }}>
                <CanvasPill theme={theme} tone="danger">
                  {copy.riskTag}
                </CanvasPill>
              </div>
            </div>

            {pendingAction.mode === "add_override" ? (
              <>
                <CanvasField theme={theme} label={copy.keyField}>
                  <select
                    value={pendingAction.key}
                    onChange={(event) =>
                      setPendingAction({
                        ...pendingAction,
                        key: event.target.value,
                      })
                    }
                    style={inputStyle(theme)}
                  >
                    <option value="">{copy.chooseKey}</option>
                    {flagKeys.map((key) => (
                      <option key={key} value={key}>
                        {key}
                      </option>
                    ))}
                  </select>
                </CanvasField>
                <CanvasField theme={theme} label={copy.tenantField}>
                  <select
                    value={pendingAction.tenantId}
                    onChange={(event) =>
                      setPendingAction({
                        ...pendingAction,
                        tenantId: event.target.value,
                      })
                    }
                    style={inputStyle(theme)}
                  >
                    <option value="">{copy.chooseTenant}</option>
                    {tenants.map((tenant) => (
                      <option key={tenant.id} value={tenant.id}>
                        {tenant.name} ({tenant.code})
                      </option>
                    ))}
                  </select>
                </CanvasField>
                <CanvasField theme={theme} label={copy.enabledField}>
                  <select
                    value={pendingAction.enabled ? "on" : "off"}
                    onChange={(event) =>
                      setPendingAction({
                        ...pendingAction,
                        enabled: event.target.value === "on",
                      })
                    }
                    style={inputStyle(theme)}
                  >
                    <option value="on">{copy.confirmEnable}</option>
                    <option value="off">{copy.confirmDisable}</option>
                  </select>
                </CanvasField>
              </>
            ) : (
              <div
                style={{ fontSize: 12.5, color: theme.text, lineHeight: 1.55 }}
              >
                <span style={inlinePillRowStyle}>
                  <code style={codeStyle}>{pendingAction.key}</code>
                  <CanvasPill
                    theme={theme}
                    tone={
                      pendingAction.scope === "platform" ? "neutral" : "info"
                    }
                  >
                    {pendingAction.scope === "platform"
                      ? copy.platformDefault
                      : copy.tenantOverride}
                  </CanvasPill>
                  <CanvasPill
                    theme={theme}
                    tone={confirmIsEnable ? "success" : "warn"}
                  >
                    {confirmIsEnable ? copy.confirmEnable : copy.confirmDisable}
                  </CanvasPill>
                </span>
                {pendingAction.tenantId ? (
                  <div style={{ marginTop: 6 }}>
                    <span style={secondaryTextStyle}>
                      {tenantNameById(pendingAction.tenantId)}
                    </span>
                  </div>
                ) : null}
              </div>
            )}

            <CanvasField theme={theme} label={copy.reasonLabel}>
              <textarea
                value={reasonText}
                onChange={(event) => setReasonText(event.target.value)}
                placeholder={copy.reasonPlaceholder}
                style={reasonInputStyle(theme, reasonValid)}
              />
            </CanvasField>
            <div style={fieldHintStyle}>{copy.reasonHint}</div>

            <div
              style={{
                borderTop: `1px solid ${theme.border}`,
                paddingTop: 12,
                display: "grid",
                gap: 8,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>
                {copy.downstreamTitle}
              </div>
              <div style={secondaryTextStyle}>{copy.downstreamBody}</div>
              <div style={linkRowStyle}>
                {buildDownstreamLinks(pendingAction.key).map((link) => (
                  <a
                    key={link.targetApp}
                    href={link.route}
                    target={link.openMode === "new_tab" ? "_blank" : undefined}
                    rel={
                      link.openMode === "new_tab"
                        ? "noopener noreferrer"
                        : undefined
                    }
                    style={{
                      color: theme.accent,
                      fontWeight: 600,
                      fontSize: 12,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    {link.label}
                    <CanvasIcon name="ext" size={11} />
                  </a>
                ))}
              </div>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
                marginTop: 4,
              }}
            >
              <CanvasBtn
                theme={theme}
                variant="secondary"
                disabled={submitting}
                onClick={() => setPendingAction(null)}
              >
                {copy.cancel}
              </CanvasBtn>
              <CanvasBtn
                theme={theme}
                variant="primary"
                danger
                disabled={submitting || !reasonValid || !addReady}
                onClick={() => void handleConfirm()}
              >
                {submitting ? copy.submitting : copy.confirm}
              </CanvasBtn>
            </div>
          </div>
        </div>
      ) : null}
    </CanvasShell>
  );
}
