// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ApiRequestError } from "../../../apps/api/src/common/api-envelope";
import { PassengerJwtService } from "../../../apps/api/src/common/auth/passenger-jwt.service";
import { deepToSnakeCase } from "../../../apps/api/src/common/snake-case.interceptor";
import { PassengerAccountController } from "../../../apps/api/src/modules/passenger-app/account/passenger-account.controller";
import { PassengerAccountService } from "../../../apps/api/src/modules/passenger-app/account/passenger-account.service";
import { PassengerOtpController } from "../../../apps/api/src/modules/passenger-app/otp/passenger-otp.controller";
import {
  PassengerOtpService,
  otpOptionsFromEnv,
} from "../../../apps/api/src/modules/passenger-app/otp/passenger-otp.service";
import { ReviewDemoController } from "../../../apps/api/src/modules/passenger-app/review-demo/review-demo.controller";
import { ReviewSmsPort } from "../../../apps/api/src/modules/passenger-app/review-demo/review-sms.port";
import * as bff from "../../../apps/passenger-app-web/app/api/passenger-app/[...path]/route";
import { ReviewDemoProvider } from "../../../apps/passenger-app-web/components/review-demo/review-context";
import { t } from "../../../apps/passenger-app-web/components/review-demo/translations";
import { MemoryPassengerStore } from "../pax-account-session-20261009/memory-store";
import { MemoryOtpStore } from "../pax-otp-20261009/memory-store";

vi.mock("../../../apps/passenger-app-web/node_modules/next/navigation", () => ({
  usePathname: () => "/review",
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  window.localStorage.clear();
});

it("the real review buttons send only OTP command fields through SDK/BFF, retaining strict validation and genuine account sessions", async () => {
  vi.stubEnv("PAX_REVIEW_DEMO_ENABLED", "true");
  vi.stubEnv("DRTS_ENV", "development");
  vi.stubEnv("DRTS_API_URL", "https://api.example");
  vi.stubEnv("DRTS_API_AUTH_AUDIENCE", "");
  vi.stubEnv("JWT_SECRET", "synthetic-review-login-unit-key");
  vi.stubEnv("JWT_ALGORITHM", "HS256");
  vi.stubEnv("JWT_ALGORITHMS", "HS256");
  window.localStorage.clear();

  // Only persistence and HTTP transport are in memory. The page, SDK, BFF,
  // request/verify parsers, OTP, account/consent and JWT services are real.
  const store = new MemoryPassengerStore();
  const jwt = new PassengerJwtService();
  const accounts = new PassengerAccountService(store, jwt);
  const accountController = new PassengerAccountController(accounts);
  const sms = new ReviewSmsPort();
  const options = otpOptionsFromEnv({
    PASSENGER_OTP_PEPPER:
      "synthetic-review-login-pepper-at-least-32-characters",
  });
  const otp = new PassengerOtpService(
    new MemoryOtpStore(),
    accounts,
    null,
    sms,
    options,
  );
  const otpController = new PassengerOtpController(otp, options);
  const review = new ReviewDemoController(
    otp,
    sms,
    accounts,
    // Unused booking/payment/database dependencies are never called.
    null!,
    null!,
    null!,
  );
  const request = {
    headers: { "user-agent": "review-login-unit" },
    socket: { remoteAddress: "192.0.2.1" },
  };
  const cookies = new Map<string, string>();
  const verified: { body: Record<string, unknown>; status: number }[] = [];
  const inboxes: Record<string, unknown>[] = [];
  const loginBodies: unknown[] = [];
  const rejectedReceivers: string[] = [];

  const transport = vi.fn(async function (
    this: unknown,
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> {
    const url = String(input);
    // HTTP/platform boundary only: browser Web IDL operations reject a
    // receiver such as PassengerClient. Arrow-function mocks hid this.
    // https://webidl.spec.whatwg.org/#dfn-create-operation-function
    if (this != null && this !== globalThis && this !== window) {
      rejectedReceivers.push(url);
      throw new TypeError("Illegal invocation");
    }
    if (url.startsWith("/api/passenger-app/")) {
      // Exercise the actual BFF and retain only cookies it really issued.
      const headers = new Headers(init?.headers);
      headers.set("origin", "https://pax.example");
      headers.set(
        "cookie",
        [...cookies].map(([key, value]) => `${key}=${value}`).join("; "),
      );
      const method = (init?.method ?? "GET") as "GET" | "POST" | "PATCH";
      const response = await bff[method](
        new NextRequest(`https://pax.example${url}`, {
          method,
          headers,
          ...(init?.body ? { body: init.body } : {}),
        }),
        {
          params: Promise.resolve({
            path: url.slice("/api/passenger-app/".length).split("/"),
          }),
        },
      );
      for (const cookie of response.cookies.getAll()) {
        if (cookie.value) cookies.set(cookie.name, cookie.value);
        else cookies.delete(cookie.name);
      }
      if (url.endsWith("auth/otp/verify")) {
        verified.push({
          body: JSON.parse(String(init?.body)),
          status: response.status,
        });
        loginBodies.push(await response.clone().json());
        const session = response.cookies.get("pax_session");
        if (response.ok) expect(session?.httpOnly).toBe(true);
      }
      return response;
    }
    // Socket-free HTTP boundary; dispatch to production controllers and use
    // the same response serializer as Nest. Never synthesize a session/token.
    expect(new URL(url).origin).toBe("https://api.example");
    const path = new URL(url).pathname;
    const body = init?.body
      ? JSON.parse(
          typeof init.body === "string"
            ? init.body
            : new TextDecoder().decode(init.body as ArrayBuffer),
        )
      : undefined;
    const token = new Headers(init?.headers)
      .get("authorization")
      ?.replace(/^Bearer /, "");
    const identity = token ? jwt.verify(token) : null;
    try {
      let result: unknown;
      if (path.endsWith("review-demo/config")) result = review.config();
      else if (path.endsWith("review-demo/otp")) {
        result = await review.requestOtp(body, request);
        inboxes.push((result as { data: Record<string, unknown> }).data);
      } else if (path.endsWith("auth/otp/verify"))
        result = await otpController.verify(body, identity, request);
      else if (path.endsWith("auth/logout"))
        result = await accountController.logout(body);
      else if (path.endsWith("/me"))
        result =
          init?.method === "PATCH"
            ? await accountController.update(identity, body)
            : await accountController.me(identity);
      else throw new Error(`Unexpected API path: ${path}`);
      return Response.json(deepToSnakeCase(result));
    } catch (error) {
      if (!(error instanceof ApiRequestError)) throw error;
      return Response.json(error.getResponse(), {
        status: error.getStatus(),
      });
    }
  });
  vi.stubGlobal("fetch", transport);
  // The production page captures fetch when constructing its real SDK client.
  const { default: ReviewEntry } =
    await import("../../../apps/passenger-app-web/app/review/page");
  render(
    <ReviewDemoProvider>
      <ReviewEntry />
    </ReviewDemoProvider>,
  );
  const consent = await screen.findByRole("checkbox");
  fireEvent.click(consent);
  fireEvent.click(screen.getByRole("button", { name: t.requestSms }));
  const loginButton = await screen.findByRole("button", { name: t.login });
  const proof = inboxes[0]!;
  expect(proof).toMatchObject({
    success: true,
    simulatedDelivery: true,
    message: expect.any(String),
    challenge: expect.any(String),
    code: expect.any(String),
  });
  const command = {
    provider: "phone",
    target: "0900000001",
    challenge: proof.challenge,
    code: proof.code,
  };
  // Metadata and duplicate provider aliases must still fail before consuming OTP.
  for (const extra of [
    { success: true },
    { message: "response only" },
    { simulated_delivery: true },
    { channel: "phone" },
  ]) {
    await expect(
      otpController.verify({ ...command, ...extra }, null, request),
    ).rejects.toMatchObject({ code: "validation_error" });
  }
  expect(store.sessions.size).toBe(0);
  fireEvent.click(loginButton);
  await waitFor(() =>
    expect(verified.length > 0 || screen.queryByRole("alert")).toBeTruthy(),
  );
  expect(rejectedReceivers).toEqual([]);
  await waitFor(() => expect(verified).toHaveLength(1));
  // This fails with 400 on the immutable 9c784946 page, before the repair.
  expect(verified[0]!.status).toBe(200);
  expect(verified[0]!.body).toEqual(command);
  const firstId = (await screen.findByTestId("review-passenger-id"))
    .textContent!;
  expect(store.accounts.get(firstId)).toMatchObject({
    verifiedPhone: "+886900000001",
    displayName: "審查演練乘客",
    termsVersion: "review-terms-v1",
    privacyVersion: "review-privacy-v1",
  });
  expect(jwt.verify(cookies.get("pax_session")!)).toMatchObject({
    realm: "passenger",
    drtsPassengerId: firstId,
  });
  expect(store.sessions.size).toBe(1);
  expect(JSON.stringify(loginBodies[0])).not.toContain(
    cookies.get("pax_session")!,
  );
  expect(JSON.stringify(loginBodies[0])).not.toContain(
    cookies.get("pax_refresh")!,
  );
  await expect(
    otpController.verify(command, null, request),
  ).rejects.toMatchObject({ code: "invalid_code" });

  fireEvent.click(screen.getByRole("button", { name: t.logout }));
  await screen.findByRole("button", { name: t.requestSms });
  expect(cookies.has("pax_session")).toBe(false);
  expect(cookies.has("pax_refresh")).toBe(false);
  expect([...store.sessions.values()][0]!.revokedAt).toEqual(
    expect.any(String),
  );
  fireEvent.change(screen.getByRole("textbox", { name: t.phoneLabel }), {
    target: { value: "0900000002" },
  });
  fireEvent.click(screen.getByRole("button", { name: t.requestSms }));
  fireEvent.click(await screen.findByRole("button", { name: t.login }));
  await waitFor(() => expect(verified).toHaveLength(2));
  expect(verified[1]!.status).toBe(200);
  expect(verified[1]!.body).toEqual({
    provider: "phone",
    target: "0900000002",
    challenge: inboxes[1]!.challenge,
    code: inboxes[1]!.code,
  });
  const secondId = (await screen.findByTestId("review-passenger-id"))
    .textContent!;
  expect(secondId).not.toBe(firstId);
  expect(store.accounts.get(secondId)?.verifiedPhone).toBe("+886900000002");
  expect(jwt.verify(cookies.get("pax_session")!)).toMatchObject({
    drtsPassengerId: secondId,
  });
  expect(window.localStorage.length).toBe(0);
});
