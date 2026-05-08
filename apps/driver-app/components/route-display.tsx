import React from "react";
import { View, Text, StyleSheet, Alert } from "react-native";
import type { DriverTaskRecord, OwnedOrderRecord } from "@drts/contracts";
import PlatformTaskBadge, {
  PlatformAuthorityBanner,
} from "@/components/platform-task-badge";
import { Tokens } from "@/components/ui/tokens";

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
  const routeAuthorityDescription = forwarded
    ? routeIntent
      ? `來源平台指定路線：${routeIntent}`
      : "此任務路線由來源平台管理，本地只顯示同步過來的站點資訊。"
    : routeProvided === false
      ? "目前僅有上下車點摘要；如需調整，請與派車台確認後再更新。"
      : "此路線由 DRTS 任務管理，可依派遣規則確認或調整。";

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
        <View>
          <Text style={styles.eyebrow}>Route</Text>
          <Text style={styles.sectionTitle}>路線資訊</Text>
        </View>
        <View style={styles.badgeRow}>
          {routeLocked && (
            <View style={styles.lockBadge}>
              <Text style={styles.lockBadgeText}>路線鎖定</Text>
            </View>
          )}
          <PlatformTaskBadge platformCode={task.sourcePlatform} />
        </View>
      </View>

      <PlatformAuthorityBanner
        platformCode={task.sourcePlatform}
        description={routeAuthorityDescription}
      />

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
              <View style={styles.timelineColumn}>
                <View
                  style={[
                    styles.dot,
                    i === 0 ? styles.pickupDot : styles.dropoffDot,
                  ]}
                />
                {i < displayWaypoints.length - 1 ? (
                  <View style={styles.connector} />
                ) : null}
              </View>
              <View style={styles.wpContent}>
                <Text style={styles.wpLabel}>{wp.label}</Text>
                <Text style={styles.wpAddress}>{wp.address}</Text>
              </View>
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
    padding: Tokens.spacing.lg,
    backgroundColor: Tokens.colors.surface,
    borderRadius: Tokens.radius.lg,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    gap: Tokens.spacing.md,
    ...Tokens.shadows.sm,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: Tokens.spacing.sm,
  },
  eyebrow: {
    ...Tokens.type.micro,
    color: Tokens.colors.textDim,
    marginBottom: 2,
  },
  sectionTitle: {
    ...Tokens.type.title,
    color: Tokens.colors.text,
    fontWeight: "700",
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: Tokens.spacing.xs,
  },
  lockBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Tokens.radius.full,
    backgroundColor: Tokens.colors.warningBg,
  },
  lockBadgeText: {
    ...Tokens.type.micro,
    color: Tokens.colors.warning,
  },
  note: {
    ...Tokens.type.small,
    color: Tokens.colors.textMuted,
  },
  hint: {
    ...Tokens.type.small,
    color: Tokens.colors.warning,
  },
  list: {
    gap: Tokens.spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Tokens.spacing.sm,
  },
  timelineColumn: {
    alignItems: "center",
    width: 14,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: Tokens.radius.full,
    marginTop: 5,
  },
  pickupDot: {
    backgroundColor: Tokens.colors.success,
    shadowColor: Tokens.colors.success,
    shadowOpacity: 0.18,
    shadowRadius: 4,
  },
  dropoffDot: {
    backgroundColor: Tokens.colors.danger,
    shadowColor: Tokens.colors.danger,
    shadowOpacity: 0.18,
    shadowRadius: 4,
  },
  connector: {
    width: 1.5,
    flex: 1,
    minHeight: 28,
    marginTop: 4,
    borderLeftWidth: 1.5,
    borderStyle: "dashed",
    borderColor: Tokens.colors.borderStrong,
  },
  wpContent: {
    flex: 1,
    gap: 2,
  },
  wpLabel: {
    ...Tokens.type.micro,
    color: Tokens.colors.textDim,
  },
  wpAddress: {
    ...Tokens.type.bodyStrong,
    color: Tokens.colors.text,
  },
  empty: {
    ...Tokens.type.small,
    color: Tokens.colors.textDim,
    fontStyle: "italic",
  },
  link: {
    ...Tokens.type.label,
    color: Tokens.colors.brand,
  },
});
