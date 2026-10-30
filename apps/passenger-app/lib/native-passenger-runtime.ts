import {
  NativePassengerSession,
  NativePassengerSessionChangedError,
  NativePassengerRideStream,
  NativePassengerReceiptDownloads,
  PassengerNativeAuthClient,
  PassengerClient,
  PassengerBookingClient,
  PassengerPaymentClient,
  PassengerApiError,
  NativePassengerPushLifecycle,
  NativePassengerPushClient,
  createNativePassengerFetch,
  createNativePassengerBinaryTransport,
  mapNativePassengerRidePresentation,
  type FetchFn,
  type NativePassengerSessionStore,
  type NativePassengerAppStatePort,
  type NativePassengerStreamRequest,
  type NativePassengerBinaryRequest,
  type NativePassengerReceiptFilePort,
  type NativePassengerStreamState,
  type NativePassengerRidePresentation,
  type PassengerPaymentFieldsAvailability,
  type NativePassengerFcmPort,
  type NativePassengerNotificationPermissionPort,
  type NativePassengerNotificationClickPort,
  type NativePassengerPushRegistrationStore,
  type NativePassengerPushResult,
} from "@drts/passenger-client";
import type {
  PassengerAccount,
  PassengerRideAuthorityView,
  PassengerReceiptResponse,
  PassengerRideContactOption,
  RatePassengerRideCommand,
} from "@drts/contracts";
import type { PassengerOAuthBrowserPort } from "../components/auth/passenger-login-screen";
import type { NativePaymentBrowserAvailability } from "../components/payment/native-payment-methods-screen";
import type { NativeBookingMapAvailability } from "../components/booking/native-booking-screen";
import type {
  NativeP5ScreenActions,
  NativeP5ScreenProps,
} from "../components/ride/native-p5-screen";
import type { PassengerAccountScreenProps } from "../components/account/passenger-account-screen";

export type NativePassengerRoute =
  | { kind: "login" | "home" | "history" | "payment" | "account" }
  | { kind: "ride"; orderId: string }
  | { kind: "support"; orderId: string; category: "service" | "lost_item" };
export interface NativePassengerApplicationState {
  phase: "restoring" | "signed_out" | "active" | "unavailable";
  route: NativePassengerRoute;
  account: PassengerAccount | null;
  identityVersion: number;
  ride: PassengerRideAuthorityView | null;
  presentation: NativePassengerRidePresentation | null;
  connection: NativePassengerStreamState;
  message: string;
  receiptMessage: string;
  cancelConfirmation: boolean;
  pushMessage: string;
}
export type NativePassengerNotifications =
  | { status: "disabled" | "unavailable" }
  | {
      status: "ready";
      enabled: boolean;
      platform: "ios" | "android";
      appId: string;
      appVersion: string;
      notificationConsentVersion: string;
      fcm: NativePassengerFcmPort;
      permission: NativePassengerNotificationPermissionPort;
      clicks: NativePassengerNotificationClickPort;
      store: NativePassengerPushRegistrationStore;
      resolveRideRef?(reference: string): Promise<string | null>;
    };
export interface NativePassengerRuntimeOptions {
  baseUrl: string;
  mode: "configured" | "demo";
  callbackUri: string;
  fetchFn: FetchFn;
  store: NativePassengerSessionStore;
  browser:
    | { status: "ready"; port: PassengerOAuthBrowserPort }
    | { status: "unavailable" };
  paymentFields: PassengerPaymentFieldsAvailability;
  paymentBrowser: NativePaymentBrowserAvailability;
  bookingMap: NativeBookingMapAvailability;
  newRequestId(): string;
  now?: () => number;
  demoOtpHint?: string;
  policy?: PassengerAccountScreenProps["policy"];
  renderRideMap?: NativeP5ScreenProps["renderMap"];
  events?: {
    createRequest(): NativePassengerStreamRequest;
    appState: NativePassengerAppStatePort;
  };
  receipts?: {
    createRequest(): NativePassengerBinaryRequest;
    files: NativePassengerReceiptFilePort;
  };
  telephone?: { open(uri: string): void | Promise<void> };
  notifications?: NativePassengerNotifications;
}
type SignedOut = Parameters<PassengerAccountScreenProps["onSignedOut"]>[0];

/** App composition only. Business authority, token protocol and transport remain in shared SDK. */
export class NativePassengerRuntime {
  readonly auth: PassengerNativeAuthClient;
  readonly session: NativePassengerSession;
  passenger!: PassengerClient;
  booking!: PassengerBookingClient;
  payment!: PassengerPaymentClient;
  readonly now: () => number;
  private epoch = 0;
  private disposed = false;
  private startFlight: Promise<void> | undefined;
  private listeners = new Set<() => void>();
  private fetch!: FetchFn;
  private stream: NativePassengerRideStream | null = null;
  private push: NativePassengerPushLifecycle | null = null;
  private downloads: NativePassengerReceiptDownloads | null = null;
  private receiptMetadata: PassengerReceiptResponse | null = null;
  private driverContact: {
    orderId: string;
    assignmentId: string | null;
    assignmentVersion: number | null;
    option: PassengerRideContactOption;
  } | null = null;
  private rideRevision = 0;
  private navigationEpoch = 0;
  private state: NativePassengerApplicationState = {
    phase: "restoring",
    route: { kind: "login" },
    account: null,
    identityVersion: 0,
    ride: null,
    presentation: null,
    connection: "disconnected",
    message: "",
    receiptMessage: "",
    cancelConfirmation: false,
    pushMessage: "",
  };
  constructor(readonly options: NativePassengerRuntimeOptions) {
    this.now = options.now ?? Date.now;
    this.auth = new PassengerNativeAuthClient({
      baseUrl: options.baseUrl,
      fetchFn: options.fetchFn,
    });
    this.session = new NativePassengerSession(this.auth, options.store);
    this.replaceClients();
  }
  readonly getSnapshot = () => this.state;
  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(next: Partial<NativePassengerApplicationState>) {
    if (this.disposed) return;
    this.state = { ...this.state, ...next };
    for (const listener of this.listeners) listener();
  }
  private replaceClients() {
    const epoch = this.epoch;
    const authorized = createNativePassengerFetch({
      baseUrl: this.options.baseUrl,
      fetchFn: this.options.fetchFn,
      session: this.session,
    });
    this.fetch = async (url, options) => {
      if (this.disposed || epoch !== this.epoch)
        throw new NativePassengerSessionChangedError();
      try {
        const response = await authorized(url, options);
        if (response.status === 401 && epoch === this.epoch)
          await this.sessionUnavailable(epoch);
        return response;
      } catch (error) {
        if (
          epoch === this.epoch &&
          error instanceof PassengerApiError &&
          (error.status === 401 || error.code === "invalid_grant")
        )
          await this.sessionUnavailable(epoch);
        throw error;
      }
    };
    const options = { baseUrl: this.options.baseUrl, fetchFn: this.fetch };
    this.passenger = new PassengerClient(options);
    this.booking = new PassengerBookingClient(options);
    this.payment = new PassengerPaymentClient(options);
  }
  start(): Promise<void> {
    this.startFlight ??= this.restore();
    return this.startFlight;
  }
  private async restore() {
    const epoch = this.epoch;
    try {
      if (!(await this.session.snapshot())) {
        this.publish({ phase: "signed_out" });
        return;
      }
      const account = await this.passenger.getAccount();
      if (epoch === this.epoch && !this.disposed)
        await this.authenticate(account, this.state.identityVersion);
    } catch {
      if (epoch === this.epoch && !this.disposed)
        this.publish({
          phase: "unavailable",
          message: "暫時無法讀取帳號，請重試。",
        });
    }
  }
  async retryRestore() {
    this.publish({ phase: "restoring", message: "" });
    await this.restore();
  }
  async authenticate(
    account: PassengerAccount,
    expectedVersion = this.state.identityVersion,
  ) {
    if (this.disposed || expectedVersion !== this.state.identityVersion) return;
    if (!(await this.session.snapshot()))
      throw new PassengerApiError(401, "unauthorized", "登入狀態尚未保存。");
    if (this.disposed || expectedVersion !== this.state.identityVersion) return;
    const pushMessage = await this.beforeSessionEnd();
    if (this.disposed || expectedVersion !== this.state.identityVersion) return;
    this.push = null;
    this.closeRide();
    ++this.epoch;
    this.replaceClients();
    this.publish({
      phase: "active",
      account,
      identityVersion: this.state.identityVersion + 1,
      route: { kind: "home" },
      message: pushMessage,
    });
    await this.startPush();
  }
  private async startPush() {
    const ports = this.options.notifications;
    if (
      !ports ||
      ports.status !== "ready" ||
      this.disposed ||
      this.state.phase !== "active"
    )
      return;
    if (!this.push) {
      const epoch = this.epoch;
      this.push = new NativePassengerPushLifecycle({
        ...ports,
        session: this.session,
        accountClient: new PassengerClient({
          baseUrl: this.options.baseUrl,
          fetchFn: createNativePassengerFetch({
            baseUrl: this.options.baseUrl,
            fetchFn: this.options.fetchFn,
            session: this.session,
          }),
        }),
        client: new NativePassengerPushClient({
          baseUrl: this.options.baseUrl,
          fetchFn: this.options.fetchFn,
        }),
        onOwnedRide: (ride) => {
          if (epoch === this.epoch)
            void this.openRide(ride).catch(() =>
              this.publish({
                pushMessage: "通知行程尚未讀取，請至乘車紀錄重試。",
              }),
            );
        },
        onResult: (result) => {
          if (epoch === this.epoch)
            this.publish({ pushMessage: this.pushResultMessage(result) });
        },
        onError: () => {
          if (epoch === this.epoch)
            this.publish({ pushMessage: "推播裝置設定尚未完成，請重試。" });
        },
      });
    }
    try {
      await this.push.start();
    } catch {
      this.publish({ pushMessage: "推播裝置設定尚未完成，請重試。" });
    }
  }
  private pushResultMessage(result: NativePassengerPushResult): string {
    return {
      disabled: "推播尚未啟用，已略過此步驟。",
      provider_unavailable: "原生 FCM 服務尚未設定，已略過此外部步驟。",
      permission_required: "可選擇開啟行程通知。",
      session_required: "請登入後再設定通知。",
      stopped: "推播連線已停止。",
      registered: "推播裝置已登錄；實際送達仍依服務設定。",
      unregistered: "推播裝置已註銷。",
      unregister_unconfirmed: "推播裝置註銷尚未確認。",
      click_unresolved: "通知行程尚未確認，請至乘車紀錄查看。",
      opened: "已讀取通知所屬行程。",
    }[result.status];
  }
  async requestNotifications() {
    try {
      await this.push?.requestNotifications();
    } catch {
      this.publish({ pushMessage: "推播裝置設定尚未完成，請重試。" });
    }
  }
  async beforeSessionEnd(): Promise<string> {
    try {
      const result = await this.push?.beforeLogout();
      return result?.status === "unregister_unconfirmed"
        ? "推播裝置註銷尚未確認。"
        : "";
    } catch {
      return "推播裝置註銷尚未確認。";
    }
  }
  async sessionEndFailed() {
    await this.startPush();
  }
  updateAccount(account: PassengerAccount, expectedVersion: number) {
    if (
      expectedVersion === this.state.identityVersion &&
      this.state.phase === "active" &&
      account.drtsPassengerId === this.state.account?.drtsPassengerId
    )
      this.publish({ account });
  }
  async sessionUnavailable(expectedEpoch = this.epoch) {
    if (
      this.disposed ||
      expectedEpoch !== this.epoch ||
      this.state.phase === "signed_out"
    )
      return;
    const pushMessage = await this.beforeSessionEnd();
    if (this.disposed || expectedEpoch !== this.epoch) return;
    this.push = null;
    this.closeRide();
    ++this.epoch;
    let message = `登入已失效，請重新登入。${pushMessage}`;
    try {
      if (await this.session.snapshot()) await this.session.clear();
    } catch {
      message = "登入已失效；本機登入資料尚未清除，請重新登入或重試清除。";
    }
    this.replaceClients();
    this.publish({
      phase: "signed_out",
      route: { kind: "login" },
      account: null,
      identityVersion: this.state.identityVersion + 1,
      message,
    });
  }
  signedOut(result: SignedOut, expectedVersion: number) {
    if (expectedVersion !== this.state.identityVersion || this.disposed) return;
    this.push?.stop();
    this.push = null;
    this.closeRide();
    ++this.epoch;
    this.replaceClients();
    this.publish({
      phase: "signed_out",
      account: null,
      route: { kind: "login" },
      identityVersion: this.state.identityVersion + 1,
      message: result.message,
    });
  }
  navigate(kind: "home" | "history" | "payment" | "account") {
    if (this.state.phase !== "active") return;
    this.closeRide();
    this.publish({ route: { kind }, message: "" });
  }
  private closeRide() {
    ++this.navigationEpoch;
    ++this.rideRevision;
    this.stream?.stop();
    this.stream = null;
    this.downloads?.dispose();
    this.downloads = null;
    this.receiptMetadata = null;
    this.driverContact = null;
    this.publish({
      ride: null,
      presentation: null,
      connection: "disconnected",
      receiptMessage: "",
      cancelConfirmation: false,
    });
  }
  private presentation(ride: PassengerRideAuthorityView) {
    const presentation = mapNativePassengerRidePresentation(
      ride,
      ride.order.orderId,
      {
        nowMs: this.now(),
        connectionState: this.state.connection,
        receiptDownloads: this.receiptMetadata,
      },
    );
    // Capability is known only from the existing authorized downloads response.
    return {
      ...presentation,
      receiptFormats: presentation.receiptFormats.filter((format) =>
        format === "pdf"
          ? !!this.receiptMetadata?.pdfUrl
          : !!(
              this.receiptMetadata?.htmlUrl || this.receiptMetadata?.receiptUrl
            ),
      ),
    };
  }
  updateClock() {
    if (this.state.ride)
      this.publish({ presentation: this.presentation(this.state.ride) });
  }
  private async acceptRide(
    ride: PassengerRideAuthorityView,
    epoch: number,
    navigationEpoch: number,
  ) {
    if (
      epoch !== this.epoch ||
      navigationEpoch !== this.navigationEpoch ||
      this.state.route.kind !== "ride" ||
      this.state.route.orderId !== ride.order.orderId
    )
      return;
    const revision = ++this.rideRevision;
    this.receiptMetadata = null;
    this.publish({
      ride,
      presentation: this.presentation(ride),
      receiptMessage: "",
    });
    if (
      !ride.receipt ||
      !ride.actions.canReadReceipt ||
      ride.order.status === "cancelled"
    )
      return;
    try {
      const response = await this.fetch(
        `${this.options.baseUrl.replace(/\/+$/, "")}/api/passenger-app/rides/${encodeURIComponent(ride.order.orderId)}/receipt/downloads`,
        { method: "GET" },
      );
      const raw = await response.json();
      if (!response.ok)
        throw new PassengerApiError(
          response.status,
          "receipt_metadata_unavailable",
          "乘車證明下載資訊尚未確認。",
        );
      const data = raw?.data;
      const receiptUrl = data?.receipt_url ?? data?.receiptUrl;
      if (typeof receiptUrl !== "string")
        throw new Error("invalid_receipt_metadata");
      const htmlUrl = data.html_url ?? data.htmlUrl;
      const pdfUrl = data.pdf_url ?? data.pdfUrl;
      if (epoch !== this.epoch || revision !== this.rideRevision) return;
      this.receiptMetadata = {
        receiptUrl,
        ...(typeof htmlUrl === "string" ? { htmlUrl } : {}),
        ...(typeof pdfUrl === "string" ? { pdfUrl } : {}),
      };
      this.publish({ presentation: this.presentation(ride) });
    } catch {
      if (epoch === this.epoch && revision === this.rideRevision)
        this.publish({ receiptMessage: "乘車證明下載資訊尚未確認，請重試。" });
    }
  }
  async openRide(
    ride: PassengerRideAuthorityView,
    expectedVersion = this.state.identityVersion,
  ) {
    if (
      this.state.phase !== "active" ||
      expectedVersion !== this.state.identityVersion
    )
      return;
    this.closeRide();
    const epoch = this.epoch;
    const navigationEpoch = this.navigationEpoch;
    const live = () =>
      !this.disposed &&
      epoch === this.epoch &&
      navigationEpoch === this.navigationEpoch &&
      this.state.route.kind === "ride" &&
      this.state.route.orderId === ride.order.orderId;
    this.publish({
      route: { kind: "ride", orderId: ride.order.orderId },
      message: "",
    });
    if (this.options.receipts)
      this.downloads = new NativePassengerReceiptDownloads({
        baseUrl: this.options.baseUrl,
        client: this.passenger,
        fetchFn: this.fetch,
        session: this.session,
        binary: createNativePassengerBinaryTransport(() =>
          this.options.receipts!.createRequest(),
        ),
        files: this.options.receipts.files,
      });
    await this.acceptRide(ride, epoch, navigationEpoch);
    if (!live() || !this.options.events) return;
    this.stream = new NativePassengerRideStream({
      baseUrl: this.options.baseUrl,
      orderId: ride.order.orderId,
      session: this.session,
      client: this.passenger,
      createRequest: () => this.options.events!.createRequest(),
      appState: this.options.events.appState,
      onRide: (next) => {
        if (live()) void this.acceptRide(next, epoch, navigationEpoch);
      },
      onEvent: (event) => {
        if (live()) void this.acceptRide(event.data, epoch, navigationEpoch);
      },
      onConnection: (connection) => {
        if (live()) {
          this.publish({ connection });
          this.updateClock();
        }
      },
      onError: (error) => {
        if (!live()) return;
        if (error instanceof PassengerApiError && error.status === 401) {
          void this.sessionUnavailable(epoch);
          return;
        }
        this.publish({ message: "行程即時更新中斷，請重新讀取行程。" });
      },
    });
    await this.stream.start();
  }
  async openRideId(orderId: string) {
    const version = this.state.identityVersion;
    const navigationEpoch = this.navigationEpoch;
    const result = await this.passenger.getRide(orderId);
    if (navigationEpoch === this.navigationEpoch)
      await this.openRide(result.ride, version);
  }
  async retryRide() {
    if (this.state.route.kind !== "ride") return;
    if (this.stream) {
      await this.stream.reconnect();
      return;
    }
    const epoch = this.epoch;
    const navigationEpoch = this.navigationEpoch;
    const result = await this.passenger.getRide(this.state.route.orderId);
    await this.acceptRide(result.ride, epoch, navigationEpoch);
  }
  requestCancel() {
    if (this.state.route.kind === "ride")
      this.publish({ cancelConfirmation: true });
  }
  dismissCancel() {
    this.publish({ cancelConfirmation: false });
  }
  async confirmCancel() {
    if (this.state.route.kind !== "ride") return;
    const id = this.state.route.orderId;
    const epoch = this.epoch;
    const result = await this.passenger.cancelRide(id, { rideId: id });
    if (!result.success) throw new Error("尚未確認取消結果，請重新讀取行程。");
    if (epoch === this.epoch) {
      this.publish({ cancelConfirmation: false });
      await this.retryRide();
    }
  }
  async submitRating(command: RatePassengerRideCommand) {
    if (this.state.route.kind !== "ride") return;
    const result = await this.passenger.rateRide(
      this.state.route.orderId,
      command,
    );
    if (!result.success) throw new Error("尚未確認評價結果，請重試。");
    try {
      await this.retryRide();
    } catch {
      this.publish({ message: "評價已送出；畫面尚未更新，請重新讀取行程。" });
    }
  }
  async downloadReceipt(format: "html" | "pdf") {
    if (this.state.route.kind !== "ride") return;
    if (!this.downloads) throw new Error("下載功能尚未提供，已略過此步驟。");
    const epoch = this.epoch;
    try {
      await this.downloads.download(this.state.route.orderId, format);
    } catch (error) {
      if (
        epoch === this.epoch &&
        error instanceof PassengerApiError &&
        error.status === 401
      )
        await this.sessionUnavailable(epoch);
      throw error;
    }
  }
  async contactDriver(): Promise<PassengerRideContactOption> {
    if (
      this.state.route.kind !== "ride" ||
      !this.state.ride?.actions.canContact
    )
      throw new Error("目前無法聯絡這筆行程的司機，請重新讀取行程。");
    const orderId = this.state.route.orderId;
    const epoch = this.epoch;
    const navigationEpoch = this.navigationEpoch;
    this.driverContact = null;
    const assignmentId = this.state.ride.assignment?.assignmentId ?? null;
    const assignmentVersion =
      this.state.ride.assignment?.assignmentVersion ?? null;
    const option = await this.passenger.contactRide(orderId);
    if (
      this.disposed ||
      epoch !== this.epoch ||
      navigationEpoch !== this.navigationEpoch ||
      this.state.route.kind !== "ride" ||
      this.state.route.orderId !== orderId ||
      (this.state.ride?.assignment?.assignmentId ?? null) !== assignmentId ||
      (this.state.ride?.assignment?.assignmentVersion ?? null) !==
        assignmentVersion
    )
      throw new Error("行程已變更，請重新確認聯絡資料。");
    this.driverContact = { orderId, assignmentId, assignmentVersion, option };
    return option;
  }
  async openDriverContact() {
    const contact = this.driverContact;
    if (
      !contact ||
      this.state.route.kind !== "ride" ||
      this.state.route.orderId !== contact.orderId ||
      !this.state.ride?.actions.canContact ||
      (this.state.ride.assignment?.assignmentId ?? null) !==
        contact.assignmentId ||
      (this.state.ride.assignment?.assignmentVersion ?? null) !==
        contact.assignmentVersion
    )
      throw new Error("請重新取得這筆行程的聯絡資料。");
    if (contact.option.mode === "unavailable" || !contact.option.contactUri)
      throw new Error("目前無法直接聯絡司機，請改聯絡客服協助。");
    if (!this.options.telephone)
      throw new Error("電話功能尚未提供，請改聯絡客服協助。");
    await this.options.telephone.open(contact.option.contactUri);
  }
  async contactSupport() {
    if (!this.options.telephone)
      throw new Error("電話功能尚未提供，請撥客服 02-2944-0985。");
    await this.options.telephone.open("tel:02-2944-0985");
  }
  openSupport(category: "service" | "lost_item") {
    if (this.state.route.kind !== "ride") return;
    const orderId = this.state.route.orderId;
    this.closeRide();
    this.publish({ route: { kind: "support", orderId, category } });
  }
  p5Actions(): NativeP5ScreenActions {
    return {
      retryAuthority: () => this.retryRide(),
      retryReceipt: () => this.retryRide(),
      requestCancel: async () => this.requestCancel(),
      submitRating: (command) => this.submitRating(command),
      downloadReceipt: ({ format }) => this.downloadReceipt(format),
      contactSupport: () => this.contactSupport(),
      contactDriver: () => this.contactDriver(),
      openDriverContact: () => this.openDriverContact(),
      openSupport: (category) => this.openSupport(category),
      openHistory: () => this.navigate("history"),
    };
  }
  dispose() {
    this.push?.stop();
    this.closeRide();
    this.disposed = true;
    ++this.epoch;
    this.listeners.clear();
  }
}
