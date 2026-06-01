import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import type {
  EmptyReason,
  ResourceActionDescriptor,
  TenantWebhookEndpoint,
  TenantWebhookEndpointStatus,
  WebhookDeliveryRecord,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasCard,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  type CanvasTableColumn,
  type CanvasTone,
  buildCanvasTheme,
} from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";

// Icon names are carried as descriptive metadata only (not rendered here), so a
// local alias keeps the spec-named icons without coupling to ui-web internals.
type CanvasIconName = string;

export const dynamic = "force-dynamic";

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

// Cross-app deep links open in a new tab only when the target app base URL is
// configured (per packet §5.10 — webhook delivery details may deep-link to
// platform-admin / ops-console in degenerate cases). When unset we keep the
// affordance visible but inert rather than linking to a broken origin.
const OPS_CONSOLE_URL = process.env.NEXT_PUBLIC_OPS_CONSOLE_URL ?? null;
const PLATFORM_ADMIN_URL = process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL ?? null;

// `/webhooks` is refresh tier T5 (Tenant slow, 30s) per packet §4 + §5.10.
const REFRESH_TIER = "slow" as const;
const REFRESH_TIER_CADENCE_SECONDS = 30;

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const urlPrimaryStyle: CSSProperties = {
  color: th.text,
  fontWeight: 600,
};

const pillWrapStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 4,
  whiteSpace: "normal",
};

const actionRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  whiteSpace: "normal",
};

const freshnessRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 10,
  fontSize: 12,
  color: th.textMuted,
};

const freshnessMonoStyle: CSSProperties = {
  fontFamily: th.monoFamily,
  fontSize: 11.5,
  color: th.textDim,
};

const deepLinkRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  padding: 16,
};

const deepLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 12px",
  borderRadius: 8,
  border: `1px solid ${th.border}`,
  background: th.surfaceLo,
  color: th.text,
  fontSize: 12,
  fontWeight: 600,
  textDecoration: "none",
};

const deepLinkInertStyle: CSSProperties = {
  ...deepLinkStyle,
  color: th.textDim,
  cursor: "not-allowed",
  opacity: 0.55,
};

const deepLinkNoteStyle: CSSProperties = {
  flexBasis: "100%",
  margin: 0,
  fontSize: 11.5,
  lineHeight: 1.5,
  color: th.textMuted,
};

const shortDateTimeFormatter = new Intl.DateTimeFormat("sv-SE", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const relativeTimeFormatter = new Intl.RelativeTimeFormat("en", {
  numeric: "auto",
});

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知錯誤";
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateTime(value: string | null | undefined) {
  const parsed = parseDate(value);
  if (!parsed) return "—";
  return shortDateTimeFormatter.format(parsed).replace(",", "");
}

function formatRelativeTime(value: string | null | undefined) {
  const parsed = parseDate(value);
  if (!parsed) return "—";

  const diffSeconds = Math.round((parsed.getTime() - Date.now()) / 1000);
  const absSeconds = Math.abs(diffSeconds);

  if (absSeconds < 60) {
    return relativeTimeFormatter.format(diffSeconds, "second");
  }

  const diffMinutes = Math.round(diffSeconds / 60);
  if (Math.abs(diffMinutes) < 60) {
    return relativeTimeFormatter.format(diffMinutes, "minute");
  }

  const diffHours = Math.round(diffSeconds / 3600);
  if (Math.abs(diffHours) < 24) {
    return relativeTimeFormatter.format(diffHours, "hour");
  }

  const diffDays = Math.round(diffSeconds / 86400);
  return relativeTimeFormatter.format(diffDays, "day");
}

// ── availableActions → CTAs (Q-X13) ─────────────────────────────────────────
// Descriptors are rendered as visible affordances: enabled, disabled-with-reason,
// or absent (hidden). They never collapse to mock buttons that ignore authority.

type ActionButtonProps = {
  descriptor: ResourceActionDescriptor | undefined;
  label: string;
  href?: string;
  icon?: CanvasIconName;
  size?: "xs" | "sm";
};

const RISK_TONE: Record<ResourceActionDescriptor["riskLevel"], CanvasTone> = {
  low: "neutral",
  medium: "accent",
  high: "danger",
};

const DISABLED_REASON_LABELS: Record<string, string> = {
  engine_not_provisioned: "delivery engine 尚未開通",
  tenant_role_missing: "目前身分缺少 webhook 權限",
  already_disabled: "endpoint 已停用",
  delivery_not_failed: "僅失敗的投遞可重試",
  backend_retry_endpoint_pending: "retry endpoint 後端尚未提供",
};

function findAction(
  actions: ResourceActionDescriptor[],
  action: string,
): ResourceActionDescriptor | undefined {
  return actions.find((descriptor) => descriptor.action === action);
}

function ActionButton({
  descriptor,
  label,
  href,
  size = "xs",
}: ActionButtonProps) {
  if (!descriptor) return null;

  const tone = RISK_TONE[descriptor.riskLevel];
  const sizeStyle: CSSProperties =
    size === "sm"
      ? { padding: "5px 10px", fontSize: 12, height: 28 }
      : { padding: "4px 8px", fontSize: 11.5, height: 24 };

  const enabled = descriptor.enabled;
  const reasonLabel = descriptor.disabledReasonCode
    ? (DISABLED_REASON_LABELS[descriptor.disabledReasonCode] ??
      descriptor.disabledReasonCode)
    : undefined;
  const tooltip = !enabled
    ? reasonLabel
    : descriptor.requiresReason
      ? "high-risk · 送出前需填寫原因"
      : undefined;

  const palette: Record<CanvasTone, { bg: string; fg: string; bd: string }> = {
    neutral: { bg: th.surface, fg: th.text, bd: th.border },
    info: { bg: th.infoBg, fg: th.info, bd: th.infoBorder },
    success: { bg: th.successBg, fg: th.success, bd: th.successBorder },
    warn: { bg: th.warnBg, fg: th.warn, bd: th.warnBorder },
    danger: { bg: th.dangerBg, fg: th.danger, bd: th.dangerBorder },
    accent: { bg: th.accent, fg: "#ffffff", bd: th.accent },
  };
  const colors = palette[tone];

  const baseStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    borderRadius: 7,
    border: `1px solid ${colors.bd}`,
    background: colors.bg,
    color: colors.fg,
    fontWeight: 600,
    lineHeight: 1,
    textDecoration: "none",
    cursor: enabled ? "pointer" : "not-allowed",
    opacity: enabled ? 1 : 0.5,
    ...sizeStyle,
  };

  const content = (
    <>
      <span>{label}</span>
      {descriptor.requiresReason && enabled ? (
        <span
          aria-hidden
          style={{
            width: 5,
            height: 5,
            borderRadius: 3,
            background: "currentColor",
            opacity: 0.65,
          }}
        />
      ) : null}
    </>
  );

  if (enabled && href) {
    return (
      <Link
        href={href}
        style={baseStyle}
        title={tooltip}
        data-action={descriptor.action}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      disabled={!enabled}
      style={baseStyle}
      title={tooltip}
      data-action={descriptor.action}
    >
      {content}
    </button>
  );
}

function buildHeaderActions(
  engineProvisioned: boolean,
): ResourceActionDescriptor[] {
  return [
    { action: "view_payload_schema", enabled: true, riskLevel: "low" },
    {
      action: "create_endpoint",
      enabled: engineProvisioned,
      riskLevel: "medium",
      ...(engineProvisioned
        ? {}
        : { disabledReasonCode: "engine_not_provisioned" }),
    },
  ];
}

function buildEndpointActions(
  endpoint: TenantWebhookEndpoint,
): ResourceActionDescriptor[] {
  const isDisabled = endpoint.status === "disabled";
  return [
    { action: "update_endpoint", enabled: true, riskLevel: "medium" },
    isDisabled
      ? {
          action: "disable_endpoint",
          enabled: false,
          riskLevel: "high",
          requiresReason: true,
          disabledReasonCode: "already_disabled",
        }
      : {
          action: "disable_endpoint",
          enabled: true,
          riskLevel: "high",
          requiresReason: true,
        },
    {
      action: "delete_endpoint",
      enabled: true,
      riskLevel: "high",
      requiresReason: true,
    },
    { action: "rotate_secret", enabled: true, riskLevel: "high" },
    { action: "view_delivery_log", enabled: true, riskLevel: "low" },
  ];
}

// `WebhookDeliveryRecord` (contracts §webhooks) carries no `availableActions[]`
// field — unlike the endpoint resource — so the per-delivery retry CTA is the
// single descriptor derived here from `delivery.status` (the only authority the
// contract exposes). It is ALWAYS emitted: an enabled `retry_delivery` for
// `delivery_failed`, otherwise a disabled one carrying `delivery_not_failed`.
// `ActionButton` never drops a descriptor, so the CTA + its disabled reason stay
// visible on both the row table and the detail surface; nothing is filtered on
// the absence of an href.
function buildDeliveryActions(
  delivery: WebhookDeliveryRecord,
): ResourceActionDescriptor[] {
  if (delivery.status === "delivery_failed") {
    return [{ action: "retry_delivery", enabled: true, riskLevel: "medium" }];
  }
  return [
    {
      action: "retry_delivery",
      enabled: false,
      riskLevel: "medium",
      disabledReasonCode: "delivery_not_failed",
    },
  ];
}

// ── EmptyReason → distinct empty states (Q-X15) ─────────────────────────────
// All six tenant-facing reasons render with their own icon, tone, and copy.
// `not_provisioned` is the Q-TEN08 "delivery engine not active" state and must
// never be confused with a plain empty `no_data` register.

type EmptyStatePresentation = {
  icon: CanvasIconName;
  tone: CanvasTone;
  title: string;
  body: string;
  cta?: { label: string; href: string; icon?: CanvasIconName };
};

const EMPTY_STATE_PRESENTATION: Record<EmptyReason, EmptyStatePresentation> = {
  not_provisioned: {
    icon: "integrationGov",
    tone: "warn",
    title: "Webhook engine 尚未開通",
    body: "此租戶目前沒有啟用 delivery engine。依 Q-TEN08，畫面不會回填任何假 delivery log；請先完成平台側開通，再建立 endpoint。",
    cta: {
      label: "查看建立流程",
      href: "/integration-governance",
      icon: "ext",
    },
  },
  permission_denied: {
    icon: "x",
    tone: "danger",
    title: "目前身分沒有 webhook 權限",
    body: "後端拒絕回傳此區塊資料。請改用具 tc_admin 或 tc_integration_mgr 權限的身分，或請平台/租戶管理員協助。",
  },
  external_unavailable: {
    icon: "warn",
    tone: "warn",
    title: "Delivery engine 暫時不可用",
    body: "後端或外部目的端暫時不可用，因此無法取得 webhook 可視資料。保留目前查詢條件，稍後手動 refresh 再試。",
    cta: { label: "重新整理", href: "/webhooks", icon: "ok" },
  },
  fetch_failed: {
    icon: "warn",
    tone: "danger",
    title: "資料抓取失敗",
    body: "請檢查 API 可用性與目前環境 headers。這不是無資料狀態，而是 read model 讀取失敗。",
    cta: { label: "重新整理", href: "/webhooks", icon: "ok" },
  },
  filtered_empty: {
    icon: "filter",
    tone: "neutral",
    title: "目前篩選條件下沒有結果",
    body: "資料源仍可用，但現有 status 或 endpoint 篩選沒有命中任何項目。清除篩選即可回到完整檢視。",
    cta: { label: "清除篩選", href: "/webhooks", icon: "x" },
  },
  no_data: {
    icon: "webhooks",
    tone: "info",
    title: "尚未建立任何 endpoint",
    body: "目前沒有 webhook endpoint，因此也不會有 delivery log。先建立第一個 endpoint，系統才會開始產生真實 delivery visibility。",
    cta: {
      label: "新增 endpoint",
      href: "/webhooks?mode=create",
      icon: "plus",
    },
  },
  driver_not_eligible: {
    icon: "x",
    tone: "neutral",
    title: "不適用",
    body: "此狀態不適用於租戶 webhook 管理。",
  },
};

const EMPTY_REASONS: readonly EmptyReason[] = [
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
  "filtered_empty",
] as const;

function parseEmptyReason(value: string | undefined): EmptyReason | null {
  if (!value) return null;
  return EMPTY_REASONS.includes(value as EmptyReason)
    ? (value as EmptyReason)
    : null;
}

function WebhookEmptyState({ reason }: { reason: EmptyReason }) {
  const presentation =
    EMPTY_STATE_PRESENTATION[reason] ?? EMPTY_STATE_PRESENTATION.no_data;
  const tonePalette: Record<CanvasTone, { bg: string; bd: string }> = {
    neutral: { bg: th.neutralBg, bd: th.neutralBorder },
    info: { bg: th.infoBg, bd: th.infoBorder },
    success: { bg: th.successBg, bd: th.successBorder },
    warn: { bg: th.warnBg, bd: th.warnBorder },
    danger: { bg: th.dangerBg, bd: th.dangerBorder },
    accent: { bg: th.accentBg, bd: th.accentBorder },
  };
  const colors = tonePalette[presentation.tone];

  return (
    <div
      style={{
        padding: "36px 16px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 14,
        textAlign: "center",
        background: colors.bg,
        border: `1px dashed ${colors.bd}`,
        borderRadius: 10,
      }}
    >
      <div
        style={{
          display: "inline-flex",
          alignItems: "baseline",
          gap: 8,
          fontSize: 15,
          fontWeight: 600,
          color: th.text,
        }}
      >
        <span>{presentation.title}</span>
        <span style={freshnessMonoStyle}>· {reason}</span>
      </div>
      <p
        style={{
          margin: 0,
          maxWidth: 420,
          fontSize: 12.5,
          lineHeight: 1.6,
          color: th.textMuted,
        }}
      >
        {presentation.body}
      </p>
      {presentation.cta ? (
        <Link
          href={presentation.cta.href}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 12px",
            borderRadius: 7,
            border: `1px solid ${th.accent}`,
            background: th.accent,
            color: "#ffffff",
            fontSize: 12,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          {presentation.cta.label}
        </Link>
      ) : null}
    </div>
  );
}

// ── Read-model classification ───────────────────────────────────────────────

function classifyLoadFailure(error: unknown): EmptyReason {
  const message = toErrorMessage(error);
  const statusMatch = message.match(/API error (\d{3})/);
  const status = statusMatch ? Number(statusMatch[1]) : null;

  if (status === 401 || status === 403) return "permission_denied";
  if (status === 404 || status === 501) return "not_provisioned";
  if (status !== null && status >= 502 && status <= 504) {
    return "external_unavailable";
  }
  return "fetch_failed";
}

type EndpointRow = Record<string, unknown> & {
  webhookId: string;
  url: string;
  events: string[];
  stateLabel: string;
  stateTone: CanvasTone;
  secretLabel: string;
  health: string;
  healthTone: CanvasTone;
  last: string;
  actions: ResourceActionDescriptor[];
};

type DeliveryRow = Record<string, unknown> & {
  deliveryId: string;
  webhookId: string;
  eventType: string;
  codeLabel: string;
  codeTone: CanvasTone;
  tries: number;
  at: string;
  statusLabel: string;
  actions: ResourceActionDescriptor[];
};

function compareWebhookStatus(
  left: TenantWebhookEndpointStatus,
  right: TenantWebhookEndpointStatus,
) {
  const rank = { active: 0, test_pending: 1, disabled: 2 } as const;
  return rank[left] - rank[right];
}

function compareEndpoints(
  left: TenantWebhookEndpoint,
  right: TenantWebhookEndpoint,
) {
  const statusCompare = compareWebhookStatus(left.status, right.status);
  if (statusCompare !== 0) return statusCompare;
  const leftUpdated = parseDate(left.updatedAt)?.getTime() ?? 0;
  const rightUpdated = parseDate(right.updatedAt)?.getTime() ?? 0;
  if (leftUpdated !== rightUpdated) return rightUpdated - leftUpdated;
  return left.url.localeCompare(right.url, "en");
}

function compareDeliveries(
  left: WebhookDeliveryRecord,
  right: WebhookDeliveryRecord,
) {
  const leftCreated = parseDate(left.createdAt)?.getTime() ?? 0;
  const rightCreated = parseDate(right.createdAt)?.getTime() ?? 0;
  if (leftCreated !== rightCreated) return rightCreated - leftCreated;
  return right.attempt - left.attempt;
}

function getEndpointStateTone(status: TenantWebhookEndpointStatus): CanvasTone {
  if (status === "active") return "success";
  if (status === "test_pending") return "accent";
  return "warn";
}

function getEndpointHealth(endpoint: TenantWebhookEndpoint): {
  label: string;
  tone: CanvasTone;
} {
  const metadata = endpoint.runtimeMetadata;

  if (endpoint.status === "disabled") {
    if (metadata?.disableReason === "delivery_failed") {
      return { label: "disabled after failure cluster", tone: "danger" };
    }
    return { label: "manually paused", tone: "warn" };
  }

  if (endpoint.status === "test_pending") {
    return { label: "awaiting validation traffic", tone: "accent" };
  }

  if (metadata && metadata.failedDeliveryCount > 0) {
    return {
      label: `${metadata.failedDeliveryCount} failed / ${metadata.deliveryCount}`,
      tone: "warn",
    };
  }

  return { label: "healthy", tone: "success" };
}

function getEndpointLastLabel(endpoint: TenantWebhookEndpoint) {
  const metadata = endpoint.runtimeMetadata;
  if (endpoint.status === "active" && metadata?.lastDeliveredAt) {
    return `OK · ${formatRelativeTime(metadata.lastDeliveredAt)}`;
  }
  if (endpoint.status === "active" && metadata?.lastAttemptAt) {
    return `attempt · ${formatRelativeTime(metadata.lastAttemptAt)}`;
  }
  if (endpoint.status === "test_pending") {
    return `pending · ${formatRelativeTime(endpoint.updatedAt)}`;
  }
  if (endpoint.status === "disabled") {
    return `paused · ${formatRelativeTime(metadata?.disabledAt ?? endpoint.updatedAt)}`;
  }
  return formatDateTime(endpoint.updatedAt);
}

function toEndpointRow(endpoint: TenantWebhookEndpoint): EndpointRow {
  const health = getEndpointHealth(endpoint);
  return {
    webhookId: endpoint.webhookId,
    url: endpoint.url,
    events: endpoint.events.length > 0 ? endpoint.events : ["—"],
    stateLabel: endpoint.status,
    stateTone: getEndpointStateTone(endpoint.status),
    secretLabel: `${endpoint.secretPreview} · v${endpoint.secretVersion}`,
    health: health.label,
    healthTone: health.tone,
    last: getEndpointLastLabel(endpoint),
    actions: buildEndpointActions(endpoint),
  };
}

function getDeliveryCodeTone(code: number | null): CanvasTone {
  if (code === null) return "neutral";
  if (code >= 200 && code < 300) return "success";
  if (code >= 300 && code < 400) return "warn";
  return "danger";
}

function getDeliveryStatusLabel(delivery: WebhookDeliveryRecord) {
  if (delivery.status === "delivered") return "delivered";
  if (delivery.status === "queued") return "queued";
  return delivery.httpStatus === null ? "timeout" : "failed";
}

function toDeliveryRow(delivery: WebhookDeliveryRecord): DeliveryRow {
  return {
    deliveryId: delivery.deliveryId,
    webhookId: delivery.webhookId,
    eventType: delivery.eventType,
    codeLabel: delivery.httpStatus === null ? "—" : String(delivery.httpStatus),
    codeTone: getDeliveryCodeTone(delivery.httpStatus),
    tries: delivery.attempt,
    at: formatDateTime(delivery.createdAt),
    statusLabel: getDeliveryStatusLabel(delivery),
    actions: buildDeliveryActions(delivery),
  };
}

function pickDeliveryRows(deliveries: WebhookDeliveryRecord[]) {
  const sorted = [...deliveries].sort(compareDeliveries);
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const recent = sorted.filter((delivery) => {
    const created = parseDate(delivery.createdAt)?.getTime();
    return created !== undefined && created !== null && created >= cutoff;
  });

  if (recent.length > 0) {
    return { rows: recent.slice(0, 8).map(toDeliveryRow), subtitle: undefined };
  }
  if (sorted.length > 0) {
    return {
      rows: sorted.slice(0, 8).map(toDeliveryRow),
      subtitle: "近 24h 無新投遞，改顯示最近投遞紀錄",
    };
  }
  return { rows: [] as DeliveryRow[], subtitle: undefined };
}

type WebhooksPageData = {
  engineProvisioned: boolean;
  endpointRows: EndpointRow[];
  deliveryRows: DeliveryRow[];
  deliverySubtitle: string | undefined;
  emptyReason: EmptyReason | null;
  generatedAt: string;
  errors: string[];
};

async function loadWebhooksPageData(): Promise<WebhooksPageData> {
  const client = getTenantClient();

  const [endpointsResult, deliveriesResult] = await Promise.allSettled([
    client.listWebhooks() as Promise<TenantWebhookEndpoint[]>,
    client.get<{ items: WebhookDeliveryRecord[] }>(
      "/api/tenant/webhooks/deliveries",
    ) as Promise<{ items: WebhookDeliveryRecord[] }>,
  ]);

  const errors: string[] = [];

  // The endpoints read is the authoritative signal for Q-TEN08 engine
  // provisioning: a not_provisioned / permission / outage failure mode is
  // distinct from a successful-but-empty register.
  let endpoints: TenantWebhookEndpoint[] = [];
  let loadFailureReason: EmptyReason | null = null;

  if (endpointsResult.status === "fulfilled") {
    endpoints = [...endpointsResult.value].sort(compareEndpoints);
  } else {
    loadFailureReason = classifyLoadFailure(endpointsResult.reason);
    errors.push(`端點清單: ${toErrorMessage(endpointsResult.reason)}`);
  }

  const deliveries =
    deliveriesResult.status === "fulfilled"
      ? (deliveriesResult.value.items ?? [])
      : [];
  if (deliveriesResult.status === "rejected") {
    errors.push(`投遞紀錄: ${toErrorMessage(deliveriesResult.reason)}`);
  }

  const engineProvisioned = loadFailureReason !== "not_provisioned";

  let emptyReason: EmptyReason | null = null;
  if (loadFailureReason) {
    emptyReason = loadFailureReason;
  } else if (endpoints.length === 0) {
    emptyReason = "no_data";
  }

  const { rows: deliveryRows, subtitle: deliverySubtitle } =
    pickDeliveryRows(deliveries);

  const generatedAt =
    endpoints[0]?.updatedAt ??
    deliveries[0]?.createdAt ??
    new Date().toISOString();

  return {
    engineProvisioned,
    endpointRows: endpoints.map(toEndpointRow),
    deliveryRows,
    deliverySubtitle,
    emptyReason,
    generatedAt,
    errors,
  };
}

type WebhooksPageProps = {
  searchParams?: Promise<{ emptyReason?: string }>;
};

function DeepLink({
  href,
  external,
  children,
}: {
  href: string | null;
  external?: boolean;
  children: ReactNode;
}) {
  if (external) {
    if (!href) {
      return <span style={deepLinkInertStyle}>{children}</span>;
    }
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer noopener"
        style={deepLinkStyle}
      >
        {children}
      </a>
    );
  }
  return (
    <Link href={href ?? "#"} style={deepLinkStyle}>
      {children}
    </Link>
  );
}

export default async function WebhooksPage({
  searchParams,
}: WebhooksPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const emptyReasonOverride = parseEmptyReason(
    resolvedSearchParams?.emptyReason,
  );

  const {
    engineProvisioned,
    endpointRows,
    deliveryRows,
    deliverySubtitle,
    emptyReason: inferredEmptyReason,
    generatedAt,
    errors,
  } = await loadWebhooksPageData();

  const emptyReason = emptyReasonOverride ?? inferredEmptyReason;
  const headerActions = buildHeaderActions(
    engineProvisioned && emptyReason !== "not_provisioned",
  );
  const payloadSchemaAction = findAction(headerActions, "view_payload_schema");
  const createEndpointAction = findAction(headerActions, "create_endpoint");

  const endpointColumns: CanvasTableColumn<EndpointRow>[] = [
    {
      h: "URL",
      k: "url",
      mono: true,
      r: (row) => <span style={urlPrimaryStyle}>{row.url}</span>,
    },
    {
      h: "EVENTS",
      w: 280,
      r: (row) => (
        <div style={pillWrapStyle}>
          {row.events.map((eventType) => (
            <CanvasPill key={eventType} theme={th} tone="info">
              {eventType}
            </CanvasPill>
          ))}
        </div>
      ),
    },
    {
      h: "STATE",
      w: 116,
      r: (row) => (
        <CanvasPill theme={th} tone={row.stateTone} dot>
          {row.stateLabel}
        </CanvasPill>
      ),
    },
    { h: "SECRET", k: "secretLabel", w: 150, mono: true },
    {
      h: "HEALTH",
      w: 180,
      r: (row) => (
        <CanvasPill theme={th} tone={row.healthTone}>
          {row.health}
        </CanvasPill>
      ),
    },
    { h: "LAST", k: "last", w: 150, mono: true },
    {
      h: "ACTIONS",
      w: 320,
      r: (row) => (
        <div style={actionRowStyle}>
          <ActionButton
            descriptor={findAction(row.actions, "update_endpoint")}
            label="更新"
          />
          <ActionButton
            descriptor={findAction(row.actions, "disable_endpoint")}
            label="停用"
          />
          <ActionButton
            descriptor={findAction(row.actions, "delete_endpoint")}
            label="刪除"
          />
          <ActionButton
            descriptor={findAction(row.actions, "rotate_secret")}
            label="rotate secret"
          />
          <ActionButton
            descriptor={findAction(row.actions, "view_delivery_log")}
            label="delivery log"
          />
        </div>
      ),
    },
  ];

  const deliveryColumns: CanvasTableColumn<DeliveryRow>[] = [
    { h: "DLV", k: "deliveryId", w: 108, mono: true },
    { h: "WH", k: "webhookId", w: 92, mono: true },
    { h: "EVENT", k: "eventType", w: 200, mono: true },
    {
      h: "CODE",
      w: 84,
      align: "right",
      r: (row) => (
        <CanvasPill theme={th} tone={row.codeTone}>
          {row.codeLabel}
        </CanvasPill>
      ),
    },
    { h: "TRIES", k: "tries", w: 72, mono: true, align: "right" },
    { h: "AT", k: "at", mono: true },
    { h: "STATUS", k: "statusLabel", w: 96, mono: true },
    {
      h: "ACTIONS",
      w: 130,
      r: (row) => (
        <ActionButton
          descriptor={findAction(row.actions, "retry_delivery")}
          label="retry failed"
        />
      ),
    },
  ];

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="Webhook"
        subtitle="端點 · 事件訂閱 · 投遞紀錄 · 重試政策 — 後端 engine 是否啟用直接決定畫面 (Q-TEN08)"
        tabs={["Endpoints", "Deliveries", "Replay"]}
        activeTab="Endpoints"
        actions={
          <>
            <ActionButton
              descriptor={payloadSchemaAction}
              label="payload schema"
              href="/settings"
              icon="ext"
              size="sm"
            />
            <ActionButton
              descriptor={createEndpointAction}
              label="新增端點"
              href="/webhooks?mode=create"
              icon="plus"
              size="sm"
            />
          </>
        }
      />

      <div style={pageBodyStyle}>
        <div style={freshnessRowStyle}>
          <CanvasPill theme={th} tone="neutral" dot>
            T5 · {REFRESH_TIER}
          </CanvasPill>
          <span>Tenant slow · 自動節奏 {REFRESH_TIER_CADENCE_SECONDS}s</span>
          <span style={freshnessMonoStyle}>
            Snapshot {formatDateTime(generatedAt)}
          </span>
          <Link
            href="/webhooks"
            style={{ ...deepLinkStyle, padding: "4px 10px" }}
          >
            Refresh now
          </Link>
        </div>

        {errors.length > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title="部分 webhook 資料無法載入"
            body={errors.join(" · ")}
          />
        ) : null}

        {emptyReason ? (
          <CanvasCard theme={th} title="端點" padding={0}>
            <WebhookEmptyState reason={emptyReason} />
          </CanvasCard>
        ) : (
          <>
            <CanvasCard
              theme={th}
              title={`端點 · ${endpointRows.length} entries`}
              padding={0}
            >
              <CanvasTable<EndpointRow>
                theme={th}
                columns={endpointColumns}
                rows={endpointRows}
                dense={false}
              />
            </CanvasCard>

            <CanvasCard
              theme={th}
              title="近 24h 投遞"
              subtitle={deliverySubtitle}
              padding={0}
            >
              {deliveryRows.length > 0 ? (
                <CanvasTable<DeliveryRow>
                  theme={th}
                  columns={deliveryColumns}
                  rows={deliveryRows}
                  dense
                />
              ) : (
                <div
                  style={{
                    padding: 24,
                    color: th.textMuted,
                    fontSize: 12.5,
                    textAlign: "center",
                  }}
                >
                  目前沒有可顯示的投遞紀錄。
                </div>
              )}
            </CanvasCard>
          </>
        )}

        <CanvasCard theme={th} title="Cross-app deep links">
          <div style={deepLinkRowStyle}>
            <DeepLink href="/integration-governance">
              Tenant integration governance
            </DeepLink>
            <DeepLink href="/audit?resourceType=webhook_endpoint">
              Tenant audit trail
            </DeepLink>
            <DeepLink href="/notifications">Notification preferences</DeepLink>
            <DeepLink
              href={
                OPS_CONSOLE_URL
                  ? `${OPS_CONSOLE_URL}/incidents?event=tenant.webhook.delivery_failed`
                  : null
              }
              external
            >
              Ops triage ↗
            </DeepLink>
            <DeepLink
              href={
                PLATFORM_ADMIN_URL
                  ? `${PLATFORM_ADMIN_URL}/audit?resourceType=webhook_endpoint`
                  : null
              }
              external
            >
              Platform audit ↗
            </DeepLink>
            <p style={deepLinkNoteStyle}>
              失敗投遞的下游處置可開新分頁深連結至 ops-console /
              platform-admin；未設定 NEXT_PUBLIC_OPS_CONSOLE_URL /
              NEXT_PUBLIC_PLATFORM_ADMIN_URL 時保留 affordance 但不導向（packet
              §5.10 — 僅 degenerate case 才跨 app）。
            </p>
          </div>
        </CanvasCard>
      </div>
    </div>
  );
}
