import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  Btn,
  Card,
  Pill,
  driverCanvasTheme,
  type DriverCanvasTheme,
} from "../canvas-primitives";

export interface ShiftImpactItem {
  id: string;
  zh: string;
  tagged: boolean;
}

export interface DriverLeaveShiftImpactProps {
  shifts?: ShiftImpactItem[];
  onBack?: () => void;
  theme?: DriverCanvasTheme;
}

export function DriverLeaveShiftImpact({
  shifts = [],
  onBack,
  theme = driverCanvasTheme,
}: DriverLeaveShiftImpactProps) {
  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        style={styles.scrollView}
      >
        {/* Section Header */}
        <View style={styles.sectionHeader}>
          <Text
            style={[
              styles.sectionTitleZh,
              { color: theme.text, fontFamily: theme.fontFamily },
            ]}
          >
            班表連動
          </Text>
          <Text
            style={[
              styles.sectionTitleEn,
              { color: theme.textDim, fontFamily: theme.monoFamily },
            ]}
          >
            shift-reassignment-linkage
          </Text>
        </View>

        {/* Info Banner */}
        <View
          style={[
            styles.infoBanner,
            {
              backgroundColor: theme.infoBg,
              borderColor: theme.infoBorder,
            },
          ]}
        >
          <Ionicons
            color={theme.info}
            name="shield-checkmark-outline"
            size={18}
          />
          <Text
            style={[
              styles.infoBannerText,
              { color: theme.text, fontFamily: theme.fontFamily },
            ]}
          >
            核准後系統比對{" "}
            <Text style={{ fontFamily: theme.monoFamily }}>
              ops.phase1_driver_shifts
            </Text>{" "}
            排班，重疊班次寫入{" "}
            <Text style={{ fontFamily: theme.monoFamily }}>
              {"{ leaveReassigned: true, leaveId }"}
            </Text>{" "}
            並停止該區間可派狀態。
          </Text>
        </View>

        {/* Shifts List */}
        {shifts.map((s) => (
          <Card
            key={s.id}
            padding={12}
            style={[
              styles.shiftCard,
              {
                borderLeftWidth: 3,
                borderLeftColor: s.tagged ? theme.warn : theme.border,
              },
            ]}
            theme={theme}
          >
            <View style={styles.shiftRow}>
              <View style={styles.shiftMeta}>
                <Text
                  style={[
                    styles.shiftZh,
                    { color: theme.text, fontFamily: theme.fontFamily },
                  ]}
                >
                  {s.zh}
                </Text>
                <Text
                  style={[
                    styles.shiftId,
                    { color: theme.textDim, fontFamily: theme.monoFamily },
                  ]}
                >
                  {s.id}
                </Text>
              </View>
              {s.tagged ? (
                <Pill dot theme={theme} tone="warn">
                  請假調離
                </Pill>
              ) : (
                <Pill dot theme={theme} tone="success">
                  正常排班
                </Pill>
              )}
            </View>
          </Card>
        ))}

        {/* Suppression Notice Banner */}
        <View
          style={[
            styles.suppressionNotice,
            { backgroundColor: theme.bgRaised },
          ]}
        >
          <Ionicons color={theme.textMuted} name="wifi-outline" size={16} />
          <Text
            style={[
              styles.suppressionText,
              { color: theme.textMuted, fontFamily: theme.fontFamily },
            ]}
          >
            派單資格{" "}
            <Text style={{ fontFamily: theme.monoFamily }}>eligibility</Text>{" "}
            於假期生效時自動轉為{" "}
            <Text style={{ fontFamily: theme.monoFamily }}>ineligible</Text>
            ，並寫入{" "}
            <Text style={{ fontFamily: theme.monoFamily }}>
              ops.phase1_driver_matching_suppressions
            </Text>
            （reason: DRIVER_ON_LEAVE）。
          </Text>
        </View>
      </ScrollView>

      {onBack && (
        <View
          style={[
            styles.footer,
            {
              backgroundColor: theme.bgRaised,
              borderTopColor: theme.border,
            },
          ]}
        >
          <Btn
            onPress={onBack}
            style={styles.backBtn}
            theme={theme}
            variant="secondary"
          >
            返回詳情
          </Btn>
        </View>
      )}
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
  infoBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 9,
  },
  infoBannerText: {
    fontSize: 11.5,
    lineHeight: 18,
    flex: 1,
  },
  shiftCard: {
    borderRadius: 8,
  },
  shiftRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  shiftMeta: {
    gap: 2,
  },
  shiftZh: {
    fontSize: 13,
    fontWeight: "600",
  },
  shiftId: {
    fontSize: 10.5,
  },
  suppressionNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 11,
    borderRadius: 9,
    gap: 8,
    marginTop: 4,
  },
  suppressionText: {
    fontSize: 11,
    lineHeight: 16,
    flex: 1,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
  },
  backBtn: {
    width: "100%",
  },
});
