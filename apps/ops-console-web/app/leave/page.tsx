"use client";

import React, { useCallback, useEffect, useState } from "react";
import type {
  DriverLeaveQueryFilter,
  ReviewDriverLeaveCommand,
} from "@drts/contracts";
import {
  ActionButton,
  CanvasBtn as Btn,
  CanvasCard as Card,
  CanvasEmptyState as EmptyState,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasTable as Table,
  buildCanvasTheme,
  type CanvasTableColumn,
} from "@drts/ui-web";
import { getOpsClient } from "@/lib/api-client";
import { OpsLeaveStatusChip, OpsLeaveTypeChip } from "./leave-chips";
import { LeaveConflictView, type OpsConflictVariant } from "./leave-conflict-view";
import { LeaveDetailView } from "./leave-detail-view";
import { LeaveHistoryView } from "./leave-history-view";
import { LeaveShiftImpactView } from "./leave-shift-impact-view";
import {
  FX_OPS_LEAVE,
  fmtTaipei,
  formatLeaveRangeZh,
  type OpsLeaveRow,
} from "./leave-types";
import { LEAVE_OPS_COPY, tLeave } from "./translations";

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

type QueueTab = "pending" | "approved" | "rejected" | "withdrawn" | "history" | "shift_impact";

export default function OpsLeavePage() {
  const [activeTab, setActiveTab] = useState<QueueTab>("pending");
  const [leaves, setLeaves] = useState<OpsLeaveRow[]>(FX_OPS_LEAVE);
  const [selectedLeave, setSelectedLeave] = useState<OpsLeaveRow | null>(null);
  const [conflictVariant, setConflictVariant] = useState<OpsConflictVariant | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [typeFilter, setTypeFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const fetchLeaves = useCallback(async () => {
    setIsLoading(true);
    try {
      const client = getOpsClient();
      const query: DriverLeaveQueryFilter = {};
      const res = await client.listDriverLeaves(query);
      if (res && Array.isArray(res.items) && res.items.length > 0) {
        const mapped: OpsLeaveRow[] = res.items.map((item) => ({
          ...item,
          driver: `${item.driverId} · 司機`,
          zhRange: formatLeaveRangeZh(item.startTime, item.endTime),
        }));
        setLeaves(mapped);
      }
    } catch {
      // Fallback to FX_OPS_LEAVE in offline / dev mode
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchLeaves();
  }, [fetchLeaves]);

  // Review (approve / reject)
  const handleReview = async (leaveId: string, command: ReviewDriverLeaveCommand) => {
    setIsSubmitting(true);
    try {
      const client = getOpsClient();
      await client.reviewDriverLeave(leaveId, command);

      // Optimistically update local leaves
      setLeaves((prev) =>
        prev.map((l) => {
          if (l.leaveId === leaveId) {
            return {
              ...l,
              status: command.decision === "approve" ? "approved" : "rejected",
              reviewedByPrincipalId: "王芳 · ops_manager",
              reviewedAt: new Date().toISOString(),
              reviewNotes: command.reviewNotes ?? null,
              impactedShiftIds:
                command.decision === "approve" ? l.previewShiftIds ?? ["shift_2305"] : [],
            };
          }
          return l;
        }),
      );
      setSelectedLeave(null);
      setConflictVariant(null);
    } catch (err: any) {
      const msg = String(err?.message || err);
      if (msg.includes("LEAVE_INVALID_STATE_TRANSITION")) {
        setConflictVariant("invalid_state");
      } else if (msg.includes("LEAVE_OVERLAPPING_REQUEST")) {
        setConflictVariant("overlap");
      } else {
        // Default to server conflict display
        setConflictVariant("invalid_state");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter rows for current queue tab
  const rows = leaves.filter((r) => {
    if (activeTab === "pending" || activeTab === "approved" || activeTab === "rejected" || activeTab === "withdrawn") {
      if (r.status !== activeTab) return false;
    }
    if (typeFilter !== "all" && r.leaveType !== typeFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchDriver = r.driver.toLowerCase().includes(q) || r.driverId.toLowerCase().includes(q);
      const matchReason = r.reason.toLowerCase().includes(q);
      const matchId = r.leaveId.toLowerCase().includes(q);
      if (!matchDriver && !matchReason && !matchId) return false;
    }
    return true;
  });

  const pendingCount = leaves.filter((r) => r.status === "pending").length;

  const tabList = [
    { id: "pending", label: `Pending (${pendingCount})` },
    { id: "approved", label: "Approved" },
    { id: "rejected", label: "Rejected" },
    { id: "withdrawn", label: "Withdrawn" },
    { id: "history", label: "歷史紀錄" },
    { id: "shift_impact", label: "班表連動" },
  ] as const;

  const tabNodes = tabList.map((t) => (
    <span
      key={t.id}
      onClick={() => setActiveTab(t.id as QueueTab)}
      style={{ cursor: "pointer" }}
    >
      {t.label}
    </span>
  ));
  const activeTabNode = tabNodes.find((_, idx) => tabList[idx]?.id === activeTab);

  if (conflictVariant) {
    return (
      <LeaveConflictView
        onBack={() => {
          setConflictVariant(null);
          setSelectedLeave(null);
        }}
        onRefresh={() => {
          void fetchLeaves();
          setConflictVariant(null);
          setSelectedLeave(null);
        }}
        theme={theme}
        variant={conflictVariant}
      />
    );
  }

  if (selectedLeave) {
    return (
      <LeaveDetailView
        isSubmitting={isSubmitting}
        leave={selectedLeave}
        onBack={() => setSelectedLeave(null)}
        onDecision={handleReview}
        theme={theme}
      />
    );
  }

  if (activeTab === "history") {
    return (
      <div>
        <PageHeader
          activeTab={activeTabNode}
          subtitle="N01 / C052 · driver:write + dispatch:write · tenant boundary 內司機假單"
          tabs={tabNodes}
          theme={theme}
          title={tLeave("pageTitle")}
        />
        <LeaveHistoryView
          onSelectLeave={(lv) => setSelectedLeave(lv)}
          rows={leaves}
          theme={theme}
        />
      </div>
    );
  }

  if (activeTab === "shift_impact") {
    return (
      <div>
        <PageHeader
          activeTab={activeTabNode}
          subtitle="N01 / C052 · driver:write + dispatch:write · tenant boundary 內司機假單"
          tabs={tabNodes}
          theme={theme}
          title={tLeave("pageTitle")}
        />
        <LeaveShiftImpactView theme={theme} />
      </div>
    );
  }

  const columns: CanvasTableColumn<OpsLeaveRow>[] = [
    {
      h: "司機",
      w: 150,
      r: (r) => <span style={{ fontWeight: 600 }}>{r.driver}</span>,
    },
    {
      h: "申請單",
      w: 110,
      mono: true,
      r: (r) => (
        <span style={{ color: theme.accent, fontWeight: 600 }}>{r.leaveId}</span>
      ),
    },
    {
      h: "假別",
      w: 110,
      r: (r) => <OpsLeaveTypeChip theme={theme} type={r.leaveType} />,
    },
    {
      h: "時段（UTC+8）",
      w: 220,
      r: (r) => r.zhRange,
    },
    {
      h: "事由",
      w: 260,
      r: (r) => r.reason,
    },
    {
      h: "班次連動",
      w: 100,
      r: (r) =>
        r.impactedShiftIds.length > 0 ? (
          <Pill dot theme={theme} tone="warn">
            {r.impactedShiftIds.length} {LEAVE_OPS_COPY.unitRecords}
          </Pill>
        ) : (
          <span style={{ color: theme.textDim }}>—</span>
        ),
    },
    {
      h: "提交時間（UTC+8）",
      w: 150,
      r: (r) => (
        <span style={{ fontFamily: theme.monoFamily, fontSize: 11 }}>
          {fmtTaipei(r.createdAt)}
        </span>
      ),
    },
    {
      h: "操作",
      w: 180,
      r: (r) =>
        r.status === "pending" ? (
          <div style={{ display: "flex", gap: 6 }}>
            <ActionButton
              disabled={isSubmitting}
              label="核准"
              onClick={() => handleReview(r.leaveId, { decision: "approve" })}
              size="xs"
              theme={theme}
              variant="primary"
            />
            <ActionButton
              danger
              disabled={isSubmitting}
              label="駁回"
              onClick={() => handleReview(r.leaveId, { decision: "reject" })}
              size="xs"
              theme={theme}
              variant="secondary"
            />
            <Btn
              icon="ext"
              onClick={() => setSelectedLeave(r)}
              size="xs"
              theme={theme}
              variant="ghost"
            >
              {LEAVE_OPS_COPY.detailsAction}
            </Btn>
          </div>
        ) : (
          <Btn
            icon="ext"
            onClick={() => setSelectedLeave(r)}
            size="xs"
            theme={theme}
            variant="ghost"
          >
            {LEAVE_OPS_COPY.detailsAction}
          </Btn>
        ),
    },
  ];

  return (
    <div>
      <PageHeader
        actions={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select
              onChange={(e) => setTypeFilter(e.target.value)}
              style={{
                background: theme.bgRaised,
                border: `1px solid ${theme.border}`,
                color: theme.text,
                borderRadius: 7,
                padding: "6px 10px",
                fontSize: 12.5,
              }}
              value={typeFilter}
            >
              <option value="all">{LEAVE_OPS_COPY.filterTypeAll}</option>
              <option value="annual">{LEAVE_OPS_COPY.filterTypeAnnual}</option>
              <option value="sick">{LEAVE_OPS_COPY.filterTypeSick}</option>
              <option value="personal">{LEAVE_OPS_COPY.filterTypePersonal}</option>
              <option value="bereavement">{LEAVE_OPS_COPY.filterTypeFuneral}</option>
              <option value="emergency">{LEAVE_OPS_COPY.filterTypeEmergency}</option>
            </select>
            <input
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={LEAVE_OPS_COPY.searchPlaceholder}
              style={{
                width: 180,
                background: theme.bgRaised,
                border: `1px solid ${theme.border}`,
                color: theme.text,
                borderRadius: 7,
                padding: "6px 10px",
                fontSize: 12.5,
              }}
              value={searchQuery}
            />
          </div>
        }
        activeTab={activeTabNode}
        subtitle="N01 / C052 · driver:write + dispatch:write · tenant boundary 內司機假單"
        tabs={tabNodes}
        theme={theme}
        title={tLeave("pageTitle")}
      />

      <div style={{ padding: 24 }}>
        {rows.length === 0 ? (
          <EmptyState
            body="此篩選條件下沒有請假申請。"
            theme={theme}
            title={tLeave("emptyRequestsTitle")}
          />
        ) : (
          <Card padding={0} theme={theme}>
            <Table columns={columns} rows={rows} theme={theme} />
          </Card>
        )}
      </div>
    </div>
  );
}
