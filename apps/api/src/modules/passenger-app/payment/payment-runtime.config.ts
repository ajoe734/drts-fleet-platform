import { EcpayPaymentProvider, type EcpayFetchFn } from "./ecpay-payment-provider";
import {
  FakePaymentProvider,
  assertFakePaymentEnvironment,
} from "./fake-payment-provider";
import {
  UnconfiguredPaymentProvider,
  type PaymentProviderPort,
} from "./payment-provider.port";
import { PaymentTokenCipher } from "./payment-token-cipher";

export interface PaymentRuntime {
  provider: PaymentProviderPort;
  cipher: PaymentTokenCipher | null;
}

export const ECPAY_PAYMENT_REQUIRED_SECRETS = [
  "PSP_MERCHANT_ID",
  "PSP_HASH_KEY",
  "PSP_HASH_IV",
  "PSP_SANDBOX",
  "PSP_TOKEN_ENCRYPTION_KEY_NAME",
] as const;

const LEGACY_FAKE_PAYMENT_REQUIRED_SECRETS = [
  "PSP_MERCHANT_ID",
  "PSP_API_KEY",
  "PSP_SANDBOX",
  "PSP_TOKEN_ENCRYPTION_KEY_NAME",
] as const;

/** PSP_PROVIDER is opt-in. Complete secrets alone never select a fake or make
 * an uncontracted real adapter available. No network/Secret Manager access.
 */
export function paymentRuntimeFromEnv(
  env: NodeJS.ProcessEnv,
  options?: { fetchFn?: EcpayFetchFn; now?: () => Date },
): PaymentRuntime {
  const selection = env.PSP_PROVIDER?.trim();
  // Validate before considering partial settings: production fake must fail
  // startup even when disabled by missing secrets.
  if (selection === "fake") assertFakePaymentEnvironment(env);

  const usesEcpaySecretGroup =
    selection === "ecpay" ||
    Boolean(env.PSP_HASH_KEY?.trim() || env.PSP_HASH_IV?.trim());

  const required = usesEcpaySecretGroup
    ? ECPAY_PAYMENT_REQUIRED_SECRETS
    : LEGACY_FAKE_PAYMENT_REQUIRED_SECRETS;

  if (!required.every((name) => env[name]?.trim()))
    return { provider: new UnconfiguredPaymentProvider(), cipher: null };

  if (env.PSP_SANDBOX !== "true" && env.PSP_SANDBOX !== "false")
    throw new Error("PSP_SANDBOX must be true or false.");

  if (selection === "ecpay") {
    const cipher = new PaymentTokenCipher(env.PSP_TOKEN_ENCRYPTION_KEY_NAME!);
    const rawBindingAuthAmount = env.PSP_BINDING_AUTH_AMOUNT_TWD?.trim();
    const bindingAuthAmountTwd =
      rawBindingAuthAmount !== undefined && rawBindingAuthAmount !== ""
        ? Number(rawBindingAuthAmount)
        : undefined;
    const provider = new EcpayPaymentProvider({
      merchantId: env.PSP_MERCHANT_ID!,
      hashKey: env.PSP_HASH_KEY!,
      hashIv: env.PSP_HASH_IV!,
      sandbox: env.PSP_SANDBOX === "true",
      ...(env.PSP_RETURN_URL ? { returnUrl: env.PSP_RETURN_URL } : {}),
      ...(env.PSP_ORDER_RESULT_URL
        ? { orderResultUrl: env.PSP_ORDER_RESULT_URL }
        : {}),
      ...(bindingAuthAmountTwd !== undefined ? { bindingAuthAmountTwd } : {}),
      ...(options?.fetchFn ? { fetchFn: options.fetchFn } : {}),
      ...(options?.now ? { now: options.now } : {}),
    });
    return { provider, cipher };
  }

  if (selection !== "fake")
    return { provider: new UnconfiguredPaymentProvider(), cipher: null };
  if (env.PSP_SANDBOX !== "true")
    throw new Error("Fake payment provider requires sandbox mode.");
  return {
    provider: new FakePaymentProvider(env),
    cipher: new PaymentTokenCipher(env.PSP_TOKEN_ENCRYPTION_KEY_NAME!),
  };
}
