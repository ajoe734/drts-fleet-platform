import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { WebView } from "react-native-webview";
import type {
  PassengerPaymentClient,
  PassengerPaymentFieldsAvailability,
} from "@drts/passenger-client";
import { PASSENGER_P5_COLORS as p5 } from "@drts/ui-tokens";
import {
  createNativeEcpayFieldsBridge,
  createNativeEcpayHostedFieldsHtml,
  type NativeEcpayFieldsBridge,
} from "../../lib/payment/native-ecpay-fields-bridge";

export interface NativeEcpayHostedFieldsProps {
  client: PassengerPaymentClient;
  onReady(fields: PassengerPaymentFieldsAvailability): void;
}
interface HostedInstance {
  client: PassengerPaymentClient;
  attempt: number;
  generation: number;
  bridge: NativeEcpayFieldsBridge;
  source: { html: string };
}

/** Uses the same owner-authenticated session and Web SDK flow as the Web app. */
export function NativeEcpayHostedFields({
  client,
  onReady,
}: NativeEcpayHostedFieldsProps) {
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const currentClient = useRef(client);
  currentClient.current = client;
  const webView = useRef<WebView>(null);
  const currentBridge = useRef<NativeEcpayFieldsBridge | null>(null);
  const generation = useRef(0);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [instance, setInstance] = useState<HostedInstance | null>(null);

  useEffect(() => {
    let active = true;
    let bridge: NativeEcpayFieldsBridge | null = null;
    const ticket = ++generation.current;
    function live() {
      return (
        active &&
        currentClient.current === client &&
        generation.current === ticket
      );
    }
    setStatus("loading");
    setInstance(null);
    onReadyRef.current({ status: "unavailable" });
    void client
      .getBindingSession()
      .then((session) => {
        if (!live()) return;
        bridge = createNativeEcpayFieldsBridge({
          sendJavaScript(script) {
            if (!live() || !webView.current)
              throw new Error("ecpay_fields_unavailable");
            webView.current.injectJavaScript(script);
          },
          onReady(fields) {
            if (!live()) return;
            if (fields.status === "ready") setStatus("ready");
            onReadyRef.current(fields);
          },
          onError() {
            if (live()) setStatus("error");
          },
        });
        currentBridge.current = bridge;
        setInstance({
          client,
          attempt,
          generation: ticket,
          bridge,
          source: { html: createNativeEcpayHostedFieldsHtml(session) },
        });
      })
      .catch(() => {
        if (!live()) return;
        onReadyRef.current({ status: "unavailable" });
        setStatus("error");
      });
    return () => {
      active = false;
      bridge?.dispose();
      if (currentBridge.current === bridge) currentBridge.current = null;
      onReadyRef.current({ status: "unavailable" });
    };
  }, [client, attempt]);

  const host =
    instance?.client === client && instance.attempt === attempt
      ? instance
      : null;
  function retry() {
    currentBridge.current?.dispose();
    currentBridge.current = null;
    setInstance(null);
    setStatus("loading");
    setAttempt((value) => value + 1);
  }
  return (
    <View testID="native-ecpay-fields" style={styles.container}>
      {status === "loading" && (
        <View testID="native-ecpay-loading" style={styles.loading}>
          <ActivityIndicator />
          <Text style={styles.note}>正在載入安全刷卡元件…</Text>
        </View>
      )}
      {status === "error" && (
        <View testID="native-ecpay-error" style={styles.error}>
          <Text style={styles.note}>無法載入安全刷卡元件，請稍後重試。</Text>
          <Pressable
            testID="native-ecpay-retry"
            accessibilityRole="button"
            accessibilityLabel="重新載入安全刷卡元件"
            onPress={retry}
            style={styles.retry}
          >
            <Text style={styles.text}>重新載入</Text>
          </Pressable>
        </View>
      )}
      {host && status !== "error" && (
        <WebView
          key={host.generation}
          ref={webView}
          testID="native-ecpay-webview"
          source={host.source}
          originWhitelist={["*"]}
          javaScriptEnabled
          style={styles.webView}
          onMessage={(event) => {
            if (
              currentClient.current === host.client &&
              currentBridge.current === host.bridge
            )
              host.bridge.handleMessage(event.nativeEvent.data);
          }}
          onError={() => host.bridge.fail()}
          onHttpError={() => host.bridge.fail()}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: p5.line,
    borderRadius: 12,
  },
  loading: { gap: 8 },
  error: { gap: 8 },
  text: { fontSize: 16, color: p5.ink },
  note: { fontSize: 14, color: p5.mut },
  retry: {
    padding: 12,
    borderWidth: 1,
    borderColor: p5.line,
    borderRadius: 8,
  },
  webView: { height: 440, backgroundColor: p5.surface },
});
