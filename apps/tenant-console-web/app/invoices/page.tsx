import Link from "next/link";
import type { CSSProperties } from "react";
import type {
  BillingDocumentStatus,
  MoneyAmount,
  TenantInvoiceRecord,
} from "@drts/contracts";
import type {
  CrossAppResourceLink,
  EmptyReason,
  EmptyStateEnvelope,
  RefreshTier,
  ResourceActionDescriptor,
  UiRefreshMetadata,
} from "@drts/contracts/ui-runtime";
import {
  CanvasBanner,
  CanvasBtn,
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

export const dynamic = "force-dynamic";

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

const REFRESH_TIER: RefreshTier = "slow";
const REFRESH_INTERVAL_MS = 30_000;
const EMPTY_REASONS: EmptyReason[] = [
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
  "filtered_empty",
];
const STATUS_FILTERS = ["all", "draft", "issued", "paid", "overdue"] as const;

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const kpiGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12,
};

const controlCardStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
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
  fontWeight: 600,
  letterSpacing: 0.3,
  textTransform: "uppercase",
  color: th.textMuted,
};

const fieldControlStyle: CSSProperties = {
  width: "100%",
  height: 34,
  borderRadius: 8,
  border: `1px solid ${th.border}`,
  background: th.surfaceLo,
  color: th.text,
  fontSize: 12.5,
  padding: "0 10px",
  fontFamily: th.fontFamily,
};

const splitLayoutStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.7fr) minmax(320px, 0.95fr)",
  gap: 16,
  alignItems: "start",
};

const leftRailStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 16,
  minWidth: 0,
};

const rightRailStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 16,
  minWidth: 0,
};

const invoicePrimaryStyle: CSSProperties = {
  color: th.accent,
  fontWeight: 600,
  fontFamily: th.monoFamily,
};

const invoiceMetaStyle: CSSProperties = {
  marginTop: 4,
  color: th.textMuted,
  fontSize: 11.5,
};

const detailBlockStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const detailTitleStyle: CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  color: th.text,
  lineHeight: 1.15,
};

const detailMetaRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
};

const linkListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const inlineLinkStyle: CSSProperties = {
  color: th.accent,
  textDecoration: "none",
  fontSize: 12.5,
  lineHeight: 1.4,
};

const actionListStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const actionChipStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 10px",
  borderRadius: 8,
  border: `1px solid ${th.border}`,
  background: th.surfaceLo,
  color: th.text,
  fontSize: 12,
};

const emptyPanelStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 10,
  alignItems: "flex-start",
};

const emptyTitleStyle: CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  color: th.text,
  lineHeight: 1.15,
};

const emptyBodyStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 12.5,
  lineHeight: 1.6,
  maxWidth: 520,
};

const tableCardStyle: CSSProperties = {
  minWidth: 0,
};

const helperTextStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 11.5,
  lineHeight: 1.45,
};

type StatusFilter = (typeof STATUS_FILTERS)[number];

type InvoiceActionView = ResourceActionDescriptor & {
  label: string;
  href?: string;
};

type InvoiceViewRecord = TenantInvoiceRecord & {
  statusView: BillingDocumentStatus | "overdue";
  dueDate: string | null;
  expiresAt: string | null;
  availableActions: InvoiceActionView[];
  deepLinks: CrossAppResourceLink[];
};

type InvoicesData = {
  invoices: InvoiceViewRecord[];
  errors: string[];
  refresh: UiRefreshMetadata;
};

type InvoiceRow = InvoiceViewRecord & Record<string, unknown>;

type InvoiceFilters = {
  query: string;
  period: string;
  status: StatusFilter;
  invoiceId: string;
  emptyReason: EmptyReason | null;
};

function toErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Unknown tenant invoice error.";
}

function toPeriodKey(value: string | null | undefined) {
  return value ? value.slice(0, 7) : "unmapped";
}

function formatCanvasMoney(value: MoneyAmount | null | undefined) {
  if (!value) return "—";

  const amount = value.amountMinor / 100;
  const currencyLabel = value.currency === "TWD" ? "NT$" : value.currency;
  return `${currencyLabel} ${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(amount)}`;
}

function formatCanvasCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
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
  if (
    invoice.status === "issued" &&
    isIsoPast(addDays(invoice.periodEnd, 14))
  ) {
    return "overdue" as const;
  }
  return invoice.status;
}

function buildInvoiceActions(
  invoice: TenantInvoiceRecord,
): InvoiceActionView[] {
  const actions: InvoiceActionView[] = [
    {
      action: "view_detail",
      enabled: true,
      riskLevel: "low",
      label: "View detail",
      href: `/invoices?invoiceId=${encodeURIComponent(invoice.invoiceId)}`,
    },
  ];

  actions.push({
    action: "download_artifact",
    enabled: Boolean(invoice.artifactUrl),
    disabledReasonCode: invoice.artifactUrl ? undefined : "artifact_missing",
    riskLevel: "low",
    label: "Download signed artifact",
    href: invoice.artifactUrl ?? undefined,
  });

  return actions;
}

function buildInvoiceDeepLinks(
  invoice: TenantInvoiceRecord,
): CrossAppResourceLink[] {
  return [
    {
      targetApp: "tenant-console",
      route: `/billing?invoiceId=${encodeURIComponent(invoice.invoiceId)}`,
      resourceType: "invoice",
      resourceId: invoice.invoiceId,
      openMode: "same_tab",
      label: "Back to billing overview",
    },
    {
      targetApp: "tenant-console",
      route: `/audit?resourceType=tenant_invoice&resourceId=${encodeURIComponent(invoice.invoiceId)}`,
      resourceType: "audit_event",
      resourceId: invoice.invoiceId,
      openMode: "same_tab",
      label: "View audit trail",
    },
  ];
}

function normalizeInvoice(invoice: TenantInvoiceRecord): InvoiceViewRecord {
  const expiresAt = parseArtifactExpiry(invoice.artifactUrl);

  return {
    ...invoice,
    statusView: deriveInvoiceStatus(invoice),
    dueDate: invoice.status === "paid" ? null : addDays(invoice.periodEnd, 14),
    expiresAt,
    availableActions: buildInvoiceActions(invoice),
    deepLinks: buildInvoiceDeepLinks(invoice),
  };
}

async function loadInvoicesData(): Promise<InvoicesData> {
  const client = getTenantClient();
  const generatedAt = new Date().toISOString();

  try {
    const invoices = (
      (await client.listInvoices()) as TenantInvoiceRecord[]
    ).map(normalizeInvoice);

    return {
      invoices,
      errors: [],
      refresh: {
        generatedAt,
        staleAfterMs: REFRESH_INTERVAL_MS,
        dataFreshness: "fresh",
        source: "live",
      },
    };
  } catch (error) {
    return {
      invoices: [],
      errors: [toErrorMessage(error)],
      refresh: {
        generatedAt,
        staleAfterMs: REFRESH_INTERVAL_MS,
        dataFreshness: "degraded",
        source: "live",
      },
    };
  }
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

function buildAverageTicketAmount(invoices: InvoiceViewRecord[]) {
  const totalTrips = invoices.reduce(
    (count, invoice) => count + invoice.lines.length,
    0,
  );
  if (totalTrips === 0) return null;

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
      };
    case "external_unavailable":
      return {
        reason,
        messageCode: "tenant_invoice_artifact_signer_unavailable",
        nextAction: {
          action: "open_audit",
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
        title: "Billing profile not provisioned",
        body: "Invoice history cannot populate until tenant billing setup is complete. Finance should confirm invoice title, tax profile, and monthly close posture on /billing.",
        tone: "warn" as const,
        ctaLabel: "Open /billing",
        ctaHref: "/billing",
      };
    case "fetch_failed":
      return {
        title: "Invoice snapshot failed to load",
        body: "The page has no trustworthy invoice list right now. Retry the tenant read model before asking finance users to act on a blank screen.",
        tone: "danger" as const,
        ctaLabel: "Retry this route",
        ctaHref: "/invoices",
      };
    case "permission_denied":
      return {
        title: "Role lacks invoice visibility",
        body: "This state is distinct from empty data. The user reached /invoices but the backend denied invoice visibility for the current tenant role.",
        tone: "neutral" as const,
        ctaLabel: "Review access on /users",
        ctaHref: "/users",
      };
    case "external_unavailable":
      return {
        title: "Artifact signer unavailable",
        body: "Invoice rows may exist, but signed download artifacts cannot be issued right now. Keep the register visible and direct follow-up through audit/billing instead of hiding the route.",
        tone: "warn" as const,
        ctaLabel: "Open audit trail",
        ctaHref: "/audit?module=billing-settlement",
      };
    case "filtered_empty":
      return {
        title: "No invoices match these filters",
        body: "Status, period, or invoice id filters narrowed the result set to zero. Preserve the filter context and offer a clear path back to the full register.",
        tone: "info" as const,
        ctaLabel: "Clear filters",
        ctaHref: "/invoices",
      };
    case "no_data":
    default:
      return {
        title: "No invoices in this tenant scope",
        body: "The route is healthy, but monthly close has not produced any invoice records yet. Keep billing and audit links available for context.",
        tone: "info" as const,
        ctaLabel: "Open billing overview",
        ctaHref: "/billing",
      };
  }
}

function describeAction(action: InvoiceActionView) {
  if (action.enabled) {
    return action.label;
  }
  if (action.disabledReasonCode === "artifact_missing") {
    return `${action.label} unavailable: no signed artifact`;
  }
  return `${action.label} unavailable`;
}

function formatActionLabel(action: ResourceActionDescriptor) {
  switch (action.action) {
    case "open_billing_setup":
      return "Open billing setup";
    case "refresh_snapshot":
      return "Retry snapshot";
    case "open_audit":
      return "Open audit";
    case "open_billing":
      return "Open billing";
    default:
      return action.action;
  }
}

function formatStatusLabel(status: InvoiceViewRecord["statusView"]) {
  return status === "overdue" ? "overdue" : status;
}

function getArtifactAction(
  invoice: InvoiceViewRecord | null,
  actionName: string,
): InvoiceActionView | null {
  return (
    invoice?.availableActions.find((action) => action.action === actionName) ??
    null
  );
}

function renderActionLink(action: InvoiceActionView) {
  if (action.enabled && action.href) {
    return (
      <Link
        key={action.action}
        href={action.href}
        style={{
          ...actionChipStyle,
          color: th.accent,
          textDecoration: "none",
        }}
      >
        {describeAction(action)}
      </Link>
    );
  }

  return (
    <span key={action.action} style={{ ...actionChipStyle, opacity: 0.7 }}>
      {describeAction(action)}
    </span>
  );
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
    new Set(allInvoices.map((invoice) => toPeriodKey(invoice.periodStart))),
  );

  const filteredInvoices = allInvoices.filter((invoice) => {
    if (
      filters.status !== "all" &&
      formatStatusLabel(invoice.statusView) !== filters.status
    ) {
      return false;
    }

    if (filters.period && filters.period !== toPeriodKey(invoice.periodStart)) {
      return false;
    }

    if (filters.query) {
      const query = filters.query.toLowerCase();
      const matchesId = invoice.invoiceId.toLowerCase().includes(query);
      const matchesLine = invoice.lines.some((line) =>
        line.orderId.toLowerCase().includes(query),
      );
      if (!matchesId && !matchesLine) {
        return false;
      }
    }

    return true;
  });

  const selectedInvoice =
    filteredInvoices.find(
      (invoice) => invoice.invoiceId === filters.invoiceId,
    ) ??
    filteredInvoices[0] ??
    allInvoices.find((invoice) => invoice.invoiceId === filters.invoiceId) ??
    allInvoices[0] ??
    null;
  const selectedDownloadAction = getArtifactAction(
    selectedInvoice,
    "download_artifact",
  );

  const rows: InvoiceRow[] = filteredInvoices.map((invoice) => ({
    ...invoice,
  }));
  const latestInvoice = allInvoices[0] ?? null;
  const overdueCount = allInvoices.filter(
    (invoice) => invoice.statusView === "overdue",
  ).length;
  const artifactMissingCount = allInvoices.filter(
    (invoice) => !invoice.artifactUrl,
  ).length;
  const averageTicketAmount = buildAverageTicketAmount(filteredInvoices);
  const totalTrips = filteredInvoices.reduce(
    (count, invoice) => count + invoice.lines.length,
    0,
  );

  const computedEmptyReason =
    filters.emptyReason ??
    (data.errors.length > 0 && allInvoices.length === 0
      ? "fetch_failed"
      : filteredInvoices.length === 0
        ? filters.query || filters.period || filters.status !== "all"
          ? "filtered_empty"
          : "no_data"
        : null);

  const emptyState = computedEmptyReason
    ? buildEmptyState(computedEmptyReason, filters)
    : null;
  const emptyDescription = computedEmptyReason
    ? describeEmptyState(computedEmptyReason)
    : null;

  const columns: CanvasTableColumn<InvoiceRow>[] = [
    {
      h: "INVOICE",
      w: 220,
      mono: true,
      r: (row) => (
        <div>
          <div style={invoicePrimaryStyle}>{row.invoiceId}</div>
          <div style={invoiceMetaStyle}>{row.lines.length} lines</div>
        </div>
      ),
    },
    {
      h: "STATUS",
      w: 120,
      r: (row) => (
        <CanvasPill theme={th} tone={getStatusTone(row.statusView)} dot>
          {formatStatusLabel(row.statusView)}
        </CanvasPill>
      ),
    },
    {
      h: "PERIOD",
      w: 120,
      mono: true,
      r: (row) =>
        `${toPeriodKey(row.periodStart)} -> ${toPeriodKey(row.periodEnd)}`,
    },
    {
      h: "AMOUNT",
      w: 150,
      mono: true,
      align: "right",
      r: (row) => formatCanvasMoney(row.amount),
    },
    {
      h: "ISSUED",
      w: 110,
      mono: true,
      r: (row) => formatDateInput(row.createdAt) || "—",
    },
    {
      h: "DUE",
      w: 110,
      mono: true,
      r: (row) => formatDateInput(row.dueDate) || "—",
    },
    {
      h: "ARTIFACT",
      w: 220,
      mono: true,
      r: (row) =>
        row.artifactUrl ? (
          <Link href={row.artifactUrl} style={inlineLinkStyle}>
            signed url
          </Link>
        ) : (
          "unavailable"
        ),
    },
    {
      h: "EXPIRES",
      w: 120,
      mono: true,
      r: (row) => formatDateInput(row.expiresAt) || "—",
    },
    {
      h: "ACTIONS",
      w: 260,
      r: (row) => (
        <div style={actionListStyle}>
          {row.availableActions.map((action) => renderActionLink(action))}
        </div>
      ),
    },
  ];

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="Invoices"
        subtitle="T5 invoices register · status/period/id filters · availableActions-driven download/detail · cross-app audit links"
        actions={
          <>
            <CanvasBtn theme={th} size="sm" icon="filter" disabled>
              Refresh tier {REFRESH_TIER}
            </CanvasBtn>
            {selectedDownloadAction?.enabled && selectedDownloadAction.href ? (
              <Link
                href={selectedDownloadAction.href}
                style={{
                  ...actionChipStyle,
                  minHeight: 32,
                  color: th.accent,
                  textDecoration: "none",
                }}
              >
                {selectedDownloadAction.label}
              </Link>
            ) : (
              <CanvasBtn theme={th} size="sm" icon="export" disabled>
                Signed artifact
              </CanvasBtn>
            )}
          </>
        }
      />

      <div style={pageBodyStyle}>
        {data.errors.length > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title="Invoice read model degraded"
            body={data.errors.join(" / ")}
          />
        ) : null}

        <CanvasCard
          theme={th}
          title="Snapshot controls"
          subtitle={`generated ${formatDateInput(data.refresh.generatedAt)} · stale after ${Math.round(
            data.refresh.staleAfterMs / 1000,
          )}s`}
          actions={
            <CanvasPill theme={th} tone={getRefreshTone(data.refresh)}>
              {data.refresh.dataFreshness}
            </CanvasPill>
          }
        >
          <form action="/invoices" method="get" style={controlCardStyle}>
            <input type="hidden" name="invoiceId" value={filters.invoiceId} />
            <div style={fieldStackStyle}>
              <label htmlFor="invoice-query" style={fieldLabelStyle}>
                Search by invoice id
              </label>
              <input
                id="invoice-query"
                name="q"
                defaultValue={filters.query}
                placeholder="invoice-..."
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

            <div style={fieldStackStyle}>
              <label htmlFor="invoice-empty-reason" style={fieldLabelStyle}>
                Empty reason preview
              </label>
              <select
                id="invoice-empty-reason"
                name="emptyReason"
                defaultValue={filters.emptyReason ?? ""}
                style={fieldControlStyle}
              >
                <option value="">live data</option>
                {EMPTY_REASONS.map((reason) => (
                  <option key={reason} value={reason}>
                    {reason}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "end" }}>
              <button
                type="submit"
                style={{
                  ...fieldControlStyle,
                  width: "auto",
                  minWidth: 110,
                  background: th.accent,
                  color: "#fff",
                  borderColor: th.accent,
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Apply filters
              </button>
              <Link href="/invoices" style={inlineLinkStyle}>
                Reset
              </Link>
            </div>
          </form>
        </CanvasCard>

        <div style={kpiGridStyle}>
          <CanvasKPI
            theme={th}
            label={
              latestInvoice
                ? `Latest ${toPeriodKey(latestInvoice.periodStart)}`
                : "Latest invoice"
            }
            value={
              latestInvoice ? formatCanvasMoney(latestInvoice.amount) : "—"
            }
            delta={
              latestInvoice
                ? formatStatusLabel(latestInvoice.statusView)
                : "empty"
            }
            deltaTone={
              latestInvoice?.statusView === "overdue" ? "down" : "neutral"
            }
          />
          <CanvasKPI
            theme={th}
            label="Visible invoices"
            value={formatCanvasCount(filteredInvoices.length)}
          />
          <CanvasKPI
            theme={th}
            label="Trips in scope"
            value={formatCanvasCount(totalTrips)}
          />
          <CanvasKPI
            theme={th}
            label="Avg ticket"
            value={formatCanvasMoney(averageTicketAmount)}
          />
          <CanvasKPI
            theme={th}
            label="Overdue"
            value={formatCanvasCount(overdueCount)}
          />
          <CanvasKPI
            theme={th}
            label="Artifact unavailable"
            value={formatCanvasCount(artifactMissingCount)}
          />
        </div>

        <div style={splitLayoutStyle}>
          <div style={leftRailStyle}>
            <CanvasCard
              theme={th}
              title="Invoice register"
              subtitle={`${filteredInvoices.length} visible / ${allInvoices.length} total`}
              style={tableCardStyle}
              padding={0}
            >
              {emptyState && emptyDescription ? (
                <div style={emptyPanelStyle}>
                  <CanvasPill theme={th} tone={emptyDescription.tone}>
                    {emptyState.reason}
                  </CanvasPill>
                  <div style={emptyTitleStyle}>{emptyDescription.title}</div>
                  <div style={emptyBodyStyle}>{emptyDescription.body}</div>
                  <div style={helperTextStyle}>
                    messageCode: {emptyState.messageCode}
                    {emptyState.nextAction
                      ? ` · nextAction: ${formatActionLabel(emptyState.nextAction)}`
                      : ""}
                  </div>
                  <Link href={emptyDescription.ctaHref} style={inlineLinkStyle}>
                    {emptyDescription.ctaLabel}
                  </Link>
                </div>
              ) : (
                <CanvasTable<InvoiceRow>
                  theme={th}
                  rows={rows}
                  columns={columns}
                />
              )}
            </CanvasCard>
          </div>

          <div style={rightRailStyle}>
            <CanvasCard
              theme={th}
              title="Invoice detail"
              subtitle={
                selectedInvoice
                  ? `entry from /billing or sidebar · exit via artifact download`
                  : "Select an invoice from the register"
              }
            >
              {selectedInvoice ? (
                <div style={detailBlockStyle}>
                  <div>
                    <div style={detailTitleStyle}>
                      {selectedInvoice.invoiceId}
                    </div>
                    <div style={detailMetaRowStyle}>
                      <CanvasPill
                        theme={th}
                        tone={getStatusTone(selectedInvoice.statusView)}
                        dot
                      >
                        {formatStatusLabel(selectedInvoice.statusView)}
                      </CanvasPill>
                      <span style={helperTextStyle}>
                        {formatCanvasMoney(selectedInvoice.amount)} · issued{" "}
                        {formatDateInput(selectedInvoice.createdAt) || "—"}
                      </span>
                    </div>
                  </div>

                  {selectedInvoice.statusView === "overdue" ? (
                    <CanvasBanner
                      theme={th}
                      tone="warn"
                      icon="warn"
                      title="Overdue invoice"
                      body="The current FE contract does not expose a backend overdue code, so this urgency state is derived from issued invoices whose close period is 14+ days old."
                    />
                  ) : null}

                  {!selectedInvoice.artifactUrl ? (
                    <CanvasBanner
                      theme={th}
                      tone="warn"
                      icon="warn"
                      title="Artifact unavailable"
                      body="No signed artifact URL is present in the current invoice payload."
                    />
                  ) : null}

                  {selectedInvoice.expiresAt &&
                  isIsoPast(selectedInvoice.expiresAt) ? (
                    <CanvasBanner
                      theme={th}
                      tone="danger"
                      icon="warn"
                      title="Artifact expired"
                      body="The signed artifact URL is present, but its controlled-download expiry has already passed."
                    />
                  ) : null}

                  <dl
                    style={{
                      margin: 0,
                      display: "grid",
                      gridTemplateColumns: "120px 1fr",
                      gap: "8px 12px",
                      fontSize: 12.5,
                    }}
                  >
                    <dt style={fieldLabelStyle}>Billing period</dt>
                    <dd style={{ margin: 0 }}>
                      {`${formatDateInput(selectedInvoice.periodStart) || "—"} -> ${
                        formatDateInput(selectedInvoice.periodEnd) || "—"
                      }`}
                    </dd>
                    <dt style={fieldLabelStyle}>Due date</dt>
                    <dd style={{ margin: 0 }}>
                      {formatDateInput(selectedInvoice.dueDate) || "—"}
                    </dd>
                    <dt style={fieldLabelStyle}>Artifact expires</dt>
                    <dd style={{ margin: 0 }}>
                      {formatDateInput(selectedInvoice.expiresAt) || "—"}
                    </dd>
                    <dt style={fieldLabelStyle}>Artifact URL</dt>
                    <dd style={{ margin: 0, overflowWrap: "anywhere" }}>
                      {selectedInvoice.artifactUrl ? (
                        <Link
                          href={selectedInvoice.artifactUrl}
                          style={inlineLinkStyle}
                        >
                          {selectedInvoice.artifactUrl}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </dd>
                    <dt style={fieldLabelStyle}>Pricing snapshot</dt>
                    <dd style={{ margin: 0, fontFamily: th.monoFamily }}>
                      {selectedInvoice.pricingVersionSnapshot}
                    </dd>
                  </dl>

                  <div>
                    <div style={fieldLabelStyle}>Available actions</div>
                    <div style={actionListStyle}>
                      {selectedInvoice.availableActions.map((action) =>
                        renderActionLink(action),
                      )}
                    </div>
                  </div>

                  <div>
                    <div style={fieldLabelStyle}>Deep links</div>
                    <div style={linkListStyle}>
                      {selectedInvoice.deepLinks.map((link) => (
                        <Link
                          key={link.label}
                          href={link.route}
                          style={inlineLinkStyle}
                        >
                          {link.label}
                        </Link>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div style={fieldLabelStyle}>Line items</div>
                    <div style={helperTextStyle}>
                      {selectedInvoice.lines.length} lines · detail route not
                      yet split into a dedicated drawer/new page in this repo
                      surface.
                    </div>
                  </div>
                </div>
              ) : (
                <div style={helperTextStyle}>
                  No invoice selected. Use the register filters or pick a
                  specific `invoiceId`.
                </div>
              )}
            </CanvasCard>
          </div>
        </div>
      </div>
    </div>
  );
}
