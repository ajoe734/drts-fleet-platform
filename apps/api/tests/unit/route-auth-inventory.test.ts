import { describe, expect, it } from "vitest";

import {
  listControllerFiles,
  readCommittedAuthRouteInventory,
  renderAuthRouteInventoryMarkdown,
  routeSource,
  scanControllerRoutes,
} from "./route-auth-inventory.helper";
import { resolveOpenRouteInventoryEntry } from "../../src/common/auth/open-route.inventory";

describe("auth route inventory", () => {
  it("classifies every controller route", () => {
    const routes = scanControllerRoutes();
    const violations = routes.flatMap((route) => {
      const labels: string[] = [];
      const rendered = `${route.method} /${route.path} :: ${route.file}#${route.handlerName}`;
      const classification = routeSource(route);

      if (route.open && !classification.inventoryEntry) {
        labels.push("missing canonical open-route inventory entry");
      }

      if (!route.open && classification.inventoryEntry) {
        labels.push("matches canonical open-route inventory without @OpenRoute");
      }

      if (classification.classification === "unclassified") {
        labels.push("missing canonical auth policy catalog entry");
      }

      if (classification.classification === "conflict") {
        labels.push("open-route inventory conflict");
      }

      return labels.length === 0 ? [] : [`${rendered} — ${labels.join("; ")}`];
    });

    expect(violations).toEqual([]);
  });

  it("scans every controller file under apps/api/src", () => {
    const routeFiles = new Set(scanControllerRoutes().map((route) => route.file));
    expect([...routeFiles].sort((left, right) => left.localeCompare(right))).toEqual(
      listControllerFiles(),
    );
  });

  it("treats HEAD requests as GET for open-route inventory matching", () => {
    expect(resolveOpenRouteInventoryEntry("HEAD", "/api/health")).toMatchObject({
      method: "GET",
      path: "health",
    });
  });

  it("requires explicit rate-limit metadata for every open route", () => {
    const routes = scanControllerRoutes().filter((route) => route.open);
    const violations = routes.flatMap((route) => {
      const classification = routeSource(route);
      const rendered = `${route.method} /${route.path} :: ${route.file}#${route.handlerName}`;

      if (!classification.inventoryEntry) {
        return [`${rendered} — missing canonical open-route inventory entry`];
      }

      if (classification.inventoryEntry.rateLimitPolicy === "OPEN_ROUTE_RATE_LIMIT") {
        return route.throttleArgs.includes("OPEN_ROUTE_RATE_LIMIT")
          ? []
          : [`${rendered} — missing @Throttle(OPEN_ROUTE_RATE_LIMIT)`];
      }

      if (classification.inventoryEntry.rateLimitPolicy === "READ_HEAVY_RATE_LIMIT") {
        return route.throttleArgs.includes("READ_HEAVY_RATE_LIMIT")
          ? []
          : [`${rendered} — missing @Throttle(READ_HEAVY_RATE_LIMIT)`];
      }

      return route.skipThrottleArgs.includes("RATE_LIMIT_SKIP_DEFAULT")
        ? []
        : [`${rendered} — missing @SkipThrottle(RATE_LIMIT_SKIP_DEFAULT)`];
    });

    expect(violations).toEqual([]);
  });

  it("requires explicit data-exposure classifications for every open route", () => {
    const routes = scanControllerRoutes().filter((route) => route.open);
    const violations = routes.flatMap((route) => {
      const classification = routeSource(route);
      const rendered = `${route.method} /${route.path} :: ${route.file}#${route.handlerName}`;
      const dataExposure = classification.inventoryEntry?.dataExposure.trim() ?? "";

      return dataExposure.length > 0
        ? []
        : [`${rendered} — missing explicit open-route data exposure classification`];
    });

    expect(violations).toEqual([]);
  });

  it("matches the committed markdown inventory", () => {
    expect(readCommittedAuthRouteInventory()).toBe(
      renderAuthRouteInventoryMarkdown(),
    );
  });
});
