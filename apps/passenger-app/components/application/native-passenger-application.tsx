import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { PassengerLoginScreen } from "../auth/passenger-login-screen";
import { NativeBookingScreen } from "../booking/native-booking-screen";
import { NativePaymentMethodsScreen } from "../payment/native-payment-methods-screen";
import { PassengerAccountScreen } from "../account/passenger-account-screen";
import { PassengerHistoryScreen } from "../history/passenger-history-screen";
import { NativeP5Screen } from "../ride/native-p5-screen";
import { NativePassengerRuntime } from "../../lib/native-passenger-runtime";

const RuntimeContext = createContext<NativePassengerRuntime | null>(null);
export function NativePassengerRuntimeProvider({
  runtime,
  children,
}: {
  runtime: NativePassengerRuntime;
  children: React.ReactNode;
}) {
  useEffect(() => {
    void runtime.start();
    return () => runtime.dispose();
  }, [runtime]);
  return (
    <RuntimeContext.Provider value={runtime}>
      {children}
    </RuntimeContext.Provider>
  );
}
export function useNativePassengerRuntime() {
  const runtime = useContext(RuntimeContext);
  if (!runtime) throw new Error("NativePassengerRuntimeProvider is required");
  const state = useSyncExternalStore(
    runtime.subscribe,
    runtime.getSnapshot,
    runtime.getSnapshot,
  );
  return { runtime, state };
}
function Action({
  id,
  label,
  onPress,
  disabled = false,
}: {
  id: string;
  label: string;
  onPress(): void | Promise<void>;
  disabled?: boolean;
}) {
  return (
    <Pressable
      testID={id}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={{ padding: 12, minHeight: 44 }}
    >
      <Text>{label}</Text>
    </Pressable>
  );
}
function SupportForm({
  runtime,
  orderId,
  category,
}: {
  runtime: NativePassengerRuntime;
  orderId: string;
  category: "service" | "lost_item";
}) {
  const [content, setContent] = useState("");
  const [description, setDescription] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [caseId, setCaseId] = useState("");
  const [requestId] = useState(() => runtime.options.newRequestId());
  async function submit() {
    if (busy || caseId || !content.trim()) return;
    setBusy(true);
    setError("");
    try {
      const result = await runtime.passenger.createComplaint(
        orderId,
        {
          rideId: orderId,
          category,
          content: content.trim(),
          contactConsent: consent,
          ...(category === "lost_item" && description.trim()
            ? { lostItemDescription: description.trim() }
            : {}),
        },
        requestId,
      );
      if (!result.complaintId) throw new Error("unconfirmed");
      setCaseId(result.complaintId);
    } catch {
      setError("申報尚未完成，請重試；原內容已保留。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <ScrollView testID="app-support-screen">
      <Text accessibilityRole="header">
        {category === "lost_item" ? "遺失物申報" : "行程客訴"}
      </Text>
      {caseId ? (
        <Text testID="app-support-success">申報已送出，案件編號：{caseId}</Text>
      ) : (
        <>
          {category === "lost_item" && (
            <TextInput
              testID="app-lost-item"
              accessibilityLabel="遺失物描述"
              value={description}
              editable={!busy}
              onChangeText={setDescription}
            />
          )}
          <TextInput
            testID="app-support-content"
            accessibilityLabel="申報內容"
            value={content}
            multiline
            editable={!busy}
            onChangeText={setContent}
          />
          <Text>同意客服聯繫</Text>
          <Switch
            testID="app-support-consent"
            accessibilityLabel="同意客服聯繫"
            value={consent}
            disabled={busy}
            onValueChange={setConsent}
          />
          {!!error && (
            <Text testID="app-support-error" accessibilityRole="alert">
              {error}
            </Text>
          )}
          <Action
            id="app-support-submit"
            label="送出申報"
            disabled={busy || !content.trim()}
            onPress={submit}
          />
        </>
      )}
      <Action
        id="app-support-history"
        label="返回行程紀錄"
        onPress={() => runtime.navigate("history")}
      />
    </ScrollView>
  );
}
function ApplicationBody() {
  const { runtime, state } = useNativePassengerRuntime();
  const options = runtime.options;
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState("");
  useEffect(() => {
    if (
      state.route.kind !== "ride" ||
      state.presentation?.contentKind === "cancelled_terminal"
    )
      return;
    const timer = setInterval(() => runtime.updateClock(), 1000);
    return () => clearInterval(timer);
  }, [runtime, state.route.kind, state.presentation?.contentKind]);
  async function confirmCancel() {
    if (cancelBusy) return;
    setCancelBusy(true);
    setCancelError("");
    try {
      await runtime.confirmCancel();
    } catch {
      setCancelError("取消尚未確認，請重試或重新讀取行程。");
    } finally {
      setCancelBusy(false);
    }
  }
  if (state.phase === "restoring")
    return (
      <View testID="app-restoring">
        <ActivityIndicator />
        <Text>正在恢復登入狀態…</Text>
      </View>
    );
  if (state.phase === "unavailable")
    return (
      <View>
        <Text testID="app-start-error">{state.message}</Text>
        <Action
          id="app-retry-start"
          label="重新讀取帳號"
          onPress={() => runtime.retryRestore()}
        />
      </View>
    );
  if (state.phase === "signed_out")
    return (
      <View testID="app-login">
        {!!state.message && (
          <Text testID="app-session-message">{state.message}</Text>
        )}
        {options.browser.status === "unavailable" && (
          <Text>
            系統瀏覽器尚未提供，第三方登入步驟略過；可使用已提供的其他登入方式。
          </Text>
        )}
        <PassengerLoginScreen
          key={state.identityVersion}
          auth={runtime.auth}
          session={runtime.session}
          passenger={runtime.passenger}
          browser={
            options.browser.status === "ready"
              ? options.browser.port
              : {
                  openAuthSession: async () => {
                    throw new Error("browser_unavailable");
                  },
                }
          }
          callbackUri={options.callbackUri}
          mode={options.mode}
          {...(options.demoOtpHint ? { demoOtpHint: options.demoOtpHint } : {})}
          onAuthenticated={(account) =>
            runtime.authenticate(account, state.identityVersion)
          }
        />
      </View>
    );
  return (
    <View testID="native-passenger-application" style={{ flex: 1 }}>
      {options.mode === "demo" && (
        <Text testID="app-demo-banner">
          模擬示意：外部服務與資料使用測試介面，未執行真實預約、付款或訊息送達。
        </Text>
      )}
      <Text testID="app-push-status">{state.pushMessage}</Text>
      {options.notifications?.status === "ready" &&
        options.notifications.enabled && (
          <Action
            id="app-enable-notifications"
            label="開啟或重試行程通知"
            onPress={() => runtime.requestNotifications()}
          />
        )}
      {options.notifications?.status !== "ready" && (
        <Text testID="app-push-skipped">
          {options.notifications?.status === "disabled"
            ? "推播尚未啟用，已略過此步驟。"
            : "推播送達服務尚未提供，已略過此外部步驟。"}
        </Text>
      )}
      <Text testID="app-account-label">
        {state.account?.displayName ?? "乘客"}
      </Text>
      <View
        accessibilityLabel="主選單"
        style={{ flexDirection: "row", flexWrap: "wrap" }}
      >
        {(["home", "history", "payment", "account"] as const).map((kind) => (
          <Action
            key={kind}
            id={`app-nav-${kind}`}
            label={
              {
                home: "預約叫車",
                history: "乘車紀錄",
                payment: "付款方式",
                account: "我的帳戶",
              }[kind]
            }
            onPress={() => runtime.navigate(kind)}
          />
        ))}
      </View>
      {!!state.message && (
        <Text testID="app-message" accessibilityRole="alert">
          {state.message}
        </Text>
      )}
      <View key={state.identityVersion} style={{ flex: 1 }}>
        {state.route.kind === "home" && (
          <NativeBookingScreen
            client={runtime.booking}
            paymentClient={runtime.payment}
            mode={options.mode}
            map={options.bookingMap}
            now={runtime.now}
            newRequestId={() => options.newRequestId()}
            onCreated={(ride) => runtime.openRide(ride, state.identityVersion)}
            onAccount={() => runtime.navigate("account")}
            onPaymentMethods={() => runtime.navigate("payment")}
            onSessionUnavailable={() => runtime.sessionUnavailable()}
            onSupport={() => runtime.contactSupport()}
          />
        )}
        {state.route.kind === "history" && (
          <PassengerHistoryScreen
            passenger={runtime.passenger}
            mode={options.mode}
            onOpenRide={(ride) => runtime.openRide(ride, state.identityVersion)}
          />
        )}
        {state.route.kind === "payment" && (
          <NativePaymentMethodsScreen
            client={runtime.payment}
            fields={options.paymentFields}
            browser={options.paymentBrowser}
            onSupport={() => runtime.contactSupport()}
          />
        )}
        {state.route.kind === "account" && (
          <PassengerAccountScreen
            passenger={runtime.passenger}
            session={runtime.session}
            beforeSessionEnd={() => runtime.beforeSessionEnd()}
            onSessionEndFailed={() => runtime.sessionEndFailed()}
            {...(options.browser.status === "ready"
              ? {
                  oauth: {
                    browser: options.browser.port,
                    callbackUri: options.callbackUri,
                  },
                }
              : {})}
            mode={options.mode}
            {...(options.policy ? { policy: options.policy } : {})}
            {...(options.demoOtpHint
              ? { demoOtpHint: options.demoOtpHint }
              : {})}
            onAccountChanged={(account) =>
              runtime.updateAccount(account, state.identityVersion)
            }
            onSignedOut={(result) =>
              runtime.signedOut(result, state.identityVersion)
            }
          />
        )}
        {state.route.kind === "support" && (
          <SupportForm
            key={`${state.route.orderId}-${state.route.category}`}
            runtime={runtime}
            orderId={state.route.orderId}
            category={state.route.category}
          />
        )}
        {state.route.kind === "ride" && state.presentation && (
          <View testID="app-ride">
            {!options.events && (
              <Text testID="app-events-skipped">
                即時更新尚未提供，已略過此步驟；可重新讀取行程。
              </Text>
            )}
            {!options.receipts && (
              <Text testID="app-download-skipped">
                檔案下載尚未提供，已略過此步驟。
              </Text>
            )}
            {!!state.receiptMessage && (
              <Text testID="app-receipt-message">{state.receiptMessage}</Text>
            )}
            <Action
              id="app-refresh-ride"
              label="重新讀取行程"
              onPress={() => runtime.retryRide()}
            />
            <NativeP5Screen
              presentation={state.presentation}
              actions={runtime.p5Actions()}
              {...(options.renderRideMap
                ? { renderMap: options.renderRideMap }
                : {})}
            />
          </View>
        )}
      </View>
      {state.cancelConfirmation && (
        <Modal
          transparent
          visible
          onRequestClose={() => runtime.dismissCancel()}
        >
          <View testID="app-cancel-confirmation">
            <Text>確認取消這趟行程？任何可取消階段都不收取消費。</Text>
            {!!cancelError && (
              <Text testID="app-cancel-error" accessibilityRole="alert">
                {cancelError}
              </Text>
            )}
            <Action
              id="app-confirm-cancel"
              label="確認取消行程"
              disabled={cancelBusy}
              onPress={confirmCancel}
            />
            <Action
              id="app-keep-ride"
              label="保留行程"
              disabled={cancelBusy}
              onPress={() => runtime.dismissCancel()}
            />
          </View>
        </Modal>
      )}
    </View>
  );
}
/** No Expo singleton/package assumptions: original App supplies concrete platform ports. */
export function NativePassengerApplication({
  runtime,
}: {
  runtime: NativePassengerRuntime;
}) {
  return (
    <NativePassengerRuntimeProvider runtime={runtime}>
      <ApplicationBody />
    </NativePassengerRuntimeProvider>
  );
}
