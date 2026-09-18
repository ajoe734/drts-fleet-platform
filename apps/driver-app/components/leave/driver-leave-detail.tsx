import React from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { DriverLeaveRecord } from "@drts/contracts";
import {
  DRV_LEAVE_STATUS,
  formatLeaveRangeZh,
  type LeaveStatusMeta,
} from "./leave-tokens";
import { LeaveStatusChip, LeaveTypeChip } from "./leave-chips";
import {
  Btn,
  Card,
  driverCanvasTheme,
  type DriverCanvasTheme,
} from "../canvas-primitives";

export interface DriverLeaveDetailProps {
  leave: DriverLeaveRecord;
  onBack: () => void;
  onWithdraw: (leaveId: string) => Promise<void>;
  onNavigateShiftImpact?: () => void;
  isWithdrawing?: boolean;
  theme?: DriverCanvasTheme;
}

export function DriverLeaveDetail({
  leave,
  onBack,
  onWithdraw,
  onNavigateShiftImpact,
  isWithdrawing = false,
  theme = driverCanvasTheme,
}: DriverLeaveDetailProps) {
  const isTerminal = leave.status !== "pending";
  const statusMeta: LeaveStatusMeta = DRV_LEAVE_STATUS[leave.status] ?? {
    zh: leave.status,
    tone: "neutral",
    code: leave.status,
  };
  const statusColor =
    statusMeta.tone === "success"
      ? theme.success
      : statusMeta.tone === "danger"
        ? theme.danger
        : statusMeta.tone === "warn"
          ? theme.warn
          : theme.info;

  const zhRange = formatLeaveRangeZh(leave.startTime, leave.endTime);

  const handleWithdraw = async () => {
    if (isTerminal || isWithdrawing) return;
    await onWithdraw(leave.leaveId);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        style={styles.scrollView}
      >
        {/* Section Header */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitleZh, { color: theme.text, fontFamily: theme.fontFamily }]}>
            請假詳情
          </Text>
          <Text
            style={[
              styles.sectionTitleEn,
              { color: theme.textDim, fontFamily: theme.monoFamily },
            ]}
          >
            leave-detail
          </Text>
        </View>

        {/* 1. Main Leave Card */}
        <Card
          padding={16}
          style={{ borderLeftWidth: 3, borderLeftColor: statusColor }}
          theme={theme}
        >
          <View style={styles.chipsRow}>
            <LeaveTypeChip theme={theme} type={leave.leaveType} />
            <LeaveStatusChip theme={theme} status={leave.status} />
          </View>
          <Text
            style={[
              styles.rangeTitle,
              { color: theme.text, fontFamily: theme.fontFamily },
            ]}
          >
            {zhRange}
          </Text>
          <Text
            style={[
              styles.reasonText,
              { color: theme.textMuted, fontFamily: theme.fontFamily },
            ]}
          >
            {leave.reason}
          </Text>
          <View
            style={[
              styles.metaFooter,
              { borderTopColor: theme.neutralBorder },
            ]}
          >
            <Text
              style={[
                styles.metaCode,
                { color: theme.textDim, fontFamily: theme.monoFamily },
              ]}
            >
              {leave.leaveId}
            </Text>
            <Text
              style={[
                styles.metaCode,
                { color: theme.textDim, fontFamily: theme.monoFamily },
              ]}
            >
              {leave.startTime} → {leave.endTime}
            </Text>
          </View>
        </Card>

        {/* 2. Review Timeline Card */}
        <Card padding={16} theme={theme}>
          <Text
            style={[
              styles.timelineHeader,
              { color: theme.textMuted, fontFamily: theme.fontFamily },
            ]}
          >
            審核紀錄 · review timeline
          </Text>

          {/* Event 1: 司機提交申請 */}
          <View style={styles.timelineRow}>
            <View style={styles.timelineTrack}>
              <View
                style={[styles.timelineDot, { backgroundColor: theme.accent }]}
              />
              {(leave.reviewedAt || leave.status === "withdrawn") && (
                <View
                  style={[
                    styles.timelineLine,
                    { backgroundColor: theme.border },
                  ]}
                />
              )}
            </View>
            <View style={styles.timelineContent}>
              <Text
                style={[
                  styles.timelineEventTitle,
                  { color: theme.text, fontFamily: theme.fontFamily },
                ]}
              >
                司機提交申請
              </Text>
              <Text
                style={[
                  styles.timelineEventTime,
                  { color: theme.textDim, fontFamily: theme.monoFamily },
                ]}
              >
                {leave.createdAt}
              </Text>
            </View>
          </View>

          {/* Event 2 (Withdrawn): 司機主動撤回 */}
          {leave.status === "withdrawn" && (
            <View style={styles.timelineRow}>
              <View style={styles.timelineTrack}>
                <View
                  style={[
                    styles.timelineDot,
                    { backgroundColor: theme.textDim },
                  ]}
                />
              </View>
              <View style={styles.timelineContent}>
                <Text
                  style={[
                    styles.timelineEventTitle,
                    { color: theme.text, fontFamily: theme.fontFamily },
                  ]}
                >
                  司機主動撤回
                </Text>
                <Text
                  style={[
                    styles.timelineEventTime,
                    { color: theme.textDim, fontFamily: theme.monoFamily },
                  ]}
                >
                  終態 · withdrawn
                </Text>
              </View>
            </View>
          )}

          {/* Event 2 (Reviewed): 主管核准 / 駁回 */}
          {leave.reviewedAt && (
            <View style={styles.timelineRow}>
              <View style={styles.timelineTrack}>
                <View
                  style={[styles.timelineDot, { backgroundColor: statusColor }]}
                />
              </View>
              <View style={styles.timelineContent}>
                <Text
                  style={[
                    styles.timelineEventTitle,
                    { color: theme.text, fontFamily: theme.fontFamily },
                  ]}
                >
                  {leave.status === "approved" ? "主管核准" : "主管駁回"}
                  {leave.reviewedByPrincipalId
                    ? ` · ${leave.reviewedByPrincipalId}`
                    : ""}
                </Text>
                <Text
                  style={[
                    styles.timelineEventTime,
                    { color: theme.textDim, fontFamily: theme.monoFamily },
                  ]}
                >
                  {leave.reviewedAt}
                </Text>
                {leave.reviewNotes ? (
                  <View
                    style={[
                      styles.reviewNotesBox,
                      { backgroundColor: theme.bgRaised },
                    ]}
                  >
                    <Text
                      style={[
                        styles.reviewNotesText,
                        { color: theme.text, fontFamily: theme.fontFamily },
                      ]}
                    >
                      {leave.reviewNotes}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          )}
        </Card>

        {/* 3. Shift Linkage Warning */}
        {leave.impactedShiftIds && leave.impactedShiftIds.length > 0 && (
          <Pressable
            accessibilityRole="button"
            onPress={onNavigateShiftImpact}
            style={[
              styles.impactBanner,
              {
                backgroundColor: theme.warnBg,
                borderColor: theme.warnBorder,
              },
            ]}
          >
            <Ionicons color={theme.warn} name="link-outline" size={18} />
            <Text
              style={[
                styles.impactBannerText,
                { color: theme.text, fontFamily: theme.fontFamily },
              ]}
            >
              已連動 {leave.impactedShiftIds.length}{" "}
              個班次調離，並停止此區間的派單媒合資格。點擊查看「班表連動」。
            </Text>
          </Pressable>
        )}
      </ScrollView>

      {/* Sticky Bottom Actions */}
      <View
        style={[
          styles.stickyFooter,
          {
            backgroundColor: theme.bgRaised,
            borderTopColor: theme.border,
          },
        ]}
      >
        {isTerminal ? (
          <View style={styles.terminalWrap}>
            <Text
              style={[
                styles.terminalInfo,
                { color: theme.textDim, fontFamily: theme.fontFamily },
              ]}
            >
              此假單已為終態，不可再變更
            </Text>
            <Btn
              onPress={onBack}
              style={styles.fullWidthBtn}
              theme={theme}
              variant="secondary"
            >
              返回列表
            </Btn>
          </View>
        ) : (
          <View style={styles.actionRow}>
            <Btn
              onPress={onBack}
              style={styles.backBtn}
              theme={theme}
              variant="secondary"
            >
              返回
            </Btn>
            <Btn
              danger
              disabled={isWithdrawing}
              onPress={handleWithdraw}
              style={styles.withdrawBtn}
              theme={theme}
              variant="primary"
            >
              {isWithdrawing ? "撤回中…" : "撤回申請"}
            </Btn>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 14,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
    marginBottom: 2,
  },
  sectionTitleZh: {
    fontSize: 16,
    fontWeight: "700",
  },
  sectionTitleEn: {
    fontSize: 11,
  },
  chipsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
    flexWrap: "wrap",
  },
  rangeTitle: {
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 4,
  },
  reasonText: {
    fontSize: 11.5,
    lineHeight: 18,
  },
  metaFooter: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    gap: 2,
  },
  metaCode: {
    fontSize: 10.5,
  },
  timelineHeader: {
    fontSize: 11.5,
    fontWeight: "700",
    marginBottom: 12,
  },
  timelineRow: {
    flexDirection: "row",
    gap: 10,
  },
  timelineTrack: {
    alignItems: "center",
    width: 12,
  },
  timelineDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    marginTop: 3,
  },
  timelineLine: {
    width: 1,
    flex: 1,
    marginVertical: 3,
  },
  timelineContent: {
    flex: 1,
    paddingBottom: 14,
  },
  timelineEventTitle: {
    fontSize: 12.5,
    fontWeight: "600",
  },
  timelineEventTime: {
    fontSize: 10.5,
    marginTop: 2,
  },
  reviewNotesBox: {
    marginTop: 6,
    borderRadius: 8,
    padding: 10,
  },
  reviewNotesText: {
    fontSize: 12,
    lineHeight: 18,
  },
  impactBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 9,
  },
  impactBannerText: {
    fontSize: 11.5,
    lineHeight: 17,
    flex: 1,
  },
  stickyFooter: {
    padding: 16,
    borderTopWidth: 1,
  },
  terminalWrap: {
    gap: 8,
    alignItems: "center",
  },
  terminalInfo: {
    fontSize: 11,
  },
  fullWidthBtn: {
    width: "100%",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  backBtn: {
    width: 88,
  },
  withdrawBtn: {
    flex: 1,
  },
});
