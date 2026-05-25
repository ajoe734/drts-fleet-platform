import { describe, expect, it, vi } from "vitest";
import { SnakeCaseInterceptor } from "./snake-case.interceptor";
import { ExecutionContext, CallHandler } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { of } from "rxjs";
import { SKIP_SNAKE_CASE_KEY } from "./skip-snake-case.decorator";

describe("SnakeCaseInterceptor", () => {
  it("should convert camelCase to snake_case if not skipped", async () => {
    const reflector = new Reflector();
    vi.spyOn(reflector, "get").mockReturnValue(false);
    const interceptor = new SnakeCaseInterceptor(reflector);

    const context = {
      getHandler: () => ({}),
    } as any as ExecutionContext;
    const next: CallHandler = {
      handle: () => of({ myKey: "value" }),
    };

    const observable = interceptor.intercept(context, next);
    const result = await observable.toPromise();
    expect(result).toEqual({ my_key: "value" });
  });

  it("should skip conversion if SkipSnakeCase metadata is present", async () => {
    const reflector = new Reflector();
    vi.spyOn(reflector, "get").mockImplementation((key: string) => {
      return key === SKIP_SNAKE_CASE_KEY;
    });
    const interceptor = new SnakeCaseInterceptor(reflector);

    const context = {
      getHandler: () => ({}),
    } as any as ExecutionContext;
    const next: CallHandler = {
      handle: () => of({ myKey: "value" }),
    };

    const observable = interceptor.intercept(context, next);
    const result = await observable.toPromise();
    expect(result).toEqual({ myKey: "value" });
  });
});
