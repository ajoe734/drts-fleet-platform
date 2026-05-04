import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  getDriverIdentityIssue,
  getDriverClient,
  hasDriverDevOverride,
  initializeDriverIdentity,
  isDriverIdentityProvisioned,
  registerDriverDevice,
} from "@/lib/api-client";

type WorkspaceRoute = "/jobs" | "/earnings" | "/platform-presence" | "/shift";

const WORKSPACE_ACTIONS: ReadonlyArray<{
  title: string;
  subtitle: string;
  route: WorkspaceRoute;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  {
    title: "任務收件匣",
    subtitle: "查看已指派任務、平台來源與派單狀態",
    route: "/jobs",
    icon: "file-tray-full-outline",
  },
  {
    title: "收益儀表板",
    subtitle: "依平台檢視今日與累計收益摘要",
    route: "/earnings",
    icon: "wallet-outline",
  },
  {
    title: "平台上線狀態",
    subtitle: "管理各平台上線、令牌到期與重新驗證",
    route: "/platform-presence",
    icon: "radio-outline",
  },
  {
    title: "班次與出勤",
    subtitle: "追蹤排班、出勤與當前班次狀態",
    route: "/shift",
    icon: "time-outline",
  },
] as const;

function StatusPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "success" | "warning" | "danger";
}) {
  return (
    <View
      style={[
        styles.statusPill,
        tone === "success" && styles.statusPillSuccess,
        tone === "warning" && styles.statusPillWarning,
        tone === "danger" && styles.statusPillDanger,
      ]}
    >
      <Text style={styles.statusPillLabel}>{label}</Text>
      <Text
        style={[
          styles.statusPillValue,
          tone === "success" && styles.statusPillValueSuccess,
          tone === "warning" && styles.statusPillValueWarning,
          tone === "danger" && styles.statusPillValueDanger,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function QuickActionCard({
  title,
  subtitle,
  icon,
  onPress,
}: {
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.quickActionCard,
        pressed && styles.quickActionCardPressed,
      ]}
    >
      <View style={styles.quickActionIconWrap}>
        <Ionicons name={icon} size={22} color="#1d4ed8" />
      </View>
      <View style={styles.quickActionBody}>
        <Text style={styles.quickActionTitle}>{title}</Text>
        <Text style={styles.quickActionSubtitle}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
    </Pressable>
  );
}

function RecoveryChecklist({
  flagsOk,
  identityOk,
}: {
  flagsOk: boolean;
  identityOk: boolean;
}) {
  return (
    <View style={styles.recoveryList}>
      <View style={styles.recoveryRow}>
        <Ionicons
          color={identityOk ? "#15803d" : "#dc2626"}
          name={identityOk ? "checkmark-circle" : "close-circle"}
          size={18}
        />
        <Text style={styles.recoveryText}>
          司機身份驗證 {identityOk ? "正常" : "失敗"}
        </Text>
      </View>
      <View style={styles.recoveryRow}>
        <Ionicons
          color={flagsOk ? "#15803d" : "#d97706"}
          name={flagsOk ? "checkmark-circle" : "alert-circle"}
          size={18}
        />
        <Text style={styles.recoveryText}>
          功能旗標服務 {flagsOk ? "正常" : "暫時不可用"}
        </Text>
      </View>
    </View>
  );
}

function resolveWorkspaceIssue(flagsOk: boolean, identityOk: boolean): string {
  if (!identityOk && !flagsOk) {
    return "目前無法驗證司機身份，也無法取得工作台功能設定。請確認網路與登入狀態後重新檢查。";
  }
  if (!identityOk) {
    return (
      getDriverIdentityIssue() ??
      "目前無法驗證司機身份。請確認裝置綁定仍有效，或重新回到配置流程。"
    );
  }
  return "功能旗標服務暫時不可用。核心資料仍可能可讀，但部分入口會維持降級。";
}

export default function OnboardingScreen() {
  const [ready, setReady] = useState(false);
  const [flagsOk, setFlagsOk] = useState<boolean | null>(null);
  const [identityOk, setIdentityOk] = useState<boolean | null>(null);
  const [registrationCode, setRegistrationCode] = useState("");
  const [deviceLabel, setDeviceLabel] = useState("");
  const [provisioningError, setProvisioningError] = useState<string | null>(
    null,
  );
  const [workspaceIssue, setWorkspaceIssue] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [refreshSeed, setRefreshSeed] = useState(0);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    initializeDriverIdentity()
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setProvisioningError(
          error instanceof Error
            ? error.message
            : "裝置初始化失敗，請稍後再試。",
        );
      })
      .finally(() => {
        if (!cancelled) {
          const identityIssue = getDriverIdentityIssue();
          if (identityIssue) {
            setProvisioningError(identityIssue);
          }
          setReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const provisioned = ready && isDriverIdentityProvisioned();

  useEffect(() => {
    if (!provisioned) {
      return;
    }

    let cancelled = false;
    const client = getDriverClient();

    setFlagsOk(null);
    setIdentityOk(null);
    setWorkspaceIssue(null);

    Promise.allSettled([client.getFeatureFlags(), client.getIdentityContext()])
      .then(([flagsResult, identityResult]) => {
        if (cancelled) {
          return;
        }

        const nextFlagsOk = flagsResult.status === "fulfilled";
        const nextIdentityOk = identityResult.status === "fulfilled";
        setFlagsOk(nextFlagsOk);
        setIdentityOk(nextIdentityOk);

        if (!nextFlagsOk || !nextIdentityOk) {
          setWorkspaceIssue(resolveWorkspaceIssue(nextFlagsOk, nextIdentityOk));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFlagsOk(false);
          setIdentityOk(false);
          setWorkspaceIssue(resolveWorkspaceIssue(false, false));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [provisioned, refreshSeed]);

  const handleRegister = async () => {
    const normalizedCode = registrationCode.trim();
    if (!normalizedCode) {
      setProvisioningError("請輸入裝置註冊碼。");
      return;
    }

    setSubmitting(true);
    setProvisioningError(null);
    try {
      await registerDriverDevice(normalizedCode, deviceLabel);
      setFlagsOk(null);
      setIdentityOk(null);
      setWorkspaceIssue(null);
    } catch (error) {
      setProvisioningError(
        error instanceof Error ? error.message : "裝置配置失敗，請稍後再試。",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!ready) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator color="#1d4ed8" size="large" />
        <Text style={styles.loadingLabel}>正在檢查裝置配置…</Text>
      </View>
    );
  }

  if (!provisioned) {
    return (
      <SafeAreaView edges={["top", "left", "right"]} style={styles.shell}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heroCard}>
            <Text style={styles.eyebrow}>DRTS Driver App</Text>
            <Text style={styles.heroTitle}>裝置配置</Text>
            <Text style={styles.heroDescription}>
              先完成裝置綁定，工作台才會載入司機身份、平台任務與收益資料。
            </Text>
            <View style={styles.heroPillRow}>
              <StatusPill label="裝置狀態" tone="warning" value="待配置" />
              <StatusPill
                label="開發覆寫"
                tone={hasDriverDevOverride() ? "success" : "danger"}
                value={hasDriverDevOverride() ? "已設定" : "未設定"}
              />
            </View>
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>輸入註冊資料</Text>
            <Text style={styles.sectionDescription}>
              請使用管理人員提供的註冊碼綁定此裝置，成功後會自動進入多平台工作站。
            </Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              editable={!submitting}
              onChangeText={setRegistrationCode}
              placeholder="註冊碼"
              placeholderTextColor="#94a3b8"
              style={styles.input}
              value={registrationCode}
            />
            <TextInput
              editable={!submitting}
              onChangeText={setDeviceLabel}
              placeholder="裝置名稱（選填）"
              placeholderTextColor="#94a3b8"
              style={styles.input}
              value={deviceLabel}
            />
            <Pressable
              disabled={submitting}
              onPress={() => {
                void handleRegister();
              }}
              style={({ pressed }) => [
                styles.primaryButton,
                (pressed || submitting) && styles.primaryButtonPressed,
              ]}
            >
              <Ionicons
                name="shield-checkmark-outline"
                size={18}
                color="#fff"
              />
              <Text style={styles.primaryButtonLabel}>
                {submitting ? "配置中…" : "註冊此裝置"}
              </Text>
            </Pressable>
            {provisioningError ? (
              <View style={styles.inlineMessageError}>
                <Ionicons name="alert-circle" size={18} color="#b91c1c" />
                <Text style={styles.inlineMessageErrorText}>
                  {provisioningError}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.sectionCardMuted}>
            <Text style={styles.sectionTitle}>配置說明</Text>
            <Text style={styles.mutedNote}>
              未配置的裝置不會直接進入正式工作台。這是安全保護，不是 demo 畫面。
            </Text>
            <Text style={styles.mutedNote}>
              開發環境可用 `EXPO_PUBLIC_DRIVER_ID`
              明確覆寫身份；正式環境應走後端裝置綁定流程。
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (flagsOk === null || identityOk === null) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator color="#1d4ed8" size="large" />
        <Text style={styles.loadingLabel}>正在初始化司機工作台…</Text>
      </View>
    );
  }

  if (!flagsOk || !identityOk) {
    return (
      <SafeAreaView edges={["top", "left", "right"]} style={styles.shell}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heroCardDanger}>
            <Text style={styles.eyebrow}>DRTS Driver App</Text>
            <Text style={styles.heroTitle}>工作台暫時降級</Text>
            <Text style={styles.heroDescription}>
              核心身份或功能設定目前未完成同步，因此不應把這頁當成正常可交付首頁。
            </Text>
            <View style={styles.heroPillRow}>
              <StatusPill
                label="身份驗證"
                tone={identityOk ? "success" : "danger"}
                value={identityOk ? "正常" : "失敗"}
              />
              <StatusPill
                label="功能設定"
                tone={flagsOk ? "success" : "warning"}
                value={flagsOk ? "正常" : "降級"}
              />
            </View>
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>恢復建議</Text>
            <Text style={styles.sectionDescription}>
              {workspaceIssue ?? "請稍後重新檢查連線狀態。"}
            </Text>
            <RecoveryChecklist flagsOk={flagsOk} identityOk={identityOk} />
            <Pressable
              onPress={() => setRefreshSeed((current) => current + 1)}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.primaryButtonPressed,
              ]}
            >
              <Ionicons name="refresh-outline" size={18} color="#fff" />
              <Text style={styles.primaryButtonLabel}>重新檢查連線</Text>
            </Pressable>
            {!identityOk ? (
              <Pressable
                onPress={() => {
                  setReady(false);
                  setTimeout(() => {
                    void initializeDriverIdentity()
                      .catch((error: unknown) => {
                        setProvisioningError(
                          error instanceof Error
                            ? error.message
                            : "無法重新初始化裝置。",
                        );
                      })
                      .finally(() => setReady(true));
                  }, 0);
                }}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && styles.secondaryButtonPressed,
                ]}
              >
                <Ionicons
                  name="person-circle-outline"
                  size={18}
                  color="#0f172a"
                />
                <Text style={styles.secondaryButtonLabel}>重新初始化身份</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => router.push("/jobs")}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && styles.secondaryButtonPressed,
                ]}
              >
                <Ionicons name="list-outline" size={18} color="#0f172a" />
                <Text style={styles.secondaryButtonLabel}>
                  先查看任務收件匣
                </Text>
              </Pressable>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.shell}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <Text style={styles.eyebrow}>DRTS Driver App</Text>
          <Text style={styles.heroTitle}>多平台工作站</Text>
          <Text style={styles.heroDescription}>
            在同一個工作台掌握任務、收益、平台上線與班次狀態，不需要再靠零散入口切畫面。
          </Text>
          <View style={styles.heroPillRow}>
            <StatusPill label="API" tone="success" value="已連線" />
            <StatusPill label="功能旗標" tone="success" value="已啟用" />
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>快速進入工作</Text>
          <Text style={styles.sectionDescription}>
            這裡是司機端首頁，不該只是幾個藍色文字連結。
          </Text>
          <View style={styles.quickActionList}>
            {WORKSPACE_ACTIONS.map((action) => (
              <QuickActionCard
                icon={action.icon}
                key={action.route}
                onPress={() => router.push(action.route)}
                subtitle={action.subtitle}
                title={action.title}
              />
            ))}
          </View>
        </View>

        <View style={styles.sectionCardMuted}>
          <Text style={styles.sectionTitle}>工作台狀態</Text>
          <View style={styles.workspaceStatusRow}>
            <Text style={styles.workspaceStatusLabel}>裝置配置</Text>
            <Text style={styles.workspaceStatusValue}>已綁定司機身份</Text>
          </View>
          <View style={styles.workspaceStatusRow}>
            <Text style={styles.workspaceStatusLabel}>身份驗證</Text>
            <Text style={styles.workspaceStatusValue}>可存取司機 API</Text>
          </View>
          <View style={styles.workspaceStatusRow}>
            <Text style={styles.workspaceStatusLabel}>首頁定位</Text>
            <Text style={styles.workspaceStatusValue}>正式工作入口</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: "#e2e8f0",
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
    gap: 16,
  },
  loadingScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f8fafc",
    padding: 24,
    gap: 10,
  },
  loadingLabel: {
    color: "#475569",
    fontSize: 15,
  },
  heroCard: {
    borderRadius: 28,
    padding: 24,
    backgroundColor: "#0f172a",
    gap: 14,
    shadowColor: "#0f172a",
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 5,
  },
  heroCardDanger: {
    borderRadius: 28,
    padding: 24,
    backgroundColor: "#7f1d1d",
    gap: 14,
    shadowColor: "#450a0a",
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 5,
  },
  eyebrow: {
    color: "#93c5fd",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  heroTitle: {
    color: "#f8fafc",
    fontSize: 30,
    fontWeight: "800",
    lineHeight: 36,
  },
  heroDescription: {
    color: "#cbd5e1",
    fontSize: 15,
    lineHeight: 22,
  },
  heroPillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  statusPill: {
    minWidth: 132,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  statusPillSuccess: {
    backgroundColor: "#dcfce7",
  },
  statusPillWarning: {
    backgroundColor: "#fef3c7",
  },
  statusPillDanger: {
    backgroundColor: "#fee2e2",
  },
  statusPillLabel: {
    fontSize: 12,
    color: "#475569",
    fontWeight: "600",
  },
  statusPillValue: {
    fontSize: 16,
    fontWeight: "700",
  },
  statusPillValueSuccess: {
    color: "#166534",
  },
  statusPillValueWarning: {
    color: "#b45309",
  },
  statusPillValueDanger: {
    color: "#b91c1c",
  },
  sectionCard: {
    borderRadius: 24,
    padding: 20,
    backgroundColor: "#ffffff",
    gap: 14,
    shadowColor: "#0f172a",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
  },
  sectionCardMuted: {
    borderRadius: 24,
    padding: 20,
    backgroundColor: "#eff6ff",
    gap: 12,
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0f172a",
  },
  sectionDescription: {
    fontSize: 14,
    lineHeight: 21,
    color: "#475569",
  },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    backgroundColor: "#f8fafc",
    color: "#0f172a",
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: "#2563eb",
    paddingHorizontal: 18,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  primaryButtonPressed: {
    opacity: 0.9,
  },
  primaryButtonLabel: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
  secondaryButton: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
    paddingHorizontal: 18,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  secondaryButtonPressed: {
    opacity: 0.9,
  },
  secondaryButtonLabel: {
    color: "#0f172a",
    fontSize: 16,
    fontWeight: "700",
  },
  inlineMessageError: {
    borderRadius: 16,
    backgroundColor: "#fef2f2",
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  inlineMessageErrorText: {
    flex: 1,
    color: "#991b1b",
    fontSize: 13,
    lineHeight: 19,
  },
  mutedNote: {
    fontSize: 13,
    lineHeight: 20,
    color: "#1e3a8a",
  },
  quickActionList: {
    gap: 12,
  },
  quickActionCard: {
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#dbeafe",
    backgroundColor: "#f8fbff",
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  quickActionCardPressed: {
    opacity: 0.88,
  },
  quickActionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#dbeafe",
  },
  quickActionBody: {
    flex: 1,
    gap: 4,
  },
  quickActionTitle: {
    color: "#0f172a",
    fontSize: 16,
    fontWeight: "700",
  },
  quickActionSubtitle: {
    color: "#475569",
    fontSize: 13,
    lineHeight: 19,
  },
  recoveryList: {
    gap: 10,
  },
  recoveryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  recoveryText: {
    color: "#334155",
    fontSize: 14,
  },
  workspaceStatusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 2,
  },
  workspaceStatusLabel: {
    flex: 1,
    color: "#475569",
    fontSize: 14,
  },
  workspaceStatusValue: {
    flex: 1,
    textAlign: "right",
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "700",
  },
});
