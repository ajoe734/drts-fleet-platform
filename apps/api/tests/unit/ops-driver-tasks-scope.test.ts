import { Reflector } from "@nestjs/core";
import jwt from "jsonwebtoken";
import { describe, expect, it, vi } from "vitest";
import { issueControlPlaneRequestAuth } from "../../../../packages/control-plane-auth/src";
import { BootstrapAuthGuard } from "../../src/common/auth/bootstrap-auth.guard";
import { AUTH_SCOPE_PRESETS } from "../../src/common/auth/auth.constants";
import { extractBootstrapRequestIdentity } from "../../src/common/auth/auth.extractor";
import { resolveRouteAuthPolicy } from "../../src/common/auth/auth.policy";
import type { AuthenticatedRequestLike } from "../../src/common/auth";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";

const DRIVER_TASKS_ROUTE = "/api/driver/tasks";

function opsPolicy() {
  const policy = resolveRouteAuthPolicy("GET", DRIVER_TASKS_ROUTE);
  expect(policy).not.toBeNull();
  return policy!;
}

describe("ops can read driver tasks (dispatch board dependency)", () => {
  it("grants ops_user the driver:read scope", () => {
    expect(AUTH_SCOPE_PRESETS.ops_user).toContain("driver:read");
  });

  it("GET /api/driver/tasks allows the ops realm and requires driver:read", () => {
    const policy = opsPolicy();
    expect(policy.allowedRealms).toContain("ops");
    expect(policy.requiredScopes).toContain("driver:read");
  });

  it("ops_user satisfies the /api/driver/tasks scope requirement", () => {
    const policy = opsPolicy();
    const granted = new Set(AUTH_SCOPE_PRESETS.ops_user);
    for (const s of policy.requiredScopes) {
      expect(granted.has(s)).toBe(true);
    }
  });
});

// S3-FIX-OPS-SOS-BOARD-SCOPE-001.
//
// The three cases above only pin the *server-side* preset, which a browser
// request never reaches: `apps/ops-console-web` talks to `/control-plane-proxy`,
// which mints the identity from `@drts/control-plane-auth` and sends it as an
// explicit `x-scopes` header. `deriveScopes()` honours explicit scopes verbatim,
// so the proxy preset replaces `AUTH_SCOPE_PRESETS` for every browser call.
//
// `driver:read` was added to the API preset on 2026-06-15 (#735, "so the
// dispatch board loads") but never mirrored into the proxy preset, so Ops
// surfaces that call `GET /api/driver/tasks` (`/sos/board`, `/dashboard`,
// `/dispatch`) kept failing with 403 `AUTH_SCOPE_DENIED` from the browser —
// audited as `reject_authorization` — while these tests stayed green.
//
// Boundary decision recorded here: Ops keeps `GET /api/driver/tasks` as the
// board's data source (the route already allows the `ops` realm by design), and
// the proxy-minted `ops_user` identity must carry the same grant the API defines
// for that actor type. These cases assert the identity the proxy actually mints.
describe("control-plane proxy mints the ops grant the driver-task board needs", () => {
  it("bootstrap-header identity from the proxy satisfies GET /api/driver/tasks", () => {
    const policy = opsPolicy();
    const minted = issueControlPlaneRequestAuth({ actorType: "ops_user" });

    const identity = extractBootstrapRequestIdentity(minted.headers, {
      allowAnonymous: false,
      method: "GET",
      requestUrl: DRIVER_TASKS_ROUTE,
    });

    expect(identity).not.toBeNull();
    expect(policy.allowedRealms).toContain(identity!.realm);
    for (const scope of policy.requiredScopes) {
      expect(identity!.scopes).toContain(scope);
    }
  });

  it("jwt_bearer identity from the proxy carries the same scopes", () => {
    const minted = issueControlPlaneRequestAuth({
      actorType: "ops_user",
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
    expect(claims.realm).toBe("ops");
    for (const scope of opsPolicy().requiredScopes) {
      expect(claims.scopes).toContain(scope);
    }
  });

  it("proxy ops_user preset stays in parity with the API ops_user preset", () => {
    const minted = issueControlPlaneRequestAuth({ actorType: "ops_user" });
    expect([...minted.identity.scopes].sort()).toEqual(
      [...AUTH_SCOPE_PRESETS.ops_user].sort(),
    );
  });

  // Acceptance: `/sos/board` loads with no `reject_authorization` audit row.
  // The guard is the only writer of that row, so assert it at the source: the
  // board's request, carrying exactly the headers the proxy mints, must pass
  // the guard without emitting an authorization-denial audit entry.
  it("guard admits the board request without writing a reject_authorization audit row", () => {
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

    const request: AuthenticatedRequestLike = {
      headers: issueControlPlaneRequestAuth({ actorType: "ops_user" }).headers,
      method: "GET",
      originalUrl: DRIVER_TASKS_ROUTE,
    };

    expect(
      guard.canActivate({
        switchToHttp: () => ({ getRequest: () => request }),
        getHandler: () => function handler() {},
        getClass: () => class GuardTarget {},
      } as never),
    ).toBe(true);
    expect(
      recordAuditLog.mock.calls.filter(
        ([entry]) => entry?.actionName === "reject_authorization",
      ),
    ).toEqual([]);
  });

  it("proxy platform_admin preset never over-grants beyond the API preset", () => {
    const minted = issueControlPlaneRequestAuth({
      actorType: "platform_admin",
    });
    const apiGranted = new Set(AUTH_SCOPE_PRESETS.platform_admin);
    const overGranted = minted.identity.scopes.filter(
      (scope) => !apiGranted.has(scope),
    );
    expect(overGranted).toEqual([]);
  });
});
