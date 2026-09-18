import type { ActionReceipt } from "./index";

export const IDEMPOTENCY_KEY_REQUIRED = "IDEMPOTENCY_KEY_REQUIRED";
export const IDEMPOTENCY_KEY_REUSED = "IDEMPOTENCY_KEY_REUSED";
export const IDEMPOTENCY_CONFLICT = "IDEMPOTENCY_CONFLICT";
export const IDEMPOTENCY_IN_PROGRESS = "IDEMPOTENCY_IN_PROGRESS";
export const IDEMPOTENCY_KEY_TOO_LONG = "IDEMPOTENCY_KEY_TOO_LONG";

export const IDEMPOTENCY_ERROR_CODES = [
  IDEMPOTENCY_KEY_REQUIRED,
  IDEMPOTENCY_KEY_REUSED,
  IDEMPOTENCY_CONFLICT,
  IDEMPOTENCY_IN_PROGRESS,
  IDEMPOTENCY_KEY_TOO_LONG,
] as const;
export type IdempotencyErrorCode = (typeof IDEMPOTENCY_ERROR_CODES)[number];

export const IDEMPOTENCY_KEY_HEADER = "idempotency-key";
export const IDEMPOTENCY_REPLAY_HEADER = "x-idempotent-replay";

export const IDEMPOTENCY_STATUSES = [
  "processing",
  "completed",
  "failed",
] as const;
export type IdempotencyStatus = (typeof IDEMPOTENCY_STATUSES)[number];

export interface IdempotencyRecord<T = unknown> {
  recordId: string;
  scope: string;
  idempotencyKey: string;
  tenantId: string | null;
  actorId: string | null;
  requestPath: string | null;
  payloadHash: string;
  status: IdempotencyStatus;
  statusCode: number | null;
  responseBody: T | null;
  actionReceipt: ActionReceipt | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
}

export interface IdempotencyExecutionResult<T> {
  data: T;
  statusCode: number;
  isReplay: boolean;
  actionReceipt?: ActionReceipt | null | undefined;
}

export interface IdempotencyContext {
  scope: string;
  idempotencyKey?: string | null | undefined;
  tenantId?: string | null | undefined;
  actorId?: string | null | undefined;
  requestPath?: string | null | undefined;
  required?: boolean | undefined;
}
