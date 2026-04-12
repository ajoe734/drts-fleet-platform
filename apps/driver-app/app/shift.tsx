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
      Alert.alert("Success", "Clocked in successfully");
      setVehicleId("");
      setLocation("");
      setOdometer("");
    } catch (e: any) {
      Alert.alert("Error", e.message);
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
      Alert.alert("Success", "Clocked out successfully");
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.label}>Loading shift data...</Text>
      </View>
    );
  }

  if (shiftEnabled === null || !shiftEnabled) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Shift Tracking Unavailable</Text>
        <Text style={styles.empty}>This feature is currently disabled.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Shift & Attendance</Text>
      <Text style={styles.subtitle}>
        {activeShift
          ? `Active shift since ${new Date(activeShift.clockedInAt).toLocaleTimeString()}`
          : "Clock in to start your shift."}
      </Text>

      {activeShift && (
        <View style={styles.activeCard}>
          <Text style={styles.activeTitle}>🟢 On Shift</Text>
          <Text style={styles.activeDetail}>
            Vehicle: {activeShift.vehicleId ?? "Not assigned"}
          </Text>
          <Text style={styles.activeDetail}>
            Start: {new Date(activeShift.clockedInAt).toLocaleString()}
          </Text>
        </View>
      )}

      {!activeShift && (
        <View style={styles.form}>
          <Text style={styles.fieldLabel}>Vehicle ID (optional)</Text>
          <TextInput
            style={styles.input}
            value={vehicleId}
            onChangeText={setVehicleId}
            placeholder="e.g. ABC-1234"
          />

          <Text style={styles.fieldLabel}>Location (optional)</Text>
          <TextInput
            style={styles.input}
            value={location}
            onChangeText={setLocation}
            placeholder="e.g. Depot A"
          />

          <Text style={styles.fieldLabel}>Odometer (optional)</Text>
          <TextInput
            style={styles.input}
            value={odometer}
            onChangeText={setOdometer}
            placeholder="e.g. 50000"
            keyboardType="numeric"
          />
        </View>
      )}

      {activeShift ? (
        <Text
          style={[styles.btn, styles.btnRed, submitting && styles.btnDisabled]}
          onPress={handleClockOut}
        >
          {submitting ? "Processing..." : "Clock Out"}
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
          {submitting ? "Processing..." : "Clock In"}
        </Text>
      )}

      <View style={styles.footer}>
        <Text style={styles.link} onPress={() => router.push("/earnings")}>
          View Earnings →
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
