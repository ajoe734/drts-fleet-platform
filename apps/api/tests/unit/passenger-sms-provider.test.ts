import "reflect-metadata";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Provider } from "@nestjs/common";
import { MODULE_METADATA } from "@nestjs/common/constants";
import { NestContainer } from "@nestjs/core/injector/container";
import { Injector } from "@nestjs/core/injector/injector";
import { Module } from "@nestjs/core/injector/module";
import { PassengerAppModule } from "../../src/modules/passenger-app/passenger-app.module";
import { ReviewSmsPort } from "../../src/modules/passenger-app/review-demo/review-sms.port";
import {
  otpOptionsFromEnv,
  PassengerOtpService,
} from "../../src/modules/passenger-app/otp/passenger-otp.service";
import type {
  OtpRecord,
  OtpStore,
  OtpTransaction,
} from "../../src/modules/passenger-app/otp/passenger-otp.port";
import {
  createSmsPortFromEnv,
  SMS_PORT,
  type SmsPort,
} from "../../src/modules/passenger-app/otp/sms.port";
import type { PassengerAccountService } from "../../src/modules/passenger-app/account/passenger-account.service";

const VALID_ACCOUNT_SID = "AC" + "1a2b3c4d".repeat(4);
const VALID_API_KEY_SID = "SK" + "5e6f7081".repeat(4);
const VALID_API_KEY_SECRET = "TwilioModuleSecretValue1234567890ab";
const VALID_PEPPER = "s".repeat(64);
const TEST_PHONE = "+886912345678";
const TEST_MESSAGE_SID = "SM" + "abcdef01".repeat(4);

class InMemoryOtpStore implements OtpStore, OtpTransaction {
  readonly records = new Map<string, OtpRecord>();

  async transaction<T>(work: (tx: OtpTransaction) => Promise<T>): Promise<T> {
    const snapshot = structuredClone(this.records);
    try {
      return await work(this);
    } catch (error) {
      this.records.clear();
      for (const [k, v] of snapshot) this.records.set(k, v);
      throw error;
    }
  }

  async now() {
    return new Date();
  }

  async lockRequest() {}

  async rateState(targetHash: string, ipHash: string, since: string) {
    const recent = [...this.records.values()].filter(
      (r) => r.createdAt > since,
    );
    const target = recent.filter((r) => r.targetHash === targetHash);
    return {
      targetCount: target.length,
      ipCount: recent.filter((r) => r.ipHash === ipHash).length,
      resendAfter:
        target
          .map((r) => r.resendAfter)
          .sort()
          .at(-1) ?? null,
    };
  }

  async invalidateTarget(targetHash: string, now: string) {
    for (const record of this.records.values()) {
      if (
        record.targetHash === targetHash &&
        !record.consumedAt &&
        !record.invalidatedAt
      ) {
        record.invalidatedAt = now;
      }
    }
  }

  async insert(record: OtpRecord) {
    this.records.set(record.challengeHash, structuredClone(record));
  }

  async lockChallenge(hash: string) {
    return structuredClone(this.records.get(hash) ?? null);
  }

  async save(record: OtpRecord) {
    this.records.set(record.challengeHash, structuredClone(record));
  }
}

function createAccountStub() {
  const verifiedPhones = new Map<string, string>();
  const accounts: Pick<
    PassengerAccountService,
    | "getMe"
    | "findOrCreateByIdentity"
    | "issueSession"
    | "linkIdentity"
    | "verifyContactPhone"
  > = {
    getMe: vi.fn(async () => ({
      account: {
        drtsPassengerId: "pax_unit_001",
        displayName: "Unit Passenger",
        verifiedPhone: verifiedPhones.get("pax_unit_001") ?? null,
        verifiedEmail: null,
        contactPhone: null,
        contactPhoneVerified: false,
        status: "active" as const,
        createdAt: "2026-10-24T00:00:00.000Z",
        termsAcceptedAt: null,
        privacyAcceptedAt: null,
        fareDisclosureAcceptedAt: null,
        marketingOptIn: false,
      },
    })),
    findOrCreateByIdentity: vi.fn(async (_provider, subject) => {
      verifiedPhones.set("pax_unit_001", subject);
      return {
        drtsPassengerId: "pax_unit_001",
        displayName: null,
        verifiedPhone: subject,
        verifiedEmail: null,
        contactPhone: subject,
        contactPhoneVerified: true,
        status: "active" as const,
        createdAt: "2026-10-24T00:00:00.000Z",
        deletedAt: null,
        termsAcceptedAt: null,
        privacyAcceptedAt: null,
        fareDisclosureAcceptedAt: null,
        marketingOptIn: false,
      };
    }),
    issueSession: vi.fn(async (drtsPassengerId) => ({
      accessToken: `access_${drtsPassengerId}`,
      refreshToken: `refresh_${drtsPassengerId}`,
      expiresInSeconds: 900,
    })),
    linkIdentity: vi.fn(async () => undefined),
    verifyContactPhone: vi.fn(async () => undefined),
  };
  return accounts as unknown as PassengerAccountService;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function resolveModuleSmsPort(env: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(env)) {
    vi.stubEnv(k, v);
  }
  const module = new Module(PassengerAppModule, new NestContainer());
  const registrations: Provider[] = Reflect.getMetadata(
    MODULE_METADATA.PROVIDERS,
    PassengerAppModule,
  );
  const smsRegistration = registrations.find(
    (p) => typeof p === "object" && "provide" in p && p.provide === SMS_PORT,
  );
  if (!smsRegistration) throw new Error("sms_port_factory_not_registered");
  module.addProvider(ReviewSmsPort);
  module.addProvider(smsRegistration);

  const injector = new Injector();
  const reviewSms = module.getProviderByKey<ReviewSmsPort>(ReviewSmsPort);
  await injector.loadProvider(reviewSms, module);
  const smsPort = module.getProviderByKey<SmsPort>(SMS_PORT);
  await injector.loadProvider(smsPort, module);
  return smsPort.instance;
}

describe("PassengerAppModule SMS_PORT and PassengerOtpService Twilio integration", () => {
  it("keeps phone login disabled in PassengerAppModule when TWILIO_FROM_NUMBER is missing (pre-KYC state)", async () => {
    const sms = await resolveModuleSmsPort({
      PAX_REVIEW_DEMO_ENABLED: "false",
      TWILIO_ACCOUNT_SID: VALID_ACCOUNT_SID,
      TWILIO_API_KEY_SID: VALID_API_KEY_SID,
      TWILIO_API_KEY_SECRET: VALID_API_KEY_SECRET,
      TWILIO_FROM_NUMBER: undefined,
      PASSENGER_OTP_PEPPER: VALID_PEPPER,
    });
    expect(sms.availability()).toBe("not_configured");

    const store = new InMemoryOtpStore();
    const otp = new PassengerOtpService(
      store,
      createAccountStub(),
      null,
      sms,
      otpOptionsFromEnv({ PASSENGER_OTP_PEPPER: VALID_PEPPER }),
    );
    expect(otp.providers()).toEqual({ providers: [] });
    await expect(
      otp.request(
        { provider: "phone", purpose: "login", target: TEST_PHONE },
        null,
        "203.0.113.10",
      ),
    ).rejects.toMatchObject({
      status: 503,
      code: "not_configured",
    });
  });

  it("enables phone OTP login and verifies challenge when all Twilio secrets are present", async () => {
    const moduleSms = await resolveModuleSmsPort({
      PAX_REVIEW_DEMO_ENABLED: "false",
      TWILIO_ACCOUNT_SID: VALID_ACCOUNT_SID,
      TWILIO_API_KEY_SID: VALID_API_KEY_SID,
      TWILIO_API_KEY_SECRET: VALID_API_KEY_SECRET,
      TWILIO_FROM_NUMBER: "SmartTaxi",
      PASSENGER_OTP_PEPPER: VALID_PEPPER,
    });
    expect(moduleSms.availability()).toBe("available");

    let capturedBody = "";
    const sms = createSmsPortFromEnv(
      {
        TWILIO_ACCOUNT_SID: VALID_ACCOUNT_SID,
        TWILIO_API_KEY_SID: VALID_API_KEY_SID,
        TWILIO_API_KEY_SECRET: VALID_API_KEY_SECRET,
        TWILIO_FROM_NUMBER: "SmartTaxi",
        PASSENGER_OTP_PEPPER: VALID_PEPPER,
      },
      async (_url, init) => {
        capturedBody = new URLSearchParams(init.body).get("Body") ?? "";
        return {
          status: 201,
          text: async () =>
            JSON.stringify({
              sid: TEST_MESSAGE_SID,
              status: "queued",
              error_code: null,
            }),
        };
      },
    );

    const store = new InMemoryOtpStore();
    const otp = new PassengerOtpService(
      store,
      createAccountStub(),
      null,
      sms,
      otpOptionsFromEnv({ PASSENGER_OTP_PEPPER: VALID_PEPPER }),
    );

    expect(otp.providers()).toEqual({ providers: ["phone"] });
    const reqRes = await otp.request(
      { provider: "phone", purpose: "login", target: "0912345678" },
      null,
      "203.0.113.11",
    );
    expect(reqRes.success).toBe(true);
    expect(capturedBody).toMatch(
      /^\[智行叫車\] 您的驗證碼是 ([0-9]{6})，5 分鐘內有效。請勿提供給他人。$/,
    );
    const code = /^\[智行叫車\] 您的驗證碼是 ([0-9]{6})/.exec(capturedBody)![1]!;

    const verifyRes = await otp.verify(
      {
        provider: "phone",
        target: "+886912345678",
        code,
        challenge: reqRes.challenge,
      },
      null,
      "vitest-agent",
    );
    expect(verifyRes).toEqual({
      result: "logged_in",
      accessToken: "access_pax_unit_001",
      refreshToken: "refresh_pax_unit_001",
      expiresInSeconds: 900,
    });
  });

  it("invalidates OTP challenge and returns 503 unavailable when Twilio returns 20003/21211/5xx", async () => {
    let sentCode = "";
    const sms = createSmsPortFromEnv(
      {
        TWILIO_ACCOUNT_SID: VALID_ACCOUNT_SID,
        TWILIO_API_KEY_SID: VALID_API_KEY_SID,
        TWILIO_API_KEY_SECRET: VALID_API_KEY_SECRET,
        TWILIO_FROM_NUMBER: "+15551234567",
        PASSENGER_OTP_PEPPER: VALID_PEPPER,
      },
      async (_url, init) => {
        const body = new URLSearchParams(init.body).get("Body") ?? "";
        sentCode = /^\[智行叫車\] 您的驗證碼是 ([0-9]{6})/.exec(body)?.[1] ?? "";
        return {
          status: 401,
          text: async () =>
            JSON.stringify({ code: 20003, message: "Permission Denied" }),
        };
      },
    );

    const store = new InMemoryOtpStore();
    const otp = new PassengerOtpService(
      store,
      createAccountStub(),
      null,
      sms,
      otpOptionsFromEnv({
        PASSENGER_OTP_PEPPER: VALID_PEPPER,
      }),
    );

    await expect(
      otp.request(
        { provider: "phone", purpose: "login", target: TEST_PHONE },
        null,
        "203.0.113.12",
      ),
    ).rejects.toMatchObject({
      status: 503,
      code: "unavailable",
    });
    expect(sentCode).toMatch(/^[0-9]{6}$/);
    const records = [...store.records.values()];
    expect(records).toHaveLength(1);
    expect(records[0]!.invalidatedAt).not.toBeNull();
  });
});
