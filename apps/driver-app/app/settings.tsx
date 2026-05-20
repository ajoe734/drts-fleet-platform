import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import {
  PLATFORM_CODE_REGISTRY,
  type DriverProfileRecord,
  type DriverSettings,
  type PlatformPresenceRecord,
  type PlatformPresenceSummary,
} from "@drts/contracts";

import {
  Banner,
  Btn,
  Card,
  PageHeader,
  Pill,
  Shell,
  driverCanvasTheme,
} from "@/components/canvas-primitives";
import {
  clearDriverProvisioning,
  getDriverClient,
  getDriverId,
  isDriverIdentityProvisioned,
} from "@/lib/api-client";
import {
  DEFAULT_PROFILE_VALUES,
  DEFAULT_SETTINGS_VALUES,
  profileValuesFromRecord,
  settingsValuesFromRecord,
  type ProfileFormValues,
  type SettingsFormValues,
} from "@/lib/settings-form";
import { driverStrings } from "@/lib/strings";

const THEME = driverCanvasTheme;

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return driverStrings.common.requestFailed;
}

function formatSectionList(labels: string[]): string {
  if (labels.length <= 1) {
    return labels[0] ?? "";
  }
  if (labels.length === 2) {
    return `${labels[0]}和${labels[1]}`;
  }
  return `${labels.slice(0, -1).join("、")}和${labels.at(-1)}`;
}

function formatLanguage(value: string): string {
  switch (value.trim()) {
    case "zh-TW":
      return "繁體中文";
    case "en":
      return "English";
    case "ja":
      return "日本語";
    default:
      return value.trim() || "未設定";
  }
}

function formatRadius(value: string): string {
  const trimmed = value.trim();
  return trimmed ? `${trimmed} km` : "未限制";
}

function formatNotification(value: boolean): string {
  return value ? "全部" : "已關閉";
}

function isOwnedPlatform(record: PlatformPresenceRecord): boolean {
  const normalizedCode = String(record.platformCode).toLowerCase();
  const displayName =
    PLATFORM_CODE_REGISTRY[record.platformCode]?.displayName.toLowerCase() ??
    "";

  return (
    normalizedCode === "drts" ||
    normalizedCode === "owned" ||
    normalizedCode.startsWith("drts-") ||
    displayName.includes("drts")
  );
}

function getPlatformDisplayName(record: PlatformPresenceRecord): string {
  if (isOwnedPlatform(record)) {
    return "自營派單";
  }
  return (
    PLATFORM_CODE_REGISTRY[record.platformCode]?.displayName ??
    record.platformCode
  );
}

function formatTokenExpiry(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  const remainingMs = parsed.getTime() - Date.now();
  if (remainingMs <= 0) {
    return "已過期";
  }

  const remainingMinutes = Math.max(1, Math.floor(remainingMs / 60000));
  if (remainingMinutes < 60) {
    return `${remainingMinutes} 分鐘後到期`;
  }

  const remainingHours = Math.floor(remainingMinutes / 60);
  if (remainingHours < 24) {
    return `${remainingHours} 小時 ${remainingMinutes % 60} 分鐘後到期`;
  }

  const remainingDays = Math.floor(remainingHours / 24);
  return `${remainingDays} 天後到期`;
}

function getBindingTone(record: PlatformPresenceRecord) {
  if (record.reauthRequired) {
    return "warn" as const;
  }
  return record.status === "online" ? "success" : "neutral";
}

function getBindingStatus(record: PlatformPresenceRecord): string {
  if (record.reauthRequired) {
    return "需重新授權";
  }
  return record.status === "online" ? "已綁定" : "未啟用";
}

function getBindingSubtitle(record: PlatformPresenceRecord): string {
  const parts = [];

  if (record.accountId?.trim()) {
    parts.push(record.accountId.trim());
  }

  parts.push(getBindingStatus(record));

  const expiry = formatTokenExpiry(record.tokenExpiresAt);
  if (expiry) {
    parts.push(expiry);
  }

  return parts.join(" · ");
}

function SectionTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionCopy}>
        <Text style={[styles.sectionTitle, { color: THEME.text }]}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.sectionSubtitle, { color: THEME.textMuted }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {action ? <View>{action}</View> : null}
    </View>
  );
}

function ListRow({
  icon,
  label,
  subtitle,
  value,
  right,
  onPress,
  danger = false,
  last = false,
}: {
  icon?: ReactNode;
  label: string;
  subtitle?: string | null;
  value?: string | null;
  right?: ReactNode;
  onPress?: () => void;
  danger?: boolean;
  last?: boolean;
}) {
  const content = (
    <View
      style={[
        styles.row,
        { borderBottomColor: last ? "transparent" : THEME.border },
      ]}
    >
      <View style={styles.rowMain}>
        {icon ? <View style={styles.rowIcon}>{icon}</View> : null}
        <View style={styles.rowCopy}>
          <Text
            style={[
              styles.rowLabel,
              { color: danger ? THEME.danger : THEME.text },
            ]}
          >
            {label}
          </Text>
          {subtitle ? (
            <Text
              style={[
                styles.rowSubtitle,
                {
                  color:
                    danger || subtitle.includes("需重新授權")
                      ? THEME.warn
                      : THEME.textMuted,
                },
              ]}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.rowRight}>
        {value ? (
          <Text
            style={[
              styles.rowValue,
              { color: danger ? THEME.danger : THEME.textMuted },
            ]}
          >
            {value}
          </Text>
        ) : null}
        {right}
        {onPress ? (
          <Ionicons
            name="chevron-forward"
            size={15}
            color={danger ? THEME.danger : THEME.textDim}
          />
        ) : null}
      </View>
    </View>
  );

  if (!onPress) {
    return content;
  }

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ opacity: pressed ? 0.88 : 1 }]}>
      {content}
    </Pressable>
  );
}

function DriverBottomTabs({
  active,
  onNavigate,
}: {
  active: "jobs" | "home" | "trip" | "platform" | "settings";
  onNavigate: (route: string) => void;
}) {
  const items = [
    { id: "home", label: "工作台", icon: "home-outline", route: "/" },
    { id: "jobs", label: "任務", icon: "list-outline", route: "/jobs" },
    { id: "trip", label: "行程", icon: "car-outline", route: "/trip" },
    {
      id: "platform",
      label: "平台",
      icon: "layers-outline",
      route: "/platform-presence",
      dot: true,
    },
    {
      id: "settings",
      label: "設定",
      icon: "person-outline",
      route: "/settings",
    },
  ] as const;

  return (
    <View style={styles.bottomTabs}>
      {items.map((item) => {
        const selected = item.id === active;
        const hasDot = "dot" in item && Boolean(item.dot);
        return (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            onPress={() => onNavigate(item.route)}
            style={styles.bottomTabItem}
          >
            <View style={styles.bottomTabIconWrap}>
              <Ionicons
                name={item.icon}
                size={22}
                color={selected ? THEME.accent : THEME.textDim}
              />
              {hasDot ? <View style={styles.bottomTabDot} /> : null}
            </View>
            <Text
              style={[
                styles.bottomTabLabel,
                { color: selected ? THEME.accent : THEME.textDim },
              ]}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const isProvisioned = isDriverIdentityProvisioned();
  const driverId = isProvisioned ? getDriverId() : "";

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [presenceSummary, setPresenceSummary] =
    useState<PlatformPresenceSummary | null>(null);
  const [settingsValues, setSettingsValues] = useState<SettingsFormValues>(
    DEFAULT_SETTINGS_VALUES,
  );
  const [profileValues, setProfileValues] = useState<ProfileFormValues>(
    DEFAULT_PROFILE_VALUES,
  );

  useEffect(() => {
    if (!isProvisioned) {
      setLoading(false);
      return;
    }

    let isActive = true;
    const client = getDriverClient();

    const loadAll = async () => {
      const [settingsResult, profileResult, presenceResult] =
        await Promise.allSettled([
          client.getDriverSettings(driverId),
          client.getDriverProfile(),
          client.getPlatformPresence(),
        ]);

      if (!isActive) {
        return;
      }

      const failures: string[] = [];

      if (settingsResult.status === "fulfilled") {
        setSettingsValues(
          settingsValuesFromRecord(settingsResult.value as DriverSettings),
        );
      } else {
        failures.push(`偏好設定（${toErrorMessage(settingsResult.reason)}）`);
      }

      if (profileResult.status === "fulfilled") {
        setProfileValues(
          profileValuesFromRecord(profileResult.value as DriverProfileRecord),
        );
      } else {
        failures.push(`個人資料（${toErrorMessage(profileResult.reason)}）`);
      }

      if (presenceResult.status === "fulfilled") {
        setPresenceSummary(presenceResult.value as PlatformPresenceSummary);
      } else {
        failures.push(
          `平台帳號綁定（${toErrorMessage(presenceResult.reason)}）`,
        );
      }

      setLoadError(
        failures.length > 0
          ? `已使用可用資料。無法載入 ${formatSectionList(failures)}。`
          : null,
      );
      setLoading(false);
    };

    void loadAll();

    return () => {
      isActive = false;
    };
  }, [driverId, isProvisioned]);

  const profileInitial = profileValues.profileName.trim().charAt(0) || "司";
  const identitySummary = [
    driverId ? `D-${driverId.replace(/^D-?/i, "")}` : null,
    profileValues.profilePhone.trim() || null,
  ]
    .filter(Boolean)
    .join(" · ");
  const emergencySummary = [
    profileValues.emergencyName.trim() || "尚未設定",
    profileValues.emergencyRelationship.trim() || null,
    profileValues.emergencyPhone.trim() || null,
  ]
    .filter(Boolean)
    .join(" · ");

  const presences = [...(presenceSummary?.presences ?? [])].sort((a, b) =>
    getPlatformDisplayName(a).localeCompare(getPlatformDisplayName(b), "zh-TW"),
  );

  const handleLogout = () => {
    Alert.alert("登出裝置", "登出後需要重新完成裝置配置，確定要繼續嗎？", [
      { text: "取消", style: "cancel" },
      {
        text: "登出",
        style: "destructive",
        onPress: async () => {
          await clearDriverProvisioning();
          router.replace("/onboarding");
        },
      },
    ]);
  };

  if (!isProvisioned) {
    return (
      <Shell theme={THEME} contentContainerStyle={styles.shellContent}>
        <PageHeader
          theme={THEME}
          title={driverStrings.settings.title}
          subtitle="裝置尚未配置司機身份"
        />
        <Banner
          theme={THEME}
          tone="warn"
          title="尚未完成裝置配置"
          body="此裝置尚未分配司機身份，無法載入設定。"
          icon={
            <Ionicons
              name="lock-closed-outline"
              size={16}
              color={THEME.warn}
            />
          }
          actions={
            <Btn
              theme={THEME}
              variant="primary"
              size="sm"
              onPress={() => router.push("/onboarding")}
            >
              前往配置裝置
            </Btn>
          }
        />
      </Shell>
    );
  }

  if (loading) {
    return (
      <Shell theme={THEME} contentContainerStyle={styles.loadingContent}>
        <PageHeader
          theme={THEME}
          title={driverStrings.settings.title}
          subtitle="載入設定中…"
        />
        <View style={styles.loadingCard}>
          <ActivityIndicator size="large" color={THEME.accent} />
          <Text style={[styles.loadingLabel, { color: THEME.textMuted }]}>
            載入設定中…
          </Text>
        </View>
      </Shell>
    );
  }

  return (
    <Shell
      theme={THEME}
      contentContainerStyle={styles.shellContent}
      footer={
        <DriverBottomTabs
          active="settings"
          onNavigate={(route) => router.push(route as never)}
        />
      }
    >
      <PageHeader
        theme={THEME}
        title={driverStrings.settings.title}
        subtitle="帳號與綁定"
      />

      {loadError ? (
        <Banner
          theme={THEME}
          tone="warn"
          body={loadError}
          icon={<Ionicons name="alert-circle-outline" size={16} color={THEME.warn} />}
        />
      ) : null}

      <Card theme={THEME} padding={16} style={styles.profileCard}>
        <View style={styles.profileRow}>
          <View
            style={[
              styles.avatar,
              {
                backgroundColor: THEME.accentBg,
                borderColor: THEME.accentBorder,
              },
            ]}
          >
            <Text style={[styles.avatarText, { color: THEME.accentHi }]}>
              {profileInitial}
            </Text>
          </View>
          <View style={styles.profileCopy}>
            <Text style={[styles.profileName, { color: THEME.text }]}>
              {profileValues.profileName.trim() || "尚未填寫司機姓名"}
            </Text>
            <Text style={[styles.profileMeta, { color: THEME.textMuted }]}>
              {identitySummary || "尚未填寫聯絡資訊"}
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={16}
            color={THEME.textDim}
          />
        </View>
      </Card>

      <View style={styles.sectionStack}>
        <SectionTitle
          title={driverStrings.settings.sections.bindings}
          subtitle="連線後可接收該平台訂單。"
        />
        <Card theme={THEME} padding={0}>
          {presences.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={[styles.emptyText, { color: THEME.textMuted }]}>
                目前尚未同步到平台綁定資料。
              </Text>
            </View>
          ) : (
            presences.map((record, index) => (
              <ListRow
                key={record.platformCode}
                icon={
                  <View
                    style={[
                      styles.platformBadge,
                      {
                        backgroundColor: isOwnedPlatform(record)
                          ? THEME.accentBg
                          : THEME.warnBg,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.platformBadgeText,
                        {
                          color: isOwnedPlatform(record)
                            ? THEME.accentHi
                            : THEME.warn,
                        },
                      ]}
                    >
                      {String(record.platformCode).slice(0, 4).toUpperCase()}
                    </Text>
                  </View>
                }
                label={getPlatformDisplayName(record)}
                subtitle={getBindingSubtitle(record)}
                right={
                  record.reauthRequired ? (
                    <Pill theme={THEME} tone={getBindingTone(record)}>
                      處理
                    </Pill>
                  ) : undefined
                }
                onPress={() => router.push("/platform-presence")}
                last={index === presences.length - 1}
              />
            ))
          )}
        </Card>
      </View>

      <View style={styles.sectionStack}>
        <SectionTitle title={driverStrings.settings.sections.preferences} />
        <Card theme={THEME} padding={0}>
          <ListRow label="語言" value={formatLanguage(settingsValues.language)} />
          <ListRow
            label="最大接單距離"
            value={formatRadius(settingsValues.maxAcceptRadius)}
          />
          <ListRow
            label="自動接單"
            subtitle="僅自營派單可開啟自動接單"
            right={
              <Switch
                value={settingsValues.autoAcceptEnabled}
                disabled
                trackColor={{ false: THEME.borderStrong, true: THEME.accentHi }}
                thumbColor={
                  settingsValues.autoAcceptEnabled ? THEME.accent : "#FFFFFF"
                }
              />
            }
          />
          <ListRow
            label="通知"
            value={formatNotification(settingsValues.notificationsEnabled)}
            last
          />
        </Card>
      </View>

      <View style={styles.sectionStack}>
        <SectionTitle title={driverStrings.settings.sections.misc} />
        <Card theme={THEME} padding={0}>
          <ListRow
            label={driverStrings.settings.utilityLabels.emergencyContact}
            subtitle={emergencySummary}
          />
          <ListRow
            label={driverStrings.settings.utilityLabels.aboutDevice}
            subtitle={driverId || "未設定"}
          />
          <ListRow
            label={driverStrings.settings.utilityLabels.logout}
            subtitle="登出後需要重新綁定此裝置"
            onPress={handleLogout}
            danger
            last
          />
        </Card>
      </View>
    </Shell>
  );
}

const styles = StyleSheet.create({
  shellContent: {
    paddingBottom: 24,
    gap: 14,
  },
  loadingContent: {
    flexGrow: 1,
    justifyContent: "center",
    gap: 16,
  },
  loadingCard: {
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingLabel: {
    fontSize: 13,
    lineHeight: 18,
  },
  profileCard: {
    marginTop: -2,
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 18,
    fontWeight: "700",
  },
  profileCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  profileName: {
    fontSize: 16,
    fontWeight: "600",
  },
  profileMeta: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: THEME.monoFamily,
  },
  sectionStack: {
    gap: 8,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  sectionCopy: {
    flex: 1,
    gap: 2,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20,
  },
  sectionSubtitle: {
    fontSize: 12.5,
    lineHeight: 18,
  },
  row: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  rowMain: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    minWidth: 0,
    gap: 12,
  },
  rowIcon: {
    flexShrink: 0,
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 18,
  },
  rowSubtitle: {
    fontSize: 11.5,
    lineHeight: 16,
  },
  rowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  rowValue: {
    fontSize: 13,
    lineHeight: 17,
  },
  platformBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  platformBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.3,
    fontFamily: THEME.monoFamily,
  },
  emptyCard: {
    paddingHorizontal: 14,
    paddingVertical: 18,
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 18,
  },
  bottomTabs: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 12,
    backgroundColor: THEME.surface,
    borderTopWidth: 1,
    borderTopColor: THEME.border,
  },
  bottomTabItem: {
    flex: 1,
    alignItems: "center",
    gap: 5,
  },
  bottomTabIconWrap: {
    minHeight: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  bottomTabLabel: {
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 14,
  },
  bottomTabDot: {
    position: "absolute",
    top: 1,
    right: -3,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: THEME.warn,
  },
});
