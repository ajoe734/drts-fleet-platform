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
import { getServerLocale } from "@/lib/server-locale";
import { type Locale, t } from "@/lib/translations";
import { SecretRevealCard } from "./secret-reveal-card";

export const dynamic = "force-dynamic";

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

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

function toErrorMessage(error: unknown, locale: Locale) {
  return error instanceof Error
    ? error.message
    : t("webhooks.error.unknown", locale);
}

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
  if (status === "active") return "active";
  if (status === "test_pending") return "test_pending";
  return "disabled";
}

function getEndpointLastActivity(
  endpoint: TenantWebhookEndpoint,
  locale: Locale,
) {
  const metadata = endpoint.runtimeMetadata;
  if (endpoint.status === "active" && metadata?.lastDeliveredAt) {
    return t("webhooks.lastActivity.delivered", locale, {
      time: formatRelativeTime(metadata.lastDeliveredAt),
    });
  }
  if (metadata?.lastAttemptAt) {
    return t("webhooks.lastActivity.attempt", locale, {
      time: formatRelativeTime(metadata.lastAttemptAt),
    });
  }
  if (endpoint.status === "disabled" && metadata?.disabledAt) {
    return t("webhooks.lastActivity.disabled", locale, {
      time: formatRelativeTime(metadata.disabledAt),
    });
  }
  return formatDateTime(endpoint.updatedAt);
}

function getEndpointHealth(endpoint: TenantWebhookEndpoint, locale: Locale) {
  const runtime = endpoint.runtimeMetadata;
  const failures = runtime?.failedDeliveryCount ?? 0;
  const deliveries = runtime?.deliveryCount ?? 0;

  if (endpoint.status === "disabled") {
    return {
      label:
        runtime?.disableReason === "delivery_failed"
          ? t("webhooks.health.disabledAfterFailureCluster", locale)
          : t("webhooks.health.manuallyPaused", locale),
      tone: "warn" as CanvasTone,
    };
  }

  if (endpoint.status === "test_pending") {
    return {
      label: t("webhooks.health.awaitingTestTraffic", locale),
      tone: "accent" as CanvasTone,
    };
  }

  if (failures > 0) {
    return {
      label: t("webhooks.health.failedOfDeliveries", locale, {
        failures,
        deliveries,
      }),
      tone: "danger" as CanvasTone,
    };
  }

  return {
    label:
      deliveries > 0
        ? t("webhooks.health.deliveriesHealthy", locale, { deliveries })
        : t("webhooks.health.healthy", locale),
    tone: "success" as CanvasTone,
  };
}

function toEndpointRow(
  endpoint: TenantWebhookEndpoint,
  locale: Locale,
): EndpointRow {
  const health = getEndpointHealth(endpoint, locale);
  return {
    webhookId: endpoint.webhookId,
    url: endpoint.url,
    events: endpoint.events,
    statusLabel: getEndpointStatusLabel(endpoint.status),
    statusTone: getEndpointStatusTone(endpoint.status),
    secretLabel: `v${endpoint.secretVersion} · ${endpoint.secretPreview}`,
    healthLabel: health.label,
    healthTone: health.tone,
    lastActivity: getEndpointLastActivity(endpoint, locale),
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

function toDeliveryRow(
  delivery: WebhookDeliveryRecord,
  locale: Locale,
): DeliveryRow {
  return {
    deliveryId: delivery.deliveryId,
    webhookId: delivery.webhookId,
    eventType: delivery.eventType,
    statusLabel:
      delivery.status === "delivery_failed"
        ? t("webhooks.delivery.failed", locale)
        : delivery.status,
    statusTone: getDeliveryStatusTone(delivery.status),
    codeLabel:
      delivery.httpStatus === null
        ? t("webhooks.delivery.timeout", locale)
        : String(delivery.httpStatus),
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
  locale: Locale,
): EmptyStateCopy {
  switch (reason) {
    case "not_provisioned":
      return {
        title: t("webhooks.empty.notProvisioned.title", locale),
        body: t("webhooks.empty.notProvisioned.body", locale),
        tone: "warn",
      };
    case "permission_denied":
      return {
        title: t("webhooks.empty.permissionDenied.title", locale),
        body: t("webhooks.empty.permissionDenied.body", locale),
        tone: "danger",
      };
    case "external_unavailable":
      return {
        title: t("webhooks.empty.externalUnavailable.title", locale),
        body: t("webhooks.empty.externalUnavailable.body", locale),
        tone: "warn",
      };
    case "fetch_failed":
      return {
        title: t("webhooks.empty.fetchFailed.title", locale),
        body: t("webhooks.empty.fetchFailed.body", locale),
        tone: "danger",
      };
    case "filtered_empty":
      return {
        title: t("webhooks.empty.filteredEmpty.title", locale),
        body: t("webhooks.empty.filteredEmpty.body", locale),
        tone: "info",
      };
    case "no_data":
    default:
      return {
        title: t("webhooks.empty.noData.title", locale),
        body: t("webhooks.empty.noData.body", locale),
        tone: "info",
      };
  }
}

function getActionLabel(action: string, locale: Locale) {
  switch (action) {
    case "payload_schema":
      return t("webhooks.action.payloadSchema", locale);
    case "createWebhookEndpoint":
      return t("webhooks.action.create", locale);
    case "updateWebhookEndpoint":
      return t("webhooks.action.update", locale);
    case "disableWebhookEndpoint":
      return t("webhooks.action.disable", locale);
    case "deleteWebhookEndpoint":
      return t("webhooks.action.delete", locale);
    case "rotateWebhookSecret":
      return t("webhooks.action.rotateSecret", locale);
    case "viewDeliveryLog":
      return t("webhooks.action.viewDeliveryLog", locale);
    case "retryFailedDelivery":
      return t("webhooks.action.retryFailed", locale);
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
  locale: Locale,
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
        label: getActionLabel(descriptor.action, locale),
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
  locale: Locale,
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
        label: getActionLabel(descriptor.action, locale),
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
  locale: Locale,
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
        label: getActionLabel(descriptor.action, locale),
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
  locale: Locale,
): ActionDescriptor[] {
  return decoratePageActions(governanceActions ?? [], locale);
}

function deriveActiveTab(
  options: {
    mode: ViewMode;
    selectedWebhookId?: string;
    selectedDeliveryId?: string;
  },
  locale: Locale,
) {
  if (options.mode === "rotate") return t("webhooks.tabLabel.replay", locale);
  if (options.selectedDeliveryId) return t("webhooks.tabLabel.replay", locale);
  if (options.selectedWebhookId)
    return t("webhooks.tabLabel.deliveries", locale);
  return t("webhooks.tabLabel.endpoints", locale);
}

function getEndpointActions(
  endpoint: TenantWebhookEndpoint,
  locale: Locale,
  statusFilter = "all",
): ActionDescriptor[] {
  return decorateEndpointActions(endpoint.availableActions ?? [], locale, {
    webhookId: endpoint.webhookId,
    status: statusFilter,
  }).map((action) =>
    action.action === "disableWebhookEndpoint" && endpoint.status === "disabled"
      ? { ...action, label: t("webhooks.action.disabled", locale) }
      : action,
  );
}

function getDeliveryActions(
  delivery: WebhookDeliveryRecord,
  locale: Locale,
  statusFilter = "all",
): ActionDescriptor[] {
  return decorateDeliveryActions(delivery.availableActions ?? [], locale, {
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

async function loadWebhooksPageData(locale: Locale): Promise<WebhooksPageData> {
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
        ? toErrorMessage(endpointsResult.reason, locale)
        : null,
    deliveryError:
      deliveriesResult.status === "rejected"
        ? toErrorMessage(deliveriesResult.reason, locale)
        : null,
    governanceError:
      governanceResult.status === "rejected"
        ? toErrorMessage(governanceResult.reason, locale)
        : null,
    readinessError:
      readinessResult.status === "rejected"
        ? toErrorMessage(readinessResult.reason, locale)
        : null,
    identityError:
      identityResult.status === "rejected"
        ? toErrorMessage(identityResult.reason, locale)
        : null,
    notificationsError:
      notificationsResult.status === "rejected"
        ? toErrorMessage(notificationsResult.reason, locale)
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
  return readiness?.status ?? "unknown";
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
  locale,
}: {
  baselineEvents: string[];
  selectedEvents?: string[];
  locale: Locale;
}) {
  const selected = new Set(selectedEvents ?? []);

  if (baselineEvents.length === 0) {
    return (
      <CanvasField theme={th} label={t("webhooks.event.label", locale)}>
        <input
          name="extraEvents"
          defaultValue={(selectedEvents ?? []).join(", ")}
          placeholder={t("webhooks.form.eventsPlaceholder", locale)}
          style={controlStyle}
        />
      </CanvasField>
    );
  }

  return (
    <CanvasField
      theme={th}
      label={t("webhooks.event.baselineLabel", locale)}
      hint={t("webhooks.event.baselineHint", locale)}
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
    throw new Error(`API error ${response.status}: ${await response.text()}`);
  }

  return response.json() as Promise<RotateWebhookSecretResponse>;
}

async function createWebhookAction(formData: FormData) {
  "use server";

  const locale = await getServerLocale();
  const client = getTenantClient();
  const events = parseEvents(formData);
  try {
    if (events.length === 0) {
      throw new Error(t("webhooks.error.atLeastOneEvent", locale));
    }

    const command: CreateTenantWebhookEndpointCommand = {
      url: String(formData.get("url") ?? "").trim(),
      secret: String(formData.get("secret") ?? "").trim(),
      events,
    };

    if (!command.url || !command.secret) {
      throw new Error(t("webhooks.error.urlAndSecretRequired", locale));
    }

    await client.createWebhookEndpoint(command);
    revalidatePath("/webhooks");
    redirect(
      `/webhooks?success=${encodeURIComponent(
        t("webhooks.success.endpointCreated", locale),
      )}`,
    );
  } catch (error) {
    redirect(
      `/webhooks?mode=create&error=${encodeURIComponent(toErrorMessage(error, locale))}`,
    );
  }
}

async function updateWebhookAction(formData: FormData) {
  "use server";

  const locale = await getServerLocale();
  const client = getTenantClient();
  const webhookId = String(formData.get("webhookId") ?? "");
  const disableReason = String(formData.get("disableReason") ?? "").trim();
  const events = parseEvents(formData);
  try {
    if (!webhookId) {
      throw new Error(t("webhooks.error.missingWebhookId", locale));
    }

    const currentEndpoints = await client.listWebhooks();
    const currentEndpoint = currentEndpoints.find(
      (endpoint) => endpoint.webhookId === webhookId,
    );
    if (!currentEndpoint) {
      throw new Error(t("webhooks.error.endpointNotFound", locale));
    }

    const command: UpdateTenantWebhookEndpointCommand = {
      url: String(formData.get("url") ?? "").trim(),
      events,
      status: String(
        formData.get("status") ?? "",
      ) as TenantWebhookEndpointStatus,
    };

    if (!command.url || !command.status || events.length === 0) {
      throw new Error(t("webhooks.error.urlStatusEventRequired", locale));
    }
    const disableAction = currentEndpoint.availableActions?.find(
      (action) => action.action === "disableWebhookEndpoint",
    );
    if (
      command.status === "disabled" &&
      currentEndpoint.status !== "disabled" &&
      !disableAction?.enabled
    ) {
      throw new Error(t("webhooks.error.disableActionUnavailable", locale));
    }
    if (command.status === "disabled" && !disableReason) {
      throw new Error(t("webhooks.error.disableReasonRequired", locale));
    }

    if (
      command.status === "disabled" &&
      currentEndpoint.status !== "disabled"
    ) {
      const nextUrl = command.url?.trim() ?? "";
      const urlChanged = nextUrl !== currentEndpoint.url;
      const eventsChanged = !sameEvents(events, currentEndpoint.events);

      if (urlChanged || eventsChanged) {
        throw new Error(t("webhooks.error.disableFlowOnlyDisable", locale));
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
        t("webhooks.success.endpointUpdated", locale),
      )}`,
    );
  } catch (error) {
    redirect(
      `/webhooks?mode=edit&webhookId=${encodeURIComponent(webhookId)}&error=${encodeURIComponent(
        toErrorMessage(error, locale),
      )}`,
    );
  }
}

async function deleteWebhookAction(formData: FormData) {
  "use server";

  const locale = await getServerLocale();
  const client = getTenantClient();
  const webhookId = String(formData.get("webhookId") ?? "");
  const deleteReason = String(formData.get("deleteReason") ?? "").trim();
  try {
    if (!webhookId) {
      throw new Error(t("webhooks.error.missingWebhookId", locale));
    }
    if (!deleteReason) {
      throw new Error(t("webhooks.error.deleteReasonRequired", locale));
    }
    const command: DeleteTenantWebhookEndpointCommand = {
      reason: deleteReason,
    };
    await client.deleteWebhookEndpoint(webhookId, command);
    revalidatePath("/webhooks");
    redirect(
      `/webhooks?success=${encodeURIComponent(
        t("webhooks.success.endpointDeleted", locale),
      )}`,
    );
  } catch (error) {
    redirect(
      `/webhooks?mode=edit&webhookId=${encodeURIComponent(webhookId)}&error=${encodeURIComponent(
        toErrorMessage(error, locale),
      )}`,
    );
  }
}

async function rotateWebhookSecretAction(formData: FormData) {
  "use server";

  const locale = await getServerLocale();
  const webhookId = String(formData.get("webhookId") ?? "");
  const endpointUrl = String(formData.get("endpointUrl") ?? "").trim();
  const secret = String(formData.get("secret") ?? "").trim();
  const rotationReason = String(formData.get("rotationReason") ?? "").trim();

  try {
    if (!webhookId || !secret) {
      throw new Error(t("webhooks.error.webhookIdAndSecretRequired", locale));
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
        t("webhooks.success.secretRotated", locale),
      )}`,
    );
  } catch (error) {
    redirect(
      `/webhooks?mode=rotate&webhookId=${encodeURIComponent(webhookId)}&error=${encodeURIComponent(
        toErrorMessage(error, locale),
      )}`,
    );
  }
}

async function retryFailedDeliveryAction(formData: FormData) {
  "use server";

  const locale = await getServerLocale();
  const client = getTenantClient();
  const webhookId = String(formData.get("webhookId") ?? "").trim();
  const deliveryId = String(formData.get("deliveryId") ?? "").trim();

  try {
    if (!webhookId || !deliveryId) {
      throw new Error(t("webhooks.error.missingWebhookOrDelivery", locale));
    }

    await client.retryWebhookDelivery(webhookId, deliveryId);
    revalidatePath("/webhooks");
    redirect(
      `/webhooks?webhookId=${encodeURIComponent(webhookId)}&deliveryId=${encodeURIComponent(deliveryId)}&success=${encodeURIComponent(
        t("webhooks.success.retrySubmitted", locale),
      )}`,
    );
  } catch (error) {
    redirect(
      `/webhooks?webhookId=${encodeURIComponent(webhookId)}&deliveryId=${encodeURIComponent(deliveryId)}&error=${encodeURIComponent(
        toErrorMessage(error, locale),
      )}`,
    );
  }
}

async function clearRotateSecretReceiptAction(formData: FormData) {
  "use server";

  const locale = await getServerLocale();
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
          t("webhooks.success.receiptClosed", locale),
        )}`
      : `/webhooks?success=${encodeURIComponent(
          t("webhooks.success.receiptClosed", locale),
        )}`,
  );
}

function EndpointForm({
  mode,
  webhook,
  baselineEvents,
  endpointActions,
  locale,
}: {
  mode: ViewMode;
  webhook?: TenantWebhookEndpoint | null;
  baselineEvents: string[];
  endpointActions?: ActionDescriptor[];
  locale: Locale;
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
      title={
        isCreate
          ? t("webhooks.form.createTitle", locale)
          : t("webhooks.form.updateTitle", locale)
      }
      subtitle={
        isCreate
          ? t("webhooks.form.createSubtitle", locale)
          : t("webhooks.form.updateSubtitle", locale)
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
          <CanvasField theme={th} label={t("webhooks.form.urlLabel", locale)}>
            <input
              name="url"
              defaultValue={webhook?.url ?? ""}
              placeholder={t("webhooks.form.urlPlaceholder", locale)}
              style={controlStyle}
            />
          </CanvasField>
          {isCreate ? (
            <CanvasField
              theme={th}
              label={t("webhooks.form.secretLabel", locale)}
              hint={t("webhooks.form.secretHint", locale)}
            >
              <input
                name="secret"
                placeholder={t("webhooks.form.secretPlaceholder", locale)}
                style={controlStyle}
              />
            </CanvasField>
          ) : (
            <CanvasField
              theme={th}
              label={t("webhooks.form.statusLabel", locale)}
              hint={
                disableAction
                  ? t("webhooks.form.statusHintWithAction", locale)
                  : t("webhooks.form.statusHintNoAction", locale)
              }
            >
              <select
                name="status"
                defaultValue={webhook?.status ?? "test_pending"}
                style={controlStyle}
              >
                <option value="active">active</option>
                <option value="test_pending">test_pending</option>
                {canShowDisabledOption ? (
                  <option value="disabled">disabled</option>
                ) : null}
              </select>
            </CanvasField>
          )}
        </div>
        <EventChecklist
          baselineEvents={baselineEvents}
          locale={locale}
          {...(webhook?.events ? { selectedEvents: webhook.events } : {})}
        />
        {baselineEvents.length > 0 ? (
          <CanvasField
            theme={th}
            label={t("webhooks.form.extraEventsLabel", locale)}
          >
            <input
              name="extraEvents"
              defaultValue={(webhook?.events ?? [])
                .filter((eventType) => !baselineEvents.includes(eventType))
                .join(", ")}
              placeholder={t("webhooks.form.extraEventsPlaceholder", locale)}
              style={controlStyle}
            />
          </CanvasField>
        ) : null}
        {!isCreate && disableAction ? (
          <CanvasField
            theme={th}
            label={t("webhooks.form.disableReasonLabel", locale)}
            hint={
              disableAction.enabled
                ? t("webhooks.form.disableReasonHintEnabled", locale)
                : t("webhooks.form.disableUnavailableHint", locale, {
                    reason:
                      disableAction.disabledReasonCode ?? "disabled_by_backend",
                  })
            }
          >
            <textarea
              name="disableReason"
              style={textareaStyle}
              placeholder={t("webhooks.form.disableReasonPlaceholder", locale)}
              disabled={!disableAction.enabled}
            />
          </CanvasField>
        ) : !isCreate ? (
          <CanvasField
            theme={th}
            label={t("webhooks.form.disableLabel", locale)}
            hint={
              webhook?.status === "disabled"
                ? t("webhooks.form.disableUnavailableAlreadyDisabled", locale)
                : t("webhooks.form.disableUnavailableReason", locale, {
                    reason: disableUnavailableReason,
                  })
            }
          >
            <input
              readOnly
              value={t("webhooks.form.disableUnavailableValue", locale)}
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
            {isCreate
              ? t("webhooks.form.submitCreate", locale)
              : t("webhooks.form.submitUpdate", locale)}
          </button>
          <Link href="/webhooks" style={getLinkButtonStyle({ size: "md" })}>
            {t("webhooks.form.cancel", locale)}
          </Link>
        </div>
      </form>
      {!isCreate && webhook ? (
        <div style={{ ...stackStyle, marginTop: 12 }}>
          <div id="high-risk" style={panelStyle}>
            <div style={{ color: th.text, fontWeight: 600 }}>
              {t("webhooks.form.highRiskTitle", locale)}
            </div>
            <p style={mutedStyle}>{t("webhooks.form.highRiskBody", locale)}</p>
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
                      placeholder={t(
                        "webhooks.form.deleteReasonPlaceholder",
                        locale,
                      )}
                    />
                    <button
                      type="submit"
                      style={{
                        ...getLinkButtonStyle({ danger: true }),
                        cursor: "pointer",
                      }}
                    >
                      {t("webhooks.form.submitDelete", locale)}
                    </button>
                  </form>
                ) : (
                  renderAction(deleteAction, `delete-${webhook.webhookId}`)
                )
              ) : (
                renderContractGap(t("webhooks.form.deleteWithheld", locale))
              )}
              {rotateAction
                ? renderAction(rotateAction, `rotate-${webhook.webhookId}`)
                : renderContractGap(t("webhooks.form.rotateWithheld", locale))}
            </div>
          </div>
        </div>
      ) : null}
    </CanvasCard>
  );
}

function RotateSecretForm({
  webhook,
  locale,
}: {
  webhook: TenantWebhookEndpoint;
  locale: Locale;
}) {
  return (
    <CanvasCard
      theme={th}
      title={t("webhooks.rotate.title", locale)}
      subtitle={t("webhooks.rotate.subtitle", locale)}
    >
      <form action={rotateWebhookSecretAction} style={formGridStyle}>
        <input type="hidden" name="webhookId" value={webhook.webhookId} />
        <input type="hidden" name="endpointUrl" value={webhook.url} />
        <div style={fieldRowStyle}>
          <CanvasField
            theme={th}
            label={t("webhooks.rotate.endpointLabel", locale)}
          >
            <input value={webhook.url} readOnly style={controlStyle} />
          </CanvasField>
          <CanvasField
            theme={th}
            label={t("webhooks.rotate.currentPreviewLabel", locale)}
          >
            <input
              value={webhook.secretPreview}
              readOnly
              style={{ ...controlStyle, fontFamily: th.monoFamily }}
            />
          </CanvasField>
        </div>
        <CanvasField
          theme={th}
          label={t("webhooks.rotate.newSecretLabel", locale)}
          hint={t("webhooks.rotate.newSecretHint", locale)}
        >
          <input
            name="secret"
            placeholder={t("webhooks.rotate.newSecretPlaceholder", locale)}
            style={controlStyle}
          />
        </CanvasField>
        <CanvasField
          theme={th}
          label={t("webhooks.rotate.reasonLabel", locale)}
          hint={t("webhooks.rotate.reasonHint", locale)}
        >
          <textarea
            name="rotationReason"
            style={textareaStyle}
            placeholder={t("webhooks.rotate.reasonPlaceholder", locale)}
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
            {t("webhooks.rotate.submit", locale)}
          </button>
          <Link href="/webhooks" style={getLinkButtonStyle({ size: "md" })}>
            {t("webhooks.form.cancel", locale)}
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
  const locale = await getServerLocale();
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

  const data = await loadWebhooksPageData(locale);
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
  const pageActions = getPageActions(data.governance?.availableActions, locale);
  const webhookReadiness = getWebhookReadiness(data.readiness);
  const selectedEndpointActions = selectedWebhook
    ? getEndpointActions(selectedWebhook, locale, statusFilter)
    : [];
  const selectedDeliveryActions = selectedDelivery
    ? getDeliveryActions(selectedDelivery, locale, statusFilter)
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
  const activeTab = deriveActiveTab(
    {
      mode,
      ...(selectedWebhookId ? { selectedWebhookId } : {}),
      ...(selectedDeliveryId ? { selectedDeliveryId } : {}),
    },
    locale,
  );
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
      t("webhooks.deepLinks.opsTriageLabel", locale),
      t("webhooks.deepLinks.opsTriageDescription", locale),
    ),
    buildExternalLink(
      PLATFORM_ADMIN_URL,
      "/audit?resourceType=webhook_endpoint",
      t("webhooks.deepLinks.platformAuditLabel", locale),
      t("webhooks.deepLinks.platformAuditDescription", locale),
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
      h: t("webhooks.col.events", locale),
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
      h: t("webhooks.col.status", locale),
      w: 120,
      r: (row) => (
        <CanvasPill theme={th} tone={row.statusTone} dot>
          {row.statusLabel}
        </CanvasPill>
      ),
    },
    {
      h: t("webhooks.col.secret", locale),
      k: "secretLabel",
      w: 160,
      mono: true,
    },
    {
      h: t("webhooks.col.health", locale),
      w: 190,
      r: (row) => (
        <CanvasPill theme={th} tone={row.healthTone}>
          {row.healthLabel}
        </CanvasPill>
      ),
    },
    {
      h: t("webhooks.col.recent", locale),
      k: "lastActivity",
      w: 180,
      mono: true,
    },
    {
      h: t("webhooks.col.actions", locale),
      w: 320,
      r: (row) => {
        const endpoint = filteredEndpoints.find(
          (item) => item.webhookId === row.webhookId,
        );
        if (!endpoint) {
          return null;
        }
        const rowActions = getEndpointActions(
          endpoint,
          locale,
          statusFilter,
        ).filter(
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
                ? renderContractGap(
                    t("webhooks.endpoint.noPublishedActions", locale),
                  )
                : renderContractGap(
                    t("webhooks.endpoint.noSupportedActions", locale),
                  )}
          </div>
        );
      },
    },
  ];

  const deliveryColumns: CanvasTableColumn<DeliveryRow>[] = [
    { h: "DLV", k: "deliveryId", w: 110, mono: true },
    { h: "WH", k: "webhookId", w: 100, mono: true },
    {
      h: t("webhooks.col.events", locale),
      k: "eventType",
      w: 220,
      mono: true,
    },
    {
      h: t("webhooks.col.status", locale),
      w: 120,
      r: (row) => (
        <CanvasPill theme={th} tone={row.statusTone}>
          {row.statusLabel}
        </CanvasPill>
      ),
    },
    {
      h: t("webhooks.col.code", locale),
      w: 90,
      align: "right",
      r: (row) => (
        <CanvasPill theme={th} tone={row.codeTone}>
          {row.codeLabel}
        </CanvasPill>
      ),
    },
    {
      h: t("webhooks.col.tries", locale),
      k: "tries",
      w: 72,
      align: "right",
      mono: true,
    },
    { h: t("webhooks.col.time", locale), k: "at", mono: true },
    {
      h: t("webhooks.col.actions", locale),
      w: 190,
      r: (row) => {
        const delivery = scopedDeliveries.find(
          (item) => item.deliveryId === row.deliveryId,
        );
        if (!delivery) {
          return null;
        }
        const rowActions = getDeliveryActions(delivery, locale, statusFilter);
        return (
          <div style={buttonWrapStyle}>
            {rowActions.length > 0
              ? rowActions.map((action, index) =>
                  renderAction(action, `${row.deliveryId}-${index}`),
                )
              : delivery.availableActions === undefined
                ? renderContractGap(
                    t("webhooks.delivery.noPublishedActions", locale),
                  )
                : renderContractGap(
                    t("webhooks.delivery.noSupportedActions", locale),
                  )}
          </div>
        );
      },
    },
  ];

  const globalErrors = [
    data.identityError
      ? t("webhooks.globalError.identity", locale, {
          error: data.identityError,
        })
      : null,
    data.governanceError
      ? t("webhooks.globalError.governance", locale, {
          error: data.governanceError,
        })
      : null,
    data.readinessError
      ? t("webhooks.globalError.readiness", locale, {
          error: data.readinessError,
        })
      : null,
    data.notificationsError
      ? t("webhooks.globalError.notifications", locale, {
          error: data.notificationsError,
        })
      : null,
  ].filter(Boolean) as string[];

  const endpointEmptyCopy = endpointReason
    ? getEmptyStateCopy(endpointReason, locale)
    : null;
  const deliveryEmptyCopy = deliveryReason
    ? getEmptyStateCopy(deliveryReason, locale)
    : null;

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title={t("webhooks.page.title", locale)}
        subtitle={t("webhooks.page.subtitle", locale)}
        tabs={[
          `${t("webhooks.tabLabel.endpoints", locale)}${data.endpoints.length > 0 ? ` · ${data.endpoints.length}` : ""}`,
          t("webhooks.tabLabel.deliveries", locale),
          t("webhooks.tabLabel.replay", locale),
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
            title={t("webhooks.card.refreshTitle", locale)}
            subtitle={t("webhooks.card.refreshSubtitle", locale)}
            actions={
              <Link href="/webhooks" style={getLinkButtonStyle()}>
                {t("webhooks.refreshNow", locale)}
              </Link>
            }
          >
            <div style={metricGridStyle}>
              <div style={metricCardStyle}>
                <span style={metricLabelStyle}>
                  {t("webhooks.metric.refreshTier", locale)}
                </span>
                <span style={metricValueStyle}>T5</span>
                <p style={mutedStyle}>
                  {t("webhooks.metric.refreshTierLabel", locale)}
                </p>
              </div>
              <div style={metricCardStyle}>
                <span style={metricLabelStyle}>
                  {t("webhooks.metric.snapshot", locale)}
                </span>
                <span style={{ ...metricValueStyle, fontSize: 18 }}>
                  {formatDateTime(
                    data.governance?.generatedAt ?? data.loadedAt,
                  )}
                </span>
                <p style={mutedStyle}>
                  {t("webhooks.metric.snapshotHint", locale)}
                </p>
              </div>
              <div style={metricCardStyle}>
                <span style={metricLabelStyle}>
                  {t("webhooks.metric.scope", locale)}
                </span>
                <span style={{ ...metricValueStyle, fontSize: 18 }}>
                  {selectedWebhook
                    ? t("webhooks.metric.scopeSingle", locale)
                    : t("webhooks.metric.scopeTenantWide", locale)}
                </span>
                <p style={mutedStyle}>
                  {selectedWebhook
                    ? selectedWebhook.url
                    : t("webhooks.metric.scopeAllEndpoints", locale)}
                </p>
              </div>
              <div style={metricCardStyle}>
                <span style={metricLabelStyle}>
                  {t("webhooks.metric.readiness", locale)}
                </span>
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
                  {webhookReadiness?.detail ??
                    t("webhooks.readiness.unavailable", locale)}
                </p>
              </div>
            </div>
          </CanvasCard>

          <CanvasCard
            theme={th}
            title={t("webhooks.card.policyTitle", locale)}
            subtitle={t("webhooks.card.policySubtitle", locale)}
          >
            <div style={stackStyle}>
              <div style={detailLineStyle}>
                <span>{t("webhooks.policy.testEvent", locale)}</span>
                <span style={monoStyle}>
                  {data.governance?.webhookPolicy.testEventType ?? "—"}
                </span>
              </div>
              <div style={detailLineStyle}>
                <span>{t("webhooks.policy.retryPolicy", locale)}</span>
                <span style={monoStyle}>
                  {data.governance
                    ? t("webhooks.policy.retryAttempts", locale, {
                        count:
                          data.governance.webhookPolicy.retryPolicy.maxAttempts,
                      })
                    : "—"}
                </span>
              </div>
              <div style={detailLineStyle}>
                <span>{t("webhooks.policy.failureNotification", locale)}</span>
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
            title={t("webhooks.card.payloadTitle", locale)}
            subtitle={t("webhooks.card.payloadSubtitle", locale)}
          >
            <div style={stackStyle}>
              <div style={detailLineStyle}>
                <span>{t("webhooks.policy.testEvent", locale)}</span>
                <span style={monoStyle}>
                  {data.governance?.webhookPolicy.testEventType ?? "—"}
                </span>
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                <span style={metricLabelStyle}>
                  {t("webhooks.payload.baselineEvents", locale)}
                </span>
                {baselineEvents.length > 0 ? (
                  <div style={chipWrapStyle}>
                    {baselineEvents.map((eventType) => (
                      <CanvasPill key={eventType} theme={th} tone="info">
                        {eventType}
                      </CanvasPill>
                    ))}
                  </div>
                ) : (
                  <p style={mutedStyle}>
                    {t("webhooks.payload.noBaseline", locale)}
                  </p>
                )}
              </div>
              <p style={mutedStyle}>{t("webhooks.payload.note", locale)}</p>
            </div>
          </CanvasCard>
        </div>

        {success ? (
          <CanvasBanner
            theme={th}
            tone="success"
            icon="check"
            title={t("webhooks.banner.successTitle", locale)}
            body={success}
          />
        ) : null}

        {error ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title={t("webhooks.banner.errorTitle", locale)}
            body={error}
          />
        ) : null}

        {secretReceiptExpired ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title={t("webhooks.banner.receiptExpiredTitle", locale)}
            body={t("webhooks.banner.receiptExpiredBody", locale)}
          />
        ) : null}

        {rotateSecretReceipt ? (
          <CanvasCard
            theme={th}
            title={t("webhooks.card.receiptTitle", locale)}
            subtitle={t("webhooks.card.receiptSubtitle", locale)}
          >
            <SecretRevealCard
              theme={th}
              title={t("webhooks.receipt.title", locale)}
              subtitle={t("webhooks.receipt.subtitle", locale)}
              body={t("webhooks.receipt.body", locale)}
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
            title={t("webhooks.banner.partialReadModelsTitle", locale)}
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
            title={t("webhooks.banner.readinessTitle", locale, {
              status: webhookReadiness.status,
            })}
            body={
              webhookReadiness.detail ??
              t("webhooks.banner.readinessBody", locale)
            }
          />
        ) : null}

        {createModeBlocked ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title={t("webhooks.banner.createBlockedTitle", locale)}
            body={
              createAction?.disabledReasonCode
                ? t("webhooks.banner.createBlockedBodyReason", locale, {
                    reason: createAction.disabledReasonCode,
                  })
                : t("webhooks.banner.createBlockedBodyNoFallback", locale)
            }
          />
        ) : null}

        {editModeBlocked ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title={t("webhooks.banner.editBlockedTitle", locale)}
            body={t("webhooks.banner.editBlockedBody", locale)}
          />
        ) : null}

        {rotateModeBlocked ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title={t("webhooks.banner.rotateBlockedTitle", locale)}
            body={t("webhooks.banner.rotateBlockedBody", locale)}
          />
        ) : null}

        {engineInactive && endpointEmptyCopy ? (
          <CanvasCard
            theme={th}
            title={t("webhooks.card.engineTitle", locale)}
            subtitle={t("webhooks.card.engineSubtitle", locale)}
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
                  {t("webhooks.engine.openGovernance", locale)}
                </Link>
                <Link href="/notifications" style={getLinkButtonStyle()}>
                  {t("webhooks.engine.notificationRouting", locale)}
                </Link>
              </div>
              <p style={mutedStyle}>{t("webhooks.engine.note", locale)}</p>
            </div>
          </CanvasCard>
        ) : null}

        {!engineInactive ? (
          <div style={threeColumnStyle}>
            <CanvasCard
              theme={th}
              title={t("webhooks.card.endpointStatusTitle", locale)}
            >
              <div style={metricGridStyle}>
                <div style={metricCardStyle}>
                  <span style={metricLabelStyle}>
                    {t("webhooks.status.active", locale)}
                  </span>
                  <span style={metricValueStyle}>
                    {
                      data.endpoints.filter(
                        (endpoint) => endpoint.status === "active",
                      ).length
                    }
                  </span>
                </div>
                <div style={metricCardStyle}>
                  <span style={metricLabelStyle}>
                    {t("webhooks.status.testPending", locale)}
                  </span>
                  <span style={metricValueStyle}>
                    {
                      data.endpoints.filter(
                        (endpoint) => endpoint.status === "test_pending",
                      ).length
                    }
                  </span>
                </div>
                <div style={metricCardStyle}>
                  <span style={metricLabelStyle}>
                    {t("webhooks.status.failureCluster", locale)}
                  </span>
                  <span style={metricValueStyle}>
                    {countFailureClusters(data.endpoints)}
                  </span>
                </div>
              </div>
            </CanvasCard>
            <CanvasCard
              theme={th}
              title={t("webhooks.card.deliveryHealthTitle", locale)}
              subtitle={
                selectedWebhook
                  ? t("webhooks.card.deliveryHealthSubtitleSelected", locale)
                  : t("webhooks.card.deliveryHealthSubtitleTenant", locale)
              }
            >
              <div style={metricGridStyle}>
                <div style={metricCardStyle}>
                  <span style={metricLabelStyle}>
                    {t("webhooks.status.delivered", locale)}
                  </span>
                  <span style={metricValueStyle}>{summary.delivered}</span>
                </div>
                <div style={metricCardStyle}>
                  <span style={metricLabelStyle}>
                    {t("webhooks.status.queued", locale)}
                  </span>
                  <span style={metricValueStyle}>{summary.queued}</span>
                </div>
                <div style={metricCardStyle}>
                  <span style={metricLabelStyle}>
                    {t("webhooks.status.failed", locale)}
                  </span>
                  <span style={metricValueStyle}>{summary.failed}</span>
                </div>
              </div>
            </CanvasCard>
            <CanvasCard
              theme={th}
              title={t("webhooks.card.replayStatusTitle", locale)}
              subtitle={t("webhooks.card.replayStatusSubtitle", locale)}
            >
              <div style={replayGridStyle}>
                <div style={metricCardStyle}>
                  <span style={metricLabelStyle}>
                    {t("webhooks.replay.retryableFailed", locale)}
                  </span>
                  <span style={metricValueStyle}>
                    {
                      scopedDeliveries.filter((delivery) =>
                        getDeliveryActions(delivery, locale, statusFilter).some(
                          (action) =>
                            action.action === "retryFailedDelivery" &&
                            action.enabled,
                        ),
                      ).length
                    }
                  </span>
                </div>
                <div style={metricCardStyle}>
                  <span style={metricLabelStyle}>
                    {t("webhooks.replay.queuedRetries", locale)}
                  </span>
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
            locale={locale}
          />
        ) : null}

        {!engineInactive &&
        mode === "rotate" &&
        selectedWebhook &&
        Boolean(
          findAction(selectedEndpointActions, "rotateWebhookSecret")?.enabled,
        ) ? (
          <RotateSecretForm webhook={selectedWebhook} locale={locale} />
        ) : null}

        {!engineInactive ? (
          <div style={twoColumnStyle}>
            <CanvasCard
              theme={th}
              title={t("webhooks.card.endpointListTitle", locale, {
                count: filteredEndpoints.length,
              })}
              subtitle={t("webhooks.card.endpointListSubtitle", locale)}
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
                          {value}
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
                        {t("webhooks.filter.clear", locale)}
                      </Link>
                    </div>
                  ) : null}
                </div>
              ) : (
                <CanvasTable<EndpointRow>
                  theme={th}
                  columns={endpointColumns}
                  rows={filteredEndpoints.map((endpoint) =>
                    toEndpointRow(endpoint, locale),
                  )}
                />
              )}
            </CanvasCard>

            <CanvasCard
              theme={th}
              title={
                selectedWebhook
                  ? t("webhooks.card.selectedEndpointTitle", locale)
                  : t("webhooks.card.actionMatrixTitle", locale)
              }
              subtitle={
                selectedWebhook
                  ? t("webhooks.card.selectedEndpointSubtitle", locale)
                  : t("webhooks.card.actionMatrixSubtitle", locale)
              }
            >
              {selectedWebhook ? (
                <div style={stackStyle}>
                  <div style={panelStyle}>
                    <div style={{ color: th.text, fontWeight: 600 }}>
                      {selectedWebhook.url}
                    </div>
                    <div style={codeLabelStyle}>
                      {selectedWebhook.webhookId}
                    </div>
                    <div style={chipWrapStyle}>
                      {selectedWebhook.events.map((eventType) => (
                        <CanvasPill key={eventType} theme={th} tone="info">
                          {eventType}
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
                      {t("webhooks.endpoint.noActionsPublished", locale)}
                    </p>
                  ) : null}
                  <p style={mutedStyle}>
                    {t("webhooks.endpoint.lifecycleNote", locale)}
                  </p>
                </div>
              ) : (
                <div style={stackStyle}>
                  <CanvasBanner
                    theme={th}
                    tone="info"
                    icon="info"
                    title={t("webhooks.endpoint.selectTitle", locale)}
                    body={t("webhooks.endpoint.selectBody", locale)}
                  />
                  <ul style={listStyle}>
                    <li>{t("webhooks.endpoint.bullet1", locale)}</li>
                    <li>{t("webhooks.endpoint.bullet2", locale)}</li>
                    <li>{t("webhooks.endpoint.bullet3", locale)}</li>
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
              title={
                selectedWebhook
                  ? t("webhooks.card.deliveryLogTitle", locale)
                  : t("webhooks.card.recentDeliveriesTitle", locale)
              }
              subtitle={
                selectedWebhook
                  ? t("webhooks.card.deliveryLogSubtitleSelected", locale, {
                      url: selectedWebhook.url,
                    })
                  : t("webhooks.card.deliveryLogSubtitleTenant", locale)
              }
              actions={
                selectedWebhook ? (
                  <Link href="/webhooks" style={getLinkButtonStyle()}>
                    {t("webhooks.delivery.clearEndpointScope", locale)}
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
                <CanvasTable<DeliveryRow>
                  theme={th}
                  columns={deliveryColumns}
                  rows={scopedDeliveries
                    .slice(0, 12)
                    .map((delivery) => toDeliveryRow(delivery, locale))}
                  dense
                />
              )}
            </CanvasCard>

            <CanvasCard
              theme={th}
              title={
                selectedDelivery
                  ? t("webhooks.card.selectedDeliveryTitle", locale)
                  : t("webhooks.card.replaySignalsTitle", locale)
              }
              subtitle={
                selectedDelivery
                  ? t("webhooks.card.selectedDeliverySubtitle", locale)
                  : t("webhooks.card.replaySignalsSubtitle", locale)
              }
            >
              <div style={stackStyle}>
                {selectedDelivery ? (
                  <div style={panelStyle}>
                    <div style={{ color: th.text, fontWeight: 600 }}>
                      {selectedDelivery.eventType}
                    </div>
                    <div style={detailLineStyle}>
                      <span>
                        {t("webhooks.delivery.deliveryLabel", locale)}
                      </span>
                      <span style={monoStyle}>
                        {selectedDelivery.deliveryId}
                      </span>
                    </div>
                    <div style={detailLineStyle}>
                      <span>
                        {t("webhooks.delivery.endpointLabel", locale)}
                      </span>
                      <span style={monoStyle}>
                        {selectedDelivery.webhookId}
                      </span>
                    </div>
                    <div style={detailLineStyle}>
                      <span>
                        {t("webhooks.delivery.signatureLabel", locale)}
                      </span>
                      <span style={monoStyle}>
                        {selectedDelivery.signature}
                      </span>
                    </div>
                    <div style={detailLineStyle}>
                      <span>{t("webhooks.delivery.attemptLabel", locale)}</span>
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
                        {t("webhooks.delivery.clearDeliveryScope", locale)}
                      </Link>
                    </div>
                    <p style={mutedStyle}>
                      {t("webhooks.delivery.retryNote", locale)}
                    </p>
                    {selectedDelivery.availableActions === undefined ? (
                      <p style={mutedStyle}>
                        {t("webhooks.delivery.noFallbackReplay", locale)}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                <div style={panelStyle}>
                  <div style={{ color: th.text, fontWeight: 600 }}>
                    {t("webhooks.feed.title", locale)}
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
                    <p style={mutedStyle}>{t("webhooks.feed.empty", locale)}</p>
                  )}
                  <Link href="/notifications" style={secondaryLinkStyle}>
                    {t("webhooks.feed.openPreferences", locale)}
                  </Link>
                </div>
                <div style={panelStyle}>
                  <div style={{ color: th.text, fontWeight: 600 }}>
                    {t("webhooks.replay.notesTitle", locale)}
                  </div>
                  <p style={mutedStyle}>
                    {t("webhooks.replay.notesBody1", locale)}
                  </p>
                  <p style={mutedStyle}>
                    {t("webhooks.replay.notesBody2", locale)}
                  </p>
                </div>
              </div>
            </CanvasCard>
          </div>
        ) : null}

        <CanvasCard
          theme={th}
          title={t("webhooks.deepLinks.title", locale)}
          subtitle={t("webhooks.deepLinks.subtitle", locale)}
        >
          <div style={stackStyle}>
            <div style={buttonWrapStyle}>
              <Link href="/notifications" style={getLinkButtonStyle()}>
                {t("webhooks.deepLinks.notificationPreferences", locale)}
              </Link>
              <Link href="/integration-governance" style={getLinkButtonStyle()}>
                {t("webhooks.deepLinks.integrationGovernance", locale)}
              </Link>
              <Link href="/audit" style={getLinkButtonStyle()}>
                {t("webhooks.deepLinks.tenantAudit", locale)}
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
                    {t("webhooks.deepLinks.missingBaseUrl", locale)}
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
