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
import { Redirect, useRouter } from "expo-router";
import type { DriverProfileRecord, DriverSettings } from "@drts/contracts";
import { PlatformBinding } from "@/components/platform-binding";
import { ActionButton } from "@/components/ui/ActionButton";
import { AppScreen } from "@/components/ui/AppScreen";
import { BottomActionBar } from "@/components/ui/BottomActionBar";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { FormField } from "@/components/ui/FormField";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusChip, type StatusChipVariant } from "@/components/ui/StatusChip";
import { Tokens } from "@/components/ui/tokens";
import {
  formatDriverError,
  getDriverClient,
  getDriverId,
  getSignedInDriverSosState,
  initializeDriverIdentity,
  isDriverIdentityHydrated,
  isDriverIdentityProvisioned,
  recoverDriverSessionFromApiError,
  registerProtectedCacheClearHandler,
  revokeDriverDeviceBinding,
  type SignedInDriverSosState,
} from "@/lib/api-client";
import { resetDriverAppToOnboarding } from "@/lib/driver-identity-routing";
import {
  driverAuthStrings,
  driverRouteTitles,
  driverSaveStatusLabels,
  driverStrings,
  driverWorkforceStrings,
} from "@/lib/strings";
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

const LOGOUT_CONFIRM_MESSAGE = "登出後需要重新完成裝置配置，確定要繼續嗎？";
// Logging out deletes an SOS that has not reached the server (see
// lib/api-client), so the driver is told before confirming.
const LOGOUT_UNDELIVERED_SOS_WARNING =
  "還有一筆 SOS 沒有送到派車台。登出後這筆 SOS 會被刪除。請先直接打電話聯絡派車台；有立即危險請撥 110 或 119。";
// When the phone cannot tell in time, warn anyway rather than stay silent.
const LOGOUT_UNKNOWN_SOS_WARNING =
  "無法確認是否還有 SOS 沒有送到派車台。如果有，登出後會被刪除。請先直接打電話聯絡派車台；有立即危險請撥 110 或 119。";
// The logout prompt waits for the stored SOS at most this long.
const LOGOUT_SOS_CHECK_LIMIT_MS = 1_500;

/** Read only and never throws; a slow or failed read is `unknown`. */
async function checkSosBeforeLogout(): Promise<SignedInDriverSosState> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      getSignedInDriverSosState(),
      new Promise<SignedInDriverSosState>((resolve) => {
        timer = setTimeout(() => resolve("unknown"), LOGOUT_SOS_CHECK_LIMIT_MS);
      }),
    ]);
  } catch {
    return "unknown";
  } finally {
    clearTimeout(timer);
  }
}

function logoutPrompt(sos: SignedInDriverSosState) {
  switch (sos) {
    case "undelivered":
      return {
        title: "SOS 尚未送達",
        message: `${LOGOUT_UNDELIVERED_SOS_WARNING}\n\n${LOGOUT_CONFIRM_MESSAGE}`,
      };
    case "unknown":
      return {
        title: "登出裝置",
        message: `${LOGOUT_UNKNOWN_SOS_WARNING}\n\n${LOGOUT_CONFIRM_MESSAGE}`,
      };
    default:
      return { title: "登出裝置", message: LOGOUT_CONFIRM_MESSAGE };
  }
}

function toErrorMessage(error: unknown): string {
  return formatDriverError(error, "要求失敗");
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
  testID?: string;
}

function UtilityRow({
  label,
  detail,
  tone = "default",
  onPress,
  testID,
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
    <Pressable
      onPress={onPress}
      style={styles.utilityPressable}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
    >
      {content}
    </Pressable>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const [identityReady, setIdentityReady] = useState(isDriverIdentityHydrated);
  const isProvisioned = identityReady && isDriverIdentityProvisioned();
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
    if (identityReady) return;
    let cancelled = false;
    initializeDriverIdentity()
      .catch((identityError: unknown) => {
        if (!cancelled) setLoadError(toErrorMessage(identityError));
      })
      .finally(() => {
        if (!cancelled) setIdentityReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [identityReady]);

  useEffect(() => {
    const unregister = registerProtectedCacheClearHandler(() => {
      setSettingsValues(DEFAULT_SETTINGS_VALUES);
      setProfileValues(DEFAULT_PROFILE_VALUES);
      setInitialSettings(DEFAULT_SETTINGS_VALUES);
      setInitialProfile(DEFAULT_PROFILE_VALUES);
    });
    return () => unregister();
  }, []);

  useEffect(() => {
    if (!identityReady) return;
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

      if (
        settingsResult.status === "rejected" &&
        (await recoverDriverSessionFromApiError(settingsResult.reason))
      ) {
        resetDriverAppToOnboarding(router);
        return;
      }
      if (
        profileResult.status === "rejected" &&
        (await recoverDriverSessionFromApiError(profileResult.reason))
      ) {
        resetDriverAppToOnboarding(router);
        return;
      }

      if (!isActive) return;

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
  }, [driverId, identityReady, isProvisioned]);

  const settingsErrors = validateSettingsValues(settingsValues);
  const profileErrors = profileLoaded
    ? validateProfileValues(profileValues, initialProfile)
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
  const identitySummary = profileValues.profilePhone.trim();

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
          .updateDriverProfile(
            buildProfileCommand(profileValues, initialProfile),
          )
          .then(() => ({ section: "個人資料" })),
      );
    }

    try {
      const results = await Promise.allSettled(tasks);
      for (const entry of results) {
        if (
          entry.status === "rejected" &&
          (await recoverDriverSessionFromApiError(entry.reason))
        ) {
          resetDriverAppToOnboarding(router);
          return;
        }
      }

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

  const handleLogout = async () => {
    const prompt = logoutPrompt(await checkSosBeforeLogout());
    Alert.alert(prompt.title, prompt.message, [
      { text: "取消", style: "cancel" },
      {
        text: "登出",
        style: "destructive",
        onPress: async () => {
          await revokeDriverDeviceBinding();
          router.replace("/onboarding");
        },
      },
    ]);
  };

  if (identityReady && !isProvisioned) {
    return <Redirect href="/onboarding" />;
  }

  if (!identityReady || loading) {
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
      <AppScreen
        footer={
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
        }
      >
        <View style={styles.heroHeader}>
          <Text style={styles.screenTitle}>設定</Text>
          <Text style={styles.screenSubtitle}>
            個人資料、偏好設定與手機登入
          </Text>
        </View>

        <View style={styles.content}>
          {loadError ? <ErrorBanner message={loadError} /> : null}
          {validationMessage ? (
            <ErrorBanner message={validationMessage} />
          ) : null}
          {saveError ? <ErrorBanner message={saveError} /> : null}

          <FormSection
            title={driverWorkforceStrings.sectionTitle}
            description={driverWorkforceStrings.sectionDescription}
          >
            <View style={styles.utilityCard}>
              <UtilityRow
                label={driverRouteTitles.academy}
                detail={driverWorkforceStrings.academyDetail}
                testID="driver-settings-academy"
                onPress={() => router.push("/academy")}
              />
            </View>
          </FormSection>

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
                  {identitySummary || "尚未填寫電話"}
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
              label={driverStrings.settings.surname.label}
              accessibilityLabel={driverStrings.settings.surname.label}
              accessibilityHint={driverStrings.settings.surname.help}
              value={profileValues.profileSurname ?? ""}
              onChangeText={(value) => updateProfile({ profileSurname: value })}
              placeholder={driverStrings.settings.surname.placeholder}
              helpText={driverStrings.settings.surname.help}
              error={
                profileErrors.profileSurname
                  ? driverStrings.settings.surname.errors[
                      profileErrors.profileSurname
                    ]
                  : undefined
              }
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

          <FormSection title="偏好設定" description="調整接單範圍與通知。">
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
                description="開啟後，所有已綁定平台符合條件的派單都會自動接受；外部平台仍依該平台自己的接單規則。"
                value={settingsValues.autoAcceptEnabled}
                onValueChange={(value) =>
                  updateSettings({ autoAcceptEnabled: value })
                }
                disabled={!settingsLoaded || saving}
              />
            </View>
          </FormSection>

          <FormSection
            title={driverAuthStrings.devices.title}
            description={driverAuthStrings.devices.subtitle}
          >
            {/* No rebind button: /onboarding shows the home screen while this
                phone is signed in, so signing out is the way to rebind. */}
            <ActionButton
              accessibilityHint="撤銷此裝置的司機綁定並登出"
              accessibilityLabel="登出並撤銷裝置"
              icon="trash-outline"
              onPress={handleLogout}
              title={driverAuthStrings.devices.revokeAction}
              variant="danger"
            />
            <Text style={styles.deviceNotice}>
              {driverAuthStrings.devices.offlineProofNotice}
            </Text>
          </FormSection>

          {/* Read-only: the fleet binds external platform accounts. */}
          <FormSection title="平台帳號綁定">
            <PlatformBinding showSectionTitle={false} />
          </FormSection>

          <FormSection title="其他">
            <View style={styles.utilityCard}>
              <UtilityRow
                label="查看收益"
                detail="前往收益與月結摘要"
                onPress={() => router.push("/earnings")}
              />
            </View>
          </FormSection>
        </View>
      </AppScreen>
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
  deviceNotice: {
    ...Tokens.type.small,
    color: Tokens.colors.textMuted,
    marginTop: Tokens.spacing.xs,
  },
});
