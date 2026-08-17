import type { ActionReceipt, IdempotencyRecord } from "@drts/contracts";

export interface CreateProcessingInput {
  scope: string;
  idempotencyKey: string;
  tenantId?: string | null | undefined;
  actorId?: string | null | undefined;
  requestPath?: string | null | undefined;
  payloadHash: string;
}

export interface CompleteIdempotencyInput {
  scope: string;
  idempotencyKey: string;
  statusCode: number;
  responseBody: unknown;
  actionReceipt?: ActionReceipt | null | undefined;
}

export interface FailIdempotencyInput {
  scope: string;
  idempotencyKey: string;
  errorMessage?: string | null | undefined;
}

export interface CreateProcessingResult {
  record: IdempotencyRecord;
  inserted: boolean;
}

export interface ExecuteIdempotentOptions<TResponse = unknown> {
  scope: string;
  idempotencyKey?: string | null | undefined;
  tenantId?: string | null | undefined;
  actorId?: string | null | undefined;
  requestPath?: string | null | undefined;
  required?: boolean | undefined;
  payload: unknown;
  execute: () => Promise<
    | {
        data: TResponse;
        statusCode?: number | undefined;
        actionReceipt?: ActionReceipt | null | undefined;
      }
    | TResponse
  >;
}
