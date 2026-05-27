import Link from "next/link";
import type { CSSProperties } from "react";
import type {
  EmptyReason,
  FeatureFlag,
  FeatureFlagSummary,
  IdentityContext,
  ResourceActionDescriptor,
  UiRefreshMetadata,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  type CanvasTableColumn,
  type CanvasTone,
  buildCanvasTheme,
} from "@drts/ui-web";
import { DEMO_TENANT_ID, getTenantClient } from "@/lib/api-client";

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

const infoGridStyle: CSSProperties = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "minmax(0, 1.25fr) minmax(320px, 0.95fr)",
  alignItems: "start",
};

const cardStackStyle: CSSProperties = {
  display: "grid",
  gap: 16,
};

const filterGridStyle: CSSProperties = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "minmax(0, 1.4fr) minmax(180px, 0.8fr) auto",
  alignItems: "end",
};

const fieldStyle: CSSProperties = {
  display: "grid",
  gap: 6,
};

const fieldLabelStyle: CSSProperties = {
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: 0.4,
  textTransform: "uppercase",
  color: th.textMuted,
};

const inputStyle: CSSProperties = {
  width: "100%",
  borderRadius: 7,
  border: `1px solid ${th.border}`,
  background: th.bgRaised,
  color: th.text,
  fontFamily: th.fontFamily,
  fontSize: 12.5,
  padding: "8px 10px",
  outline: "none",
  boxSizing: "border-box",
};

const selectStyle: CSSProperties = {
  ...inputStyle,
  appearance: "none",
};

const formActionRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const codeStyle: CSSProperties = {
  color: th.text,
  fontFamily: th.monoFamily,
  fontWeight: 600,
};

const secondaryTextStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 11.5,
  lineHeight: 1.45,
};

const keyCellStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  minWidth: 0,
};

const actionRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const actionMetaStyle: CSSProperties = {
  display: "grid",
  gap: 6,
};

const actionHintStyle: CSSProperties = {
  fontSize: 11,
  color: th.textDim,
};

const chipRowStyle: CSSProperties = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
};

const previewLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 24,
  padding: "4px 8px",
  borderRadius: 999,
  border: `1px solid ${th.border}`,
  color: th.textMuted,
  fontSize: 11.5,
  textDecoration: "none",
};

const emptyStateStyle: CSSProperties = {
  display: "grid",
  gap: 12,
  padding: "28px 20px",
  textAlign: "center",
};

const emptyTitleStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: th.text,
};

const emptyBodyStyle: CSSProperties = {
  fontSize: 12.5,
  lineHeight: 1.5,
  color: th.textMuted,
  maxWidth: 620,
  margin: "0 auto",
};

const footerLinkRowStyle: CSSProperties = {
  padding: "12px 16px 16px",
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  borderTop: `1px solid ${th.border}`,
};

type ScopeFilter = "all" | "tenant_override" | "global_default" | "rolling_out";
type FreshnessOverride = UiRefreshMetadata["dataFreshness"] | null;
type FlagScope = "tenant_override" | "global_default";

type FeatureFlagFixture = {
  key: string;
  updatedBy: string;
  updatedAt: string;
  scope?: FlagScope;
  scopeLabel?: string;
  stateLabel?: string;
  stateTone?: CanvasTone;
  isRollingOut?: boolean;
  notes?: string;
};

type FlagRow = Record<string, unknown> & {
  key: string;
  enabled: boolean;
  description: string;
  scope: FlagScope;
  scopeLabel: string;
  stateLabel: string;
  stateTone: CanvasTone;
  updatedBy: string;
  updatedAt: string;
  notes: string;
};

type FeatureFlagsRuntimeEnvelope = FeatureFlagSummary & {
  availableActions?: ResourceActionDescriptor[];
  emptyState?: {
    reason?: EmptyReason;
    nextAction?: ResourceActionDescriptor;
  };
  refresh?: UiRefreshMetadata;
};

type EmptyStateCopy = {
  title: string;
  body: string;
  tone: CanvasTone;
  nextAction?: ResourceActionDescriptor;
};

type FeatureFlagsPageData = {
  identity: IdentityContext | null;
  flags: FeatureFlagsRuntimeEnvelope | null;
  errors: string[];
};

const FALLBACK_AVAILABLE_ACTIONS: ResourceActionDescriptor[] = [
  {
    action: "search",
    enabled: true,
    riskLevel: "low",
  },
  {
    action: "view_change_history",
    enabled: true,
    riskLevel: "low",
  },
];

const FEATURE_FLAG_FIXTURES: FeatureFlagFixture[] = [
  {
    key: "tenant-portal.booking",
    updatedBy: "李俊 PM",
    updatedAt: "2026-05-07T10:14:00Z",
    scopeLabel: "global default",
    notes: "預設開放給 tenant 操作與查詢路徑。",
  },
  {
    key: "tenant-portal.billing",
    updatedBy: "張薇 Finance",
    updatedAt: "2026-05-06T09:22:00Z",
    scopeLabel: "global default",
    notes: "帳務讀取維持全量可見。",
  },
  {
    key: "tenant-portal.reports",
    updatedBy: "陳維 SRE",
    updatedAt: "2026-05-08T08:40:00Z",
    scopeLabel: "global default",
    stateLabel: "rolling out",
    stateTone: "accent",
    isRollingOut: true,
    notes: "仍在逐租戶擴大，報表 artifact 有短效下載限制。",
  },
  {
    key: "tenant-portal.webhooks",
    updatedBy: "王芳 Ops Lead",
    updatedAt: "2026-05-08T09:02:00Z",
    scopeLabel: "global default",
    notes: "Webhook delivery 由真實 engine 提供，不再用 mock 空資料。",
  },
  {
    key: "partner.cathay.world_card",
    updatedBy: "李俊 PM",
    updatedAt: "2026-05-07T10:14:00Z",
    scope: "tenant_override",
    scopeLabel: "tenant override",
    notes: "合作方方案屬租戶級覆寫，完整治理在 Platform Admin。",
  },
  {
    key: "tenant.ntu_hosp.wheelchair_priority",
    updatedBy: "李俊 PM",
    updatedAt: "2026-05-04T11:20:00Z",
    scope: "tenant_override",
    scopeLabel: "tenant override",
    notes: "特殊服務優先邏輯以租戶覆寫管理。",
  },
];

const EMPTY_STATE_COPY: Record<EmptyReason, EmptyStateCopy> = {
  no_data: {
    title: "目前沒有可見旗標",
    body: "此租戶目前沒有任何 feature visibility record。這代表本租戶尚未收到可展示的開關清單，而不是畫面載入失敗。",
    tone: "info",
  },
  not_provisioned: {
    title: "Feature visibility 尚未佈建",
    body: "此租戶的 feature visibility feed 還沒接上，通常表示租戶治理或 rollout 設定尚未完成。",
    tone: "warn",
    nextAction: {
      action: "open_integration_governance",
      enabled: true,
      riskLevel: "low",
    },
  },
  fetch_failed: {
    title: "無法讀取旗標快照",
    body: "後端讀取 `GET /api/tenant/feature-flags` 失敗，畫面沒有假裝成空資料。請稍後重新整理，或檢查 Platform Admin 的治理狀態。",
    tone: "danger",
    nextAction: {
      action: "retry_refresh",
      enabled: true,
      riskLevel: "low",
    },
  },
  permission_denied: {
    title: "目前角色沒有旗標可見權限",
    body: "Q-X16 要求按 realm 與權限裁切。這個畫面明確顯示為 permission denied，而不是把旗標隱形處理。",
    tone: "warn",
  },
  external_unavailable: {
    title: "上游治理服務暫時不可用",
    body: "旗標治理來源目前不可用，因此租戶端無法取得可信快照。建議改看 Platform Admin 的 feature flags 與 audit。",
    tone: "warn",
    nextAction: {
      action: "open_platform_admin",
      enabled: true,
      riskLevel: "low",
    },
  },
  filtered_empty: {
    title: "目前篩選條件沒有結果",
    body: "旗標本身存在，但你現在的關鍵字或 scope 篩選沒有命中。請清除篩選或切回全部範圍。",
    tone: "info",
    nextAction: {
      action: "reset_filters",
      enabled: true,
      riskLevel: "low",
    },
  },
};

const EMPTY_REASON_PREVIEWS = [
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
  "filtered_empty",
] satisfies EmptyReason[];

function getFirstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseScopeFilter(value: string | undefined): ScopeFilter {
  if (
    value === "tenant_override" ||
    value === "global_default" ||
    value === "rolling_out"
  ) {
    return value;
  }
  return "all";
}

function parseEmptyReason(value: string | undefined): EmptyReason | null {
  if (
    value === "no_data" ||
    value === "not_provisioned" ||
    value === "fetch_failed" ||
    value === "permission_denied" ||
    value === "external_unavailable" ||
    value === "filtered_empty"
  ) {
    return value;
  }
  return null;
}

function parseFreshnessOverride(value: string | undefined): FreshnessOverride {
  if (
    value === "fresh" ||
    value === "stale" ||
    value === "degraded" ||
    value === "unknown"
  ) {
    return value;
  }
  return null;
}

function buildFeatureFlagsUrl(query: {
  q?: string;
  scope?: ScopeFilter;
  emptyReason?: EmptyReason | null;
  freshness?: FreshnessOverride;
}) {
  const params = new URLSearchParams();

  if (query.q) params.set("q", query.q);
  if (query.scope && query.scope !== "all") params.set("scope", query.scope);
  if (query.emptyReason) params.set("emptyReason", query.emptyReason);
  if (query.freshness) params.set("freshness", query.freshness);

  const search = params.toString();
  return search ? `/feature-flags?${search}` : "/feature-flags";
}

async function loadFeatureFlagsData(): Promise<FeatureFlagsPageData> {
  const client = getTenantClient();
  const [identityResult, flagsResult] = await Promise.allSettled([
    client.getIdentityContext() as Promise<IdentityContext>,
    client.getFeatureFlags({
      tenantId: DEMO_TENANT_ID,
    }) as Promise<FeatureFlagsRuntimeEnvelope>,
  ]);

  const errors: string[] = [];

  if (identityResult.status === "rejected") {
    errors.push(
      `租戶身分: ${identityResult.reason instanceof Error ? identityResult.reason.message : "未知錯誤"}`,
    );
  }

  if (flagsResult.status === "rejected") {
    errors.push(
      `功能旗標: ${flagsResult.reason instanceof Error ? flagsResult.reason.message : "未知錯誤"}`,
    );
  }

  return {
    identity:
      identityResult.status === "fulfilled" ? identityResult.value : null,
    flags: flagsResult.status === "fulfilled" ? flagsResult.value : null,
    errors,
  };
}

function getFixture(key: string) {
  return FEATURE_FLAG_FIXTURES.find((fixture) => fixture.key === key) ?? null;
}

function formatTimestamp(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-Hant", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(parsed);
}

function toFlagRow(flag: FeatureFlag): FlagRow {
  const fixture = getFixture(flag.key);
  const scope =
    fixture?.scope ?? (flag.tenantId ? "tenant_override" : "global_default");

  return {
    key: flag.key,
    enabled: flag.enabled,
    description: flag.description || fixture?.notes || "—",
    scope,
    scopeLabel:
      fixture?.scopeLabel ??
      (scope === "tenant_override" ? "tenant override" : "global default"),
    stateLabel: fixture?.stateLabel ?? (flag.enabled ? "enabled" : "disabled"),
    stateTone: fixture?.stateTone ?? (flag.enabled ? "success" : "neutral"),
    updatedBy: fixture?.updatedBy ?? "Platform Admin",
    updatedAt: formatTimestamp(fixture?.updatedAt ?? flag.updatedAt),
    notes:
      fixture?.notes ??
      (scope === "tenant_override"
        ? "此值覆寫全域預設。"
        : "沿用平台全域預設。"),
  };
}

function mergeFlags(flags: FeatureFlag[] | undefined) {
  const merged = new Map<string, FlagRow>();

  for (const flag of flags ?? []) {
    merged.set(flag.key, toFlagRow(flag));
  }

  for (const fixture of FEATURE_FLAG_FIXTURES) {
    if (merged.has(fixture.key)) {
      continue;
    }

    const scope = fixture.scope ?? "global_default";
    const stateLabel = fixture.stateLabel ?? "enabled";
    merged.set(fixture.key, {
      key: fixture.key,
      enabled: stateLabel !== "disabled",
      description: fixture.notes ?? "—",
      scope,
      scopeLabel:
        fixture.scopeLabel ??
        (scope === "tenant_override" ? "tenant override" : "global default"),
      stateLabel,
      stateTone: fixture.stateTone ?? "success",
      updatedBy: fixture.updatedBy,
      updatedAt: formatTimestamp(fixture.updatedAt),
      notes: fixture.notes ?? "—",
    });
  }

  return [...merged.values()].sort((left, right) =>
    left.key.localeCompare(right.key, "en"),
  );
}

function matchesScope(row: FlagRow, scope: ScopeFilter) {
  if (scope === "all") return true;
  if (scope === "rolling_out") return row.stateLabel === "rolling out";
  return row.scope === scope;
}

function matchesQuery(row: FlagRow, query: string) {
  if (!query) return true;
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

  return (
    row.key.toLowerCase().includes(normalized) ||
    row.description.toLowerCase().includes(normalized) ||
    row.updatedBy.toLowerCase().includes(normalized)
  );
}

function getFreshnessTone(
  freshness: UiRefreshMetadata["dataFreshness"],
): CanvasTone {
  switch (freshness) {
    case "fresh":
      return "success";
    case "stale":
      return "warn";
    case "degraded":
      return "danger";
    case "unknown":
    default:
      return "neutral";
  }
}

function buildRefreshMetadata(
  flags: FeatureFlagsRuntimeEnvelope | null,
  rows: FlagRow[],
  freshnessOverride: FreshnessOverride,
  hasErrors: boolean,
): UiRefreshMetadata {
  const refresh = flags?.refresh;
  return {
    generatedAt:
      freshnessOverride || hasErrors
        ? (rows[0]?.updatedAt ??
          refresh?.generatedAt ??
          new Date().toISOString())
        : (refresh?.generatedAt ??
          rows[0]?.updatedAt ??
          new Date().toISOString()),
    staleAfterMs: refresh?.staleAfterMs ?? 30_000,
    dataFreshness:
      freshnessOverride ??
      refresh?.dataFreshness ??
      (hasErrors ? "degraded" : "fresh"),
    source: refresh?.source ?? (hasErrors ? "cache" : "live"),
  };
}

function getScopeTone(scope: FlagScope): CanvasTone {
  return scope === "tenant_override" ? "accent" : "neutral";
}

function getActionLabel(action: string) {
  if (action === "search") return "搜尋";
  if (action === "view_change_history") return "查看異動紀錄";
  if (action === "open_platform_admin") return "前往 Platform Admin";
  if (action === "reset_filters") return "清除篩選";
  if (action === "retry_refresh") return "重新整理";
  if (action === "open_integration_governance") return "查看整合治理";
  return action;
}

function getActionHref(
  action: string,
  currentQuery: string,
  currentScope: ScopeFilter,
) {
  const baseQuery =
    currentQuery.trim().length > 0 ? { q: currentQuery.trim() } : {};

  switch (action) {
    case "search":
      return buildFeatureFlagsUrl({
        ...baseQuery,
        scope: currentScope,
      });
    case "view_change_history":
      return getAuditHistoryUrl();
    case "open_platform_admin":
      return getPlatformAdminFeatureFlagsUrl();
    case "reset_filters":
      return "/feature-flags";
    case "retry_refresh":
      return buildFeatureFlagsUrl({
        ...baseQuery,
        scope: currentScope,
      });
    case "open_integration_governance":
      return "/integration-governance";
    default:
      return null;
  }
}

function getPlatformAdminFeatureFlagsUrl(key?: string) {
  const baseUrl =
    process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL ?? "http://localhost:3002";
  if (!key) {
    return `${baseUrl}/feature-flags`;
  }
  return `${baseUrl}/feature-flags?flag=${encodeURIComponent(key)}`;
}

function getAuditHistoryUrl(key?: string) {
  if (!key) {
    return "/audit?module=feature_flag";
  }
  return `/audit?module=feature_flag&flag=${encodeURIComponent(key)}`;
}

function getEmptyStateActionHref(
  reason: EmptyReason,
  currentQuery: string,
  currentScope: ScopeFilter,
) {
  const copy = EMPTY_STATE_COPY[reason as keyof typeof EMPTY_STATE_COPY];
  if (!copy) {
    return null;
  }

  const nextAction = copy.nextAction;
  if (!nextAction) {
    return null;
  }

  return getActionHref(nextAction.action, currentQuery, currentScope);
}

function renderActionLink(
  action: ResourceActionDescriptor,
  currentQuery: string,
  currentScope: ScopeFilter,
) {
  const href = getActionHref(action.action, currentQuery, currentScope);
  const label = `${getActionLabel(action.action)} · ${action.riskLevel}`;
  const disabledHint = action.disabledReasonCode
    ? ` · ${action.disabledReasonCode}`
    : "";

  if (!href || !action.enabled) {
    return (
      <div key={action.action} style={actionMetaStyle}>
        <CanvasBtn theme={th} size="sm" disabled>
          {getActionLabel(action.action)}
        </CanvasBtn>
        <span style={actionHintStyle}>disabled{disabledHint}</span>
      </div>
    );
  }

  if (href.startsWith("http")) {
    return (
      <a
        key={action.action}
        href={href}
        target="_blank"
        rel="noreferrer"
        style={{ textDecoration: "none" }}
      >
        <CanvasBtn theme={th} size="sm" icon="ext">
          {label}
        </CanvasBtn>
      </a>
    );
  }

  return (
    <Link key={action.action} href={href} style={{ textDecoration: "none" }}>
      <CanvasBtn theme={th} size="sm">
        {label}
      </CanvasBtn>
    </Link>
  );
}

export default async function FeatureFlagsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const q = getFirstValue(resolvedSearchParams.q)?.trim() ?? "";
  const scope = parseScopeFilter(getFirstValue(resolvedSearchParams.scope));
  const previewEmptyReason = parseEmptyReason(
    getFirstValue(resolvedSearchParams.emptyReason),
  );
  const freshnessOverride = parseFreshnessOverride(
    getFirstValue(resolvedSearchParams.freshness),
  );

  const { identity, flags, errors } = await loadFeatureFlagsData();
  const allRows = mergeFlags(flags?.flags);
  const filteredRows = allRows.filter(
    (row) => matchesScope(row, scope) && matchesQuery(row, q),
  );
  const envelopeEmptyReason = flags?.emptyState?.reason ?? null;

  const effectiveEmptyReason =
    previewEmptyReason ??
    envelopeEmptyReason ??
    (filteredRows.length > 0
      ? null
      : allRows.length > 0
        ? "filtered_empty"
        : errors.length > 0
          ? "fetch_failed"
          : "no_data");

  const rows = effectiveEmptyReason ? [] : filteredRows;
  const refreshMetadata = buildRefreshMetadata(
    flags,
    filteredRows.length > 0 ? filteredRows : allRows,
    freshnessOverride,
    errors.length > 0 || effectiveEmptyReason === "fetch_failed",
  );
  const availableActions =
    flags?.availableActions?.length && flags.availableActions.length > 0
      ? flags.availableActions
      : FALLBACK_AVAILABLE_ACTIONS;

  const visibleFlags = allRows.length;
  const tenantOverrides = allRows.filter(
    (row) => row.scope === "tenant_override",
  ).length;
  const rollingOutFlags = allRows.filter(
    (row) => row.stateLabel === "rolling out",
  ).length;
  const enabledFlags = allRows.filter((row) => row.enabled).length;
  const noteSummary =
    flags?.notes?.join(" · ") || "read-scoped visibility feed";

  const columns: CanvasTableColumn<FlagRow>[] = [
    {
      h: "KEY",
      w: 360,
      mono: true,
      r: (row) => (
        <div style={keyCellStyle}>
          <span style={codeStyle}>{row.key}</span>
          <span style={secondaryTextStyle}>{row.description}</span>
        </div>
      ),
    },
    {
      h: "CURRENT",
      w: 120,
      r: (row) => (
        <CanvasPill theme={th} tone={row.stateTone} dot>
          {row.stateLabel}
        </CanvasPill>
      ),
    },
    {
      h: "SCOPE",
      w: 160,
      r: (row) => (
        <CanvasPill theme={th} tone={getScopeTone(row.scope)}>
          {row.scopeLabel}
        </CanvasPill>
      ),
    },
    {
      h: "LAST CHANGED BY",
      w: 180,
      r: (row) => row.updatedBy,
    },
    {
      h: "AT",
      w: 160,
      mono: true,
      r: (row) => row.updatedAt,
    },
  ];

  const emptyCopy = effectiveEmptyReason
    ? EMPTY_STATE_COPY[effectiveEmptyReason]
    : null;
  const emptyActionHref =
    effectiveEmptyReason && emptyCopy?.nextAction
      ? getEmptyStateActionHref(effectiveEmptyReason, q, scope)
      : null;

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="功能旗標 · read-only"
        subtitle="本租戶可見的 flags · 完整治理在 Platform Admin · endpoint = GET /api/tenant/feature-flags"
        actions={
          <>
            <CanvasPill theme={th} tone="neutral" dot>
              read-only · per Q-X16
            </CanvasPill>
            <CanvasPill theme={th} tone="info" dot>
              T5 · 30s refresh tier
            </CanvasPill>
            <a
              href={getPlatformAdminFeatureFlagsUrl()}
              target="_blank"
              rel="noreferrer"
              style={{ textDecoration: "none" }}
            >
              <CanvasBtn theme={th} variant="primary" size="sm" icon="ext">
                Platform Admin
              </CanvasBtn>
            </a>
          </>
        }
      />

      <div style={pageBodyStyle}>
        {errors.length > 0 ? (
          <CanvasBanner
            theme={th}
            tone="danger"
            icon="warn"
            title="Feature flags snapshot partially degraded"
            body={errors.join(" · ")}
          />
        ) : null}

        {refreshMetadata.dataFreshness !== "fresh" ? (
          <CanvasBanner
            theme={th}
            tone={
              refreshMetadata.dataFreshness === "degraded" ? "warn" : "info"
            }
            icon={
              refreshMetadata.dataFreshness === "degraded" ? "warn" : "info"
            }
            title="Stale snapshot visible"
            body={`refresh tier T5 · source ${refreshMetadata.source} · generated ${refreshMetadata.generatedAt} · freshness ${refreshMetadata.dataFreshness}`}
          />
        ) : null}

        <div style={infoGridStyle}>
          <CanvasCard
            theme={th}
            title="Feature visibility snapshot"
            subtitle="Must-show data from the tenant-scoped read feed: key, current value, scope, changed by, changed at, description."
          >
            <CanvasDL
              theme={th}
              cols={2}
              items={[
                {
                  k: "TENANT",
                  v: identity?.tenantId ?? DEMO_TENANT_ID,
                  mono: true,
                },
                { k: "REALM", v: identity?.realm ?? "tenant", mono: true },
                { k: "VISIBLE", v: String(visibleFlags), mono: true },
                { k: "ENABLED", v: String(enabledFlags), mono: true },
                { k: "OVERRIDES", v: String(tenantOverrides), mono: true },
                { k: "ROLLING OUT", v: String(rollingOutFlags), mono: true },
                {
                  k: "FRESHNESS",
                  v: (
                    <CanvasPill
                      theme={th}
                      tone={getFreshnessTone(refreshMetadata.dataFreshness)}
                      dot
                    >
                      {refreshMetadata.dataFreshness}
                    </CanvasPill>
                  ),
                },
                { k: "GENERATED", v: refreshMetadata.generatedAt, mono: true },
              ]}
            />
            <div style={{ ...secondaryTextStyle, marginTop: 12 }}>
              {noteSummary}
            </div>
          </CanvasCard>

          <div style={cardStackStyle}>
            <CanvasCard
              theme={th}
              title="Available actions"
              subtitle="CTAs are driven from `availableActions`, not hard-coded by role."
            >
              <div style={actionRowStyle}>
                {availableActions.map((action: ResourceActionDescriptor) =>
                  renderActionLink(action, q, scope),
                )}
              </div>
            </CanvasCard>

            <CanvasCard
              theme={th}
              title="Empty state previews"
              subtitle="All six `EmptyReason` states stay visually distinct."
            >
              <div style={chipRowStyle}>
                {EMPTY_REASON_PREVIEWS.map((reason) => (
                  <Link
                    key={reason}
                    href={buildFeatureFlagsUrl({
                      q,
                      scope,
                      emptyReason: reason,
                    })}
                    style={previewLinkStyle}
                  >
                    {reason}
                  </Link>
                ))}
                <Link
                  href={buildFeatureFlagsUrl({ q, scope })}
                  style={previewLinkStyle}
                >
                  live data
                </Link>
              </div>
            </CanvasCard>
          </div>
        </div>

        <CanvasCard
          theme={th}
          title="Filter by scope, search by key"
          subtitle="Primary task: explain whether a capability is gated for this tenant instead of broken."
        >
          <form action="/feature-flags" style={filterGridStyle}>
            <label style={fieldStyle}>
              <span style={fieldLabelStyle}>Search</span>
              <input
                defaultValue={q}
                name="q"
                placeholder="tenant-portal.reports"
                style={inputStyle}
              />
            </label>
            <label style={fieldStyle}>
              <span style={fieldLabelStyle}>Scope</span>
              <select defaultValue={scope} name="scope" style={selectStyle}>
                <option value="all">all scopes</option>
                <option value="tenant_override">tenant override</option>
                <option value="global_default">global default</option>
                <option value="rolling_out">rolling out</option>
              </select>
            </label>
            <div style={formActionRowStyle}>
              <CanvasBtn theme={th} variant="primary" size="sm">
                搜尋
              </CanvasBtn>
              <Link href="/feature-flags" style={{ textDecoration: "none" }}>
                <CanvasBtn theme={th} size="sm">
                  清除
                </CanvasBtn>
              </Link>
            </div>
          </form>
        </CanvasCard>

        <CanvasCard
          theme={th}
          title="Feature visibility"
          subtitle="With tenant overrides visible, mid-rollout flags called out, and cross-app drill-ins for governance + audit."
          padding={0}
        >
          {emptyCopy ? (
            <div style={emptyStateStyle}>
              <CanvasPill theme={th} tone={emptyCopy.tone}>
                {effectiveEmptyReason}
              </CanvasPill>
              <div style={emptyTitleStyle}>{emptyCopy.title}</div>
              <div style={emptyBodyStyle}>{emptyCopy.body}</div>
              {emptyCopy.nextAction && emptyActionHref ? (
                emptyActionHref.startsWith("http") ? (
                  <a
                    href={emptyActionHref}
                    target="_blank"
                    rel="noreferrer"
                    style={{ textDecoration: "none" }}
                  >
                    <CanvasBtn
                      theme={th}
                      variant="primary"
                      size="sm"
                      icon="ext"
                    >
                      {getActionLabel(emptyCopy.nextAction.action)}
                    </CanvasBtn>
                  </a>
                ) : (
                  <Link
                    href={emptyActionHref}
                    style={{ textDecoration: "none" }}
                  >
                    <CanvasBtn theme={th} variant="primary" size="sm">
                      {getActionLabel(emptyCopy.nextAction.action)}
                    </CanvasBtn>
                  </Link>
                )
              ) : null}
            </div>
          ) : (
            <>
              <CanvasTable<FlagRow> theme={th} columns={columns} rows={rows} />
              <div style={footerLinkRowStyle}>
                <Link
                  href={getAuditHistoryUrl()}
                  style={{ textDecoration: "none" }}
                >
                  <CanvasBtn theme={th} size="sm" icon="export">
                    Tenant audit
                  </CanvasBtn>
                </Link>
                <a
                  href={getPlatformAdminFeatureFlagsUrl()}
                  target="_blank"
                  rel="noreferrer"
                  style={{ textDecoration: "none" }}
                >
                  <CanvasBtn theme={th} size="sm" icon="ext">
                    Platform Admin feature flags
                  </CanvasBtn>
                </a>
              </div>
            </>
          )}
        </CanvasCard>
      </div>
    </div>
  );
}
