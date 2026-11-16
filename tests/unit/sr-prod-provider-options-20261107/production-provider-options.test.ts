import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildEcpayEnvelope,
  verifyAndUnwrapEcpayEnvelope,
} from "../../../apps/api/src/modules/passenger-app/payment/ecpay-cipher";
import {
  EcpayPaymentProvider,
  type EcpayFetchFn,
} from "../../../apps/api/src/modules/passenger-app/payment/ecpay-payment-provider";
import { paymentRuntimeFromEnv } from "../../../apps/api/src/modules/passenger-app/payment/payment-runtime.config";
import {
  createSmsPortFromEnv,
  type TwilioHttpTransport,
} from "../../../apps/api/src/modules/passenger-app/otp/sms.port";

const require = createRequire(import.meta.url);
const {
  preflight,
} = require("../../../operations/verification/production-release-rail/preflight.cjs");
const {
  deployArgs,
} = require("../../../operations/verification/production-release-rail/rail.cjs");
const {
  fixture,
  SHA,
  TAG,
  DEPLOYER,
  STRONG,
} = require("../sr-prod-full-surface-rail-20261012/fixture.cjs");

const FIXED_NOW = new Date("2026-11-07T08:30:00.000Z");
const FIXED_NOW_MS = FIXED_NOW.getTime();
const DEFAULT_RETURN_URL =
  "https://ride.smarttransport.tw/api/passenger-app/payment-methods/ecpay/callback";
const DEFAULT_ORDER_RESULT_URL =
  "https://ride.smarttransport.tw/api/passenger-app/payment-methods/ecpay/order-result";
const CUSTOM_RETURN_URL = "https://provider-options.drts.invalid/ecpay/return";
const CUSTOM_ORDER_RESULT_URL =
  "https://provider-options.drts.invalid/ecpay/result";
const CUSTOM_SMS_CALLBACK_URL =
  "https://provider-options.drts.invalid/twilio/status";
const OPTIONAL_FIELDS = [
  "PSP_RETURN_URL",
  "PSP_ORDER_RESULT_URL",
  "PSP_BINDING_AUTH_AMOUNT_TWD",
  "TWILIO_HTTP_TIMEOUT_MS",
  "TWILIO_STATUS_CALLBACK_URL",
] as const;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function productionRuntime(overrides: Record<string, string> = {}) {
  const f = fixture();
  const entries = JSON.parse(f.vars.PROD_PUBLIC_ENTRY_CONFIG_JSON);
  entries["passenger-app-web"].expectedProviders = ["phone"];
  f.vars.PROD_PUBLIC_ENTRY_CONFIG_JSON = JSON.stringify(entries);
  Object.assign(f.vars, {
    PROD_PSP_PROVIDER: "ecpay",
    PROD_PSP_MERCHANT_ID: "SYNTHETIC_MID_01",
    PROD_PSP_SANDBOX: "true",
    PROD_PSP_HASH_KEY_SECRET: "fixture-optional-psp-hash-key",
    PROD_PSP_HASH_IV_SECRET: "fixture-optional-psp-hash-iv",
    PROD_PSP_TOKEN_ENCRYPTION_KEY_NAME_SECRET: "fixture-optional-psp-keyring",
    PROD_PASSENGER_OTP_PEPPER_SECRET: "fixture-optional-otp-pepper",
    PROD_TWILIO_ACCOUNT_SID_SECRET: "fixture-optional-twilio-account",
    PROD_TWILIO_API_KEY_SID_SECRET: "fixture-optional-twilio-key-sid",
    PROD_TWILIO_API_KEY_SECRET_SECRET: "fixture-optional-twilio-key-secret",
    PROD_TWILIO_FROM_NUMBER_SECRET: "fixture-optional-twilio-sender",
    ...overrides,
  });
  Object.assign(f.values, {
    "fixture-optional-psp-hash-key": "K".repeat(16),
    "fixture-optional-psp-hash-iv": "I".repeat(16),
    "fixture-optional-psp-keyring": JSON.stringify({
      activeKeyId: "k1",
      keys: { k1: Buffer.alloc(32, 36).toString("base64") },
    }),
    "fixture-optional-otp-pepper": STRONG,
    "fixture-optional-twilio-account": "AC" + "a1b2c3d4".repeat(4),
    "fixture-optional-twilio-key-sid": "SK" + "e5f60718".repeat(4),
    "fixture-optional-twilio-key-secret": STRONG,
    "fixture-optional-twilio-sender": "SmartTaxi",
  });
  const plan = preflight(f.vars, SHA, TAG, DEPLOYER, f.cloud);
  const api = plan.services.find(
    (service: { id: string }) => service.id === "api",
  );
  const env: NodeJS.ProcessEnv = {
    ...api.env,
    ...Object.fromEntries(
      Object.entries(api.secrets).map(([key, reference]) => [
        key,
        f.values[String(reference).replace(/:7$/, "")] ?? STRONG,
      ]),
    ),
  };
  const args: string[] = deployArgs(
    plan,
    api,
    `${plan.registry}/api@sha256:${"a".repeat(64)}`,
  );
  return { api, env, args };
}

async function actualBindingRequest(env: NodeJS.ProcessEnv) {
  const requests: Array<{ url: string; data: Record<string, unknown> }> = [];
  const merchantId = env.PSP_MERCHANT_ID!;
  const hashKey = env.PSP_HASH_KEY!;
  const hashIv = env.PSP_HASH_IV!;
  const timestamp = Math.floor(FIXED_NOW_MS / 1000);
  const fetchFn: EcpayFetchFn = async (url, init) => {
    expect(init.method).toBe("POST");
    const request = verifyAndUnwrapEcpayEnvelope({
      envelope: JSON.parse(String(init.body)),
      merchantId,
      hashKey,
      hashIv,
      nowSeconds: timestamp,
    });
    requests.push({ url, data: request.data });
    const response = buildEcpayEnvelope({
      merchantId,
      hashKey,
      hashIv,
      timestamp,
      data: {
        RtnCode: 1,
        RtnMsg: "Success",
        Token: "synthetic_provider_options_token_001",
        TokenExpireDate: "2026/11/07 17:00:00",
      },
    });
    return {
      ok: true,
      status: 200,
      json: async () => ({
        MerchantID: response.MerchantID,
        RpHeader: response.RqHeader,
        TransCode: 1,
        TransMsg: "Success",
        Data: response.Data,
      }),
    };
  };
  const runtime = paymentRuntimeFromEnv(env, {
    fetchFn,
    now: () => FIXED_NOW,
  });
  expect(runtime.provider).toBeInstanceOf(EcpayPaymentProvider);
  expect(runtime.cipher).not.toBeNull();
  const provider = runtime.provider as EcpayPaymentProvider;
  // No per-call URL or amount override: only the resolved runtime can supply it.
  const session = await provider.createBindingSession(
    "pax_optional_options_fixture",
    {
      email: "pax@provider-options.invalid",
      phone: "+886912345678",
      idempotencyKey: "pax:optional-options:binding-session",
    },
  );
  expect(session.merchantToken).toBe("synthetic_provider_options_token_001");
  expect(requests).toHaveLength(1);
  expect(requests[0]!.url).toBe(
    "https://ecpg-stage.ecpay.com.tw/Merchant/GetTokenbyBindingCard",
  );
  return requests[0]!.data;
}

async function actualSmsDeadline(env: NodeJS.ProcessEnv, deadlineMs: number) {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW_MS);
  const requests: Array<{
    url: string;
    body: string;
    signal: AbortSignal;
  }> = [];
  const transport: TwilioHttpTransport = (url, init) => {
    requests.push({ url, body: init.body, signal: init.signal });
    return new Promise((_resolve, reject) => {
      init.signal.addEventListener(
        "abort",
        () => reject(new DOMException("fixture timeout", "AbortError")),
        { once: true },
      );
    });
  };
  const adapter = createSmsPortFromEnv(env, transport, () => FIXED_NOW_MS);
  expect(adapter.availability()).toBe("available");
  const pending = adapter.sendOtp(
    "+886912345678",
    "112233",
    new Date(FIXED_NOW_MS + 300_000).toISOString(),
  );
  try {
    expect(requests).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(deadlineMs - 1);
    const abortedBeforeDeadline = requests[0]!.signal.aborted;
    await vi.advanceTimersByTimeAsync(1);
    const abortedAtDeadline = requests[0]!.signal.aborted;
    // RED still uses the existing 10000ms default. Drain only fake timers so
    // that its pending send is settled before assertions can fail.
    await vi.runAllTimersAsync();
    const result = await pending;
    return {
      abortedBeforeDeadline,
      abortedAtDeadline,
      result,
      form: new URLSearchParams(requests[0]!.body),
      url: requests[0]!.url,
    };
  } finally {
    await vi.runAllTimersAsync();
    await pending;
    vi.useRealTimers();
  }
}

describe("production existing provider optional runtime behavior", () => {
  it("uses custom payment callbacks and binding amount in the actual encrypted ECPay binding request", async () => {
    const { api, env, args } = productionRuntime({
      PROD_PSP_RETURN_URL: CUSTOM_RETURN_URL,
      PROD_PSP_ORDER_RESULT_URL: CUSTOM_ORDER_RESULT_URL,
      PROD_PSP_BINDING_AUTH_AMOUNT_TWD: "17",
    });
    const data = await actualBindingRequest(env);
    expect(data.OrderInfo).toMatchObject({
      ReturnURL: CUSTOM_RETURN_URL,
      TotalAmount: 17,
    });
    expect(data.OrderResultURL).toBe(CUSTOM_ORDER_RESULT_URL);
    for (const [field, value] of [
      ["PSP_RETURN_URL", CUSTOM_RETURN_URL],
      ["PSP_ORDER_RESULT_URL", CUSTOM_ORDER_RESULT_URL],
      ["PSP_BINDING_AUTH_AMOUNT_TWD", "17"],
    ]) {
      expect(api.env[field!]).toBe(value);
      expect(args.join(" ")).toContain(`${field}=${value}`);
    }
  });

  it("uses the configured Twilio callback form field and aborts the actual SMS request at its custom deadline", async () => {
    const { api, env, args } = productionRuntime({
      PROD_TWILIO_HTTP_TIMEOUT_MS: "1500",
      PROD_TWILIO_STATUS_CALLBACK_URL: CUSTOM_SMS_CALLBACK_URL,
    });
    const observed = await actualSmsDeadline(env, 1500);
    expect(observed.abortedBeforeDeadline).toBe(false);
    expect(observed.abortedAtDeadline).toBe(true);
    expect(observed.form.get("StatusCallback")).toBe(CUSTOM_SMS_CALLBACK_URL);
    expect(observed.form.get("To")).toBe("+886912345678");
    expect(observed.result).toMatchObject({
      status: "failed",
      provider: "twilio",
      failureCategory: "temporary_failure",
      maskedTarget: "+886 912-***-678",
    });
    for (const [field, value] of [
      ["TWILIO_HTTP_TIMEOUT_MS", "1500"],
      ["TWILIO_STATUS_CALLBACK_URL", CUSTOM_SMS_CALLBACK_URL],
    ]) {
      expect(api.env[field!]).toBe(value);
      expect(args.join(" ")).toContain(`${field}=${value}`);
    }
  });

  it("retains the real payment and SMS defaults when all five optional settings are absent", async () => {
    const { api, env, args } = productionRuntime();
    const data = await actualBindingRequest(env);
    expect(data.OrderInfo).toMatchObject({
      ReturnURL: DEFAULT_RETURN_URL,
      TotalAmount: 5,
    });
    expect(data.OrderResultURL).toBe(DEFAULT_ORDER_RESULT_URL);
    const observed = await actualSmsDeadline(env, 10_000);
    expect(observed.abortedBeforeDeadline).toBe(false);
    expect(observed.abortedAtDeadline).toBe(true);
    expect(observed.form.has("StatusCallback")).toBe(false);
    expect(observed.result).toMatchObject({
      status: "failed",
      provider: "twilio",
      failureCategory: "temporary_failure",
    });
    for (const field of OPTIONAL_FIELDS) {
      expect(api.env).not.toHaveProperty(field);
      expect(args.join(" ")).not.toContain(`${field}=`);
    }
  });
});
