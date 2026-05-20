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
  type StyleProp,
  type ViewStyle,
} from "react-native";
import {
  PLATFORM_CODE_REGISTRY,
  type DriverProfileRecord,
  type DriverSettings,
  type PlatformPresenceRecord,
  type PlatformPresenceSummary,
} from "@drts/contracts";

import {
  Banner as CanvasBanner,
  Btn as CanvasBtn,
  Card as CanvasCard,
  PageHeader as CanvasPageHeader,
  Pill as CanvasPill,
  Shell as CanvasShell,
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
  buildProfileCommand,
  buildSettingsCommand,
  hasErrors,
  profileValuesEqual,
  profileValuesFromRecord,
  settingsValuesEqual,
  settingsValuesFromRecord,
  validateProfileValues,
  validateSettingsValues,
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

function getBindingTone(record: PlatformPresenceRecord): "warn" | "success" {
  if (record.reauthRequired) {
    return "warn";
  }
  return "success";
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

function ScreenSection({
  title,
  subtitle,
  action,
  children,
  style,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.sectionBlock, style]}>
      <View style={styles.sectionHeadingRow}>
        <View style={styles.sectionHeading}>
          <Text style={[styles.sectionTitle, { color: THEME.text }]}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={[styles.sectionSubtitle, { color: THEME.textMuted }]}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {action ? <View style={styles.sectionAction}>{action}</View> : null}
      </View>
      {children}
    </View>
  );
}

function ProfileSummaryCard({
  initial,
  name,
  summary,
}: {
  initial: string;
  name: string;
  summary: string;
}) {
  return (
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
          {initial}
        </Text>
      </View>
      <View style={styles.profileCopy}>
        <Text style={[styles.profileName, { color: THEME.text }]}>{name}</Text>
        <Text style={[styles.profileMeta, { color: THEME.textMuted }]}>
          {summary}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={THEME.textDim} />
    </View>
  );
}

function BindingRow({
  record,
  last = false,
  onPress,
}: {
  record: PlatformPresenceRecord;
  last?: boolean;
  onPress?: () => void;
}) {
  const statusTone = getBindingTone(record);
  const label = getPlatformDisplayName(record);
  const subtitle = getBindingSubtitle(record);
  const badgeColor = isOwnedPlatform(record) ? THEME.accentHi : THEME.warn;
  const badgeBackground = isOwnedPlatform(record)
    ? THEME.accentBg
    : THEME.warnBg;

  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      onPress={onPress}
      style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1 }]}
    >
      <View
        style={[
          styles.bindingRow,
          { borderBottomColor: last ? "transparent" : THEME.border },
        ]}
      >
        <View
          style={[styles.platformBadge, { backgroundColor: badgeBackground }]}
        >
          <Text style={[styles.platformBadgeText, { color: badgeColor }]}>
            {String(record.platformCode).slice(0, 4).toUpperCase()}
          </Text>
        </View>
        <View style={styles.bindingCopy}>
          <Text style={[styles.bindingLabel, { color: THEME.text }]}>
            {label}
          </Text>
          <Text
            style={[
              styles.bindingSubtitle,
              {
                color: record.reauthRequired ? THEME.warn : THEME.textMuted,
              },
            ]}
          >
            {subtitle}
          </Text>
        </View>
        {record.reauthRequired ? (
          <CanvasPill theme={THEME} tone={statusTone}>
            處理
          </CanvasPill>
        ) : null}
      </View>
    </Pressable>
  );
}

function SettingRow({
  label,
  subtitle,
  value,
  right,
  onPress,
  showChevron = Boolean(onPress),
  danger = false,
  last = false,
}: {
  label: string;
  subtitle?: string | null;
  value?: string | null;
  right?: ReactNode;
  onPress?: () => void;
  showChevron?: boolean;
  danger?: boolean;
  last?: boolean;
}) {
  const content = (
    <View
      style={[
        styles.settingRow,
        { borderBottomColor: last ? "transparent" : THEME.border },
      ]}
    >
      <View style={styles.settingMain}>
        <Text
          style={[
            styles.settingLabel,
            { color: danger ? THEME.danger : THEME.text },
          ]}
        >
          {label}
        </Text>
        {subtitle ? (
          <Text
            style={[
              styles.settingSubtitle,
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
      <View style={styles.settingRight}>
        {value ? (
          <Text
            style={[
              styles.settingValue,
              { color: danger ? THEME.danger : THEME.textMuted },
            ]}
          >
            {value}
          </Text>
        ) : null}
        {right}
        {onPress && showChevron ? (
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
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [{ opacity: pressed ? 0.88 : 1 }]}
    >
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
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<"success" | "error" | null>(
    null,
  );

  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [presenceSummary, setPresenceSummary] =
    useState<PlatformPresenceSummary | null>(null);
  const [settingsValues, setSettingsValues] = useState<SettingsFormValues>(
    DEFAULT_SETTINGS_VALUES,
  );
  const [profileValues, setProfileValues] = useState<ProfileFormValues>(
    DEFAULT_PROFILE_VALUES,
  );
  const [initialSettings, setInitialSettings] = useState<SettingsFormValues>(
    DEFAULT_SETTINGS_VALUES,
  );
  const [initialProfile, setInitialProfile] = useState<ProfileFormValues>(
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
        const next = settingsValuesFromRecord(
          settingsResult.value as DriverSettings,
        );
        setSettingsValues(next);
        setInitialSettings(next);
        setSettingsLoaded(true);
      } else {
        failures.push(`偏好設定（${toErrorMessage(settingsResult.reason)}）`);
      }

      if (profileResult.status === "fulfilled") {
        const next = profileValuesFromRecord(
          profileResult.value as DriverProfileRecord,
        );
        setProfileValues(next);
        setInitialProfile(next);
        setProfileLoaded(true);
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

  const settingsErrors = validateSettingsValues(settingsValues);
  const profileErrors = profileLoaded
    ? validateProfileValues(profileValues)
    : {};

  const settingsDirty =
    settingsLoaded && !settingsValuesEqual(initialSettings, settingsValues);
  const profileDirty =
    profileLoaded && !profileValuesEqual(initialProfile, profileValues);
  const dirty = settingsDirty || profileDirty;
  const hasValidation =
    (settingsLoaded && hasErrors(settingsErrors)) ||
    (profileLoaded && hasErrors(profileErrors));
  const validationMessage = hasValidation
    ? "請先修正標示欄位後再儲存設定。"
    : null;

  const saveDisabled = !dirty || hasValidation || saving;

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

  const updateSettings = (patch: Partial<SettingsFormValues>) => {
    setSettingsValues((prev) => ({ ...prev, ...patch }));
    if (lastResult) {
      setLastResult(null);
    }
    if (saveError) {
      setSaveError(null);
    }
  };

  const handleSave = async () => {
    if (!dirty || hasValidation) {
      return;
    }

    setSaving(true);
    setSaveError(null);
    const client = getDriverClient();

    const tasks: Array<Promise<{ section: string }>> = [];
    if (settingsDirty) {
      tasks.push(
        client
          .updateDriverSettings(driverId, buildSettingsCommand(settingsValues))
          .then(() => ({ section: "偏好設定" })),
      );
    }
    if (profileDirty) {
      tasks.push(
        client
          .updateDriverProfile(buildProfileCommand(profileValues))
          .then(() => ({ section: "個人資料" })),
      );
    }

    try {
      const results = await Promise.allSettled(tasks);
      const saved: string[] = [];
      const failed: string[] = [];

      results.forEach((entry, index) => {
        const isSettingsTask = settingsDirty && index === 0;
        const sectionLabel = isSettingsTask ? "偏好設定" : "個人資料";
        if (entry.status === "fulfilled") {
          saved.push(entry.value.section);
        } else {
          failed.push(`${sectionLabel}（${toErrorMessage(entry.reason)}）`);
        }
      });

      if (saved.includes("偏好設定")) {
        setInitialSettings(settingsValues);
      }
      if (saved.includes("個人資料")) {
        setInitialProfile(profileValues);
      }

      if (failed.length === 0) {
        setLastResult("success");
        Alert.alert("儲存成功", "設定已成功儲存。");
        return;
      }

      if (saved.length === 0) {
        setLastResult("error");
        setSaveError(`無法儲存 ${formatSectionList(failed)}。`);
        Alert.alert("儲存失敗", `無法儲存 ${formatSectionList(failed)}。`);
        return;
      }

      setLastResult("error");
      setSaveError(
        `已儲存 ${formatSectionList(saved)}。無法儲存 ${formatSectionList(failed)}。`,
      );
      Alert.alert(
        "部分儲存成功",
        `已儲存 ${formatSectionList(saved)}。無法儲存 ${formatSectionList(failed)}。`,
      );
    } finally {
      setSaving(false);
    }
  };

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
      <CanvasShell theme={THEME} contentContainerStyle={styles.shellContent}>
        <CanvasPageHeader
          theme={THEME}
          title={driverStrings.settings.title}
          subtitle="裝置尚未配置司機身份"
        />
        <CanvasBanner
          theme={THEME}
          tone="warn"
          title="尚未完成裝置配置"
          body="此裝置尚未分配司機身份，無法載入設定。"
          icon={
            <Ionicons name="lock-closed-outline" size={16} color={THEME.warn} />
          }
          actions={
            <CanvasBtn
              theme={THEME}
              variant="primary"
              size="sm"
              onPress={() => router.push("/onboarding")}
            >
              前往配置裝置
            </CanvasBtn>
          }
        />
      </CanvasShell>
    );
  }

  if (loading) {
    return (
      <CanvasShell theme={THEME} contentContainerStyle={styles.loadingContent}>
        <CanvasPageHeader
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
      </CanvasShell>
    );
  }

  return (
    <CanvasShell
      theme={THEME}
      contentContainerStyle={styles.shellContent}
      footer={
        <View style={styles.footerStack}>
          {dirty || saving || saveError || validationMessage ? (
            <CanvasBtn
              theme={THEME}
              variant="primary"
              size="md"
              onPress={() => void handleSave()}
              disabled={saveDisabled}
              style={styles.footerSaveButton}
              icon={
                saving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Ionicons name="save-outline" size={15} color="#FFFFFF" />
                )
              }
            >
              {saving ? "儲存中…" : "儲存變更"}
            </CanvasBtn>
          ) : null}
          <DriverBottomTabs
            active="settings"
            onNavigate={(route) => router.push(route as never)}
          />
        </View>
      }
    >
      <CanvasPageHeader
        theme={THEME}
        title={driverStrings.settings.title}
        style={styles.pageHeader}
      />

      {loadError ? (
        <CanvasBanner
          theme={THEME}
          tone="warn"
          body={loadError}
          icon={
            <Ionicons
              name="alert-circle-outline"
              size={16}
              color={THEME.warn}
            />
          }
        />
      ) : null}
      {validationMessage ? (
        <CanvasBanner
          theme={THEME}
          tone="danger"
          body={validationMessage}
          icon={
            <Ionicons name="warning-outline" size={16} color={THEME.danger} />
          }
        />
      ) : null}
      {saveError ? (
        <CanvasBanner
          theme={THEME}
          tone="danger"
          body={saveError}
          icon={
            <Ionicons
              name="close-circle-outline"
              size={16}
              color={THEME.danger}
            />
          }
        />
      ) : null}

      <CanvasCard theme={THEME} padding={16} style={styles.profileCard}>
        <ProfileSummaryCard
          initial={profileInitial}
          name={profileValues.profileName.trim() || "尚未填寫司機姓名"}
          summary={identitySummary || "尚未填寫聯絡資訊"}
        />
      </CanvasCard>

      <ScreenSection
        title={driverStrings.settings.sections.bindings}
        subtitle="連線後可接收該平台訂單。"
        style={styles.bindingsSection}
      >
        <CanvasCard theme={THEME} padding={0}>
          {presences.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={[styles.emptyText, { color: THEME.textMuted }]}>
                目前尚未同步到平台綁定資料。
              </Text>
            </View>
          ) : (
            presences.map((record, index) => (
              <BindingRow
                key={record.platformCode}
                record={record}
                onPress={() => router.push("/platform-presence")}
                last={index === presences.length - 1}
              />
            ))
          )}
        </CanvasCard>
      </ScreenSection>

      <ScreenSection
        title={driverStrings.settings.sections.preferences}
        style={styles.tightSection}
      >
        <CanvasCard theme={THEME} padding={0}>
          <SettingRow
            label="語言"
            value={formatLanguage(settingsValues.language)}
          />
          <SettingRow
            label="最大接單距離"
            value={formatRadius(settingsValues.maxAcceptRadius)}
          />
          <SettingRow
            label="自動接單"
            subtitle="僅自營派單可開啟自動接單"
            right={
              <Switch
                value={settingsValues.autoAcceptEnabled}
                onValueChange={(value) =>
                  updateSettings({ autoAcceptEnabled: value })
                }
                disabled={!settingsLoaded || saving}
                trackColor={{
                  false: THEME.borderStrong,
                  true: THEME.accentHi,
                }}
                thumbColor={
                  settingsValues.autoAcceptEnabled ? THEME.accent : "#FFFFFF"
                }
              />
            }
          />
          <SettingRow
            label="通知"
            value={formatNotification(settingsValues.notificationsEnabled)}
            last
          />
        </CanvasCard>
      </ScreenSection>

      <ScreenSection
        title={driverStrings.settings.sections.misc}
        style={styles.miscSection}
      >
        <CanvasCard theme={THEME} padding={0}>
          <SettingRow
            label={driverStrings.settings.utilityLabels.emergencyContact}
            subtitle={emergencySummary}
          />
          <SettingRow
            label={driverStrings.settings.utilityLabels.aboutDevice}
            subtitle={driverId || "未設定"}
          />
          <SettingRow
            label={driverStrings.settings.utilityLabels.logout}
            onPress={handleLogout}
            danger
            showChevron={false}
            last
          />
        </CanvasCard>
      </ScreenSection>
    </CanvasShell>
  );
}

const styles = StyleSheet.create({
  shellContent: {
    paddingBottom: 20,
    gap: 0,
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
  pageHeader: {
    paddingBottom: 8,
  },
  profileCard: {
    marginTop: 14,
    gap: 14,
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
  footerStack: {
    backgroundColor: THEME.surface,
  },
  footerSaveButton: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
  },
  divider: {
    height: 1,
  },
  fieldStack: {
    gap: 10,
  },
  sectionBlock: {
    gap: 8,
  },
  bindingsSection: {
    marginTop: 14,
  },
  tightSection: {
    marginTop: 14,
  },
  miscSection: {
    marginTop: 14,
    marginBottom: 8,
  },
  sectionHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  sectionHeading: {
    flex: 1,
    gap: 2,
  },
  sectionAction: {
    flexShrink: 0,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20,
  },
  sectionSubtitle: {
    fontSize: 12,
    lineHeight: 18,
  },
  bindingRow: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  bindingCopy: {
    flex: 1,
    minWidth: 0,
  },
  bindingLabel: {
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 18,
  },
  bindingSubtitle: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 15,
  },
  settingRow: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  settingMain: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 18,
  },
  settingSubtitle: {
    fontSize: 11.5,
    lineHeight: 16,
  },
  settingRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  settingValue: {
    fontSize: 13,
    lineHeight: 17,
  },
  editorBlock: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 16,
    borderTopWidth: 1,
    gap: 10,
  },
  editorTitle: {
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },
  editorHint: {
    fontSize: 11.5,
    lineHeight: 16,
  },
  toggleRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  toggleCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  toggleLabel: {
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  },
  toggleHint: {
    fontSize: 11.5,
    lineHeight: 16,
  },
  errorText: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: -4,
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
