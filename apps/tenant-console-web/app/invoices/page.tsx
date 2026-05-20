import type { CSSProperties } from "react";
import type { MoneyAmount, TenantInvoiceRecord } from "@drts/contracts";
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

const invoicePrimaryStyle: CSSProperties = {
  color: th.accent,
  fontWeight: 600,
  fontFamily: th.monoFamily,
};

const emptyStateStyle: CSSProperties = {
  padding: 24,
  color: th.textMuted,
  fontSize: 12.5,
  textAlign: "center",
};

type InvoicesData = {
  invoices: TenantInvoiceRecord[];
  errors: string[];
};

type InvoiceRow = TenantInvoiceRecord & Record<string, unknown>;

async function loadInvoicesData(): Promise<InvoicesData> {
  const client = getTenantClient();

  try {
    return {
      invoices: (await client.listInvoices()) as TenantInvoiceRecord[],
      errors: [],
    };
  } catch (error) {
    return {
      invoices: [],
      errors: [
        error instanceof Error
          ? error.message
          : "Unknown tenant invoice error.",
      ],
    };
  }
}

function toPeriodKey(value: string | null | undefined) {
  return value ? value.slice(0, 7) : "—";
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

function getStatusTone(status: TenantInvoiceRecord["status"]): CanvasTone {
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

function getStatusDeltaTone(status: TenantInvoiceRecord["status"]) {
  switch (status) {
    case "paid":
      return "up" as const;
    case "issued":
      return "neutral" as const;
    case "draft":
    default:
      return "down" as const;
  }
}

function buildAverageTicketAmount(invoices: TenantInvoiceRecord[]) {
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

  const allInvoices = [...data.invoices].sort((left, right) =>
    right.periodEnd.localeCompare(left.periodEnd),
  );
  const periodOptions = Array.from(
    new Set(allInvoices.map((invoice) => toPeriodKey(invoice.periodStart))),
  );
  const selectedPeriod =
    requestedPeriod && periodOptions.includes(requestedPeriod)
      ? requestedPeriod
      : null;
  const visibleInvoices = selectedPeriod
    ? allInvoices.filter(
        (invoice) => toPeriodKey(invoice.periodStart) === selectedPeriod,
      )
    : allInvoices;
  const latestInvoice = visibleInvoices[0] ?? allInvoices[0] ?? null;
  const metricInvoices =
    selectedPeriod || !latestInvoice ? visibleInvoices : [latestInvoice];
  const totalTrips = metricInvoices.reduce(
    (count, invoice) => count + invoice.lines.length,
    0,
  );
  const averageTicketAmount = buildAverageTicketAmount(metricInvoices);
  const rows: InvoiceRow[] = visibleInvoices.map((invoice) => ({ ...invoice }));

  const columns: CanvasTableColumn<InvoiceRow>[] = [
    {
      h: "INVOICE",
      w: 200,
      mono: true,
      r: (row) => <span style={invoicePrimaryStyle}>{row.invoiceId}</span>,
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
      w: 110,
      mono: true,
      r: () => "—",
    },
    {
      h: "ISSUED",
      w: 110,
      mono: true,
      r: (row) => formatDateInput(row.createdAt) || "—",
    },
  ];

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="對帳單"
        subtitle="月結 · invoice line · 證明文件 · 短效下載"
        actions={
          <>
            <CanvasBtn
              theme={th}
              icon="filter"
              size="sm"
              disabled={periodOptions.length === 0}
            >
              期別
            </CanvasBtn>
            <CanvasBtn
              theme={th}
              icon="export"
              size="sm"
              disabled={!latestInvoice?.artifactUrl}
            >
              下載當期
            </CanvasBtn>
          </>
        }
      />

      <div style={pageBodyStyle}>
        {data.errors.length > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title="對帳單暫時無法完整載入"
            body={data.errors.join(" / ")}
          />
        ) : null}

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
          <CanvasKPI theme={th} label="爭議筆數" value="—" />
        </div>

        <CanvasCard theme={th} padding={0}>
          {rows.length > 0 ? (
            <CanvasTable<InvoiceRow> theme={th} rows={rows} columns={columns} />
          ) : (
            <div style={emptyStateStyle}>
              {selectedPeriod
                ? `目前沒有 ${selectedPeriod} 的對帳單。`
                : "目前沒有可顯示的對帳單。"}
            </div>
          )}
        </CanvasCard>
      </div>
    </div>
  );
}
