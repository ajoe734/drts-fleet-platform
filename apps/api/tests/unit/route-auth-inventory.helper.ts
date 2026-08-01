import fs from "node:fs";
import path from "node:path";

import ts from "typescript";

import { resolveRouteAuthPolicy } from "../../src/common/auth/auth.policy";
import {
  OPEN_ROUTE_INVENTORY,
  resolveOpenRouteInventoryEntry,
} from "../../src/common/auth/open-route.inventory";

type RouteDecoratorName =
  | "Get"
  | "Post"
  | "Put"
  | "Patch"
  | "Delete"
  | "Options"
  | "Head"
  | "All"
  | "Sse";

const HTTP_DECORATORS = new Set<RouteDecoratorName>([
  "Get",
  "Post",
  "Put",
  "Patch",
  "Delete",
  "Options",
  "Head",
  "All",
  "Sse",
]);

const REPO_ROOT = path.resolve(__dirname, "../../../..");
const API_SRC_ROOT = path.join(REPO_ROOT, "apps/api/src");
const AUTH_ROUTE_DOC = path.join(
  REPO_ROOT,
  "docs/02-architecture/auth-route-inventory.md",
);

interface ParsedDecorator {
  name: string;
  args: readonly ts.Expression[];
}

interface ScannedRoute {
  method: string;
  path: string;
  sampleUrl: string;
  file: string;
  controllerName: string;
  handlerName: string;
  open: boolean;
  hasScopes: boolean;
  hasRealms: boolean;
  throttleArgs: string[];
  skipThrottleArgs: string[];
}

function walkControllerFiles(dir: string, output: string[]) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const resolved = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkControllerFiles(resolved, output);
      continue;
    }
    if (entry.isFile() && resolved.endsWith(".controller.ts")) {
      output.push(resolved);
    }
  }
}

function stringsFromArg(arg: ts.Expression | undefined): string[] {
  if (!arg) {
    return [""];
  }
  if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) {
    return [arg.text];
  }
  if (ts.isArrayLiteralExpression(arg)) {
    return arg.elements
      .filter(
        (
          element,
        ): element is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral =>
          ts.isStringLiteral(element) ||
          ts.isNoSubstitutionTemplateLiteral(element),
      )
      .map((element) => element.text);
  }
  return ["<dynamic>"];
}

function parseDecorator(decorator: ts.Decorator): ParsedDecorator {
  const expression = decorator.expression;
  if (ts.isCallExpression(expression)) {
    const callee = expression.expression;
    const name = ts.isIdentifier(callee)
      ? callee.text
      : ts.isPropertyAccessExpression(callee)
        ? callee.name.text
        : "";
    return { name, args: expression.arguments };
  }
  return {
    name: ts.isIdentifier(expression) ? expression.text : "",
    args: [],
  };
}

function joinRoutePath(controllerPath: string, handlerPath: string) {
  return [controllerPath, handlerPath]
    .filter(Boolean)
    .map((segment) => segment.replace(/^\/+|\/+$/g, ""))
    .join("/");
}

function toSamplePath(routePath: string) {
  return routePath.replace(/:([^/]+)/g, "$1-sample");
}

export function routeSource(route: ScannedRoute) {
  const inventoryEntry = resolveOpenRouteInventoryEntry(route.method, route.sampleUrl);
  const policy = resolveRouteAuthPolicy(route.method, route.sampleUrl);

  if (route.open) {
    return {
      inventoryEntry,
      policy,
      classification: inventoryEntry ? "open" : "invalid-open",
      authSource: "open-route inventory",
    } as const;
  }

  if (inventoryEntry) {
    return {
      inventoryEntry,
      policy,
      classification: "conflict",
      authSource: "open-route inventory without decorator",
    } as const;
  }

  if (policy && (route.hasScopes || route.hasRealms)) {
    return {
      inventoryEntry,
      policy,
      classification: "protected",
      authSource: "policy catalog + decorators",
    } as const;
  }

  if (policy) {
    return {
      inventoryEntry,
      policy,
      classification: "protected",
      authSource: "policy catalog",
    } as const;
  }

  if (route.hasScopes || route.hasRealms) {
    return {
      inventoryEntry,
      policy,
      classification: "protected",
      authSource: "decorators",
    } as const;
  }

  return {
    inventoryEntry,
    policy,
    classification: "unclassified",
    authSource: "missing",
  } as const;
}

export function scanControllerRoutes(): ScannedRoute[] {
  const controllerFiles: string[] = [];
  walkControllerFiles(path.join(API_SRC_ROOT, "modules"), controllerFiles);
  walkControllerFiles(path.join(API_SRC_ROOT, "health"), controllerFiles);

  const routes: ScannedRoute[] = [];

  for (const controllerFile of controllerFiles) {
    const source = ts.createSourceFile(
      controllerFile,
      fs.readFileSync(controllerFile, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );

    ts.forEachChild(source, (node) => {
      if (!ts.isClassDeclaration(node)) {
        return;
      }

      const classDecorators = (ts.canHaveDecorators(node)
        ? ts.getDecorators(node)
        : []) ?? [];
      const parsedClassDecorators = classDecorators.map(parseDecorator);
      const controllerDecorator = parsedClassDecorators.find(
        (decorator) => decorator.name === "Controller",
      );
      if (!controllerDecorator) {
        return;
      }

      const controllerPaths = stringsFromArg(controllerDecorator.args[0]);
      const classOpen = parsedClassDecorators.some(
        (decorator) => decorator.name === "OpenRoute",
      );
      const classScopes = parsedClassDecorators.some(
        (decorator) => decorator.name === "RequireScopes",
      );
      const classRealms = parsedClassDecorators.some(
        (decorator) => decorator.name === "RequireRealms",
      );
      const classThrottleArgs = parsedClassDecorators
        .filter((decorator) => decorator.name === "Throttle")
        .map((decorator) => decorator.args[0]?.getText(source) ?? "");
      const classSkipThrottleArgs = parsedClassDecorators
        .filter((decorator) => decorator.name === "SkipThrottle")
        .map((decorator) => decorator.args[0]?.getText(source) ?? "");

      for (const member of node.members) {
        if (!ts.isMethodDeclaration(member)) {
          continue;
        }

        const methodDecorators = (ts.canHaveDecorators(member)
          ? ts.getDecorators(member)
          : []) ?? [];
        const parsedMethodDecorators = methodDecorators.map(parseDecorator);
        const routeDecorator = parsedMethodDecorators.find((decorator) =>
          HTTP_DECORATORS.has(decorator.name as RouteDecoratorName),
        );
        if (!routeDecorator) {
          continue;
        }

        const handlerPaths = stringsFromArg(routeDecorator.args[0]);
        const method =
          routeDecorator.name === "All"
            ? "ALL"
            : routeDecorator.name === "Sse"
              ? "GET"
            : routeDecorator.name.toUpperCase();
        const methodOpen = parsedMethodDecorators.some(
          (decorator) => decorator.name === "OpenRoute",
        );
        const methodScopes = parsedMethodDecorators.some(
          (decorator) => decorator.name === "RequireScopes",
        );
        const methodRealms = parsedMethodDecorators.some(
          (decorator) => decorator.name === "RequireRealms",
        );
        const methodThrottleArgs = parsedMethodDecorators
          .filter((decorator) => decorator.name === "Throttle")
          .map((decorator) => decorator.args[0]?.getText(source) ?? "");
        const methodSkipThrottleArgs = parsedMethodDecorators
          .filter((decorator) => decorator.name === "SkipThrottle")
          .map((decorator) => decorator.args[0]?.getText(source) ?? "");

        for (const controllerPath of controllerPaths) {
          for (const handlerPath of handlerPaths) {
            const routePath = joinRoutePath(controllerPath, handlerPath);
            const samplePath = toSamplePath(routePath);
            routes.push({
              method,
              path: routePath || "",
              sampleUrl: `/api/${samplePath}`,
              file: path.relative(REPO_ROOT, controllerFile),
              controllerName: node.name?.text ?? "AnonymousController",
              handlerName: member.name.getText(source),
              open: classOpen || methodOpen,
              hasScopes: classScopes || methodScopes,
              hasRealms: classRealms || methodRealms,
              throttleArgs: [...classThrottleArgs, ...methodThrottleArgs],
              skipThrottleArgs: [
                ...classSkipThrottleArgs,
                ...methodSkipThrottleArgs,
              ],
            });
          }
        }
      }
    });
  }

  return routes.sort((left, right) => {
    const byPath = left.path.localeCompare(right.path);
    if (byPath !== 0) {
      return byPath;
    }
    return left.method.localeCompare(right.method);
  });
}

export function renderAuthRouteInventoryMarkdown(routes = scanControllerRoutes()) {
  const openRoutes = routes.filter(
    (route) => routeSource(route).classification === "open",
  );
  const protectedRoutes = routes.filter(
    (route) => routeSource(route).classification === "protected",
  );

  const header = [
    "# API Route Inventory",
    "",
    "Canonical inventory for `IAM-P0-003`. This file is derived from controller decorators plus the auth policy catalog and is checked in CI.",
    "",
    `- Total routes: ${routes.length}`,
    `- Open routes: ${openRoutes.length}`,
    `- Protected routes: ${protectedRoutes.length}`,
    `- Canonical open-route entries: ${OPEN_ROUTE_INVENTORY.length}`,
    "",
    "## Open Routes",
    "",
    "| Method | Path | Rate Limit | Data Exposure | Description |",
    "| --- | --- | --- | --- | --- |",
  ];

  const openRows = OPEN_ROUTE_INVENTORY.map(
    (entry) =>
      `| ${entry.method} | \`/${entry.path}\` | \`${entry.rateLimitPolicy}\` | ${entry.dataExposure} | ${entry.description} |`,
  );

  const inventoryHeader = [
    "",
    "## Full Inventory",
    "",
    "| Method | Path | Classification | Auth Source | Controller | Handler |",
    "| --- | --- | --- | --- | --- | --- |",
  ];

  const inventoryRows = routes.map((route) => {
    const classification = routeSource(route);
    return `| ${route.method} | \`/${route.path}\` | ${classification.classification} | ${classification.authSource} | ${route.file}#${route.controllerName} | ${route.handlerName} |`;
  });

  return [...header, ...openRows, ...inventoryHeader, ...inventoryRows, ""].join(
    "\n",
  );
}

export function readCommittedAuthRouteInventory() {
  return fs.readFileSync(AUTH_ROUTE_DOC, "utf8");
}

if (process.argv[1]?.endsWith("route-auth-inventory.helper.ts")) {
  process.stdout.write(renderAuthRouteInventoryMarkdown());
}
