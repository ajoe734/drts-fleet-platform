import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type {
  EmptyReason,
  FeatureFlag,
  FeatureFlagSummary,
  RefreshTier,
  ResourceActionDescriptor,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
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

// Q-X02 / packet §3.2 + §5.19: /feature-flags is the T5 "Tenant slow" tier (30s).
// The tier is declared from the contract enum so the cadence is not a magic
// number, and the page renders an explicit refresh affordance per §3.2.
const FLAGS_REFRESH_TIER: RefreshTier = "slow";
const REFRESH_TIER_CADENCE_MS: Partial<Record<RefreshTier, number>> = {
  urgent: 5000,
  fast: 3000,
  dispatch: 5000,
  medium: 15000,
  medium_slow: 30000,
  slow: 30000,
  manual: 0,
};

// Q-X03 / packet §3.10 + §5.19: full flag governance + change history live in
// platform-admin. Tenant-console is read-scoped (Q-X16); deeper history opens in
// platform-admin in a NEW tab. Base URL is env-driven with the dev port default.
const PLATFORM_ADMIN_URL =
  process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL ?? "http://localhost:3002";

function platformAdminFlagsHref(key?: string): string {
  const base = `${PLATFORM_ADMIN_URL.replace(/\/$/, "")}/feature-flags`;
  return key ? `${base}?key=${encodeURIComponent(key)}` : base;
}

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const cardStyle: CSSProperties = {
  overflow: "hidden",
};

const keyCellStyle: CSSProperties = {
  color: th.text,
  fontWeight: 600,
  fontFamily: th.monoFamily,
};

const descriptionStyle: CSSProperties = {
  display: "inline-block",
  whiteSpace: "normal",
  lineHeight: 1.4,
  color: th.textMuted,
};

const actionsCellStyle: CSSProperties = {
  display: "flex",
  gap: 4,
  flexWrap: "wrap",
};

const tabLinkStyle: CSSProperties = {
  color: "inherit",
  textDecoration: "none",
};

const plainLinkStyle: CSSProperties = {
  textDecoration: "none",
};

const freshnessRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  fontSize: 12,
  color: th.textMuted,
};

const legendRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 8,
  fontSize: 12,
  color: th.textMuted,
};

const filterChipRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 8,
  fontSize: 12,
  color: th.textMuted,
};

// ─────────────────────────────────────────────────────────────────────────────
// View model
//
// Q-X16 is per-realm read-scoped: the tenant sees its RESOLVED flags only. The
// `FeatureFlag` contract carries `tenantId?` on a tenant override and omits it
// on a global default, so `scope` is derived rather than invented. `value` is a
// tri-state so the "rolling out" mid-rollout treatment (packet §5.19 state
// variant + §8.31) has a distinct rendering; the current contract only surfaces
// a resolved boolean, so live data resolves to enabled/disabled until the
// backend exposes a partial-rollout marker.
// ─────────────────────────────────────────────────────────────────────────────

type FlagScope = "tenant_override" | "global_default";
type FlagValue = "enabled" | "disabled" | "rolling_out";

function resolveScope(flag: FeatureFlag): FlagScope {
  return flag.tenantId ? "tenant_override" : "global_default";
}

function resolveValue(flag: FeatureFlag): FlagValue {
  // The contract exposes a resolved boolean only. A `rolling_out` value is
  // surfaced here when the backend later adds a partial-rollout signal; today
  // it maps cleanly onto enabled/disabled without faking a third state.
  return flag.enabled ? "enabled" : "disabled";
}

const SCOPE_LABELS: Record<FlagScope, string> = {
  tenant_override: "租戶覆寫",
  global_default: "全域預設",
};

const VALUE_PRESENTATION: Record<
  FlagValue,
  { tone: CanvasTone; label: string }
> = {
  enabled: { tone: "success", label: "enabled" },
  disabled: { tone: "neutral", label: "disabled" },
  rolling_out: { tone: "warn", label: "rolling out" },
};

const flagDateFormatter = new Intl.DateTimeFormat("sv-SE", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function formatChangedAt(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return flagDateFormatter.format(parsed);
}

// ─────────────────────────────────────────────────────────────────────────────
// Data loading
// ─────────────────────────────────────────────────────────────────────────────

type FlagsPageData = {
  flags: FeatureFlag[];
  notes: string[];
  loadError: { reason: EmptyReason; message: string } | null;
};

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "未知錯誤";
}

// The tenant read endpoint surfaces failures as `Error("API error <status>: …")`.
// Map the HTTP class onto the EmptyReason taxonomy (packet §3.6) so the empty
// state stays honest instead of collapsing every failure into "no data".
function classifyLoadFailure(error: unknown): {
  reason: EmptyReason;
  message: string;
} {
  const message = toErrorMessage(error);
  const statusMatch = message.match(/API error (\d{3})/);
  const status = statusMatch ? Number(statusMatch[1]) : null;

  if (status === 401 || status === 403) {
    return { reason: "permission_denied", message };
  }
  if (status === 404 || status === 501) {
    return { reason: "not_provisioned", message };
  }
  if (status !== null && status >= 502 && status <= 504) {
    return { reason: "external_unavailable", message };
  }
  return { reason: "fetch_failed", message };
}

function compareFlags(left: FeatureFlag, right: FeatureFlag): number {
  // Tenant overrides surface first (they are the tenant-relevant story), then
  // sort by key for a stable, scannable list.
  const leftOverride = left.tenantId ? 0 : 1;
  const rightOverride = right.tenantId ? 0 : 1;
  if (leftOverride !== rightOverride) {
    return leftOverride - rightOverride;
  }
  return left.key.localeCompare(right.key);
}

async function loadFlagsData(): Promise<FlagsPageData> {
  const client = getTenantClient();
  try {
    // The tenant client injects `x-tenant-id`, so the resolved per-tenant view
    // (overrides merged over globals) comes back read-scoped per Q-X16.
    const summary = (await client.getFeatureFlags()) as FeatureFlagSummary;
    const flags = [...summary.flags].sort(compareFlags);
    return { flags, notes: summary.notes ?? [], loadError: null };
  } catch (error) {
    return { flags: [], notes: [], loadError: classifyLoadFailure(error) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// availableActions (Q-X13): CTAs are descriptor-driven, never hard-coded by
// role. This page is read-only per Q-X16, so every descriptor is a low-risk
// read action — there are no write CTAs.
// ─────────────────────────────────────────────────────────────────────────────

const HEADER_ACTIONS: ResourceActionDescriptor[] = [
  { action: "search", enabled: true, riskLevel: "low" },
  { action: "view_governance", enabled: true, riskLevel: "low" },
];

function buildRowActions(): ResourceActionDescriptor[] {
  // View change history (low) per packet §5.19 must-support actions. History
  // lives in platform-admin (Q-X16 read scope), so the CTA is a cross-app link.
  return [{ action: "view_history", enabled: true, riskLevel: "low" }];
}

const ACTION_LABELS: Record<string, string> = {
  search: "搜尋",
  view_governance: "Platform Admin 治理",
  view_history: "變更紀錄",
};

function findHeaderAction(
  action: string,
): ResourceActionDescriptor | undefined {
  return HEADER_ACTIONS.find((descriptor) => descriptor.action === action);
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty / not-ready states (Q-X15) — all 6 tenant EmptyReason states distinctly.
// `driver_not_eligible` is a driver-app-only reason (Q-DRV01); it is enumerated
// for exhaustiveness but never expected here.
// ─────────────────────────────────────────────────────────────────────────────

type EmptyStatePresentation = {
  tone: CanvasTone;
  title: string;
  body: string;
  cta?: { label: string; href: string; primary?: boolean };
};

const EMPTY_STATE_PRESENTATION: Record<EmptyReason, EmptyStatePresentation> = {
  no_data: {
    tone: "info",
    title: "尚無可見的功能旗標",
    body: "此租戶目前沒有任何可見的功能旗標。完整治理請至 Platform Admin。",
    cta: {
      label: "在 Platform Admin 檢視",
      href: platformAdminFlagsHref(),
    },
  },
  not_provisioned: {
    tone: "warn",
    title: "功能旗標尚未開通",
    body: "此租戶的功能旗標讀取尚未開通，請聯絡平台管理員完成設定。",
  },
  fetch_failed: {
    tone: "danger",
    title: "無法載入功能旗標",
    body: "讀取功能旗標時發生錯誤，請稍後重新整理再試一次。",
    cta: { label: "重新整理", href: "/feature-flags" },
  },
  permission_denied: {
    tone: "warn",
    title: "沒有檢視權限",
    body: "您目前的角色無法檢視此租戶的功能旗標，請洽租戶管理員調整權限。",
  },
  external_unavailable: {
    tone: "warn",
    title: "服務暫時無法使用",
    body: "後端旗標服務暫時無法回應，這是暫時性狀況，稍後會自動恢復。",
    cta: { label: "重新整理", href: "/feature-flags" },
  },
  driver_not_eligible: {
    // Driver-app-only reason (Q-DRV01); never expected in tenant-console.
    tone: "neutral",
    title: "不適用",
    body: "此狀態不適用於租戶功能旗標。",
  },
  filtered_empty: {
    tone: "neutral",
    title: "沒有符合條件的旗標",
    body: "目前的範圍或關鍵字篩選沒有命中任何旗標，請調整或清除篩選。",
    cta: { label: "清除篩選", href: "/feature-flags" },
  },
};

function FlagEmptyState({ reason }: { reason: EmptyReason }) {
  const presentation = EMPTY_STATE_PRESENTATION[reason];
  return (
    <div
      style={{
        padding: "40px 24px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
        textAlign: "center",
      }}
    >
      <CanvasPill theme={th} tone={presentation.tone} dot>
        {reason}
      </CanvasPill>
      <div style={{ color: th.text, fontWeight: 600, fontSize: 14 }}>
        {presentation.title}
      </div>
      <div style={{ color: th.textMuted, fontSize: 12.5, maxWidth: 420 }}>
        {presentation.body}
      </div>
      {presentation.cta ? (
        presentation.cta.href.startsWith("http") ? (
          <a
            href={presentation.cta.href}
            target="_blank"
            rel="noopener noreferrer"
            style={plainLinkStyle}
          >
            <CanvasBtn
              theme={th}
              size="sm"
              variant={presentation.cta.primary ? "primary" : "secondary"}
              icon="ext"
            >
              {presentation.cta.label}
            </CanvasBtn>
          </a>
        ) : (
          <Link href={presentation.cta.href} style={plainLinkStyle}>
            <CanvasBtn
              theme={th}
              size="sm"
              variant={presentation.cta.primary ? "primary" : "secondary"}
            >
              {presentation.cta.label}
            </CanvasBtn>
          </Link>
        )
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Filters (packet §5.19: filter by scope, search by key)
// ─────────────────────────────────────────────────────────────────────────────

type ScopeTab = "all" | FlagScope;

type FlagFilters = {
  scope: ScopeTab;
  query: string | null;
};

const SCOPE_TABS: { key: ScopeTab; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "tenant_override", label: "租戶覆寫" },
  { key: "global_default", label: "全域預設" },
];

function getScopeTab(rawTab: string | null | undefined): ScopeTab {
  const matched = SCOPE_TABS.find((tab) => tab.key === rawTab);
  return matched?.key ?? "all";
}

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  return null;
}

function hasActiveFilters(filters: FlagFilters): boolean {
  return filters.scope !== "all" || filters.query !== null;
}

function matchesFilters(flag: FeatureFlag, filters: FlagFilters): boolean {
  if (filters.scope !== "all" && resolveScope(flag) !== filters.scope) {
    return false;
  }
  if (filters.query) {
    const needle = filters.query.toLowerCase();
    const haystack = `${flag.key} ${flag.description}`.toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  return true;
}

function buildTabHref(scope: ScopeTab, filters: FlagFilters): string {
  const params = new URLSearchParams();
  if (scope !== "all") params.set("scope", scope);
  if (filters.query) params.set("q", filters.query);
  const queryString = params.toString();
  return queryString ? `/feature-flags?${queryString}` : "/feature-flags";
}

function buildTabNodes(filters: FlagFilters) {
  const tabs = SCOPE_TABS.map((tab) => (
    <Link
      key={tab.key}
      href={buildTabHref(tab.key, filters)}
      style={tabLinkStyle}
    >
      {tab.label}
    </Link>
  ));
  const activeIndex = SCOPE_TABS.findIndex((tab) => tab.key === filters.scope);
  return { tabs, activeTab: tabs[activeIndex] ?? tabs[0] };
}

// ─────────────────────────────────────────────────────────────────────────────
// Row model
// ─────────────────────────────────────────────────────────────────────────────

type FlagRow = FeatureFlag &
  Record<string, unknown> & {
    scope: FlagScope;
    value: FlagValue;
    actions: ResourceActionDescriptor[];
  };

function toFlagRow(flag: FeatureFlag): FlagRow {
  return {
    ...flag,
    scope: resolveScope(flag),
    value: resolveValue(flag),
    actions: buildRowActions(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default async function FeatureFlagsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const filters: FlagFilters = {
    scope: getScopeTab(firstParam(resolvedSearchParams.scope)),
    query: firstParam(resolvedSearchParams.q),
  };

  const { flags, notes, loadError } = await loadFlagsData();

  const filtered = flags.filter((flag) => matchesFilters(flag, filters));
  const rows = filtered.map(toFlagRow);

  const { tabs, activeTab } = buildTabNodes(filters);

  // Resolve which EmptyReason (if any) governs the body.
  const emptyReason: EmptyReason | null = loadError
    ? loadError.reason
    : flags.length === 0
      ? "no_data"
      : rows.length === 0
        ? "filtered_empty"
        : null;

  const cadenceMs = REFRESH_TIER_CADENCE_MS[FLAGS_REFRESH_TIER] ?? 0;
  const cadenceLabel =
    cadenceMs > 0 ? `每 ${Math.round(cadenceMs / 1000)} 秒` : "手動";

  const overrideCount = flags.filter((flag) => flag.tenantId).length;
  const governanceDescriptor = findHeaderAction("view_governance");

  const columns: CanvasTableColumn<FlagRow>[] = [
    {
      h: "KEY",
      w: 320,
      r: (row) => <span style={keyCellStyle}>{row.key}</span>,
    },
    {
      h: "CURRENT",
      w: 110,
      r: (row) => {
        const presentation = VALUE_PRESENTATION[row.value];
        return (
          <CanvasPill theme={th} tone={presentation.tone} dot>
            {presentation.label}
          </CanvasPill>
        );
      },
    },
    {
      h: "SCOPE",
      w: 130,
      r: (row) => (
        <Link href={buildTabHref(row.scope, filters)} style={tabLinkStyle}>
          <CanvasPill
            theme={th}
            tone={row.scope === "tenant_override" ? "accent" : "neutral"}
          >
            {SCOPE_LABELS[row.scope]}
          </CanvasPill>
        </Link>
      ),
    },
    {
      h: "DESCRIPTION",
      r: (row) =>
        row.description ? (
          <span style={descriptionStyle}>{row.description}</span>
        ) : (
          <span style={{ color: th.textDim }}>—</span>
        ),
    },
    {
      h: "CHANGED AT",
      w: 150,
      mono: true,
      r: (row) => formatChangedAt(row.updatedAt),
    },
    {
      h: "HISTORY",
      w: 120,
      r: (row) => (
        <div style={actionsCellStyle}>
          {row.actions.map((descriptor) => (
            // Cross-app deep link (Q-X03): change history opens platform-admin
            // in a NEW tab, read-scoped to this flag key.
            <a
              key={descriptor.action}
              href={platformAdminFlagsHref(row.key)}
              target="_blank"
              rel="noopener noreferrer"
              style={plainLinkStyle}
            >
              <CanvasBtn
                theme={th}
                size="xs"
                variant="ghost"
                icon="ext"
                disabled={!descriptor.enabled}
              >
                {ACTION_LABELS[descriptor.action] ?? descriptor.action}
              </CanvasBtn>
            </a>
          ))}
        </div>
      ),
    },
  ];

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="功能旗標 · read-only"
        subtitle="本租戶可見的 flags · 完整治理在 Platform Admin · endpoint = GET /api/tenant/feature-flags"
        tabs={tabs as ReactNode[]}
        activeTab={activeTab}
        actions={
          governanceDescriptor ? (
            // Cross-app deep link (Q-X03 / packet §3.10): full governance opens
            // platform-admin in a NEW tab.
            <a
              href={platformAdminFlagsHref()}
              target="_blank"
              rel="noopener noreferrer"
              style={plainLinkStyle}
            >
              <CanvasBtn theme={th} size="sm" variant="secondary" icon="ext">
                {ACTION_LABELS[governanceDescriptor.action]}
              </CanvasBtn>
            </a>
          ) : null
        }
      />

      <div style={pageBodyStyle}>
        <div style={freshnessRowStyle}>
          <CanvasPill theme={th} tone="neutral" dot>
            read-only · per Q-X16
          </CanvasPill>
          <CanvasPill theme={th} tone="neutral" dot>
            T5 · slow
          </CanvasPill>
          <span>自動更新 {cadenceLabel}</span>
          <Link
            href={buildTabHref(filters.scope, filters)}
            style={plainLinkStyle}
          >
            <CanvasBtn theme={th} size="xs" variant="ghost" icon="ok">
              重新整理
            </CanvasBtn>
          </Link>
        </div>

        {/* State legend: the three current-value treatments (incl. mid-rollout
            "rolling out" per packet §5.19 state variant) rendered distinctly. */}
        <div style={legendRowStyle}>
          <span>狀態：</span>
          {(Object.keys(VALUE_PRESENTATION) as FlagValue[]).map((value) => (
            <CanvasPill
              key={value}
              theme={th}
              tone={VALUE_PRESENTATION[value].tone}
              dot
            >
              {VALUE_PRESENTATION[value].label}
            </CanvasPill>
          ))}
          <span style={{ marginLeft: 8 }}>
            租戶覆寫 {overrideCount} · 全部 {flags.length}
          </span>
        </div>

        {hasActiveFilters(filters) ? (
          <div style={filterChipRowStyle}>
            <span>篩選：</span>
            {filters.scope !== "all" ? (
              <CanvasPill theme={th} tone="info">
                scope: {SCOPE_LABELS[filters.scope]}
              </CanvasPill>
            ) : null}
            {filters.query ? (
              <CanvasPill theme={th} tone="info">
                關鍵字: {filters.query}
              </CanvasPill>
            ) : null}
            <Link href="/feature-flags" style={plainLinkStyle}>
              <CanvasBtn theme={th} size="xs" variant="ghost" icon="x">
                清除
              </CanvasBtn>
            </Link>
          </div>
        ) : null}

        {loadError ? (
          <CanvasBanner
            theme={th}
            tone={loadError.reason === "fetch_failed" ? "danger" : "warn"}
            icon="warn"
            title="無法載入功能旗標"
            body={loadError.message}
          />
        ) : null}

        <CanvasCard theme={th} padding={0} style={cardStyle}>
          {emptyReason ? (
            <FlagEmptyState reason={emptyReason} />
          ) : (
            <CanvasTable<FlagRow> theme={th} columns={columns} rows={rows} />
          )}
        </CanvasCard>

        {notes.length > 0 ? (
          <div style={{ fontSize: 11.5, color: th.textDim, lineHeight: 1.5 }}>
            {notes.map((note, index) => (
              <div key={index}>· {note}</div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
