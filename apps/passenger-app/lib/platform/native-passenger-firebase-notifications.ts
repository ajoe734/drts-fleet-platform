import * as SecureStore from "expo-secure-store";
import { Alert, AppState, PermissionsAndroid, Platform } from "react-native";
import type { NativePassengerNotifications } from "../native-passenger-runtime";
import type { NativePassengerPushRegistration } from "@drts/passenger-client";

/** Only the actual RNFirebase23 modular boundary is replaceable by a native SDK test double. */
export type NativePassengerFirebaseMessagingSDK = Pick<
  typeof import("@react-native-firebase/messaging"),
  | "AuthorizationStatus"
  | "getMessaging"
  | "getToken"
  | "onTokenRefresh"
  | "hasPermission"
  | "requestPermission"
  | "onNotificationOpenedApp"
  | "getInitialNotification"
  | "onMessage"
  | "isDeviceRegisteredForRemoteMessages"
  | "registerDeviceForRemoteMessages"
>;
export interface NativePassengerFirebaseNotificationsInput {
  platform: string;
  appId: string;
  appVersion: string;
  notificationConsentVersion: string;
  nativeConfigured: boolean;
  loadSDK?: () => Promise<NativePassengerFirebaseMessagingSDK>;
}
type PermissionStatus = "granted" | "denied" | "undetermined";
type FirebaseContext = {
  sdk: NativePassengerFirebaseMessagingSDK;
  messaging: ReturnType<NativePassengerFirebaseMessagingSDK["getMessaging"]>;
};
const registrationKey = "drts.passenger.push.v1";

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** A configured native build loads Firebase only when the existing notification lifecycle does IO. */
export function createNativePassengerFirebaseNotifications(
  input: NativePassengerFirebaseNotificationsInput,
): NativePassengerNotifications {
  if (
    input.nativeConfigured !== true ||
    (input.platform !== "ios" && input.platform !== "android") ||
    !nonempty(input.appId) ||
    !nonempty(input.appVersion) ||
    !nonempty(input.notificationConsentVersion)
  )
    return { status: "unavailable" };

  const platform = input.platform;
  const loadSDK =
    input.loadSDK ?? (() => import("@react-native-firebase/messaging"));
  const permissionListeners = new Set<() => void>();
  const tokenListeners = new Set<() => void>();
  const clickListeners = new Set<(data: unknown) => void>();
  let contextPromise: Promise<FirebaseContext> | undefined;
  let connectionPromise: Promise<FirebaseContext> | undefined;
  let connectionEpoch = 0;
  let removeNativeListeners: Array<() => void> = [];
  let initialConsumed = false;
  let bridgeFailure: { error: unknown } | undefined;

  function context(): Promise<FirebaseContext> {
    if (!contextPromise) {
      const pending = Promise.resolve()
        .then(loadSDK)
        .then((sdk) => ({ sdk, messaging: sdk.getMessaging() }));
      contextPromise = pending;
      void pending.catch(() => {
        if (contextPromise === pending) contextPromise = undefined;
      });
    }
    return contextPromise;
  }
  function hasListeners() {
    return (
      permissionListeners.size > 0 ||
      tokenListeners.size > 0 ||
      clickListeners.size > 0
    );
  }
  function current(epoch: number) {
    return epoch === connectionEpoch && hasListeners();
  }
  function reportBridgeFailure(error: unknown, epoch: number) {
    if (!current(epoch) || bridgeFailure?.error === error) return;
    bridgeFailure = { error };
    // The existing lifecycle rechecks getStatus and presents its normal runtime error.
    for (const listener of [...permissionListeners]) {
      if (!current(epoch)) return;
      if (permissionListeners.has(listener)) listener();
    }
  }
  function emitClicks(
    data: unknown,
    epoch: number,
    recipients = [...clickListeners],
  ) {
    for (const listener of recipients) {
      if (!current(epoch)) return;
      if (clickListeners.has(listener)) listener(data);
    }
  }
  function consumeInitial({ sdk, messaging }: FirebaseContext, epoch: number) {
    if (!current(epoch) || initialConsumed || clickListeners.size === 0) return;
    // A late cold-start result belongs only to the first subscribing session.
    initialConsumed = true;
    const recipients = [...clickListeners];
    void Promise.resolve()
      .then(() => {
        if (!current(epoch)) return null;
        return sdk.getInitialNotification(messaging);
      })
      .then((message) => {
        if (message) emitClicks(message.data, epoch, recipients);
      })
      .catch((error: unknown) => reportBridgeFailure(error, epoch));
  }
  function connect(): Promise<FirebaseContext> {
    if (!hasListeners()) return context();
    if (!connectionPromise) {
      const epoch = connectionEpoch;
      const pending = context().then((native) => {
        if (!current(epoch)) return native;
        const { sdk, messaging } = native;
        const removers: Array<() => void> = [];
        try {
          removers.push(
            sdk.onTokenRefresh(messaging, () => {
              for (const listener of [...tokenListeners]) {
                if (!current(epoch)) return;
                if (tokenListeners.has(listener)) listener();
              }
            }),
          );
          removers.push(
            sdk.onNotificationOpenedApp(messaging, (message) => {
              emitClicks(message.data, epoch);
            }),
          );
          removers.push(
            sdk.onMessage(messaging, (message) => {
              if (!current(epoch) || clickListeners.size === 0) return;
              const recipients = [...clickListeners];
              Alert.alert("乘車通知", "請查看最新乘車資訊", [
                { text: "稍後", style: "cancel" },
                {
                  text: "查看行程",
                  onPress: () => emitClicks(message.data, epoch, recipients),
                },
              ]);
            }),
          );
        } catch (error) {
          for (const remove of removers) remove();
          throw error;
        }
        if (current(epoch)) removeNativeListeners = removers;
        else for (const remove of removers) remove();
        return native;
      });
      connectionPromise = pending;
      void pending.catch(() => {
        if (connectionPromise === pending) connectionPromise = undefined;
      });
    }
    return connectionPromise;
  }
  function startListening() {
    const epoch = connectionEpoch;
    void connect()
      .then((native) => consumeInitial(native, epoch))
      .catch((error: unknown) => reportBridgeFailure(error, epoch));
  }
  function stopIfUnused() {
    if (hasListeners()) return;
    ++connectionEpoch;
    connectionPromise = undefined;
    bridgeFailure = undefined;
    const removers = removeNativeListeners;
    removeNativeListeners = [];
    for (const remove of removers) remove();
  }
  function permissionStatus(
    status: Awaited<
      ReturnType<NativePassengerFirebaseMessagingSDK["hasPermission"]>
    >,
    sdk: NativePassengerFirebaseMessagingSDK,
  ): PermissionStatus {
    if (
      status === sdk.AuthorizationStatus.AUTHORIZED ||
      status === sdk.AuthorizationStatus.PROVISIONAL ||
      status === sdk.AuthorizationStatus.EPHEMERAL
    )
      return "granted";
    return status === sdk.AuthorizationStatus.NOT_DETERMINED
      ? "undetermined"
      : "denied";
  }
  function assertEpoch(epoch: number) {
    if (epoch !== connectionEpoch)
      throw new Error("native_notification_operation_stopped");
  }
  async function getStatus(): Promise<PermissionStatus> {
    const epoch = connectionEpoch;
    const { sdk, messaging } = await connect();
    assertEpoch(epoch);
    if (bridgeFailure) throw bridgeFailure.error;
    if (platform === "android" && Number(Platform.Version) >= 33) {
      const granted = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      );
      assertEpoch(epoch);
      return granted ? "granted" : "denied";
    }
    const status = await sdk.hasPermission(messaging);
    assertEpoch(epoch);
    return permissionStatus(status, sdk);
  }

  return {
    status: "ready",
    enabled: true,
    platform,
    appId: input.appId,
    appVersion: input.appVersion,
    notificationConsentVersion: input.notificationConsentVersion,
    fcm: {
      status: "available",
      async getToken() {
        const epoch = connectionEpoch;
        const { sdk, messaging } = await connect();
        assertEpoch(epoch);
        if (bridgeFailure) throw bridgeFailure.error;
        if (
          platform === "ios" &&
          !sdk.isDeviceRegisteredForRemoteMessages(messaging)
        )
          await sdk.registerDeviceForRemoteMessages(messaging);
        assertEpoch(epoch);
        const token = await sdk.getToken(messaging);
        assertEpoch(epoch);
        return { provider: "fcm_v1", token };
      },
      onTokenChanged(listener) {
        const guarded = () => listener();
        tokenListeners.add(guarded);
        startListening();
        return () => {
          tokenListeners.delete(guarded);
          stopIfUnused();
        };
      },
    },
    permission: {
      getStatus,
      async request() {
        const epoch = connectionEpoch;
        bridgeFailure = undefined;
        const { sdk, messaging } = await connect();
        assertEpoch(epoch);
        if (platform === "android" && Number(Platform.Version) >= 33) {
          const status = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
          );
          assertEpoch(epoch);
          return status === PermissionsAndroid.RESULTS.GRANTED
            ? "granted"
            : "denied";
        }
        if (platform === "android") return getStatus();
        const status = await sdk.requestPermission(messaging);
        assertEpoch(epoch);
        return permissionStatus(status, sdk);
      },
      subscribe(listener) {
        const guarded = () => listener();
        permissionListeners.add(guarded);
        const subscription = AppState.addEventListener("change", (state) => {
          if (state === "active" && permissionListeners.has(guarded)) guarded();
        });
        return () => {
          permissionListeners.delete(guarded);
          subscription.remove();
          stopIfUnused();
        };
      },
    },
    clicks: {
      subscribe(listener) {
        const guarded = (data: unknown) => listener(data);
        clickListeners.add(guarded);
        startListening();
        return () => {
          clickListeners.delete(guarded);
          stopIfUnused();
        };
      },
    },
    store: {
      async read() {
        const stored = await SecureStore.getItemAsync(registrationKey);
        if (stored === null) return null;
        try {
          const data: unknown = JSON.parse(stored);
          if (!data || typeof data !== "object" || Array.isArray(data))
            return null;
          const registration = data as Partial<NativePassengerPushRegistration>;
          return nonempty(registration.deviceId) &&
            nonempty(registration.accountId) &&
            nonempty(registration.appId)
            ? {
                deviceId: registration.deviceId,
                accountId: registration.accountId,
                appId: registration.appId,
              }
            : null;
        } catch {
          return null;
        }
      },
      async write(registration) {
        await SecureStore.setItemAsync(
          registrationKey,
          JSON.stringify({
            deviceId: registration.deviceId,
            accountId: registration.accountId,
            appId: registration.appId,
          }),
        );
      },
      async clear() {
        await SecureStore.deleteItemAsync(registrationKey);
      },
    },
  };
}
