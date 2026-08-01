import "reflect-metadata";
import { Reflector } from "@nestjs/core";
import {
  THROTTLER_LIMIT,
  THROTTLER_SKIP,
} from "@nestjs/throttler/dist/throttler.constants";
import { beforeAll, describe, expect, it } from "vitest";

import {
  AUTH_OPEN_ROUTE_KEY,
  BootstrapAuthGuard,
} from "../../src/common/auth";
import { buildHealthPayload } from "../../src/health/health.controller";

import * as fs from "fs";
import * as path from "path";

interface DiscoveredOpenRoute {
  name: string;
  class: abstract new (...args: any[]) => any;
  method: string;
}

function findControllerFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findControllerFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".controller.ts")) {
      results.push(fullPath);
    }
  }

  return results;
}

async function discoverAllOpenRoutes(): Promise<DiscoveredOpenRoute[]> {
  const reflector = new Reflector();
  const srcDir = path.resolve(__dirname, "../../src");
  const controllerFiles = findControllerFiles(srcDir);
  const openRoutes: DiscoveredOpenRoute[] = [];

  for (const fullPath of controllerFiles) {
    const mod = await import(fullPath);
    for (const exportName of Object.keys(mod)) {
      const ControllerClass = mod[exportName];
      if (
        typeof ControllerClass === "function" &&
        ControllerClass.prototype &&
        (exportName.endsWith("Controller") || ControllerClass.name.endsWith("Controller"))
      ) {
        const propNames = Object.getOwnPropertyNames(ControllerClass.prototype);
        for (const prop of propNames) {
          if (prop === "constructor") continue;
          const handler = ControllerClass.prototype[prop];
          if (typeof handler !== "function") continue;

          const isOpen = reflector.getAllAndOverride<boolean>(AUTH_OPEN_ROUTE_KEY, [
            handler,
            ControllerClass,
          ]);

          if (isOpen) {
            openRoutes.push({
              name: `${ControllerClass.name}.${prop}`,
              class: ControllerClass,
              method: prop,
            });
          }
        }
      }
    }
  }

  return openRoutes;
}

describe("IAM-P0-003 Open Routes Rate & Data Exposure Tests (Requirement 4)", () => {
  const reflector = new Reflector();
  let openRouteTargets: DiscoveredOpenRoute[] = [];

  beforeAll(async () => {
    openRouteTargets = await discoverAllOpenRoutes();
  });

  function createOpenRouteContext(
    targetClass: abstract new (...args: any[]) => any,
    methodName: string,
  ) {
    const handler = (targetClass.prototype as Record<string, any>)[methodName];
    if (typeof handler !== "function") {
      throw new Error(
        `Handler ${methodName} on ${targetClass.name} is not a function`,
      );
    }
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: {},
          method: "GET",
          originalUrl: "/api/test-open-route",
        }),
      }),
      getHandler: () => handler,
      getClass: () => targetClass,
    } as never;
  }

  it("dynamically discovers open routes and verifies count > 0", () => {
    expect(openRouteTargets.length).toBeGreaterThan(0);
  });

  it("verifies all registered open routes carry explicit @OpenRoute metadata", () => {
    for (const item of openRouteTargets) {
      const handler = item.class.prototype[item.method];
      expect(typeof handler, `Handler ${item.method} on ${item.name} must exist`).toBe("function");
      const isOpen = reflector.getAllAndOverride<boolean>(AUTH_OPEN_ROUTE_KEY, [
        handler,
        item.class,
      ]);
      expect(isOpen, `${item.name} must be decorated with @OpenRoute()`).toBe(true);
    }
  });

  it("verifies all open routes carry explicit rate-limiting throttle controls (@Throttle or @SkipThrottle)", () => {
    for (const item of openRouteTargets) {
      const handler = item.class.prototype[item.method];
      const handlerLimit = Reflect.getMetadata(THROTTLER_LIMIT + "default", handler);
      const classLimit = Reflect.getMetadata(THROTTLER_LIMIT + "default", item.class);
      const handlerSkip = Reflect.getMetadata(THROTTLER_SKIP + "default", handler);
      const classSkip = Reflect.getMetadata(THROTTLER_SKIP + "default", item.class);

      const hasThrottleLimit = typeof handlerLimit === "number" || typeof classLimit === "number";
      const hasSkipThrottle = handlerSkip === true || classSkip === true;

      expect(
        hasThrottleLimit || hasSkipThrottle,
        `Open route ${item.name} must be explicitly decorated with @Throttle(...) or @SkipThrottle(...)`,
      ).toBe(true);
    }
  });

  it("verifies Health payload does not expose sensitive credentials or secrets", () => {
    const payload = buildHealthPayload();
    expect(payload).toHaveProperty("service", "api");
    expect(payload).toHaveProperty("status", "ok");
    expect(payload).not.toHaveProperty("JWT_SECRET");
    expect(payload).not.toHaveProperty("DRTS_INTERNAL_KEY");
    expect(payload).not.toHaveProperty("DATABASE_URL");
    const payloadStr = JSON.stringify(payload);
    expect(payloadStr).not.toContain("secret");
    expect(payloadStr).not.toContain("password");
  });

  it("ensures BootstrapAuthGuard allows unauthenticated access to @OpenRoute handlers", () => {
    const guard = new BootstrapAuthGuard(reflector);

    for (const item of openRouteTargets) {
      const context = createOpenRouteContext(item.class, item.method);
      expect(guard.canActivate(context)).toBe(true);
    }
  });
});

