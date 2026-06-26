import { describe, expect, it, vi } from "vitest";

import { type MiddlewareConfigProxy, RequestMethod } from "@nestjs/common";

import { AppModule } from "../../src/app.module";
import { InternalKeyMiddleware } from "../../src/common/auth";
import { TESLA_REGULATORY_EVENTS_ROUTE } from "../../src/modules/tesla-regulatory-events/tesla-regulatory-events.controller";

describe("AppModule middleware wiring", () => {
  it("excludes the Tesla regulatory callback from internal-key middleware", () => {
    const forRoutes = vi.fn();
    const exclude = vi.fn(() => ({
      forRoutes,
    })) as unknown as MiddlewareConfigProxy["exclude"];
    const apply = vi.fn(() => ({
      exclude,
    })) as unknown as MiddlewareConfigProxy["apply"];
    const consumer = { apply } as never;

    new AppModule().configure(consumer);

    expect(apply).toHaveBeenCalledWith(InternalKeyMiddleware);
    expect(exclude).toHaveBeenCalledWith(
      { path: "health", method: RequestMethod.ALL },
      { path: "api/health", method: RequestMethod.ALL },
      {
        path: TESLA_REGULATORY_EVENTS_ROUTE,
        method: RequestMethod.POST,
      },
      {
        path: `api/${TESLA_REGULATORY_EVENTS_ROUTE}`,
        method: RequestMethod.POST,
      },
    );
    expect(forRoutes).toHaveBeenCalledWith({
      path: "*",
      method: RequestMethod.ALL,
    });
  });
});
