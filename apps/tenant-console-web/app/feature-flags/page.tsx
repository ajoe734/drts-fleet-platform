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

const PLATFORM_ADMIN_BASE_URL =
  process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL ?? "http://localhost:3002";

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const kpiGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const topGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 16,
  alignItems: "start",
};

const filterGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.6fr) minmax(180px, 0.7fr) auto",
  gap: 12,
  alignItems: "end",
};

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  borderRadius: 7,
  border: `1px solid ${th.border}`,
  background: th.bgRaised,
  color: th.text,
  padding: "8px 10px",
  fontSize: 12.5,
  outline: "none",
};

const hintStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 11.5,
  lineHeight: 1.45,
};

const submitButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  minHeight: 28,
  padding: "5px 10px",
  borderRadius: 7,
  border: `1px solid ${th.accent}`,
  background: th.accent,
  color: "#ffffff",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

const ghostLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 28,
  padding: "5px 10px",
  borderRadius: 7,
  border: "1px solid transparent",
  color: th.textMuted,
  fontSize: 12,
  textDecoration: "none",
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

const metaStackStyle: CSSProperties = {
  display: "grid",
  gap: 6,
};

const emptyStateStyle: CSSProperties = {
  display: "grid",
  gap: 12,
  justifyItems: "start",
  padding: 20,
};

const noteListStyle: CSSProperties = {
  margin: 0,
  paddingInlineStart: 18,
  display: "grid",
  gap: 6,
  color: th.textMuted,
  fontSize: 12,
  lineHeight: 1.45,
};

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type FlagRow = Record<string, unknown> & {
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

const defaultPageActions: ResourceActionDescriptor[] = [
  { action: "search", enabled: true, riskLevel: "low" },
  {
    action: "open_platform_admin_feature_flags",
    enabled: true,
    riskLevel: "low",
  },
];

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

function getScopeLabel(scope: TenantFeatureFlagScope) {
  return scope === "tenant_override" ? "tenant_override" : "global_default";
}

function getScopeTone(scope: TenantFeatureFlagScope): CanvasTone {
  return scope === "tenant_override" ? "accent" : "neutral";
}

function getButtonLinkStyle(variant: "secondary" | "ghost" = "secondary") {
  if (variant === "ghost") {
    return ghostLinkStyle;
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

function getEmptyStateCopy(reason: EmptyReason): EmptyStateCopy {
  switch (reason) {
    case "not_provisioned":
      return {
        tone: "info",
        icon: "flags",
        title: "功能旗標可視面尚未佈建",
        body: "目前租戶尚未收到 feature visibility read model。完整治理與佈建狀態請至 Platform Admin 檢視。",
        ctaLabel: "前往 Platform Admin",
        ctaHref: getPlatformAdminFlagsHref(),
        ctaTarget: "_blank",
      };
    case "fetch_failed":
      return {
        tone: "danger",
        icon: "warn",
        title: "讀取功能旗標失敗",
        body: "這次快照未能完成載入。請稍後重整，或改從稽核與平台治理畫面交叉確認。",
        ctaLabel: "查看稽核",
        ctaHref: "/audit",
      };
    case "permission_denied":
      return {
        tone: "warn",
        icon: "audit",
        title: "目前角色沒有可視權限",
        body: "本租戶角色未被授權查看 feature visibility。若需要確認 gating 原因，請聯繫租戶管理員或平台治理角色。",
        ctaLabel: "開啟稽核",
        ctaHref: "/audit",
      };
    case "external_unavailable":
      return {
        tone: "warn",
        icon: "clock",
        title: "旗標 authority 暫時不可用",
        body: "旗標來源目前處於降級或暫時不可達。請稍後再試，必要時改由 Platform Admin 查核 authority snapshot。",
        ctaLabel: "前往 Platform Admin",
        ctaHref: getPlatformAdminFlagsHref(),
        ctaTarget: "_blank",
      };
    case "filtered_empty":
      return {
        tone: "info",
        icon: "filter",
        title: "沒有符合目前篩選條件的旗標",
        body: "調整關鍵字或 scope 篩選即可回到完整可見清單。",
      };
    case "no_data":
    default:
      return {
        tone: "info",
        icon: "flags",
        title: "本租戶目前沒有可見旗標",
        body: "當租戶尚未啟用任何 tenant-facing feature visibility record 時，這裡會維持空白但仍保留治理入口。",
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
    getScopeLabel(row.scope).toLowerCase().includes(needle)
  );
}

function actionEnabled(
  actions: ResourceActionDescriptor[],
  target: string,
  fallback = true,
) {
  const match = actions.find((action) => action.action === target);
  return match ? match.enabled : fallback;
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

  const pageActions = data?.availableActions?.length
    ? data.availableActions
    : defaultPageActions;
  const allRows = (data?.items ?? []).map(toFlagRow).filter((row: FlagRow) => {
    if (scopeFilter && scopeFilter !== "all" && row.scope !== scopeFilter) {
      return false;
    }
    return rowMatchesQuery(row, query);
  });
  const sourceRows = (data?.items ?? []).map(toFlagRow);
  const enabledCount = sourceRows.filter((row: FlagRow) => row.enabled).length;
  const overrideCount = sourceRows.filter(
    (row: FlagRow) => row.scope === "tenant_override",
  ).length;
  const rollingOutCount = sourceRows.filter(
    (row: FlagRow) => row.rolloutState === "rolling_out",
  ).length;
  const latestUpdatedAt = sourceRows.reduce<string | null>((latest, row: FlagRow) => {
    if (!latest) return row.updatedAt;
    return new Date(row.updatedAt) > new Date(latest) ? row.updatedAt : latest;
  }, null);

  let emptyReason: EmptyReason | null = null;
  if (previewReason) {
    emptyReason = previewReason;
  } else if (error) {
    emptyReason = classifyErrorReason(error);
  } else if (allRows.length === 0 && sourceRows.length > 0) {
    emptyReason = "filtered_empty";
  } else if (allRows.length === 0) {
    emptyReason = data?.emptyState?.reason ?? "no_data";
  }

  const emptyCopy = emptyReason ? getEmptyStateCopy(emptyReason) : null;

  const columns: CanvasTableColumn<FlagRow>[] = [
    {
      h: "KEY",
      k: "key",
      w: 370,
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
      w: 118,
      r: (row) => (
        <CanvasPill theme={th} tone={row.enabled ? "success" : "neutral"} dot>
          {row.enabled ? "enabled" : "disabled"}
        </CanvasPill>
      ),
    },
    {
      h: "SCOPE",
      w: 190,
      r: (row) => (
        <div style={metaStackStyle}>
          <CanvasPill theme={th} tone={getScopeTone(row.scope)}>
            {getScopeLabel(row.scope)}
          </CanvasPill>
          {row.rolloutState === "rolling_out" ? (
            <span style={subcopyStyle}>rolling_out</span>
          ) : null}
        </div>
      ),
    },
    {
      h: "LAST CHANGED BY",
      k: "updatedBy",
      w: 220,
      r: (row) => (
        <div style={metaStackStyle}>
          <span>{row.updatedBy ?? "authority pending"}</span>
          {row.updatedBy ? null : (
            <span style={subcopyStyle}>backend store has not emitted actor reference yet</span>
          )}
        </div>
      ),
    },
    {
      h: "AT",
      k: "updatedAt",
      mono: true,
      w: 172,
      r: (row) => formatDateTime(row.updatedAt),
    },
    {
      h: "ACTIONS",
      w: 130,
      r: (row) =>
        actionEnabled(row.availableActions, "view_change_history") &&
        row.historyLink ? (
          <Link
            href={row.historyLink.route}
            style={getButtonLinkStyle()}
            target={row.historyLink.openMode === "new_tab" ? "_blank" : undefined}
          >
            歷程
          </Link>
        ) : (
          <CanvasBtn theme={th} icon="audit" size="sm" disabled>
            歷程
          </CanvasBtn>
        ),
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
            <Link href="/audit" style={getButtonLinkStyle()}>
              稽核
            </Link>
            {actionEnabled(
              pageActions,
              "open_platform_admin_feature_flags",
            ) ? (
              <Link
                href={getPlatformAdminFlagsHref()}
                style={getButtonLinkStyle()}
                target="_blank"
              >
                Platform Admin
              </Link>
            ) : null}
          </>
        }
      />

      <div style={pageBodyStyle}>
        {error ? (
          <CanvasBanner
            theme={th}
            tone="danger"
            icon="warn"
            title="這次旗標快照載入失敗"
            body={error}
          />
        ) : null}

        <div style={kpiGridStyle}>
          <CanvasKPI
            theme={th}
            label="VISIBLE FLAGS"
            value={String(sourceRows.length)}
            sub="tenant-facing records"
          />
          <CanvasKPI
            theme={th}
            label="ENABLED"
            value={String(enabledCount)}
            sub={`${Math.max(sourceRows.length - enabledCount, 0)} disabled`}
          />
          <CanvasKPI
            theme={th}
            label="TENANT OVERRIDES"
            value={String(overrideCount)}
            sub={`${rollingOutCount} rolling_out`}
          />
          <CanvasKPI
            theme={th}
            label="REFRESH"
            value="T5"
            sub={`slow · ${formatDateTime(data?.refresh.generatedAt ?? latestUpdatedAt)}`}
          />
        </div>

        <div style={topGridStyle}>
          <CanvasCard theme={th} title="Visibility filter" padding={16}>
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
              <div style={{ display: "flex", gap: 8 }}>
                <button style={submitButtonStyle} type="submit">
                  Search
                </button>
                {(query || scopeFilter) && (
                  <Link href="/feature-flags" style={getButtonLinkStyle("ghost")}>
                    Clear
                  </Link>
                )}
              </div>
            </form>
            <div style={{ marginTop: 10, ...hintStyle }}>
              Filter the effective tenant view by flag key or visible scope. Read
              authority remains here; write authority stays in Platform Admin.
            </div>
          </CanvasCard>

          <CanvasCard theme={th} title="Governance notes" padding={16}>
            <div style={metaStackStyle}>
              <div style={hintStyle}>
                Refresh tier `T5` maps to the shared `slow` cadence. This page
                shows the tenant-effective value, and rows with
                `tenant_override` are surfaced as `rolling_out`.
              </div>
              <ul style={noteListStyle}>
                {(data?.notes ?? []).map((note: string, index: number) => (
                  <li key={`${note}-${index}`}>{note}</li>
                ))}
              </ul>
            </div>
          </CanvasCard>
        </div>

        <CanvasCard theme={th} padding={0}>
          {emptyCopy ? (
            <div style={emptyStateStyle}>
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
                <span style={hintStyle}>
                  Previewing empty state `{previewReason}` via query override.
                </span>
              ) : null}
            </div>
          ) : (
            <CanvasTable<FlagRow> theme={th} columns={columns} rows={allRows} />
          )}
        </CanvasCard>
      </div>
    </div>
  );
}
