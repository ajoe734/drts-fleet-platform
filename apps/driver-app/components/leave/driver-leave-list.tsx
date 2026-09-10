import React from "react";
import {
  ActivityIndicator,
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

export interface DriverLeaveListProps {
  leaves: DriverLeaveRecord[];
  isLoading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
  onSelectLeave?: (leave: DriverLeaveRecord) => void;
  onCreatePress?: () => void;
  theme?: DriverCanvasTheme;
  variant?: "default" | "empty";
}

export function DriverLeaveList({
  leaves,
  isLoading = false,
  error = null,
  onRefresh,
  onSelectLeave,
  onCreatePress,
  theme = driverCanvasTheme,
  variant = "default",
}: DriverLeaveListProps) {
  const displayLeaves = variant === "empty" ? [] : leaves;
  const isEmpty = displayLeaves.length === 0 && !isLoading;

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        style={styles.scrollView}
      >
        {/* Section Header */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitleZh, { color: theme.text, fontFamily: theme.fontFamily }]}>
            我的請假
          </Text>
          <Text
            style={[
              styles.sectionTitleEn,
              { color: theme.textDim, fontFamily: theme.monoFamily },
            ]}
          >
            my-leave
          </Text>
        </View>

        {/* Loading State */}
        {isLoading && (
          <View style={styles.centerBox}>
            <ActivityIndicator color={theme.accent} size="large" />
            <Text style={[styles.loadingText, { color: theme.textMuted }]}>
              讀取中…
            </Text>
          </View>
        )}

        {/* Error State */}
        {error && !isLoading && (
          <View
            style={[
              styles.errorCard,
              {
                backgroundColor: theme.dangerBg,
                borderColor: theme.dangerBorder,
              },
            ]}
          >
            <Ionicons color={theme.danger} name="alert-circle-outline" size={20} />
            <View style={styles.errorTextWrap}>
              <Text style={[styles.errorTitle, { color: theme.danger }]}>
                讀取失敗
              </Text>
              <Text style={[styles.errorMsg, { color: theme.text }]}>
                {error}
              </Text>
            </View>
            {onRefresh && (
              <Pressable
                accessibilityRole="button"
                onPress={onRefresh}
                style={[styles.retryBtn, { borderColor: theme.danger }]}
              >
                <Text style={[styles.retryBtnText, { color: theme.danger }]}>
                  重試
                </Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Empty State */}
        {isEmpty && !error && (
          <View
            style={[
              styles.emptyCard,
              {
                backgroundColor: theme.bgRaised,
                borderColor: theme.border,
              },
            ]}
          >
            <Ionicons
              color={theme.textDim}
              name="calendar-outline"
              size={40}
            />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>
              尚無任何請假紀錄
            </Text>
            <Text style={[styles.emptySubtitle, { color: theme.textMuted }]}>
              尚無任何請假紀錄。點擊下方按鈕提出新的請假申請。
            </Text>
          </View>
        )}

        {/* Leaves List */}
        {!isLoading &&
          displayLeaves.map((lv) => {
            const statusMeta: LeaveStatusMeta = DRV_LEAVE_STATUS[lv.status] ?? {
              zh: lv.status,
              tone: "neutral",
              code: lv.status,
            };
            const zhRange = formatLeaveRangeZh(lv.startTime, lv.endTime);
            const statusColor =
              statusMeta.tone === "success"
                ? theme.success
                : statusMeta.tone === "danger"
                  ? theme.danger
                  : statusMeta.tone === "warn"
                    ? theme.warn
                    : theme.info;

            return (
              <Pressable
                accessibilityRole="button"
                key={lv.leaveId}
                onPress={() => onSelectLeave?.(lv)}
                style={({ pressed }) => [
                  styles.cardPressable,
                  pressed && { opacity: 0.8 },
                ]}
              >
                <Card
                  padding={14}
                  style={[styles.card, { borderLeftWidth: 3, borderLeftColor: statusColor }]}
                  theme={theme}
                >
                  <View style={styles.cardHeader}>
                    <View style={styles.chipsRow}>
                      <LeaveTypeChip theme={theme} type={lv.leaveType} />
                      <LeaveStatusChip theme={theme} status={lv.status} />
                    </View>
                    <Ionicons
                      color={theme.textDim}
                      name="chevron-forward"
                      size={16}
                    />
                  </View>

                  <Text
                    style={[
                      styles.rangeText,
                      { color: theme.text, fontFamily: theme.fontFamily },
                    ]}
                  >
                    {zhRange}
                  </Text>

                  <Text
                    numberOfLines={2}
                    style={[
                      styles.reasonText,
                      { color: theme.textMuted, fontFamily: theme.fontFamily },
                    ]}
                  >
                    {lv.reason}
                  </Text>

                  {lv.impactedShiftIds && lv.impactedShiftIds.length > 0 && (
                    <View style={styles.shiftImpactRow}>
                      <Ionicons
                        color={theme.warn}
                        name="link-outline"
                        size={14}
                      />
                      <Text
                        style={[
                          styles.shiftImpactText,
                          { color: theme.warn, fontFamily: theme.fontFamily },
                        ]}
                      >
                        {lv.impactedShiftIds.length} 個班次已調離
                      </Text>
                    </View>
                  )}

                  <View
                    style={[
                      styles.cardFooter,
                      { borderTopColor: theme.neutralBorder },
                    ]}
                  >
                    <Text
                      style={[
                        styles.leaveIdText,
                        { color: theme.textDim, fontFamily: theme.monoFamily },
                      ]}
                    >
                      {lv.leaveId}
                    </Text>
                  </View>
                </Card>
              </Pressable>
            );
          })}
      </ScrollView>

      {/* Sticky Bottom Action */}
      <View
        style={[
          styles.stickyAction,
          {
            backgroundColor: theme.bgRaised,
            borderTopColor: theme.border,
          },
        ]}
      >
        <Btn
          onPress={onCreatePress}
          style={styles.createBtn}
          theme={theme}
          variant="primary"
        >
          申請請假
        </Btn>
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
    paddingBottom: 24,
    gap: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
    marginBottom: 4,
  },
  sectionTitleZh: {
    fontSize: 16,
    fontWeight: "700",
  },
  sectionTitleEn: {
    fontSize: 11,
  },
  centerBox: {
    padding: 36,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  loadingText: {
    fontSize: 13,
  },
  errorCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
  },
  errorTextWrap: {
    flex: 1,
  },
  errorTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  errorMsg: {
    fontSize: 12,
    marginTop: 2,
  },
  retryBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
  },
  retryBtnText: {
    fontSize: 12,
    fontWeight: "600",
  },
  emptyCard: {
    padding: 32,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginVertical: 16,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  emptySubtitle: {
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
    maxWidth: 260,
  },
  cardPressable: {
    marginBottom: 4,
  },
  card: {
    borderRadius: 10,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  chipsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  rangeText: {
    fontSize: 13.5,
    fontWeight: "700",
    marginBottom: 4,
  },
  reasonText: {
    fontSize: 11.5,
    lineHeight: 16,
  },
  shiftImpactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  shiftImpactText: {
    fontSize: 11,
    fontWeight: "600",
  },
  cardFooter: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
  },
  leaveIdText: {
    fontSize: 10.5,
  },
  stickyAction: {
    padding: 16,
    borderTopWidth: 1,
  },
  createBtn: {
    width: "100%",
  },
});
