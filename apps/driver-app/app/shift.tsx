import { useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { ActivityIndicator, Alert, StyleSheet, Text, View } from "react-native";
import { PLATFORM_CODE_REGISTRY } from "@drts/contracts";
import type {
  PlatformPresenceAdapterStatusRecord,
  PlatformPresenceRecord,
  PlatformPresenceSummary,
  ShiftRecord,
} from "@drts/contracts";
import type { CanvasTone } from "@drts/ui-web/canvas-tokens";

import {
  Banner,
  Btn,
  Card,
  DL,
  Field,
  Input,
  KPI,
  PageHeader,
  Pill,
  Shell,
  Table,
  driverCanvasTheme,
} from "@/components/canvas-primitives";
import {
  assessPlatformHealth,
  getPlatformHealthSeverity,
} from "@/components/platform-status-card";
import {
  getDriverClient,
  getDriverId,
  isDriverIdentityProvisioned,
} from "@/lib/api-client";
import { driverStrings } from "@/lib/strings";

const THEME = driverCanvasTheme;
const ODOMETER_PATTERN = /^\d+$/;
const EXPECTED_SHIFT_HOURS = 8;

type AvailabilityItem = {
  record: PlatformPresenceRecord;
  adapterStatus: PlatformPresenceAdapterStatusRecord | null;
  displayName: string;
  owned: boolean;
  statusLabel: string;
  tone: CanvasTone;
};

function getOdometerValidationMessage(value: string): string | null {
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

  return null;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return fallback;
}

function formatCompactDateTime(value: string | null | undefined): string {
  if (!value) {
    return driverStrings.common.notUpdatedYet;
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

function formatClockLabel(value: string | null | undefined): string {
  if (!value) {
    return "等待上線";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleTimeString("zh-TW", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatOdometer(value: number | null): string {
  if (value == null) {
    return "未填寫";
  }

  return `${value.toLocaleString("zh-TW")} km`;
}

function formatDraftOdometer(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "尚未填寫";
  }

  if (getOdometerValidationMessage(trimmed)) {
    return trimmed;
  }

  return formatOdometer(Number(trimmed));
}

function isSameLocalDay(value: string, now: number): boolean {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  const reference = new Date(now);
  return (
    parsed.getFullYear() === reference.getFullYear() &&
    parsed.getMonth() === reference.getMonth() &&
    parsed.getDate() === reference.getDate()
  );
}

function getElapsedMinutes(shift: ShiftRecord, now: number): number {
  if (shift.totalHours != null) {
    return Math.max(0, Math.round(shift.totalHours * 60));
  }

  const start = new Date(shift.clockedInAt).getTime();
  const end = shift.clockedOutAt ? new Date(shift.clockedOutAt).getTime() : now;

  return Math.max(0, Math.floor((end - start) / 60000));
}

function formatElapsedDuration(shift: ShiftRecord, now: number): string {
  const totalMinutes = getElapsedMinutes(shift, now);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function formatElapsedSentence(shift: ShiftRecord, now: number): string {
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

function formatWorkedHoursLabel(hours: number): string {
  return hours.toLocaleString("zh-TW", {
    minimumFractionDigits: hours >= 10 ? 0 : 1,
    maximumFractionDigits: 1,
  });
}

function formatExpectedOffTime(shift: ShiftRecord | null): string {
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
): string {
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
): CanvasTone {
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

function getAdapterStatusLabel(
  adapterStatus: PlatformPresenceAdapterStatusRecord | null,
): string {
  switch (adapterStatus?.status) {
    case "healthy":
      return "轉接正常";
    case "degraded":
      return "轉接降級";
    case "down":
      return "轉接中斷";
    default:
      return "尚未同步";
  }
}

function getShiftDistanceKm(shift: ShiftRecord): number | null {
  if (shift.startOdometer == null || shift.endOdometer == null) {
    return null;
  }

  const distance = shift.endOdometer - shift.startOdometer;
  return distance >= 0 ? distance : null;
}

function formatDistanceValue(distanceKm: number | null): string {
  if (distanceKm == null) {
    return "—";
  }

  return distanceKm.toLocaleString("zh-TW", {
    maximumFractionDigits: 0,
  });
}

function getToneColor(tone: CanvasTone): string {
  switch (tone) {
    case "success":
      return THEME.success;
    case "warn":
      return THEME.warn;
    case "danger":
      return THEME.danger;
    case "info":
      return THEME.info;
    case "accent":
      return THEME.accent;
    case "neutral":
    default:
      return THEME.textDim;
  }
}

function ShiftHeroStatus({ active }: { active: boolean }) {
  return (
    <View style={styles.heroStatusRow}>
      <View
        style={[
          styles.heroStatusDot,
          {
            backgroundColor: active ? THEME.success : THEME.textDim,
          },
        ]}
      />
      <Text
        style={[
          styles.heroStatusText,
          { color: active ? THEME.success : THEME.textMuted },
        ]}
      >
        {active ? "上班中" : "待上線"}
      </Text>
    </View>
  );
}

function AvailabilitySummaryRow({
  label,
  detail,
  tone,
  last = false,
}: {
  label: string;
  detail: string;
  tone: CanvasTone;
  last?: boolean;
}) {
  return (
    <View
      style={[
        styles.availabilitySummaryRow,
        {
          borderBottomColor: THEME.border,
          borderBottomWidth: last ? 0 : 1,
        },
      ]}
    >
      <View style={styles.availabilitySummaryCopy}>
        <Text style={styles.availabilitySummaryLabel}>{label}</Text>
        <Text style={styles.availabilitySummaryDetail}>{detail}</Text>
      </View>
      <View
        style={[
          styles.availabilitySummaryDot,
          { backgroundColor: getToneColor(tone) },
        ]}
      />
    </View>
  );
}

export default function ShiftScreen() {
  const router = useRouter();
  const isProvisioned = isDriverIdentityProvisioned();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [activeShift, setActiveShift] = useState<ShiftRecord | null>(null);
  const [shiftHistory, setShiftHistory] = useState<ShiftRecord[]>([]);
  const [vehicleId, setVehicleId] = useState("");
  const [location, setLocation] = useState("");
  const [odometer, setOdometer] = useState("");
  const [shiftEnabled, setShiftEnabled] = useState<boolean | null>(null);
  const [screenError, setScreenError] = useState<string | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [presenceSummary, setPresenceSummary] =
    useState<PlatformPresenceSummary | null>(null);
  const [presenceError, setPresenceError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const odometerError = getOdometerValidationMessage(odometer);
  const hasValidationError = Boolean(odometerError);

  useEffect(() => {
    if (!activeShift) {
      return;
    }

    const timer = setInterval(() => {
      setNow(Date.now());
    }, 60_000);

    return () => clearInterval(timer);
  }, [activeShift]);

  const loadShifts = async ({
    manual = false,
    showSpinner = false,
  }: {
    manual?: boolean;
    showSpinner?: boolean;
  } = {}) => {
    if (!isProvisioned) {
      setLoading(false);
      return;
    }

    if (manual) {
      setRefreshing(true);
    }
    if (showSpinner) {
      setLoading(true);
    }

    const client = getDriverClient();
    const driverId = getDriverId();

    try {
      const [shifts, platformPresenceResult] = await Promise.all([
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

      const active = shifts.find((shift) => shift.status === "active") ?? null;

      setShiftHistory(shifts);
      setActiveShift(active);
      setPresenceSummary(platformPresenceResult.summary);
      setPresenceError(platformPresenceResult.error);
      setScreenError(null);
      setNow(Date.now());
    } catch (error: unknown) {
      setScreenError(getErrorMessage(error, "班次資料載入失敗，請稍後再試。"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

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
          void loadShifts();
        } else {
          setLoading(false);
        }
      })
      .catch(() => {
        void loadShifts();
      });
  }, [isProvisioned]);

  const handleClockIn = async () => {
    if (odometerError) {
      Alert.alert("輸入錯誤", odometerError);
      return;
    }

    const trimmedOdometer = odometer.trim();
    setSubmitting(true);
    setSubmissionError(null);

    try {
      const client = getDriverClient();
      const driverId = getDriverId();
      const result = await client.clockIn({
        driverId,
        vehicleId: vehicleId.trim() || undefined,
        location: location.trim() || undefined,
        odometer: trimmedOdometer ? Number(trimmedOdometer) : undefined,
      });

      setActiveShift(result);
      await loadShifts();
      setVehicleId("");
      setLocation("");
      setOdometer("");
      Alert.alert("成功", "已完成上線打卡。");
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

    const trimmedOdometer = odometer.trim();
    setSubmitting(true);
    setSubmissionError(null);

    try {
      const client = getDriverClient();
      const driverId = getDriverId();
      await client.clockOut({
        driverId,
        location: location.trim() || undefined,
        odometer: trimmedOdometer ? Number(trimmedOdometer) : undefined,
      });

      setActiveShift(null);
      await loadShifts();
      setLocation("");
      setOdometer("");
      Alert.alert("成功", "已完成下線打卡。");
    } catch (error: unknown) {
      setSubmissionError(getErrorMessage(error, "下線打卡失敗，請稍後再試。"));
    } finally {
      setSubmitting(false);
    }
  };

  const availabilityItems = useMemo<AvailabilityItem[]>(() => {
    const presences = presenceSummary?.presences ?? [];
    const adapterStatuses = presenceSummary?.adapterStatuses ?? [];

    return [...presences]
      .map((record) => {
        const adapterStatus =
          adapterStatuses.find(
            (entry) => entry.platformCode === record.platformCode,
          ) ?? null;
        const assessment = assessPlatformHealth(record, adapterStatus);
        return {
          record,
          adapterStatus,
          displayName: getPlatformDisplayName(record.platformCode),
          owned: isOwnedPlatform(record.platformCode),
          statusLabel: assessment.statusLabel,
          tone: getAvailabilityTone(assessment),
          severity: getPlatformHealthSeverity(assessment),
        };
      })
      .sort(
        (left, right) =>
          right.severity - left.severity ||
          left.record.platformCode.localeCompare(right.record.platformCode),
      )
      .map(
        ({ record, adapterStatus, displayName, owned, statusLabel, tone }) => ({
          record,
          adapterStatus,
          displayName,
          owned,
          statusLabel,
          tone,
        }),
      );
  }, [presenceSummary]);

  const readyPlatforms = availabilityItems.filter(
    (item) =>
      assessPlatformHealth(item.record, item.adapterStatus).canReceiveOrders,
  ).length;
  const onlinePlatforms = availabilityItems.filter(
    (item) => item.record.status === "online",
  ).length;

  const todayShifts = useMemo(
    () =>
      shiftHistory.filter((shift) => isSameLocalDay(shift.clockedInAt, now)),
    [now, shiftHistory],
  );

  const completedTodayCount = todayShifts.filter(
    (shift) => shift.status === "completed",
  ).length;
  const totalWorkedHours = todayShifts.reduce((total, shift) => {
    return total + getElapsedMinutes(shift, now) / 60;
  }, 0);
  const totalDistanceKm = todayShifts.reduce<number | null>((total, shift) => {
    const distance = getShiftDistanceKm(shift);
    if (distance == null) {
      return total;
    }
    return (total ?? 0) + distance;
  }, null);

  const heroDetailItems = [
    {
      label: "車輛",
      value: (activeShift?.vehicleId ?? vehicleId.trim()) || "尚未填寫",
    },
    {
      label: activeShift ? "起始里程" : "預填里程",
      value: activeShift
        ? formatOdometer(activeShift.startOdometer)
        : formatDraftOdometer(odometer),
      mono: true,
    },
    {
      label: activeShift ? "起始位置" : "預填位置",
      value: (activeShift?.startLocation ?? location.trim()) || "尚未填寫",
    },
    {
      label: "預計下班",
      value: formatExpectedOffTime(activeShift),
      mono: true,
    },
  ];

  const ownedItems = availabilityItems.filter((item) => item.owned);
  const externalItems = availabilityItems.filter((item) => !item.owned);
  const ownedReadyCount = ownedItems.filter(
    (item) =>
      assessPlatformHealth(item.record, item.adapterStatus).canReceiveOrders,
  ).length;
  const externalReadyCount = externalItems.filter(
    (item) =>
      assessPlatformHealth(item.record, item.adapterStatus).canReceiveOrders,
  ).length;
  const externalOnlineCount = externalItems.filter(
    (item) => item.record.status === "online",
  ).length;

  const availabilityTableRows = availabilityItems.map((item) => ({
    code: String(item.record.platformCode).toUpperCase(),
    platform: item.displayName,
    statusLabel: item.statusLabel,
    tone: item.tone,
    sync: formatCompactDateTime(
      item.adapterStatus?.lastSyncAt ?? item.record.updatedAt,
    ),
    adapter: getAdapterStatusLabel(item.adapterStatus),
    owned: item.owned,
  }));

  if (!isProvisioned) {
    return (
      <Shell theme={THEME} contentContainerStyle={styles.loadingShellContent}>
        <PageHeader
          theme={THEME}
          title={driverStrings.shift.title}
          subtitle="需要完成裝置配置"
        />
        <Banner
          theme={THEME}
          tone="warn"
          title="尚未完成裝置配置"
          body="完成裝置綁定後，才能查看班表與進行上下線打卡。"
          icon={
            <Ionicons name="lock-closed-outline" size={16} color={THEME.warn} />
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
      <Shell theme={THEME} contentContainerStyle={styles.loadingShellContent}>
        <PageHeader
          theme={THEME}
          title={driverStrings.shift.title}
          subtitle="載入今日打卡記錄"
        />
        <View style={styles.loadingCard}>
          <ActivityIndicator size="large" color={THEME.accent} />
          <Text style={styles.loadingLabel}>載入班次資料中…</Text>
        </View>
      </Shell>
    );
  }

  if (shiftEnabled === false) {
    return (
      <Shell theme={THEME} contentContainerStyle={styles.loadingShellContent}>
        <PageHeader
          theme={THEME}
          title={driverStrings.shift.title}
          subtitle="班次功能未啟用"
        />
        <Banner
          theme={THEME}
          tone="warn"
          title="班表追蹤暫停提供"
          body="此功能目前未啟用，請稍後再試或先返回工作台。"
          icon={
            <Ionicons name="calendar-outline" size={16} color={THEME.warn} />
          }
          actions={
            <Btn
              theme={THEME}
              variant="secondary"
              size="sm"
              onPress={() => router.push("/onboarding")}
            >
              返回工作台
            </Btn>
          }
        />
      </Shell>
    );
  }

  if (screenError && !activeShift && !refreshing) {
    return (
      <Shell theme={THEME} contentContainerStyle={styles.loadingShellContent}>
        <PageHeader
          theme={THEME}
          title={driverStrings.shift.title}
          subtitle="班次資料暫時無法載入"
          actions={
            <Btn
              theme={THEME}
              variant="secondary"
              size="sm"
              icon={<Ionicons name="refresh" size={13} color={THEME.text} />}
              onPress={() => void loadShifts({ showSpinner: true })}
            >
              重新整理
            </Btn>
          }
        />
        <Banner
          theme={THEME}
          tone="danger"
          title="班次資料暫時無法載入"
          body={screenError}
          icon={<Ionicons name="alert-circle" size={16} color={THEME.danger} />}
        />
      </Shell>
    );
  }

  return (
    <Shell
      theme={THEME}
      contentContainerStyle={styles.shellContent}
      footer={
        <View
          style={[
            styles.footerBar,
            {
              backgroundColor: THEME.bgRaised,
              borderTopColor: THEME.border,
            },
          ]}
        >
          <Btn
            theme={THEME}
            variant={activeShift ? "ghost" : "primary"}
            size="md"
            onPress={activeShift ? handleClockOut : handleClockIn}
            disabled={submitting || hasValidationError}
            icon={
              submitting ? (
                <ActivityIndicator
                  size="small"
                  color={activeShift ? THEME.danger : "#FFFFFF"}
                />
              ) : (
                <Ionicons
                  name={activeShift ? "power-outline" : "play-outline"}
                  size={15}
                  color={activeShift ? THEME.danger : "#FFFFFF"}
                />
              )
            }
            style={[
              styles.footerAction,
              activeShift
                ? {
                    backgroundColor: "transparent",
                    borderColor: THEME.danger,
                  }
                : null,
            ]}
          >
            {activeShift ? (
              <Text style={styles.footerDangerLabel}>
                {driverStrings.shift.punchOut}
              </Text>
            ) : (
              driverStrings.shift.punchIn
            )}
          </Btn>
        </View>
      }
    >
      <PageHeader
        theme={THEME}
        title={driverStrings.shift.title}
        subtitle="今日打卡記錄"
        actions={
          <Btn
            theme={THEME}
            variant="ghost"
            size="xs"
            icon={<Ionicons name="refresh" size={13} color={THEME.textMuted} />}
            onPress={() => void loadShifts({ manual: true })}
            disabled={refreshing || submitting}
          >
            {refreshing ? "同步中" : "重新整理"}
          </Btn>
        }
      />

      {screenError ? (
        <Banner
          theme={THEME}
          tone="warn"
          title="資料同步異常"
          body={screenError}
          icon={
            <Ionicons name="warning-outline" size={16} color={THEME.warn} />
          }
        />
      ) : null}

      {submissionError ? (
        <Banner
          theme={THEME}
          tone="danger"
          title="打卡操作失敗"
          body={submissionError}
          icon={<Ionicons name="alert-circle" size={16} color={THEME.danger} />}
        />
      ) : null}

      <Card theme={THEME} style={styles.heroCard} padding={18}>
        <ShiftHeroStatus active={Boolean(activeShift)} />
        <Text style={styles.heroClock}>
          {activeShift ? formatElapsedDuration(activeShift, now) : "--:--"}
        </Text>
        <Text style={styles.heroSummary}>
          {activeShift
            ? `已工作 ${formatElapsedSentence(activeShift, now)} · 自 ${formatClockLabel(activeShift.clockedInAt)} 起`
            : "完成上線打卡後，系統會開始追蹤本班次的出勤與里程資訊。"}
        </Text>
        <View style={styles.heroDivider} />
        <DL theme={THEME} cols={2} items={heroDetailItems} monoVal={false} />
      </Card>

      <View style={styles.sectionBlock}>
        <Text style={styles.sectionTitle}>
          {driverStrings.shift.summaryTitle}
        </Text>
        <View style={styles.kpiRow}>
          <KPI
            theme={THEME}
            label="完成班次"
            value={String(completedTodayCount)}
            sub={`今日 ${todayShifts.length} 筆打卡`}
            hint={todayShifts.length > 0 ? "依今日打卡紀錄統計" : "尚未開始"}
          />
          <KPI
            theme={THEME}
            label="總里程"
            value={formatDistanceValue(totalDistanceKm)}
            sub={totalDistanceKm == null ? "待回填" : "km"}
            hint={
              activeShift
                ? "目前班次未下線，總里程可能持續更新"
                : "僅統計已回填里程"
            }
          />
          <KPI
            theme={THEME}
            label="累計工時"
            value={formatWorkedHoursLabel(totalWorkedHours)}
            sub="小時"
            hint={activeShift ? "含目前進行中班次" : "今日班次總計"}
          />
        </View>
      </View>

      <View style={styles.sectionBlock}>
        <Text style={styles.sectionTitle}>多平台可用性</Text>
        <Card theme={THEME} padding={0}>
          {presenceError ? (
            <View style={styles.cardSectionPad}>
              <Banner
                theme={THEME}
                tone="warn"
                title="平台可接單狀態待確認"
                body={presenceError}
                icon={
                  <Ionicons
                    name="cloud-offline-outline"
                    size={16}
                    color={THEME.warn}
                  />
                }
              />
            </View>
          ) : null}

          {availabilityItems.length > 0 ? (
            <View style={styles.availabilitySummaryList}>
              <AvailabilitySummaryRow
                label="自營派單可用"
                detail={
                  ownedItems.length > 0
                    ? ownedReadyCount > 0
                      ? "班次中可接收派單"
                      : "自營派單目前未上線"
                    : "尚未連接自營派單"
                }
                tone={
                  ownedReadyCount > 0
                    ? "success"
                    : ownedItems.length > 0
                      ? "warn"
                      : "neutral"
                }
              />
              <AvailabilitySummaryRow
                label="外部平台可用"
                detail={
                  externalItems.length > 0
                    ? `${externalOnlineCount} / ${externalItems.length} 平台目前上線`
                    : "尚未連接外部平台"
                }
                tone={
                  externalReadyCount > 0
                    ? "success"
                    : externalItems.length > 0
                      ? "warn"
                      : "neutral"
                }
                last
              />
            </View>
          ) : (
            <View style={styles.cardSectionPad}>
              <Banner
                theme={THEME}
                tone="info"
                title="尚無平台可接單狀態"
                body="目前沒有可顯示的平台 presence 資料，可前往平台狀態頁確認綁定與上線狀態。"
                icon={
                  <Ionicons
                    name="swap-horizontal-outline"
                    size={16}
                    color={THEME.info}
                  />
                }
                actions={
                  <Btn
                    theme={THEME}
                    variant="secondary"
                    size="sm"
                    onPress={() => router.push("/platform-presence")}
                  >
                    查看平台狀態
                  </Btn>
                }
              />
            </View>
          )}
        </Card>
      </View>

      {!activeShift ? (
        <Card
          theme={THEME}
          title={driverStrings.shift.readinessTitle}
          subtitle="上線前可先填寫車輛、位置與里程；全部欄位都維持選填。"
        >
          <View style={styles.fieldStack}>
            <Field theme={THEME} label="車輛編號（選填）">
              <Input
                theme={THEME}
                value={vehicleId}
                ph="例如 AAA-1234"
                onChangeText={setVehicleId}
                autoCapitalize="characters"
                autoCorrect={false}
              />
            </Field>

            <Field theme={THEME} label="位置（選填）">
              <Input
                theme={THEME}
                value={location}
                ph="例如 營運據點 A"
                onChangeText={setLocation}
                autoCorrect={false}
              />
            </Field>

            <Field
              theme={THEME}
              label="里程表（選填）"
              hint="僅接受整數數字，留白則不送出里程資料。"
            >
              <Input
                theme={THEME}
                value={odometer}
                ph="例如 50000"
                mono
                suffix="km"
                onChangeText={setOdometer}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </Field>
            {odometerError ? (
              <Text style={styles.fieldError}>{odometerError}</Text>
            ) : null}
          </View>
        </Card>
      ) : null}

      {!activeShift && availabilityItems.length > 0 ? (
        <Card
          theme={THEME}
          title="平台明細"
          subtitle={`${onlinePlatforms} 個平台上線中，${readyPlatforms} 個平台目前可接單。`}
        >
          <Table
            theme={THEME}
            dense
            rows={availabilityTableRows}
            columns={[
              {
                h: "平台",
                w: 140,
                r: (row) => (
                  <View style={styles.tablePlatformCell}>
                    <Text
                      style={[
                        styles.tablePlatformCode,
                        { color: row.owned ? THEME.accentHi : THEME.warn },
                      ]}
                    >
                      {row.code}
                    </Text>
                    <Text style={styles.tablePlatformName}>{row.platform}</Text>
                  </View>
                ),
              },
              {
                h: "狀態",
                w: 140,
                r: (row) => (
                  <View style={styles.tableStatusCell}>
                    <Pill theme={THEME} tone={row.tone} dot>
                      {row.statusLabel}
                    </Pill>
                    <Text style={styles.tableStatusDetail}>{row.adapter}</Text>
                  </View>
                ),
              },
              {
                h: "最近同步",
                k: "sync",
                w: 114,
                mono: true,
              },
            ]}
          />
        </Card>
      ) : null}
    </Shell>
  );
}

const styles = StyleSheet.create({
  shellContent: {
    paddingBottom: 28,
    gap: 14,
  },
  loadingShellContent: {
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
    color: THEME.textMuted,
    fontFamily: THEME.fontFamily,
    fontSize: 14,
  },
  heroCard: {
    borderRadius: 14,
  },
  heroStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  heroStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  heroStatusText: {
    fontFamily: THEME.fontFamily,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  heroClock: {
    marginTop: 8,
    color: THEME.text,
    fontFamily: THEME.monoFamily,
    fontSize: 32,
    fontWeight: "700",
    letterSpacing: -1,
    lineHeight: 36,
  },
  heroSummary: {
    marginTop: 2,
    color: THEME.textMuted,
    fontFamily: THEME.fontFamily,
    fontSize: 12.5,
    lineHeight: 18,
  },
  heroDivider: {
    height: 1,
    backgroundColor: THEME.border,
    marginTop: 14,
    marginBottom: 2,
  },
  sectionBlock: {
    gap: 8,
  },
  sectionTitle: {
    color: THEME.text,
    fontFamily: THEME.fontFamily,
    fontSize: 13,
    fontWeight: "700",
  },
  kpiRow: {
    flexDirection: "row",
    gap: 8,
  },
  cardSectionPad: {
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  availabilitySummaryList: {
    paddingHorizontal: 14,
    paddingTop: 2,
  },
  availabilitySummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  availabilitySummaryCopy: {
    flex: 1,
    gap: 3,
  },
  availabilitySummaryLabel: {
    color: THEME.text,
    fontFamily: THEME.fontFamily,
    fontSize: 12.5,
    fontWeight: "700",
  },
  availabilitySummaryDetail: {
    color: THEME.textMuted,
    fontFamily: THEME.fontFamily,
    fontSize: 11.5,
    lineHeight: 16,
  },
  availabilitySummaryDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    flexShrink: 0,
  },
  tablePlatformCell: {
    gap: 3,
  },
  tablePlatformCode: {
    fontFamily: THEME.monoFamily,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  tablePlatformName: {
    color: THEME.text,
    fontFamily: THEME.fontFamily,
    fontSize: 11.5,
  },
  tableStatusCell: {
    gap: 6,
  },
  tableStatusDetail: {
    color: THEME.textDim,
    fontFamily: THEME.fontFamily,
    fontSize: 10.5,
  },
  fieldStack: {
    gap: 12,
  },
  fieldError: {
    marginTop: -6,
    color: THEME.danger,
    fontFamily: THEME.fontFamily,
    fontSize: 11.5,
  },
  footerBar: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderTopWidth: 1,
  },
  footerAction: {
    minHeight: 46,
    borderRadius: 10,
  },
  footerDangerLabel: {
    color: THEME.danger,
    fontFamily: THEME.fontFamily,
    fontSize: 13,
    fontWeight: "700",
  },
});
