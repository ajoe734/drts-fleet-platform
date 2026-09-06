import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import {
  IAM_ACTOR_POLICY_DEFINITIONS,
  getIamScopeDefinition,
  isKnownIamScope,
} from "@drts/contracts";
import { resolveRouteAuthPolicy } from "../../apps/api/src/common/auth/auth.policy";

const ROOT_DIR = path.resolve(__dirname, "../../apps/api/src");

const HTTP_DECORATORS = new Map<string, string>([
  ["Get", "GET"],
  ["Post", "POST"],
  ["Put", "PUT"],
  ["Patch", "PATCH"],
  ["Delete", "DELETE"],
  ["Head", "HEAD"],
  ["Options", "OPTIONS"],
  ["Sse", "GET"],
]);

export interface DiscoveredRoute {
  file: string;
  controller: string;
  methodName: string;
  httpMethod: string;
  routePath: string;
  routeLabel: string;
  effectiveOpen: boolean;
  effectiveRealms: string[];
  effectiveScopes: string[];
  hasCentralPolicy: boolean;
  isClassified: boolean;
}

export interface InventoryResult {
  controllersDiscovered: string[];
  routesDiscovered: DiscoveredRoute[];
  uncoveredRoutes: DiscoveredRoute[];
  unknownScopes: Array<{
    file: string;
    controller: string;
    methodName: string;
    scope: string;
    routePath: string;
  }>;
  realmMismatches: Array<{
    file: string;
    controller: string;
    methodName: string;
    scope: string;
    realm: string;
    allowedRealms: readonly string[];
    routePath: string;
  }>;
}

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
  if (argument && ts.isObjectLiteralExpression(argument)) {
    for (const prop of argument.properties) {
      if (
        ts.isPropertyAssignment(prop) &&
        prop.name.getText() === "path" &&
        (ts.isStringLiteral(prop.initializer) ||
          ts.isNoSubstitutionTemplateLiteral(prop.initializer))
      ) {
        return prop.initializer.text;
      }
    }
  }
  return "";
}

function getArrayDecoratorArgs(decorator: ts.Decorator): string[] {
  const expression = decorator.expression;
  if (!ts.isCallExpression(expression)) {
    return [];
  }
  const args: string[] = [];
  for (const argument of expression.arguments) {
    if (
      ts.isStringLiteral(argument) ||
      ts.isNoSubstitutionTemplateLiteral(argument)
    ) {
      args.push(argument.text);
    } else if (ts.isArrayLiteralExpression(argument)) {
      for (const element of argument.elements) {
        if (
          ts.isStringLiteral(element) ||
          ts.isNoSubstitutionTemplateLiteral(element)
        ) {
          args.push(element.text);
        }
      }
    }
  }
  return args;
}

function normalizeRoutePath(
  controllerPath: string,
  methodPath: string,
): string {
  const joined = [controllerPath, methodPath]
    .filter((segment) => segment && segment !== "/")
    .join("/");
  return `/${joined.replace(/^\/+|\/+$/g, "").replace(/\/+/g, "/")}`;
}

export function discoverControllersRecursively(dir: string): string[] {
  const results: string[] = [];

  function walk(currentDir: string) {
    for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".controller.ts")) {
        results.push(fullPath);
      }
    }
  }

  walk(dir);
  return results.sort();
}

export function analyzeSourceFile(
  sourceFile: ts.SourceFile,
  relativePath: string,
): {
  routes: DiscoveredRoute[];
  unknownScopes: InventoryResult["unknownScopes"];
  realmMismatches: InventoryResult["realmMismatches"];
} {
  const routes: DiscoveredRoute[] = [];
  const unknownScopes: InventoryResult["unknownScopes"] = [];
  const realmMismatches: InventoryResult["realmMismatches"] = [];

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

    const controllerName = statement.name
      ? statement.name.getText(sourceFile)
      : "AnonymousController";
    const controllerPath = getStringDecoratorArg(controllerDecorator);

    const classRealmsDec = getDecorators(statement).find(
      (d) => getDecoratorName(d) === "RequireRealms",
    );
    const classScopesDec = getDecorators(statement).find(
      (d) => getDecoratorName(d) === "RequireScopes",
    );
    const classOpenDec = getDecorators(statement).find(
      (d) => getDecoratorName(d) === "OpenRoute",
    );

    const classRealms = classRealmsDec
      ? getArrayDecoratorArgs(classRealmsDec)
      : [];
    const classScopes = classScopesDec
      ? getArrayDecoratorArgs(classScopesDec)
      : [];
    const isClassOpen = Boolean(classOpenDec);

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
      const httpMethod = HTTP_DECORATORS.get(decoratorName);
      if (!httpMethod) {
        continue;
      }

      const methodName = member.name.getText(sourceFile);
      const methodPath = getStringDecoratorArg(routeDecorator);
      const routePath = normalizeRoutePath(controllerPath, methodPath);
      const routeLabel = `${relativePath} :: ${controllerName}#${methodName} :: ${httpMethod} ${routePath}`;

      const methodRealmsDec = getDecorators(member).find(
        (d) => getDecoratorName(d) === "RequireRealms",
      );
      const methodScopesDec = getDecorators(member).find(
        (d) => getDecoratorName(d) === "RequireScopes",
      );
      const methodOpenDec = getDecorators(member).find(
        (d) => getDecoratorName(d) === "OpenRoute",
      );

      const methodRealms = methodRealmsDec
        ? getArrayDecoratorArgs(methodRealmsDec)
        : [];
      const methodScopes = methodScopesDec
        ? getArrayDecoratorArgs(methodScopesDec)
        : [];
      const isMethodOpen = Boolean(methodOpenDec);

      const effectiveRealms =
        methodRealms.length > 0 ? methodRealms : classRealms;
      const effectiveScopes =
        methodScopes.length > 0 ? methodScopes : classScopes;
      const effectiveOpen = isMethodOpen || isClassOpen;

      const centralPolicy = resolveRouteAuthPolicy(httpMethod, routePath);

      const isClassified =
        effectiveOpen ||
        effectiveRealms.length > 0 ||
        effectiveScopes.length > 0 ||
        Boolean(centralPolicy);

      routes.push({
        file: relativePath,
        controller: controllerName,
        methodName,
        httpMethod,
        routePath,
        routeLabel,
        effectiveOpen,
        effectiveRealms,
        effectiveScopes,
        hasCentralPolicy: Boolean(centralPolicy),
        isClassified,
      });

      // Scope validation against IAM catalogue
      const declaredScopes = [...new Set([...classScopes, ...methodScopes])];
      for (const scope of declaredScopes) {
        if (!isKnownIamScope(scope)) {
          unknownScopes.push({
            file: relativePath,
            controller: controllerName,
            methodName,
            scope,
            routePath,
          });
        }
      }

      // Realm compatibility against IAM catalogue scope definitions
      for (const scope of declaredScopes) {
        const scopeDef = getIamScopeDefinition(scope);
        if (scopeDef) {
          for (const realm of effectiveRealms) {
            if (!scopeDef.allowedRealms.includes(realm as never)) {
              realmMismatches.push({
                file: relativePath,
                controller: controllerName,
                methodName,
                scope,
                realm,
                allowedRealms: scopeDef.allowedRealms,
                routePath,
              });
            }
          }
        }
      }
    }
  }

  return { routes, unknownScopes, realmMismatches };
}

export function runDynamicRouteInventory(
  rootDir: string = ROOT_DIR,
): InventoryResult {
  const controllerFiles = discoverControllersRecursively(rootDir);
  const routesDiscovered: DiscoveredRoute[] = [];
  const uncoveredRoutes: DiscoveredRoute[] = [];
  const unknownScopes: InventoryResult["unknownScopes"] = [];
  const realmMismatches: InventoryResult["realmMismatches"] = [];

  for (const filePath of controllerFiles) {
    const relativePath = path.relative(rootDir, filePath);
    const sourceText = readFileSync(filePath, "utf8");
    const sourceFile = ts.createSourceFile(
      filePath,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );

    const result = analyzeSourceFile(sourceFile, relativePath);
    for (const route of result.routes) {
      routesDiscovered.push(route);
      if (!route.isClassified) {
        uncoveredRoutes.push(route);
      }
    }
    unknownScopes.push(...result.unknownScopes);
    realmMismatches.push(...result.realmMismatches);
  }

  return {
    controllersDiscovered: controllerFiles.map((f) =>
      path.relative(rootDir, f),
    ),
    routesDiscovered,
    uncoveredRoutes,
    unknownScopes,
    realmMismatches,
  };
}

/**
 * Known pre-existing scope defects discovered in controllers outside the 4 Wave A route groups.
 *
 * Per SD §6 and runbook execution prompt, verification tasks do not author de novo
 * authorization catalog decisions or change policies to make tests pass; defects
 * are explicitly isolated and tracked here until their owning feature tasks land reviewed
 * catalog definitions and grants.
 *
 * Retired: multi_taxi_records:read/export (FIX-P5-RECORDS-001) and
 * assistant:write / identity:break-glass:request|approve|activate
 * (FIX-IAM-UNGRANTABLE-002) now carry catalog definitions and
 * system/platform_admin/ops_user(/tenant_admin) grants (IAM_SCOPE_DEFINITIONS,
 * IAM_ACTOR_POLICY_DEFINITIONS). An allowlisted scope is unreachable in
 * production, not merely untested: every caller of the P5 operational-record
 * routes was denied by the bootstrap guard because no actor preset could hold
 * the scope, and the same was true of the break-glass and assistant widget
 * routes. Entries here must stay paired with an owning task, and an entry
 * whose scope backs a shipped UI surface is a live outage, not a deferred one.
 */
export const KNOWN_PRE_EXISTING_SCOPE_DEFECTS: ReadonlySet<string> = new Set([]);

describe("IAM dynamic route inventory and catalogue verification", () => {
  it("discovers every controller recursively without an allowlist", () => {
    const result = runDynamicRouteInventory();

    expect(result.controllersDiscovered.length).toBeGreaterThanOrEqual(56);
    expect(result.routesDiscovered.length).toBeGreaterThan(150);
  });

  it("reports zero unclassified routes across all discovered controllers", () => {
    const result = runDynamicRouteInventory();

    expect(result.uncoveredRoutes).toEqual([]);
  });

  it("validates that all declared scopes exist in the IAM catalogue", () => {
    const result = runDynamicRouteInventory();

    const unexpectedUnknownScopes = result.unknownScopes.filter(
      (item) => !KNOWN_PRE_EXISTING_SCOPE_DEFECTS.has(item.scope),
    );
    expect(unexpectedUnknownScopes).toEqual([]);

    // All previously-tracked pre-existing defects (assistant:write,
    // identity:break-glass:request/approve/activate) now carry catalog
    // definitions, so no unknown scopes should remain.
    expect(result.unknownScopes).toHaveLength(0);
  });

  it("validates that every declared route scope is grantable to some actor", () => {
    const result = runDynamicRouteInventory();

    const grantableScopes = new Set(
      IAM_ACTOR_POLICY_DEFINITIONS.flatMap((definition) => definition.scopes),
    );

    // A scope that exists in the catalogue but sits in no actor preset is
    // unreachable: the bootstrap guard denies every caller, so the surface
    // behind it is dead in production while every catalogue test still passes.
    // multi_taxi_records:read shipped that way and 403'd the P5 records console
    // for all accounts, platform_admin included.
    const ungrantableScopes = result.routesDiscovered
      .flatMap((route) =>
        route.effectiveScopes.map((scope) => ({
          scope,
          routePath: route.routePath,
          controller: route.controller,
        })),
      )
      .filter(
        (item) =>
          !KNOWN_PRE_EXISTING_SCOPE_DEFECTS.has(item.scope) &&
          !grantableScopes.has(item.scope),
      );

    expect(ungrantableScopes).toEqual([]);
  });

  it("keeps the uncontrolled multi-taxi trip-records export route retired", () => {
    const result = runDynamicRouteInventory();

    // Granting multi_taxi_records:export made this scope reachable for the
    // first time. A raw `GET .../multi-taxi-trip-records/export` handler
    // returned masked export rows directly, with no purpose capture, no
    // step-up freshness check, and no actor-bound export audit entry -- unlike
    // the export-jobs preview/create/download flow, which ReportingFilingService
    // enforces those controls for. That handler was retired rather than exposed;
    // this guards against it (or an equivalent shortcut) reappearing.
    const uncontrolledExportRoutes = result.routesDiscovered.filter(
      (route) =>
        route.routePath === "/platform-admin/multi-taxi-trip-records/export",
    );

    expect(uncontrolledExportRoutes).toEqual([]);
  });

  it("validates that all declared realms are compatible with the scope catalogue", () => {
    const result = runDynamicRouteInventory();

    expect(result.realmMismatches).toEqual([]);
  });

  it("fails with file, controller, method, and route details when an unclassified route is present", () => {
    const syntheticSource = `
      import { Controller, Get } from "@nestjs/common";
      @Controller("test-unclassified")
      export class TestUnclassifiedController {
        @Get("unprotected-endpoint")
        unprotectedMethod() {
          return { ok: true };
        }
      }
    `;

    const sourceFile = ts.createSourceFile(
      "test.controller.ts",
      syntheticSource,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );

    const result = analyzeSourceFile(sourceFile, "test.controller.ts");
    const unclassified = result.routes.filter((r) => !r.isClassified);

    expect(unclassified.length).toBe(1);
    expect(unclassified[0]).toMatchObject({
      file: "test.controller.ts",
      controller: "TestUnclassifiedController",
      methodName: "unprotectedMethod",
      httpMethod: "GET",
      routePath: "/test-unclassified/unprotected-endpoint",
      isClassified: false,
    });
  });

  it("fails with scope details when an unknown scope is declared", () => {
    const syntheticSource = `
      import { Controller, Get } from "@nestjs/common";
      import { RequireRealms, RequireScopes } from "../../common/auth";
      @Controller("test-unknown-scope")
      export class TestUnknownScopeController {
        @Get("bad-scope")
        @RequireRealms("platform")
        @RequireScopes("nonexistent:unknown:scope")
        badScopeMethod() {
          return { ok: true };
        }
      }
    `;

    const sourceFile = ts.createSourceFile(
      "bad-scope.controller.ts",
      syntheticSource,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );

    const result = analyzeSourceFile(sourceFile, "bad-scope.controller.ts");

    expect(result.unknownScopes.length).toBe(1);
    expect(result.unknownScopes[0]).toMatchObject({
      file: "bad-scope.controller.ts",
      controller: "TestUnknownScopeController",
      methodName: "badScopeMethod",
      scope: "nonexistent:unknown:scope",
      routePath: "/test-unknown-scope/bad-scope",
    });
  });

  it("fails with realm mismatch details when an incompatible realm is declared for a scope", () => {
    const syntheticSource = `
      import { Controller, Get } from "@nestjs/common";
      import { RequireRealms, RequireScopes } from "../../common/auth";
      @Controller("test-realm-mismatch")
      export class TestRealmMismatchController {
        @Get("bad-realm")
        @RequireRealms("driver")
        @RequireScopes("foundation:read")
        badRealmMethod() {
          return { ok: true };
        }
      }
    `;

    const sourceFile = ts.createSourceFile(
      "bad-realm.controller.ts",
      syntheticSource,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );

    const result = analyzeSourceFile(
      sourceFile,
      "bad-realm.controller.ts",
    );

    expect(result.realmMismatches.length).toBe(1);
    expect(result.realmMismatches[0]).toMatchObject({
      file: "bad-realm.controller.ts",
      controller: "TestRealmMismatchController",
      methodName: "badRealmMethod",
      scope: "foundation:read",
      realm: "driver",
      routePath: "/test-realm-mismatch/bad-realm",
    });
  });

  it("resolves platform-admin/break-glass routes to their own scope only, not the generic platform-admin foundation:write policy", () => {
    // Regression guard: platform-admin/break-glass/* previously matched the
    // generic `platform-admin/` branch, which forced foundation:write onto
    // every break-glass route in addition to the route's own
    // identity:break-glass:* decorator scope. No break-glass grantee holds
    // foundation:write for that purpose, so an ops_user with only the
    // break-glass scope granted was denied. If a future edit to the generic
    // platform-admin/ branch (or its ordering relative to this one) causes it
    // to swallow break-glass routes again, this test must fail.
    const policy = resolveRouteAuthPolicy(
      "POST",
      "/api/platform-admin/break-glass/requests",
    );

    expect(policy).not.toBeNull();
    expect(policy?.requiredScopes).toEqual([]);
    expect(policy?.requiredScopes).not.toContain("foundation:write");
    expect(policy?.allowedRealms).toEqual(
      expect.arrayContaining(["platform", "ops"]),
    );
  });
});

