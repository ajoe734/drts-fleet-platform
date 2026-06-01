import type { CSSProperties } from "react";
import type {
  BillingDocumentStatus,
  CrossAppResourceLink,
  EmptyReason,
  RefreshTier,
  ResourceActionDescriptor,
  TenantInvoiceRecord,
} from "@drts/contracts";
import {
  CanvasCard,
  CanvasIcon,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  type CanvasTableColumn,
  type CanvasTone,
  buildCanvasTheme,
} from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";
import { formatDateInput, formatMoney } from "@/lib/formatters";
import {
  crossAppHref,
  platformAdminInvoiceReconciliationLink,
} from "@/lib/tenant-cross-app-links";
import { InvoicesRefreshNote } from "./invoices-refresh-note";

export const dynamic = "force-dynamic";

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

// Packet §3.2 — /invoices is the T5 Tenant slow tier (30s) per Q-X02.
const INVOICES_REFRESH_TIER: RefreshTier = "slow";
const INVOICES_STALE_AFTER_MS = 30_000;

// Packet §3.6 — the six tenant-relevant EmptyReason states (the seventh,
// `driver_not_eligible`, is driver-app-only and not reachable here).
const TENANT_EMPTY_REASONS: readonly EmptyReason[] = [
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
  "filtered_empty",
] as const;

// Contract enum is draft / issued / paid (no client-inferred `overdue` —
// Q-TEN05: status is decided by the backend, not derived in the UI).
const STATUS_LABEL: Record<BillingDocumentStatus, string> = {
  draft: "草稿",
  issued: "已開立",
  paid: "已付款",
};

const STATUS_FILTERS: readonly BillingDocumentStatus[] = [
  "draft",
  "issued",
  "paid",
];

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const linkRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 8,
  fontSize: 11.5,
  color: th.textMuted,
};

const deepLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "4px 9px",
  borderRadius: 6,
  border: `1px solid ${th.border}`,
  background: th.surface,
  color: th.text,
  fontSize: 11.5,
  fontWeight: 500,
  textDecoration: "none",
};

const filterRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 8,
};

const filterGroupLabelStyle: CSSProperties = {
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: 0.4,
  textTransform: "uppercase",
  color: th.textMuted,
};

const searchInputStyle: CSSProperties = {
  height: 28,
  minWidth: 200,
  padding: "0 10px",
  borderRadius: 7,
  border: `1px solid ${th.border}`,
  background: th.surface,
  color: th.text,
  fontSize: 12,
  fontFamily: th.fontFamily,
};

const searchButtonStyle: CSSProperties = {
  height: 28,
  padding: "0 12px",
  borderRadius: 7,
  border: `1px solid ${th.accent}`,
  background: th.accent,
  color: "#fff",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: th.fontFamily,
};

const invoicePrimaryStyle: CSSProperties = {
  color: th.accent,
  fontWeight: 600,
  fontFamily: th.monoFamily,
};

const mutedCellStyle: CSSProperties = {
  color: th.textMuted,
};

const actionLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "4px 8px",
  height: 24,
  fontSize: 11.5,
  fontWeight: 500,
  background: th.surface,
  color: th.text,
  border: `1px solid ${th.border}`,
  borderRadius: 7,
  textDecoration: "none",
  lineHeight: 1,
  fontFamily: th.fontFamily,
};

const actionDisabledStyle: CSSProperties = {
  ...actionLinkStyle,
  background: th.surfaceLo,
  color: th.textMuted,
  opacity: 0.55,
  cursor: "not-allowed",
};

const emptyStateStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 8,
  padding: "40px 24px",
  textAlign: "center",
};

const emptyTitleStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: th.text,
};

const emptyBodyStyle: CSSProperties = {
  fontSize: 12.5,
  color: th.textMuted,
  maxWidth: 520,
  lineHeight: 1.5,
};

const DISABLED_REASON_LABEL: Record<string, string> = {
  still_draft: "草稿尚未開立，無法下載",
  artifact_unavailable: "簽章檔案無法取得",
  already_paid: "已付款，無法提出爭議",
};

type InvoiceRow = TenantInvoiceRecord & Record<string, unknown>;

type InvoicesPageData = {
  invoices: TenantInvoiceRecord[];
  errors: string[];
  generatedAt: string;
};

async function loadInvoicesData(): Promise<InvoicesPageData> {
  const client = getTenantClient();
  // Snapshot time is stamped at fetch time: the invoice list endpoint does not
  // yet carry a UiRefreshMetadata envelope, so we do not fabricate one — we
  // only record when this snapshot was read so the refresh affordance is real.
  const generatedAt = new Date().toISOString();

  try {
    return {
      invoices: (await client.listInvoices()) as TenantInvoiceRecord[],
      errors: [],
      generatedAt,
    };
  } catch (error) {
    return {
      invoices: [],
      errors: [
        error instanceof Error
          ? error.message
          : "Unknown tenant invoice error.",
      ],
      generatedAt,
    };
  }
}

function toPeriodKey(value: string | null | undefined) {
  return value ? value.slice(0, 7) : "—";
}

function getStatusTone(status: BillingDocumentStatus): CanvasTone {
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

// availableActions per Q-X13: descriptors derived from the actual record, not
// from role guesses. Download is gated on the signed artifact being present;
// dispute is gated on the invoice still being open.
function buildDownloadDescriptor(
  invoice: TenantInvoiceRecord,
): ResourceActionDescriptor {
  const enabled = invoice.artifactUrl !== null;
  return {
    action: "download_artifact",
    enabled,
    riskLevel: "low",
    ...(enabled
      ? {}
      : {
          disabledReasonCode:
            invoice.status === "draft" ? "still_draft" : "artifact_unavailable",
        }),
  };
}

function buildDisputeDescriptor(
  invoice: TenantInvoiceRecord,
): ResourceActionDescriptor {
  const enabled = invoice.status !== "paid";
  return {
    action: "dispute_invoice",
    enabled,
    riskLevel: "medium",
    requiresReason: true,
    ...(enabled ? {} : { disabledReasonCode: "already_paid" }),
  };
}

function parseEmptyReason(value: string | undefined): EmptyReason | null {
  if (!value) {
    return null;
  }
  return TENANT_EMPTY_REASONS.includes(value as EmptyReason)
    ? (value as EmptyReason)
    : null;
}

function inferEmptyReason(data: {
  invoices: TenantInvoiceRecord[];
  errors: string[];
}): EmptyReason | null {
  if (data.errors.length > 0 && data.invoices.length === 0) {
    return "fetch_failed";
  }
  if (data.invoices.length === 0) {
    return "no_data";
  }
  return null;
}

function getEmptyStateTone(reason: EmptyReason): CanvasTone {
  switch (reason) {
    case "not_provisioned":
      return "accent";
    case "fetch_failed":
    case "external_unavailable":
      return "warn";
    case "permission_denied":
      return "danger";
    case "filtered_empty":
      return "info";
    case "no_data":
    default:
      return "neutral";
  }
}

function getEmptyStateCopy(reason: EmptyReason): {
  title: string;
  description: string;
  action?: { href: string; label: string };
} {
  switch (reason) {
    case "not_provisioned":
      return {
        title: "帳務尚未啟用",
        description:
          "此租戶的計費設定尚未完成，因此沒有對帳單來源。請先於帳務概覽完成 billing profile。",
        action: { href: "/billing", label: "前往帳務概覽" },
      };
    case "fetch_failed":
      return {
        title: "對帳單載入失敗",
        description:
          "路由可正常開啟，但對帳單列表讀取失敗。請稍後於 T5 週期重試。",
        action: { href: "/invoices", label: "重試" },
      };
    case "permission_denied":
      return {
        title: "沒有檢視對帳單的權限",
        description:
          "此頁面可見，但目前帳號沒有讀取租戶對帳單的權限（需 tc_finance 或 tc_admin 角色）。",
      };
    case "external_unavailable":
      return {
        title: "計費服務暫時無法使用",
        description:
          "上游計費 / 簽章服務暫時中斷或回傳過期資料，對帳單暫時無法完整載入。",
      };
    case "filtered_empty":
      return {
        title: "沒有符合條件的對帳單",
        description:
          "此租戶有對帳單，但目前的篩選（狀態 / 期別 / 搜尋）沒有結果。",
        action: { href: "/invoices", label: "清除篩選" },
      };
    case "no_data":
    default:
      return {
        title: "尚無對帳單",
        description:
          "此租戶目前沒有任何已產生的對帳單；月結作業完成後會在此顯示。",
      };
  }
}

function buildInvoicesHref(params: {
  period?: string | null;
  status?: string | null;
  q?: string | null;
}) {
  const search = new URLSearchParams();
  if (params.period) {
    search.set("period", params.period);
  }
  if (params.status) {
    search.set("status", params.status);
  }
  if (params.q) {
    search.set("q", params.q);
  }
  const query = search.toString();
  return query ? `/invoices?${query}` : "/invoices";
}

function FilterChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <a href={href} style={{ textDecoration: "none" }}>
      <CanvasPill theme={th} tone={active ? "accent" : "neutral"} dot={active}>
        {children}
      </CanvasPill>
    </a>
  );
}

function readParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const data = await loadInvoicesData();
  const resolvedSearchParams = await searchParams;

  const requestedPeriod = readParam(resolvedSearchParams.period);
  const requestedStatus = readParam(resolvedSearchParams.status);
  const requestedQuery = readParam(resolvedSearchParams.q)?.trim() ?? "";
  const emptyReasonOverride = parseEmptyReason(
    readParam(resolvedSearchParams.emptyReason),
  );

  const allInvoices = [...data.invoices].sort((left, right) =>
    right.periodEnd.localeCompare(left.periodEnd),
  );

  const periodOptions = Array.from(
    new Set(allInvoices.map((invoice) => toPeriodKey(invoice.periodStart))),
  ).filter((period) => period !== "—");

  const selectedPeriod =
    requestedPeriod && periodOptions.includes(requestedPeriod)
      ? requestedPeriod
      : null;
  const selectedStatus =
    requestedStatus &&
    STATUS_FILTERS.includes(requestedStatus as BillingDocumentStatus)
      ? (requestedStatus as BillingDocumentStatus)
      : null;
  const normalizedQuery = requestedQuery.toLowerCase();
  const filtersActive = Boolean(
    selectedPeriod || selectedStatus || normalizedQuery,
  );

  const visibleInvoices = allInvoices.filter((invoice) => {
    if (selectedPeriod && toPeriodKey(invoice.periodStart) !== selectedPeriod) {
      return false;
    }
    if (selectedStatus && invoice.status !== selectedStatus) {
      return false;
    }
    if (
      normalizedQuery &&
      !invoice.invoiceId.toLowerCase().includes(normalizedQuery)
    ) {
      return false;
    }
    return true;
  });

  // EmptyReason resolution: explicit override (for the six-state parity view)
  // wins; otherwise an active filter that empties a non-empty list is
  // `filtered_empty`; otherwise infer from the load result.
  const emptyReason: EmptyReason | null =
    emptyReasonOverride ??
    (visibleInvoices.length === 0
      ? filtersActive && allInvoices.length > 0
        ? "filtered_empty"
        : inferEmptyReason({ invoices: allInvoices, errors: data.errors })
      : null);

  const rows: InvoiceRow[] = visibleInvoices.map((invoice) => ({ ...invoice }));

  const billingGovernanceLink: CrossAppResourceLink = {
    targetApp: "platform-admin",
    route: "/payments",
    resourceType: "billing_reconciliation",
    resourceId: "",
    openMode: "new_tab",
    label: "對帳治理",
  };

  const columns: CanvasTableColumn<InvoiceRow>[] = [
    {
      h: "INVOICE",
      w: 220,
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
      w: 180,
      mono: true,
      align: "right",
      r: (row) => formatMoney(row.amount),
    },
    {
      h: "STATUS",
      w: 110,
      r: (row) => (
        <CanvasPill theme={th} tone={getStatusTone(row.status)} dot>
          {STATUS_LABEL[row.status]}
        </CanvasPill>
      ),
    },
    {
      h: "DUE",
      w: 130,
      mono: true,
      // Contract has no due date on TenantInvoiceRecord — render honestly.
      r: () => <span style={mutedCellStyle}>—</span>,
    },
    {
      h: "ISSUED",
      w: 160,
      mono: true,
      r: (row) => formatDateInput(row.createdAt) || "—",
    },
    {
      h: "ACTIONS",
      w: 200,
      r: (row) => {
        const download = buildDownloadDescriptor(row);
        const dispute = buildDisputeDescriptor(row);
        return (
          <div style={{ display: "flex", gap: 4 }}>
            {download.enabled && row.artifactUrl ? (
              <a
                href={row.artifactUrl}
                target="_blank"
                rel="noreferrer"
                style={actionLinkStyle}
              >
                <CanvasIcon name="ext" size={12} />
                下載 PDF
              </a>
            ) : (
              <span
                style={actionDisabledStyle}
                title={
                  download.disabledReasonCode
                    ? DISABLED_REASON_LABEL[download.disabledReasonCode]
                    : undefined
                }
              >
                下載 PDF
              </span>
            )}
            {dispute.enabled ? (
              <a
                href={crossAppHref(
                  platformAdminInvoiceReconciliationLink(row.invoiceId, "爭議"),
                )}
                target="_blank"
                rel="noreferrer"
                style={actionLinkStyle}
              >
                <CanvasIcon name="ext" size={12} />
                爭議
              </a>
            ) : (
              <span
                style={actionDisabledStyle}
                title={
                  dispute.disabledReasonCode
                    ? DISABLED_REASON_LABEL[dispute.disabledReasonCode]
                    : undefined
                }
              >
                爭議
              </span>
            )}
          </div>
        );
      },
    },
  ];

  const activeEmptyReason: EmptyReason = emptyReason ?? "no_data";
  const emptyCopy = getEmptyStateCopy(activeEmptyReason);

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="發票 · Invoices"
        subtitle="status 由後端決定 (Q-TEN05 不從 client 推斷) · 下載簽章 PDF · 對帳爭議"
      />

      <div style={pageBodyStyle}>
        <InvoicesRefreshNote
          generatedAt={data.generatedAt}
          refreshTier={INVOICES_REFRESH_TIER}
          staleAfterMs={INVOICES_STALE_AFTER_MS}
        />

        <div style={linkRowStyle}>
          <span style={filterGroupLabelStyle}>相關</span>
          <a href="/billing" style={deepLinkStyle}>
            <CanvasIcon name="billing" size={12} />
            帳務概覽
          </a>
          <a href="/audit?module=billing" style={deepLinkStyle}>
            <CanvasIcon name="audit" size={12} />
            稽核
          </a>
          <a
            href={crossAppHref(billingGovernanceLink)}
            target="_blank"
            rel="noreferrer"
            style={deepLinkStyle}
          >
            <CanvasIcon name="ext" size={12} />
            對帳治理 · Platform Admin
          </a>
        </div>

        <div style={filterRowStyle}>
          <span style={filterGroupLabelStyle}>狀態</span>
          <FilterChip
            href={buildInvoicesHref({
              period: selectedPeriod,
              q: requestedQuery,
            })}
            active={!selectedStatus}
          >
            全部
          </FilterChip>
          {STATUS_FILTERS.map((status) => (
            <FilterChip
              key={status}
              href={buildInvoicesHref({
                period: selectedPeriod,
                status,
                q: requestedQuery,
              })}
              active={selectedStatus === status}
            >
              {STATUS_LABEL[status]}
            </FilterChip>
          ))}

          {periodOptions.length > 0 ? (
            <>
              <span style={{ ...filterGroupLabelStyle, marginLeft: 8 }}>
                期別
              </span>
              <FilterChip
                href={buildInvoicesHref({
                  status: selectedStatus,
                  q: requestedQuery,
                })}
                active={!selectedPeriod}
              >
                全部
              </FilterChip>
              {periodOptions.map((period) => (
                <FilterChip
                  key={period}
                  href={buildInvoicesHref({
                    period,
                    status: selectedStatus,
                    q: requestedQuery,
                  })}
                  active={selectedPeriod === period}
                >
                  {period}
                </FilterChip>
              ))}
            </>
          ) : null}

          <form
            method="get"
            action="/invoices"
            style={{ display: "flex", gap: 6, marginLeft: "auto" }}
          >
            {selectedStatus ? (
              <input type="hidden" name="status" value={selectedStatus} />
            ) : null}
            {selectedPeriod ? (
              <input type="hidden" name="period" value={selectedPeriod} />
            ) : null}
            <input
              type="search"
              name="q"
              defaultValue={requestedQuery}
              placeholder="搜尋 invoice id…"
              aria-label="搜尋 invoice id"
              style={searchInputStyle}
            />
            <button type="submit" style={searchButtonStyle}>
              搜尋
            </button>
          </form>
        </div>

        <CanvasCard theme={th} padding={0}>
          {rows.length > 0 && !emptyReason ? (
            <CanvasTable<InvoiceRow> theme={th} rows={rows} columns={columns} />
          ) : (
            <div style={emptyStateStyle}>
              <CanvasPill
                theme={th}
                tone={getEmptyStateTone(activeEmptyReason)}
                dot
              >
                {activeEmptyReason}
              </CanvasPill>
              <div style={emptyTitleStyle}>{emptyCopy.title}</div>
              <div style={emptyBodyStyle}>{emptyCopy.description}</div>
              {emptyCopy.action ? (
                <a href={emptyCopy.action.href} style={deepLinkStyle}>
                  {emptyCopy.action.label}
                </a>
              ) : null}
            </div>
          )}
        </CanvasCard>
      </div>
    </div>
  );
}
