import type { IdempotencyExecutionResult } from "@drts/contracts";
import { IDEMPOTENCY_REPLAY_HEADER } from "@drts/contracts";

/**
 * Structural subset of Express's Response needed to set the idempotent-replay
 * status/header from a `@Res({ passthrough: true })` handler without taking a
 * hard dependency on `@types/express`.
 */
export interface PassthroughResponseLike {
  status(code: number): unknown;
  setHeader(name: string, value: string): unknown;
}

/**
 * Applies the CONF-IDEM-001 wire contract (stored status code, and
 * `X-Idempotent-Replay: true` on replay) to a passthrough Express response.
 */
export function applyIdempotentResponseHeaders(
  response: PassthroughResponseLike,
  result: Pick<IdempotencyExecutionResult<unknown>, "statusCode" | "isReplay">,
): void {
  response.status(result.statusCode);
  if (result.isReplay) {
    response.setHeader(IDEMPOTENCY_REPLAY_HEADER, "true");
  }
}
