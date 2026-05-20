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
  DL as CanvasDL,
  Field as CanvasField,
  Input as CanvasInput,
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
const LANGUAGE_OPTIONS = [
  { value: "zh-TW", label: "繁體中文" },
  { value: "en", label: "English" },
  { value: "ja", label: "日本語" },
] as const;

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

function formatOptionalValue(value: string): string {
  const trimmed = value.trim();
  return trimmed || "未設定";
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
  disabled = false,
  showChevron = Boolean(onPress),
  danger = false,
  last = false,
}: {
  label: string;
  subtitle?: string | null;
  value?: string | null;
  right?: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
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
            {
              color: disabled
                ? THEME.textDim
                : danger
                  ? THEME.danger
                  : THEME.text,
            },
          ]}
        >
          {label}
        </Text>
        {subtitle ? (
          <Text
            style={[
              styles.settingSubtitle,
              {
                color: disabled
                  ? THEME.textDim
                  : danger || subtitle.includes("需重新授權")
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
              {
                color: disabled
                  ? THEME.textDim
                  : danger
                    ? THEME.danger
                    : THEME.textMuted,
              },
            ]}
          >
            {value}
          </Text>
        ) : null}
        {right}
        {onPress && showChevron && !disabled ? (
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
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [{ opacity: pressed && !disabled ? 0.88 : 1 }]}
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
  const [activeEditor, setActiveEditor] = useState<
    "profile" | "preferences" | "emergency" | null
  >(null);

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
  const profileSectionAvailable = profileLoaded;
  const settingsSectionAvailable = settingsLoaded;

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

  const profileInitial =
    profileSectionAvailable && profileValues.profileName.trim()
      ? profileValues.profileName.trim().charAt(0)
      : "司";
  const identitySummary = profileSectionAvailable
    ? [
        driverId ? `D-${driverId.replace(/^D-?/i, "")}` : null,
        profileValues.profilePhone.trim() || null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "個人資料未載入";
  const emergencySummary = profileSectionAvailable
    ? [
        profileValues.emergencyName.trim() || "尚未設定",
        profileValues.emergencyRelationship.trim() || null,
        profileValues.emergencyPhone.trim() || null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "緊急聯絡人資料未載入";

  const presences = [...(presenceSummary?.presences ?? [])].sort((a, b) =>
    getPlatformDisplayName(a).localeCompare(getPlatformDisplayName(b), "zh-TW"),
  );

  const updateSettings = (patch: Partial<SettingsFormValues>) => {
    if (!settingsSectionAvailable) {
      return;
    }
    setSettingsValues((prev) => ({ ...prev, ...patch }));
    if (lastResult) {
      setLastResult(null);
    }
    if (saveError) {
      setSaveError(null);
    }
  };

  const updateProfile = (patch: Partial<ProfileFormValues>) => {
    if (!profileSectionAvailable) {
      return;
    }
    setProfileValues((prev) => ({ ...prev, ...patch }));
    if (lastResult) {
      setLastResult(null);
    }
    if (saveError) {
      setSaveError(null);
    }
  };

  const toggleEditor = (editor: "profile" | "preferences" | "emergency") => {
    if (
      (editor === "preferences" && !settingsSectionAvailable) ||
      ((editor === "profile" || editor === "emergency") &&
        !profileSectionAvailable)
    ) {
      return;
    }
    setActiveEditor((prev) => (prev === editor ? null : editor));
  };

  useEffect(() => {
    if (
      (activeEditor === "preferences" && !settingsSectionAvailable) ||
      ((activeEditor === "profile" || activeEditor === "emergency") &&
        !profileSectionAvailable)
    ) {
      setActiveEditor(null);
    }
  }, [activeEditor, profileSectionAvailable, settingsSectionAvailable]);

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

      <Pressable
        accessibilityRole="button"
        disabled={!profileSectionAvailable}
        onPress={() => toggleEditor("profile")}
        style={({ pressed }) => [
          { opacity: pressed && profileSectionAvailable ? 0.92 : 1 },
        ]}
      >
        <CanvasCard theme={THEME} padding={16} style={styles.profileCard}>
          <ProfileSummaryCard
            initial={profileInitial}
            name={
              profileSectionAvailable
                ? profileValues.profileName.trim() || "尚未填寫司機姓名"
                : "個人資料未載入"
            }
            summary={
              profileSectionAvailable
                ? identitySummary || "尚未填寫聯絡資訊"
                : identitySummary
            }
          />
        </CanvasCard>
      </Pressable>
      {activeEditor === "profile" ? (
        <CanvasCard theme={THEME} padding={16}>
          <View style={styles.editorHeadingRow}>
            <View style={styles.editorHeadingCopy}>
              <Text style={[styles.editorTitle, { color: THEME.text }]}>
                {driverStrings.settings.sections.identity}
              </Text>
              <Text style={[styles.editorHint, { color: THEME.textMuted }]}>
                編輯司機姓名與聯絡資訊，儲存後同步更新司機檔案。
              </Text>
            </View>
            <CanvasBtn
              theme={THEME}
              variant="ghost"
              size="sm"
              onPress={() => setActiveEditor(null)}
            >
              收合
            </CanvasBtn>
          </View>
          <CanvasDL
            theme={THEME}
            cols={2}
            monoVal
            items={[
              { label: "司機編號", value: driverId || "未設定", mono: true },
              {
                label: "目前電話",
                value: formatOptionalValue(profileValues.profilePhone),
              },
            ]}
          />
          <View style={styles.fieldStack}>
            <CanvasField theme={THEME} label="姓名" required>
              <CanvasInput
                theme={THEME}
                value={profileValues.profileName}
                ph="請填寫司機姓名"
                editable={!saving}
                onChangeText={(value) => updateProfile({ profileName: value })}
              />
            </CanvasField>
            {profileErrors.profileName ? (
              <Text style={[styles.errorText, { color: THEME.danger }]}>
                {profileErrors.profileName}
              </Text>
            ) : null}
            <CanvasField theme={THEME} label="聯絡電話">
              <CanvasInput
                theme={THEME}
                value={profileValues.profilePhone}
                ph="例如：0912 345 678"
                editable={!saving}
                onChangeText={(value) => updateProfile({ profilePhone: value })}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </CanvasField>
            <CanvasField theme={THEME} label="電子郵件">
              <CanvasInput
                theme={THEME}
                value={profileValues.profileEmail}
                ph="name@example.com"
                editable={!saving}
                onChangeText={(value) => updateProfile({ profileEmail: value })}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </CanvasField>
            {profileErrors.profileEmail ? (
              <Text style={[styles.errorText, { color: THEME.danger }]}>
                {profileErrors.profileEmail}
              </Text>
            ) : null}
          </View>
        </CanvasCard>
      ) : null}

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
            value={
              settingsSectionAvailable
                ? formatLanguage(settingsValues.language)
                : "未載入"
            }
            onPress={() => toggleEditor("preferences")}
            disabled={!settingsSectionAvailable}
          />
          <SettingRow
            label="最大接單距離"
            value={
              settingsSectionAvailable
                ? formatRadius(settingsValues.maxAcceptRadius)
                : "未載入"
            }
            onPress={() => toggleEditor("preferences")}
            disabled={!settingsSectionAvailable}
          />
          <SettingRow
            label="自動接單"
            subtitle={
              settingsSectionAvailable
                ? "僅自營派單可開啟自動接單"
                : "偏好設定未載入"
            }
            disabled={!settingsSectionAvailable}
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
            value={
              settingsSectionAvailable
                ? formatNotification(settingsValues.notificationsEnabled)
                : "未載入"
            }
            onPress={() => toggleEditor("preferences")}
            disabled={!settingsSectionAvailable}
            last
          />
        </CanvasCard>
        {activeEditor === "preferences" ? (
          <CanvasCard theme={THEME} padding={16} style={styles.editorCard}>
            <View style={styles.editorHeadingRow}>
              <View style={styles.editorHeadingCopy}>
                <Text style={[styles.editorTitle, { color: THEME.text }]}>
                  {driverStrings.settings.sections.preferences}
                </Text>
                <Text style={[styles.editorHint, { color: THEME.textMuted }]}>
                  保留 ScreenSettings 的 compact list，進階欄位在這裡編輯。
                </Text>
              </View>
              <CanvasBtn
                theme={THEME}
                variant="ghost"
                size="sm"
                onPress={() => setActiveEditor(null)}
              >
                收合
              </CanvasBtn>
            </View>
            <View style={styles.fieldStack}>
              <CanvasField
                theme={THEME}
                label="介面語言"
                hint="保留現有設定鍵值，切換後下次載入生效。"
                required
              >
                <View style={styles.choiceWrap}>
                  {LANGUAGE_OPTIONS.map((option) => (
                    <CanvasBtn
                      key={option.value}
                      theme={THEME}
                      variant={
                        settingsValues.language === option.value
                          ? "primary"
                          : "secondary"
                      }
                      size="sm"
                      disabled={saving}
                      onPress={() => updateSettings({ language: option.value })}
                    >
                      {option.label}
                    </CanvasBtn>
                  ))}
                </View>
              </CanvasField>
              {settingsErrors.language ? (
                <Text style={[styles.errorText, { color: THEME.danger }]}>
                  {settingsErrors.language}
                </Text>
              ) : null}
              <CanvasField
                theme={THEME}
                label="最大接單距離"
                hint="留空代表不限制。"
              >
                <CanvasInput
                  theme={THEME}
                  value={settingsValues.maxAcceptRadius}
                  ph="例如：8"
                  suffix="km"
                  editable={!saving}
                  onChangeText={(value) =>
                    updateSettings({ maxAcceptRadius: value })
                  }
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </CanvasField>
              {settingsErrors.maxAcceptRadius ? (
                <Text style={[styles.errorText, { color: THEME.danger }]}>
                  {settingsErrors.maxAcceptRadius}
                </Text>
              ) : null}
              <CanvasField theme={THEME} label="通知偏好">
                <View style={styles.toggleRow}>
                  <View style={styles.toggleCopy}>
                    <Text style={[styles.toggleLabel, { color: THEME.text }]}>
                      推播通知
                    </Text>
                    <Text
                      style={[styles.toggleHint, { color: THEME.textMuted }]}
                    >
                      關閉後不再接收任務與系統通知提醒。
                    </Text>
                  </View>
                  <Switch
                    value={settingsValues.notificationsEnabled}
                    onValueChange={(value) =>
                      updateSettings({ notificationsEnabled: value })
                    }
                    disabled={!settingsLoaded || saving}
                    trackColor={{
                      false: THEME.borderStrong,
                      true: THEME.accentHi,
                    }}
                    thumbColor={
                      settingsValues.notificationsEnabled
                        ? THEME.accent
                        : "#FFFFFF"
                    }
                  />
                </View>
              </CanvasField>
            </View>
          </CanvasCard>
        ) : null}
      </ScreenSection>

      <ScreenSection
        title={driverStrings.settings.sections.misc}
        style={styles.miscSection}
      >
        <CanvasCard theme={THEME} padding={0}>
          <SettingRow
            label={driverStrings.settings.utilityLabels.emergencyContact}
            subtitle={emergencySummary}
            onPress={() => toggleEditor("emergency")}
            disabled={!profileSectionAvailable}
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
        {activeEditor === "emergency" ? (
          <CanvasCard theme={THEME} padding={16} style={styles.editorCard}>
            <View style={styles.editorHeadingRow}>
              <View style={styles.editorHeadingCopy}>
                <Text style={[styles.editorTitle, { color: THEME.text }]}>
                  {driverStrings.settings.sections.emergency}
                </Text>
                <Text style={[styles.editorHint, { color: THEME.textMuted }]}>
                  未填完整時不會建立緊急聯絡人紀錄。
                </Text>
              </View>
              <CanvasBtn
                theme={THEME}
                variant="ghost"
                size="sm"
                onPress={() => setActiveEditor(null)}
              >
                收合
              </CanvasBtn>
            </View>
            <View style={styles.fieldStack}>
              <CanvasField theme={THEME} label="聯絡人姓名">
                <CanvasInput
                  theme={THEME}
                  value={profileValues.emergencyName}
                  ph="請填寫聯絡人姓名"
                  editable={!saving}
                  onChangeText={(value) =>
                    updateProfile({ emergencyName: value })
                  }
                />
              </CanvasField>
              {profileErrors.emergencyName ? (
                <Text style={[styles.errorText, { color: THEME.danger }]}>
                  {profileErrors.emergencyName}
                </Text>
              ) : null}
              <CanvasField theme={THEME} label="聯絡人電話">
                <CanvasInput
                  theme={THEME}
                  value={profileValues.emergencyPhone}
                  ph="請填寫聯絡人電話"
                  editable={!saving}
                  onChangeText={(value) =>
                    updateProfile({ emergencyPhone: value })
                  }
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </CanvasField>
              {profileErrors.emergencyPhone ? (
                <Text style={[styles.errorText, { color: THEME.danger }]}>
                  {profileErrors.emergencyPhone}
                </Text>
              ) : null}
              <CanvasField theme={THEME} label="關係">
                <CanvasInput
                  theme={THEME}
                  value={profileValues.emergencyRelationship}
                  ph="例如：配偶、家人、朋友"
                  editable={!saving}
                  onChangeText={(value) =>
                    updateProfile({ emergencyRelationship: value })
                  }
                />
              </CanvasField>
              <View style={styles.editorActionRow}>
                <CanvasBtn
                  theme={THEME}
                  variant="ghost"
                  size="sm"
                  disabled={saving}
                  onPress={() =>
                    updateProfile({
                      emergencyName: "",
                      emergencyPhone: "",
                      emergencyRelationship: "",
                    })
                  }
                >
                  清除聯絡人
                </CanvasBtn>
              </View>
            </View>
          </CanvasCard>
        ) : null}
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
  editorCard: {
    marginTop: 10,
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
  choiceWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
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
  editorHeadingRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },
  editorHeadingCopy: {
    flex: 1,
    gap: 4,
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
  editorActionRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 2,
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
