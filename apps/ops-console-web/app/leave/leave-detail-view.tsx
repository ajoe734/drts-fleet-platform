"use client";

import React, { useState } from "react";
import type { ReviewDriverLeaveCommand } from "@drts/contracts";
import {
  ActionButton,
  CanvasBanner as Banner,
  CanvasCard as Card,
  CanvasDL as DL,
  CanvasEmptyState as EmptyState,
  CanvasField as Field,
  CanvasIcon,
  CanvasPageHeader as PageHeader,
  type CanvasTheme,
} from "@drts/ui-web";
import { OpsLeaveStatusChip, OpsLeaveTypeChip } from "./leave-chips";
import { fmtTaipei, type OpsLeaveRow } from "./leave-types";
import { LEAVE_OPS_COPY, tLeave } from "./translations";

export interface LeaveDetailViewProps {
  leave: OpsLeaveRow;
  onDecision: (leaveId: string, command: ReviewDriverLeaveCommand) => Promise<void>;
  onBack: () => void;
  theme: CanvasTheme;
  isSubmitting?: boolean;
}

export function LeaveDetailView({
  leave,
  onDecision,
  onBack,
  theme,
  isSubmitting = false,
}: LeaveDetailViewProps) {
  const [reviewNotes, setReviewNotes] = useState<string>("");

  const handleApprove = async () => {
    if (isSubmitting) return;
    await onDecision(leave.leaveId, {
      decision: "approve",
      ...(reviewNotes.trim() ? { reviewNotes: reviewNotes.trim() } : {}),
    });
  };

  const handleReject = async () => {
    if (isSubmitting) return;
    await onDecision(leave.leaveId, {
      decision: "reject",
      ...(reviewNotes.trim() ? { reviewNotes: reviewNotes.trim() } : {}),
    });
  };

  const previewShifts = leave.previewShiftIds ?? [];

  return (
    <div>
      <PageHeader
        actions={
          leave.status === "pending" ? (
            <div style={{ display: "flex", gap: 8 }}>
              <ActionButton
                disabled={isSubmitting}
                icon="check"
                label={isSubmitting ? "處理中…" : "核准"}
                onClick={handleApprove}
                size="md"
                theme={theme}
                variant="primary"
              />
              <ActionButton
                danger
                disabled={isSubmitting}
                icon="x"
                label={isSubmitting ? "處理中…" : "駁回"}
                onClick={handleReject}
                size="md"
                theme={theme}
                variant="secondary"
              />
            </div>
          ) : undefined
        }
        subtitle={`${leave.zhRange} · 提交於 ${fmtTaipei(leave.createdAt)} (UTC+8) · ${leave.createdAt} UTC`}
        theme={theme}
        title={
          <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
            {leave.driver}
            <OpsLeaveTypeChip theme={theme} type={leave.leaveType} />
            <OpsLeaveStatusChip theme={theme} status={leave.status} />
          </span>
        }
      />

      <div
        style={{
          padding: 24,
          display: "grid",
          gridTemplateColumns: "1.3fr 1fr",
          gap: 16,
          alignItems: "start",
        }}
      >
        {/* Left Card: 申請內容 */}
        <Card theme={theme} title={tLeave("requestContentTitle")}>
          <DL
            cols={2}
            items={[
              { k: "leaveId", v: leave.leaveId, mono: true },
              { k: "driverId", v: leave.driverId, mono: true },
              { k: "leaveType", v: leave.leaveType, mono: true },
              { k: "status", v: <OpsLeaveStatusChip theme={theme} status={leave.status} /> },
              { k: "startTime (UTC)", v: leave.startTime, mono: true },
              { k: "endTime (UTC)", v: leave.endTime, mono: true },
            ]}
            theme={theme}
          />
          <div style={{ marginTop: 12 }}>
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 600,
                color: theme.textMuted,
                textTransform: "uppercase",
                letterSpacing: 0.4,
                marginBottom: 4,
              }}
            >
              reason
            </div>
            <div
              style={{
                fontSize: 12.5,
                color: theme.text,
                lineHeight: 1.55,
                background: theme.bgRaised,
                borderRadius: 8,
                padding: "10px 12px",
              }}
            >
              {leave.reason}
            </div>
          </div>
          {leave.status === "pending" ? (
            <div style={{ marginTop: 14 }}>
              <Field
                hint="選填，核准／駁回皆可填寫；會寫入 ReviewDriverLeaveCommand.reviewNotes（契約未強制駁回必填）"
                label="審核備註 · reviewNotes"
                theme={theme}
              >
                <input
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder={LEAVE_OPS_COPY.reviewNotesPlaceholder}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    background: theme.bgRaised,
                    border: `1px solid ${theme.border}`,
                    borderRadius: 7,
                    padding: "7px 10px",
                    fontSize: 12.5,
                    color: theme.text,
                    fontFamily: theme.fontFamily,
                  }}
                  value={reviewNotes}
                />
              </Field>
            </div>
          ) : (
            leave.reviewNotes && (
              <div style={{ marginTop: 14 }}>
                <div
                  style={{
                    fontSize: 10.5,
                    fontWeight: 600,
                    color: theme.textMuted,
                    textTransform: "uppercase",
                    letterSpacing: 0.4,
                    marginBottom: 4,
                  }}
                >
                  reviewNotes
                </div>
                <div
                  style={{
                    fontSize: 12.5,
                    color: theme.text,
                    background: theme.bgRaised,
                    borderRadius: 8,
                    padding: "10px 12px",
                  }}
                >
                  {leave.reviewNotes}
                </div>
              </div>
            )
          )}
        </Card>

        {/* Right Card: 班次重疊預覽 */}
        <Card
          subtitle="核准後才會寫入 DriverLeaveRecord.impactedShiftIds"
          theme={theme}
          title={tLeave("shiftOverlapTitle")}
        >
          {previewShifts.length === 0 ? (
            <EmptyState
              body="此區間目前無重疊班次。"
              theme={theme}
              title={tLeave("noShiftOverlapTitle")}
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {previewShifts.map((id) => (
                <div
                  key={id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 10px",
                    background: theme.warnBg,
                    border: "1px solid " + theme.warnBorder,
                    borderRadius: 8,
                  }}
                >
                  <CanvasIcon name="warn" size={14} style={{ color: theme.warn }} />
                  <span
                    style={{
                      flex: 1,
                      fontSize: 12,
                      fontFamily: theme.monoFamily,
                      color: theme.text,
                    }}
                  >
                    {id}
                  </span>
                  <span
                    style={{
                      fontSize: 10.5,
                      color: theme.warn,
                      fontWeight: 600,
                    }}
                  >
                    {LEAVE_OPS_COPY.reassignNotice}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 10 }}>
            <Banner
              body="核准後同步壓制該司機此區間之派單資格（driver_matching_suppressions），司機端自動下線。"
              icon="info"
              theme={theme}
              tone="info"
            />
          </div>
          <div style={{ marginTop: 14 }}>
            <button
              onClick={onBack}
              style={{
                background: "transparent",
                border: `1px solid ${theme.border}`,
                color: theme.textMuted,
                borderRadius: 6,
                padding: "6px 12px",
                fontSize: 12,
                cursor: "pointer",
              }}
              type="button"
            >
              {LEAVE_OPS_COPY.backToQueue}
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}
