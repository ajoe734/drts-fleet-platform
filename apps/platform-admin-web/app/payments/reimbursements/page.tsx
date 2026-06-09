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
import { useTranslation } from "@/lib/i18n";
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

type TranslateFn = (
  key: string,
  params?: Record<string, string | number>,
) => string;

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
  labelKey: string;
  tone: "neutral" | "warn" | "info" | "success";
}> = [
  {
    id: "all",
    labelKey: "payments.reimbursements.queue.filter.all",
    tone: "neutral",
  },
  {
    id: "pending_approval",
    labelKey: "payments.reimbursements.queue.filter.pendingApproval",
    tone: "warn",
  },
  {
    id: "exported",
    labelKey: "payments.reimbursements.queue.filter.exported",
    tone: "info",
  },
  {
    id: "done",
    labelKey: "payments.reimbursements.queue.filter.done",
    tone: "success",
  },
];

function formatMoney(
  amount?: { amountMinor: number; currency: string } | null,
): string {
  if (!amount) return "—";

  return `${amount.amountMinor.toLocaleString()} ${amount.currency}`;
}

function getScopeLabel(batch: ReimbursementBatchRecord): string {
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
      return "partner:airport";
    case "tenant_enterprise":
      return "tenant:enterprise";
    case "phone_dispatch":
      return "phone:dispatch";
    case "forwarded_shadow":
      return "forwarded:shadow";
    default:
      return `statement:${batch.statementId}`;
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

function statusLabel(status: QueueStatus, t: TranslateFn): string {
  switch (status) {
    case "pending_approval":
      return t("payments.reimbursements.status.pendingApproval");
    case "approved":
      return t("payments.reimbursements.status.approved");
    case "exported":
      return t("payments.reimbursements.status.exported");
    case "paid":
      return t("payments.reimbursements.status.paid");
    case "reconciled":
      return t("payments.reimbursements.status.reconciled");
    case "draft":
    default:
      return t("payments.reimbursements.status.draft");
  }
}

function buildRow(
  batch: ReimbursementBatchRecord,
  statement: DriverStatementRecord | undefined,
  t: TranslateFn,
): QueueRow {
  const submittedAt = getSubmittedAt(batch, statement);
  const updatedAt = getUpdatedAt(batch, statement);

  return {
    batchId: batch.batchId,
    scope: getScopeLabel(batch),
    amountLabel: formatMoney(batch.totalAmount),
    status: deriveQueueStatus(batch),
    submitter: t("payments.reimbursements.queue.submitter.platformFinance"),
    submittedAt,
    updatedAt,
    periodMonth: batch.periodMonth,
    detailHref: `/payments/reimbursements/${batch.batchId}`,
  };
}

export default function ReimbursementsPage() {
  const { t } = useTranslation();
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
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  const rows = useMemo(() => {
    const statementMap = new Map(
      statements.map((statement) => [statement.statementId, statement]),
    );

    return batches
      .map((batch) => buildRow(batch, statementMap.get(batch.statementId), t))
      .sort(
        (left, right) =>
          Date.parse(right.updatedAt || right.submittedAt) -
          Date.parse(left.updatedAt || left.submittedAt),
      );
  }, [batches, statements, t]);

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
                <span>{t(filter.labelKey)}</span>
                <span style={badgeStyle(filter.tone)}>{count}</span>
              </span>
            </button>
          ),
        };
      }),
    [counts, rows.length, t],
  );

  const activeTab =
    tabs.find((tab) => tab.id === activeFilter)?.node ?? tabs[0]?.node;

  const columns: CanvasTableColumn<QueueRow>[] = [
    {
      h: t("payments.reimbursements.queue.col.batch"),
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
      h: t("payments.reimbursements.queue.col.scope"),
      w: 180,
      mono: true,
      r: (row) => row.scope,
    },
    {
      h: t("payments.reimbursements.queue.col.amount"),
      w: 160,
      mono: true,
      r: (row) => row.amountLabel,
    },
    {
      h: t("payments.reimbursements.queue.col.state"),
      w: 172,
      r: (row) => (
        <CanvasPill theme={theme} tone={statusTone(row.status)} dot>
          {statusLabel(row.status, t)}
        </CanvasPill>
      ),
    },
    {
      h: t("payments.reimbursements.queue.col.submitter"),
      w: 192,
      r: (row) => row.submitter,
    },
    {
      h: t("payments.reimbursements.queue.col.submitted"),
      w: 164,
      mono: true,
      r: (row) => formatDateTime(row.submittedAt),
    },
    {
      h: t("payments.reimbursements.queue.col.updated"),
      w: 164,
      mono: true,
      r: (row) => formatDateTime(row.updatedAt),
    },
  ];

  const emptyState: ReactNode = (
    <div style={{ padding: 24, color: theme.textMuted, fontSize: 12.5 }}>
      {t("payments.reimbursements.queue.empty")}
    </div>
  );

  return (
    <div style={{ minHeight: "100%", background: theme.bg }}>
      <CanvasPageHeader
        theme={theme}
        title={t("payments.reimbursements.queue.headerTitle")}
        subtitle={t("payments.reimbursements.queue.headerSubtitle")}
        tabs={tabs.map((tab) => tab.node)}
        activeTab={activeTab}
      />

      <div style={pageBodyStyle}>
        {error ? (
          <CanvasBanner
            theme={theme}
            tone="danger"
            title={t("payments.reimbursements.queue.loadError")}
            body={error}
          />
        ) : null}

        <CanvasCard theme={theme} padding={0}>
          {loading ? (
            <div
              style={{ padding: 24, color: theme.textMuted, fontSize: 12.5 }}
            >
              {t("payments.reimbursements.queue.loading")}
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
