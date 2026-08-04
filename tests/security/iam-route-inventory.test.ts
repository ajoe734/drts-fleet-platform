import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import { resolveRouteAuthPolicy } from "../../apps/api/src/common/auth/auth.policy";

const ROOT_DIR = path.resolve(__dirname, "../../apps/api/src");

/**
 * Walk the modules directory and collect all *.controller.ts paths relative to
 * ROOT_DIR (e.g. "modules/auth/auth.controller.ts").
 */
function getAllControllers(dir: string, prefix = ""): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const nextPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...getAllControllers(fullPath, nextPrefix));
    } else if (entry.isFile() && entry.name.endsWith(".controller.ts")) {
      result.push(nextPrefix);
    }
  }
  return result;
}

const SECURITY_CRITICAL_CONTROLLERS = [
  "modules/auth/auth.controller.ts",
  "modules/driver-profile/driver-profile.controller.ts",
  "modules/identity/identity.controller.ts",
  "modules/owned-mobility/owned-mobility.controller.ts",
  "modules/platform-admin/platform-admin.controller.ts",
  "modules/platform-admin/platform-admin-compliance.controller.ts",
  "modules/platform-admin/tenant-governance.controller.ts",
  "modules/platform-admin/tenants.controller.ts",
  "modules/regulatory-registry/driver-heartbeat.controller.ts",
  "modules/regulatory-registry/ops-driver-tracking.controller.ts",
  "modules/regulatory-registry/regulatory-registry.controller.ts",
  "modules/sandbox-governance/sandbox-governance.controller.ts",
  "modules/service-product/service-product.controller.ts",
  "modules/tenant-partner/tenant-partner.controller.ts",
] as const;
const HTTP_DECORATORS = new Map<string, string>([
  ["Get", "GET"],
  ["Post", "POST"],
  ["Put", "PUT"],
  ["Patch", "PATCH"],
  ["Delete", "DELETE"],
  ["Head", "HEAD"],
  ["Options", "OPTIONS"],
]);

function getDecorators(node: ts.Node): readonly ts.Decorator[] {
  if (ts.canHaveDecorators(node)) {
    return ts.getDecorators(node) ?? [];
  }
  return [];
}

function getDecoratorName(decorator: ts.Decorator): string {
  const expression = decorator.expression;
  return ts.isCallExpression(expression)
    ? expression.expression.getText()
    : expression.getText();
}

function getStringDecoratorArg(decorator: ts.Decorator): string {
  const expression = decorator.expression;
  if (!ts.isCallExpression(expression) || expression.arguments.length === 0) {
    return "";
  }
  const argument = expression.arguments[0];
  if (
    argument &&
    (ts.isStringLiteral(argument) ||
      ts.isNoSubstitutionTemplateLiteral(argument))
  ) {
    return argument.text;
  }
  return "";
}

function hasClassificationDecorator(node: ts.Node) {
  return getDecorators(node).some((decorator) =>
    ["OpenRoute", "RequireRealms", "RequireScopes"].includes(
      getDecoratorName(decorator),
    ),
  );
}

function normalizeRoutePath(controllerPath: string, methodPath: string) {
  const joined = [controllerPath, methodPath]
    .filter((segment) => segment && segment !== "/")
    .join("/");
  return `/${joined.replace(/^\/+|\/+$/g, "").replace(/\/+/g, "/")}`;
}

function loadSourceFile(filePath: string) {
  return ts.createSourceFile(
    filePath,
    readFileSync(filePath, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
}

function listSecurityRoutes() {
  const uncovered: string[] = [];
  const discovered: string[] = [];

  for (const relativePath of SECURITY_CRITICAL_CONTROLLERS) {
    const absolutePath = path.join(ROOT_DIR, relativePath);
    const sourceFile = loadSourceFile(absolutePath);

    for (const statement of sourceFile.statements) {
      if (!ts.isClassDeclaration(statement)) {
        continue;
      }
      const controllerDecorator = getDecorators(statement).find(
        (decorator) => getDecoratorName(decorator) === "Controller",
      );
      if (!controllerDecorator) {
        continue;
      }

      const controllerPath = getStringDecoratorArg(controllerDecorator);
      const classClassified = hasClassificationDecorator(statement);

      for (const member of statement.members) {
        if (!ts.isMethodDeclaration(member)) {
          continue;
        }

        const routeDecorator = getDecorators(member).find((decorator) =>
          HTTP_DECORATORS.has(getDecoratorName(decorator)),
        );
        if (!routeDecorator) {
          continue;
        }

        const decoratorName = getDecoratorName(routeDecorator);
        const method = HTTP_DECORATORS.get(decoratorName);
        if (!method) {
          continue;
        }

        const routePath = normalizeRoutePath(
          controllerPath,
          getStringDecoratorArg(routeDecorator),
        );
        const routeLabel = `${relativePath} :: ${method} ${routePath}`;
        discovered.push(routeLabel);

        const covered =
          classClassified ||
          hasClassificationDecorator(member) ||
          Boolean(resolveRouteAuthPolicy(method, routePath));
        if (!covered) {
          uncovered.push(routeLabel);
        }
      }
    }
  }

  return { discovered, uncovered };
}

/**
 * Check whether a controller file has at least one class-level or method-level
 * security classification decorator, or all its routes resolve via the
 * runtime auth policy table.
 */
function controllerHasSecurityClassification(relativePath: string): boolean {
  const absolutePath = path.join(ROOT_DIR, relativePath);
  const sourceFile = loadSourceFile(absolutePath);

  for (const statement of sourceFile.statements) {
    if (!ts.isClassDeclaration(statement)) {
      continue;
    }
    const controllerDecorator = getDecorators(statement).find(
      (decorator) => getDecoratorName(decorator) === "Controller",
    );
    if (!controllerDecorator) {
      continue;
    }

    if (hasClassificationDecorator(statement)) {
      return true;
    }

    const controllerPath = getStringDecoratorArg(controllerDecorator);

    // Check every HTTP route method
    let allMethodsCovered = true;
    let hasRoutes = false;
    for (const member of statement.members) {
      if (!ts.isMethodDeclaration(member)) {
        continue;
      }
      const routeDecorator = getDecorators(member).find((decorator) =>
        HTTP_DECORATORS.has(getDecoratorName(decorator)),
      );
      if (!routeDecorator) {
        continue;
      }
      hasRoutes = true;
      const decoratorName = getDecoratorName(routeDecorator);
      const method = HTTP_DECORATORS.get(decoratorName);
      if (!method) {
        allMethodsCovered = false;
        continue;
      }
      const routePath = normalizeRoutePath(
        controllerPath,
        getStringDecoratorArg(routeDecorator),
      );
      const covered =
        hasClassificationDecorator(member) ||
        Boolean(resolveRouteAuthPolicy(method, routePath));
      if (!covered) {
        allMethodsCovered = false;
      }
    }

    if (hasRoutes && allMethodsCovered) {
      return true;
    }
  }
  return false;
}

describe("IAM security-critical route inventory", () => {
  it("classifies every security-critical controller route including admin/service-products and admin/sandbox-governance", () => {
    const { discovered, uncovered } = listSecurityRoutes();

    expect(discovered.length).toBeGreaterThan(60);
    expect(uncovered).toEqual([]);

    const set = new Set(SECURITY_CRITICAL_CONTROLLERS as readonly string[]);
    expect(
      set.has("modules/service-product/service-product.controller.ts"),
    ).toBe(true);
    expect(
      set.has("modules/sandbox-governance/sandbox-governance.controller.ts"),
    ).toBe(true);
  });

  it("keeps the inventory rooted in the expected controller set", () => {
    const controllersOnDisk = new Set<string>();

    function walk(dir: string, prefix = "") {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const nextPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath, nextPrefix);
          continue;
        }
        if (entry.isFile() && entry.name.endsWith(".controller.ts")) {
          controllersOnDisk.add(nextPrefix);
        }
      }
    }

    walk(ROOT_DIR);

    for (const controller of SECURITY_CRITICAL_CONTROLLERS) {
      expect(controllersOnDisk.has(controller)).toBe(true);
    }
  });

  it("every controller on disk is either in the security-critical list or has inline security classification — no silent regressions", () => {
    // Dynamically discover all controllers to prevent silent coverage gaps when
    // new controllers are added without a security classification.
    const allControllersOnDisk = getAllControllers(ROOT_DIR);
    const securityCriticalSet = new Set<string>(SECURITY_CRITICAL_CONTROLLERS);

    const unclassifiedControllers: string[] = [];

    for (const relativePath of allControllersOnDisk) {
      if (securityCriticalSet.has(relativePath)) {
        // Already audited in the matrix above — skip
        continue;
      }
      // For non-matrix controllers, require that all routes are covered either
      // by inline decorators or the runtime auth-policy table.
      if (!controllerHasSecurityClassification(relativePath)) {
        unclassifiedControllers.push(relativePath);
      }
    }

    expect(
      unclassifiedControllers,
      "These controllers have HTTP routes with no security classification. " +
        "Either add them to SECURITY_CRITICAL_CONTROLLERS or annotate their " +
        "routes with @OpenRoute / @RequireRealms / @RequireScopes, or add " +
        "their routes to resolveRouteAuthPolicy().",
    ).toEqual([]);
  });
});
