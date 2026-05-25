import { Test, TestingModule } from "@nestjs/testing";
import { Reflector } from "@nestjs/core";
import { HttpStatus } from "@nestjs/common";
import { lastValueFrom, of } from "rxjs";
import { describe, expect, it, vi, beforeEach } from "vitest";

import {
  ApiRequestError,
  toApiSuccessEnvelope,
} from "../../src/common/api-envelope";
import { SnakeCaseExceptionFilter } from "../../src/common/snake-case.exception-filter";
import { SnakeCaseInterceptor } from "../../src/common/snake-case.interceptor";
import { SKIP_SNAKE_CASE_KEY } from "../../src/common/skip-snake-case.decorator";

describe("snake_case runtime serialization", () => {
  let interceptor: SnakeCaseInterceptor;
  let reflector: Reflector;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SnakeCaseInterceptor,
        {
          provide: Reflector,
          useValue: {
            get: vi.fn((key: string) => {
              if (key === SKIP_SNAKE_CASE_KEY) {
                return false; // Default to not skipping for these tests
              }
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    interceptor = module.get<SnakeCaseInterceptor>(SnakeCaseInterceptor);
    reflector = module.get<Reflector>(Reflector);
  });

  it("serializes success envelopes through the global interceptor path", async () => {
    // Ensure reflector.get is called
    (reflector.get as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);

    const result = await lastValueFrom(
      interceptor.intercept({ getHandler: () => ({}) } as any, {
        handle: () =>
          of(toApiSuccessEnvelope({ orderId: "ORD-001" }, "req-wire-rt-001")),
      }),
    );

    expect(reflector.get).toHaveBeenCalledWith(SKIP_SNAKE_CASE_KEY, {});
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
