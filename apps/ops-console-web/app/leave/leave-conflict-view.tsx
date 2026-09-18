"use client";

import React from "react";
import {
  CanvasBanner as Banner,
  CanvasBtn as Btn,
  CanvasIcon,
  CanvasPageHeader as PageHeader,
  type CanvasTheme,
} from "@drts/ui-web";
import { LEAVE_OPS_COPY, tLeave } from "./translations";

export type OpsConflictVariant = "invalid_state" | "overlap";

export interface LeaveConflictViewProps {
  variant?: OpsConflictVariant;
  onRefresh: () => void;
  onBack: () => void;
  theme: CanvasTheme;
}

const CONFLICT_CONFIG = {
  invalid_state: {
    code: "409 · LEAVE_INVALID_STATE_TRANSITION",
    title: "此假單已被其他主管處理",
    body: "審核期間該假單狀態已由另一位主管更新為「已核准」，本次駁回操作被伺服器拒絕，避免雙重決策衝突。頁面已重新整理為最新狀態。",
  },
  overlap: {
    code: "409 · LEAVE_OVERLAPPING_REQUEST",
    title: "司機於此區間已有生效假單",
    body: "同一司機在 pending 或 approved 狀態下已有 lv_9c31a204（09/14–09/16）重疊區間之假單，系統阻擋本次核准以避免重複調離同一班次。",
  },
};

export function LeaveConflictView({
  variant = "invalid_state",
  onRefresh,
  onBack,
  theme,
}: LeaveConflictViewProps) {
  const cfg = CONFLICT_CONFIG[variant] ?? CONFLICT_CONFIG.invalid_state;

  return (
    <div>
      <PageHeader
        subtitle="決策動作被拒絕，無 override；需重新讀取最新資料後再處理"
        theme={theme}
        title={tLeave("conflictTitle")}
      />
      <div style={{ padding: 24, maxWidth: 760 }}>
        <div
          style={{
            border: "2px solid " + theme.danger,
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              background: theme.danger,
              color: "#fff",
              padding: "10px 16px",
              display: "flex",
              alignItems: "center",
              gap: 9,
            }}
          >
            <CanvasIcon name="warn" size={17} />
            <span style={{ fontSize: 14, fontWeight: 800 }}>{cfg.title}</span>
          </div>
          <div style={{ padding: 16, background: theme.bgRaised }}>
            <code
              style={{
                fontSize: 11,
                fontFamily: theme.monoFamily,
                color: theme.danger,
                background: theme.dangerBg,
                padding: "3px 10px",
                borderRadius: 999,
              }}
            >
              {cfg.code}
            </code>
            <div
              style={{
                marginTop: 10,
                fontSize: 13.5,
                color: theme.text,
                lineHeight: 1.65,
              }}
            >
              {cfg.body}
            </div>
            <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
              <Btn icon="refresh" onClick={onRefresh} theme={theme} variant="primary">
                {LEAVE_OPS_COPY.reloadLatestState}
              </Btn>
              <Btn onClick={onBack} theme={theme} variant="ghost">
                {LEAVE_OPS_COPY.backToQueue}
              </Btn>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <Banner
            body="無 override / force-approve 控制項；衝突必須依最新伺服器狀態重新決策。"
            icon="lock"
            theme={theme}
            tone="info"
          />
        </div>
      </div>
    </div>
  );
}
