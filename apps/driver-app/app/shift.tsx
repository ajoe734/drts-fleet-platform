import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import {
  PLATFORM_CODE_REGISTRY,
  type PlatformPresenceRecord,
  type PlatformPresenceSummary,
  type ShiftRecord,
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

function formatShiftDateTime(value: string) {
  return new Date(value).toLocaleString("zh-TW");
}

function formatCompactDateTime(value: string | null) {
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

export default function ShiftScreen() {
  const router = useRouter();
  const isProvisioned = isDriverIdentityProvisioned();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [activeShift, setActiveShift] = useState<ShiftRecord | null>(null);
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

  const loadShifts = async ({ manual = false }: { manual?: boolean } = {}) => {
    if (!isProvisioned) {
      return;
    }

    if (manual) {
      setRefreshing(true);
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
      const active = shifts.find((shift) => shift.status === "active");
      setActiveShift(active ?? null);
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

  if (!isProvisioned) {
    return (
      <AppScreen scrollable={false}>
        <PageHeader
          title={driverStrings.shift.title}
          subtitle="需要完成裝置配置"
        />
        <EmptyState
          title="尚未完成裝置配置"
          description="完成裝置綁定後，才能查看班表與進行上下線打卡。"
          icon="lock-closed-outline"
          actionTitle="前往配置裝置"
          onAction={() => router.push("/onboarding")}
          style={styles.fillState}
        />
      </AppScreen>
    );
  }

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
      setActiveShift(result);
      setScreenError(null);
      setNow(Date.now());
      Alert.alert("成功", "已完成上線打卡。");
      setVehicleId("");
      setLocation("");
      setOdometer("");
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
    const client = getDriverClient();
    const driverId = getDriverId();
    try {
      await client.clockOut({
        driverId,
        location: location.trim() || undefined,
        odometer: trimmedOdometer ? Number(trimmedOdometer) : undefined,
      });
      setActiveShift(null);
      setScreenError(null);
      Alert.alert("成功", "已完成下線打卡。");
      setLocation("");
      setOdometer("");
    } catch (error: unknown) {
      setSubmissionError(getErrorMessage(error, "下線打卡失敗，請稍後再試。"));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <AppScreen scrollable={false}>
        <PageHeader
          title={driverStrings.shift.title}
          subtitle="載入今日打卡記錄"
        />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Tokens.colors.primary} />
          <Text style={styles.loadingLabel}>載入班次資料中…</Text>
        </View>
      </AppScreen>
    );
  }

  if (shiftEnabled === false) {
    return (
      <AppScreen scrollable={false}>
        <PageHeader
          title={driverStrings.shift.title}
          subtitle="班次功能未啟用"
        />
        <EmptyState
          title="班表追蹤暫停提供"
          description="此功能目前未啟用，請稍後再試或先返回工作台。"
          icon="calendar-outline"
          actionTitle="返回工作台"
          onAction={() => router.push("/onboarding")}
          style={styles.fillState}
        />
      </AppScreen>
    );
  }

  if (screenError && !activeShift && !refreshing) {
    return (
      <AppScreen scrollable={false}>
        <PageHeader
          title={driverStrings.shift.title}
          subtitle="班次資料暫時無法載入"
          rightElement={
            <IconButton
              icon="refresh"
              onPress={() => {
                setLoading(true);
                void loadShifts();
              }}
              accessibilityLabel="重新整理班次資料"
            />
          }
        />
        <EmptyState
          title="班次資料暫時無法載入"
          description={screenError}
          icon="alert-circle-outline"
          actionTitle="重新整理"
          onAction={() => {
            setLoading(true);
            void loadShifts();
          }}
          style={styles.fillState}
        />
      </AppScreen>
    );
  }

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

  return (
    <View style={styles.screen}>
      <AppScreen contentContainerStyle={styles.screenContent}>
        <PageHeader
          title={driverStrings.shift.title}
          subtitle={activeShift ? "今日打卡記錄" : "準備開始班次"}
          rightElement={
            <IconButton
              icon="refresh"
              onPress={() => void loadShifts({ manual: true })}
              disabled={loading || submitting || refreshing}
              accessibilityLabel="重新整理班次資料"
            />
          }
        />

        {screenError ? (
          <ErrorBanner message={`資料同步異常：${screenError}`} />
        ) : null}
        {submissionError ? <ErrorBanner message={submissionError} /> : null}

        <View style={styles.heroCard}>
          <View style={styles.heroStatusRow}>
            <StatusChip
              label={activeShift ? "上班中" : "待上線"}
              variant={activeShift ? "success" : "default"}
              dot
            />
          </View>

          <Text style={styles.heroValue}>
            {activeShift ? formatElapsedDuration(activeShift, now) : "--:--"}
          </Text>
          <Text style={styles.heroSubtitle}>
            {activeShift
              ? `已工作 ${formatElapsedSentence(activeShift, now)} · 自 ${formatClockLabel(activeShift.clockedInAt)} 起`
              : "完成上線打卡後，系統會開始追蹤本班次的出勤與里程資訊。"}
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
                  : odometer.trim()
                    ? `${Number(odometer).toLocaleString("zh-TW")} km`
                    : "尚未填寫"
              }
              subdued={
                activeShift
                  ? activeShift.startOdometer == null
                  : !odometer.trim()
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
              label={activeShift ? "開始時間" : "開始後顯示"}
              value={
                activeShift
                  ? formatShiftDateTime(activeShift.clockedInAt)
                  : "等待上線打卡"
              }
              subdued={!activeShift}
            />
            <HeroField
              label="預計下線"
              value={formatExpectedOffTime(activeShift)}
              subdued={!activeShift}
            />
          </View>
        </View>

        <SectionCard
          title={
            activeShift
              ? driverStrings.shift.summaryTitle
              : driverStrings.shift.readinessTitle
          }
          subtitle={
            activeShift
              ? "顯示目前班次內可確認的出勤資訊。"
              : "上線前可先填寫車輛、位置與里程。"
          }
        >
          <View style={styles.infoTileRow}>
            <ShiftInfoTile
              label={driverStrings.shift.statusLabel}
              value={activeShift ? "執勤中" : "待上線"}
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
              label="預計下線"
              value={formatExpectedOffTime(activeShift)}
              tone={activeShift ? "warning" : "default"}
            />
          </View>
        </SectionCard>

        <SectionCard
          title={activeShift ? "班次更新" : "上線設定"}
          subtitle={
            activeShift
              ? "下線前可補充目前里程與位置。"
              : "這些欄位皆為選填，不影響班次 guardrails。"
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
                helpText="若需更新里程，請於下線前填寫。"
                error={odometerError ?? undefined}
              />

              <FormField
                label="目前位置（選填）"
                value={location}
                onChangeText={setLocation}
                placeholder="例如 營運據點 B"
              />
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
              : "沿用既有 platform presence 資料來源，只讀顯示目前可接單狀態。"
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
              actionTitle="查看平台狀態"
              onAction={() => router.push("/platform-presence")}
              style={styles.inlineEmptyState}
            />
          )}
        </SectionCard>

        <AuthorityBanner
          title="班次資料 guardrails"
          authorityLabel="不變更定位心跳、provisioning 與上下線 API"
          description="這個畫面只調整呈現方式；資料寫入仍沿用現有班次與出勤流程。"
          tone="owned"
          icon="shield-checkmark"
        />
      </AppScreen>

      <BottomActionBar
        notice={
          activeShift
            ? "完成下線打卡前，可先更新里程與位置。"
            : "上線打卡後才會建立 active shift。"
        }
      >
        {activeShift ? (
          <ActionButton
            title={driverStrings.shift.punchOut}
            onPress={handleClockOut}
            variant="secondary"
            loading={submitting}
            disabled={hasValidationError}
            style={[styles.bottomAction, styles.bottomDangerAction]}
            textStyle={styles.bottomDangerText}
          />
        ) : (
          <ActionButton
            title={driverStrings.shift.punchIn}
            onPress={handleClockIn}
            variant="primary"
            loading={submitting}
            disabled={hasValidationError}
            style={styles.bottomAction}
          />
        )}
      </BottomActionBar>
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
  heroCard: {
    backgroundColor: Tokens.colors.surface,
    borderRadius: Tokens.radius.xl,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    padding: Tokens.spacing.xl,
    gap: Tokens.spacing.sm,
    ...Tokens.shadows.md,
  },
  heroStatusRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  heroValue: {
    fontSize: 32,
    lineHeight: 36,
    fontWeight: "700",
    color: Tokens.colors.textStrong,
    letterSpacing: -1,
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
  bottomAction: {
    flex: 1,
  },
  bottomDangerAction: {
    backgroundColor: Tokens.colors.surfaceDanger,
    borderColor: Tokens.colors.danger,
  },
  bottomDangerText: {
    color: Tokens.colors.danger,
  },
});
