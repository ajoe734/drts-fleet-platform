"use client";

import React, { useState } from "react";
import {
  CanvasCard as Card,
  CanvasEmptyState as EmptyState,
  CanvasPageHeader as PageHeader,
  CanvasTable as Table,
  type CanvasTableColumn,
  type CanvasTheme,
} from "@drts/ui-web";
import { OpsLeaveStatusChip, OpsLeaveTypeChip } from "./leave-chips";
import { fmtTaipei, type OpsLeaveRow } from "./leave-types";
import { LEAVE_OPS_COPY, tLeave } from "./translations";

export interface LeaveHistoryViewProps {
  rows: OpsLeaveRow[];
  theme: CanvasTheme;
  onSelectLeave?: (leave: OpsLeaveRow) => void;
}

export function LeaveHistoryView({
  rows,
  theme,
  onSelectLeave,
}: LeaveHistoryViewProps) {
  const [dateFilter, setDateFilter] = useState("all");
  const [decisionFilter, setDecisionFilter] = useState("all");

  const filteredRows = rows.filter((r) => {
    if (r.status === "pending") return false;
    if (decisionFilter !== "all" && r.status !== decisionFilter) return false;
    return true;
  });

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
      h: "結果",
      w: 110,
      r: (r) => <OpsLeaveStatusChip theme={theme} status={r.status} />,
    },
    {
      h: "時段（UTC+8）",
      w: 220,
      r: (r) => r.zhRange,
    },
    {
      h: "審核人",
      w: 150,
      r: (r) =>
        r.reviewedByPrincipalId || (
          <span style={{ color: theme.textDim }}>{LEAVE_OPS_COPY.withdrawnByDriver}</span>
        ),
    },
    {
      h: "審核時間（UTC+8）",
      w: 150,
      r: (r) =>
        r.reviewedAt ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <span style={{ fontFamily: theme.monoFamily, fontSize: 11 }}>
              {fmtTaipei(r.reviewedAt)}
            </span>
            <span
              style={{
                fontFamily: theme.monoFamily,
                fontSize: 9,
                color: theme.textDim,
              }}
            >
              {r.reviewedAt} UTC
            </span>
          </div>
        ) : (
          <span style={{ color: theme.textDim }}>—</span>
        ),
    },
    {
      h: "備註",
      w: 240,
      r: (r) => r.reviewNotes || <span style={{ color: theme.textDim }}>—</span>,
    },
  ];

  return (
    <div>
      <PageHeader
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <select
              onChange={(e) => setDateFilter(e.target.value)}
              style={{
                background: theme.bgRaised,
                border: `1px solid ${theme.border}`,
                color: theme.text,
                borderRadius: 7,
                padding: "6px 10px",
                fontSize: 12.5,
              }}
              value={dateFilter}
            >
              <option value="all">{LEAVE_OPS_COPY.timeRangeAll}</option>
              <option value="month">{LEAVE_OPS_COPY.timeRangeMonth}</option>
              <option value="week">{LEAVE_OPS_COPY.timeRangeWeek}</option>
            </select>
            <select
              onChange={(e) => setDecisionFilter(e.target.value)}
              style={{
                background: theme.bgRaised,
                border: `1px solid ${theme.border}`,
                color: theme.text,
                borderRadius: 7,
                padding: "6px 10px",
                fontSize: 12.5,
              }}
              value={decisionFilter}
            >
              <option value="all">{LEAVE_OPS_COPY.decisionAll}</option>
              <option value="approved">{LEAVE_OPS_COPY.decisionApproved}</option>
              <option value="rejected">{LEAVE_OPS_COPY.decisionRejected}</option>
              <option value="withdrawn">{LEAVE_OPS_COPY.decisionWithdrawn}</option>
            </select>
          </div>
        }
        subtitle="已決定 / 已終態假單稽核紀錄 — approved / rejected / withdrawn"
        theme={theme}
        title={tLeave("historyTitle")}
      />

      <div style={{ padding: 24 }}>
        {filteredRows.length === 0 ? (
          <EmptyState
            body="此篩選條件下沒有歷史紀錄。"
            theme={theme}
            title={tLeave("noHistoryTitle")}
          />
        ) : (
          <Card padding={0} theme={theme}>
            <Table
              columns={columns}
              rows={filteredRows}
              theme={theme}
            />
          </Card>
        )}
      </div>
    </div>
  );
}
