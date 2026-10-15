import React, { useState, useSyncExternalStore } from "react";
import { Pressable, Text, View } from "react-native";
import type { NativePassengerRuntime } from "../native-passenger-runtime";
import type { NativeBookingMapAvailability } from "../../components/booking/native-booking-screen";
import type { NativePassengerDemoScenario } from "./native-passenger-demo";
import { NATIVE_DEMO_ADDRESSES } from "./native-passenger-demo-fixtures";

/** Demo-only external scenario controls; never mounted in configured mode. */
export function NativePassengerDemoControls({
  runtime,
  demoScenario,
}: {
  runtime: NativePassengerRuntime;
  demoScenario: NativePassengerDemoScenario;
}) {
  const state = useSyncExternalStore(
    runtime.subscribe,
    runtime.getSnapshot,
    runtime.getSnapshot,
  );
  const demo = useSyncExternalStore(
    demoScenario.subscribe,
    demoScenario.getSnapshot,
    demoScenario.getSnapshot,
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const id =
    state.route.kind === "ride" ? state.route.orderId : demo.rides[0]?.orderId;
  const ride = demo.rides.find((item) => item.orderId === id);
  async function run(action: (id: string) => void) {
    if (!id || busy) return;
    setBusy(true);
    setError("");
    try {
      action(id);
      if (runtime.getSnapshot().route.kind === "ride")
        await runtime.retryRide();
    } catch {
      setError("示意操作未完成，請確認目前行程階段。");
    } finally {
      setBusy(false);
    }
  }
  const button = (
    testID: string,
    label: string,
    action: (id: string) => void,
    unavailable: boolean,
  ) => (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={busy || unavailable}
      onPress={() => run(action)}
      style={{ padding: 12 }}
    >
      <Text>{label}</Text>
    </Pressable>
  );
  return (
    <View testID="native-demo-controls" style={{ padding: 12, borderWidth: 1 }}>
      <Text accessibilityRole="header">DEMO 外部流程示意</Text>
      <Text>{demo.notice}</Text>
      <Text testID="demo-last-action">{demo.lastAction}</Text>
      {!ride && <Text>示意登入並建立預約後，可模擬司機進度與付款結果。</Text>}
      {button(
        "demo-advance-trip",
        "模擬司機前進一步",
        demoScenario.controls.advanceTrip,
        !ride || ["completed", "cancelled"].includes(ride.status),
      )}
      {button(
        "demo-payment-failed",
        "模擬付款失敗（未扣款）",
        demoScenario.controls.setPaymentFailed,
        ride?.status !== "completed",
      )}
      {button(
        "demo-payment-complete",
        "模擬付款完成（未扣款）",
        demoScenario.controls.completeDemoPayment,
        ride?.status !== "completed",
      )}
      {!!error && (
        <Text testID="demo-control-error" accessibilityRole="alert">
          {error}
        </Text>
      )}
      {demo.lastOpenedFile && (
        <Text testID="demo-file-notice">
          示意HTML已儲存在記憶體；PDF未提供，不是正式乘車證明。
        </Text>
      )}
      <Text>
        簡訊、OAuth、PSP與推播送達都是模擬或略過；沒有真實外部服務操作。
      </Text>
    </View>
  );
}

/** A labeled RN illustration, not a native map provider or geocoding result. */
export function createNativePassengerDemoBookingMap(): NativeBookingMapAvailability {
  return {
    status: "ready",
    kind: "synthetic",
    render(input) {
      return (
        <View testID="demo-booking-map">
          <Text>DEMO 示意地圖（固定測試地點，非實際地圖）</Text>
          <Text>
            {input.origin?.address ?? "尚未選擇示意起點"} →{" "}
            {input.destination?.address ?? "尚未選擇示意終點"}
          </Text>
          {(["origin", "destination"] as const).map((field, index) => (
            <Pressable
              key={field}
              testID={`demo-map-${field}`}
              accessibilityRole="button"
              disabled={input.disabled}
              onPress={() =>
                input.onPick(field, {
                  lat: NATIVE_DEMO_ADDRESSES[index]!.lat,
                  lng: NATIVE_DEMO_ADDRESSES[index]!.lng,
                })
              }
              style={{ padding: 12 }}
            >
              <Text>
                {field === "origin" ? "選擇示意上車點" : "選擇示意下車點"}
              </Text>
            </Pressable>
          ))}
        </View>
      );
    },
  };
}
