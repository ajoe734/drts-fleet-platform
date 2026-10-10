import { vi } from "vitest";
import { NextRequest, type NextResponse } from "next/server";
import type {
  AuthProvider,
  PassengerAccount,
  PassengerLoginIdentity,
} from "@drts/contracts";
import {
  GET,
  POST,
  PATCH,
  DELETE,
} from "../../../apps/passenger-app-web/app/api/passenger-app/[...path]/route";
import { apiWireResponse } from "../pax-web-shell-20261009/api-wire-fixtures";
import { PassengerAuthClient } from "../../../packages/passenger-client/src/auth/index";

export const uuid = "11111111-1111-4111-8111-111111111111";
export const secondUuid = "22222222-2222-4222-8222-222222222222";
export const passengerId = `drts_passenger_${uuid}`;
export const sessionToken = (subject = passengerId, family = uuid) =>
  `header.${Buffer.from(JSON.stringify({ sub: subject, sid: family })).toString("base64url")}.signature`;
export const allProviders: AuthProvider[] = [
  "phone",
  "email",
  "google",
  "facebook",
  "line",
];
type Failure = { code: string; status: number } | null;
type Call = {
  path: string;
  method: string;
  body: Record<string, any> | undefined;
  headers: Headers;
};

/** Only upstream HTTP and browser navigation are stubbed. UI -> portable auth
 * transport -> real NextRequest/route handlers -> API envelope/serializer remain real.
 * This fixture is not evidence of PostgreSQL, API domain enforcement or live OAuth.
 */
export function installBoundary(
  origin = "https://ride.smarttransport.tw",
  authenticated = false,
) {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("DRTS_API_URL", "https://upstream.invalid");
  vi.stubEnv("DRTS_API_AUTH_AUDIENCE", "");
  vi.stubEnv("NEXT_PUBLIC_PASSENGER_TERMS_VERSION", "terms-test");
  vi.stubEnv("NEXT_PUBLIC_PASSENGER_PRIVACY_VERSION", "privacy-test");
  vi.stubEnv("NEXT_PUBLIC_TERMS_URL", "https://content.invalid/terms");
  vi.stubEnv("NEXT_PUBLIC_PRIVACY_URL", "https://content.invalid/privacy");
  const state = {
    providers: [...allProviders],
    account: {
      drtsPassengerId: passengerId,
      displayName: "Tester",
      contactPhone: "0900000000",
      contactPhoneVerified: false,
      termsVersion: "terms-test",
      privacyVersion: "privacy-test",
      status: "active",
      createdAt: "2026-10-09T00:00:00Z",
    } as PassengerAccount,
    identities: [
      {
        identityId: uuid,
        drtsPassengerId: passengerId,
        provider: "phone",
        subject: "0900000000",
      },
    ] as PassengerLoginIdentity[],
    readError: null as Failure,
    updateError: null as Failure,
    verifyError: null as Failure,
    requestError: null as Failure,
    identitiesError: null as Failure,
    unlinkError: null as Failure,
    deleteError: null as Failure,
    logoutError: null as Failure,
    startError: null as Failure,
    callbackError: null as Failure,
    upstream: [] as Call[],
    browser: [] as Call[],
    cookies: new Map<string, string>(),
    challenges: new Map<
      string,
      { provider: "phone" | "email"; purpose: string; target: string }
    >(),
    oauth: new Map<string, { purpose: string; provider: string }>(),
    hold: null as ((call: Call) => Promise<Response> | null) | null,
  };
  if (authenticated) {
    state.cookies.set("pax_session", sessionToken());
    state.cookies.set("pax_refresh", "refresh-one");
  }
  const failure = (f: Failure) =>
    f
      ? Response.json(
          { error: { code: f.code, message: "test boundary" } },
          {
            status: f.status,
            headers: f.status === 429 ? { "Retry-After": "60" } : {},
          },
        )
      : null;
  async function upstream(url: string, init?: RequestInit): Promise<Response> {
    const path = new URL(url).pathname.replace("/api/passenger-app/", "");
    const method = init?.method ?? "GET";
    const rawBody = init?.body
      ? typeof init.body === "string"
        ? init.body
        : new TextDecoder().decode(init.body as ArrayBuffer)
      : "";
    const body = rawBody ? JSON.parse(rawBody) : undefined;
    const call = { path, method, body, headers: new Headers(init?.headers) };
    state.upstream.push(call);
    const held = state.hold?.(call);
    if (held) return held;
    if (path === "auth/providers")
      return apiWireResponse({ providers: state.providers });
    if (path === "auth/otp/request") {
      if (
        !body ||
        Object.keys(body).sort().join(",") !== "provider,purpose,target"
      )
        return failure({ code: "validation_error", status: 400 })!;
      const error = failure(state.requestError);
      if (error) return error;
      const challenge = String(state.challenges.size + 1).padStart(43, "A");
      state.challenges.set(challenge, body!);
      return apiWireResponse({ success: true, challenge, message: "generic" });
    }
    if (path === "auth/otp/verify") {
      const error = failure(state.verifyError);
      if (error) return error;
      const command = state.challenges.get(body!.challenge)!;
      if (command.purpose === "login")
        return apiWireResponse({
          result: "logged_in",
          accessToken: sessionToken(),
          refreshToken: "refresh-one",
        });
      if (command.purpose === "link") {
        state.identities.push({
          identityId: secondUuid,
          drtsPassengerId: state.account.drtsPassengerId,
          provider: command.provider,
          subject: command.target,
        });
        return apiWireResponse({ result: "linked" });
      }
      state.account.contactPhone = command.target;
      state.account.contactPhoneVerified = true;
      return apiWireResponse({ result: "verified_contact_phone" });
    }
    if (path.endsWith("/start")) {
      const error = failure(state.startError);
      if (error) return error;
      const transactionId = uuid;
      state.oauth.set(transactionId, {
        purpose: body!.purpose,
        provider: body!.provider,
      });
      return apiWireResponse({
        authUrl: "https://provider.invalid/authorize?state=test-state",
        transactionId,
        state: "test-state",
        expiresAt: new Date(Date.now() + 300000).toISOString(),
      });
    }
    if (path.endsWith("/callback")) {
      const error = failure(state.callbackError);
      if (error) return error;
      const txn = state.oauth.get(body!.transactionId);
      if (!txn) return failure({ code: "invalid_grant", status: 400 })!;
      state.oauth.delete(body!.transactionId);
      return txn.purpose === "login"
        ? apiWireResponse({
            result: "logged_in",
            drtsPassengerId: state.account.drtsPassengerId,
            accessToken: sessionToken(),
            refreshToken: "refresh-one",
          })
        : apiWireResponse({ result: "linked" });
    }
    if (path === "me" && method === "GET")
      return (
        failure(state.readError) ?? apiWireResponse({ account: state.account })
      );
    if (path === "me" && method === "PATCH") {
      const error = failure(state.updateError);
      if (error) return error;
      if (
        body?.contactPhone !== undefined &&
        body.contactPhone !== state.account.contactPhone
      )
        state.account.contactPhoneVerified = false;
      Object.assign(state.account, body);
      return apiWireResponse({ account: state.account });
    }
    if (path === "me/identities")
      return (
        failure(state.identitiesError) ??
        apiWireResponse({ identities: state.identities })
      );
    if (path.startsWith("me/identities/") && method === "DELETE") {
      const error = failure(state.unlinkError);
      if (error) return error;
      state.identities = state.identities.filter(
        (id) => id.identityId !== path.split("/")[2],
      );
      return apiWireResponse({ success: true });
    }
    if (path === "me" && method === "DELETE")
      return failure(state.deleteError) ?? apiWireResponse({ success: true });
    if (path === "auth/logout")
      return failure(state.logoutError) ?? apiWireResponse({ success: true });
    if (path === "auth/refresh")
      return apiWireResponse({
        accessToken: sessionToken(),
        refreshToken: "refresh-rotated",
      });
    throw new Error(`unexpected upstream ${method} ${path}`);
  }
  async function browser(
    url: string,
    init?: RequestInit,
  ): Promise<NextResponse> {
    const full = new URL(url, origin);
    const path = full.pathname.split("/api/passenger-app/")[1]!.split("/");
    const method = init?.method ?? "GET";
    const headers = new Headers(init?.headers);
    headers.set("Origin", origin);
    headers.set(
      "Cookie",
      Array.from(state.cookies, ([key, value]) => `${key}=${value}`).join("; "),
    );
    state.browser.push({
      path: path.join("/"),
      method,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      headers,
    });
    const handler = { GET, POST, PATCH, DELETE }[
      method as "GET" | "POST" | "PATCH" | "DELETE"
    ];
    const response = await handler(
      new NextRequest(full, {
        method,
        headers,
        ...(init?.body != null ? { body: init.body } : {}),
      }),
      { params: Promise.resolve({ path }) },
    );
    for (const cookie of response.cookies.getAll()) {
      if (cookie.maxAge === 0) state.cookies.delete(cookie.name);
      else state.cookies.set(cookie.name, cookie.value);
    }
    return response;
  }
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) =>
    url.startsWith("https://upstream.invalid")
      ? upstream(url, init)
      : browser(url, init),
  );
  return {
    state,
    browser,
    client: new PassengerAuthClient({ baseUrl: "", fetchFn: browser }),
  };
}
