import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert } from "react-native";
import type { PlatformPresenceRecord } from "@drts/contracts";
import { getDriverClient } from "@/lib/api-client";

/**
 * Calculates token expiry urgency and display label.
 * Returns countdown info with urgency level.
 */
function getTokenExpiryInfo(tokenExpiresAt: string | null): {
  label: string;
  urgency: "expired" | "urgent" | "warning" | "safe";
  isExpiring: boolean;
} {
  if (!tokenExpiresAt) {
    return { label: "No expiry set", urgency: "safe", isExpiring: false };
  }

  const now = new Date().getTime();
  const expiresAt = new Date(tokenExpiresAt).getTime();
  const remainingMs = expiresAt - now;

  if (remainingMs <= 0) {
    return { label: "Expired", urgency: "expired", isExpiring: true };
  }

  const remainingMinutes = Math.floor(remainingMs / 60000);
  const remainingHours = Math.floor(remainingMinutes / 60);

  if (remainingHours < 1) {
    return {
      label: `${remainingMinutes}m remaining`,
      urgency: "urgent",
      isExpiring: true,
    };
  }

  if (remainingHours < 24) {
    return {
      label: `${remainingHours}h ${remainingMinutes % 60}m remaining`,
      urgency: "warning",
      isExpiring: true,
    };
  }

  const remainingDays = Math.floor(remainingHours / 24);
  return {
    label: `${remainingDays}d ${remainingHours % 24}h remaining`,
    urgency: "safe",
    isExpiring: false,
  };
}

interface PlatformStatusCardProps {
  record: PlatformPresenceRecord;
  onStatusChange?: () => void;
}

/**
 * PlatformStatusCard - Displays a single platform's presence status
 * with online/offline toggle, token expiry countdown, re-auth trigger,
 * and eligibility display.
 */
export function PlatformStatusCard({
  record,
  onStatusChange,
}: PlatformStatusCardProps) {
  const client = getDriverClient();
  const [toggling, setToggling] = useState(false);
  const [expiryInfo, setExpiryInfo] = useState(() =>
    getTokenExpiryInfo(record.tokenExpiresAt),
  );

  // Update countdown every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setExpiryInfo(getTokenExpiryInfo(record.tokenExpiresAt));
    }, 60000);
    return () => clearInterval(interval);
  }, [record.tokenExpiresAt]);

  const handleToggle = async () => {
    setToggling(true);
    try {
      if (record.status === "online") {
        await client.setPlatformOffline({ platformCode: record.platformCode });
      } else {
        await client.setPlatformOnline({ platformCode: record.platformCode });
      }
      onStatusChange?.();
    } catch (e: any) {
      console.error("Failed to toggle platform presence:", e.message);
      Alert.alert(
        "Error",
        `Failed to toggle ${record.platformCode}: ${e.message}`,
      );
    } finally {
      setToggling(false);
    }
  };

  const handleReauth = () => {
    Alert.alert(
      "Re-authenticate Platform",
      `Start re-authentication for "${record.platformCode}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          onPress: async () => {
            try {
              await client.setPlatformOnline({
                platformCode: record.platformCode,
                tokenExpiresAt: null,
              });
              onStatusChange?.();
              Alert.alert(
                "Re-auth Started",
                `Complete authentication for ${record.platformCode}.`,
              );
            } catch (e: any) {
              Alert.alert("Error", e.message);
            }
          },
        },
      ],
    );
  };

  const eligibilityColor =
    record.eligibility === "eligible"
      ? "#4caf50"
      : record.eligibility === "pending"
        ? "#ff9800"
        : "#f44336";

  const expiryColor =
    expiryInfo.urgency === "expired"
      ? "#f44336"
      : expiryInfo.urgency === "urgent"
        ? "#ff5722"
        : expiryInfo.urgency === "warning"
          ? "#ff9800"
          : "#666";

  return (
    <View style={styles.card}>
      {/* Header with platform code and toggle */}
      <View style={styles.header}>
        <View style={styles.platformRow}>
          <View
            style={[
              styles.statusDot,
              {
                backgroundColor:
                  record.status === "online" ? "#4caf50" : "#9e9e9e",
              },
            ]}
          />
          <Text style={styles.platformCode}>{record.platformCode}</Text>
        </View>

        <View style={styles.actions}>
          {record.reauthRequired && (
            <TouchableOpacity
              style={[styles.iconBtn, styles.reauthIconBtn]}
              onPress={handleReauth}
              accessibilityLabel="Re-authenticate platform"
            >
              <Text style={styles.iconBtnText}>🔄</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[
              styles.toggleBtn,
              record.status === "online"
                ? styles.goOfflineBtn
                : styles.goOnlineBtn,
              toggling && styles.toggleBtnDisabled,
            ]}
            onPress={handleToggle}
            disabled={toggling}
            accessibilityLabel={
              record.status === "online" ? "Go offline" : "Go online"
            }
          >
            <Text style={styles.toggleBtnText}>
              {toggling
                ? "..."
                : record.status === "online"
                  ? "Offline"
                  : "Online"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Eligibility status */}
      <View style={styles.infoRow}>
        <Text style={styles.label}>Eligibility:</Text>
        <Text style={[styles.value, { color: eligibilityColor }]}>
          {record.eligibility}
        </Text>
      </View>

      {/* Token expiry with countdown */}
      {record.tokenExpiresAt && (
        <View style={styles.infoRow}>
          <Text style={styles.label}>Token:</Text>
          <Text style={[styles.value, { color: expiryColor }]}>
            {expiryInfo.label}
          </Text>
        </View>
      )}

      {/* Re-auth warning banner */}
      {record.reauthRequired && (
        <TouchableOpacity style={styles.warningBanner} onPress={handleReauth}>
          <Text style={styles.warningText}>⚠️ Re-authentication required</Text>
        </TouchableOpacity>
      )}

      {/* Last online timestamp */}
      {record.lastOnlineAt && (
        <View style={styles.infoRow}>
          <Text style={styles.label}>Last online:</Text>
          <Text style={styles.value}>
            {new Date(record.lastOnlineAt).toLocaleString()}
          </Text>
        </View>
      )}

      {/* Account ID if present */}
      {record.accountId && (
        <View style={styles.infoRow}>
          <Text style={styles.label}>Account:</Text>
          <Text style={styles.value}>{record.accountId}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 14,
    marginBottom: 10,
    backgroundColor: "#fafafa",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  platformRow: { flexDirection: "row", alignItems: "center" },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  platformCode: { fontSize: 16, fontWeight: "600", color: "#333" },
  actions: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e0e0e0",
    justifyContent: "center",
    alignItems: "center",
  },
  reauthIconBtn: { backgroundColor: "#fff3e0", borderColor: "#ff9800" },
  iconBtnText: { fontSize: 16 },
  toggleBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 6,
  },
  goOnlineBtn: { backgroundColor: "#4caf50" },
  goOfflineBtn: { backgroundColor: "#f44336" },
  toggleBtnDisabled: { opacity: 0.5 },
  toggleBtnText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
  },
  label: { fontSize: 12, color: "#666" },
  value: { fontSize: 12, fontWeight: "500", color: "#333" },
  warningBanner: {
    marginTop: 8,
    padding: 10,
    backgroundColor: "#fff3e0",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#ff9800",
  },
  warningText: {
    color: "#e65100",
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
});

export default PlatformStatusCard;
