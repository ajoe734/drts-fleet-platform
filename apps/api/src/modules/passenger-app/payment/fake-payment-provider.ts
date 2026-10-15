import { createHash } from "node:crypto";
import { reviewDemoEnabled } from "../review-demo/review-demo.config";
import type {
  BindResult,
  CaptureCommand,
  MoneyResult,
  PaymentProviderPort,
  RefundCommand,
} from "./payment-provider.port";

/** Product environment is DRTS_ENV (shared dev uses NODE_ENV=production).
 * Allow only explicitly nonproduction environments. Unknown/absent values fail
 * closed, including a production node process without a product environment.
 */
export function assertFakePaymentEnvironment(env: NodeJS.ProcessEnv): void {
  if (!["development", "test", "staging"].includes(env.DRTS_ENV ?? "")) {
    throw new Error(
      "Fake payment provider requires an explicit nonproduction DRTS_ENV.",
    );
  }
}

type Operation = {
  fingerprint: string;
  amountMinor: number;
  captureRef: string | null;
  result: MoneyResult;
};

/** A simulation only; this map is never a financial ledger. Production
 * persistence must be supplied by the payment repository even with this fake.
 * Inputs are clearly synthetic identifiers, without PAN/CVV fixtures.
 */
export class FakePaymentProvider implements PaymentProviderPort {
  readonly name = "fake";
  readonly available = true;
  private readonly bindings = new Map<
    string,
    { credentialDigest: string; result: BindResult }
  >();
  private readonly consumedCredentials = new Set<string>();
  private readonly captures = new Map<string, Operation>();
  private readonly refunds = new Map<string, Operation>();
  private readonly review: boolean;
  readonly captureAttemptMetadata: boolean;

  constructor(env: NodeJS.ProcessEnv) {
    assertFakePaymentEnvironment(env);
    this.review = reviewDemoEnabled(env);
    this.captureAttemptMetadata = this.review;
  }

  async bind(credential: string, idempotencyKey: string): Promise<BindResult> {
    if (!idempotencyKey) throw new Error("Invalid synthetic bind operation.");
    const credentialDigest = createHash("sha256")
      .update(credential)
      .digest("hex");
    const existing = this.bindings.get(idempotencyKey);
    if (existing) {
      if (existing.credentialDigest !== credentialDigest)
        throw new Error("Fake payment idempotency conflict.");
      return structuredClone(existing.result);
    }
    if (this.consumedCredentials.has(credentialDigest))
      return { status: "failed", error: "invalid_credential" };
    let result: BindResult;
    if (/^synthetic_credential_[A-Za-z_-]+$/.test(credential)) {
      if (
        credential.startsWith("synthetic_credential_review_retry_") &&
        !this.review
      ) {
        result = { status: "failed", error: "invalid_credential" };
      } else if (credential === "synthetic_credential_declined") {
        result = { status: "failed", error: "card_declined" };
      } else if (credential === "synthetic_credential_action_required") {
        result = {
          status: "action_required",
          nextActionUrl: "https://synthetic-psp.invalid/three-ds",
        };
      } else if (credential === "synthetic_credential_pending") {
        result = { status: "pending" };
      } else {
        result = {
          status: "completed",
          card: {
            token: `synthetic_${credential.startsWith("synthetic_credential_review_retry_") ? "retry_" : ""}token_${createHash("sha256").update(idempotencyKey).digest("hex")}`,
            last4: "0000",
            cardType: "synthetic",
            expiryMonth: "12",
            expiryYear: "2099",
          },
        };
      }
    } else {
      result = { status: "failed", error: "invalid_credential" };
    }
    this.consumedCredentials.add(credentialDigest);
    this.bindings.set(idempotencyKey, { credentialDigest, result });
    return structuredClone(result);
  }

  async capture(command: CaptureCommand): Promise<MoneyResult> {
    const retryScenario =
      this.review && /^synthetic_retry_token_[a-f0-9]{64}$/.test(command.token);
    if (!retryScenario && !/^synthetic_token_[a-f0-9]{64}$/.test(command.token))
      return { status: "failed", error: "invalid_method", retryable: false };
    if (
      retryScenario &&
      (!Number.isSafeInteger(command.attemptCount) || command.attemptCount! < 1)
    )
      throw new Error("Invalid synthetic capture attempt.");
    return this.money(
      this.captures,
      command,
      "capture",
      retryScenario && command.attemptCount === 1,
    );
  }
  async readCapture(key: string): Promise<MoneyResult> {
    return structuredClone(
      this.captures.get(key)?.result ?? { status: "unknown" },
    );
  }
  async refund(command: RefundCommand): Promise<MoneyResult> {
    const capture = [...this.captures.values()].find(
      (op) =>
        op.result.status === "completed" &&
        op.result.providerRef === command.captureRef,
    );
    if (!capture)
      return { status: "failed", error: "invalid_method", retryable: false };
    const refunded = [...this.refunds.entries()].reduce(
      (sum, [key, operation]) =>
        key !== command.idempotencyKey &&
        operation.captureRef === command.captureRef &&
        operation.result.status === "completed"
          ? sum + operation.amountMinor
          : sum,
      0,
    );
    if (
      !Number.isSafeInteger(command.amountMinor) ||
      command.amountMinor < 0 ||
      command.amountMinor > capture.amountMinor - refunded
    )
      throw new Error("Invalid synthetic refund amount.");
    return this.money(this.refunds, command, "refund");
  }
  async readRefund(key: string): Promise<MoneyResult> {
    return structuredClone(
      this.refunds.get(key)?.result ?? { status: "unknown" },
    );
  }
  private money(
    operations: Map<string, Operation>,
    command: CaptureCommand | RefundCommand,
    kind: string,
    failCapture = false,
  ): MoneyResult {
    if (
      !command.idempotencyKey ||
      command.currency !== "TWD" ||
      !Number.isSafeInteger(command.amountMinor) ||
      command.amountMinor < 0
    )
      throw new Error("Invalid synthetic payment operation.");
    const fingerprint = createHash("sha256")
      .update(JSON.stringify({ ...command, attemptCount: undefined }))
      .digest("hex");
    const existing = operations.get(command.idempotencyKey);
    if (existing) {
      if (existing.fingerprint !== fingerprint)
        throw new Error("Fake payment idempotency conflict.");
      if (
        !(
          this.review &&
          kind === "capture" &&
          existing.result.status === "failed" &&
          !failCapture
        )
      )
        return structuredClone(existing.result);
    }
    const result: MoneyResult = failCapture
      ? {
          status: "failed",
          error: "unavailable",
          retryable: true,
        }
      : {
          status: "completed",
          providerRef: `synthetic_${kind}_${createHash("sha256").update(command.idempotencyKey).digest("hex")}`,
        };
    operations.set(command.idempotencyKey, {
      fingerprint,
      amountMinor: command.amountMinor,
      captureRef: "captureRef" in command ? command.captureRef : null,
      result,
    });
    return structuredClone(result);
  }
}
