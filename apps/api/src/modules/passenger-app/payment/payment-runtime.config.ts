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

/** PSP_PROVIDER is opt-in. Complete secrets alone never select a fake or make
 * an uncontracted real adapter available. No network/Secret Manager access.
 */
export function paymentRuntimeFromEnv(env: NodeJS.ProcessEnv): PaymentRuntime {
  const selection = env.PSP_PROVIDER?.trim();
  // Validate before considering partial settings: production fake must fail
  // startup even when disabled by missing secrets.
  if (selection === "fake") assertFakePaymentEnvironment(env);
  const required = [
    "PSP_MERCHANT_ID",
    "PSP_API_KEY",
    "PSP_SANDBOX",
    "PSP_TOKEN_ENCRYPTION_KEY_NAME",
  ] as const;
  if (!required.every((name) => env[name]?.trim()))
    return { provider: new UnconfiguredPaymentProvider(), cipher: null };
  if (env.PSP_SANDBOX !== "true" && env.PSP_SANDBOX !== "false")
    throw new Error("PSP_SANDBOX must be true or false.");
  if (selection !== "fake")
    return { provider: new UnconfiguredPaymentProvider(), cipher: null };
  if (env.PSP_SANDBOX !== "true")
    throw new Error("Fake payment provider requires sandbox mode.");
  return {
    provider: new FakePaymentProvider(env),
    cipher: new PaymentTokenCipher(env.PSP_TOKEN_ENCRYPTION_KEY_NAME!),
  };
}
