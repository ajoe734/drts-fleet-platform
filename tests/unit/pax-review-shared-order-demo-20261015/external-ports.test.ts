import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PaymentChargeService } from "../../../apps/api/src/modules/passenger-app/payment/payment-charge.service";
import { PaymentTokenCipher } from "../../../apps/api/src/modules/passenger-app/payment/payment-token-cipher";
import type {
  PaymentChargeRepository,
  StoredCharge,
} from "../../../apps/api/src/modules/passenger-app/payment/payment-charge.repository";
import { PassengerOtpService } from "../../../apps/api/src/modules/passenger-app/otp/passenger-otp.service";
import { PassengerAccountService } from "../../../apps/api/src/modules/passenger-app/account/passenger-account.service";
import { PassengerJwtService } from "../../../apps/api/src/common/auth/passenger-jwt.service";
import { ReviewSmsPort } from "../../../apps/api/src/modules/passenger-app/review-demo/review-sms.port";
import { reviewDemoEnabled } from "../../../apps/api/src/modules/passenger-app/review-demo/review-demo.config";
import { MemoryOtpStore } from "../pax-otp-20261009/memory-store";
import { MemoryPassengerStore } from "../pax-account-session-20261009/memory-store";

const {
  FakePaymentProvider,
}: typeof import("../../../apps/api/src/modules/passenger-app/payment/fake-payment-provider") =
  await import(
    process.env.PAX_REVIEW_FAKE_SOURCE ??
      "../../../apps/api/src/modules/passenger-app/payment/fake-payment-provider"
  );
const {
  createSyntheticPaymentFields,
}: typeof import("../../../apps/passenger-app-web/lib/payment/synthetic-fields") =
  await import(
    process.env.PAX_REVIEW_FIELDS_SOURCE ??
      "../../../apps/passenger-app-web/lib/payment/synthetic-fields"
  );

const env = {
  DRTS_ENV: "development",
  NODE_ENV: "production",
  PAX_REVIEW_DEMO_ENABLED: "true",
};
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("shared rehearsal replaces external ports, retaining product commands", () => {
  it("production-build review fields yield a synthetic retry token; ordinary production remains unavailable", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() =>
      createSyntheticPaymentFields({
        runtime: "production",
        issueSyntheticNonce: () => "synthetic_x",
      }),
    ).toThrow();
    const fields = createSyntheticPaymentFields({
      runtime: "review",
      captureResult: "retry_once",
      issueSyntheticNonce: () => "synthetic_a1_b",
    });
    const credential = await fields.collectCredential();
    const provider = new FakePaymentProvider(env);
    const bound = await provider.bind(
      credential.providerToken,
      "synthetic-bind",
    );
    expect(bound.status).toBe("completed");
    if (bound.status !== "completed") throw new Error("bind failed");
    expect(bound.card.token).toMatch(/^synthetic_retry_token_/);
    fields.dispose();
    await expect(fields.collectCredential()).rejects.toThrow(
      "payment_fields_unavailable",
    );
  });

  it("a retry scenario fails capture (not binding), then the real charge executor honors due time and preserves one order/payment/key", async () => {
    const provider = new FakePaymentProvider(env);
    const bound = await provider.bind(
      "synthetic_credential_review_retry_probe",
      "synthetic-bind",
    );
    expect(bound.status).toBe("completed");
    if (bound.status !== "completed") throw new Error("bind failed");
    const orderId = "b18bd875-0b10-4d89-b3d8-90f9e9d3a372";
    const passengerId = "synthetic-owner";
    const methodId = "711a54f3-051f-4bc4-8777-85f199818b8c";
    const cipher = new PaymentTokenCipher(
      JSON.stringify({
        activeKeyId: "test",
        keys: { test: randomBytes(32).toString("base64") },
      }),
    );
    let charge = {
      orderId,
      passengerId,
      methodId,
      paymentId: `pax-payment:${orderId}`,
      key: `pax:capture:${orderId}`,
      status: "failed",
      attemptCount: 0,
      readbackCount: 0,
      nextOperation: "capture",
      retryAt: null,
      provider: "fake",
      amountMinor: 9000,
      methodActive: true,
      tokenEnvelope: cipher.encrypt(bound.card.token, passengerId, methodId),
    } as StoredCharge;
    const captures = vi.spyOn(provider, "capture");
    // Persistence is the external unit boundary here, not a PG substitute.
    const session = {
      load: async () => ({ ...charge }),
      begin: async (_old: StoredCharge, operation: string) => {
        charge = {
          ...charge,
          attemptCount: charge.attemptCount + (operation === "capture" ? 1 : 0),
        };
        return { ...charge };
      },
      finish: async (_claim: unknown, disposition: object) => {
        charge = { ...charge, ...disposition };
      },
    };
    const repository = {
      withOrder: async (
        _id: string,
        work: (s: typeof session) => Promise<void>,
      ) => work(session),
    };
    const service = new PaymentChargeService(
      repository as unknown as PaymentChargeRepository,
      { provider, cipher },
      {
        retryDelaysMs: [60_000],
        retryDefinitiveDeclines: false,
        unknownReadbackDelaysMs: [1000],
      },
    );
    const now = new Date("2026-10-15T04:00:00Z");
    await service.processOrder(orderId, now);
    expect(charge).toMatchObject({
      status: "failed",
      attemptCount: 1,
      nextOperation: "capture",
      retryAt: "2026-10-15T04:01:00.000Z",
    });
    await service.processOrder(orderId, new Date(now.getTime() + 59_999));
    expect(captures).toHaveBeenCalledTimes(1);
    await service.processOrder(orderId, new Date(now.getTime() + 60_000));
    expect(charge).toMatchObject({
      status: "captured",
      attemptCount: 2,
      orderId,
      paymentId: `pax-payment:${orderId}`,
      nextOperation: null,
    });
    expect(
      captures.mock.calls.map(([command]) => command.idempotencyKey),
    ).toEqual([`pax:capture:${orderId}`, `pax:capture:${orderId}`]);
    await service.processOrder(orderId, new Date(now.getTime() + 90_000));
    expect(captures).toHaveBeenCalledTimes(2);
    expect(await provider.readCapture(charge.key)).toMatchObject({
      status: "completed",
    });
    // A fresh external simulator also uses durable attempt metadata, not an
    // instance-local "first call" counter; a different order starts at attempt 1.
    const peer = new FakePaymentProvider(env);
    expect(await peer.capture(captures.mock.calls[1]![0])).toMatchObject({
      status: "completed",
    });
    expect(
      await peer.capture({
        ...captures.mock.calls[0]![0],
        idempotencyKey: "another-order",
      }),
    ).toMatchObject({ status: "failed" });
  });

  it("simulated SMS is consumed through the real OTP/account/session path and cannot be replayed", async () => {
    vi.stubEnv("JWT_SECRET", "synthetic-unit-session-key");
    vi.stubEnv("JWT_ALGORITHM", "HS256");
    vi.stubEnv("JWT_ALGORITHMS", "HS256");
    const sms = new ReviewSmsPort();
    const accounts = new PassengerAccountService(
      new MemoryPassengerStore(),
      new PassengerJwtService(),
    );
    const otp = new PassengerOtpService(
      new MemoryOtpStore(),
      accounts,
      null,
      sms,
      {
        pepper: "synthetic-unit-pepper-at-least-32-characters",
        fromEmail: "",
        ipHourlyLimit: 20,
        trustedProxyHops: 0,
      },
    );
    const target = "0900000001";
    const requested = await otp.request(
      { provider: "phone", purpose: "login", target },
      null,
      "192.0.2.1",
    );
    const code = sms.collect("+886900000001");
    const command = {
      provider: "phone" as const,
      target,
      code,
      challenge: requested.challenge,
    };
    const login = await otp.verify(command, null, "rehearsal-unit");
    expect(login).toMatchObject({
      result: "logged_in",
      account: { status: "active" },
    });
    expect(login).toHaveProperty("accessToken");
    await expect(otp.verify(command, null)).rejects.toMatchObject({
      code: "invalid_code",
    });
    await expect(
      sms.sendOtp(
        "+886912345678",
        "123456",
        new Date(Date.now() + 300_000).toISOString(),
      ),
    ).resolves.toEqual({ status: "failed" });
  });

  it("requires explicit nonproduction rehearsal selection", () => {
    expect(reviewDemoEnabled({ NODE_ENV: "production" })).toBe(false);
    expect(reviewDemoEnabled(env)).toBe(true);
    expect(() =>
      reviewDemoEnabled({ ...env, DRTS_ENV: "production" }),
    ).toThrow();
  });
});
