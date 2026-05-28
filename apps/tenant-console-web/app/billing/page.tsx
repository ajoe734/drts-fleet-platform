import Link from "next/link";
import type { CSSProperties } from "react";
import type {
  CrossAppResourceLink,
  EmptyReason,
  MoneyAmount,
  RefreshTier,
  ResourceActionDescriptor,
  TenantBillingProfile,
  TenantInvoiceRecord,
  TenantQuotaSummary,
  UiRefreshMetadata,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  type CanvasTableColumn,
  type CanvasTone,
  buildCanvasTheme,
} from "@drts/ui-web";
import { DEMO_TENANT_ID, getTenantClient } from "@/lib/api-client";

export const dynamic = "force-dynamic";

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

const heroGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(320px, 1fr) minmax(440px, 1.4fr)",
  gap: 16,
};

const secondaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 16,
};

const actionGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: 10,
};

const cardStackStyle: CSSProperties = {
  display: "grid",
  gap: 12,
};

const linkCardStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  minHeight: 170,
};

const mutedTextStyle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: th.textMuted,
  lineHeight: 1.55,
};

const monoTextStyle: CSSProperties = {
  fontFamily: th.monoFamily,
  fontSize: 11.5,
};

const actionCardStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  padding: "10px 12px",
  borderRadius: 10,
  border: `1px solid ${th.border}`,
  background: th.surfaceLo,
  textDecoration: "none",
  color: th.text,
  minHeight: 74,
};

const BILLING_REFRESH_TIER: RefreshTier = "slow";
const BILLING_STALE_AFTER_MS = 30_000;

type BillingPageState = "active" | "not_provisioned" | "past_due";

type BillingProfileResource = TenantBillingProfile & {
  availableActions?: ResourceActionDescriptor[];
};

type InvoiceResource = TenantInvoiceRecord & {
  availableActions?: ResourceActionDescriptor[];
};

type QuotaSummaryResource = TenantQuotaSummary & {
  availableActions?: ResourceActionDescriptor[];
};

type BillingData = {
  billingProfile: BillingProfileResource | null;
  invoices: InvoiceResource[];
  quotaSummary: QuotaSummaryResource | null;
  errors: string[];
};

type BillingAction = {
  descriptor: ResourceActionDescriptor;
  label: string;
  helper: string;
  href: string;
  openInNewTab?: boolean;
};

type InvoiceRow = InvoiceResource &
  Record<string, unknown> & {
    dueAt: string | null;
  };

const EMPTY_REASON_ORDER: EmptyReason[] = [
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
  "filtered_empty",
];

const emptyReasonPreviewOptions = new Set<string>(EMPTY_REASON_ORDER);

const crossAppBaseUrls: Record<CrossAppResourceLink["targetApp"], string> = {
  "tenant-console":
    process.env.NEXT_PUBLIC_TENANT_CONSOLE_URL ?? "http://localhost:3004",
  "platform-admin":
    process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL ?? "http://localhost:3002",
  "ops-console":
    process.env.NEXT_PUBLIC_OPS_CONSOLE_URL ?? "http://localhost:3003",
};

async function loadBillingData(): Promise<BillingData> {
  const client = getTenantClient();
  const [billingProfile, invoices, quotaSummary] = await Promise.allSettled([
    client.getBillingProfile() as Promise<BillingProfileResource>,
    client.listInvoices() as Promise<InvoiceResource[]>,
    client.getTenantQuotaSummary() as Promise<QuotaSummaryResource>,
  ]);

  const errors: string[] = [];

  const collectError = (
    label: string,
    result: PromiseSettledResult<unknown>,
  ) => {
    if (result.status === "rejected") {
      errors.push(
        `${label}: ${result.reason instanceof Error ? result.reason.message : "Unknown error"}`,
      );
    }
  };

  collectError("Billing profile", billingProfile);
  collectError("Invoices", invoices);
  collectError("Quota summary", quotaSummary);

  return {
    billingProfile:
      billingProfile.status === "fulfilled" ? billingProfile.value : null,
    invoices: invoices.status === "fulfilled" ? invoices.value : [],
    quotaSummary:
      quotaSummary.status === "fulfilled" ? quotaSummary.value : null,
    errors,
  };
}

function formatCurrency(value: MoneyAmount | null | undefined) {
  if (!value) {
    return "—";
  }

  const amount = value.amountMinor / 100;
  const prefix = value.currency === "TWD" ? "NT$ " : `${value.currency} `;

  return `${prefix}${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount)}`;
}

function formatCount(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "—";
  }

  return new Intl.NumberFormat("en-US").format(value);
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("zh-Hant", {
    dateStyle: "medium",
  }).format(parsed);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("zh-Hant", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function getPeriodKey(value: string | null | undefined) {
  return value ? value.slice(0, 7) : "—";
}

function toTimestamp(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.getTime();
}

function addDaysUtc(value: string, days: number) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString();
}

function startOfMonthUtc(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
}

function endOfMonthUtc(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0));
}

function getCurrentPeriodRange(quotaSummary: TenantQuotaSummary | null) {
  if (quotaSummary?.periodKey) {
    const [yearText, monthText] = quotaSummary.periodKey.split("-");
    const year = Number(yearText);
    const month = Number(monthText);

    if (!Number.isNaN(year) && !Number.isNaN(month)) {
      return {
        start: new Date(Date.UTC(year, month - 1, 1)),
        end: new Date(Date.UTC(year, month, 0, 23, 59, 59)),
      };
    }
  }

  const now = new Date();
  return {
    start: startOfMonthUtc(now),
    end: endOfMonthUtc(now),
  };
}

function getCurrentPeriodLabel(quotaSummary: TenantQuotaSummary | null) {
  if (quotaSummary?.periodKey) {
    return quotaSummary.periodKey;
  }

  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function getQuotaUsageText(quotaSummary: TenantQuotaSummary | null) {
  if (!quotaSummary) {
    return "尚未回傳 quota snapshot";
  }

  const bookingLimit = quotaSummary.limit.bookingCountLimit;
  const bookingUsed =
    quotaSummary.usage.pendingReservedBookingCount +
    quotaSummary.usage.confirmedBookingCount;
  if (bookingLimit !== null) {
    return `${formatCount(bookingUsed)} / ${formatCount(bookingLimit)} 趟`;
  }

  const amountLimit = quotaSummary.limit.amountMinorLimit;
  const amountUsed =
    quotaSummary.usage.pendingReservedAmountMinor +
    quotaSummary.usage.confirmedAmountMinor;
  if (amountLimit !== null) {
    return `${formatCurrency({
      currency: quotaSummary.limit.currency,
      amountMinor: amountUsed,
    })} / ${formatCurrency({
      currency: quotaSummary.limit.currency,
      amountMinor: amountLimit,
    })}`;
  }

  return "無硬性上限";
}

function getQuotaProgressText(quotaSummary: TenantQuotaSummary | null) {
  if (!quotaSummary) {
    return "尚未同步";
  }

  const bookingUsed =
    quotaSummary.usage.pendingReservedBookingCount +
    quotaSummary.usage.confirmedBookingCount;
  if (bookingUsed > 0 && quotaSummary.limit.bookingCountLimit !== null) {
    return `${Math.min(
      100,
      Math.round(
        (bookingUsed / Math.max(quotaSummary.limit.bookingCountLimit, 1)) * 100,
      ),
    )}% of ${formatCount(quotaSummary.limit.bookingCountLimit)} 配額`;
  }

  const amountUsed =
    quotaSummary.usage.pendingReservedAmountMinor +
    quotaSummary.usage.confirmedAmountMinor;
  if (amountUsed > 0 && quotaSummary.limit.amountMinorLimit !== null) {
    return `${Math.min(
      100,
      Math.round(
        (amountUsed / Math.max(quotaSummary.limit.amountMinorLimit, 1)) * 100,
      ),
    )}% of spend cap`;
  }

  return "依方案不設上限";
}

function getQuotaRemainingText(quotaSummary: TenantQuotaSummary | null) {
  if (!quotaSummary) {
    return "—";
  }

  if (quotaSummary.usage.bookingCountRemaining !== null) {
    return `${formatCount(quotaSummary.usage.bookingCountRemaining)} 趟剩餘`;
  }

  if (quotaSummary.usage.amountMinorRemaining !== null) {
    return formatCurrency({
      currency: quotaSummary.limit.currency,
      amountMinor: quotaSummary.usage.amountMinorRemaining,
    });
  }

  return "無上限";
}

function buildProjectedClose(
  currentInvoice: TenantInvoiceRecord | null,
  quotaSummary: TenantQuotaSummary | null,
) {
  if (!currentInvoice) {
    return {
      value: null as MoneyAmount | null,
      helper: "當期尚未形成 invoice，維持 billing profile 與配額監看。",
    };
  }

  const range = getCurrentPeriodRange(quotaSummary);
  const now = new Date();
  const totalMs = Math.max(range.end.getTime() - range.start.getTime(), 1);
  const elapsedMs = Math.min(
    Math.max(now.getTime() - range.start.getTime(), 0),
    totalMs,
  );
  const runRate = Math.max(elapsedMs / totalMs, 0.15);
  const projectedAmountMinor = Math.round(
    currentInvoice.amount.amountMinor / runRate,
  );

  return {
    value: {
      currency: currentInvoice.amount.currency,
      amountMinor: projectedAmountMinor,
    } satisfies MoneyAmount,
    helper:
      runRate >= 0.99
        ? "期末已近，projection 幾乎等於當前累計。"
        : `依 ${Math.round(runRate * 100)}% 期間進度推估 close。`,
  };
}

function getPastDueInvoice(invoices: readonly TenantInvoiceRecord[]) {
  const now = Date.now();

  return invoices.find((invoice) => {
    if (invoice.status === "paid") {
      return false;
    }

    const dueAt = addDaysUtc(invoice.periodEnd, 30);
    if (!dueAt) {
      return false;
    }

    return new Date(dueAt).getTime() < now;
  });
}

function buildRefreshMetadata(args: {
  billingProfile: BillingProfileResource | null;
  currentInvoice: TenantInvoiceRecord | null;
  quotaSummary: TenantQuotaSummary | null;
  errors: readonly string[];
}): UiRefreshMetadata {
  const generatedAtCandidates = [
    args.quotaSummary?.refreshedAt,
    args.currentInvoice?.updatedAt,
    args.billingProfile?.updatedAt,
  ]
    .map((value) => toTimestamp(value))
    .filter((value): value is number => value !== null);

  const generatedAtMs =
    generatedAtCandidates.length > 0
      ? Math.max(...generatedAtCandidates)
      : Date.now();
  const ageMs = Date.now() - generatedAtMs;
  const staleThresholdMs = BILLING_STALE_AFTER_MS;

  return {
    generatedAt: new Date(generatedAtMs).toISOString(),
    staleAfterMs: staleThresholdMs,
    dataFreshness:
      args.errors.length > 0
        ? "degraded"
        : ageMs > staleThresholdMs
          ? "stale"
          : "fresh",
    source: args.errors.length > 0 ? "cache" : "live",
  };
}

function getRefreshTone(metadata: UiRefreshMetadata): CanvasTone {
  switch (metadata.dataFreshness) {
    case "fresh":
      return "success";
    case "degraded":
      return "warn";
    case "stale":
      return "danger";
    case "unknown":
    default:
      return "neutral";
  }
}

function getRefreshTierLabel(tier: RefreshTier) {
  switch (tier) {
    case "slow":
      return "T5 slow · 30s";
    case "manual":
      return "T6 manual";
    case "medium_slow":
      return "T5 medium-slow · 30s";
    case "medium":
      return "T4 medium · 15s";
    case "dispatch":
      return "T3 dispatch · 5s";
    case "fast":
      return "T2 fast · 3s";
    case "urgent":
      return "T1 urgent";
    default:
      return tier;
  }
}

function toActionMap(descriptors: readonly ResourceActionDescriptor[]) {
  return new Map(
    descriptors.map((descriptor) => [descriptor.action, descriptor]),
  );
}

function mergeActionDescriptor(
  descriptor: ResourceActionDescriptor | undefined,
  fallback: ResourceActionDescriptor,
) {
  return descriptor ?? fallback;
}

function getAvailableActions(
  resource: {
    availableActions?: ResourceActionDescriptor[];
  } | null,
) {
  return resource?.availableActions ?? [];
}

function resolvePageState(
  data: BillingData,
  requestedState: string | undefined,
) {
  const isNotProvisioned =
    !data.billingProfile &&
    !data.quotaSummary &&
    data.invoices.length === 0 &&
    data.errors.length === 0;

  if (requestedState === "not_provisioned" || isNotProvisioned) {
    return "not_provisioned" as const;
  }

  if (requestedState === "past_due" || getPastDueInvoice(data.invoices)) {
    return "past_due" as const;
  }

  return "active" as const;
}

function resolveEmptyReason(
  data: BillingData,
  forcedReason: string | undefined,
  pageState: BillingPageState,
) {
  if (forcedReason && emptyReasonPreviewOptions.has(forcedReason)) {
    return forcedReason as EmptyReason;
  }

  if (data.errors.length > 0) {
    return "fetch_failed" as const;
  }

  if (pageState === "not_provisioned") {
    return "not_provisioned" as const;
  }

  if (data.invoices.length === 0) {
    return "no_data" as const;
  }

  return null;
}

function buildPrimaryActions(args: {
  billingProfile: BillingProfileResource | null;
  invoices: InvoiceResource[];
  pageState: BillingPageState;
  emptyReason: EmptyReason | null;
}) {
  const profileActions = toActionMap(getAvailableActions(args.billingProfile));
  const invoiceActions = toActionMap(
    args.invoices.flatMap((invoice) => getAvailableActions(invoice)),
  );

  const editFallback: ResourceActionDescriptor =
    args.emptyReason === "permission_denied"
      ? {
          action: "edit_billing_profile",
          enabled: false,
          disabledReasonCode: "tenant_billing_read_only",
          riskLevel: "medium",
        }
      : {
          action: "edit_billing_profile",
          enabled: true,
          riskLevel: "medium",
        };

  const invoiceFallback: ResourceActionDescriptor =
    args.emptyReason === "external_unavailable"
      ? {
          action: "open_invoices",
          enabled: false,
          disabledReasonCode: "invoice_authority_unavailable",
          riskLevel: "low",
        }
      : {
          action: "open_invoices",
          enabled: true,
          riskLevel: "low",
        };

  const provisionFallback: ResourceActionDescriptor = {
    action: "provision_billing",
    enabled: true,
    riskLevel: "medium",
  };

  const editDescriptor = mergeActionDescriptor(
    profileActions.get("edit_billing_profile") ??
      profileActions.get("update_billing_profile"),
    editFallback,
  );
  const invoicesDescriptor = mergeActionDescriptor(
    invoiceActions.get("open_invoices") ?? invoiceActions.get("view_invoice"),
    invoiceFallback,
  );
  const provisionDescriptor = mergeActionDescriptor(
    profileActions.get("provision_billing"),
    provisionFallback,
  );

  const actions: BillingAction[] = [
    {
      descriptor: editDescriptor,
      label: "編輯 billing profile",
      helper: "medium · 導向租戶設定中的 billing baseline",
      href: "/settings#billing-profile",
    },
    {
      descriptor: invoicesDescriptor,
      label: "前往對帳單",
      helper: "low · drill into recent invoice artifacts",
      href: "/invoices",
    },
  ];

  if (args.pageState === "not_provisioned") {
    actions.unshift({
      descriptor: provisionDescriptor,
      label: "補齊 billing baseline",
      helper: "medium · 完成計費聯絡人、地址與稅務欄位",
      href: "/settings#billing-profile",
    });
  }

  return actions;
}

function buildCrossAppLinks(
  pageState: BillingPageState,
  latestInvoice: TenantInvoiceRecord | null,
) {
  const links: CrossAppResourceLink[] = [
    {
      targetApp: "platform-admin",
      route: `/tenants/${DEMO_TENANT_ID}?tab=billing`,
      resourceType: "tenant_billing_profile",
      resourceId: DEMO_TENANT_ID,
      openMode: "new_tab",
      label: "平台側 billing baseline",
    },
    {
      targetApp: "ops-console",
      route: latestInvoice
        ? `/audit?resourceType=invoice&resourceId=${encodeURIComponent(latestInvoice.invoiceId)}`
        : `/audit?tenantId=${encodeURIComponent(DEMO_TENANT_ID)}&module=billing`,
      resourceType: latestInvoice ? "invoice" : "tenant_billing",
      resourceId: latestInvoice?.invoiceId ?? DEMO_TENANT_ID,
      openMode: "new_tab",
      label:
        pageState === "past_due"
          ? "催收 / 稽核 lane"
          : "跨 actor 帳務稽核 lane",
    },
  ];

  return links;
}

function getEmptyStateCopy(reason: EmptyReason): {
  tone: Exclude<CanvasTone, "neutral">;
  title: string;
  body: string;
  icon: "info" | "warn" | "billing";
} {
  switch (reason) {
    case "not_provisioned":
      return {
        tone: "warn",
        icon: "billing",
        title: "帳務尚未開通",
        body: "租戶 billing baseline 或 invoice delivery lane 尚未 provision，這裡只顯示設定入口，不假裝已有資料。",
      };
    case "fetch_failed":
      return {
        tone: "danger",
        icon: "warn",
        title: "帳務快照讀取失敗",
        body: "目前無法同時取得 billing profile、invoice 或 quota snapshot；保留最後可讀資訊與導覽，但標示資料不完整。",
      };
    case "permission_denied":
      return {
        tone: "info",
        icon: "info",
        title: "目前角色沒有帳務讀取權",
        body: "CTA 仍須可見但 disabled，讓使用者理解這是授權限制，不是資料不存在。",
      };
    case "external_unavailable":
      return {
        tone: "warn",
        icon: "warn",
        title: "外部 finance authority 暫時不可用",
        body: "外部或平台側帳務 authority 無法回應時，保留 deep link 與最後可讀快照，但不要假裝資料 fresh。",
      };
    case "filtered_empty":
      return {
        tone: "info",
        icon: "info",
        title: "目前篩選條件沒有結果",
        body: "這不是空租戶；只是目前 period / state filter 沒有 matching invoices。",
      };
    case "no_data":
    default:
      return {
        tone: "info",
        icon: "info",
        title: "目前還沒有 invoice",
        body: "租戶已開通，但還沒有進入第一個可對帳週期；顯示 billing profile、當期 snapshot 與 quota frame 即可。",
      };
  }
}

function ActionLink({ action }: { action: BillingAction }) {
  const enabled = action.descriptor.enabled;
  const isLowRisk = action.descriptor.riskLevel === "low";

  const content = (
    <>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{action.label}</div>
      <div style={{ fontSize: 11, color: enabled ? th.textDim : th.textMuted }}>
        {action.helper}
      </div>
      {!enabled && action.descriptor.disabledReasonCode ? (
        <div style={{ ...monoTextStyle, color: th.textMuted }}>
          {action.descriptor.disabledReasonCode}
        </div>
      ) : null}
    </>
  );

  if (!enabled) {
    return (
      <div
        title={action.descriptor.disabledReasonCode ?? "disabled"}
        style={{
          ...actionCardStyle,
          opacity: 0.48,
          cursor: "not-allowed",
        }}
      >
        {content}
      </div>
    );
  }

  return (
    <Link
      href={action.href}
      target={action.openInNewTab ? "_blank" : undefined}
      rel={action.openInNewTab ? "noreferrer" : undefined}
      style={{
        ...actionCardStyle,
        borderColor: isLowRisk ? th.border : th.accent,
        background: isLowRisk ? th.surfaceLo : "rgba(15, 118, 110, 0.16)",
      }}
    >
      {content}
    </Link>
  );
}

function CrossAppLinkCard({ link }: { link: CrossAppResourceLink }) {
  const href = `${crossAppBaseUrls[link.targetApp]}${link.route}`;

  return (
    <CanvasCard theme={th} style={linkCardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "grid", gap: 4 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{link.label}</div>
          <div style={{ fontSize: 11, color: th.textDim }}>
            {link.targetApp} ·{" "}
            {link.openMode === "new_tab" ? "new tab" : "same tab"}
          </div>
        </div>
        <CanvasPill theme={th} tone="info">
          deep link
        </CanvasPill>
      </div>
      <div style={monoTextStyle}>{link.route}</div>
      <p style={mutedTextStyle}>
        resource: {link.resourceType} / {link.resourceId}
      </p>
      <Link
        href={link.openMode === "same_tab" ? link.route : href}
        target={link.openMode === "new_tab" ? "_blank" : undefined}
        rel={link.openMode === "new_tab" ? "noreferrer" : undefined}
        style={{
          ...actionCardStyle,
          minHeight: 0,
          justifyContent: "center",
          textAlign: "center",
        }}
      >
        開啟 {link.targetApp}
      </Link>
    </CanvasCard>
  );
}

export default async function BillingOverviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const data = await loadBillingData();
  const resolvedSearchParams = await searchParams;
  const forcedEmptyReason = Array.isArray(resolvedSearchParams.emptyReason)
    ? resolvedSearchParams.emptyReason[0]
    : resolvedSearchParams.emptyReason;
  const forcedState = Array.isArray(resolvedSearchParams.state)
    ? resolvedSearchParams.state[0]
    : resolvedSearchParams.state;
  const showEmptyGallery =
    (Array.isArray(resolvedSearchParams.preview)
      ? resolvedSearchParams.preview[0]
      : resolvedSearchParams.preview) === "empties";

  const sortedInvoices = [...data.invoices].sort((left, right) =>
    right.periodEnd.localeCompare(left.periodEnd),
  );
  const currentPeriodKey = getCurrentPeriodLabel(data.quotaSummary);
  const currentInvoice =
    sortedInvoices.find(
      (invoice) => getPeriodKey(invoice.periodStart) === currentPeriodKey,
    ) ??
    sortedInvoices[0] ??
    null;
  const recentInvoices = sortedInvoices.slice(0, 6);
  const projectedClose = buildProjectedClose(currentInvoice, data.quotaSummary);
  const pageState = resolvePageState(data, forcedState);
  const emptyReason = resolveEmptyReason(data, forcedEmptyReason, pageState);
  const primaryActions = buildPrimaryActions({
    billingProfile: data.billingProfile,
    invoices: recentInvoices,
    pageState,
    emptyReason,
  });
  const crossAppLinks = buildCrossAppLinks(pageState, currentInvoice);
  const pastDueInvoice = getPastDueInvoice(sortedInvoices);
  const refreshMetadata = buildRefreshMetadata({
    billingProfile: data.billingProfile,
    currentInvoice,
    quotaSummary: data.quotaSummary,
    errors: data.errors,
  });
  const currentAccruedTrips =
    currentInvoice?.lines.length ??
    (data.quotaSummary
      ? data.quotaSummary.usage.pendingReservedBookingCount +
        data.quotaSummary.usage.confirmedBookingCount
      : 0);
  const avgTicketAmount =
    currentInvoice && currentAccruedTrips > 0
      ? {
          currency: currentInvoice.amount.currency,
          amountMinor: Math.round(
            currentInvoice.amount.amountMinor / currentAccruedTrips,
          ),
        }
      : null;

  const invoiceRows: InvoiceRow[] = recentInvoices.map((invoice) => ({
    ...invoice,
    dueAt: addDaysUtc(invoice.periodEnd, 30),
  }));

  const emptyCopy = emptyReason ? getEmptyStateCopy(emptyReason) : null;

  const invoiceColumns: CanvasTableColumn<InvoiceRow>[] = [
    {
      h: "INVOICE",
      w: 210,
      mono: true,
      r: (row) => (
        <span style={{ color: th.accent, fontWeight: 600, ...monoTextStyle }}>
          {row.invoiceId}
        </span>
      ),
    },
    {
      h: "PERIOD",
      w: 110,
      mono: true,
      r: (row) => getPeriodKey(row.periodStart),
    },
    {
      h: "AMOUNT",
      w: 150,
      mono: true,
      align: "right",
      r: (row) => formatCurrency(row.amount),
    },
    {
      h: "STATUS",
      w: 110,
      r: (row) => (
        <CanvasPill
          theme={th}
          tone={
            row.status === "paid"
              ? "success"
              : row === pastDueInvoice
                ? "warn"
                : "info"
          }
          dot
        >
          {row === pastDueInvoice && row.status !== "paid"
            ? "past_due"
            : row.status}
        </CanvasPill>
      ),
    },
    {
      h: "DUE",
      w: 120,
      mono: true,
      r: (row) => formatDate(row.dueAt),
    },
  ];

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="帳務概覽"
        subtitle="billing profile · 當期使用 · 近期 invoice"
        actions={
          <>
            <CanvasPill theme={th} tone={getRefreshTone(refreshMetadata)} dot>
              {refreshMetadata.dataFreshness}
            </CanvasPill>
            <CanvasPill theme={th} tone="info">
              {getRefreshTierLabel(BILLING_REFRESH_TIER)}
            </CanvasPill>
            <Link
              href={`/billing?refresh=${Date.now()}`}
              style={{ textDecoration: "none" }}
            >
              <CanvasBtn theme={th} icon="arrow" size="sm">
                重新整理
              </CanvasBtn>
            </Link>
          </>
        }
      />

      <div style={pageBodyStyle}>
        {data.errors.length > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title="帳務資料目前不是完整 fresh snapshot"
            body={data.errors.join(" / ")}
          />
        ) : null}

        {refreshMetadata.dataFreshness !== "fresh" ? (
          <CanvasBanner
            theme={th}
            tone={refreshMetadata.dataFreshness === "stale" ? "danger" : "info"}
            icon={refreshMetadata.dataFreshness === "stale" ? "warn" : "info"}
            title="Refresh tier 已接線，這份 snapshot 目前不是 fresh"
            body={`source=${refreshMetadata.source} · generatedAt=${formatDateTime(refreshMetadata.generatedAt)} · staleAfterMs=${refreshMetadata.staleAfterMs}`}
          />
        ) : null}

        {pageState === "past_due" && pastDueInvoice ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="billing"
            title="Past-due / suspended attention"
            body={`Invoice ${pastDueInvoice.invoiceId} 已超過估算到期日 ${formatDate(addDaysUtc(pastDueInvoice.periodEnd, 30))}；保留對帳單 drill-down 與跨 actor 稽核 deep links。`}
          />
        ) : null}

        <div style={kpiGridStyle}>
          <CanvasKPI
            theme={th}
            label="本月累計"
            value={formatCurrency(currentInvoice?.amount)}
            delta={pageState === "past_due" ? "attention" : "live"}
            deltaTone={pageState === "past_due" ? "down" : "up"}
            sub={currentPeriodKey}
          />
          <CanvasKPI
            theme={th}
            label="預估 close"
            value={formatCurrency(projectedClose.value)}
            sub={projectedClose.helper}
          />
          <CanvasKPI
            theme={th}
            label="本月趟次"
            value={formatCount(currentAccruedTrips)}
            sub={getQuotaProgressText(data.quotaSummary)}
          />
          <CanvasKPI
            theme={th}
            label="平均單筆"
            value={formatCurrency(avgTicketAmount)}
            sub={getQuotaRemainingText(data.quotaSummary)}
          />
        </div>

        <div style={heroGridStyle}>
          <CanvasCard theme={th} title="Billing profile">
            <CanvasDL
              theme={th}
              cols={1}
              items={[
                {
                  k: "統一編號",
                  v: data.billingProfile?.taxId ?? "未設定",
                  mono: true,
                },
                {
                  k: "計費聯絡人",
                  v: data.billingProfile
                    ? `${data.billingProfile.contactName ?? "未指派"} · ${data.billingProfile.email}`
                    : "尚未 provision",
                },
                {
                  k: "付款方式",
                  v: "invoice (NET 30)",
                  mono: true,
                },
                {
                  k: "billing address",
                  v: data.billingProfile?.address ?? "未設定",
                },
                {
                  k: "幣別",
                  v:
                    currentInvoice?.amount.currency ??
                    data.quotaSummary?.limit.currency ??
                    "TWD",
                  mono: true,
                },
                {
                  k: "next close",
                  v: formatDateTime(
                    getCurrentPeriodRange(data.quotaSummary).end.toISOString(),
                  ),
                  mono: true,
                },
              ]}
            />
          </CanvasCard>

          <CanvasCard
            theme={th}
            title="近 6 期 invoice"
            subtitle="`/billing` 是 overview；細節 drill-down 進 `/invoices`"
            actions={
              <Link href="/invoices" style={{ textDecoration: "none" }}>
                <CanvasBtn theme={th} size="xs" icon="chevR">
                  前往對帳單
                </CanvasBtn>
              </Link>
            }
            padding={0}
          >
            {emptyCopy ? (
              <div style={{ padding: 16, display: "grid", gap: 12 }}>
                <CanvasBanner
                  theme={th}
                  tone={emptyCopy.tone}
                  icon={emptyCopy.icon}
                  title={emptyCopy.title}
                  body={emptyCopy.body}
                />
                <div style={actionGridStyle}>
                  {primaryActions.map((action) => (
                    <ActionLink key={action.label} action={action} />
                  ))}
                </div>
              </div>
            ) : (
              <CanvasTable<InvoiceRow>
                theme={th}
                rows={invoiceRows}
                columns={invoiceColumns}
              />
            )}
          </CanvasCard>
        </div>

        <div style={secondaryGridStyle}>
          <CanvasCard theme={th} title="Current period snapshot">
            <CanvasDL
              theme={th}
              cols={2}
              items={[
                {
                  k: "period",
                  v: data.quotaSummary?.periodKey ?? currentPeriodKey,
                  mono: true,
                },
                {
                  k: "refreshed",
                  v: formatDateTime(refreshMetadata.generatedAt),
                  mono: true,
                },
                {
                  k: "accrued amount",
                  v: formatCurrency(currentInvoice?.amount),
                  mono: true,
                },
                {
                  k: "projected close",
                  v: formatCurrency(projectedClose.value),
                  mono: true,
                },
                {
                  k: "invoice status",
                  v: currentInvoice?.status ?? "未形成",
                  mono: true,
                },
                {
                  k: "next invoice lane",
                  v:
                    pageState === "past_due"
                      ? "past_due / follow-up"
                      : "monthly close",
                },
                {
                  k: "refresh tier",
                  v: getRefreshTierLabel(BILLING_REFRESH_TIER),
                  mono: true,
                },
                {
                  k: "freshness",
                  v: `${refreshMetadata.dataFreshness} · ${refreshMetadata.source}`,
                  mono: true,
                },
              ]}
            />
          </CanvasCard>

          <CanvasCard theme={th} title="Quota / usage relative to plan">
            <CanvasDL
              theme={th}
              cols={2}
              items={[
                {
                  k: "policy",
                  v: data.quotaSummary?.period ?? "monthly",
                  mono: true,
                },
                {
                  k: "remaining %",
                  v:
                    data.quotaSummary?.usage.remainingPercent !== null &&
                    data.quotaSummary?.usage.remainingPercent !== undefined
                      ? `${data.quotaSummary.usage.remainingPercent}%`
                      : "—",
                  mono: true,
                },
                {
                  k: "used vs limit",
                  v: getQuotaUsageText(data.quotaSummary),
                },
                {
                  k: "remaining",
                  v: getQuotaRemainingText(data.quotaSummary),
                },
              ]}
            />
          </CanvasCard>

          <CanvasCard theme={th} title="Available actions">
            <div style={cardStackStyle}>
              <div style={actionGridStyle}>
                {primaryActions.map((action) => (
                  <ActionLink key={action.href} action={action} />
                ))}
              </div>
              <p style={mutedTextStyle}>
                CTAs 由資源上的 `availableActions` 驅動；若 demo payload
                尚未附帶，才退回 spec-safe fallback descriptor。
              </p>
            </div>
          </CanvasCard>
        </div>

        <CanvasCard theme={th} title="Cross-app deep links">
          <div style={secondaryGridStyle}>
            {crossAppLinks.map((link) => (
              <CrossAppLinkCard
                key={`${link.targetApp}-${link.resourceId}-${link.route}`}
                link={link}
              />
            ))}
          </div>
        </CanvasCard>

        {showEmptyGallery ? (
          <CanvasCard
            theme={th}
            title="EmptyReason preview"
            subtitle="Six Q-X15 states rendered distinctly for review"
          >
            <div style={secondaryGridStyle}>
              {EMPTY_REASON_ORDER.map((reason) => {
                const copy = getEmptyStateCopy(reason);
                return (
                  <CanvasCard
                    key={reason}
                    theme={th}
                    style={linkCardStyle}
                    title={reason}
                  >
                    <CanvasBanner
                      theme={th}
                      tone={copy.tone}
                      icon={copy.icon}
                      title={copy.title}
                      body={copy.body}
                    />
                    <div style={actionGridStyle}>
                      {buildPrimaryActions({
                        billingProfile: data.billingProfile,
                        invoices: recentInvoices,
                        pageState:
                          reason === "not_provisioned"
                            ? "not_provisioned"
                            : pageState,
                        emptyReason: reason,
                      })
                        .slice(0, 1)
                        .map((action) => (
                          <ActionLink
                            key={`${reason}-${action.href}`}
                            action={action}
                          />
                        ))}
                    </div>
                  </CanvasCard>
                );
              })}
            </div>
          </CanvasCard>
        ) : null}
      </div>
    </div>
  );
}
