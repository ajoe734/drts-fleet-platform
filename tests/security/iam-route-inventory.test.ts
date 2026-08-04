import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import { resolveRouteAuthPolicy } from "../../apps/api/src/common/auth/auth.policy";

const ROOT_DIR = path.resolve(__dirname, "../../apps/api/src");
const SECURITY_CRITICAL_CONTROLLERS = [
  "modules/auth/auth.controller.ts",
  "modules/driver-profile/driver-profile.controller.ts",
  "modules/identity/identity.controller.ts",
  "modules/owned-mobility/owned-mobility.controller.ts",
  "modules/platform-admin/tenants.controller.ts",
  "modules/regulatory-registry/driver-heartbeat.controller.ts",
  "modules/regulatory-registry/ops-driver-tracking.controller.ts",
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
  if (!argument) {
    return "";
  }
  if (
    ts.isStringLiteral(argument) ||
    ts.isNoSubstitutionTemplateLiteral(argument)
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

describe("IAM security-critical route inventory", () => {
  it("classifies every security-critical controller route", () => {
    const { discovered, uncovered } = listSecurityRoutes();

    expect(discovered.length).toBeGreaterThan(40);
    expect(uncovered).toEqual([]);
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
});
