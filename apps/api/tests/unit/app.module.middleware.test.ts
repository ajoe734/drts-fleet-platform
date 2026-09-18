import type { MiddlewareConsumer } from "@nestjs/common";
import { RequestMethod } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { AppModule } from "../../src/app.module";
import { InternalKeyMiddleware } from "../../src/common/auth/internal-key.middleware";

describe("AppModule internal auth middleware wiring", () => {
  it("excludes the auth token exchange route from the global internal key middleware", () => {
    const apply = vi.fn().mockReturnThis();
    const exclude = vi.fn().mockReturnThis();
    const forRoutes = vi.fn();
    const consumer = {
      apply,
      exclude,
      forRoutes,
    } as unknown as MiddlewareConsumer;

    new AppModule().configure(consumer);

    expect(apply).toHaveBeenCalledWith(InternalKeyMiddleware);
    expect(exclude).toHaveBeenCalledWith(
      { path: "health", method: RequestMethod.ALL },
      { path: "api/health", method: RequestMethod.ALL },
      { path: "auth/token", method: RequestMethod.POST },
      { path: "api/auth/token", method: RequestMethod.POST },
    );
    expect(forRoutes).toHaveBeenCalledWith({
      path: "*",
      method: RequestMethod.ALL,
    });
  });
});
