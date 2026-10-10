import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestOtpCommand, VerifyOtpCommand } from "@drts/contracts";
import type { RequestIdentity } from "../../../apps/api/src/common/auth/auth.types";
import { PassengerJwtService } from "../../../apps/api/src/common/auth/passenger-jwt.service";
import { PassengerAccountService } from "../../../apps/api/src/modules/passenger-app/account/passenger-account.service";
import { NotificationDeliveryService } from "../../../apps/api/src/modules/notification-delivery/notification-delivery.service";
import type { OutgoingMailMessage } from "../../../apps/api/src/modules/notification-delivery/notification-delivery.types";
import {
  PassengerOtpService,
  canonicalOtpTarget,
  otpOptionsFromEnv,
  type OtpOptions,
} from "../../../apps/api/src/modules/passenger-app/otp/passenger-otp.service";
import {
  PassengerOtpController,
  otpClientIp,
} from "../../../apps/api/src/modules/passenger-app/otp/passenger-otp.controller";
import { UnconfiguredSmsPort } from "../../../apps/api/src/modules/passenger-app/otp/sms.port";
import { MemoryPassengerStore } from "../pax-account-session-20261009/memory-store";
import { MemoryOtpStore } from "./memory-store";

vi.mock("node:crypto", async (original) => {
  const actual = await original<typeof import("node:crypto")>();
  return { ...actual, timingSafeEqual: vi.fn(actual.timingSafeEqual) };
});
const PEPPER = "unit-only-pepper-with-at-least-32-characters";
const { Logger } = createRequire(
  new URL("../../../apps/api/package.json", import.meta.url),
)("@nestjs/common");
const IP = "192.0.2.10";
const EMAIL = "passenger@example.test";
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-10T01:00:00Z"));
  vi.stubEnv("JWT_SECRET", "unit-only-session-key");
  vi.stubEnv("JWT_KEY_RING_JSON", "");
  vi.stubEnv("JWT_PRIVATE_KEY", "");
  vi.stubEnv("JWT_PUBLIC_KEY", "");
  vi.stubEnv("JWT_ALGORITHM", "HS256");
  vi.stubEnv("JWT_ALGORITHMS", "HS256");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
function fixture(
  options: Partial<OtpOptions> = {},
  phoneEnabled = false,
  mailEnabled = true,
) {
  const store = new MemoryOtpStore();
  const accountStore = new MemoryPassengerStore();
  const jwt = new PassengerJwtService();
  const accounts = new PassengerAccountService(accountStore, jwt);
  const messages: OutgoingMailMessage[] = [];
  const outbox = {
    transaction: vi.fn(async () => {
      throw new Error("platform must not persist codes");
    }),
  };
  const transport = {
    provider: "unit-smtp",
    send: vi.fn(async (message: OutgoingMailMessage) => {
      messages.push(message);
      return {
        provider: "unit-smtp",
        response: "accepted",
        providerMessageId: null,
        acceptedAt: new Date().toISOString(),
      };
    }),
  };
  const delivery = new NotificationDeliveryService(
    outbox,
    mailEnabled ? { ...transport, sendPlatform: transport.send } : null,
  );
  const smsCodes: string[] = [];
  const sms = phoneEnabled
    ? {
        availability: () => "available" as const,
        sendOtp: vi.fn(async (_target: string, code: string) => {
          smsCodes.push(code);
          return { status: "sent" as const };
        }),
      }
    : new UnconfiguredSmsPort();
  const settings: OtpOptions = {
    pepper: PEPPER,
    fromEmail: "sender@example.test",
    ipHourlyLimit: 20,
    trustedProxyHops: 0,
    ...options,
  };
  const service = new PassengerOtpService(
    store,
    accounts,
    delivery,
    sms,
    settings,
  );
  const request = (
    target = EMAIL,
    purpose: RequestOtpCommand["purpose"] = "login",
    identity: RequestIdentity | null = null,
    ip = IP,
    provider: "email" | "phone" = "email",
  ) => service.request({ target, provider, purpose }, identity, ip);
  const lastCode = () => messages.at(-1)!.body.match(/驗證碼：([0-9]{6})/)![1]!;
  const verify = (
    challenge: string,
    code = lastCode(),
    target = EMAIL,
    identity: RequestIdentity | null = null,
    provider: "email" | "phone" = "email",
  ) =>
    service.verify({ provider, target, challenge, code }, identity, "unit UA");
  return {
    store,
    accountStore,
    jwt,
    accounts,
    service,
    request,
    verify,
    lastCode,
    messages,
    transport,
    outbox,
    sms,
    smsCodes,
    settings,
    controller: new PassengerOtpController(service, settings),
  };
}
async function signedIn(f = fixture(), subject = "google-subject") {
  const account = await f.accounts.findOrCreateByIdentity("google", subject);
  const session = await f.accounts.issueSession(account.drtsPassengerId);
  const identity = (await f.accounts.authenticateAccessToken(
    session.accessToken,
  ))!;
  return { ...f, account, session, identity };
}

describe("OTP challenge security through production services", () => {
  it("sends six digits, stores peppered context-bound hashes only, and returns no code or account existence", async () => {
    const f = fixture();
    const response = await f.request();
    const code = f.lastCode();
    expect(code).toMatch(/^[0-9]{6}$/);
    expect(response).toEqual({
      success: true,
      challenge: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      message: "若可接收驗證碼，請於 5 分鐘內完成驗證。",
    });
    const record = [...f.store.records.values()][0]!;
    expect(record.targetHash).toBe(
      createHmac("sha256", PEPPER)
        .update(JSON.stringify(["target", "email", EMAIL]))
        .digest("hex"),
    );
    expect(record.codeHash).toBe(
      createHmac("sha256", PEPPER)
        .update(
          JSON.stringify([
            "code",
            record.challengeHash,
            record.targetHash,
            "email",
            "login",
            "",
            "",
            code,
          ]),
        )
        .digest("hex"),
    );
    expect(record.codeHash).not.toBe(
      createHash("sha256").update(code).digest("hex"),
    );
    expect(record.expiresAt).toBe(new Date(Date.now() + 300000).toISOString());
    for (const secret of [EMAIL, IP, response.challenge, PEPPER])
      expect(JSON.stringify(record)).not.toContain(secret);
    expect(Object.keys(record)).not.toContain("code");
    expect(Object.keys(response)).not.toContain("code");
    expect(f.outbox.transaction).not.toHaveBeenCalled();
  });
  it.each([299999, 300000, 300001])(
    "enforces five-minute expiry at %i ms",
    async (elapsed) => {
      const f = fixture();
      const r = await f.request();
      vi.advanceTimersByTime(elapsed);
      if (elapsed < 300000)
        expect((await f.verify(r.challenge)).result).toBe("logged_in");
      else
        await expect(f.verify(r.challenge)).rejects.toMatchObject({
          code: "invalid_code",
        });
    },
  );
  it("commits five failed attempts, invalidates the challenge, and rejects its correct code", async () => {
    const f = fixture();
    const r = await f.request();
    const wrong = f.lastCode() === "000000" ? "000001" : "000000";
    for (let attempts = 1; attempts <= 5; attempts++) {
      await expect(f.verify(r.challenge, wrong)).rejects.toMatchObject({
        code: "invalid_code",
      });
      expect([...f.store.records.values()][0]!.attempts).toBe(attempts);
    }
    expect([...f.store.records.values()][0]!.invalidatedAt).not.toBeNull();
    await expect(f.verify(r.challenge)).rejects.toMatchObject({
      code: "invalid_code",
    });
    expect(f.accountStore.accounts.size).toBe(0);
  });
  it("counts malformed bounded code guesses and concurrent failures without lost attempts", async () => {
    const f = fixture();
    const r = await f.request();
    const outcomes = await Promise.allSettled(
      Array.from({ length: 5 }, () => f.verify(r.challenge, "bad")),
    );
    expect(outcomes.every((o) => o.status === "rejected")).toBe(true);
    expect([...f.store.records.values()][0]!.attempts).toBe(5);
  });
  it("consumes a correct proof once across parallel verifies and rejects replay", async () => {
    const f = fixture();
    const r = await f.request();
    const results = await Promise.allSettled([
      f.verify(r.challenge),
      f.verify(r.challenge),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(f.accountStore.accounts.size).toBe(1);
    expect(f.accountStore.sessions.size).toBe(1);
    await expect(f.verify(r.challenge)).rejects.toMatchObject({
      code: "invalid_code",
    });
  });
  it("uses timingSafeEqual on fixed-sized digests for correct, incorrect and nonexistent challenges", async () => {
    const f = fixture();
    const r = await f.request();
    vi.mocked(timingSafeEqual).mockClear();
    await expect(f.verify("Z".repeat(43))).rejects.toMatchObject({
      code: "invalid_code",
    });
    await expect(f.verify(r.challenge, "bad")).rejects.toMatchObject({
      code: "invalid_code",
    });
    await f.verify(r.challenge);
    expect(timingSafeEqual).toHaveBeenCalledTimes(6);
    for (const [left, right] of vi.mocked(timingSafeEqual).mock.calls) {
      expect(left.byteLength).toBe(32);
      expect(right.byteLength).toBe(32);
    }
  });
  it("returns the same failure for missing, wrong-target, consumed, expired and locked proofs", async () => {
    const f = fixture();
    const r = await f.request();
    const invalid = {
      code: "invalid_code",
      response: { error: { message: "驗證碼無效或已失效。" } },
    };
    await expect(f.verify("Z".repeat(43))).rejects.toMatchObject(invalid);
    await expect(
      f.verify(r.challenge, f.lastCode(), "other@example.test"),
    ).rejects.toMatchObject(invalid);
    await f.verify(r.challenge);
    await expect(f.verify(r.challenge)).rejects.toMatchObject(invalid);
    vi.advanceTimersByTime(60000);
    const expired = await f.request();
    vi.advanceTimersByTime(300000);
    await expect(f.verify(expired.challenge)).rejects.toMatchObject(invalid);
  });
  it("isolates hashes across pepper values and challenges", async () => {
    const f = fixture();
    await f.request();
    const first = [...f.store.records.values()][0]!;
    vi.advanceTimersByTime(60000);
    await f.request();
    const second = [...f.store.records.values()][1]!;
    expect(first.codeHash).not.toBe(second.codeHash);
    const other = fixture({ pepper: "another-unit-only-pepper-more-than-32" });
    await other.request();
    expect([...other.store.records.values()][0]!.targetHash).not.toBe(
      first.targetHash,
    );
  });
});

describe("request cooldown and rolling target/IP limits", () => {
  it("rejects resend at 59,999ms, accepts at 60s and invalidates the former proof", async () => {
    const f = fixture();
    const first = await f.request();
    const firstCode = f.lastCode();
    vi.advanceTimersByTime(59999);
    await expect(f.request()).rejects.toMatchObject({
      status: 429,
      code: "too_many_requests",
    });
    vi.advanceTimersByTime(1);
    const second = await f.request();
    expect(second.challenge).not.toBe(first.challenge);
    await expect(f.verify(first.challenge, firstCode)).rejects.toMatchObject({
      code: "invalid_code",
    });
    expect((await f.verify(second.challenge)).result).toBe("logged_in");
  });
  it("shares target cooldown and hourly quota across normalization, IPs and purposes", async () => {
    const f = await signedIn();
    await f.request(" Passenger@Example.Test ");
    await expect(
      f.request(EMAIL, "link", f.identity, "192.0.2.11"),
    ).rejects.toMatchObject({ code: "too_many_requests" });
    for (let i = 1; i < 5; i++) {
      vi.advanceTimersByTime(60000);
      await f.request(EMAIL, "login", null, `192.0.2.${10 + i}`);
    }
    vi.advanceTimersByTime(60000);
    await expect(f.request()).rejects.toMatchObject({
      code: "too_many_requests",
    });
    vi.advanceTimersByTime(3300000); // Exact one-hour boundary frees the first request.
    await expect(f.request()).resolves.toMatchObject({ success: true });
  });
  it("enforces IP quota across different targets and providers", async () => {
    const f = fixture({ ipHourlyLimit: 2 }, true);
    await f.request();
    await f.request("second@example.test");
    await expect(
      f.request("+886912345678", "login", null, IP, "phone"),
    ).rejects.toMatchObject({ code: "too_many_requests" });
    await expect(
      f.request("third@example.test", "login", null, "192.0.2.11"),
    ).resolves.toMatchObject({ success: true });
    vi.advanceTimersByTime(3600000);
    await expect(
      f.request("+886912345678", "login", null, IP, "phone"),
    ).resolves.toMatchObject({ success: true });
  });
  it("serializes parallel requests so cooldown and shared IP quota cannot be bypassed", async () => {
    const f = fixture({ ipHourlyLimit: 2 });
    const same = await Promise.allSettled(
      Array.from({ length: 5 }, () => f.request()),
    );
    expect(same.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const different = await Promise.allSettled([
      f.request("a@example.test"),
      f.request("b@example.test"),
    ]);
    expect(different.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(f.messages).toHaveLength(2);
  });
});

describe("login, link and contact-phone purpose authority", () => {
  it("requests identically for existing, absent and suspended identities without an account lookup", async () => {
    const f = fixture();
    const existing = await f.accounts.findOrCreateByIdentity("email", EMAIL);
    f.accountStore.accounts.get(existing.drtsPassengerId)!.status = "suspended";
    const lookup = vi.spyOn(f.accounts, "findOrCreateByIdentity");
    const absent = await f.request("absent@example.test");
    const suspended = await f.request();
    expect({ ...absent, challenge: "opaque" }).toEqual({
      ...suspended,
      challenge: "opaque",
    });
    expect(lookup).not.toHaveBeenCalled();
  });
  it("logs into an existing verified provider identity and creates a separate account for a new identity with the same attributes", async () => {
    const f = fixture();
    const g = await f.accounts.findOrCreateByIdentity("google", "external", {
      verifiedEmail: EMAIL,
    });
    const first = await f.request();
    const login = await f.verify(first.challenge);
    expect(login.result).toBe("logged_in");
    if (login.result !== "logged_in") throw new Error("expected session");
    const identity = f.jwt.verify(login.accessToken)!;
    expect(identity.drtsPassengerId).not.toBe(g.drtsPassengerId);
    expect((await f.accounts.getMe(identity)).account.verifiedEmail).toBe(
      EMAIL,
    );
    vi.advanceTimersByTime(60000);
    const second = await f.request();
    const returning = await f.verify(second.challenge);
    if (returning.result !== "logged_in") throw new Error("expected session");
    expect(f.jwt.verify(returning.accessToken)!.drtsPassengerId).toBe(
      identity.drtsPassengerId,
    );
    expect(f.accountStore.accounts.size).toBe(2);
  });
  it("requires a session for link and contact verification before any delivery", async () => {
    const f = fixture({}, true);
    await expect(f.request(EMAIL, "link")).rejects.toMatchObject({
      code: "unauthorized",
    });
    await expect(
      f.request("+886912345678", "verify_contact_phone", null, IP, "phone"),
    ).rejects.toMatchObject({ code: "unauthorized" });
    expect(f.messages).toHaveLength(0);
    expect(f.store.records.size).toBe(0);
  });
  it("binds link to exact account/family, permits refresh within that family, and issues no new session", async () => {
    const f = await signedIn();
    const r = await f.request(EMAIL, "link", f.identity);
    const other = await signedIn(f, "other-subject");
    await expect(
      f.verify(r.challenge, f.lastCode(), EMAIL, other.identity),
    ).rejects.toMatchObject({ code: "invalid_code" });
    const secondFamily = await f.accounts.issueSession(
      f.account.drtsPassengerId,
    );
    const secondIdentity = (await f.accounts.authenticateAccessToken(
      secondFamily.accessToken,
    ))!;
    await expect(
      f.verify(r.challenge, f.lastCode(), EMAIL, secondIdentity),
    ).rejects.toMatchObject({ code: "invalid_code" });
    await expect(f.verify(r.challenge)).rejects.toMatchObject({
      code: "invalid_code",
    });
    const rotated = await f.accounts.refresh(f.session.refreshToken);
    const refreshed = (await f.accounts.authenticateAccessToken(
      rotated.accessToken,
    ))!;
    const sessions = f.accountStore.sessions.size;
    expect(await f.verify(r.challenge, f.lastCode(), EMAIL, refreshed)).toEqual(
      { result: "linked" },
    );
    expect(f.accountStore.sessions.size).toBe(sessions);
    expect(
      (await f.accounts.findOrCreateByIdentity("email", EMAIL)).drtsPassengerId,
    ).toBe(f.account.drtsPassengerId);
    expect([...f.store.records.values()][0]!.attempts).toBe(0);
  });
  it.each(["logout", "delete", "expiry"])(
    "rejects link after %s, including a previously valid identity object",
    async (reason) => {
      const f = await signedIn();
      const r = await f.request(EMAIL, "link", f.identity);
      if (reason === "logout") await f.accounts.logout(f.session.refreshToken);
      else if (reason === "delete") await f.accounts.deleteAccount(f.identity);
      else vi.advanceTimersByTime(900000);
      await expect(
        f.verify(r.challenge, f.lastCode(), EMAIL, f.identity),
      ).rejects.toMatchObject({ code: "unauthorized" });
      expect(
        [...f.accountStore.logins.values()].some((i) => i.provider === "email"),
      ).toBe(false);
    },
  );
  it("refuses linking another account's identity after proof and burns that proof", async () => {
    const f = await signedIn();
    await f.accounts.findOrCreateByIdentity("email", EMAIL);
    const r = await f.request(EMAIL, "link", f.identity);
    await expect(
      f.verify(r.challenge, f.lastCode(), EMAIL, f.identity),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(
      f.verify(r.challenge, f.lastCode(), EMAIL, f.identity),
    ).rejects.toMatchObject({ code: "invalid_code" });
  });
  it("verifies only the session-bound contact phone and creates no login identity", async () => {
    const f = await signedIn(fixture({}, true));
    const phone = "+886912345678";
    const r = await f.request(
      "0912345678",
      "verify_contact_phone",
      f.identity,
      IP,
      "phone",
    );
    const code = f.smsCodes[0]!;
    expect(
      await f.verify(r.challenge, code, phone, f.identity, "phone"),
    ).toEqual({ result: "verified_contact_phone" });
    expect((await f.accounts.getMe(f.identity)).account).toMatchObject({
      contactPhone: phone,
      contactPhoneVerified: true,
    });
    expect(
      [...f.accountStore.logins.values()].some((i) => i.provider === "phone"),
    ).toBe(false);
    await f.accounts.updateMe(f.identity, { contactPhone: "+886923456789" });
    expect(
      (await f.accounts.getMe(f.identity)).account.contactPhoneVerified,
    ).toBe(false);
  });
  it("supports phone login and link through an injected SMS port", async () => {
    const f = fixture({}, true);
    const phone = "+886912345678";
    const login = await f.request(phone, "login", null, IP, "phone");
    const response = await f.verify(
      login.challenge,
      f.smsCodes.at(-1),
      phone,
      null,
      "phone",
    );
    if (response.result !== "logged_in") throw new Error("expected session");
    const identity = f.jwt.verify(response.accessToken)!;
    expect((await f.accounts.getMe(identity)).account.verifiedPhone).toBe(
      phone,
    );
    const linkedPhone = "+886923456789";
    const link = await f.request(linkedPhone, "link", identity, IP, "phone");
    expect(
      await f.verify(
        link.challenge,
        f.smsCodes.at(-1),
        linkedPhone,
        identity,
        "phone",
      ),
    ).toEqual({ result: "linked" });
  });
  it("rejects attempts to change the stored purpose/provider or inject account authority", async () => {
    const f = fixture();
    const r = await f.request();
    await expect(
      f.service.verify(
        {
          provider: "email",
          target: EMAIL,
          challenge: r.challenge,
          code: f.lastCode(),
          purpose: "link",
        } as VerifyOtpCommand,
        null,
      ),
    ).rejects.toMatchObject({ code: "validation_error" });
    await expect(
      f.service.request(
        {
          provider: "email",
          purpose: "login",
          target: EMAIL,
          drtsPassengerId: "victim",
        } as RequestOtpCommand,
        null,
        IP,
      ),
    ).rejects.toMatchObject({ code: "validation_error" });
    await expect(
      f.service.request(
        { provider: "email", purpose: "verify_contact_phone", target: EMAIL },
        null,
        IP,
      ),
    ).rejects.toMatchObject({ code: "validation_error" });
    await expect(
      f.verify(r.challenge, f.lastCode(), "+886912345678", null, "phone"),
    ).rejects.toMatchObject({ code: "invalid_code" });
  });
});

describe("provider failures and HTTP boundary", () => {
  it("reports SMS not configured even when credential env values exist; missing pepper or mail disables email", async () => {
    vi.stubEnv("SMS_PROVIDER_API_KEY", "unit-stub");
    vi.stubEnv("SMS_PROVIDER_SENDER_ID", "unit-sender");
    const f = fixture();
    expect(f.service.providers()).toEqual({ providers: ["email"] });
    await expect(
      f.request("+886912345678", "login", null, IP, "phone"),
    ).rejects.toMatchObject({
      status: 503,
      code: "not_configured",
      response: { error: { message: "未設定驗證碼服務。" } },
    });
    expect(await new UnconfiguredSmsPort().sendOtp()).toEqual({
      status: "not_configured",
    });
    for (const disabled of [
      fixture({ pepper: "" }),
      fixture({ fromEmail: "" }),
      fixture({}, false, false),
    ]) {
      expect(disabled.service.providers()).toEqual({ providers: [] });
      await expect(disabled.request()).rejects.toMatchObject({
        code: "not_configured",
      });
      expect(disabled.store.records.size).toBe(0);
    }
  });
  it("redacts thrown provider text, invalidates failed sends and retains cooldown/quota", async () => {
    const f = fixture();
    const logs = [
      vi.spyOn(console, "log").mockImplementation(() => {}),
      vi.spyOn(console, "error").mockImplementation(() => {}),
      ...(["log", "error", "warn", "debug"] as const).map((method) =>
        vi.spyOn(Logger.prototype, method).mockImplementation(() => {}),
      ),
    ];
    let secret = "";
    f.transport.send.mockImplementationOnce(async (m) => {
      secret = m.body.match(/驗證碼：([0-9]{6})/)![1]!;
      throw new Error(`provider echoed ${secret}`);
    });
    await expect(f.request()).rejects.toMatchObject({
      code: "unavailable",
      response: { error: { message: "驗證碼服務暫時無法使用。" } },
    });
    expect([...f.store.records.values()][0]!.invalidatedAt).not.toBeNull();
    await expect(f.request()).rejects.toMatchObject({
      code: "too_many_requests",
    });
    expect(JSON.stringify(logs.flatMap((spy) => spy.mock.calls))).not.toContain(
      secret,
    );
  });
  it("propagates database failure and never falls back to ephemeral challenges", async () => {
    const f = fixture();
    vi.spyOn(f.store, "transaction").mockRejectedValueOnce(
      new Error("database offline"),
    );
    await expect(f.request()).rejects.toThrow("database offline");
    expect(f.messages).toHaveLength(0);
    expect(f.store.records.size).toBe(0);
  });
  it("canonicalizes targets and rejects header injection, unsupported providers and bad commands", async () => {
    expect(canonicalOtpTarget("email", " Passenger@Example.Test ")).toBe(EMAIL);
    expect(canonicalOtpTarget("phone", "0912345678")).toBe("+886912345678");
    const f = fixture();
    for (const body of [
      null,
      [],
      {},
      { provider: "google", purpose: "login", target: EMAIL },
      {
        provider: "email",
        purpose: "login",
        target: `${EMAIL}\r\nBcc:bad@example.test`,
      },
    ])
      await expect(
        f.service.request(body as RequestOtpCommand, null, IP),
      ).rejects.toMatchObject({ code: "validation_error" });
    expect(f.store.records.size).toBe(0);
  });
  it("handles canonical provider and channel alias, rejects duplicates/body IP and wraps no OTP in responses", async () => {
    const f = fixture();
    const req = {
      headers: { "user-agent": "unit browser" },
      socket: { remoteAddress: IP },
    };
    const r = await f.controller.request(
      { channel: "email", purpose: "login", target: EMAIL },
      null,
      req,
    );
    const response = await f.controller.verify(
      {
        provider: "email",
        challenge: r.data.challenge,
        code: f.lastCode(),
        target: EMAIL,
      },
      null,
      req,
    );
    expect(response.data.result).toBe("logged_in");
    expect(f.controller.providers().data).toEqual({ providers: ["email"] });
    for (const body of [
      { provider: "email", channel: "email", purpose: "login", target: EMAIL },
      { provider: "email", purpose: "login", target: EMAIL, ip: "192.0.2.20" },
    ])
      await expect(f.controller.request(body, null, req)).rejects.toMatchObject(
        { code: "validation_error" },
      );
  });
  it("ignores forged XFF by default, uses configured hop position and canonicalizes IPv6/mapped IPv4", () => {
    const req = {
      headers: { "x-forwarded-for": "198.51.100.123, 203.0.113.20" },
      socket: { remoteAddress: IP },
    };
    expect(otpClientIp(req, 0)).toBe(IP);
    expect(otpClientIp(req, 1)).toBe("203.0.113.20");
    expect(
      otpClientIp(
        { headers: {}, socket: { remoteAddress: "::ffff:192.0.2.10" } },
        0,
      ),
    ).toBe(IP);
    expect(
      otpClientIp(
        { headers: {}, socket: { remoteAddress: "2001:0DB8:0:0:0:0:0:1" } },
        0,
      ),
    ).toBe("2001:db8::1");
    expect(() => otpClientIp({ headers: {} }, 0)).toThrow();
  });
  it("loads bounded runtime limits, defaults safely and refuses invalid values", () => {
    expect(otpOptionsFromEnv({})).toEqual({
      pepper: "",
      fromEmail: "",
      ipHourlyLimit: 20,
      trustedProxyHops: 0,
    });
    for (const value of ["0", "NaN", "1001", "1.5"])
      expect(() =>
        otpOptionsFromEnv({ PASSENGER_OTP_IP_HOURLY_LIMIT: value }),
      ).toThrow("passenger_otp_invalid_options");
    expect(() =>
      otpOptionsFromEnv({ PASSENGER_OTP_TRUSTED_PROXY_HOPS: "11" }),
    ).toThrow("passenger_otp_invalid_options");
  });
});
