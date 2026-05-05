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
import { StatusChip } from "@/components/ui/StatusChip";
import { Tokens } from "@/components/ui/tokens";

export default function ShiftScreen() {
  const router = useRouter();
  const isProvisioned = isDriverIdentityProvisioned();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [activeShift, setActiveShift] = useState<ShiftRecord | null>(null);
  const [vehicleId, setVehicleId] = useState("");
  const [location, setLocation] = useState("");
  const [odometer, setOdometer] = useState("");
  const [shiftEnabled, setShiftEnabled] = useState<boolean | null>(null);

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
          loadShifts();
        } else {
          setLoading(false);
        }
      })
      .catch(() => {
        // Fallback to loading shifts if feature flag check fails
        loadShifts();
      });
  }, [isProvisioned]);

  const loadShifts = async () => {
    if (!isProvisioned) return;

    const client = getDriverClient();
    const driverId = getDriverId();
    try {
      const shifts = await client.listShifts(driverId);
      const active = shifts.find((shift) => shift.status === "active");
      setActiveShift(active ?? null);
    } catch {
      // No shifts or error
    } finally {
      setLoading(false);
    }
  };

  // Guard clause for unprovisioned user
  if (!isProvisioned) {
    return (
      <AppScreen scrollable={false}>
        <PageHeader title="班表與出勤" />
        <View style={styles.center}>
          <Text style={styles.empty}>請先完成設備綁定以存取班表功能。</Text>
          <ActionButton
            title="前往綁定"
            onPress={() => router.push("/onboarding")}
            variant="primary"
            style={{ marginTop: Tokens.spacing.lg }}
          />
        </View>
      </AppScreen>
    );
  }

  const handleClockIn = async () => {
    const trimmedOdometer = odometer.trim();
    if (trimmedOdometer && isNaN(Number(trimmedOdometer))) {
      Alert.alert("輸入錯誤", "里程表必須是有效的數字。");
      return;
    }

    setSubmitting(true);
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
      Alert.alert("成功", "已完成上線打卡。");
      setVehicleId("");
      setLocation("");
      setOdometer("");
    } catch (e: any) {
      Alert.alert("錯誤", e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleClockOut = async () => {
    const trimmedOdometer = odometer.trim();
    if (trimmedOdometer && isNaN(Number(trimmedOdometer))) {
      Alert.alert("輸入錯誤", "里程表必須是有效的數字。");
      return;
    }

    setSubmitting(true);
    const client = getDriverClient();
    const driverId = getDriverId();
    try {
      await client.clockOut({
        driverId,
        location: location.trim() || undefined,
        odometer: trimmedOdometer ? Number(trimmedOdometer) : undefined,
      });
      setActiveShift(null);
      Alert.alert("成功", "已完成下線打卡。");
    } catch (e: any) {
      Alert.alert("錯誤", e.message);
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
        <View style={styles.center}>
          <Text style={styles.title}>班表追蹤暫停提供</Text>
          <Text style={styles.empty}>此功能目前未啟用。</Text>
        </View>
      </AppScreen>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <AppScreen>
        <PageHeader
          title="班表與出勤"
          subtitle={activeShift ? "執勤中" : "準備開始班次"}
        />

        <View style={styles.content}>
          {activeShift ? (
            <View style={styles.activeCard}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>目前班次</Text>
                <StatusChip label="執勤中" variant="success" />
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>車輛</Text>
                <Text style={styles.detailValue}>
                  {activeShift.vehicleId ?? "尚未指派"}
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>開始時間</Text>
                <Text style={styles.detailValue}>
                  {new Date(activeShift.clockedInAt).toLocaleString()}
                </Text>
              </View>

              <View style={styles.formSeparator} />

              <FormField
                label="目前里程表（選填）"
                value={odometer}
                onChangeText={setOdometer}
                placeholder="例如 50000"
                keyboardType="numeric"
                helpText="若需更新里程請於下線前填寫"
              />

              <FormField
                label="目前位置（選填）"
                value={location}
                onChangeText={setLocation}
                placeholder="例如 營運據點 B"
              />
            </View>
          ) : (
            <View style={styles.form}>
              <Text style={styles.instruction}>請先上線打卡以開始班次。</Text>

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
            style={{ flex: 1 }}
          />
        ) : (
          <ActionButton
            title="上線打卡"
            onPress={handleClockIn}
            variant="primary"
            loading={submitting}
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
  content: { paddingVertical: Tokens.spacing.lg },
  title: { ...Tokens.type.sectionTitle, marginBottom: 4 },
  instruction: {
    ...Tokens.type.body,
    color: Tokens.colors.textMuted,
    marginBottom: Tokens.spacing.xl,
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
  },
  form: { paddingHorizontal: Tokens.spacing.xs },
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
