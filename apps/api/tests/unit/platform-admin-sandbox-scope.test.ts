import { RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { Reflector } from "@nestjs/core";
import jwt from "jsonwebtoken";
import { describe, expect, it, vi } from "vitest";

import { issueControlPlaneRequestAuth } from "../../../../packages/control-plane-auth/src";
import type { AuthenticatedRequestLike } from "../../src/common/auth";
import { AUTH_REQUIRED_SCOPES_KEY } from "../../src/common/auth";
import { AUTH_SCOPE_PRESETS } from "../../src/common/auth/auth.constants";
import { BootstrapAuthGuard } from "../../src/common/auth/bootstrap-auth.guard";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { AccidentInvestigationController } from "../../src/modules/accident-investigation/accident-investigation.controller";
import { PlatformAdminComplianceController } from "../../src/modules/platform-admin/platform-admin-compliance.controller";
import { PlatformAdminRegulatorCasesController } from "../../src/modules/regulatory-reporting/platform-admin-regulator-cases.controller";
import { PlatformAdminRegulatoryReportingController } from "../../src/modules/regulatory-reporting/platform-admin-regulatory-reporting.controller";
import { VehicleEvidenceController } from "../../src/modules/vehicle-evidence/vehicle-evidence.controller";

// S3-FIX-PLATFORM-ADMIN-SANDBOX-SCOPE-001.
//
// `apps/platform-admin-web` talks to the API through `/control-plane-proxy`,
// which mints the caller identity from `@drts/control-plane-auth` and sends it
// as an explicit `x-scopes` header (or a `scopes` JWT claim). The API's
// `deriveScopes()` honours explicit scopes verbatim, so for a browser request
// `CONTROL_PLANE_SCOPE_PRESETS` REPLACES `AUTH_SCOPE_PRESETS` — a scope that
// exists only in the API table is not actually granted to anyone using the app.
//
// The proxy preset was missing all 12 `sandbox.*` scopes, so every
// platform-admin sandbox compliance / investigation / evidence / legal-hold /
// regulatory-report surface 403'd with `AUTH_SCOPE_DENIED` and left a
// `reject_authorization` audit row, exactly like the `/sos/board` failure fixed
// in S3-FIX-OPS-SOS-BOARD-SCOPE-001 — while every server-side test stayed green
// because they all assert `AUTH_SCOPE_PRESETS` directly.
//
// BOUNDARY DECISION — recorded in
// `docs/01-decisions/SD-DP-20260725-008-control-plane-proxy-scope-parity.md` and
// pinned by this suite: the proxy-minted `platform_admin`
// identity carries the full API grant, INCLUDING the two dual-control approve
// rights (`sandbox.evidence.export.approve`,
// `sandbox.legal_hold.release.approve`). Rationale:
//
//   1. The proxy is an identity-minting layer, not a policy layer. The one
//      authorization boundary for the actor type lives in `AUTH_SCOPE_PRESETS`;
//      a second, quietly weaker boundary in the proxy is the defect itself.
//   2. Separation of duties for those flows is NOT implemented by withholding
//      the scope. `platform-admin-compliance.service.ts` compares the
//      requesting and approving `actorId` and raises
//      `SANDBOX_EXPORT_SELF_APPROVAL_FORBIDDEN` /
//      `SANDBOX_LEGAL_HOLD_SELF_APPROVAL_FORBIDDEN`
//      (pinned by `tests/integration/e2e-p2-sandbox-compliance-controls.test.ts`).
//      Withholding the scope would not add a control; it would only make the
//      approve step unreachable from the browser, which is where the approver
//      works.
//   3. The proxy derives `actorId` from the IAP-authenticated email, so two
//      humans mint two actor ids and maker-checker still holds end to end.
//      Without IAP every caller collapses onto the default actor id, and the
//      same self-approval guard then blocks the approval — the failure mode is
//      closed in both deployments.

const SANDBOX_SCOPE_PREFIX = "sandbox.";

const SANDBOX_SCOPES = [
  "sandbox.compliance.read",
  "sandbox.compliance.manage",
  "sandbox.investigation.read",
  "sandbox.investigation.manage",
  "sandbox.evidence.preview",
  "sandbox.evidence.export.request",
  "sandbox.evidence.export.approve",
  "sandbox.legal_hold.place",
  "sandbox.legal_hold.release.request",
  "sandbox.legal_hold.release.approve",
  "sandbox.regulatory_report.review",
  "sandbox.regulatory_report.submit",
] as const;

// Every controller that guards a route with a `sandbox.*` scope and is reached
// from `apps/platform-admin-web` through `/control-plane-proxy`.
const SANDBOX_CONTROLLERS = [
  PlatformAdminComplianceController,
  VehicleEvidenceController,
  AccidentInvestigationController,
  PlatformAdminRegulatorCasesController,
  PlatformAdminRegulatoryReportingController,
] as const;

const METHOD_NAME_BY_NEST_METHOD: Record<number, string> = {
  [RequestMethod.GET]: "GET",
  [RequestMethod.POST]: "POST",
  [RequestMethod.PUT]: "PUT",
  [RequestMethod.DELETE]: "DELETE",
  [RequestMethod.PATCH]: "PATCH",
};

interface SandboxRoute {
  controller: (typeof SANDBOX_CONTROLLERS)[number];
  handler: (...args: never[]) => unknown;
  httpMethod: string;
  requestUrl: string;
  requiredScopes: string[];
  label: string;
}

function joinRoutePath(controllerPath: string, handlerPath: string): string {
  const segments = [controllerPath, handlerPath]
    .map((segment) => segment.replace(/^\/+|\/+$/g, ""))
    .filter((segment) => segment.length > 0);
  // Route params never affect the guard, but a literal `:caseId` in the URL
  // would be misleading in a failure message.
  return `/api/${segments.join("/")}`.replace(
    /:([A-Za-z0-9_]+)/g,
    (_match, name: string) => `sample-${name}`,
  );
}

function collectSandboxRoutes(): SandboxRoute[] {
  const routes: SandboxRoute[] = [];

  for (const controller of SANDBOX_CONTROLLERS) {
    const controllerPath =
      (Reflect.getMetadata(PATH_METADATA, controller) as string | undefined) ??
      "";

    for (const propertyName of Object.getOwnPropertyNames(
      controller.prototype,
    )) {
      if (propertyName === "constructor") {
        continue;
      }
      const handler = (
        controller.prototype as unknown as Record<
          string,
          (...args: never[]) => unknown
        >
      )[propertyName];
      if (typeof handler !== "function") {
        continue;
      }

      const requiredScopes =
        (Reflect.getMetadata(AUTH_REQUIRED_SCOPES_KEY, handler) as
          | string[]
          | undefined) ?? [];
      if (
        !requiredScopes.some((scope) => scope.startsWith(SANDBOX_SCOPE_PREFIX))
      ) {
        continue;
      }

      const nestMethod = Reflect.getMetadata(METHOD_METADATA, handler) as
        | number
        | undefined;
      const handlerPath =
        (Reflect.getMetadata(PATH_METADATA, handler) as string | undefined) ??
        "";
      const httpMethod =
        METHOD_NAME_BY_NEST_METHOD[nestMethod ?? RequestMethod.GET] ?? "GET";
      const requestUrl = joinRoutePath(controllerPath, handlerPath);

      routes.push({
        controller,
        handler,
        httpMethod,
        requestUrl,
        requiredScopes,
        label: `${httpMethod} ${requestUrl}`,
      });
    }
  }

  return routes;
}

function buildGuard() {
  const auditNotificationService = new AuditNotificationService();
  const recordAuditLog = vi
    .spyOn(auditNotificationService, "recordAuditLog")
    .mockImplementation(() => undefined as never);
  const guard = new BootstrapAuthGuard(
    new Reflector(),
    undefined,
    undefined,
    auditNotificationService,
  );

  return { guard, recordAuditLog };
}

function buildExecutionContext(route: SandboxRoute, request: unknown) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => route.handler,
    getClass: () => route.controller,
  } as never;
}

describe("control-plane proxy mints the platform_admin sandbox grant", () => {
  const sandboxRoutes = collectSandboxRoutes();

  it("finds the sandbox-guarded platform-admin routes it claims to cover", () => {
    // Guards the reflection above: if a refactor renames a controller or drops
    // the decorators, the per-route cases below would silently pass on zero
    // routes.
    expect(sandboxRoutes.length).toBeGreaterThanOrEqual(15);
  });

  it("mints every sandbox scope any platform-admin route demands", () => {
    // The drift detector this task exists for: a `sandbox.*` scope added to a
    // controller but not to the proxy preset is invisible to every other test
    // and fails only in the browser, as a 403.
    const requiredByRoutes = new Set(
      sandboxRoutes
        .flatMap((route) => route.requiredScopes)
        .filter((scope) => scope.startsWith(SANDBOX_SCOPE_PREFIX)),
    );
    expect(requiredByRoutes.size).toBeGreaterThan(0);

    const minted = new Set(
      issueControlPlaneRequestAuth({ actorType: "platform_admin" }).identity
        .scopes,
    );
    expect(
      [...requiredByRoutes].filter((scope) => !minted.has(scope)),
    ).toEqual([]);
  });

  it("mints every sandbox.* scope the API grants platform_admin", () => {
    const minted = issueControlPlaneRequestAuth({
      actorType: "platform_admin",
    });

    for (const scope of SANDBOX_SCOPES) {
      expect(minted.identity.scopes).toContain(scope);
    }
  });

  it("holds exact parity with the API platform_admin preset", () => {
    const minted = issueControlPlaneRequestAuth({
      actorType: "platform_admin",
    });
    // Two-way: neither an under-grant (the bug this task fixes) nor an
    // over-grant (the proxy must not invent authority the API never gave).
    expect([...minted.identity.scopes].sort()).toEqual(
      [...AUTH_SCOPE_PRESETS.platform_admin].sort(),
    );
  });

  it("carries the same sandbox scopes on the jwt_bearer path", () => {
    const minted = issueControlPlaneRequestAuth({
      actorType: "platform_admin",
      jwtSecret: "test-control-plane-secret",
    });

    const token = minted.headers["x-drts-authorization"]?.replace(
      /^Bearer /,
      "",
    );
    expect(token).toBeTruthy();

    const claims = jwt.verify(token!, "test-control-plane-secret") as {
      scopes: string[];
      realm: string;
    };
    expect(claims.realm).toBe("platform");
    for (const scope of SANDBOX_SCOPES) {
      expect(claims.scopes).toContain(scope);
    }
  });

  // Acceptance: the sandbox surfaces load with no `reject_authorization` audit
  // row. The guard is the only writer of that row, so assert it at the source —
  // each route's request, carrying exactly the headers the proxy mints, must
  // pass the guard without emitting an authorization-denial audit entry.
  it.each(sandboxRoutes.map((route) => [route.label, route] as const))(
    "%s admits the proxy identity with no reject_authorization audit row",
    (_label, route) => {
      const { guard, recordAuditLog } = buildGuard();
      const request: AuthenticatedRequestLike = {
        headers: issueControlPlaneRequestAuth({ actorType: "platform_admin" })
          .headers,
        method: route.httpMethod,
        originalUrl: route.requestUrl,
      };

      expect(guard.canActivate(buildExecutionContext(route, request))).toBe(
        true,
      );
      expect(
        recordAuditLog.mock.calls.filter(
          ([entry]) => entry?.actionName === "reject_authorization",
        ),
      ).toEqual([]);
    },
  );
});

describe("platform_admin dual-control survives the widened proxy grant", () => {
  // The grant above is only safe because separation of duties is enforced on
  // `actorId`, not on scope possession. That makes the proxy's per-email actor
  // id load-bearing: if it ever collapsed to a constant, two different humans
  // would share one actor id and the maker-checker rule would stop
  // distinguishing them.
  it("mints a distinct actorId per IAP-authenticated email", () => {
    const requester = issueControlPlaneRequestAuth({
      actorType: "platform_admin",
      headers: {
        "x-goog-authenticated-user-email":
          "accounts.google.com:compliance.maker@drts.example",
      },
    });
    const approver = issueControlPlaneRequestAuth({
      actorType: "platform_admin",
      headers: {
        "x-goog-authenticated-user-email":
          "accounts.google.com:compliance.checker@drts.example",
      },
    });

    expect(requester.identity.actorId).not.toBe(approver.identity.actorId);
    // ...and both still carry the approve rights, so the checker can actually
    // complete the flow from the browser.
    expect(requester.identity.scopes).toContain(
      "sandbox.evidence.export.approve",
    );
    expect(approver.identity.scopes).toContain(
      "sandbox.legal_hold.release.approve",
    );
  });

  it("collapses to one actorId when no IAP header is present", () => {
    // Fail-closed, not fail-open: with no IAP identity the requester and the
    // approver are the same actor, so
    // `SANDBOX_EXPORT_SELF_APPROVAL_FORBIDDEN` blocks the approval rather than
    // the widened scope waving it through.
    const first = issueControlPlaneRequestAuth({ actorType: "platform_admin" });
    const second = issueControlPlaneRequestAuth({ actorType: "platform_admin" });

    expect(first.identity.actorId).toBe(second.identity.actorId);
  });
});
