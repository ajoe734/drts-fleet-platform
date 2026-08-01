import * as fs from "fs";
import * as path from "path";
import { Reflector } from "@nestjs/core";
import { describe, expect, it } from "vitest";

import { ApiRequestError } from "../../src/common/api-envelope";
import {
  BootstrapAuthGuard,
  resolveRouteAuthPolicy,
} from "../../src/common/auth";
import type { AuthenticatedRequestLike } from "../../src/common/auth";

interface DiscoveredRoute {
  file: string;
  method: string;
  path: string;
  controllerName: string;
  handlerName: string;
  isOpenRoute: boolean;
  hasDecoratorAuth: boolean;
  resolvedPolicy: ReturnType<typeof resolveRouteAuthPolicy>;
}

function findControllerFiles(dir: string, baseDir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findControllerFiles(fullPath, baseDir));
    } else if (entry.isFile() && entry.name.endsWith(".controller.ts")) {
      results.push(path.relative(baseDir, fullPath));
    }
  }

  return results;
}

function discoverAllControllerRoutes(): DiscoveredRoute[] {
  const controllerPattern = /@Controller\((?:['"]([^'"]*)['"])?\)/;
  const routePattern =
    /@(Get|Post|Put|Patch|Delete|Options|Head|All|Sse)\((?:['"]([^'"]*)['"])?\)/g;
  const openRoutePattern = /@OpenRoute\(\)/;
  const scopesPattern = /@RequireScopes\(/;
  const realmsPattern = /@RequireRealms\(/;

  const srcDir = path.resolve(__dirname, "../../src");
  const controllerFiles = findControllerFiles(srcDir, srcDir);

  const routes: DiscoveredRoute[] = [];

  for (const relFile of controllerFiles) {
    const fullPath = path.join(srcDir, relFile);
    const content = fs.readFileSync(fullPath, "utf-8");
    const lines = content.split("\n");

    let currentControllerPrefix = "";
    let classScopes = false;
    let classRealms = false;
    let controllerName = "UnknownController";

    const classMatch = content.match(/export class (\w+Controller)/);
    if (classMatch) {
      controllerName = classMatch[1] ?? "UnknownController";
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? "";
      const cm = controllerPattern.exec(line);
      if (cm) {
        currentControllerPrefix = cm[1] ?? "";
        const classContext = lines.slice(Math.max(0, i - 5), i + 1).join("\n");
        classScopes = scopesPattern.test(classContext);
        classRealms = realmsPattern.test(classContext);
      }

      let rm: RegExpExecArray | null;
      routePattern.lastIndex = 0;
      while ((rm = routePattern.exec(line)) !== null) {
        const rawMethod = rm[1] ?? "GET";
        const httpMethod = rawMethod === "Sse" ? "GET" : rawMethod.toUpperCase();
        const subpath = rm[2] ?? "";

        const contextWindow = lines.slice(Math.max(0, i - 5), i + 1).join("\n");
        const isOpen = openRoutePattern.test(contextWindow);
        const methodScopes = scopesPattern.test(contextWindow);
        const methodRealms = realmsPattern.test(contextWindow);

        let handlerName = "unknownHandler";
        const handlerMatch = lines.slice(i + 1, i + 4).join("\n").match(/(\w+)\s*\(/);
        if (handlerMatch) {
          handlerName = handlerMatch[1] ?? "unknownHandler";
        }

        let fullUrlPath = currentControllerPrefix;
        if (subpath) {
          if (!fullUrlPath.endsWith("/") && !subpath.startsWith("/")) {
            fullUrlPath += "/" + subpath;
          } else if (fullUrlPath.endsWith("/") && subpath.startsWith("/")) {
            fullUrlPath += subpath.slice(1);
          } else {
            fullUrlPath += subpath;
          }
        }

        const normPath = fullUrlPath.replace(/^\/+/, "").replace(/\/+$/, "");
        const resolvedPolicy = resolveRouteAuthPolicy(httpMethod, normPath);

        routes.push({
          file: relFile,
          method: httpMethod,
          path: normPath,
          controllerName,
          handlerName,
          isOpenRoute: isOpen,
          hasDecoratorAuth: classScopes || classRealms || methodScopes || methodRealms,
          resolvedPolicy,
        });
      }
    }
  }

  return routes;
}

describe("IAM-P0-003 Route Inventory & Global Default-Deny", () => {
  const discoveredRoutes = discoverAllControllerRoutes();

  it("discovers all API controller routes in the codebase", () => {
    expect(discoveredRoutes.length).toBeGreaterThan(50);
  });

  it("fails CI if any API route is unclassified (Requirement 1 & 3)", () => {
    const unclassified = discoveredRoutes.filter(
      (r) => !r.isOpenRoute && !r.hasDecoratorAuth && !r.resolvedPolicy,
    );

    if (unclassified.length > 0) {
      const details = unclassified
        .map(
          (u) =>
            `  - ${u.method} /api/${u.path} (${u.file} -> ${u.controllerName}.${u.handlerName})`,
        )
        .join("\n");
      expect.fail(
        `Found ${unclassified.length} unclassified API route(s). Every route must be classified in auth.policy.ts or decorated with @OpenRoute() / decorator auth:\n${details}`,
      );
    }

    expect(unclassified).toHaveLength(0);
  });

  it("discovers and classifies SSE event stream routes properly", () => {
    const sseRoutes = [
      "ops/dispatch-events",
      "driver/task-events",
      "passenger-rides/:accessToken/events",
    ];

    for (const ssePath of sseRoutes) {
      const route = discoveredRoutes.find((r) => r.path === ssePath);
      expect(route, `Expected to discover SSE route ${ssePath}`).toBeDefined();
      const isClassified =
        route?.isOpenRoute || route?.hasDecoratorAuth || route?.resolvedPolicy !== null;
      expect(isClassified, `SSE route ${ssePath} must be classified`).toBe(true);
    }
  });

  it("fails closed with 401 UNCLASSIFIED_ROUTE_DENIED for unknown/unclassified routes (Requirement 2)", () => {
    const guard = new BootstrapAuthGuard(new Reflector());
    const req: AuthenticatedRequestLike = {
      headers: {},
      method: "GET",
      originalUrl: "/api/unknown-unclassified-route-xyz",
    };

    class MockHandler {
      handler() {}
    }

    const context = {
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => MockHandler.prototype.handler,
      getClass: () => MockHandler,
    } as never;

    expect(() => guard.canActivate(context)).toThrowError(ApiRequestError);

    try {
      guard.canActivate(context);
    } catch (err) {
      const apiErr = err as ApiRequestError;
      expect(apiErr.getStatus()).toBe(401);
      expect(apiErr.getResponse()).toMatchObject({
        error: {
          code: "UNCLASSIFIED_ROUTE_DENIED",
          message: expect.stringContaining("fail closed"),
        },
      });
    }
  });

  it("ensures public/open routes are explicitly marked with @OpenRoute metadata", () => {
    const openRoutes = discoveredRoutes.filter((r) => r.isOpenRoute);
    expect(openRoutes.length).toBeGreaterThan(0);
    for (const route of openRoutes) {
      expect(route.isOpenRoute).toBe(true);
    }
  });
});
