import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  type CrossAppResourceLink,
  type EmptyStateEnvelope,
  PLATFORM_CODE_REGISTRY,
  type EmptyReason,
  type PlatformPresenceRecord,
  type PlatformPresenceSummary,
  type ResourceActionDescriptor,
  type ShiftRecord,
  type UiRefreshMetadata,
} from "@drts/contracts";
import {
  assessPlatformHealth,
  getPlatformHealthSeverity,
} from "@/components/platform-status-card";
import {
  getDriverClient,
  getDriverId,
  isDriverIdentityProvisioned,
} from "@/lib/api-client";
import {
  ActionButton,
  AppScreen,
  AuthorityBanner,
  BottomActionBar,
  EmptyState,
  ErrorBanner,
  FormField,
  IconButton,
  PageHeader,
  PlatformBadge,
  StatusChip,
  Tokens,
} from "@/components/ui";
import { driverStrings } from "@/lib/strings";

const ODOMETER_PATTERN = /^\d+$/;
const EXPECTED_SHIFT_HOURS = 8;
const MAX_SHIFT_ODOMETER_DELTA_KM = 800;
const SHIFT_REFRESH_STALE_AFTER_MS = 5 * 60 * 1000;
const CROSS_APP_BASE_URLS = {
  "ops-console":
    process.env.EXPO_PUBLIC_OPS_CONSOLE_URL ?? "http://localhost:3003",
  "platform-admin":
    process.env.EXPO_PUBLIC_PLATFORM_ADMIN_URL ?? "http://localhost:3002",
  "tenant-console":
    process.env.EXPO_PUBLIC_TENANT_CONSOLE_URL ?? "http://localhost:3004",
} as const;

type ShiftActionName = "refresh" | "clock_in" | "clock_out";

type InlineEmptyStateConfig = {
  reason: EmptyReason;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  variant: "default" | "info" | "warning" | "danger";
  actionTitle?: string;
  onAction?: () => void;
};

type ShiftScreenResource = {
  activeShift: ShiftRecord | null;
  shifts: ShiftRecord[];
  availableActions: ResourceActionDescriptor[];
  fullScreenEmptyState: EmptyStateEnvelope | null;
  inlineEmptyStates: EmptyStateEnvelope[];
  refreshMetadata: UiRefreshMetadata;
  platformCenterRoute: "/platform-presence";
  opsReviewLink: CrossAppResourceLink;
};

function getOdometerValidationMessage(
  value: string,
  activeShift: ShiftRecord | null,
): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (!ODOMETER_PATTERN.test(trimmed)) {
    return "里程表只能輸入 0-9 整數。";
  }

  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed)) {
    return "里程數值過大，請重新確認。";
  }

  if (
    activeShift?.startOdometer != null &&
    parsed < activeShift.startOdometer
  ) {
    return "下線里程不得小於起始里程。";
  }

  return null;
}

function formatShiftDateTime(value: string) {
  return new Date(value).toLocaleString("zh-TW");
}

function formatCompactDateTime(value: string | null | undefined) {
  if (!value) {
    return "尚無更新";
  }

  return new Date(value).toLocaleString("zh-TW", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatClockLabel(value: string) {
  return new Date(value).toLocaleTimeString("zh-TW", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatOdometer(value: number | null) {
  if (value == null) {
    return "未填寫";
  }

  return `${value.toLocaleString("zh-TW")} km`;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return fallback;
}

function getElapsedMinutes(shift: ShiftRecord, now: number) {
  if (shift.totalHours != null) {
    return Math.max(0, Math.round(shift.totalHours * 60));
  }

  const start = new Date(shift.clockedInAt).getTime();
  const end = shift.clockedOutAt ? new Date(shift.clockedOutAt).getTime() : now;

  return Math.max(0, Math.floor((end - start) / 60000));
}

function formatElapsedDuration(shift: ShiftRecord, now: number) {
  const totalMinutes = getElapsedMinutes(shift, now);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function formatElapsedSentence(shift: ShiftRecord, now: number) {
  const totalMinutes = getElapsedMinutes(shift, now);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const parts = [];

  if (hours > 0) {
    parts.push(`${hours} 小時`);
  }
  parts.push(`${minutes} 分`);

  return parts.join(" ");
}

function formatExpectedOffTime(shift: ShiftRecord | null) {
  if (!shift) {
    return "等待上線";
  }

  const expectedTime =
    new Date(shift.clockedInAt).getTime() +
    EXPECTED_SHIFT_HOURS * 60 * 60 * 1000;

  return new Date(expectedTime).toLocaleTimeString("zh-TW", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getPlatformDisplayName(
  platformCode: PlatformPresenceRecord["platformCode"],
) {
  return PLATFORM_CODE_REGISTRY[platformCode]?.displayName ?? platformCode;
}

function isOwnedPlatform(platformCode: PlatformPresenceRecord["platformCode"]) {
  const normalizedCode = platformCode.toLowerCase();
  const displayName = getPlatformDisplayName(platformCode).toLowerCase();

  return (
    normalizedCode === "drts" ||
    normalizedCode === "owned" ||
    normalizedCode.startsWith("drts-") ||
    displayName.includes("drts")
  );
}

function getAvailabilityVariant(
  assessment: ReturnType<typeof assessPlatformHealth>,
): "success" | "warning" | "danger" | "default" {
  switch (assessment.statusTone) {
    case "healthy":
      return "success";
    case "warning":
      return "warning";
    case "danger":
      return "danger";
    default:
      return "default";
  }
}

function getActionByName(
  actions: ResourceActionDescriptor[],
  actionName: ShiftActionName,
) {
  return actions.find((action) => action.action === actionName) ?? null;
}

function extractShiftRecord(payload: unknown): ShiftRecord {
  if (payload && typeof payload === "object" && "shift" in payload) {
    const shift = (payload as { shift?: ShiftRecord }).shift;
    if (shift) {
      return shift;
    }
  }

  return payload as ShiftRecord;
}

function getActionDisabledReason(action: ResourceActionDescriptor | null) {
  switch (action?.disabledReasonCode) {
    case "shift_snapshot_loading":
      return "班次資料尚在載入中，請稍候再重新整理。";
    case "shift_submit_in_progress":
      return "打卡提交中，請等待本次動作完成。";
    case "odometer_invalid":
      return "請先修正里程輸入，確認為整數且不小於起始里程。";
    case "ops_review_reason_required":
      return "超過 800 km 門檻時，必須先填寫複核說明。";
    default:
      return null;
  }
}

function getCrossAppTargetLabel(link: CrossAppResourceLink) {
  switch (link.targetApp) {
    case "platform-admin":
      return "Platform Admin";
    case "ops-console":
      return "Ops Console";
    case "tenant-console":
      return "Tenant Console";
    default:
      return link.targetApp;
  }
}

function buildCrossAppHref(link: CrossAppResourceLink) {
  const baseUrl = CROSS_APP_BASE_URLS[link.targetApp];
  const url = new URL(link.route, `${baseUrl}/`);
  url.searchParams.set("resourceType", link.resourceType);
  url.searchParams.set("resourceId", link.resourceId);
  return url.toString();
}

function getRefreshLabel(metadata: UiRefreshMetadata) {
  switch (metadata.dataFreshness) {
    case "fresh":
      return "資料最新";
    case "stale":
      return "資料稍舊";
    case "degraded":
      return "同步降級";
    default:
      return "等待同步";
  }
}

function getRefreshVariant(metadata: UiRefreshMetadata) {
  switch (metadata.dataFreshness) {
    case "fresh":
      return "success" as const;
    case "stale":
      return "warning" as const;
    case "degraded":
      return "danger" as const;
    default:
      return "default" as const;
  }
}

function getEmptyStateConfig(
  state: EmptyStateEnvelope,
  actions: ResourceActionDescriptor[],
  router: ReturnType<typeof useRouter>,
  openPlatformCenter: () => void,
): InlineEmptyStateConfig {
  const refreshAction = getActionByName(actions, "refresh");

  switch (state.reason) {
    case "not_provisioned":
      return {
        reason: state.reason,
        title: "尚未完成裝置配置",
        description: "完成裝置綁定後，才能查看班次與進行上下線打卡。",
        icon: "lock-closed-outline",
        variant: "info",
        actionTitle: "前往配置裝置",
        onAction: () => router.push("/onboarding"),
      };
    case "permission_denied":
      return {
        reason: state.reason,
        title: "班次權限尚未開放",
        description: "此司機帳號目前沒有 Shift / clock in-out 權限。",
        icon: "shield-outline",
        variant: "warning",
        actionTitle: "返回工作台",
        onAction: () => router.push("/"),
      };
    case "fetch_failed":
      return {
        reason: state.reason,
        title: "班次資料暫時無法載入",
        description: state.messageCode,
        icon: "cloud-offline-outline",
        variant: "danger",
        actionTitle: refreshAction?.enabled ? "重新整理" : undefined,
      };
    case "driver_not_eligible":
      return {
        reason: state.reason,
        title: "目前不具備接單資格",
        description: "所有平台都顯示資格受限或審核中，請先回平台中心處理。",
        icon: "ban-outline",
        variant: "warning",
        actionTitle: "查看平台狀態",
        onAction: openPlatformCenter,
      };
    case "external_unavailable":
      return {
        reason: state.reason,
        title: "外部平台同步暫時不可用",
        description: state.messageCode,
        icon: "warning-outline",
        variant: "danger",
        actionTitle: "查看平台狀態",
        onAction: openPlatformCenter,
      };
    case "filtered_empty":
      return {
        reason: state.reason,
        title: "平台仍在線，但你目前未上班",
        description: state.messageCode,
        icon: "swap-horizontal-outline",
        variant: "warning",
        actionTitle: "查看平台狀態",
        onAction: openPlatformCenter,
      };
    case "no_data":
    default:
      return {
        reason: state.reason,
        title: "今天還沒有班次記錄",
        description: "準備好後直接打卡上線；這頁會建立第一筆 active shift。",
        icon: "time-outline",
        variant: "info",
      };
  }
}

function HeroField({
  label,
  value,
  subdued = false,
}: {
  label: string;
  value: string;
  subdued?: boolean;
}) {
  return (
    <View style={styles.heroField}>
      <Text style={styles.heroFieldLabel}>{label}</Text>
      <Text
        style={[
          styles.heroFieldValue,
          subdued ? styles.heroFieldValueSubdued : null,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? (
          <Text style={styles.sectionSubtitle}>{subtitle}</Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function ShiftInfoTile({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  return (
    <View
      style={[
        styles.infoTile,
        tone === "success"
          ? styles.infoTileSuccess
          : tone === "warning"
            ? styles.infoTileWarning
            : tone === "danger"
              ? styles.infoTileDanger
              : null,
      ]}
    >
      <Text style={styles.infoTileLabel}>{label}</Text>
      <Text style={styles.infoTileValue}>{value}</Text>
    </View>
  );
}

function InlineEmptyCard({
  title,
  description,
  icon,
  variant,
  actionTitle,
  onAction,
}: InlineEmptyStateConfig) {
  return (
    <View
      style={[
        styles.inlineEmptyCard,
        variant === "info"
          ? styles.inlineEmptyInfo
          : variant === "warning"
            ? styles.inlineEmptyWarning
            : variant === "danger"
              ? styles.inlineEmptyDanger
              : null,
      ]}
    >
      <View style={styles.inlineEmptyHeader}>
        <View
          style={[
            styles.inlineEmptyIconWrap,
            variant === "info"
              ? styles.inlineEmptyIconInfo
              : variant === "warning"
                ? styles.inlineEmptyIconWarning
                : variant === "danger"
                  ? styles.inlineEmptyIconDanger
                  : null,
          ]}
        >
          <Ionicons name={icon} size={18} color={Tokens.colors.textStrong} />
        </View>
        <View style={styles.inlineEmptyTextBlock}>
          <Text style={styles.inlineEmptyTitle}>{title}</Text>
          <Text style={styles.inlineEmptyDescription}>{description}</Text>
        </View>
      </View>
      {actionTitle && onAction ? (
        <ActionButton
          title={actionTitle}
          onPress={onAction}
          variant="secondary"
          style={styles.inlineEmptyAction}
        />
      ) : null}
    </View>
  );
}

export default function ShiftScreen() {
  const router = useRouter();
  const isProvisioned = isDriverIdentityProvisioned();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [shifts, setShifts] = useState<ShiftRecord[]>([]);
  const [activeShift, setActiveShift] = useState<ShiftRecord | null>(null);
  const [vehicleId, setVehicleId] = useState("");
  const [location, setLocation] = useState("");
  const [odometer, setOdometer] = useState("");
  const [reviewReason, setReviewReason] = useState("");
  const [shiftEnabled, setShiftEnabled] = useState<boolean | null>(null);
  const [screenError, setScreenError] = useState<string | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [presenceSummary, setPresenceSummary] =
    useState<PlatformPresenceSummary | null>(null);
  const [presenceError, setPresenceError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [lastSuccessfulLoadAt, setLastSuccessfulLoadAt] = useState<
    string | null
  >(null);
  const [highRiskSheetVisible, setHighRiskSheetVisible] = useState(false);

  const odometerError = getOdometerValidationMessage(odometer, activeShift);
  const parsedOdometer = odometer.trim() ? Number(odometer.trim()) : null;
  const odometerDelta =
    activeShift?.startOdometer != null && parsedOdometer != null
      ? parsedOdometer - activeShift.startOdometer
      : null;
  const overThreshold =
    odometerDelta != null && odometerDelta > MAX_SHIFT_ODOMETER_DELTA_KM;
  const requiresHighRiskReason = activeShift != null && overThreshold;
  const highRiskReasonMissing =
    requiresHighRiskReason && reviewReason.trim().length === 0;
  useEffect(() => {
    if (!activeShift) {
      return;
    }

    const timer = setInterval(() => {
      setNow(Date.now());
    }, 60_000);

    return () => clearInterval(timer);
  }, [activeShift]);

  useEffect(() => {
    if (!isProvisioned) {
      setLoading(false);
      return;
    }

    const client = getDriverClient();

    client
      .isFeatureEnabled("driver-app.shift")
      .then((enabled) => {
        setShiftEnabled(enabled);
        if (enabled) {
          void loadShiftSnapshot();
        } else {
          setLoading(false);
        }
      })
      .catch(() => {
        void loadShiftSnapshot();
      });
  }, [isProvisioned]);

  const loadShiftSnapshot = async ({
    manual = false,
  }: {
    manual?: boolean;
  } = {}) => {
    if (!isProvisioned) {
      return;
    }

    if (manual) {
      setRefreshing(true);
    }

    const client = getDriverClient();
    const driverId = getDriverId();

    try {
      const [shiftList, platformPresenceResult] = await Promise.all([
        client.listShifts(driverId),
        client
          .getPlatformPresence()
          .then((summary) => ({ summary, error: null as string | null }))
          .catch((error: unknown) => ({
            summary: null,
            error: getErrorMessage(
              error,
              "平台可接單狀態暫時無法同步，請稍後再試。",
            ),
          })),
      ]);

      const nextActiveShift =
        shiftList.find((shift) => shift.status === "active") ?? null;
      setShifts(shiftList);
      setActiveShift(nextActiveShift);
      setPresenceSummary(platformPresenceResult.summary);
      setPresenceError(platformPresenceResult.error);
      setScreenError(null);
      setNow(Date.now());
      setLastSuccessfulLoadAt(new Date().toISOString());
    } catch (error: unknown) {
      setScreenError(getErrorMessage(error, "班次資料載入失敗，請稍後再試。"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const availabilityItems = [...(presenceSummary?.presences ?? [])]
    .map((record) => {
      const adapterStatus =
        presenceSummary?.adapterStatuses?.find(
          (item) => item.platformCode === record.platformCode,
        ) ?? null;
      const assessment = assessPlatformHealth(record, adapterStatus);
      return {
        record,
        assessment,
        adapterStatus,
      };
    })
    .sort(
      (left, right) =>
        getPlatformHealthSeverity(right.assessment) -
          getPlatformHealthSeverity(left.assessment) ||
        left.record.platformCode.localeCompare(right.record.platformCode),
    );
  const readyPlatforms = availabilityItems.filter(
    (item) => item.assessment.canReceiveOrders,
  ).length;
  const onlinePlatforms = availabilityItems.filter(
    (item) => item.record.status === "online",
  ).length;
  const eligiblePlatforms = availabilityItems.filter(
    (item) => item.record.eligibility === "eligible",
  ).length;
  const allAdaptersUnavailable =
    availabilityItems.length > 0 &&
    availabilityItems.every((item) => item.adapterStatus?.status === "down");
  const latestPresenceSyncAt =
    availabilityItems
      .map((item) => item.adapterStatus?.lastSyncAt ?? item.record.updatedAt)
      .sort(
        (left, right) => new Date(right).getTime() - new Date(left).getTime(),
      )[0] ?? null;
  const refreshMetadata: UiRefreshMetadata = {
    generatedAt:
      lastSuccessfulLoadAt ??
      latestPresenceSyncAt ??
      activeShift?.updatedAt ??
      new Date(now).toISOString(),
    staleAfterMs: SHIFT_REFRESH_STALE_AFTER_MS,
    dataFreshness: screenError
      ? "degraded"
      : presenceError
        ? "degraded"
        : lastSuccessfulLoadAt == null
          ? "unknown"
          : now - new Date(lastSuccessfulLoadAt).getTime() >
              SHIFT_REFRESH_STALE_AFTER_MS
            ? "stale"
            : "fresh",
    source: "live",
  };

  const availableActions: ResourceActionDescriptor[] = [
    {
      action: "refresh",
      enabled: !loading && !submitting && !refreshing,
      disabledReasonCode: loading ? "shift_snapshot_loading" : undefined,
      riskLevel: "low",
    },
    activeShift
      ? {
          action: "clock_out",
          enabled: !submitting && !odometerError && !highRiskReasonMissing,
          disabledReasonCode: submitting
            ? "shift_submit_in_progress"
            : odometerError
              ? "odometer_invalid"
              : highRiskReasonMissing
                ? "ops_review_reason_required"
                : undefined,
          requiresReason: requiresHighRiskReason,
          riskLevel: requiresHighRiskReason ? "high" : "medium",
        }
      : {
          action: "clock_in",
          enabled: !submitting && !odometerError,
          disabledReasonCode: submitting
            ? "shift_submit_in_progress"
            : odometerError
              ? "odometer_invalid"
              : undefined,
          riskLevel: "medium",
        },
  ];

  const refreshAction = getActionByName(availableActions, "refresh");
  const primaryAction =
    getActionByName(availableActions, "clock_out") ??
    getActionByName(availableActions, "clock_in");
  const primaryActionDisabledReason =
    primaryAction && !primaryAction.enabled
      ? getActionDisabledReason(primaryAction)
      : null;
  const fullScreenEmptyState: EmptyStateEnvelope | null = !isProvisioned
    ? {
        reason: "not_provisioned",
        messageCode: "完成裝置綁定後，才能查看班次與進行上下線打卡。",
      }
    : shiftEnabled === false
      ? {
          reason: "permission_denied",
          messageCode: "此司機帳號目前沒有 Shift / clock in-out 權限。",
        }
      : screenError && !activeShift && !refreshing
        ? {
            reason: "fetch_failed",
            messageCode: screenError,
            nextAction: refreshAction ?? undefined,
          }
        : null;

  const inlineEmptyStates: EmptyStateEnvelope[] = [];
  if (!activeShift && shifts.length === 0) {
    inlineEmptyStates.push({
      reason: "no_data",
      messageCode: "today_shift_history_empty",
    });
  }
  if (!activeShift && eligiblePlatforms === 0 && availabilityItems.length > 0) {
    inlineEmptyStates.push({
      reason: "driver_not_eligible",
      messageCode: "driver_presence_not_eligible",
    });
  }
  if (
    !activeShift &&
    (allAdaptersUnavailable ||
      (presenceError && availabilityItems.length === 0))
  ) {
    inlineEmptyStates.push({
      reason: "external_unavailable",
      messageCode:
        presenceError ??
        "目前無法取得外部平台 adapter 狀態，班次仍可操作，但可接單狀態可能延遲。",
    });
  }
  const activePlatformsWhileOffShift = !activeShift && onlinePlatforms > 0;
  if (activePlatformsWhileOffShift) {
    inlineEmptyStates.push({
      reason: "filtered_empty",
      messageCode: `${onlinePlatforms} 個平台顯示在線中；請確認是否需要先上班，或到平台中心手動調整接單狀態。`,
    });
  }
  const shiftResource: ShiftScreenResource = {
    activeShift,
    shifts,
    availableActions,
    fullScreenEmptyState,
    inlineEmptyStates,
    refreshMetadata,
    platformCenterRoute: "/platform-presence",
    opsReviewLink: {
      targetApp: "ops-console",
      route: "/attendance",
      resourceType: "shift",
      resourceId: activeShift?.shiftId ?? getDriverId(),
      openMode: "new_tab",
      label: "Ops Console 出勤複核",
    },
  };
  const opsReviewDestinationLabel = getCrossAppTargetLabel(
    shiftResource.opsReviewLink,
  );
  const opsReviewHref = buildCrossAppHref(shiftResource.opsReviewLink);

  const openPlatformCenter = () => {
    router.push(shiftResource.platformCenterRoute);
  };

  const openCrossAppLink = async (link: CrossAppResourceLink) => {
    try {
      await Linking.openURL(buildCrossAppHref(link));
    } catch (error: unknown) {
      setSubmissionError(
        getErrorMessage(
          error,
          `${getCrossAppTargetLabel(link)} 連結開啟失敗，請稍後再試。`,
        ),
      );
    }
  };

  const handleClockIn = async () => {
    if (odometerError) {
      Alert.alert("輸入錯誤", odometerError);
      return;
    }

    const trimmedOdometer = odometer.trim();
    setSubmitting(true);
    setSubmissionError(null);
    const client = getDriverClient();
    const driverId = getDriverId();
    try {
      const result = await client.clockIn({
        driverId,
        vehicleId: vehicleId.trim() || undefined,
        location: location.trim() || undefined,
        odometer: trimmedOdometer ? Number(trimmedOdometer) : undefined,
      });
      const nextShift = extractShiftRecord(result);
      setShifts((current) => [
        nextShift,
        ...current.filter((shift) => shift.shiftId !== nextShift.shiftId),
      ]);
      setActiveShift(nextShift);
      setScreenError(null);
      setNow(Date.now());
      Alert.alert("已上班", "班次已建立，工作台會依 Q-DRV08 同步可接單狀態。");
      setVehicleId("");
      setLocation("");
      setOdometer("");
      setReviewReason("");
      void loadShiftSnapshot({ manual: true });
    } catch (error: unknown) {
      setSubmissionError(getErrorMessage(error, "上線打卡失敗，請稍後再試。"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleClockOut = async () => {
    if (odometerError) {
      Alert.alert("輸入錯誤", odometerError);
      return;
    }
    if (highRiskReasonMissing) {
      Alert.alert("需要確認", "高里程差異需要填寫複核說明。");
      return;
    }

    const trimmedOdometer = odometer.trim();
    setSubmitting(true);
    setSubmissionError(null);
    const client = getDriverClient();
    const driverId = getDriverId();
    try {
      const result = await client.clockOut({
        driverId,
        location: location.trim() || undefined,
        odometer: trimmedOdometer ? Number(trimmedOdometer) : undefined,
        notes: reviewReason.trim() || undefined,
      });
      const completedShift = extractShiftRecord(result);
      setShifts((current) => [
        completedShift,
        ...current.filter((shift) => shift.shiftId !== completedShift.shiftId),
      ]);
      setActiveShift(null);
      setHighRiskSheetVisible(false);
      setScreenError(null);
      Alert.alert(
        "已下班",
        requiresHighRiskReason
          ? `班次已結束，異常里程說明已隨下線資料送出，待營運於 ${opsReviewDestinationLabel} 複核。`
          : "班次已結束，平台可接單狀態會依設定自動下線。",
      );
      setLocation("");
      setOdometer("");
      setReviewReason("");
      void loadShiftSnapshot({ manual: true });
    } catch (error: unknown) {
      setSubmissionError(getErrorMessage(error, "下線打卡失敗，請稍後再試。"));
    } finally {
      setSubmitting(false);
    }
  };

  const runResourceAction = (action: ResourceActionDescriptor | null) => {
    if (!action?.enabled) {
      return;
    }

    if (action.action === "refresh") {
      void loadShiftSnapshot({ manual: true });
      return;
    }

    if (action.action === "clock_in") {
      Alert.alert(
        "確認上班",
        "開始班次後，工作台會切換成執勤中的 punch-clock 狀態。",
        [
          { text: "取消", style: "cancel" },
          {
            text: "確認上班",
            onPress: () => {
              void handleClockIn();
            },
          },
        ],
      );
      return;
    }

    if (action.action === "clock_out") {
      if (action.riskLevel === "high") {
        setHighRiskSheetVisible(true);
        return;
      }

      const confirmMessage =
        "結束班次後，平台可接單狀態會依 autoOfflineOnShiftEnd 設定同步更新。";

      Alert.alert("確認下班", confirmMessage, [
        { text: "取消", style: "cancel" },
        {
          text: "確認下班",
          style: "default",
          onPress: () => {
            void handleClockOut();
          },
        },
      ]);
    }
  };

  if (loading) {
    return (
      <AppScreen scrollable={false}>
        <PageHeader
          title={driverStrings.shift.title}
          subtitle="載入 Shift / clock in-out"
        />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Tokens.colors.primary} />
          <Text style={styles.loadingLabel}>載入班次資料中…</Text>
        </View>
      </AppScreen>
    );
  }

  if (fullScreenEmptyState) {
    const fullScreenEmptyConfig = getEmptyStateConfig(
      fullScreenEmptyState,
      shiftResource.availableActions,
      router,
      () => {
        openPlatformCenter();
      },
    );
    return (
      <AppScreen scrollable={false}>
        <PageHeader
          title={driverStrings.shift.title}
          subtitle="Shift / clock in-out"
          rightElement={
            refreshAction ? (
              <IconButton
                icon="refresh"
                onPress={() => runResourceAction(refreshAction)}
                disabled={!refreshAction.enabled}
                accessibilityLabel="重新整理班次資料"
              />
            ) : null
          }
        />
        <EmptyState
          title={fullScreenEmptyConfig.title}
          description={fullScreenEmptyConfig.description}
          icon={fullScreenEmptyConfig.icon}
          actionTitle={fullScreenEmptyConfig.actionTitle}
          onAction={
            fullScreenEmptyState.reason === "fetch_failed"
              ? () => {
                  setLoading(true);
                  void loadShiftSnapshot();
                }
              : fullScreenEmptyConfig.onAction
          }
          style={styles.fillState}
        />
      </AppScreen>
    );
  }

  const lastCompletedShift =
    shifts.find((shift) => shift.status === "completed") ?? null;
  const refreshStatusLabel = getRefreshLabel(shiftResource.refreshMetadata);

  return (
    <View style={styles.screen}>
      <AppScreen contentContainerStyle={styles.screenContent}>
        <PageHeader
          title={driverStrings.shift.title}
          subtitle="Manual refresh · punch clock · Q-DRV09"
          rightElement={
            refreshAction ? (
              <IconButton
                icon="refresh"
                onPress={() => runResourceAction(refreshAction)}
                disabled={!refreshAction.enabled}
                accessibilityLabel="重新整理班次資料"
              />
            ) : null
          }
        />

        {screenError ? (
          <ErrorBanner message={`資料同步異常：${screenError}`} />
        ) : null}
        {submissionError ? <ErrorBanner message={submissionError} /> : null}
        {refreshing ? (
          <StatusChip label="手動重新整理中" variant="brand" />
        ) : null}
        <View style={styles.refreshRow}>
          <StatusChip
            label={refreshStatusLabel}
            variant={getRefreshVariant(shiftResource.refreshMetadata)}
            dot
          />
          <Text style={styles.refreshCaption}>
            Manual refresh · 最近快照{" "}
            {formatCompactDateTime(shiftResource.refreshMetadata.generatedAt)}
          </Text>
        </View>

        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <StatusChip
              label={activeShift ? "ON DUTY" : "OFF DUTY"}
              variant={activeShift ? "success" : "default"}
              dot
              strong={Boolean(activeShift)}
            />
            <StatusChip
              label={activeShift ? "Clock-out available" : "Clock-in available"}
              variant={activeShift ? "warning" : "info"}
            />
          </View>

          <Text style={styles.heroValue}>
            {activeShift ? formatElapsedDuration(activeShift, now) : "--:--"}
          </Text>
          <Text style={styles.heroSubtitle}>
            {activeShift
              ? `自 ${formatClockLabel(activeShift.clockedInAt)} 起已執勤 ${formatElapsedSentence(activeShift, now)}`
              : "班次頁是 punch-clock anchor；開始班次後會建立 active shift，結束班次時同步 auto-offline 規則。"}
          </Text>

          <View style={styles.heroGrid}>
            <HeroField
              label="車輛"
              value={(activeShift?.vehicleId ?? vehicleId.trim()) || "尚未填寫"}
              subdued={!activeShift?.vehicleId && !vehicleId.trim()}
            />
            <HeroField
              label={activeShift ? "起始里程" : "預填里程"}
              value={
                activeShift
                  ? formatOdometer(activeShift.startOdometer)
                  : parsedOdometer != null
                    ? `${parsedOdometer.toLocaleString("zh-TW")} km`
                    : "尚未填寫"
              }
              subdued={
                activeShift
                  ? activeShift.startOdometer == null
                  : parsedOdometer == null
              }
            />
            <HeroField
              label={activeShift ? "起始位置" : "預填位置"}
              value={
                (activeShift?.startLocation ?? location.trim()) || "尚未填寫"
              }
              subdued={!activeShift?.startLocation && !location.trim()}
            />
            <HeroField
              label={activeShift ? "開始時間" : "上次下班"}
              value={
                activeShift
                  ? formatShiftDateTime(activeShift.clockedInAt)
                  : lastCompletedShift?.clockedOutAt
                    ? formatShiftDateTime(lastCompletedShift.clockedOutAt)
                    : "尚無記錄"
              }
              subdued={!activeShift && !lastCompletedShift?.clockedOutAt}
            />
            <HeroField
              label="預計下班"
              value={formatExpectedOffTime(activeShift)}
              subdued={!activeShift}
            />
            <HeroField
              label="最近同步"
              value={formatCompactDateTime(
                latestPresenceSyncAt ??
                  activeShift?.updatedAt ??
                  lastCompletedShift?.updatedAt,
              )}
              subdued={false}
            />
          </View>
        </View>

        {shiftResource.inlineEmptyStates.map((state) => (
          <InlineEmptyCard
            key={`${state.reason}-${state.messageCode}`}
            {...getEmptyStateConfig(
              state,
              shiftResource.availableActions,
              router,
              () => {
                openPlatformCenter();
              },
            )}
          />
        ))}

        <SectionCard
          title={activeShift ? "班次摘要" : "上班前設定"}
          subtitle={
            activeShift
              ? "可接單狀態與班次 guardrail 一起看，避免平台在線但實際已下班。"
              : "vehicle / location / odometer 皆為選填，但若輸入 odometer 必須符合 Q-DRV09。"
          }
        >
          <View style={styles.infoTileRow}>
            <ShiftInfoTile
              label="班次狀態"
              value={activeShift ? "執勤中" : "待上班"}
              tone={activeShift ? "success" : "default"}
            />
            <ShiftInfoTile
              label="累計工時"
              value={
                activeShift
                  ? formatElapsedSentence(activeShift, now)
                  : "尚未開始"
              }
              tone={activeShift ? "success" : "default"}
            />
            <ShiftInfoTile
              label="可接單平台"
              value={
                availabilityItems.length > 0
                  ? `${readyPlatforms} / ${availabilityItems.length}`
                  : "尚無資料"
              }
              tone={readyPlatforms > 0 ? "warning" : "default"}
            />
            <ShiftInfoTile
              label="同步狀態"
              value={refreshStatusLabel}
              tone={getRefreshVariant(shiftResource.refreshMetadata)}
            />
          </View>
        </SectionCard>

        <SectionCard
          title={activeShift ? "下班資料" : "上班資料"}
          subtitle={
            activeShift
              ? "Clock-out 屬 medium risk；若里程超過 800 km，自動升級為 high risk 複核流程。"
              : "Clock-in 屬 medium risk；確認後才會建立 active shift。"
          }
        >
          {activeShift ? (
            <View>
              <FormField
                label="目前里程表（選填）"
                value={odometer}
                onChangeText={setOdometer}
                placeholder="例如 50000"
                keyboardType="numeric"
                helpText="若輸入里程，必須為整數且不得小於起始里程。"
                error={odometerError ?? undefined}
              />

              <FormField
                label="目前位置（選填）"
                value={location}
                onChangeText={setLocation}
                placeholder="例如 台北車站接送區"
              />

              {requiresHighRiskReason ? (
                <View style={styles.reviewCard}>
                  <View style={styles.reviewHeader}>
                    <StatusChip label="High risk" variant="danger" />
                    <Text style={styles.reviewTitle}>里程差異超過複核門檻</Text>
                  </View>
                  <Text style={styles.reviewBody}>
                    本次預估差異 {odometerDelta?.toLocaleString("zh-TW")}{" "}
                    km，超過 {MAX_SHIFT_ODOMETER_DELTA_KM}{" "}
                    km。送出下班前需填寫說明，系統會一併標記待營運複核。
                  </Text>
                  <FormField
                    label="複核說明（必填）"
                    value={reviewReason}
                    onChangeText={setReviewReason}
                    placeholder="例如：跨縣市臨時加班、返場保養繞行"
                    error={
                      highRiskReasonMissing
                        ? "高里程差異必須填寫複核說明。"
                        : undefined
                    }
                  />
                </View>
              ) : null}
            </View>
          ) : (
            <View>
              <FormField
                label="車輛編號（選填）"
                value={vehicleId}
                onChangeText={setVehicleId}
                placeholder="例如 ABC-1234"
              />

              <FormField
                label="位置（選填）"
                value={location}
                onChangeText={setLocation}
                placeholder="例如 營運據點 A"
              />

              <FormField
                label="里程表（選填）"
                value={odometer}
                onChangeText={setOdometer}
                placeholder="例如 50000"
                keyboardType="numeric"
                helpText="僅接受整數數字，留白則不送出里程資料。"
                error={odometerError ?? undefined}
              />
            </View>
          )}
        </SectionCard>

        <SectionCard
          title="平台可接單狀態"
          subtitle={
            availabilityItems.length > 0
              ? `${onlinePlatforms} 個平台上線中，${readyPlatforms} 個平台目前可接單。`
              : "Shift page 只提示平台可接單 readiness；詳細操作請前往平台中心。"
          }
        >
          {presenceError ? <ErrorBanner message={presenceError} /> : null}

          {availabilityItems.length > 0 ? (
            <View style={styles.availabilityList}>
              {availabilityItems.map(
                ({ record, assessment, adapterStatus }) => (
                  <View
                    key={record.platformCode}
                    style={styles.availabilityCard}
                  >
                    <View style={styles.availabilityTopRow}>
                      <View style={styles.availabilityTitleBlock}>
                        <PlatformBadge
                          code={record.platformCode}
                          name={getPlatformDisplayName(record.platformCode)}
                          forwarded={!isOwnedPlatform(record.platformCode)}
                          size="sm"
                        />
                        <Text style={styles.availabilityTitle}>
                          {getPlatformDisplayName(record.platformCode)}
                        </Text>
                      </View>
                      <StatusChip
                        label={assessment.statusLabel}
                        variant={getAvailabilityVariant(assessment)}
                      />
                    </View>

                    <View style={styles.availabilityChipRow}>
                      <StatusChip
                        label={record.status === "online" ? "已上線" : "離線"}
                        variant={
                          record.status === "online" ? "success" : "default"
                        }
                      />
                      <StatusChip
                        label={
                          record.eligibility === "eligible"
                            ? "資格正常"
                            : record.eligibility === "pending"
                              ? "資格審核中"
                              : "資格受限"
                        }
                        variant={
                          record.eligibility === "eligible"
                            ? "success"
                            : record.eligibility === "pending"
                              ? "warning"
                              : "danger"
                        }
                      />
                      <StatusChip
                        label={
                          adapterStatus?.status === "healthy"
                            ? "轉接正常"
                            : adapterStatus?.status === "degraded"
                              ? "轉接降級"
                              : adapterStatus?.status === "down"
                                ? "轉接中斷"
                                : "尚未同步"
                        }
                        variant={
                          adapterStatus?.status === "healthy"
                            ? "success"
                            : adapterStatus?.status === "degraded"
                              ? "warning"
                              : adapterStatus?.status === "down"
                                ? "danger"
                                : "default"
                        }
                      />
                    </View>

                    <Text style={styles.availabilitySummary}>
                      {assessment.readinessLabel}
                    </Text>

                    <View style={styles.availabilityMetaRow}>
                      <Text style={styles.availabilityMetaText}>
                        最近同步{" "}
                        {formatCompactDateTime(
                          adapterStatus?.lastSyncAt ?? record.updatedAt,
                        )}
                      </Text>
                      <Text style={styles.availabilityMetaDivider}>•</Text>
                      <Text style={styles.availabilityMetaText}>
                        帳號 {record.accountId ?? "尚未綁定"}
                      </Text>
                    </View>
                  </View>
                ),
              )}
            </View>
          ) : (
            <EmptyState
              title="尚無平台可接單狀態"
              description="目前沒有可顯示的平台 presence 資料，可前往平台狀態頁確認綁定與上線狀態。"
              icon="swap-horizontal-outline"
              actionTitle="查看平台中心"
              onAction={() => {
                openPlatformCenter();
              }}
              style={styles.inlineEmptyState}
            />
          )}
        </SectionCard>

        <AuthorityBanner
          title="班次 guardrails"
          authorityLabel="visual 依 canvas，行為依 packet §5.6 / Q-DRV08 / Q-DRV09"
          description={`這頁只做 shift / attendance 呈現與操作；平台上下線仍在 app 內平台中心處理，高風險里程複核才會交接到 ${opsReviewDestinationLabel}。`}
          tone="owned"
          icon="shield-checkmark"
        />
      </AppScreen>

      <Modal
        animationType="slide"
        transparent
        visible={highRiskSheetVisible}
        onRequestClose={() => setHighRiskSheetVisible(false)}
      >
        <Pressable
          style={styles.sheetBackdrop}
          onPress={() => setHighRiskSheetVisible(false)}
        />
        <View style={styles.sheetContainer}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <StatusChip label="High risk" variant="danger" />
            <Text style={styles.sheetTitle}>高里程差異需營運複核</Text>
          </View>
          <Text style={styles.sheetBody}>
            本次班次里程差異 {odometerDelta?.toLocaleString("zh-TW")} km，
            已超過 {MAX_SHIFT_ODOMETER_DELTA_KM} km 預設門檻。確認送出後， 這筆
            clock-out 會連同複核說明交接到 {opsReviewDestinationLabel}，
            供營運追蹤處理。
          </Text>

          <View style={styles.sheetSummaryCard}>
            <Text style={styles.sheetSummaryLabel}>ops-review handoff</Text>
            <Text style={styles.sheetSummaryValue}>
              {opsReviewDestinationLabel}
            </Text>
            <Text style={styles.sheetSummaryMeta}>
              {shiftResource.opsReviewLink.route}
            </Text>
            <Text style={styles.sheetSummaryMeta} numberOfLines={1}>
              {opsReviewHref}
            </Text>
          </View>

          <View style={styles.sheetSummaryCard}>
            <Text style={styles.sheetSummaryLabel}>複核說明</Text>
            <Text style={styles.sheetSummaryReason}>{reviewReason.trim()}</Text>
          </View>

          <View style={styles.sheetActionColumn}>
            <ActionButton
              title="打開複核看板"
              onPress={() => {
                void openCrossAppLink(shiftResource.opsReviewLink);
              }}
              variant="secondary"
              icon="open-outline"
            />
            <ActionButton
              title="打開平台中心"
              onPress={() => {
                openPlatformCenter();
              }}
              variant="secondary"
              icon="open-outline"
            />
            <ActionButton
              title="送出複核並下班"
              onPress={() => {
                void handleClockOut();
              }}
              variant="danger"
              icon="checkmark-done-outline"
              loading={submitting}
            />
            <ActionButton
              title="取消"
              onPress={() => setHighRiskSheetVisible(false)}
              variant="ghost"
              disabled={submitting}
            />
          </View>
        </View>
      </Modal>

      <BottomActionBar
        notice={
          primaryActionDisabledReason ??
          (primaryAction?.action === "clock_out"
            ? primaryAction.riskLevel === "high"
              ? "高里程差異需先填寫複核說明，再送出下班。"
              : "下班後會依平台設定同步 auto-offline 狀態。"
            : "上班後才會建立 active shift，並切換工作台可接單語意。")
        }
        secondaryAction={{
          title: "前往平台中心",
          onPress: openPlatformCenter,
          variant: "secondary",
          icon: "swap-horizontal-outline",
        }}
        primaryAction={
          primaryAction
            ? {
                title:
                  primaryAction.action === "clock_out"
                    ? primaryAction.riskLevel === "high"
                      ? "送出複核並下班"
                      : driverStrings.shift.punchOut
                    : driverStrings.shift.punchIn,
                onPress: () => runResourceAction(primaryAction),
                variant:
                  primaryAction.action === "clock_out"
                    ? primaryAction.riskLevel === "high"
                      ? "danger"
                      : "secondary"
                    : "primary",
                icon:
                  primaryAction.action === "clock_out"
                    ? "log-out-outline"
                    : "log-in-outline",
                loading: submitting,
                disabled: !primaryAction.enabled,
              }
            : undefined
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Tokens.colors.appBg,
  },
  screenContent: {
    paddingBottom: Tokens.spacing.xl,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Tokens.spacing.xl,
  },
  loadingLabel: {
    marginTop: Tokens.spacing.sm,
    color: Tokens.colors.textMuted,
  },
  fillState: {
    flex: 1,
  },
  inlineEmptyState: {
    paddingVertical: Tokens.spacing.sm,
  },
  refreshRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Tokens.spacing.sm,
    flexWrap: "wrap",
  },
  refreshCaption: {
    ...Tokens.type.small,
    color: Tokens.colors.textDim,
  },
  heroCard: {
    backgroundColor: Tokens.colors.surface,
    borderRadius: Tokens.radius.xl,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    padding: Tokens.spacing.xl,
    gap: Tokens.spacing.sm,
    ...Tokens.shadows.md,
  },
  heroTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: Tokens.spacing.sm,
    flexWrap: "wrap",
  },
  heroValue: {
    fontSize: 36,
    lineHeight: 40,
    fontWeight: "700",
    color: Tokens.colors.textStrong,
    letterSpacing: -1.2,
    fontFamily: Tokens.fonts.mono,
  },
  heroSubtitle: {
    ...Tokens.type.small,
    color: Tokens.colors.textMuted,
  },
  heroGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Tokens.spacing.md,
    paddingTop: Tokens.spacing.md,
    marginTop: Tokens.spacing.xs,
    borderTopWidth: 1,
    borderTopColor: Tokens.colors.border,
  },
  heroField: {
    width: "47%",
    gap: 2,
  },
  heroFieldLabel: {
    ...Tokens.type.micro,
    color: Tokens.colors.textMuted,
  },
  heroFieldValue: {
    ...Tokens.type.bodyStrong,
    color: Tokens.colors.textStrong,
  },
  heroFieldValueSubdued: {
    color: Tokens.colors.textDim,
  },
  sectionCard: {
    backgroundColor: Tokens.colors.bgRaised,
    borderRadius: Tokens.radius.xl,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    padding: Tokens.spacing.lg,
    gap: Tokens.spacing.md,
  },
  sectionHeader: {
    gap: 2,
  },
  sectionTitle: {
    ...Tokens.type.sectionTitle,
    color: Tokens.colors.textStrong,
  },
  sectionSubtitle: {
    ...Tokens.type.small,
    color: Tokens.colors.textMuted,
  },
  infoTileRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Tokens.spacing.sm,
  },
  infoTile: {
    width: "47%",
    minHeight: 90,
    backgroundColor: Tokens.colors.surfaceLo,
    borderRadius: Tokens.radius.lg,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    padding: Tokens.spacing.md,
    justifyContent: "space-between",
  },
  infoTileLabel: {
    ...Tokens.type.micro,
    color: Tokens.colors.textMuted,
  },
  infoTileValue: {
    ...Tokens.type.title,
    color: Tokens.colors.textStrong,
  },
  infoTileSuccess: {
    backgroundColor: Tokens.colors.successBg,
    borderColor: `${Tokens.colors.success}22`,
  },
  infoTileWarning: {
    backgroundColor: Tokens.colors.warningBg,
    borderColor: `${Tokens.colors.warning}22`,
  },
  infoTileDanger: {
    backgroundColor: Tokens.colors.dangerBg,
    borderColor: `${Tokens.colors.danger}22`,
  },
  inlineEmptyCard: {
    backgroundColor: Tokens.colors.bgRaised,
    borderRadius: Tokens.radius.xl,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    padding: Tokens.spacing.lg,
    gap: Tokens.spacing.md,
  },
  inlineEmptyInfo: {
    backgroundColor: Tokens.colors.infoBg,
    borderColor: `${Tokens.colors.info}33`,
  },
  inlineEmptyWarning: {
    backgroundColor: Tokens.colors.warningBg,
    borderColor: `${Tokens.colors.warning}33`,
  },
  inlineEmptyDanger: {
    backgroundColor: Tokens.colors.dangerBg,
    borderColor: `${Tokens.colors.danger}33`,
  },
  inlineEmptyHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Tokens.spacing.md,
  },
  inlineEmptyIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Tokens.colors.surface,
  },
  inlineEmptyIconInfo: {
    backgroundColor: `${Tokens.colors.info}20`,
  },
  inlineEmptyIconWarning: {
    backgroundColor: `${Tokens.colors.warning}20`,
  },
  inlineEmptyIconDanger: {
    backgroundColor: `${Tokens.colors.danger}20`,
  },
  inlineEmptyTextBlock: {
    flex: 1,
    gap: 4,
  },
  inlineEmptyTitle: {
    ...Tokens.type.bodyStrong,
    color: Tokens.colors.textStrong,
  },
  inlineEmptyDescription: {
    ...Tokens.type.small,
    color: Tokens.colors.textMuted,
  },
  inlineEmptyAction: {
    alignSelf: "flex-start",
  },
  reviewCard: {
    backgroundColor: Tokens.colors.dangerBg,
    borderRadius: Tokens.radius.lg,
    borderWidth: 1,
    borderColor: `${Tokens.colors.danger}44`,
    padding: Tokens.spacing.md,
    gap: Tokens.spacing.sm,
  },
  reviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Tokens.spacing.sm,
  },
  reviewTitle: {
    ...Tokens.type.bodyStrong,
    color: Tokens.colors.textStrong,
    flex: 1,
  },
  reviewBody: {
    ...Tokens.type.small,
    color: Tokens.colors.textMuted,
  },
  availabilityList: {
    gap: Tokens.spacing.sm,
  },
  availabilityCard: {
    backgroundColor: Tokens.colors.surface,
    borderRadius: Tokens.radius.lg,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    padding: Tokens.spacing.md,
    gap: Tokens.spacing.sm,
  },
  availabilityTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: Tokens.spacing.sm,
  },
  availabilityTitleBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: Tokens.spacing.sm,
    flex: 1,
  },
  availabilityTitle: {
    ...Tokens.type.bodyStrong,
    color: Tokens.colors.textStrong,
    flexShrink: 1,
  },
  availabilityChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Tokens.spacing.xs,
  },
  availabilitySummary: {
    ...Tokens.type.small,
    color: Tokens.colors.textMuted,
  },
  availabilityMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: Tokens.spacing.xs,
  },
  availabilityMetaText: {
    ...Tokens.type.micro,
    color: Tokens.colors.textDim,
  },
  availabilityMetaDivider: {
    ...Tokens.type.micro,
    color: Tokens.colors.textDim,
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.48)",
  },
  sheetContainer: {
    backgroundColor: Tokens.colors.bgRaised,
    borderTopLeftRadius: Tokens.radius.xl,
    borderTopRightRadius: Tokens.radius.xl,
    padding: Tokens.spacing.lg,
    gap: Tokens.spacing.md,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: Tokens.colors.border,
  },
  sheetHandle: {
    width: 48,
    height: 5,
    borderRadius: Tokens.radius.full,
    backgroundColor: Tokens.colors.borderStrong,
    alignSelf: "center",
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Tokens.spacing.sm,
  },
  sheetTitle: {
    ...Tokens.type.title,
    color: Tokens.colors.textStrong,
    flex: 1,
  },
  sheetBody: {
    ...Tokens.type.body,
    color: Tokens.colors.textMuted,
  },
  sheetSummaryCard: {
    backgroundColor: Tokens.colors.surfaceLo,
    borderRadius: Tokens.radius.lg,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    padding: Tokens.spacing.md,
    gap: Tokens.spacing.xs,
  },
  sheetSummaryLabel: {
    ...Tokens.type.micro,
    color: Tokens.colors.textMuted,
  },
  sheetSummaryValue: {
    ...Tokens.type.bodyStrong,
    color: Tokens.colors.textStrong,
  },
  sheetSummaryMeta: {
    ...Tokens.type.small,
    color: Tokens.colors.textDim,
  },
  sheetSummaryReason: {
    ...Tokens.type.body,
    color: Tokens.colors.textStrong,
  },
  sheetActionColumn: {
    gap: Tokens.spacing.sm,
  },
});
