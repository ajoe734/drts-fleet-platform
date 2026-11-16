import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  deployArgs,
} = require("../../../operations/verification/production-release-rail/rail.cjs");
const {
  preflight,
  validators,
} = require("../../../operations/verification/production-release-rail/preflight.cjs");
const {
  fixture,
  SHA,
  TAG,
  DEPLOYER,
  STRONG,
} = require("../sr-prod-full-surface-rail-20261012/fixture.cjs");

function ecpayFixture() {
  const f = fixture();
  Object.assign(f.vars, {
    PROD_PSP_PROVIDER: "ecpay",
    PROD_PSP_MERCHANT_ID: "SYNTHETIC_MID_01",
    PROD_PSP_SANDBOX: "true",
    PROD_PSP_HASH_KEY_SECRET: "fixture-psp-hash-key",
    PROD_PSP_HASH_IV_SECRET: "fixture-psp-hash-iv",
    PROD_PSP_TOKEN_ENCRYPTION_KEY_NAME_SECRET: "fixture-psp-token-keyring",
  });
  Object.assign(f.values, {
    "fixture-psp-hash-key": "K".repeat(16),
    "fixture-psp-hash-iv": "I".repeat(16),
    "fixture-psp-token-keyring": JSON.stringify({
      activeKeyId: "k1",
      keys: { k1: Buffer.alloc(32, 36).toString("base64") },
    }),
  });
  return f;
}

function phoneFixture() {
  const f = fixture();
  const entries = JSON.parse(f.vars.PROD_PUBLIC_ENTRY_CONFIG_JSON);
  entries["passenger-app-web"].expectedProviders = ["phone"];
  f.vars.PROD_PUBLIC_ENTRY_CONFIG_JSON = JSON.stringify(entries);
  Object.assign(f.vars, {
    PROD_PASSENGER_OTP_PEPPER_SECRET: "fixture-otp-pepper",
    PROD_TWILIO_ACCOUNT_SID_SECRET: "fixture-twilio-account",
    PROD_TWILIO_API_KEY_SID_SECRET: "fixture-twilio-key-sid",
    PROD_TWILIO_API_KEY_SECRET_SECRET: "fixture-twilio-key-secret",
    PROD_TWILIO_FROM_NUMBER_SECRET: "fixture-twilio-sender",
  });
  Object.assign(f.values, {
    "fixture-otp-pepper": STRONG,
    "fixture-twilio-account": "AC" + "a1b2c3d4".repeat(4),
    "fixture-twilio-key-sid": "SK" + "e5f60718".repeat(4),
    "fixture-twilio-key-secret": STRONG,
    "fixture-twilio-sender": "SmartTaxi",
  });
  return f;
}

function resolvedEnv(
  api: { env: Record<string, string>; secrets: Record<string, string> },
  f: ReturnType<typeof fixture>,
) {
  return {
    ...api.env,
    ...Object.fromEntries(
      Object.entries(api.secrets).map(([key, ref]) => [
        key,
        f.values[ref.replace(/:7$/, "")] ?? STRONG,
      ]),
    ),
  };
}

// Only external Secret Manager/IAM reads use the existing fixture ports.
// Real plan/preflight/provider factories run; no SMS or payment request is sent.
describe("production existing payment and SMS adapter wiring", () => {
  it("starts the actual ECPay provider and mounts both hash secrets without a legacy API key", () => {
    const f = ecpayFixture();
    expect(f.vars.PROD_PSP_API_KEY_SECRET).toBeUndefined();
    const plan = preflight(f.vars, SHA, TAG, DEPLOYER, f.cloud);
    const api = plan.services.find(
      (service: { id: string }) => service.id === "api",
    );
    expect(api.secrets.PSP_HASH_KEY).toBe("fixture-psp-hash-key:7");
    expect(api.secrets.PSP_HASH_IV).toBe("fixture-psp-hash-iv:7");
    expect(api.secrets.PSP_API_KEY).toBeUndefined();
    const runtime = validators().payment(resolvedEnv(api, f));
    expect(runtime.provider.name).toBe("ecpay");
    expect(runtime.provider.available).toBe(true);
    expect(runtime.cipher).not.toBeNull();
    const args = deployArgs(
      plan,
      api,
      `${plan.registry}/api@sha256:${"a".repeat(64)}`,
    ).join(" ");
    expect(args).toContain("PSP_HASH_KEY=fixture-psp-hash-key:7");
    expect(args).toContain("PSP_HASH_IV=fixture-psp-hash-iv:7");
    expect(JSON.stringify(plan)).not.toContain(
      f.values["fixture-psp-hash-key"],
    );
    expect(JSON.stringify(plan)).not.toContain(
      f.values["fixture-psp-token-keyring"],
    );
  });

  it("serves the required phone provider through the actual configured Twilio factory and pinned mounts", () => {
    const f = phoneFixture();
    const plan = preflight(f.vars, SHA, TAG, DEPLOYER, f.cloud);
    const api = plan.services.find(
      (service: { id: string }) => service.id === "api",
    );
    expect(
      plan.services.find(
        (service: { id: string }) => service.id === "passenger-app-web",
      ).publicEntry.expectedProviders,
    ).toEqual(["phone"]);
    expect(api.secrets).toMatchObject({
      TWILIO_ACCOUNT_SID: "fixture-twilio-account:7",
      TWILIO_API_KEY_SID: "fixture-twilio-key-sid:7",
      TWILIO_API_KEY_SECRET: "fixture-twilio-key-secret:7",
      TWILIO_FROM_NUMBER: "fixture-twilio-sender:7",
    });
    expect(validators().smsAvailability(resolvedEnv(api, f))).toBe("available");
    const args = deployArgs(
      plan,
      api,
      `${plan.registry}/api@sha256:${"b".repeat(64)}`,
    ).join(" ");
    expect(args).toContain("TWILIO_API_KEY_SECRET=fixture-twilio-key-secret:7");
    expect(args).toContain("TWILIO_FROM_NUMBER=fixture-twilio-sender:7");
    expect(JSON.stringify(plan)).not.toContain(
      f.values["fixture-twilio-account"],
    );
    expect(JSON.stringify(plan)).not.toContain(
      f.values["fixture-twilio-key-secret"],
    );
  });

  it("retains the existing incomplete payment-group refusal when the hash IV is missing", () => {
    const f = ecpayFixture();
    delete f.vars.PROD_PSP_HASH_IV_SECRET;
    expect(() => preflight(f.vars, SHA, TAG, DEPLOYER, f.cloud)).toThrow(
      /partial PSP_MERCHANT_ID/,
    );
  });

  it("retains unavailable phone login when the Twilio sender is missing", () => {
    const f = phoneFixture();
    delete f.vars.PROD_TWILIO_FROM_NUMBER_SECRET;
    expect(() => preflight(f.vars, SHA, TAG, DEPLOYER, f.cloud)).toThrow(
      /SMS_PORT adapter unavailable/,
    );
  });
});
