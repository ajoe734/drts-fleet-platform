import { useCallback, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
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
  describeEmptyReason,
  findAction,
  resolvePreferenceActions,
  resolveProfileActions,
  SETTINGS_REFRESH_TIER,
} from "@/lib/driver-ui-runtime";
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

function formatSyncedAt(value: Date | null): string {
  if (!value) {
    return driverStrings.common.notUpdatedYet;
  }
  const hh = `${value.getHours()}`.padStart(2, "0");
  const mm = `${value.getMinutes()}`.padStart(2, "0");
  return `上次更新 ${hh}:${mm}`;
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
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<"success" | "error" | null>(
    null,
  );
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [bindingRefresh, setBindingRefresh] = useState(0);

  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [settingsRecord, setSettingsRecord] = useState<DriverSettings | null>(
    null,
  );
  const [profileRecord, setProfileRecord] =
    useState<DriverProfileRecord | null>(null);
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

  const mountedRef = useRef(true);

  const loadAll = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!isProvisioned) {
        setLoading(false);
        return;
      }

      if (silent) {
        setRefreshing(true);
      }
      const client = getDriverClient();
      const [settingsResult, profileResult] = await Promise.allSettled([
        client.getDriverSettings(driverId),
        client.getDriverProfile(),
      ]);

      if (!mountedRef.current) {
        return;
      }

      const failures: string[] = [];

      if (settingsResult.status === "fulfilled") {
        const record = settingsResult.value as DriverSettings;
        const next = settingsValuesFromRecord(record);
        setSettingsRecord(record);
        setSettingsValues(next);
        setInitialSettings(next);
        setSettingsLoaded(true);
      } else {
        failures.push(`偏好設定（${toErrorMessage(settingsResult.reason)}）`);
      }

      if (profileResult.status === "fulfilled") {
        const record = profileResult.value as DriverProfileRecord;
        const next = profileValuesFromRecord(record);
        setProfileRecord(record);
        setProfileValues(next);
        setInitialProfile(next);
        setProfileLoaded(true);
      } else {
        failures.push(`個人資料（${toErrorMessage(profileResult.reason)}）`);
      }

      if (failures.length > 0) {
        setLoadError(`已使用可用資料。無法載入 ${formatSectionList(failures)}。`);
      } else {
        setLoadError(null);
      }

      setLastSyncedAt(new Date());
      setLoading(false);
      setRefreshing(false);
    },
    [driverId, isProvisioned],
  );

  // Manual refresh tier (packet §3.2): refresh on focus + pull-to-refresh.
  useFocusEffect(
    useCallback(() => {
      mountedRef.current = true;
      void loadAll({ silent: true });
      setBindingRefresh((value) => value + 1);
      return () => {
        mountedRef.current = false;
      };
    }, [loadAll]),
  );

  const handleManualRefresh = useCallback(() => {
    void loadAll({ silent: true });
    setBindingRefresh((value) => value + 1);
  }, [loadAll]);

  const profileActions = resolveProfileActions(profileRecord);
  const preferenceActions = resolvePreferenceActions(settingsRecord);
  const updateProfileAction = findAction(profileActions, "update_profile");
  const updateEmergencyAction = findAction(
    profileActions,
    "update_emergency_contact",
  );
  const updatePreferencesAction = findAction(
    preferenceActions,
    "update_preferences",
  );
  const profileEditable = profileLoaded && (updateProfileAction?.enabled ?? true);
  const emergencyEditable =
    profileLoaded && (updateEmergencyAction?.enabled ?? true);
  const preferencesEditable =
    settingsLoaded && (updatePreferencesAction?.enabled ?? true);

  const settingsErrors = validateSettingsValues(settingsValues);
  const profileErrors = profileLoaded ? validateProfileValues(profileValues) : {};

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
    const descriptor = describeEmptyReason("not_provisioned", {
      title: "尚未完成裝置配置",
      description: "此裝置尚未分配司機身份，無法載入設定。",
      icon: "lock-closed-outline",
    });
    return (
      <AppScreen scrollable={false}>
        <PageHeader title={driverStrings.settings.title} />
        <EmptyState
          title={descriptor.title}
          description={descriptor.description}
          icon={descriptor.icon}
          tone={descriptor.tone}
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

  // Total load failure → distinct fetch_failed EmptyReason treatment.
  if (!settingsLoaded && !profileLoaded && loadError) {
    const descriptor = describeEmptyReason("fetch_failed");
    return (
      <AppScreen scrollable={false}>
        <PageHeader title={driverStrings.settings.title} />
        <EmptyState
          title={descriptor.title}
          description={descriptor.description}
          icon={descriptor.icon}
          tone={descriptor.tone}
          actionTitle={driverStrings.common.retry}
          onAction={handleManualRefresh}
          style={styles.fillState}
        />
      </AppScreen>
    );
  }

  const saveDisabled = !dirty || hasValidation || saving;

  return (
    <View style={styles.root}>
      <AppScreen
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleManualRefresh}
            tintColor={Tokens.colors.primary}
          />
        }
      >
        <View style={styles.heroHeader}>
          <View style={styles.heroTitleRow}>
            <View style={styles.heroTitleBlock}>
              <Text style={styles.screenTitle}>設定</Text>
              <Text style={styles.screenSubtitle}>
                個人資料、偏好設定與平台帳號綁定
              </Text>
            </View>
            <Pressable
              onPress={handleManualRefresh}
              style={styles.refreshButton}
              accessibilityRole="button"
              accessibilityLabel={driverStrings.common.refresh}
            >
              <Ionicons
                name="refresh"
                size={18}
                color={Tokens.colors.primary}
              />
            </Pressable>
          </View>
          <Text style={styles.freshnessLabel}>
            {SETTINGS_REFRESH_TIER === "manual" ? "手動更新" : ""} ·{" "}
            {formatSyncedAt(lastSyncedAt)}
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
              editable={profileEditable && !saving}
            />
            <FormField
              label="電話"
              value={profileValues.profilePhone}
              onChangeText={(value) => updateProfile({ profilePhone: value })}
              placeholder="+886-900-000-000"
              keyboardType="phone-pad"
              error={profileErrors.profilePhone}
              editable={profileEditable && !saving}
            />
            <FormField
              label="電子郵件"
              value={profileValues.profileEmail}
              onChangeText={(value) => updateProfile({ profileEmail: value })}
              placeholder="driver@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              error={profileErrors.profileEmail}
              editable={profileEditable && !saving}
            />
            {updateProfileAction && !updateProfileAction.enabled ? (
              <Text style={styles.actionDisabledNote}>
                目前無法編輯個人資料
                {updateProfileAction.disabledReasonCode
                  ? `（${updateProfileAction.disabledReasonCode}）`
                  : ""}
                。
              </Text>
            ) : null}
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
              editable={emergencyEditable && !saving}
            />
            <FormField
              label="聯絡人電話"
              value={profileValues.emergencyPhone}
              onChangeText={(value) => updateProfile({ emergencyPhone: value })}
              placeholder="+886-900-000-001"
              keyboardType="phone-pad"
              error={profileErrors.emergencyPhone}
              editable={emergencyEditable && !saving}
            />
            <FormField
              label="關係"
              value={profileValues.emergencyRelationship}
              onChangeText={(value) =>
                updateProfile({ emergencyRelationship: value })
              }
              placeholder="配偶、兄弟姐妹、父母…"
              editable={emergencyEditable && !saving}
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
              editable={preferencesEditable && !saving}
            />
            <FormField
              label="最大接單範圍（公里）"
              value={settingsValues.maxAcceptRadius}
              onChangeText={(value) =>
                updateSettings({ maxAcceptRadius: value })
              }
              placeholder="例如：5"
              keyboardType="numeric"
              error={settingsErrors.maxAcceptRadius}
              helpText="自營派單預設 5 公里；留白代表不限制，最大可設定到 200 公里（Q-DRV14）。"
              editable={preferencesEditable && !saving}
            />
            <View style={styles.switchCard}>
              <SwitchRow
                label="通知"
                description="關閉後將不會收到任務指派與行政通知。"
                value={settingsValues.notificationsEnabled}
                onValueChange={(value) =>
                  updateSettings({ notificationsEnabled: value })
                }
                disabled={!preferencesEditable || saving}
              />
              <View style={styles.switchDivider} />
              <SwitchRow
                label="自動接單（自營派單）"
                description="僅對 DRTS 自營派單自動接單。依 Q-DRV13，外部平台的全域自動接單在 Phase 1 不開放；外部平台請於下方各平台綁定列查看是否可逐平台開啟。"
                value={settingsValues.autoAcceptEnabled}
                onValueChange={(value) =>
                  updateSettings({ autoAcceptEnabled: value })
                }
                disabled={!preferencesEditable || saving}
              />
            </View>
            {updatePreferencesAction && !updatePreferencesAction.enabled ? (
              <Text style={styles.actionDisabledNote}>
                目前無法編輯偏好設定
                {updatePreferencesAction.disabledReasonCode
                  ? `（${updatePreferencesAction.disabledReasonCode}）`
                  : ""}
                。
              </Text>
            ) : null}
          </FormSection>

          <FormSection
            title="平台帳號綁定"
            description="管理外部平台帳號綁定、重新驗證、平台憑證與接單資格；狀態與「平台健康中心」即時同步。"
          >
            <PlatformBinding
              showSectionTitle={false}
              refreshSignal={bindingRefresh}
              onOpenPresence={() => router.push("/platform-presence")}
            />
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
  heroTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: Tokens.spacing.md,
  },
  heroTitleBlock: {
    flex: 1,
    gap: Tokens.spacing.xs,
  },
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: Tokens.radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Tokens.colors.brandBg,
    borderWidth: 1,
    borderColor: Tokens.colors.ownedBorder,
  },
  freshnessLabel: {
    ...Tokens.type.micro,
    color: Tokens.colors.textDim,
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
  actionDisabledNote: {
    ...Tokens.type.micro,
    color: Tokens.colors.warning,
    marginTop: Tokens.spacing.xs,
  },
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
