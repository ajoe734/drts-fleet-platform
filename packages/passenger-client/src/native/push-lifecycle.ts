import type {
  RegisterPushDeviceCommand,
  RegisterPushDeviceResponse,
  UnregisterPushDeviceResponse,
  PassengerRideAuthorityView,
} from "@drts/contracts";
import type { PassengerClient, FetchFn } from "../client.js";
import { decodeBookingWire } from "../booking/wire.js";
import { PassengerApiError } from "../auth/errors.js";
import type {
  NativePassengerSession,
  NativePassengerSessionSnapshot,
} from "./session.js";

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
/** Planned original Push API transport. Its backend dependency is not implemented by this helper. */
export class NativePassengerPushClient {
  constructor(
    private readonly options: { baseUrl: string; fetchFn: FetchFn },
  ) {}
  private async request(
    path: string,
    method: string,
    accessToken: string,
    body?: RegisterPushDeviceCommand,
  ): Promise<Record<string, unknown>> {
    const response = await this.options.fetchFn(
      `${this.options.baseUrl.replace(/\/+$/, "")}/api/passenger-app/push-devices${path}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
    );
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      /* Preserve non-JSON refusal status. */
    }
    const envelope = record(payload);
    if (!response.ok) {
      const error = record(envelope?.error);
      throw new PassengerApiError(
        response.status,
        typeof error?.code === "string" ? error.code : "push_unavailable",
        "推播裝置設定尚未完成。",
      );
    }
    const data = record(decodeBookingWire(envelope?.data));
    if (!data)
      throw new PassengerApiError(
        502,
        "invalid_push_response",
        "推播裝置設定尚未確認。",
      );
    return data;
  }
  async register(
    command: RegisterPushDeviceCommand,
    accessToken: string,
  ): Promise<RegisterPushDeviceResponse> {
    const data = await this.request("", "POST", accessToken, command);
    if (typeof data.deviceId !== "string" || !data.deviceId.trim()) {
      throw new PassengerApiError(
        502,
        "invalid_push_response",
        "裝置登錄結果尚未確認。",
      );
    }
    return { deviceId: data.deviceId };
  }
  async unregister(
    deviceId: string,
    accessToken: string,
  ): Promise<UnregisterPushDeviceResponse> {
    const data = await this.request(
      `/${encodeURIComponent(deviceId)}`,
      "DELETE",
      accessToken,
    );
    if (typeof data.success !== "boolean")
      throw new PassengerApiError(
        502,
        "invalid_push_response",
        "裝置註銷結果尚未確認。",
      );
    return { success: data.success };
  }
}

export interface NativePassengerPushRegistration {
  deviceId: string;
  accountId: string;
  appId: string;
}
/** Persist only an actually acknowledged server device ID and its captured owner/configuration. */
export interface NativePassengerPushRegistrationStore {
  read(): Promise<NativePassengerPushRegistration | null>;
  write(registration: NativePassengerPushRegistration): Promise<void>;
  clear(): Promise<void>;
}
export type NativePassengerFcmPort =
  | { status: "unavailable"; reason: string }
  | {
      status: "available";
      getToken(): Promise<{ provider: "fcm_v1"; token: string }>;
      onTokenChanged(listener: () => void): () => void;
    };
export interface NativePassengerNotificationPermissionPort {
  getStatus(): Promise<"granted" | "denied" | "undetermined">;
  request(): Promise<"granted" | "denied" | "undetermined">;
  subscribe(listener: () => void): () => void;
}
export interface NativePassengerNotificationClickPort {
  /** Platform passes FCM Message.data, whose actual ride key is ride_ref. */
  subscribe(listener: (data: unknown) => void): () => void;
}
export interface NativePassengerPushResult {
  status:
    | "disabled"
    | "provider_unavailable"
    | "permission_required"
    | "session_required"
    | "stopped"
    | "registered"
    | "unregistered"
    | "unregister_unconfirmed"
    | "click_unresolved"
    | "opened";
  deviceId?: string;
  reason?: string;
}

/** Pure lifecycle; FCM, permission, clicks and storage are App-owned injected boundaries. */
export class NativePassengerPushLifecycle {
  private running = false;
  private epoch = 0;
  private tail: Promise<unknown> = Promise.resolve();
  private subscriptions: Array<() => void> = [];
  private token: string | undefined;
  private authorization:
    | { accountId: string; snapshot: NativePassengerSessionSnapshot }
    | undefined;
  constructor(
    private readonly options: {
      enabled: boolean;
      platform: "ios" | "android";
      appId: string;
      appVersion: string;
      notificationConsentVersion: string;
      session: Pick<NativePassengerSession, "snapshot">;
      accountClient: Pick<PassengerClient, "getAccount" | "getRide">;
      client: NativePassengerPushClient;
      fcm: NativePassengerFcmPort;
      permission: NativePassengerNotificationPermissionPort;
      clicks: NativePassengerNotificationClickPort;
      store: NativePassengerPushRegistrationStore;
      /** Optional existing App mapping for an opaque route reference; no new endpoint. */
      resolveRideRef?(reference: string): Promise<string | null>;
      onOwnedRide(ride: PassengerRideAuthorityView): void;
      onResult?(result: NativePassengerPushResult): void;
      onError(error: unknown): void;
    },
  ) {}
  private result(value: NativePassengerPushResult): NativePassengerPushResult {
    this.options.onResult?.(value);
    return value;
  }
  private serialize<T>(work: () => Promise<T>): Promise<T> {
    const result = this.tail.then(work);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
  async start(): Promise<NativePassengerPushResult> {
    if (!this.options.enabled) return this.result({ status: "disabled" });
    if (this.options.fcm.status === "unavailable")
      return this.result({
        status: "provider_unavailable",
        reason: this.options.fcm.reason,
      });
    if (!this.running) {
      this.running = true;
      const refresh = () => {
        ++this.epoch;
        void this.refresh().catch(this.options.onError);
      };
      this.subscriptions = [
        this.options.permission.subscribe(refresh),
        this.options.fcm.onTokenChanged(refresh),
        this.options.clicks.subscribe((data) => {
          void this.openNotification(data).catch(this.options.onError);
        }),
      ];
    }
    return this.refresh();
  }
  stop(): void {
    this.running = false;
    ++this.epoch;
    for (const unsubscribe of this.subscriptions) unsubscribe();
    this.subscriptions = [];
  }
  /** Explicit UI opt-in; merely mounting/start never prompts OS permission. */
  async requestNotifications(): Promise<NativePassengerPushResult> {
    if (!this.options.enabled) return this.result({ status: "disabled" });
    if (this.options.fcm.status === "unavailable")
      return this.result({
        status: "provider_unavailable",
        reason: this.options.fcm.reason,
      });
    await this.options.permission.request();
    return this.start();
  }
  refresh(): Promise<NativePassengerPushResult> {
    return this.serialize(() => this.registerCurrent());
  }
  private async identity() {
    const before = await this.options.session.snapshot();
    if (!before) return null;
    const account = await this.options.accountClient.getAccount();
    const current = await this.options.session.snapshot();
    if (
      !current ||
      current.generation !== before.generation ||
      account.status !== "active" ||
      !account.drtsPassengerId
    )
      return null;
    return { accountId: account.drtsPassengerId, snapshot: current };
  }
  private async unregisterCaptured(
    registration: NativePassengerPushRegistration,
    authority:
      | { accountId: string; snapshot: NativePassengerSessionSnapshot }
      | null
      | undefined,
  ): Promise<NativePassengerPushResult> {
    if (!authority || registration.accountId !== authority.accountId) {
      return this.result({
        status: "unregister_unconfirmed",
        deviceId: registration.deviceId,
        reason: "previous_account_session_unavailable",
      });
    }
    try {
      const response = await this.options.client.unregister(
        registration.deviceId,
        authority.snapshot.tokens.accessToken,
      );
      if (!response.success)
        return this.result({
          status: "unregister_unconfirmed",
          deviceId: registration.deviceId,
        });
      await this.options.store.clear();
      this.token = undefined;
      return this.result({
        status: "unregistered",
        deviceId: registration.deviceId,
      });
    } catch (error) {
      this.options.onError(error);
      return this.result({
        status: "unregister_unconfirmed",
        deviceId: registration.deviceId,
      });
    }
  }
  private async registerCurrent(): Promise<NativePassengerPushResult> {
    if (!this.options.enabled) return this.result({ status: "disabled" });
    if (this.options.fcm.status === "unavailable")
      return this.result({
        status: "provider_unavailable",
        reason: this.options.fcm.reason,
      });
    if (!this.running) return this.result({ status: "stopped" });
    const epoch = this.epoch;
    const permission = await this.options.permission.getStatus();
    const registration = await this.options.store.read();
    const authority = await this.identity();
    if (!this.running || epoch !== this.epoch)
      return this.result({ status: "stopped" });
    if (!authority) return this.result({ status: "session_required" });
    if (
      registration &&
      (registration.accountId !== authority.accountId ||
        registration.appId !== this.options.appId)
    ) {
      const cleanup = await this.unregisterCaptured(
        registration,
        this.authorization,
      );
      if (cleanup.status !== "unregistered") return cleanup;
    }
    this.authorization = authority;
    if (permission !== "granted") {
      if (registration?.accountId === authority.accountId) {
        const cleanup = await this.unregisterCaptured(registration, authority);
        if (cleanup.status === "unregister_unconfirmed") return cleanup;
      }
      return this.result({ status: "permission_required" });
    }
    const token = await this.options.fcm.getToken();
    const current = await this.options.session.snapshot();
    if (
      !this.running ||
      epoch !== this.epoch ||
      !current ||
      current.generation !== authority.snapshot.generation
    )
      return this.result({ status: "stopped" });
    if (
      token.provider !== "fcm_v1" ||
      typeof token.token !== "string" ||
      !token.token.trim() ||
      /^Expo(?:nent)?PushToken\[/.test(token.token)
    ) {
      return this.result({
        status: "provider_unavailable",
        reason: "native_fcm_token_unavailable",
      });
    }
    const previous = await this.options.store.read();
    if (
      previous?.accountId === authority.accountId &&
      previous.appId === this.options.appId &&
      this.token === token.token
    ) {
      return this.result({ status: "registered", deviceId: previous.deviceId });
    }
    const response = await this.options.client.register(
      {
        platform: this.options.platform,
        provider: "fcm_v1",
        appId: this.options.appId,
        appVersion: this.options.appVersion,
        token: token.token,
        notificationConsentVersion: this.options.notificationConsentVersion,
        ...(previous?.accountId === authority.accountId &&
        previous.appId === this.options.appId
          ? { previousDeviceId: previous.deviceId }
          : {}),
      },
      current.tokens.accessToken,
    );
    const captured = {
      deviceId: response.deviceId,
      accountId: authority.accountId,
      appId: this.options.appId,
    };
    try {
      await this.options.store.write(captured);
    } catch (error) {
      // The API acknowledgement is real even if local persistence failed.
      // Undo that captured own registration or explicitly retain its unknown disposition.
      try {
        const cleanup = await this.options.client.unregister(
          captured.deviceId,
          current.tokens.accessToken,
        );
        if (!cleanup.success)
          this.result({
            status: "unregister_unconfirmed",
            deviceId: captured.deviceId,
            reason: "registration_persistence_failed",
          });
      } catch (cleanupError) {
        this.options.onError(cleanupError);
        this.result({
          status: "unregister_unconfirmed",
          deviceId: captured.deviceId,
          reason: "registration_persistence_failed",
        });
      }
      throw error;
    }
    const after = await this.options.session.snapshot();
    if (
      !this.running ||
      epoch !== this.epoch ||
      !after ||
      after.generation !== current.generation
    )
      return this.unregisterCaptured(captured, {
        ...authority,
        snapshot: current,
      });
    this.token = token.token;
    this.authorization = { ...authority, snapshot: after };
    return this.result({ status: "registered", deviceId: response.deviceId });
  }
  /** Invoke before NativePassengerSession.logout/clear so the original own proof still exists. */
  beforeLogout(): Promise<NativePassengerPushResult> {
    this.stop();
    return this.serialize(async () => {
      const registration = await this.options.store.read();
      if (!registration) return this.result({ status: "unregistered" });
      const current = await this.identity();
      return this.unregisterCaptured(
        registration,
        current?.accountId === registration.accountId
          ? current
          : this.authorization,
      );
    });
  }
  /** Same teardown applies before replacing the signed-in account. */
  beforeAccountChange(): Promise<NativePassengerPushResult> {
    return this.beforeLogout();
  }
  async openNotification(data: unknown): Promise<NativePassengerPushResult> {
    if (!this.options.enabled) return this.result({ status: "disabled" });
    if (!this.running) return this.result({ status: "stopped" });
    const epoch = this.epoch;
    const reference = record(data)?.ride_ref;
    if (typeof reference !== "string" || !reference.trim())
      return this.result({ status: "click_unresolved" });
    const authority = await this.identity();
    if (!authority) return this.result({ status: "session_required" });
    const id = this.options.resolveRideRef
      ? await this.options.resolveRideRef(reference)
      : reference;
    if (!id)
      return this.result({
        status: "click_unresolved",
        reason: "ride_reference_unavailable",
      });
    const response = await this.options.accountClient.getRide(id);
    const current = await this.options.session.snapshot();
    if (
      !this.running ||
      epoch !== this.epoch ||
      !current ||
      current.generation !== authority.snapshot.generation
    )
      return this.result({ status: "stopped" });
    this.options.onOwnedRide(response.ride);
    return this.result({ status: "opened" });
  }
}
