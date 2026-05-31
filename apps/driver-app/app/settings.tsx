import { useCallback, useEffect, useState } from "react";
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
import { useFocusEffect, useRouter } from "expo-router";
import {
  type DriverProfileRecord,
  type DriverSettings,
  type EmptyReason,
  type PlatformCode,
  type PlatformPresenceSummary,
  type RefreshTier,
  PLATFORM_CODES,
  PLATFORM_CODE_REGISTRY,
} from "@drts/contracts";
import type { CanvasTone } from "@drts/ui-web/canvas-tokens";

import {
  Banner,
  Btn,
  Card,
  Field,
  Input,
  PageHeader,
  Pill,
  Shell,
  driverCanvasTheme,
} from "@/components/canvas-primitives";
import { PlatformBinding } from "@/components/platform-binding";
import {
  buildPlatformBindingViews,
  derivePlatformBindingEmptyReason,
  describeRefreshFreshness,
  isOwnedPlatformCode,
  PLATFORM_BINDING_REFRESH_TIER,
  type PlatformBindingView,
} from "@/lib/platform-binding-view";
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

const THEME = driverCanvasTheme;
const SETTINGS_REFRESH_TIER: RefreshTier = PLATFORM_BINDING_REFRESH_TIER;

type BindingForm =
  | { mode: "bind"; platformCode: string; tokenExpiresAt: string }
  | { mode: "reauth"; platformCode: PlatformCode; tokenExpiresAt: string }
  | { mode: "unbind"; platformCode: PlatformCode; reason: string };

const SUPPORTED_PLATFORM_HINT = PLATFORM_CODES.map(
  (code) => `${PLATFORM_CODE_REGISTRY[code].displayName}（${code}）`,
).join("、");

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return "要求失敗";
}

function isPermissionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    /\b40[13]\b/.test(message) || /permission|forbidden|unauthor/i.test(message)
  );
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

const SAVE_STATUS: Record<SaveState, { label: string; tone: CanvasTone }> = {
  idle: { label: "尚未變更", tone: "neutral" },
  dirty: { label: "尚有未儲存變更", tone: "warn" },
  saving: { label: "儲存中…", tone: "info" },
  saved: { label: "已儲存", tone: "success" },
  error: { label: "儲存失敗", tone: "danger" },
};

function normalizePlatformCode(value: string): string {
  return value.trim().toLowerCase();
}

function isPlatformCode(value: string): value is PlatformCode {
  return (PLATFORM_CODES as readonly string[]).includes(value);
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

  const [presence, setPresence] = useState<PlatformPresenceSummary | null>(
    null,
  );
  const [presenceFailed, setPresenceFailed] = useState(false);
  const [presencePermissionDenied, setPresencePermissionDenied] =
    useState(false);
  const [busyPlatform, setBusyPlatform] = useState<string | null>(null);
  const [bindingForm, setBindingForm] = useState<BindingForm | null>(null);

  const loadAll = useCallback(async () => {
    if (!isProvisioned) {
      setLoading(false);
      return;
    }

    const client = getDriverClient();
    const [settingsResult, profileResult, presenceResult] =
      await Promise.allSettled([
        client.getDriverSettings(driverId),
        client.getDriverProfile(),
        client.getPlatformPresence(),
      ]);

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
      setPresence(presenceResult.value);
      setPresenceFailed(false);
      setPresencePermissionDenied(false);
    } else {
      setPresence(null);
      setPresenceFailed(true);
      setPresencePermissionDenied(isPermissionError(presenceResult.reason));
      failures.push(`平台綁定（${toErrorMessage(presenceResult.reason)}）`);
    }

    setLoadError(
      failures.length > 0
        ? `已使用可用資料。無法載入 ${formatSectionList(failures)}。`
        : null,
    );
    setLoading(false);
  }, [driverId, isProvisioned]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // Manual refresh tier (spec §3.2): refresh on focus + manual button.
  useFocusEffect(
    useCallback(() => {
      if (isProvisioned && !loading) {
        void loadAll();
      }
      return undefined;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isProvisioned, loadAll]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }, [loadAll]);

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
  const saveStatus = SAVE_STATUS[saveState];

  const profileInitial = profileValues.profileName.trim().charAt(0) || "司";
  const identitySummary = [
    driverId ? `ID ${driverId}` : null,
    profileValues.profilePhone.trim() || null,
    profileValues.profileEmail.trim() || null,
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

  const bindingViews = buildPlatformBindingViews(presence);
  const bindingEmptyReason: EmptyReason | null =
    derivePlatformBindingEmptyReason({
      isProvisioned,
      loadFailed: presenceFailed,
      permissionDenied: presencePermissionDenied,
      summary: presence,
    });
  const selfServiceAvailable = bindingViews.some(
    (view) => view.selfServiceBinding,
  );
  const freshness = describeRefreshFreshness(
    presence?.refreshMetadata,
    Date.now(),
  );
  const headerSubtitle =
    freshness?.label ?? "個人資料、偏好設定與平台帳號綁定";

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

  // ── Platform binding actions ───────────────────────────────────────────
  const reloadPresence = async () => {
    try {
      const summary = await getDriverClient().getPlatformPresence();
      setPresence(summary);
      setPresenceFailed(false);
      setPresencePermissionDenied(false);
    } catch (error) {
      setPresenceFailed(true);
      setPresencePermissionDenied(isPermissionError(error));
    }
  };

  const submitReauth = async (
    platformCode: PlatformCode,
    tokenExpiresAt: string | null,
  ) => {
    setBusyPlatform(platformCode);
    try {
      await getDriverClient().setPlatformOnline({
        platformCode,
        tokenExpiresAt: tokenExpiresAt?.trim() || null,
      });
      await reloadPresence();
      Alert.alert(
        "已送出重新驗證",
        `請完成「${PLATFORM_CODE_REGISTRY[platformCode]?.displayName ?? platformCode}」的平台驗證流程。`,
      );
    } catch (error) {
      Alert.alert("無法重新驗證平台", toErrorMessage(error));
    } finally {
      setBusyPlatform(null);
    }
  };

  const handleReauth = (view: PlatformBindingView) => {
    const platformCode = view.platformCode;
    const displayName = view.displayName;

    switch (view.reauthMechanism) {
      case "ops_managed":
        Alert.alert(
          "由派車台處理",
          `「${displayName}」由派車台管理平台驗證，無法自行重新驗證，請聯絡派車台。`,
        );
        return;
      case "manual_credential":
        setBindingForm({ mode: "reauth", platformCode, tokenExpiresAt: "" });
        return;
      case "native_app_deeplink":
        Alert.alert(
          "開啟平台 App",
          `將開啟「${displayName}」的官方 App 完成重新驗證，確定要繼續嗎？`,
          [
            { text: "取消", style: "cancel" },
            {
              text: "繼續",
              onPress: () => void submitReauth(platformCode, null),
            },
          ],
        );
        return;
      case "external_browser_oauth":
      default:
        Alert.alert(
          "重新驗證",
          `將開啟外部瀏覽器完成「${displayName}」的平台驗證，確定要繼續嗎？`,
          [
            { text: "取消", style: "cancel" },
            {
              text: "繼續",
              onPress: () => void submitReauth(platformCode, null),
            },
          ],
        );
    }
  };

  const handleUnbind = (view: PlatformBindingView) => {
    setBindingForm({
      mode: "unbind",
      platformCode: view.platformCode,
      reason: "",
    });
  };

  const handleBind = () => {
    setBindingForm({ mode: "bind", platformCode: "", tokenExpiresAt: "" });
  };

  const submitBindingForm = async () => {
    if (!bindingForm) {
      return;
    }

    if (bindingForm.mode === "unbind") {
      const reason = bindingForm.reason.trim();
      if (!reason) {
        Alert.alert("需要解除原因", "解除平台綁定前，請先填寫解除原因。");
        return;
      }
      const platformCode = bindingForm.platformCode;
      setBusyPlatform(platformCode);
      try {
        await getDriverClient().setPlatformOffline({ platformCode, reason });
        setBindingForm(null);
        await reloadPresence();
        Alert.alert(
          "已解除綁定",
          `已解除「${PLATFORM_CODE_REGISTRY[platformCode]?.displayName ?? platformCode}」的平台綁定。`,
        );
      } catch (error) {
        Alert.alert("無法解除綁定", toErrorMessage(error));
      } finally {
        setBusyPlatform(null);
      }
      return;
    }

    if (bindingForm.mode === "reauth") {
      const platformCode = bindingForm.platformCode;
      const tokenExpiresAt = bindingForm.tokenExpiresAt;
      setBindingForm(null);
      await submitReauth(platformCode, tokenExpiresAt);
      return;
    }

    // bind
    const normalized = normalizePlatformCode(bindingForm.platformCode);
    if (!normalized) {
      Alert.alert("欄位未完成", "請先輸入平台代碼。");
      return;
    }
    if (!isPlatformCode(normalized)) {
      Alert.alert("平台代碼無效", `平台代碼必須是：${SUPPORTED_PLATFORM_HINT}。`);
      return;
    }
    const platformCode = normalized;
    const tokenExpiresAt = bindingForm.tokenExpiresAt;
    setBusyPlatform(platformCode);
    try {
      await getDriverClient().setPlatformOnline({
        platformCode,
        tokenExpiresAt: tokenExpiresAt.trim() || null,
      });
      setBindingForm(null);
      await reloadPresence();
      Alert.alert(
        "平台綁定已更新",
        `已完成「${PLATFORM_CODE_REGISTRY[platformCode]?.displayName ?? platformCode}」平台綁定。`,
      );
    } catch (error) {
      Alert.alert("無法更新平台綁定", toErrorMessage(error));
    } finally {
      setBusyPlatform(null);
    }
  };

  if (!isProvisioned) {
    return (
      <Shell theme={THEME} contentContainerStyle={styles.centeredShell}>
        <PageHeader theme={THEME} title="設定" subtitle="裝置尚未配置司機身份" />
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
              前往配置
            </Btn>
          }
        />
      </Shell>
    );
  }

  if (loading) {
    return (
      <Shell theme={THEME} contentContainerStyle={styles.centeredShell}>
        <PageHeader theme={THEME} title="設定" subtitle="載入中…" />
        <View style={styles.loadingCard}>
          <ActivityIndicator size="large" color={THEME.accent} />
          <Text style={[styles.loadingLabel, { color: THEME.textMuted }]}>
            載入設定中…
          </Text>
        </View>
      </Shell>
    );
  }

  const saveDisabled = !dirty || hasValidation || saving;
  // km radius copy (Q-DRV14): owned default 5 km; external owned by platform.
  void SETTINGS_REFRESH_TIER;
  const radiusHint =
    "自營派單預設 5 公里；留白代表不限制，最大 200 公里。外部平台以該平台媒合規則為準。";

  return (
    <Shell
      theme={THEME}
      contentContainerStyle={styles.shellContent}
      footer={
        <View style={[styles.footer, { borderTopColor: THEME.border }]}>
          <Pill theme={THEME} tone={saveStatus.tone}>
            {saveStatus.label}
          </Pill>
          <Btn
            theme={THEME}
            variant="primary"
            size="md"
            disabled={saveDisabled}
            onPress={() => void handleSave()}
            icon={
              saving ? undefined : (
                <Ionicons name="save-outline" size={15} color="#FFFFFF" />
              )
            }
            style={styles.saveButton}
          >
            {saving
              ? "正在儲存…"
              : hasValidation
                ? "請先修正欄位"
                : dirty
                  ? "儲存設定"
                  : "目前無變更"}
          </Btn>
        </View>
      }
    >
      <PageHeader
        theme={THEME}
        title="設定"
        subtitle={headerSubtitle}
        actions={
          <Btn
            theme={THEME}
            variant="ghost"
            size="xs"
            icon={
              <Ionicons name="refresh" size={13} color={THEME.textMuted} />
            }
            onPress={() => void onRefresh()}
            disabled={refreshing}
          >
            {refreshing ? "同步中" : "重新整理"}
          </Btn>
        }
      />

      {loadError ? (
        <Banner
          theme={THEME}
          tone="warn"
          body={loadError}
          icon={<Ionicons name="alert-circle" size={15} color={THEME.warn} />}
        />
      ) : null}
      {validationMessage ? (
        <Banner
          theme={THEME}
          tone="warn"
          body={validationMessage}
          icon={<Ionicons name="alert-circle" size={15} color={THEME.warn} />}
        />
      ) : null}
      {saveError ? (
        <Banner
          theme={THEME}
          tone="danger"
          body={saveError}
          icon={
            <Ionicons name="close-circle" size={15} color={THEME.danger} />
          }
        />
      ) : null}
      {freshness?.stale ? (
        <Banner
          theme={THEME}
          tone="info"
          body="顯示的可能不是最新資料，請點擊重新整理。"
          icon={<Ionicons name="time-outline" size={15} color={THEME.info} />}
        />
      ) : null}

      {/* Profile summary */}
      <Card theme={THEME} padding={14}>
        <View style={styles.profileRow}>
          <View style={[styles.avatar, { backgroundColor: THEME.accentBg }]}>
            <Text
              style={[
                styles.avatarText,
                { color: THEME.accentHi, fontFamily: THEME.monoFamily },
              ]}
            >
              {profileInitial}
            </Text>
          </View>
          <View style={styles.profileMain}>
            <Text style={[styles.profileName, { color: THEME.text }]}>
              {profileValues.profileName.trim() || "尚未填寫司機姓名"}
            </Text>
            <Text
              style={[
                styles.profileMeta,
                { color: THEME.textMuted, fontFamily: THEME.monoFamily },
              ]}
              numberOfLines={2}
            >
              {identitySummary || "尚未填寫聯絡資訊"}
            </Text>
          </View>
        </View>
      </Card>

      {/* Identity (editable) */}
      <SectionCard
        title="司機身份"
        subtitle="維持最新的聯絡方式以便派遣與行政聯繫。"
      >
        <Field theme={THEME} label="姓名" required>
          <Input
            theme={THEME}
            value={profileValues.profileName}
            onChangeText={(value) => updateProfile({ profileName: value })}
            ph="司機姓名"
            editable={profileLoaded && !saving}
          />
          <FieldError message={profileErrors.profileName} />
        </Field>
        <Field theme={THEME} label="電話">
          <Input
            theme={THEME}
            value={profileValues.profilePhone}
            onChangeText={(value) => updateProfile({ profilePhone: value })}
            ph="+886-900-000-000"
            mono
            autoCapitalize="none"
            editable={profileLoaded && !saving}
          />
          <FieldError message={profileErrors.profilePhone} />
        </Field>
        <Field theme={THEME} label="電子郵件">
          <Input
            theme={THEME}
            value={profileValues.profileEmail}
            onChangeText={(value) => updateProfile({ profileEmail: value })}
            ph="driver@example.com"
            mono
            autoCapitalize="none"
            autoCorrect={false}
            editable={profileLoaded && !saving}
          />
          <FieldError message={profileErrors.profileEmail} />
        </Field>
      </SectionCard>

      {/* Emergency contact (editable) */}
      <SectionCard
        title="緊急聯絡人"
        subtitle="緊急情況時平台會優先聯絡此人；填寫任一欄位後姓名與電話為必填。"
      >
        <Field theme={THEME} label="聯絡人姓名">
          <Input
            theme={THEME}
            value={profileValues.emergencyName}
            onChangeText={(value) => updateProfile({ emergencyName: value })}
            ph="緊急聯絡人姓名"
            editable={profileLoaded && !saving}
          />
          <FieldError message={profileErrors.emergencyName} />
        </Field>
        <Field theme={THEME} label="聯絡人電話">
          <Input
            theme={THEME}
            value={profileValues.emergencyPhone}
            onChangeText={(value) => updateProfile({ emergencyPhone: value })}
            ph="+886-900-000-001"
            mono
            autoCapitalize="none"
            editable={profileLoaded && !saving}
          />
          <FieldError message={profileErrors.emergencyPhone} />
        </Field>
        <Field theme={THEME} label="關係">
          <Input
            theme={THEME}
            value={profileValues.emergencyRelationship}
            onChangeText={(value) =>
              updateProfile({ emergencyRelationship: value })
            }
            ph="配偶、兄弟姐妹、父母…"
            editable={profileLoaded && !saving}
          />
        </Field>
      </SectionCard>

      {/* Platform binding */}
      <SectionCard
        title="平台帳號綁定"
        subtitle="管理外部平台綁定、重新驗證、接單資格；狀態與「平台健康中心」即時同步。"
      >
        <PlatformBinding
          theme={THEME}
          views={bindingViews}
          emptyReason={bindingEmptyReason}
          notes={presence?.notes ?? []}
          busyPlatform={busyPlatform}
          selfServiceAvailable={selfServiceAvailable && !bindingEmptyReason}
          onReauth={handleReauth}
          onUnbind={handleUnbind}
          onBind={handleBind}
          onRefresh={() => void onRefresh()}
        />

        {bindingForm ? (
          <Card theme={THEME} padding={14} style={styles.bindingForm}>
            <Text style={[styles.formTitle, { color: THEME.text }]}>
              {bindingForm.mode === "reauth"
                ? `重新驗證 ${PLATFORM_CODE_REGISTRY[bindingForm.platformCode]?.displayName ?? bindingForm.platformCode}`
                : bindingForm.mode === "unbind"
                  ? `解除綁定 ${PLATFORM_CODE_REGISTRY[bindingForm.platformCode]?.displayName ?? bindingForm.platformCode}`
                  : "新增平台綁定"}
            </Text>

            {bindingForm.mode === "bind" ? (
              <Field
                theme={THEME}
                label="平台代碼"
                hint={`可輸入：${SUPPORTED_PLATFORM_HINT}`}
              >
                <Input
                  theme={THEME}
                  value={bindingForm.platformCode}
                  onChangeText={(value) =>
                    setBindingForm({ ...bindingForm, platformCode: value })
                  }
                  ph="請輸入平台代碼"
                  mono
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </Field>
            ) : null}

            {bindingForm.mode === "unbind" ? (
              <Field
                theme={THEME}
                label="解除原因"
                required
                hint="高風險操作：解除綁定會停止此平台派單，需填寫原因。"
              >
                <Input
                  theme={THEME}
                  value={bindingForm.reason}
                  onChangeText={(value) =>
                    setBindingForm({ ...bindingForm, reason: value })
                  }
                  ph="例如：不再接此平台訂單"
                />
              </Field>
            ) : (
              <Field
                theme={THEME}
                label="平台憑證到期時間（選填）"
                hint="留白代表暫不設定到期時間。"
              >
                <Input
                  theme={THEME}
                  value={bindingForm.tokenExpiresAt}
                  onChangeText={(value) =>
                    setBindingForm({ ...bindingForm, tokenExpiresAt: value })
                  }
                  ph="例如 2026-05-06T08:30:00Z"
                  mono
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </Field>
            )}

            <View style={styles.formActions}>
              <Btn
                theme={THEME}
                variant="secondary"
                size="sm"
                onPress={() => setBindingForm(null)}
                style={styles.formActionButton}
              >
                取消
              </Btn>
              <Btn
                theme={THEME}
                variant="primary"
                size="sm"
                danger={bindingForm.mode === "unbind"}
                onPress={() => void submitBindingForm()}
                style={styles.formActionButton}
              >
                {bindingForm.mode === "unbind"
                  ? "確認解除"
                  : bindingForm.mode === "reauth"
                    ? "送出驗證"
                    : "完成綁定"}
              </Btn>
            </View>
          </Card>
        ) : null}
      </SectionCard>

      {/* Preferences */}
      <SectionCard
        title="偏好設定"
        subtitle="調整系統介面語言、接單範圍與通知行為。"
      >
        <Field theme={THEME} label="介面語言">
          <Input
            theme={THEME}
            value={settingsValues.language}
            onChangeText={(value) => updateSettings({ language: value })}
            ph="zh-TW"
            mono
            autoCapitalize="none"
            editable={settingsLoaded && !saving}
          />
          <FieldError message={settingsErrors.language} />
        </Field>
        <Field theme={THEME} label="最大接單範圍（公里）" hint={radiusHint}>
          <Input
            theme={THEME}
            value={settingsValues.maxAcceptRadius}
            onChangeText={(value) => updateSettings({ maxAcceptRadius: value })}
            ph="例如：5"
            mono
            suffix="km"
            autoCapitalize="none"
            editable={settingsLoaded && !saving}
          />
          <FieldError message={settingsErrors.maxAcceptRadius} />
        </Field>

        <View style={[styles.toggleCard, { borderColor: THEME.border }]}>
          <ToggleRow
            label="通知"
            description="關閉後將不會收到任務指派與行政通知。"
            value={settingsValues.notificationsEnabled}
            disabled={!settingsLoaded || saving}
            onValueChange={(value) =>
              updateSettings({ notificationsEnabled: value })
            }
          />
          <View
            style={[styles.toggleDivider, { backgroundColor: THEME.border }]}
          />
          <ToggleRow
            label="自動接單 · 自營"
            description="僅對自營（DRTS）派單自動接單；依 Q-DRV13，Phase 1 不提供全平台自動接單，外部平台仍以各平台接單規則為準。"
            value={settingsValues.autoAcceptEnabled}
            disabled={!settingsLoaded || saving}
            onValueChange={(value) =>
              updateSettings({ autoAcceptEnabled: value })
            }
          />
        </View>
      </SectionCard>

      {/* More */}
      <SectionCard title="其他" subtitle="緊急聯絡、裝置資訊與帳號動作。">
        <View style={[styles.utilityCard, { borderColor: THEME.border }]}>
          <UtilityRow label="緊急聯絡人" detail={emergencySummary} />
          <UtilityRow label="關於本機" detail={identitySummary || driverId} />
          <UtilityRow
            label="查看收益"
            detail="前往收益與月結摘要"
            onPress={() => router.push("/earnings")}
          />
          <UtilityRow
            label="平台健康中心"
            detail="查看每個平台的即時接單狀態"
            onPress={() => router.push("/platform-presence")}
          />
          <UtilityRow
            label="登出"
            detail="清除此裝置上的司機登入狀態"
            tone="danger"
            onPress={handleLogout}
            last
          />
        </View>
      </SectionCard>
    </Shell>
  );
}

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: THEME.text }]}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.sectionSubtitle, { color: THEME.textMuted }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }
  return (
    <Text style={[styles.fieldError, { color: THEME.danger }]}>{message}</Text>
  );
}

function ToggleRow({
  label,
  description,
  value,
  disabled,
  onValueChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  disabled?: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleText}>
        <Text style={[styles.toggleLabel, { color: THEME.text }]}>{label}</Text>
        {description ? (
          <Text style={[styles.toggleDescription, { color: THEME.textMuted }]}>
            {description}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: THEME.borderStrong, true: THEME.accentHi }}
        thumbColor={value ? THEME.accent : "#FFFFFF"}
      />
    </View>
  );
}

function UtilityRow({
  label,
  detail,
  tone = "default",
  onPress,
  last = false,
}: {
  label: string;
  detail?: string;
  tone?: "default" | "danger";
  onPress?: () => void;
  last?: boolean;
}) {
  const color = tone === "danger" ? THEME.danger : THEME.text;
  const content = (
    <View
      style={[
        styles.utilityRow,
        last
          ? null
          : { borderBottomColor: THEME.border, borderBottomWidth: 1 },
      ]}
    >
      <View style={styles.utilityText}>
        <Text style={[styles.utilityLabel, { color }]}>{label}</Text>
        {detail ? (
          <Text style={[styles.utilityDetail, { color: THEME.textMuted }]}>
            {detail}
          </Text>
        ) : null}
      </View>
      <Ionicons
        name={onPress ? "chevron-forward" : "information-circle-outline"}
        size={16}
        color={tone === "danger" ? THEME.danger : THEME.textDim}
      />
    </View>
  );

  if (!onPress) {
    return content;
  }
  return <Pressable onPress={onPress}>{content}</Pressable>;
}

const styles = StyleSheet.create({
  shellContent: {
    paddingBottom: 24,
    gap: 14,
  },
  centeredShell: {
    flexGrow: 1,
    justifyContent: "center",
    gap: 16,
  },
  loadingCard: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    minHeight: 180,
  },
  loadingLabel: {
    fontSize: 14,
  },
  section: {
    gap: 10,
  },
  sectionHeader: {
    gap: 3,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  sectionSubtitle: {
    fontSize: 11.5,
    lineHeight: 16,
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
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 18,
    fontWeight: "700",
  },
  profileMain: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  profileName: {
    fontSize: 16,
    fontWeight: "700",
  },
  profileMeta: {
    fontSize: 11,
    lineHeight: 15,
  },
  fieldError: {
    fontSize: 11,
    lineHeight: 15,
    marginTop: 4,
  },
  toggleCard: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
  },
  toggleText: {
    flex: 1,
    gap: 3,
  },
  toggleLabel: {
    fontSize: 13.5,
    fontWeight: "600",
  },
  toggleDescription: {
    fontSize: 11,
    lineHeight: 16,
  },
  toggleDivider: {
    height: 1,
  },
  bindingForm: {
    marginTop: 12,
  },
  formTitle: {
    fontSize: 13.5,
    fontWeight: "700",
    marginBottom: 12,
  },
  formActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  formActionButton: {
    flex: 1,
  },
  utilityCard: {
    borderWidth: 1,
    borderRadius: 10,
    overflow: "hidden",
  },
  utilityRow: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  utilityText: {
    flex: 1,
    gap: 2,
  },
  utilityLabel: {
    fontSize: 13.5,
    fontWeight: "600",
  },
  utilityDetail: {
    fontSize: 11.5,
    lineHeight: 16,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderTopWidth: 1,
  },
  saveButton: {
    flex: 1,
  },
});
