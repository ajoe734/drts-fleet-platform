import { describe, it, expect, vi } from "vitest";
import type { FetchOptions } from "../../../packages/passenger-client/src/client.js";
import { PassengerClient } from "../../../packages/passenger-client/src/client.js";
import {
  NativePassengerPushClient,
  NativePassengerPushLifecycle,
} from "../../../packages/passenger-client/src/native/push-lifecycle.js";
import type { NativePassengerPushRegistration } from "../../../packages/passenger-client/src/native/push-lifecycle.js";

const accountId = "synthetic-account-one";
const rideId = "00000000-0000-4000-8000-000000000902";
async function flush() {
  for (let n = 0; n < 30; ++n) await Promise.resolve();
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function setup(
  options: {
    enabled?: boolean;
    unavailable?: boolean;
    resolveRideRef?: (reference: string) => Promise<string | null>;
  } = {},
) {
  let session: {
    generation: number;
    tokens: { accessToken: string; refreshToken: string };
  } | null = {
    generation: 1,
    tokens: {
      accessToken: "synthetic-access-one",
      refreshToken: "synthetic-refresh-one",
    },
  };
  let owner = accountId;
  let registration: NativePassengerPushRegistration | null = null;
  let permission: "granted" | "denied" | "undetermined" = "granted";
  let token = "synthetic-native-fcm-one";
  let tokenGate: Promise<void> | undefined;
  let postGate: Promise<void> | undefined;
  let getRideGate: Promise<void> | undefined;
  let postStatus = 200,
    deleteStatus = 200,
    deleteSuccess = true,
    getRideStatus = 200;
  let omitDeviceId = false,
    nonJsonDelete = false;
  let sequence = 0;
  const permissionListeners = new Set<() => void>();
  const tokenListeners = new Set<() => void>();
  const clickListeners = new Set<(data: unknown) => void>();
  const fetchFn = vi.fn(async (url: string, request?: FetchOptions) => {
    if (request?.method === "POST") {
      if (postGate) await postGate;
      ++sequence;
      return {
        ok: postStatus === 200,
        status: postStatus,
        json: async () =>
          postStatus === 200
            ? {
                data: omitDeviceId
                  ? { success: true }
                  : { device_id: `server-device-${sequence}` },
              }
            : { error: { code: "PUSH_API_NOT_READY" } },
      };
    }
    if (request?.method === "DELETE")
      return {
        ok: deleteStatus === 200,
        status: deleteStatus,
        json: async () => {
          if (nonJsonDelete) throw new Error("non JSON");
          return deleteStatus === 200
            ? { data: { success: deleteSuccess } }
            : { error: { code: "UNAUTHORIZED" } };
        },
      };
    if (url.endsWith("/me"))
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: { account: { drts_passenger_id: owner, status: "active" } },
        }),
      };
    if (getRideGate) await getRideGate;
    return {
      ok: getRideStatus === 200,
      status: getRideStatus,
      json: async () =>
        getRideStatus === 200
          ? {
              data: {
                ride: {
                  order: { order_id: rideId, status: "assigned" },
                  actions: { can_cancel: true },
                },
              },
            }
          : { error: { code: "PASSENGER_RIDE_NOT_FOUND" } },
    };
  });
  const store = {
    read: vi.fn(async () => registration),
    write: vi.fn(async (value: NativePassengerPushRegistration) => {
      registration = value;
    }),
    clear: vi.fn(async () => {
      registration = null;
    }),
  };
  const getToken = vi.fn(async () => {
    if (tokenGate) await tokenGate;
    return { provider: "fcm_v1" as const, token };
  });
  const permissionPort = {
    getStatus: vi.fn(async () => permission),
    request: vi.fn(async () => {
      permission = "granted";
      return permission;
    }),
    subscribe(listener: () => void) {
      permissionListeners.add(listener);
      return () => {
        permissionListeners.delete(listener);
      };
    },
  };
  const onOwnedRide = vi.fn(),
    onError = vi.fn(),
    onResult = vi.fn();
  const lifecycle = new NativePassengerPushLifecycle({
    enabled: options.enabled ?? true,
    platform: "android",
    appId: "com.cctechsupport.drts.passenger",
    appVersion: "synthetic-unit-1",
    notificationConsentVersion: "synthetic-consent-1",
    session: { snapshot: async () => session },
    client: new NativePassengerPushClient({
      baseUrl: "https://api.example.invalid",
      fetchFn,
    }),
    accountClient: new PassengerClient({
      baseUrl: "https://api.example.invalid",
      fetchFn,
    }),
    fcm: options.unavailable
      ? { status: "unavailable", reason: "fcm_native_configuration_missing" }
      : {
          status: "available",
          getToken,
          onTokenChanged(listener) {
            tokenListeners.add(listener);
            return () => {
              tokenListeners.delete(listener);
            };
          },
        },
    permission: permissionPort,
    clicks: {
      subscribe(listener) {
        clickListeners.add(listener);
        return () => {
          clickListeners.delete(listener);
        };
      },
    },
    store,
    onOwnedRide,
    onError,
    onResult,
    ...(options.resolveRideRef
      ? { resolveRideRef: options.resolveRideRef }
      : {}),
  });
  return {
    lifecycle,
    fetchFn,
    store,
    getToken,
    permissionPort,
    onOwnedRide,
    onError,
    onResult,
    permissionListeners,
    tokenListeners,
    clickListeners,
    postCalls: () => fetchFn.mock.calls.filter((c) => c[1]?.method === "POST"),
    deleteCalls: () =>
      fetchFn.mock.calls.filter((c) => c[1]?.method === "DELETE"),
    stored: () => registration,
    seed(value: NativePassengerPushRegistration) {
      registration = value;
    },
    setPermission(value: typeof permission) {
      permission = value;
    },
    token(value: string) {
      token = value;
    },
    postStatus(value: number) {
      postStatus = value;
    },
    deleteStatus(value: number) {
      deleteStatus = value;
    },
    deleteFalse() {
      deleteSuccess = false;
    },
    omitId() {
      omitDeviceId = true;
    },
    noJsonDelete() {
      nonJsonDelete = true;
    },
    getRideStatus(value: number) {
      getRideStatus = value;
    },
    tokenGate(value: Promise<void>) {
      tokenGate = value;
    },
    postGate(value: Promise<void>) {
      postGate = value;
    },
    rideGate(value: Promise<void>) {
      getRideGate = value;
    },
    changeAccount() {
      owner = "synthetic-account-two";
      session = {
        generation: 2,
        tokens: {
          accessToken: "synthetic-access-two",
          refreshToken: "synthetic-refresh-two",
        },
      };
    },
    clearSession() {
      session = null;
    },
    rotateAccess() {
      if (session) session.tokens.accessToken = "synthetic-rotated-access";
    },
  };
}

describe("Native optional FCM lifecycle using actual SDK clients with injected boundaries", () => {
  it("disabled flag never requests permission, acquires token, registers or subscribes", async () => {
    const h = setup({ enabled: false });
    expect(await h.lifecycle.start()).toEqual({ status: "disabled" });
    expect(await h.lifecycle.requestNotifications()).toEqual({
      status: "disabled",
    });
    expect(await h.lifecycle.refresh()).toEqual({ status: "disabled" });
    expect(h.getToken).not.toHaveBeenCalled();
    expect(h.permissionPort.request).not.toHaveBeenCalled();
    expect(h.fetchFn).not.toHaveBeenCalled();
    expect(h.clickListeners.size).toBe(0);
  });
  it("unavailable native FCM is an explicit skipped boundary without token/API calls", async () => {
    const h = setup({ unavailable: true });
    expect(await h.lifecycle.start()).toMatchObject({
      status: "provider_unavailable",
      reason: "fcm_native_configuration_missing",
    });
    expect(h.getToken).not.toHaveBeenCalled();
    expect(h.fetchFn).not.toHaveBeenCalled();
  });
  it.each(["denied", "undetermined"] as const)(
    "mount with %s permission does not prompt or acquire/register",
    async (permission) => {
      const h = setup();
      h.setPermission(permission);
      expect(await h.lifecycle.start()).toEqual({
        status: "permission_required",
      });
      expect(h.permissionPort.request).not.toHaveBeenCalled();
      expect(h.getToken).not.toHaveBeenCalled();
      expect(h.postCalls()).toHaveLength(0);
      h.lifecycle.stop();
    },
  );
  it("explicit opt-in requests permission then registers exact formal command/current Bearer", async () => {
    const h = setup();
    h.setPermission("undetermined");
    h.rotateAccess();
    expect(await h.lifecycle.requestNotifications()).toEqual({
      status: "registered",
      deviceId: "server-device-1",
    });
    const call = h.postCalls()[0]!;
    expect(call[0]).toBe(
      "https://api.example.invalid/api/passenger-app/push-devices",
    );
    expect(call[1]?.headers?.Authorization).toBe(
      "Bearer synthetic-rotated-access",
    );
    expect(JSON.parse(call[1]!.body!)).toEqual({
      platform: "android",
      provider: "fcm_v1",
      appId: "com.cctechsupport.drts.passenger",
      appVersion: "synthetic-unit-1",
      token: "synthetic-native-fcm-one",
      notificationConsentVersion: "synthetic-consent-1",
    });
    expect(h.stored()).toEqual({
      deviceId: "server-device-1",
      accountId,
      appId: "com.cctechsupport.drts.passenger",
    });
    h.lifecycle.stop();
  });
  it("awaits actual server acknowledgement and persistence; never guesses an ID", async () => {
    const h = setup();
    const gate = deferred<void>();
    h.postGate(gate.promise);
    const start = h.lifecycle.start();
    await flush();
    expect(h.store.write).not.toHaveBeenCalled();
    expect(h.onResult).not.toHaveBeenCalled();
    gate.resolve();
    await start;
    expect(h.store.write).toHaveBeenCalledWith({
      deviceId: "server-device-1",
      accountId,
      appId: "com.cctechsupport.drts.passenger",
    });
    expect(JSON.stringify(h.stored())).not.toContain(
      "synthetic-native-fcm-one",
    );
    h.lifecycle.stop();
  });
  it("registered result waits for the actual captured device ID storage write", async () => {
    const h = setup();
    const gate = deferred<void>();
    h.store.write.mockImplementation(async () => {
      await gate.promise;
    });
    const start = h.lifecycle.start();
    await flush();
    expect(h.store.write).toHaveBeenCalled();
    expect(h.onResult).not.toHaveBeenCalled();
    gate.resolve();
    expect(await start).toEqual({
      status: "registered",
      deviceId: "server-device-1",
    });
    h.lifecycle.stop();
  });
  it("storage failure cleans the actual acknowledged ID and never reports registered", async () => {
    const h = setup();
    h.store.write.mockRejectedValue(new Error("synthetic-storage-unavailable"));
    await expect(h.lifecycle.start()).rejects.toThrow(
      "synthetic-storage-unavailable",
    );
    expect(h.deleteCalls()[0]?.[0]).toContain("server-device-1");
    expect(h.onResult).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: "registered" }),
    );
    h.lifecycle.stop();
  });
  it("same token does not duplicate registration and refresh token replaces own actual ID", async () => {
    const h = setup();
    await h.lifecycle.start();
    await h.lifecycle.refresh();
    expect(h.postCalls()).toHaveLength(1);
    h.token("synthetic-native-fcm-two");
    for (const listener of h.tokenListeners) listener();
    await flush();
    expect(h.postCalls()).toHaveLength(2);
    expect(JSON.parse(h.postCalls()[1]![1]!.body!).previousDeviceId).toBe(
      "server-device-1",
    );
    expect(h.stored()?.deviceId).toBe("server-device-2");
    h.lifecycle.stop();
  });
  it.each(["ExpoPushToken[relay]", "ExponentPushToken[relay]"])(
    "never registers an Expo relay token%s",
    async (token) => {
      const h = setup();
      h.token(token);
      expect(await h.lifecycle.start()).toMatchObject({
        status: "provider_unavailable",
      });
      expect(h.postCalls()).toHaveLength(0);
      h.lifecycle.stop();
    },
  );
  it("planned backend404 remains actual request failure with no fake store acknowledgement", async () => {
    const h = setup();
    h.postStatus(404);
    await expect(h.lifecycle.start()).rejects.toMatchObject({
      status: 404,
      code: "PUSH_API_NOT_READY",
    });
    expect(h.store.write).not.toHaveBeenCalled();
    h.lifecycle.stop();
  });
  it("success envelope without actual deviceId is not registered", async () => {
    const h = setup();
    h.omitId();
    await expect(h.lifecycle.start()).rejects.toMatchObject({
      code: "invalid_push_response",
    });
    expect(h.stored()).toBeNull();
    h.lifecycle.stop();
  });
  it("logout unregisters captured server ID with legal current session then removes all subscriptions", async () => {
    const h = setup();
    await h.lifecycle.start();
    h.rotateAccess();
    expect(await h.lifecycle.beforeLogout()).toEqual({
      status: "unregistered",
      deviceId: "server-device-1",
    });
    expect(h.deleteCalls()[0]?.[0]).toBe(
      "https://api.example.invalid/api/passenger-app/push-devices/server-device-1",
    );
    expect(h.deleteCalls()[0]?.[1]?.headers?.Authorization).toBe(
      "Bearer synthetic-rotated-access",
    );
    expect(h.stored()).toBeNull();
    expect(
      h.permissionListeners.size +
        h.tokenListeners.size +
        h.clickListeners.size,
    ).toBe(0);
  });
  it("permission revocation unregisters without acquiring a new token", async () => {
    const h = setup();
    await h.lifecycle.start();
    h.getToken.mockClear();
    h.setPermission("denied");
    for (const listener of h.permissionListeners) listener();
    await flush();
    expect(h.getToken).not.toHaveBeenCalled();
    expect(h.deleteCalls()).toHaveLength(1);
    expect(h.stored()).toBeNull();
    h.lifecycle.stop();
  });
  it("failed unregister is visible/unconfirmed and retains actual device ID for recovery", async () => {
    const h = setup();
    await h.lifecycle.start();
    h.deleteFalse();
    expect(await h.lifecycle.beforeLogout()).toEqual({
      status: "unregister_unconfirmed",
      deviceId: "server-device-1",
    });
    expect(h.stored()?.deviceId).toBe("server-device-1");
  });
  it("revocation HTTP failure does not pretend permission cleanup completed", async () => {
    const h = setup();
    await h.lifecycle.start();
    h.deleteStatus(401);
    h.noJsonDelete();
    h.setPermission("denied");
    expect(await h.lifecycle.refresh()).toEqual({
      status: "unregister_unconfirmed",
      deviceId: "server-device-1",
    });
    expect(h.onError.mock.calls[0]?.[0]).toMatchObject({ status: 401 });
    expect(h.stored()?.deviceId).toBe("server-device-1");
    h.lifecycle.stop();
  });
  it("account change cleans old own registration with captured old proof before new registration", async () => {
    const h = setup();
    await h.lifecycle.start();
    h.changeAccount();
    await h.lifecycle.refresh();
    expect(h.deleteCalls()[0]?.[1]?.headers?.Authorization).toBe(
      "Bearer synthetic-access-one",
    );
    expect(h.postCalls()[1]?.[1]?.headers?.Authorization).toBe(
      "Bearer synthetic-access-two",
    );
    expect(
      JSON.parse(h.postCalls()[1]![1]!.body!).previousDeviceId,
    ).toBeUndefined();
    expect(h.stored()?.accountId).toBe("synthetic-account-two");
    h.lifecycle.stop();
  });
  it("logout during token acquisition sends no detached registration", async () => {
    const h = setup();
    const gate = deferred<void>();
    h.tokenGate(gate.promise);
    const start = h.lifecycle.start();
    await flush();
    const logout = h.lifecycle.beforeLogout();
    gate.resolve();
    await start;
    await logout;
    expect(h.postCalls()).toHaveLength(0);
    expect(h.store.write).not.toHaveBeenCalled();
  });
  it("permission revocation during token acquisition cancels unsent registration", async () => {
    const h = setup();
    const gate = deferred<void>();
    h.tokenGate(gate.promise);
    const start = h.lifecycle.start();
    await flush();
    h.setPermission("denied");
    for (const listener of h.permissionListeners) listener();
    gate.resolve();
    await start;
    await flush();
    expect(h.postCalls()).toHaveLength(0);
    expect(h.onResult).toHaveBeenCalledWith({ status: "permission_required" });
    h.lifecycle.stop();
  });
  it("logout after POST sent persists only the actual acknowledgement then confirms its cleanup", async () => {
    const h = setup();
    const gate = deferred<void>();
    h.postGate(gate.promise);
    const start = h.lifecycle.start();
    await flush();
    const logout = h.lifecycle.beforeLogout();
    gate.resolve();
    await start;
    await logout;
    expect(h.store.write).toHaveBeenCalledWith({
      deviceId: "server-device-1",
      accountId,
      appId: "com.cctechsupport.drts.passenger",
    });
    expect(h.deleteCalls()).toHaveLength(1);
    expect(h.stored()).toBeNull();
  });
  it("FCM actual ride_ref click reads current owned ride before callback", async () => {
    const h = setup();
    await h.lifecycle.start();
    expect(
      await h.lifecycle.openNotification({
        ride_ref: rideId,
        event_sequence: "1",
      }),
    ).toEqual({ status: "opened" });
    expect(
      h.fetchFn.mock.calls.some(
        (c) =>
          c[0] ===
          `https://api.example.invalid/api/passenger-app/rides/${rideId}`,
      ),
    ).toBe(true);
    expect(h.onOwnedRide.mock.calls[0]?.[0].order.orderId).toBe(rideId);
    h.lifecycle.stop();
  });
  it("opaque ride_ref uses injected existing mapping then real owned read, without inventing an API", async () => {
    const resolver = vi.fn(async () => rideId);
    const h = setup({ resolveRideRef: resolver });
    await h.lifecycle.start();
    await h.lifecycle.openNotification({
      ride_ref: "opaque-existing-route-reference",
    });
    expect(resolver).toHaveBeenCalledWith("opaque-existing-route-reference");
    expect(
      h.fetchFn.mock.calls.some((c) => c[0].endsWith(`/rides/${rideId}`)),
    ).toBe(true);
    expect(
      h.fetchFn.mock.calls.some((c) =>
        c[0].includes("opaque-existing-route-reference"),
      ),
    ).toBe(false);
    expect(h.onOwnedRide).toHaveBeenCalledTimes(1);
    h.lifecycle.stop();
  });
  it("foreign or unknown ride404 never invokes owned-ride callback", async () => {
    const h = setup();
    await h.lifecycle.start();
    h.getRideStatus(404);
    await expect(
      h.lifecycle.openNotification({ ride_ref: "unknown-or-foreign" }),
    ).rejects.toMatchObject({ status: 404 });
    expect(h.onOwnedRide).not.toHaveBeenCalled();
    h.lifecycle.stop();
  });
  it("click resolving during account change never routes stale ride authority", async () => {
    const h = setup();
    await h.lifecycle.start();
    const gate = deferred<void>();
    h.rideGate(gate.promise);
    const click = h.lifecycle.openNotification({ ride_ref: rideId });
    await flush();
    h.changeAccount();
    gate.resolve();
    expect(await click).toEqual({ status: "stopped" });
    expect(h.onOwnedRide).not.toHaveBeenCalled();
    h.lifecycle.stop();
  });
  it("non-contract click payload is unresolved and does not invent an endpoint", async () => {
    const h = setup();
    await h.lifecycle.start();
    const count = h.fetchFn.mock.calls.length;
    expect(
      await h.lifecycle.openNotification({
        orderId: rideId,
        url: "https://example.invalid",
      }),
    ).toEqual({ status: "click_unresolved" });
    expect(h.fetchFn).toHaveBeenCalledTimes(count);
    h.lifecycle.stop();
  });
});
