import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import {
  buildEcpayEnvelope,
  decryptEcpayData,
  verifyAndUnwrapEcpayEnvelope,
} from "../../../apps/api/src/modules/passenger-app/payment/ecpay-cipher";
import {
  EcpayPaymentProvider,
  type EcpayFetchFn,
} from "../../../apps/api/src/modules/passenger-app/payment/ecpay-payment-provider";
import { paymentRuntimeFromEnv } from "../../../apps/api/src/modules/passenger-app/payment/payment-runtime.config";

const require = createRequire(import.meta.url);
const {
  buildPlan,
  deployArgs,
} = require("../../../operations/verification/production-release-rail/rail.cjs");
const {
  preflight,
} = require("../../../operations/verification/production-release-rail/preflight.cjs");
const { fixture, SHA, TAG, DEPLOYER, STRONG } = require("./fixture.cjs");

const SHARED_DEV_PASSENGER_ORIGIN = "https://ride.smarttransport.tw";
const SYNTHETIC_PROD_PASSENGER_ORIGIN = "https://pax-release.drts.invalid";
const OVERRIDE_ORIGIN = "https://verified-payments.example.invalid";
const CALLBACK_PATH = "/api/passenger-app/payment-methods/ecpay/callback";
const ORDER_RESULT_PATH =
  "/api/passenger-app/payment-methods/ecpay/order-result";
const FIXED_NOW = new Date("2026-11-23T04:00:00.000Z");

function prodEcpayFixture(
  overrides: Record<string, string | undefined> = {},
  passengerOrigin = SYNTHETIC_PROD_PASSENGER_ORIGIN,
) {
  const f = fixture();
  const previousPassengerOrigin = f.vars.PROD_PASSENGER_APP_ORIGIN;
  f.vars.PROD_PASSENGER_APP_ORIGIN = passengerOrigin;
  f.vars.PROD_AUTH_ALLOWED_ORIGINS = f.vars.PROD_AUTH_ALLOWED_ORIGINS.split(";")
    .map((origin: string) =>
      origin === previousPassengerOrigin ? passengerOrigin : origin,
    )
    .join(";");
  f.vars.PROD_OAUTH_REDIRECT_ALLOWLIST = `${passengerOrigin}/auth/callback/google`;
  Object.assign(f.vars, {
    PROD_PSP_PROVIDER: "ecpay",
    PROD_PSP_MERCHANT_ID: "1234567",
    PROD_PSP_SANDBOX: "false",
    PROD_PSP_HASH_KEY_SECRET: "drts-prod-psp-hash-key",
    PROD_PSP_HASH_IV_SECRET: "drts-prod-psp-hash-iv",
    PROD_PSP_TOKEN_ENCRYPTION_KEY_NAME_SECRET:
      "drts-prod-psp-token-encryption-key-name",
  });
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete f.vars[key];
    } else {
      f.vars[key] = value;
    }
  }
  Object.assign(f.values, {
    "drts-prod-psp-hash-key": "K".repeat(16),
    "drts-prod-psp-hash-iv": "V".repeat(16),
    "drts-prod-psp-token-encryption-key-name": JSON.stringify({
      activeKeyId: "fixture",
      keys: { fixture: Buffer.alloc(32, 2).toString("base64") },
    }),
  });
  return f;
}

function resolvedApiEnv(
  api: { env: Record<string, string>; secrets: Record<string, string> },
  values: Record<string, string>,
): NodeJS.ProcessEnv {
  return {
    ...api.env,
    ...Object.fromEntries(
      Object.entries(api.secrets).map(([key, ref]) => [
        key,
        values[String(ref).replace(/:[0-9]+$/, "")] ?? STRONG,
      ]),
    ),
  };
}

async function captureBindingRequests(env: NodeJS.ProcessEnv) {
  const hashKey = env.PSP_HASH_KEY!;
  const hashIv = env.PSP_HASH_IV!;
  const merchantId = env.PSP_MERCHANT_ID!;
  const nowSeconds = Math.floor(FIXED_NOW.getTime() / 1000);
  const captures: Array<{
    url: string;
    operation: string;
    notification: unknown;
    browserReturn: unknown;
  }> = [];

  const fetchFn: EcpayFetchFn = async (url, init) => {
    const body = JSON.parse(String(init.body));
    const decrypted = decryptEcpayData(body.Data, hashKey, hashIv);
    const unwrapped = verifyAndUnwrapEcpayEnvelope({
      envelope: body,
      merchantId,
      hashKey,
      hashIv,
      nowSeconds,
    });
    expect(unwrapped.data).toEqual(decrypted);
    const operation = new URL(url).pathname.split("/").pop()!;
    const orderInfo = decrypted.OrderInfo as
      | Record<string, unknown>
      | undefined;
    captures.push({
      url,
      operation,
      notification: orderInfo?.ReturnURL ?? decrypted.ReturnURL,
      browserReturn: decrypted.OrderResultURL,
    });

    const responseData =
      operation === "GetTokenbyBindingCard"
        ? {
            RtnCode: 1,
            RtnMsg: "Success",
            Token: "synthetic-merchant-token-001",
            TokenExpireDate: "2026/11/23 12:00:00",
          }
        : {
            RtnCode: 1,
            RtnMsg: "ThreeD verification required",
            ThreeDInfo: {
              ThreeDURL: "https://ecpg.ecpay.com.tw/MockThreeD/Verify",
            },
          };
    const responseEnvelope = buildEcpayEnvelope({
      merchantId,
      hashKey,
      hashIv,
      timestamp: nowSeconds,
      data: responseData,
    });
    return {
      ok: true,
      status: 200,
      json: async () => ({
        MerchantID: responseEnvelope.MerchantID,
        RpHeader: responseEnvelope.RqHeader,
        TransCode: 1,
        TransMsg: "Success",
        Data: responseEnvelope.Data,
      }),
    };
  };

  const runtime = paymentRuntimeFromEnv(env, {
    fetchFn,
    now: () => FIXED_NOW,
  });
  expect(runtime.provider).toBeInstanceOf(EcpayPaymentProvider);
  const provider = runtime.provider as EcpayPaymentProvider;
  expect(provider.sandbox).toBe(false);
  expect(provider.serverType).toBe("Prod");

  const session = await provider.createBindingSession("fixture-passenger", {
    email: "test@example.invalid",
  });
  expect(session.merchantToken).toBe("synthetic-merchant-token-001");
  expect(session.serverType).toBe("Prod");

  const bindResult = await provider.bind(
    "fixture-pay-token",
    "fixture-idempotency",
    { passengerId: "fixture-passenger" },
  );
  expect(bindResult).toEqual({
    status: "action_required",
    nextActionUrl: "https://ecpg.ecpay.com.tw/MockThreeD/Verify",
  });
  expect(captures).toHaveLength(2);
  return captures;
}

describe("production ECPay passenger callback and browser return routing", () => {
  it.each([
    {
      label: "implicit (both omitted)",
      overrides: {},
      expectedReturnUrl: `${SYNTHETIC_PROD_PASSENGER_ORIGIN}${CALLBACK_PATH}`,
      expectedOrderResultUrl: `${SYNTHETIC_PROD_PASSENGER_ORIGIN}${ORDER_RESULT_PATH}`,
    },
    {
      label: "serverOnly (only PROD_PSP_RETURN_URL set)",
      overrides: {
        PROD_PSP_RETURN_URL: `${OVERRIDE_ORIGIN}${CALLBACK_PATH}`,
      },
      expectedReturnUrl: `${OVERRIDE_ORIGIN}${CALLBACK_PATH}`,
      expectedOrderResultUrl: `${SYNTHETIC_PROD_PASSENGER_ORIGIN}${ORDER_RESULT_PATH}`,
    },
    {
      label: "browserOnly (only PROD_PSP_ORDER_RESULT_URL set)",
      overrides: {
        PROD_PSP_ORDER_RESULT_URL: `${OVERRIDE_ORIGIN}${ORDER_RESULT_PATH}`,
      },
      expectedReturnUrl: `${SYNTHETIC_PROD_PASSENGER_ORIGIN}${CALLBACK_PATH}`,
      expectedOrderResultUrl: `${OVERRIDE_ORIGIN}${ORDER_RESULT_PATH}`,
    },
    {
      label: "explicit (both PROD_PSP_RETURN_URL and PROD_PSP_ORDER_RESULT_URL set)",
      overrides: {
        PROD_PSP_RETURN_URL: `${OVERRIDE_ORIGIN}${CALLBACK_PATH}`,
        PROD_PSP_ORDER_RESULT_URL: `${OVERRIDE_ORIGIN}${ORDER_RESULT_PATH}`,
      },
      expectedReturnUrl: `${OVERRIDE_ORIGIN}${CALLBACK_PATH}`,
      expectedOrderResultUrl: `${OVERRIDE_ORIGIN}${ORDER_RESULT_PATH}`,
    },
  ])(
    "derives and preserves individual callback URLs for $label through buildPlan, preflight, deployArgs and real provider requests",
    async ({ overrides, expectedReturnUrl, expectedOrderResultUrl }) => {
      const f = prodEcpayFixture(overrides);
      const built = buildPlan(f.vars, SHA, TAG, DEPLOYER);
      const plan = preflight(f.vars, SHA, TAG, DEPLOYER, f.cloud);
      const api = plan.services.find((s: { id: string }) => s.id === "api");
      const passenger = plan.services.find(
        (s: { id: string }) => s.id === "passenger-app-web",
      );

      expect(passenger.origin).toBe(SYNTHETIC_PROD_PASSENGER_ORIGIN);
      expect(passenger.origin).not.toBe(SHARED_DEV_PASSENGER_ORIGIN);
      expect(built.services[0].env.PSP_RETURN_URL).toBe(expectedReturnUrl);
      expect(built.services[0].env.PSP_ORDER_RESULT_URL).toBe(
        expectedOrderResultUrl,
      );
      expect(api.env.PSP_RETURN_URL).toBe(expectedReturnUrl);
      expect(api.env.PSP_ORDER_RESULT_URL).toBe(expectedOrderResultUrl);

      const args = deployArgs(
        plan,
        api,
        `${plan.registry}/api@sha256:${"a".repeat(64)}`,
      );
      const envArg = args[args.indexOf("--set-env-vars") + 1];
      expect(envArg).toContain(`PSP_RETURN_URL=${expectedReturnUrl}`);
      expect(envArg).toContain(
        `PSP_ORDER_RESULT_URL=${expectedOrderResultUrl}`,
      );
      expect(envArg).not.toContain(SHARED_DEV_PASSENGER_ORIGIN);

      const captures = await captureBindingRequests(
        resolvedApiEnv(api, f.values),
      );
      expect(captures).toEqual([
        {
          url: "https://ecpg.ecpay.com.tw/Merchant/GetTokenbyBindingCard",
          operation: "GetTokenbyBindingCard",
          notification: expectedReturnUrl,
          browserReturn: expectedOrderResultUrl,
        },
        {
          url: "https://ecpg.ecpay.com.tw/Merchant/CreateBindCard",
          operation: "CreateBindCard",
          notification: expectedReturnUrl,
          browserReturn: expectedOrderResultUrl,
        },
      ]);
    },
  );

  it("treats whitespace-only callback variables as blank and derives from PROD_PASSENGER_APP_ORIGIN", () => {
    const f = prodEcpayFixture({
      PROD_PSP_RETURN_URL: "   ",
      PROD_PSP_ORDER_RESULT_URL: "",
    });
    const plan = buildPlan(f.vars, SHA, TAG, DEPLOYER);
    expect(plan.services[0].env.PSP_RETURN_URL).toBe(
      `${SYNTHETIC_PROD_PASSENGER_ORIGIN}${CALLBACK_PATH}`,
    );
    expect(plan.services[0].env.PSP_ORDER_RESULT_URL).toBe(
      `${SYNTHETIC_PROD_PASSENGER_ORIGIN}${ORDER_RESULT_PATH}`,
    );
  });

  it("does not synthesize ECPay callback URLs when payment provider is disabled or running in Stage sandbox mode", () => {
    const disabled = fixture();
    const disabledPlan = preflight(
      disabled.vars,
      SHA,
      TAG,
      DEPLOYER,
      disabled.cloud,
    );
    const disabledApi = disabledPlan.services.find(
      (s: { id: string }) => s.id === "api",
    );
    expect(disabledApi.env).not.toHaveProperty("PSP_PROVIDER");
    expect(disabledApi.env).not.toHaveProperty("PSP_RETURN_URL");
    expect(disabledApi.env).not.toHaveProperty("PSP_ORDER_RESULT_URL");
    const disabledArgs = deployArgs(
      disabledPlan,
      disabledApi,
      `${disabledPlan.registry}/api@sha256:${"a".repeat(64)}`,
    );
    expect(
      disabledArgs[disabledArgs.indexOf("--set-env-vars") + 1],
    ).not.toContain("PSP_RETURN_URL=");
    expect(
      disabledArgs[disabledArgs.indexOf("--set-env-vars") + 1],
    ).not.toContain("PSP_ORDER_RESULT_URL=");
    const disabledRuntime = paymentRuntimeFromEnv(
      resolvedApiEnv(disabledApi, disabled.values),
    );
    expect(disabledRuntime.provider.available).toBe(false);

    const stage = prodEcpayFixture({ PROD_PSP_SANDBOX: "true" });
    const stagePlan = preflight(stage.vars, SHA, TAG, DEPLOYER, stage.cloud);
    const stageApi = stagePlan.services.find(
      (s: { id: string }) => s.id === "api",
    );
    expect(stageApi.env.PSP_PROVIDER).toBe("ecpay");
    expect(stageApi.env.PSP_SANDBOX).toBe("true");
    expect(stageApi.env).not.toHaveProperty("PSP_RETURN_URL");
    expect(stageApi.env).not.toHaveProperty("PSP_ORDER_RESULT_URL");
  });

  it("preserves passenger origin validation, partial PSP credential rejection and recent production release features", () => {
    const invalidOrigin = prodEcpayFixture();
    invalidOrigin.vars.PROD_PASSENGER_APP_ORIGIN =
      "http://pax-release.drts.invalid";
    invalidOrigin.vars.PROD_OAUTH_REDIRECT_ALLOWLIST =
      "http://pax-release.drts.invalid/auth/callback/google";
    expect(() =>
      buildPlan(invalidOrigin.vars, SHA, TAG, DEPLOYER),
    ).toThrow("PROD_PASSENGER_APP_ORIGIN");

    const unallowedOrigin = prodEcpayFixture();
    unallowedOrigin.vars.PROD_PASSENGER_APP_ORIGIN =
      "https://unlisted-pax.drts.invalid";
    unallowedOrigin.vars.PROD_OAUTH_REDIRECT_ALLOWLIST =
      "https://unlisted-pax.drts.invalid/auth/callback/google";
    expect(() =>
      buildPlan(unallowedOrigin.vars, SHA, TAG, DEPLOYER),
    ).toThrow("PROD_AUTH_ALLOWED_ORIGINS");

    const partialSecrets = prodEcpayFixture();
    delete partialSecrets.vars.PROD_PSP_HASH_IV_SECRET;
    expect(() =>
      preflight(
        partialSecrets.vars,
        SHA,
        TAG,
        DEPLOYER,
        partialSecrets.cloud,
      ),
    ).toThrow(/partial PSP_MERCHANT_ID/);

    const f = prodEcpayFixture({
      PROD_PASSWORD_LOGIN_SECRETS_PRESENT: "true",
      PROD_PASSWORD_LOGIN_ENABLED: "true",
      PROD_PASSWORD_PEPPER_CURRENT_VERSION: "v1",
    });
    const built = buildPlan(f.vars, SHA, TAG, DEPLOYER);
    const api = built.services[0];
    expect(api.env.PASSWORD_LOGIN_ENABLED).toBe("true");
    expect(api.env.PASSWORD_PEPPER_CURRENT_VERSION).toBe("v1");
    expect(api.secrets.PASSWORD_PEPPER_SECRETS_JSON).toBe(
      "drts-prod-password-pepper",
    );
    expect(api.secrets.TOTP_ENCRYPTION_KEYS_JSON).toBe(
      "drts-prod-totp-encryption-key",
    );
    expect(api.env.DRIVER_ONBOARDING_NOTIFICATIONS_ENABLED).toBe("false");
    expect(api.env.AGENCY_INVITATION_ACCEPT_URL_BASE).toBe(
      `${f.vars.PROD_AGENCY_PORTAL_ORIGIN}/invite`,
    );
    expect(api.env.PSP_RETURN_URL).toBe(
      `${SYNTHETIC_PROD_PASSENGER_ORIGIN}${CALLBACK_PATH}`,
    );
    expect(api.env.PSP_ORDER_RESULT_URL).toBe(
      `${SYNTHETIC_PROD_PASSENGER_ORIGIN}${ORDER_RESULT_PATH}`,
    );
  });
});
