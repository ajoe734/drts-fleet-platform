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
  TenantInvoiceListData,
  TenantInvoiceRecord,
  TenantInvoiceRuntimeRecord,
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
const STATUS_FILTERS = ["all", "draft", "issued", "paid", "overdue"] as const;
const pageStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const pageLeadStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
};

const pageLeadCopyStyle: CSSProperties = {
  maxWidth: 720,
  color: th.textMuted,
  fontSize: 12.5,
  lineHeight: 1.55,
};

const pageLeadMetaStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 8,
};

const registerCardBodyStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 14,
  padding: 16,
};

const filterGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.35fr) repeat(2, minmax(160px, 0.7fr)) auto",
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

const registerMetaStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
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

const emptyReasonCardStyle: CSSProperties = {
  borderRadius: 18,
  border: `1px solid ${th.border}`,
  background: "rgba(255,255,255,0.02)",
  padding: 16,
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

const activeInvoiceLinkStyle: CSSProperties = {
  ...actionChipStyle,
  minHeight: 32,
  background: th.surface,
};

const selectedInvoiceLinkStyle: CSSProperties = {
  ...activeInvoiceLinkStyle,
  borderColor: th.accent,
  color: th.accent,
  boxShadow: `0 0 0 1px ${th.accent} inset`,
};

type StatusFilter = (typeof STATUS_FILTERS)[number];

type InvoiceActionView = ResourceActionDescriptor & {
  label: string;
};

type InvoiceViewRecord = Omit<
  TenantInvoiceRuntimeRecord,
  "availableActions"
> & {
  dueDate: string | null;
  expiresAt: string | null;
  statusView: BillingDocumentStatus | "overdue";
  availableActions: InvoiceActionView[];
};

type InvoiceRow = InvoiceViewRecord & Record<string, unknown>;

type InvoiceFilters = {
  query: string;
  period: string;
  status: StatusFilter;
  invoiceId: string;
};

type InvoicesPageData = {
  billingProfile: TenantBillingProfile | null;
  invoices: InvoiceViewRecord[];
  errors: string[];
  refresh: UiRefreshMetadata | null;
  emptyState: EmptyStateEnvelope | null;
};

function toErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Unknown tenant invoice error.";
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

function normalizeRuntimeAction(
  action: ResourceActionDescriptor,
): InvoiceActionView {
  switch (action.action) {
    case "download_artifact":
      return {
        ...action,
        label: "下載簽名檔",
      };
    case "view_detail":
      return {
        ...action,
        label: "檢視詳情",
      };
    case "open_billing":
      return {
        ...action,
        label: "返回帳務概覽",
      };
    case "open_platform_audit":
      return {
        ...action,
        label: "平台稽核",
      };
    default:
      return {
        ...action,
        label: action.action,
      };
  }
}

function normalizeInvoice(
  invoice: TenantInvoiceRuntimeRecord,
): InvoiceViewRecord {
  const expiresAt = parseArtifactExpiry(invoice.artifactUrl);
  const normalizedActions = invoice.availableActions.map((action) =>
    normalizeRuntimeAction(action),
  );

  return {
    ...invoice,
    dueDate: invoice.status === "paid" ? null : addDays(invoice.periodEnd, 14),
    expiresAt,
    statusView: deriveInvoiceStatus(invoice),
    availableActions: normalizedActions,
  };
}

async function loadInvoicesData(): Promise<InvoicesPageData> {
  const client = getTenantClient();
  const [billingResult, invoicesResult] = await Promise.allSettled([
    client.getBillingProfile() as Promise<TenantBillingProfile>,
    client.listInvoicesRuntime() as Promise<TenantInvoiceListData>,
  ]);

  const invoices =
    invoicesResult.status === "fulfilled"
      ? invoicesResult.value.items.map(normalizeInvoice)
      : [];
  const errors: string[] = [];
  let emptyState: EmptyStateEnvelope | null = null;

  if (billingResult.status === "rejected") {
    errors.push(`Billing profile: ${toErrorMessage(billingResult.reason)}`);
  }
  if (invoicesResult.status === "rejected") {
    errors.push(`Invoice register: ${toErrorMessage(invoicesResult.reason)}`);
  }

  if (invoicesResult.status === "fulfilled") {
    emptyState = invoicesResult.value.emptyState ?? null;
  }

  return {
    billingProfile:
      billingResult.status === "fulfilled" ? billingResult.value : null,
    invoices,
    errors,
    refresh:
      invoicesResult.status === "fulfilled"
        ? invoicesResult.value.refresh
        : null,
    emptyState,
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

  return {
    query: first("q").trim(),
    period: first("period").trim(),
    status: STATUS_FILTERS.includes(statusRaw as StatusFilter)
      ? (statusRaw as StatusFilter)
      : "all",
    invoiceId: first("invoiceId").trim(),
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

function buildFilteredEmptyState(): EmptyStateEnvelope {
  return {
    reason: "filtered_empty",
    messageCode: "tenant_invoice_filtered_empty",
    nextAction: {
      action: "clear_filters",
      enabled: true,
      riskLevel: "low",
    },
  };
}

function describeEmptyState(reason: EmptyReason) {
  switch (reason) {
    case "not_provisioned":
      return {
        title: "尚未完成帳務設定",
        body: "租戶 billing profile 尚未準備好，先補齊 invoice title、稅籍與月結設定，再回到發票頁。",
        tone: "warn" as const,
        ctaLabel: "前往 /billing",
      };
    case "fetch_failed":
      return {
        title: "發票快照讀取失敗",
        body: "本次載入沒有取得可信的 invoice register，頁面保留語境並要求使用者重試，而不是誤導成沒有資料。",
        tone: "danger" as const,
        ctaLabel: "重試本頁",
      };
    case "permission_denied":
      return {
        title: "目前角色沒有發票可見權限",
        body: "這不是 empty data。後端拒絕此角色查看 tenant invoice，需回到角色或權限設定處理。",
        tone: "neutral" as const,
        ctaLabel: "檢查 /users",
      };
    case "external_unavailable":
      return {
        title: "外部 artifact 服務暫時不可用",
        body: "發票頁仍存在，但簽名下載或相關外部依賴無法提供完整結果，必須保留治理與稽核去向。",
        tone: "warn" as const,
        ctaLabel: "查看 Platform Admin 稽核",
      };
    case "filtered_empty":
      return {
        title: "目前篩選條件沒有符合的發票",
        body: "保留 status、period 與 invoice id 的查詢語境，並提供清楚的回復路徑，避免把搜尋失敗誤解為 tenant 沒有任何 invoice。",
        tone: "info" as const,
        ctaLabel: "清除篩選",
      };
    case "no_data":
    default:
      return {
        title: "這個租戶目前還沒有發票",
        body: "系統讀取正常，但目前 tenant scope 尚未產出任何 invoice record；使用者仍可回到帳務概覽或稽核確認月結狀態。",
        tone: "info" as const,
        ctaLabel: "回到 /billing",
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

function formatRefreshWindow(staleAfterMs: number | null | undefined) {
  if (!staleAfterMs || staleAfterMs <= 0) return null;

  const totalSeconds = Math.round(staleAfterMs / 1000);
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const totalMinutes = Math.round(totalSeconds / 60);
  return `${totalMinutes}m`;
}

function buildInvoiceDetailHref(
  invoiceId: string,
  filters?: Pick<InvoiceFilters, "query" | "period" | "status">,
) {
  const params = new URLSearchParams();
  params.set("invoiceId", invoiceId);

  if (filters) {
    if (filters.status !== "all") params.set("status", filters.status);
    if (filters.period) params.set("period", filters.period);
    if (filters.query) params.set("q", filters.query);
  }

  return `/invoices?${params.toString()}`;
}

function resolveInvoiceActionHref(
  invoice: InvoiceViewRecord,
  action: InvoiceActionView,
  filters?: Pick<InvoiceFilters, "query" | "period" | "status">,
) {
  switch (action.action) {
    case "download_artifact":
      return action.enabled ? invoice.artifactUrl : null;
    case "view_detail":
      return buildInvoiceDetailHref(invoice.invoiceId, filters);
    case "open_billing":
      return (
        invoice.deepLinks.find(
          (link) =>
            link.targetApp === "tenant-console" &&
            link.route.startsWith("/billing"),
        )?.route ?? null
      );
    case "open_platform_audit":
      return (
        invoice.deepLinks.find(
          (link) =>
            link.targetApp === "platform-admin" &&
            link.route.startsWith("/audit"),
        )?.route ?? null
      );
    default:
      return null;
  }
}

function resolveEmptyStateActionHref(action: ResourceActionDescriptor) {
  switch (action.action) {
    case "clear_filters":
    case "refresh_snapshot":
      return "/invoices";
    case "review_access":
      return "/users";
    case "open_billing":
    case "open_billing_setup":
      return "/billing";
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
  if (action.disabledReasonCode === "artifact_expired") {
    return `${action.label}已過期`;
  }
  return `${action.label}已停用`;
}

function renderActionLink(
  action: InvoiceActionView,
  invoice: InvoiceViewRecord,
  filters?: Pick<InvoiceFilters, "query" | "period" | "status">,
) {
  const href = resolveInvoiceActionHref(invoice, action, filters);
  const deepLinkMatch = href
    ? invoice.deepLinks.find((link) => link.route === href)
    : null;

  if (action.enabled && href) {
    const isExternal =
      href.startsWith("http") || deepLinkMatch?.openMode === "new_tab";
    return (
      <Link
        key={`${action.action}:${href}`}
        href={href}
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
    filteredInvoices.length === 0
      ? filters.query || filters.period || filters.status !== "all"
        ? "filtered_empty"
        : (data.emptyState?.reason ?? null)
      : null;

  const emptyState =
    computedEmptyReason === "filtered_empty"
      ? buildFilteredEmptyState()
      : data.emptyState;
  const emptyDescription = computedEmptyReason
    ? describeEmptyState(computedEmptyReason)
    : null;
  const refreshWindow = formatRefreshWindow(data.refresh?.staleAfterMs);

  const selectedInvoice =
    filteredInvoices.find(
      (invoice) => invoice.invoiceId === filters.invoiceId,
    ) ??
    filteredInvoices[0] ??
    allInvoices.find((invoice) => invoice.invoiceId === filters.invoiceId) ??
    allInvoices[0] ??
    null;

  const selectedArtifactAction: InvoiceActionView | null =
    selectedInvoice?.availableActions.find(
      (action) => action.action === "download_artifact",
    ) ?? null;
  const selectedArtifactHref =
    selectedInvoice && selectedArtifactAction
      ? resolveInvoiceActionHref(
          selectedInvoice,
          selectedArtifactAction,
          filters,
        )
      : null;
  const selectedInvoiceDetailHref = selectedInvoice
    ? buildInvoiceDetailHref(selectedInvoice.invoiceId, filters)
    : null;
  const emptyStateActionHref = emptyState?.nextAction
    ? resolveEmptyStateActionHref(emptyState.nextAction)
    : null;
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
          <Link
            href={`/invoices?invoiceId=${encodeURIComponent(row.invoiceId)}`}
            style={invoicePrimaryStyle}
          >
            {row.invoiceId}
          </Link>
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
          {row.availableActions.map((action) =>
            renderActionLink(action, row, filters),
          )}
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
            >{`T5 · ${REFRESH_TIER}${refreshWindow ? ` · ${refreshWindow}` : ""}`}</CanvasPill>
            {data.refresh ? (
              <CanvasPill theme={th} tone={getRefreshTone(data.refresh)}>
                {data.refresh.dataFreshness}
              </CanvasPill>
            ) : null}
            {selectedArtifactAction?.enabled && selectedArtifactHref ? (
              <Link
                href={selectedArtifactHref}
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
        <div style={pageLeadStyle}>
          <div style={pageLeadCopyStyle}>
            狀態與 CTA 以 backend read model 為準，頁面只負責呈現
            `availableActions`、 `EmptyReason`、refresh tier 與 cross-app deep
            links，不從 client 推導角色權限。
          </div>
          <div style={pageLeadMetaStyle}>
            <CanvasPill
              theme={th}
              tone="info"
            >{`T5 · ${REFRESH_TIER}`}</CanvasPill>
            {data.refresh ? (
              <CanvasPill theme={th} tone={getRefreshTone(data.refresh)}>
                {data.refresh.dataFreshness}
              </CanvasPill>
            ) : null}
            {data.refresh ? (
              <CanvasPill
                theme={th}
                tone="neutral"
              >{`source · ${data.refresh.source}`}</CanvasPill>
            ) : null}
            <CanvasPill theme={th} tone="neutral">
              {`${filteredInvoices.length} visible`}
            </CanvasPill>
          </div>
        </div>

        {data.errors.length > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title="Invoice read model degraded"
            body={data.errors.join(" / ")}
          />
        ) : null}

        {data.refresh && data.refresh.dataFreshness !== "fresh" ? (
          <CanvasBanner
            theme={th}
            tone={data.refresh.dataFreshness === "degraded" ? "danger" : "warn"}
            icon="warn"
            title="Snapshot freshness warning"
            body={`目前內容產生於 ${formatDateInput(
              data.refresh.generatedAt,
            )}，refresh tier 為 T5 / ${REFRESH_TIER}${
              refreshWindow ? `，staleAfter ${refreshWindow}` : ""
            }。資料不是 fresh 時，頁面必須明確提示而不是假裝即時。`}
          />
        ) : null}

        <div style={pageGridStyle}>
          <CanvasCard
            theme={th}
            title="Invoice register"
            subtitle="status / period / invoice id filters · overdue and artifact expiry stay visible"
            style={tableCardStyle}
          >
            <div style={registerCardBodyStyle}>
              <form action="/invoices" method="get" style={filterGridStyle}>
                <input
                  type="hidden"
                  name="invoiceId"
                  value={filters.invoiceId}
                />

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

              <div style={registerMetaStyle}>
                <CanvasPill theme={th} tone="neutral">
                  {`${allInvoices.length} total`}
                </CanvasPill>
                <CanvasPill theme={th} tone="danger">
                  {`${summarizeInvoices(filteredInvoices).overdueCount} overdue`}
                </CanvasPill>
                <CanvasPill theme={th} tone="warn">
                  {`${summarizeInvoices(filteredInvoices).expiredArtifacts} expired artifacts`}
                </CanvasPill>
                <CanvasPill theme={th} tone="info">
                  {summarizeInvoices(filteredInvoices).totalAmount}
                </CanvasPill>
              </div>

              {emptyState && emptyDescription ? (
                <div
                  style={{ ...emptyStateWrapStyle, ...emptyReasonCardStyle }}
                >
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
                  {emptyState.nextAction?.enabled && emptyStateActionHref ? (
                    <Link
                      href={emptyStateActionHref}
                      style={{
                        ...actionChipStyle,
                        color: th.accent,
                        background: th.surface,
                      }}
                    >
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
            </div>
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
                        {selectedInvoice.availableActions.map((action) =>
                          renderActionLink(action, selectedInvoice, filters),
                        )}
                      </div>
                    </div>

                    <div>
                      <div style={fieldLabelStyle}>Invoice picker</div>
                      <div style={actionRowStyle}>
                        {selectedInvoiceDetailHref &&
                        selectedInvoice.availableActions.some(
                          (action) =>
                            action.action === "view_detail" && action.enabled,
                        ) ? (
                          <Link
                            href={selectedInvoiceDetailHref}
                            style={inlineLinkStyle}
                          >
                            檢視詳情
                          </Link>
                        ) : null}
                        {filteredInvoices.slice(0, 6).map((invoice) => {
                          const selected =
                            invoice.invoiceId === selectedInvoice.invoiceId;
                          return (
                            <Link
                              key={invoice.invoiceId}
                              href={buildInvoiceDetailHref(
                                invoice.invoiceId,
                                filters,
                              )}
                              style={
                                selected
                                  ? selectedInvoiceLinkStyle
                                  : activeInvoiceLinkStyle
                              }
                            >
                              {invoice.invoiceId}
                            </Link>
                          );
                        })}
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
