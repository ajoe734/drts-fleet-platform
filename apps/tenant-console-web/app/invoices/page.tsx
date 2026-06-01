import Link from "next/link";
import type { CSSProperties } from "react";
import type {
  BillingDocumentStatus,
  CrossAppResourceLink,
  EmptyReason,
  EmptyStateEnvelope,
  MoneyAmount,
  RefreshTier,
  ResourceActionDescriptor,
  TenantBillingProfile,
  TenantInvoiceRecord,
  UiRefreshMetadata,
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
import { formatDateInput } from "@/lib/formatters";

export const dynamic = "force-dynamic";

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

const REFRESH_TIER: RefreshTier = "slow";
const REFRESH_INTERVAL_MS = 30_000;
const STATUS_FILTERS = ["all", "draft", "issued", "paid", "overdue"] as const;
const EMPTY_REASONS: EmptyReason[] = [
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
  "filtered_empty",
];

const pageStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const summaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const summaryCardBodyStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const summaryLabelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 0.4,
  textTransform: "uppercase",
  color: th.textMuted,
};

const summaryValueStyle: CSSProperties = {
  fontSize: 24,
  lineHeight: 1.05,
  fontWeight: 800,
  color: th.text,
  fontFamily: th.monoFamily,
};

const summarySubtleStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 12,
  lineHeight: 1.45,
};

const filterGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.3fr) repeat(2, minmax(180px, 0.8fr)) auto",
  gap: 12,
  alignItems: "end",
};

const fieldStackStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const fieldLabelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 0.4,
  textTransform: "uppercase",
  color: th.textMuted,
};

const fieldControlStyle: CSSProperties = {
  width: "100%",
  minHeight: 38,
  borderRadius: 10,
  border: `1px solid ${th.border}`,
  background: th.surface,
  color: th.text,
  fontSize: 12.5,
  padding: "0 12px",
  fontFamily: th.fontFamily,
};

const filterActionsStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};

const primaryButtonStyle: CSSProperties = {
  minHeight: 38,
  minWidth: 110,
  padding: "0 14px",
  borderRadius: 10,
  border: `1px solid ${th.accent}`,
  background: th.accent,
  color: "#fff",
  fontWeight: 700,
  fontFamily: th.fontFamily,
  cursor: "pointer",
};

const pageGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.5fr) minmax(300px, 0.9fr)",
  gap: 16,
  alignItems: "start",
};

const sideStackStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const helperTextStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 12,
  lineHeight: 1.5,
};

const tableCardStyle: CSSProperties = {
  overflow: "hidden",
};

const invoicePrimaryStyle: CSSProperties = {
  color: th.accent,
  fontWeight: 700,
  fontFamily: th.monoFamily,
};

const invoiceSecondaryStyle: CSSProperties = {
  marginTop: 4,
  color: th.textMuted,
  fontSize: 11.5,
};

const actionRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const actionChipStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 28,
  padding: "0 10px",
  borderRadius: 999,
  border: `1px solid ${th.border}`,
  background: th.surfaceLo,
  color: th.text,
  fontSize: 11.5,
  fontWeight: 600,
  textDecoration: "none",
};

const monoHintStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 11.5,
  fontFamily: th.monoFamily,
};

const detailTitleStyle: CSSProperties = {
  fontSize: 22,
  lineHeight: 1.05,
  fontWeight: 800,
  color: th.text,
  fontFamily: th.monoFamily,
};

const metaRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
};

const dlStyle: CSSProperties = {
  margin: 0,
  display: "grid",
  gridTemplateColumns: "120px minmax(0, 1fr)",
  gap: "10px 12px",
  fontSize: 12.5,
};

const emptyStateWrapStyle: CSSProperties = {
  padding: 28,
  display: "flex",
  flexDirection: "column",
  gap: 12,
  alignItems: "flex-start",
};

const emptyTitleStyle: CSSProperties = {
  fontSize: 20,
  fontWeight: 700,
  color: th.text,
  lineHeight: 1.15,
};

const lineListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const lineItemStyle: CSSProperties = {
  padding: "12px 14px",
  borderRadius: 14,
  border: `1px solid ${th.border}`,
  background: th.surfaceLo,
};

const inlineLinkStyle: CSSProperties = {
  color: th.accent,
  textDecoration: "none",
  fontSize: 12.5,
  lineHeight: 1.45,
};

type StatusFilter = (typeof STATUS_FILTERS)[number];

type InvoiceActionView = ResourceActionDescriptor & {
  label: string;
  href?: string;
};

type InvoiceViewRecord = TenantInvoiceRecord & {
  dueDate: string | null;
  expiresAt: string | null;
  statusView: BillingDocumentStatus | "overdue";
  availableActions: InvoiceActionView[];
  deepLinks: CrossAppResourceLink[];
};

type InvoiceRow = InvoiceViewRecord & Record<string, unknown>;

type InvoiceFilters = {
  query: string;
  period: string;
  status: StatusFilter;
  invoiceId: string;
  emptyReason: EmptyReason | null;
};

type InvoicesPageData = {
  billingProfile: TenantBillingProfile | null;
  invoices: InvoiceViewRecord[];
  errors: string[];
  refresh: UiRefreshMetadata;
  emptyReason: EmptyReason | null;
};

function toErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Unknown tenant invoice error.";
}

function parseHttpStatus(error: unknown) {
  const match = toErrorMessage(error).match(/API error (\d{3})/);
  return match ? Number.parseInt(match[1] ?? "", 10) : null;
}

function isSignerError(error: unknown) {
  const message = toErrorMessage(error).toLowerCase();
  return (
    message.includes("signer") ||
    message.includes("signed url") ||
    message.includes("artifact") ||
    message.includes("unavailable")
  );
}

function classifyRequestError(error: unknown): EmptyReason {
  const status = parseHttpStatus(error);
  if (status === 401 || status === 403) return "permission_denied";
  if (status === 404 || status === 422) return "not_provisioned";
  if (
    status === 502 ||
    status === 503 ||
    status === 504 ||
    isSignerError(error)
  ) {
    return "external_unavailable";
  }
  return "fetch_failed";
}

function toPeriodKey(value: string | null | undefined) {
  return value ? value.slice(0, 7) : "";
}

function formatCanvasMoney(value: MoneyAmount | null | undefined) {
  if (!value) return "—";

  const amount = value.amountMinor / 100;
  const currencyLabel = value.currency === "TWD" ? "NT$" : value.currency;
  return `${currencyLabel} ${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(amount)}`;
}

function isIsoPast(value: string | null | undefined) {
  if (!value) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed < Date.now();
}

function addDays(value: string, days: number) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString();
}

function parseArtifactExpiry(artifactUrl: string | null) {
  if (!artifactUrl) return null;

  try {
    const parsed = new URL(artifactUrl);
    const expiresAt = parsed.searchParams.get("expires_at");
    if (!expiresAt) return null;
    return Number.isFinite(Date.parse(expiresAt)) ? expiresAt : null;
  } catch {
    return null;
  }
}

function deriveInvoiceStatus(invoice: TenantInvoiceRecord) {
  const dueDate = addDays(invoice.periodEnd, 14);
  if (invoice.status === "issued" && isIsoPast(dueDate)) {
    return "overdue" as const;
  }
  return invoice.status;
}

function buildInvoiceActions(
  invoice: TenantInvoiceRecord,
): InvoiceActionView[] {
  const invoiceId = encodeURIComponent(invoice.invoiceId);

  return [
    {
      action: "download_artifact",
      enabled: Boolean(invoice.artifactUrl),
      riskLevel: "low",
      label: "下載簽名檔",
      ...(invoice.artifactUrl ? { href: invoice.artifactUrl } : {}),
      ...(!invoice.artifactUrl
        ? { disabledReasonCode: "artifact_missing" }
        : {}),
    },
    {
      action: "view_detail",
      enabled: true,
      riskLevel: "low",
      label: "檢視詳情",
      href: `/invoices?invoiceId=${invoiceId}`,
    },
  ];
}

function buildInvoiceDeepLinks(
  invoice: TenantInvoiceRecord,
): CrossAppResourceLink[] {
  const invoiceId = encodeURIComponent(invoice.invoiceId);

  return [
    {
      targetApp: "tenant-console",
      route: `/billing?invoiceId=${invoiceId}`,
      resourceType: "invoice",
      resourceId: invoice.invoiceId,
      openMode: "same_tab",
      label: "返回帳務概覽",
    },
    {
      targetApp: "tenant-console",
      route: `/audit?resourceType=tenant_invoice&resourceId=${invoiceId}`,
      resourceType: "audit_event",
      resourceId: invoice.invoiceId,
      openMode: "same_tab",
      label: "查看租戶稽核",
    },
    {
      targetApp: "platform-admin",
      route: `/payments?invoiceId=${invoiceId}`,
      resourceType: "invoice",
      resourceId: invoice.invoiceId,
      openMode: "new_tab",
      label: "前往 Platform Admin 付款治理",
    },
    {
      targetApp: "platform-admin",
      route: `/audit?resourceType=tenant_invoice&resourceId=${invoiceId}`,
      resourceType: "audit_event",
      resourceId: invoice.invoiceId,
      openMode: "new_tab",
      label: "前往 Platform Admin 稽核",
    },
  ];
}

function normalizeInvoice(invoice: TenantInvoiceRecord): InvoiceViewRecord {
  return {
    ...invoice,
    dueDate: invoice.status === "paid" ? null : addDays(invoice.periodEnd, 14),
    expiresAt: parseArtifactExpiry(invoice.artifactUrl),
    statusView: deriveInvoiceStatus(invoice),
    availableActions: buildInvoiceActions(invoice),
    deepLinks: buildInvoiceDeepLinks(invoice),
  };
}

async function loadInvoicesData(): Promise<InvoicesPageData> {
  const client = getTenantClient();
  const generatedAt = new Date().toISOString();
  const [billingResult, invoicesResult] = await Promise.allSettled([
    client.getBillingProfile() as Promise<TenantBillingProfile>,
    client.listInvoices() as Promise<TenantInvoiceRecord[]>,
  ]);

  const invoices =
    invoicesResult.status === "fulfilled"
      ? invoicesResult.value.map(normalizeInvoice)
      : [];
  const errors: string[] = [];
  let emptyReason: EmptyReason | null = null;

  if (billingResult.status === "rejected") {
    errors.push(`Billing profile: ${toErrorMessage(billingResult.reason)}`);
  }
  if (invoicesResult.status === "rejected") {
    errors.push(`Invoice register: ${toErrorMessage(invoicesResult.reason)}`);
  }

  if (invoices.length === 0) {
    if (invoicesResult.status === "rejected") {
      emptyReason = classifyRequestError(invoicesResult.reason);
    } else if (billingResult.status === "rejected") {
      emptyReason = classifyRequestError(billingResult.reason);
    } else if (!billingResult.value.invoiceTitle.trim()) {
      emptyReason = "not_provisioned";
    } else {
      emptyReason = "no_data";
    }
  }

  return {
    billingProfile:
      billingResult.status === "fulfilled" ? billingResult.value : null,
    invoices,
    errors,
    refresh: {
      generatedAt,
      staleAfterMs: REFRESH_INTERVAL_MS,
      dataFreshness: errors.length > 0 ? "degraded" : "fresh",
      source: "live",
    },
    emptyReason,
  };
}

function parseFilters(
  params: Record<string, string | string[] | undefined>,
): InvoiceFilters {
  const first = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
  };

  const statusRaw = first("status");
  const emptyReasonRaw = first("emptyReason");

  return {
    query: first("q").trim(),
    period: first("period").trim(),
    status: STATUS_FILTERS.includes(statusRaw as StatusFilter)
      ? (statusRaw as StatusFilter)
      : "all",
    invoiceId: first("invoiceId").trim(),
    emptyReason: EMPTY_REASONS.includes(emptyReasonRaw as EmptyReason)
      ? (emptyReasonRaw as EmptyReason)
      : null,
  };
}

function getStatusTone(status: InvoiceViewRecord["statusView"]): CanvasTone {
  switch (status) {
    case "paid":
      return "success";
    case "issued":
      return "info";
    case "overdue":
      return "danger";
    case "draft":
    default:
      return "neutral";
  }
}

function getRefreshTone(refresh: UiRefreshMetadata): CanvasTone {
  if (refresh.dataFreshness === "degraded") return "danger";
  if (refresh.dataFreshness === "stale") return "warn";
  return "info";
}

function buildEmptyState(
  reason: EmptyReason,
  filters: InvoiceFilters,
): EmptyStateEnvelope {
  switch (reason) {
    case "not_provisioned":
      return {
        reason,
        messageCode: "tenant_invoice_not_provisioned",
        nextAction: {
          action: "open_billing_setup",
          enabled: true,
          riskLevel: "medium",
        },
      };
    case "fetch_failed":
      return {
        reason,
        messageCode: "tenant_invoice_fetch_failed",
        nextAction: {
          action: "refresh_snapshot",
          enabled: true,
          riskLevel: "low",
        },
      };
    case "permission_denied":
      return {
        reason,
        messageCode: "tenant_invoice_permission_denied",
        nextAction: {
          action: "review_access",
          enabled: true,
          riskLevel: "low",
        },
      };
    case "external_unavailable":
      return {
        reason,
        messageCode: "tenant_invoice_artifact_signer_unavailable",
        nextAction: {
          action: "open_platform_audit",
          enabled: true,
          riskLevel: "low",
        },
      };
    case "filtered_empty":
      return {
        reason,
        messageCode:
          filters.query || filters.period || filters.status !== "all"
            ? "tenant_invoice_filtered_empty"
            : "tenant_invoice_empty",
        nextAction: {
          action: "clear_filters",
          enabled: true,
          riskLevel: "low",
        },
      };
    case "no_data":
    default:
      return {
        reason,
        messageCode: "tenant_invoice_no_data",
        nextAction: {
          action: "open_billing",
          enabled: true,
          riskLevel: "low",
        },
      };
  }
}

function describeEmptyState(reason: EmptyReason) {
  switch (reason) {
    case "not_provisioned":
      return {
        title: "尚未完成帳務設定",
        body: "租戶 billing profile 尚未準備好，先補齊 invoice title、稅籍與月結設定，再回到發票頁。",
        tone: "warn" as const,
        ctaLabel: "前往 /billing",
        ctaHref: "/billing",
      };
    case "fetch_failed":
      return {
        title: "發票快照讀取失敗",
        body: "本次載入沒有取得可信的 invoice register，頁面保留語境並要求使用者重試，而不是誤導成沒有資料。",
        tone: "danger" as const,
        ctaLabel: "重試本頁",
        ctaHref: "/invoices",
      };
    case "permission_denied":
      return {
        title: "目前角色沒有發票可見權限",
        body: "這不是 empty data。後端拒絕此角色查看 tenant invoice，需回到角色或權限設定處理。",
        tone: "neutral" as const,
        ctaLabel: "檢查 /users",
        ctaHref: "/users",
      };
    case "external_unavailable":
      return {
        title: "外部 artifact 服務暫時不可用",
        body: "發票頁仍存在，但簽名下載或相關外部依賴無法提供完整結果，必須保留治理與稽核去向。",
        tone: "warn" as const,
        ctaLabel: "查看 Platform Admin 稽核",
        ctaHref: "/audit?resourceType=tenant_invoice",
      };
    case "filtered_empty":
      return {
        title: "目前篩選條件沒有符合的發票",
        body: "保留 status、period 與 invoice id 的查詢語境，並提供清楚的回復路徑，避免把搜尋失敗誤解為 tenant 沒有任何 invoice。",
        tone: "info" as const,
        ctaLabel: "清除篩選",
        ctaHref: "/invoices",
      };
    case "no_data":
    default:
      return {
        title: "這個租戶目前還沒有發票",
        body: "系統讀取正常，但目前 tenant scope 尚未產出任何 invoice record；使用者仍可回到帳務概覽或稽核確認月結狀態。",
        tone: "info" as const,
        ctaLabel: "回到 /billing",
        ctaHref: "/billing",
      };
  }
}

function formatStatusLabel(status: InvoiceViewRecord["statusView"]) {
  return status;
}

function formatActionLabel(action: ResourceActionDescriptor) {
  switch (action.action) {
    case "open_billing_setup":
      return "前往帳務設定";
    case "refresh_snapshot":
      return "重新整理快照";
    case "review_access":
      return "檢查角色權限";
    case "open_platform_audit":
      return "前往平台稽核";
    case "clear_filters":
      return "清除篩選";
    case "open_billing":
      return "前往帳務概覽";
    default:
      return action.action;
  }
}

function getEmptyActionHref(action: ResourceActionDescriptor | undefined) {
  switch (action?.action) {
    case "open_billing_setup":
    case "open_billing":
      return "/billing";
    case "refresh_snapshot":
    case "clear_filters":
      return "/invoices";
    case "review_access":
      return "/users";
    case "open_platform_audit":
      return "/audit?resourceType=tenant_invoice";
    default:
      return null;
  }
}

function describeAction(action: InvoiceActionView) {
  if (action.enabled) return action.label;
  if (action.disabledReasonCode === "artifact_missing") {
    return `${action.label}不可用`;
  }
  return `${action.label}已停用`;
}

function renderActionLink(action: InvoiceActionView) {
  if (action.enabled && action.href) {
    const isExternal = action.href.startsWith("http");
    return (
      <Link
        key={`${action.action}:${action.href}`}
        href={action.href}
        target={isExternal ? "_blank" : undefined}
        rel={isExternal ? "noreferrer" : undefined}
        style={{
          ...actionChipStyle,
          color: isExternal ? "#fff" : th.accent,
          background: isExternal ? th.accent : th.surfaceLo,
          borderColor: isExternal ? th.accent : th.border,
        }}
      >
        {describeAction(action)}
      </Link>
    );
  }

  return (
    <span
      key={action.action}
      style={{ ...actionChipStyle, opacity: 0.52, cursor: "not-allowed" }}
    >
      {describeAction(action)}
    </span>
  );
}

function renderDeepLink(link: CrossAppResourceLink) {
  const openInNewTab = link.openMode === "new_tab";

  return (
    <Link
      key={`${link.targetApp}:${link.label}:${link.route}`}
      href={link.route}
      target={openInNewTab ? "_blank" : undefined}
      rel={openInNewTab ? "noreferrer" : undefined}
      style={inlineLinkStyle}
    >
      {link.label}
    </Link>
  );
}

function summarizeInvoices(invoices: InvoiceViewRecord[]) {
  const overdueCount = invoices.filter(
    (invoice) => invoice.statusView === "overdue",
  ).length;
  const expiredArtifacts = invoices.filter((invoice) =>
    isIsoPast(invoice.expiresAt),
  ).length;
  const totalAmountMinor = invoices.reduce(
    (total, invoice) => total + invoice.amount.amountMinor,
    0,
  );

  return {
    overdueCount,
    expiredArtifacts,
    totalAmount: formatCanvasMoney({
      amountMinor: totalAmountMinor,
      currency: invoices[0]?.amount.currency ?? "TWD",
    }),
  };
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const data = await loadInvoicesData();
  const filters = parseFilters(await searchParams);
  const allInvoices = [...data.invoices].sort((left, right) =>
    right.periodEnd.localeCompare(left.periodEnd),
  );
  const periodOptions = Array.from(
    new Set(
      allInvoices
        .map((invoice) => toPeriodKey(invoice.periodStart))
        .filter(Boolean),
    ),
  );

  const filteredInvoices = allInvoices.filter((invoice) => {
    if (
      filters.status !== "all" &&
      formatStatusLabel(invoice.statusView) !== filters.status
    ) {
      return false;
    }

    if (filters.period && toPeriodKey(invoice.periodStart) !== filters.period) {
      return false;
    }

    if (filters.query) {
      return invoice.invoiceId
        .toLowerCase()
        .includes(filters.query.toLowerCase());
    }

    return true;
  });

  const computedEmptyReason =
    filters.emptyReason ??
    (filteredInvoices.length === 0
      ? filters.query || filters.period || filters.status !== "all"
        ? "filtered_empty"
        : data.emptyReason
      : null);

  const emptyState = computedEmptyReason
    ? buildEmptyState(computedEmptyReason, filters)
    : null;
  const emptyDescription = computedEmptyReason
    ? describeEmptyState(computedEmptyReason)
    : null;
  const emptyActionHref = getEmptyActionHref(emptyState?.nextAction);

  const selectedInvoice =
    filteredInvoices.find(
      (invoice) => invoice.invoiceId === filters.invoiceId,
    ) ??
    filteredInvoices[0] ??
    allInvoices.find((invoice) => invoice.invoiceId === filters.invoiceId) ??
    allInvoices[0] ??
    null;

  const selectedArtifactAction =
    selectedInvoice?.availableActions.find(
      (action) => action.action === "download_artifact",
    ) ?? null;
  const summary = summarizeInvoices(filteredInvoices);
  const rows: InvoiceRow[] = filteredInvoices.map((invoice) => ({
    ...invoice,
  }));

  const columns: CanvasTableColumn<InvoiceRow>[] = [
    {
      h: "INVOICE",
      w: 220,
      mono: true,
      r: (row) => (
        <div>
          <div style={invoicePrimaryStyle}>{row.invoiceId}</div>
          <div style={invoiceSecondaryStyle}>
            {formatDateInput(row.createdAt) || "—"}
          </div>
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
      w: 170,
      mono: true,
      align: "right",
      r: (row) => formatCanvasMoney(row.amount),
    },
    {
      h: "STATUS",
      w: 110,
      r: (row) => (
        <CanvasPill theme={th} tone={getStatusTone(row.statusView)} dot>
          {formatStatusLabel(row.statusView)}
        </CanvasPill>
      ),
    },
    {
      h: "DUE",
      w: 120,
      mono: true,
      r: (row) => formatDateInput(row.dueDate) || "—",
    },
    {
      h: "ISSUED",
      w: 120,
      mono: true,
      r: (row) => formatDateInput(row.createdAt) || "—",
    },
    {
      h: "ACTIONS",
      w: 210,
      r: (row) => (
        <div style={actionRowStyle}>
          {row.availableActions.map(renderActionLink)}
        </div>
      ),
    },
  ];

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="發票 · Invoices"
        subtitle="invoice history · status / period / id filters · availableActions-driven CTAs"
        actions={
          <>
            <CanvasPill
              theme={th}
              tone="info"
            >{`T5 · ${REFRESH_TIER} · 30s`}</CanvasPill>
            <CanvasPill theme={th} tone={getRefreshTone(data.refresh)}>
              {data.refresh.dataFreshness}
            </CanvasPill>
            {selectedArtifactAction?.enabled && selectedArtifactAction.href ? (
              <Link
                href={selectedArtifactAction.href}
                target="_blank"
                rel="noreferrer"
                style={{
                  ...actionChipStyle,
                  background: th.accent,
                  borderColor: th.accent,
                  color: "#fff",
                  minHeight: 34,
                }}
              >
                {selectedArtifactAction.label}
              </Link>
            ) : null}
          </>
        }
      />

      <div style={pageStyle}>
        {data.errors.length > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title="Invoice read model degraded"
            body={data.errors.join(" / ")}
          />
        ) : null}

        <div style={summaryGridStyle}>
          <CanvasCard theme={th} title="Visible invoices">
            <div style={summaryCardBodyStyle}>
              <div style={summaryLabelStyle}>count</div>
              <div style={summaryValueStyle}>{filteredInvoices.length}</div>
              <div style={summarySubtleStyle}>
                {allInvoices.length} total in current tenant scope
              </div>
            </div>
          </CanvasCard>

          <CanvasCard theme={th} title="Open exposure">
            <div style={summaryCardBodyStyle}>
              <div style={summaryLabelStyle}>overdue</div>
              <div style={summaryValueStyle}>{summary.overdueCount}</div>
              <div style={summarySubtleStyle}>
                issued invoices past implied due date
              </div>
            </div>
          </CanvasCard>

          <CanvasCard theme={th} title="Artifact health">
            <div style={summaryCardBodyStyle}>
              <div style={summaryLabelStyle}>expired</div>
              <div style={summaryValueStyle}>{summary.expiredArtifacts}</div>
              <div style={summarySubtleStyle}>
                signed links already past expiresAt
              </div>
            </div>
          </CanvasCard>

          <CanvasCard theme={th} title="Visible amount">
            <div style={summaryCardBodyStyle}>
              <div style={summaryLabelStyle}>total</div>
              <div style={summaryValueStyle}>{summary.totalAmount}</div>
              <div style={summarySubtleStyle}>filtered register aggregate</div>
            </div>
          </CanvasCard>
        </div>

        <CanvasCard
          theme={th}
          title="Filter register"
          subtitle={`generated ${formatDateInput(data.refresh.generatedAt)} · stale after ${Math.round(
            data.refresh.staleAfterMs / 1000,
          )}s`}
        >
          <form action="/invoices" method="get" style={filterGridStyle}>
            <input type="hidden" name="invoiceId" value={filters.invoiceId} />

            <div style={fieldStackStyle}>
              <label htmlFor="invoice-query" style={fieldLabelStyle}>
                Search by invoice id
              </label>
              <input
                id="invoice-query"
                name="q"
                defaultValue={filters.query}
                placeholder="inv_2026_05_001"
                style={fieldControlStyle}
              />
            </div>

            <div style={fieldStackStyle}>
              <label htmlFor="invoice-status" style={fieldLabelStyle}>
                Status
              </label>
              <select
                id="invoice-status"
                name="status"
                defaultValue={filters.status}
                style={fieldControlStyle}
              >
                {STATUS_FILTERS.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>

            <div style={fieldStackStyle}>
              <label htmlFor="invoice-period" style={fieldLabelStyle}>
                Period
              </label>
              <select
                id="invoice-period"
                name="period"
                defaultValue={filters.period}
                style={fieldControlStyle}
              >
                <option value="">all periods</option>
                {periodOptions.map((period) => (
                  <option key={period} value={period}>
                    {period}
                  </option>
                ))}
              </select>
            </div>

            <div style={filterActionsStyle}>
              <button type="submit" style={primaryButtonStyle}>
                套用篩選
              </button>
              <Link href="/invoices" style={inlineLinkStyle}>
                清除
              </Link>
            </div>
          </form>
        </CanvasCard>

        <div style={pageGridStyle}>
          <CanvasCard
            theme={th}
            title="Invoice register"
            subtitle={`${filteredInvoices.length} visible / ${allInvoices.length} total`}
            padding={0}
            style={tableCardStyle}
          >
            {emptyState && emptyDescription ? (
              <div style={emptyStateWrapStyle}>
                <CanvasPill theme={th} tone={emptyDescription.tone}>
                  {emptyState.reason}
                </CanvasPill>
                <div style={emptyTitleStyle}>{emptyDescription.title}</div>
                <div style={helperTextStyle}>{emptyDescription.body}</div>
                <div style={helperTextStyle}>
                  messageCode: {emptyState.messageCode}
                  {emptyState.nextAction
                    ? ` · nextAction: ${formatActionLabel(emptyState.nextAction)}`
                    : ""}
                </div>
                {emptyActionHref ? (
                  <Link href={emptyActionHref} style={inlineLinkStyle}>
                    {emptyDescription.ctaLabel}
                  </Link>
                ) : null}
              </div>
            ) : (
              <CanvasTable<InvoiceRow>
                theme={th}
                columns={columns}
                rows={rows}
              />
            )}
          </CanvasCard>

          <div style={sideStackStyle}>
            {selectedInvoice && !emptyState ? (
              <>
                <CanvasCard
                  theme={th}
                  title="Selected invoice"
                  subtitle="drawer/new route 未拆前，右側保留 packet 必備 detail"
                >
                  <div style={sideStackStyle}>
                    <div>
                      <div style={detailTitleStyle}>
                        {selectedInvoice.invoiceId}
                      </div>
                      <div style={metaRowStyle}>
                        <CanvasPill
                          theme={th}
                          tone={getStatusTone(selectedInvoice.statusView)}
                          dot
                        >
                          {formatStatusLabel(selectedInvoice.statusView)}
                        </CanvasPill>
                        {selectedInvoice.statusView === "overdue" ? (
                          <CanvasPill theme={th} tone="danger">
                            overdue
                          </CanvasPill>
                        ) : null}
                        {selectedInvoice.expiresAt &&
                        isIsoPast(selectedInvoice.expiresAt) ? (
                          <CanvasPill theme={th} tone="warn">
                            artifact expired
                          </CanvasPill>
                        ) : null}
                      </div>
                    </div>

                    {selectedInvoice.statusView === "overdue" ? (
                      <CanvasBanner
                        theme={th}
                        tone="warn"
                        icon="warn"
                        title="Overdue invoice"
                        body="已逾預設付款期，必須與一般 issued 狀態分開提示。"
                      />
                    ) : null}

                    {selectedInvoice.expiresAt &&
                    isIsoPast(selectedInvoice.expiresAt) ? (
                      <CanvasBanner
                        theme={th}
                        tone="danger"
                        icon="warn"
                        title="Artifact expired"
                        body="簽名下載連結已過期，仍需保留 invoice metadata 與治理去向。"
                      />
                    ) : null}

                    <dl style={dlStyle}>
                      <dt style={fieldLabelStyle}>Billing title</dt>
                      <dd style={{ margin: 0 }}>
                        {data.billingProfile?.invoiceTitle || "—"}
                      </dd>
                      <dt style={fieldLabelStyle}>Amount</dt>
                      <dd style={{ margin: 0 }}>
                        {formatCanvasMoney(selectedInvoice.amount)}
                      </dd>
                      <dt style={fieldLabelStyle}>Period</dt>
                      <dd style={{ margin: 0 }}>
                        {`${formatDateInput(selectedInvoice.periodStart) || "—"} → ${
                          formatDateInput(selectedInvoice.periodEnd) || "—"
                        }`}
                      </dd>
                      <dt style={fieldLabelStyle}>Issued</dt>
                      <dd style={{ margin: 0 }}>
                        {formatDateInput(selectedInvoice.createdAt) || "—"}
                      </dd>
                      <dt style={fieldLabelStyle}>Due</dt>
                      <dd style={{ margin: 0 }}>
                        {formatDateInput(selectedInvoice.dueDate) || "—"}
                      </dd>
                      <dt style={fieldLabelStyle}>Artifact URL</dt>
                      <dd style={{ margin: 0, overflowWrap: "anywhere" }}>
                        {selectedInvoice.artifactUrl ? (
                          <Link
                            href={selectedInvoice.artifactUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={inlineLinkStyle}
                          >
                            {selectedInvoice.artifactUrl}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </dd>
                      <dt style={fieldLabelStyle}>expiresAt</dt>
                      <dd style={{ margin: 0 }}>
                        {formatDateInput(selectedInvoice.expiresAt) || "—"}
                      </dd>
                    </dl>

                    <div>
                      <div style={fieldLabelStyle}>Available actions</div>
                      <div style={actionRowStyle}>
                        {selectedInvoice.availableActions.map(renderActionLink)}
                      </div>
                    </div>
                  </div>
                </CanvasCard>

                <CanvasCard
                  theme={th}
                  title="Cross-app context"
                  subtitle="deep links and line-item attribution"
                >
                  <div style={sideStackStyle}>
                    <div>
                      <div style={fieldLabelStyle}>Deep links</div>
                      <div style={lineListStyle}>
                        {selectedInvoice.deepLinks.map(renderDeepLink)}
                      </div>
                    </div>

                    <div>
                      <div style={fieldLabelStyle}>Line items</div>
                      <div style={lineListStyle}>
                        {selectedInvoice.lines.map((line) => (
                          <div key={line.lineId} style={lineItemStyle}>
                            <div style={{ fontWeight: 700, color: th.text }}>
                              {line.description}
                            </div>
                            <div style={helperTextStyle}>
                              orderId:{" "}
                              <span style={{ fontFamily: th.monoFamily }}>
                                {line.orderId}
                              </span>
                              {line.costCenterCode
                                ? ` · ${line.costCenterCode}`
                                : ""}
                            </div>
                            {line.costCenterName ? (
                              <div style={monoHintStyle}>
                                {line.costCenterName}
                              </div>
                            ) : null}
                            <div
                              style={{
                                marginTop: 6,
                                fontFamily: th.monoFamily,
                                fontWeight: 700,
                              }}
                            >
                              {formatCanvasMoney(line.amount)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </CanvasCard>
              </>
            ) : (
              <CanvasCard
                theme={th}
                title="Invoice context"
                subtitle="select an invoice to inspect detail, artifact state, and deep links"
              >
                <div style={helperTextStyle}>
                  發票詳情會在右側呈現。若目前是 empty
                  state，右側保留為空，不假裝有 detail 資料。
                </div>
              </CanvasCard>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
