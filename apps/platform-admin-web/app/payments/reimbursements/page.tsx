"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import {
  formatPlatformUiError,
  toPlatformErrorMessage,
} from "@/lib/error-copy";
import { useTranslation } from "@/lib/i18n";
import type { Locale } from "@/lib/translations";
import type {
  DriverStatementRecord,
  ReimbursementBatchRecord,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasCard,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  buildCanvasTheme,
} from "@drts/ui-web";
import type { CanvasTableColumn } from "@drts/ui-web";

type QueueStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "exported"
  | "paid"
  | "reconciled";

type QueueFilter = "all" | "pending_approval" | "exported" | "done";

type QueueRow = {
  batchId: string;
  scope: string;
  amountLabel: string;
  status: QueueStatus;
  submitter: string;
  submittedAt: string;
  updatedAt: string;
  periodMonth: string;
  detailHref: string;
};

const theme = buildCanvasTheme({ surface: "platform", density: "compact" });

const pageBodyStyle = {
  padding: 24,
} satisfies CSSProperties;

const linkStyle = {
  color: theme.accent,
  textDecoration: "none",
  fontWeight: 700,
} satisfies CSSProperties;

const subtleTextStyle = {
  color: theme.textMuted,
  fontSize: 11,
} satisfies CSSProperties;

const monoStackStyle = {
  display: "grid",
  gap: 4,
  fontFamily: theme.monoFamily,
  minWidth: 0,
} satisfies CSSProperties;

const tabLabelStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
} satisfies CSSProperties;

const badgeStyle = (
  tone: "neutral" | "warn" | "info" | "success",
): CSSProperties => {
  const palette = {
    neutral: {
      background: theme.surface,
      border: theme.border,
      color: theme.textMuted,
    },
    warn: {
      background: theme.warnBg,
      border: theme.warnBorder,
      color: theme.warn,
    },
    info: {
      background: theme.accentBg,
      border: theme.accentBorder,
      color: theme.accent,
    },
    success: {
      background: theme.successBg,
      border: theme.successBorder,
      color: theme.success,
    },
  } as const;

  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 22,
    height: 18,
    padding: "0 6px",
    borderRadius: 999,
    border: `1px solid ${palette[tone].border}`,
    background: palette[tone].background,
    color: palette[tone].color,
    fontSize: 11,
    fontWeight: 700,
    lineHeight: 1,
  };
};

const FILTERS: Array<{
  id: QueueFilter;
  tone: "neutral" | "warn" | "info" | "success";
}> = [
  { id: "all", tone: "neutral" },
  { id: "pending_approval", tone: "warn" },
  { id: "exported", tone: "info" },
  { id: "done", tone: "success" },
];

function formatMoney(
  amount?: { amountMinor: number; currency: string } | null,
): string {
  if (!amount) return "—";

  return `${amount.amountMinor.toLocaleString()} ${amount.currency}`;
}

function getQueueFilterLabel(filter: QueueFilter, locale: Locale): string {
  switch (filter) {
    case "pending_approval":
      return locale === "zh" ? "待核准" : "Pending approval";
    case "exported":
      return locale === "zh" ? "已匯出" : "Exported";
    case "done":
      return locale === "zh" ? "已完成" : "Done";
    case "all":
    default:
      return locale === "zh" ? "全部" : "All";
  }
}

function getScopeLabel(
  batch: ReimbursementBatchRecord,
  locale: Locale,
): string {
  const counts = new Map<string, number>();
  for (const item of batch.items) {
    const key = item.channelKey ?? "statement";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const [dominant] = [...counts.entries()].sort(
    (left, right) => right[1] - left[1],
  );
  const scopeKey = dominant?.[0] ?? "statement";

  switch (scopeKey) {
    case "partner_airport":
      return locale === "zh" ? "合作夥伴：機場" : "Partner: airport";
    case "tenant_enterprise":
      return locale === "zh" ? "租戶：企業方案" : "Tenant: enterprise";
    case "phone_dispatch":
      return locale === "zh" ? "客服：電話派遣" : "Phone: dispatch";
    case "forwarded_shadow":
      return locale === "zh" ? "轉送：外部鏡像" : "Forwarded: shadow";
    default:
      return locale === "zh"
        ? `結算單：${batch.statementId}`
        : `Statement: ${batch.statementId}`;
  }
}

function deriveQueueStatus(batch: ReimbursementBatchRecord): QueueStatus {
  if (batch.status === "paid") {
    if (batch.paidAt) {
      const ageHours =
        (Date.now() - new Date(batch.paidAt).getTime()) / (1000 * 60 * 60);
      return ageHours >= 72 ? "reconciled" : "paid";
    }
    return "paid";
  }

  if (!batch.approvedAt) {
    return batch.items.length === 0 ? "draft" : "pending_approval";
  }

  if (batch.remittanceProofId) {
    return "exported";
  }

  return "approved";
}

function getSubmittedAt(
  batch: ReimbursementBatchRecord,
  statement: DriverStatementRecord | undefined,
): string {
  return statement?.createdAt ?? `${batch.periodMonth}-01T00:00:00.000Z`;
}

function getUpdatedAt(
  batch: ReimbursementBatchRecord,
  statement: DriverStatementRecord | undefined,
): string {
  return (
    batch.paidAt ??
    batch.approvedAt ??
    statement?.updatedAt ??
    getSubmittedAt(batch, statement)
  );
}

function statusTone(
  status: QueueStatus,
): "neutral" | "warn" | "info" | "success" {
  switch (status) {
    case "pending_approval":
      return "warn";
    case "approved":
    case "exported":
      return "info";
    case "paid":
    case "reconciled":
      return "success";
    case "draft":
    default:
      return "neutral";
  }
}

function statusLabel(status: QueueStatus, locale: Locale): string {
  switch (status) {
    case "pending_approval":
      return locale === "zh" ? "待核准" : "Pending approval";
    case "approved":
      return locale === "zh" ? "已核准" : "Approved";
    case "exported":
      return locale === "zh" ? "已匯出" : "Exported";
    case "paid":
      return locale === "zh" ? "已付款" : "Paid";
    case "reconciled":
      return locale === "zh" ? "已對帳" : "Reconciled";
    case "draft":
    default:
      return locale === "zh" ? "草稿" : "Draft";
  }
}

function buildRow(
  batch: ReimbursementBatchRecord,
  statement: DriverStatementRecord | undefined,
  locale: Locale,
): QueueRow {
  const submittedAt = getSubmittedAt(batch, statement);
  const updatedAt = getUpdatedAt(batch, statement);

  return {
    batchId: batch.batchId,
    scope: getScopeLabel(batch, locale),
    amountLabel: formatMoney(batch.totalAmount),
    status: deriveQueueStatus(batch),
    submitter: locale === "zh" ? "平台財務" : "Platform Finance",
    submittedAt,
    updatedAt,
    periodMonth: batch.periodMonth,
    detailHref: `/payments/reimbursements/${batch.batchId}`,
  };
}

export default function ReimbursementsPage() {
  const { locale } = useTranslation();
  const client = usePlatformAdminClient();
  const [batches, setBatches] = useState<ReimbursementBatchRecord[]>([]);
  const [statements, setStatements] = useState<DriverStatementRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<QueueFilter>("all");

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [batchRecords, statementRecords] = await Promise.all([
        client.listReimbursementBatches(),
        client.listDriverStatements(),
      ]);
      setBatches(batchRecords ?? []);
      setStatements(statementRecords ?? []);
    } catch (cause) {
      setError(
        formatPlatformUiError(
          locale,
          toPlatformErrorMessage(cause),
          locale === "zh"
            ? "無法載入代墊批次"
            : "Unable to load reimbursement batches",
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [client, locale]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  const rows = useMemo(() => {
    const statementMap = new Map(
      statements.map((statement) => [statement.statementId, statement]),
    );

    return batches
      .map((batch) =>
        buildRow(batch, statementMap.get(batch.statementId), locale),
      )
      .sort(
        (left, right) =>
          Date.parse(right.updatedAt || right.submittedAt) -
          Date.parse(left.updatedAt || left.submittedAt),
      );
  }, [batches, locale, statements]);

  const counts = useMemo(() => {
    return rows.reduce<Record<QueueStatus, number>>(
      (accumulator, row) => {
        accumulator[row.status] += 1;
        return accumulator;
      },
      {
        draft: 0,
        pending_approval: 0,
        approved: 0,
        exported: 0,
        paid: 0,
        reconciled: 0,
      },
    );
  }, [rows]);

  const filteredRows = useMemo(() => {
    switch (activeFilter) {
      case "pending_approval":
        return rows.filter((row) => row.status === "pending_approval");
      case "exported":
        return rows.filter((row) => row.status === "exported");
      case "done":
        return rows.filter(
          (row) => row.status === "paid" || row.status === "reconciled",
        );
      case "all":
      default:
        return rows;
    }
  }, [activeFilter, rows]);

  const tabs = useMemo(
    () =>
      FILTERS.map((filter) => {
        const count =
          filter.id === "all"
            ? rows.length
            : filter.id === "done"
              ? counts.paid + counts.reconciled
              : counts[filter.id];
        return {
          id: filter.id,
          node: (
            <button
              key={filter.id}
              type="button"
              onClick={() => setActiveFilter(filter.id)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                border: "none",
                padding: 0,
                background: "transparent",
                cursor: "pointer",
                color: "inherit",
                font: "inherit",
              }}
            >
              <span style={tabLabelStyle}>
                <span>{getQueueFilterLabel(filter.id, locale)}</span>
                <span style={badgeStyle(filter.tone)}>{count}</span>
              </span>
            </button>
          ),
        };
      }),
    [counts, locale, rows.length],
  );

  const activeTab =
    tabs.find((tab) => tab.id === activeFilter)?.node ?? tabs[0]?.node;

  const columns: CanvasTableColumn<QueueRow>[] = [
    {
      h: locale === "zh" ? "批次" : "Batch",
      w: 208,
      mono: true,
      r: (row) => (
        <div style={monoStackStyle}>
          <Link href={row.detailHref} style={linkStyle}>
            {row.batchId}
          </Link>
          <span style={subtleTextStyle}>{row.periodMonth}</span>
        </div>
      ),
    },
    {
      h: locale === "zh" ? "範圍" : "Scope",
      w: 180,
      mono: true,
      r: (row) => row.scope,
    },
    {
      h: locale === "zh" ? "金額" : "Amount",
      w: 160,
      mono: true,
      r: (row) => row.amountLabel,
    },
    {
      h: locale === "zh" ? "狀態" : "State",
      w: 172,
      r: (row) => (
        <CanvasPill theme={theme} tone={statusTone(row.status)} dot>
          {statusLabel(row.status, locale)}
        </CanvasPill>
      ),
    },
    {
      h: locale === "zh" ? "提交者" : "Submitter",
      w: 192,
      r: (row) => row.submitter,
    },
    {
      h: locale === "zh" ? "提交時間" : "Submitted",
      w: 164,
      mono: true,
      r: (row) => formatDateTime(row.submittedAt),
    },
    {
      h: locale === "zh" ? "更新時間" : "Updated",
      w: 164,
      mono: true,
      r: (row) => formatDateTime(row.updatedAt),
    },
  ];

  const emptyState: ReactNode =
    locale === "zh" ? (
      <div style={{ padding: 24, color: theme.textMuted, fontSize: 12.5 }}>
        目前沒有符合此狀態的代墊批次。
      </div>
    ) : (
      <div style={{ padding: 24, color: theme.textMuted, fontSize: 12.5 }}>
        No reimbursement batches match this queue state.
      </div>
    );

  return (
    <div style={{ minHeight: "100%", background: theme.bg }}>
      <CanvasPageHeader
        theme={theme}
        title={locale === "zh" ? "代墊批次" : "Reimbursement batches"}
        subtitle={
          locale === "zh"
            ? "草稿 → 待核准 → 已核准 → 已匯出 → 已付款 → 已對帳"
            : "draft → pending approval → approved → exported → paid → reconciled"
        }
        tabs={tabs.map((tab) => tab.node)}
        activeTab={activeTab}
      />

      <div style={pageBodyStyle}>
        {error ? (
          <CanvasBanner
            theme={theme}
            tone="danger"
            title={
              locale === "zh"
                ? "無法載入代墊批次"
                : "Unable to load reimbursement batches"
            }
            body={error}
          />
        ) : null}

        <CanvasCard theme={theme} padding={0}>
          {loading ? (
            <div
              style={{ padding: 24, color: theme.textMuted, fontSize: 12.5 }}
            >
              {locale === "zh"
                ? "正在載入代墊批次…"
                : "Loading reimbursement batches..."}
            </div>
          ) : filteredRows.length > 0 ? (
            <CanvasTable theme={theme} columns={columns} rows={filteredRows} />
          ) : (
            emptyState
          )}
        </CanvasCard>
      </div>
    </div>
  );
}
