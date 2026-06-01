import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  type CrossAppResourceLink,
  type EmptyStateEnvelope,
  type EmptyReason,
  PLATFORM_CODE_REGISTRY,
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
  Banner,
  Btn,
  Card,
  DL,
  Field,
  KPI,
  PageHeader,
  Pill,
  Shell,
  driverCanvasTheme,
} from "@/components/canvas-primitives";
import {
  getDriverClient,
  getDriverId,
  isDriverIdentityProvisioned,
} from "@/lib/api-client";
import { driverStrings } from "@/lib/strings";

const THEME = driverCanvasTheme;
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
  tone: "info" | "warn" | "danger";
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
    return "等待上班";
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

function getAvailabilityTone(
  assessment: ReturnType<typeof assessPlatformHealth>,
): "success" | "warn" | "danger" | "neutral" {
  switch (assessment.statusTone) {
    case "healthy":
      return "success";
    case "warning":
      return "warn";
    case "danger":
      return "danger";
    default:
      return "neutral";
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

function getRefreshTone(metadata: UiRefreshMetadata) {
  switch (metadata.dataFreshness) {
    case "fresh":
      return "success" as const;
    case "stale":
      return "warn" as const;
    case "degraded":
      return "danger" as const;
    default:
      return "neutral" as const;
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
        tone: "info",
        actionTitle: "前往配置裝置",
        onAction: () => router.push("/onboarding"),
      };
    case "permission_denied":
      return {
        reason: state.reason,
        title: "班次權限尚未開放",
        description: "此司機帳號目前沒有 Shift / clock in-out 權限。",
        icon: "shield-outline",
        tone: "warn",
        actionTitle: "返回工作台",
        onAction: () => router.push("/"),
      };
    case "fetch_failed":
      return {
        reason: state.reason,
        title: "班次資料暫時無法載入",
        description: state.messageCode,
        icon: "cloud-offline-outline",
        tone: "danger",
        actionTitle: refreshAction?.enabled ? "重新整理" : undefined,
      };
    case "driver_not_eligible":
      return {
        reason: state.reason,
        title: "目前不具備接單資格",
        description: "所有平台都顯示資格受限或審核中，請先回平台中心處理。",
        icon: "ban-outline",
        tone: "warn",
        actionTitle: "查看平台狀態",
        onAction: openPlatformCenter,
      };
    case "external_unavailable":
      return {
        reason: state.reason,
        title: "外部平台同步暫時不可用",
        description: state.messageCode,
        icon: "warning-outline",
        tone: "danger",
        actionTitle: "查看平台狀態",
        onAction: openPlatformCenter,
      };
    case "filtered_empty":
      return {
        reason: state.reason,
        title: "平台仍在線，但你目前未上班",
        description: state.messageCode,
        icon: "swap-horizontal-outline",
        tone: "warn",
        actionTitle: "查看平台狀態",
        onAction: openPlatformCenter,
      };
    case "no_data":
    default:
      return {
        reason: state.reason,
        title: "今天還沒有班次記錄",
        description: "準備好後直接打卡上班；這頁會建立第一筆 active shift。",
        icon: "time-outline",
        tone: "info",
      };
  }
}

function ShiftTextInput({
  label,
  value,
  onChangeText,
  placeholder,
  hint,
  error,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  hint?: string;
  error?: string;
  keyboardType?: React.ComponentProps<typeof TextInput>["keyboardType"];
}) {
  return (
    <Field
      theme={THEME}
      label={label}
      hint={error ?? hint}
      required={Boolean(error)}
    >
      <View
        style={[
          styles.inputWrap,
          error
            ? {
                borderColor: THEME.dangerBorder,
                backgroundColor: THEME.dangerBg,
              }
            : null,
        ]}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={THEME.textDim}
          selectionColor={THEME.accent}
          keyboardType={keyboardType}
          autoCorrect={false}
          autoCapitalize="sentences"
          style={styles.input}
        />
      </View>
    </Field>
  );
}

function StateBanner({
  title,
  description,
  icon,
  tone,
  actionTitle,
  onAction,
}: InlineEmptyStateConfig) {
  return (
    <Banner
      theme={THEME}
      tone={tone}
      icon={<Ionicons name={icon} size={16} color={THEME.text} />}
      title={title}
      body={description}
      actions={
        actionTitle && onAction ? (
          <Btn theme={THEME} size="xs" variant="secondary" onPress={onAction}>
            {actionTitle}
          </Btn>
        ) : undefined
      }
    />
  );
}

function FullScreenState({ config }: { config: InlineEmptyStateConfig }) {
  return (
    <View style={styles.fullStateWrap}>
      <View
        style={[
          styles.fullStateIcon,
          {
            backgroundColor:
              config.tone === "danger"
                ? THEME.dangerBg
                : config.tone === "warn"
                  ? THEME.warnBg
                  : THEME.infoBg,
            borderColor:
              config.tone === "danger"
                ? THEME.dangerBorder
                : config.tone === "warn"
                  ? THEME.warnBorder
                  : THEME.infoBorder,
          },
        ]}
      >
        <Ionicons name={config.icon} size={28} color={THEME.text} />
      </View>
      <Text style={styles.fullStateTitle}>{config.title}</Text>
      <Text style={styles.fullStateDescription}>{config.description}</Text>
      {config.actionTitle && config.onAction ? (
        <Btn
          theme={THEME}
          variant="primary"
          size="md"
          onPress={config.onAction}
        >
          {config.actionTitle}
        </Btn>
      ) : null}
    </View>
  );
}

function PlatformAvailabilityRow({
  record,
  assessment,
  adapterStatus,
}: {
  record: PlatformPresenceRecord;
  assessment: ReturnType<typeof assessPlatformHealth>;
  adapterStatus:
    | NonNullable<PlatformPresenceSummary["adapterStatuses"]>[number]
    | null;
}) {
  const tone = getAvailabilityTone(assessment);
  const markBg =
    tone === "success"
      ? THEME.success
      : tone === "warn"
        ? THEME.warn
        : tone === "danger"
          ? THEME.danger
          : THEME.textDim;

  return (
    <View style={styles.availabilityRow}>
      <View style={[styles.availabilityMark, { backgroundColor: markBg }]} />
      <View style={styles.availabilityCopy}>
        <View style={styles.availabilityTitleRow}>
          <Text style={styles.availabilityTitle}>
            {getPlatformDisplayName(record.platformCode)}
          </Text>
          <Pill theme={THEME} tone={tone} dot>
            {assessment.statusLabel}
          </Pill>
        </View>
        <Text style={styles.availabilityBody}>{assessment.readinessLabel}</Text>
        <Text style={styles.availabilityMeta}>
          {isOwnedPlatform(record.platformCode) ? "自營派單" : "外部平台"} ·{" "}
          {record.status === "online" ? "已上線" : "離線"} ·{" "}
          {record.eligibility === "eligible"
            ? "資格正常"
            : record.eligibility === "pending"
              ? "資格審核中"
              : "資格受限"}
        </Text>
        <Text style={styles.availabilityMeta}>
          最近同步{" "}
          {formatCompactDateTime(adapterStatus?.lastSyncAt ?? record.updatedAt)}
          {" · "}帳號 {record.accountId ?? "尚未綁定"}
        </Text>
      </View>
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

      Alert.alert(
        "確認下班",
        "結束班次後，平台可接單狀態會依 autoOfflineOnShiftEnd 設定同步更新。",
        [
          { text: "取消", style: "cancel" },
          {
            text: "確認下班",
            onPress: () => {
              void handleClockOut();
            },
          },
        ],
      );
    }
  };

  const lastCompletedShift =
    shifts.find((shift) => shift.status === "completed") ?? null;
  const refreshStatusLabel = getRefreshLabel(shiftResource.refreshMetadata);
  const refreshTone = getRefreshTone(shiftResource.refreshMetadata);
  const refreshCaption = `refresh tier: Manual · 最近快照 ${formatCompactDateTime(
    shiftResource.refreshMetadata.generatedAt,
  )}`;

  const footer = (
    <View style={styles.footer}>
      <Text style={styles.footerNotice}>
        {primaryActionDisabledReason ??
          (primaryAction?.action === "clock_out"
            ? primaryAction.riskLevel === "high"
              ? "高里程差異需先填寫複核說明，再送出下班。"
              : "下班後會依平台設定同步 auto-offline 狀態。"
            : "上班後才會建立 active shift，並切換工作台可接單語意。")}
      </Text>
      <View style={styles.footerActions}>
        <Btn
          theme={THEME}
          variant="secondary"
          size="md"
          onPress={openPlatformCenter}
        >
          平台中心
        </Btn>
        {primaryAction ? (
          <Btn
            theme={THEME}
            variant={
              primaryAction.action === "clock_in" ? "primary" : "secondary"
            }
            size="md"
            danger={primaryAction.action === "clock_out"}
            disabled={!primaryAction.enabled}
            onPress={() => runResourceAction(primaryAction)}
          >
            {primaryAction.action === "clock_out"
              ? primaryAction.riskLevel === "high"
                ? "送出複核並下班"
                : driverStrings.shift.punchOut
              : driverStrings.shift.punchIn}
          </Btn>
        ) : null}
      </View>
    </View>
  );

  if (loading) {
    return (
      <Shell theme={THEME} footer={footer} contentContainerStyle={styles.shell}>
        <PageHeader
          theme={THEME}
          title={driverStrings.shift.title}
          subtitle="Shift / clock in-out · loading"
        />
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={THEME.accent} />
          <Text style={styles.loadingLabel}>載入班次資料中…</Text>
        </View>
      </Shell>
    );
  }

  if (fullScreenEmptyState) {
    const fullScreenEmptyConfig = getEmptyStateConfig(
      fullScreenEmptyState,
      shiftResource.availableActions,
      router,
      openPlatformCenter,
    );

    return (
      <Shell theme={THEME} footer={footer} contentContainerStyle={styles.shell}>
        <PageHeader
          theme={THEME}
          title={driverStrings.shift.title}
          subtitle="Shift / clock in-out"
          actions={
            refreshAction ? (
              <Btn
                theme={THEME}
                size="xs"
                variant="secondary"
                disabled={!refreshAction.enabled}
                onPress={() => runResourceAction(refreshAction)}
              >
                Refresh
              </Btn>
            ) : undefined
          }
        />
        <FullScreenState
          config={{
            ...fullScreenEmptyConfig,
            onAction:
              fullScreenEmptyState.reason === "fetch_failed"
                ? () => {
                    setLoading(true);
                    void loadShiftSnapshot();
                  }
                : fullScreenEmptyConfig.onAction,
          }}
        />
      </Shell>
    );
  }

  return (
    <View style={styles.screen}>
      <Shell theme={THEME} footer={footer} contentContainerStyle={styles.shell}>
        <PageHeader
          theme={THEME}
          title="班次 · shift"
          subtitle="manual refresh · punch clock · Q-DRV09"
          actions={
            <View style={styles.headerActions}>
              <Pill theme={THEME} tone={refreshTone} dot>
                {refreshStatusLabel}
              </Pill>
              {refreshAction ? (
                <Btn
                  theme={THEME}
                  size="xs"
                  variant="secondary"
                  disabled={!refreshAction.enabled}
                  onPress={() => runResourceAction(refreshAction)}
                >
                  Refresh
                </Btn>
              ) : null}
            </View>
          }
        />

        {screenError ? (
          <StateBanner
            reason="fetch_failed"
            title="資料同步異常"
            description={screenError}
            icon="cloud-offline-outline"
            tone="danger"
          />
        ) : null}
        {submissionError ? (
          <StateBanner
            reason="fetch_failed"
            title="動作送出失敗"
            description={submissionError}
            icon="alert-circle-outline"
            tone="danger"
          />
        ) : null}
        {refreshing ? (
          <StateBanner
            reason="no_data"
            title="手動重新整理中"
            description="正在取得最新班次快照與平台可接單狀態。"
            icon="sync-outline"
            tone="info"
          />
        ) : null}

        <Card theme={THEME} padding={18}>
          <View style={styles.heroStatusRow}>
            <Pill theme={THEME} tone={activeShift ? "success" : "neutral"} dot>
              {activeShift ? "上班中 · on_shift" : "下班 · off_shift"}
            </Pill>
            <Pill theme={THEME} tone={activeShift ? "warn" : "info"}>
              {activeShift ? "clock_out available" : "clock_in available"}
            </Pill>
          </View>

          <Text style={styles.heroTime}>
            {activeShift ? formatElapsedDuration(activeShift, now) : "--:--"}
          </Text>
          <Text style={styles.heroSubtitle}>
            {activeShift
              ? `已工作 ${formatElapsedSentence(activeShift, now)} · 自 ${formatClockLabel(
                  activeShift.clockedInAt,
                )} 起`
              : "班次頁是 punch-clock anchor；開始班次後會建立 active shift，結束班次時同步 auto-offline 規則。"}
          </Text>

          <View style={styles.heroDivider} />

          <DL
            theme={THEME}
            cols={2}
            items={[
              {
                label: "車輛 · vehicle",
                value:
                  (activeShift?.vehicleId ?? vehicleId.trim()) || "尚未填寫",
              },
              {
                label: activeShift
                  ? "起始里程 · odo_start"
                  : "預填里程 · odometer",
                value: activeShift
                  ? formatOdometer(activeShift.startOdometer)
                  : parsedOdometer != null
                    ? `${parsedOdometer.toLocaleString("zh-TW")} km`
                    : "尚未填寫",
                mono: true,
              },
              {
                label: activeShift
                  ? "起始位置 · start_location"
                  : "預填位置 · location",
                value:
                  (activeShift?.startLocation ?? location.trim()) || "尚未填寫",
              },
              {
                label: "預計下班 · planned_end",
                value: formatExpectedOffTime(activeShift),
                mono: true,
              },
            ]}
          />
        </Card>

        <View style={styles.kpiRow}>
          <KPI
            theme={THEME}
            label="班次數 · today_shifts"
            value={String(shifts.length)}
            sub={activeShift ? "含 active shift" : "今日歷程"}
          />
          <KPI
            theme={THEME}
            label="可接單 · readiness"
            value={`${readyPlatforms} / ${availabilityItems.length || 0}`}
            sub="multi-platform"
          />
          <KPI
            theme={THEME}
            label="在線平台 · online"
            value={String(onlinePlatforms)}
            sub="presence"
          />
        </View>

        <Banner
          theme={THEME}
          tone="info"
          icon={
            <Ionicons
              name="information-circle-outline"
              size={16}
              color={THEME.text}
            />
          }
          title="下班會發生什麼"
          body="下班後 DRTS 自營派單立即停止；外部平台依各平台 autoOfflineOnShiftEnd 設定決定是否同步下線。"
        />

        {shiftResource.inlineEmptyStates.map((state) => (
          <StateBanner
            key={`${state.reason}-${state.messageCode}`}
            {...getEmptyStateConfig(
              state,
              shiftResource.availableActions,
              router,
              openPlatformCenter,
            )}
          />
        ))}

        <Card
          theme={THEME}
          title={activeShift ? "下班資料 · clock_out" : "上班資料 · clock_in"}
          subtitle={
            activeShift
              ? "Clock-out 屬 medium risk；若里程超過 800 km，自動升級為 high risk 複核流程。"
              : "Vehicle / location / odometer 皆為選填，但 odometer 若輸入必須符合 Q-DRV09。"
          }
        >
          <View style={styles.formColumn}>
            {!activeShift ? (
              <>
                <ShiftTextInput
                  label="車輛編號"
                  value={vehicleId}
                  onChangeText={setVehicleId}
                  placeholder="例如 ARJ-3120"
                />
                <ShiftTextInput
                  label="位置"
                  value={location}
                  onChangeText={setLocation}
                  placeholder="例如 營運據點 A"
                />
                <ShiftTextInput
                  label="里程表"
                  value={odometer}
                  onChangeText={setOdometer}
                  placeholder="例如 50000"
                  hint="僅接受整數數字，留白則不送出里程資料。"
                  error={odometerError ?? undefined}
                  keyboardType="numeric"
                />
              </>
            ) : (
              <>
                <ShiftTextInput
                  label="目前里程表"
                  value={odometer}
                  onChangeText={setOdometer}
                  placeholder="例如 85142"
                  hint="若輸入里程，必須為整數且不得小於起始里程。"
                  error={odometerError ?? undefined}
                  keyboardType="numeric"
                />
                <ShiftTextInput
                  label="目前位置"
                  value={location}
                  onChangeText={setLocation}
                  placeholder="例如 台北車站接送區"
                />
                {requiresHighRiskReason ? (
                  <Card theme={THEME} padding={14} style={styles.reviewCard}>
                    <View style={styles.reviewHeader}>
                      <Pill theme={THEME} tone="danger">
                        High risk
                      </Pill>
                      <Text style={styles.reviewTitle}>
                        里程差異超過複核門檻
                      </Text>
                    </View>
                    <Text style={styles.reviewBody}>
                      本次預估差異 {odometerDelta?.toLocaleString("zh-TW")} km，
                      超過 {MAX_SHIFT_ODOMETER_DELTA_KM}{" "}
                      km。送出下班前需填寫說明， 系統會一併標記待營運複核。
                    </Text>
                    <ShiftTextInput
                      label="複核說明"
                      value={reviewReason}
                      onChangeText={setReviewReason}
                      placeholder="例如：跨縣市臨時加班、返場保養繞行"
                      error={
                        highRiskReasonMissing
                          ? "高里程差異必須填寫複核說明。"
                          : undefined
                      }
                    />
                  </Card>
                ) : null}
              </>
            )}
          </View>
        </Card>

        <Card
          theme={THEME}
          title="里程與班次預覽"
          subtitle="odometer · max_delta_check"
        >
          {activeShift ? (
            <View style={styles.previewGrid}>
              <View style={styles.previewTile}>
                <Text style={styles.previewLabel}>當前里程 · odo_end</Text>
                <Text style={styles.previewValue}>
                  {parsedOdometer != null
                    ? `${parsedOdometer.toLocaleString("zh-TW")} km`
                    : "未輸入"}
                </Text>
              </View>
              <View style={styles.previewTile}>
                <Text style={styles.previewLabel}>本班差異 · delta</Text>
                <Text style={styles.previewValue}>
                  {odometerDelta != null
                    ? `${odometerDelta.toLocaleString("zh-TW")} km`
                    : "待計算"}
                </Text>
              </View>
            </View>
          ) : (
            <Text style={styles.mutedBody}>
              上班前可先填寫里程；若留白，系統不會送出 odometer 欄位。
            </Text>
          )}
          {activeShift ? (
            <Text
              style={[
                styles.thresholdNote,
                requiresHighRiskReason ? styles.thresholdDanger : null,
              ]}
            >
              {requiresHighRiskReason
                ? `超過 ${MAX_SHIFT_ODOMETER_DELTA_KM} km 預設上限 · 需確認並送 ops 複核 (Q-DRV09)`
                : `若本班差異超過 ${MAX_SHIFT_ODOMETER_DELTA_KM} km，clock-out 會升級為 high risk。`}
            </Text>
          ) : null}
        </Card>

        <Card theme={THEME} title="多平台可用性" subtitle={refreshCaption}>
          <View style={styles.summaryPills}>
            <Pill
              theme={THEME}
              tone={readyPlatforms > 0 ? "success" : "neutral"}
            >
              自營/外部可接單 {readyPlatforms}
            </Pill>
            <Pill theme={THEME} tone={onlinePlatforms > 0 ? "warn" : "neutral"}>
              在線 {onlinePlatforms}
            </Pill>
            <Pill theme={THEME} tone={presenceError ? "danger" : "info"}>
              eligible {eligiblePlatforms}
            </Pill>
          </View>
          {presenceError ? (
            <StateBanner
              reason="external_unavailable"
              title="平台同步異常"
              description={presenceError}
              icon="warning-outline"
              tone="danger"
            />
          ) : null}
          {availabilityItems.length > 0 ? (
            <View style={styles.availabilityList}>
              {availabilityItems.map(
                ({ record, assessment, adapterStatus }) => (
                  <PlatformAvailabilityRow
                    key={record.platformCode}
                    record={record}
                    assessment={assessment}
                    adapterStatus={adapterStatus}
                  />
                ),
              )}
            </View>
          ) : (
            <StateBanner
              reason="no_data"
              title="尚無平台可接單狀態"
              description="目前沒有可顯示的平台 presence 資料，可前往平台狀態頁確認綁定與上線狀態。"
              icon="swap-horizontal-outline"
              tone="info"
              actionTitle="查看平台中心"
              onAction={openPlatformCenter}
            />
          )}
        </Card>

        <Card
          theme={THEME}
          title="Shift guardrails"
          subtitle="visual 依 canvas，行為依 packet §5.6 / Q-DRV08 / Q-DRV09"
        >
          <Text style={styles.mutedBody}>
            這頁只做 shift / attendance 呈現與操作；平台上下線仍在 app
            內平台中心處理， 高風險里程複核才會交接到{" "}
            {opsReviewDestinationLabel}。
          </Text>
          <Text style={styles.guardrailMeta}>
            last completed shift ·{" "}
            {lastCompletedShift?.clockedOutAt
              ? formatShiftDateTime(lastCompletedShift.clockedOutAt)
              : "尚無記錄"}
          </Text>
        </Card>
      </Shell>

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
            <Pill theme={THEME} tone="danger">
              High risk
            </Pill>
            <Text style={styles.sheetTitle}>高里程差異需營運複核</Text>
          </View>
          <Text style={styles.sheetBody}>
            本次班次里程差異 {odometerDelta?.toLocaleString("zh-TW")} km，
            已超過 {MAX_SHIFT_ODOMETER_DELTA_KM} km 預設門檻。確認送出後，這筆
            clock-out 會連同複核說明交接到 {opsReviewDestinationLabel}，
            供營運追蹤處理。
          </Text>

          <Card theme={THEME} padding={14}>
            <Text style={styles.sheetMetaLabel}>ops-review handoff</Text>
            <Text style={styles.sheetMetaValue}>
              {opsReviewDestinationLabel}
            </Text>
            <Text style={styles.sheetMetaPath}>
              {shiftResource.opsReviewLink.route}
            </Text>
            <Text style={styles.sheetMetaPath} numberOfLines={1}>
              {opsReviewHref}
            </Text>
          </Card>

          <Card theme={THEME} padding={14}>
            <Text style={styles.sheetMetaLabel}>複核說明</Text>
            <Text style={styles.sheetMetaReason}>
              {reviewReason.trim() || "尚未填寫"}
            </Text>
          </Card>

          <View style={styles.sheetActions}>
            <Btn
              theme={THEME}
              size="md"
              variant="secondary"
              onPress={() => {
                void openCrossAppLink(shiftResource.opsReviewLink);
              }}
            >
              打開複核看板
            </Btn>
            <Btn
              theme={THEME}
              size="md"
              variant="secondary"
              onPress={openPlatformCenter}
            >
              打開平台中心
            </Btn>
            <Btn
              theme={THEME}
              size="md"
              danger
              disabled={submitting}
              onPress={() => {
                void handleClockOut();
              }}
            >
              送出複核並下班
            </Btn>
            <Btn
              theme={THEME}
              size="md"
              variant="ghost"
              disabled={submitting}
              onPress={() => setHighRiskSheetVisible(false)}
            >
              取消
            </Btn>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F0EEE9",
  },
  shell: {
    paddingBottom: 28,
  },
  headerActions: {
    alignItems: "flex-end",
    gap: 8,
  },
  loadingWrap: {
    flex: 1,
    minHeight: 360,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingLabel: {
    color: THEME.textMuted,
    fontFamily: THEME.fontFamily,
    fontSize: 13,
  },
  fullStateWrap: {
    minHeight: 420,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    paddingHorizontal: 18,
  },
  fullStateIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  fullStateTitle: {
    color: THEME.text,
    fontFamily: THEME.fontFamily,
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  fullStateDescription: {
    color: THEME.textMuted,
    fontFamily: THEME.fontFamily,
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    maxWidth: 280,
  },
  heroStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    flexWrap: "wrap",
  },
  heroTime: {
    marginTop: 8,
    color: THEME.text,
    fontFamily: THEME.monoFamily,
    fontSize: 32,
    lineHeight: 36,
    fontWeight: "700",
    letterSpacing: -1,
  },
  heroSubtitle: {
    marginTop: 4,
    color: THEME.textMuted,
    fontFamily: THEME.fontFamily,
    fontSize: 12,
    lineHeight: 18,
  },
  heroDivider: {
    marginTop: 14,
    marginBottom: 14,
    height: 1,
    backgroundColor: THEME.border,
  },
  kpiRow: {
    flexDirection: "row",
    gap: 10,
  },
  formColumn: {
    gap: 12,
  },
  inputWrap: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: THEME.border,
    backgroundColor: THEME.bgRaised,
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  input: {
    color: THEME.text,
    fontFamily: THEME.fontFamily,
    fontSize: 13,
    paddingVertical: 10,
  },
  reviewCard: {
    backgroundColor: THEME.dangerBg,
    borderColor: THEME.dangerBorder,
  },
  reviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  reviewTitle: {
    flex: 1,
    color: THEME.text,
    fontFamily: THEME.fontFamily,
    fontSize: 13,
    fontWeight: "700",
  },
  reviewBody: {
    marginBottom: 12,
    color: THEME.textMuted,
    fontFamily: THEME.fontFamily,
    fontSize: 12,
    lineHeight: 18,
  },
  previewGrid: {
    flexDirection: "row",
    gap: 10,
  },
  previewTile: {
    flex: 1,
    backgroundColor: THEME.bgRaised,
    borderColor: THEME.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    gap: 4,
  },
  previewLabel: {
    color: THEME.textMuted,
    fontFamily: THEME.fontFamily,
    fontSize: 10.5,
    lineHeight: 14,
  },
  previewValue: {
    color: THEME.text,
    fontFamily: THEME.monoFamily,
    fontSize: 16,
    fontWeight: "700",
  },
  mutedBody: {
    color: THEME.textMuted,
    fontFamily: THEME.fontFamily,
    fontSize: 12.5,
    lineHeight: 18,
  },
  thresholdNote: {
    marginTop: 10,
    color: THEME.warn,
    fontFamily: THEME.fontFamily,
    fontSize: 11.5,
    lineHeight: 17,
  },
  thresholdDanger: {
    color: THEME.danger,
  },
  summaryPills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  availabilityList: {
    gap: 10,
  },
  availabilityRow: {
    flexDirection: "row",
    gap: 10,
    paddingVertical: 2,
  },
  availabilityMark: {
    width: 8,
    borderRadius: 4,
  },
  availabilityCopy: {
    flex: 1,
    gap: 4,
  },
  availabilityTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  availabilityTitle: {
    flex: 1,
    color: THEME.text,
    fontFamily: THEME.fontFamily,
    fontSize: 13,
    fontWeight: "700",
  },
  availabilityBody: {
    color: THEME.textMuted,
    fontFamily: THEME.fontFamily,
    fontSize: 12,
    lineHeight: 17,
  },
  availabilityMeta: {
    color: THEME.textDim,
    fontFamily: THEME.fontFamily,
    fontSize: 11,
    lineHeight: 16,
  },
  guardrailMeta: {
    marginTop: 10,
    color: THEME.textDim,
    fontFamily: THEME.monoFamily,
    fontSize: 11,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: THEME.border,
    backgroundColor: THEME.bgRaised,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 16,
    gap: 10,
  },
  footerNotice: {
    color: THEME.textMuted,
    fontFamily: THEME.fontFamily,
    fontSize: 11.5,
    lineHeight: 17,
  },
  footerActions: {
    flexDirection: "row",
    gap: 10,
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: "rgba(5, 10, 16, 0.6)",
  },
  sheetContainer: {
    backgroundColor: THEME.bgRaised,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: THEME.border,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 24,
    gap: 12,
  },
  sheetHandle: {
    width: 42,
    height: 5,
    borderRadius: 999,
    backgroundColor: THEME.border,
    alignSelf: "center",
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sheetTitle: {
    flex: 1,
    color: THEME.text,
    fontFamily: THEME.fontFamily,
    fontSize: 18,
    fontWeight: "700",
  },
  sheetBody: {
    color: THEME.textMuted,
    fontFamily: THEME.fontFamily,
    fontSize: 12.5,
    lineHeight: 19,
  },
  sheetMetaLabel: {
    color: THEME.textMuted,
    fontFamily: THEME.fontFamily,
    fontSize: 11,
    marginBottom: 4,
  },
  sheetMetaValue: {
    color: THEME.text,
    fontFamily: THEME.fontFamily,
    fontSize: 14,
    fontWeight: "700",
  },
  sheetMetaPath: {
    color: THEME.textDim,
    fontFamily: THEME.monoFamily,
    fontSize: 11,
    marginTop: 2,
  },
  sheetMetaReason: {
    color: THEME.text,
    fontFamily: THEME.fontFamily,
    fontSize: 13,
    lineHeight: 18,
  },
  sheetActions: {
    gap: 10,
  },
});
