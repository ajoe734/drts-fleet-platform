import Link from "next/link";
import type { CSSProperties } from "react";
import type {
  ApiSuccessEnvelope,
  CrossAppResourceLink,
  EmptyReason,
  EmptyStateEnvelope,
  MoneyAmount,
  RefreshTier,
  ResourceActionDescriptor,
  TenantInvoiceRecord,
  UiRefreshMetadata,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasCard,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  type CanvasTableColumn,
  type CanvasTone,
  buildCanvasTheme,
} from "@drts/ui-web";
import { API_URL, DEMO_ACTOR_ID, DEMO_TENANT_ID } from "@/lib/api-client";
import { formatDateInput } from "@/lib/formatters";
import { InvoicesRefreshTicker } from "./refresh-tier";

export const dynamic = "force-dynamic";

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

const REFRESH_TIER: RefreshTier = "slow";
const REFRESH_INTERVAL_MS = 30_000;
const PLATFORM_ADMIN_URL =
  process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL ?? "http://localhost:3102";

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "grid",
  gap: 16,
};

const topMetaGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.7fr) minmax(280px, 1fr)",
  gap: 16,
  alignItems: "start",
};

const filterCardStyle: CSSProperties = {
  display: "grid",
  gap: 12,
};

const filterGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns:
    "minmax(0, 1.5fr) repeat(2, minmax(140px, 0.7fr)) auto auto",
  gap: 10,
  alignItems: "end",
};

const fieldStyle: CSSProperties = {
  display: "grid",
  gap: 6,
};

const labelStyle: CSSProperties = {
  fontSize: 10.5,
  letterSpacing: 0.8,
  textTransform: "uppercase",
  color: th.textDim,
  fontWeight: 700,
};

const controlStyle: CSSProperties = {
  width: "100%",
  borderRadius: 8,
  border: `1px solid ${th.border}`,
  background: th.bgRaised,
  color: th.text,
  padding: "9px 11px",
  fontSize: 12.5,
  outline: "none",
};

const filterMetaStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
  color: th.textMuted,
  fontSize: 11.5,
};

const refreshCardStyle: CSSProperties = {
  display: "grid",
  gap: 10,
};

const refreshMetaStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  fontSize: 12,
  color: th.textMuted,
};

const refreshRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
};

const kpiGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const invoicePrimaryStyle: CSSProperties = {
  color: th.accent,
  fontWeight: 600,
  fontFamily: th.monoFamily,
};

const mutedMonoStyle: CSSProperties = {
  color: th.textMuted,
  fontFamily: th.monoFamily,
  fontSize: 11.5,
};

const lineClampStyle: CSSProperties = {
  display: "grid",
  gap: 3,
  lineHeight: 1.35,
};

const actionRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const actionLinkBaseStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 24,
  padding: "4px 8px",
  borderRadius: 7,
  border: `1px solid ${th.border}`,
  color: th.text,
  background: th.surface,
  textDecoration: "none",
  fontSize: 11.5,
  lineHeight: 1,
  whiteSpace: "nowrap",
};

const disabledActionStyle: CSSProperties = {
  ...actionLinkBaseStyle,
  opacity: 0.45,
  cursor: "not-allowed",
};

const emptyStateStyle: CSSProperties = {
  padding: 28,
  display: "grid",
  gap: 10,
  justifyItems: "center",
  textAlign: "center",
};

const emptyTitleStyle: CSSProperties = {
  color: th.text,
  fontSize: 15,
  fontWeight: 600,
};

const emptyBodyStyle: CSSProperties = {
  color: th.textMuted,
  maxWidth: 560,
  lineHeight: 1.5,
  fontSize: 12.5,
};

const detailGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.05fr) minmax(280px, 0.95fr)",
  gap: 16,
};

const detailCardBodyStyle: CSSProperties = {
  padding: 18,
  display: "grid",
  gap: 16,
};

const detailStatGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 12,
};

const detailStatStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  padding: 12,
  borderRadius: 10,
  border: `1px solid ${th.border}`,
  background: th.bgRaised,
};

const detailStatLabelStyle: CSSProperties = {
  color: th.textDim,
  fontSize: 10.5,
  letterSpacing: 0.7,
  textTransform: "uppercase",
  fontWeight: 700,
};

const detailStatValueStyle: CSSProperties = {
  color: th.text,
  fontSize: 13,
  lineHeight: 1.4,
};

const detailLinkListStyle: CSSProperties = {
  display: "grid",
  gap: 8,
};

const externalLinkStyle: CSSProperties = {
  ...actionLinkBaseStyle,
  justifyContent: "space-between",
  width: "100%",
};

const detailLineListStyle: CSSProperties = {
  display: "grid",
  gap: 10,
};

const detailLineItemStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  padding: 12,
  borderRadius: 10,
  border: `1px solid ${th.border}`,
  background: th.bgRaised,
};

const detailLineMetaStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  color: th.textMuted,
  fontSize: 11.5,
};

const subheadingStyle: CSSProperties = {
  color: th.text,
  fontSize: 13.5,
  fontWeight: 600,
};

type InvoiceStatus = TenantInvoiceRecord["status"] | "overdue";

type InvoiceAction = ResourceActionDescriptor & {
  href?: string;
  target?: "_blank";
  label: string;
};

type InvoiceViewRecord = Omit<TenantInvoiceRecord, "status"> &
  Record<string, unknown> & {
    status: InvoiceStatus;
    dueAt: string | null;
    expiresAt: string | null;
    artifactState: "ready" | "expired" | "missing";
    availableActions: InvoiceAction[];
    auditHref: string;
    crossAppLinks: CrossAppResourceLink[];
  };

type InvoicesPageData = {
  invoices: InvoiceViewRecord[];
  errors: string[];
  refresh: UiRefreshMetadata;
};

function toPeriodKey(value: string | null | undefined) {
  return value ? value.slice(0, 7) : "—";
}

function parseIsoDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseArtifactExpiry(artifactUrl: string | null) {
  if (!artifactUrl) return null;
  try {
    const url = new URL(artifactUrl);
    return url.searchParams.get("expires_at");
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function isResourceActionDescriptor(
  value: unknown,
): value is ResourceActionDescriptor {
  const record = asRecord(value);
  return (
    record !== null &&
    typeof record.action === "string" &&
    typeof record.enabled === "boolean" &&
    typeof record.riskLevel === "string"
  );
}

function isCrossAppResourceLink(value: unknown): value is CrossAppResourceLink {
  const record = asRecord(value);
  return (
    record !== null &&
    (record.targetApp === "ops-console" ||
      record.targetApp === "platform-admin" ||
      record.targetApp === "tenant-console") &&
    typeof record.route === "string" &&
    typeof record.resourceType === "string" &&
    typeof record.resourceId === "string" &&
    (record.openMode === "new_tab" || record.openMode === "same_tab") &&
    typeof record.label === "string"
  );
}

function formatDateTime(value: string | null | undefined) {
  const parsed = parseIsoDate(value);
  if (!parsed) return "—";
  return new Intl.DateTimeFormat("zh-Hant", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function formatCanvasMoney(value: MoneyAmount | null | undefined) {
  if (!value) {
    return "—";
  }

  const amount = value.amountMinor / 100;
  const currencyLabel = value.currency === "TWD" ? "NT$" : value.currency;

  return `${currencyLabel} ${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(amount)}`;
}

function formatCanvasCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatArtifactExpiry(value: string | null) {
  if (!value) return "未發布";
  const parsed = parseIsoDate(value);
  if (!parsed) return "未發布";
  if (parsed.getTime() < Date.now()) {
    return `${formatDateTime(value)} · expired`;
  }
  return formatDateTime(value);
}

function isExpired(value: string | null) {
  const parsed = parseIsoDate(value);
  return parsed ? parsed.getTime() < Date.now() : false;
}

function getStatusTone(status: InvoiceStatus): CanvasTone {
  switch (status) {
    case "paid":
      return "success";
    case "issued":
      return "info";
    case "overdue":
      return "warn";
    case "draft":
    default:
      return "neutral";
  }
}

function getStatusDeltaTone(status: InvoiceStatus) {
  switch (status) {
    case "paid":
      return "up" as const;
    case "overdue":
      return "down" as const;
    case "issued":
      return "neutral" as const;
    case "draft":
    default:
      return "neutral" as const;
  }
}

function getArtifactTone(
  state: InvoiceViewRecord["artifactState"],
): CanvasTone {
  switch (state) {
    case "ready":
      return "success";
    case "expired":
      return "warn";
    case "missing":
    default:
      return "neutral";
  }
}

function getArtifactLabel(state: InvoiceViewRecord["artifactState"]) {
  switch (state) {
    case "ready":
      return "ready";
    case "expired":
      return "expired";
    case "missing":
    default:
      return "missing";
  }
}

function buildHref(
  searchParams: URLSearchParams,
  updates: Record<string, string | null | undefined>,
) {
  const next = new URLSearchParams(searchParams);
  for (const [key, value] of Object.entries(updates)) {
    if (!value) {
      next.delete(key);
      continue;
    }
    next.set(key, value);
  }
  const query = next.toString();
  return query.length > 0 ? `/invoices?${query}` : "/invoices";
}

function buildAverageTicketAmount(invoices: InvoiceViewRecord[]) {
  const totalTrips = invoices.reduce(
    (count, invoice) => count + invoice.lines.length,
    0,
  );

  if (totalTrips === 0) {
    return null;
  }

  const currency = invoices[0]?.amount.currency ?? "TWD";
  const totalAmountMinor = invoices.reduce(
    (sum, invoice) => sum + invoice.amount.amountMinor,
    0,
  );
  const averageWholeUnit = Math.floor(totalAmountMinor / totalTrips / 100);

  return {
    amountMinor: averageWholeUnit * 100,
    currency,
  } satisfies MoneyAmount;
}

function toErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Unknown tenant invoice error.";
}

function buildRefreshMetadata(
  generatedAt: string | undefined,
  source: UiRefreshMetadata["source"],
): UiRefreshMetadata {
  const timestamp = generatedAt ?? new Date().toISOString();
  const generated = parseIsoDate(timestamp);
  const ageMs = generated
    ? Date.now() - generated.getTime()
    : Number.MAX_SAFE_INTEGER;
  const freshness =
    source === "live"
      ? ageMs > REFRESH_INTERVAL_MS
        ? "stale"
        : "fresh"
      : "unknown";

  return {
    generatedAt: timestamp,
    staleAfterMs: REFRESH_INTERVAL_MS,
    dataFreshness: freshness,
    source,
  };
}

function buildCrossAppHref(link: CrossAppResourceLink) {
  if (link.targetApp === "platform-admin") {
    return `${PLATFORM_ADMIN_URL}${link.route}`;
  }
  return link.route;
}

function buildFallbackCrossAppLinks(
  invoice: Pick<InvoiceViewRecord, "invoiceId" | "tenantId">,
): CrossAppResourceLink[] {
  return [
    {
      targetApp: "platform-admin",
      route: `/payments?invoiceId=${encodeURIComponent(invoice.invoiceId)}`,
      resourceType: "settlement_invoice",
      resourceId: invoice.invoiceId,
      openMode: "new_tab",
      label: "平台結算檢視",
    },
    {
      targetApp: "platform-admin",
      route: `/audit?resourceType=tenant_invoice&resourceId=${encodeURIComponent(invoice.invoiceId)}&tenantId=${encodeURIComponent(invoice.tenantId)}`,
      resourceType: "tenant_invoice",
      resourceId: invoice.invoiceId,
      openMode: "new_tab",
      label: "平台稽核",
    },
  ];
}

function buildInvoiceActions(invoice: InvoiceViewRecord): InvoiceAction[] {
  return [
    {
      action: "download_artifact",
      enabled:
        invoice.artifactState === "ready" && Boolean(invoice.artifactUrl),
      riskLevel: "low",
      label: "下載 PDF",
      ...(invoice.artifactState === "expired"
        ? { disabledReasonCode: "artifact_expired" }
        : invoice.artifactState === "missing"
          ? { disabledReasonCode: "artifact_missing" }
          : {}),
      ...(invoice.artifactState === "ready" && invoice.artifactUrl
        ? { href: invoice.artifactUrl, target: "_blank" as const }
        : {}),
    },
    {
      action: "view_detail",
      enabled: true,
      riskLevel: "low",
      href: `/invoices?invoice=${encodeURIComponent(invoice.invoiceId)}`,
      label: "查看明細",
    },
  ];
}

function toInvoiceAction(
  descriptor: ResourceActionDescriptor,
  invoice: InvoiceViewRecord,
): InvoiceAction {
  if (descriptor.action === "download_artifact") {
    return {
      ...descriptor,
      label: "下載 PDF",
      ...(invoice.artifactState === "ready" && invoice.artifactUrl
        ? { href: invoice.artifactUrl, target: "_blank" as const }
        : {}),
    };
  }

  if (descriptor.action === "view_detail") {
    return {
      ...descriptor,
      href: `/invoices?invoice=${encodeURIComponent(invoice.invoiceId)}`,
      label: "查看明細",
    };
  }

  return {
    ...descriptor,
    label: descriptor.action,
  };
}

function toInvoiceViewRecord(invoice: TenantInvoiceRecord): InvoiceViewRecord {
  const invoiceRecord = invoice as TenantInvoiceRecord &
    Record<string, unknown>;
  const dueAt = readOptionalString(invoiceRecord.dueAt);
  const expiresAt =
    readOptionalString(invoiceRecord.expiresAt) ??
    parseArtifactExpiry(invoice.artifactUrl);
  const artifactState = !invoice.artifactUrl
    ? "missing"
    : isExpired(expiresAt)
      ? "expired"
      : "ready";
  const normalizedStatus =
    invoice.status === "issued" && dueAt && isExpired(dueAt)
      ? "overdue"
      : invoice.status;

  const record: InvoiceViewRecord = {
    ...invoice,
    status: normalizedStatus,
    dueAt,
    expiresAt,
    artifactState,
    auditHref: `/audit?resourceType=tenant_invoice&resourceId=${encodeURIComponent(invoice.invoiceId)}`,
    crossAppLinks: [],
    availableActions: [],
  };

  const rawActions = Array.isArray(invoiceRecord.availableActions)
    ? invoiceRecord.availableActions.filter(isResourceActionDescriptor)
    : [];
  record.availableActions =
    rawActions.length > 0
      ? rawActions.map((descriptor) => toInvoiceAction(descriptor, record))
      : buildInvoiceActions(record);
  const rawLinks = Array.isArray(invoiceRecord.crossAppLinks)
    ? invoiceRecord.crossAppLinks.filter(isCrossAppResourceLink)
    : [];
  record.crossAppLinks =
    rawLinks.length > 0 ? rawLinks : buildFallbackCrossAppLinks(record);
  return record;
}

async function loadInvoicesData(): Promise<InvoicesPageData> {
  try {
    const response = await fetch(`${API_URL}/api/tenant/invoices`, {
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "X-Tenant-Id": DEMO_TENANT_ID,
        "X-Actor-Id": DEMO_ACTOR_ID,
      },
    });

    if (!response.ok) {
      throw new Error(`API error ${response.status}: ${await response.text()}`);
    }

    const envelope = (await response.json()) as ApiSuccessEnvelope<{
      items?: TenantInvoiceRecord[];
    }>;
    const invoices = Array.isArray(envelope.data?.items)
      ? envelope.data.items.map(toInvoiceViewRecord)
      : [];

    return {
      invoices,
      errors: [],
      refresh: buildRefreshMetadata(envelope.meta?.timestamp, "live"),
    };
  } catch (error) {
    return {
      invoices: [],
      errors: [toErrorMessage(error)],
      refresh: buildRefreshMetadata(undefined, "cache"),
    };
  }
}

function getEmptyEnvelope(reason: EmptyReason): EmptyStateEnvelope {
  switch (reason) {
    case "not_provisioned":
      return {
        reason,
        messageCode: "tenant_invoice_not_provisioned",
        nextAction: {
          action: "review_billing_setup",
          enabled: true,
          riskLevel: "low",
        },
      };
    case "fetch_failed":
      return {
        reason,
        messageCode: "tenant_invoice_fetch_failed",
        nextAction: {
          action: "refresh",
          enabled: true,
          riskLevel: "low",
        },
      };
    case "permission_denied":
      return {
        reason,
        messageCode: "tenant_invoice_permission_denied",
      };
    case "external_unavailable":
      return {
        reason,
        messageCode: "tenant_invoice_artifact_unavailable",
        nextAction: {
          action: "review_audit",
          enabled: true,
          riskLevel: "low",
        },
      };
    case "filtered_empty":
      return {
        reason,
        messageCode: "tenant_invoice_filtered_empty",
        nextAction: {
          action: "clear_filters",
          enabled: true,
          riskLevel: "low",
        },
      };
    case "no_data":
    default:
      return {
        reason: "no_data",
        messageCode: "tenant_invoice_no_data",
        nextAction: {
          action: "review_billing_setup",
          enabled: true,
          riskLevel: "low",
        },
      };
  }
}

function renderEmptyState(
  empty: EmptyStateEnvelope,
  options: {
    clearHref: string;
    refreshHref: string;
  },
) {
  const config: Record<
    EmptyReason,
    {
      title: string;
      body: string;
      tone: CanvasTone;
      ctaLabel?: string;
      ctaHref?: string;
    }
  > = {
    no_data: {
      title: "尚未產生任何發票",
      body: "這個 tenant 目前沒有 invoice history。當結算批次完成後，這裡會出現可下載的 signed artifact 與狀態。",
      tone: "neutral",
      ctaLabel: "查看帳務設定",
      ctaHref: "/settings",
    },
    driver_not_eligible: {
      title: "這個 empty state 僅適用 driver app",
      body: "Tenant invoices 不應由後端回傳 driver_not_eligible。若看到這個狀態，代表上游 envelope 映射錯誤，需要回到 contract / adapter 層修正。",
      tone: "danger",
      ctaLabel: "查看稽核",
      ctaHref: "/audit",
    },
    not_provisioned: {
      title: "帳務尚未完成 provisioning",
      body: "目前沒有可用的 tenant invoice surface。請先確認 billing profile 與 finance provisioning 是否已完成。",
      tone: "warn",
      ctaLabel: "檢查設定",
      ctaHref: "/settings",
    },
    fetch_failed: {
      title: "發票讀取失敗",
      body: "後端沒有回傳可用的 invoice list。這不是空資料，而是目前快照無法完成讀取。",
      tone: "danger",
      ctaLabel: "重新整理",
      ctaHref: options.refreshHref,
    },
    permission_denied: {
      title: "目前角色沒有查看發票權限",
      body: "這個畫面收到的是 permission-denied empty state。請由 tenant admin 檢查角色授權或改由有權限的 actor 開啟。",
      tone: "warn",
      ctaLabel: "查看稽核",
      ctaHref: "/audit",
    },
    external_unavailable: {
      title: "短效下載服務暫時不可用",
      body: "Invoice artifact authority 目前不可用，因此資料列雖存在，下載仍無法安全提供。請稍後重試或從 audit 查核平台側異常。",
      tone: "warn",
      ctaLabel: "前往稽核",
      ctaHref: "/audit",
    },
    filtered_empty: {
      title: "目前篩選條件沒有結果",
      body: "Invoice list 有資料，但這組 status / period / search 條件沒有匹配項目。清除篩選即可回到完整清單。",
      tone: "info",
      ctaLabel: "清除篩選",
      ctaHref: options.clearHref,
    },
  };

  const view = config[empty.reason];

  return (
    <div style={emptyStateStyle}>
      <CanvasPill theme={th} tone={view.tone} dot>
        {empty.reason}
      </CanvasPill>
      <div style={emptyTitleStyle}>{view.title}</div>
      <div style={emptyBodyStyle}>{view.body}</div>
      {view.ctaHref && view.ctaLabel ? (
        <Link href={view.ctaHref} style={actionLinkBaseStyle}>
          {view.ctaLabel}
        </Link>
      ) : null}
    </div>
  );
}

function renderAction(action: InvoiceAction, key: string) {
  if (action.enabled && action.href) {
    const isExternal = action.target === "_blank";
    return (
      <a
        key={key}
        href={action.href}
        target={action.target}
        rel={isExternal ? "noreferrer" : undefined}
        style={actionLinkBaseStyle}
      >
        {action.label}
      </a>
    );
  }

  return (
    <span
      key={key}
      style={disabledActionStyle}
      title={action.disabledReasonCode}
    >
      {action.label}
    </span>
  );
}

function compareInvoices(left: InvoiceViewRecord, right: InvoiceViewRecord) {
  return right.periodEnd.localeCompare(left.periodEnd);
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const data = await loadInvoicesData();
  const resolvedSearchParams = await searchParams;
  const requestedPeriod = Array.isArray(resolvedSearchParams.period)
    ? resolvedSearchParams.period[0]
    : resolvedSearchParams.period;
  const requestedStatus = Array.isArray(resolvedSearchParams.status)
    ? resolvedSearchParams.status[0]
    : resolvedSearchParams.status;
  const requestedQuery = Array.isArray(resolvedSearchParams.q)
    ? resolvedSearchParams.q[0]
    : resolvedSearchParams.q;
  const requestedInvoice = Array.isArray(resolvedSearchParams.invoice)
    ? resolvedSearchParams.invoice[0]
    : resolvedSearchParams.invoice;
  const requestedEmptyReason = Array.isArray(resolvedSearchParams.emptyReason)
    ? resolvedSearchParams.emptyReason[0]
    : resolvedSearchParams.emptyReason;

  const allInvoices = [...data.invoices].sort(compareInvoices);
  const periodOptions = Array.from(
    new Set(allInvoices.map((invoice) => toPeriodKey(invoice.periodStart))),
  );
  const statusOptions: InvoiceStatus[] = ["draft", "issued", "paid", "overdue"];
  const selectedPeriod =
    requestedPeriod && periodOptions.includes(requestedPeriod)
      ? requestedPeriod
      : "";
  const selectedStatus =
    requestedStatus && statusOptions.includes(requestedStatus as InvoiceStatus)
      ? (requestedStatus as InvoiceStatus)
      : "";
  const searchQuery = requestedQuery?.trim().toLowerCase() ?? "";

  const filteredInvoices = allInvoices.filter((invoice) => {
    if (selectedPeriod && toPeriodKey(invoice.periodStart) !== selectedPeriod) {
      return false;
    }
    if (selectedStatus && invoice.status !== selectedStatus) {
      return false;
    }
    if (searchQuery && !invoice.invoiceId.toLowerCase().includes(searchQuery)) {
      return false;
    }
    return true;
  });

  const rows =
    requestedEmptyReason &&
    [
      "no_data",
      "not_provisioned",
      "fetch_failed",
      "permission_denied",
      "external_unavailable",
      "filtered_empty",
    ].includes(requestedEmptyReason)
      ? []
      : filteredInvoices;

  const searchState = new URLSearchParams();
  if (selectedPeriod) searchState.set("period", selectedPeriod);
  if (selectedStatus) searchState.set("status", selectedStatus);
  if (searchQuery) searchState.set("q", requestedQuery ?? searchQuery);

  const clearHref = "/invoices";
  const refreshHref = buildHref(searchState, {
    invoice: requestedInvoice ?? null,
    emptyReason: null,
    refreshAt: String(Date.now()),
  });
  const latestInvoice = rows[0] ?? allInvoices[0] ?? null;
  const overdueCount = allInvoices.filter(
    (invoice) => invoice.status === "overdue",
  ).length;
  const expiredCount = allInvoices.filter(
    (invoice) => invoice.artifactState === "expired",
  ).length;
  const paidCount = allInvoices.filter(
    (invoice) => invoice.status === "paid",
  ).length;
  const metricInvoices =
    selectedPeriod || selectedStatus || searchQuery
      ? rows
      : latestInvoice
        ? [latestInvoice]
        : [];
  const totalTrips = metricInvoices.reduce(
    (count, invoice) => count + invoice.lines.length,
    0,
  );
  const averageTicketAmount = buildAverageTicketAmount(metricInvoices);
  const emptyReason = (() => {
    if (
      requestedEmptyReason &&
      [
        "no_data",
        "not_provisioned",
        "fetch_failed",
        "permission_denied",
        "external_unavailable",
        "filtered_empty",
      ].includes(requestedEmptyReason)
    ) {
      return requestedEmptyReason as EmptyReason;
    }
    if (data.errors.length > 0 && allInvoices.length === 0) {
      return "fetch_failed" as const;
    }
    if (allInvoices.length === 0) {
      return "no_data" as const;
    }
    if (filteredInvoices.length === 0) {
      return "filtered_empty" as const;
    }
    return null;
  })();

  const emptyEnvelope = emptyReason ? getEmptyEnvelope(emptyReason) : null;

  const selectedInvoice =
    allInvoices.find((invoice) => invoice.invoiceId === requestedInvoice) ??
    rows[0] ??
    latestInvoice;

  const columns: CanvasTableColumn<InvoiceViewRecord>[] = [
    {
      h: "INVOICE",
      w: 200,
      mono: true,
      r: (row) => (
        <div style={lineClampStyle}>
          <span style={invoicePrimaryStyle}>{row.invoiceId}</span>
          <span style={mutedMonoStyle}>
            {formatCanvasCount(row.lines.length)} lines
          </span>
        </div>
      ),
    },
    {
      h: "PERIOD",
      w: 110,
      mono: true,
      r: (row) => toPeriodKey(row.periodStart),
    },
    {
      h: "AMOUNT",
      w: 160,
      mono: true,
      align: "right",
      r: (row) => formatCanvasMoney(row.amount),
    },
    {
      h: "STATUS",
      w: 110,
      r: (row) => (
        <CanvasPill theme={th} tone={getStatusTone(row.status)} dot>
          {row.status}
        </CanvasPill>
      ),
    },
    {
      h: "DUE",
      w: 130,
      mono: true,
      r: (row) => formatDateInput(row.dueAt) || "—",
    },
    {
      h: "ISSUED",
      w: 150,
      mono: true,
      r: (row) => formatDateInput(row.createdAt) || "—",
    },
    {
      h: "ACTIONS",
      w: 220,
      r: (row) => (
        <div style={actionRowStyle}>
          {row.availableActions.map((action, index) =>
            renderAction(
              action.action === "view_detail"
                ? {
                    ...action,
                    href: buildHref(searchState, {
                      invoice: row.invoiceId,
                      emptyReason: null,
                    }),
                  }
                : action,
              `${row.invoiceId}-${action.action}-${index}`,
            ),
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <InvoicesRefreshTicker intervalMs={REFRESH_INTERVAL_MS} />

      <CanvasPageHeader
        theme={th}
        title="發票 · Invoices"
        subtitle="signed artifact · status 由後端決定 · 30s refresh tier"
        actions={
          <div style={actionRowStyle}>
            <Link href={refreshHref} style={actionLinkBaseStyle}>
              重新整理
            </Link>
            {latestInvoice?.availableActions.find(
              (action) =>
                action.action === "download_artifact" && action.enabled,
            )?.href ? (
              <a
                href={
                  latestInvoice.availableActions.find(
                    (action) => action.action === "download_artifact",
                  )?.href
                }
                target="_blank"
                rel="noreferrer"
                style={actionLinkBaseStyle}
              >
                下載最新 PDF
              </a>
            ) : (
              <span style={disabledActionStyle}>下載最新 PDF</span>
            )}
          </div>
        }
      />

      <div style={pageBodyStyle}>
        {data.errors.length > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title="發票清單未完整載入"
            body={data.errors.join(" / ")}
          />
        ) : null}

        {expiredCount > 0 ? (
          <CanvasBanner
            theme={th}
            tone="info"
            icon="clock"
            title="Signed artifact 為短效 URL"
            body={`${formatCanvasCount(expiredCount)} 筆 artifact 已過期。下載 CTA 會由 availableActions 保持 disabled，不會假裝仍可取用。`}
          />
        ) : null}

        <div style={topMetaGridStyle}>
          <CanvasCard theme={th}>
            <div style={filterCardStyle}>
              <div style={subheadingStyle}>Filter and search</div>
              <form method="get" style={filterGridStyle}>
                <label style={fieldStyle}>
                  <span style={labelStyle}>Search by invoice id</span>
                  <input
                    name="q"
                    defaultValue={requestedQuery ?? ""}
                    placeholder="invoice-"
                    style={controlStyle}
                  />
                </label>
                <label style={fieldStyle}>
                  <span style={labelStyle}>Status</span>
                  <select
                    name="status"
                    defaultValue={selectedStatus}
                    style={controlStyle}
                  >
                    <option value="">all</option>
                    {statusOptions.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={fieldStyle}>
                  <span style={labelStyle}>Period</span>
                  <select
                    name="period"
                    defaultValue={selectedPeriod}
                    style={controlStyle}
                  >
                    <option value="">all</option>
                    {periodOptions.map((period) => (
                      <option key={period} value={period}>
                        {period}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="submit" style={actionLinkBaseStyle}>
                  套用
                </button>
                <Link href={clearHref} style={actionLinkBaseStyle}>
                  清除
                </Link>
              </form>
              <div style={filterMetaStyle}>
                <CanvasPill theme={th} tone="accent" dot>
                  T5 / 30s
                </CanvasPill>
                <span>{formatCanvasCount(allInvoices.length)} invoice(s)</span>
                <span>Search hits: {formatCanvasCount(rows.length)}</span>
                <span>Entry: /billing, sidebar</span>
              </div>
            </div>
          </CanvasCard>

          <CanvasCard theme={th}>
            <div style={refreshCardStyle}>
              <div style={subheadingStyle}>Refresh posture</div>
              <div style={refreshMetaStyle}>
                <div style={refreshRowStyle}>
                  <span>Snapshot</span>
                  <strong style={detailStatValueStyle}>
                    {formatDateTime(data.refresh.generatedAt)}
                  </strong>
                </div>
                <div style={refreshRowStyle}>
                  <span>Freshness</span>
                  <CanvasPill
                    theme={th}
                    tone={
                      data.refresh.dataFreshness === "stale"
                        ? "warn"
                        : data.refresh.dataFreshness === "unknown"
                          ? "neutral"
                          : "success"
                    }
                    dot
                  >
                    {data.refresh.dataFreshness}
                  </CanvasPill>
                </div>
                <div style={refreshRowStyle}>
                  <span>Source</span>
                  <span style={mutedMonoStyle}>{data.refresh.source}</span>
                </div>
                <div style={refreshRowStyle}>
                  <span>Tier</span>
                  <span style={mutedMonoStyle}>
                    {REFRESH_TIER} · {REFRESH_INTERVAL_MS / 1000}s cadence
                  </span>
                </div>
              </div>
            </div>
          </CanvasCard>
        </div>

        <div style={kpiGridStyle}>
          <CanvasKPI
            theme={th}
            label={
              latestInvoice
                ? `當期 (${toPeriodKey(latestInvoice.periodStart)})`
                : "當期"
            }
            value={
              latestInvoice ? formatCanvasMoney(latestInvoice.amount) : "—"
            }
            delta={latestInvoice?.status}
            deltaTone={
              latestInvoice
                ? getStatusDeltaTone(latestInvoice.status)
                : "neutral"
            }
          />
          <CanvasKPI
            theme={th}
            label="行程數"
            value={formatCanvasCount(totalTrips)}
          />
          <CanvasKPI
            theme={th}
            label="平均單筆"
            value={formatCanvasMoney(averageTicketAmount)}
          />
          <CanvasKPI
            theme={th}
            label="已付款 / 逾期 / artifact expired"
            value={`${formatCanvasCount(paidCount)} / ${formatCanvasCount(overdueCount)} / ${formatCanvasCount(expiredCount)}`}
          />
        </div>

        <CanvasCard theme={th} padding={0}>
          {emptyEnvelope ? (
            renderEmptyState(emptyEnvelope, { clearHref, refreshHref })
          ) : (
            <CanvasTable<InvoiceViewRecord>
              theme={th}
              rows={rows}
              columns={columns}
            />
          )}
        </CanvasCard>

        {selectedInvoice && !emptyEnvelope ? (
          <div style={detailGridStyle}>
            <CanvasCard theme={th} padding={0}>
              <div style={detailCardBodyStyle}>
                <div style={subheadingStyle}>Invoice detail</div>
                <div style={detailStatGridStyle}>
                  <div style={detailStatStyle}>
                    <span style={detailStatLabelStyle}>Invoice</span>
                    <span style={detailStatValueStyle}>
                      {selectedInvoice.invoiceId}
                    </span>
                  </div>
                  <div style={detailStatStyle}>
                    <span style={detailStatLabelStyle}>Artifact</span>
                    <span style={detailStatValueStyle}>
                      <CanvasPill
                        theme={th}
                        tone={getArtifactTone(selectedInvoice.artifactState)}
                        dot
                      >
                        {getArtifactLabel(selectedInvoice.artifactState)}
                      </CanvasPill>
                    </span>
                  </div>
                  <div style={detailStatStyle}>
                    <span style={detailStatLabelStyle}>Period</span>
                    <span style={detailStatValueStyle}>
                      {formatDateInput(selectedInvoice.periodStart) || "—"} to{" "}
                      {formatDateInput(selectedInvoice.periodEnd) || "—"}
                    </span>
                  </div>
                  <div style={detailStatStyle}>
                    <span style={detailStatLabelStyle}>Issued / Due</span>
                    <span style={detailStatValueStyle}>
                      {formatDateTime(selectedInvoice.createdAt)} /{" "}
                      {formatDateInput(selectedInvoice.dueAt) || "—"}
                    </span>
                  </div>
                  <div style={detailStatStyle}>
                    <span style={detailStatLabelStyle}>Amount</span>
                    <span style={detailStatValueStyle}>
                      {formatCanvasMoney(selectedInvoice.amount)}
                    </span>
                  </div>
                  <div style={detailStatStyle}>
                    <span style={detailStatLabelStyle}>Artifact expiresAt</span>
                    <span style={detailStatValueStyle}>
                      {formatArtifactExpiry(selectedInvoice.expiresAt)}
                    </span>
                  </div>
                  <div style={detailStatStyle}>
                    <span style={detailStatLabelStyle}>Artifact URL</span>
                    <span style={detailStatValueStyle}>
                      {selectedInvoice.artifactUrl ? (
                        <a
                          href={selectedInvoice.artifactUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={invoicePrimaryStyle}
                        >
                          {selectedInvoice.artifactUrl}
                        </a>
                      ) : (
                        "—"
                      )}
                    </span>
                  </div>
                  <div style={detailStatStyle}>
                    <span style={detailStatLabelStyle}>Pricing snapshot</span>
                    <span style={detailStatValueStyle}>
                      {selectedInvoice.pricingVersionSnapshot}
                    </span>
                  </div>
                </div>

                <div style={actionRowStyle}>
                  {selectedInvoice.availableActions.map((action, index) =>
                    renderAction(
                      action.action === "view_detail"
                        ? {
                            ...action,
                            href: buildHref(searchState, {
                              invoice: selectedInvoice.invoiceId,
                              emptyReason: null,
                            }),
                          }
                        : action,
                      `detail-${action.action}-${index}`,
                    ),
                  )}
                  <Link
                    href={selectedInvoice.auditHref}
                    style={actionLinkBaseStyle}
                  >
                    稽核檢視
                  </Link>
                </div>

                <div style={detailLinkListStyle}>
                  <div style={subheadingStyle}>Cross-app deep links</div>
                  {selectedInvoice.crossAppLinks.map((link) => (
                    <a
                      key={`${link.targetApp}-${link.resourceType}-${link.resourceId}-${link.route}`}
                      href={buildCrossAppHref(link)}
                      target={
                        link.openMode === "new_tab" ? "_blank" : undefined
                      }
                      rel={
                        link.openMode === "new_tab" ? "noreferrer" : undefined
                      }
                      style={externalLinkStyle}
                    >
                      <span>{link.label}</span>
                      <span style={mutedMonoStyle}>{link.targetApp}</span>
                    </a>
                  ))}
                </div>
              </div>
            </CanvasCard>

            <CanvasCard theme={th} padding={0}>
              <div style={detailCardBodyStyle}>
                <div style={subheadingStyle}>Invoice lines</div>
                <div style={detailLineListStyle}>
                  {selectedInvoice.lines.slice(0, 6).map((line) => (
                    <div key={line.lineId} style={detailLineItemStyle}>
                      <div style={refreshRowStyle}>
                        <strong style={detailStatValueStyle}>
                          {line.description}
                        </strong>
                        <span style={mutedMonoStyle}>
                          {formatCanvasMoney(line.amount)}
                        </span>
                      </div>
                      <div style={detailLineMetaStyle}>
                        <span>{line.orderId}</span>
                        <span>{line.orderSource}</span>
                        <span>{line.serviceBucket}</span>
                        <span>{line.businessDispatchSubtype}</span>
                      </div>
                    </div>
                  ))}
                </div>
                {selectedInvoice.lines.length > 6 ? (
                  <div style={emptyBodyStyle}>
                    顯示前 6 筆 line item；完整細節仍以下載 artifact 為
                    authority。
                  </div>
                ) : null}
              </div>
            </CanvasCard>
          </div>
        ) : null}
      </div>
    </div>
  );
}
