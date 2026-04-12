import { randomUUID } from "node:crypto";

import { HttpException } from "@nestjs/common";

import type { ApiSuccessEnvelope } from "@drts/contracts";

export function toApiSuccessEnvelope<T>(
  data: T,
  requestId?: string,
): ApiSuccessEnvelope<T> {
  return {
    data,
    meta: {
      requestId: requestId ?? randomUUID(),
      timestamp: new Date().toISOString(),
    },
  };
}

export function toApiErrorEnvelope(
  code: string,
  message: string,
  details?: Record<string, unknown>,
  retryable = false,
) {
  return {
    error: {
      code,
      message,
      details,
      retryable,
      traceId: randomUUID(),
    },
  };
}

export class ApiRequestError extends HttpException {
  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: Record<string, unknown>,
    retryable = false,
  ) {
    super(toApiErrorEnvelope(code, message, details, retryable), statusCode);
  }
}
