import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Alert,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import type { ShiftRecord } from "@drts/contracts";
import { getDriverClient } from "@/lib/api-client";

export default function ShiftScreen() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [activeShift, setActiveShift] = useState<ShiftRecord | null>(null);
  const [vehicleId, setVehicleId] = useState("");
  const [location, setLocation] = useState("");
  const [odometer, setOdometer] = useState("");
  const [shiftEnabled, setShiftEnabled] = useState<boolean | null>(null);
  const router = useRouter();

  useEffect(() => {
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
        loadShifts();
      });
  }, []);

  const loadShifts = async () => {
    const client = getDriverClient();
    try {
      const shifts = await client.listShifts("driver-demo-001");
      const active = shifts.find((shift) => shift.status === "active");
      setActiveShift(active ?? null);
    } catch {
      // No shifts
    } finally {
      setLoading(false);
    }
  };

  const handleClockIn = async () => {
    setSubmitting(true);
    const client = getDriverClient();
    try {
      const result = await client.clockIn({
        driverId: "driver-demo-001",
        vehicleId: vehicleId || undefined,
        location: location || undefined,
        odometer: odometer ? Number(odometer) : undefined,
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
    setSubmitting(true);
    const client = getDriverClient();
    try {
      await client.clockOut({
        driverId: "driver-demo-001",
        location: location || undefined,
        odometer: odometer ? Number(odometer) : undefined,
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
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.label}>載入班表資料中…</Text>
      </View>
    );
  }

  if (shiftEnabled === null || !shiftEnabled) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>班表追蹤暫停提供</Text>
        <Text style={styles.empty}>此功能目前未啟用。</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>班表與出勤</Text>
      <Text style={styles.subtitle}>
        {activeShift
          ? `本班次開始時間：${new Date(activeShift.clockedInAt).toLocaleTimeString()}`
          : "請先上線打卡以開始班次。"}
      </Text>

      {activeShift && (
        <View style={styles.activeCard}>
          <Text style={styles.activeTitle}>🟢 執勤中</Text>
          <Text style={styles.activeDetail}>
            車輛：{activeShift.vehicleId ?? "尚未指派"}
          </Text>
          <Text style={styles.activeDetail}>
            開始時間：{new Date(activeShift.clockedInAt).toLocaleString()}
          </Text>
        </View>
      )}

      {!activeShift && (
        <View style={styles.form}>
          <Text style={styles.fieldLabel}>車輛編號（選填）</Text>
          <TextInput
            style={styles.input}
            value={vehicleId}
            onChangeText={setVehicleId}
            placeholder="例如 ABC-1234"
          />

          <Text style={styles.fieldLabel}>位置（選填）</Text>
          <TextInput
            style={styles.input}
            value={location}
            onChangeText={setLocation}
            placeholder="例如 營運據點 A"
          />

          <Text style={styles.fieldLabel}>里程表（選填）</Text>
          <TextInput
            style={styles.input}
            value={odometer}
            onChangeText={setOdometer}
            placeholder="例如 50000"
            keyboardType="numeric"
          />
        </View>
      )}

      {activeShift ? (
        <Text
          style={[styles.btn, styles.btnRed, submitting && styles.btnDisabled]}
          onPress={handleClockOut}
        >
          {submitting ? "處理中…" : "下線打卡"}
        </Text>
      ) : (
        <Text
          style={[
            styles.btn,
            styles.btnGreen,
            submitting && styles.btnDisabled,
          ]}
          onPress={handleClockIn}
        >
          {submitting ? "處理中…" : "上線打卡"}
        </Text>
      )}

      <View style={styles.footer}>
        <Text style={styles.link} onPress={() => router.push("/earnings")}>
          查看收入 →
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#fff" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 24, fontWeight: "bold", marginBottom: 4 },
  subtitle: { fontSize: 14, color: "#666", marginBottom: 16 },
  activeCard: {
    backgroundColor: "#f0fff0",
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  activeTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 8,
    color: "#2a7",
  },
  activeDetail: { fontSize: 14, color: "#666", marginBottom: 4 },
  form: { marginBottom: 16 },
  fieldLabel: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
    marginTop: 12,
    color: "#333",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  btn: {
    textAlign: "center",
    padding: 14,
    borderRadius: 8,
    fontSize: 16,
    fontWeight: "600",
    marginVertical: 8,
  },
  btnGreen: { backgroundColor: "#34C759", color: "#fff" },
  btnRed: { backgroundColor: "#FF3B30", color: "#fff" },
  btnDisabled: { opacity: 0.6 },
  footer: { marginTop: 24, alignItems: "center" },
  link: { color: "#007AFF", fontSize: 16 },
  label: { marginTop: 8, color: "#666" },
  empty: { textAlign: "center", color: "#999", marginTop: 32 },
});
