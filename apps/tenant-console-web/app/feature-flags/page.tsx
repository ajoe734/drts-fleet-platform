import type { CSSProperties } from "react";
import type {
  CrossAppResourceLink,
  EmptyReason,
  ResourceActionDescriptor,
  TenantFeatureFlagRecord,
  TenantFeatureFlagScope,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasCard,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  type CanvasTableColumn,
  type CanvasTone,
  buildCanvasTheme,
} from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";

export const dynamic = "force-dynamic";

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

// Q-X15: the six list-level empty reasons. `driver_not_eligible` is
// driver-app-specific and never applies to a tenant-console read surface.
const EMPTY_REASONS: readonly EmptyReason[] = [
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
  "filtered_empty",
] as const;

// Q-X13: feature visibility is read-only per Q-X16, so the published actions
// are both low-risk reads. CTAs render from these descriptors instead of
// hard-coding role-to-action mapping.
const ROUTE_ACTIONS: readonly ResourceActionDescriptor[] = [
  { action: "search", enabled: true, riskLevel: "low" },
  { action: "view_change_history", enabled: true, riskLevel: "low" },
] as const;

const SCOPE_FILTERS: readonly {
  value: "all" | TenantFeatureFlagScope;
  label: string;
}[] = [
  { value: "all", label: "全部" },
  { value: "tenant_override", label: "租戶覆寫" },
  { value: "global_default", label: "平台預設" },
] as const;

// Q-X03: full feature-flag governance lives in platform-admin. Cross-app
// navigation is a deep link to the separately-deployed admin app.
const DEFAULT_PLATFORM_ADMIN_BASE = "/_apps/platform-admin";

function resolvePlatformAdminBase(): string {
  const envValue =
    process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL ??
    process.env.DRTS_PLATFORM_ADMIN_URL ??
    "";
  const trimmed = envValue.trim().replace(/\/$/, "");
  return trimmed || DEFAULT_PLATFORM_ADMIN_BASE;
}

function platformAdminFlagHistoryLink(flagKey: string): CrossAppResourceLink {
  return {
    targetApp: "platform-admin",
    route: flagKey
      ? `/feature-flags?flag=${encodeURIComponent(flagKey)}`
      : "/feature-flags",
    resourceType: "feature_flag",
    resourceId: flagKey,
    openMode: "new_tab",
    label: flagKey
      ? `在 Platform Admin 查看 ${flagKey} 變更紀錄`
      : "前往功能旗標治理",
  };
}

function crossAppHref(link: CrossAppResourceLink): string {
  const base = resolvePlatformAdminBase();
  const path = link.route.startsWith("/") ? link.route : `/${link.route}`;
  return `${base}${path}`;
}

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const kpiGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 12,
};

const toolbarStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 10,
};

const searchFormStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flex: "1 1 280px",
  minWidth: 0,
};

const searchInputStyle: CSSProperties = {
  flex: "1 1 auto",
  minWidth: 0,
  height: 32,
  padding: "0 10px",
  borderRadius: 6,
  border: `1px solid ${th.border}`,
  background: th.surface,
  color: th.text,
  fontSize: 12.5,
  fontFamily: th.monoFamily,
};

const scopeFilterStyle: CSSProperties = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
};

const linkActionStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  height: 32,
  padding: "0 12px",
  borderRadius: 6,
  border: `1px solid ${th.accentBorder}`,
  background: th.accentBg,
  color: th.accentHi,
  fontSize: 12,
  fontWeight: 600,
  textDecoration: "none",
  whiteSpace: "nowrap",
};

const disabledLinkActionStyle: CSSProperties = {
  ...linkActionStyle,
  border: `1px solid ${th.border}`,
  background: th.surfaceLo,
  color: th.textMuted,
  cursor: "not-allowed",
};

const buttonActionStyle: CSSProperties = {
  ...linkActionStyle,
  cursor: "pointer",
};

const chipLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  height: 28,
  padding: "0 12px",
  borderRadius: 999,
  border: `1px solid ${th.border}`,
  background: th.surface,
  color: th.textMuted,
  fontSize: 11.5,
  fontWeight: 600,
  textDecoration: "none",
  whiteSpace: "nowrap",
};

const chipLinkActiveStyle: CSSProperties = {
  ...chipLinkStyle,
  border: `1px solid ${th.accentBorder}`,
  background: th.accentBg,
  color: th.accentHi,
};

const keyCellStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 3,
};

const keyPrimaryStyle: CSSProperties = {
  color: th.text,
  fontWeight: 600,
  fontFamily: th.monoFamily,
  fontSize: 11.5,
};

const keyDescriptionStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 11,
  lineHeight: 1.4,
  whiteSpace: "normal",
};

const currentCellStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};

const emptyStateWrapStyle: CSSProperties = {
  padding: "32px 24px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 8,
  textAlign: "center",
};

const emptyStateTitleStyle: CSSProperties = {
  color: th.text,
  fontWeight: 600,
  fontSize: 13.5,
};

const emptyStateBodyStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 12,
  lineHeight: 1.5,
  maxWidth: 460,
};

const dateTimeFormatter = new Intl.DateTimeFormat("zh-Hant", {
  dateStyle: "short",
  timeStyle: "short",
});

const numberFormatter = new Intl.NumberFormat("en");

function formatChangedAt(value: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return dateTimeFormatter.format(parsed);
}

function formatCount(value: number) {
  return numberFormatter.format(value);
}

function parseEmptyReason(value: string | undefined): EmptyReason | null {
  if (!value) return null;
  return EMPTY_REASONS.includes(value as EmptyReason)
    ? (value as EmptyReason)
    : null;
}

function parseScope(value: string | undefined): "all" | TenantFeatureFlagScope {
  if (value === "tenant_override" || value === "global_default") {
    return value;
  }
  return "all";
}

// Distinguish the read failure modes so the empty state explains the right
// thing instead of collapsing every error into "no data".
function classifyFetchError(message: string): EmptyReason {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("403") ||
    normalized.includes("permission") ||
    normalized.includes("forbidden") ||
    normalized.includes("unauthor")
  ) {
    return "permission_denied";
  }
  if (
    normalized.includes("503") ||
    normalized.includes("502") ||
    normalized.includes("504") ||
    normalized.includes("unavailable") ||
    normalized.includes("timeout") ||
    normalized.includes("econnrefused") ||
    normalized.includes("fetch failed")
  ) {
    return "external_unavailable";
  }
  return "fetch_failed";
}

type FeatureFlagsPageData = {
  flags: TenantFeatureFlagRecord[];
  totalCount: number;
  errors: string[];
  emptyReason: EmptyReason | null;
  generatedAt: string;
  refreshTier: "slow";
  availableActions: ResourceActionDescriptor[];
  query: string;
  scope: "all" | TenantFeatureFlagScope;
};

function compareFlags(a: TenantFeatureFlagRecord, b: TenantFeatureFlagRecord) {
  // Tenant overrides first (the primary task is confirming this tenant's
  // deviations from platform defaults), then rolling-out, then by key.
  if (a.scope !== b.scope) {
    return a.scope === "tenant_override" ? -1 : 1;
  }
  if (a.rolloutStatus !== b.rolloutStatus) {
    return a.rolloutStatus === "rolling_out" ? -1 : 1;
  }
  return a.key.localeCompare(b.key, "en");
}

async function loadFeatureFlagsData(
  query: string,
  scope: "all" | TenantFeatureFlagScope,
  emptyReasonOverride: EmptyReason | null,
): Promise<FeatureFlagsPageData> {
  const client = getTenantClient();
  const errors: string[] = [];
  let rawFlags: TenantFeatureFlagRecord[] = [];
  let fetchErrorReason: EmptyReason | null = null;
  let generatedAt = new Date().toISOString();

  const result = await Promise.allSettled([client.listTenantFeatureFlags()]);
  const [flagsResult] = result;

  if (flagsResult && flagsResult.status === "fulfilled") {
    rawFlags = [...flagsResult.value.flags];
    generatedAt = flagsResult.value.generatedAt || generatedAt;
  } else if (flagsResult && flagsResult.status === "rejected") {
    const message =
      flagsResult.reason instanceof Error
        ? flagsResult.reason.message
        : "功能旗標清單載入失敗";
    errors.push(message);
    fetchErrorReason = classifyFetchError(message);
  }

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = rawFlags
    .filter((flag) => (scope === "all" ? true : flag.scope === scope))
    .filter((flag) =>
      normalizedQuery.length === 0
        ? true
        : flag.key.toLowerCase().includes(normalizedQuery) ||
          flag.description.toLowerCase().includes(normalizedQuery),
    )
    .sort(compareFlags);

  const hasFilter = normalizedQuery.length > 0 || scope !== "all";

  let inferredEmptyReason: EmptyReason | null = null;
  if (filtered.length === 0) {
    if (fetchErrorReason) {
      inferredEmptyReason = fetchErrorReason;
    } else if (rawFlags.length === 0) {
      inferredEmptyReason = "not_provisioned";
    } else if (hasFilter) {
      inferredEmptyReason = "filtered_empty";
    } else {
      inferredEmptyReason = "no_data";
    }
  }

  return {
    flags: filtered,
    totalCount: rawFlags.length,
    errors,
    emptyReason: emptyReasonOverride ?? inferredEmptyReason,
    generatedAt,
    refreshTier: "slow",
    availableActions: [...ROUTE_ACTIONS],
    query,
    scope,
  };
}

function getEmptyStateCopy(reason: EmptyReason): {
  tone: CanvasTone;
  title: string;
  body: string;
} {
  switch (reason) {
    case "not_provisioned":
      return {
        tone: "info",
        title: "本租戶尚未佈建任何功能旗標",
        body: "平台治理尚未把任何 flag 同步到這個租戶領域。完整治理仍在 Platform Admin，佈建後會自動出現於此唯讀視圖。",
      };
    case "fetch_failed":
      return {
        tone: "warn",
        title: "功能旗標清單載入失敗",
        body: "路由仍可用，但 GET /api/tenant/feature-flags 這次讀取失敗。待後端相依恢復後重新整理即可。",
      };
    case "permission_denied":
      return {
        tone: "danger",
        title: "目前角色無法檢視功能旗標",
        body: "頁面可見，但目前的租戶角色沒有讀取 feature visibility 的權限。請改用具備檢視權限的帳號。",
      };
    case "external_unavailable":
      return {
        tone: "warn",
        title: "上游功能旗標服務暫時無法使用",
        body: "讀取被降級，因為一個或多個上游平台治理服務目前不可用或回傳過期資料。",
      };
    case "filtered_empty":
      return {
        tone: "neutral",
        title: "沒有符合目前篩選的旗標",
        body: "本租戶有可見的功能旗標，但目前的搜尋字串或範圍篩選沒有命中任何一筆。清除篩選或改選其他範圍。",
      };
    case "driver_not_eligible":
    case "no_data":
    default:
      return {
        tone: "info",
        title: "目前沒有可見的功能旗標",
        body: "這個租戶領域目前沒有任何 flag 對應的可見資料。",
      };
  }
}

function getScopeTone(scope: TenantFeatureFlagScope): CanvasTone {
  return scope === "tenant_override" ? "accent" : "neutral";
}

function getScopeLabel(scope: TenantFeatureFlagScope) {
  return scope === "tenant_override" ? "tenant_override" : "global_default";
}

type FeatureFlagsPageProps = {
  searchParams?: Promise<{
    q?: string;
    scope?: string;
    emptyReason?: string;
  }>;
};

export default async function FeatureFlagsPage({
  searchParams,
}: FeatureFlagsPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const query = resolvedSearchParams?.q ?? "";
  const scope = parseScope(resolvedSearchParams?.scope);
  const emptyReasonOverride = parseEmptyReason(
    resolvedSearchParams?.emptyReason,
  );
  const data = await loadFeatureFlagsData(query, scope, emptyReasonOverride);

  const searchAction = data.availableActions.find(
    (item) => item.action === "search",
  );
  const historyAction = data.availableActions.find(
    (item) => item.action === "view_change_history",
  );

  const tenantOverrides = data.flags.filter(
    (flag) => flag.scope === "tenant_override",
  ).length;
  const enabledCount = data.flags.filter((flag) => flag.enabled).length;
  const rollingOutCount = data.flags.filter(
    (flag) => flag.rolloutStatus === "rolling_out",
  ).length;

  const governanceLink = platformAdminFlagHistoryLink("");
  const historyEnabled = historyAction?.enabled !== false;

  const columns: CanvasTableColumn<
    TenantFeatureFlagRecord & Record<string, unknown>
  >[] = [
    {
      h: "KEY",
      w: 360,
      r: (row) => (
        <div style={keyCellStyle}>
          <span style={keyPrimaryStyle}>{row.key}</span>
          {row.description ? (
            <span style={keyDescriptionStyle}>{row.description}</span>
          ) : null}
        </div>
      ),
    },
    {
      h: "CURRENT",
      w: 150,
      r: (row) => (
        <span style={currentCellStyle}>
          <CanvasPill theme={th} tone={row.enabled ? "success" : "neutral"} dot>
            {row.enabled ? "enabled" : "disabled"}
          </CanvasPill>
          {row.rolloutStatus === "rolling_out" ? (
            <CanvasPill theme={th} tone="warn">
              rolling out
            </CanvasPill>
          ) : null}
        </span>
      ),
    },
    {
      h: "SCOPE",
      w: 150,
      r: (row) => (
        <CanvasPill theme={th} tone={getScopeTone(row.scope)}>
          {getScopeLabel(row.scope)}
        </CanvasPill>
      ),
    },
    {
      h: "LAST CHANGED BY",
      w: 180,
      r: (row) => row.lastChangedBy ?? "—",
    },
    {
      h: "AT",
      w: 150,
      mono: true,
      r: (row) => formatChangedAt(row.lastChangedAt),
    },
    {
      h: "HISTORY",
      w: 90,
      align: "right",
      r: (row) =>
        historyEnabled ? (
          <a
            href={crossAppHref(platformAdminFlagHistoryLink(row.key))}
            target="_blank"
            rel="noreferrer"
            style={chipLinkStyle}
            title={platformAdminFlagHistoryLink(row.key).label}
          >
            紀錄 ↗
          </a>
        ) : (
          <span style={{ color: th.textMuted, fontSize: 11.5 }}>—</span>
        ),
    },
  ];

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="功能旗標 · read-only"
        subtitle="本租戶可見的 flags · 完整治理在 Platform Admin · GET /api/tenant/feature-flags"
        actions={
          <a
            href={crossAppHref(governanceLink)}
            target="_blank"
            rel="noreferrer"
            style={historyEnabled ? linkActionStyle : disabledLinkActionStyle}
            aria-disabled={historyEnabled ? undefined : true}
            title={
              historyEnabled
                ? governanceLink.label
                : historyAction?.disabledReasonCode
            }
          >
            治理設定 ↗
          </a>
        }
      />

      <div style={pageBodyStyle}>
        <CanvasBanner
          theme={th}
          tone="info"
          icon="clock"
          title="重新整理層級 T5：tenant slow（30 秒）"
          body={`此頁採 30 秒 tenant-slow 週期更新（${data.refreshTier}）。快照載入時間 ${formatChangedAt(
            data.generatedAt,
          )}。`}
        />

        <CanvasBanner
          theme={th}
          tone="accent"
          icon="flags"
          title="唯讀視圖 · per Q-X16"
          body="這是平台功能旗標治理在本租戶領域的唯讀鏡像。可用動作只有搜尋與檢視變更紀錄；任何開關／rollout 變更都在 Platform Admin 進行。"
        />

        {data.errors.length > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title="部分功能旗標資料無法載入"
            body={data.errors.join(" · ")}
          />
        ) : null}

        <div style={kpiGridStyle}>
          <CanvasKPI
            theme={th}
            label="Flags"
            value={formatCount(data.flags.length)}
            sub={
              data.totalCount !== data.flags.length
                ? `${formatCount(data.totalCount)} 總數`
                : "tenant visible"
            }
          />
          <CanvasKPI
            theme={th}
            label="Overrides"
            value={formatCount(tenantOverrides)}
            sub="tenant_override"
          />
          <CanvasKPI
            theme={th}
            label="Enabled"
            value={formatCount(enabledCount)}
            sub="current value on"
          />
          <CanvasKPI
            theme={th}
            label="Rolling out"
            value={formatCount(rollingOutCount)}
            sub="partial rollout"
          />
        </div>

        <div style={toolbarStyle}>
          <form method="get" style={searchFormStyle}>
            <input
              type="search"
              name="q"
              defaultValue={data.query}
              placeholder="以 key 搜尋…"
              aria-label="以 key 搜尋功能旗標"
              style={searchInputStyle}
              disabled={searchAction?.enabled === false}
            />
            {data.scope !== "all" ? (
              <input type="hidden" name="scope" value={data.scope} />
            ) : null}
            <button
              type="submit"
              style={
                searchAction?.enabled === false
                  ? disabledLinkActionStyle
                  : buttonActionStyle
              }
              disabled={searchAction?.enabled === false}
              title={searchAction?.disabledReasonCode}
            >
              搜尋
            </button>
          </form>

          <div style={scopeFilterStyle}>
            {SCOPE_FILTERS.map((filter) => {
              const params = new URLSearchParams();
              if (filter.value !== "all") {
                params.set("scope", filter.value);
              }
              if (data.query) {
                params.set("q", data.query);
              }
              const queryString = params.toString();
              const href = queryString ? `?${queryString}` : "/feature-flags";
              const active = data.scope === filter.value;
              return (
                <a
                  key={filter.value}
                  href={href}
                  style={active ? chipLinkActiveStyle : chipLinkStyle}
                >
                  {filter.label}
                </a>
              );
            })}
          </div>
        </div>

        <CanvasCard theme={th} padding={0}>
          {data.flags.length > 0 ? (
            <CanvasTable<TenantFeatureFlagRecord & Record<string, unknown>>
              theme={th}
              columns={columns}
              rows={
                data.flags as (TenantFeatureFlagRecord &
                  Record<string, unknown>)[]
              }
            />
          ) : (
            (() => {
              const copy = getEmptyStateCopy(data.emptyReason ?? "no_data");
              return (
                <div style={emptyStateWrapStyle}>
                  <CanvasPill theme={th} tone={copy.tone} dot>
                    {data.emptyReason ?? "no_data"}
                  </CanvasPill>
                  <div style={emptyStateTitleStyle}>{copy.title}</div>
                  <div style={emptyStateBodyStyle}>{copy.body}</div>
                </div>
              );
            })()
          )}
        </CanvasCard>
      </div>
    </div>
  );
}
