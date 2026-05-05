import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import type { ShiftRecord } from "@drts/contracts";
import {
  getDriverClient,
  getDriverId,
  isDriverIdentityProvisioned,
} from "@/lib/api-client";
import { AppScreen } from "@/components/ui/AppScreen";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormField } from "@/components/ui/FormField";
import { ActionButton } from "@/components/ui/ActionButton";
import { BottomActionBar } from "@/components/ui/BottomActionBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { IconButton } from "@/components/ui/IconButton";
import { StatusChip } from "@/components/ui/StatusChip";
import { Tokens } from "@/components/ui/tokens";

const ODOMETER_PATTERN = /^\d+$/;

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

function formatShiftDateTime(value: string): string {
  return new Date(value).toLocaleString("zh-TW");
}

function formatOdometer(value: number | null): string {
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

function ShiftDetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
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

  const odometerError = getOdometerValidationMessage(odometer);
  const hasValidationError = Boolean(odometerError);

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
        // Fallback to loading shifts if feature flag check fails
        void loadShifts();
      });
  }, [isProvisioned]);

  const loadShifts = async ({ manual = false }: { manual?: boolean } = {}) => {
    if (!isProvisioned) return;

    if (manual) {
      setRefreshing(true);
    }

    const client = getDriverClient();
    const driverId = getDriverId();
    try {
      const shifts = await client.listShifts(driverId);
      const active = shifts.find((shift) => shift.status === "active");
      setActiveShift(active ?? null);
      setScreenError(null);
    } catch (error: unknown) {
      setScreenError(getErrorMessage(error, "班次資料載入失敗，請稍後再試。"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Guard clause for unprovisioned user
  if (!isProvisioned) {
    return (
      <AppScreen scrollable={false}>
        <PageHeader title="班表與出勤" />
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
        <PageHeader title="班表與出勤" />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Tokens.colors.primary} />
          <Text style={styles.label}>載入班表資料中…</Text>
        </View>
      </AppScreen>
    );
  }

  if (shiftEnabled === false) {
    return (
      <AppScreen scrollable={false}>
        <PageHeader title="班表與出勤" />
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
          title="班表與出勤"
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

  return (
    <View style={{ flex: 1 }}>
      <AppScreen>
        <PageHeader
          title="班表與出勤"
          subtitle={activeShift ? "執勤中" : "準備開始班次"}
          rightElement={
            <IconButton
              icon="refresh"
              onPress={() => void loadShifts({ manual: true })}
              disabled={loading || submitting || refreshing}
              accessibilityLabel="重新整理班次資料"
            />
          }
        />

        <View style={styles.content}>
          {screenError ? (
            <ErrorBanner message={`資料同步異常：${screenError}`} />
          ) : null}
          {submissionError ? <ErrorBanner message={submissionError} /> : null}

          {activeShift ? (
            <View style={styles.activeCard}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>目前班次</Text>
                <StatusChip label="執勤中" variant="success" />
              </View>

              <ShiftDetailRow
                label="車輛"
                value={activeShift.vehicleId ?? "尚未指派"}
              />
              <ShiftDetailRow
                label="開始時間"
                value={formatShiftDateTime(activeShift.clockedInAt)}
              />
              <ShiftDetailRow
                label="起始位置"
                value={activeShift.startLocation ?? "未填寫"}
              />
              <ShiftDetailRow
                label="起始里程"
                value={formatOdometer(activeShift.startOdometer)}
              />

              <View style={styles.formSeparator} />

              <FormField
                label="目前里程表（選填）"
                value={odometer}
                onChangeText={setOdometer}
                placeholder="例如 50000"
                keyboardType="numeric"
                helpText="若需更新里程請於下線前填寫"
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
            <View style={styles.activeCard}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>目前狀態</Text>
                <StatusChip label="待上線" variant="default" />
              </View>
              <Text style={styles.instruction}>
                完成上線打卡後，系統會開始追蹤本班次的出勤與里程資訊。
              </Text>

              <View style={styles.formSeparator} />

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
        </View>
      </AppScreen>

      <BottomActionBar>
        {activeShift ? (
          <ActionButton
            title="下線打卡"
            onPress={handleClockOut}
            variant="danger"
            loading={submitting}
            disabled={hasValidationError}
            style={{ flex: 1 }}
          />
        ) : (
          <ActionButton
            title="上線打卡"
            onPress={handleClockIn}
            variant="primary"
            loading={submitting}
            disabled={hasValidationError}
            style={{ flex: 1 }}
          />
        )}
      </BottomActionBar>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Tokens.spacing.xl,
  },
  fillState: {
    flex: 1,
  },
  content: { paddingVertical: Tokens.spacing.lg },
  title: { ...Tokens.type.sectionTitle, marginBottom: 4 },
  instruction: {
    ...Tokens.type.body,
    color: Tokens.colors.textMuted,
    marginBottom: Tokens.spacing.md,
  },
  activeCard: {
    backgroundColor: Tokens.colors.surface,
    padding: Tokens.spacing.lg,
    borderRadius: Tokens.radius.md,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Tokens.spacing.lg,
  },
  cardTitle: {
    ...Tokens.type.label,
    fontWeight: "bold",
    color: Tokens.colors.textStrong,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  detailLabel: {
    ...Tokens.type.body,
    color: Tokens.colors.textMuted,
  },
  detailValue: {
    ...Tokens.type.body,
    color: Tokens.colors.textStrong,
    fontWeight: "500",
    flex: 1,
    textAlign: "right",
  },
  formSeparator: {
    height: 1,
    backgroundColor: Tokens.colors.border,
    marginVertical: Tokens.spacing.xl,
  },
  label: { marginTop: 8, color: Tokens.colors.textMuted },
  empty: {
    textAlign: "center",
    color: Tokens.colors.textMuted,
    ...Tokens.type.body,
  },
});
