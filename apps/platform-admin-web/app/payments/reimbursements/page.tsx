/**
 * Reimbursement batches queue (/payments/reimbursements)
 * Platform-admin surface for the Q-ADM12 six-state reimbursement state machine.
 * Canvas authority: docs/05-ui/drts-design-canvas/platform-screens-3.jsx → PA_Reimbursements
 * ("代墊批次 · Reimbursement batches"). Detail drilldown lives at
 * /payments/reimbursements/[batchId].
 */

"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import type { ReimbursementBatchRecord } from "@drts/contracts";
import {
  CanvasBanner,
  CanvasCard,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  buildCanvasTheme,
} from "@drts/ui-web";
import type { CanvasTableColumn, CanvasTheme, CanvasTone } from "@drts/ui-web";

const PLATFORM_THEME = buildCanvasTheme({
  surface: "platform",
  density: "compact",
});

// Q-ADM12 six-state reimbursement state machine (canvas ordering).
const REIMBURSEMENT_STATES = [
  "draft",
  "pending_approval",
  "approved",
  "exported",
  "paid",
  "reconciled",
] as const;
type ReimbursementState = (typeof REIMBURSEMENT_STATES)[number];

// "draft → pending_approval → approved → exported → paid → reconciled"
const STATE_MACHINE_CHAIN = REIMBURSEMENT_STATES.join(" → ");

type ReimbursementTableRow = ReimbursementBatchRecord & Record<string, unknown>;

type ReimbursementTabId = "all" | "pending" | "exported" | "done";

/**
 * Derive the canvas six-state machine label from the backend record. The
 * platform API only persists status (pending | paid) plus approvedAt/paidAt, so
 * we project those signals onto the canvas vocabulary. States that the backend
 * does not yet emit (draft / exported / reconciled) remain part of the machine
 * for parity but simply do not appear until the contract carries them.
 */
function deriveReimbursementState(
  batch: ReimbursementBatchRecord,
): ReimbursementState {
  if (batch.status === "paid" || batch.paidAt) {
    return "paid";
  }
  if (batch.approvedAt) {
    return "approved";
  }
  return "pending_approval";
}

function reimbursementStateTone(state: ReimbursementState): CanvasTone {
  switch (state) {
    case "paid":
    case "reconciled":
      return "success";
    case "pending_approval":
      return "warn";
    case "draft":
      return "neutral";
    default:
      return "info";
  }
}

function matchesTab(state: ReimbursementState, tab: ReimbursementTabId) {
  switch (tab) {
    case "pending":
      return state === "pending_approval";
    case "exported":
      return state === "exported";
    case "done":
      return state === "paid" || state === "reconciled";
    case "all":
    default:
      return true;
  }
}

function formatMoney(
  amount?: { amountMinor: number; currency: string } | null,
) {
  if (!amount) return "—";
  return `${amount.amountMinor.toLocaleString()} ${amount.currency}`;
}

function viewportStyle(theme: CanvasTheme): React.CSSProperties {
  return {
    minHeight: "100%",
    background: theme.bg,
  };
}

function pageBodyStyle(theme: CanvasTheme): React.CSSProperties {
  return {
    padding: "16px 24px 24px",
    display: "grid",
    gap: theme.sectGap,
  };
}

function cellStackStyle(options?: { mono?: boolean }): React.CSSProperties {
  return {
    display: "grid",
    gap: 4,
    minWidth: 0,
    whiteSpace: "normal",
    fontFamily: options?.mono ? PLATFORM_THEME.monoFamily : undefined,
  };
}

function emptyStateStyle(theme: CanvasTheme): React.CSSProperties {
  return {
    padding: 18,
    color: theme.textMuted,
    fontSize: 12.5,
  };
}

function tabNodeStyle(): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    cursor: "pointer",
  };
}

function tabBadgeStyle(
  theme: CanvasTheme,
  tone: CanvasTone,
): React.CSSProperties {
  const accent = tone === "warn" ? theme.warn : theme.textMuted;
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 18,
    height: 16,
    padding: "0 5px",
    borderRadius: 999,
    fontSize: 10.5,
    fontWeight: 700,
    fontFamily: theme.monoFamily,
    color: accent,
    background: theme.surfaceLo,
    border: `1px solid ${theme.border}`,
  };
}

export default function ReimbursementsPage() {
  const { locale } = useTranslation();
  const client = usePlatformAdminClient();
  const theme = PLATFORM_THEME;

  const [batches, setBatches] = useState<ReimbursementBatchRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTabId, setActiveTabId] = useState<ReimbursementTabId>("all");

  const loadBatches = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const records = await client.listReimbursementBatches();
      setBatches(records ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void loadBatches();
  }, [loadBatches]);

  const copy =
    locale === "en"
      ? {
          title: "Reimbursement batches",
          subtitle: `${STATE_MACHINE_CHAIN} (Q-ADM12 six-state state machine)`,
          tabAll: "All",
          tabPending: "Pending approval",
          tabExported: "Exported",
          tabDone: "Done",
          colBatch: "Batch",
          colScope: "Scope",
          colAmount: "Amount",
          colState: "State",
          colSubmitter: "Submitter",
          colSubmitted: "Submitted",
          colUpdated: "Updated",
          loading: "Loading reimbursement batches…",
          errorTitle: "Failed to load reimbursement batches",
          emptyAll: "No reimbursement batches yet.",
          emptyTab: "No batches match this tab.",
        }
      : {
          title: "代墊批次 · Reimbursement batches",
          subtitle: `${STATE_MACHINE_CHAIN} (Q-ADM12 6 狀態 state machine)`,
          tabAll: "全部",
          tabPending: "Pending approval",
          tabExported: "Exported",
          tabDone: "Done",
          colBatch: "Batch",
          colScope: "Scope",
          colAmount: "Amount",
          colState: "State",
          colSubmitter: "Submitter",
          colSubmitted: "Submitted",
          colUpdated: "Updated",
          loading: "載入代墊批次中…",
          errorTitle: "載入代墊批次失敗",
          emptyAll: "目前沒有代墊批次。",
          emptyTab: "此分頁沒有符合的批次。",
        };

  const decoratedBatches = useMemo(
    () =>
      batches.map((batch) => ({
        batch,
        state: deriveReimbursementState(batch),
      })),
    [batches],
  );

  const counts = useMemo(() => {
    const result = { all: 0, pending: 0, exported: 0, done: 0 };
    for (const { state } of decoratedBatches) {
      result.all += 1;
      if (matchesTab(state, "pending")) result.pending += 1;
      if (matchesTab(state, "exported")) result.exported += 1;
      if (matchesTab(state, "done")) result.done += 1;
    }
    return result;
  }, [decoratedBatches]);

  const visibleRows = useMemo<ReimbursementTableRow[]>(
    () =>
      decoratedBatches
        .filter(({ state }) => matchesTab(state, activeTabId))
        .map(({ batch }) => batch as ReimbursementTableRow),
    [decoratedBatches, activeTabId],
  );

  const tabDefs: Array<{
    id: ReimbursementTabId;
    label: string;
    count: number;
    tone: CanvasTone;
  }> = [
    { id: "all", label: copy.tabAll, count: counts.all, tone: "neutral" },
    {
      id: "pending",
      label: copy.tabPending,
      count: counts.pending,
      tone: "warn",
    },
    {
      id: "exported",
      label: copy.tabExported,
      count: counts.exported,
      tone: "neutral",
    },
    { id: "done", label: copy.tabDone, count: counts.done, tone: "neutral" },
  ];

  const tabNodes = tabDefs.map((def) => (
    <span
      key={def.id}
      role="tab"
      aria-selected={def.id === activeTabId}
      tabIndex={0}
      style={tabNodeStyle()}
      onClick={() => setActiveTabId(def.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setActiveTabId(def.id);
        }
      }}
    >
      {def.label}
      <span style={tabBadgeStyle(theme, def.tone)}>{def.count}</span>
    </span>
  ));
  const activeIndex = tabDefs.findIndex((def) => def.id === activeTabId);

  const columns: CanvasTableColumn<ReimbursementTableRow>[] = [
    {
      h: copy.colBatch,
      w: 200,
      mono: true,
      r: (batch) => (
        <div style={cellStackStyle({ mono: true })}>
          <Link
            href={`/payments/reimbursements/${encodeURIComponent(batch.batchId)}`}
            style={{
              color: theme.accent,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            {batch.batchId}
          </Link>
        </div>
      ),
    },
    {
      h: copy.colScope,
      w: 180,
      mono: true,
      r: (batch) => (
        <div style={cellStackStyle({ mono: true })}>
          <span>{`driver:${batch.driverId}`}</span>
          <span style={{ color: theme.textMuted, fontSize: 11 }}>
            {batch.periodMonth}
          </span>
        </div>
      ),
    },
    {
      h: copy.colAmount,
      w: 160,
      mono: true,
      r: (batch) => formatMoney(batch.totalAmount),
    },
    {
      h: copy.colState,
      w: 170,
      r: (batch) => {
        const state = deriveReimbursementState(batch);
        return (
          <CanvasPill theme={theme} tone={reimbursementStateTone(state)} dot>
            {state}
          </CanvasPill>
        );
      },
    },
    {
      h: copy.colSubmitter,
      w: 100,
      mono: true,
      r: (batch) => batch.statementId || "—",
    },
    {
      h: copy.colSubmitted,
      w: 150,
      mono: true,
      r: (batch) => (batch.approvedAt ? formatDateTime(batch.approvedAt) : "—"),
    },
    {
      h: copy.colUpdated,
      w: 160,
      mono: true,
      r: (batch) => {
        const updatedAt = batch.paidAt ?? batch.approvedAt;
        return updatedAt ? formatDateTime(updatedAt) : "—";
      },
    },
  ];

  return (
    <div style={viewportStyle(theme)}>
      <CanvasPageHeader
        theme={theme}
        title={copy.title}
        subtitle={copy.subtitle}
        tabs={tabNodes}
        activeTab={activeIndex >= 0 ? tabNodes[activeIndex] : undefined}
      />

      <div style={pageBodyStyle(theme)}>
        {error ? (
          <CanvasBanner
            theme={theme}
            tone="danger"
            title={copy.errorTitle}
            body={error}
          />
        ) : null}

        <CanvasCard theme={theme} padding={0}>
          {loading ? (
            <div style={emptyStateStyle(theme)}>{copy.loading}</div>
          ) : visibleRows.length === 0 ? (
            <div style={emptyStateStyle(theme)}>
              {counts.all === 0 ? copy.emptyAll : copy.emptyTab}
            </div>
          ) : (
            <CanvasTable theme={theme} columns={columns} rows={visibleRows} />
          )}
        </CanvasCard>
      </div>
    </div>
  );
}
