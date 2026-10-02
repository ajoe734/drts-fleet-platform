import { Reflector } from "@nestjs/core";
import { describe, expect, it } from "vitest";

import { BootstrapAuthGuard } from "../../src/common/auth/bootstrap-auth.guard";
import { TenantPartnerController } from "../../src/modules/tenant-partner/tenant-partner.controller";

/**
 * Exercises the real HTTP authorization gate for GET
 * `tenant/mail-deliveries/:deliveryId`: the real `BootstrapAuthGuard`, a
 * real `Reflector` reading the `@RequireRealms` metadata actually attached
 * to `TenantPartnerController.prototype.getMailDelivery`, and
 * `resolveRouteAuthPolicy`'s route classification. Scopes are left to the
 * real IAM scope presets (no `x-scopes` header) so this fails the same way
 * a live `ops_user` caller would if the route policy regresses. No server,
 * no supertest — a direct `canActivate` call against a minimal fake
 * `ExecutionContext`, the same pattern as
 * `tests/unit/bootstrap-auth-guard-strict-env.test.ts`. This file lives
 * under `apps/api/tests/unit` (not the root `tests/unit`) because
 * `@nestjs/core` only resolves from within the `apps/api` package
 * boundary; run it via `pnpm --filter @drts/api exec vitest run`.
 */
function buildContext(headers: Record<string, string>) {
  const request: Record<string, unknown> = {
    headers,
    method: "GET",
    url: "/api/tenant/mail-deliveries/delivery-1",
    originalUrl: "/api/tenant/mail-deliveries/delivery-1",
  };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => TenantPartnerController.prototype.getMailDelivery,
    getClass: () => TenantPartnerController,
  };
  return { context: context as never, request };
}

describe("SR-MAIL-DELIVERY-READBACK-20261001 GET tenant/mail-deliveries/:deliveryId route authorization", () => {
  it("allows an ops_user identity using only its real IAM scope preset (no x-scopes header)", () => {
    const guard = new BootstrapAuthGuard(new Reflector());
    const { context, request } = buildContext({
      "x-actor-type": "ops_user",
      "x-actor-id": "ops-1",
      "x-realm": "ops",
    });

    expect(guard.canActivate(context)).toBe(true);
    expect((request as { identity?: { realm?: string } }).identity?.realm).toBe(
      "ops",
    );
  });

  it("allows a tenant_admin identity using only its real IAM scope preset", () => {
    const guard = new BootstrapAuthGuard(new Reflector());
    const { context } = buildContext({
      "x-actor-type": "tenant_admin",
      "x-actor-id": "admin-1",
      "x-realm": "tenant",
      "x-tenant-id": "tenant-a",
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it("allows a platform_admin identity using only its real IAM scope preset", () => {
    const guard = new BootstrapAuthGuard(new Reflector());
    const { context } = buildContext({
      "x-actor-type": "platform_admin",
      "x-actor-id": "platform-1",
      "x-realm": "platform",
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it("rejects a tenant identity that explicitly lacks the required scope", () => {
    const guard = new BootstrapAuthGuard(new Reflector());
    const { context } = buildContext({
      "x-actor-type": "tenant_admin",
      "x-actor-id": "admin-1",
      "x-realm": "tenant",
      "x-scopes": "unrelated:scope",
    });

    expect(() => guard.canActivate(context)).toThrowError();
    try {
      guard.canActivate(context);
      expect.unreachable("expected ApiRequestError");
    } catch (error) {
      expect(error).toMatchObject({ code: "AUTH_SCOPE_DENIED" });
    }
  });

  it("rejects a partner realm identity", () => {
    const guard = new BootstrapAuthGuard(new Reflector());
    const { context } = buildContext({
      "x-actor-type": "partner_api_key",
      "x-actor-id": "partner-1",
      "x-realm": "partner",
    });

    expect(() => guard.canActivate(context)).toThrowError();
    try {
      guard.canActivate(context);
      expect.unreachable("expected ApiRequestError");
    } catch (error) {
      expect(error).toMatchObject({ code: "AUTH_REALM_DENIED" });
    }
  });

  it("rejects an anonymous caller with no bootstrap headers and no bearer token", () => {
    const guard = new BootstrapAuthGuard(new Reflector());
    const { context } = buildContext({});

    expect(() => guard.canActivate(context)).toThrowError();
    try {
      guard.canActivate(context);
      expect.unreachable("expected ApiRequestError");
    } catch (error) {
      expect(error).toMatchObject({ code: "AUTH_REQUIRED" });
    }
  });
});
