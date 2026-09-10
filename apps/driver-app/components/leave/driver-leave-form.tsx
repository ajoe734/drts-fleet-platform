import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type {
  CreateDriverLeaveCommand,
  DriverLeaveRecord,
  DriverLeaveType,
} from "@drts/contracts";
import {
  DRV_LEAVE_TYPE,
  MAX_PAST_APPLICATION_GRACE_MS,
  checkLeaveOverlap,
  fmtTaipei,
  validateLeaveTimeRange,
  type LeaveTypeMeta,
} from "./leave-tokens";
import {
  Btn,
  driverCanvasTheme,
  type DriverCanvasTheme,
} from "../canvas-primitives";

export interface DriverLeaveFormProps {
  onSubmit: (command: CreateDriverLeaveCommand) => Promise<void>;
  onCancel: () => void;
  existingLeaves?: DriverLeaveRecord[];
  initialValues?: Partial<CreateDriverLeaveCommand>;
  theme?: DriverCanvasTheme;
  variant?:
    | "default"
    | "error_range"
    | "error_order"
    | "error_invalid"
    | "error_overlap"
    | "keyboard";
  isSubmitting?: boolean;
  serverError?: string | null;
}

export function DriverLeaveForm({
  onSubmit,
  onCancel,
  existingLeaves = [],
  initialValues,
  theme = driverCanvasTheme,
  variant = "default",
  isSubmitting = false,
  serverError = null,
}: DriverLeaveFormProps) {
  const insets = useSafeAreaInsets();

  // Preset demo values based on variant
  const getPresetValues = () => {
    switch (variant) {
      case "error_range":
        return {
          type: (initialValues?.leaveType ?? "personal") as DriverLeaveType,
          start: "2026-09-01T01:00:00Z", // Too early
          end: "2026-09-10T13:00:00Z",
          reason: initialValues?.reason ?? "家中臨時事務，需請假處理。",
        };
      case "error_order":
        return {
          type: (initialValues?.leaveType ?? "personal") as DriverLeaveType,
          start: "2026-09-10T13:00:00Z",
          end: "2026-09-10T08:00:00Z", // end <= start
          reason: initialValues?.reason ?? "家中臨時事務，需請假處理。",
        };
      case "error_invalid":
        return {
          type: (initialValues?.leaveType ?? "personal") as DriverLeaveType,
          start: "invalid-date",
          end: "2026-09-10T13:00:00Z",
          reason: initialValues?.reason ?? "家中臨時事務，需請假處理。",
        };
      case "error_overlap":
        return {
          type: (initialValues?.leaveType ?? "personal") as DriverLeaveType,
          start: "2026-09-15T01:00:00Z", // Inside lv_9c31a204 (09/14-09/16)
          end: "2026-09-15T10:00:00Z",
          reason: initialValues?.reason ?? "家中臨時事務，需請假處理。",
        };
      case "keyboard":
      case "default":
      default:
        return {
          type: (initialValues?.leaveType ?? "personal") as DriverLeaveType,
          start: initialValues?.startTime ?? "2026-09-10T08:00:00Z",
          end: initialValues?.endTime ?? "2026-09-10T13:00:00Z",
          reason: initialValues?.reason ?? "家中臨時事務，需請假處理。",
        };
    }
  };

  const preset = getPresetValues();
  const [leaveType, setLeaveType] = useState<DriverLeaveType>(preset.type);
  const [startTime, setStartTime] = useState<string>(preset.start);
  const [endTime, setEndTime] = useState<string>(preset.end);
  const [reason, setReason] = useState<string>(preset.reason);
  const [isFocusedReason, setIsFocusedReason] = useState(variant === "keyboard");

  // Local validation
  const validation = validateLeaveTimeRange(startTime, endTime);
  const overlapCheck = checkLeaveOverlap(startTime, endTime, existingLeaves);
  const isOverlap = variant === "error_overlap" || overlapCheck.overlaps;

  const startErr =
    validation.field === "start"
      ? validation.message
      : null;
  const endErr =
    validation.field === "end"
      ? validation.message
      : null;

  const hasFormError = !validation.valid || isOverlap || !reason.trim();

  const handleSubmit = async () => {
    if (hasFormError || isSubmitting) return;
    await onSubmit({
      leaveType,
      startTime,
      endTime,
      reason: reason.trim(),
    });
  };

  const keyboardOpen = variant === "keyboard" || isFocusedReason;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[styles.container, { backgroundColor: theme.bg }]}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 16 },
        ]}
        keyboardShouldPersistTaps="handled"
        style={styles.scrollView}
      >
        {/* Section Header */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitleZh, { color: theme.text, fontFamily: theme.fontFamily }]}>
            申請請假
          </Text>
          <Text
            style={[
              styles.sectionTitleEn,
              { color: theme.textDim, fontFamily: theme.monoFamily },
            ]}
          >
            new-leave-request
          </Text>
        </View>

        {/* Server Error */}
        {serverError && (
          <View
            style={[
              styles.errorBox,
              {
                backgroundColor: theme.dangerBg,
                borderColor: theme.dangerBorder,
              },
            ]}
          >
            <Ionicons color={theme.danger} name="alert-circle" size={16} />
            <Text style={[styles.errorBoxText, { color: theme.danger }]}>
              {serverError}
            </Text>
          </View>
        )}

        {/* 1. Leave Type Selector */}
        <View style={styles.fieldRow}>
          <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>
            假別 · leave type
          </Text>
          <View style={styles.typeSelectorWrap}>
            {(Object.entries(DRV_LEAVE_TYPE) as [DriverLeaveType, LeaveTypeMeta][]).map(
              ([k, meta]) => {
                const selected = leaveType === k;
                return (
                  <Pressable
                    accessibilityRole="button"
                    key={k}
                    onPress={() => setLeaveType(k)}
                    style={[
                      styles.typePill,
                      {
                        backgroundColor: selected
                          ? theme.accentBg
                          : theme.bgRaised,
                        borderColor: selected
                          ? theme.accent
                          : theme.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.typePillText,
                        {
                          color: selected ? theme.accent : theme.textMuted,
                          fontFamily: theme.fontFamily,
                        },
                      ]}
                    >
                      {meta.zh}
                    </Text>
                  </Pressable>
                );
              },
            )}
          </View>
        </View>

        {/* 2. Start Time */}
        <View style={styles.fieldRow}>
          <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>
            開始時間 · start (Asia/Taipei · UTC+8)
          </Text>
          <View
            style={[
              styles.timeInputBox,
              {
                backgroundColor: theme.bgRaised,
                borderColor: startErr ? theme.danger : theme.border,
              },
            ]}
          >
            <Ionicons
              color={startErr ? theme.danger : theme.textMuted}
              name="time-outline"
              size={18}
            />
            <Text
              style={[
                styles.timeZhText,
                { color: theme.text, fontFamily: theme.fontFamily },
              ]}
            >
              {fmtTaipei(startTime)}
            </Text>
            <Text
              style={[
                styles.timeUtcText,
                { color: theme.textDim, fontFamily: theme.monoFamily },
              ]}
            >
              {startTime}
            </Text>
          </View>
          {startErr ? (
            <Text style={[styles.fieldErrorText, { color: theme.danger }]}>
              {startErr}
            </Text>
          ) : null}
        </View>

        {/* 3. End Time */}
        <View style={styles.fieldRow}>
          <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>
            結束時間 · end (Asia/Taipei · UTC+8)
          </Text>
          <View
            style={[
              styles.timeInputBox,
              {
                backgroundColor: theme.bgRaised,
                borderColor: endErr ? theme.danger : theme.border,
              },
            ]}
          >
            <Ionicons
              color={endErr ? theme.danger : theme.textMuted}
              name="time-outline"
              size={18}
            />
            <Text
              style={[
                styles.timeZhText,
                { color: theme.text, fontFamily: theme.fontFamily },
              ]}
            >
              {fmtTaipei(endTime)}
            </Text>
            <Text
              style={[
                styles.timeUtcText,
                { color: theme.textDim, fontFamily: theme.monoFamily },
              ]}
            >
              {endTime}
            </Text>
          </View>
          {endErr ? (
            <Text style={[styles.fieldErrorText, { color: theme.danger }]}>
              {endErr}
            </Text>
          ) : null}
        </View>

        {/* Policy Notice Banner */}
        <View
          style={[
            styles.noticeBanner,
            {
              backgroundColor: theme.infoBg,
              borderColor: theme.infoBorder,
            },
          ]}
        >
          <Ionicons
            color={theme.info}
            name="shield-checkmark-outline"
            size={16}
          />
          <Text
            style={[
              styles.noticeBannerText,
              { color: theme.text, fontFamily: theme.fontFamily },
            ]}
          >
            畫面以裝置時區 Asia/Taipei（UTC+8）顯示；送出時轉為 UTC 標準化。允許 15 分鐘寬限期（
            <Text style={{ fontFamily: theme.monoFamily }}>
              MAX_PAST_APPLICATION_GRACE_MS
            </Text>
            ），逾期一律拒絕。
          </Text>
        </View>

        {/* Overlap Error Banner */}
        {isOverlap && (
          <View
            style={[
              styles.overlapBanner,
              {
                backgroundColor: theme.dangerBg,
                borderColor: theme.dangerBorder,
              },
            ]}
          >
            <View style={styles.overlapBannerHeader}>
              <Ionicons color={theme.danger} name="warning-outline" size={18} />
              <Text style={[styles.overlapTitle, { color: theme.danger }]}>
                409 · LEAVE_OVERLAPPING_REQUEST
              </Text>
            </View>
            <Text
              style={[
                styles.overlapText,
                { color: theme.text, fontFamily: theme.fontFamily },
              ]}
            >
              此區間與既有假單{" "}
              <Text style={{ fontFamily: theme.monoFamily }}>
                {overlapCheck.overlappingLeave?.leaveId ?? "lv_9c31a204"}
              </Text>
              （09/14–09/16 · approved）重疊，同一司機的 pending / approved 假單不得重疊送出。
            </Text>
          </View>
        )}

        {/* 4. Reason */}
        <View style={styles.fieldRow}>
          <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>
            事由 · reason
          </Text>
          <TextInput
            multiline
            numberOfLines={3}
            onBlur={() => setIsFocusedReason(false)}
            onChangeText={setReason}
            onFocus={() => setIsFocusedReason(true)}
            placeholder="家中臨時事務，需請假處理…"
            placeholderTextColor={theme.textDim}
            style={[
              styles.reasonInput,
              {
                backgroundColor: theme.bgRaised,
                color: theme.text,
                borderColor: isFocusedReason ? theme.accent : theme.border,
                fontFamily: theme.fontFamily,
              },
              isFocusedReason && {
                shadowColor: theme.accent,
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.3,
                shadowRadius: 4,
              },
            ]}
            value={reason}
          />
        </View>
      </ScrollView>

      {/* Sticky Bottom Action (Fixed Above Keyboard) */}
      <View
        style={[
          styles.stickyActionRow,
          {
            backgroundColor: theme.bgRaised,
            borderTopColor: theme.border,
          },
        ]}
      >
        {keyboardOpen && (
          <Text
            style={[
              styles.keyboardInfoText,
              { color: theme.textDim, fontFamily: theme.fontFamily },
            ]}
          >
            送出列固定於鍵盤上緣，不被系統鍵盤遮蔽
          </Text>
        )}
        <View style={styles.actionsFlex}>
          <Btn
            onPress={onCancel}
            style={styles.cancelBtn}
            theme={theme}
            variant="secondary"
          >
            取消
          </Btn>
          <Btn
            disabled={hasFormError || isSubmitting}
            onPress={handleSubmit}
            style={styles.submitBtn}
            theme={theme}
            variant="primary"
          >
            {isSubmitting ? "送出中…" : "送出申請"}
          </Btn>
        </View>
      </View>

      {/* Simulated Keyboard Safe-Area Footer (matching canvas) */}
      {keyboardOpen && (
        <View
          style={[
            styles.keyboardSafeFooter,
            {
              backgroundColor: theme.bgRaised,
              borderTopColor: theme.border,
            },
          ]}
        >
          <Text
            style={[
              styles.keyboardSafeText,
              { color: theme.textDim, fontFamily: theme.monoFamily },
            ]}
          >
            iOS / Android 鍵盤 · keyboard-avoiding-view · safe-area-inset-bottom
          </Text>
        </View>
      )}
    </KeyboardAvoidingView>
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
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
  },
  errorBoxText: {
    fontSize: 12,
    flex: 1,
  },
  fieldRow: {
    marginBottom: 4,
  },
  fieldLabel: {
    fontSize: 11.5,
    fontWeight: "600",
    marginBottom: 6,
  },
  fieldErrorText: {
    fontSize: 11,
    marginTop: 5,
    lineHeight: 15,
  },
  typeSelectorWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  typePill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  typePillText: {
    fontSize: 12,
    fontWeight: "600",
  },
  timeInputBox: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1.5,
    gap: 8,
  },
  timeZhText: {
    flex: 1,
    fontSize: 13.5,
  },
  timeUtcText: {
    fontSize: 10,
  },
  noticeBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 10,
    borderRadius: 9,
    borderWidth: 1,
    gap: 8,
  },
  noticeBannerText: {
    fontSize: 11,
    lineHeight: 16,
    flex: 1,
  },
  overlapBanner: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 6,
  },
  overlapBannerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  overlapTitle: {
    fontSize: 12.5,
    fontWeight: "700",
  },
  overlapText: {
    fontSize: 11.5,
    lineHeight: 17,
  },
  reasonInput: {
    minHeight: 76,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    fontSize: 13.5,
    textAlignVertical: "top",
  },
  stickyActionRow: {
    padding: 16,
    borderTopWidth: 1,
    gap: 8,
  },
  keyboardInfoText: {
    fontSize: 10.5,
    textAlign: "center",
  },
  actionsFlex: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  cancelBtn: {
    width: 88,
  },
  submitBtn: {
    flex: 1,
  },
  keyboardSafeFooter: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderTopWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  keyboardSafeText: {
    fontSize: 10.5,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
});
