import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { CSSProperties, ReactNode } from "react";
import type {
  CreateTenantWebhookEndpointCommand,
  IdentityContext,
  NotificationRecord,
  ResourceActionDescriptor,
  TenantIntegrationGovernancePackage,
  TenantWebhookEndpoint,
  TenantWebhookEndpointStatus,
  UpdateTenantWebhookEndpointCommand,
  WebhookDeliveryRecord,
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
import {
  API_URL,
  DEMO_ACTOR_ID,
  DEMO_TENANT_ID,
  getTenantClient,
} from "@/lib/api-client";

export const dynamic = "force-dynamic";

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

const REFRESH_TIER_LABEL = "T5 Tenant slow · 30s";
const OPS_CONSOLE_URL = process.env.NEXT_PUBLIC_OPS_CONSOLE_URL ?? null;
const PLATFORM_ADMIN_URL = process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL ?? null;

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const threeColumnStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 16,
};

const twoColumnStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.7fr) minmax(320px, 1fr)",
  gap: 16,
};

const stackStyle: CSSProperties = {
  display: "grid",
  gap: 12,
};

const metricGridStyle: CSSProperties = {
  display: "grid",
  gap: 14,
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
};

const metricCardStyle: CSSProperties = {
  padding: 14,
  borderRadius: 10,
  border: `1px solid ${th.border}`,
  background: "rgba(12, 20, 33, 0.6)",
  display: "grid",
  gap: 6,
};

const metricLabelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: th.textMuted,
};

const metricValueStyle: CSSProperties = {
  fontSize: 28,
  fontWeight: 700,
  color: th.text,
  lineHeight: 1,
};

const mutedStyle: CSSProperties = {
  margin: 0,
  color: th.textMuted,
  fontSize: 12,
  lineHeight: 1.5,
};

const subtleTextStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 11.5,
  lineHeight: 1.5,
};

const monoStyle: CSSProperties = {
  fontFamily: th.monoFamily,
};

const codeLabelStyle: CSSProperties = {
  ...monoStyle,
  fontSize: 11.5,
  color: th.textMuted,
};

const primaryLinkStyle: CSSProperties = {
  color: th.text,
  textDecoration: "none",
  fontWeight: 600,
};

const secondaryLinkStyle: CSSProperties = {
  color: th.textMuted,
  textDecoration: "none",
  fontSize: 12,
};

const chipWrapStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const buttonWrapStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const panelStyle: CSSProperties = {
  padding: 14,
  borderRadius: 10,
  border: `1px solid ${th.border}`,
  background: "rgba(12, 20, 33, 0.55)",
  display: "grid",
  gap: 10,
};

const listStyle: CSSProperties = {
  margin: 0,
  paddingLeft: 18,
  color: th.textMuted,
  fontSize: 12,
  lineHeight: 1.6,
};

const formGridStyle: CSSProperties = {
  display: "grid",
  gap: 14,
};

const fieldRowStyle: CSSProperties = {
  display: "grid",
  gap: 14,
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
};

const detailLineStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  padding: "6px 0",
  borderBottom: `1px solid ${th.border}`,
  fontSize: 12,
  color: th.textMuted,
};

const textareaStyle: CSSProperties = {
  width: "100%",
  minHeight: 92,
  borderRadius: 8,
  border: `1px solid ${th.border}`,
  background: th.bg,
  color: th.text,
  padding: "10px 12px",
  resize: "vertical",
  fontSize: 12.5,
  fontFamily: th.fontFamily,
};

const controlStyle: CSSProperties = {
  width: "100%",
  minHeight: 36,
  borderRadius: 8,
  border: `1px solid ${th.border}`,
  background: th.bg,
  color: th.text,
  padding: "8px 10px",
  fontSize: 12.5,
  fontFamily: th.fontFamily,
};

function getLinkButtonStyle(options?: {
  primary?: boolean;
  danger?: boolean;
  size?: "sm" | "md";
}): CSSProperties {
  const size = options?.size ?? "sm";
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: size === "md" ? 34 : 28,
    padding: size === "md" ? "8px 14px" : "5px 10px",
    borderRadius: 7,
    border: `1px solid ${
      options?.danger ? th.danger : options?.primary ? th.accent : th.border
    }`,
    background: options?.danger
      ? th.danger
      : options?.primary
        ? th.accent
        : th.surface,
    color: options?.danger || options?.primary ? "#fff" : th.text,
    textDecoration: "none",
    fontSize: size === "md" ? 13 : 12,
    fontWeight: 500,
    lineHeight: 1,
    fontFamily: th.fontFamily,
  };
}

const checkboxWrapStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 10,
};

const checkboxCardStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "10px 12px",
  borderRadius: 8,
  border: `1px solid ${th.border}`,
  background: "rgba(255,255,255,0.02)",
  color: th.text,
  fontSize: 12,
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

type EmptyReason =
  | "no_data"
  | "not_provisioned"
  | "fetch_failed"
  | "permission_denied"
  | "external_unavailable"
  | "filtered_empty";

type ViewMode = "overview" | "create" | "edit" | "rotate";

type ActionDescriptor = {
  action: string;
  label: string;
  riskLevel: "low" | "medium" | "high";
  enabled: boolean;
  requiresReason?: boolean;
  disabledReasonCode?: string;
  tone?: CanvasTone;
  href?: string;
};

type EndpointRow = Record<string, unknown> & {
  webhookId: string;
  url: string;
  events: string[];
  statusLabel: string;
  statusTone: CanvasTone;
  secretLabel: string;
  healthLabel: string;
  healthTone: CanvasTone;
  lastActivity: string;
};

type DeliveryRow = Record<string, unknown> & {
  deliveryId: string;
  webhookId: string;
  eventType: string;
  statusLabel: string;
  statusTone: CanvasTone;
  codeLabel: string;
  codeTone: CanvasTone;
  tries: number;
  at: string;
  signature: string;
};

type EmptyStateCopy = {
  title: string;
  body: string;
  tone: "info" | "success" | "danger" | "accent" | "warn";
  cta?: {
    href: string;
    label: string;
  };
};

type WebhooksPageData = {
  identity: IdentityContext | null;
  governance: TenantIntegrationGovernancePackage | null;
  notifications: NotificationRecord[];
  endpoints: TenantWebhookEndpoint[];
  deliveries: WebhookDeliveryRecord[];
  endpointError: string | null;
  deliveryError: string | null;
  governanceError: string | null;
  identityError: string | null;
  notificationsError: string | null;
  loadedAt: string;
};

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

  return relativeTimeFormatter.format(Math.round(diffSeconds / 86400), "day");
}

function getSearchParam(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function compareWebhookStatus(
  left: TenantWebhookEndpointStatus,
  right: TenantWebhookEndpointStatus,
) {
  const rank = {
    active: 0,
    test_pending: 1,
    disabled: 2,
  } as const;
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

function getEndpointStatusTone(
  status: TenantWebhookEndpointStatus,
): CanvasTone {
  if (status === "active") return "success";
  if (status === "test_pending") return "accent";
  return "warn";
}

function getEndpointStatusLabel(status: TenantWebhookEndpointStatus) {
  if (status === "active") return "active";
  if (status === "test_pending") return "test_pending";
  return "disabled";
}

function getEndpointLastActivity(endpoint: TenantWebhookEndpoint) {
  const metadata = endpoint.runtimeMetadata;
  if (endpoint.status === "active" && metadata?.lastDeliveredAt) {
    return `Delivered ${formatRelativeTime(metadata.lastDeliveredAt)}`;
  }
  if (metadata?.lastAttemptAt) {
    return `Attempt ${formatRelativeTime(metadata.lastAttemptAt)}`;
  }
  if (endpoint.status === "disabled" && metadata?.disabledAt) {
    return `Disabled ${formatRelativeTime(metadata.disabledAt)}`;
  }
  return formatDateTime(endpoint.updatedAt);
}

function getEndpointHealth(endpoint: TenantWebhookEndpoint) {
  const runtime = endpoint.runtimeMetadata;
  const failures = runtime?.failedDeliveryCount ?? 0;
  const deliveries = runtime?.deliveryCount ?? 0;

  if (endpoint.status === "disabled") {
    return {
      label:
        runtime?.disableReason === "delivery_failed"
          ? "disabled after failure cluster"
          : "manually paused",
      tone: "warn" as CanvasTone,
    };
  }

  if (endpoint.status === "test_pending") {
    return {
      label: "awaiting validation traffic",
      tone: "accent" as CanvasTone,
    };
  }

  if (failures > 0) {
    return {
      label: `${failures} failed / ${deliveries} deliveries`,
      tone: "danger" as CanvasTone,
    };
  }

  return {
    label: deliveries > 0 ? `${deliveries} deliveries · healthy` : "healthy",
    tone: "success" as CanvasTone,
  };
}

function toEndpointRow(endpoint: TenantWebhookEndpoint): EndpointRow {
  const health = getEndpointHealth(endpoint);
  return {
    webhookId: endpoint.webhookId,
    url: endpoint.url,
    events: endpoint.events,
    statusLabel: getEndpointStatusLabel(endpoint.status),
    statusTone: getEndpointStatusTone(endpoint.status),
    secretLabel: `v${endpoint.secretVersion} · ${endpoint.secretPreview}`,
    healthLabel: health.label,
    healthTone: health.tone,
    lastActivity: getEndpointLastActivity(endpoint),
  };
}

function getDeliveryCodeTone(code: number | null): CanvasTone {
  if (code === null) return "neutral";
  if (code >= 200 && code < 300) return "success";
  if (code >= 300 && code < 500) return "warn";
  return "danger";
}

function getDeliveryStatusTone(status: WebhookDeliveryRecord["status"]) {
  if (status === "delivered") return "success";
  if (status === "queued") return "accent";
  return "danger";
}

function toDeliveryRow(delivery: WebhookDeliveryRecord): DeliveryRow {
  return {
    deliveryId: delivery.deliveryId,
    webhookId: delivery.webhookId,
    eventType: delivery.eventType,
    statusLabel:
      delivery.status === "delivery_failed" ? "failed" : delivery.status,
    statusTone: getDeliveryStatusTone(delivery.status),
    codeLabel:
      delivery.httpStatus === null ? "timeout" : String(delivery.httpStatus),
    codeTone: getDeliveryCodeTone(delivery.httpStatus),
    tries: delivery.attempt,
    at: formatDateTime(delivery.createdAt),
    signature: delivery.signature,
  };
}

function summarizeDeliveries(deliveries: WebhookDeliveryRecord[]) {
  return deliveries.reduce(
    (summary, delivery) => {
      summary.total += 1;
      if (delivery.status === "delivered") summary.delivered += 1;
      else if (delivery.status === "queued") summary.queued += 1;
      else summary.failed += 1;
      return summary;
    },
    { total: 0, delivered: 0, queued: 0, failed: 0 },
  );
}

function countFailureClusters(endpoints: TenantWebhookEndpoint[]) {
  return endpoints.filter(
    (endpoint) => (endpoint.runtimeMetadata?.failedDeliveryCount ?? 0) > 0,
  ).length;
}

function detectEmptyReason(
  errorMessage: string | null,
  filtered: boolean,
  hasData: boolean,
): EmptyReason | null {
  if (hasData) return null;
  if (errorMessage) {
    const message = errorMessage.toLowerCase();
    if (
      message.includes("403") ||
      message.includes("401") ||
      message.includes("permission")
    ) {
      return "permission_denied";
    }
    if (
      message.includes("404") ||
      message.includes("not_provisioned") ||
      message.includes("engine_not_provisioned")
    ) {
      return "not_provisioned";
    }
    if (
      message.includes("502") ||
      message.includes("503") ||
      message.includes("504") ||
      message.includes("unavailable") ||
      message.includes("timeout")
    ) {
      return "external_unavailable";
    }
    return "fetch_failed";
  }
  return filtered ? "filtered_empty" : "no_data";
}

function getEmptyStateCopy(
  reason: EmptyReason,
  hrefBase: string,
): EmptyStateCopy {
  switch (reason) {
    case "not_provisioned":
      return {
        title: "Webhook engine 尚未開通",
        body: "此租戶目前沒有啟用 delivery engine。依 Q-TEN08，畫面不會回填任何假 delivery log；請先完成平台側開通，再建立 endpoint。",
        tone: "warn",
        cta: {
          href: `${hrefBase}?mode=create`,
          label: "查看建立流程",
        },
      };
    case "permission_denied":
      return {
        title: "目前身分沒有 webhook 權限",
        body: "後端拒絕回傳此區塊資料。請改用具 `tc_admin` 或 `tc_integration_mgr` 權限的身分，或請平台/租戶管理員協助。",
        tone: "danger",
      };
    case "external_unavailable":
      return {
        title: "Delivery engine 暫時不可用",
        body: "後端或外部目的端暫時不可用，因此無法取得 webhook 可視資料。保留目前查詢條件，稍後手動 refresh 再試。",
        tone: "warn",
      };
    case "fetch_failed":
      return {
        title: "資料抓取失敗",
        body: "請檢查 API 可用性與目前環境 headers。這不是無資料狀態，而是 read model 讀取失敗。",
        tone: "danger",
      };
    case "filtered_empty":
      return {
        title: "目前篩選條件下沒有結果",
        body: "資料源仍可用，但現有 `status` 或 endpoint 篩選沒有命中任何項目。清除篩選即可回到完整檢視。",
        tone: "info",
        cta: {
          href: hrefBase,
          label: "清除篩選",
        },
      };
    case "no_data":
    default:
      return {
        title: "尚未建立任何 endpoint",
        body: "目前沒有 webhook endpoint，因此也不會有 delivery log。先建立第一個 endpoint，系統才會開始產生真實 delivery visibility。",
        tone: "info",
        cta: {
          href: `${hrefBase}?mode=create`,
          label: "新增 endpoint",
        },
      };
  }
}

function deriveActorCanManage(identity: IdentityContext | null) {
  if (!identity) return true;
  if (identity.actorType === "tenant_admin") return true;
  return identity.roles.some(
    (role) => role === "tc_admin" || role === "tc_integration_mgr",
  );
}

function getActionLabel(action: string) {
  switch (action) {
    case "payload_schema":
      return "payload schema";
    case "createWebhookEndpoint":
      return "新增端點";
    case "updateWebhookEndpoint":
      return "更新";
    case "disableWebhookEndpoint":
      return "停用";
    case "deleteWebhookEndpoint":
      return "刪除";
    case "rotateWebhookSecret":
      return "rotate secret";
    case "viewDeliveryLog":
      return "delivery log";
    case "retryFailedDelivery":
      return "retry failed";
    default:
      return action;
  }
}

function getActionTone(action: string): CanvasTone | undefined {
  switch (action) {
    case "createWebhookEndpoint":
      return "accent";
    case "disableWebhookEndpoint":
      return "warn";
    case "deleteWebhookEndpoint":
      return "danger";
    default:
      return undefined;
  }
}

function getActionHref(
  action: string,
  options?: {
    webhookId?: string;
    deliveryId?: string;
    status?: string;
  },
) {
  const webhookId = options?.webhookId;
  const deliveryId = options?.deliveryId;
  const status =
    options?.status && options.status !== "all"
      ? `&status=${encodeURIComponent(options.status)}`
      : "";

  switch (action) {
    case "payload_schema":
      return "/settings";
    case "createWebhookEndpoint":
      return "/webhooks?mode=create";
    case "updateWebhookEndpoint":
    case "disableWebhookEndpoint":
      return webhookId
        ? `/webhooks?mode=edit&webhookId=${encodeURIComponent(webhookId)}${status}`
        : undefined;
    case "deleteWebhookEndpoint":
      return webhookId
        ? `/webhooks?mode=edit&webhookId=${encodeURIComponent(webhookId)}${status}#high-risk`
        : undefined;
    case "rotateWebhookSecret":
      return webhookId
        ? `/webhooks?mode=rotate&webhookId=${encodeURIComponent(webhookId)}${status}`
        : undefined;
    case "viewDeliveryLog":
      if (!webhookId) {
        return undefined;
      }
      return deliveryId
        ? `/webhooks?webhookId=${encodeURIComponent(webhookId)}&deliveryId=${encodeURIComponent(deliveryId)}${status}`
        : `/webhooks?webhookId=${encodeURIComponent(webhookId)}${status}`;
    default:
      return undefined;
  }
}

function decorateActions(
  descriptors: ResourceActionDescriptor[],
  options?: {
    webhookId?: string;
    deliveryId?: string;
    status?: string;
  },
): ActionDescriptor[] {
  return descriptors.map((descriptor) => {
    const tone = getActionTone(descriptor.action);
    const href = getActionHref(descriptor.action, options);

    return {
      action: descriptor.action,
      label: getActionLabel(descriptor.action),
      riskLevel: descriptor.riskLevel,
      enabled: descriptor.enabled,
      ...(descriptor.requiresReason !== undefined
        ? { requiresReason: descriptor.requiresReason }
        : {}),
      ...(descriptor.disabledReasonCode
        ? { disabledReasonCode: descriptor.disabledReasonCode }
        : {}),
      ...(tone ? { tone } : {}),
      ...(href ? { href } : {}),
    };
  });
}

function derivePageActions(
  governanceActions: ResourceActionDescriptor[] | undefined,
  canManage: boolean,
  endpointReason: EmptyReason | null,
): ActionDescriptor[] {
  const fallbackActions: ResourceActionDescriptor[] = [
    {
      action: "payload_schema",
      enabled: true,
      riskLevel: "low",
    },
    {
      action: "createWebhookEndpoint",
      enabled: canManage,
      ...(!canManage ? { disabledReasonCode: "tenant_role_missing" } : {}),
      riskLevel: "medium",
    },
  ];

  return decorateActions(governanceActions ?? fallbackActions).map((action) =>
    action.action === "createWebhookEndpoint" &&
    endpointReason === "not_provisioned"
      ? {
          ...action,
          enabled: false,
          disabledReasonCode: "engine_not_provisioned",
        }
      : action,
  );
}

function getEndpointActions(
  endpoint: TenantWebhookEndpoint,
  canManage: boolean,
  statusFilter = "all",
): ActionDescriptor[] {
  const fallbackActions: ResourceActionDescriptor[] = [
    {
      action: "updateWebhookEndpoint",
      enabled: canManage,
      ...(!canManage ? { disabledReasonCode: "tenant_role_missing" } : {}),
      riskLevel: "medium",
    },
    {
      action: "disableWebhookEndpoint",
      enabled: canManage && endpoint.status !== "disabled",
      ...((endpoint.status === "disabled"
        ? "already_disabled"
        : canManage
          ? null
          : "tenant_role_missing") !== null
        ? {
            disabledReasonCode:
              endpoint.status === "disabled"
                ? "already_disabled"
                : "tenant_role_missing",
          }
        : {}),
      requiresReason: true,
      riskLevel: "high",
    },
    {
      action: "deleteWebhookEndpoint",
      enabled: canManage,
      ...(!canManage ? { disabledReasonCode: "tenant_role_missing" } : {}),
      requiresReason: true,
      riskLevel: "high",
    },
    {
      action: "rotateWebhookSecret",
      enabled: canManage,
      ...(!canManage ? { disabledReasonCode: "tenant_role_missing" } : {}),
      requiresReason: true,
      riskLevel: "high",
    },
    {
      action: "viewDeliveryLog",
      enabled: true,
      riskLevel: "low",
    },
    {
      action: "retryFailedDelivery",
      enabled: false,
      disabledReasonCode: "backend_retry_endpoint_pending",
      riskLevel: "medium",
    },
  ];

  return decorateActions(endpoint.availableActions ?? fallbackActions, {
    webhookId: endpoint.webhookId,
    status: statusFilter,
  }).map((action) =>
    action.action === "disableWebhookEndpoint" && endpoint.status === "disabled"
      ? { ...action, label: "已停用" }
      : action,
  );
}

function getDeliveryActions(
  delivery: WebhookDeliveryRecord,
  canManage: boolean,
  statusFilter = "all",
): ActionDescriptor[] {
  const fallbackActions: ResourceActionDescriptor[] = [
    {
      action: "viewDeliveryLog",
      enabled: true,
      riskLevel: "low",
    },
    {
      action: "retryFailedDelivery",
      enabled: false,
      disabledReasonCode:
        delivery.status === "delivery_failed"
          ? canManage
            ? "backend_retry_endpoint_pending"
            : "tenant_role_missing"
          : "delivery_not_failed",
      riskLevel: "medium",
    },
  ];

  return decorateActions(delivery.availableActions ?? fallbackActions, {
    webhookId: delivery.webhookId,
    deliveryId: delivery.deliveryId,
    status: statusFilter,
  });
}

function renderAction(
  descriptor: ActionDescriptor,
  key: string,
  small = true,
): ReactNode {
  const size = small ? "sm" : "md";
  if (descriptor.enabled && descriptor.href) {
    return (
      <Link
        key={key}
        href={descriptor.href}
        style={getLinkButtonStyle({
          primary: descriptor.tone === "accent",
          danger: descriptor.tone === "danger",
          size,
        })}
      >
        {descriptor.label}
      </Link>
    );
  }

  return (
    <div key={key} style={{ display: "grid", gap: 4 }}>
      <CanvasBtn
        theme={th}
        size={size}
        variant={descriptor.tone === "accent" ? "primary" : "secondary"}
        danger={descriptor.tone === "danger"}
        disabled
      >
        {descriptor.label}
      </CanvasBtn>
      {descriptor.disabledReasonCode ? (
        <span style={subtleTextStyle}>{descriptor.disabledReasonCode}</span>
      ) : null}
    </div>
  );
}

function buildExternalLink(
  baseUrl: string | null,
  route: string,
  label: string,
  description: string,
) {
  return {
    label,
    description,
    href: baseUrl ? `${baseUrl}${route}` : null,
  };
}

async function loadWebhooksPageData(): Promise<WebhooksPageData> {
  const client = getTenantClient();
  const [
    identityResult,
    governanceResult,
    endpointsResult,
    deliveriesResult,
    notificationsResult,
  ] = await Promise.allSettled([
    client.getIdentityContext() as Promise<IdentityContext>,
    client.getTenantIntegrationGovernancePackage() as Promise<TenantIntegrationGovernancePackage>,
    client.listWebhooks() as Promise<TenantWebhookEndpoint[]>,
    client.get<{ items: WebhookDeliveryRecord[] }>(
      "/api/tenant/webhooks/deliveries",
    ) as Promise<{
      items: WebhookDeliveryRecord[];
    }>,
    client.listTenantNotificationFeed() as Promise<NotificationRecord[]>,
  ]);

  return {
    identity:
      identityResult.status === "fulfilled" ? identityResult.value : null,
    governance:
      governanceResult.status === "fulfilled" ? governanceResult.value : null,
    notifications:
      notificationsResult.status === "fulfilled"
        ? notificationsResult.value
        : [],
    endpoints:
      endpointsResult.status === "fulfilled"
        ? [...endpointsResult.value].sort(compareEndpoints)
        : [],
    deliveries:
      deliveriesResult.status === "fulfilled"
        ? [...deliveriesResult.value.items].sort(compareDeliveries)
        : [],
    endpointError:
      endpointsResult.status === "rejected"
        ? toErrorMessage(endpointsResult.reason)
        : null,
    deliveryError:
      deliveriesResult.status === "rejected"
        ? toErrorMessage(deliveriesResult.reason)
        : null,
    governanceError:
      governanceResult.status === "rejected"
        ? toErrorMessage(governanceResult.reason)
        : null,
    identityError:
      identityResult.status === "rejected"
        ? toErrorMessage(identityResult.reason)
        : null,
    notificationsError:
      notificationsResult.status === "rejected"
        ? toErrorMessage(notificationsResult.reason)
        : null,
    loadedAt: new Date().toISOString(),
  };
}

function EventChecklist({
  baselineEvents,
  selectedEvents,
}: {
  baselineEvents: string[];
  selectedEvents?: string[];
}) {
  const selected = new Set(selectedEvents ?? []);

  if (baselineEvents.length === 0) {
    return (
      <CanvasField theme={th} label="EVENTS">
        <input
          name="extraEvents"
          defaultValue={(selectedEvents ?? []).join(", ")}
          placeholder="booking.created, invoice.ready"
          style={controlStyle}
        />
      </CanvasField>
    );
  }

  return (
    <CanvasField
      theme={th}
      label="BASELINE EVENTS"
      hint="治理套件提供的 baseline webhook events。可同時勾選多個。"
    >
      <div style={checkboxWrapStyle}>
        {baselineEvents.map((eventType) => (
          <label key={eventType} style={checkboxCardStyle}>
            <input
              type="checkbox"
              name="events"
              value={eventType}
              defaultChecked={selected.has(eventType)}
            />
            <span style={monoStyle}>{eventType}</span>
          </label>
        ))}
      </div>
    </CanvasField>
  );
}

function parseEvents(formData: FormData) {
  const baselineEvents = formData
    .getAll("events")
    .map((value) => String(value).trim())
    .filter(Boolean);
  const extraEvents = String(formData.get("extraEvents") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return [...new Set([...baselineEvents, ...extraEvents])];
}

async function rotateWebhookSecretRequest(
  webhookId: string,
  body: {
    secret: string;
    rotationReason?: string;
  },
) {
  const response = await fetch(
    `${API_URL}/api/tenant/webhooks/${encodeURIComponent(webhookId)}/rotate-secret`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-actor-type": "tenant_admin",
        "x-actor-id": DEMO_ACTOR_ID,
        "x-realm": "tenant",
        "x-tenant-id": DEMO_TENANT_ID,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(`API error ${response.status}: ${await response.text()}`);
  }

  return response.json();
}

async function createWebhookAction(formData: FormData) {
  "use server";

  const client = getTenantClient();
  const events = parseEvents(formData);
  try {
    if (events.length === 0) {
      throw new Error("請至少選擇一個 event。");
    }

    const command: CreateTenantWebhookEndpointCommand = {
      url: String(formData.get("url") ?? "").trim(),
      secret: String(formData.get("secret") ?? "").trim(),
      events,
    };

    if (!command.url || !command.secret) {
      throw new Error("Webhook URL 與 secret 為必填。");
    }

    await client.createWebhookEndpoint(command);
    revalidatePath("/webhooks");
    redirect(
      `/webhooks?success=${encodeURIComponent(
        "Endpoint 已建立，狀態為 test_pending。",
      )}`,
    );
  } catch (error) {
    redirect(
      `/webhooks?mode=create&error=${encodeURIComponent(toErrorMessage(error))}`,
    );
  }
}

async function updateWebhookAction(formData: FormData) {
  "use server";

  const client = getTenantClient();
  const webhookId = String(formData.get("webhookId") ?? "");
  const disableReason = String(formData.get("disableReason") ?? "").trim();
  const events = parseEvents(formData);
  try {
    if (!webhookId) {
      throw new Error("缺少 webhookId。");
    }

    const command: UpdateTenantWebhookEndpointCommand = {
      url: String(formData.get("url") ?? "").trim(),
      events,
      status: String(
        formData.get("status") ?? "",
      ) as TenantWebhookEndpointStatus,
    };

    if (!command.url || !command.status || events.length === 0) {
      throw new Error("URL、status 與至少一個 event 為必填。");
    }
    if (command.status === "disabled" && !disableReason) {
      throw new Error("停用 endpoint 時必須填寫 reason。");
    }

    await client.updateWebhookEndpoint(webhookId, command);
    revalidatePath("/webhooks");
    redirect(
      `/webhooks?webhookId=${encodeURIComponent(webhookId)}&success=${encodeURIComponent(
        "Endpoint 已更新。",
      )}`,
    );
  } catch (error) {
    redirect(
      `/webhooks?mode=edit&webhookId=${encodeURIComponent(webhookId)}&error=${encodeURIComponent(
        toErrorMessage(error),
      )}`,
    );
  }
}

async function deleteWebhookAction(formData: FormData) {
  "use server";

  const client = getTenantClient();
  const webhookId = String(formData.get("webhookId") ?? "");
  const deleteReason = String(formData.get("deleteReason") ?? "").trim();
  try {
    if (!webhookId) {
      throw new Error("缺少 webhookId。");
    }
    if (!deleteReason) {
      throw new Error("刪除 endpoint 時必須填寫 reason。");
    }
    await client.deleteWebhookEndpoint(webhookId);
    revalidatePath("/webhooks");
    redirect(`/webhooks?success=${encodeURIComponent("Endpoint 已刪除。")}`);
  } catch (error) {
    redirect(
      `/webhooks?mode=edit&webhookId=${encodeURIComponent(webhookId)}&error=${encodeURIComponent(
        toErrorMessage(error),
      )}`,
    );
  }
}

async function rotateWebhookSecretAction(formData: FormData) {
  "use server";

  const webhookId = String(formData.get("webhookId") ?? "");
  const secret = String(formData.get("secret") ?? "").trim();
  const rotationReason = String(formData.get("rotationReason") ?? "").trim();

  try {
    if (!webhookId || !secret) {
      throw new Error("webhookId 與新 secret 為必填。");
    }

    await rotateWebhookSecretRequest(webhookId, {
      secret,
      ...(rotationReason ? { rotationReason } : {}),
    });
    revalidatePath("/webhooks");
    redirect(
      `/webhooks?webhookId=${encodeURIComponent(webhookId)}&success=${encodeURIComponent(
        "Secret 已旋轉。依治理規則，endpoint 會重新進入 test_pending。",
      )}`,
    );
  } catch (error) {
    redirect(
      `/webhooks?mode=rotate&webhookId=${encodeURIComponent(webhookId)}&error=${encodeURIComponent(
        toErrorMessage(error),
      )}`,
    );
  }
}

function EndpointForm({
  mode,
  webhook,
  baselineEvents,
}: {
  mode: ViewMode;
  webhook?: TenantWebhookEndpoint | null;
  baselineEvents: string[];
}) {
  const isCreate = mode === "create";

  return (
    <CanvasCard
      theme={th}
      title={isCreate ? "Create endpoint" : "Update endpoint"}
      subtitle={
        isCreate
          ? "Create / update 屬於 medium action；新 endpoint 一律進入 test_pending。"
          : "Disable / delete 是 high-risk 操作。UI 會強制填寫 reason 後才送出既有 backend contract。"
      }
    >
      <form
        action={isCreate ? createWebhookAction : updateWebhookAction}
        style={formGridStyle}
      >
        {!isCreate && webhook ? (
          <input type="hidden" name="webhookId" value={webhook.webhookId} />
        ) : null}
        <div style={fieldRowStyle}>
          <CanvasField theme={th} label="WEBHOOK URL">
            <input
              name="url"
              defaultValue={webhook?.url ?? ""}
              placeholder="https://partner.example.com/drts/webhooks"
              style={controlStyle}
            />
          </CanvasField>
          {isCreate ? (
            <CanvasField
              theme={th}
              label="INITIAL SECRET"
              hint="Secret 會以 masked preview 存回 read model。"
            >
              <input
                name="secret"
                placeholder="whsec_..."
                style={controlStyle}
              />
            </CanvasField>
          ) : (
            <CanvasField
              theme={th}
              label="STATUS"
              hint="變更 URL / events / active state 都會觸發 validation 流程。"
            >
              <select
                name="status"
                defaultValue={webhook?.status ?? "test_pending"}
                style={controlStyle}
              >
                <option value="active">active</option>
                <option value="test_pending">test_pending</option>
                <option value="disabled">disabled</option>
              </select>
            </CanvasField>
          )}
        </div>
        <EventChecklist
          baselineEvents={baselineEvents}
          {...(webhook?.events ? { selectedEvents: webhook.events } : {})}
        />
        {baselineEvents.length > 0 ? (
          <CanvasField theme={th} label="ADDITIONAL EVENTS">
            <input
              name="extraEvents"
              defaultValue={(webhook?.events ?? [])
                .filter((eventType) => !baselineEvents.includes(eventType))
                .join(", ")}
              placeholder="Comma-separated extra events"
              style={controlStyle}
            />
          </CanvasField>
        ) : null}
        {!isCreate ? (
          <CanvasField
            theme={th}
            label="DISABLE REASON"
            hint="當 status 改為 disabled 時必填；符合 packet 的 high-risk reason gate。"
          >
            <textarea
              name="disableReason"
              style={textareaStyle}
              placeholder="Receiver maintenance window, repeated failure cluster, security hold, etc."
            />
          </CanvasField>
        ) : null}
        <div style={buttonWrapStyle}>
          <button
            type="submit"
            style={{
              ...getLinkButtonStyle({ primary: true, size: "md" }),
              cursor: "pointer",
            }}
          >
            {isCreate ? "建立 endpoint" : "儲存變更"}
          </button>
          <Link href="/webhooks" style={getLinkButtonStyle({ size: "md" })}>
            取消
          </Link>
        </div>
      </form>
      {!isCreate && webhook ? (
        <div style={{ ...stackStyle, marginTop: 12 }}>
          <div id="high-risk" style={panelStyle}>
            <div style={{ color: th.text, fontWeight: 600 }}>
              High-risk actions
            </div>
            <p style={mutedStyle}>
              Delete 與 disable 依 packet 屬 high action；delete 送出前必須填
              reason， disable 則透過上方欄位 gate 住提交。
            </p>
            <div style={buttonWrapStyle}>
              <form
                action={deleteWebhookAction}
                style={{ display: "grid", gap: 8 }}
              >
                <input
                  type="hidden"
                  name="webhookId"
                  value={webhook.webhookId}
                />
                <textarea
                  name="deleteReason"
                  style={{ ...textareaStyle, minHeight: 72 }}
                  placeholder="Decommissioned integration, duplicate endpoint, security incident, etc."
                />
                <button
                  type="submit"
                  style={{
                    ...getLinkButtonStyle({ danger: true }),
                    cursor: "pointer",
                  }}
                >
                  刪除 endpoint
                </button>
              </form>
              <Link
                href={`/webhooks?mode=rotate&webhookId=${encodeURIComponent(webhook.webhookId)}`}
                style={getLinkButtonStyle()}
              >
                rotate secret
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </CanvasCard>
  );
}

function RotateSecretForm({ webhook }: { webhook: TenantWebhookEndpoint }) {
  return (
    <CanvasCard
      theme={th}
      title="Rotate webhook secret"
      subtitle="High-risk action。依 packet，secret rotation 後 endpoint 需要重新驗證。"
    >
      <form action={rotateWebhookSecretAction} style={formGridStyle}>
        <input type="hidden" name="webhookId" value={webhook.webhookId} />
        <div style={fieldRowStyle}>
          <CanvasField theme={th} label="ENDPOINT">
            <input value={webhook.url} readOnly style={controlStyle} />
          </CanvasField>
          <CanvasField theme={th} label="CURRENT PREVIEW">
            <input
              value={webhook.secretPreview}
              readOnly
              style={{ ...controlStyle, fontFamily: th.monoFamily }}
            />
          </CanvasField>
        </div>
        <CanvasField theme={th} label="NEW SECRET">
          <input
            name="secret"
            placeholder="whsec_new..."
            style={controlStyle}
          />
        </CanvasField>
        <CanvasField
          theme={th}
          label="ROTATION REASON"
          hint="Backend route 支援 rotationReason；這裡保留高風險操作的審計上下文。"
        >
          <textarea
            name="rotationReason"
            style={textareaStyle}
            placeholder="Compromised receiver key, planned credential rotation, etc."
          />
        </CanvasField>
        <div style={buttonWrapStyle}>
          <button
            type="submit"
            style={{
              ...getLinkButtonStyle({ primary: true, size: "md" }),
              cursor: "pointer",
            }}
          >
            旋轉 secret
          </button>
          <Link href="/webhooks" style={getLinkButtonStyle({ size: "md" })}>
            取消
          </Link>
        </div>
      </form>
    </CanvasCard>
  );
}

export default async function WebhooksPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const mode =
    (getSearchParam(resolvedSearchParams.mode) as ViewMode | undefined) ??
    "overview";
  const statusFilter = getSearchParam(resolvedSearchParams.status) ?? "all";
  const selectedWebhookId = getSearchParam(resolvedSearchParams.webhookId);
  const selectedDeliveryId = getSearchParam(resolvedSearchParams.deliveryId);
  const success = getSearchParam(resolvedSearchParams.success);
  const error = getSearchParam(resolvedSearchParams.error);

  const data = await loadWebhooksPageData();
  const canManage = deriveActorCanManage(data.identity);
  const baselineEvents = data.governance?.baselineWebhookEvents ?? [];
  const filteredEndpoints = data.endpoints.filter((endpoint) =>
    statusFilter === "all" ? true : endpoint.status === statusFilter,
  );
  const scopedDeliveries = data.deliveries.filter((delivery) =>
    selectedWebhookId ? delivery.webhookId === selectedWebhookId : true,
  );
  const endpointReason = detectEmptyReason(
    data.endpointError,
    statusFilter !== "all",
    filteredEndpoints.length > 0,
  );
  const deliveryReason = detectEmptyReason(
    data.deliveryError,
    Boolean(selectedWebhookId),
    scopedDeliveries.length > 0,
  );
  const selectedWebhook =
    (selectedWebhookId
      ? data.endpoints.find(
          (endpoint) => endpoint.webhookId === selectedWebhookId,
        )
      : undefined) ?? null;
  const selectedDelivery =
    (selectedDeliveryId
      ? scopedDeliveries.find(
          (delivery) => delivery.deliveryId === selectedDeliveryId,
        )
      : undefined) ?? null;
  const summary = summarizeDeliveries(scopedDeliveries);
  const pageActions = derivePageActions(
    data.governance?.availableActions,
    canManage,
    endpointReason,
  );
  const notifications = data.notifications
    .filter((notification) => {
      const haystack =
        `${notification.title} ${notification.message}`.toLowerCase();
      return haystack.includes("webhook") || haystack.includes("delivery");
    })
    .slice(0, 4);
  const externalLinks = [
    buildExternalLink(
      OPS_CONSOLE_URL,
      "/incidents?event=tenant.webhook.delivery_failed",
      "Open ops triage",
      "Cross-app deep link for operational triage when delivery failures need downstream intervention.",
    ),
    buildExternalLink(
      PLATFORM_ADMIN_URL,
      "/audit?resourceType=webhook_endpoint",
      "View platform audit",
      "Cross-app audit trail for secret rotation, endpoint lifecycle, and integration governance events.",
    ),
  ];

  const endpointColumns: CanvasTableColumn<EndpointRow>[] = [
    {
      h: "URL",
      k: "url",
      mono: true,
      r: (row) => (
        <div style={{ display: "grid", gap: 6 }}>
          <span style={{ ...primaryLinkStyle, ...monoStyle }}>{row.url}</span>
          <span style={codeLabelStyle}>{row.webhookId}</span>
        </div>
      ),
    },
    {
      h: "EVENTS",
      w: 280,
      r: (row) => (
        <div style={chipWrapStyle}>
          {row.events.map((eventType) => (
            <CanvasPill key={eventType} theme={th} tone="info">
              {eventType}
            </CanvasPill>
          ))}
        </div>
      ),
    },
    {
      h: "STATUS",
      w: 120,
      r: (row) => (
        <CanvasPill theme={th} tone={row.statusTone} dot>
          {row.statusLabel}
        </CanvasPill>
      ),
    },
    {
      h: "SECRET",
      k: "secretLabel",
      w: 160,
      mono: true,
    },
    {
      h: "HEALTH",
      w: 190,
      r: (row) => (
        <CanvasPill theme={th} tone={row.healthTone}>
          {row.healthLabel}
        </CanvasPill>
      ),
    },
    {
      h: "LAST",
      k: "lastActivity",
      w: 180,
      mono: true,
    },
    {
      h: "ACTIONS",
      w: 320,
      r: (row) => {
        const endpoint = filteredEndpoints.find(
          (item) => item.webhookId === row.webhookId,
        );
        if (!endpoint) {
          return null;
        }
        return (
          <div style={buttonWrapStyle}>
            {getEndpointActions(endpoint, canManage, statusFilter)
              .filter(
                (action) =>
                  action.action === "viewDeliveryLog" ||
                  action.action === "updateWebhookEndpoint" ||
                  action.action === "rotateWebhookSecret",
              )
              .map((action, index) =>
                renderAction(action, `${row.webhookId}-${index}`),
              )}
          </div>
        );
      },
    },
  ];

  const deliveryColumns: CanvasTableColumn<DeliveryRow>[] = [
    { h: "DLV", k: "deliveryId", w: 110, mono: true },
    { h: "WH", k: "webhookId", w: 100, mono: true },
    { h: "EVENT", k: "eventType", w: 220, mono: true },
    {
      h: "STATUS",
      w: 120,
      r: (row) => (
        <CanvasPill theme={th} tone={row.statusTone}>
          {row.statusLabel}
        </CanvasPill>
      ),
    },
    {
      h: "CODE",
      w: 90,
      align: "right",
      r: (row) => (
        <CanvasPill theme={th} tone={row.codeTone}>
          {row.codeLabel}
        </CanvasPill>
      ),
    },
    { h: "TRIES", k: "tries", w: 72, align: "right", mono: true },
    { h: "AT", k: "at", mono: true },
    {
      h: "ACTIONS",
      w: 190,
      r: (row) => {
        const delivery = scopedDeliveries.find(
          (item) => item.deliveryId === row.deliveryId,
        );
        if (!delivery) {
          return null;
        }
        return (
          <div style={buttonWrapStyle}>
            {getDeliveryActions(delivery, canManage, statusFilter).map(
              (action, index) =>
                renderAction(action, `${row.deliveryId}-${index}`),
            )}
          </div>
        );
      },
    },
  ];

  const globalErrors = [
    data.identityError ? `身分: ${data.identityError}` : null,
    data.governanceError ? `治理: ${data.governanceError}` : null,
    data.notificationsError ? `通知: ${data.notificationsError}` : null,
  ].filter(Boolean) as string[];

  const endpointEmptyCopy = endpointReason
    ? getEmptyStateCopy(endpointReason, "/webhooks")
    : null;
  const deliveryEmptyCopy = deliveryReason
    ? getEmptyStateCopy(deliveryReason, "/webhooks")
    : null;

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="Webhook management"
        subtitle="端點 · 事件訂閱 · 投遞紀錄 · 重試政策 — real engine per Q-TEN08"
        tabs={["Endpoints", "Deliveries"]}
        activeTab={selectedWebhookId ? "Deliveries" : "Endpoints"}
        actions={
          <>
            {pageActions.map((action, index) =>
              renderAction(action, `page-${index}`, false),
            )}
          </>
        }
      />

      <div style={pageBodyStyle}>
        <CanvasCard
          theme={th}
          title="Refresh tier"
          subtitle="Tenant Console `/webhooks` 屬 T5 Tenant slow。依 packet，detail page 提供手動 refresh；stale 狀態由 backend freshness contract 決定，前端不自行猜測。"
          actions={
            <Link href="/webhooks" style={getLinkButtonStyle()}>
              Refresh now
            </Link>
          }
        >
          <div style={metricGridStyle}>
            <div style={metricCardStyle}>
              <span style={metricLabelStyle}>Refresh tier</span>
              <span style={metricValueStyle}>T5</span>
              <p style={mutedStyle}>{REFRESH_TIER_LABEL}</p>
            </div>
            <div style={metricCardStyle}>
              <span style={metricLabelStyle}>Snapshot</span>
              <span style={{ ...metricValueStyle, fontSize: 18 }}>
                {formatDateTime(data.governance?.generatedAt ?? data.loadedAt)}
              </span>
              <p style={mutedStyle}>
                governance.generatedAt / page load timestamp
              </p>
            </div>
            <div style={metricCardStyle}>
              <span style={metricLabelStyle}>Scope</span>
              <span style={{ ...metricValueStyle, fontSize: 18 }}>
                {selectedWebhook ? "single endpoint" : "tenant-wide"}
              </span>
              <p style={mutedStyle}>
                {selectedWebhook
                  ? selectedWebhook.url
                  : "All endpoints + all deliveries"}
              </p>
            </div>
          </div>
        </CanvasCard>

        {success ? (
          <CanvasBanner
            theme={th}
            tone="success"
            icon="check"
            title="Action completed"
            body={success}
          />
        ) : null}

        {error ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title="Action failed"
            body={error}
          />
        ) : null}

        {globalErrors.length > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title="部分 supporting read models 無法載入"
            body={globalErrors.join(" · ")}
          />
        ) : null}

        <div style={threeColumnStyle}>
          <CanvasCard theme={th} title="Endpoint posture">
            <div style={metricGridStyle}>
              <div style={metricCardStyle}>
                <span style={metricLabelStyle}>active</span>
                <span style={metricValueStyle}>
                  {
                    data.endpoints.filter(
                      (endpoint) => endpoint.status === "active",
                    ).length
                  }
                </span>
              </div>
              <div style={metricCardStyle}>
                <span style={metricLabelStyle}>test_pending</span>
                <span style={metricValueStyle}>
                  {
                    data.endpoints.filter(
                      (endpoint) => endpoint.status === "test_pending",
                    ).length
                  }
                </span>
              </div>
              <div style={metricCardStyle}>
                <span style={metricLabelStyle}>failure cluster</span>
                <span style={metricValueStyle}>
                  {countFailureClusters(data.endpoints)}
                </span>
              </div>
            </div>
          </CanvasCard>
          <CanvasCard
            theme={th}
            title="Delivery health"
            subtitle={
              selectedWebhook
                ? "Current endpoint view"
                : "Tenant-wide delivery snapshot"
            }
          >
            <div style={metricGridStyle}>
              <div style={metricCardStyle}>
                <span style={metricLabelStyle}>delivered</span>
                <span style={metricValueStyle}>{summary.delivered}</span>
              </div>
              <div style={metricCardStyle}>
                <span style={metricLabelStyle}>queued</span>
                <span style={metricValueStyle}>{summary.queued}</span>
              </div>
              <div style={metricCardStyle}>
                <span style={metricLabelStyle}>failed</span>
                <span style={metricValueStyle}>{summary.failed}</span>
              </div>
            </div>
          </CanvasCard>
          <CanvasCard
            theme={th}
            title="Governance policy"
            subtitle="Spec 要求顯示 retry / validation policy，而不是發明不存在的 replay engine。"
          >
            <div style={stackStyle}>
              <div style={detailLineStyle}>
                <span>test event</span>
                <span style={monoStyle}>
                  {data.governance?.webhookPolicy.testEventType ?? "—"}
                </span>
              </div>
              <div style={detailLineStyle}>
                <span>retry policy</span>
                <span style={monoStyle}>
                  {data.governance
                    ? `${data.governance.webhookPolicy.retryPolicy.maxAttempts} attempts`
                    : "—"}
                </span>
              </div>
              <div style={detailLineStyle}>
                <span>failure notice</span>
                <span style={monoStyle}>
                  {data.governance?.webhookPolicy
                    .deliveryFailureNotificationChannel ?? "—"}
                </span>
              </div>
            </div>
          </CanvasCard>
        </div>

        {(mode === "create" || mode === "edit") &&
        (mode !== "edit" || selectedWebhook) ? (
          <EndpointForm
            mode={mode}
            webhook={selectedWebhook}
            baselineEvents={baselineEvents}
          />
        ) : null}

        {mode === "rotate" && selectedWebhook ? (
          <RotateSecretForm webhook={selectedWebhook} />
        ) : null}

        <div style={twoColumnStyle}>
          <CanvasCard
            theme={th}
            title="Endpoints"
            subtitle="availableActions visualized as visible CTAs: enabled, disabled-with-reason, never hidden."
            actions={
              <div style={buttonWrapStyle}>
                {["all", "active", "test_pending", "disabled"].map((value) => {
                  const href =
                    value === "all"
                      ? "/webhooks"
                      : `/webhooks?status=${encodeURIComponent(value)}`;
                  return (
                    <Link
                      key={value}
                      href={href}
                      style={getLinkButtonStyle({
                        primary: statusFilter === value,
                      })}
                    >
                      {value}
                    </Link>
                  );
                })}
              </div>
            }
            padding={0}
          >
            {endpointReason && endpointEmptyCopy ? (
              <div style={{ padding: 16 }}>
                <CanvasBanner
                  theme={th}
                  tone={endpointEmptyCopy.tone}
                  icon="info"
                  title={endpointEmptyCopy.title}
                  body={endpointEmptyCopy.body}
                />
                {endpointEmptyCopy.cta ? (
                  <div style={{ marginTop: 12 }}>
                    <Link
                      href={endpointEmptyCopy.cta.href}
                      style={getLinkButtonStyle()}
                    >
                      {endpointEmptyCopy.cta.label}
                    </Link>
                  </div>
                ) : null}
              </div>
            ) : (
              <CanvasTable<EndpointRow>
                theme={th}
                columns={endpointColumns}
                rows={filteredEndpoints.map(toEndpointRow)}
              />
            )}
          </CanvasCard>

          <CanvasCard
            theme={th}
            title={selectedWebhook ? "Selected endpoint" : "Action matrix"}
            subtitle={
              selectedWebhook
                ? "Per-endpoint actions and contract notes"
                : "Pick an endpoint to inspect delivery scope or update actions."
            }
          >
            {selectedWebhook ? (
              <div style={stackStyle}>
                <div style={panelStyle}>
                  <div style={{ color: th.text, fontWeight: 600 }}>
                    {selectedWebhook.url}
                  </div>
                  <div style={codeLabelStyle}>{selectedWebhook.webhookId}</div>
                  <div style={chipWrapStyle}>
                    {selectedWebhook.events.map((eventType) => (
                      <CanvasPill key={eventType} theme={th} tone="info">
                        {eventType}
                      </CanvasPill>
                    ))}
                  </div>
                </div>
                <div style={buttonWrapStyle}>
                  {getEndpointActions(
                    selectedWebhook,
                    canManage,
                    statusFilter,
                  ).map((action, index) =>
                    renderAction(action, `endpoint-${index}`),
                  )}
                </div>
                <p style={mutedStyle}>
                  Endpoint 層保留 lifecycle actions；delivery-specific `retry
                  failed` 會在下方 delivery rows / selected delivery detail 依
                  `delivery.availableActions` 顯示。
                </p>
              </div>
            ) : (
              <div style={stackStyle}>
                <CanvasBanner
                  theme={th}
                  tone="info"
                  icon="info"
                  title="Select an endpoint"
                  body="從左側列表點選 `delivery log` / `更新` / `rotate secret` 即可進入 per-endpoint flow。"
                />
                <ul style={listStyle}>
                  <li>Create / update 由真實 backend route 支援。</li>
                  <li>
                    Rotate secret 直接呼叫
                    `/api/tenant/webhooks/:id/rotate-secret`。
                  </li>
                  <li>
                    Delivery row 會直接反映 `retryFailedDelivery` 的
                    enabled/disabled 狀態。
                  </li>
                </ul>
              </div>
            )}
          </CanvasCard>
        </div>

        <div style={twoColumnStyle}>
          <CanvasCard
            theme={th}
            title={selectedWebhook ? "Delivery log" : "Recent deliveries"}
            subtitle={
              selectedWebhook
                ? `${selectedWebhook.url} · real engine records only`
                : "Tenant-wide delivery stream · no mock replay rows"
            }
            actions={
              selectedWebhook ? (
                <Link href="/webhooks" style={getLinkButtonStyle()}>
                  Clear endpoint scope
                </Link>
              ) : null
            }
            padding={0}
          >
            {deliveryReason && deliveryEmptyCopy ? (
              <div style={{ padding: 16 }}>
                <CanvasBanner
                  theme={th}
                  tone={deliveryEmptyCopy.tone}
                  icon="info"
                  title={deliveryEmptyCopy.title}
                  body={deliveryEmptyCopy.body}
                />
                {deliveryEmptyCopy.cta ? (
                  <div style={{ marginTop: 12 }}>
                    <Link
                      href={deliveryEmptyCopy.cta.href}
                      style={getLinkButtonStyle()}
                    >
                      {deliveryEmptyCopy.cta.label}
                    </Link>
                  </div>
                ) : null}
              </div>
            ) : (
              <CanvasTable<DeliveryRow>
                theme={th}
                columns={deliveryColumns}
                rows={scopedDeliveries.slice(0, 12).map(toDeliveryRow)}
                dense
              />
            )}
          </CanvasCard>

          <CanvasCard
            theme={th}
            title={selectedDelivery ? "Selected delivery" : "Related signals"}
            subtitle={
              selectedDelivery
                ? "Per-delivery actions come from delivery.availableActions[]."
                : "Entry/exit per packet: notification deep link + integration governance + audit."
            }
          >
            <div style={stackStyle}>
              {selectedDelivery ? (
                <div style={panelStyle}>
                  <div style={{ color: th.text, fontWeight: 600 }}>
                    {selectedDelivery.eventType}
                  </div>
                  <div style={detailLineStyle}>
                    <span>delivery</span>
                    <span style={monoStyle}>{selectedDelivery.deliveryId}</span>
                  </div>
                  <div style={detailLineStyle}>
                    <span>endpoint</span>
                    <span style={monoStyle}>{selectedDelivery.webhookId}</span>
                  </div>
                  <div style={detailLineStyle}>
                    <span>signature</span>
                    <span style={monoStyle}>{selectedDelivery.signature}</span>
                  </div>
                  <div style={detailLineStyle}>
                    <span>attempt</span>
                    <span style={monoStyle}>{selectedDelivery.attempt}</span>
                  </div>
                  <div style={buttonWrapStyle}>
                    {getDeliveryActions(
                      selectedDelivery,
                      canManage,
                      statusFilter,
                    ).map((action, index) =>
                      renderAction(action, `delivery-${index}`),
                    )}
                    <Link
                      href={
                        selectedWebhookId
                          ? `/webhooks?webhookId=${encodeURIComponent(selectedWebhookId)}`
                          : "/webhooks"
                      }
                      style={getLinkButtonStyle()}
                    >
                      Clear delivery scope
                    </Link>
                  </div>
                  <p style={mutedStyle}>
                    Retry CTA 直接跟著 delivery read model 的
                    `availableActions`；若 backend 尚未提供 retry
                    endpoint，畫面會保留 disabled reason。
                  </p>
                </div>
              ) : null}
              <div style={panelStyle}>
                <div style={{ color: th.text, fontWeight: 600 }}>
                  Notification feed
                </div>
                {notifications.length > 0 ? (
                  notifications.map((notification) => (
                    <div
                      key={notification.notificationId}
                      style={detailLineStyle}
                    >
                      <span>{notification.title}</span>
                      <span style={monoStyle}>
                        {formatDateTime(notification.createdAt)}
                      </span>
                    </div>
                  ))
                ) : (
                  <p style={mutedStyle}>
                    目前 notification feed 沒有 webhook / delivery 相關項目。
                  </p>
                )}
                <Link href="/notifications" style={secondaryLinkStyle}>
                  Open notification preferences
                </Link>
              </div>
              <div style={panelStyle}>
                <div style={{ color: th.text, fontWeight: 600 }}>
                  Cross-app deep links
                </div>
                {externalLinks.map((link) => (
                  <div key={link.label} style={{ display: "grid", gap: 4 }}>
                    {link.href ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noreferrer"
                        style={primaryLinkStyle}
                      >
                        {link.label}
                      </a>
                    ) : (
                      <span style={primaryLinkStyle}>{link.label}</span>
                    )}
                    <span style={subtleTextStyle}>{link.description}</span>
                    {!link.href ? (
                      <span style={subtleTextStyle}>
                        Missing base URL env; configure
                        `NEXT_PUBLIC_OPS_CONSOLE_URL` /
                        `NEXT_PUBLIC_PLATFORM_ADMIN_URL` to activate new-tab
                        navigation.
                      </span>
                    ) : null}
                  </div>
                ))}
                <Link href="/integration-governance" style={secondaryLinkStyle}>
                  Tenant integration governance
                </Link>
                <Link href="/audit" style={secondaryLinkStyle}>
                  Tenant audit trail
                </Link>
              </div>
            </div>
          </CanvasCard>
        </div>
      </div>
    </div>
  );
}
