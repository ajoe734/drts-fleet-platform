"use client";

import React from "react";
import {
  CanvasBanner as Banner,
  CanvasCard as Card,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasTable as Table,
  type CanvasTableColumn,
  type CanvasTheme,
} from "@drts/ui-web";
import { FX_OPS_SHIFT_BOARD, type OpsShiftBoardRow } from "./leave-types";
import { LEAVE_OPS_COPY, tLeave } from "./translations";

export interface LeaveShiftImpactViewProps {
  board?: OpsShiftBoardRow[];
  theme: CanvasTheme;
}

export function LeaveShiftImpactView({
  board = FX_OPS_SHIFT_BOARD,
  theme,
}: LeaveShiftImpactViewProps) {
  const columns: CanvasTableColumn<OpsShiftBoardRow>[] = [
    {
      h: "班次 ID",
      w: 120,
      r: (r) => (
        <span style={{ fontFamily: theme.monoFamily, fontSize: 11.5 }}>
          {r.shift}
        </span>
      ),
    },
    {
      h: "司機",
      w: 140,
      r: (r) => (
        <Pill dot theme={theme} tone="driver">
          {r.driver}
        </Pill>
      ),
    },
    {
      h: "時段",
      w: 200,
      r: (r) => r.zh,
    },
    {
      h: "調離標記",
      w: 130,
      r: (r) =>
        r.tagged ? (
          <Pill dot theme={theme} tone="warn">
            {LEAVE_OPS_COPY.shiftReassigned}
            <span
              style={{
                marginLeft: 4,
                opacity: 0.6,
                fontFamily: theme.monoFamily,
                fontSize: 9,
              }}
            >
              leaveReassigned
            </span>
          </Pill>
        ) : r.pendingReview ? (
          <Pill theme={theme} tone="neutral">
            {LEAVE_OPS_COPY.pendingReview}
          </Pill>
        ) : (
          <Pill theme={theme} tone="success">
            {LEAVE_OPS_COPY.regularShift}
          </Pill>
        ),
    },
    {
      h: "派單資格",
      w: 130,
      r: (r) =>
        r.elig === "ineligible" ? (
          <Pill dot theme={theme} tone="danger">
            {LEAVE_OPS_COPY.ineligibleStatus}
          </Pill>
        ) : (
          <Pill dot theme={theme} tone="success">
            {LEAVE_OPS_COPY.eligibleStatus}
          </Pill>
        ),
    },
  ];

  return (
    <div>
      <PageHeader
        subtitle="ops.phase1_driver_shifts.record.leaveReassigned × ops.phase1_driver_matching_suppressions"
        theme={theme}
        title={tLeave("shiftSuppressionTitle")}
      />
      <div style={{ padding: 24 }}>
        <Card padding={0} theme={theme}>
          <Table columns={columns} rows={board} theme={theme} />
        </Card>
        <div style={{ marginTop: 12 }}>
          <Banner
            body="核准請假起始時間到達時，調度核心自動於 driver_matching_suppressions 建立紀錄（reason: DRIVER_ON_LEAVE），已上線司機立即被排除於候選名單並下線；毋須主管手動下架班表。"
            icon="warn"
            theme={theme}
            title={tLeave("autoSyncNotice")}
            tone="warn"
          />
        </div>
      </div>
    </div>
  );
}
