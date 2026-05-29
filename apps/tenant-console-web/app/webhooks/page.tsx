import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import type {
  CrossAppResourceLink,
  EmptyReason,
  ResourceActionDescriptor,
  TenantIntegrationGovernancePackage,
  TenantIntegrationReadinessSummary,
  TenantWebhookEndpoint,
  TenantWebhookEndpointStatus,
  UiRefreshMetadata,
  WebhookDeliveryRecord,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasCard,
  CanvasField,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  WorkflowEmptyState,
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

const REFRESH_TIER_LABEL = "T5 Tenant slow · 30s";

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const metaGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: 12,
};

const metaCardStyle: CSSProperties = {
  border: `1px solid ${th.border}`,
  borderRadius: 14,
  background: th.surface,
  padding: "12px 14px",
  display: "grid",
  gap: 6,
};

const metaLabelStyle: CSSProperties = {
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: 0.4,
  textTransform: "uppercase",
  color: th.textMuted,
};

const metaValueStyle: CSSProperties = {
  color: th.text,
  fontSize: 12.5,
  lineHeight: 1.45,
};

const actionRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const actionLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  minHeight: 28,
  padding: "5px 10px",
  borderRadius: 7,
  border: `1px solid ${th.border}`,
  background: th.surface,
  color: th.text,
  fontSize: 12,
  fontWeight: 500,
  textDecoration: "none",
  lineHeight: 1,
};

const actionLinkPrimaryStyle: CSSProperties = {
  ...actionLinkStyle,
  background: th.accent,
  borderColor: th.accent,
  color: "#fff",
};

const actionLinkDangerStyle: CSSProperties = {
  ...actionLinkStyle,
  borderColor: th.danger,
  color: th.danger,
};

const disabledActionStyle: CSSProperties = {
  ...actionLinkStyle,
  opacity: 0.55,
  cursor: "not-allowed",
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
  color: "#fff",
  fontSize: 12,
  fontWeight: 500,
  lineHeight: 1,
  cursor: "pointer",
  fontFamily: th.fontFamily,
};

const dangerSubmitButtonStyle: CSSProperties = {
  ...submitButtonStyle,
  borderColor: th.danger,
  background: th.danger,
};

const inlineStackStyle: CSSProperties = {
  display: "grid",
  gap: 10,
};

const pillWrapStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 4,
  whiteSpace: "normal",
};

const endpointCellStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  minWidth: 0,
};

const endpointPrimaryStyle: CSSProperties = {
  color: th.text,
  fontWeight: 600,
  overflowWrap: "anywhere",
};

const endpointMetaStyle: CSSProperties = {
  color: th.textDim,
  fontSize: 11,
  fontFamily: th.monoFamily,
};

const sectionGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.5fr) minmax(320px, 1fr)",
  gap: 16,
};

const detailStackStyle: CSSProperties = {
  display: "grid",
  gap: 12,
};

const fieldGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const nativeInputStyle: CSSProperties = {
  width: "100%",
  background: th.bgRaised,
  border: `1px solid ${th.border}`,
  borderRadius: 7,
  padding: "8px 10px",
  fontSize: 12.5,
  color: th.text,
  outline: "none",
  fontFamily: th.fontFamily,
  boxSizing: "border-box",
};

const nativeTextAreaStyle: CSSProperties = {
  ...nativeInputStyle,
  minHeight: 88,
  resize: "vertical",
};

const helperTextStyle: CSSProperties = {
  fontSize: 11,
  lineHeight: 1.45,
  color: th.textMuted,
};

const monospaceTextStyle: CSSProperties = {
  fontFamily: th.monoFamily,
  fontSize: 11.5,
};

const dividerStyle: CSSProperties = {
  height: 1,
  background: th.border,
};

const cardSectionLabelStyle: CSSProperties = {
  fontSize: 10.5,
  textTransform: "uppercase",
  letterSpacing: 0.4,
  color: th.textMuted,
  fontWeight: 600,
};

const keyValueListStyle: CSSProperties = {
  display: "grid",
  gap: 8,
};

const statusRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
};

const smallLinkStyle: CSSProperties = {
  color: th.accent,
  fontSize: 11.5,
  textDecoration: "none",
};

const dangerNoteStyle: CSSProperties = {
  color: th.danger,
  fontSize: 11.5,
  lineHeight: 1.45,
};

const dateTimeFormatter = new Intl.DateTimeFormat("zh-Hant", {
  dateStyle: "short",
  timeStyle: "short",
});

const relativeTimeFormatter = new Intl.RelativeTimeFormat("zh-TW", {
  numeric: "auto",
});

type EndpointRow = Record<string, unknown> & {
  webhookId: string;
  endpoint: ReactNode;
  events: string[];
  statusLabel: string;
  statusTone: CanvasTone;
  health: string;
  lastActivity: string;
};

type ActionableEndpoint = TenantWebhookEndpoint & {
  availableActions?: ResourceActionDescriptor[];
};

type ActionableDeliveryRecord = WebhookDeliveryRecord & {
  availableActions?: ResourceActionDescriptor[];
};

type DeliveryRow = Record<string, unknown> & {
  deliveryId: string;
  webhookId: string;
  eventType: string;
  endpointUrl: string;
  statusLabel: string;
  statusTone: CanvasTone;
  codeLabel: string;
  codeTone: CanvasTone;
  tries: number;
  at: string;
  signature: string;
};

type EmptyStateModel = {
  reason: EmptyReason;
  title: string;
  description: string;
  tone: "neutral" | "warning" | "success" | "tenant";
  actions?: ResourceActionDescriptor[];
};

type WebhooksPageData = {
  endpoints: ActionableEndpoint[];
  deliveries: ActionableDeliveryRecord[];
  governance: TenantIntegrationGovernancePackage | null;
  readiness: TenantIntegrationReadinessSummary | null;
  errors: string[];
  refresh: UiRefreshMetadata;
};

type SearchParamInput = Promise<{
  webhookId?: string;
  create?: string;
  edit?: string;
  emptyReason?: string;
  success?: string;
  error?: string;
}>;

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
  return dateTimeFormatter.format(parsed);
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

function compareWebhookStatus(
  left: TenantWebhookEndpointStatus,
  right: TenantWebhookEndpointStatus,
) {
  const rank: Record<TenantWebhookEndpointStatus, number> = {
    active: 0,
    test_pending: 1,
    disabled: 2,
  };
  return rank[left]! - rank[right]!;
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

function getEndpointStateLabel(status: TenantWebhookEndpointStatus) {
  if (status === "active") return "active";
  if (status === "test_pending") return "test_pending";
  return "disabled";
}

function getDeliveryStatusTone(delivery: WebhookDeliveryRecord): CanvasTone {
  if (delivery.status === "delivered") return "success";
  if (delivery.status === "queued") return "accent";
  return "danger";
}

function getDeliveryCodeTone(code: number | null): CanvasTone {
  if (code === null) return "neutral";
  if (code >= 200 && code < 300) return "success";
  if (code >= 300 && code < 400) return "warn";
  return "danger";
}

function getDeliveryCodeLabel(delivery: WebhookDeliveryRecord) {
  return delivery.httpStatus === null ? "—" : String(delivery.httpStatus);
}

function summarizeEndpointHealth(
  endpoint: TenantWebhookEndpoint,
  deliveries: WebhookDeliveryRecord[],
) {
  const runtime = endpoint.runtimeMetadata;
  const relatedDeliveries = deliveries.filter(
    (delivery) => delivery.webhookId === endpoint.webhookId,
  );
  const failedCount =
    runtime?.failedDeliveryCount ??
    relatedDeliveries.filter(
      (delivery) => delivery.status === "delivery_failed",
    ).length;
  const deliveryCount = runtime?.deliveryCount ?? relatedDeliveries.length;
  const queuedCount = relatedDeliveries.filter(
    (delivery) => delivery.status === "queued",
  ).length;
  const failureRatio =
    deliveryCount > 0 ? Math.round((failedCount / deliveryCount) * 100) : 0;

  if (endpoint.status === "disabled") {
    return runtime?.disableReason
      ? `disabled · ${runtime.disableReason}`
      : `disabled · ${formatRelativeTime(runtime?.disabledAt ?? endpoint.updatedAt)}`;
  }

  if (failedCount > 0) {
    return `fail ${failedCount}/${deliveryCount || failedCount} · ${failureRatio}%`;
  }

  if (queuedCount > 0) {
    return `queued ${queuedCount} · next ${formatRelativeTime(runtime?.nextAttemptAt)}`;
  }

  if (deliveryCount > 0) {
    return `healthy · ${deliveryCount} deliveries`;
  }

  if (endpoint.status === "test_pending") {
    return "pending initial validation";
  }

  return "no deliveries yet";
}

function getEndpointLastActivity(endpoint: TenantWebhookEndpoint) {
  const metadata = endpoint.runtimeMetadata;
  if (metadata?.lastDeliveredAt) {
    return `last ok · ${formatRelativeTime(metadata.lastDeliveredAt)}`;
  }
  if (metadata?.lastAttemptAt) {
    return `last try · ${formatRelativeTime(metadata.lastAttemptAt)}`;
  }
  if (endpoint.status === "disabled") {
    return `disabled · ${formatRelativeTime(metadata?.disabledAt ?? endpoint.updatedAt)}`;
  }
  return `updated · ${formatRelativeTime(endpoint.updatedAt)}`;
}

function getCrossAppFailureLink(
  selectedWebhookId: string | null,
): CrossAppResourceLink {
  return {
    targetApp: "platform-admin",
    route: selectedWebhookId
      ? `/health?tab=webhook&webhookId=${encodeURIComponent(selectedWebhookId)}`
      : "/health?tab=webhook",
    resourceType: "webhook_delivery_engine",
    resourceId: selectedWebhookId ?? "tenant-webhook-overview",
    openMode: "new_tab",
    label: "在 Platform Admin 檢查 webhook queue",
  };
}

function getEndpointActions(
  endpoint: ActionableEndpoint,
): ResourceActionDescriptor[] {
  if (endpoint.availableActions && endpoint.availableActions.length > 0) {
    return endpoint.availableActions;
  }

  return [
    {
      action: "view_delivery_log",
      enabled: true,
      riskLevel: "low",
    },
    {
      action: "update_endpoint",
      enabled: true,
      riskLevel: "medium",
    },
    {
      action: "disable_endpoint",
      enabled: endpoint.status !== "disabled",
      requiresReason: true,
      riskLevel: "high",
      ...(endpoint.status === "disabled"
        ? { disabledReasonCode: "already_disabled" }
        : {}),
    },
    {
      action: "delete_endpoint",
      enabled: true,
      requiresReason: true,
      riskLevel: "high",
    },
    {
      action: "rotate_secret",
      enabled: true,
      requiresReason: true,
      riskLevel: "high",
    },
    {
      action: "retry_failed_delivery",
      enabled: false,
      disabledReasonCode: "engine_auto_retry_only",
      riskLevel: "medium",
    },
  ];
}

function getPageActions(
  engineActive: boolean,
  endpoints: ActionableEndpoint[],
  readiness: TenantIntegrationReadinessSummary | null,
): ResourceActionDescriptor[] {
  const uniqueActions = new Map<string, ResourceActionDescriptor>();
  const webhookReadiness =
    readiness?.items.find((item) => item.subSystem === "webhooks") ?? null;
  const fallbackCreateAction: ResourceActionDescriptor =
    webhookReadiness?.nextAction ?? {
      action: "create_endpoint",
      enabled: engineActive,
      riskLevel: "medium",
      ...(engineActive ? {} : { disabledReasonCode: "engine_not_provisioned" }),
    };

  for (const endpoint of endpoints) {
    for (const descriptor of endpoint.availableActions ?? []) {
      if (!uniqueActions.has(descriptor.action)) {
        uniqueActions.set(descriptor.action, descriptor);
      }
    }
  }

  if (uniqueActions.size > 0) {
    if (!uniqueActions.has("payload_schema")) {
      uniqueActions.set("payload_schema", {
        action: "payload_schema",
        enabled: true,
        riskLevel: "low",
      });
    }
    if (!uniqueActions.has("create_endpoint")) {
      uniqueActions.set("create_endpoint", fallbackCreateAction);
    }

    return Array.from(uniqueActions.values());
  }

  return [
    {
      action: "payload_schema",
      enabled: true,
      riskLevel: "low",
    },
    fallbackCreateAction,
  ];
}

function formatRetryPolicy(
  retryPolicy:
    | TenantWebhookEndpoint["retryPolicy"]
    | TenantIntegrationGovernancePackage["webhookPolicy"]["retryPolicy"]
    | null
    | undefined,
) {
  if (!retryPolicy) return "—";

  return `${retryPolicy.maxAttempts} attempts · base ${retryPolicy.initialBackoffSeconds}s × ${retryPolicy.backoffMultiplier} · max ${retryPolicy.maxBackoffSeconds}s`;
}

function getEmptyStateModel(reason: EmptyReason): EmptyStateModel {
  switch (reason) {
    case "not_provisioned":
      return {
        reason,
        title: "Webhook delivery engine 尚未開通",
        description:
          "此租戶目前沒有可用的 webhook engine。系統不會回填假端點或假投遞紀錄，需先完成整合開通。",
        tone: "warning",
        actions: [
          {
            action: "open_integration_governance",
            enabled: true,
            riskLevel: "low",
          },
        ],
      };
    case "fetch_failed":
      return {
        reason,
        title: "Webhook 資料擷取失敗",
        description:
          "本次請求無法取得 endpoint 或 delivery read model。請先手動 refresh，必要時檢查平台健康。",
        tone: "warning",
      };
    case "permission_denied":
      return {
        reason,
        title: "目前身分無法檢視此資料",
        description:
          "當前 actor 沒有 webhook 可見性或寫入權限，因此只顯示受限資訊。",
        tone: "neutral",
      };
    case "external_unavailable":
      return {
        reason,
        title: "外部 receiver 或 platform queue 不可用",
        description:
          "Webhook engine 仍存在，但目前外部相依或平台 queue 降級，請改從 delivery log 與平台健康頁追查。",
        tone: "warning",
      };
    case "filtered_empty":
      return {
        reason,
        title: "目前篩選條件下沒有資料",
        description:
          "清除 endpoint 聚焦或切回全部 deliveries，即可查看其他 webhook activity。",
        tone: "tenant",
      };
    case "no_data":
    default:
      return {
        reason: "no_data",
        title: "尚未建立任何 webhook endpoint",
        description:
          "目前沒有任何 tenant webhook endpoint。請先建立第一個端點，再進行事件訂閱與 delivery 驗證。",
        tone: "tenant",
        actions: [
          {
            action: "create_endpoint",
            enabled: true,
            riskLevel: "medium",
          },
        ],
      };
  }
}

function getRefreshMetadata(
  endpoints: TenantWebhookEndpoint[],
  deliveries: WebhookDeliveryRecord[],
  governance: TenantIntegrationGovernancePackage | null,
  hasErrors: boolean,
): UiRefreshMetadata {
  const newestTimestamp = [
    governance?.generatedAt ?? null,
    ...endpoints.map((endpoint) => endpoint.updatedAt),
    ...deliveries.map((delivery) => delivery.createdAt),
  ]
    .map((value) => parseDate(value)?.getTime() ?? 0)
    .sort((left, right) => right - left)[0];

  if (!newestTimestamp) {
    return {
      generatedAt: new Date().toISOString(),
      staleAfterMs: 30_000,
      dataFreshness: hasErrors ? "degraded" : "unknown",
      source: "live",
    };
  }

  const generatedAt = new Date(newestTimestamp).toISOString();
  const age = Date.now() - newestTimestamp;

  return {
    generatedAt,
    staleAfterMs: 30_000,
    dataFreshness: hasErrors ? "degraded" : age > 30_000 ? "stale" : "fresh",
    source: "live",
  };
}

function buildEndpointRows(
  endpoints: ActionableEndpoint[],
  deliveries: ActionableDeliveryRecord[],
): EndpointRow[] {
  return endpoints.map((endpoint) => ({
    webhookId: endpoint.webhookId,
    endpoint: (
      <div style={endpointCellStyle}>
        <span style={endpointPrimaryStyle}>{endpoint.url}</span>
        <span style={endpointMetaStyle}>
          {endpoint.webhookId} · secret {endpoint.secretPreview} · v
          {endpoint.secretVersion}
        </span>
      </div>
    ),
    events: endpoint.events.length > 0 ? endpoint.events : ["—"],
    statusLabel: getEndpointStateLabel(endpoint.status),
    statusTone: getEndpointStateTone(endpoint.status),
    health: summarizeEndpointHealth(endpoint, deliveries),
    lastActivity: getEndpointLastActivity(endpoint),
  }));
}

function buildDeliveryRows(
  deliveries: ActionableDeliveryRecord[],
  endpoints: ActionableEndpoint[],
): DeliveryRow[] {
  const endpointMap = new Map(
    endpoints.map((endpoint) => [endpoint.webhookId, endpoint.url]),
  );

  return deliveries.map((delivery) => ({
    deliveryId: delivery.deliveryId,
    webhookId: delivery.webhookId,
    eventType: delivery.eventType,
    endpointUrl: endpointMap.get(delivery.webhookId) ?? "—",
    statusLabel: delivery.status,
    statusTone: getDeliveryStatusTone(delivery),
    codeLabel: getDeliveryCodeLabel(delivery),
    codeTone: getDeliveryCodeTone(delivery.httpStatus),
    tries: delivery.attempt,
    at: formatDateTime(delivery.createdAt),
    signature: delivery.signature,
  }));
}

function parseEvents(formData: FormData) {
  return String(formData.get("events") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

async function createWebhook(formData: FormData) {
  "use server";

  const client = getTenantClient();
  let destination = "/webhooks?create=true";

  try {
    const events = parseEvents(formData);
    if (events.length === 0) {
      throw new Error("至少要提供一個 webhook event。");
    }

    const secret = String(formData.get("secret") ?? "").trim();
    const url = String(formData.get("url") ?? "").trim();

    if (!url || !secret) {
      throw new Error("Webhook URL 與 secret 都是必填。");
    }

    await client.createWebhookEndpoint({ url, secret, events });
    revalidatePath("/webhooks");
    destination = `/webhooks?success=${encodeURIComponent("Webhook endpoint 已建立，初始狀態為 test_pending。")}`;
  } catch (error) {
    destination = `/webhooks?create=true&error=${encodeURIComponent(toErrorMessage(error))}`;
  }

  redirect(destination);
}

async function updateWebhook(formData: FormData) {
  "use server";

  const client = getTenantClient();
  const webhookId = String(formData.get("webhookId") ?? "").trim();
  let destination = webhookId
    ? `/webhooks?edit=${encodeURIComponent(webhookId)}`
    : "/webhooks";

  try {
    const events = parseEvents(formData);
    if (!webhookId) {
      throw new Error("缺少 webhookId。");
    }
    if (events.length === 0) {
      throw new Error("至少要提供一個 webhook event。");
    }

    const url = String(formData.get("url") ?? "").trim();
    const status = String(
      formData.get("status") ?? "",
    ).trim() as TenantWebhookEndpointStatus;

    if (!url || !status) {
      throw new Error("Webhook URL 與狀態都是必填。");
    }
    if (status === "disabled") {
      throw new Error(
        "停用 webhook 屬於 high-risk 動作，請改用 danger zone 並填寫 reason。",
      );
    }

    await client.updateWebhookEndpoint(webhookId, {
      url,
      events,
      status,
    });
    revalidatePath("/webhooks");
    destination = `/webhooks?webhookId=${encodeURIComponent(webhookId)}&success=${encodeURIComponent("Webhook endpoint 已更新。")}`;
  } catch (error) {
    destination = `${destination}&error=${encodeURIComponent(toErrorMessage(error))}`;
  }

  redirect(destination);
}

async function disableWebhook(formData: FormData) {
  "use server";

  const client = getTenantClient();
  const webhookId = String(formData.get("webhookId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  let destination = webhookId
    ? `/webhooks?webhookId=${encodeURIComponent(webhookId)}`
    : "/webhooks";

  try {
    if (!webhookId) {
      throw new Error("缺少 webhookId。");
    }
    if (!reason) {
      throw new Error("停用 webhook 需要 reason。");
    }

    await client.updateWebhookEndpoint(webhookId, {
      status: "disabled",
    });
    revalidatePath("/webhooks");
    destination = `${destination}&success=${encodeURIComponent("Webhook endpoint 已停用。")}`;
  } catch (error) {
    destination = `${destination}&error=${encodeURIComponent(toErrorMessage(error))}`;
  }

  redirect(destination);
}

async function deleteWebhook(formData: FormData) {
  "use server";

  const client = getTenantClient();
  const webhookId = String(formData.get("webhookId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  let destination = "/webhooks";

  try {
    if (!webhookId) {
      throw new Error("缺少 webhookId。");
    }
    if (!reason) {
      throw new Error("刪除 webhook 需要 reason。");
    }

    await client.deleteWebhookEndpoint(webhookId);
    revalidatePath("/webhooks");
    destination = `/webhooks?success=${encodeURIComponent("Webhook endpoint 已刪除。")}`;
  } catch (error) {
    destination = `/webhooks?error=${encodeURIComponent(toErrorMessage(error))}`;
  }

  redirect(destination);
}

async function rotateWebhookSecret(formData: FormData) {
  "use server";

  const client = getTenantClient();
  const webhookId = String(formData.get("webhookId") ?? "").trim();
  let destination = webhookId
    ? `/webhooks?webhookId=${encodeURIComponent(webhookId)}`
    : "/webhooks";

  try {
    if (!webhookId) {
      throw new Error("缺少 webhookId。");
    }

    const secret = String(formData.get("secret") ?? "").trim();
    const rotationReason = String(formData.get("rotationReason") ?? "").trim();

    if (!secret || !rotationReason) {
      throw new Error("Rotate secret 需要新 secret 與 reason。");
    }

    await client.post(
      `/api/tenant/webhooks/${encodeURIComponent(webhookId)}/rotate-secret`,
      {
        body: {
          secret,
          rotationReason,
        },
      },
    );
    revalidatePath("/webhooks");
    destination = `${destination}&success=${encodeURIComponent("Webhook secret 已輪替，請立即同步 receiver 端。")}`;
  } catch (error) {
    destination = `${destination}&error=${encodeURIComponent(toErrorMessage(error))}`;
  }

  redirect(destination);
}

async function loadWebhooksPageData(): Promise<WebhooksPageData> {
  const client = getTenantClient();

  const [endpointsResult, deliveriesResult, governanceResult, readinessResult] =
    await Promise.allSettled([
      client.listWebhooks() as Promise<TenantWebhookEndpoint[]>,
      client.get<{ items: WebhookDeliveryRecord[] }>(
        "/api/tenant/webhooks/deliveries",
      ) as Promise<{ items: WebhookDeliveryRecord[] }>,
      client.getTenantIntegrationGovernancePackage() as Promise<TenantIntegrationGovernancePackage>,
      client.get<TenantIntegrationReadinessSummary>(
        "/api/tenant/integration-governance/readiness",
      ) as Promise<TenantIntegrationReadinessSummary>,
    ]);

  const errors: string[] = [];
  const endpoints =
    endpointsResult.status === "fulfilled"
      ? [...(endpointsResult.value as ActionableEndpoint[])].sort(
          compareEndpoints,
        )
      : [];
  const deliveries =
    deliveriesResult.status === "fulfilled"
      ? [...(deliveriesResult.value.items as ActionableDeliveryRecord[])].sort(
          compareDeliveries,
        )
      : [];
  const governance =
    governanceResult.status === "fulfilled" ? governanceResult.value : null;
  const readiness =
    readinessResult.status === "fulfilled" ? readinessResult.value : null;

  if (endpointsResult.status === "rejected") {
    errors.push(`端點清單: ${toErrorMessage(endpointsResult.reason)}`);
  }
  if (deliveriesResult.status === "rejected") {
    errors.push(`投遞紀錄: ${toErrorMessage(deliveriesResult.reason)}`);
  }
  if (governanceResult.status === "rejected") {
    errors.push(`整合治理: ${toErrorMessage(governanceResult.reason)}`);
  }
  if (
    readinessResult.status === "rejected" &&
    !String(toErrorMessage(readinessResult.reason)).includes("404")
  ) {
    errors.push(`整合就緒度: ${toErrorMessage(readinessResult.reason)}`);
  }

  return {
    endpoints,
    deliveries,
    governance,
    readiness,
    errors,
    refresh: getRefreshMetadata(
      endpoints,
      deliveries,
      governance,
      errors.length > 0,
    ),
  };
}

function renderActionDescriptor(
  descriptor: ResourceActionDescriptor,
  href: string,
  label: string,
  variant: "primary" | "secondary" | "danger" = "secondary",
) {
  if (!descriptor.enabled) {
    return (
      <span
        key={descriptor.action}
        style={disabledActionStyle}
        title={descriptor.disabledReasonCode ?? "disabled"}
      >
        {label}
      </span>
    );
  }

  const style =
    variant === "primary"
      ? actionLinkPrimaryStyle
      : variant === "danger"
        ? actionLinkDangerStyle
        : actionLinkStyle;

  return (
    <Link key={descriptor.action} href={href} style={style}>
      {label}
    </Link>
  );
}

function renderEmptyStateActions(model: EmptyStateModel) {
  if (!model.actions || model.actions.length === 0) return null;

  return (
    <div style={actionRowStyle}>
      {model.actions.map((action) => {
        if (action.action === "create_endpoint") {
          return renderActionDescriptor(
            action,
            "/webhooks?create=true",
            "新增端點",
            "primary",
          );
        }

        if (action.action === "open_integration_governance") {
          return renderActionDescriptor(
            action,
            "/integration-governance",
            "前往整合就緒度",
          );
        }

        return null;
      })}
    </div>
  );
}

function getRetryCapability(
  deliveries: ActionableDeliveryRecord[],
  endpointActions: ResourceActionDescriptor[],
) {
  return (
    deliveries
      .flatMap((delivery) => delivery.availableActions ?? [])
      .find((descriptor) => descriptor.action === "retry_failed_delivery") ??
    endpointActions.find(
      (descriptor) => descriptor.action === "retry_failed_delivery",
    ) ??
    null
  );
}

export default async function WebhooksPage({
  searchParams,
}: {
  searchParams?: SearchParamInput;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const data = await loadWebhooksPageData();
  const selectedWebhookId = resolvedSearchParams.webhookId ?? null;
  const createMode = resolvedSearchParams.create === "true";
  const editWebhookId = resolvedSearchParams.edit ?? selectedWebhookId ?? null;
  const selectedEndpoint =
    data.endpoints.find((endpoint) => endpoint.webhookId === editWebhookId) ??
    data.endpoints[0] ??
    null;
  const selectedDeliveries = selectedWebhookId
    ? data.deliveries.filter(
        (delivery) => delivery.webhookId === selectedWebhookId,
      )
    : data.deliveries;
  const endpointRows = buildEndpointRows(data.endpoints, data.deliveries);
  const deliveryRows = buildDeliveryRows(selectedDeliveries, data.endpoints);
  const failureClusterCount = data.deliveries.filter(
    (delivery) => delivery.status === "delivery_failed",
  ).length;
  const queuedCount = data.deliveries.filter(
    (delivery) => delivery.status === "queued",
  ).length;
  const selectedEndpointFailures = selectedEndpoint
    ? data.deliveries.filter(
        (delivery) =>
          delivery.webhookId === selectedEndpoint.webhookId &&
          delivery.status === "delivery_failed",
      ).length
    : 0;
  const deliveryTargetLabel = selectedWebhookId
    ? `Endpoint ${selectedWebhookId} delivery log`
    : "近 24h 全部 webhook deliveries";
  const platformFailureLink = getCrossAppFailureLink(selectedWebhookId);
  const webhookReadiness =
    data.readiness?.items.find((item) => item.subSystem === "webhooks") ?? null;
  const selectedEndpointActions = selectedEndpoint
    ? getEndpointActions(selectedEndpoint)
    : [];
  const retryCapability = getRetryCapability(
    selectedDeliveries,
    selectedEndpointActions,
  );

  let emptyReason: EmptyReason | null = null;
  const requestedEmptyReason = resolvedSearchParams.emptyReason;
  const emptyReasonWhitelist: EmptyReason[] = [
    "no_data",
    "not_provisioned",
    "fetch_failed",
    "permission_denied",
    "external_unavailable",
    "filtered_empty",
  ];

  if (
    requestedEmptyReason &&
    emptyReasonWhitelist.includes(requestedEmptyReason as EmptyReason)
  ) {
    emptyReason = requestedEmptyReason as EmptyReason;
  } else if (webhookReadiness?.status === "not_provisioned") {
    emptyReason = "not_provisioned";
  } else if (
    webhookReadiness?.status === "blocked" &&
    endpointRows.length === 0
  ) {
    emptyReason = "external_unavailable";
  } else if (data.errors.length > 0 && endpointRows.length === 0) {
    emptyReason = "fetch_failed";
  } else if (endpointRows.length === 0) {
    emptyReason = "no_data";
  } else if (selectedWebhookId && deliveryRows.length === 0) {
    emptyReason = "filtered_empty";
  }

  const engineActive = emptyReason !== "not_provisioned";
  const allPageActions = getPageActions(
    engineActive,
    data.endpoints,
    data.readiness,
  );
  const payloadSchemaAction =
    allPageActions.find(
      (descriptor) => descriptor.action === "payload_schema",
    ) ?? null;
  const createEndpointAction =
    allPageActions.find(
      (descriptor) => descriptor.action === "create_endpoint",
    ) ?? null;
  const emptyModel = emptyReason ? getEmptyStateModel(emptyReason) : null;
  const refreshAge = Math.max(
    0,
    Date.now() - (parseDate(data.refresh.generatedAt)?.getTime() ?? Date.now()),
  );
  const refreshStatusTone: CanvasTone =
    data.refresh.dataFreshness === "fresh"
      ? "success"
      : data.refresh.dataFreshness === "stale"
        ? "warn"
        : data.refresh.dataFreshness === "degraded"
          ? "danger"
          : "neutral";

  const endpointColumns: CanvasTableColumn<EndpointRow>[] = [
    {
      h: "ENDPOINT",
      k: "endpoint",
      r: (row) => row.endpoint,
    },
    {
      h: "EVENTS",
      w: 300,
      r: (row) => (
        <div style={pillWrapStyle}>
          {row.events.map((eventType) => (
            <CanvasPill
              key={`${row.webhookId}-${eventType}`}
              theme={th}
              tone="info"
            >
              {eventType}
            </CanvasPill>
          ))}
        </div>
      ),
    },
    {
      h: "STATE",
      w: 120,
      r: (row) => (
        <CanvasPill theme={th} tone={row.statusTone} dot>
          {row.statusLabel}
        </CanvasPill>
      ),
    },
    {
      h: "HEALTH",
      k: "health",
      w: 150,
      mono: true,
    },
    {
      h: "LAST",
      k: "lastActivity",
      w: 170,
      mono: true,
    },
    {
      h: "OPEN",
      w: 82,
      r: (row) => (
        <Link
          href={`/webhooks?webhookId=${encodeURIComponent(row.webhookId)}`}
          style={smallLinkStyle}
        >
          delivery
        </Link>
      ),
    },
  ];

  const deliveryColumns: CanvasTableColumn<DeliveryRow>[] = [
    {
      h: "DLV",
      k: "deliveryId",
      w: 98,
      mono: true,
    },
    {
      h: "WH",
      k: "webhookId",
      w: 92,
      mono: true,
    },
    {
      h: "EVENT",
      k: "eventType",
      w: 190,
      mono: true,
    },
    {
      h: "STATE",
      w: 112,
      r: (row) => (
        <CanvasPill theme={th} tone={row.statusTone}>
          {row.statusLabel}
        </CanvasPill>
      ),
    },
    {
      h: "CODE",
      w: 84,
      mono: true,
      align: "right",
      r: (row) => (
        <CanvasPill theme={th} tone={row.codeTone}>
          {row.codeLabel}
        </CanvasPill>
      ),
    },
    {
      h: "TRIES",
      k: "tries",
      w: 70,
      mono: true,
      align: "right",
    },
    {
      h: "AT",
      k: "at",
      w: 132,
      mono: true,
    },
    {
      h: "SIG",
      k: "signature",
      mono: true,
    },
  ];

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="Webhooks"
        subtitle="端點 · 事件訂閱 · 投遞紀錄 · 重試政策 — 後端 engine 狀態直接決定畫面"
        tabs={["Endpoints", "Deliveries"]}
        activeTab="Endpoints"
        actions={
          <>
            {payloadSchemaAction
              ? renderActionDescriptor(
                  payloadSchemaAction,
                  "/integration-governance",
                  "payload schema",
                )
              : null}
            {createEndpointAction
              ? renderActionDescriptor(
                  createEndpointAction,
                  "/webhooks?create=true",
                  "新增端點",
                  "primary",
                )
              : null}
          </>
        }
      />

      <div style={pageBodyStyle}>
        {resolvedSearchParams.success ? (
          <CanvasBanner
            theme={th}
            tone="success"
            icon="check"
            title="Webhook 動作已完成"
            body={resolvedSearchParams.success}
          />
        ) : null}

        {resolvedSearchParams.error ? (
          <CanvasBanner
            theme={th}
            tone="danger"
            icon="warn"
            title="Webhook 動作失敗"
            body={resolvedSearchParams.error}
          />
        ) : null}

        {data.errors.length > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title="部分 webhook 資料無法載入"
            body={data.errors.join(" · ")}
          />
        ) : null}

        {failureClusterCount > 0 ? (
          <CanvasBanner
            theme={th}
            tone="danger"
            icon="warn"
            title="Webhook failure cluster detected"
            body={`目前有 ${failureClusterCount} 筆 delivery_failed。請先聚焦失敗 endpoint，再視需要到 Platform Admin health / queue 檢查。`}
          />
        ) : queuedCount > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="clock"
            title="Webhook retries are pending"
            body={`目前有 ${queuedCount} 筆 queued delivery 正等待 engine 自動重試；這不是資料遺失，而是 retry policy 正在生效。`}
          />
        ) : null}

        <div style={metaGridStyle}>
          <div style={metaCardStyle}>
            <span style={metaLabelStyle}>Engine Readiness</span>
            <span style={metaValueStyle}>
              {webhookReadiness?.status ?? "unknown"}
            </span>
            <span style={helperTextStyle}>
              {webhookReadiness?.detail ??
                "未提供 readiness detail；目前以 live webhook data 顯示。"}
            </span>
          </div>

          <div style={metaCardStyle}>
            <span style={metaLabelStyle}>Refresh Tier</span>
            <span style={metaValueStyle}>{REFRESH_TIER_LABEL}</span>
            <div style={statusRowStyle}>
              <CanvasPill theme={th} tone={refreshStatusTone} dot>
                {data.refresh.dataFreshness}
              </CanvasPill>
              <span style={helperTextStyle}>
                snapshot {formatRelativeTime(data.refresh.generatedAt)} ·{" "}
                {Math.round(refreshAge / 1000)}s old
              </span>
            </div>
            <Link href="/webhooks" style={smallLinkStyle}>
              手動 refresh snapshot
            </Link>
          </div>

          <div style={metaCardStyle}>
            <span style={metaLabelStyle}>Governance Baseline</span>
            <span style={metaValueStyle}>
              {(data.governance?.baselineWebhookEvents ?? []).length} events ·{" "}
              {data.governance?.webhookPolicy.retryPolicy.maxAttempts ?? "—"}{" "}
              max retries
            </span>
            <span style={helperTextStyle}>
              generated {formatDateTime(data.governance?.generatedAt)}
            </span>
          </div>

          <div style={metaCardStyle}>
            <span style={metaLabelStyle}>Retry Policy</span>
            <span style={metaValueStyle}>
              {formatRetryPolicy(data.governance?.webhookPolicy.retryPolicy)}
            </span>
            <span style={helperTextStyle}>
              auto-disable after{" "}
              {data.governance?.webhookPolicy
                .autoDisableAfterConsecutiveFailures ?? "—"}{" "}
              consecutive failures
            </span>
          </div>

          <div style={metaCardStyle}>
            <span style={metaLabelStyle}>Delivery Health</span>
            <span style={metaValueStyle}>
              {failureClusterCount} failed · {queuedCount} queued
            </span>
            <Link
              href={platformFailureLink.route}
              target="_blank"
              rel="noreferrer"
              style={smallLinkStyle}
            >
              {platformFailureLink.label}
            </Link>
          </div>
        </div>

        {emptyModel ? (
          <CanvasCard theme={th} title="Webhook 狀態" padding={20}>
            <WorkflowEmptyState
              title={emptyModel.title}
              description={emptyModel.description}
              tone={emptyModel.tone}
              density="compact"
              actions={renderEmptyStateActions(emptyModel)}
            />
          </CanvasCard>
        ) : (
          <div style={sectionGridStyle}>
            <CanvasCard
              theme={th}
              title={`端點 · ${endpointRows.length} entries`}
              subtitle="availableActions 驅動 CTA；沒有引擎時不顯示假資料"
              padding={0}
            >
              <CanvasTable<EndpointRow>
                theme={th}
                columns={endpointColumns}
                rows={endpointRows}
                dense={false}
              />
            </CanvasCard>

            <div style={detailStackStyle}>
              <CanvasCard
                theme={th}
                title={selectedEndpoint ? "Endpoint detail" : "選取 endpoint"}
                subtitle={
                  selectedEndpoint
                    ? selectedEndpoint.webhookId
                    : "從左側選一個 endpoint 查看 delivery 與動作"
                }
              >
                {selectedEndpoint ? (
                  <div style={inlineStackStyle}>
                    <div style={keyValueListStyle}>
                      <div>
                        <div style={cardSectionLabelStyle}>URL</div>
                        <div style={metaValueStyle}>{selectedEndpoint.url}</div>
                      </div>
                      <div>
                        <div style={cardSectionLabelStyle}>Secret Metadata</div>
                        <div
                          style={{ ...metaValueStyle, ...monospaceTextStyle }}
                        >
                          {selectedEndpoint.secretPreview} · version{" "}
                          {selectedEndpoint.secretVersion}
                        </div>
                      </div>
                      <div>
                        <div style={cardSectionLabelStyle}>
                          Delivery Summary
                        </div>
                        <div style={metaValueStyle}>
                          {summarizeEndpointHealth(
                            selectedEndpoint,
                            data.deliveries,
                          )}
                        </div>
                      </div>
                      <div>
                        <div style={cardSectionLabelStyle}>Retry Policy</div>
                        <div style={metaValueStyle}>
                          {formatRetryPolicy(
                            selectedEndpoint.retryPolicy ??
                              data.governance?.webhookPolicy.retryPolicy,
                          )}
                        </div>
                      </div>
                      <div>
                        <div style={cardSectionLabelStyle}>Validation</div>
                        <div style={metaValueStyle}>
                          last validated{" "}
                          {formatDateTime(
                            selectedEndpoint.runtimeMetadata?.lastValidatedAt,
                          )}
                          {selectedEndpoint.runtimeMetadata?.nextAttemptAt
                            ? ` · next retry ${formatRelativeTime(selectedEndpoint.runtimeMetadata.nextAttemptAt)}`
                            : ""}
                        </div>
                      </div>
                    </div>

                    <div style={dividerStyle} />

                    {selectedEndpointFailures > 0 ? (
                      <CanvasBanner
                        theme={th}
                        tone="danger"
                        icon="warn"
                        title="Selected endpoint has recent failed deliveries"
                        body={`${selectedEndpoint.webhookId} 目前有 ${selectedEndpointFailures} 筆失敗投遞。若 receiver 已修復，可等待 engine 自動 retry，或到 Platform Admin 交叉檢查 queue / health。`}
                      />
                    ) : null}

                    {retryCapability ? (
                      <div style={helperTextStyle}>
                        retry capability:{" "}
                        {retryCapability.enabled
                          ? "backend 標記可重試；tenant UI 仍以 delivery log 與 queue health 為主。"
                          : (retryCapability.disabledReasonCode ??
                            "engine_auto_retry_only")}
                      </div>
                    ) : null}

                    <div style={actionRowStyle}>
                      {selectedEndpointActions.map((descriptor) => {
                        if (descriptor.action === "view_delivery_log") {
                          return renderActionDescriptor(
                            descriptor,
                            `/webhooks?webhookId=${encodeURIComponent(selectedEndpoint.webhookId)}#delivery-log`,
                            "View delivery log",
                          );
                        }

                        if (descriptor.action === "update_endpoint") {
                          return renderActionDescriptor(
                            descriptor,
                            `/webhooks?edit=${encodeURIComponent(selectedEndpoint.webhookId)}`,
                            "Update endpoint",
                          );
                        }

                        if (descriptor.action === "disable_endpoint") {
                          return renderActionDescriptor(
                            descriptor,
                            "#danger-zone",
                            "Disable",
                            "danger",
                          );
                        }

                        if (descriptor.action === "delete_endpoint") {
                          return renderActionDescriptor(
                            descriptor,
                            "#danger-zone",
                            "Delete",
                            "danger",
                          );
                        }

                        if (descriptor.action === "rotate_secret") {
                          return renderActionDescriptor(
                            descriptor,
                            `/webhooks?edit=${encodeURIComponent(selectedEndpoint.webhookId)}#rotate-secret`,
                            "Rotate secret",
                          );
                        }

                        if (descriptor.action === "retry_failed_delivery") {
                          return (
                            <span
                              key={descriptor.action}
                              style={
                                retryCapability?.enabled
                                  ? actionLinkStyle
                                  : disabledActionStyle
                              }
                              title={
                                retryCapability?.enabled
                                  ? "目前 tenant UI 沒有獨立 manual retry command；請改看 delivery log 與 queue health。"
                                  : retryCapability?.disabledReasonCode
                              }
                            >
                              Retry failed delivery
                            </span>
                          );
                        }

                        return (
                          <span
                            key={descriptor.action}
                            style={disabledActionStyle}
                            title={descriptor.disabledReasonCode}
                          >
                            Retry failed delivery
                          </span>
                        );
                      })}
                    </div>

                    <Link
                      href={platformFailureLink.route}
                      target="_blank"
                      rel="noreferrer"
                      style={smallLinkStyle}
                    >
                      開新分頁到 Platform Admin 查看 queue / health
                    </Link>
                  </div>
                ) : (
                  <WorkflowEmptyState
                    title="尚未選取 endpoint"
                    description="從左側 endpoint table 挑一個 target，即可查看 per-endpoint delivery log、secret metadata 與管理動作。"
                    tone="neutral"
                    density="compact"
                  />
                )}
              </CanvasCard>

              <CanvasCard
                theme={th}
                title={createMode ? "Create endpoint" : "Quick actions"}
                subtitle={
                  createMode
                    ? "新端點建立後會先進入 test_pending；需等待 receiver 驗證完成"
                    : "用選取中的 endpoint 進行 update / rotate secret"
                }
              >
                {createMode ? (
                  <form action={createWebhook} style={inlineStackStyle}>
                    <div style={fieldGridStyle}>
                      <CanvasField theme={th} label="Webhook URL">
                        <input name="url" style={nativeInputStyle} />
                      </CanvasField>
                      <CanvasField theme={th} label="Events (comma-separated)">
                        <input
                          name="events"
                          defaultValue={
                            data.governance?.baselineWebhookEvents.join(", ") ??
                            ""
                          }
                          style={nativeInputStyle}
                        />
                      </CanvasField>
                    </div>
                    <CanvasField theme={th} label="Secret">
                      <input name="secret" style={nativeInputStyle} />
                    </CanvasField>
                    <div style={actionRowStyle}>
                      <button type="submit" style={submitButtonStyle}>
                        建立 endpoint
                      </button>
                      <Link href="/webhooks" style={actionLinkStyle}>
                        取消
                      </Link>
                    </div>
                    <div style={helperTextStyle}>
                      create action 走真實 tenant webhook command
                      surface；建立後狀態預期為 `test_pending`。
                    </div>
                  </form>
                ) : selectedEndpoint ? (
                  <div style={inlineStackStyle}>
                    <form action={updateWebhook} style={inlineStackStyle}>
                      <input
                        type="hidden"
                        name="webhookId"
                        value={selectedEndpoint.webhookId}
                      />
                      <div style={fieldGridStyle}>
                        <CanvasField theme={th} label="Webhook URL">
                          <input
                            name="url"
                            defaultValue={selectedEndpoint.url}
                            style={nativeInputStyle}
                          />
                        </CanvasField>
                        <CanvasField theme={th} label="Status">
                          <select
                            name="status"
                            defaultValue={selectedEndpoint.status}
                            style={nativeInputStyle}
                          >
                            <option value="active">active</option>
                            <option value="test_pending">test_pending</option>
                          </select>
                        </CanvasField>
                      </div>
                      <CanvasField theme={th} label="Events (comma-separated)">
                        <input
                          name="events"
                          defaultValue={selectedEndpoint.events.join(", ")}
                          style={nativeInputStyle}
                        />
                      </CanvasField>
                      <div style={actionRowStyle}>
                        <button type="submit" style={submitButtonStyle}>
                          更新 endpoint
                        </button>
                        <Link
                          href={`/webhooks?create=true`}
                          style={actionLinkStyle}
                        >
                          建立新端點
                        </Link>
                      </div>
                      <div style={helperTextStyle}>
                        `disabled` 不在一般 update flow 內；停用需走下方 danger
                        zone，並提供 reason 以符合 high-risk 動作要求。
                      </div>
                    </form>

                    <div style={dividerStyle} />

                    <form
                      id="rotate-secret"
                      action={rotateWebhookSecret}
                      style={inlineStackStyle}
                    >
                      <input
                        type="hidden"
                        name="webhookId"
                        value={selectedEndpoint.webhookId}
                      />
                      <div style={cardSectionLabelStyle}>Rotate secret</div>
                      <div style={fieldGridStyle}>
                        <CanvasField theme={th} label="New secret">
                          <input name="secret" style={nativeInputStyle} />
                        </CanvasField>
                        <CanvasField theme={th} label="Rotation reason">
                          <input
                            name="rotationReason"
                            defaultValue="consumer_key_rotation"
                            style={nativeInputStyle}
                          />
                        </CanvasField>
                      </div>
                      <div style={dangerNoteStyle}>
                        目前 API 只回傳 secret preview，不回傳 plaintext-once
                        secret；輪替後請立即同步 receiver。
                      </div>
                      <div style={actionRowStyle}>
                        <button type="submit" style={submitButtonStyle}>
                          Rotate secret
                        </button>
                      </div>
                    </form>

                    <div style={dividerStyle} />

                    <div id="danger-zone" style={inlineStackStyle}>
                      <div style={cardSectionLabelStyle}>Danger zone</div>
                      <div style={dangerNoteStyle}>
                        停用與刪除都屬 high-risk 動作；依 spec 需填 reason
                        才能提交。
                      </div>
                      <form action={disableWebhook} style={inlineStackStyle}>
                        <input
                          type="hidden"
                          name="webhookId"
                          value={selectedEndpoint.webhookId}
                        />
                        <CanvasField theme={th} label="Disable reason">
                          <input
                            name="reason"
                            defaultValue="receiver_temporarily_unavailable"
                            style={nativeInputStyle}
                          />
                        </CanvasField>
                        <div style={actionRowStyle}>
                          <button type="submit" style={dangerSubmitButtonStyle}>
                            Disable endpoint
                          </button>
                        </div>
                      </form>

                      <form action={deleteWebhook} style={inlineStackStyle}>
                        <input
                          type="hidden"
                          name="webhookId"
                          value={selectedEndpoint.webhookId}
                        />
                        <CanvasField theme={th} label="Delete reason">
                          <textarea
                            name="reason"
                            defaultValue="endpoint_decommissioned_after_receiver_cutover"
                            style={nativeTextAreaStyle}
                          />
                        </CanvasField>
                        <div style={actionRowStyle}>
                          <button type="submit" style={dangerSubmitButtonStyle}>
                            Delete endpoint
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                ) : (
                  <WorkflowEmptyState
                    title="尚無可管理的 endpoint"
                    description="建立第一個 endpoint 後，這裡才會出現 update / rotate / disable / delete controls。"
                    tone="tenant"
                    density="compact"
                    actions={
                      createEndpointAction
                        ? renderActionDescriptor(
                            createEndpointAction,
                            "/webhooks?create=true",
                            "新增端點",
                            "primary",
                          )
                        : null
                    }
                  />
                )}
              </CanvasCard>
            </div>
          </div>
        )}

        <div id="delivery-log">
          <CanvasCard
            theme={th}
            title={deliveryTargetLabel}
            subtitle="失敗 cluster、queued retries、receiver response code 都應該直接可讀"
            padding={0}
          >
            {deliveryRows.length > 0 ? (
              <CanvasTable<DeliveryRow>
                theme={th}
                columns={deliveryColumns}
                rows={deliveryRows.slice(0, 12)}
                dense
              />
            ) : emptyModel?.reason === "filtered_empty" ? (
              <div style={{ padding: 20 }}>
                <WorkflowEmptyState
                  title="此 endpoint 目前沒有 delivery log"
                  description="清除 endpoint 篩選後，可改看全部 webhook deliveries；這是 `filtered_empty`，不是 engine 未開通。"
                  tone="tenant"
                  density="compact"
                  actions={
                    <Link href="/webhooks#delivery-log" style={actionLinkStyle}>
                      顯示全部 deliveries
                    </Link>
                  }
                />
              </div>
            ) : (
              <div style={{ padding: 20 }}>
                <WorkflowEmptyState
                  title="目前沒有可顯示的 delivery log"
                  description="若端點剛建立或仍在 test_pending，這裡暫時沒有可用的投遞紀錄。"
                  tone="neutral"
                  density="compact"
                />
              </div>
            )}
          </CanvasCard>
        </div>

        <CanvasCard
          theme={th}
          title="Empty reason reference"
          subtitle="6 種 EmptyReason 都有獨立文案與處置方向；可用 `?emptyReason=` 驗證畫面"
        >
          <div style={pillWrapStyle}>
            {emptyReasonWhitelist.map((reason) => (
              <Link
                key={reason}
                href={`/webhooks?emptyReason=${encodeURIComponent(reason)}`}
                style={actionLinkStyle}
              >
                {reason}
              </Link>
            ))}
          </div>
          <div style={helperTextStyle}>
            支援
            `no_data`、`not_provisioned`、`fetch_failed`、`permission_denied`、
            `external_unavailable`、`filtered_empty` 六種 distinct state。
          </div>
        </CanvasCard>
      </div>
    </div>
  );
}
