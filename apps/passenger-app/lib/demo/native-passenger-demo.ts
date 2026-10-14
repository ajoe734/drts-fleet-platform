import type {
  AuthProvider,
  PassengerAccount,
  PassengerLoginIdentity,
  PassengerPaymentMethod,
  PassengerRideAuthorityView,
  CreatePassengerRideCommand,
  FareQuoteCommand,
  RequestOtpCommand,
  VerifyOtpCommand,
  OAuthStartCommand,
  OAuthCallbackCommand,
  CreatePassengerComplaintCommand,
  RatePassengerRideCommand,
  PassengerRideSseEvent,
  PassengerRideSseEventEnvelope,
} from "@drts/contracts";
import type {
  FetchFn,
  FetchOptions,
  FetchResponse,
  NativePassengerTokenPair,
  NativePassengerStreamRequest,
  NativePassengerBinaryRequest,
} from "@drts/passenger-client";
import type { NativePassengerRuntimeOptions } from "../native-passenger-runtime";
import type { NativeBookingMapAvailability } from "../../components/booking/native-booking-screen";
import {
  capturedDemoAssignment,
  capturedDemoReceipt,
  NATIVE_DEMO_ADDRESSES,
  NATIVE_DEMO_BASE_URL,
  NATIVE_DEMO_FARE,
  NATIVE_DEMO_NOTICE,
  NATIVE_DEMO_OTP,
  NATIVE_DEMO_QUOTE,
} from "./native-passenger-demo-fixtures";

export {
  NATIVE_DEMO_BASE_URL,
  NATIVE_DEMO_FARE,
  NATIVE_DEMO_NOTICE,
  NATIVE_DEMO_OTP,
} from "./native-passenger-demo-fixtures";
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
function snake(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(snake);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
      snake(item),
    ]),
  );
}
function reply(data: unknown, status = 200): FetchResponse {
  const payload = {
    data: snake(data),
    meta: { mode: "demo", simulated: true },
  };
  return { ok: status < 400, status, json: async () => clone(payload) };
}
function failure(
  status: number,
  code: string,
  message = "此步驟為本機示意，未呼叫外部服務。",
): FetchResponse {
  return {
    ok: false,
    status,
    json: async () => ({
      error: { code, message },
      meta: { mode: "demo", simulated: true },
    }),
  };
}
function header(options: FetchOptions | undefined, name: string) {
  return Object.entries(options?.headers ?? {}).find(
    ([key]) => key.toLowerCase() === name.toLowerCase(),
  )?.[1];
}
function escapeHtml(text: string) {
  return text.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
/** UTF-8 only; does not depend on DOM TextEncoder or Node Buffer. */
function utf8(text: string): Uint8Array {
  const bytes: number[] = [];
  for (const character of text) {
    const code = character.codePointAt(0)!;
    if (code < 128) bytes.push(code);
    else if (code < 2048) bytes.push(192 | (code >> 6), 128 | (code & 63));
    else if (code < 65536)
      bytes.push(
        224 | (code >> 12),
        128 | ((code >> 6) & 63),
        128 | (code & 63),
      );
    else
      bytes.push(
        240 | (code >> 18),
        128 | ((code >> 12) & 63),
        128 | ((code >> 6) & 63),
        128 | (code & 63),
      );
  }
  return new Uint8Array(bytes);
}
interface DemoRide {
  owner: string;
  quoteId: string;
  view: PassengerRideAuthorityView;
  version: number;
  complaints: Array<{
    complaintId: string;
    command: CreatePassengerComplaintCommand;
  }>;
}
export interface NativePassengerDemoSnapshot {
  readonly label: "DEMO";
  readonly notice: string;
  readonly rides: Array<{
    orderId: string;
    orderNo: string;
    status: PassengerRideAuthorityView["order"]["status"];
    paymentStatus: string;
  }>;
  readonly lastAction: string;
  readonly lastOpenedFile: string | null;
}

/** Explicit synthetic HTTP/platform scenario. It has no network fallback or production-mode switch. */
export function createNativePassengerDemoScenario(
  input: { now?: () => number } = {},
) {
  const now = input.now ?? Date.now;
  const at = () => new Date(now()).toISOString();
  let serial = 0;
  const uuid = () =>
    `00000000-0000-4000-8000-${String(++serial).padStart(12, "0")}`;
  const tokenPair = () => ({
    accessToken: `DEMO-access-${++serial}`,
    refreshToken: `DEMO-refresh-${serial}`,
  });
  const initialAccount = (): PassengerAccount => ({
    drtsPassengerId: `drts_passenger_${uuid()}`,
    displayName: "示意乘客 DEMO",
    contactPhone: "0900000000",
    contactPhoneVerified: false,
    contactConsent: false,
    status: "active",
    createdAt: at(),
  });
  let account = initialAccount();
  let pair: NativePassengerTokenPair | null = null;
  let stored: NativePassengerTokenPair | null = null;
  let identities: PassengerLoginIdentity[] = [];
  let methods: PassengerPaymentMethod[] = [
    {
      paymentMethodId: uuid(),
      last4: "0000",
      cardType: "示意卡 DEMO",
      expiryMonth: "12",
      expiryYear: "2099",
      isDefault: true,
    },
  ];
  let otp: ({ challenge: string } & RequestOtpCommand) | null = null;
  let oauth:
    | ({ transactionId: string; state: string } & OAuthStartCommand)
    | null = null;
  const rides: DemoRide[] = [];
  const quotes = new Map<string, FareQuoteCommand>();
  const requests = new Map<string, string>();
  const complaints = new Map<string, string>();
  const bindingMethods = new Map<string, string>();
  const listeners = new Set<() => void>();
  const streams = new Map<string, Set<(frame: string) => void>>();
  const files = new Map<string, { contentType: string; bytes: Uint8Array }>();
  let lastOpenedFile: string | null = null;
  let lastAction = NATIVE_DEMO_NOTICE;
  let appState = "active";
  const appListeners = new Set<(state: string) => void>();
  const calls: Array<{ url: string; options: FetchOptions | undefined }> = [];
  let snapshot: NativePassengerDemoSnapshot;
  function publish(action: string) {
    lastAction = action;
    snapshot = {
      label: "DEMO",
      notice: NATIVE_DEMO_NOTICE,
      rides: rides
        .filter((ride) => ride.owner === account.drtsPassengerId)
        .map(({ view }) => ({
          orderId: view.order.orderId,
          orderNo: view.order.orderNo,
          status: view.order.status,
          paymentStatus: view.payment?.status ?? "not_selected",
        })),
      lastAction,
      lastOpenedFile,
    };
    for (const listener of listeners) listener();
  }
  publish(NATIVE_DEMO_NOTICE);
  const ownRide = (id: string) =>
    rides.find(
      (ride) =>
        ride.view.order.orderId === id &&
        ride.owner === account.drtsPassengerId,
    );
  const authenticated = (options?: FetchOptions) =>
    pair &&
    account.status === "active" &&
    header(options, "Authorization") === `Bearer ${pair.accessToken}`;
  function refreshActions(ride: DemoRide) {
    const view = ride.view;
    const paid = view.payment?.status === "captured";
    view.actions = {
      canCancel: ["ready_for_dispatch", "assigned", "arrived_pickup"].includes(
        view.order.status,
      ),
      canRate: view.order.status === "completed" && paid && !view.rating,
      canContact: false,
      canReadReceipt: view.order.status === "completed" && paid,
    };
    view.receipt = view.actions.canReadReceipt
      ? capturedDemoReceipt(view, at())
      : null;
  }
  function emit(ride: DemoRide, type: PassengerRideSseEvent) {
    ++ride.version;
    const event: PassengerRideSseEventEnvelope = {
      eventId: `DEMO-event-${ride.version}`,
      eventType: type,
      eventVersion: ride.version,
      assignmentVersion: ride.view.assignment?.assignmentVersion ?? null,
      orderId: ride.view.order.orderId,
      occurredAt: at(),
      data: clone(ride.view),
    };
    const frame = `data: ${JSON.stringify(snake(event))}\n\n`;
    for (const send of streams.get(ride.view.order.orderId) ?? []) send(frame);
  }
  function identify(provider: AuthProvider, subject: string) {
    if (
      !identities.some(
        (item) => item.provider === provider && item.subject === subject,
      )
    )
      identities.push({
        identityId: uuid(),
        drtsPassengerId: account.drtsPassengerId,
        provider,
        subject,
      });
    if (provider === "email") account.verifiedEmail = subject;
    if (provider === "phone") account.verifiedPhone = subject;
  }
  function login() {
    if (account.status === "deleted") {
      account = initialAccount();
      identities = [];
      methods = [];
    }
    pair = tokenPair();
    publish("模擬登入完成；未建立正式 session。");
    return pair;
  }
  const fetchFn: FetchFn = async (url, options) => {
    calls.push({ url, options: options ? clone(options) : undefined });
    if (!url.startsWith(`${NATIVE_DEMO_BASE_URL}/`))
      return failure(404, "demo_route_not_found");
    const raw = url.slice(NATIVE_DEMO_BASE_URL.length);
    const [path = "", search = ""] = raw.split("?");
    const method = (options?.method ?? "GET").toUpperCase();
    const query = Object.fromEntries(
      search
        .split("&")
        .filter(Boolean)
        .map((segment) => {
          const [key = "", value = ""] = segment.split("=");
          return [
            decodeURIComponent(key),
            decodeURIComponent(value.replace(/\+/g, " ")),
          ];
        }),
    );
    let body: Record<string, any> = {};
    try {
      body = options?.body ? JSON.parse(options.body) : {};
    } catch {
      return failure(400, "invalid_demo_request");
    }
    if (path === "/api/passenger-app/auth/providers" && method === "GET")
      return reply({
        providers: ["phone", "email", "google", "facebook", "line"],
      });
    if (path === "/api/passenger-app/fares" && method === "GET")
      return reply({ currentVersion: NATIVE_DEMO_FARE });
    if (path === "/api/passenger-app/auth/otp/request" && method === "POST") {
      if (body.purpose !== "login" && !authenticated(options))
        return failure(401, "unauthorized");
      otp = { challenge: uuid(), ...(body as RequestOtpCommand) };
      return reply({
        success: true,
        challenge: otp.challenge,
        message: "示意驗證碼123456；未發送簡訊或Email。",
      });
    }
    if (path === "/api/passenger-app/auth/otp/verify" && method === "POST") {
      const command = body as VerifyOtpCommand;
      const challenge = otp;
      if (
        !challenge ||
        command.code !== NATIVE_DEMO_OTP ||
        command.challenge !== challenge.challenge ||
        command.target !== challenge.target ||
        command.provider !== challenge.provider
      )
        return failure(400, "invalid_code");
      otp = null;
      if (challenge.purpose === "login") {
        const tokens = login();
        identify(challenge.provider, challenge.target);
        return reply({ result: "logged_in", ...tokens });
      }
      if (!authenticated(options)) return failure(401, "unauthorized");
      if (challenge.purpose === "verify_contact_phone") {
        account.contactPhone = challenge.target;
        account.contactPhoneVerified = true;
        publish("模擬手機驗證完成；未收到真實簡訊。");
        return reply({ result: "verified_contact_phone" });
      }
      identify(challenge.provider, challenge.target);
      return reply({ result: "linked" });
    }
    const oauthPath =
      /^\/api\/passenger-app\/auth\/oauth\/(google|facebook|line)\/(start|callback)$/.exec(
        path,
      );
    if (oauthPath && method === "POST") {
      if (oauthPath[2] === "start") {
        const command = body as OAuthStartCommand;
        if (command.purpose === "link" && !authenticated(options))
          return failure(401, "unauthorized");
        oauth = {
          ...command,
          transactionId: uuid(),
          state: `DEMO-state-${++serial}`,
        };
        return reply({
          authUrl: `${NATIVE_DEMO_BASE_URL}/synthetic-browser?state=${encodeURIComponent(oauth.state)}`,
          transactionId: oauth.transactionId,
          state: oauth.state,
          expiresAt: new Date(now() + 600000).toISOString(),
        });
      }
      const command = body as OAuthCallbackCommand;
      const transaction = oauth;
      if (
        !transaction ||
        command.transactionId !== transaction.transactionId ||
        command.state !== transaction.state ||
        command.provider !== transaction.provider ||
        command.code !== "DEMO-browser-code"
      )
        return failure(400, "invalid_grant");
      oauth = null;
      if (transaction.purpose === "link") {
        if (!authenticated(options)) return failure(401, "unauthorized");
        identify(command.provider, `DEMO-${command.provider}-subject`);
        return reply({ result: "linked" });
      }
      const tokens = login();
      identify(command.provider, `DEMO-${command.provider}-subject`);
      return reply({
        result: "logged_in",
        drtsPassengerId: account.drtsPassengerId,
        ...tokens,
      });
    }
    if (path === "/api/passenger-app/auth/refresh" && method === "POST") {
      if (!pair || body.refreshToken !== pair.refreshToken)
        return failure(400, "invalid_grant");
      pair = tokenPair();
      return reply(pair);
    }
    if (path === "/api/passenger-app/auth/logout" && method === "POST") {
      pair = null;
      publish("模擬登出；正式服務未被呼叫。");
      return reply({ success: true });
    }
    if (!authenticated(options))
      return failure(401, "unauthorized", "請先使用示意登入。");
    if (
      [
        "/api/passenger-app/settings",
        "/api/passenger-app/booking-settings",
      ].includes(path) &&
      method === "GET"
    )
      return reply({ minLeadTimeMinutes: 15, requireSmsVerification: false });
    if (path === "/api/passenger-app/me") {
      if (method === "GET") return reply({ account });
      if (method === "PATCH") {
        if (
          typeof body.contactPhone === "string" &&
          body.contactPhone !== account.contactPhone
        )
          account.contactPhoneVerified = false;
        account = { ...account, ...body };
        publish("個人資料已在示意記憶體更新。");
        return reply({ account });
      }
      if (method === "DELETE") {
        if (
          rides.some(
            (ride) =>
              ride.owner === account.drtsPassengerId &&
              ride.view.payment?.status === "failed",
          )
        )
          return failure(409, "pending_payment_block");
        account = {
          drtsPassengerId: account.drtsPassengerId,
          status: "deleted",
          createdAt: account.createdAt,
          deletedAt: at(),
          contactPhoneVerified: false,
        };
        pair = null;
        identities = [];
        methods = [];
        publish("模擬帳號刪除；未刪除正式帳號。");
        return reply({ success: true });
      }
    }
    if (path === "/api/passenger-app/me/identities" && method === "GET")
      return reply({ identities });
    if (
      path.startsWith("/api/passenger-app/me/identities/") &&
      method === "DELETE"
    ) {
      if (identities.length <= 1) return failure(409, "last_identity_error");
      const id = decodeURIComponent(path.split("/").at(-1)!);
      identities = identities.filter((identity) => identity.identityId !== id);
      return reply({ success: true });
    }
    if (path === "/api/passenger-app/payment-methods") {
      if (method === "GET") return reply({ methods });
      if (method === "POST") {
        const credential = String(body.providerToken ?? "");
        if (!credential.startsWith("DEMO-opaque-card-"))
          return failure(
            400,
            "invalid_payment_credential",
            "請使用示意付款介面，不輸入真實卡號。",
          );
        let card = methods.find(
          (item) => item.paymentMethodId === bindingMethods.get(credential),
        );
        if (!card) {
          card = {
            paymentMethodId: uuid(),
            last4: "0000",
            cardType: "示意卡 DEMO",
            expiryMonth: "12",
            expiryYear: "2099",
            isDefault: methods.length === 0,
          };
          methods.push(card);
          bindingMethods.set(credential, card.paymentMethodId);
        }
        publish("示意卡片已綁定，沒有真實PSP或扣款。");
        return reply({ status: "completed", method: card });
      }
    }
    const cardPath =
      /^\/api\/passenger-app\/payment-methods\/([^/]+)(\/default)?$/.exec(path);
    if (cardPath) {
      const id = decodeURIComponent(cardPath[1]!);
      const card = methods.find((item) => item.paymentMethodId === id);
      if (!card) return failure(404, "not_found");
      if (cardPath[2] && method === "PUT") {
        methods.forEach((item) => {
          item.isDefault = item.paymentMethodId === id;
        });
        return reply({ status: "completed", method: card });
      }
      if (!cardPath[2] && method === "DELETE") {
        methods = methods.filter((item) => item.paymentMethodId !== id);
        if (card.isDefault && methods[0]) methods[0].isDefault = true;
        return reply({ success: true });
      }
    }
    if (path === "/api/geo/search" && method === "GET")
      return reply({
        candidates: NATIVE_DEMO_ADDRESSES.map((address) => ({
          candidateId: address.addressId,
          provider: "DEMO",
          displayName: address.address,
          address: address.address,
          location: { lat: address.lat, lng: address.lng },
          confidence: "approximate",
        })),
        provider: "DEMO",
        generatedAt: at(),
      });
    if (path === "/api/geo/resolve" && method === "POST") {
      const address = NATIVE_DEMO_ADDRESSES.find(
        (item) => item.addressId === body.candidateId,
      );
      if (!address) return failure(404, "not_found");
      return reply({
        address: { ...address, resolvedAt: at() },
        provider: "DEMO",
        resolvedAt: at(),
      });
    }
    if (path === "/api/geo/reverse" && method === "POST") {
      const captured = NATIVE_DEMO_ADDRESSES.find(
        (address) =>
          address.lat === body.location?.lat &&
          address.lng === body.location?.lng,
      );
      return reply({
        address: {
          ...(captured ?? NATIVE_DEMO_ADDRESSES[0]),
          address: `${captured?.address ?? "示意手選位置 DEMO"}（非真實逆地理編碼）`,
          ...body.location,
          coordinateSource: "reverse_geocode",
          resolvedAt: at(),
        },
        provider: "DEMO",
        resolvedAt: at(),
      });
    }
    if (path === "/api/geo/route" && method === "POST")
      return reply({
        provider: "DEMO",
        distanceMeters: 5500,
        durationSeconds: 900,
        encodedPolyline: null,
        generatedAt: at(),
      });
    if (path === "/api/passenger-app/quotes" && method === "POST") {
      const id = uuid();
      quotes.set(id, clone(body as FareQuoteCommand));
      return reply({
        serviceAreaResult: "serviceable",
        estimatedMin: NATIVE_DEMO_QUOTE.estimatedMin,
        estimatedMax: NATIVE_DEMO_QUOTE.estimatedMax,
        fareVersion: NATIVE_DEMO_FARE.version,
        fareSnapshotId: id,
        expiresAt: new Date(now() + 900000).toISOString(),
      });
    }
    if (path === "/api/passenger-app/rides" && method === "POST") {
      const key = header(options, "x-request-id");
      const previous = key && ownRide(requests.get(key) ?? "");
      if (previous) return reply({ ride: previous.view });
      if (
        rides.some(
          (ride) =>
            ride.owner === account.drtsPassengerId &&
            ride.view.payment?.status === "failed",
        )
      )
        return failure(409, "pending_payment_block");
      const command = body as CreatePassengerRideCommand;
      if (!quotes.has(command.fareSnapshotId))
        return failure(409, "quote_expired");
      if (
        !methods.some(
          (card) => card.paymentMethodId === command.paymentMethodId,
        )
      )
        return failure(400, "invalid_payment_method");
      const id = uuid();
      const view: PassengerRideAuthorityView = {
        order: {
          orderId: id,
          orderNo: `DEMO-${rides.length + 1}`,
          status: "ready_for_dispatch",
          timingMode: "scheduled",
          requestedPickupAt: command.scheduledAt,
          pickup: {
            ...command.origin,
            address: command.origin.address ?? "示意起點 DEMO",
          },
          dropoff: {
            ...command.destination,
            address: command.destination.address ?? "示意終點 DEMO",
          },
          cancelableUntil: null,
          cancelledAt: null,
          completedAt: null,
        },
        assignment: null,
        rating: null,
        payment: {
          status: "authorized",
          amount: {
            currency: "TWD",
            amountMinor: NATIVE_DEMO_QUOTE.amountMinor,
          },
        },
        receipt: null,
        actions: {
          canCancel: true,
          canRate: false,
          canContact: false,
          canReadReceipt: false,
        },
      };
      rides.unshift({
        owner: account.drtsPassengerId,
        quoteId: command.fareSnapshotId,
        view,
        version: 0,
        complaints: [],
      });
      if (key) requests.set(key, id);
      publish("示意預約已建立，沒有真實派車。");
      return reply({ ride: view }, 201);
    }
    if (
      ["/api/passenger-app/rides", "/api/passenger-app/rides/active"].includes(
        path,
      ) &&
      method === "GET"
    ) {
      let list = rides.filter((ride) => ride.owner === account.drtsPassengerId);
      if (path.endsWith("/active") || query.status === "active")
        list = list.filter(
          (ride) =>
            !["completed", "cancelled"].includes(ride.view.order.status),
        );
      else if (query.status === "completed" || query.status === "cancelled")
        list = list.filter((ride) => ride.view.order.status === query.status);
      const start = query.cursor
        ? Number(query.cursor.replace("DEMO-page-", ""))
        : 0;
      const limit = Number(query.limit ?? 20);
      const page = list.slice(start, start + limit);
      return reply({
        rides: page.map((ride) => ride.view),
        ...(start + limit < list.length
          ? { nextCursor: `DEMO-page-${start + limit}` }
          : {}),
      });
    }
    const ridePath = /^\/api\/passenger-app\/rides\/([^/]+)(?:\/(.+))?$/.exec(
      path,
    );
    if (ridePath) {
      const id = decodeURIComponent(ridePath[1]!);
      const ride = ownRide(id);
      if (!ride) return failure(404, "not_found");
      const action = ridePath[2];
      if (!action && method === "GET") return reply({ ride: ride.view });
      if (action === "cancel" && method === "POST") {
        if (!ride.view.actions.canCancel)
          return failure(409, "cannot_cancel_state");
        controls.cancelTrip(id);
        return reply({ success: true });
      }
      if (action === "ratings" && method === "POST") {
        if (!ride.view.actions.canRate) return failure(409, "invalid_state");
        const command = body as RatePassengerRideCommand;
        ride.view.rating = {
          ratingId: uuid(),
          orderId: id,
          tripId: `DEMO-trip-${id}`,
          driverId: "DEMO-driver",
          passengerSubjectRef: account.drtsPassengerId,
          score: command.rating,
          tags: command.tags ?? [],
          comment: command.comments ?? null,
          status: "active",
          submittedAt: at(),
          updatedAt: at(),
        };
        if (command.rating <= 2 && command.contactRequested)
          ride.complaints.push({
            complaintId: `DEMO-rating-${id}`,
            command: {
              rideId: id,
              category: "service",
              content: command.comments || "示意低分客服請求 DEMO",
              contactConsent: true,
            },
          });
        refreshActions(ride);
        publish("示意評價已送出；不是正式評價或CRM案件。");
        return reply({ success: true });
      }
      if (action === "complaints" && method === "POST") {
        const key = `${id}:${header(options, "idempotency-key") ?? uuid()}`;
        let complaintId = complaints.get(key);
        if (!complaintId) {
          complaintId = uuid();
          complaints.set(key, complaintId);
          ride.complaints.push({
            complaintId,
            command: clone(body as CreatePassengerComplaintCommand),
          });
        }
        publish("示意申報已收到，未提交正式客服案件。");
        return reply({ complaintId });
      }
      if (
        (action === "receipt" || action === "receipt/downloads") &&
        method === "GET"
      ) {
        if (!ride.view.actions.canReadReceipt)
          return failure(409, "PASSENGER_RECEIPT_PENDING");
        const url = `${NATIVE_DEMO_BASE_URL}/api/passenger-app/rides/${id}/receipt/artifacts/html`;
        return reply({
          receiptUrl: url,
          ...(action === "receipt/downloads"
            ? { htmlUrl: url, certificateId: `DEMO-${id}`, orderId: id }
            : {}),
        });
      }
    }
    return failure(404, "demo_route_not_found");
  };
  const controls = {
    advanceTrip(id: string) {
      const ride = ownRide(id);
      if (!ride) throw new Error("demo_ride_not_found");
      const stages = [
        "ready_for_dispatch",
        "assigned",
        "arrived_pickup",
        "on_trip",
        "completed",
      ] as const;
      const index = stages.indexOf(
        ride.view.order.status as (typeof stages)[number],
      );
      const status = stages[index + 1];
      if (index < 0 || !status) return;
      ride.view.order.status = status;
      if (status === "assigned")
        ride.view.assignment = capturedDemoAssignment(
          ride.view,
          ride.quoteId,
          at(),
        );
      if (status === "completed") {
        ride.view.order.completedAt = at();
        if (ride.view.payment) ride.view.payment.status = "captured";
      }
      refreshActions(ride);
      emit(
        ride,
        status === "assigned"
          ? "assignment_disclosure_ready"
          : status === "arrived_pickup"
            ? "driver_arrived"
            : status === "on_trip"
              ? "trip_started"
              : "trip_completed",
      );
      publish(`模擬司機進度：${status}；沒有真實派車。`);
    },
    cancelTrip(id: string) {
      const ride = ownRide(id);
      if (!ride || !ride.view.actions.canCancel)
        throw new Error("demo_cannot_cancel");
      ride.view.order.status = "cancelled";
      ride.view.order.cancelledAt = at();
      ride.view.payment = {
        status: "not_selected",
        amount: { currency: "TWD", amountMinor: 0 },
      };
      refreshActions(ride);
      emit(ride, "trip_cancelled");
      publish("示意行程已取消，不收取消費；未操作真實訂單。");
    },
    setPaymentFailed(id: string) {
      const ride = ownRide(id);
      if (!ride || ride.view.order.status !== "completed")
        throw new Error("demo_complete_trip_first");
      if (ride.view.payment) ride.view.payment.status = "failed";
      refreshActions(ride);
      emit(ride, "trip_completed");
      publish("模擬付款失敗，沒有呼叫PSP或扣款。");
    },
    completeDemoPayment(id: string) {
      const ride = ownRide(id);
      if (!ride || ride.view.order.status !== "completed")
        throw new Error("demo_complete_trip_first");
      if (ride.view.payment) ride.view.payment.status = "captured";
      refreshActions(ride);
      emit(ride, "receipt_ready");
      publish("模擬付款完成；未扣款，乘車證明只提供示意HTML。");
    },
    appState(state: string) {
      appState = state;
      for (const listener of appListeners) listener(state);
    },
  };
  class DemoStreamRequest implements NativePassengerStreamRequest {
    readyState = 1;
    status = 0;
    responseText = "";
    headers: Record<string, string> = {};
    url = "";
    onreadystatechange: (() => void) | null = null;
    onprogress: (() => void) | null = null;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onabort: (() => void) | null = null;
    private unsubscribe: (() => void) | null = null;
    open(_method: string, url: string) {
      this.url = url;
    }
    setRequestHeader(name: string, value: string) {
      this.headers[name] = value;
    }
    getResponseHeader() {
      return this.status === 200 ? "text/event-stream" : "application/json";
    }
    send() {
      const match = new RegExp(
        `^${NATIVE_DEMO_BASE_URL.replace(/\./g, "\\.")}/api/passenger-app/rides/([^/]+)/events$`,
      ).exec(this.url);
      const ride = match && ownRide(decodeURIComponent(match[1]!));
      this.status = authenticated({ headers: this.headers })
        ? ride
          ? 200
          : 404
        : 401;
      this.readyState = 2;
      if (this.status !== 200)
        this.responseText = JSON.stringify({
          error: { code: this.status === 401 ? "unauthorized" : "not_found" },
        });
      this.onreadystatechange?.();
      if (this.status !== 200 || !ride) return;
      const sink = (frame: string) => {
        this.readyState = 3;
        this.responseText += frame;
        this.onprogress?.();
      };
      const set = streams.get(ride.view.order.orderId) ?? new Set();
      set.add(sink);
      streams.set(ride.view.order.orderId, set);
      this.unsubscribe = () => set.delete(sink);
    }
    abort() {
      this.unsubscribe?.();
      this.unsubscribe = null;
      this.onabort?.();
    }
  }
  class DemoBinaryRequest implements NativePassengerBinaryRequest {
    status = 0;
    response: unknown = null;
    responseType = "";
    headers: Record<string, string> = {};
    url = "";
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onabort: (() => void) | null = null;
    open(_method: string, url: string) {
      this.url = url;
    }
    setRequestHeader(name: string, value: string) {
      this.headers[name] = value;
    }
    getResponseHeader(name: string) {
      return name === "Content-Type"
        ? "text/html; charset=utf-8"
        : 'attachment; filename="DEMO-receipt.html"';
    }
    send() {
      const match = new RegExp(
        `^${NATIVE_DEMO_BASE_URL.replace(/\./g, "\\.")}/api/passenger-app/rides/([^/]+)/receipt/artifacts/html$`,
      ).exec(this.url);
      const ride = match && ownRide(decodeURIComponent(match[1]!));
      this.status = authenticated({ headers: this.headers })
        ? ride?.view.receipt
          ? 200
          : 404
        : 401;
      if (this.status === 200 && ride) {
        const html = `<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><title>DEMO示意乘車證明</title><h1>示意乘車證明 ${escapeHtml(ride.view.order.orderNo)}</h1><p>${escapeHtml(NATIVE_DEMO_NOTICE)}</p><p>${escapeHtml(ride.view.order.pickup.address)} → ${escapeHtml(ride.view.order.dropoff.address)}</p><p>固定示意金額 NT$260；示意業者DEMO（虛構）。不提供PDF或正式憑證。</p></html>`;
        this.response = utf8(html).buffer;
      }
      this.onload?.();
    }
    abort() {
      this.onabort?.();
    }
  }
  const store = {
    read: async () => (stored ? clone(stored) : null),
    write: async (tokens: NativePassengerTokenPair) => {
      stored = clone(tokens);
    },
    clear: async () => {
      stored = null;
    },
  };
  const browser = {
    async openAuthSession(_authUrl: string, redirectUri: string) {
      if (!oauth) return { type: "cancel" as const };
      publish("模擬系統瀏覽器回傳，未連線OAuth供應商。");
      return {
        type: "success" as const,
        url: `${redirectUri}?code=DEMO-browser-code&state=${encodeURIComponent(oauth.state)}`,
      };
    },
  };
  const receipts = {
    createRequest: () => new DemoBinaryRequest(),
    files: {
      async write(file: {
        fileName: string;
        contentType: string;
        bytes: Uint8Array;
      }) {
        const uri = `demo-memory://DEMO-${++serial}-${file.fileName}`;
        files.set(uri, {
          contentType: file.contentType,
          bytes: file.bytes.slice(),
        });
        return uri;
      },
      async remove(uri: string) {
        files.delete(uri);
      },
      async open(uri: string) {
        if (!files.has(uri)) throw new Error("demo_file_missing");
        lastOpenedFile = uri;
        publish("示意HTML已寫入記憶體並開啟；不是實機檔案、PDF或正式憑證。");
      },
    },
  };
  const events = {
    createRequest: () => new DemoStreamRequest(),
    appState: {
      currentState: () => appState,
      subscribe: (listener: (state: string) => void) => {
        appListeners.add(listener);
        return () => {
          appListeners.delete(listener);
        };
      },
    },
  };
  return {
    label: "DEMO" as const,
    notice: NATIVE_DEMO_NOTICE,
    fetchFn,
    store,
    browser,
    receipts,
    events,
    controls,
    now,
    newRequestId: uuid,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    calls: () => clone(calls),
    getFile: (uri: string) => files.get(uri)?.bytes.slice(),
    complaints: (id: string) => clone(ownRide(id)?.complaints ?? []),
  };
}
export type NativePassengerDemoScenario = ReturnType<
  typeof createNativePassengerDemoScenario
>;
export type NativePassengerDemoRuntimeOptions =
  NativePassengerRuntimeOptions & { demoScenario: NativePassengerDemoScenario };
/** Only explicitly selected demo mode calls this factory; configured bootstrap never calls it. */
export function createNativePassengerDemoRuntimeOptions(
  input: { now?: () => number; bookingMap?: NativeBookingMapAvailability } = {},
): NativePassengerDemoRuntimeOptions {
  const scenario = createNativePassengerDemoScenario(input);
  return {
    baseUrl: NATIVE_DEMO_BASE_URL,
    mode: "demo",
    callbackUri: "drtspassenger://auth/callback",
    demoOtpHint: NATIVE_DEMO_OTP,
    fetchFn: scenario.fetchFn,
    store: scenario.store,
    browser: { status: "ready", port: scenario.browser },
    paymentFields: {
      status: "ready",
      port: {
        kind: "synthetic",
        async collectCredential() {
          return {
            providerToken: `DEMO-opaque-card-${scenario.newRequestId()}`,
          };
        },
        dispose() {},
      },
    },
    paymentBrowser: {
      status: "ready",
      kind: "synthetic",
      port: {
        async openAction() {
          return { type: "returned" };
        },
      },
    },
    bookingMap: input.bookingMap ?? { status: "unavailable" },
    newRequestId: scenario.newRequestId,
    now: scenario.now,
    receipts: scenario.receipts,
    events: scenario.events,
    telephone: {
      async open() {
        /* Explicit demo telephone boundary; no platform dial or external call. */
      },
    },
    notifications: { status: "unavailable" },
    demoScenario: scenario,
  };
}
