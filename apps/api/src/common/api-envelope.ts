import { randomUUID } from "node:crypto";

import { HttpException } from "@nestjs/common";

import type { ApiSuccessEnvelope } from "@drts/contracts";

export interface ApiPageInfo {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

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

export function toApiListData<T>(
  items: T[],
  pageInfo?: Partial<ApiPageInfo>,
): {
  items: T[];
  pageInfo: ApiPageInfo;
} {
  const totalItems = pageInfo?.totalItems ?? items.length;
  const pageSize = pageInfo?.pageSize ?? (items.length > 0 ? items.length : 20);
  const page = pageInfo?.page ?? 1;
  const totalPages =
    pageInfo?.totalPages ??
    (totalItems > 0 ? Math.ceil(totalItems / pageSize) : 0);

  return {
    items,
    pageInfo: {
      page,
      pageSize,
      totalItems,
      totalPages,
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
