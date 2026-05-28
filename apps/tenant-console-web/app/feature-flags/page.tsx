import Link from "next/link";
import type { CSSProperties } from "react";
import type {
  CrossAppResourceLink,
  EmptyReason,
  ResourceActionDescriptor,
  TenantFeatureFlagScope,
  TenantFeatureFlagVisibilityList,
  TenantFeatureFlagVisibilityRecord,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasField,
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

const PLATFORM_ADMIN_BASE_URL =
  process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL ?? "http://localhost:3002";

const pageStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const panelGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const summaryCardStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  padding: 16,
};

const summaryLabelStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 11,
  letterSpacing: "0.08em",
};

const summaryValueStyle: CSSProperties = {
  color: th.text,
  fontSize: 24,
  lineHeight: 1,
  fontWeight: 700,
};

const summaryHintStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 11.5,
  lineHeight: 1.45,
};

const filterGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.5fr) minmax(180px, 0.7fr) auto",
  gap: 12,
  alignItems: "end",
};

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  borderRadius: 8,
  border: `1px solid ${th.border}`,
  background: th.bgRaised,
  color: th.text,
  padding: "8px 10px",
  fontSize: 12.5,
  outline: "none",
};

const keyCellStyle: CSSProperties = {
  display: "grid",
  gap: 5,
};

const keyStyle: CSSProperties = {
  color: th.text,
  fontFamily: th.monoFamily,
  fontSize: 11.5,
  lineHeight: 1.4,
};

const subcopyStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 11.5,
  lineHeight: 1.45,
  whiteSpace: "normal",
};

const actionRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
};

const emptyWrapStyle: CSSProperties = {
  display: "grid",
  gap: 12,
  padding: 20,
};

const disabledActionWrapStyle: CSSProperties = {
  display: "inline-flex",
  cursor: "not-allowed",
};

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type FlagRow = {
  key: string;
  description: string;
  enabled: boolean;
  scope: TenantFeatureFlagScope;
  rolloutState: TenantFeatureFlagVisibilityRecord["rolloutState"];
  updatedAt: string;
  updatedBy: string | null;
  historyLink: CrossAppResourceLink | null;
  availableActions: ResourceActionDescriptor[];
};

type EmptyStateCopy = {
  tone: Exclude<CanvasTone, "neutral">;
  icon: "flags" | "warn" | "audit" | "clock" | "filter";
  title: string;
  body: string;
  ctaLabel?: string;
  ctaHref?: string;
  ctaTarget?: "_blank";
};

const previewableEmptyReasons: EmptyReason[] = [
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
  "filtered_empty",
];

const refreshTierMeta = {
  urgent: { code: "T0", label: "urgent", cadence: "push + 5s fallback" },
  fast: { code: "T1", label: "fast", cadence: "3s auto poll" },
  dispatch: { code: "T2", label: "dispatch", cadence: "5s auto poll" },
  medium: { code: "T3", label: "medium", cadence: "15s auto poll" },
  medium_slow: { code: "T4", label: "medium_slow", cadence: "30s auto poll" },
  slow: { code: "T5", label: "slow", cadence: "30s auto poll" },
  manual: { code: "T6", label: "manual", cadence: "manual refresh" },
} as const;

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const dateTimeFormatter = new Intl.DateTimeFormat("sv-SE", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function formatDateTime(value: string | null | undefined) {
  const parsed = parseDate(value);
  if (!parsed) return "—";
  return dateTimeFormatter.format(parsed).replace(",", "");
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知錯誤";
}

function normalizeQueryValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function isPreviewableEmptyReason(value: string): value is EmptyReason {
  return previewableEmptyReasons.includes(value as EmptyReason);
}

function getPlatformAdminFlagsHref() {
  return `${PLATFORM_ADMIN_BASE_URL}/feature-flags`;
}

function getButtonLinkStyle(variant: "secondary" | "ghost" = "secondary") {
  if (variant === "ghost") {
    return {
      color: th.textMuted,
      fontSize: 12,
      textDecoration: "none",
      display: "inline-flex",
      alignItems: "center",
      minHeight: 28,
      padding: "5px 10px",
      borderRadius: 7,
      border: "1px solid transparent",
    } satisfies CSSProperties;
  }

  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 28,
    padding: "5px 10px",
    borderRadius: 7,
    border: `1px solid ${th.border}`,
    background: th.surface,
    color: th.text,
    fontSize: 12,
    textDecoration: "none",
  } satisfies CSSProperties;
}

function getActionDescriptor(
  actions: ResourceActionDescriptor[],
  target: string,
  fallback?: ResourceActionDescriptor,
) {
  return actions.find((action) => action.action === target) ?? fallback ?? null;
}

function getRefreshMeta(
  tier: TenantFeatureFlagVisibilityList["refreshTier"] | null | undefined,
) {
  return refreshTierMeta[tier ?? "slow"];
}

function getFreshnessTone(
  freshness:
    | TenantFeatureFlagVisibilityList["refresh"]["dataFreshness"]
    | null
    | undefined,
): Exclude<CanvasTone, "neutral"> {
  return freshness === "degraded" ? "danger" : "warn";
}

function getFreshnessTitle(
  freshness:
    | TenantFeatureFlagVisibilityList["refresh"]["dataFreshness"]
    | null
    | undefined,
) {
  switch (freshness) {
    case "degraded":
      return "資料來源降級";
    case "unknown":
      return "資料新鮮度未知";
    case "stale":
    default:
      return "資料已過時";
  }
}

function getFreshnessBody(
  freshness:
    | TenantFeatureFlagVisibilityList["refresh"]["dataFreshness"]
    | null
    | undefined,
  generatedAt: string | null | undefined,
  tier: TenantFeatureFlagVisibilityList["refreshTier"] | null | undefined,
) {
  const meta = getRefreshMeta(tier);
  const snapshotAt = formatDateTime(generatedAt);
  const suffix =
    freshness === "unknown"
      ? "目前請以這份快照為準，必要時改從 Platform Admin 核對 authority 狀態。"
      : "請手動 refresh 或等候下一次 poll。";

  return `快照建立時間 ${snapshotAt}，refresh tier ${meta.code} (${meta.cadence})；${suffix}`;
}

function getScopeTone(scope: TenantFeatureFlagScope): CanvasTone {
  return scope === "tenant_override" ? "accent" : "neutral";
}

function getEmptyStateCopy(reason: EmptyReason): EmptyStateCopy {
  switch (reason) {
    case "not_provisioned":
      return {
        tone: "info",
        icon: "flags",
        title: "功能旗標可視面尚未佈建",
        body: "租戶尚未收到 feature visibility read model；完整治理與啟用狀態仍由 Platform Admin authority 管理。",
        ctaLabel: "前往 Platform Admin",
        ctaHref: getPlatformAdminFlagsHref(),
        ctaTarget: "_blank",
      };
    case "fetch_failed":
      return {
        tone: "danger",
        icon: "warn",
        title: "讀取功能旗標失敗",
        body: "這次快照未能完成載入。請稍後重整，必要時改從稽核畫面交叉確認最近的治理變更。",
        ctaLabel: "查看稽核",
        ctaHref: "/audit",
      };
    case "permission_denied":
      return {
        tone: "warn",
        icon: "audit",
        title: "目前角色沒有可視權限",
        body: "此租戶角色未被授權查看 feature visibility。若需確認 gating 原因，請聯繫 tenant admin 或平台治理角色。",
        ctaLabel: "開啟稽核",
        ctaHref: "/audit",
      };
    case "external_unavailable":
      return {
        tone: "warn",
        icon: "clock",
        title: "旗標 authority 暫時不可用",
        body: "旗標來源目前降級或暫時不可達。請稍後再試，必要時改由 Platform Admin 查核 authority snapshot。",
        ctaLabel: "前往 Platform Admin",
        ctaHref: getPlatformAdminFlagsHref(),
        ctaTarget: "_blank",
      };
    case "filtered_empty":
      return {
        tone: "info",
        icon: "filter",
        title: "沒有符合目前篩選條件的旗標",
        body: "調整關鍵字或 scope 篩選即可回到完整可視清單。",
      };
    case "no_data":
    default:
      return {
        tone: "info",
        icon: "flags",
        title: "本租戶目前沒有可見旗標",
        body: "當租戶尚未暴露任何 tenant-facing feature visibility record 時，頁面維持空白但仍保留治理入口。",
        ctaLabel: "前往 Platform Admin",
        ctaHref: getPlatformAdminFlagsHref(),
        ctaTarget: "_blank",
      };
  }
}

function classifyErrorReason(message: string): EmptyReason {
  if (message.includes("403") || message.includes("401")) {
    return "permission_denied";
  }

  if (
    message.includes("502") ||
    message.includes("503") ||
    message.includes("504")
  ) {
    return "external_unavailable";
  }

  return "fetch_failed";
}

function rowMatchesQuery(row: FlagRow, query: string) {
  if (!query) return true;

  const needle = query.toLowerCase();
  return (
    row.key.toLowerCase().includes(needle) ||
    row.description.toLowerCase().includes(needle) ||
    row.scope.toLowerCase().includes(needle)
  );
}

function toFlagRow(record: TenantFeatureFlagVisibilityRecord): FlagRow {
  return {
    key: record.key,
    description: record.description,
    enabled: record.enabled,
    scope: record.scope,
    rolloutState: record.rolloutState,
    updatedAt: record.updatedAt,
    updatedBy: record.updatedBy,
    historyLink: record.historyLink ?? null,
    availableActions: record.availableActions,
  };
}

function getHistoryLabel(link: CrossAppResourceLink | null) {
  if (!link) return "歷程";
  if (link.targetApp === "platform-admin") return "平台稽核";
  if (link.targetApp === "ops-console") return "Ops 稽核";
  return "歷程";
}

async function loadFeatureFlags() {
  const client = getTenantClient();

  try {
    const data = await client.getTenantFeatureFlags();
    return {
      data,
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      error: toErrorMessage(error),
    };
  }
}

export default async function FeatureFlagsPage({ searchParams }: PageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const query = normalizeQueryValue(resolvedSearchParams.q).trim();
  const scopeFilter = normalizeQueryValue(resolvedSearchParams.scope).trim();
  const previewReasonRaw = normalizeQueryValue(
    resolvedSearchParams.emptyReason,
  ).trim();
  const previewReason = isPreviewableEmptyReason(previewReasonRaw)
    ? previewReasonRaw
    : "";

  const { data, error } = await loadFeatureFlags();
  const pageActions = data?.availableActions ?? [];
  const searchAction = getActionDescriptor(pageActions, "search");
  const platformAdminAction = getActionDescriptor(
    pageActions,
    "open_platform_admin_feature_flags",
  );

  const sourceRows = (data?.items ?? []).map(toFlagRow);
  const filteredRows = sourceRows.filter((row) => {
    if (scopeFilter && scopeFilter !== "all" && row.scope !== scopeFilter) {
      return false;
    }

    return rowMatchesQuery(row, query);
  });

  const enabledCount = sourceRows.filter((row) => row.enabled).length;
  const overrideCount = sourceRows.filter(
    (row) => row.scope === "tenant_override",
  ).length;
  const rollingOutCount = sourceRows.filter(
    (row) => row.rolloutState === "rolling_out",
  ).length;
  const latestUpdatedAt = sourceRows.reduce<string | null>((latest, row) => {
    if (!latest) return row.updatedAt;
    return new Date(row.updatedAt) > new Date(latest) ? row.updatedAt : latest;
  }, null);

  let emptyReason: EmptyReason | null = null;
  if (previewReason) {
    emptyReason = previewReason;
  } else if (error) {
    emptyReason = classifyErrorReason(error);
  } else if (filteredRows.length === 0 && sourceRows.length > 0) {
    emptyReason = "filtered_empty";
  } else if (filteredRows.length === 0) {
    emptyReason = data?.emptyState?.reason ?? "no_data";
  }

  const emptyCopy = emptyReason ? getEmptyStateCopy(emptyReason) : null;
  const refreshMeta = getRefreshMeta(data?.refreshTier);
  const refreshGeneratedAt = data?.refresh.generatedAt ?? latestUpdatedAt;

  const columns: CanvasTableColumn<FlagRow>[] = [
    {
      h: "KEY",
      k: "key",
      w: 380,
      mono: true,
      r: (row) => (
        <div style={keyCellStyle}>
          <span style={keyStyle}>{row.key}</span>
          <span style={subcopyStyle}>{row.description || "—"}</span>
        </div>
      ),
    },
    {
      h: "CURRENT",
      w: 112,
      r: (row) => (
        <CanvasPill theme={th} tone={row.enabled ? "success" : "neutral"} dot>
          {row.enabled ? "enabled" : "disabled"}
        </CanvasPill>
      ),
    },
    {
      h: "SCOPE",
      w: 180,
      r: (row) => (
        <div style={keyCellStyle}>
          <CanvasPill theme={th} tone={getScopeTone(row.scope)}>
            {row.scope}
          </CanvasPill>
          {row.rolloutState === "rolling_out" ? (
            <span style={subcopyStyle}>rolling_out</span>
          ) : null}
        </div>
      ),
    },
    {
      h: "LAST CHANGED BY",
      w: 210,
      r: (row) => (
        <div style={keyCellStyle}>
          <span>{row.updatedBy ?? "authority pending"}</span>
          {row.updatedBy ? null : (
            <span style={subcopyStyle}>
              shared store 尚未回傳 platform user reference
            </span>
          )}
        </div>
      ),
    },
    {
      h: "AT",
      k: "updatedAt",
      mono: true,
      w: 170,
      r: (row) => formatDateTime(row.updatedAt),
    },
    {
      h: "ACTIONS",
      w: 140,
      r: (row) => {
        const historyAction = getActionDescriptor(
          row.availableActions,
          "view_change_history",
        );

        if (historyAction?.enabled && row.historyLink) {
          return (
            <Link
              href={row.historyLink.route}
              style={getButtonLinkStyle()}
              target={
                row.historyLink.openMode === "new_tab" ? "_blank" : undefined
              }
            >
              {getHistoryLabel(row.historyLink)}
            </Link>
          );
        }

        return (
          <span
            style={disabledActionWrapStyle}
            title={
              historyAction?.disabledReasonCode ??
              (row.historyLink
                ? "目前不可查看變更歷程"
                : "authority snapshot 尚未附上歷程 deep link")
            }
          >
            <CanvasBtn theme={th} icon="audit" size="sm" disabled>
              歷程
            </CanvasBtn>
          </span>
        );
      },
    },
  ];

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
            {platformAdminAction?.enabled ? (
              <Link
                href={getPlatformAdminFlagsHref()}
                style={getButtonLinkStyle()}
                target="_blank"
              >
                Platform Admin
              </Link>
            ) : platformAdminAction ? (
              <span
                style={disabledActionWrapStyle}
                title={
                  platformAdminAction.disabledReasonCode ??
                  "目前不可開啟 Platform Admin feature flags"
                }
              >
                <CanvasBtn theme={th} icon="link" size="sm" disabled>
                  Platform Admin
                </CanvasBtn>
              </span>
            ) : null}
          </>
        }
      />

      <div style={pageStyle}>
        {data?.refresh.dataFreshness &&
        data.refresh.dataFreshness !== "fresh" ? (
          <CanvasBanner
            theme={th}
            tone={getFreshnessTone(data.refresh.dataFreshness)}
            icon="clock"
            title={getFreshnessTitle(data.refresh.dataFreshness)}
            body={getFreshnessBody(
              data.refresh.dataFreshness,
              refreshGeneratedAt,
              data.refreshTier,
            )}
          />
        ) : null}

        {error ? (
          <CanvasBanner
            theme={th}
            tone="danger"
            icon="warn"
            title="這次旗標快照載入失敗"
            body={error}
          />
        ) : null}

        <div style={panelGridStyle}>
          <CanvasCard theme={th} padding={0}>
            <div style={summaryCardStyle}>
              <span style={summaryLabelStyle}>VISIBLE FLAGS</span>
              <strong style={summaryValueStyle}>{sourceRows.length}</strong>
              <span style={summaryHintStyle}>
                tenant-facing records visible to this role
              </span>
            </div>
          </CanvasCard>
          <CanvasCard theme={th} padding={0}>
            <div style={summaryCardStyle}>
              <span style={summaryLabelStyle}>TENANT OVERRIDES</span>
              <strong style={summaryValueStyle}>{overrideCount}</strong>
              <span style={summaryHintStyle}>
                {rollingOutCount} row(s) currently surfaced as rolling_out
              </span>
            </div>
          </CanvasCard>
          <CanvasCard theme={th} padding={0}>
            <div style={summaryCardStyle}>
              <span style={summaryLabelStyle}>ENABLED</span>
              <strong style={summaryValueStyle}>{enabledCount}</strong>
              <span style={summaryHintStyle}>
                {Math.max(sourceRows.length - enabledCount, 0)} disabled in the
                current tenant view
              </span>
            </div>
          </CanvasCard>
          <CanvasCard theme={th} padding={0}>
            <div style={summaryCardStyle}>
              <span style={summaryLabelStyle}>REFRESH</span>
              <strong style={summaryValueStyle}>{refreshMeta.code}</strong>
              <span style={summaryHintStyle}>
                {refreshMeta.cadence} · snapshot{" "}
                {formatDateTime(refreshGeneratedAt)}
              </span>
            </div>
          </CanvasCard>
        </div>

        <CanvasCard theme={th} title="Visibility filters" padding={16}>
          <form action="/feature-flags" method="get" style={filterGridStyle}>
            <CanvasField theme={th} label="Search by key">
              <input
                defaultValue={query}
                name="q"
                placeholder="tenant-portal, reports, billing..."
                style={inputStyle}
              />
            </CanvasField>
            <CanvasField theme={th} label="Scope">
              <select
                defaultValue={scopeFilter || "all"}
                name="scope"
                style={inputStyle}
              >
                <option value="all">all scopes</option>
                <option value="global_default">global_default</option>
                <option value="tenant_override">tenant_override</option>
              </select>
            </CanvasField>
            <div style={actionRowStyle}>
              <button
                style={{
                  minHeight: 28,
                  padding: "5px 10px",
                  borderRadius: 7,
                  border: `1px solid ${th.accent}`,
                  background: th.accent,
                  color: "#ffffff",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor:
                    searchAction?.enabled === false ? "not-allowed" : "pointer",
                  opacity: searchAction?.enabled === false ? 0.55 : 1,
                }}
                type="submit"
                disabled={searchAction?.enabled === false}
                title={
                  searchAction?.enabled === false
                    ? (searchAction.disabledReasonCode ?? "目前不可搜尋")
                    : undefined
                }
              >
                Search
              </button>
              {(query || scopeFilter) && (
                <Link href="/feature-flags" style={getButtonLinkStyle("ghost")}>
                  Clear
                </Link>
              )}
            </div>
          </form>
          <div style={{ ...summaryHintStyle, marginTop: 10 }}>
            Search 和 row-level history 皆由 `availableActions`
            控制；寫入治理權限仍在 Platform Admin。
            {data?.notes[0] ? ` ${data.notes[0]}` : ""}
          </div>
        </CanvasCard>

        <CanvasCard theme={th} padding={0}>
          {emptyCopy ? (
            <div style={emptyWrapStyle}>
              <CanvasBanner
                theme={th}
                tone={emptyCopy.tone}
                icon={emptyCopy.icon}
                title={emptyCopy.title}
                body={emptyCopy.body}
                actions={
                  emptyCopy.ctaHref ? (
                    <Link
                      href={emptyCopy.ctaHref}
                      style={getButtonLinkStyle()}
                      target={emptyCopy.ctaTarget}
                    >
                      {emptyCopy.ctaLabel ?? "Open"}
                    </Link>
                  ) : undefined
                }
              />
              {previewReason ? (
                <span style={summaryHintStyle}>
                  Previewing empty state `{previewReason}` via query override.
                </span>
              ) : null}
            </div>
          ) : (
            <CanvasTable<FlagRow>
              theme={th}
              columns={columns}
              rows={filteredRows}
            />
          )}
        </CanvasCard>
      </div>
    </div>
  );
}
