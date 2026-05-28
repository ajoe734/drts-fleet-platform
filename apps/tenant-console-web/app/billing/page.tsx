import Link from "next/link";
import type { CSSProperties } from "react";
import type {
  CrossAppResourceLink,
  EmptyStateEnvelope,
  EmptyReason,
  MoneyAmount,
  ResourceActionDescriptor,
  TenantBillingProfile,
  TenantInvoiceRecord,
  TenantQuotaSummary,
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
import { getTenantClient } from "@/lib/api-client";
import { formatDateInput } from "@/lib/formatters";

export const revalidate = 30;

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "grid",
  gap: 16,
};

const kpiGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const primaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(320px, 0.95fr) minmax(0, 1.45fr)",
  gap: 16,
};

const secondaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 16,
};

const detailStackStyle: CSSProperties = {
  display: "grid",
  gap: 10,
};

const detailGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10,
};

const detailItemStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  padding: "12px 14px",
  border: `1px solid ${th.border}`,
  borderRadius: 14,
  background: th.surfaceLo,
};

const detailLabelStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 11,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const detailValueStyle: CSSProperties = {
  color: th.text,
  fontSize: 13,
  fontWeight: 600,
  lineHeight: 1.45,
};

const noteStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 12,
  lineHeight: 1.6,
};

const actionListStyle: CSSProperties = {
  display: "grid",
  gap: 10,
};

const actionLinkStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  padding: "12px 14px",
  borderRadius: 14,
  border: `1px solid ${th.border}`,
  background: th.surface,
  color: th.text,
  textDecoration: "none",
};

const mutedActionStyle: CSSProperties = {
  ...actionLinkStyle,
  opacity: 0.58,
};

const stateChipGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 10,
};

const stateChipStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  padding: "10px 12px",
  borderRadius: 12,
  border: `1px solid ${th.border}`,
  background: th.surface,
  textDecoration: "none",
  color: th.text,
};

const stateChipActiveStyle: CSSProperties = {
  ...stateChipStyle,
  background: th.surfaceLo,
  borderColor: th.accent,
  boxShadow: `0 0 0 1px ${th.accent}`,
};

const inlineRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
};

const tableLinkStyle: CSSProperties = {
  color: th.accent,
  fontWeight: 600,
  textDecoration: "none",
};

const tablePrimaryStyle: CSSProperties = {
  color: th.accent,
  fontWeight: 600,
  fontFamily: th.monoFamily,
};

const emptyPanelStyle: CSSProperties = {
  padding: 24,
  color: th.textMuted,
  fontSize: 12.5,
  textAlign: "center",
};

const emptyStateLayoutStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.25fr) minmax(260px, 0.75fr)",
  gap: 16,
};

const emptyStateBodyStyle: CSSProperties = {
  display: "grid",
  gap: 12,
};

const routeListStyle: CSSProperties = {
  display: "grid",
  gap: 10,
};

const routeItemStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  padding: "12px 14px",
  borderRadius: 14,
  border: `1px solid ${th.border}`,
  background: th.surface,
};

const routeCodeStyle: CSSProperties = {
  color: th.textMuted,
  fontFamily: th.monoFamily,
  fontSize: 11,
};

const actionMetaRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  alignItems: "center",
};

type BillingPageData = {
  billingProfile: TenantBillingProfile | null;
  invoices: TenantInvoiceRecord[];
  quotaSummary: TenantQuotaSummary | null;
  errors: string[];
};

type BillingSnapshot = {
  periodLabel: string;
  accruedAmount: MoneyAmount | null;
  projectedClose: MoneyAmount | null;
  status: "active" | "past_due" | "suspended" | "not_provisioned";
};

type BillingEmptyState = EmptyStateEnvelope & {
  title: string;
  body: string;
  tone: "info" | "warn" | "danger";
  laneLabel: string;
};

type InvoiceSummaryRow = TenantInvoiceRecord & Record<string, unknown>;

const EMPTY_REASON_SEQUENCE: EmptyReason[] = [
  "not_provisioned",
  "no_data",
  "filtered_empty",
  "fetch_failed",
  "external_unavailable",
  "permission_denied",
];

const EMPTY_REASON_META: Record<EmptyReason, BillingEmptyState> = {
  not_provisioned: {
    reason: "not_provisioned",
    messageCode: "BILLING_PROFILE_NOT_READY",
    title: "租戶尚未完成帳務配置",
    body: "尚未建立 billing profile，因此 overview 應保留導引與 next action，而不是假裝已經有結帳資料。",
    tone: "info",
    laneLabel: "profile setup required",
    nextAction: {
      action: "billing.profile.create",
      enabled: true,
      riskLevel: "medium",
    },
  },
  no_data: {
    reason: "no_data",
    messageCode: "BILLING_SNAPSHOT_EMPTY",
    title: "目前沒有可顯示的帳務資料",
    body: "當期尚未累積任何帳款，也沒有 recent invoice summary 可供比對。",
    tone: "info",
    laneLabel: "usage not started",
  },
  filtered_empty: {
    reason: "filtered_empty",
    messageCode: "BILLING_FILTER_EMPTY",
    title: "目前篩選條件下沒有結果",
    body: "Overview 本身仍可讀，但當前條件沒有命中 invoice summary 或 usage 切片。",
    tone: "info",
    laneLabel: "filter produced zero matches",
  },
  fetch_failed: {
    reason: "fetch_failed",
    messageCode: "BILLING_FETCH_FAILED",
    title: "帳務資料抓取失敗",
    body: "API 已回錯，畫面保留 refresh tier 與 next action，而不是把錯誤偽裝成空清單。",
    tone: "warn",
    laneLabel: "authority fetch interrupted",
    nextAction: {
      action: "billing.retry",
      enabled: true,
      riskLevel: "low",
    },
  },
  external_unavailable: {
    reason: "external_unavailable",
    messageCode: "BILLING_UPSTREAM_UNAVAILABLE",
    title: "外部計費來源暫時不可用",
    body: "部分發票或投影金額仍可能顯示，但 current-period snapshot 不應被視為完整權威。",
    tone: "warn",
    laneLabel: "upstream degraded",
  },
  permission_denied: {
    reason: "permission_denied",
    messageCode: "BILLING_SCOPE_REQUIRED",
    title: "目前角色沒有查看帳務內容的權限",
    body: "依 packet 與 role matrix，頁面保留入口，但資料區必須明確說明 read scope 不足。",
    tone: "danger",
    laneLabel: "read scope missing",
  },
  driver_not_eligible: {
    reason: "driver_not_eligible",
    messageCode: "TENANT_BILLING_REASON_NOT_APPLICABLE",
    title: "此空狀態不適用於 tenant billing",
    body: "保留型別相容性；tenant console 不應以 driver_not_eligible 作為 billing empty reason。",
    tone: "info",
    laneLabel: "tenant route guard",
  },
};

const CROSS_APP_LINKS: CrossAppResourceLink[] = [
  {
    targetApp: "tenant-console",
    route: "/audit?view=billing",
    resourceType: "audit",
    resourceId: "billing",
    openMode: "same_tab",
    label: "查看租戶稽核軌跡",
  },
  {
    targetApp: "platform-admin",
    route: "/tenants/tenant-demo-001?tab=billing",
    resourceType: "tenant",
    resourceId: "tenant-demo-001",
    openMode: "new_tab",
    label: "在 Platform Admin 查看租戶帳務治理",
  },
];

const DEFAULT_CROSS_APP_ORIGINS: Record<
  CrossAppResourceLink["targetApp"],
  string
> = {
  "tenant-console": "",
  "platform-admin": "http://localhost:3002",
  "ops-console": "http://localhost:3003",
};

function trimTrailingSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function getCrossAppOrigin(targetApp: CrossAppResourceLink["targetApp"]) {
  switch (targetApp) {
    case "platform-admin":
      return trimTrailingSlash(
        process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL ??
          DEFAULT_CROSS_APP_ORIGINS["platform-admin"],
      );
    case "ops-console":
      return trimTrailingSlash(
        process.env.NEXT_PUBLIC_OPS_CONSOLE_URL ??
          DEFAULT_CROSS_APP_ORIGINS["ops-console"],
      );
    case "tenant-console":
    default:
      return DEFAULT_CROSS_APP_ORIGINS["tenant-console"];
  }
}

async function loadBillingPageData(): Promise<BillingPageData> {
  const client = getTenantClient();
  const [billingProfile, invoices, quotaSummary] = await Promise.allSettled([
    client.getBillingProfile() as Promise<TenantBillingProfile>,
    client.listInvoices() as Promise<TenantInvoiceRecord[]>,
    client.getTenantQuotaSummary() as Promise<TenantQuotaSummary>,
  ]);

  const errors: string[] = [];

  if (billingProfile.status === "rejected") {
    errors.push(toErrorMessage("Billing profile", billingProfile.reason));
  }
  if (invoices.status === "rejected") {
    errors.push(toErrorMessage("Invoices", invoices.reason));
  }
  if (quotaSummary.status === "rejected") {
    errors.push(toErrorMessage("Quota", quotaSummary.reason));
  }

  return {
    billingProfile:
      billingProfile.status === "fulfilled" ? billingProfile.value : null,
    invoices: invoices.status === "fulfilled" ? invoices.value : [],
    quotaSummary:
      quotaSummary.status === "fulfilled" ? quotaSummary.value : null,
    errors,
  };
}

function toErrorMessage(label: string, reason: unknown) {
  return `${label}: ${reason instanceof Error ? reason.message : "Unknown error"}`;
}

function formatMoney(value: MoneyAmount | null | undefined) {
  if (!value) return "—";
  const amount = value.amountMinor / 100;
  const prefix = value.currency === "TWD" ? "NT$" : value.currency;
  return `${prefix} ${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(amount)}`;
}

function formatCount(value: number | null | undefined) {
  return new Intl.NumberFormat("en-US").format(value ?? 0);
}

function formatPeriodLabel(invoice: TenantInvoiceRecord | null) {
  if (!invoice) return "—";
  return `${invoice.periodStart.slice(0, 7)} closing`;
}

function isPastDue(invoice: TenantInvoiceRecord | null) {
  if (!invoice || invoice.status === "paid" || invoice.status === "draft") {
    return false;
  }
  const issuedAt = new Date(invoice.updatedAt);
  if (Number.isNaN(issuedAt.getTime())) {
    return false;
  }
  return Date.now() - issuedAt.getTime() > 1000 * 60 * 60 * 24 * 21;
}

function getBillingSnapshot(
  billingProfile: TenantBillingProfile | null,
  invoices: TenantInvoiceRecord[],
  forcedState: string | null,
): BillingSnapshot {
  const sortedInvoices = [...invoices].sort((left, right) =>
    right.periodEnd.localeCompare(left.periodEnd),
  );
  const latestInvoice = sortedInvoices[0] ?? null;
  const openInvoice = sortedInvoices.find(
    (invoice) => invoice.status !== "paid",
  );

  const status =
    forcedState === "suspended"
      ? "suspended"
      : forcedState === "past_due"
        ? "past_due"
        : !billingProfile
          ? "not_provisioned"
          : isPastDue(openInvoice ?? latestInvoice)
            ? "past_due"
            : "active";

  return {
    periodLabel: formatPeriodLabel(latestInvoice),
    accruedAmount: latestInvoice?.amount ?? null,
    projectedClose:
      latestInvoice?.amount ?? (openInvoice ? openInvoice.amount : null),
    status,
  };
}

function buildAvailableActions(
  snapshot: BillingSnapshot,
  emptyState: BillingEmptyState | null,
): ResourceActionDescriptor[] {
  const invoiceActionDisabled = emptyState?.reason === "not_provisioned";
  const actions: ResourceActionDescriptor[] =
    emptyState?.reason === "permission_denied"
      ? [
          {
            action: "billing.open.invoices",
            enabled: false,
            disabledReasonCode: "RBAC_SCOPE_REQUIRED",
            riskLevel: "low",
          },
        ]
      : [
          {
            action:
              snapshot.status === "not_provisioned"
                ? "billing.profile.create"
                : "billing.profile.edit",
            enabled: true,
            requiresReason: false,
            riskLevel: "medium",
          },
          {
            action: "billing.open.invoices",
            enabled: !invoiceActionDisabled,
            ...(invoiceActionDisabled
              ? { disabledReasonCode: "PROFILE_NOT_READY" }
              : {}),
            riskLevel: "low",
          },
        ];

  if (
    emptyState?.nextAction &&
    !actions.some((action) => action.action === emptyState.nextAction?.action)
  ) {
    actions.unshift(emptyState.nextAction);
  }

  return actions;
}

function mapActionLink(action: ResourceActionDescriptor) {
  switch (action.action) {
    case "billing.profile.create":
    case "billing.profile.edit":
      return {
        href: "/settings#billing-profile",
        label:
          action.action === "billing.profile.create"
            ? "建立 billing profile"
            : "編輯 billing profile",
        description:
          action.riskLevel === "medium"
            ? "medium action · 轉往租戶設定維護聯絡人、抬頭與地址"
            : "更新租戶帳務資料",
      };
    case "billing.open.invoices":
      return {
        href: "/invoices",
        label: "開啟 invoices 明細",
        description: "low action · 進入對帳單清單與 artifact download",
      };
    case "billing.retry":
      return {
        href: "/billing",
        label: "重新整理 overview",
        description: "low action · 依 T5 refresh tier 重新取得資料",
      };
    default:
      return {
        href: "/billing",
        label: action.action,
        description: `${action.riskLevel} action`,
      };
  }
}

function getSnapshotTone(status: BillingSnapshot["status"]) {
  switch (status) {
    case "past_due":
    case "suspended":
      return "down" as const;
    case "not_provisioned":
      return "neutral" as const;
    case "active":
    default:
      return "up" as const;
  }
}

function getSnapshotLabel(status: BillingSnapshot["status"]) {
  switch (status) {
    case "past_due":
      return "past-due watch";
    case "suspended":
      return "suspended";
    case "not_provisioned":
      return "not provisioned";
    case "active":
    default:
      return "current period live";
  }
}

function getSnapshotPillTone(status: BillingSnapshot["status"]): CanvasTone {
  switch (status) {
    case "past_due":
      return "warn";
    case "suspended":
      return "danger";
    case "not_provisioned":
      return "neutral";
    case "active":
    default:
      return "success";
  }
}

function getEmptyReason(searchValue: string | null, hasErrors: boolean) {
  if (
    searchValue &&
    Object.prototype.hasOwnProperty.call(EMPTY_REASON_META, searchValue)
  ) {
    return searchValue as EmptyReason;
  }
  return hasErrors ? "fetch_failed" : null;
}

function getActionTone(riskLevel: ResourceActionDescriptor["riskLevel"]) {
  switch (riskLevel) {
    case "high":
      return "danger" as const;
    case "medium":
      return "warn" as const;
    case "low":
    default:
      return "info" as const;
  }
}

function getInvoiceStatusMeta(invoice: TenantInvoiceRecord) {
  if (isPastDue(invoice)) {
    return { label: "overdue", tone: "warn" as CanvasTone };
  }

  switch (invoice.status) {
    case "paid":
      return { label: "paid", tone: "success" as CanvasTone };
    case "issued":
      return { label: "issued", tone: "info" as CanvasTone };
    case "draft":
    default:
      return { label: "draft", tone: "neutral" as CanvasTone };
  }
}

function getInvoiceDueDate(invoice: TenantInvoiceRecord) {
  if (invoice.status === "draft") {
    return "—";
  }
  const basis = new Date(invoice.updatedAt || invoice.createdAt);
  if (Number.isNaN(basis.getTime())) {
    return "—";
  }
  basis.setDate(basis.getDate() + 30);
  return formatDateInput(basis.toISOString()) ?? "—";
}

function toInvoiceSummaryHref(invoice: TenantInvoiceRecord) {
  return `/invoices?period=${invoice.periodStart.slice(0, 7)}`;
}

function getAverageTripAmount(invoices: TenantInvoiceRecord[]) {
  const totalTrips = invoices.reduce(
    (count, invoice) => count + invoice.lines.length,
    0,
  );
  if (totalTrips === 0) {
    return null;
  }

  const totalAmountMinor = invoices.reduce(
    (sum, invoice) => sum + invoice.amount.amountMinor,
    0,
  );
  const currency = invoices[0]?.amount.currency ?? "TWD";

  return {
    amountMinor: Math.floor(totalAmountMinor / totalTrips / 100) * 100,
    currency,
  } satisfies MoneyAmount;
}

function getQuotaSummaryLabel(summary: TenantQuotaSummary | null) {
  if (!summary) return "quota unavailable";

  if (summary.limit.bookingCountLimit !== null) {
    const used = summary.usage.confirmedBookingCount;
    const limit = summary.limit.bookingCountLimit;
    const ratio = limit > 0 ? Math.round((used / limit) * 100) : 0;
    return `${ratio}% of ${formatCount(limit)} quota`;
  }

  if (summary.limit.amountMinorLimit !== null) {
    return `${summary.usage.remainingPercent ?? "—"}% remaining`;
  }

  return "unlimited plan";
}

function getPlanQuotaValue(summary: TenantQuotaSummary | null) {
  if (!summary) return "—";

  if (summary.limit.bookingCountLimit !== null) {
    return `${formatCount(summary.limit.bookingCountLimit)} 趟 / 月`;
  }

  if (summary.limit.amountMinorLimit !== null) {
    return formatMoney({
      amountMinor: summary.limit.amountMinorLimit,
      currency: summary.limit.currency,
    });
  }

  return "無上限";
}

function getUsageRemainingValue(summary: TenantQuotaSummary | null) {
  if (!summary) return "—";

  if (summary.usage.bookingCountRemaining !== null) {
    return `${formatCount(summary.usage.bookingCountRemaining)} 趟剩餘`;
  }

  if (summary.usage.amountMinorRemaining !== null) {
    return formatMoney({
      amountMinor: summary.usage.amountMinorRemaining,
      currency: summary.limit.currency,
    });
  }

  return "無上限";
}

function resolveCrossAppHref(link: CrossAppResourceLink) {
  const origin = getCrossAppOrigin(link.targetApp);
  return `${origin}${link.route}`;
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const data = await loadBillingPageData();
  const resolvedSearchParams = await searchParams;
  const emptyParam = Array.isArray(resolvedSearchParams.empty)
    ? resolvedSearchParams.empty[0]
    : resolvedSearchParams.empty;
  const stateParam = Array.isArray(resolvedSearchParams.state)
    ? resolvedSearchParams.state[0]
    : resolvedSearchParams.state;

  const emptyReason = getEmptyReason(
    emptyParam ?? null,
    data.errors.length > 0,
  );
  const canReadBillingContent = emptyReason !== "permission_denied";
  const billingProfile = canReadBillingContent ? data.billingProfile : null;
  const invoices = canReadBillingContent ? data.invoices : [];
  const quotaSummary = canReadBillingContent ? data.quotaSummary : null;
  const snapshot = getBillingSnapshot(
    emptyReason === "not_provisioned" ? null : billingProfile,
    emptyReason === "no_data" ? [] : invoices,
    stateParam ?? null,
  );
  const emptyState = emptyReason ? EMPTY_REASON_META[emptyReason] : null;
  const availableActions = buildAvailableActions(snapshot, emptyState);
  const sortedInvoices =
    emptyReason === "no_data" || emptyReason === "filtered_empty"
      ? []
      : [...invoices].sort((left, right) =>
          right.periodEnd.localeCompare(left.periodEnd),
        );
  const latestInvoice = sortedInvoices[0] ?? null;
  const currentPeriodInvoices = latestInvoice
    ? sortedInvoices.filter(
        (invoice) =>
          invoice.periodStart.slice(0, 7) ===
          latestInvoice.periodStart.slice(0, 7),
      )
    : [];
  const currentPeriodTripCount = currentPeriodInvoices.reduce(
    (count, invoice) => count + invoice.lines.length,
    0,
  );
  const averageTripAmount = getAverageTripAmount(
    currentPeriodInvoices.length > 0 ? currentPeriodInvoices : sortedInvoices,
  );
  const invoiceRows: InvoiceSummaryRow[] = sortedInvoices
    .slice(0, 6)
    .map((invoice) => ({ ...invoice }));
  const refreshSummary = "T5 tenant slow · 30s cadence · generated via ISR";
  const paymentMethodLabel = billingProfile ? "月結發票 · NET 30" : "—";
  const billingCurrency =
    latestInvoice?.amount.currency ?? quotaSummary?.limit.currency ?? "TWD";
  const nextCloseLabel = latestInvoice?.periodEnd
    ? `${latestInvoice.periodEnd} 23:59`
    : "—";
  const emptyStateAction = emptyState?.nextAction
    ? mapActionLink(emptyState.nextAction)
    : null;

  const invoiceColumns: CanvasTableColumn<InvoiceSummaryRow>[] = [
    {
      h: "INVOICE",
      w: 200,
      mono: true,
      r: (row) => (
        <Link href={toInvoiceSummaryHref(row)} style={tableLinkStyle}>
          <span style={tablePrimaryStyle}>{row.invoiceId}</span>
        </Link>
      ),
    },
    {
      h: "PERIOD",
      w: 110,
      mono: true,
      r: (row) => row.periodStart.slice(0, 7),
    },
    {
      h: "AMOUNT",
      w: 150,
      mono: true,
      align: "right",
      r: (row) => formatMoney(row.amount),
    },
    {
      h: "STATUS",
      w: 110,
      r: (row) => {
        const statusMeta = getInvoiceStatusMeta(row);
        return (
          <CanvasPill theme={th} tone={statusMeta.tone} dot>
            {statusMeta.label}
          </CanvasPill>
        );
      },
    },
    {
      h: "DUE",
      w: 120,
      mono: true,
      r: (row) => getInvoiceDueDate(row),
    },
  ];

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="帳務概覽"
        subtitle="billing profile · 當期使用 · 近期 invoice"
      />

      <div style={pageBodyStyle}>
        {data.errors.length > 0 && emptyReason !== "fetch_failed" ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title="部分帳務資料未完整載入"
            body={data.errors.join(" / ")}
          />
        ) : null}

        {emptyState ? (
          <CanvasBanner
            theme={th}
            tone={emptyState.tone}
            icon={emptyState.tone === "danger" ? "warn" : "info"}
            title={emptyState.title}
            body={emptyState.body}
          />
        ) : null}

        {emptyState ? (
          <div style={emptyStateLayoutStyle}>
            <CanvasCard
              theme={th}
              title={emptyState.title}
              subtitle={`${emptyState.reason} · ${emptyState.messageCode}`}
              actions={
                <CanvasPill theme={th} tone={getActionTone("medium")} dot>
                  {emptyState.laneLabel}
                </CanvasPill>
              }
            >
              <div style={emptyStateBodyStyle}>
                <div style={detailItemStyle}>
                  <span style={detailLabelStyle}>Authority note</span>
                  <span style={detailValueStyle}>{emptyState.body}</span>
                </div>
                <div style={detailGridStyle}>
                  <div style={detailItemStyle}>
                    <span style={detailLabelStyle}>Refresh tier</span>
                    <span style={detailValueStyle}>{refreshSummary}</span>
                  </div>
                  <div style={detailItemStyle}>
                    <span style={detailLabelStyle}>Exit route</span>
                    <span style={detailValueStyle}>/invoices</span>
                  </div>
                </div>
                {emptyStateAction ? (
                  <Link href={emptyStateAction.href} style={actionLinkStyle}>
                    <strong>{emptyStateAction.label}</strong>
                    <span style={noteStyle}>
                      {emptyStateAction.description}
                    </span>
                  </Link>
                ) : null}
              </div>
            </CanvasCard>

            <CanvasCard
              theme={th}
              title="Route flow"
              subtitle="spec entry / exit and sibling surfaces"
            >
              <div style={routeListStyle}>
                <div style={routeItemStyle}>
                  <span style={detailLabelStyle}>Entry</span>
                  <span style={detailValueStyle}>Sidebar navigation</span>
                  <span style={routeCodeStyle}>tenant-console /billing</span>
                </div>
                <div style={routeItemStyle}>
                  <span style={detailLabelStyle}>Detail exit</span>
                  <Link href="/invoices" style={tableLinkStyle}>
                    Open invoice detail
                  </Link>
                  <span style={routeCodeStyle}>/invoices</span>
                </div>
                <div style={routeItemStyle}>
                  <span style={detailLabelStyle}>Related routes</span>
                  <span style={detailValueStyle}>
                    /settings · /cost-centers
                  </span>
                  <span style={routeCodeStyle}>
                    billing profile + finance controls
                  </span>
                </div>
              </div>
            </CanvasCard>
          </div>
        ) : null}

        <div style={kpiGridStyle}>
          <CanvasKPI
            theme={th}
            label="本月累計"
            value={formatMoney(snapshot.accruedAmount)}
            deltaTone={getSnapshotTone(snapshot.status)}
            delta={getSnapshotLabel(snapshot.status)}
            sub={`period · ${snapshot.periodLabel}`}
          />
          <CanvasKPI
            theme={th}
            label="預估 close"
            value={formatMoney(snapshot.projectedClose)}
            sub={nextCloseLabel}
          />
          <CanvasKPI
            theme={th}
            label="本月趟次"
            value={formatCount(currentPeriodTripCount)}
            sub={getQuotaSummaryLabel(quotaSummary)}
          />
          <CanvasKPI
            theme={th}
            label="平均單筆"
            value={formatMoney(averageTripAmount)}
            sub={billingCurrency}
          />
        </div>

        <div style={primaryGridStyle}>
          <CanvasCard
            theme={th}
            title="Billing profile"
            actions={
              <CanvasPill
                theme={th}
                tone={getSnapshotPillTone(snapshot.status)}
                dot
              >
                {getSnapshotLabel(snapshot.status)}
              </CanvasPill>
            }
          >
            <div style={detailStackStyle}>
              <div style={detailItemStyle}>
                <span style={detailLabelStyle}>發票抬頭</span>
                <span style={detailValueStyle}>
                  {billingProfile?.invoiceTitle ?? "未設定抬頭"}
                </span>
              </div>
              <div style={detailItemStyle}>
                <span style={detailLabelStyle}>統一編號</span>
                <span style={detailValueStyle}>
                  {billingProfile?.taxId ?? "未設定統編"}
                </span>
              </div>
              <div style={detailItemStyle}>
                <span style={detailLabelStyle}>計費聯絡人</span>
                <span style={detailValueStyle}>
                  {billingProfile
                    ? `${billingProfile.contactName ?? "未指派"} · ${billingProfile.email}`
                    : "尚未設定"}
                </span>
              </div>
              <div style={detailItemStyle}>
                <span style={detailLabelStyle}>付款方式</span>
                <span style={detailValueStyle}>{paymentMethodLabel}</span>
              </div>
              <div style={detailItemStyle}>
                <span style={detailLabelStyle}>billing address</span>
                <span style={detailValueStyle}>
                  {billingProfile?.address ?? "未設定地址"}
                </span>
              </div>
              <div style={detailItemStyle}>
                <span style={detailLabelStyle}>幣別</span>
                <span style={detailValueStyle}>{billingCurrency}</span>
              </div>
              <div style={detailItemStyle}>
                <span style={detailLabelStyle}>next close</span>
                <span style={detailValueStyle}>{nextCloseLabel}</span>
              </div>
            </div>
          </CanvasCard>

          <CanvasCard
            theme={th}
            title="近 6 期 invoice"
            subtitle="summary rows deep-link to `/invoices` detail surface"
          >
            {invoiceRows.length > 0 ? (
              <div style={detailStackStyle}>
                <CanvasTable<InvoiceSummaryRow>
                  theme={th}
                  rows={invoiceRows}
                  columns={invoiceColumns}
                />
                <div style={inlineRowStyle}>
                  <Link href="/invoices" style={tableLinkStyle}>
                    前往發票
                  </Link>
                  {latestInvoice?.artifactUrl ? (
                    <a
                      href={latestInvoice.artifactUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={tableLinkStyle}
                    >
                      下載當期 artifact
                    </a>
                  ) : null}
                </div>
              </div>
            ) : (
              <div style={emptyPanelStyle}>
                {emptyReason === "filtered_empty"
                  ? "目前切片沒有命中 recent invoice summary。"
                  : emptyReason === "permission_denied"
                    ? "目前角色沒有 invoice summary 讀取權限。"
                    : "尚未產生 recent invoice summary。"}
              </div>
            )}
          </CanvasCard>
        </div>

        <div style={secondaryGridStyle}>
          <CanvasCard
            theme={th}
            title="Current period snapshot"
            subtitle="quota / usage relative to plan"
          >
            <div style={detailGridStyle}>
              <div style={detailItemStyle}>
                <span style={detailLabelStyle}>Refresh tier</span>
                <span style={detailValueStyle}>{refreshSummary}</span>
              </div>
              <div style={detailItemStyle}>
                <span style={detailLabelStyle}>Plan quota</span>
                <span style={detailValueStyle}>
                  {getPlanQuotaValue(quotaSummary)}
                </span>
              </div>
              <div style={detailItemStyle}>
                <span style={detailLabelStyle}>Confirmed usage</span>
                <span style={detailValueStyle}>
                  {quotaSummary
                    ? `${formatCount(quotaSummary.usage.confirmedBookingCount)} 趟`
                    : "—"}
                </span>
              </div>
              <div style={detailItemStyle}>
                <span style={detailLabelStyle}>Usage remaining</span>
                <span style={detailValueStyle}>
                  {getUsageRemainingValue(quotaSummary)}
                </span>
              </div>
            </div>
          </CanvasCard>

          <CanvasCard
            theme={th}
            title="Available actions"
            subtitle="CTAs rendered from resource action descriptors"
          >
            <div style={actionListStyle}>
              {availableActions.map((action) => {
                const target = mapActionLink(action);
                if (!action.enabled) {
                  return (
                    <div key={action.action} style={mutedActionStyle}>
                      <strong>{target.label}</strong>
                      <div style={actionMetaRowStyle}>
                        <CanvasPill
                          theme={th}
                          tone={getActionTone(action.riskLevel)}
                        >
                          {action.riskLevel}
                        </CanvasPill>
                      </div>
                      <span style={noteStyle}>
                        {action.disabledReasonCode ?? "disabled"}
                      </span>
                    </div>
                  );
                }

                return (
                  <Link
                    key={action.action}
                    href={target.href}
                    style={actionLinkStyle}
                  >
                    <strong>{target.label}</strong>
                    <div style={actionMetaRowStyle}>
                      <CanvasPill
                        theme={th}
                        tone={getActionTone(action.riskLevel)}
                      >
                        {action.riskLevel}
                      </CanvasPill>
                      {action.requiresReason ? (
                        <CanvasPill theme={th} tone="danger">
                          reason required
                        </CanvasPill>
                      ) : null}
                    </div>
                    <span style={noteStyle}>{target.description}</span>
                  </Link>
                );
              })}
            </div>
          </CanvasCard>

          <CanvasCard
            theme={th}
            title="Cross-app deep links"
            subtitle="Q-X03 targets stay explicit and open in a new tab when leaving tenant-console"
          >
            <div style={actionListStyle}>
              {CROSS_APP_LINKS.map((link) => (
                <a
                  key={`${link.targetApp}:${link.route}`}
                  href={resolveCrossAppHref(link)}
                  target={link.openMode === "new_tab" ? "_blank" : undefined}
                  rel={link.openMode === "new_tab" ? "noreferrer" : undefined}
                  style={actionLinkStyle}
                >
                  <strong>{link.label}</strong>
                  <span style={noteStyle}>
                    {link.targetApp} ·{" "}
                    {link.openMode === "new_tab" ? "new tab" : "same tab"}
                  </span>
                </a>
              ))}
            </div>
          </CanvasCard>
        </div>

        <div style={secondaryGridStyle}>
          <CanvasCard
            theme={th}
            title="State coverage"
            subtitle="Six EmptyReason states plus billing lifecycle variants stay testable"
          >
            <div style={detailStackStyle}>
              <div style={stateChipGridStyle}>
                {EMPTY_REASON_SEQUENCE.map((reason) => (
                  <Link
                    key={reason}
                    href={`/billing?empty=${reason}`}
                    style={
                      emptyReason === reason
                        ? stateChipActiveStyle
                        : mutedActionStyle
                    }
                  >
                    <strong>{reason}</strong>
                    <span style={noteStyle}>
                      {EMPTY_REASON_META[reason]!.title}
                    </span>
                  </Link>
                ))}
              </div>
              <div style={inlineRowStyle}>
                <Link href="/billing?state=past_due" style={tableLinkStyle}>
                  Simulate past-due
                </Link>
                <Link href="/billing?state=suspended" style={tableLinkStyle}>
                  Simulate suspended
                </Link>
                <Link href="/billing" style={tableLinkStyle}>
                  Active snapshot
                </Link>
              </div>
            </div>
          </CanvasCard>

          <CanvasCard
            theme={th}
            title="Authority notes"
            subtitle="packet behaviour with contract-safe fallbacks"
          >
            <div style={detailStackStyle}>
              <div style={detailItemStyle}>
                <span style={detailLabelStyle}>Last profile update</span>
                <span style={detailValueStyle}>
                  {formatDateInput(billingProfile?.updatedAt) ?? "—"}
                </span>
              </div>
              <div style={detailItemStyle}>
                <span style={detailLabelStyle}>Quota refreshed</span>
                <span style={detailValueStyle}>
                  {formatDateInput(quotaSummary?.refreshedAt) ?? "—"}
                </span>
              </div>
              <div style={detailItemStyle}>
                <span style={detailLabelStyle}>Contract note</span>
                <span style={detailValueStyle}>
                  Shared contract today exposes profile, invoice, and quota data
                  only, so payment method and invoice due date use the canvas
                  NET 30 convention instead of a dedicated backend field.
                </span>
              </div>
            </div>
          </CanvasCard>
        </div>
      </div>
    </div>
  );
}
