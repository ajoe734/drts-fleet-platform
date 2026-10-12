import type { MoneyResult } from "./payment-provider.port";

/** Financial policy is explicitly injected, never inferred from product/test
 * environment or PSP secrets. The capture maximum is 1 + retryDelaysMs.length;
 * unknown acknowledgements have a separate, bounded readback schedule.
 */
export interface PaymentCapturePolicy {
  readonly retryDelaysMs: readonly number[];
  readonly retryDefinitiveDeclines: boolean;
  readonly unknownReadbackDelaysMs: readonly number[];
}

export const PAYMENT_CAPTURE_POLICY = Symbol("PAYMENT_CAPTURE_POLICY");

function invalidPolicy(): never {
  throw new Error("payment_capture_policy_invalid");
}

export function validatePaymentCapturePolicy(
  value: unknown,
): PaymentCapturePolicy {
  if (!value || typeof value !== "object" || Array.isArray(value))
    invalidPolicy();
  const policy = value as Record<string, unknown>;
  const fields = [
    "retryDelaysMs",
    "retryDefinitiveDeclines",
    "unknownReadbackDelaysMs",
  ];
  if (
    Object.keys(policy).length !== fields.length ||
    fields.some((field) => !Object.hasOwn(policy, field))
  )
    invalidPolicy();
  if (typeof policy.retryDefinitiveDeclines !== "boolean") invalidPolicy();
  const now = Date.now();
  const delays = (input: unknown): readonly number[] => {
    if (
      !Array.isArray(input) ||
      Array.from(input).some(
        (delay) =>
          !Number.isSafeInteger(delay) ||
          delay < 0 ||
          // A safe integer can still overflow Date's narrower timestamp range.
          // Reject incompatible configuration before any monetary operation;
          // this is a representation limit, not a financial retry default.
          !Number.isFinite(new Date(now + delay).getTime()),
      )
    )
      invalidPolicy();
    return Object.freeze([...input] as number[]);
  };
  return Object.freeze({
    retryDelaysMs: delays(policy.retryDelaysMs),
    retryDefinitiveDeclines: policy.retryDefinitiveDeclines,
    unknownReadbackDelaysMs: delays(policy.unknownReadbackDelaysMs),
  });
}

export interface CaptureAttemptOutcome {
  result: MoneyResult;
  /** Durable count includes the reserved capture request, never readbacks.
   * A lost pre-request COMMIT acknowledgement may reserve without sending;
   * that ambiguity resumes only with readback, never another capture.
   */
  attemptCount: number;
  /** Readbacks completed for this unknown acknowledgement, initially zero. */
  readbackCount: number;
  now: Date;
}

export type CaptureDisposition =
  | {
      status: "captured";
      providerRef: string;
      nextOperation: null;
      retryAt: null;
      error: null;
      requestRecoveryNotice: false;
    }
  | {
      status: "failed";
      nextOperation: "capture" | "readback";
      retryAt: string;
      error: "card_declined" | "unavailable" | "invalid_method" | "unknown";
      requestRecoveryNotice: false;
    }
  | {
      status: "manual_recovery";
      nextOperation: null;
      retryAt: null;
      error: "card_declined" | "unavailable" | "invalid_method" | "unknown";
      requestRecoveryNotice: true;
    };

/** Pure decision boundary for the forthcoming durable charge writer. It does
 * not execute PSP operations, increment a DB attempt, deliver a notice, or turn
 * a timeout/accepted acknowledgement into captured status.
 */
export function captureDisposition(
  injectedPolicy: PaymentCapturePolicy,
  outcome: CaptureAttemptOutcome,
): CaptureDisposition {
  const policy = validatePaymentCapturePolicy(injectedPolicy);
  if (
    !Number.isSafeInteger(outcome.attemptCount) ||
    outcome.attemptCount < 1 ||
    !Number.isSafeInteger(outcome.readbackCount) ||
    outcome.readbackCount < 0 ||
    !(outcome.now instanceof Date) ||
    !Number.isFinite(outcome.now.getTime())
  )
    throw new Error("payment_capture_outcome_invalid");
  const result = outcome.result;
  if (result.status === "completed") {
    if (
      typeof result.providerRef !== "string" ||
      !result.providerRef.trim() ||
      result.providerRef.length > 255 ||
      Array.from(result.providerRef).some((character) => {
        const code = character.charCodeAt(0);
        return code < 32 || code === 127;
      })
    )
      throw new Error("payment_capture_outcome_invalid");
    return {
      status: "captured",
      providerRef: result.providerRef,
      nextOperation: null,
      retryAt: null,
      error: null,
      requestRecoveryNotice: false,
    };
  }
  let error: "card_declined" | "unavailable" | "invalid_method" | "unknown";
  let delay: number | undefined;
  let nextOperation: "capture" | "readback";
  if (result.status === "pending" || result.status === "unknown") {
    // Unknown acknowledgement must ONLY read the original order key. Giving
    // it a capture retry budget could silently present a second charge.
    error = "unknown";
    delay = policy.unknownReadbackDelaysMs[outcome.readbackCount];
    nextOperation = "readback";
  } else if (
    result.status === "failed" &&
    ["card_declined", "unavailable", "invalid_method"].includes(result.error) &&
    typeof result.retryable === "boolean"
  ) {
    error = result.error;
    delay =
      result.retryable &&
      (error !== "card_declined" || policy.retryDefinitiveDeclines)
        ? policy.retryDelaysMs[outcome.attemptCount - 1]
        : undefined;
    nextOperation = "capture";
  } else throw new Error("payment_capture_outcome_invalid");
  if (delay === undefined)
    return {
      status: "manual_recovery",
      nextOperation: null,
      retryAt: null,
      error,
      requestRecoveryNotice: true,
    };
  const retryAt = new Date(outcome.now.getTime() + delay);
  if (!Number.isFinite(retryAt.getTime())) invalidPolicy();
  return {
    status: "failed",
    nextOperation,
    retryAt: retryAt.toISOString(),
    error,
    requestRecoveryNotice: false,
  };
}
