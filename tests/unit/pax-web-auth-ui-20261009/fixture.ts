import { vi } from "vitest";
import { NextRequest } from "next/server";
import {
  PassengerClient,
  type FetchOptions,
} from "../../../packages/passenger-client/src/index";
import { PassengerAuthClient } from "../../../apps/passenger-app-web/lib/auth/client";
import * as bff from "../../../apps/passenger-app-web/app/api/passenger-app/[...path]/route";
import { PassengerJwtService } from "../../../apps/api/src/common/auth/passenger-jwt.service";
import { PassengerAccountService } from "../../../apps/api/src/modules/passenger-app/account/passenger-account.service";
import { PassengerAccountController } from "../../../apps/api/src/modules/passenger-app/account/passenger-account.controller";
import { PassengerOtpService } from "../../../apps/api/src/modules/passenger-app/otp/passenger-otp.service";
import { PassengerOtpController } from "../../../apps/api/src/modules/passenger-app/otp/passenger-otp.controller";
import { NotificationDeliveryService } from "../../../apps/api/src/modules/notification-delivery/notification-delivery.service";
import { MemoryOtpStore } from "../pax-otp-20261009/memory-store";
import { MemoryPassengerStore } from "../pax-account-session-20261009/memory-store";
import type { AuthProvider, RequestOtpCommand } from "@drts/contracts";

export const origin = "http://localhost:3000";
export function createFixture() {
  vi.stubEnv("DRTS_API_URL", "https://upstream.example.invalid");
  vi.stubEnv("DRTS_API_AUTH_AUDIENCE", "");
  vi.stubEnv("JWT_SECRET", "unit-only-session-key");
  vi.stubEnv("JWT_KEY_RING_JSON", "");
  vi.stubEnv("JWT_PRIVATE_KEY", "");
  vi.stubEnv("JWT_PUBLIC_KEY", "");
  vi.stubEnv("JWT_ALGORITHM", "HS256");
  vi.stubEnv("JWT_ALGORITHMS", "HS256");
  vi.stubEnv("NEXT_PUBLIC_TERMS_URL", "https://legal.example.invalid/terms");
  vi.stubEnv(
    "NEXT_PUBLIC_PRIVACY_URL",
    "https://legal.example.invalid/privacy",
  );
  vi.stubEnv("NEXT_PUBLIC_TERMS_VERSION", "terms-2026");
  vi.stubEnv("NEXT_PUBLIC_PRIVACY_VERSION", "privacy-2026");
  const accountStore = new MemoryPassengerStore();
  const accounts = new PassengerAccountService(
    accountStore,
    new PassengerJwtService(),
  );
  const accountController = new PassengerAccountController(accounts);
  const codes: string[] = [];
  const settings = {
    pepper: "unit-only-pepper-with-at-least-32-characters",
    fromEmail: "sender@example.test",
    ipHourlyLimit: 20,
    trustedProxyHops: 0,
  };
  const fixture = {
    enabled: ["phone", "email", "google", "facebook", "line"] as AuthProvider[],
    calls: [] as {
      path: string;
      body: any;
      method: string;
      headers: Headers;
    }[],
    jar: new Map<string, string>(),
    codes,
    accounts,
    accountStore,
    oauthError: "",
    accountReadError: false,
    accountWriteError: false,
    deleteError: false,
    otpError: "",
    transactions: new Map<
      string,
      { provider: string; purpose: string; state: string; consumed: boolean }
    >(),
  };
  const mail = new NotificationDeliveryService(
    {
      transaction: async () => {
        throw new Error("No outbox expected");
      },
    } as never,
    {
      provider: "unit-smtp",
      send: async () => {
        throw new Error("Use platform delivery");
      },
      sendPlatform: async (message: { body: string }) => {
        codes.push(message.body.match(/驗證碼：([0-9]{6})/)![1]!);
        return {
          provider: "unit-smtp",
          response: "accepted",
          providerMessageId: null,
          acceptedAt: new Date().toISOString(),
        };
      },
    },
  );
  const otpService = new PassengerOtpService(
    new MemoryOtpStore(),
    accounts,
    mail,
    {
      availability: () =>
        fixture.enabled.includes("phone") ? "available" : "not_configured",
      sendOtp: async (_target, code) => {
        codes.push(code);
        return { status: "sent" };
      },
    },
    settings,
  );
  const otp = new PassengerOtpController(otpService, settings);
  let nextAccountRead:
    | { started: () => void; wait: Promise<void>; readsBeforeHold: number }
    | undefined;
  // Hold only the injected upstream GET boundary; the real controller/service
  // still authenticates, reads and produces the response after release.
  const holdNextAccountRead = (readsBeforeHold = 0) => {
    let started!: () => void;
    let release!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    nextAccountRead = { started, wait, readsBeforeHold };
    return { started: entered, release };
  };
  const upstream = async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname.slice("/api/passenger-app/".length);
    const body = init?.body
      ? JSON.parse(
          (typeof init.body === "string"
            ? init.body
            : new TextDecoder().decode(init.body as ArrayBuffer)) || "{}",
        )
      : {};
    const headers = new Headers(init?.headers);
    const method = init?.method ?? "GET";
    fixture.calls.push({ path, body, method, headers });
    const fail = (code: string, status = 400) =>
      Response.json({ error: { code, message: code } }, { status });
    try {
      const bearer = headers.get("authorization")?.replace(/^Bearer /, "");
      const identity = bearer
        ? await accounts.authenticateAccessToken(bearer)
        : null;
      if (path === "auth/providers")
        return Response.json({ data: { providers: fixture.enabled } });
      if (path === "auth/otp/request") {
        if (fixture.otpError)
          return fail(
            fixture.otpError,
            fixture.otpError === "too_many_requests" ? 429 : 400,
          );
        if (!fixture.enabled.includes(body.provider))
          return fail("not_configured", 503);
        return Response.json(
          await otp.request(body, identity, {
            headers: {},
            socket: { remoteAddress: "192.0.2.10" },
          }),
        );
      }
      if (path === "auth/otp/verify") {
        if (fixture.otpError) return fail(fixture.otpError);
        return Response.json(await otp.verify(body, identity, { headers: {} }));
      }
      if (path === "me") {
        if (method === "DELETE")
          return fixture.deleteError
            ? fail("pending_payment_block", 409)
            : Response.json(await accountController.remove(identity));
        if (method === "PATCH")
          return fixture.accountWriteError
            ? fail("unavailable", 503)
            : Response.json(await accountController.update(identity, body));
        const held = nextAccountRead;
        if (held) {
          if (held.readsBeforeHold > 0) held.readsBeforeHold--;
          else {
            nextAccountRead = undefined;
            held.started();
            await held.wait;
          }
        }
        return fixture.accountReadError
          ? fail("unavailable", 503)
          : Response.json(await accountController.me(identity));
      }
      if (path === "me/identities")
        return Response.json(await accountController.identities(identity));
      if (path.startsWith("me/identities/"))
        return Response.json(
          await accountController.unlink(identity, path.split("/")[2]!),
        );
      if (path === "auth/logout")
        return Response.json(await accountController.logout(body));
      if (path === "auth/refresh")
        return Response.json(await accountController.refreshSession(body));
      if (path.startsWith("auth/oauth/")) {
        const provider = path.split("/")[2]!;
        if (
          body.provider !== provider ||
          !fixture.enabled.includes(provider as AuthProvider)
        )
          return fail("unsupported_provider", 400);
        if (fixture.oauthError) return fail(fixture.oauthError, 400);
        if (path.endsWith("/start")) {
          const transactionId = crypto.randomUUID();
          const state = crypto.randomUUID();
          fixture.transactions.set(transactionId, {
            provider,
            purpose: body.purpose,
            state,
            consumed: false,
          });
          return Response.json({
            data: {
              authUrl: `https://provider.example.invalid/?state=${state}`,
              transactionId,
              state,
              expiresAt: new Date(Date.now() + 600000).toISOString(),
            },
          });
        }
        const transaction = fixture.transactions.get(body.transactionId);
        if (
          !transaction ||
          transaction.consumed ||
          transaction.state !== body.state ||
          transaction.provider !== provider
        )
          return fail("invalid_grant", 401);
        transaction.consumed = true;
        if (transaction.purpose === "link") {
          await accounts.linkIdentity(
            identity,
            provider as "google",
            `${provider}-new`,
          );
          return Response.json({ data: { result: "linked" } });
        }
        const account = await accounts.findOrCreateByIdentity(
          provider as "google",
          `${provider}-new`,
        );
        return Response.json({
          data: {
            result: "logged_in",
            drtsPassengerId: account.drtsPassengerId,
            ...(await accounts.issueSession(account.drtsPassengerId)),
          },
        });
      }
      return fail("not_found", 404);
    } catch (err) {
      if (typeof err === "object" && err && "getResponse" in err) {
        const exception = err as {
          getResponse(): unknown;
          getStatus(): number;
        };
        return Response.json(exception.getResponse(), {
          status: exception.getStatus(),
        });
      }
      throw err;
    }
  };
  const browserFetch = async (url: string, options?: FetchOptions) => {
    const request = new NextRequest(new URL(url, origin), {
      method: options?.method ?? "GET",
      headers: {
        ...options?.headers,
        origin,
        cookie: [...fixture.jar]
          .map(([name, value]) => `${name}=${value}`)
          .join("; "),
      },
      ...(options?.body ? { body: options.body } : {}),
    });
    const path = request.nextUrl.pathname
      .slice("/api/passenger-app/".length)
      .split("/");
    const handlers: Record<string, typeof bff.GET> = {
      GET: bff.GET,
      POST: bff.POST,
      PATCH: bff.PATCH,
      DELETE: bff.DELETE,
    };
    const response = await handlers[request.method]!(request, {
      params: Promise.resolve({ path }),
    });
    for (const cookie of response.cookies.getAll()) {
      if (cookie.maxAge === 0) fixture.jar.delete(cookie.name);
      else fixture.jar.set(cookie.name, cookie.value);
    }
    return response;
  };
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) =>
      url.startsWith("/api/")
        ? browserFetch(url, init as FetchOptions)
        : upstream(url, init),
    ),
  );
  const client = new PassengerAuthClient(
    new PassengerClient({ baseUrl: origin, fetchFn: browserFetch }),
  );
  const signIn = async (
    provider: AuthProvider = "google",
    subject = "original",
  ) => {
    const account = await accounts.findOrCreateByIdentity(
      provider,
      provider === "email" && subject === "original"
        ? "original@example.test"
        : subject,
    );
    const tokens = await accounts.issueSession(account.drtsPassengerId);
    fixture.jar.set("pax_session", tokens.accessToken);
    fixture.jar.set("pax_refresh", tokens.refreshToken);
    return account;
  };
  return Object.assign(fixture, {
    upstream,
    client,
    signIn,
    browserFetch,
    holdNextAccountRead,
    requestOtp: (command: RequestOtpCommand) => client.requestOtp(command),
  });
}
