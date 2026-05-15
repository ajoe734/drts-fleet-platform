import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import type { DriverProfileRecord, DriverSettings } from "@drts/contracts";
import { PlatformBinding } from "@/components/platform-binding";
import { ActionButton } from "@/components/ui/ActionButton";
import { AppScreen } from "@/components/ui/AppScreen";
import { BottomActionBar } from "@/components/ui/BottomActionBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { FormField } from "@/components/ui/FormField";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusChip, type StatusChipVariant } from "@/components/ui/StatusChip";
import { Tokens } from "@/components/ui/tokens";
import {
  getDriverClient,
  getDriverId,
  clearDriverProvisioning,
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
import { driverSaveStatusLabels, driverStrings } from "@/lib/strings";

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return "要求失敗";
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

interface SaveStatusDescriptor {
  label: string;
  variant: StatusChipVariant;
}

function describeSaveStatus(state: SaveState): SaveStatusDescriptor {
  switch (state) {
    case "saving":
      return driverSaveStatusLabels.saving;
    case "dirty":
      return driverSaveStatusLabels.dirty;
    case "saved":
      return driverSaveStatusLabels.saved;
    case "error":
      return driverSaveStatusLabels.error;
    default:
      return driverSaveStatusLabels.idle;
  }
}

interface FormSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
}

function FormSection({ title, description, children }: FormSectionProps) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {description ? (
          <Text style={styles.sectionDescription}>{description}</Text>
        ) : null}
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

interface SwitchRowProps {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}

function SwitchRow({
  label,
  description,
  value,
  onValueChange,
  disabled = false,
}: SwitchRowProps) {
  return (
    <View style={styles.switchRow}>
      <View style={styles.switchTextBlock}>
        <Text style={styles.switchLabel}>{label}</Text>
        {description ? (
          <Text style={styles.switchDescription}>{description}</Text>
        ) : null}
      </View>
      <Switch value={value} onValueChange={onValueChange} disabled={disabled} />
    </View>
  );
}

interface UtilityRowProps {
  label: string;
  detail?: string;
  tone?: "default" | "danger";
  onPress?: () => void;
}

function UtilityRow({
  label,
  detail,
  tone = "default",
  onPress,
}: UtilityRowProps) {
  const content = (
    <View style={styles.utilityRow}>
      <View style={styles.utilityTextBlock}>
        <Text
          style={[
            styles.utilityLabel,
            tone === "danger" ? styles.utilityLabelDanger : null,
          ]}
        >
          {label}
        </Text>
        {detail ? <Text style={styles.utilityDetail}>{detail}</Text> : null}
      </View>
      <Ionicons
        name={onPress ? "chevron-forward" : "information-circle-outline"}
        size={18}
        color={
          tone === "danger" ? Tokens.colors.danger : Tokens.colors.textMuted
        }
      />
    </View>
  );

  if (!onPress) {
    return content;
  }

  return (
    <Pressable onPress={onPress} style={styles.utilityPressable}>
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
      const [settingsResult, profileResult] = await Promise.allSettled([
        client.getDriverSettings(driverId),
        client.getDriverProfile(),
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
      <AppScreen scrollable={false}>
        <PageHeader title={driverStrings.settings.title} />
        <EmptyState
          title="尚未完成裝置配置"
          description="此裝置尚未分配司機身份，無法載入設定。"
          icon="lock-closed-outline"
          actionTitle="前往配置裝置"
          onAction={() => router.push("/onboarding")}
          style={styles.fillState}
        />
      </AppScreen>
    );
  }

  if (loading) {
    return (
      <AppScreen scrollable={false}>
        <PageHeader title={driverStrings.settings.title} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Tokens.colors.primary} />
          <Text style={styles.loadingLabel}>載入設定中…</Text>
        </View>
      </AppScreen>
    );
  }

  const saveDisabled = !dirty || hasValidation || saving;

  return (
    <View style={styles.root}>
      <AppScreen>
        <View style={styles.heroHeader}>
          <Text style={styles.screenTitle}>設定</Text>
          <Text style={styles.screenSubtitle}>
            個人資料、偏好設定與平台帳號綁定
          </Text>
        </View>

        <View style={styles.content}>
          {loadError ? <ErrorBanner message={loadError} /> : null}
          {validationMessage ? (
            <ErrorBanner message={validationMessage} />
          ) : null}
          {saveError ? <ErrorBanner message={saveError} /> : null}

          <FormSection
            title="司機身份"
            description="維持最新的聯絡方式以便派遣與行政聯繫。"
          >
            <View style={styles.profileHeroCard}>
              <View style={styles.profileAvatar}>
                <Text style={styles.profileAvatarText}>{profileInitial}</Text>
              </View>
              <View style={styles.profileIdentityBlock}>
                <Text style={styles.profileName}>
                  {profileValues.profileName.trim() || "尚未填寫司機姓名"}
                </Text>
                <Text style={styles.profileMeta}>
                  {identitySummary || "尚未填寫聯絡資訊"}
                </Text>
              </View>
              <StatusChip
                label={saveStatus.label}
                variant={saveStatus.variant}
                style={styles.profileStatusChip}
              />
            </View>

            <FormField
              label="姓名"
              value={profileValues.profileName}
              onChangeText={(value) => updateProfile({ profileName: value })}
              placeholder="司機姓名"
              error={profileErrors.profileName}
              editable={profileLoaded && !saving}
            />
            <FormField
              label="電話"
              value={profileValues.profilePhone}
              onChangeText={(value) => updateProfile({ profilePhone: value })}
              placeholder="+886-900-000-000"
              keyboardType="phone-pad"
              error={profileErrors.profilePhone}
              editable={profileLoaded && !saving}
            />
            <FormField
              label="電子郵件"
              value={profileValues.profileEmail}
              onChangeText={(value) => updateProfile({ profileEmail: value })}
              placeholder="driver@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              error={profileErrors.profileEmail}
              editable={profileLoaded && !saving}
            />
          </FormSection>

          <FormSection
            title="緊急聯絡人"
            description="緊急情況時平台會優先聯絡此人；任一欄位填寫後姓名與電話為必填。"
          >
            <FormField
              label="聯絡人姓名"
              value={profileValues.emergencyName}
              onChangeText={(value) => updateProfile({ emergencyName: value })}
              placeholder="緊急聯絡人姓名"
              error={profileErrors.emergencyName}
              editable={profileLoaded && !saving}
            />
            <FormField
              label="聯絡人電話"
              value={profileValues.emergencyPhone}
              onChangeText={(value) => updateProfile({ emergencyPhone: value })}
              placeholder="+886-900-000-001"
              keyboardType="phone-pad"
              error={profileErrors.emergencyPhone}
              editable={profileLoaded && !saving}
            />
            <FormField
              label="關係"
              value={profileValues.emergencyRelationship}
              onChangeText={(value) =>
                updateProfile({ emergencyRelationship: value })
              }
              placeholder="配偶、兄弟姐妹、父母…"
              editable={profileLoaded && !saving}
            />
          </FormSection>

          <FormSection
            title="偏好設定"
            description="調整系統介面語言、接單範圍與通知行為。"
          >
            <FormField
              label="介面語言"
              value={settingsValues.language}
              onChangeText={(value) => updateSettings({ language: value })}
              placeholder="zh-TW"
              autoCapitalize="none"
              error={settingsErrors.language}
              editable={settingsLoaded && !saving}
            />
            <FormField
              label="最大接單範圍（公里）"
              value={settingsValues.maxAcceptRadius}
              onChangeText={(value) =>
                updateSettings({ maxAcceptRadius: value })
              }
              placeholder="例如：10"
              keyboardType="numeric"
              error={settingsErrors.maxAcceptRadius}
              helpText="留白代表不限制；最大可設定到 200 公里。"
              editable={settingsLoaded && !saving}
            />
            <View style={styles.switchCard}>
              <SwitchRow
                label="通知"
                description="關閉後將不會收到任務指派與行政通知。"
                value={settingsValues.notificationsEnabled}
                onValueChange={(value) =>
                  updateSettings({ notificationsEnabled: value })
                }
                disabled={!settingsLoaded || saving}
              />
              <View style={styles.switchDivider} />
              <SwitchRow
                label="自動接單（全平台）"
                description="開啟後會對所有已綁定平台的合格派遣自動接單；目前尚未提供逐平台覆寫，外部平台仍以該平台的接單規則為準。"
                value={settingsValues.autoAcceptEnabled}
                onValueChange={(value) =>
                  updateSettings({ autoAcceptEnabled: value })
                }
                disabled={!settingsLoaded || saving}
              />
            </View>
          </FormSection>

          <FormSection
            title="平台帳號綁定"
            description="管理外部平台帳號綁定、重新驗證、平台憑證與接單資格；狀態與「平台健康中心」即時同步。"
          >
            <PlatformBinding showSectionTitle={false} />
          </FormSection>

          <FormSection
            title="其他"
            description="快速查看緊急聯絡、裝置資訊與帳號動作。"
          >
            <View style={styles.utilityCard}>
              <UtilityRow label="緊急聯絡人" detail={emergencySummary} />
              <View style={styles.utilityDivider} />
              <UtilityRow
                label="關於本機"
                detail={identitySummary || driverId}
              />
              <View style={styles.utilityDivider} />
              <UtilityRow
                label="查看收益"
                detail="前往收益與月結摘要"
                onPress={() => router.push("/earnings")}
              />
              <View style={styles.utilityDivider} />
              <UtilityRow
                label="登出"
                detail="清除此裝置上的司機登入狀態"
                tone="danger"
                onPress={handleLogout}
              />
            </View>
          </FormSection>
        </View>
      </AppScreen>

      <BottomActionBar>
        <ActionButton
          title={
            saving
              ? "正在儲存…"
              : hasValidation
                ? "請先修正欄位"
                : dirty
                  ? "儲存設定"
                  : "目前無變更"
          }
          icon={saving ? undefined : "save-outline"}
          onPress={handleSave}
          loading={saving}
          disabled={saveDisabled}
          style={{ flex: 1 }}
        />
      </BottomActionBar>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Tokens.spacing.xxl,
  },
  fillState: { flex: 1 },
  loadingLabel: {
    marginTop: Tokens.spacing.sm,
    color: Tokens.colors.textMuted,
  },
  content: { paddingVertical: Tokens.spacing.lg, gap: Tokens.spacing.lg },
  heroHeader: {
    paddingTop: Tokens.spacing.sm,
    gap: Tokens.spacing.xs,
  },
  screenTitle: {
    ...Tokens.type.screenTitle,
    color: Tokens.colors.textStrong,
  },
  screenSubtitle: {
    ...Tokens.type.body,
    color: Tokens.colors.textMuted,
  },
  section: {
    backgroundColor: Tokens.colors.surface,
    borderRadius: Tokens.radius.lg,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    padding: Tokens.spacing.lg,
    gap: Tokens.spacing.sm,
    ...Tokens.shadows.sm,
  },
  sectionHeader: { marginBottom: Tokens.spacing.md },
  sectionTitle: {
    ...Tokens.type.sectionTitle,
    color: Tokens.colors.textStrong,
  },
  sectionDescription: {
    ...Tokens.type.micro,
    color: Tokens.colors.textMuted,
    marginTop: 4,
  },
  sectionBody: { gap: Tokens.spacing.xs },
  profileHeroCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Tokens.spacing.md,
    padding: Tokens.spacing.md,
    borderRadius: Tokens.radius.lg,
    backgroundColor: Tokens.colors.brandBg,
    borderWidth: 1,
    borderColor: Tokens.colors.ownedBorder,
    marginBottom: Tokens.spacing.md,
  },
  profileAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Tokens.colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  profileAvatarText: {
    color: Tokens.colors.textInverse,
    fontSize: 18,
    fontWeight: "700",
  },
  profileIdentityBlock: {
    flex: 1,
    gap: 2,
  },
  profileName: {
    ...Tokens.type.title,
    color: Tokens.colors.textStrong,
  },
  profileMeta: {
    ...Tokens.type.small,
    color: Tokens.colors.textMuted,
  },
  profileStatusChip: {
    alignSelf: "flex-start",
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Tokens.spacing.sm,
  },
  switchTextBlock: { flex: 1, marginRight: Tokens.spacing.md },
  switchLabel: {
    ...Tokens.type.label,
    color: Tokens.colors.textStrong,
    fontWeight: "600",
  },
  switchDescription: {
    ...Tokens.type.micro,
    color: Tokens.colors.textMuted,
    marginTop: 2,
  },
  switchCard: {
    borderRadius: Tokens.radius.md,
    backgroundColor: Tokens.colors.surfaceLo,
    paddingHorizontal: Tokens.spacing.md,
  },
  switchDivider: {
    height: 1,
    backgroundColor: Tokens.colors.border,
  },
  utilityCard: {
    borderRadius: Tokens.radius.md,
    backgroundColor: Tokens.colors.surfaceLo,
    overflow: "hidden",
  },
  utilityPressable: {
    flex: 1,
  },
  utilityRow: {
    minHeight: 56,
    paddingHorizontal: Tokens.spacing.md,
    paddingVertical: Tokens.spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: Tokens.spacing.md,
  },
  utilityTextBlock: {
    flex: 1,
    gap: 2,
  },
  utilityLabel: {
    ...Tokens.type.label,
    color: Tokens.colors.textStrong,
    fontWeight: "600",
  },
  utilityLabelDanger: {
    color: Tokens.colors.danger,
  },
  utilityDetail: {
    ...Tokens.type.small,
    color: Tokens.colors.textMuted,
  },
  utilityDivider: {
    height: 1,
    backgroundColor: Tokens.colors.border,
    marginHorizontal: Tokens.spacing.md,
  },
});
