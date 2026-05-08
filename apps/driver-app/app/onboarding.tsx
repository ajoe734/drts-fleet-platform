import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import {
  ActionButton,
  AppScreen,
  ErrorBanner,
  FormField,
  StatusChip,
  tokens,
} from "@/components/ui";
import {
  getDriverClient,
  getDriverIdentityIssue,
  hasDriverDevOverride,
  initializeDriverIdentity,
  isDriverIdentityProvisioned,
  registerDriverDevice,
} from "@/lib/api-client";

type WorkspaceRoute =
  | "/jobs"
  | "/trip"
  | "/platform-presence"
  | "/earnings"
  | "/shift"
  | "/incident"
  | "/settings";

type StepState = "active" | "pending" | "done";

type ActivationStep = {
  title: string;
  description: string;
  state: StepState;
};

const ACTIVATION_STEPS: ReadonlyArray<ActivationStep> = [
  {
    title: "裝置註冊",
    description: "產生車隊識別碼",
    state: "active",
  },
  {
    title: "駕駛身份驗證",
    description: "綁定駕駛帳號",
    state: "pending",
  },
  {
    title: "平台帳號連線",
    description: "外部平台待綁定",
    state: "pending",
  },
];

const DEFAULT_TEST_REGISTRATION_CODE =
  process.env.EXPO_PUBLIC_DRIVER_TEST_REGISTRATION_CODE ?? "driver-demo-001";
const DEFAULT_TEST_DEVICE_LABEL =
  process.env.EXPO_PUBLIC_DRIVER_TEST_DEVICE_LABEL ?? "Driver Pixel 01";

type PlatformPresence = {
  code: string;
  name: string;
  online: boolean;
  reauth?: boolean;
  forwarded?: boolean;
  lastSync: string;
};

const WORKSPACE_PLATFORMS: ReadonlyArray<PlatformPresence> = [
  {
    code: "DRTS",
    name: "自營派單",
    online: true,
    lastSync: "剛剛",
  },
  {
    code: "SRX",
    name: "SmartRides X",
    online: true,
    forwarded: true,
    lastSync: "1 分鐘前",
  },
  {
    code: "METR",
    name: "Metro Hail",
    online: false,
    reauth: true,
    forwarded: true,
    lastSync: "12 分鐘前",
  },
];

function LoadingState({ label }: { label: string }) {
  return (
    <AppScreen scrollable={false}>
      <View style={styles.loadingState}>
        <ActivityIndicator color={tokens.colors.primary} size="large" />
        <Text style={styles.loadingLabel}>{label}</Text>
      </View>
    </AppScreen>
  );
}

function BrandTile() {
  return (
    <View style={styles.brandTile}>
      <Text style={styles.brandTileLabel}>D</Text>
    </View>
  );
}

function StepTimeline({ steps }: { steps: ReadonlyArray<ActivationStep> }) {
  return (
    <View style={styles.stepList}>
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        const indicatorActive = step.state === "active";
        return (
          <View key={step.title} style={styles.stepRow}>
            <View style={styles.stepIndicatorColumn}>
              <View
                style={[
                  styles.stepIndicator,
                  indicatorActive
                    ? styles.stepIndicatorActive
                    : styles.stepIndicatorPending,
                ]}
              >
                <Text
                  style={
                    indicatorActive
                      ? styles.stepIndicatorTextActive
                      : styles.stepIndicatorTextPending
                  }
                >
                  {index + 1}
                </Text>
              </View>
              {isLast ? null : <View style={styles.stepConnector} />}
            </View>
            <View style={styles.stepBody}>
              <Text
                style={[
                  styles.stepTitle,
                  indicatorActive ? null : styles.stepTitlePending,
                ]}
              >
                {step.title}
              </Text>
              <Text style={styles.stepDescription}>{step.description}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function WarningCallout({ message }: { message: string }) {
  return (
    <View style={styles.warningCallout}>
      <Ionicons
        name="lock-closed"
        size={16}
        color={tokens.colors.warning}
        style={styles.warningCalloutIcon}
      />
      <Text style={styles.warningCalloutText}>{message}</Text>
    </View>
  );
}

function HeroCard({
  title,
  meta,
  primaryLabel,
  secondaryLabel,
  onPrimaryPress,
  onSecondaryPress,
}: {
  title: string;
  meta: string;
  primaryLabel: string;
  secondaryLabel: string;
  onPrimaryPress: () => void;
  onSecondaryPress: () => void;
}) {
  return (
    <View style={styles.heroCard}>
      <View style={styles.heroEyebrowRow}>
        <View style={styles.heroEyebrowDot} />
        <Text style={styles.heroEyebrowText}>下一步動作</Text>
      </View>
      <Text style={styles.heroTitle}>{title}</Text>
      <Text style={styles.heroMeta}>{meta}</Text>
      <View style={styles.heroActionRow}>
        <Pressable
          accessibilityRole="button"
          onPress={onPrimaryPress}
          style={({ pressed }) => [
            styles.heroPrimaryButton,
            pressed ? styles.heroPrimaryButtonPressed : null,
          ]}
        >
          <Ionicons
            name="navigate"
            size={16}
            color={tokens.colors.brand}
            style={styles.heroButtonIcon}
          />
          <Text style={styles.heroPrimaryLabel}>{primaryLabel}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onSecondaryPress}
          style={({ pressed }) => [
            styles.heroSecondaryButton,
            pressed ? styles.heroSecondaryButtonPressed : null,
          ]}
        >
          <Text style={styles.heroSecondaryLabel}>{secondaryLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

type KpiTone = "brand" | "success" | "neutral";

function KpiTile({
  label,
  value,
  unit,
  tone,
  iconName,
}: {
  label: string;
  value: string;
  unit?: string;
  tone: KpiTone;
  iconName: keyof typeof Ionicons.glyphMap;
}) {
  const accent =
    tone === "brand"
      ? { color: tokens.colors.brand, bg: tokens.colors.brandBg }
      : tone === "success"
        ? { color: tokens.colors.success, bg: tokens.colors.successBg }
        : { color: tokens.colors.textBody, bg: tokens.colors.surfaceLo };

  return (
    <View style={styles.kpiTile}>
      <View style={[styles.kpiIcon, { backgroundColor: accent.bg }]}>
        <Ionicons name={iconName} size={16} color={accent.color} />
      </View>
      <Text style={styles.kpiLabel}>{label}</Text>
      <View style={styles.kpiValueRow}>
        <Text style={styles.kpiValue}>{value}</Text>
        {unit ? <Text style={styles.kpiUnit}>{unit}</Text> : null}
      </View>
    </View>
  );
}

function ReauthAlert({
  title,
  description,
  actionLabel,
  onPress,
}: {
  title: string;
  description: string;
  actionLabel: string;
  onPress: () => void;
}) {
  return (
    <View style={styles.reauthCard}>
      <View style={styles.reauthIcon}>
        <Ionicons name="lock-open" size={16} color={tokens.colors.warning} />
      </View>
      <View style={styles.reauthBody}>
        <Text style={styles.reauthTitle}>{title}</Text>
        <Text style={styles.reauthDescription}>{description}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [
          styles.reauthAction,
          pressed ? styles.reauthActionPressed : null,
        ]}
      >
        <Text style={styles.reauthActionLabel}>{actionLabel}</Text>
      </Pressable>
    </View>
  );
}

function PlatformRow({
  platform,
  enabled,
  isLast,
  onToggle,
}: {
  platform: PlatformPresence;
  enabled: boolean;
  isLast: boolean;
  onToggle: (next: boolean) => void;
}) {
  const subtitle = platform.reauth
    ? "需重新授權"
    : platform.online
      ? `已上線 · ${platform.lastSync}`
      : `離線 · ${platform.lastSync}`;

  return (
    <View
      style={[styles.platformRow, isLast ? null : styles.platformRowDivider]}
    >
      <View style={styles.platformBody}>
        <Text style={styles.platformName}>{platform.name}</Text>
        <Text style={styles.platformSub}>{subtitle}</Text>
      </View>
      <View style={styles.platformControls}>
        {platform.forwarded ? (
          <StatusChip label="外部" variant="forwarded" />
        ) : null}
        <Switch
          value={enabled}
          onValueChange={onToggle}
          trackColor={{
            false: tokens.colors.surfaceLo,
            true: tokens.colors.brand,
          }}
          thumbColor={tokens.colors.surface}
        />
      </View>
    </View>
  );
}

function QuickTile({
  label,
  helper,
  iconName,
  tone,
  onPress,
}: {
  label: string;
  helper: string;
  iconName: keyof typeof Ionicons.glyphMap;
  tone: "brand" | "danger";
  onPress: () => void;
}) {
  const accent =
    tone === "danger"
      ? { color: tokens.colors.danger, bg: tokens.colors.dangerBg }
      : { color: tokens.colors.brand, bg: tokens.colors.brandBg };

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.quickTile,
        pressed ? styles.quickTilePressed : null,
      ]}
    >
      <View style={[styles.quickTileIcon, { backgroundColor: accent.bg }]}>
        <Ionicons name={iconName} size={18} color={accent.color} />
      </View>
      <View style={styles.quickTileBody}>
        <Text style={styles.quickTileLabel}>{label}</Text>
        <Text style={styles.quickTileHelper}>{helper}</Text>
      </View>
    </Pressable>
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
  const [registrationCode, setRegistrationCode] = useState(
    DEFAULT_TEST_REGISTRATION_CODE,
  );
  const [deviceLabel, setDeviceLabel] = useState(DEFAULT_TEST_DEVICE_LABEL);
  const [provisioningError, setProvisioningError] = useState<string | null>(
    null,
  );
  const [workspaceIssue, setWorkspaceIssue] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [refreshSeed, setRefreshSeed] = useState(0);
  const [pendingTaskCount, setPendingTaskCount] = useState<number | null>(null);
  const [activeTaskTitle, setActiveTaskTitle] = useState<string | null>(null);
  const [platformOverrides, setPlatformOverrides] = useState<
    Record<string, boolean>
  >({});
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
        if (cancelled) {
          return;
        }

        const identityIssue = getDriverIdentityIssue();
        if (identityIssue) {
          setProvisioningError(identityIssue);
        }
        setReady(true);
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
    setPendingTaskCount(null);
    setActiveTaskTitle(null);

    Promise.allSettled([
      client.getFeatureFlags(),
      client.getIdentityContext(),
      client.listDriverTasks(),
    ])
      .then(([flagsResult, identityResult, tasksResult]) => {
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

        if (tasksResult.status === "fulfilled") {
          const tasks = tasksResult.value ?? [];
          const pending = tasks.filter(
            (task) =>
              task.status !== "completed" && task.status !== "cancelled",
          );
          setPendingTaskCount(pending.length);
          const activeTask = tasks.find((task) => task.status === "on_trip");
          if (activeTask) {
            setActiveTaskTitle(activeTask.taskId);
          }
        } else {
          setPendingTaskCount(null);
        }
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setFlagsOk(false);
        setIdentityOk(false);
        setWorkspaceIssue(resolveWorkspaceIssue(false, false));
      });

    return () => {
      cancelled = true;
    };
  }, [provisioned, refreshSeed]);

  const platformStates = useMemo(
    () =>
      WORKSPACE_PLATFORMS.map((platform) => {
        const override = platformOverrides[platform.code];
        return {
          platform,
          enabled: override ?? (platform.online && !platform.reauth),
        };
      }),
    [platformOverrides],
  );

  const platformsOnline = useMemo(
    () => platformStates.filter((entry) => entry.enabled).length,
    [platformStates],
  );

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

  const handleReinitializeIdentity = () => {
    setReady(false);
    setProvisioningError(null);

    setTimeout(() => {
      void initializeDriverIdentity()
        .catch((error: unknown) => {
          setProvisioningError(
            error instanceof Error ? error.message : "無法重新初始化裝置身份。",
          );
        })
        .finally(() => setReady(true));
    }, 0);
  };

  const navigate = (route: WorkspaceRoute) => () => router.push(route);

  if (!ready) {
    return <LoadingState label="正在檢查裝置配置…" />;
  }

  if (!provisioned) {
    return (
      <AppScreen contentContainerStyle={styles.provisionContent}>
        <View style={styles.provisionHeader}>
          <BrandTile />
          <Text style={styles.provisionTitle}>裝置啟用</Text>
          <Text style={styles.provisionLead}>
            連線車隊管理系統。啟用後此裝置可接收派單與外部平台訂單。
          </Text>
          {hasDriverDevOverride() ? (
            <View style={styles.devOverrideTag}>
              <StatusChip label="DEV OVERRIDE" variant="info" />
            </View>
          ) : null}
        </View>

        <StepTimeline steps={ACTIVATION_STEPS} />

        <View style={styles.formCard}>
          {provisioningError ? (
            <ErrorBanner message={provisioningError} />
          ) : null}
          <FormField
            autoCapitalize="none"
            autoCorrect={false}
            editable={!submitting}
            label="註冊代碼"
            onChangeText={setRegistrationCode}
            placeholder="請輸入註冊代碼"
            style={styles.monoInput}
            value={registrationCode}
          />
          <FormField
            editable={!submitting}
            helpText="選填，方便平台與營運端辨識此裝置。"
            label="裝置名稱"
            onChangeText={setDeviceLabel}
            placeholder="例如：Driver Pixel 01"
            value={deviceLabel}
          />
          <ActionButton
            icon="shield-checkmark-outline"
            loading={submitting}
            onPress={() => {
              void handleRegister();
            }}
            title={submitting ? "配置中…" : "註冊此裝置"}
          />
        </View>

        <WarningCallout message="未啟用裝置無法接收派單。請使用車隊發放的代碼，避免使用個人帳號註冊。" />
      </AppScreen>
    );
  }

  if (flagsOk === null || identityOk === null) {
    return <LoadingState label="正在初始化司機工作台…" />;
  }

  if (!flagsOk || !identityOk) {
    return (
      <AppScreen contentContainerStyle={styles.degradeContent}>
        <View style={styles.degradeHeader}>
          <Text style={styles.degradeTitle}>工作台暫時降級</Text>
          <Text style={styles.degradeSubtitle}>身份或功能設定尚未完成同步</Text>
          <View style={styles.degradeChipRow}>
            <StatusChip
              label={identityOk ? "身份正常" : "身份失敗"}
              variant={identityOk ? "success" : "danger"}
            />
            <StatusChip
              label={flagsOk ? "旗標正常" : "旗標降級"}
              variant={flagsOk ? "success" : "warning"}
            />
          </View>
        </View>

        <View style={styles.formCard}>
          {workspaceIssue ? <ErrorBanner message={workspaceIssue} /> : null}
          <ActionButton
            icon="refresh-outline"
            onPress={() => setRefreshSeed((current) => current + 1)}
            title="重新檢查連線"
          />
          <ActionButton
            icon={identityOk ? "list-outline" : "person-circle-outline"}
            onPress={() => {
              if (identityOk) {
                router.push("/jobs");
                return;
              }

              handleReinitializeIdentity();
            }}
            style={styles.degradeSecondaryAction}
            title={identityOk ? "先查看任務收件匣" : "重新初始化身份"}
            variant="secondary"
          />
        </View>
      </AppScreen>
    );
  }

  const heroTitle = activeTaskTitle
    ? `繼續行程 · ${activeTaskTitle}`
    : "尚無進行中行程";
  const heroMeta = activeTaskTitle
    ? `${activeTaskTitle} · 自營派單 · 點擊進入行程作業`
    : "可前往任務收件匣查看待處理任務";
  const pendingValue =
    pendingTaskCount === null ? "—" : String(pendingTaskCount);
  const pendingHelper =
    pendingTaskCount === null
      ? "今日待處理"
      : pendingTaskCount === 0
        ? "暫無待處理"
        : `${pendingTaskCount} 待處理`;
  const reauthPlatform = WORKSPACE_PLATFORMS.find((p) => p.reauth);

  return (
    <AppScreen contentContainerStyle={styles.cockpitContent}>
      <View style={styles.cockpitHeader}>
        <View style={styles.cockpitGreetingBlock}>
          <Text style={styles.cockpitGreetingLabel}>工作台</Text>
          <View style={styles.cockpitStatusRow}>
            <View style={styles.cockpitStatusDot} />
            <Text style={styles.cockpitStatusText}>上班中 · 可接派單</Text>
          </View>
        </View>
        <Pressable
          accessibilityLabel="通知"
          accessibilityRole="button"
          onPress={navigate("/incident")}
          style={({ pressed }) => [
            styles.cockpitBellButton,
            pressed ? styles.cockpitBellButtonPressed : null,
          ]}
        >
          <Ionicons
            name="notifications-outline"
            size={18}
            color={tokens.colors.text}
          />
          {pendingTaskCount && pendingTaskCount > 0 ? (
            <View style={styles.cockpitBellBadge} />
          ) : null}
        </Pressable>
      </View>

      <HeroCard
        title={heroTitle}
        meta={heroMeta}
        primaryLabel={activeTaskTitle ? "前往行程" : "查看任務"}
        secondaryLabel={activeTaskTitle ? "查看路線" : "平台連線"}
        onPrimaryPress={activeTaskTitle ? navigate("/trip") : navigate("/jobs")}
        onSecondaryPress={
          activeTaskTitle ? navigate("/trip") : navigate("/platform-presence")
        }
      />

      <View style={styles.kpiRow}>
        <KpiTile
          iconName="list-outline"
          label="待處理"
          tone="brand"
          value={pendingValue}
        />
        <KpiTile
          iconName="power-outline"
          label="已上線"
          tone="success"
          unit={`/ ${WORKSPACE_PLATFORMS.length}`}
          value={String(platformsOnline)}
        />
        <KpiTile
          iconName="wallet-outline"
          label="今日淨收"
          tone="neutral"
          unit="NT$"
          value="—"
        />
      </View>

      {reauthPlatform ? (
        <ReauthAlert
          actionLabel="處理"
          description="Token 已過期，無法接單"
          onPress={navigate("/platform-presence")}
          title={`${reauthPlatform.name} 需重新授權`}
        />
      ) : null}

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>平台連線</Text>
          <Pressable
            accessibilityRole="button"
            onPress={navigate("/platform-presence")}
          >
            <Text style={styles.sectionAction}>全部</Text>
          </Pressable>
        </View>
        <View style={styles.platformList}>
          {platformStates.map(({ platform, enabled }, index) => (
            <PlatformRow
              key={platform.code}
              enabled={enabled}
              isLast={index === platformStates.length - 1}
              platform={platform}
              onToggle={(next) =>
                setPlatformOverrides((current) => ({
                  ...current,
                  [platform.code]: next,
                }))
              }
            />
          ))}
        </View>
      </View>

      <View style={styles.helperHint}>
        <Ionicons
          name="information-circle-outline"
          size={14}
          color={tokens.colors.textMuted}
        />
        <Text style={styles.helperHintText}>
          {pendingHelper} · 上線狀態會影響各平台是否將派單轉送到此裝置。
        </Text>
      </View>

      <View style={styles.quickGrid}>
        <QuickTile
          helper="任務收件匣"
          iconName="briefcase-outline"
          label="任務"
          tone="brand"
          onPress={navigate("/jobs")}
        />
        <QuickTile
          helper="今日收益"
          iconName="cash-outline"
          label="收入"
          tone="brand"
          onPress={navigate("/earnings")}
        />
        <QuickTile
          helper="班次與出勤"
          iconName="time-outline"
          label="班次"
          tone="brand"
          onPress={navigate("/shift")}
        />
        <QuickTile
          helper="安全求援"
          iconName="alert-circle-outline"
          label="SOS"
          tone="danger"
          onPress={navigate("/incident")}
        />
      </View>

      <View style={styles.footerLinks}>
        <Pressable
          accessibilityRole="button"
          onPress={navigate("/settings")}
          style={({ pressed }) => [
            styles.footerLink,
            pressed ? styles.footerLinkPressed : null,
          ]}
        >
          <Ionicons
            name="settings-outline"
            size={14}
            color={tokens.colors.textMuted}
          />
          <Text style={styles.footerLinkText}>設定</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => setRefreshSeed((current) => current + 1)}
          style={({ pressed }) => [
            styles.footerLink,
            pressed ? styles.footerLinkPressed : null,
          ]}
        >
          <Ionicons
            name="refresh-outline"
            size={14}
            color={tokens.colors.textMuted}
          />
          <Text style={styles.footerLinkText}>重新整理</Text>
        </Pressable>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  loadingState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: tokens.spacing[24],
  },
  loadingLabel: {
    ...tokens.type.body,
    color: tokens.colors.textBody,
    marginTop: tokens.spacing[12],
    textAlign: "center",
  },

  // Provisioning screen
  provisionContent: {
    paddingTop: tokens.spacing[20],
    gap: tokens.spacing[20],
  },
  provisionHeader: {
    paddingHorizontal: tokens.spacing[4],
    gap: tokens.spacing[8],
  },
  provisionTitle: {
    ...tokens.type.screenTitle,
    color: tokens.colors.textStrong,
    marginTop: tokens.spacing[12],
  },
  provisionLead: {
    ...tokens.type.body,
    color: tokens.colors.textMuted,
    marginTop: tokens.spacing[4],
    lineHeight: 22,
  },
  devOverrideTag: {
    marginTop: tokens.spacing[4],
    flexDirection: "row",
  },
  brandTile: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: tokens.colors.brand,
    alignItems: "center",
    justifyContent: "center",
    ...tokens.shadows.sm,
  },
  brandTileLabel: {
    color: tokens.colors.textInverse,
    fontWeight: "800",
    fontSize: 18,
    letterSpacing: 0.5,
  },

  stepList: {
    paddingHorizontal: tokens.spacing[4],
  },
  stepRow: {
    flexDirection: "row",
    gap: tokens.spacing[12],
  },
  stepIndicatorColumn: {
    alignItems: "center",
    width: 28,
  },
  stepIndicator: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  stepIndicatorActive: {
    backgroundColor: tokens.colors.brand,
    borderColor: tokens.colors.brand,
  },
  stepIndicatorPending: {
    backgroundColor: tokens.colors.surfaceLo,
    borderColor: tokens.colors.border,
  },
  stepIndicatorTextActive: {
    color: tokens.colors.textInverse,
    fontWeight: "700",
    fontSize: 11,
  },
  stepIndicatorTextPending: {
    color: tokens.colors.textDim,
    fontWeight: "700",
    fontSize: 11,
  },
  stepConnector: {
    flex: 1,
    width: 1.5,
    backgroundColor: tokens.colors.border,
    marginTop: 4,
    minHeight: 20,
  },
  stepBody: {
    flex: 1,
    paddingTop: 2,
    paddingBottom: tokens.spacing[16],
  },
  stepTitle: {
    ...tokens.type.bodyStrong,
    color: tokens.colors.textStrong,
  },
  stepTitlePending: {
    color: tokens.colors.textMuted,
  },
  stepDescription: {
    ...tokens.type.small,
    color: tokens.colors.textDim,
    marginTop: 2,
  },

  formCard: {
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing[16],
    gap: tokens.spacing[12],
    ...tokens.shadows.sm,
  },
  monoInput: {
    fontVariant: ["tabular-nums"],
  },

  warningCallout: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: tokens.spacing[8],
    padding: tokens.spacing[12],
    backgroundColor: tokens.colors.warningBg,
    borderColor: `${tokens.colors.warning}40`,
    borderWidth: 1,
    borderRadius: tokens.radius.md,
  },
  warningCalloutIcon: {
    marginTop: 2,
  },
  warningCalloutText: {
    ...tokens.type.small,
    color: tokens.colors.warning,
    flex: 1,
    lineHeight: 18,
  },

  // Workspace cockpit
  cockpitContent: {
    paddingTop: tokens.spacing[12],
    gap: tokens.spacing[16],
  },
  cockpitHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cockpitGreetingBlock: {
    flex: 1,
  },
  cockpitGreetingLabel: {
    ...tokens.type.display,
    fontSize: 26,
    color: tokens.colors.textStrong,
  },
  cockpitStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing[8],
    marginTop: 4,
  },
  cockpitStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: tokens.colors.success,
  },
  cockpitStatusText: {
    ...tokens.type.small,
    color: tokens.colors.textMuted,
  },
  cockpitBellButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  cockpitBellButtonPressed: {
    backgroundColor: tokens.colors.surfaceLo,
  },
  cockpitBellBadge: {
    position: "absolute",
    top: 9,
    right: 10,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: tokens.colors.danger,
  },

  heroCard: {
    backgroundColor: tokens.colors.brand,
    borderRadius: 18,
    padding: tokens.spacing[16],
    overflow: "hidden",
  },
  heroEyebrowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  heroEyebrowDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: tokens.colors.textInverse,
  },
  heroEyebrowText: {
    ...tokens.type.micro,
    color: tokens.colors.textInverse,
    opacity: 0.9,
  },
  heroTitle: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "700",
    letterSpacing: -0.3,
    color: tokens.colors.textInverse,
    marginTop: 6,
  },
  heroMeta: {
    ...tokens.type.small,
    color: tokens.colors.textInverse,
    opacity: 0.85,
    marginTop: 4,
  },
  heroActionRow: {
    flexDirection: "row",
    gap: tokens.spacing[8],
    marginTop: tokens.spacing[16],
  },
  heroPrimaryButton: {
    backgroundColor: tokens.colors.surface,
    borderRadius: 12,
    paddingHorizontal: tokens.spacing[16],
    paddingVertical: tokens.spacing[8],
    flexDirection: "row",
    alignItems: "center",
  },
  heroPrimaryButtonPressed: {
    opacity: 0.85,
  },
  heroPrimaryLabel: {
    ...tokens.type.label,
    color: tokens.colors.brand,
    fontWeight: "700",
  },
  heroButtonIcon: {
    marginRight: 6,
  },
  heroSecondaryButton: {
    borderRadius: 12,
    paddingHorizontal: tokens.spacing[16],
    paddingVertical: tokens.spacing[8],
    backgroundColor: "rgba(255,255,255,0.15)",
    flexDirection: "row",
    alignItems: "center",
  },
  heroSecondaryButtonPressed: {
    opacity: 0.7,
  },
  heroSecondaryLabel: {
    ...tokens.type.label,
    color: tokens.colors.textInverse,
    fontWeight: "600",
  },

  kpiRow: {
    flexDirection: "row",
    gap: tokens.spacing[8],
  },
  kpiTile: {
    flex: 1,
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    borderRadius: 14,
    padding: tokens.spacing[12],
    gap: 6,
  },
  kpiIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  kpiLabel: {
    ...tokens.type.micro,
    color: tokens.colors.textMuted,
    marginTop: 2,
  },
  kpiValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 2,
  },
  kpiValue: {
    ...tokens.type.sectionTitle,
    color: tokens.colors.textStrong,
  },
  kpiUnit: {
    ...tokens.type.micro,
    color: tokens.colors.textMuted,
  },

  reauthCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing[12],
    padding: tokens.spacing[12],
    backgroundColor: tokens.colors.warningBg,
    borderColor: `${tokens.colors.warning}40`,
    borderWidth: 1,
    borderRadius: 14,
  },
  reauthIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: `${tokens.colors.warning}25`,
    alignItems: "center",
    justifyContent: "center",
  },
  reauthBody: {
    flex: 1,
  },
  reauthTitle: {
    ...tokens.type.bodyStrong,
    color: tokens.colors.warning,
    fontSize: 13,
  },
  reauthDescription: {
    ...tokens.type.small,
    color: tokens.colors.textMuted,
    marginTop: 1,
  },
  reauthAction: {
    backgroundColor: tokens.colors.warning,
    paddingHorizontal: tokens.spacing[12],
    paddingVertical: 8,
    borderRadius: 999,
  },
  reauthActionPressed: {
    opacity: 0.85,
  },
  reauthActionLabel: {
    ...tokens.type.label,
    color: tokens.colors.textInverse,
    fontWeight: "700",
    fontSize: 12,
  },

  section: {
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    borderRadius: 14,
    padding: tokens.spacing[16],
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: tokens.spacing[12],
  },
  sectionTitle: {
    ...tokens.type.sectionTitle,
    color: tokens.colors.textStrong,
  },
  sectionAction: {
    ...tokens.type.label,
    color: tokens.colors.brand,
    fontWeight: "600",
  },

  platformList: {
    gap: 0,
  },
  platformRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: tokens.spacing[12],
    gap: tokens.spacing[12],
  },
  platformRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.border,
  },
  platformBody: {
    flex: 1,
  },
  platformName: {
    ...tokens.type.bodyStrong,
    color: tokens.colors.textStrong,
  },
  platformSub: {
    ...tokens.type.small,
    color: tokens.colors.textMuted,
    marginTop: 2,
  },
  platformControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing[8],
  },

  helperHint: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    paddingHorizontal: tokens.spacing[4],
  },
  helperHintText: {
    ...tokens.type.small,
    color: tokens.colors.textMuted,
    flex: 1,
    lineHeight: 18,
  },

  quickGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: tokens.spacing[8],
  },
  quickTile: {
    flexBasis: "48%",
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing[12],
    padding: tokens.spacing[12],
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    borderRadius: 12,
  },
  quickTilePressed: {
    backgroundColor: tokens.colors.surfaceLo,
  },
  quickTileIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  quickTileBody: {
    flex: 1,
    minWidth: 0,
  },
  quickTileLabel: {
    ...tokens.type.bodyStrong,
    color: tokens.colors.textStrong,
    fontSize: 13,
  },
  quickTileHelper: {
    ...tokens.type.micro,
    color: tokens.colors.textMuted,
    marginTop: 2,
    textTransform: "none",
    letterSpacing: 0,
  },

  footerLinks: {
    flexDirection: "row",
    justifyContent: "center",
    gap: tokens.spacing[16],
    paddingVertical: tokens.spacing[8],
  },
  footerLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: tokens.spacing[8],
    paddingVertical: 4,
  },
  footerLinkPressed: {
    opacity: 0.6,
  },
  footerLinkText: {
    ...tokens.type.small,
    color: tokens.colors.textMuted,
  },

  // Degraded view
  degradeContent: {
    paddingTop: tokens.spacing[16],
    gap: tokens.spacing[16],
  },
  degradeHeader: {
    gap: tokens.spacing[8],
  },
  degradeTitle: {
    ...tokens.type.screenTitle,
    color: tokens.colors.textStrong,
  },
  degradeSubtitle: {
    ...tokens.type.body,
    color: tokens.colors.textMuted,
  },
  degradeChipRow: {
    flexDirection: "row",
    gap: tokens.spacing[8],
    marginTop: tokens.spacing[8],
    flexWrap: "wrap",
  },
  degradeSecondaryAction: {
    marginTop: tokens.spacing[8],
  },
});
