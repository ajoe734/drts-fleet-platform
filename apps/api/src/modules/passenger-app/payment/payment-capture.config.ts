import {
  validatePaymentCapturePolicy,
  type PaymentCapturePolicy,
} from "./payment-capture.policy";
import type { PaymentRuntime } from "./payment-runtime.config";

/** No product-environment inference or financial defaults. An explicit switch
 * enables only an explicit validated policy with an available original PSP
 * and token cipher. Disabled configuration does not inject a usable policy.
 */
export function paymentCapturePolicyFromEnv(
  env: NodeJS.ProcessEnv,
  runtime: PaymentRuntime,
): PaymentCapturePolicy | null {
  const enabled = env.PAX_PAYMENT_CAPTURE_ENABLED?.trim();
  if (enabled === undefined || enabled === "false") return null;
  if (enabled !== "true")
    throw new Error("payment_capture_configuration_invalid");
  let value: unknown;
  try {
    if (!env.PAX_PAYMENT_CAPTURE_POLICY?.trim())
      throw new Error("missing_policy");
    value = JSON.parse(env.PAX_PAYMENT_CAPTURE_POLICY);
    value = validatePaymentCapturePolicy(value);
  } catch {
    // No configuration value or underlying parse error enters an exception.
    throw new Error("payment_capture_configuration_invalid");
  }
  if (!runtime.provider.available || !runtime.cipher)
    throw new Error("payment_capture_configuration_unavailable");
  return value as PaymentCapturePolicy;
}
