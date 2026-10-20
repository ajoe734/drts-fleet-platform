import { vi } from "vitest";
import { BOOKING_RECOVERY_KEY } from "../../../apps/passenger-app-web/components/booking/booking-draft-recovery";
import { apiWireResponse } from "../pax-web-shell-20261009/api-wire-fixtures";
import { NextRequest } from "next/server";
import * as bff from "../../../apps/passenger-app-web/app/api/passenger-app/[...path]/route";
import type {
  FareVersion,
  PassengerAccount,
} from "../../../packages/contracts/src/passenger-app";

export const fare: FareVersion = {
  version: "synthetic-fare-v1",
  effectiveAt: "2023-04-01T00:00:00+08:00",
  baseFare: 85,
  baseDistanceMeters: 1250,
  distanceRate: 5,
  distanceIncrementMeters: 200,
  delayRate: 5,
  delayIncrementSeconds: 60,
  nightSurcharge: 20,
  nightSurchargeWindowStart: "23:00",
  nightSurchargeWindowEnd: "06:00",
  additionalFees: {},
};
export const selection = {
  paymentMethodId: "synthetic-owned-method",
  label: "測試付款方式",
};
export function bookingFixture() {
  // A new fixture is a new isolated account scenario; remounts using this
  // same fixture deliberately retain the per-tab recovery record.
  if (typeof sessionStorage !== "undefined")
    sessionStorage.removeItem(BOOKING_RECOVERY_KEY);
  const f = {
    account: {
      drtsPassengerId: "synthetic-account-1",
      displayName: "測試乘客",
      contactPhone: "0912000000",
      contactPhoneVerified: false,
      status: "active",
      createdAt: "2026-10-11T00:00:00Z",
      feeAcknowledgementVersion: fare.version,
    } as PassengerAccount,
    fare: { ...fare },
    settings: {
      minLeadTimeMinutes: 30,
      requireSmsVerification: false,
    } as unknown,
    emptyCandidates: false,
    quoteExpires: "2099-10-11T12:00:00Z",
    serviceable: true,
    createResponder: undefined as undefined | (() => Promise<Response>),
    errors: new Map<string, { status: number; code: string }>(),
    calls: [] as {
      path: string;
      method: string;
      body: Record<string, unknown>;
      headers: Headers;
    }[],
  };
  vi.stubEnv("DRTS_API_URL", "https://api.example.test");
  vi.stubEnv("DRTS_API_AUTH_AUDIENCE", "");
  vi.stubGlobal("fetch", async (url: string | URL, init?: RequestInit) => {
    const target = new URL(String(url), "https://ride.example.test");
    const method = init?.method ?? "GET";
    if (target.origin !== "https://api.example.test") {
      const headers = new Headers(init?.headers);
      headers.set("cookie", "pax_session=synthetic-passenger-session");
      headers.set("origin", "https://ride.example.test");
      const request = new NextRequest(target, {
        method,
        headers,
        ...(init?.body ? { body: init.body } : {}),
      });
      const handler = bff[method as "GET" | "POST" | "PATCH"];
      return handler(request, {
        params: Promise.resolve({
          path: target.pathname.replace("/api/passenger-app/", "").split("/"),
        }),
      });
    }
    const path = target.pathname;
    const body = init?.body ? await new Response(init.body).json() : {};
    f.calls.push({ path, method, body, headers: new Headers(init?.headers) });
    if (method === "POST" && path.endsWith("/rides") && f.createResponder)
      return f.createResponder();
    const failure = f.errors.get(`${method} ${path}`);
    if (failure)
      return Response.json(
        {
          error: {
            code: failure.code,
            message: "synthetic HTTP boundary failure",
            details: {},
            retryable: false,
          },
        },
        { status: failure.status },
      );
    let data: unknown;
    if (path.endsWith("/settings")) data = f.settings;
    else if (path.endsWith("/fares")) data = { currentVersion: f.fare };
    else if (path.endsWith("/me")) {
      if (method === "PATCH") f.account = { ...f.account, ...body };
      data = { account: f.account };
    } else if (path.endsWith("/geo/search")) {
      const name = target.searchParams.get("q")!;
      data = {
        candidates: f.emptyCandidates
          ? []
          : [
              {
                candidateId: name,
                provider: "synthetic-http",
                displayName: name,
                address: `台北市${name}測試路1號`,
                location: { lat: 25, lng: 121 },
                confidence: "exact",
              },
            ],
        provider: "synthetic-http",
        generatedAt: "2026-10-11T10:00:00Z",
      };
    } else if (path.endsWith("/geo/resolve")) {
      data = {
        address: {
          address: String(body.addressText),
          lat: 25,
          lng: 121,
          coordinateSource: "provider_candidate",
          geocodeConfidence: "exact",
          geocodeProvider: "synthetic-http",
          surface: "passenger_entry",
        },
        provider: "synthetic-http",
        resolvedAt: "2026-10-11T10:00:00Z",
      };
    } else if (path.endsWith("/geo/reverse")) {
      data = {
        address: {
          address: "台北市圖釘測試位置",
          ...(body.location as object),
          coordinateSource: "reverse_geocode",
          geocodeConfidence: "exact",
          surface: "passenger_entry",
        },
        provider: "synthetic-http",
        resolvedAt: "2026-10-11T10:00:00Z",
      };
    } else if (path.endsWith("/quotes")) {
      data = f.serviceable
        ? {
            serviceAreaResult: "serviceable",
            estimatedMin: 320,
            estimatedMax: 380,
            fareVersion: f.fare.version,
            fareSnapshotId: "synthetic-owned-quote",
            expiresAt: f.quoteExpires,
          }
        : { serviceAreaResult: "not_serviceable" };
    } else if (path.endsWith("/rides"))
      data = { ride: { order: { orderId: "synthetic-owned-order" } } };
    else throw new Error(`Unexpected external boundary: ${method} ${path}`);
    return apiWireResponse(data);
  });
  return f;
}
