import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { PaymentTokenCipher } from "../../../apps/api/src/modules/passenger-app/payment/payment-token-cipher";
import { FakePaymentProvider } from "../../../apps/api/src/modules/passenger-app/payment/fake-payment-provider";
import { paymentRuntimeFromEnv } from "../../../apps/api/src/modules/passenger-app/payment/payment-runtime.config";

const key = () => randomBytes(32).toString("base64");
const secret = (
  activeKeyId = "current",
  keys: Record<string, string> = { current: key() },
) => JSON.stringify({ activeKeyId, keys });
const completeEnv = (): NodeJS.ProcessEnv => ({
  DRTS_ENV: "test",
  NODE_ENV: "production",
  PSP_PROVIDER: "fake",
  PSP_MERCHANT_ID: "synthetic_merchant",
  PSP_API_KEY: "synthetic_api_key",
  PSP_SANDBOX: "true",
  PSP_TOKEN_ENCRYPTION_KEY_NAME: secret(),
});

describe("PSP token confidentiality and integrity", () => {
  it("encrypts with fresh nonces and authenticates the owning account and method", () => {
    const cipher = new PaymentTokenCipher(secret());
    const token = "synthetic_token_opaque";
    const first = cipher.encrypt(token, "synthetic_owner", "synthetic_method");
    const second = cipher.encrypt(token, "synthetic_owner", "synthetic_method");
    expect(first.nonce).not.toBe(second.nonce);
    expect(JSON.stringify(first)).not.toContain(token);
    expect(cipher.decrypt(first, "synthetic_owner", "synthetic_method")).toBe(
      token,
    );
    expect(() =>
      cipher.decrypt(first, "synthetic_other_owner", "synthetic_method"),
    ).toThrow();
    expect(() =>
      cipher.decrypt(first, "synthetic_owner", "synthetic_other_method"),
    ).toThrow();
  });
  it.each(["nonce", "tag", "ciphertext"] as const)(
    "rejects tampered %s with a generic error",
    (field) => {
      const cipher = new PaymentTokenCipher(secret());
      const envelope = cipher.encrypt(
        "synthetic_token",
        "synthetic_owner",
        "synthetic_method",
      );
      const bytes = Buffer.from(envelope[field], "base64");
      bytes[0] = bytes[0]! ^ 1;
      envelope[field] = bytes.toString("base64");
      expect(() =>
        cipher.decrypt(envelope, "synthetic_owner", "synthetic_method"),
      ).toThrow(
        "Payment token encryption configuration or envelope is invalid.",
      );
    },
  );
  it("rotates new writes and keeps historical tokens decryptable with retained keys", () => {
    const oldKey = key();
    const old = new PaymentTokenCipher(secret("old", { old: oldKey }));
    const previous = old.encrypt(
      "synthetic_old_token",
      "synthetic_owner",
      "synthetic_method",
    );
    const rotated = new PaymentTokenCipher(
      secret("current", { old: oldKey, current: key() }),
    );
    expect(
      rotated.decrypt(previous, "synthetic_owner", "synthetic_method"),
    ).toBe("synthetic_old_token");
    expect(
      rotated.encrypt(
        "synthetic_new_token",
        "synthetic_owner",
        "synthetic_method",
      ).keyId,
    ).toBe("current");
    expect(() =>
      new PaymentTokenCipher(secret()).decrypt(
        previous,
        "synthetic_owner",
        "synthetic_method",
      ),
    ).toThrow();
  });
  it.each([
    "",
    "not_json",
    "{}",
    secret("missing"),
    JSON.stringify({
      activeKeyId: "current",
      keys: { current: "synthetic_not_a_key" },
    }),
  ])("rejects malformed key rings without echoing input", (ring) => {
    expect(() => new PaymentTokenCipher(ring)).toThrow(
      "Payment token encryption configuration or envelope is invalid.",
    );
  });
  it("authenticates the key id and envelope version", () => {
    const bytes = key();
    const cipher = new PaymentTokenCipher(
      secret("current", { current: bytes, alias: bytes }),
    );
    const envelope = cipher.encrypt(
      "synthetic_token",
      "synthetic_owner",
      "synthetic_method",
    );
    expect(() =>
      cipher.decrypt(
        { ...envelope, keyId: "alias" },
        "synthetic_owner",
        "synthetic_method",
      ),
    ).toThrow();
    expect(() =>
      cipher.decrypt(
        { ...envelope, version: 2 } as never,
        "synthetic_owner",
        "synthetic_method",
      ),
    ).toThrow();
  });
});

describe("payment provider environment selection", () => {
  it.each(["production", "unknown", "", undefined])(
    "rejects fake in %s even if secrets are absent",
    (DRTS_ENV) => {
      expect(() =>
        paymentRuntimeFromEnv({ PSP_PROVIDER: "fake", DRTS_ENV }),
      ).toThrow();
      expect(() => new FakePaymentProvider({ DRTS_ENV })).toThrow();
    },
  );
  it.each(["test", "development", "staging"])(
    "allows fake with complete sandbox settings in %s",
    (DRTS_ENV) => {
      const runtime = paymentRuntimeFromEnv({ ...completeEnv(), DRTS_ENV });
      expect(runtime.provider.available).toBe(true);
      expect(runtime.cipher).toBeInstanceOf(PaymentTokenCipher);
    },
  );
  it.each([
    "PSP_MERCHANT_ID",
    "PSP_API_KEY",
    "PSP_SANDBOX",
    "PSP_TOKEN_ENCRYPTION_KEY_NAME",
  ])("disables incomplete group missing %s", (name) => {
    const env = completeEnv();
    delete env[name];
    const runtime = paymentRuntimeFromEnv(env);
    expect(runtime.provider.available).toBe(false);
    expect(runtime.cipher).toBeNull();
  });
  it("does not infer a fake/real adapter from secrets and rejects invalid sandbox settings", () => {
    expect(
      paymentRuntimeFromEnv({
        ...completeEnv(),
        PSP_PROVIDER: "contracted_future_psp",
      }).provider.available,
    ).toBe(false);
    expect(() =>
      paymentRuntimeFromEnv({ ...completeEnv(), PSP_SANDBOX: "false" }),
    ).toThrow();
    expect(() =>
      paymentRuntimeFromEnv({ ...completeEnv(), PSP_SANDBOX: "yes" }),
    ).toThrow();
    expect(() =>
      paymentRuntimeFromEnv({
        ...completeEnv(),
        PSP_TOKEN_ENCRYPTION_KEY_NAME: "synthetic_invalid_key",
      }),
    ).toThrow();
  });
});

describe("synthetic provider boundary (no external calls)", () => {
  it("exchanges one-use synthetic credentials idempotently and returns metadata only", async () => {
    const fake = new FakePaymentProvider({ DRTS_ENV: "test" });
    const binding = await fake.bind(
      "synthetic_credential_success",
      "synthetic_bind_key",
    );
    expect(binding.status).toBe("completed");
    expect(
      await fake.bind("synthetic_credential_success", "synthetic_bind_key"),
    ).toEqual(binding);
    expect(
      await fake.bind(
        "synthetic_credential_success",
        "synthetic_other_bind_key",
      ),
    ).toEqual({ status: "failed", error: "invalid_credential" });
    await expect(
      fake.bind("synthetic_credential_changed", "synthetic_bind_key"),
    ).rejects.toThrow("Fake payment idempotency conflict.");
    expect(
      await fake.bind("synthetic_noncredential", "synthetic_invalid_bind"),
    ).toEqual({ status: "failed", error: "invalid_credential" });
  });
  it("preserves 3DS/pending/declined provider outcomes without inventing a bound card", async () => {
    const fake = new FakePaymentProvider({ DRTS_ENV: "test" });
    expect(
      await fake.bind(
        "synthetic_credential_action_required",
        "synthetic_action",
      ),
    ).toEqual({
      status: "action_required",
      nextActionUrl: "https://synthetic-psp.invalid/three-ds",
    });
    expect(
      await fake.bind("synthetic_credential_pending", "synthetic_pending"),
    ).toEqual({ status: "pending" });
    expect(
      await fake.bind("synthetic_credential_declined", "synthetic_declined"),
    ).toEqual({ status: "failed", error: "card_declined" });
  });
  it("replays capture/refund and readback with one synthetic reference, rejecting changed amount", async () => {
    const fake = new FakePaymentProvider({ DRTS_ENV: "test" });
    const bind = await fake.bind(
      "synthetic_credential_money",
      "synthetic_bind",
    );
    if (bind.status !== "completed")
      throw new Error("Synthetic fixture binding failed.");
    const captureCommand = {
      idempotencyKey: "synthetic_order",
      token: bind.card.token,
      amountMinor: 12345,
      currency: "TWD" as const,
    };
    const captured = await fake.capture(captureCommand);
    expect(captured.status).toBe("completed");
    expect(await fake.capture(captureCommand)).toEqual(captured);
    expect(await fake.readCapture(captureCommand.idempotencyKey)).toEqual(
      captured,
    );
    await expect(
      fake.capture({ ...captureCommand, amountMinor: 54321 }),
    ).rejects.toThrow();
    expect(await fake.readCapture("synthetic_missing")).toEqual({
      status: "unknown",
    });
    if (captured.status !== "completed")
      throw new Error("Synthetic fixture capture failed.");
    const refundCommand = {
      idempotencyKey: "synthetic_refund",
      captureRef: captured.providerRef,
      amountMinor: 12345,
      currency: "TWD" as const,
    };
    const refunded = await fake.refund(refundCommand);
    expect(await fake.refund(refundCommand)).toEqual(refunded);
    expect(await fake.readRefund(refundCommand.idempotencyKey)).toEqual(
      refunded,
    );
    await expect(
      fake.refund({
        ...refundCommand,
        idempotencyKey: "synthetic_second_refund",
      }),
    ).rejects.toThrow("Invalid synthetic refund amount.");
    expect(
      await fake.refund({
        ...refundCommand,
        captureRef: "synthetic_missing_capture",
      }),
    ).toEqual({ status: "failed", error: "invalid_method", retryable: false });
  });
});
