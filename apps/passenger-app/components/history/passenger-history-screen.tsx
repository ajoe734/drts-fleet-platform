import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  PassengerApiError,
  type GetPassengerRidesQuery,
  type PassengerClient,
} from "@drts/passenger-client";
import type { PassengerRideAuthorityView } from "@drts/contracts";

export interface PassengerHistoryScreenProps {
  passenger: PassengerClient;
  mode: "configured" | "demo";
  onOpenRide(ride: PassengerRideAuthorityView): void | Promise<void>;
  pageSize?: number;
}
type Status = GetPassengerRidesQuery["status"];
const statusLabels: Record<
  PassengerRideAuthorityView["order"]["status"],
  string
> = {
  created: "已建立",
  recording_pending: "資料確認中",
  ready_for_dispatch: "準備派車",
  preassigned: "已安排車輛",
  assigned: "已指派車輛",
  driver_accepted: "司機已接單",
  enroute_pickup: "司機前往上車點",
  arrived_pickup: "司機已抵達",
  on_trip: "行程中",
  proof_pending: "完成資料確認中",
  completed: "已完成",
  cancelled: "已取消",
  redispatch_required: "重新安排車輛",
  dispatch_failed: "目前未能派車",
  dispatch_timeout: "派車逾時",
  no_supply: "目前沒有可用車輛",
  delayed_queue: "等候派車",
  exception_hold: "行程暫停處理",
};
const filters: Array<{ status: Status; label: string }> = [
  { status: undefined, label: "全部" },
  { status: "active", label: "進行中" },
  { status: "completed", label: "已完成" },
  { status: "cancelled", label: "已取消" },
];
/** List/cursor and selected detail come from the existing owned account SDK. */
export function PassengerHistoryScreen({
  passenger,
  mode,
  onOpenRide,
  pageSize = 20,
}: PassengerHistoryScreenProps) {
  const [rides, setRides] = useState<PassengerRideAuthorityView[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [status, setStatus] = useState<Status>();
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const active = useRef(true);
  const running = useRef(false);

  async function run(operation: () => Promise<void>) {
    if (running.current || !active.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      await operation();
    } catch (failure) {
      if (active.current)
        setError(
          failure instanceof PassengerApiError && failure.status === 404
            ? "這筆行程目前無法讀取，請重新整理。"
            : "無法讀取行程紀錄，請重試。",
        );
    } finally {
      running.current = false;
      if (active.current) setBusy(false);
    }
  }
  async function load(append = false, nextStatus: Status | null = status) {
    await run(async () => {
      const result = await passenger.getRides({
        limit: pageSize,
        ...(nextStatus ? { status: nextStatus } : {}),
        ...(append && cursor ? { cursor } : {}),
      });
      if (!active.current) return;
      setRides((previous) => {
        const combined = append ? [...previous, ...result.rides] : result.rides;
        return [
          ...new Map(
            combined.map((ride) => [ride.order.orderId, ride]),
          ).values(),
        ];
      });
      setStatus(nextStatus ?? undefined);
      setCursor(result.nextCursor);
      setLoaded(true);
    });
  }
  useEffect(() => {
    active.current = true;
    void load(false, null);
    return () => {
      active.current = false;
    };
  }, [passenger, pageSize]);
  async function open(id: string) {
    await run(async () => {
      const result = await passenger.getRide(id);
      if (active.current) await onOpenRide(result.ride);
    });
  }
  const action = (
    id: string,
    label: string,
    onPress: () => Promise<void>,
    selected = false,
  ) => (
    <Pressable
      testID={id}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled: busy }}
      disabled={busy}
      onPress={onPress}
      style={styles.button}
    >
      <Text>{label}</Text>
    </Pressable>
  );
  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text accessibilityRole="header" style={styles.title}>
        乘車紀錄
      </Text>
      {mode === "demo" && (
        <Text testID="history-demo-banner">
          模擬示意：行程紀錄與 API 回應使用測試資料，並非真實乘車紀錄。
        </Text>
      )}
      <View>
        {filters.map((filter) => (
          <React.Fragment key={filter.status ?? "all"}>
            {action(
              `history-filter-${filter.status ?? "all"}`,
              filter.label,
              () => load(false, filter.status ?? null),
              filter.status === status,
            )}
          </React.Fragment>
        ))}
      </View>
      {action("history-refresh", "重新整理", () => load())}
      {busy && (
        <ActivityIndicator
          testID="history-loading"
          accessibilityLabel="讀取行程中"
        />
      )}
      {!!error && (
        <Text testID="history-error" accessibilityRole="alert">
          {error}
        </Text>
      )}
      {loaded && !busy && rides.length === 0 && (
        <Text testID="history-empty">目前沒有乘車紀錄。</Text>
      )}
      {rides.map((ride) => (
        <View
          key={ride.order.orderId}
          testID={`history-row-${ride.order.orderId}`}
        >
          <Text>{ride.order.orderNo}</Text>
          <Text>{ride.order.requestedPickupAt}</Text>
          <Text>{ride.order.pickup.address}</Text>
          <Text>{ride.order.dropoff.address}</Text>
          <Text>{statusLabels[ride.order.status]}</Text>
          {action(
            `history-open-${ride.order.orderId}`,
            `開啟行程 ${ride.order.orderNo}`,
            () => open(ride.order.orderId),
          )}
        </View>
      ))}
      {!!cursor && action("history-more", "載入更多", () => load(true))}
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  screen: { padding: 20, gap: 12 },
  title: { fontSize: 24, fontWeight: "600" },
  button: { minHeight: 44, paddingVertical: 12 },
});
