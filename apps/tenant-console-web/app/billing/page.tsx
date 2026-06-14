import type { CSSProperties, ReactNode } from "react";
import type {
  DriverStatementRecord,
  EmptyReason,
  MoneyAmount,
  ResourceActionDescriptor,
  TenantBillingProfile,
  TenantInvoiceRecord,
  TenantQuotaSummary,
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
import { getTenantClient } from "@/lib/api-client";
import { formatDateInput, formatDateTime } from "@/lib/formatters";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

export const dynamic = "force-dynamic";

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

// Refresh tier per packet §3.2 / §5.12: /billing is T5 (tenant slow, 30s).
const REFRESH_TIER = "slow" as const;
const REFRESH_CADENCE_MS = 30_000;

// Tenant-relevant EmptyReason set (driver_not_eligible is driver-app only).
const EMPTY_REASONS: readonly EmptyReason[] = [
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
  "filtered_empty",
] as const;

// Published availableActions for the billing overview surface (Q-X13 §3.5).
// CTAs render from these descriptors, never hard-coded by role.
const ROUTE_ACTIONS: readonly ResourceActionDescriptor[] = [
  {
    action: "edit_billing_profile",
    enabled: true,
    riskLevel: "medium",
  },
  {
    action: "view_invoices",
    enabled: true,
    riskLevel: "low",
  },
  {
    action: "refresh",
    enabled: true,
    riskLevel: "low",
  },
] as const;

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const kpiGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, 1fr)",
  gap: 12,
};

const splitGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1.4fr",
  gap: 16,
};

const emptyStateStyle: CSSProperties = {
  padding: 24,
  color: th.textMuted,
  fontSize: 12.5,
  textAlign: "center",
};

const invoiceLinkStyle: CSSProperties = {
  color: th.accent,
  fontWeight: 600,
  fontFamily: th.monoFamily,
  textDecoration: "none",
};

const actionAnchorStyle: CSSProperties = {
  textDecoration: "none",
};

type BillingData = {
  profile: TenantBillingProfile | null;
  invoices: TenantInvoiceRecord[];
  statements: DriverStatementRecord[];
  quota: TenantQuotaSummary | null;
  errors: string[];
  emptyReason: EmptyReason | null;
  generatedAt: string;
  refreshTier: typeof REFRESH_TIER;
  availableActions: ResourceActionDescriptor[];
};

type InvoiceRow = TenantInvoiceRecord & Record<string, unknown>;

type BillingPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function parseEmptyReason(value: string | undefined): EmptyReason | null {
  if (!value) {
    return null;
  }

  return EMPTY_REASONS.includes(value as EmptyReason)
    ? (value as EmptyReason)
    : null;
}

function inferEmptyReason(input: {
  profile: TenantBillingProfile | null;
  invoices: TenantInvoiceRecord[];
  statements: DriverStatementRecord[];
  quota: TenantQuotaSummary | null;
  profileFailed: boolean;
  errors: string[];
}): EmptyReason | null {
  // Hard fetch failure on the billing profile (the page-critical read) with no
  // recoverable snapshot to show.
  if (input.profileFailed && input.profile === null) {
    return "fetch_failed";
  }

  // Brand-new tenant: nothing has been provisioned on the billing surface yet.
  if (
    input.profile === null &&
    input.invoices.length === 0 &&
    input.quota === null
  ) {
    return "not_provisioned";
  }

  // Profile exists but there is no current-period billing activity yet.
  if (input.invoices.length === 0 && input.quota === null) {
    return "no_data";
  }

  return null;
}

function findAction(
  actions: ResourceActionDescriptor[],
  action: string,
): ResourceActionDescriptor | null {
  return actions.find((item) => item.action === action) ?? null;
}

function getBillingStatusLabel(
  status: TenantInvoiceRecord["status"],
  locale: "en" | "zh",
) {
  switch (status) {
    case "draft":
      return t("billing.status.draft", locale);
    case "issued":
      return t("billing.status.issued", locale);
    case "paid":
      return t("billing.status.paid", locale);
    default:
      return status;
  }
}

function getPayoutStatusLabel(status: string, locale: "en" | "zh") {
  switch (status) {
    case "paid":
      return t("billing.status.paid", locale);
    default:
      return t("billing.status.pending", locale);
  }
}

async function loadBillingData(
  emptyReasonOverride: EmptyReason | null,
  locale: "en" | "zh",
): Promise<BillingData> {
  const client = getTenantClient();
  const errors: string[] = [];

  const [profileResult, invoicesResult, statementsResult, quotaResult] =
    await Promise.allSettled([
      client.getBillingProfile() as Promise<TenantBillingProfile>,
      client.listInvoices() as Promise<TenantInvoiceRecord[]>,
      client.listTenantStatements() as Promise<DriverStatementRecord[]>,
      client.getTenantQuotaSummary() as Promise<TenantQuotaSummary>,
    ]);

  const profile =
    profileResult.status === "fulfilled" ? profileResult.value : null;
  const invoices =
    invoicesResult.status === "fulfilled" ? invoicesResult.value : [];
  const statements =
    statementsResult.status === "fulfilled" ? statementsResult.value : [];
  const quota = quotaResult.status === "fulfilled" ? quotaResult.value : null;

  if (profileResult.status === "rejected") {
    errors.push(
      profileResult.reason instanceof Error
        ? profileResult.reason.message
        : t("billing.error.profile", locale),
    );
  }

  if (invoicesResult.status === "rejected") {
    errors.push(
      invoicesResult.reason instanceof Error
        ? invoicesResult.reason.message
        : t("billing.error.invoices", locale),
    );
  }

  if (statementsResult.status === "rejected") {
    errors.push(
      statementsResult.reason instanceof Error
        ? statementsResult.reason.message
        : t("billing.error.statements", locale),
    );
  }

  if (quotaResult.status === "rejected") {
    errors.push(
      quotaResult.reason instanceof Error
        ? quotaResult.reason.message
        : t("billing.error.quota", locale),
    );
  }

  const generatedAt =
    quota?.refreshedAt ??
    profile?.updatedAt ??
    invoices[0]?.updatedAt ??
    new Date().toISOString();

  const inferredEmptyReason = inferEmptyReason({
    profile,
    invoices,
    statements,
    quota,
    profileFailed: profileResult.status === "rejected",
    errors,
  });

  return {
    profile,
    invoices,
    statements,
    quota,
    errors,
    emptyReason: emptyReasonOverride ?? inferredEmptyReason,
    generatedAt,
    refreshTier: REFRESH_TIER,
    availableActions: [...ROUTE_ACTIONS],
  };
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

function toPeriodKey(value: string | null | undefined) {
  return value ? value.slice(0, 7) : "—";
}

function getInvoiceStatusTone(
  status: TenantInvoiceRecord["status"],
): CanvasTone {
  switch (status) {
    case "paid":
      return "success";
    case "issued":
      return "info";
    case "draft":
    default:
      return "neutral";
  }
}

// Current-period accrued spend = backend-confirmed + reserved-but-pending,
// reported through the quota usage envelope (no client-side invention).
function buildAccruedAmount(
  quota: TenantQuotaSummary | null,
): MoneyAmount | null {
  if (!quota) {
    return null;
  }

  return {
    amountMinor:
      quota.usage.confirmedAmountMinor + quota.usage.pendingReservedAmountMinor,
    currency: quota.limit.currency,
  } satisfies MoneyAmount;
}

function buildAverageTicket(
  accrued: MoneyAmount | null,
  tripCount: number,
): MoneyAmount | null {
  if (!accrued || tripCount <= 0) {
    return null;
  }

  return {
    amountMinor: Math.round(accrued.amountMinor / tripCount),
    currency: accrued.currency,
  } satisfies MoneyAmount;
}

// Period boundaries derived from the monthly periodKey ("YYYY-MM"). Used only
// to express a transparent run-rate projection, clearly labelled as an estimate.
function buildPeriodBounds(periodKey: string | null | undefined) {
  if (!periodKey || !/^\d{4}-\d{2}$/.test(periodKey)) {
    return null;
  }

  const [yearText, monthText] = periodKey.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));

  return { start, end };
}

// Linear run-rate projection: accrued / fraction-of-period-elapsed. Marked as
// an estimate in the UI; never presented as a finalized billed amount.
function buildProjectedClose(
  accrued: MoneyAmount | null,
  periodKey: string | null | undefined,
): MoneyAmount | null {
  if (!accrued) {
    return null;
  }

  const bounds = buildPeriodBounds(periodKey);
  if (!bounds) {
    return accrued;
  }

  const total = bounds.end.getTime() - bounds.start.getTime();
  const elapsed = Date.now() - bounds.start.getTime();
  const fraction = Math.min(1, Math.max(elapsed / total, 0));

  if (fraction <= 0) {
    return accrued;
  }

  return {
    amountMinor: Math.round(accrued.amountMinor / fraction),
    currency: accrued.currency,
  } satisfies MoneyAmount;
}

// Banner tone excludes "neutral"; soft reasons map to the informational tone.
function getEmptyStateTone(
  reason: EmptyReason,
): Exclude<CanvasTone, "neutral"> {
  switch (reason) {
    case "fetch_failed":
    case "external_unavailable":
      return "warn";
    case "permission_denied":
      return "danger";
    case "filtered_empty":
    case "no_data":
    case "not_provisioned":
    default:
      return "info";
  }
}

function getEmptyStateCopy(
  reason: EmptyReason,
  locale: "en" | "zh",
): {
  icon: "warn" | "x" | "filter" | "billing";
  title: string;
  body: string;
} {
  switch (reason) {
    case "not_provisioned":
      return {
        icon: "billing",
        title: t("billing.empty.notProvisioned.title", locale),
        body: t("billing.empty.notProvisioned.body", locale),
      };
    case "fetch_failed":
      return {
        icon: "warn",
        title: t("billing.empty.fetchFailed.title", locale),
        body: t("billing.empty.fetchFailed.body", locale),
      };
    case "permission_denied":
      return {
        icon: "x",
        title: t("billing.empty.permissionDenied.title", locale),
        body: t("billing.empty.permissionDenied.body", locale),
      };
    case "external_unavailable":
      return {
        icon: "warn",
        title: t("billing.empty.externalUnavailable.title", locale),
        body: t("billing.empty.externalUnavailable.body", locale),
      };
    case "filtered_empty":
      return {
        icon: "filter",
        title: t("billing.empty.filteredEmpty.title", locale),
        body: t("billing.empty.filteredEmpty.body", locale),
      };
    case "no_data":
    default:
      return {
        icon: "billing",
        title: t("billing.empty.noData.title", locale),
        body: t("billing.empty.noData.body", locale),
      };
  }
}

function ActionCta({
  descriptor,
  href,
  icon,
  newTab,
  children,
}: {
  descriptor: ResourceActionDescriptor | null;
  href: string;
  icon?: "billing" | "chevR" | "filter" | "ext";
  newTab?: boolean;
  children: ReactNode;
}) {
  const enabled = descriptor?.enabled !== false;

  if (!enabled) {
    return (
      <CanvasBtn
        theme={th}
        icon={icon}
        size="sm"
        disabled
        // disabledReasonCode surfaces the backend reason as a tooltip (§3.5).
      >
        {children}
      </CanvasBtn>
    );
  }

  return (
    <a
      href={href}
      style={actionAnchorStyle}
      title={descriptor?.disabledReasonCode}
      {...(newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      <CanvasBtn theme={th} icon={icon} size="sm">
        {children}
      </CanvasBtn>
    </a>
  );
}

export default async function BillingPage({ searchParams }: BillingPageProps) {
  const locale = await getServerLocale();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const requestedEmptyReason = Array.isArray(resolvedSearchParams?.emptyReason)
    ? resolvedSearchParams?.emptyReason[0]
    : resolvedSearchParams?.emptyReason;
  const emptyReasonOverride = parseEmptyReason(requestedEmptyReason);

  const data = await loadBillingData(emptyReasonOverride, locale);

  const editProfileAction = findAction(
    data.availableActions,
    "edit_billing_profile",
  );
  const viewInvoicesAction = findAction(data.availableActions, "view_invoices");
  const refreshAction = findAction(data.availableActions, "refresh");

  const accruedAmount = buildAccruedAmount(data.quota);
  const tripCount = data.quota?.usage.confirmedBookingCount ?? 0;
  const averageTicket = buildAverageTicket(accruedAmount, tripCount);
  const projectedClose = buildProjectedClose(
    accruedAmount,
    data.quota?.periodKey,
  );
  const bookingLimit = data.quota?.limit.bookingCountLimit ?? null;
  const quotaShare =
    bookingLimit && bookingLimit > 0
      ? t("billing.quota.share", locale, {
          percent: Math.round((tripCount / bookingLimit) * 100),
          count: formatCanvasCount(bookingLimit),
        })
      : data.quota
        ? t("billing.quota.unset", locale)
        : "—";

  const recentInvoices: InvoiceRow[] = [...data.invoices]
    .sort((left, right) => right.periodEnd.localeCompare(left.periodEnd))
    .slice(0, 6)
    .map((invoice) => ({ ...invoice }));

  const emptyState = data.emptyReason
    ? getEmptyStateCopy(data.emptyReason, locale)
    : null;

  const profileItems = data.profile
    ? [
        {
          k: t("billing.profile.invoiceTitle", locale),
          v: data.profile.invoiceTitle,
        },
        { k: t("billing.profile.taxId", locale), v: data.profile.taxId ?? "—", mono: true },
        {
          k: t("billing.profile.contact", locale),
          v: data.profile.contactName
            ? `${data.profile.contactName} · ${data.profile.email}`
            : data.profile.email,
        },
        { k: t("billing.profile.address", locale), v: data.profile.address ?? "—" },
        {
          k: t("billing.profile.settlementMethod", locale),
          v: t("billing.profile.settlementMethodValue", locale),
          mono: true,
        },
        {
          k: t("billing.profile.updatedAt", locale),
          v: formatDateTime(data.profile.updatedAt),
          mono: true,
        },
      ]
    : [];

  const invoiceColumns: CanvasTableColumn<InvoiceRow>[] = [
    {
      h: t("billing.col.invoice", locale),
      w: 200,
      mono: true,
      r: (row) =>
        row.artifactUrl ? (
          // Signed artifact opens in a new tab (external deep link, §3.10).
          <a
            href={row.artifactUrl}
            style={invoiceLinkStyle}
            target="_blank"
            rel="noopener noreferrer"
          >
            {row.invoiceId}
          </a>
        ) : (
          <span style={invoiceLinkStyle}>{row.invoiceId}</span>
        ),
    },
    {
      h: t("billing.col.period", locale),
      w: 110,
      mono: true,
      r: (row) => toPeriodKey(row.periodStart),
    },
    {
      h: t("billing.col.amount", locale),
      w: 160,
      mono: true,
      align: "right",
      r: (row) => formatCanvasMoney(row.amount),
    },
    {
      h: t("billing.col.status", locale),
      w: 110,
      r: (row) => (
        <CanvasPill theme={th} tone={getInvoiceStatusTone(row.status)} dot>
          {getBillingStatusLabel(row.status, locale)}
        </CanvasPill>
      ),
    },
    {
      h: t("billing.col.due", locale),
      w: 130,
      mono: true,
      r: (row) => formatDateInput(row.periodEnd) || "—",
    },
  ];

  const statementRows = [...data.statements]
    .sort((left, right) => right.periodMonth.localeCompare(left.periodMonth))
    .slice(0, 6);

  const statementColumns: CanvasTableColumn<DriverStatementRecord>[] = [
    {
      h: t("billing.col.statement", locale),
      w: 180,
      mono: true,
      r: (row) => row.statementId,
    },
    {
      h: t("dashboard.col.driver", locale),
      w: 110,
      mono: true,
      r: (row) => row.driverId,
    },
    {
      h: t("dashboard.col.period", locale),
      w: 90,
      mono: true,
      r: (row) => row.periodMonth,
    },
    {
      h: t("billing.col.gross", locale),
      w: 120,
      mono: true,
      align: "right",
      r: (row) => formatCanvasMoney(row.grossEarning),
    },
    {
      h: t("billing.col.serviceFee", locale),
      w: 120,
      mono: true,
      align: "right",
      r: (row) => formatCanvasMoney(row.serviceFee),
    },
    {
      h: t("billing.col.subsidy", locale),
      w: 120,
      mono: true,
      align: "right",
      r: (row) => formatCanvasMoney(row.subsidy),
    },
    {
      h: t("billing.col.net", locale),
      w: 120,
      mono: true,
      align: "right",
      r: (row) => formatCanvasMoney(row.netAmount),
    },
    {
      h: t("billing.col.payoutStatus", locale),
      w: 110,
      r: (row) => (
        <CanvasPill
          theme={th}
          tone={row.payoutStatus === "paid" ? "success" : "info"}
          dot
        >
          {getPayoutStatusLabel(row.payoutStatus, locale)}
        </CanvasPill>
      ),
    },
  ];

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title={t("billing.title", locale)}
        subtitle={t("billing.subtitle", locale)}
        actions={
          <>
            <ActionCta
              descriptor={editProfileAction}
              href="/settings"
              icon="billing"
            >
              {t("billing.action.editProfile", locale)}
            </ActionCta>
            <ActionCta
              descriptor={viewInvoicesAction}
              href="/invoices"
              icon="chevR"
            >
              {t("billing.action.openInvoices", locale)}
            </ActionCta>
          </>
        }
      />

      <div style={pageBodyStyle}>
        {/* Refresh tier T5 (tenant slow, 30s) — freshness affordance per §3.2. */}
        <CanvasBanner
          theme={th}
          tone="info"
          icon="clock"
          title={t("billing.refresh.title", locale)}
          body={t("billing.refresh.body", locale, {
            seconds: REFRESH_CADENCE_MS / 1000,
            tier: data.refreshTier,
            generatedAt: formatDateTime(data.generatedAt),
          })}
          actions={
            <ActionCta descriptor={refreshAction} href="/billing" icon="chevR">
              {t("billing.action.refresh", locale)}
            </ActionCta>
          }
        />

        {data.errors.length > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title={t("billing.error.loadTitle", locale)}
            body={data.errors.join(" / ")}
          />
        ) : null}

        {emptyState ? (
          <CanvasBanner
            theme={th}
            tone={getEmptyStateTone(data.emptyReason as EmptyReason)}
            icon={emptyState.icon}
            title={emptyState.title}
            body={emptyState.body}
            actions={
              data.emptyReason === "not_provisioned" ? (
                <ActionCta
                  descriptor={editProfileAction}
                  href="/settings"
                  icon="billing"
                >
                  {t("billing.action.editProfile", locale)}
                </ActionCta>
              ) : undefined
            }
          />
        ) : null}

        <div style={kpiGridStyle}>
          <CanvasKPI
            theme={th}
            label={t("billing.kpi.accrued", locale)}
            value={formatCanvasMoney(accruedAmount)}
            sub={data.quota ? data.quota.periodKey : "—"}
          />
          <CanvasKPI
            theme={th}
            label={t("billing.kpi.projected", locale)}
            value={formatCanvasMoney(projectedClose)}
            sub={
              data.quota
                ? t("billing.kpi.projectedSub", locale, {
                    periodKey: data.quota.periodKey,
                  })
                : t("billing.kpi.projectedEmpty", locale)
            }
          />
          <CanvasKPI
            theme={th}
            label={t("billing.kpi.tripCount", locale)}
            value={data.quota ? formatCanvasCount(tripCount) : "—"}
            sub={quotaShare}
          />
          <CanvasKPI
            theme={th}
            label={t("billing.kpi.averageTicket", locale)}
            value={formatCanvasMoney(averageTicket)}
          />
        </div>

        <div style={splitGridStyle}>
          <CanvasCard theme={th} title={t("billing.section.profile", locale)}>
            {data.profile ? (
              <CanvasDL theme={th} cols={1} items={profileItems} />
            ) : (
              <div style={emptyStateStyle}>
                {t("billing.section.profileEmpty", locale)}
              </div>
            )}
          </CanvasCard>

          <CanvasCard
            theme={th}
            title={t("billing.section.invoices", locale)}
            padding={0}
            actions={
              <ActionCta
                descriptor={viewInvoicesAction}
                href="/invoices"
                icon="chevR"
              >
                {t("billing.action.openInvoices", locale)}
              </ActionCta>
            }
          >
            {recentInvoices.length > 0 ? (
              <CanvasTable<InvoiceRow>
                theme={th}
                rows={recentInvoices}
                columns={invoiceColumns}
                dense
              />
            ) : (
              <div style={emptyStateStyle}>{t("billing.empty.invoices", locale)}</div>
            )}
          </CanvasCard>
        </div>

        <CanvasCard
          theme={th}
          title={t("billing.section.statements", locale)}
          subtitle={t("billing.section.statementsSub", locale)}
          padding={0}
        >
          {statementRows.length > 0 ? (
            <CanvasTable<DriverStatementRecord>
              theme={th}
              rows={statementRows}
              columns={statementColumns}
              dense
            />
          ) : (
            <div style={emptyStateStyle}>{t("billing.empty.statements", locale)}</div>
          )}
        </CanvasCard>
      </div>
    </div>
  );
}
