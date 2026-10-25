import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { ExecutionContext } from "../../apps/api/node_modules/@nestjs/common";
import { Reflector } from "../../apps/api/node_modules/@nestjs/core";
import ts from "typescript";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import {
  AGENCY_WRITE_ROUTE_ALLOWLIST,
  AUTH_ALLOWED_REALMS_KEY,
  AUTH_OPEN_ROUTE_KEY,
  AUTH_REQUIRED_SCOPES_KEY,
} from "../../apps/api/src/common/auth/auth.constants";
import type { AuthenticatedRequestLike } from "../../apps/api/src/common/auth/auth.types";
import { BootstrapAuthGuard } from "../../apps/api/src/common/auth/bootstrap-auth.guard";
import { JwtAuthService } from "../../apps/api/src/common/auth/jwt-auth.service";
import { AgencyAccessAuditService } from "../../apps/api/src/modules/agency-access/agency-access-audit.service";
import { AgencyAccessLogRepository } from "../../apps/api/src/modules/agency-access/agency-access-log.repository";
import { AgencyDirectoryRepository } from "../../apps/api/src/modules/agency-access/agency-directory.repository";
import { IdentityRepository } from "../../apps/api/src/modules/identity/identity.repository";

// BUREAU-R13 §2.6 deny-by-default: a valid agency session reaches only
// routes classified for the agency realm, and every write route other than
// export preview/create and logout is 403 for the agency realm. Other realms
// (tenant, ops, platform incl. the IAP viewer preset) are 403 on agency/*.
const API_SRC = path.resolve(__dirname, "../../apps/api/src");
const WRITE_METHODS = new Map([
  ["Post", "POST"],
  ["Put", "PUT"],
  ["Patch", "PATCH"],
  ["Delete", "DELETE"],
]);
const READ_SCOPES = [
  "agency:trip_records:read",
  "agency:reports:read",
  "agency:qualifications:read",
];

interface ControllerRoute {
  label: string;
  httpMethod: string;
  routePath: string;
  open: boolean;
  realms: string[];
  scopes: string[];
}

function decoratorsOf(node: ts.Node) {
  return ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : [];
}

function decoratorName(decorator: ts.Decorator) {
  const expression = decorator.expression;
  return ts.isCallExpression(expression)
    ? expression.expression.getText()
    : expression.getText();
}

function stringArgs(decorator: ts.Decorator): string[] {
  const expression = decorator.expression;
  if (!ts.isCallExpression(expression)) return [];
  return expression.arguments.flatMap((argument) =>
    ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument)
      ? [argument.text]
      : ts.isArrayLiteralExpression(argument)
        ? argument.elements.flatMap((element) =>
            ts.isStringLiteral(element) ? [element.text] : [],
          )
        : [],
  );
}

function controllerFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return controllerFiles(full);
    return entry.name.endsWith(".controller.ts") ? [full] : [];
  });
}

/** Every write route declared by a Nest controller, with its decorators. */
function discoverWriteRoutes(): ControllerRoute[] {
  const routes: ControllerRoute[] = [];
  for (const file of controllerFiles(API_SRC)) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    for (const statement of source.statements) {
      if (!ts.isClassDeclaration(statement)) continue;
      const classDecorators = decoratorsOf(statement);
      const controller = classDecorators.find(
        (decorator) => decoratorName(decorator) === "Controller",
      );
      if (!controller) continue;
      const prefix = stringArgs(controller)[0] ?? "";
      const classOpen = classDecorators.some(
        (decorator) => decoratorName(decorator) === "OpenRoute",
      );
      const classRealms = classDecorators
        .filter((decorator) => decoratorName(decorator) === "RequireRealms")
        .flatMap(stringArgs);
      const classScopes = classDecorators
        .filter((decorator) => decoratorName(decorator) === "RequireScopes")
        .flatMap(stringArgs);
      for (const member of statement.members) {
        if (!ts.isMethodDeclaration(member)) continue;
        const memberDecorators = decoratorsOf(member);
        const route = memberDecorators.find((decorator) =>
          WRITE_METHODS.has(decoratorName(decorator)),
        );
        if (!route) continue;
        const methodRealms = memberDecorators
          .filter((decorator) => decoratorName(decorator) === "RequireRealms")
          .flatMap(stringArgs);
        const methodScopes = memberDecorators
          .filter((decorator) => decoratorName(decorator) === "RequireScopes")
          .flatMap(stringArgs);
        const routePath = [prefix, stringArgs(route)[0] ?? ""]
          .filter(Boolean)
          .join("/")
          .replace(/\/+/g, "/")
          .replace(/^\/|\/$/g, "")
          .replace(/:[A-Za-z0-9_]+/g, "r13-param");
        routes.push({
          label: `${path.relative(API_SRC, file)} ${WRITE_METHODS.get(decoratorName(route))} /${routePath}`,
          httpMethod: WRITE_METHODS.get(decoratorName(route))!,
          routePath,
          open:
            classOpen ||
            memberDecorators.some(
              (decorator) => decoratorName(decorator) === "OpenRoute",
            ),
          realms: methodRealms.length > 0 ? methodRealms : classRealms,
          scopes: methodScopes.length > 0 ? methodScopes : classScopes,
        });
      }
    }
  }
  return routes;
}

/** A handler carrying exactly the route's decorator metadata. */
function handlerFor(
  route: Pick<ControllerRoute, "open" | "realms" | "scopes">,
) {
  const handler = () => undefined;
  if (route.open) Reflect.defineMetadata(AUTH_OPEN_ROUTE_KEY, true, handler);
  if (route.realms.length > 0)
    Reflect.defineMetadata(AUTH_ALLOWED_REALMS_KEY, route.realms, handler);
  if (route.scopes.length > 0)
    Reflect.defineMetadata(AUTH_REQUIRED_SCOPES_KEY, route.scopes, handler);
  return handler;
}

function contextFor(
  request: AuthenticatedRequestLike,
  handler: () => undefined,
): ExecutionContext {
  class R13NegativeController {}
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => R13NegativeController,
  } as unknown as ExecutionContext;
}

async function outcome(
  guard: BootstrapAuthGuard,
  request: AuthenticatedRequestLike,
  route: Pick<ControllerRoute, "open" | "realms" | "scopes">,
): Promise<{ allowed: boolean; status: number | null; code: string | null }> {
  try {
    await guard.canActivate(contextFor(request, handlerFor(route)));
    return { allowed: true, status: null, code: null };
  } catch (error) {
    if (error instanceof ApiRequestError) {
      return { allowed: false, status: error.getStatus(), code: error.code };
    }
    throw error;
  }
}

/** Routes served by the passenger-session branch of BootstrapAuthGuard. */
function isFirstPartyPassengerRoute(routePath: string) {
  return (
    (routePath === "passenger-app" || routePath.startsWith("passenger-app/")) &&
    !routePath.startsWith("passenger-app/platform/")
  );
}

const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");

describe("BUREAU-R13 agency realm negative route matrix", () => {
  let guard: BootstrapAuthGuard;
  let viewerToken: string;
  let exporterToken: string;
  let accessLogs: AgencyAccessLogRepository;

  beforeAll(async () => {
    vi.stubEnv("DRTS_ENV", "development");
    vi.stubEnv("JWT_SECRET", "test-session-secret-32-characters-long");
    vi.stubEnv("JWT_ISSUER", "https://drts-session.example");
    const repo = new IdentityRepository();
    const directory = new AgencyDirectoryRepository();
    const now = new Date().toISOString();
    await directory.create({
      agencyId: "agency_a",
      agencyCode: "TEST-A",
      displayName: "Test agency A",
      status: "active",
      createdByPrincipalId: null,
      createdAt: now,
      updatedAt: now,
    });
    const signer = new JwtAuthService(repo, undefined, undefined, directory);
    async function agencySession(
      email: string,
      subject: string,
      roleCode: string,
    ) {
      await repo.issueAgencyInvitation({
        agencyId: "agency_a",
        email,
        roleCode,
        accessValidTo: new Date(
          Date.now() + 7 * 24 * 3600 * 1000,
        ).toISOString(),
        tokenHash: hash(subject),
        expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
        issuerPrincipalId: null,
      });
      const accepted = await repo.acceptAgencyOidcInvitation(hash(subject), {
        issuer: "https://accounts.google.com",
        subject,
        email,
      });
      const tokenVersion = Math.max(
        ...[
          accepted!.principal.updatedAt,
          accepted!.membership.updatedAt,
          ...accepted!.roleBindings.map((binding) => binding.updatedAt),
        ].map((value) => Date.parse(value)),
      );
      const scopes =
        roleCode === "agency_exporter"
          ? [...READ_SCOPES, "agency:trip_records:export"]
          : READ_SCOPES;
      return (
        await signer.issueSessionToken(
          {
            authMode: "jwt_bearer",
            actorType: "agency_user",
            actorId: accepted!.principal.principalId,
            principalId: accepted!.principal.principalId,
            membershipId: accepted!.membership.membershipId,
            subject,
            realm: "agency",
            tenantId: null,
            agencyId: "agency_a",
            roleFamilies: ["agency"],
            roles: [roleCode],
            scopes,
            tokenVersion,
            amr: [],
            acr: "",
            requestId: null,
          },
          { expiresIn: "8h", ensurePrincipal: false, tokenVersion },
        )
      ).token;
    }
    viewerToken = await agencySession(
      "viewer@agency.example",
      "google-viewer",
      "agency_viewer",
    );
    exporterToken = await agencySession(
      "exporter@agency.example",
      "google-exporter",
      "agency_exporter",
    );
    accessLogs = new AgencyAccessLogRepository();
    guard = new BootstrapAuthGuard(
      new Reflector(),
      signer,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      new AgencyAccessAuditService(accessLogs),
    );
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  const agencyRequest = (
    method: string,
    routePath: string,
    token: string,
  ): AuthenticatedRequestLike => ({
    method,
    originalUrl: `/api/${routePath}`,
    headers: { authorization: `Bearer ${token}`, "x-request-id": "r13-neg" },
  });

  it("discovers the full write-route surface", () => {
    expect(discoverWriteRoutes().length).toBeGreaterThan(150);
  });

  it("returns 403 for every write route except the agency allowlist (regression for each route)", async () => {
    const allowedRoutes: string[] = [];
    const notDenied: string[] = [];
    for (const route of discoverWriteRoutes()) {
      // First-party passenger routes never accept an IAM bearer as identity;
      // they are covered separately below.
      if (isFirstPartyPassengerRoute(route.routePath)) continue;
      const result = await outcome(
        guard,
        agencyRequest(route.httpMethod, route.routePath, exporterToken),
        route,
      );
      const key = `${route.httpMethod} ${route.routePath}`;
      if (AGENCY_WRITE_ROUTE_ALLOWLIST.has(key)) {
        allowedRoutes.push(key);
        continue;
      }
      if (result.allowed || result.status !== 403) {
        notDenied.push(`${route.label} -> ${JSON.stringify(result)}`);
      }
    }
    expect(notDenied).toEqual([]);
    expect(allowedRoutes.sort()).toEqual(
      [...AGENCY_WRITE_ROUTE_ALLOWLIST].sort(),
    );
  });

  it("never turns an agency bearer into an identity on passenger-app write routes", async () => {
    const passengerRoutes = discoverWriteRoutes().filter((candidate) =>
      isFirstPartyPassengerRoute(candidate.routePath),
    );
    expect(passengerRoutes.length).toBeGreaterThan(0);
    for (const route of passengerRoutes) {
      const request = agencyRequest(
        route.httpMethod,
        route.routePath,
        exporterToken,
      );
      const result = await outcome(guard, request, route);
      expect(request.identity?.realm).not.toBe("agency");
      // Non-public passenger routes reject the agency bearer outright.
      if (!route.open) {
        expect(result.allowed).toBe(false);
      }
    }
  });

  it.each([
    ["GET", "platform-admin/agencies", ["platform"], ["agency:directory:read"]],
    [
      "GET",
      "platform-admin/agency-access-logs",
      ["platform"],
      ["agency:access_audit:read"],
    ],
    ["GET", "platform-admin/tenants", [], []],
    [
      "GET",
      "platform-admin/multi-taxi-trip-records",
      ["platform"],
      ["multi_taxi_records:read"],
    ],
    ["GET", "reports/daily-dispatch-records", ["platform", "ops"], []],
    ["GET", "reports/operations-summary/preview", ["platform", "ops"], []],
    ["GET", "regulatory-registry/vehicles", [], []],
    ["GET", "regulatory-registry/drivers", [], []],
    ["GET", "complaints", [], []],
    ["GET", "auth/sessions", [], []],
    ["GET", "r13-unclassified/default-authenticated", [], []],
  ])(
    "denies an agency session on %s %s",
    async (method, routePath, realms, scopes) => {
      const result = await outcome(
        guard,
        agencyRequest(method, routePath, exporterToken),
        { open: false, realms, scopes },
      );
      expect(result).toMatchObject({ allowed: false, status: 403 });
    },
  );

  it("allows the agency session on its own read routes and auth/session", async () => {
    for (const [routePath, scope] of [
      ["agency/trip-records", "agency:trip_records:read"],
      ["agency/reports/operations-summary", "agency:reports:read"],
      ["agency/qualifications/drivers", "agency:qualifications:read"],
    ] as const) {
      expect(
        await outcome(guard, agencyRequest("GET", routePath, viewerToken), {
          open: false,
          realms: ["agency"],
          scopes: [scope],
        }),
      ).toMatchObject({ allowed: true });
    }
    expect(
      await outcome(guard, agencyRequest("GET", "auth/session", viewerToken), {
        open: false,
        realms: [],
        scopes: [],
      }),
    ).toMatchObject({ allowed: true });
  });

  it("denies a viewer the export routes and records the denial in the agency access log", async () => {
    const before = (await accessLogs.list({})).total;
    const result = await outcome(
      guard,
      agencyRequest("POST", "agency/trip-records/export-jobs", viewerToken),
      {
        open: false,
        realms: ["agency"],
        scopes: ["agency:trip_records:export"],
      },
    );
    expect(result).toMatchObject({
      allowed: false,
      status: 403,
      code: "AUTH_SCOPE_DENIED",
    });
    const logs = await accessLogs.list({});
    expect(logs.total).toBe(before + 1);
    expect(logs.items[0]).toMatchObject({
      agencyId: "agency_a",
      action: "export_create",
      resourceType: "trip_record_export",
      outcome: "denied",
      reasonCode: "AUTH_SCOPE_DENIED",
      rowCount: null,
    });
  });

  it.each([
    [
      "tenant",
      {
        "x-actor-type": "tenant_admin",
        "x-actor-id": "t1",
        "x-tenant-id": "tenant-1",
      },
    ],
    ["ops", { "x-actor-type": "ops_user", "x-actor-id": "o1" }],
    [
      "platform admin",
      { "x-actor-type": "platform_admin", "x-actor-id": "p1" },
    ],
    [
      "platform IAP viewer preset",
      {
        "x-actor-type": "platform_admin",
        "x-actor-id": "viewer-1",
        "x-roles": "viewer",
        "x-scopes": "foundation:read,reports:read,regulatory:read,audit:read",
      },
    ],
  ])("denies a %s session on agency/* routes", async (_label, headers) => {
    for (const [method, routePath, scope] of [
      ["GET", "agency/trip-records", "agency:trip_records:read"],
      [
        "GET",
        "agency/reports/complaint-monthly-statistics",
        "agency:reports:read",
      ],
      ["POST", "agency/trip-records/export-jobs", "agency:trip_records:export"],
    ] as const) {
      const result = await outcome(
        guard,
        {
          method,
          originalUrl: `/api/${routePath}`,
          headers: headers as Record<string, string>,
        },
        { open: false, realms: ["agency"], scopes: [scope] },
      );
      expect(result).toMatchObject({ allowed: false, status: 403 });
    }
  });
});
