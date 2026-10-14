import React, { useState } from "react";
import { Text, View } from "react-native";
import { NativePassengerApplication } from "../components/application/native-passenger-application";
import { NativePassengerRuntime } from "./native-passenger-runtime";
import {
  readNativePassengerBootstrapConfig,
  type NativePassengerBootstrapConfig,
} from "./config";
import { createNativePassengerPlatformPorts } from "./platform/native-passenger-platform-ports";
import { createNativePassengerDemoRuntimeOptions } from "./demo/native-passenger-demo";
import {
  NativePassengerDemoControls,
  createNativePassengerDemoBookingMap,
} from "./demo/native-demo-controls";

export function createNativePassengerBootstrap(
  config: NativePassengerBootstrapConfig,
) {
  if (config.mode === "demo") {
    const options = createNativePassengerDemoRuntimeOptions({
      bookingMap: createNativePassengerDemoBookingMap(),
    });
    return {
      mode: "demo" as const,
      runtime: new NativePassengerRuntime(options),
      demoScenario: options.demoScenario,
    };
  }
  const ports = createNativePassengerPlatformPorts({
    baseUrl: config.baseUrl,
    callbackUri: config.callbackUri,
  });
  return {
    mode: "configured" as const,
    runtime: new NativePassengerRuntime({
      ...ports,
      baseUrl: config.baseUrl,
      callbackUri: config.callbackUri,
      mode: "configured",
    }),
  };
}

/** Expo entry owns one runtime per mount; the actual Application owns its provider lifecycle. */
export function NativePassengerBootstrap() {
  const [bootstrap] = useState(() => {
    try {
      return createNativePassengerBootstrap(
        readNativePassengerBootstrapConfig(),
      );
    } catch {
      return null;
    }
  });
  if (!bootstrap)
    return (
      <View testID="passenger-bootstrap-unavailable">
        <Text accessibilityRole="alert">
          應用程式設定尚未完成，請聯絡服務提供者。
        </Text>
      </View>
    );
  return (
    <View style={{ flex: 1 }} testID="passenger-bootstrap">
      {bootstrap.mode === "demo" && (
        <Text testID="passenger-bootstrap-demo">
          模擬示意：使用本機示意資料，沒有真實預約、付款或訊息送達。
        </Text>
      )}
      <NativePassengerApplication runtime={bootstrap.runtime} />
      {bootstrap.mode === "demo" && (
        <NativePassengerDemoControls
          runtime={bootstrap.runtime}
          demoScenario={bootstrap.demoScenario}
        />
      )}
    </View>
  );
}
