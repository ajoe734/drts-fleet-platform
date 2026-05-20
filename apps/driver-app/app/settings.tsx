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
import type { CanvasTone } from "@drts/ui-web/canvas-tokens";

import {
  Banner,
  Btn,
  Card,
  Field,
  Input,
  KPI,
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
  buildProfileCommand,
  buildSettingsCommand,
  deriveSaveState,
  hasErrors,
  profileValuesEqual,
  profileValuesFromRecord,
  settingsValuesEqual,
  settingsValuesFromRecord,
  validateProfileValues,
  validateSettingsValues,
  type ProfileFormValues,
  type SaveState,
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

function getBindingTone(record: PlatformPresenceRecord): CanvasTone {
  if (record.reauthRequired) {
    return "warn";
  }
  return record.status === "online" ? "success" : "neutral";
}

function getBindingStatus(record: PlatformPresenceRecord): string {
  if (record.reauthRequired) {
    return "需重新授權";
  }
  return record.status === "online" ? "已綁定" : "未啟用";
}

function getBindingSubtitle(record: PlatformPresenceRecord): string | null {
  const token = formatTokenExpiry(record.tokenExpiresAt);
  if (record.reauthRequired) {
    return token ? `憑證 ${token}` : "請重新完成平台驗證";
  }

  return token;
}

interface SaveStatusDescriptor {
  label: string;
  tone: CanvasTone;
}

function describeSaveStatus(state: SaveState): SaveStatusDescriptor {
  switch (state) {
    case "saving":
      return { label: "儲存中…", tone: "info" };
    case "dirty":
      return { label: "尚有未儲存變更", tone: "warn" };
    case "saved":
      return { label: "已儲存", tone: "success" };
    case "error":
      return { label: "儲存失敗", tone: "danger" };
    default:
      return { label: "尚未變更", tone: "neutral" };
  }
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

function Row({
  icon,
  label,
  value,
  subtitle,
  right,
  onPress,
  danger = false,
  last = false,
}: {
  icon?: ReactNode;
  label: string;
  value?: string | null;
  subtitle?: string | null;
  right?: ReactNode;
  onPress?: () => void;
  danger?: boolean;
  last?: boolean;
}) {
  const content = (
    <View
      style={[
        styles.row,
        {
          borderBottomColor: last ? "transparent" : THEME.border,
        },
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
            <Text style={[styles.rowSubtitle, { color: THEME.textMuted }]}>
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
              {
                color: danger ? THEME.danger : THEME.textMuted,
              },
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
    <Pressable onPress={onPress} style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}>
      {content}
    </Pressable>
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

      if (failures.length > 0) {
        setLoadError(
          `已使用可用資料。無法載入 ${formatSectionList(failures)}。`,
        );
      } else {
        setLoadError(null);
      }

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

  const saveState = deriveSaveState({
    saving,
    dirty,
    hasValidation,
    lastResult,
  });
  const saveStatus = describeSaveStatus(saveState);
  const saveDisabled = !dirty || hasValidation || saving;

  const profileInitial = profileValues.profileName.trim().charAt(0) || "司";
  const identitySummary = [
    driverId ? `ID ${driverId}` : null,
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
  const boundCount = presences.filter((entry) => entry.status === "online").length;
  const reauthCount = presences.filter((entry) => entry.reauthRequired).length;

  const updateSettings = (patch: Partial<SettingsFormValues>) => {
    setSettingsValues((prev) => ({ ...prev, ...patch }));
    if (lastResult) {
      setLastResult(null);
    }
    if (saveError) {
      setSaveError(null);
    }
  };

  const updateProfile = (patch: Partial<ProfileFormValues>) => {
    setProfileValues((prev) => ({ ...prev, ...patch }));
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
        <View style={styles.footerBar}>
          <Btn
            theme={THEME}
            variant="primary"
            size="md"
            onPress={() => void handleSave()}
            disabled={saveDisabled}
            icon={
              saving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name="save-outline" size={15} color="#FFFFFF" />
              )
            }
            style={styles.footerButton}
          >
            {saving ? "儲存中…" : dirty ? "儲存變更" : "已同步"}
          </Btn>
        </View>
      }
    >
      <PageHeader
        theme={THEME}
        title={driverStrings.settings.title}
        subtitle="個人資料、平台綁定與接單偏好"
        actions={<Pill theme={THEME} tone={saveStatus.tone}>{saveStatus.label}</Pill>}
      />

      <View style={styles.kpiRow}>
        <KPI
          theme={THEME}
          label="已綁定平台"
          value={String(boundCount)}
          sub={`${presences.length} 個平台`}
        />
        <KPI
          theme={THEME}
          label="待處理"
          value={String(reauthCount)}
          sub="需重新授權"
        />
        <KPI
          theme={THEME}
          label="儲存狀態"
          value={dirty ? "待同步" : "最新"}
          sub={saveStatus.label}
        />
      </View>

      {loadError ? (
        <Banner
          theme={THEME}
          tone="warn"
          body={loadError}
          icon={<Ionicons name="alert-circle-outline" size={16} color={THEME.warn} />}
        />
      ) : null}
      {validationMessage ? (
        <Banner
          theme={THEME}
          tone="danger"
          body={validationMessage}
          icon={<Ionicons name="warning-outline" size={16} color={THEME.danger} />}
        />
      ) : null}
      {saveError ? (
        <Banner
          theme={THEME}
          tone="danger"
          body={saveError}
          icon={<Ionicons name="close-circle-outline" size={16} color={THEME.danger} />}
        />
      ) : null}

      <View style={styles.sectionStack}>
        <SectionTitle
          title={driverStrings.settings.sections.identity}
          subtitle="維持最新的聯絡方式以便派遣與行政聯繫。"
        />
        <Card theme={THEME} padding={16}>
          <View style={styles.profileHero}>
            <View
              style={[
                styles.avatar,
                { backgroundColor: THEME.accentBg, borderColor: THEME.accentBorder },
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
          </View>

          <View style={styles.fieldStack}>
            <Field theme={THEME} label="姓名" required>
              <Input
                theme={THEME}
                value={profileValues.profileName}
                ph="司機姓名"
                editable={profileLoaded && !saving}
                onChangeText={(value) => updateProfile({ profileName: value })}
              />
            </Field>
            {profileErrors.profileName ? (
              <Text style={[styles.errorText, { color: THEME.danger }]}>
                {profileErrors.profileName}
              </Text>
            ) : null}

            <Field theme={THEME} label="電話">
              <Input
                theme={THEME}
                value={profileValues.profilePhone}
                ph="+886-900-000-000"
                editable={profileLoaded && !saving}
                onChangeText={(value) => updateProfile({ profilePhone: value })}
              />
            </Field>

            <Field theme={THEME} label="電子郵件">
              <Input
                theme={THEME}
                value={profileValues.profileEmail}
                ph="driver@example.com"
                editable={profileLoaded && !saving}
                onChangeText={(value) => updateProfile({ profileEmail: value })}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </Field>
            {profileErrors.profileEmail ? (
              <Text style={[styles.errorText, { color: THEME.danger }]}>
                {profileErrors.profileEmail}
              </Text>
            ) : null}
          </View>
        </Card>
      </View>

      <View style={styles.sectionStack}>
        <SectionTitle
          title={driverStrings.settings.sections.bindings}
          subtitle="連線後可接收該平台訂單。"
          action={
            <Btn
              theme={THEME}
              variant="ghost"
              size="xs"
              onPress={() => router.push("/platform-presence")}
            >
              管理
            </Btn>
          }
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
              <Row
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
                  <Pill theme={THEME} tone={getBindingTone(record)}>
                    {getBindingStatus(record)}
                  </Pill>
                }
                last={index === presences.length - 1}
              />
            ))
          )}
        </Card>
      </View>

      <View style={styles.sectionStack}>
        <SectionTitle title="偏好" />
        <Card theme={THEME} padding={0}>
          <Row
            label="語言"
            value={formatLanguage(settingsValues.language)}
            subtitle={settingsErrors.language}
          />
          <View style={styles.rowForm}>
            <Field theme={THEME} label="最大接單距離">
              <Input
                theme={THEME}
                value={settingsValues.maxAcceptRadius}
                ph="8"
                suffix="km"
                editable={settingsLoaded && !saving}
                onChangeText={(value) => updateSettings({ maxAcceptRadius: value })}
              />
            </Field>
            {settingsErrors.maxAcceptRadius ? (
              <Text style={[styles.errorText, { color: THEME.danger }]}>
                {settingsErrors.maxAcceptRadius}
              </Text>
            ) : (
              <Text style={[styles.helperText, { color: THEME.textMuted }]}>
                目前設定：{formatRadius(settingsValues.maxAcceptRadius)}
              </Text>
            )}
          </View>
          <View style={[styles.toggleRow, { borderTopColor: THEME.border }]}>
            <View style={styles.toggleCopy}>
              <Text style={[styles.rowLabel, { color: THEME.text }]}>自動接單</Text>
              <Text style={[styles.rowSubtitle, { color: THEME.textMuted }]}>
                僅自營派單可開啟自動接單
              </Text>
            </View>
            <Switch
              value={settingsValues.autoAcceptEnabled}
              onValueChange={(value) => updateSettings({ autoAcceptEnabled: value })}
              disabled={!settingsLoaded || saving}
              trackColor={{ false: THEME.borderStrong, true: THEME.accentHi }}
              thumbColor={
                settingsValues.autoAcceptEnabled ? THEME.accent : "#FFFFFF"
              }
            />
          </View>
          <View style={[styles.toggleRow, { borderTopColor: THEME.border }]}>
            <View style={styles.toggleCopy}>
              <Text style={[styles.rowLabel, { color: THEME.text }]}>通知</Text>
              <Text style={[styles.rowSubtitle, { color: THEME.textMuted }]}>
                {formatNotification(settingsValues.notificationsEnabled)}
              </Text>
            </View>
            <Switch
              value={settingsValues.notificationsEnabled}
              onValueChange={(value) =>
                updateSettings({ notificationsEnabled: value })
              }
              disabled={!settingsLoaded || saving}
              trackColor={{ false: THEME.borderStrong, true: THEME.accentHi }}
              thumbColor={
                settingsValues.notificationsEnabled ? THEME.accent : "#FFFFFF"
              }
            />
          </View>
        </Card>
      </View>

      <View style={styles.sectionStack}>
        <SectionTitle title={driverStrings.settings.sections.misc} />
        <Card theme={THEME} padding={0}>
          <Row
            label={driverStrings.settings.utilityLabels.emergencyContact}
            subtitle={emergencySummary}
          />
          <Row label={driverStrings.settings.utilityLabels.aboutDevice} subtitle={driverId} />
          <Row
            label={driverStrings.settings.utilityLabels.logout}
            subtitle="登出後需要重新綁定此裝置"
            onPress={handleLogout}
            danger
            last
          />
        </Card>
      </View>

      <View style={styles.sectionStack}>
        <SectionTitle
          title={driverStrings.settings.sections.emergency}
          subtitle="任一欄位填寫後，姓名與電話為必填。"
        />
        <Card theme={THEME} padding={16}>
          <View style={styles.fieldStack}>
            <Field theme={THEME} label="聯絡人姓名">
              <Input
                theme={THEME}
                value={profileValues.emergencyName}
                ph="緊急聯絡人姓名"
                editable={profileLoaded && !saving}
                onChangeText={(value) => updateProfile({ emergencyName: value })}
              />
            </Field>
            {profileErrors.emergencyName ? (
              <Text style={[styles.errorText, { color: THEME.danger }]}>
                {profileErrors.emergencyName}
              </Text>
            ) : null}

            <Field theme={THEME} label="聯絡人電話">
              <Input
                theme={THEME}
                value={profileValues.emergencyPhone}
                ph="+886-900-000-000"
                editable={profileLoaded && !saving}
                onChangeText={(value) => updateProfile({ emergencyPhone: value })}
              />
            </Field>
            {profileErrors.emergencyPhone ? (
              <Text style={[styles.errorText, { color: THEME.danger }]}>
                {profileErrors.emergencyPhone}
              </Text>
            ) : null}

            <Field theme={THEME} label="關係">
              <Input
                theme={THEME}
                value={profileValues.emergencyRelationship}
                ph="配偶、家人、朋友"
                editable={profileLoaded && !saving}
                onChangeText={(value) =>
                  updateProfile({ emergencyRelationship: value })
                }
              />
            </Field>
          </View>
        </Card>
      </View>
    </Shell>
  );
}

const styles = StyleSheet.create({
  shellContent: {
    paddingBottom: 28,
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
    fontSize: 14,
  },
  kpiRow: {
    flexDirection: "row",
    gap: 8,
  },
  sectionStack: {
    gap: 8,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: 12,
    paddingHorizontal: 2,
  },
  sectionCopy: {
    flex: 1,
    gap: 2,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  sectionSubtitle: {
    fontSize: 12,
    lineHeight: 18,
  },
  profileHero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: "700",
  },
  profileCopy: {
    flex: 1,
    gap: 2,
  },
  profileName: {
    fontSize: 16,
    fontWeight: "700",
  },
  profileMeta: {
    fontSize: 12,
  },
  fieldStack: {
    gap: 10,
  },
  errorText: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: -4,
  },
  helperText: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 2,
  },
  emptyCard: {
    padding: 16,
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 20,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  rowMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  rowIcon: {
    width: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  rowCopy: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  rowSubtitle: {
    fontSize: 12,
    lineHeight: 18,
  },
  rowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 1,
  },
  rowValue: {
    fontSize: 12,
  },
  platformBadge: {
    minWidth: 40,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 12,
    alignItems: "center",
  },
  platformBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  rowForm: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: THEME.border,
    gap: 6,
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
  },
  toggleCopy: {
    flex: 1,
    gap: 2,
  },
  footerBar: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  footerButton: {
    width: "100%",
    justifyContent: "center",
  },
});
