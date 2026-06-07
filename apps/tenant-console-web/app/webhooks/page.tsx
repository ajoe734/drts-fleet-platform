import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import type { CSSProperties, ReactNode } from "react";
import type {
  CreateTenantWebhookEndpointCommand,
  DeleteTenantWebhookEndpointCommand,
  IdentityContext,
  NotificationRecord,
  ResourceActionDescriptor,
  TenantIntegrationReadinessItem,
  TenantIntegrationReadinessSummary,
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
  type CanvasTone,
  buildCanvasTheme,
} from "@drts/ui-web";
import {
  ServerCanvasTable,
  type ServerCanvasTableColumn,
} from "@/components/server-canvas-table";
import {
  API_URL,
  DEMO_ACTOR_ID,
  DEMO_TENANT_ID,
  getTenantClient,
} from "@/lib/api-client";
import {
  formatTenantErrorReasonLabel,
  formatTenantUiError,
  toTenantErrorMessage,
} from "@/lib/error-copy";
import { formatTenantCodeLabel } from "@/lib/localized-labels";
import { SecretRevealCard } from "./secret-reveal-card";

export const dynamic = "force-dynamic";

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

const REFRESH_TIER_LABEL = "T5 租戶慢速 · 30 秒";
const OPS_CONSOLE_URL = process.env.NEXT_PUBLIC_OPS_CONSOLE_URL ?? null;
const PLATFORM_ADMIN_URL = process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL ?? null;
const ROTATE_SECRET_RECEIPT_COOKIE = "tenant-webhook-rotate-receipt";

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

const topMetaRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.8fr) minmax(280px, 1fr)",
  gap: 16,
};

const pageEmptyWrapStyle: CSSProperties = {
  padding: 24,
  display: "grid",
  gap: 14,
};

const replayGridStyle: CSSProperties = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
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

const relativeTimeFormatter = new Intl.RelativeTimeFormat("zh-TW", {
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
  formAction?: "retryFailedDelivery";
  webhookId?: string | undefined;
  deliveryId?: string | undefined;
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
};

type BannerTone = EmptyStateCopy["tone"];

type WebhooksPageData = {
  identity: IdentityContext | null;
  governance: TenantIntegrationGovernancePackage | null;
  readiness: TenantIntegrationReadinessSummary | null;
  notifications: NotificationRecord[];
  endpoints: TenantWebhookEndpoint[];
  deliveries: WebhookDeliveryRecord[];
  endpointError: string | null;
  deliveryError: string | null;
  governanceError: string | null;
  readinessError: string | null;
  identityError: string | null;
  notificationsError: string | null;
  loadedAt: string;
};

type RotateSecretReceipt = {
  endpointUrl: string;
  secret: string;
  secretPreview: string;
  secretVersion: number;
  rotatedAt: string;
  webhookId: string;
};

type RotateWebhookSecretResponse = {
  data: {
    webhookId: string;
    secretVersion: number;
    secretPreview: string;
    rotationCount?: number;
    rotatedAt: string;
    plaintextSecret?: string;
    secret?: string;
    plaintextKey?: string;
  };
};

function encodeRotateSecretReceipt(receipt: RotateSecretReceipt) {
  return Buffer.from(JSON.stringify(receipt), "utf8").toString("base64url");
}

function decodeRotateSecretReceipt(value: string | undefined) {
  if (!value) return null;
  try {
    return JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as RotateSecretReceipt;
  } catch {
    return null;
  }
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
  if (status === "active") return "啟用中";
  if (status === "test_pending") return "待驗證";
  return "已停用";
}

function getEndpointLastActivity(endpoint: TenantWebhookEndpoint) {
  const metadata = endpoint.runtimeMetadata;
  if (endpoint.status === "active" && metadata?.lastDeliveredAt) {
    return `已送達 ${formatRelativeTime(metadata.lastDeliveredAt)}`;
  }
  if (metadata?.lastAttemptAt) {
    return `最近嘗試 ${formatRelativeTime(metadata.lastAttemptAt)}`;
  }
  if (endpoint.status === "disabled" && metadata?.disabledAt) {
    return `已停用 ${formatRelativeTime(metadata.disabledAt)}`;
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
          ? "失敗群聚後停用"
          : "人工暫停",
      tone: "warn" as CanvasTone,
    };
  }

  if (endpoint.status === "test_pending") {
    return {
      label: "等待驗證流量",
      tone: "accent" as CanvasTone,
    };
  }

  if (failures > 0) {
    return {
      label: `${failures} 筆失敗 / ${deliveries} 筆投遞`,
      tone: "danger" as CanvasTone,
    };
  }

  return {
    label: deliveries > 0 ? `${deliveries} 筆投遞 · 正常` : "正常",
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
      delivery.status === "delivery_failed"
        ? "失敗"
        : delivery.status === "queued"
          ? "排隊中"
          : "已送達",
    statusTone: getDeliveryStatusTone(delivery.status),
    codeLabel:
      delivery.httpStatus === null ? "逾時" : String(delivery.httpStatus),
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

function getEmptyStateCopy(reason: EmptyReason): EmptyStateCopy {
  switch (reason) {
    case "not_provisioned":
      return {
        title: "回呼引擎尚未開通",
        body: "此租戶目前沒有啟用投遞引擎。畫面不會回填任何假投遞紀錄；請先完成平台側開通，再建立端點。",
        tone: "warn",
      };
    case "permission_denied":
      return {
        title: "目前身分沒有回呼權限",
        body: "後端拒絕回傳此區塊資料。請改用具租戶管理或整合治理權限的身分，或請平台／租戶管理員協助。",
        tone: "danger",
      };
    case "external_unavailable":
      return {
        title: "投遞引擎暫時不可用",
        body: "後端或外部目的端暫時不可用，因此無法取得回呼可視資料。保留目前查詢條件，稍後手動重新整理再試。",
        tone: "warn",
      };
    case "fetch_failed":
      return {
        title: "資料抓取失敗",
        body: "請檢查服務可用性與目前環境標頭。這不是無資料狀態，而是讀取模型暫時失敗。",
        tone: "danger",
      };
    case "filtered_empty":
      return {
        title: "目前篩選條件下沒有結果",
        body: "資料源仍可用，但現有狀態或端點篩選沒有命中任何項目。清除篩選即可回到完整檢視。",
        tone: "info",
      };
    case "no_data":
    default:
      return {
        title: "尚未建立任何端點",
        body: "目前沒有回呼端點，因此也不會有投遞紀錄。先建立第一個端點，系統才會開始產生真實的投遞可視性。",
        tone: "info",
      };
  }
}

function getActionLabel(action: string) {
  switch (action) {
    case "payload_schema":
      return "載荷格式";
    case "createWebhookEndpoint":
      return "建立端點";
    case "updateWebhookEndpoint":
      return "編輯端點";
    case "disableWebhookEndpoint":
      return "停用端點";
    case "deleteWebhookEndpoint":
      return "刪除端點";
    case "rotateWebhookSecret":
      return "輪替密鑰";
    case "viewDeliveryLog":
      return "查看投遞紀錄";
    case "retryFailedDelivery":
      return "重試失敗投遞";
    default:
      return formatTenantCodeLabel(action, action, { humanizeUnknown: false });
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

function getPageActionHref(action: string) {
  switch (action) {
    case "payload_schema":
      return "/webhooks#payload-schema";
    case "createWebhookEndpoint":
      return "/webhooks?mode=create";
    default:
      return undefined;
  }
}

function getEndpointActionHref(
  action: string,
  options?: {
    webhookId?: string;
    status?: string;
  },
) {
  const webhookId = options?.webhookId;
  const status =
    options?.status && options.status !== "all"
      ? `&status=${encodeURIComponent(options.status)}`
      : "";

  switch (action) {
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
      return webhookId
        ? `/webhooks?webhookId=${encodeURIComponent(webhookId)}${status}`
        : undefined;
    default:
      return undefined;
  }
}

function getDeliveryActionHref(
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

function decoratePageActions(
  descriptors: ResourceActionDescriptor[],
): ActionDescriptor[] {
  return descriptors.flatMap((descriptor) => {
    const href = getPageActionHref(descriptor.action);
    if (!href) {
      return [];
    }
    const tone = getActionTone(descriptor.action);

    return [
      {
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
        href,
      },
    ];
  });
}

function decorateEndpointActions(
  descriptors: ResourceActionDescriptor[],
  options?: {
    webhookId?: string;
    status?: string;
  },
): ActionDescriptor[] {
  return descriptors.flatMap((descriptor) => {
    const tone = getActionTone(descriptor.action);
    const href = getEndpointActionHref(descriptor.action, options);
    if (!href && descriptor.action !== "deleteWebhookEndpoint") {
      return [];
    }

    return [
      {
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
      },
    ];
  });
}

function decorateDeliveryActions(
  descriptors: ResourceActionDescriptor[],
  options?: {
    webhookId?: string;
    deliveryId?: string;
    status?: string;
  },
): ActionDescriptor[] {
  return descriptors.flatMap((descriptor) => {
    const tone = getActionTone(descriptor.action);
    const href = getDeliveryActionHref(descriptor.action, options);
    const formFields =
      descriptor.action === "retryFailedDelivery" &&
      options?.webhookId &&
      options?.deliveryId
        ? {
            formAction: "retryFailedDelivery" as const,
            webhookId: options.webhookId,
            deliveryId: options.deliveryId,
          }
        : undefined;
    if (!href && !formFields) {
      return [];
    }

    return [
      {
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
        ...(formFields ?? {}),
      },
    ];
  });
}

function getPageActions(
  governanceActions: ResourceActionDescriptor[] | undefined,
): ActionDescriptor[] {
  return decoratePageActions(governanceActions ?? []);
}

function deriveActiveTab(options: {
  mode: ViewMode;
  selectedWebhookId?: string;
  selectedDeliveryId?: string;
}) {
  if (options.mode === "rotate") return "重播";
  if (options.selectedDeliveryId) return "重播";
  if (options.selectedWebhookId) return "投遞";
  return "端點";
}

function getEndpointActions(
  endpoint: TenantWebhookEndpoint,
  statusFilter = "all",
): ActionDescriptor[] {
  return decorateEndpointActions(endpoint.availableActions ?? [], {
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
  statusFilter = "all",
): ActionDescriptor[] {
  return decorateDeliveryActions(delivery.availableActions ?? [], {
    webhookId: delivery.webhookId,
    deliveryId: delivery.deliveryId,
    status: statusFilter,
  });
}

function findAction(actions: ActionDescriptor[], actionName: string) {
  return actions.find((action) => action.action === actionName) ?? null;
}

function renderContractGap(message: string) {
  return <span style={subtleTextStyle}>{message}</span>;
}

function renderAction(
  descriptor: ActionDescriptor,
  key: string,
  small = true,
): ReactNode {
  const size = small ? "sm" : "md";
  const submitActionReady =
    descriptor.enabled &&
    descriptor.formAction === "retryFailedDelivery" &&
    descriptor.webhookId &&
    descriptor.deliveryId;

  if (submitActionReady) {
    return (
      <form key={key} action={retryFailedDeliveryAction}>
        <input type="hidden" name="webhookId" value={descriptor.webhookId} />
        <input type="hidden" name="deliveryId" value={descriptor.deliveryId} />
        <button
          type="submit"
          style={{
            ...getLinkButtonStyle({
              primary: descriptor.tone === "accent",
              danger: descriptor.tone === "danger",
              size,
            }),
            cursor: "pointer",
          }}
        >
          {descriptor.label}
        </button>
      </form>
    );
  }

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
        <span style={subtleTextStyle}>
          {formatTenantCodeLabel(
            descriptor.disabledReasonCode,
            descriptor.disabledReasonCode,
          )}
        </span>
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
    readinessResult,
    endpointsResult,
    deliveriesResult,
    notificationsResult,
  ] = await Promise.allSettled([
    client.getIdentityContext() as Promise<IdentityContext>,
    client.getTenantIntegrationGovernancePackage() as Promise<TenantIntegrationGovernancePackage>,
    client.get<TenantIntegrationReadinessSummary>(
      "/api/tenant/integration-governance/readiness",
    ) as Promise<TenantIntegrationReadinessSummary>,
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
    readiness:
      readinessResult.status === "fulfilled" ? readinessResult.value : null,
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
        ? toTenantErrorMessage(endpointsResult.reason)
        : null,
    deliveryError:
      deliveriesResult.status === "rejected"
        ? toTenantErrorMessage(deliveriesResult.reason)
        : null,
    governanceError:
      governanceResult.status === "rejected"
        ? toTenantErrorMessage(governanceResult.reason)
        : null,
    readinessError:
      readinessResult.status === "rejected"
        ? toTenantErrorMessage(readinessResult.reason)
        : null,
    identityError:
      identityResult.status === "rejected"
        ? toTenantErrorMessage(identityResult.reason)
        : null,
    notificationsError:
      notificationsResult.status === "rejected"
        ? toTenantErrorMessage(notificationsResult.reason)
        : null,
    loadedAt: new Date().toISOString(),
  };
}

function getWebhookReadiness(
  readiness: TenantIntegrationReadinessSummary | null,
) {
  return readiness?.items.find((item) => item.subSystem === "webhooks") ?? null;
}

function getReadinessTone(
  readiness: TenantIntegrationReadinessItem | null,
): CanvasTone {
  switch (readiness?.status) {
    case "ready":
      return "success";
    case "partial":
      return "accent";
    case "blocked":
      return "danger";
    case "not_provisioned":
      return "warn";
    default:
      return "neutral";
  }
}

function getReadinessLabel(readiness: TenantIntegrationReadinessItem | null) {
  return formatTenantCodeLabel(readiness?.status, "未知");
}

function getReadinessBannerTone(
  readiness: TenantIntegrationReadinessItem | null,
): BannerTone {
  const tone = getReadinessTone(readiness);
  return tone === "neutral" ? "info" : tone;
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
      <CanvasField theme={th} label="事件">
        <input
          name="extraEvents"
          defaultValue={(selectedEvents ?? []).join(", ")}
          placeholder="例如：訂單已建立（booking.created）、發票已就緒（invoice.ready）"
          style={controlStyle}
        />
      </CanvasField>
    );
  }

  return (
    <CanvasField
      theme={th}
      label="基準事件"
      hint="治理套件提供的基準回呼事件，可同時勾選多個。"
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
            <span style={monoStyle}>
              {formatTenantCodeLabel(eventType, eventType)}
            </span>
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

function sameEvents(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  const leftSorted = [...left].sort();
  const rightSorted = [...right].sort();
  return leftSorted.every((value, index) => value === rightSorted[index]);
}

async function rotateWebhookSecretRequest(
  webhookId: string,
  body: {
    secret: string;
    rotationReason?: string;
  },
): Promise<RotateWebhookSecretResponse> {
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
    throw new Error(
      `系統回應失敗（狀態碼 ${response.status}）：${await response.text()}`,
    );
  }

  return response.json() as Promise<RotateWebhookSecretResponse>;
}

async function createWebhookAction(formData: FormData) {
  "use server";

  const client = getTenantClient();
  const events = parseEvents(formData);
  try {
    if (events.length === 0) {
      throw new Error("請至少選擇一個事件。");
    }

    const command: CreateTenantWebhookEndpointCommand = {
      url: String(formData.get("url") ?? "").trim(),
      secret: String(formData.get("secret") ?? "").trim(),
      events,
    };

    if (!command.url || !command.secret) {
      throw new Error("回呼網址與密鑰為必填。");
    }

    await client.createWebhookEndpoint(command);
    revalidatePath("/webhooks");
    redirect(
      `/webhooks?success=${encodeURIComponent("端點已建立，狀態為待驗證。")}`,
    );
  } catch (error) {
    redirect(
      `/webhooks?mode=create&error=${encodeURIComponent(toTenantErrorMessage(error))}`,
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
      throw new Error("缺少端點編號。");
    }

    const currentEndpoints = await client.listWebhooks();
    const currentEndpoint = currentEndpoints.find(
      (endpoint) => endpoint.webhookId === webhookId,
    );
    if (!currentEndpoint) {
      throw new Error("找不到目前的回呼端點。");
    }

    const command: UpdateTenantWebhookEndpointCommand = {
      url: String(formData.get("url") ?? "").trim(),
      events,
      status: String(
        formData.get("status") ?? "",
      ) as TenantWebhookEndpointStatus,
    };

    if (!command.url || !command.status || events.length === 0) {
      throw new Error("網址、狀態與至少一個事件為必填。");
    }
    const disableAction = currentEndpoint.availableActions?.find(
      (action) => action.action === "disableWebhookEndpoint",
    );
    if (
      command.status === "disabled" &&
      currentEndpoint.status !== "disabled" &&
      !disableAction?.enabled
    ) {
      throw new Error(
        "此端點目前沒有發布「停用端點」動作，不能透過編輯流程直接停用。",
      );
    }
    if (command.status === "disabled" && !disableReason) {
      throw new Error("停用端點時必須填寫原因。");
    }

    if (
      command.status === "disabled" &&
      currentEndpoint.status !== "disabled"
    ) {
      const nextUrl = command.url?.trim() ?? "";
      const urlChanged = nextUrl !== currentEndpoint.url;
      const eventsChanged = !sameEvents(events, currentEndpoint.events);

      if (urlChanged || eventsChanged) {
        throw new Error(
          "停用流程只允許執行「停用端點」。請先儲存網址或事件變更，再單獨停用端點。",
        );
      }

      await client.disableWebhookEndpoint(webhookId, {
        reason: disableReason,
      });
    } else {
      await client.updateWebhookEndpoint(webhookId, command);
    }
    revalidatePath("/webhooks");
    redirect(
      `/webhooks?webhookId=${encodeURIComponent(webhookId)}&success=${encodeURIComponent(
        "端點已更新。",
      )}`,
    );
  } catch (error) {
    redirect(
      `/webhooks?mode=edit&webhookId=${encodeURIComponent(webhookId)}&error=${encodeURIComponent(
        toTenantErrorMessage(error),
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
      throw new Error("缺少端點編號。");
    }
    if (!deleteReason) {
      throw new Error("刪除端點時必須填寫原因。");
    }
    const command: DeleteTenantWebhookEndpointCommand = {
      reason: deleteReason,
    };
    await client.deleteWebhookEndpoint(webhookId, command);
    revalidatePath("/webhooks");
    redirect(`/webhooks?success=${encodeURIComponent("端點已刪除。")}`);
  } catch (error) {
    redirect(
      `/webhooks?mode=edit&webhookId=${encodeURIComponent(webhookId)}&error=${encodeURIComponent(
        toTenantErrorMessage(error),
      )}`,
    );
  }
}

async function rotateWebhookSecretAction(formData: FormData) {
  "use server";

  const webhookId = String(formData.get("webhookId") ?? "");
  const endpointUrl = String(formData.get("endpointUrl") ?? "").trim();
  const secret = String(formData.get("secret") ?? "").trim();
  const rotationReason = String(formData.get("rotationReason") ?? "").trim();

  try {
    if (!webhookId || !secret) {
      throw new Error("端點編號與新密鑰為必填。");
    }

    const result = await rotateWebhookSecretRequest(webhookId, {
      secret,
      ...(rotationReason ? { rotationReason } : {}),
    });
    const revealedSecret =
      result.data.plaintextSecret ??
      result.data.secret ??
      result.data.plaintextKey ??
      secret;
    const cookieStore = await cookies();
    cookieStore.set(
      ROTATE_SECRET_RECEIPT_COOKIE,
      encodeRotateSecretReceipt({
        endpointUrl,
        secret: revealedSecret,
        secretPreview: result.data.secretPreview,
        secretVersion: result.data.secretVersion,
        rotatedAt: result.data.rotatedAt,
        webhookId,
      }),
      {
        httpOnly: false,
        maxAge: 300,
        path: "/webhooks",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      },
    );
    revalidatePath("/webhooks");
    redirect(
      `/webhooks?webhookId=${encodeURIComponent(webhookId)}&revealSecret=1&success=${encodeURIComponent(
        "密鑰已輪替。依治理規則，端點會重新進入待驗證，完整值只在本次畫面顯示。",
      )}`,
    );
  } catch (error) {
    redirect(
      `/webhooks?mode=rotate&webhookId=${encodeURIComponent(webhookId)}&error=${encodeURIComponent(
        toTenantErrorMessage(error),
      )}`,
    );
  }
}

async function retryFailedDeliveryAction(formData: FormData) {
  "use server";

  const client = getTenantClient();
  const webhookId = String(formData.get("webhookId") ?? "").trim();
  const deliveryId = String(formData.get("deliveryId") ?? "").trim();

  try {
    if (!webhookId || !deliveryId) {
      throw new Error("缺少端點編號或投遞編號。");
    }

    await client.retryWebhookDelivery(webhookId, deliveryId);
    revalidatePath("/webhooks");
    redirect(
      `/webhooks?webhookId=${encodeURIComponent(webhookId)}&deliveryId=${encodeURIComponent(deliveryId)}&success=${encodeURIComponent(
        "失敗投遞重試已送出。",
      )}`,
    );
  } catch (error) {
    redirect(
      `/webhooks?webhookId=${encodeURIComponent(webhookId)}&deliveryId=${encodeURIComponent(deliveryId)}&error=${encodeURIComponent(
        toTenantErrorMessage(error),
      )}`,
    );
  }
}

async function clearRotateSecretReceiptAction(formData: FormData) {
  "use server";

  const webhookId = String(formData.get("webhookId") ?? "").trim();
  const cookieStore = await cookies();
  cookieStore.set(ROTATE_SECRET_RECEIPT_COOKIE, "", {
    httpOnly: false,
    maxAge: 0,
    path: "/webhooks",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  redirect(
    webhookId
      ? `/webhooks?webhookId=${encodeURIComponent(webhookId)}&success=${encodeURIComponent(
          "密鑰收據已關閉，主列表已恢復為遮罩預覽。",
        )}`
      : `/webhooks?success=${encodeURIComponent(
          "密鑰收據已關閉，主列表已恢復為遮罩預覽。",
        )}`,
  );
}

function EndpointForm({
  mode,
  webhook,
  baselineEvents,
  endpointActions,
}: {
  mode: ViewMode;
  webhook?: TenantWebhookEndpoint | null;
  baselineEvents: string[];
  endpointActions?: ActionDescriptor[];
}) {
  const isCreate = mode === "create";
  const disableAction = findAction(
    endpointActions ?? [],
    "disableWebhookEndpoint",
  );
  const deleteAction = findAction(
    endpointActions ?? [],
    "deleteWebhookEndpoint",
  );
  const rotateAction = findAction(endpointActions ?? [], "rotateWebhookSecret");
  const canShowDisabledOption =
    webhook?.status === "disabled" || Boolean(disableAction?.enabled);
  const disableUnavailableReason =
    disableAction?.disabledReasonCode ?? "disableWebhookEndpoint_not_published";

  return (
    <CanvasCard
      theme={th}
      title={isCreate ? "建立端點" : "更新端點"}
      subtitle={
        isCreate
          ? "建立與更新屬於中風險動作；新端點一律先進入待驗證狀態。"
          : "停用與刪除屬於高風險操作。介面會強制填寫原因後，才依既有後端契約送出。"
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
          <CanvasField theme={th} label="回呼網址">
            <input
              name="url"
              defaultValue={webhook?.url ?? ""}
              placeholder="例如：https://partner.example.com/drts/callback"
              style={controlStyle}
            />
          </CanvasField>
          {isCreate ? (
            <CanvasField
              theme={th}
              label="初始密鑰"
              hint="密鑰只會以遮罩預覽寫回讀取模型。"
            >
              <input
                name="secret"
                placeholder="例如：以 whsec 開頭的密鑰"
                style={controlStyle}
              />
            </CanvasField>
          ) : (
            <CanvasField
              theme={th}
              label="狀態"
              hint={
                disableAction
                  ? "變更網址、事件或啟用狀態都會觸發驗證流程。"
                  : "變更網址、事件或啟用狀態都會觸發驗證；停用狀態需等後端開放「停用端點」操作後才可切換。"
              }
            >
              <select
                name="status"
                defaultValue={webhook?.status ?? "test_pending"}
                style={controlStyle}
              >
                <option value="active">啟用中</option>
                <option value="test_pending">待驗證</option>
                {canShowDisabledOption ? (
                  <option value="disabled">已停用</option>
                ) : null}
              </select>
            </CanvasField>
          )}
        </div>
        <EventChecklist
          baselineEvents={baselineEvents}
          {...(webhook?.events ? { selectedEvents: webhook.events } : {})}
        />
        {baselineEvents.length > 0 ? (
          <CanvasField theme={th} label="額外事件">
            <input
              name="extraEvents"
              defaultValue={(webhook?.events ?? [])
                .filter((eventType) => !baselineEvents.includes(eventType))
                .join(", ")}
              placeholder="以逗號分隔的額外事件"
              style={controlStyle}
            />
          </CanvasField>
        ) : null}
        {!isCreate && disableAction ? (
          <CanvasField
            theme={th}
            label="停用原因"
            hint={
              disableAction.enabled
                ? "當狀態改為已停用時必填；符合契約要求的高風險原因閘門。"
                : `停用操作目前不可用：${formatTenantCodeLabel(
                    disableAction.disabledReasonCode ?? "disabled_by_backend",
                    "由後端停用",
                  )}`
            }
          >
            <textarea
              name="disableReason"
              style={textareaStyle}
              placeholder="例如：接收端維護視窗、重複失敗群聚、安全暫停等"
              disabled={!disableAction.enabled}
            />
          </CanvasField>
        ) : !isCreate ? (
          <CanvasField
            theme={th}
            label="停用狀態"
            hint={`目前尚未取得可執行的停用操作，因此原因欄位維持關閉。${webhook?.status === "disabled" ? " 此端點目前已停用，只能先回到啟用中或待驗證，再等待後端重新開放停用操作。" : ` 停用原因：${formatTenantCodeLabel(disableUnavailableReason, disableUnavailableReason)}。`}`}
          >
            <input
              readOnly
              value="此端點目前不可直接停用"
              style={controlStyle}
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
            {isCreate ? "建立端點" : "儲存變更"}
          </button>
          <Link href="/webhooks" style={getLinkButtonStyle({ size: "md" })}>
            取消
          </Link>
        </div>
      </form>
      {!isCreate && webhook ? (
        <div style={{ ...stackStyle, marginTop: 12 }}>
          <div id="high-risk" style={panelStyle}>
            <div style={{ color: th.text, fontWeight: 600 }}>高風險動作</div>
            <p style={mutedStyle}>
              刪除與停用依契約都屬高風險動作；刪除送出前必須填寫原因，停用則只有在已發布「停用端點」動作時才可透過上方欄位提交。
            </p>
            <div style={buttonWrapStyle}>
              {deleteAction ? (
                deleteAction.enabled ? (
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
                      placeholder="例如：整合下線、端點重複、安全事件等"
                    />
                    <button
                      type="submit"
                      style={{
                        ...getLinkButtonStyle({ danger: true }),
                        cursor: "pointer",
                      }}
                    >
                      刪除端點
                    </button>
                  </form>
                ) : (
                  renderAction(deleteAction, `delete-${webhook.webhookId}`)
                )
              ) : (
                renderContractGap(
                  "要等端點發布「刪除端點」動作後，這裡才會顯示刪除按鈕。",
                )
              )}
              {rotateAction
                ? renderAction(rotateAction, `rotate-${webhook.webhookId}`)
                : renderContractGap(
                    "要等端點發布「輪替密鑰」動作後，這裡才會顯示輪替按鈕。",
                  )}
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
      title="輪替回呼密鑰"
      subtitle="這是高風險動作。依契約，密鑰輪替後端點需要重新驗證。"
    >
      <form action={rotateWebhookSecretAction} style={formGridStyle}>
        <input type="hidden" name="webhookId" value={webhook.webhookId} />
        <input type="hidden" name="endpointUrl" value={webhook.url} />
        <div style={fieldRowStyle}>
          <CanvasField theme={th} label="端點">
            <input value={webhook.url} readOnly style={controlStyle} />
          </CanvasField>
          <CanvasField theme={th} label="目前預覽">
            <input
              value={webhook.secretPreview}
              readOnly
              style={{ ...controlStyle, fontFamily: th.monoFamily }}
            />
          </CanvasField>
        </div>
        <CanvasField
          theme={th}
          label="新密鑰"
          hint="目前輪替指令仍需提交新的密鑰；送出後頁面會立刻進入一次性明文收據頁，提供複製與下載，再回到遮罩預覽。"
        >
          <input
            name="secret"
            placeholder="例如：whsec_rotate_..."
            style={controlStyle}
          />
        </CanvasField>
        <CanvasField
          theme={th}
          label="輪替原因"
          hint="送出後會立即進入一次性明文收據頁，提供複製與下載；主列表之後只保留遮罩預覽。"
        >
          <textarea
            name="rotationReason"
            style={textareaStyle}
            placeholder="例如：接收端金鑰外洩、例行憑證輪替等"
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
            輪替密鑰
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
  const revealSecret =
    getSearchParam(resolvedSearchParams.revealSecret) === "1";
  const cookieStore = await cookies();
  const rotateSecretReceipt = revealSecret
    ? decodeRotateSecretReceipt(
        cookieStore.get(ROTATE_SECRET_RECEIPT_COOKIE)?.value,
      )
    : null;
  const secretReceiptExpired = revealSecret && !rotateSecretReceipt;

  const data = await loadWebhooksPageData();
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
  const pageActions = getPageActions(data.governance?.availableActions);
  const webhookReadiness = getWebhookReadiness(data.readiness);
  const selectedEndpointActions = selectedWebhook
    ? getEndpointActions(selectedWebhook, statusFilter)
    : [];
  const selectedDeliveryActions = selectedDelivery
    ? getDeliveryActions(selectedDelivery, statusFilter)
    : [];
  const createAction = findAction(pageActions, "createWebhookEndpoint");
  const updateAction = findAction(
    selectedEndpointActions,
    "updateWebhookEndpoint",
  );
  const rotateAction = findAction(
    selectedEndpointActions,
    "rotateWebhookSecret",
  );
  const createModeBlocked =
    mode === "create" && (!createAction || !createAction.enabled);
  const editModeBlocked =
    mode === "edit" &&
    Boolean(selectedWebhook) &&
    (!updateAction || !updateAction.enabled);
  const rotateModeBlocked =
    mode === "rotate" &&
    Boolean(selectedWebhook) &&
    (!rotateAction || !rotateAction.enabled);
  const activeTab = deriveActiveTab({
    mode,
    ...(selectedWebhookId ? { selectedWebhookId } : {}),
    ...(selectedDeliveryId ? { selectedDeliveryId } : {}),
  });
  const engineInactive =
    (webhookReadiness?.status === "not_provisioned" ||
      endpointReason === "not_provisioned") &&
    data.endpoints.length === 0;
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
      "前往營運分流",
      "當投遞失敗需要下游介入時，可跨應用程式前往營運分流頁處理。",
    ),
    buildExternalLink(
      PLATFORM_ADMIN_URL,
      "/audit?resourceType=webhook_endpoint",
      "查看平台稽核",
      "查看密鑰輪替、端點生命週期與整合治理事件的跨應用程式稽核軌跡。",
    ),
  ];

  const endpointColumns: ServerCanvasTableColumn<EndpointRow>[] = [
    {
      h: "回呼網址",
      k: "url",
      mono: true,
      r: (row) => (
        <div style={{ display: "grid", gap: 6 }}>
          <span style={{ ...primaryLinkStyle, ...monoStyle }}>{row.url}</span>
          <span style={codeLabelStyle}>端點編號 {row.webhookId}</span>
        </div>
      ),
    },
    {
      h: "事件",
      w: 280,
      r: (row) => (
        <div style={chipWrapStyle}>
          {row.events.map((eventType) => (
            <CanvasPill key={eventType} theme={th} tone="info">
              {formatTenantCodeLabel(eventType, eventType)}
            </CanvasPill>
          ))}
        </div>
      ),
    },
    {
      h: "狀態",
      w: 120,
      r: (row) => (
        <CanvasPill theme={th} tone={row.statusTone} dot>
          {row.statusLabel}
        </CanvasPill>
      ),
    },
    {
      h: "密鑰",
      k: "secretLabel",
      w: 160,
      mono: true,
    },
    {
      h: "健康度",
      w: 190,
      r: (row) => (
        <CanvasPill theme={th} tone={row.healthTone}>
          {row.healthLabel}
        </CanvasPill>
      ),
    },
    {
      h: "最後活動",
      k: "lastActivity",
      w: 180,
      mono: true,
    },
    {
      h: "操作",
      w: 320,
      r: (row) => {
        const endpoint = filteredEndpoints.find(
          (item) => item.webhookId === row.webhookId,
        );
        if (!endpoint) {
          return null;
        }
        const rowActions = getEndpointActions(endpoint, statusFilter).filter(
          (action) =>
            action.action === "viewDeliveryLog" ||
            action.action === "updateWebhookEndpoint" ||
            action.action === "rotateWebhookSecret",
        );
        return (
          <div style={buttonWrapStyle}>
            {rowActions.length > 0
              ? rowActions.map((action, index) =>
                  renderAction(action, `${row.webhookId}-${index}`),
                )
              : endpoint.availableActions === undefined
                ? renderContractGap("尚未發布任何端點動作。")
                : renderContractGap("目前沒有適用於此頁面的端點動作。")}
          </div>
        );
      },
    },
  ];

  const deliveryColumns: ServerCanvasTableColumn<DeliveryRow>[] = [
    { h: "投遞編號", k: "deliveryId", w: 110, mono: true },
    { h: "端點編號", k: "webhookId", w: 100, mono: true },
    {
      h: "事件",
      w: 220,
      mono: true,
      r: (row) => formatTenantCodeLabel(row.eventType, row.eventType),
    },
    {
      h: "狀態",
      w: 120,
      r: (row) => (
        <CanvasPill theme={th} tone={row.statusTone}>
          {row.statusLabel}
        </CanvasPill>
      ),
    },
    {
      h: "代碼",
      w: 90,
      align: "right",
      r: (row) => (
        <CanvasPill theme={th} tone={row.codeTone}>
          {row.codeLabel}
        </CanvasPill>
      ),
    },
    { h: "次數", k: "tries", w: 72, align: "right", mono: true },
    { h: "時間", k: "at", mono: true },
    {
      h: "操作",
      w: 190,
      r: (row) => {
        const delivery = scopedDeliveries.find(
          (item) => item.deliveryId === row.deliveryId,
        );
        if (!delivery) {
          return null;
        }
        const rowActions = getDeliveryActions(delivery, statusFilter);
        return (
          <div style={buttonWrapStyle}>
            {rowActions.length > 0
              ? rowActions.map((action, index) =>
                  renderAction(action, `${row.deliveryId}-${index}`),
                )
              : delivery.availableActions === undefined
                ? renderContractGap("尚未發布任何投遞動作。")
                : renderContractGap("目前沒有適用於此頁面的投遞動作。")}
          </div>
        );
      },
    },
  ];

  const globalErrors = [
    data.identityError
      ? `身分上下文：${formatTenantErrorReasonLabel(data.identityError)}`
      : null,
    data.governanceError
      ? `治理套件：${formatTenantErrorReasonLabel(data.governanceError)}`
      : null,
    data.readinessError
      ? `整備度快照：${formatTenantErrorReasonLabel(data.readinessError)}`
      : null,
    data.notificationsError
      ? `通知設定：${formatTenantErrorReasonLabel(data.notificationsError)}`
      : null,
  ].filter(Boolean) as string[];

  const endpointEmptyCopy = endpointReason
    ? getEmptyStateCopy(endpointReason)
    : null;
  const deliveryEmptyCopy = deliveryReason
    ? getEmptyStateCopy(deliveryReason)
    : null;

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="回呼"
        subtitle="端點 · 事件訂閱 · 投遞紀錄 · 重試政策，後端引擎是否啟用會直接決定畫面內容。"
        tabs={[
          `端點${data.endpoints.length > 0 ? ` · ${data.endpoints.length}` : ""}`,
          "投遞",
          "重播",
        ]}
        activeTab={activeTab}
        actions={
          <>
            {pageActions.map((action, index) =>
              renderAction(action, `page-${index}`, false),
            )}
          </>
        }
      />

      <div style={pageBodyStyle}>
        <div style={topMetaRowStyle}>
          <CanvasCard
            theme={th}
            title="刷新層級"
            subtitle="此頁屬於租戶慢速更新頁面。前端只提供手動重新整理；資料新鮮度以後端資料契約為準。"
            actions={
              <Link href="/webhooks" style={getLinkButtonStyle()}>
                立即重新整理
              </Link>
            }
          >
            <div style={metricGridStyle}>
              <div style={metricCardStyle}>
                <span style={metricLabelStyle}>刷新層級</span>
                <span style={metricValueStyle}>T5</span>
                <p style={mutedStyle}>{REFRESH_TIER_LABEL}</p>
              </div>
              <div style={metricCardStyle}>
                <span style={metricLabelStyle}>快照時間</span>
                <span style={{ ...metricValueStyle, fontSize: 18 }}>
                  {formatDateTime(
                    data.governance?.generatedAt ?? data.loadedAt,
                  )}
                </span>
                <p style={mutedStyle}>治理快照時間 / 頁面載入時間</p>
              </div>
              <div style={metricCardStyle}>
                <span style={metricLabelStyle}>範圍</span>
                <span style={{ ...metricValueStyle, fontSize: 18 }}>
                  {selectedWebhook ? "單一端點" : "全租戶"}
                </span>
                <p style={mutedStyle}>
                  {selectedWebhook
                    ? selectedWebhook.url
                    : "所有端點與投遞可見性"}
                </p>
              </div>
              <div style={metricCardStyle}>
                <span style={metricLabelStyle}>就緒度</span>
                <div>
                  <CanvasPill
                    theme={th}
                    tone={getReadinessTone(webhookReadiness)}
                    dot
                  >
                    {getReadinessLabel(webhookReadiness)}
                  </CanvasPill>
                </div>
                <p style={mutedStyle}>
                  {webhookReadiness?.detail ?? "目前無法取得整合就緒度摘要。"}
                </p>
              </div>
            </div>
          </CanvasCard>

          <CanvasCard
            theme={th}
            title="治理政策"
            subtitle="重試與驗證政策直接來自治理套件。"
          >
            <div style={stackStyle}>
              <div style={detailLineStyle}>
                <span>測試事件</span>
                <span style={monoStyle}>
                  {data.governance?.webhookPolicy.testEventType ?? "—"}
                </span>
              </div>
              <div style={detailLineStyle}>
                <span>重試策略</span>
                <span style={monoStyle}>
                  {data.governance
                    ? `${data.governance.webhookPolicy.retryPolicy.maxAttempts} 次`
                    : "—"}
                </span>
              </div>
              <div style={detailLineStyle}>
                <span>失敗通知</span>
                <span style={monoStyle}>
                  {data.governance?.webhookPolicy
                    .deliveryFailureNotificationChannel ?? "—"}
                </span>
              </div>
            </div>
          </CanvasCard>
        </div>

        <div id="payload-schema">
          <CanvasCard
            theme={th}
            title="載荷格式"
            subtitle="是否可見仍以後端治理設定提供的可用操作為準。"
          >
            <div style={stackStyle}>
              <div style={detailLineStyle}>
                <span>測試事件</span>
                <span style={monoStyle}>
                  {data.governance?.webhookPolicy.testEventType ?? "—"}
                </span>
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                <span style={metricLabelStyle}>基準事件</span>
                {baselineEvents.length > 0 ? (
                  <div style={chipWrapStyle}>
                    {baselineEvents.map((eventType) => (
                      <CanvasPill key={eventType} theme={th} tone="info">
                        {eventType}
                      </CanvasPill>
                    ))}
                  </div>
                ) : (
                  <p style={mutedStyle}>治理套件尚未提供基準事件結構。</p>
                )}
              </div>
              <p style={mutedStyle}>
                端點建立與更新都必須沿用這組事件結構；畫面不會自行新增額外載荷類型。
              </p>
            </div>
          </CanvasCard>
        </div>

        {success ? (
          <CanvasBanner
            theme={th}
            tone="success"
            icon="check"
            title="操作完成"
            body={success}
          />
        ) : null}

        {error ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title="操作失敗"
            body={formatTenantUiError(error)}
          />
        ) : null}

        {secretReceiptExpired ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title="密鑰輪替收據已失效"
            body="完整密鑰只會顯示一次。若你已離開收據流程，主列表只保留遮罩預覽。需要新值時請重新執行密鑰輪替。"
          />
        ) : null}

        {rotateSecretReceipt ? (
          <CanvasCard
            theme={th}
            title="密鑰輪替收據"
            subtitle="回呼密鑰輪替僅提供一次明文揭露，離開此步驟後會回到遮罩預覽。"
          >
            <SecretRevealCard
              theme={th}
              title="完整回呼密鑰只在本次畫面顯示"
              subtitle="一次性明文顯示 · 回呼密鑰輪替"
              body="請先複製或下載新的密鑰，再完成後續接收端更新。離開後主列表只保留遮罩預覽。"
              endpointUrl={rotateSecretReceipt.endpointUrl}
              secret={rotateSecretReceipt.secret}
              secretPreview={rotateSecretReceipt.secretPreview}
              secretVersion={rotateSecretReceipt.secretVersion}
              rotatedAt={formatDateTime(rotateSecretReceipt.rotatedAt)}
              webhookId={rotateSecretReceipt.webhookId}
              clearReceiptAction={clearRotateSecretReceiptAction}
            />
          </CanvasCard>
        ) : null}

        {globalErrors.length > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title="部分支援讀取模型無法載入"
            body={globalErrors.join(" · ")}
          />
        ) : null}

        {webhookReadiness &&
        webhookReadiness.status !== "ready" &&
        !engineInactive ? (
          <CanvasBanner
            theme={th}
            tone={getReadinessBannerTone(webhookReadiness)}
            icon="info"
            title={`回呼就緒度：${getReadinessLabel(webhookReadiness)}`}
            body={
              webhookReadiness.detail ??
              "後端整合就緒度顯示此子系統尚未完全就緒。"
            }
          />
        ) : null}

        {createModeBlocked ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title="建立流程目前不可用"
            body={`頁面目前沒有收到可執行的「建立端點」操作。${createAction?.disabledReasonCode ? ` 原因：${formatTenantCodeLabel(createAction.disabledReasonCode, createAction.disabledReasonCode)}。` : " 畫面不會自行補出替代建立按鈕。"}`}
          />
        ) : null}

        {editModeBlocked ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title="編輯流程目前不可用"
            body="此端點尚未發布「編輯端點」動作，因此頁面不會直接開啟編輯表單。"
          />
        ) : null}

        {rotateModeBlocked ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title="輪替流程目前不可用"
            body="此端點尚未發布「輪替密鑰」動作，因此頁面不會直接開啟輪替表單。"
          />
        ) : null}

        {engineInactive && endpointEmptyCopy ? (
          <CanvasCard
            theme={th}
            title="回呼引擎"
            subtitle="在真實引擎尚未佈建前，畫面不會暗示存在假的端點或投遞資料。"
          >
            <div style={pageEmptyWrapStyle}>
              <CanvasBanner
                theme={th}
                tone={endpointEmptyCopy.tone}
                icon="info"
                title={endpointEmptyCopy.title}
                body={
                  webhookReadiness?.detail
                    ? `${endpointEmptyCopy.body} ${webhookReadiness.detail}`
                    : endpointEmptyCopy.body
                }
              />
              <div style={buttonWrapStyle}>
                <Link
                  href="/integration-governance"
                  style={getLinkButtonStyle({ primary: true })}
                >
                  開啟整合治理
                </Link>
                <Link href="/notifications" style={getLinkButtonStyle()}>
                  通知路由
                </Link>
              </div>
              <p style={mutedStyle}>
                下方仍可使用跨系統排查連結，但在佈建完成前，主頁面會維持空狀態。
              </p>
            </div>
          </CanvasCard>
        ) : null}

        {!engineInactive ? (
          <div style={threeColumnStyle}>
            <CanvasCard theme={th} title="端點狀態概覽">
              <div style={metricGridStyle}>
                <div style={metricCardStyle}>
                  <span style={metricLabelStyle}>啟用中</span>
                  <span style={metricValueStyle}>
                    {
                      data.endpoints.filter(
                        (endpoint) => endpoint.status === "active",
                      ).length
                    }
                  </span>
                </div>
                <div style={metricCardStyle}>
                  <span style={metricLabelStyle}>待驗證</span>
                  <span style={metricValueStyle}>
                    {
                      data.endpoints.filter(
                        (endpoint) => endpoint.status === "test_pending",
                      ).length
                    }
                  </span>
                </div>
                <div style={metricCardStyle}>
                  <span style={metricLabelStyle}>失敗群聚</span>
                  <span style={metricValueStyle}>
                    {countFailureClusters(data.endpoints)}
                  </span>
                </div>
              </div>
            </CanvasCard>
            <CanvasCard
              theme={th}
              title="投遞健康度"
              subtitle={selectedWebhook ? "目前端點檢視" : "租戶整體投遞快照"}
            >
              <div style={metricGridStyle}>
                <div style={metricCardStyle}>
                  <span style={metricLabelStyle}>已送達</span>
                  <span style={metricValueStyle}>{summary.delivered}</span>
                </div>
                <div style={metricCardStyle}>
                  <span style={metricLabelStyle}>排隊中</span>
                  <span style={metricValueStyle}>{summary.queued}</span>
                </div>
                <div style={metricCardStyle}>
                  <span style={metricLabelStyle}>失敗</span>
                  <span style={metricValueStyle}>{summary.failed}</span>
                </div>
              </div>
            </CanvasCard>
            <CanvasCard
              theme={th}
              title="重播姿態"
              subtitle="重試仍由契約驅動。介面只呈現狀態，不會自行發明重播引擎。"
            >
              <div style={replayGridStyle}>
                <div style={metricCardStyle}>
                  <span style={metricLabelStyle}>可重試失敗</span>
                  <span style={metricValueStyle}>
                    {
                      scopedDeliveries.filter((delivery) =>
                        getDeliveryActions(delivery, statusFilter).some(
                          (action) =>
                            action.action === "retryFailedDelivery" &&
                            action.enabled,
                        ),
                      ).length
                    }
                  </span>
                </div>
                <div style={metricCardStyle}>
                  <span style={metricLabelStyle}>排隊中的重試</span>
                  <span style={metricValueStyle}>{summary.queued}</span>
                </div>
              </div>
            </CanvasCard>
          </div>
        ) : null}

        {!engineInactive &&
        (mode === "create" || mode === "edit") &&
        (mode !== "edit" || selectedWebhook) &&
        (mode !== "create" ||
          Boolean(findAction(pageActions, "createWebhookEndpoint")?.enabled)) &&
        (mode !== "edit" ||
          Boolean(
            findAction(selectedEndpointActions, "updateWebhookEndpoint")
              ?.enabled,
          )) ? (
          <EndpointForm
            mode={mode}
            webhook={selectedWebhook}
            baselineEvents={baselineEvents}
            endpointActions={selectedEndpointActions}
          />
        ) : null}

        {!engineInactive &&
        mode === "rotate" &&
        selectedWebhook &&
        Boolean(
          findAction(selectedEndpointActions, "rotateWebhookSecret")?.enabled,
        ) ? (
          <RotateSecretForm webhook={selectedWebhook} />
        ) : null}

        {!engineInactive ? (
          <div style={twoColumnStyle}>
            <CanvasCard
              theme={th}
              title={`端點 · ${filteredEndpoints.length} 筆`}
              subtitle="可用操作會以按鈕方式呈現：啟用、停用附原因，且不會被靜默隱藏。"
              actions={
                <div style={buttonWrapStyle}>
                  {["all", "active", "test_pending", "disabled"].map(
                    (value) => {
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
                          {value === "all"
                            ? "全部"
                            : getEndpointStatusLabel(
                                value as TenantWebhookEndpointStatus,
                              )}
                        </Link>
                      );
                    },
                  )}
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
                  {endpointReason === "filtered_empty" ? (
                    <div style={{ marginTop: 12 }}>
                      <Link href="/webhooks" style={getLinkButtonStyle()}>
                        清除篩選
                      </Link>
                    </div>
                  ) : null}
                </div>
              ) : (
                <ServerCanvasTable<EndpointRow>
                  theme={th}
                  columns={endpointColumns}
                  rows={filteredEndpoints.map(toEndpointRow)}
                />
              )}
            </CanvasCard>

            <CanvasCard
              theme={th}
              title={selectedWebhook ? "已選端點" : "動作矩陣"}
              subtitle={
                selectedWebhook
                  ? "各端點動作與狀態備註"
                  : "請先選擇一個端點，查看投遞範圍與可用動作。"
              }
            >
              {selectedWebhook ? (
                <div style={stackStyle}>
                  <div style={panelStyle}>
                    <div style={{ color: th.text, fontWeight: 600 }}>
                      {selectedWebhook.url}
                    </div>
                    <div style={codeLabelStyle}>
                      端點編號 {selectedWebhook.webhookId}
                    </div>
                    <div style={chipWrapStyle}>
                      {selectedWebhook.events.map((eventType) => (
                        <CanvasPill key={eventType} theme={th} tone="info">
                          {formatTenantCodeLabel(eventType, eventType)}
                        </CanvasPill>
                      ))}
                    </div>
                  </div>
                  <div style={buttonWrapStyle}>
                    {selectedEndpointActions.map((action, index) =>
                      renderAction(action, `endpoint-${index}`),
                    )}
                  </div>
                  {selectedWebhook.availableActions === undefined ? (
                    <p style={mutedStyle}>
                      後端尚未提供此端點的可用操作清單；畫面不會自行推導替代按鈕。
                    </p>
                  ) : null}
                  <p style={mutedStyle}>
                    端點層會保留生命週期動作；投遞層的失敗重試則會在下方投遞列表與已選投遞明細中，依後端提供的投遞操作顯示。
                  </p>
                </div>
              ) : (
                <div style={stackStyle}>
                  <CanvasBanner
                    theme={th}
                    tone="info"
                    icon="info"
                    title="請先選擇端點"
                    body="從左側列表點選「投遞紀錄」、「更新」或「輪替密鑰」即可進入各端點流程。"
                  />
                  <ul style={listStyle}>
                    <li>建立與更新都會直接送往真實後端流程。</li>
                    <li>密鑰輪替會直接送出回呼密鑰輪替請求。</li>
                    <li>
                      投遞列會直接反映失敗重試是否可用，並在可用時直接送出人工重試。
                    </li>
                  </ul>
                </div>
              )}
            </CanvasCard>
          </div>
        ) : null}

        {!engineInactive ? (
          <div style={twoColumnStyle}>
            <CanvasCard
              theme={th}
              title={selectedWebhook ? "投遞紀錄" : "近 24 小時投遞"}
              subtitle={
                selectedWebhook
                  ? `${selectedWebhook.url} · 只顯示真實引擎紀錄`
                  : "全租戶投遞串流 · 不補任何模擬重播列"
              }
              actions={
                selectedWebhook ? (
                  <Link href="/webhooks" style={getLinkButtonStyle()}>
                    清除端點範圍
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
                </div>
              ) : (
                <ServerCanvasTable<DeliveryRow>
                  theme={th}
                  columns={deliveryColumns}
                  rows={scopedDeliveries.slice(0, 12).map(toDeliveryRow)}
                  dense
                />
              )}
            </CanvasCard>

            <CanvasCard
              theme={th}
              title={selectedDelivery ? "已選投遞" : "重播與訊號"}
              subtitle={
                selectedDelivery
                  ? "每筆投遞的可執行操作都由後端直接提供。"
                  : "保留通知、整合治理與稽核的進出入口。"
              }
            >
              <div style={stackStyle}>
                {selectedDelivery ? (
                  <div style={panelStyle}>
                    <div style={{ color: th.text, fontWeight: 600 }}>
                      {formatTenantCodeLabel(
                        selectedDelivery.eventType,
                        selectedDelivery.eventType,
                      )}
                    </div>
                    <div style={detailLineStyle}>
                      <span>投遞編號</span>
                      <span style={monoStyle}>
                        {selectedDelivery.deliveryId}
                      </span>
                    </div>
                    <div style={detailLineStyle}>
                      <span>端點編號</span>
                      <span style={monoStyle}>
                        {selectedDelivery.webhookId}
                      </span>
                    </div>
                    <div style={detailLineStyle}>
                      <span>簽章</span>
                      <span style={monoStyle}>
                        {selectedDelivery.signature}
                      </span>
                    </div>
                    <div style={detailLineStyle}>
                      <span>嘗試次數</span>
                      <span style={monoStyle}>{selectedDelivery.attempt}</span>
                    </div>
                    <div style={buttonWrapStyle}>
                      {selectedDeliveryActions.map((action, index) =>
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
                        清除投遞範圍
                      </Link>
                    </div>
                    <p style={mutedStyle}>
                      重試按鈕會直接依照後端提供的投遞操作顯示；可用時會直接送出人工重試請求。
                    </p>
                    {selectedDelivery.availableActions === undefined ? (
                      <p style={mutedStyle}>
                        這筆投遞尚未提供可用操作清單，因此不顯示替代重播按鈕。
                      </p>
                    ) : null}
                  </div>
                ) : null}
                <div style={panelStyle}>
                  <div style={{ color: th.text, fontWeight: 600 }}>
                    通知動態
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
                      目前通知串流沒有回呼 / 投遞相關項目。
                    </p>
                  )}
                  <Link href="/notifications" style={secondaryLinkStyle}>
                    開啟通知偏好
                  </Link>
                </div>
                <div style={panelStyle}>
                  <div style={{ color: th.text, fontWeight: 600 }}>
                    重播說明
                  </div>
                  <p style={mutedStyle}>
                    本頁的重播只執行後端已公開的重試流程。若失敗重試尚未啟用，畫面會保留停用原因，而不會補出未授權的重播按鈕。
                  </p>
                  <p style={mutedStyle}>
                    需要跨系統排查時，請使用頁面底部的深連結前往營運分流、治理或稽核頁面。
                  </p>
                </div>
              </div>
            </CanvasCard>
          </div>
        ) : null}

        <CanvasCard
          theme={th}
          title="跨系統連結"
          subtitle="保留通知、整合治理、稽核與營運排查入口。"
        >
          <div style={stackStyle}>
            <div style={buttonWrapStyle}>
              <Link href="/notifications" style={getLinkButtonStyle()}>
                通知偏好
              </Link>
              <Link href="/integration-governance" style={getLinkButtonStyle()}>
                整合治理
              </Link>
              <Link href="/audit" style={getLinkButtonStyle()}>
                租戶稽核軌跡
              </Link>
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
                    尚未設定外部系統網址；請補上 `NEXT_PUBLIC_OPS_CONSOLE_URL`
                    或 `NEXT_PUBLIC_PLATFORM_ADMIN_URL` 後，才能啟用新分頁跳轉。
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </CanvasCard>
      </div>
    </div>
  );
}
