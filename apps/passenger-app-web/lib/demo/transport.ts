import type {
  AuthProvider,
  CreatePassengerRideCommand,
  FareQuoteCommand,
  GeoSearchResponse,
  PassengerRideAuthorityView,
  UpdatePassengerMeCommand,
} from "@drts/contracts";
import {
  addDemoComplaint,
  advanceDemoRide,
  cancelDemoRide,
  DEMO_ADDRESSES,
  DEMO_FARE,
  DEMO_OTP_CODE,
  demoId,
  getDemoReceipt,
  getDemoState,
  isDemoMode,
  rateDemoRide,
  resetDemo,
  retryDemoPayment,
  setDemoPaymentFailure,
  updateDemoState,
} from "./store";
import type { DemoComplaint, DemoRide, DemoState } from "./types";

class DemoRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function fail(status: number, code: string, message: string): never {
  throw new DemoRequestError(status, code, message);
}

function result(data: unknown, status = 200): Response {
  return Response.json(
    { data, meta: { mode: "demo", simulated: true } },
    { status },
  );
}

function bodyRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([key, content]) => [
      key.replace(/_([a-z])/g, (_match, char: string) => char.toUpperCase()),
      content,
    ]),
  );
}

function loggedIn(): DemoState {
  const state = getDemoState();
  if (!state?.loggedIn || state.account.status !== "active")
    fail(401, "unauthorized", "請先進行示範登入。");
  return state;
}

function identify(state: DemoState, provider: AuthProvider, subject: string) {
  if (
    !state.identities.some(
      (identity) =>
        identity.provider === provider && identity.subject === subject,
    )
  )
    state.identities.push({
      drtsPassengerId: state.account.drtsPassengerId,
      identityId: demoId("demo-identity"),
      provider,
      subject,
    });
  if (provider === "phone") {
    state.account.contactPhone = subject;
    state.account.contactPhoneVerified = true;
    state.account.verifiedPhone = subject;
  }
  if (provider === "email") state.account.verifiedEmail = subject;
}

export function demoRideAuthority(ride: DemoRide): PassengerRideAuthorityView {
  const statuses = {
    reserved: "ready_for_dispatch",
    assigned: "assigned",
    arrived: "arrived_pickup",
    in_progress: "on_trip",
    completed: "completed",
    cancelled: "cancelled",
  } as const;
  return {
    order: {
      orderId: ride.id,
      orderNo: ride.orderNo,
      status: statuses[ride.status],
      timingMode: "scheduled",
      requestedPickupAt: ride.scheduledAt,
      pickup: ride.origin,
      dropoff: ride.destination,
      cancelableUntil: ride.scheduledAt,
      cancelledAt: ride.cancelledAt,
      completedAt: ride.completedAt,
    },
    assignment: null,
    rating: null,
    payment: {
      status:
        ride.paymentStatus === "paid"
          ? "captured"
          : ride.paymentStatus === "failed"
            ? "failed"
            : "authorized",
      amount: { currency: "TWD", amountMinor: ride.amount },
    },
    receipt: null,
    actions: {
      canCancel: ["reserved", "assigned", "arrived"].includes(ride.status),
      canRate: ride.status === "completed" && ride.rating === null,
      canContact: !["completed", "cancelled"].includes(ride.status),
      canReadReceipt:
        ride.status === "completed" && ride.paymentStatus === "paid",
    },
  };
}

function routeDistance(command: FareQuoteCommand): number {
  return Math.max(
    1000,
    Math.round(
      Math.hypot(
        (command.destinationLat - command.originLat) * 111_320,
        (command.destinationLng - command.originLng) * 100_900,
      ),
    ),
  );
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
}

/** This adapter is entirely local. Unimplemented paths never fall back to HTTP. */
export async function demoFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  try {
    if (!isDemoMode()) fail(409, "demo_mode_inactive", "請先開啟功能示範。");
    const request =
      typeof Request !== "undefined" && input instanceof Request ? input : null;
    const url = new URL(request?.url ?? String(input), window.location.origin);
    const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
    const headers = new Headers(init?.headers ?? request?.headers);
    const rawBody =
      init?.body ??
      (request && method !== "GET" && method !== "HEAD"
        ? await request.clone().text()
        : undefined);
    let data: Record<string, unknown> = {};
    if (rawBody) {
      try {
        data = bodyRecord(JSON.parse(String(rawBody)));
      } catch {
        fail(400, "invalid_demo_request", "示範請求格式不正確。");
      }
    }
    const prefix = "/api/passenger-app/";
    if (!url.pathname.startsWith(prefix))
      fail(404, "demo_route_not_found", "此路徑未提供功能示範。");
    const path = url.pathname.slice(prefix.length).replace(/\/$/, "");

    if (path === "auth/providers" && method === "GET")
      return result({
        providers: ["phone", "email", "google", "facebook", "line"],
      });
    if (path === "auth/otp/request" && method === "POST") {
      const provider = data.provider;
      if (provider !== "phone" && provider !== "email")
        fail(400, "invalid_provider", "請選擇手機或 Email。");
      if (data.purpose !== "login") loggedIn();
      const challenge = demoId("demo-otp");
      updateDemoState((state) => {
        state.otp = {
          challenge,
          provider,
          target: String(data.target ?? ""),
          purpose:
            data.purpose === "link"
              ? "link"
              : data.purpose === "verify_contact_phone"
                ? "verify_contact_phone"
                : "login",
        };
      });
      return result({
        success: true,
        challenge,
        message: `示範驗證碼：${DEMO_OTP_CODE}（不會實際發送簡訊或信件）`,
      });
    }
    if (path === "auth/otp/verify" && method === "POST") {
      const otp = getDemoState()?.otp;
      if (
        !otp ||
        data.code !== DEMO_OTP_CODE ||
        data.challenge !== otp.challenge ||
        data.target !== otp.target ||
        data.provider !== otp.provider
      )
        fail(400, "invalid_code", `功能示範請輸入驗證碼 ${DEMO_OTP_CODE}。`);
      if (
        otp.purpose === "login" &&
        getDemoState()?.account.status === "deleted"
      )
        resetDemo();
      else if (otp.purpose !== "login") loggedIn();
      updateDemoState((state) => {
        state.loggedIn = true;
        if (otp.purpose === "verify_contact_phone") {
          state.account.contactPhone = otp.target;
          state.account.contactPhoneVerified = true;
          state.account.verifiedPhone = otp.target;
        } else identify(state, otp.provider, otp.target);
        state.otp = null;
      });
      return result(
        otp.purpose === "login"
          ? {
              result: "logged_in",
              accessToken: "demo-local-session",
              refreshToken: "demo-local-refresh",
            }
          : {
              result:
                otp.purpose === "link" ? "linked" : "verified_contact_phone",
            },
      );
    }
    const oauth =
      /^auth\/oauth\/(google|facebook|line)\/(start|callback)$/.exec(path);
    if (oauth && method === "POST") {
      const provider = oauth[1] as "google" | "facebook" | "line";
      if (oauth[2] === "start") {
        if (data.purpose === "link") loggedIn();
        const transactionId = crypto.randomUUID();
        const stateId = demoId("demo-oauth");
        updateDemoState((state) => {
          state.oauth = {
            provider,
            state: stateId,
            transactionId,
            purpose: data.purpose === "link" ? "link" : "login",
          };
        });
        const authUrl = new URL(
          `/auth/callback/${provider}`,
          window.location.origin,
        );
        authUrl.searchParams.set("state", stateId);
        authUrl.searchParams.set("code", "demo-authorized");
        return result({
          authUrl: authUrl.toString(),
          transactionId,
          state: stateId,
          expiresAt: new Date(Date.now() + 600_000).toISOString(),
        });
      }
      const transaction = getDemoState()?.oauth;
      if (
        !transaction ||
        transaction.provider !== provider ||
        transaction.state !== data.state ||
        data.error ||
        data.code !== "demo-authorized"
      )
        fail(400, "invalid_grant", "示範授權已取消，請重新選擇登入方式。");
      if (
        transaction.purpose === "login" &&
        getDemoState()?.account.status === "deleted"
      )
        resetDemo();
      else if (transaction.purpose === "link") loggedIn();
      updateDemoState((state) => {
        state.loggedIn = true;
        identify(state, provider, `demo-${provider}-subject`);
        state.oauth = null;
      });
      return result({
        result: transaction.purpose === "link" ? "linked" : "logged_in",
      });
    }
    if (path === "auth/logout" && method === "POST") {
      updateDemoState((state) => {
        state.loggedIn = false;
        state.otp = null;
        state.oauth = null;
      });
      return result({ success: true });
    }
    if (path === "fares" && method === "GET")
      return result({ currentVersion: DEMO_FARE });
    if (["settings", "booking-settings"].includes(path) && method === "GET")
      return result({ minLeadTimeMinutes: 15, requireSmsVerification: false });

    const state = loggedIn();
    if (path === "auth/refresh" && method === "POST")
      return result({
        accessToken: "demo-local-session",
        refreshToken: "demo-local-refresh",
      });
    if (path === "me") {
      if (method === "GET") return result({ account: state.account });
      if (method === "PATCH") {
        const command = data as UpdatePassengerMeCommand;
        const account = updateDemoState((current) => {
          for (const key of [
            "displayName",
            "contactPhone",
            "termsVersion",
            "privacyVersion",
            "feeAcknowledgementVersion",
          ] as const)
            if (typeof command[key] === "string")
              current.account[key] = command[key];
          if (typeof command.contactConsent === "boolean")
            current.account.contactConsent = command.contactConsent;
          if (
            typeof command.contactPhone === "string" &&
            command.contactPhone !== state.account.contactPhone
          )
            current.account.contactPhoneVerified = false;
          return current.account;
        });
        return result({ account });
      }
      if (method === "DELETE") {
        updateDemoState((current) => {
          current.account = {
            drtsPassengerId: current.account.drtsPassengerId,
            status: "deleted",
            createdAt: current.account.createdAt,
            deletedAt: new Date().toISOString(),
            contactPhoneVerified: false,
          };
          current.loggedIn = false;
          current.identities = [];
          current.paymentMethods = [];
        });
        return result({ success: true });
      }
    }
    if (path === "me/identities" && method === "GET")
      return result({ identities: state.identities });
    if (path.startsWith("me/identities/") && method === "DELETE") {
      if (state.identities.length <= 1)
        fail(409, "last_identity", "請保留至少一種示範登入方式。");
      const id = decodeURIComponent(path.slice("me/identities/".length));
      updateDemoState((current) => {
        current.identities = current.identities.filter(
          (identity) => identity.identityId !== id,
        );
      });
      return result({ success: true });
    }
    if (path === "payment-methods") {
      if (method === "GET") return result({ methods: state.paymentMethods });
      if (method === "POST") {
        if (
          typeof data.providerToken !== "string" ||
          !data.providerToken.startsWith("demo_card_")
        )
          fail(
            400,
            "invalid_payment_credential",
            "請使用示意卡片，勿輸入真實卡號。",
          );
        const credential = data.providerToken;
        const previous = state.paymentMethods.find(
          (card) => card.paymentMethodId === state.bindingMethods[credential],
        );
        if (previous) return result({ status: "completed", method: previous });
        const card = updateDemoState((current) => {
          const value = {
            paymentMethodId: demoId("demo-card"),
            last4: "0000",
            cardType: "示意卡",
            expiryMonth: "12",
            expiryYear: "2099",
            isDefault: current.paymentMethods.length === 0,
          };
          current.paymentMethods.push(value);
          current.bindingMethods[credential] = value.paymentMethodId;
          return value;
        });
        return result({ status: "completed", method: card });
      }
    }
    const methodPath = /^payment-methods\/([^/]+)(\/default)?$/.exec(path);
    if (methodPath) {
      const id = decodeURIComponent(methodPath[1]!);
      const card = state.paymentMethods.find(
        (item) => item.paymentMethodId === id,
      );
      if (!card) fail(404, "not_found", "找不到示意卡片。");
      if (methodPath[2] && method === "PUT") {
        updateDemoState((current) => {
          current.paymentMethods.forEach((item) => {
            item.isDefault = item.paymentMethodId === id;
          });
        });
        return result({
          status: "completed",
          method: { ...card, isDefault: true },
        });
      }
      if (!methodPath[2] && method === "DELETE") {
        updateDemoState((current) => {
          current.paymentMethods = current.paymentMethods.filter(
            (item) => item.paymentMethodId !== id,
          );
          if (card.isDefault && current.paymentMethods[0])
            current.paymentMethods[0].isDefault = true;
        });
        return result({ success: true });
      }
    }
    if (path === "geo/search" && method === "GET") {
      const response: GeoSearchResponse = {
        candidates: DEMO_ADDRESSES.map((address) => ({
          candidateId: address.addressId!,
          provider: "demo",
          displayName: address.address,
          address: address.address,
          location: { lat: address.lat, lng: address.lng },
          confidence: "approximate",
        })),
        provider: "demo",
        generatedAt: new Date().toISOString(),
      };
      return result(response);
    }
    if (["geo/resolve", "geo/reverse"].includes(path) && method === "POST") {
      const selected =
        DEMO_ADDRESSES.find(
          (address) =>
            address.addressId === data.candidateId ||
            address.address === data.addressText,
        ) ?? DEMO_ADDRESSES[0]!;
      return result({
        address: selected,
        provider: "demo",
        resolvedAt: new Date().toISOString(),
      });
    }
    if (path === "geo/route" && method === "POST")
      return result({
        provider: "demo",
        distanceMeters: 5500,
        durationSeconds: 900,
        encodedPolyline: null,
        generatedAt: new Date().toISOString(),
      });
    if (path === "quotes" && method === "POST") {
      const command = data as unknown as FareQuoteCommand;
      if (
        ![
          command.originLat,
          command.originLng,
          command.destinationLat,
          command.destinationLng,
        ].every(Number.isFinite)
      )
        fail(400, "invalid_location", "請選擇示意上下車地點。");
      const amount =
        DEMO_FARE.baseFare +
        Math.ceil(
          (routeDistance(command) - DEMO_FARE.baseDistanceMeters) /
            DEMO_FARE.distanceIncrementMeters,
        ) *
          DEMO_FARE.distanceRate;
      const quote = {
        id: demoId("demo-quote"),
        command,
        estimatedMin: amount,
        estimatedMax: amount + 20,
        expiresAt: new Date(Date.now() + 900_000).toISOString(),
      };
      updateDemoState((current) => {
        current.quotes.push(quote);
      });
      return result({
        serviceAreaResult: "serviceable",
        estimatedMin: quote.estimatedMin,
        estimatedMax: quote.estimatedMax,
        fareVersion: DEMO_FARE.version,
        fareSnapshotId: quote.id,
        expiresAt: quote.expiresAt,
      });
    }
    if (path === "rides" && method === "POST") {
      const command = data as unknown as CreatePassengerRideCommand;
      const requestId = headers.get("x-request-id");
      const previous =
        requestId &&
        state.rides.find((ride) => ride.id === state.requestRides[requestId]);
      if (previous) return result({ ride: demoRideAuthority(previous) });
      if (state.rides.some((ride) => ride.paymentStatus === "failed"))
        fail(409, "pending_payment_block", "請先完成前次行程的模擬付款。");
      const quote = state.quotes.find(
        (item) => item.id === command.fareSnapshotId,
      );
      if (!quote || Date.parse(quote.expiresAt) <= Date.now())
        fail(409, "quote_expired", "示意報價已到期，請重新試算。");
      if (
        !state.paymentMethods.some(
          (card) => card.paymentMethodId === command.paymentMethodId,
        )
      )
        fail(400, "invalid_payment_method", "請先新增並選擇示意卡片。");
      const ride: DemoRide = {
        id: demoId("demo-ride"),
        orderNo: `DEMO-${String(state.rides.length + 1).padStart(4, "0")}`,
        status: "reserved",
        origin: {
          ...command.origin,
          address: command.origin.address ?? DEMO_ADDRESSES[0]!.address,
        },
        destination: {
          ...command.destination,
          address: command.destination.address ?? DEMO_ADDRESSES[1]!.address,
        },
        scheduledAt: command.scheduledAt,
        createdAt: new Date().toISOString(),
        completedAt: null,
        cancelledAt: null,
        paymentMethodId: command.paymentMethodId,
        paymentStatus: "pending",
        amount: quote.estimatedMin,
        estimatedMin: quote.estimatedMin,
        estimatedMax: quote.estimatedMax,
        driver: {
          name: "示意司機 小林",
          plate: "DEMO-001",
          vehicle: "示意白色舒適房車",
        },
        operator: "示意交通服務公司（虛構）",
        rating: null,
        ratingComment: "",
        contactRequested: false,
        complaints: [],
      };
      updateDemoState((current) => {
        current.rides.unshift(ride);
        if (requestId) current.requestRides[requestId] = ride.id;
      });
      return result({ ride: demoRideAuthority(ride) }, 201);
    }
    if ((path === "rides" || path === "rides/active") && method === "GET") {
      const status = url.searchParams.get("status");
      let rides = state.rides;
      if (path === "rides/active" || status === "active")
        rides = rides.filter(
          (ride) => !["completed", "cancelled"].includes(ride.status),
        );
      else if (status === "completed" || status === "cancelled")
        rides = rides.filter((ride) => ride.status === status);
      return result({ rides: rides.map(demoRideAuthority) });
    }
    const ridePath = /^rides\/([^/]+)(?:\/(.+))?$/.exec(path);
    if (ridePath) {
      const id = decodeURIComponent(ridePath[1]!);
      const ride = state.rides.find((item) => item.id === id);
      if (!ride) fail(404, "not_found", "找不到示範行程。");
      const action = ridePath[2];
      if (!action && method === "GET")
        return result({ ride: demoRideAuthority(ride) });
      if (method === "POST") {
        if (action === "cancel") {
          cancelDemoRide(id);
          return result({ success: true });
        }
        if (action === "advance") return result({ ride: advanceDemoRide(id) });
        if (action === "payment/fail")
          return result({ ride: setDemoPaymentFailure(id) });
        if (action === "payment/retry")
          return result({ ride: retryDemoPayment(id) });
        if (action === "ratings") {
          rateDemoRide(
            id,
            Number(data.rating ?? data.score),
            String(data.comments ?? data.comment ?? ""),
            data.contactRequested === true,
          );
          return result({ success: true });
        }
        if (action === "complaints") {
          const complaint = addDemoComplaint(id, {
            category: (data.category ?? "other") as DemoComplaint["category"],
            content: String(data.content ?? ""),
            contactConsent: data.contactConsent === true,
            ...(typeof data.lostItemDescription === "string"
              ? { lostItemDescription: data.lostItemDescription }
              : {}),
          });
          return result({ complaintId: complaint.id, complaint });
        }
      }
      if (method === "GET" && action?.startsWith("receipt")) {
        const receipt = getDemoReceipt(id);
        if (action === "receipt/artifacts/html") {
          const rows = receipt.lines
            .map(
              (line) =>
                `<tr><td>${escapeHtml(line.label)}</td><td>${line.amount}</td></tr>`,
            )
            .join("");
          return new Response(
            `<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><title>示意乘車證明</title><h1>示意乘車證明 ${escapeHtml(receipt.orderNo)}</h1><p>${escapeHtml(receipt.notice)}</p><p>${escapeHtml(receipt.operator)} · ${escapeHtml(receipt.driverName)} · ${escapeHtml(receipt.vehiclePlate)}</p><p>${escapeHtml(receipt.pickup)} → ${escapeHtml(receipt.destination)}</p><table>${rows}</table><p>總額 TWD ${receipt.amount} · ${escapeHtml(receipt.paymentMethod)}</p></html>`,
            { headers: { "Content-Type": "text/html; charset=utf-8" } },
          );
        }
        return result({
          receipt,
          receiptUrl: `/ride?rideId=${encodeURIComponent(id)}&receipt=1`,
        });
      }
    }
    fail(404, "demo_route_not_found", "此功能尚未提供示範操作。");
  } catch (error) {
    const status = error instanceof DemoRequestError ? error.status : 400;
    const code =
      error instanceof DemoRequestError
        ? error.code
        : error instanceof Error
          ? error.message
          : "demo_request_failed";
    return Response.json(
      {
        error: {
          code,
          message: error instanceof Error ? error.message : "示範操作未完成。",
        },
        meta: { mode: "demo", simulated: true },
      },
      { status },
    );
  }
}
