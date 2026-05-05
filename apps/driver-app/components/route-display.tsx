import React from "react";
import { View, Text, StyleSheet, Alert } from "react-native";
import type { DriverTaskRecord, OwnedOrderRecord } from "@drts/contracts";
import PlatformTaskBadge from "@/components/platform-task-badge";

/**
 * RouteDisplay
 *
 * Shows route intent and waypoints for a task. Designed to be tolerant of
 * optional third‑party fields that are not yet part of core contracts.
 *
 * If the task is forwarded (sourcePlatform != null), the route is treated as
 * route-locked and any edit entry is hidden. If a platform-provided
 * `routeProvided` flag exists and is false, we show an explicit hint.
 *
 * Waypoints resolution order:
 * 1) task.waypoints (if provided by 3P platform; read via any-safe access)
 * 2) order pickup/dropoff fallback (OwnedOrderRecord)
 */
export default function RouteDisplay({
  task,
  order,
}: {
  task: DriverTaskRecord;
  order?: OwnedOrderRecord | null;
}) {
  const forwarded = task.sourcePlatform != null;

  // Optional/platform-only fields accessed via any to avoid type errors
  const routeLocked: boolean = forwarded || !!(task as any)?.routeLocked;
  const routeProvided: boolean | null = ((): boolean | null => {
    const v = (task as any)?.routeProvided;
    return typeof v === "boolean" ? v : null;
  })();
  const routeIntent: string | null = ((): string | null => {
    const v = (task as any)?.routeIntent ?? (task as any)?.platformRouteIntent;
    return typeof v === "string" ? v : null;
  })();

  // Prefer platform-provided waypoints; otherwise fall back to order pickup/dropoff
  const platformWaypoints: any[] | null = Array.isArray(
    (task as any)?.waypoints,
  )
    ? ((task as any)?.waypoints as any[])
    : null;

  const displayWaypoints: { label: string; address: string }[] = [];
  if (platformWaypoints && platformWaypoints.length > 0) {
    platformWaypoints.forEach((wp, idx) => {
      const addr =
        wp?.formattedAddress ?? wp?.address ?? wp?.name ?? "未命名站點";
      displayWaypoints.push({
        label: `途經點 ${idx + 1}`,
        address: String(addr),
      });
    });
  } else if (order) {
    if (order.pickup) {
      displayWaypoints.push({
        label: "上車點",
        address: order.pickup.address ?? "待確認上車點",
      });
    }
    if (order.dropoff) {
      displayWaypoints.push({
        label: "下車點",
        address: order.dropoff.address ?? "待確認下車點",
      });
    }
  }

  const onEditPress = () => {
    Alert.alert("目前無法編輯", "此任務暫不開放編輯路線。");
  };

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>路線資訊</Text>
        <View style={styles.badgeRow}>
          {routeLocked && (
            <View style={[styles.badge, { backgroundColor: "#fff3e0" }]}>
              <Text style={[styles.badgeText, { color: "#e65100" }]}>
                路線鎖定
              </Text>
            </View>
          )}
          <PlatformTaskBadge platformCode={task.sourcePlatform} />
        </View>
      </View>

      {forwarded && (
        <Text style={styles.note}>
          {routeIntent
            ? `來源平台指定路線：${routeIntent}`
            : "此任務路線由來源平台管理，請依平台同步資訊執行。"}
        </Text>
      )}

      {routeProvided === false && (
        <Text style={styles.hint}>
          來源平台未提供完整路線，先顯示上下車點供確認。
        </Text>
      )}

      {displayWaypoints.length > 0 ? (
        <View style={styles.list}>
          {displayWaypoints.map((wp, i) => (
            <View key={`${wp.label}-${i}`} style={styles.row}>
              <Text style={styles.wpLabel}>{wp.label}</Text>
              <Text style={styles.wpAddress} numberOfLines={1}>
                {wp.address}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.empty}>目前沒有可顯示的路線資料。</Text>
      )}

      {!routeLocked && (
        <Text style={styles.link} onPress={onEditPress}>
          編輯路線
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 8,
    padding: 12,
    backgroundColor: "#fafafa",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#eee",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  sectionTitle: { fontWeight: "700", fontSize: 16 },
  badgeRow: { flexDirection: "row", alignItems: "center" },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    marginRight: 6,
  },
  badgeText: { fontSize: 11, fontWeight: "600" },
  note: { fontSize: 12, color: "#555", marginBottom: 4 },
  hint: {
    fontSize: 12,
    color: "#8d6e63",
    fontStyle: "italic",
    marginBottom: 4,
  },
  list: { marginTop: 4 },
  row: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  wpLabel: { width: 68, color: "#555", fontWeight: "600" },
  wpAddress: { flex: 1, color: "#222" },
  empty: { color: "#777", fontStyle: "italic" },
  link: { marginTop: 8, color: "#007AFF", fontSize: 14 },
});
