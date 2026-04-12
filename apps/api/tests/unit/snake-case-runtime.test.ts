import { HttpStatus, type ArgumentsHost } from "@nestjs/common";
import { lastValueFrom, of } from "rxjs";
import { describe, expect, it, vi } from "vitest";

import {
  ApiRequestError,
  toApiSuccessEnvelope,
} from "../../src/common/api-envelope";
import { SnakeCaseExceptionFilter } from "../../src/common/snake-case.exception-filter";
import { SnakeCaseInterceptor } from "../../src/common/snake-case.interceptor";

describe("snake_case runtime serialization", () => {
  it("serializes success envelopes through the global interceptor path", async () => {
    const interceptor = new SnakeCaseInterceptor();

    const result = await lastValueFrom(
      interceptor.intercept({} as never, {
        handle: () =>
          of(toApiSuccessEnvelope({ orderId: "ORD-001" }, "req-wire-rt-001")),
      }),
    );

    expect(result).toEqual({
      data: {
        order_id: "ORD-001",
      },
      meta: {
        request_id: "req-wire-rt-001",
        timestamp: expect.any(String),
      },
    });
  });

  it("serializes ApiRequestError responses through the global exception filter path", () => {
    const filter = new SnakeCaseExceptionFilter();
    const response = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
      }),
    } as ArgumentsHost;

    filter.catch(
      new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "ORDER_NOT_MODIFIABLE",
        "The order can no longer be modified.",
        { orderId: "ORD-001" },
      ),
      host,
    );

    expect(response.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(response.json).toHaveBeenCalledWith({
      error: {
        code: "ORDER_NOT_MODIFIABLE",
        message: "The order can no longer be modified.",
        details: {
          order_id: "ORD-001",
        },
        retryable: false,
        trace_id: expect.any(String),
      },
    });
  });
});
