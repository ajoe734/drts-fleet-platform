import type { CSSProperties } from "react";
import type {
  TenantWebhookEndpoint,
  TenantWebhookEndpointStatus,
  WebhookDeliveryRecord,
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

const emptyStateStyle: CSSProperties = {
  padding: 24,
  color: th.textMuted,
  fontSize: 12.5,
  textAlign: "center",
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

type EndpointRow = Record<string, unknown> & {
  webhookId: string;
  url: string;
  events: string[];
  stateLabel: string;
  stateTone: CanvasTone;
  last: string;
};

type DeliveryRow = Record<string, unknown> & {
  deliveryId: string;
  webhookId: string;
  eventType: string;
  codeLabel: string;
  codeTone: CanvasTone;
  tries: number;
  at: string;
  duration: string;
};

type WebhooksPageData = {
  endpointRows: EndpointRow[];
  deliveryRows: DeliveryRow[];
  deliverySubtitle: string | undefined;
  errors: string[];
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

  const diffDays = Math.round(diffSeconds / 86400);
  return relativeTimeFormatter.format(diffDays, "day");
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

function getEndpointStateTone(status: TenantWebhookEndpointStatus): CanvasTone {
  if (status === "active") return "success";
  if (status === "test_pending") return "accent";
  return "warn";
}

function getEndpointStateLabel(status: TenantWebhookEndpointStatus) {
  if (status === "active") return "active";
  if (status === "test_pending") return "pending";
  return "paused";
}

function getEndpointLastLabel(endpoint: TenantWebhookEndpoint) {
  const metadata = endpoint.runtimeMetadata;
  const lastDeliveredAt = metadata?.lastDeliveredAt;
  const lastAttemptAt = metadata?.lastAttemptAt;
  const disabledAt = metadata?.disabledAt;

  if (endpoint.status === "active" && lastDeliveredAt) {
    return `OK · ${formatRelativeTime(lastDeliveredAt)}`;
  }

  if (endpoint.status === "active" && lastAttemptAt) {
    return `attempt · ${formatRelativeTime(lastAttemptAt)}`;
  }

  if (endpoint.status === "test_pending") {
    return `pending · ${formatRelativeTime(endpoint.updatedAt)}`;
  }

  if (endpoint.status === "disabled") {
    return `paused · ${formatRelativeTime(disabledAt ?? endpoint.updatedAt)}`;
  }

  return formatDateTime(endpoint.updatedAt);
}

function toEndpointRow(endpoint: TenantWebhookEndpoint): EndpointRow {
  return {
    webhookId: endpoint.webhookId,
    url: endpoint.url,
    events: endpoint.events.length > 0 ? endpoint.events : ["—"],
    stateLabel: getEndpointStateLabel(endpoint.status),
    stateTone: getEndpointStateTone(endpoint.status),
    last: getEndpointLastLabel(endpoint),
  };
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

function getDeliveryDurationLabel(delivery: WebhookDeliveryRecord) {
  if (delivery.status === "queued") return "queued";
  if (delivery.status === "delivery_failed" && delivery.httpStatus === null) {
    return "timeout";
  }
  return "—";
}

function toDeliveryRow(delivery: WebhookDeliveryRecord): DeliveryRow {
  return {
    deliveryId: delivery.deliveryId,
    webhookId: delivery.webhookId,
    eventType: delivery.eventType,
    codeLabel: getDeliveryCodeLabel(delivery),
    codeTone: getDeliveryCodeTone(delivery.httpStatus),
    tries: delivery.attempt,
    at: formatDateTime(delivery.createdAt),
    duration: getDeliveryDurationLabel(delivery),
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
    return {
      rows: recent.slice(0, 8).map(toDeliveryRow),
      subtitle: undefined,
    };
  }

  if (sorted.length > 0) {
    return {
      rows: sorted.slice(0, 8).map(toDeliveryRow),
      subtitle: "近 24h 無新投遞，改顯示最近投遞紀錄",
    };
  }

  return {
    rows: [] as DeliveryRow[],
    subtitle: undefined,
  };
}

async function loadWebhooksPageData(): Promise<WebhooksPageData> {
  const client = getTenantClient();

  const [endpointsResult, deliveriesResult] = await Promise.allSettled([
    client.listWebhooks() as Promise<TenantWebhookEndpoint[]>,
    client.get<{ items: WebhookDeliveryRecord[] }>(
      "/api/tenant/webhooks/deliveries",
    ) as Promise<{ items: WebhookDeliveryRecord[] }>,
  ]);

  const errors: string[] = [];
  const endpoints =
    endpointsResult.status === "fulfilled"
      ? [...endpointsResult.value].sort(compareEndpoints)
      : [];
  const deliveries =
    deliveriesResult.status === "fulfilled" ? deliveriesResult.value.items : [];

  if (endpointsResult.status === "rejected") {
    errors.push(`端點清單: ${toErrorMessage(endpointsResult.reason)}`);
  }

  if (deliveriesResult.status === "rejected") {
    errors.push(`投遞紀錄: ${toErrorMessage(deliveriesResult.reason)}`);
  }

  const { rows: deliveryRows, subtitle: deliverySubtitle } =
    pickDeliveryRows(deliveries);

  return {
    endpointRows: endpoints.map(toEndpointRow),
    deliveryRows,
    deliverySubtitle,
    errors,
  };
}

export default async function WebhooksPage() {
  const { endpointRows, deliveryRows, deliverySubtitle, errors } =
    await loadWebhooksPageData();

  const endpointColumns: CanvasTableColumn<EndpointRow>[] = [
    {
      h: "URL",
      k: "url",
      mono: true,
      r: (row) => <span style={urlPrimaryStyle}>{row.url}</span>,
    },
    {
      h: "EVENTS",
      w: 320,
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
      w: 110,
      r: (row) => (
        <CanvasPill theme={th} tone={row.stateTone} dot>
          {row.stateLabel}
        </CanvasPill>
      ),
    },
    {
      h: "LAST",
      k: "last",
      w: 180,
      mono: true,
    },
  ];

  const deliveryColumns: CanvasTableColumn<DeliveryRow>[] = [
    {
      h: "DLV",
      k: "deliveryId",
      w: 108,
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
      w: 210,
      mono: true,
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
      w: 78,
      mono: true,
      align: "right",
    },
    {
      h: "AT",
      k: "at",
      mono: true,
    },
    {
      h: "DUR",
      k: "duration",
      w: 92,
      mono: true,
    },
  ];

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="Webhook"
        subtitle="端點 · 事件訂閱 · 投遞紀錄 · 重試政策"
        tabs={["Endpoints", "Deliveries", "Replay"]}
        activeTab="Endpoints"
        actions={
          <>
            <CanvasBtn theme={th} icon="ext" size="sm">
              payload schema
            </CanvasBtn>
            <CanvasBtn theme={th} variant="primary" icon="plus" size="sm">
              新增端點
            </CanvasBtn>
          </>
        }
      />

      <div style={pageBodyStyle}>
        {errors.length > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title="部分 webhook 資料無法載入"
            body={errors.join(" · ")}
          />
        ) : null}

        <CanvasCard theme={th} title="端點" padding={0}>
          {endpointRows.length > 0 ? (
            <CanvasTable<EndpointRow>
              theme={th}
              columns={endpointColumns}
              rows={endpointRows}
              dense={false}
            />
          ) : (
            <div style={emptyStateStyle}>
              尚無 webhook endpoint，請新增第一個端點。
            </div>
          )}
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
            <div style={emptyStateStyle}>目前沒有可顯示的投遞紀錄。</div>
          )}
        </CanvasCard>
      </div>
    </div>
  );
}
