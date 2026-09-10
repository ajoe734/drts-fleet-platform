import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  Btn,
  driverCanvasTheme,
  type DriverCanvasTheme,
} from "../canvas-primitives";

export type DriverConflictVariant =
  | "withdraw_conflict"
  | "missing_fields"
  | "forbidden"
  | "not_found"
  | "clock_in_blocked"
  | "presence_ineligible";

export interface DriverLeaveConflictProps {
  variant?: DriverConflictVariant;
  onAction?: () => void;
  theme?: DriverCanvasTheme;
}

const CONFLICT_CONFIGS: Record<
  DriverConflictVariant,
  { code: string; title: string; body: string; cta: string; icon: "refresh" | "close" | "arrow-back" }
> = {
  withdraw_conflict: {
    code: "409 · LEAVE_INVALID_STATE_TRANSITION",
    title: "此假單已被主管審核",
    body: "你嘗試撤回時，主管已完成審核決策，此假單已非 pending 狀態，撤回操作被伺服器拒絕。請重新讀取最新狀態，畫面將顯示對應的核准／駁回終態。",
    cta: "重新讀取最新狀態",
    icon: "refresh",
  },
  missing_fields: {
    code: "400 · LEAVE_MISSING_REQUIRED_FIELDS",
    title: "缺少必填欄位",
    body: "假別、開始時間、結束時間、事由皆為必填欄位；伺服器已拒絕本次送出，請返回表單完整填寫後再試一次。",
    cta: "返回表單",
    icon: "arrow-back",
  },
  forbidden: {
    code: "403 · LEAVE_FORBIDDEN_ACCESS",
    title: "無法存取此假單",
    body: "此假單不屬於目前登入司機帳號，driverId 強制過濾已拒絕本次查看／撤回請求。",
    cta: "返回我的請假",
    icon: "arrow-back",
  },
  not_found: {
    code: "404 · LEAVE_NOT_FOUND",
    title: "找不到此假單",
    body: "指定的 leaveId 不存在，可能已被刪除或連結已失效。",
    cta: "返回我的請假",
    icon: "arrow-back",
  },
  clock_in_blocked: {
    code: "409 · DRIVER_ON_LEAVE",
    title: "請假期間無法打卡上班",
    body: "此時段已核准請假（09/14 08:00 – 09/16 23:59），系統拒絕本次出勤打卡請求。",
    cta: "查看請假詳情",
    icon: "arrow-back",
  },
  presence_ineligible: {
    code: "409 · DRIVER_ON_LEAVE",
    title: "請假期間無法上線接單",
    body: "請假生效中，上線請求已被系統拒絕並將可派資格設為不合格，媒合候選名單已自動排除本司機。",
    cta: "查看請假詳情",
    icon: "arrow-back",
  },
};

export function DriverLeaveConflict({
  variant = "withdraw_conflict",
  onAction,
  theme = driverCanvasTheme,
}: DriverLeaveConflictProps) {
  const cfg = CONFLICT_CONFIGS[variant] ?? CONFLICT_CONFIGS.withdraw_conflict;

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        style={styles.scrollView}
      >
        <View
          style={[
            styles.iconCircle,
            { backgroundColor: theme.dangerBg },
          ]}
        >
          <Ionicons color={theme.danger} name="lock-closed" size={32} />
        </View>

        <Text
          style={[
            styles.title,
            { color: theme.text, fontFamily: theme.fontFamily },
          ]}
        >
          {cfg.title}
        </Text>

        <View
          style={[
            styles.codePill,
            {
              backgroundColor: theme.dangerBg,
              borderColor: theme.dangerBorder,
            },
          ]}
        >
          <Text
            style={[
              styles.codeText,
              { color: theme.danger, fontFamily: theme.monoFamily },
            ]}
          >
            {cfg.code}
          </Text>
        </View>

        <Text
          style={[
            styles.body,
            { color: theme.textMuted, fontFamily: theme.fontFamily },
          ]}
        >
          {cfg.body}
        </Text>
      </ScrollView>

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
          onPress={onAction}
          style={styles.ctaBtn}
          theme={theme}
          variant="secondary"
        >
          {cfg.cta}
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
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
    flexGrow: 1,
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 10,
    textAlign: "center",
  },
  codePill: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    marginBottom: 14,
  },
  codeText: {
    fontSize: 11,
  },
  body: {
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    maxWidth: 300,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
  },
  ctaBtn: {
    width: "100%",
  },
});
