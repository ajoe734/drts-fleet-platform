import Link from "next/link";
import type { CSSProperties } from "react";
import type {
  BillingDocumentStatus,
  CrossAppResourceLink,
  EmptyReason,
  EmptyStateEnvelope,
  MoneyAmount,
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
import { TENANT_PAGE_REFRESH_POLICIES } from "@/lib/page-refresh-policy";
import { getRefreshTierDescriptor } from "@/lib/refresh-tier";
import { getServerLocale } from "@/lib/server-locale";
import { t, type Locale } from "@/lib/translations";

export const dynamic = "force-dynamic";

const th = buildCanvasTheme({
  surface: "tenant",
  dark: false,
  density: "compact",
});

const INVOICES_REFRESH_POLICY = TENANT_PAGE_REFRESH_POLICIES.invoices;
const STATUS_FILTERS = ["all", "draft", "issued", "paid", "overdue"] as const;
const pageStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 20,
};

const pageLeadStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
};

const pageLeadCopyStyle: CSSProperties = {
  maxWidth: 760,
  color: th.textMuted,
  fontSize: 12.5,
  lineHeight: 1.6,
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
  padding: 18,
};

const summaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12,
};

const summaryCardStyle: CSSProperties = {
  borderRadius: 16,
  border: `1px solid ${th.border}`,
  background: th.surface,
  padding: "14px 16px",
  display: "flex",
  flexDirection: "column",
  gap: 8,
  boxShadow: "0 14px 28px rgba(15, 23, 42, 0.05)",
};

const summaryLabelStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 11.5,
  fontWeight: 700,
  letterSpacing: 0.32,
  textTransform: "uppercase",
};

const summaryValueStyle: CSSProperties = {
  color: th.text,
  fontSize: 24,
  lineHeight: 1,
  fontWeight: 800,
  fontFamily: th.monoFamily,
};

const summaryCaptionStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 12,
  lineHeight: 1.45,
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
  gridTemplateColumns: "minmax(0, 1.55fr) minmax(320px, 0.92fr)",
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
  boxShadow: "0 20px 44px rgba(15, 23, 42, 0.06)",
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

const artifactCellStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  alignItems: "flex-start",
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

const artifactLinkStyle: CSSProperties = {
  ...inlineLinkStyle,
  maxWidth: 200,
  overflowWrap: "anywhere",
  fontSize: 11.5,
  lineHeight: 1.35,
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

function toErrorMessage(error: unknown, locale: Locale) {
  return error instanceof Error ? error.message : t("invoices.error.unknown", locale);
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

function formatArtifactUrl(value: string | null | undefined) {
  if (!value) return "—";
  try {
    const parsed = new URL(value);
    return `${parsed.host}${parsed.pathname}`;
  } catch {
    return value;
  }
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
  locale: Locale,
): InvoiceActionView {
  switch (action.action) {
    case "download_artifact":
      return {
        ...action,
        label: t("invoices.action.downloadArtifact", locale),
      };
    case "view_detail":
      return {
        ...action,
        label: t("invoices.action.viewDetail", locale),
      };
    case "open_billing":
      return {
        ...action,
        label: t("invoices.action.openBilling", locale),
      };
    case "open_platform_audit":
      return {
        ...action,
        label: t("invoices.action.platformAudit", locale),
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
  locale: Locale,
): InvoiceViewRecord {
  const expiresAt = parseArtifactExpiry(invoice.artifactUrl);
  const normalizedActions = invoice.availableActions.map((action) =>
    normalizeRuntimeAction(action, locale),
  );

  return {
    ...invoice,
    dueDate: invoice.status === "paid" ? null : addDays(invoice.periodEnd, 14),
    expiresAt,
    statusView: deriveInvoiceStatus(invoice),
    availableActions: normalizedActions,
  };
}

async function loadInvoicesData(locale: Locale): Promise<InvoicesPageData> {
  const client = getTenantClient();
  const [billingResult, invoicesResult] = await Promise.allSettled([
    client.getBillingProfile() as Promise<TenantBillingProfile>,
    client.listInvoicesRuntime() as Promise<TenantInvoiceListData>,
  ]);

  const invoices =
    invoicesResult.status === "fulfilled"
      ? invoicesResult.value.items.map((invoice) => normalizeInvoice(invoice, locale))
      : [];
  const errors: string[] = [];
  let emptyState: EmptyStateEnvelope | null = null;

  if (billingResult.status === "rejected") {
    errors.push(
      t("invoices.error.billingProfile", locale, {
        message: toErrorMessage(billingResult.reason, locale),
      }),
    );
  }
  if (invoicesResult.status === "rejected") {
    errors.push(
      t("invoices.error.register", locale, {
        message: toErrorMessage(invoicesResult.reason, locale),
      }),
    );
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

function getRefreshStateLabel(
  freshness: UiRefreshMetadata["dataFreshness"],
  locale: Locale,
) {
  switch (freshness) {
    case "fresh":
      return t("invoices.refresh.state.fresh", locale);
    case "stale":
      return t("invoices.refresh.state.stale", locale);
    case "degraded":
      return t("invoices.refresh.state.degraded", locale);
    default:
      return freshness;
  }
}

function getEmptyReasonLabel(reason: EmptyReason, locale: Locale) {
  switch (reason) {
    case "not_provisioned":
      return t("invoices.reason.notProvisioned", locale);
    case "fetch_failed":
      return t("invoices.reason.fetchFailed", locale);
    case "permission_denied":
      return t("invoices.reason.permissionDenied", locale);
    case "external_unavailable":
      return t("invoices.reason.externalUnavailable", locale);
    case "filtered_empty":
      return t("invoices.reason.filteredEmpty", locale);
    case "no_data":
    default:
      return t("invoices.reason.noData", locale);
  }
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

function describeEmptyState(reason: EmptyReason, locale: Locale) {
  switch (reason) {
    case "not_provisioned":
      return {
        title: t("invoices.empty.notProvisioned.title", locale),
        body: t("invoices.empty.notProvisioned.body", locale),
        tone: "warn" as const,
      };
    case "fetch_failed":
      return {
        title: t("invoices.empty.fetchFailed.title", locale),
        body: t("invoices.empty.fetchFailed.body", locale),
        tone: "danger" as const,
      };
    case "permission_denied":
      return {
        title: t("invoices.empty.permissionDenied.title", locale),
        body: t("invoices.empty.permissionDenied.body", locale),
        tone: "neutral" as const,
      };
    case "external_unavailable":
      return {
        title: t("invoices.empty.externalUnavailable.title", locale),
        body: t("invoices.empty.externalUnavailable.body", locale),
        tone: "warn" as const,
      };
    case "filtered_empty":
      return {
        title: t("invoices.empty.filteredEmpty.title", locale),
        body: t("invoices.empty.filteredEmpty.body", locale),
        tone: "info" as const,
      };
    case "no_data":
    default:
      return {
        title: t("invoices.empty.noData.title", locale),
        body: t("invoices.empty.noData.body", locale),
        tone: "info" as const,
      };
  }
}

function getArtifactState(invoice: InvoiceViewRecord, locale: Locale) {
  if (!invoice.artifactUrl) {
    return {
      label: t("invoices.artifact.missing", locale),
      tone: "neutral" as const,
    };
  }

  if (invoice.expiresAt && isIsoPast(invoice.expiresAt)) {
    return {
      label: t("invoices.artifact.expired", locale),
      tone: "warn" as const,
    };
  }

  return {
    label: t("invoices.artifact.ready", locale),
    tone: "success" as const,
  };
}

function formatStatusLabel(
  status: InvoiceViewRecord["statusView"] | StatusFilter,
  locale: Locale,
) {
  switch (status) {
    case "all":
      return t("invoices.status.all", locale);
    case "draft":
      return t("invoices.status.draft", locale);
    case "issued":
      return t("invoices.status.issued", locale);
    case "paid":
      return t("invoices.status.paid", locale);
    case "overdue":
      return t("invoices.status.overdue", locale);
    default:
      return status;
  }
}

function formatActionLabel(action: ResourceActionDescriptor, locale: Locale) {
  switch (action.action) {
    case "open_billing_setup":
      return t("invoices.action.openBillingSetup", locale);
    case "refresh_snapshot":
      return t("invoices.action.refreshSnapshot", locale);
    case "review_access":
      return t("invoices.action.reviewAccess", locale);
    case "open_platform_audit":
      return t("invoices.action.openPlatformAudit", locale);
    case "clear_filters":
      return t("invoices.action.clearFilters", locale);
    case "open_billing":
      return t("invoices.action.openBilling", locale);
    default:
      return action.action;
  }
}

function formatRefreshWindow(
  staleAfterMs: number | null | undefined,
  locale: Locale,
) {
  if (!staleAfterMs || staleAfterMs <= 0) return null;

  const totalSeconds = Math.round(staleAfterMs / 1000);
  if (totalSeconds < 60) {
    return t("invoices.refresh.staleAfterSeconds", locale, {
      count: totalSeconds,
    });
  }

  const totalMinutes = Math.round(totalSeconds / 60);
  return t("invoices.refresh.staleAfterMinutes", locale, {
    count: totalMinutes,
  });
}

function formatRefreshTierBadge(
  policy: typeof INVOICES_REFRESH_POLICY,
  refreshWindow: string | null,
  locale: Locale,
) {
  const refreshTier = getRefreshTierDescriptor(policy.runtimeTier);
  return t("invoices.refresh.badge", locale, {
    packetTier: policy.packetTier,
    runtimeTier: policy.runtimeTier,
    cadenceLabel: refreshTier.cadenceLabel,
    staleAfter: refreshWindow
      ? t("invoices.refresh.staleAfterSuffix", locale, {
          value: refreshWindow,
        })
      : "",
  });
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
    case "open_billing":
    case "open_billing_setup":
      return "/billing";
    case "open_platform_audit":
      return "/audit?resourceType=tenant_invoice";
    default:
      return null;
  }
}

function getEmptyStateActionLabel(action: ResourceActionDescriptor, locale: Locale) {
  switch (action.action) {
    case "open_billing_setup":
      return t("invoices.action.openBillingSetup", locale);
    case "refresh_snapshot":
      return t("invoices.action.refreshSnapshot", locale);
    case "review_access":
      return t("invoices.action.reviewAccess", locale);
    case "open_platform_audit":
      return t("invoices.action.openPlatformAudit", locale);
    case "clear_filters":
      return t("invoices.action.clearFilters", locale);
    case "open_billing":
      return t("invoices.action.openBilling", locale);
    default:
      return formatActionLabel(action, locale);
  }
}

function describeEmptyStateAction(action: ResourceActionDescriptor, locale: Locale) {
  if (action.enabled) {
    return getEmptyStateActionLabel(action, locale);
  }

  if (action.disabledReasonCode) {
    return `${getEmptyStateActionLabel(action, locale)} (${action.disabledReasonCode})`;
  }

  return t("invoices.action.disabled", locale, {
    label: getEmptyStateActionLabel(action, locale),
  });
}

function renderEmptyStateAction(action: ResourceActionDescriptor, locale: Locale) {
  const href = resolveEmptyStateActionHref(action);
  const label = describeEmptyStateAction(action, locale);

  if (action.enabled && href) {
    return (
      <Link
        href={href}
        style={{
          ...actionChipStyle,
          color: th.accent,
          background: th.surface,
        }}
      >
        {label}
      </Link>
    );
  }

  return (
    <span style={{ ...actionChipStyle, opacity: 0.52, cursor: "not-allowed" }}>
      {label}
    </span>
  );
}

function describeAction(action: InvoiceActionView, locale: Locale) {
  if (action.enabled) return action.label;
  if (action.disabledReasonCode === "artifact_missing") {
    return t("invoices.action.unavailable", locale, { label: action.label });
  }
  if (action.disabledReasonCode === "artifact_expired") {
    return t("invoices.action.expired", locale, { label: action.label });
  }
  return t("invoices.action.disabled", locale, { label: action.label });
}

function renderActionLink(
  action: InvoiceActionView,
  invoice: InvoiceViewRecord,
  locale: Locale,
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
        {describeAction(action, locale)}
      </Link>
    );
  }

  return (
    <span
      key={action.action}
      style={{ ...actionChipStyle, opacity: 0.52, cursor: "not-allowed" }}
    >
      {describeAction(action, locale)}
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
  const locale = await getServerLocale();
  const data = await loadInvoicesData(locale);
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
      invoice.statusView !== filters.status
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
    ? describeEmptyState(computedEmptyReason, locale)
    : null;
  const refreshWindow = formatRefreshWindow(data.refresh?.staleAfterMs, locale);
  const refreshTierBadge = formatRefreshTierBadge(
    INVOICES_REFRESH_POLICY,
    refreshWindow,
    locale,
  );

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
  // Pre-render each cell server-side into the row data and reference it by key.
  // CanvasTable is a "use client" component, so columns must NOT carry `r:`
  // render functions (functions cannot cross the server→client boundary);
  // React elements stored as data serialize fine.
  const columns: CanvasTableColumn<InvoiceRow>[] = [
    { h: t("invoices.table.invoice", locale), w: 220, mono: true, k: "c_invoice" },
    { h: t("invoices.table.period", locale), w: 110, mono: true, k: "c_period" },
    { h: t("invoices.table.amount", locale), w: 170, mono: true, align: "right", k: "c_amount" },
    { h: t("invoices.table.status", locale), w: 110, k: "c_status" },
    { h: t("invoices.table.due", locale), w: 120, mono: true, k: "c_due" },
    { h: t("invoices.table.issued", locale), w: 120, mono: true, k: "c_issued" },
    { h: t("invoices.table.artifact", locale), w: 220, k: "c_artifact" },
    { h: t("invoices.table.actions", locale), w: 210, k: "c_actions" },
  ];
  const rows: InvoiceRow[] = filteredInvoices.map((invoice) => {
    const row: InvoiceRow = { ...invoice };
    const artifactState = getArtifactState(row, locale);
    return {
      ...row,
      c_invoice: (
        <div>
          <Link
            href={buildInvoiceDetailHref(row.invoiceId, filters)}
            style={invoicePrimaryStyle}
          >
            {row.invoiceId}
          </Link>
          <div style={invoiceSecondaryStyle}>
            {formatDateInput(row.createdAt) || "—"}
          </div>
        </div>
      ),
      c_period: toPeriodKey(row.periodStart),
      c_amount: formatCanvasMoney(row.amount),
      c_status: (
        <CanvasPill theme={th} tone={getStatusTone(row.statusView)} dot>
          {formatStatusLabel(row.statusView, locale)}
        </CanvasPill>
      ),
      c_due: formatDateInput(row.dueDate) || "—",
      c_issued: formatDateInput(row.createdAt) || "—",
      c_artifact: (
        <div style={artifactCellStyle}>
          <CanvasPill theme={th} tone={artifactState.tone}>
            {artifactState.label}
          </CanvasPill>
          {row.artifactUrl ? (
            <Link
              href={row.artifactUrl}
              target="_blank"
              rel="noreferrer"
              style={artifactLinkStyle}
            >
              {formatArtifactUrl(row.artifactUrl)}
            </Link>
          ) : (
            <span style={monoHintStyle}>{t("invoices.artifact.none", locale)}</span>
          )}
          <span style={monoHintStyle}>
            {t("invoices.artifact.expiresAt", locale, {
              value: formatDateInput(row.expiresAt) || "—",
            })}
          </span>
        </div>
      ),
      c_actions: (
        <div style={actionRowStyle}>
          {row.availableActions.map((action) =>
            renderActionLink(action, row, locale, filters),
          )}
        </div>
      ),
    };
  });
  const invoiceSummary = summarizeInvoices(filteredInvoices);

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title={t("invoices.title", locale)}
        subtitle={t("invoices.subtitle", locale)}
        actions={
          <>
            <CanvasPill theme={th} tone="info">
              {refreshTierBadge}
            </CanvasPill>
            {data.refresh ? (
              <CanvasPill theme={th} tone={getRefreshTone(data.refresh)}>
                {getRefreshStateLabel(data.refresh.dataFreshness, locale)}
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
            {t("invoices.pageLead", locale)}
          </div>
          <div style={pageLeadMetaStyle}>
            <CanvasPill theme={th} tone="info">
              {formatRefreshTierBadge(INVOICES_REFRESH_POLICY, null, locale)}
            </CanvasPill>
            {data.refresh ? (
              <CanvasPill theme={th} tone={getRefreshTone(data.refresh)}>
                {getRefreshStateLabel(data.refresh.dataFreshness, locale)}
              </CanvasPill>
            ) : null}
            {data.refresh ? (
              <CanvasPill
                theme={th}
                tone="neutral"
              >
                {t("invoices.meta.source", locale, { value: data.refresh.source })}
              </CanvasPill>
            ) : null}
            <CanvasPill theme={th} tone="neutral">
              {t("invoices.meta.visible", locale, {
                count: filteredInvoices.length,
              })}
            </CanvasPill>
          </div>
        </div>

        <div style={summaryGridStyle}>
          <div style={summaryCardStyle}>
            <div style={summaryLabelStyle}>
              {t("invoices.summary.visible.label", locale)}
            </div>
            <div style={summaryValueStyle}>{filteredInvoices.length}</div>
            <div style={summaryCaptionStyle}>
              {t("invoices.summary.visible.caption", locale)}
            </div>
          </div>
          <div style={summaryCardStyle}>
            <div style={summaryLabelStyle}>
              {t("invoices.summary.overdue.label", locale)}
            </div>
            <div style={summaryValueStyle}>{invoiceSummary.overdueCount}</div>
            <div style={summaryCaptionStyle}>
              {t("invoices.summary.overdue.caption", locale)}
            </div>
          </div>
          <div style={summaryCardStyle}>
            <div style={summaryLabelStyle}>
              {t("invoices.summary.expired.label", locale)}
            </div>
            <div style={summaryValueStyle}>
              {invoiceSummary.expiredArtifacts}
            </div>
            <div style={summaryCaptionStyle}>
              {t("invoices.summary.expired.caption", locale)}
            </div>
          </div>
          <div style={summaryCardStyle}>
            <div style={summaryLabelStyle}>
              {t("invoices.summary.amount.label", locale)}
            </div>
            <div style={summaryValueStyle}>{invoiceSummary.totalAmount}</div>
            <div style={summaryCaptionStyle}>
              {t("invoices.summary.amount.caption", locale)}
            </div>
          </div>
        </div>

        {data.errors.length > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title={t("invoices.error.degradedTitle", locale)}
            body={data.errors.join(" / ")}
          />
        ) : null}

        {data.refresh && data.refresh.dataFreshness !== "fresh" ? (
          <CanvasBanner
            theme={th}
            tone={data.refresh.dataFreshness === "degraded" ? "danger" : "warn"}
            icon="warn"
            title={t("invoices.banner.freshnessTitle", locale)}
            body={t("invoices.banner.freshnessBody", locale, {
              generatedAt: formatDateInput(data.refresh.generatedAt) || "—",
              packetTier: INVOICES_REFRESH_POLICY.packetTier,
              runtimeTier: INVOICES_REFRESH_POLICY.runtimeTier,
              staleAfter: refreshWindow
                ? t("invoices.refresh.staleAfterSuffix", locale, {
                    value: refreshWindow,
                  })
                : "",
            })}
          />
        ) : null}

        <div style={pageGridStyle}>
          <CanvasCard
            theme={th}
            title={t("invoices.section.list", locale)}
            subtitle={t("invoices.section.listSub", locale)}
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
                    {t("invoices.filter.search", locale)}
                  </label>
                  <input
                    id="invoice-query"
                    name="q"
                    defaultValue={filters.query}
                    placeholder={t("invoices.filter.searchPlaceholder", locale)}
                    style={fieldControlStyle}
                  />
                </div>

                <div style={fieldStackStyle}>
                  <label htmlFor="invoice-status" style={fieldLabelStyle}>
                    {t("invoices.filter.status", locale)}
                  </label>
                  <select
                    id="invoice-status"
                    name="status"
                    defaultValue={filters.status}
                    style={fieldControlStyle}
                  >
                    {STATUS_FILTERS.map((status) => (
                      <option key={status} value={status}>
                        {formatStatusLabel(status, locale)}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={fieldStackStyle}>
                  <label htmlFor="invoice-period" style={fieldLabelStyle}>
                    {t("invoices.filter.period", locale)}
                  </label>
                  <select
                    id="invoice-period"
                    name="period"
                    defaultValue={filters.period}
                    style={fieldControlStyle}
                  >
                    <option value="">{t("invoices.filter.allPeriods", locale)}</option>
                    {periodOptions.map((period) => (
                      <option key={period} value={period}>
                        {period}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={filterActionsStyle}>
                  <button type="submit" style={primaryButtonStyle}>
                    {t("invoices.filter.apply", locale)}
                  </button>
                  <Link href="/invoices" style={inlineLinkStyle}>
                    {t("invoices.filter.clear", locale)}
                  </Link>
                </div>
              </form>

              <div style={registerMetaStyle}>
                <CanvasPill theme={th} tone="neutral">
                  {t("invoices.meta.total", locale, { count: allInvoices.length })}
                </CanvasPill>
                <CanvasPill theme={th} tone="danger">
                  {t("invoices.meta.overdue", locale, {
                    count: invoiceSummary.overdueCount,
                  })}
                </CanvasPill>
                <CanvasPill theme={th} tone="warn">
                  {t("invoices.meta.expiredArtifacts", locale, {
                    count: invoiceSummary.expiredArtifacts,
                  })}
                </CanvasPill>
                <CanvasPill theme={th} tone="info">
                  {invoiceSummary.totalAmount}
                </CanvasPill>
              </div>

              {emptyState && emptyDescription ? (
                <div
                  style={{ ...emptyStateWrapStyle, ...emptyReasonCardStyle }}
                >
                  <CanvasPill theme={th} tone={emptyDescription.tone}>
                    {getEmptyReasonLabel(emptyState.reason, locale)}
                  </CanvasPill>
                  <div style={emptyTitleStyle}>{emptyDescription.title}</div>
                  <div style={helperTextStyle}>{emptyDescription.body}</div>
                  <div style={helperTextStyle}>
                    {t("invoices.empty.messageCode", locale, {
                      value: emptyState.messageCode,
                    })}
                    {emptyState.nextAction
                      ? ` · ${t("invoices.empty.nextAction", locale, {
                          value: formatActionLabel(emptyState.nextAction, locale),
                        })}`
                      : ""}
                  </div>
                  {emptyState.nextAction
                    ? renderEmptyStateAction(emptyState.nextAction, locale)
                    : null}
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
                  title={t("invoices.section.selected", locale)}
                  subtitle={t("invoices.section.selectedSub", locale)}
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
                          {formatStatusLabel(selectedInvoice.statusView, locale)}
                        </CanvasPill>
                        {selectedInvoice.statusView === "overdue" ? (
                          <CanvasPill theme={th} tone="danger">
                            {t("invoices.status.overdue", locale)}
                          </CanvasPill>
                        ) : null}
                        {selectedInvoice.expiresAt &&
                        isIsoPast(selectedInvoice.expiresAt) ? (
                          <CanvasPill theme={th} tone="warn">
                            {t("invoices.selected.artifactExpired", locale)}
                          </CanvasPill>
                        ) : null}
                      </div>
                    </div>

                    {selectedInvoice.statusView === "overdue" ? (
                      <CanvasBanner
                        theme={th}
                        tone="warn"
                        icon="warn"
                        title={t("invoices.selected.overdue", locale)}
                        body={t("invoices.selected.overdueBody", locale)}
                      />
                    ) : null}

                    {selectedInvoice.expiresAt &&
                    isIsoPast(selectedInvoice.expiresAt) ? (
                      <CanvasBanner
                        theme={th}
                        tone="danger"
                        icon="warn"
                        title={t("invoices.selected.artifactExpired", locale)}
                        body={t("invoices.selected.artifactExpiredBody", locale)}
                      />
                    ) : null}

                    <dl style={dlStyle}>
                      <dt style={fieldLabelStyle}>{t("invoices.selected.billingTitle", locale)}</dt>
                      <dd style={{ margin: 0 }}>
                        {data.billingProfile?.invoiceTitle || "—"}
                      </dd>
                      <dt style={fieldLabelStyle}>{t("invoices.selected.amount", locale)}</dt>
                      <dd style={{ margin: 0 }}>
                        {formatCanvasMoney(selectedInvoice.amount)}
                      </dd>
                      <dt style={fieldLabelStyle}>{t("invoices.selected.period", locale)}</dt>
                      <dd style={{ margin: 0 }}>
                        {t("invoices.selected.periodValue", locale, {
                          start: formatDateInput(selectedInvoice.periodStart) || "—",
                          end: formatDateInput(selectedInvoice.periodEnd) || "—",
                        })}
                      </dd>
                      <dt style={fieldLabelStyle}>{t("invoices.selected.issuedAt", locale)}</dt>
                      <dd style={{ margin: 0 }}>
                        {formatDateInput(selectedInvoice.createdAt) || "—"}
                      </dd>
                      <dt style={fieldLabelStyle}>{t("invoices.selected.dueDate", locale)}</dt>
                      <dd style={{ margin: 0 }}>
                        {formatDateInput(selectedInvoice.dueDate) || "—"}
                      </dd>
                      <dt style={fieldLabelStyle}>{t("invoices.selected.artifactUrl", locale)}</dt>
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
                      <dt style={fieldLabelStyle}>{t("invoices.selected.expiresAt", locale)}</dt>
                      <dd style={{ margin: 0 }}>
                        {formatDateInput(selectedInvoice.expiresAt) || "—"}
                      </dd>
                    </dl>

                    <div>
                      <div style={fieldLabelStyle}>{t("invoices.selected.availableActions", locale)}</div>
                      <div style={actionRowStyle}>
                        {selectedInvoice.availableActions.map((action) =>
                          renderActionLink(action, selectedInvoice, locale, filters),
                        )}
                      </div>
                    </div>

                    <div>
                      <div style={fieldLabelStyle}>{t("invoices.selected.picker", locale)}</div>
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
                            {t("invoices.selected.viewDetail", locale)}
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
                  title={t("invoices.section.crossApp", locale)}
                  subtitle={t("invoices.section.crossAppSub", locale)}
                >
                  <div style={sideStackStyle}>
                    <div>
                      <div style={fieldLabelStyle}>{t("invoices.selected.deepLinks", locale)}</div>
                      <div style={lineListStyle}>
                        {selectedInvoice.deepLinks.map(renderDeepLink)}
                      </div>
                    </div>

                    <div>
                      <div style={fieldLabelStyle}>{t("invoices.selected.lines", locale)}</div>
                      <div style={lineListStyle}>
                        {selectedInvoice.lines.map((line) => (
                          <div key={line.lineId} style={lineItemStyle}>
                            <div style={{ fontWeight: 700, color: th.text }}>
                              {line.description}
                            </div>
                            <div style={helperTextStyle}>
                              <span style={{ fontFamily: th.monoFamily }}>
                                {t("invoices.selected.line.orderId", locale, {
                                  value: line.orderId,
                                })}
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
                title={t("invoices.section.context", locale)}
                subtitle={t("invoices.section.contextSub", locale)}
              >
                <div style={helperTextStyle}>
                  {t("invoices.section.contextBody", locale)}
                </div>
              </CanvasCard>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
