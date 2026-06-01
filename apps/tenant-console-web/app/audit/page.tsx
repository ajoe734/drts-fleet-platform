import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import type {
  AuditLogRecord,
  EmptyReason,
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

// Cross-app deep-link targets (Q-X03 / §3.10). Phase 1 keeps the 4 apps as
// separate deployments, so ops/platform-owned audit rows deep-link back to the
// owning app (read-scoped) in a new tab.
const OPS_CONSOLE_URL =
  process.env.NEXT_PUBLIC_OPS_CONSOLE_URL ?? "http://localhost:3003";
const PLATFORM_ADMIN_URL =
  process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL ?? "http://localhost:3002";

// Tenant-relevant EmptyReason set (Q-X15). `driver_not_eligible` is
// driver-app-specific and is intentionally excluded — tenant audit renders the
// 6 tenant states distinctly per acceptance.
type TenantEmptyReason = Exclude<EmptyReason, "driver_not_eligible">;

const EMPTY_REASONS: readonly TenantEmptyReason[] = [
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
  "filtered_empty",
] as const;

const EMPTY_STATE_COPY: Record<
  TenantEmptyReason,
  { title: string; body: string; tone: CanvasTone }
> = {
  no_data: {
    title: "目前沒有稽核紀錄",
    body: "此租戶尚無任何 actor 對資源的動作被記錄。一旦發生狀態變更，將即時出現於此。",
    tone: "neutral",
  },
  not_provisioned: {
    title: "稽核管線尚未開通",
    body: "此租戶的稽核紀錄管線尚未佈署 (not_provisioned)。請聯絡平台開通後再檢視。",
    tone: "info",
  },
  fetch_failed: {
    title: "稽核紀錄載入失敗",
    body: "後端 /api/tenant/audit 回傳錯誤 (fetch_failed)。請使用手動刷新重試。",
    tone: "danger",
  },
  permission_denied: {
    title: "沒有檢視稽核的權限",
    body: "目前角色無權檢視跨 actor 稽核紀錄 (permission_denied)。需要 tc_admin 或 tc_finance。",
    tone: "warn",
  },
  external_unavailable: {
    title: "不可變稽核儲存暫時無法連線",
    body: "稽核儲存暫時不可用 (external_unavailable)。已寫入的紀錄不會遺失，稍後恢復即可檢視。",
    tone: "warn",
  },
  filtered_empty: {
    title: "目前篩選沒有符合的紀錄",
    body: "沒有符合目前 actor / 模組 / 時間 篩選的紀錄 (filtered_empty)。清除篩選即可看到全部。",
    tone: "info",
  },
};

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const metaRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 10,
};

const filterRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 6,
};

const filterGroupLabelStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 10.5,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: 0.4,
  marginRight: 2,
};

const emptyStateStyle: CSSProperties = {
  padding: "32px 24px",
  display: "flex",
  flexDirection: "column",
  gap: 6,
  alignItems: "center",
  textAlign: "center",
};

const emptyTitleStyle: CSSProperties = {
  color: th.text,
  fontWeight: 600,
  fontSize: 13.5,
};

const emptyBodyStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 12,
  lineHeight: 1.5,
  maxWidth: 460,
};

const actorStackStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  minWidth: 0,
};

const actorIdStyle: CSSProperties = {
  fontFamily: th.monoFamily,
  fontSize: 11.5,
  color: th.text,
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const actionTextStyle: CSSProperties = {
  color: th.accent,
  fontFamily: th.monoFamily,
  fontSize: 11.5,
};

const resourceStackStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  minWidth: 0,
};

const crossAppLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 3,
  color: th.accent,
  fontSize: 10.5,
  fontWeight: 600,
  textDecoration: "none",
  whiteSpace: "nowrap",
};

const linkResetStyle: CSSProperties = {
  textDecoration: "none",
  display: "inline-flex",
};

const refreshLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "4px 9px",
  borderRadius: 6,
  border: `1px solid ${th.border}`,
  color: th.text,
  background: th.surfaceLo,
  fontSize: 11.5,
  fontWeight: 500,
  textDecoration: "none",
};

const previewRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 6,
  padding: "10px 12px",
  borderTop: `1px solid ${th.border}`,
};

const auditDateFormatter = new Intl.DateTimeFormat("sv-SE", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const snapshotFormatter = new Intl.DateTimeFormat("zh-Hant", {
  dateStyle: "short",
  timeStyle: "medium",
});

function formatAuditAt(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return auditDateFormatter.format(parsed);
}

// ── Actor realm (Q-TEN13) ────────────────────────────────────────────────────
// Each contract actorType maps to a visually distinct realm chip so a tenant
// admin can immediately tell who acted on their resources.
type AuditRealm = "tenant" | "ops" | "platform" | "system" | "partner";

function actorRealm(actorType: AuditLogRecord["actorType"]): {
  realm: AuditRealm;
  label: string;
  tone: CanvasTone;
} {
  switch (actorType) {
    case "tenant_admin":
      return { realm: "tenant", label: "tenant", tone: "accent" };
    case "ops_user":
      return { realm: "ops", label: "ops", tone: "info" };
    case "platform_admin":
      return { realm: "platform", label: "platform", tone: "warn" };
    case "system":
      return { realm: "system", label: "system", tone: "neutral" };
    case "partner_api_key":
      return { realm: "partner", label: "partner", tone: "success" };
    default: {
      const exhaustive: never = actorType;
      return { realm: "system", label: String(exhaustive), tone: "neutral" };
    }
  }
}

const REALM_FILTERS: readonly { value: AuditRealm; label: string }[] = [
  { value: "tenant", label: "tenant" },
  { value: "ops", label: "ops" },
  { value: "platform", label: "platform" },
  { value: "system", label: "system" },
  { value: "partner", label: "partner" },
] as const;

// Sensitive actor identifiers are masked by policy (§3.7 / §5.18). The backend
// masks at source; the UI keeps masking honest for api-key principals and marks
// any masked value clearly.
function maskActor(log: AuditLogRecord): { display: string; masked: boolean } {
  if (log.actorType === "system") {
    return { display: log.actorId ?? "system", masked: false };
  }
  if (!log.actorId) {
    return { display: "—", masked: false };
  }
  if (log.actorType === "partner_api_key") {
    return { display: `${log.actorId.slice(0, 6)}••••`, masked: true };
  }
  return { display: log.actorId, masked: false };
}

// Cross-app deep link (§3.10 + §5.18): ops/platform-owned audit rows link back
// to the owning app's read-scoped audit view in a new tab. Tenant/system/partner
// rows resolve in-app, so no cross-app target.
function crossAppLink(
  log: AuditLogRecord,
): { href: string; label: string } | null {
  const auditQuery = `audit?auditId=${encodeURIComponent(log.auditId)}`;
  if (log.actorType === "ops_user") {
    return { href: `${OPS_CONSOLE_URL}/${auditQuery}`, label: "ops-console" };
  }
  if (log.actorType === "platform_admin") {
    return {
      href: `${PLATFORM_ADMIN_URL}/${auditQuery}`,
      label: "platform-admin",
    };
  }
  return null;
}

// availableActions (Q-X13) — drives CTAs instead of role hard-coding. Export is
// disabled (with a reason) when there is nothing in the current view to export.
function buildAvailableActions(
  visibleCount: number,
): ResourceActionDescriptor[] {
  const exportAction: ResourceActionDescriptor =
    visibleCount > 0
      ? { action: "export", enabled: true, riskLevel: "low" }
      : {
          action: "export",
          enabled: false,
          disabledReasonCode: "no_visible_rows",
          riskLevel: "low",
        };
  return [
    { action: "filter", enabled: true, riskLevel: "low" },
    { action: "refresh", enabled: true, riskLevel: "low" },
    exportAction,
  ];
}

function findAction(
  actions: readonly ResourceActionDescriptor[],
  name: string,
): ResourceActionDescriptor | null {
  return actions.find((action) => action.action === name) ?? null;
}

const TIME_FILTERS: readonly { value: string; label: string; days: number }[] =
  [
    { value: "7d", label: "近 7 天", days: 7 },
    { value: "30d", label: "近 30 天", days: 30 },
  ] as const;

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseEmptyReason(value: string | undefined): TenantEmptyReason | null {
  if (!value) return null;
  return EMPTY_REASONS.includes(value as TenantEmptyReason)
    ? (value as TenantEmptyReason)
    : null;
}

type AuditPageData = {
  rows: AuditLogRecord[];
  totalCount: number;
  fetchFailed: boolean;
  generatedAt: string;
};

async function loadAuditData(): Promise<AuditPageData> {
  const client = getTenantClient();
  try {
    const logs = (await client.listTenantAuditLogs()) as AuditLogRecord[];
    const rows = [...logs].sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt),
    );
    return {
      rows,
      totalCount: rows.length,
      fetchFailed: false,
      generatedAt: rows[0]?.createdAt ?? new Date().toISOString(),
    };
  } catch {
    return {
      rows: [],
      totalCount: 0,
      fetchFailed: true,
      generatedAt: new Date().toISOString(),
    };
  }
}

type AuditPageProps = {
  searchParams?: Promise<{
    realm?: string | string[];
    module?: string | string[];
    since?: string | string[];
    emptyReason?: string | string[];
  }>;
};

function buildQuery(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const query = search.toString();
  return query ? `/audit?${query}` : "/audit";
}

export default async function AuditPage({ searchParams }: AuditPageProps) {
  const resolved = searchParams ? await searchParams : {};
  const realmFilter = firstParam(resolved.realm) as AuditRealm | undefined;
  const moduleFilter = firstParam(resolved.module);
  const sinceFilter = firstParam(resolved.since);
  const emptyReasonOverride = parseEmptyReason(
    firstParam(resolved.emptyReason),
  );

  const validRealm = REALM_FILTERS.some((item) => item.value === realmFilter)
    ? realmFilter
    : undefined;
  const timeFilter = TIME_FILTERS.find((item) => item.value === sinceFilter);

  const { rows, totalCount, fetchFailed, generatedAt } = await loadAuditData();

  const moduleNames = Array.from(
    new Set(rows.map((row) => row.moduleName)),
  ).sort((left, right) => left.localeCompare(right));

  const sinceThreshold = timeFilter
    ? Date.now() - timeFilter.days * 24 * 60 * 60 * 1000
    : null;

  const filteredRows = rows.filter((row) => {
    if (validRealm && actorRealm(row.actorType).realm !== validRealm) {
      return false;
    }
    if (moduleFilter && row.moduleName !== moduleFilter) {
      return false;
    }
    if (sinceThreshold !== null) {
      const at = new Date(row.createdAt).getTime();
      if (Number.isNaN(at) || at < sinceThreshold) return false;
    }
    return true;
  });

  const hasActiveFilter = Boolean(validRealm || moduleFilter || timeFilter);
  const availableActions = buildAvailableActions(filteredRows.length);
  const refreshAction = findAction(availableActions, "refresh");
  const exportAction = findAction(availableActions, "export");
  const filterAction = findAction(availableActions, "filter");

  // emptyReason: explicit override (state preview) wins, else inferred from the
  // real fetch/filter outcome. not_provisioned / permission_denied /
  // external_unavailable are policy/backend-driven and surfaced via the preview
  // override for parity review.
  const inferredEmptyReason: TenantEmptyReason | null = fetchFailed
    ? "fetch_failed"
    : totalCount === 0
      ? "no_data"
      : filteredRows.length === 0 && hasActiveFilter
        ? "filtered_empty"
        : null;
  const emptyReason = emptyReasonOverride ?? inferredEmptyReason;

  const columns: CanvasTableColumn<AuditLogRecord & Record<string, unknown>>[] =
    [
      {
        h: "WHEN",
        w: 170,
        mono: true,
        r: (row) => formatAuditAt(row.createdAt),
      },
      {
        h: "ACTOR",
        w: 280,
        r: (row) => {
          const realm = actorRealm(row.actorType);
          const actor = maskActor(row);
          return (
            <div style={actorStackStyle}>
              <CanvasPill theme={th} tone={realm.tone} dot>
                {realm.label}
              </CanvasPill>
              <span style={actorIdStyle} title={actor.display}>
                {actor.display}
              </span>
              {actor.masked ? (
                <CanvasPill theme={th} tone="neutral">
                  masked
                </CanvasPill>
              ) : null}
            </div>
          );
        },
      },
      { h: "MODULE", k: "moduleName", w: 140, mono: true },
      {
        h: "ACTION",
        w: 200,
        r: (row) => <span style={actionTextStyle}>{row.actionName}</span>,
      },
      {
        h: "RESOURCE",
        w: 220,
        r: (row) => {
          const link = crossAppLink(row);
          const resource = row.resourceId ?? row.resourceType ?? "—";
          return (
            <div style={resourceStackStyle}>
              <span
                style={{
                  fontFamily: th.monoFamily,
                  fontSize: 11.5,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                title={`${row.resourceType}${
                  row.resourceId ? ` · ${row.resourceId}` : ""
                }`}
              >
                {resource}
              </span>
              {link ? (
                <a
                  style={crossAppLinkStyle}
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                >
                  ↗ {link.label}
                </a>
              ) : null}
            </div>
          );
        },
      },
      {
        h: "REQUEST",
        k: "requestId",
        mono: true,
        r: (row) => row.requestId || "—",
      },
    ];

  const emptyCopy = emptyReason ? EMPTY_STATE_COPY[emptyReason] : null;
  // filtered_empty keeps the filter bar usable so the operator can clear it;
  // the other states replace the table entirely.
  const showTable = filteredRows.length > 0 && !emptyReasonOverride;

  const realmAllHref = buildQuery({
    module: moduleFilter,
    since: sinceFilter,
  });

  const refreshHref = buildQuery({
    realm: validRealm,
    module: moduleFilter,
    since: sinceFilter,
  });

  function renderRealmChip(label: ReactNode, href: string, active: boolean) {
    return (
      <Link href={href} style={linkResetStyle}>
        <CanvasPill
          theme={th}
          tone={active ? "accent" : "neutral"}
          dot={active}
        >
          {label}
        </CanvasPill>
      </Link>
    );
  }

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="稽核 · cross-actor"
        subtitle="不可變 · 7 年保存 · 含所有 actor realm 對 tenant 資源的動作 (Q-TEN13)"
        actions={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {refreshAction?.enabled ? (
              <Link style={refreshLinkStyle} href={refreshHref}>
                手動刷新 · T6
              </Link>
            ) : null}
            <span
              title={
                exportAction?.enabled
                  ? undefined
                  : (exportAction?.disabledReasonCode ?? "目前沒有可匯出的紀錄")
              }
            >
              <CanvasBtn theme={th} size="sm" disabled={!exportAction?.enabled}>
                匯出 (簽名 artifact)
              </CanvasBtn>
            </span>
          </div>
        }
      />

      <div style={pageBodyStyle}>
        <CanvasBanner
          theme={th}
          tone="info"
          icon="audit"
          title="跨 actor 可見性 · Q-TEN13"
          body="本租戶可看到：(a) 自家使用者對自家資源的動作；(b) ops 對自家 booking / complaint 的動作；(c) platform admin 影響自家 config 的動作；(d) system 對自家資源的動作。敏感欄位由 policy 自動 mask；ops / platform 來源的紀錄可開新分頁回到來源 app 檢視。"
        />

        <div style={metaRowStyle}>
          <CanvasPill theme={th} tone="warn" dot>
            刷新層級 · T6 手動
          </CanvasPill>
          <span style={{ color: th.textMuted, fontSize: 11.5 }}>
            快照 {snapshotFormatter.format(new Date(generatedAt))} · 顯示{" "}
            {filteredRows.length} / {totalCount} 筆
          </span>
        </div>

        <CanvasCard theme={th} padding={0}>
          {filterAction?.enabled ? (
            <div style={{ padding: "10px 12px", display: "grid", gap: 8 }}>
              <div style={filterRowStyle}>
                <span style={filterGroupLabelStyle}>ACTOR</span>
                {renderRealmChip("全部", realmAllHref, !validRealm)}
                {REALM_FILTERS.map((item) =>
                  renderRealmChip(
                    item.label,
                    buildQuery({
                      realm: item.value,
                      module: moduleFilter,
                      since: sinceFilter,
                    }),
                    validRealm === item.value,
                  ),
                )}
              </div>
              {moduleNames.length > 0 ? (
                <div style={filterRowStyle}>
                  <span style={filterGroupLabelStyle}>MODULE</span>
                  {renderRealmChip(
                    "全部",
                    buildQuery({ realm: validRealm, since: sinceFilter }),
                    !moduleFilter,
                  )}
                  {moduleNames.map((name) =>
                    renderRealmChip(
                      name,
                      buildQuery({
                        realm: validRealm,
                        module: name,
                        since: sinceFilter,
                      }),
                      moduleFilter === name,
                    ),
                  )}
                </div>
              ) : null}
              <div style={filterRowStyle}>
                <span style={filterGroupLabelStyle}>TIME</span>
                {renderRealmChip(
                  "全部",
                  buildQuery({ realm: validRealm, module: moduleFilter }),
                  !timeFilter,
                )}
                {TIME_FILTERS.map((item) =>
                  renderRealmChip(
                    item.label,
                    buildQuery({
                      realm: validRealm,
                      module: moduleFilter,
                      since: item.value,
                    }),
                    sinceFilter === item.value,
                  ),
                )}
              </div>
            </div>
          ) : null}

          {showTable ? (
            <CanvasTable<AuditLogRecord & Record<string, unknown>>
              theme={th}
              columns={columns}
              rows={
                filteredRows as (AuditLogRecord & Record<string, unknown>)[]
              }
            />
          ) : emptyCopy ? (
            <div style={emptyStateStyle}>
              <CanvasPill theme={th} tone={emptyCopy.tone} dot>
                {emptyReason}
              </CanvasPill>
              <div style={emptyTitleStyle}>{emptyCopy.title}</div>
              <div style={emptyBodyStyle}>{emptyCopy.body}</div>
              {hasActiveFilter && emptyReason === "filtered_empty" ? (
                <Link style={refreshLinkStyle} href="/audit">
                  清除篩選
                </Link>
              ) : null}
            </div>
          ) : (
            <div style={emptyStateStyle}>
              <div style={emptyTitleStyle}>目前沒有任何稽核紀錄。</div>
            </div>
          )}

          <div style={previewRowStyle}>
            <span style={filterGroupLabelStyle}>EMPTYREASON 預覽</span>
            {EMPTY_REASONS.map((reason) =>
              renderRealmChip(
                reason,
                buildQuery({
                  realm: validRealm,
                  module: moduleFilter,
                  since: sinceFilter,
                  emptyReason: reason,
                }),
                emptyReasonOverride === reason,
              ),
            )}
            <Link
              href={refreshHref}
              style={{ ...crossAppLinkStyle, marginLeft: 4 }}
            >
              清除預覽
            </Link>
          </div>
        </CanvasCard>
      </div>
    </div>
  );
}
