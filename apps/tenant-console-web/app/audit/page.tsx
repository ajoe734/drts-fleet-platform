import type { CSSProperties } from "react";
import type { AuditLogRecord } from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasIcon,
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

// Canvas icon names used on this page. `@drts/ui-web` exports the `CanvasIcon`
// component but not its name type, so we narrow to the subset we use; every
// member is a valid CanvasIcon name.
type AuditIconName = "filter" | "clock" | "ext" | "audit" | "warn" | "x";

// Cross-app deep-link bases (Q-X03 / packet §3.10): ops/platform actions on
// tenant resources open the owning app read-scoped in a new tab.
const OPS_CONSOLE_URL =
  process.env.NEXT_PUBLIC_OPS_CONSOLE_URL ?? "http://localhost:3002";
const PLATFORM_ADMIN_URL =
  process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL ?? "http://localhost:3003";

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const filterBarStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 8,
};

const actorCellStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  whiteSpace: "normal",
};

const realmEnStyle: CSSProperties = {
  marginLeft: 4,
  opacity: 0.7,
  fontFamily: th.monoFamily,
  fontSize: 9.5,
};

const linkStyle: CSSProperties = {
  color: th.accent,
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
};

const actionTextStyle: CSSProperties = {
  color: th.accent,
  fontFamily: th.monoFamily,
  fontSize: 11.5,
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

function formatAuditAt(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return auditDateFormatter.format(parsed).replace(",", "");
}

// ── Actor realms (Q-TEN13) ──────────────────────────────────────────────────
// AuditLogRecord.actorType is mapped to a tenant-facing realm so every row
// visually conveys whether the action came from the tenant, ops, platform,
// a partner integration, or the system.
type ActorRealm = "tenant" | "ops" | "platform" | "system" | "partner";

const REALM_ORDER: ActorRealm[] = [
  "tenant",
  "ops",
  "platform",
  "system",
  "partner",
];

const REALM_META: Record<
  ActorRealm,
  { zh: string; en: string; tone: CanvasTone }
> = {
  tenant: { zh: "租戶", en: "tenant", tone: "accent" },
  ops: { zh: "營運", en: "ops", tone: "info" },
  platform: { zh: "平台", en: "platform", tone: "warn" },
  system: { zh: "系統", en: "system", tone: "neutral" },
  partner: { zh: "合作夥伴", en: "partner", tone: "success" },
};

function toRealm(actorType: AuditLogRecord["actorType"]): ActorRealm {
  switch (actorType) {
    case "tenant_admin":
      return "tenant";
    case "ops_user":
      return "ops";
    case "platform_admin":
      return "platform";
    case "partner_api_key":
      return "partner";
    case "system":
    default:
      return "system";
  }
}

function isActorRealm(value: string | undefined): value is ActorRealm {
  return value !== undefined && (REALM_ORDER as string[]).includes(value);
}

// ── Empty / not-ready states (Q-X15) ────────────────────────────────────────
type EmptyReason =
  | "no_data"
  | "not_provisioned"
  | "fetch_failed"
  | "permission_denied"
  | "external_unavailable"
  | "filtered_empty";

const EMPTY_STATES: Record<
  EmptyReason,
  { icon: AuditIconName; tone: CanvasTone; title: string; body: string }
> = {
  no_data: {
    icon: "audit",
    tone: "neutral",
    title: "尚無稽核紀錄",
    body: "此租戶目前沒有任何狀態變更動作被記錄。每一筆寫入動作都會在此留下不可變紀錄。",
  },
  not_provisioned: {
    icon: "warn",
    tone: "info",
    title: "稽核管線尚未開通",
    body: "此租戶的稽核記錄服務尚未佈建；請聯絡平台管理員完成開通後再檢視。",
  },
  fetch_failed: {
    icon: "warn",
    tone: "danger",
    title: "無法載入稽核紀錄",
    body: "讀取稽核資料時發生錯誤。本頁為手動 (T6) 更新，請點「重新整理」重試。",
  },
  permission_denied: {
    icon: "warn",
    tone: "warn",
    title: "權限不足",
    body: "您目前的角色無權檢視稽核紀錄，需要 tc_admin 或 tc_finance 角色。",
  },
  external_unavailable: {
    icon: "warn",
    tone: "warn",
    title: "稽核儲存暫時無法使用",
    body: "稽核記錄後端暫時無法連線，資料並未遺失；請稍後再重新整理。",
  },
  filtered_empty: {
    icon: "filter",
    tone: "neutral",
    title: "沒有符合篩選的紀錄",
    body: "目前的 actor / module 篩選條件下沒有任何稽核紀錄，請調整或清除篩選。",
  },
};

function classifyLoadError(error: unknown): EmptyReason {
  const message = error instanceof Error ? error.message : "";
  const matched = message.match(/API error (\d{3})/);
  const status = matched ? Number(matched[1]) : 0;
  if (status === 401 || status === 403) return "permission_denied";
  if (status === 404) return "not_provisioned";
  if (status === 502 || status === 503 || status === 504) {
    return "external_unavailable";
  }
  return "fetch_failed";
}

// ── availableActions (Q-X13) ────────────────────────────────────────────────
// Audit is read-only, so the action set is all low-risk. CTAs are rendered
// from this descriptor list rather than hard-coded by role.
type AuditActionRisk = "low" | "medium" | "high";

interface ResourceActionDescriptor {
  key: string;
  label: string;
  icon: AuditIconName;
  risk: AuditActionRisk;
  href?: string;
  newTab?: boolean;
}

function actionVariant(risk: AuditActionRisk): {
  variant?: "primary";
  danger?: boolean;
} {
  if (risk === "high") return { danger: true };
  if (risk === "medium") return { variant: "primary" };
  return {};
}

// ── Deep links (packet §3.10 + §4.2) ────────────────────────────────────────
function resourceLink(row: AuditRow): { href: string; newTab: boolean } | null {
  const id = row.resourceId;
  const module = row.moduleName;

  // Tenant- and system-owned resources resolve in-app.
  if (row.realm === "tenant" || row.realm === "system") {
    switch (module) {
      case "booking":
        return id
          ? { href: `/bookings/${id}`, newTab: false }
          : { href: "/bookings", newTab: false };
      case "billing":
        return { href: "/invoices", newTab: false };
      case "passenger":
        return { href: "/passengers", newTab: false };
      case "address":
        return { href: "/addresses", newTab: false };
      case "webhook":
        return { href: "/webhooks", newTab: false };
      case "api_key":
        return { href: "/api-keys", newTab: false };
      default:
        return null;
    }
  }

  // Ops actions deep-link back to ops-console (read-scoped, new tab).
  if (row.realm === "ops") {
    if (module === "incident" && id) {
      return { href: `${OPS_CONSOLE_URL}/incidents/${id}`, newTab: true };
    }
    if (module === "complaint" && id) {
      return { href: `${OPS_CONSOLE_URL}/complaints/${id}`, newTab: true };
    }
    if (module === "booking" && id) {
      return { href: `${OPS_CONSOLE_URL}/orders/${id}`, newTab: true };
    }
    return { href: OPS_CONSOLE_URL, newTab: true };
  }

  // Platform actions deep-link to platform-admin (read-scoped, new tab).
  if (row.realm === "platform") {
    if (module === "billing") {
      return { href: `${PLATFORM_ADMIN_URL}/billing`, newTab: true };
    }
    return { href: `${PLATFORM_ADMIN_URL}/tenants`, newTab: true };
  }

  return null;
}

type AuditRow = Record<string, unknown> & {
  auditId: string;
  at: string;
  realm: ActorRealm;
  actorId: string | null;
  moduleName: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  req: string;
};

function toAuditRow(record: AuditLogRecord): AuditRow {
  return {
    auditId: record.auditId,
    at: formatAuditAt(record.createdAt),
    realm: toRealm(record.actorType),
    actorId: record.actorId,
    moduleName: record.moduleName,
    action: record.actionName,
    resourceType: record.resourceType,
    resourceId: record.resourceId,
    req: record.requestId || "—",
  };
}

function compareRecords(left: AuditLogRecord, right: AuditLogRecord) {
  const leftAt = new Date(left.createdAt).getTime() || 0;
  const rightAt = new Date(right.createdAt).getTime() || 0;
  return rightAt - leftAt;
}

async function loadAuditRecords(): Promise<{
  records: AuditLogRecord[];
  error: unknown;
}> {
  const client = getTenantClient();
  try {
    const records = (await client.listTenantAuditLogs()) as AuditLogRecord[];
    return { records: [...records].sort(compareRecords), error: null };
  } catch (error) {
    return { records: [], error };
  }
}

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function ActorCell({ row }: { row: AuditRow }) {
  const meta = REALM_META[row.realm];
  const masked = !row.actorId && row.realm !== "system";
  return (
    <span style={actorCellStyle}>
      <CanvasPill theme={th} tone={meta.tone} dot>
        {meta.zh}
        <span style={realmEnStyle}>{meta.en}</span>
      </CanvasPill>
      {masked ? (
        <CanvasPill theme={th} tone="neutral">
          masked
        </CanvasPill>
      ) : (
        <span style={{ fontSize: 12, color: th.text }}>
          {row.actorId ?? (row.realm === "system" ? "system" : "—")}
        </span>
      )}
    </span>
  );
}

function ResourceCell({ row }: { row: AuditRow }) {
  const label = row.resourceId ?? row.resourceType ?? "—";
  const link = resourceLink(row);
  if (!link) {
    return <span>{label}</span>;
  }
  if (link.newTab) {
    return (
      <a href={link.href} target="_blank" rel="noreferrer" style={linkStyle}>
        {label}
        <CanvasIcon name="ext" size={11} />
      </a>
    );
  }
  return (
    <a href={link.href} style={linkStyle}>
      {label}
    </a>
  );
}

function AuditEmptyState({ reason }: { reason: EmptyReason }) {
  const state = EMPTY_STATES[reason];
  return (
    <div
      style={{
        padding: 40,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
        textAlign: "center",
      }}
    >
      <span style={{ color: th.textMuted }}>
        <CanvasIcon name={state.icon} size={26} />
      </span>
      <div style={{ fontSize: 13, fontWeight: 600, color: th.text }}>
        {state.title}
      </div>
      <div
        style={{
          fontSize: 12,
          color: th.textMuted,
          maxWidth: 420,
          lineHeight: 1.5,
        }}
      >
        {state.body}
      </div>
      <CanvasPill theme={th} tone={state.tone} dot>
        {reason}
      </CanvasPill>
    </div>
  );
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ records, error }, resolvedSearchParams] = await Promise.all([
    loadAuditRecords(),
    searchParams,
  ]);

  const actorParam = single(resolvedSearchParams.actor);
  const actorFilter = isActorRealm(actorParam) ? actorParam : null;
  const moduleFilter = single(resolvedSearchParams.module) ?? null;
  const hasActiveFilter = Boolean(actorFilter || moduleFilter);

  const allRows = records.map(toAuditRow);
  const rows = allRows.filter((row) => {
    if (actorFilter && row.realm !== actorFilter) return false;
    if (moduleFilter && row.moduleName !== moduleFilter) return false;
    return true;
  });

  const buildHref = (next: {
    actor?: ActorRealm | null;
    module?: string | null;
  }) => {
    const params = new URLSearchParams();
    const actor = "actor" in next ? next.actor : actorFilter;
    const module = "module" in next ? next.module : moduleFilter;
    if (actor) params.set("actor", actor);
    if (module) params.set("module", module);
    const query = params.toString();
    return query ? `/audit?${query}` : "/audit";
  };

  const refreshHref = buildHref({});

  // EmptyReason resolution: fetch failures classify by HTTP status; otherwise
  // an empty result is either filtered_empty or no_data.
  let emptyReason: EmptyReason | null = null;
  if (error) {
    emptyReason = classifyLoadError(error);
  } else if (rows.length === 0) {
    emptyReason = hasActiveFilter ? "filtered_empty" : "no_data";
  }

  // CTAs come from availableActions (Q-X13), never hard-coded by role.
  const availableActions: ResourceActionDescriptor[] = [
    {
      key: "filter",
      label: "篩選",
      icon: "filter",
      risk: "low",
      href: "#audit-filters",
    },
    {
      key: "refresh",
      label: "重新整理",
      icon: "clock",
      risk: "low",
      href: refreshHref,
    },
    { key: "export", label: "匯出 (簽名 artifact)", icon: "ext", risk: "low" },
  ];

  const columns: CanvasTableColumn<AuditRow>[] = [
    { h: "WHEN", k: "at", w: 170, mono: true },
    { h: "ACTOR", w: 280, r: (row) => <ActorCell row={row} /> },
    {
      h: "MODULE",
      w: 140,
      mono: true,
      r: (row) => (
        <a href={buildHref({ module: row.moduleName })} style={linkStyle}>
          {row.moduleName}
        </a>
      ),
    },
    {
      h: "ACTION",
      w: 200,
      mono: true,
      r: (row) => <span style={actionTextStyle}>{row.action}</span>,
    },
    {
      h: "RESOURCE",
      w: 220,
      mono: true,
      r: (row) => <ResourceCell row={row} />,
    },
    { h: "REQUEST", k: "req", mono: true },
  ];

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="稽核 · cross-actor"
        subtitle="不可變 · 7 年保存 · 含所有 actor realm 對 tenant 資源的動作 (Q-TEN13) · T6 手動更新"
        actions={availableActions.map((action) => {
          const variant = actionVariant(action.risk);
          const button = (
            <CanvasBtn theme={th} icon={action.icon} size="sm" {...variant}>
              {action.label}
            </CanvasBtn>
          );
          if (!action.href) {
            return <span key={action.key}>{button}</span>;
          }
          return (
            <a
              key={action.key}
              href={action.href}
              {...(action.newTab
                ? { target: "_blank", rel: "noreferrer" }
                : {})}
              style={{ textDecoration: "none" }}
            >
              {button}
            </a>
          );
        })}
      />

      <div style={pageBodyStyle}>
        <CanvasBanner
          theme={th}
          tone="info"
          icon="audit"
          title="跨 actor 可見性 · Q-TEN13"
          body="本租戶可看到：(a) 自家使用者對自家資源的動作；(b) ops 對自家 booking / complaint 的動作；(c) platform admin 影響自家 config 的動作；(d) system 對自家資源的動作。敏感欄位由 policy 自動 mask。"
        />

        <CanvasCard theme={th} title="篩選 · cross-actor" padding={14}>
          <div id="audit-filters" style={filterBarStyle}>
            {(["all", ...REALM_ORDER] as const).map((key) => {
              const active =
                key === "all" ? actorFilter === null : actorFilter === key;
              const href =
                key === "all"
                  ? buildHref({ actor: null })
                  : buildHref({ actor: key });
              const label = key === "all" ? "全部" : REALM_META[key].zh;
              return (
                <a
                  key={key}
                  href={href}
                  style={{
                    textDecoration: "none",
                    padding: "3px 10px",
                    borderRadius: 6,
                    fontSize: 11.5,
                    fontWeight: 600,
                    color: active ? th.accent : th.textMuted,
                    background: active ? th.accentBg : th.surface,
                    border: `1px solid ${active ? th.accentBorder : th.border}`,
                  }}
                >
                  {label}
                </a>
              );
            })}
            {moduleFilter ? (
              <a href={buildHref({ module: null })} style={linkStyle}>
                <CanvasPill theme={th} tone="accent" dot>
                  module: {moduleFilter}
                  <CanvasIcon name="x" size={11} />
                </CanvasPill>
              </a>
            ) : null}
            <span
              style={{
                marginLeft: "auto",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontSize: 11,
                color: th.textMuted,
              }}
            >
              <CanvasPill theme={th} tone="neutral" dot>
                T6 · 手動更新
              </CanvasPill>
              {error ? null : <span>{rows.length} 筆</span>}
            </span>
          </div>
        </CanvasCard>

        <CanvasCard theme={th} padding={0}>
          {emptyReason ? (
            <AuditEmptyState reason={emptyReason} />
          ) : (
            <CanvasTable<AuditRow> theme={th} columns={columns} rows={rows} />
          )}
        </CanvasCard>
      </div>
    </div>
  );
}
