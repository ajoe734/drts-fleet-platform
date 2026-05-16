import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  PLATFORM_CODE_REGISTRY,
  PlatformPresenceRecord,
  PlatformPresenceSummary,
  ShiftRecord,
  UnifiedDriverTaskView,
} from "@drts/contracts";

import {
  ActionButton,
  AuthorityBanner,
  AppScreen,
  ErrorBanner,
  FormField,
  PlatformBadge,
  StatusChip,
  tokens,
} from "@/components/ui";
import { assessPlatformHealth } from "@/components/platform-status-card";
import {
  getDriverClient,
  getDriverId,
  getDriverIdentityIssue,
  hasDriverDevOverride,
  initializeDriverIdentity,
  isDriverIdentityProvisioned,
  registerDriverDevice,
} from "@/lib/api-client";
import {
  buildFallbackUnifiedDriverTaskView,
  hasUnifiedTaskSyncIssue,
  isOwnedUnifiedTask,
  summarizeWorkspaceTasks,
} from "@/lib/driver-workspace-cockpit";

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

type CalloutTone = "warning" | "danger" | "info";

function WarningCallout({
  message,
  tone = "warning",
  iconName = "alert-circle",
}: {
  message: string;
  tone?: CalloutTone;
  iconName?: keyof typeof Ionicons.glyphMap;
}) {
  const palette =
    tone === "danger"
      ? {
          background: tokens.colors.dangerBg,
          border: `${tokens.colors.danger}40`,
          icon: tokens.colors.danger,
        }
      : tone === "info"
        ? {
            background: tokens.colors.brandBg,
            border: `${tokens.colors.brand}30`,
            icon: tokens.colors.brand,
          }
        : {
            background: tokens.colors.warningBg,
            border: `${tokens.colors.warning}40`,
            icon: tokens.colors.warning,
          };

  return (
    <View
      style={[
        styles.warningCallout,
        {
          backgroundColor: palette.background,
          borderColor: palette.border,
        },
      ]}
    >
      <Ionicons
        name={iconName}
        size={16}
        color={palette.icon}
        style={styles.warningCalloutIcon}
      />
      <Text style={[styles.warningCalloutText, { color: palette.icon }]}>
        {message}
      </Text>
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

type KpiTone = "brand" | "success" | "warning" | "neutral";

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
        : tone === "warning"
          ? { color: tokens.colors.warning, bg: tokens.colors.warningBg }
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

type PlatformPreviewRowProps = {
  record: PlatformPresenceRecord;
  displayName: string;
  subtitle: string;
  statusLabel: string;
  statusVariant: "success" | "warning" | "danger" | "default";
  secondaryLabel?: string | null;
  isLast: boolean;
  onPress: () => void;
};

function PlatformRow({
  record,
  displayName,
  subtitle,
  statusLabel,
  statusVariant,
  secondaryLabel,
  isLast,
  onPress,
}: {
  record: PlatformPreviewRowProps["record"];
  displayName: string;
  subtitle: string;
  statusLabel: string;
  statusVariant: PlatformPreviewRowProps["statusVariant"];
  secondaryLabel?: string | null;
  isLast: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`查看 ${record.platformCode} 平台狀態`}
      onPress={onPress}
      style={[styles.platformRow, isLast ? null : styles.platformRowDivider]}
    >
      <View style={styles.platformBody}>
        <View style={styles.platformNameRow}>
          <PlatformBadge
            code={record.platformCode}
            name={record.platformCode.toUpperCase()}
            forwarded
            size="sm"
          />
          <Text style={styles.platformName}>{displayName}</Text>
        </View>
        <Text style={styles.platformSub}>{subtitle}</Text>
      </View>
      <View style={styles.platformControls}>
        <StatusChip label={statusLabel} variant={statusVariant} />
        {secondaryLabel ? (
          <StatusChip label={secondaryLabel} variant="info" />
        ) : null}
        <Ionicons
          name="chevron-forward"
          size={16}
          color={tokens.colors.textMuted}
        />
      </View>
    </Pressable>
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

type StatusTone = "success" | "warning" | "danger" | "neutral";

function toErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return fallback;
}

function formatCompactDateTime(value: string | null) {
  if (!value) {
    return "尚無更新";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("zh-TW", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toneToStatusVariant(tone: StatusTone) {
  switch (tone) {
    case "success":
      return "success" as const;
    case "warning":
      return "warning" as const;
    case "danger":
      return "danger" as const;
    default:
      return "default" as const;
  }
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
  const [taskViews, setTaskViews] = useState<UnifiedDriverTaskView[]>([]);
  const [taskFallbackMode, setTaskFallbackMode] = useState(false);
  const [taskLoadError, setTaskLoadError] = useState<string | null>(null);
  const [platformSummary, setPlatformSummary] =
    useState<PlatformPresenceSummary | null>(null);
  const [platformLoadError, setPlatformLoadError] = useState<string | null>(
    null,
  );
  const [activeShift, setActiveShift] = useState<ShiftRecord | null>(null);
  const [shiftFeatureEnabled, setShiftFeatureEnabled] = useState<
    boolean | null
  >(null);
  const [loadingShiftData, setLoadingShiftData] = useState(false);
  const [shiftLoadError, setShiftLoadError] = useState(false);

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
    const driverId = getDriverId();

    const loadTaskViews = async () => {
      try {
        return {
          tasks: await client.listUnifiedDriverTasks(),
          fallbackMode: false,
        };
      } catch (unifiedError) {
        try {
          const legacyTasks = await client.listDriverTasks();
          return {
            tasks: legacyTasks.map(buildFallbackUnifiedDriverTaskView),
            fallbackMode: true,
          };
        } catch {
          throw unifiedError;
        }
      }
    };

    setFlagsOk(null);
    setIdentityOk(null);
    setWorkspaceIssue(null);
    setTaskViews([]);
    setTaskFallbackMode(false);
    setTaskLoadError(null);
    setPlatformSummary(null);
    setPlatformLoadError(null);
    setActiveShift(null);
    setShiftFeatureEnabled(null);
    setShiftLoadError(false);
    setLoadingShiftData(false);

    void Promise.allSettled([
      client.getFeatureFlags(),
      client.getIdentityContext(),
      loadTaskViews(),
      client.getPlatformPresence(),
      client.isFeatureEnabled("driver-app.shift"),
    ])
      .then(
        async ([
          flagsResult,
          identityResult,
          tasksResult,
          platformResult,
          shiftFlagResult,
        ]) => {
          if (cancelled) {
            return;
          }

          const nextFlagsOk = flagsResult.status === "fulfilled";
          const nextIdentityOk = identityResult.status === "fulfilled";

          setFlagsOk(nextFlagsOk);
          setIdentityOk(nextIdentityOk);

          if (!nextFlagsOk || !nextIdentityOk) {
            setWorkspaceIssue(
              resolveWorkspaceIssue(nextFlagsOk, nextIdentityOk),
            );
          }

          if (tasksResult.status === "fulfilled") {
            setTaskViews(tasksResult.value.tasks);
            setTaskFallbackMode(tasksResult.value.fallbackMode);
          } else {
            setTaskViews([]);
            setTaskFallbackMode(false);
            setTaskLoadError(
              toErrorMessage(tasksResult.reason, "任務狀態暫時無法同步。"),
            );
          }

          if (platformResult.status === "fulfilled") {
            setPlatformSummary(platformResult.value);
          } else {
            setPlatformSummary(null);
            setPlatformLoadError(
              toErrorMessage(
                platformResult.reason,
                "平台就緒狀態暫時無法同步。",
              ),
            );
          }

          const nextShiftFeatureEnabled =
            shiftFlagResult.status === "fulfilled"
              ? shiftFlagResult.value
              : true;
          setShiftFeatureEnabled(nextShiftFeatureEnabled);

          if (!nextShiftFeatureEnabled) {
            return;
          }

          setLoadingShiftData(true);
          try {
            const shifts = await client.listShifts(driverId);
            if (cancelled) {
              return;
            }

            const active = shifts.find((shift) => shift.status === "active");
            setActiveShift(active ?? null);
          } catch (error: unknown) {
            if (cancelled) {
              return;
            }

            setShiftLoadError(true);
            console.error("Failed to load shifts:", error);
          } finally {
            if (!cancelled) {
              setLoadingShiftData(false);
            }
          }
        },
      )
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        setFlagsOk(false);
        setIdentityOk(false);
        setWorkspaceIssue(resolveWorkspaceIssue(false, false));
        setShiftFeatureEnabled(false);
        setLoadingShiftData(false);
        console.error("Error during onboarding data fetch:", error);
      });

    return () => {
      cancelled = true;
    };
  }, [provisioned, refreshSeed]);

  const isDriverOnShift = useMemo(() => activeShift !== null, [activeShift]);
  const taskSummary = useMemo(
    () => summarizeWorkspaceTasks(taskViews),
    [taskViews],
  );
  const externalPresences = platformSummary?.presences ?? [];
  const reauthPlatforms = useMemo(
    () => externalPresences.filter((record) => record.reauthRequired),
    [externalPresences],
  );

  const platformRows = useMemo(() => {
    return externalPresences
      .map((record) => {
        const assessment = assessPlatformHealth(record);
        const displayName =
          PLATFORM_CODE_REGISTRY[record.platformCode]?.displayName ??
          record.platformCode;
        const relatedTasks = taskViews.filter(
          (task) =>
            !isOwnedUnifiedTask(task) &&
            task.sourcePlatform === record.platformCode,
        );
        const syncIssueCount = relatedTasks.filter(
          hasUnifiedTaskSyncIssue,
        ).length;
        const pendingPlatformCount = relatedTasks.filter(
          (task) => task.driverActionState === "awaiting_platform",
        ).length;

        let tone: StatusTone = "neutral";
        let statusLabel = record.status === "online" ? "待命" : "離線";

        if (record.reauthRequired) {
          tone = "warning";
          statusLabel = "需重新授權";
        } else if (syncIssueCount > 0) {
          tone = "danger";
          statusLabel =
            syncIssueCount > 1 ? `${syncIssueCount} 筆同步異常` : "同步異常";
        } else if (pendingPlatformCount > 0) {
          tone = "warning";
          statusLabel =
            pendingPlatformCount > 1
              ? `${pendingPlatformCount} 筆待平台確認`
              : "待平台確認";
        } else if (assessment.canReceiveOrders) {
          tone = "success";
          statusLabel = "可接平台單";
        } else if (record.status === "online") {
          tone = assessment.statusTone === "danger" ? "danger" : "warning";
          statusLabel = assessment.statusLabel;
        }

        const latestAt =
          record.status === "online"
            ? record.lastOnlineAt
            : record.lastOfflineAt;
        const subtitle = record.reauthRequired
          ? `憑證需更新 · 最近更新 ${formatCompactDateTime(record.updatedAt)}`
          : `${record.status === "online" ? "最近上線" : "最近離線"} ${formatCompactDateTime(
              latestAt ?? record.updatedAt,
            )}`;

        return {
          record,
          displayName,
          subtitle,
          statusLabel,
          tone,
          secondaryLabel: record.status === "online" ? "上線" : "離線",
          isReady:
            record.status === "online" &&
            assessment.canReceiveOrders &&
            !record.reauthRequired &&
            syncIssueCount === 0,
          hasShiftMismatch:
            shiftFeatureEnabled === true &&
            !shiftLoadError &&
            !isDriverOnShift &&
            record.status === "online" &&
            !record.reauthRequired,
        };
      })
      .sort((left, right) => {
        const weight = (tone: StatusTone) => {
          switch (tone) {
            case "danger":
              return 3;
            case "warning":
              return 2;
            case "success":
              return 1;
            default:
              return 0;
          }
        };

        const delta = weight(right.tone) - weight(left.tone);
        if (delta !== 0) {
          return delta;
        }

        return left.displayName.localeCompare(right.displayName);
      });
  }, [
    externalPresences,
    isDriverOnShift,
    shiftFeatureEnabled,
    shiftLoadError,
    taskViews,
  ]);

  const readyExternalCount = useMemo(
    () => platformRows.filter((row) => row.isReady).length,
    [platformRows],
  );
  const mismatchedPlatforms = useMemo(
    () => platformRows.filter((row) => row.hasShiftMismatch),
    [platformRows],
  );

  const ownedReadiness = useMemo(() => {
    if (shiftFeatureEnabled === null || loadingShiftData) {
      return {
        tone: "warning" as StatusTone,
        label: "班次同步中",
        description: "正在確認班次與自營派單可用性。",
      };
    }

    if (shiftFeatureEnabled === false) {
      return {
        tone: "neutral" as StatusTone,
        label: "班次功能未啟用",
        description: "目前僅能確認裝置身份；班次追蹤暫停提供。",
      };
    }

    if (shiftLoadError) {
      return {
        tone: "warning" as StatusTone,
        label: "班次待確認",
        description: "班次資料暫時無法載入，請重新整理或前往班次頁確認。",
      };
    }

    if (isDriverOnShift) {
      return {
        tone: "success" as StatusTone,
        label: "可接自營派單",
        description: activeShift?.clockedInAt
          ? `本次班次已於 ${formatCompactDateTime(activeShift.clockedInAt)} 開始。`
          : "司機已上班，可執行 DRTS 自營任務。",
      };
    }

    return {
      tone: "warning" as StatusTone,
      label: "尚未上班",
      description: "開始班次前，DRTS 自營派單會維持待命。",
    };
  }, [
    activeShift,
    isDriverOnShift,
    loadingShiftData,
    shiftFeatureEnabled,
    shiftLoadError,
  ]);

  const externalReadiness = useMemo(() => {
    if (platformLoadError && externalPresences.length === 0) {
      return {
        tone: "warning" as StatusTone,
        label: "平台狀態待確認",
        description: platformLoadError,
      };
    }

    if (externalPresences.length === 0) {
      return {
        tone: "neutral" as StatusTone,
        label: "尚未連接平台",
        description: "目前沒有外部平台連線，請到平台中心或設定確認綁定。",
      };
    }

    if (reauthPlatforms.length > 0) {
      return {
        tone: "warning" as StatusTone,
        label:
          reauthPlatforms.length > 1
            ? `${reauthPlatforms.length} 個平台需重新授權`
            : `${platformRows.find((row) => row.record.reauthRequired)?.displayName ?? "平台"} 需重新授權`,
        description: "授權過期會阻止外部平台派單送達此裝置。",
      };
    }

    if (readyExternalCount === externalPresences.length) {
      return {
        tone: "success" as StatusTone,
        label: `${readyExternalCount}/${externalPresences.length} 可接平台單`,
        description: "所有外部平台連線正常，工作台可接收轉送任務。",
      };
    }

    if (readyExternalCount > 0) {
      return {
        tone: "warning" as StatusTone,
        label: `${readyExternalCount}/${externalPresences.length} 可接平台單`,
        description: "部分平台仍待處理，請檢查離線、同步或資格限制。",
      };
    }

    return {
      tone: "neutral" as StatusTone,
      label: "外部平台待命",
      description: "目前沒有可接單的外部平台通道，請先檢查平台狀態。",
    };
  }, [
    externalPresences.length,
    platformLoadError,
    platformRows,
    readyExternalCount,
    reauthPlatforms.length,
  ]);

  const cockpitStatus = useMemo(() => {
    if (shiftFeatureEnabled === null || loadingShiftData) {
      return {
        dotColor: tokens.colors.warning,
        text: "正在同步班次與平台狀態",
      };
    }

    if (taskSummary.activeTripTask) {
      return {
        dotColor: tokens.colors.success,
        text: "進行中行程 · 優先返回行程作業",
      };
    }

    if (taskSummary.syncIssueCount > 0 || reauthPlatforms.length > 0) {
      return {
        dotColor: tokens.colors.warning,
        text: "需處理授權或同步異常",
      };
    }

    if (taskSummary.pendingPlatformCount > 0) {
      return {
        dotColor: tokens.colors.warning,
        text: "等待來源平台確認",
      };
    }

    if (taskSummary.actionRequiredTask) {
      return {
        dotColor: tokens.colors.brand,
        text: "有待處理任務",
      };
    }

    if (isDriverOnShift) {
      return {
        dotColor: tokens.colors.success,
        text:
          readyExternalCount > 0
            ? "上班中 · 自營與平台均可接單"
            : "上班中 · 自營可接單",
      };
    }

    if (mismatchedPlatforms.length > 0) {
      return {
        dotColor: tokens.colors.warning,
        text: "未上班 · 外部平台仍在線",
      };
    }

    return {
      dotColor: tokens.colors.textMuted,
      text: "工作台待命",
    };
  }, [
    isDriverOnShift,
    loadingShiftData,
    mismatchedPlatforms.length,
    readyExternalCount,
    reauthPlatforms.length,
    shiftFeatureEnabled,
    taskSummary,
  ]);

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
  const notificationCount = taskSummary.urgentCount + reauthPlatforms.length;
  const pendingValue = String(taskSummary.pendingCount);
  const shiftKpiValue =
    shiftFeatureEnabled === null || loadingShiftData
      ? "同步中"
      : shiftFeatureEnabled === false
        ? "未啟用"
        : shiftLoadError
          ? "待確認"
          : isDriverOnShift
            ? "上班中"
            : "未上班";
  const helperHint = taskFallbackMode
    ? "任務清單目前使用舊版鏡像資料；來源平台原生狀態可能有延遲。"
    : externalPresences.length > 0
      ? "工作台會優先提醒授權、同步與平台確認中的任務。"
      : "目前尚未連接外部平台，可前往平台中心或設定確認綁定。";

  const nextAction = useMemo(() => {
    if (taskSummary.activeTripTask) {
      const task = taskSummary.activeTripTask;
      const routeSummary =
        task.pickupSummary && task.dropoffSummary
          ? `${task.pickupSummary} → ${task.dropoffSummary}`
          : task.pickupSummary ||
            task.dropoffSummary ||
            "打開行程作業查看下一步";

      return {
        title: `返回行程 · ${task.taskId}`,
        meta: `${task.platformDisplayName} · ${routeSummary}`,
        primaryLabel: "前往行程",
        primaryRoute: "/trip" as WorkspaceRoute,
        secondaryLabel: "查看任務",
        secondaryRoute: "/jobs" as WorkspaceRoute,
      };
    }

    if (taskSummary.syncIssueTask) {
      const task = taskSummary.syncIssueTask;
      const primaryRoute =
        task.requiresReauth || reauthPlatforms.length > 0
          ? "/platform-presence"
          : "/jobs";
      return {
        title: "處理授權或同步異常",
        meta:
          task.syncIssueSummary?.trim() ||
          `${task.platformDisplayName} 任務需要派車台介入，請先確認狀態。`,
        primaryLabel:
          primaryRoute === "/platform-presence"
            ? "查看平台中心"
            : "查看異常任務",
        primaryRoute: primaryRoute as WorkspaceRoute,
        secondaryLabel:
          primaryRoute === "/platform-presence" ? "查看任務" : "檢查平台",
        secondaryRoute:
          primaryRoute === "/platform-presence"
            ? ("/jobs" as WorkspaceRoute)
            : ("/platform-presence" as WorkspaceRoute),
      };
    }

    if (taskSummary.actionRequiredTask) {
      const task = taskSummary.actionRequiredTask;
      return {
        title: "優先處理待回應任務",
        meta: `${task.platformDisplayName} · ${task.taskId} 等待司機操作。`,
        primaryLabel: "打開任務收件匣",
        primaryRoute: "/jobs" as WorkspaceRoute,
        secondaryLabel: "查看平台",
        secondaryRoute: "/platform-presence" as WorkspaceRoute,
      };
    }

    if (taskSummary.awaitingPlatformTask) {
      return {
        title: "查看平台確認進度",
        meta: `目前有 ${taskSummary.pendingPlatformCount} 筆任務等待來源平台確認，確認前請勿自行出車。`,
        primaryLabel: "查看任務狀態",
        primaryRoute: "/jobs" as WorkspaceRoute,
        secondaryLabel: "平台中心",
        secondaryRoute: "/platform-presence" as WorkspaceRoute,
      };
    }

    if (
      shiftFeatureEnabled === true &&
      !loadingShiftData &&
      !shiftLoadError &&
      !isDriverOnShift
    ) {
      return {
        title: "開始班次",
        meta: "先完成上班打卡，DRTS 自營派單才會進入可接單狀態。",
        primaryLabel: "前往班次",
        primaryRoute: "/shift" as WorkspaceRoute,
        secondaryLabel: "查看平台",
        secondaryRoute: "/platform-presence" as WorkspaceRoute,
      };
    }

    if (externalPresences.length === 0) {
      return {
        title: "連接外部平台",
        meta: "目前尚未看到任何外部平台連線，請先確認綁定或上線狀態。",
        primaryLabel: "打開平台中心",
        primaryRoute: "/platform-presence" as WorkspaceRoute,
        secondaryLabel: "查看設定",
        secondaryRoute: "/settings" as WorkspaceRoute,
      };
    }

    if (readyExternalCount === 0) {
      return {
        title: "檢查平台就緒狀態",
        meta: "外部平台目前沒有可接單通道，請檢查離線、資格或授權狀態。",
        primaryLabel: "查看平台中心",
        primaryRoute: "/platform-presence" as WorkspaceRoute,
        secondaryLabel: "查看設定",
        secondaryRoute: "/settings" as WorkspaceRoute,
      };
    }

    if (taskSummary.pendingCount > 0) {
      return {
        title: "查看任務收件匣",
        meta: `目前共有 ${taskSummary.pendingCount} 筆未完成任務，建議先確認優先順序。`,
        primaryLabel: "打開任務",
        primaryRoute: "/jobs" as WorkspaceRoute,
        secondaryLabel: "平台中心",
        secondaryRoute: "/platform-presence" as WorkspaceRoute,
      };
    }

    return {
      title: "檢查多平台就緒狀態",
      meta: "工作台已初始化完成，可查看平台健康、班次與設定。",
      primaryLabel: "平台中心",
      primaryRoute: "/platform-presence" as WorkspaceRoute,
      secondaryLabel: "查看設定",
      secondaryRoute: "/settings" as WorkspaceRoute,
    };
  }, [
    externalPresences.length,
    isDriverOnShift,
    loadingShiftData,
    readyExternalCount,
    reauthPlatforms.length,
    shiftFeatureEnabled,
    shiftLoadError,
    taskSummary,
  ]);

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
              <StatusChip label="開發覆寫" variant="info" />
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

  const reauthPlatform =
    platformRows.find((row) => row.record.reauthRequired) ?? null;

  return (
    <AppScreen contentContainerStyle={styles.cockpitContent}>
      <View style={styles.cockpitHeader}>
        <View style={styles.cockpitGreetingBlock}>
          <Text style={styles.cockpitGreetingLabel}>工作台</Text>
          <View style={styles.cockpitStatusRow}>
            <View
              style={[
                styles.cockpitStatusDot,
                { backgroundColor: cockpitStatus.dotColor },
              ]}
            />
            <Text style={styles.cockpitStatusText}>{cockpitStatus.text}</Text>
          </View>
        </View>
        <Pressable
          accessibilityLabel="安全事件"
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
          {notificationCount > 0 ? (
            <View style={styles.cockpitBellBadge} />
          ) : null}
        </Pressable>
      </View>

      <HeroCard
        title={nextAction.title}
        meta={nextAction.meta}
        primaryLabel={nextAction.primaryLabel}
        secondaryLabel={nextAction.secondaryLabel}
        onPrimaryPress={navigate(nextAction.primaryRoute)}
        onSecondaryPress={navigate(nextAction.secondaryRoute)}
      />

      <View style={styles.kpiRow}>
        <KpiTile
          iconName="time-outline"
          label="班次"
          tone={isDriverOnShift ? "success" : "neutral"}
          value={shiftKpiValue}
        />
        <KpiTile
          iconName="alert-circle-outline"
          label="急件"
          tone={notificationCount > 0 ? "warning" : "neutral"}
          value={String(notificationCount)}
        />
        <KpiTile
          iconName="swap-horizontal-outline"
          label="外部可接單"
          tone={readyExternalCount > 0 ? "success" : "neutral"}
          unit={
            externalPresences.length > 0
              ? `/ ${externalPresences.length}`
              : undefined
          }
          value={String(readyExternalCount)}
        />
      </View>

      <View style={styles.readinessStack}>
        <AuthorityBanner
          authorityLabel={ownedReadiness.label}
          description={ownedReadiness.description}
          icon="shield-checkmark-outline"
          title="DRTS 自營派單"
          tone={ownedReadiness.tone === "success" ? "owned" : "warning"}
        />
        <AuthorityBanner
          authorityLabel={externalReadiness.label}
          description={externalReadiness.description}
          icon="swap-horizontal-outline"
          title="外部平台就緒狀態"
          tone={
            externalReadiness.tone === "danger"
              ? "danger"
              : externalReadiness.tone === "warning"
                ? "warning"
                : "platform"
          }
        />
      </View>

      {reauthPlatform ? (
        <ReauthAlert
          actionLabel="處理"
          description="授權過期會阻止平台派單送達此裝置。"
          onPress={navigate("/platform-presence")}
          title={`${reauthPlatform.displayName} 需重新授權`}
        />
      ) : null}

      {taskSummary.syncIssueCount > 0 ? (
        <WarningCallout
          iconName="warning-outline"
          message={`目前有 ${taskSummary.syncIssueCount} 筆任務處於同步或人工接手狀態，請先確認任務與平台說明。`}
          tone="danger"
        />
      ) : null}

      {taskSummary.pendingPlatformCount > 0 ? (
        <WarningCallout
          iconName="time-outline"
          message={`有 ${taskSummary.pendingPlatformCount} 筆平台任務等待來源平台確認，確認前請勿自行前往接送點。`}
          tone="info"
        />
      ) : null}

      {taskFallbackMode ? (
        <WarningCallout
          iconName="cloud-offline-outline"
          message="任務卡目前使用舊版鏡像資料；外部平台原生狀態與可執行操作可能有延遲。"
          tone="info"
        />
      ) : null}

      {taskLoadError ? (
        <WarningCallout
          iconName="list-outline"
          message={taskLoadError}
          tone="warning"
        />
      ) : null}

      {platformLoadError ? (
        <WarningCallout
          iconName="cloud-offline-outline"
          message={platformLoadError}
          tone="warning"
        />
      ) : null}

      {mismatchedPlatforms.length > 0 &&
      !isDriverOnShift &&
      !shiftLoadError &&
      !loadingShiftData ? (
        <WarningCallout
          iconName="power-outline"
          message={`偵測到 ${mismatchedPlatforms.length} 個外部平台在您未執勤時仍為上線狀態，可能影響派單與考勤一致性。`}
        />
      ) : null}

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>平台就緒狀態</Text>
          <Pressable
            accessibilityRole="button"
            onPress={navigate("/platform-presence")}
          >
            <Text style={styles.sectionAction}>全部</Text>
          </Pressable>
        </View>

        {platformRows.length > 0 ? (
          <View style={styles.platformList}>
            {platformRows.map((platformRow, index) => (
              <PlatformRow
                key={platformRow.record.platformCode}
                displayName={platformRow.displayName}
                isLast={index === platformRows.length - 1}
                onPress={navigate("/platform-presence")}
                record={platformRow.record}
                secondaryLabel={platformRow.secondaryLabel}
                statusLabel={platformRow.statusLabel}
                statusVariant={toneToStatusVariant(platformRow.tone)}
                subtitle={platformRow.subtitle}
              />
            ))}
          </View>
        ) : (
          <WarningCallout
            iconName="swap-horizontal-outline"
            message="目前尚未看到外部平台連線資料，可先前往平台中心或設定確認綁定。"
            tone="info"
          />
        )}
      </View>

      <View style={styles.helperHint}>
        <Ionicons
          name="information-circle-outline"
          size={14}
          color={tokens.colors.textMuted}
        />
        <Text style={styles.helperHintText}>{helperHint}</Text>
      </View>

      <View style={styles.quickGrid}>
        <QuickTile
          helper={`${pendingValue} 筆未完成`}
          iconName="briefcase-outline"
          label="任務"
          tone="brand"
          onPress={navigate("/jobs")}
        />
        <QuickTile
          helper="目前行程"
          iconName="navigate-outline"
          label="行程"
          tone="brand"
          onPress={navigate("/trip")}
        />
        <QuickTile
          helper="平台健康中心"
          iconName="swap-horizontal-outline"
          label="平台"
          tone="brand"
          onPress={navigate("/platform-presence")}
        />
        <QuickTile
          helper="班次與出勤"
          iconName="time-outline"
          label="班次"
          tone="brand"
          onPress={navigate("/shift")}
        />
        <QuickTile
          helper="今日收益"
          iconName="cash-outline"
          label="收入"
          tone="brand"
          onPress={navigate("/earnings")}
        />
        <QuickTile
          helper="帳號與綁定"
          iconName="settings-outline"
          label="設定"
          tone="brand"
          onPress={navigate("/settings")}
        />
      </View>

      <View style={styles.footerLinks}>
        <Pressable
          accessibilityRole="button"
          onPress={navigate("/incident")}
          style={({ pressed }) => [
            styles.footerLink,
            pressed ? styles.footerLinkPressed : null,
          ]}
        >
          <Ionicons
            name="alert-circle-outline"
            size={14}
            color={tokens.colors.textMuted}
          />
          <Text style={styles.footerLinkText}>安全求援</Text>
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
  readinessStack: {
    gap: tokens.spacing[8],
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
  platformNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing[8],
  },
  platformName: {
    ...tokens.type.bodyStrong,
    color: tokens.colors.textStrong,
    flexShrink: 1,
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
    flexWrap: "wrap",
    justifyContent: "flex-end",
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
