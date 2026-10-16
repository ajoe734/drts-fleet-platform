import { IdentityController } from "../../../apps/api/src/modules/identity/identity.controller";
import { vi } from "vitest";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { ApiClient } from "../../../packages/api-client/src/index";
import { BootstrapAuthGuard } from "../../../apps/api/src/common/auth/bootstrap-auth.guard";
import { JwtAuthService } from "../../../apps/api/src/common/auth/jwt-auth.service";
import { StepUpProofService } from "../../../apps/api/src/common/auth/step-up-proof.service";
import type { BootstrapRequestIdentity } from "../../../apps/api/src/common/auth";
import { deepToSnakeCase } from "../../../apps/api/src/common/snake-case.interceptor";
import { ApiRequestError } from "../../../apps/api/src/common/api-envelope";
import { PlatformAdminService } from "../../../apps/api/src/modules/platform-admin/platform-admin.service";
import { PlatformAdminController } from "../../../apps/api/src/modules/platform-admin/platform-admin.controller";
import { PlatformNoticesController } from "../../../apps/api/src/modules/platform-admin/platform-notices.controller";
import { FeatureFlagsService } from "../../../apps/api/src/modules/feature-flags/feature-flags.service";
import { FeatureFlagsController } from "../../../apps/api/src/modules/feature-flags/feature-flags.controller";
import { TenantFeatureFlagsController } from "../../../apps/api/src/modules/feature-flags/tenant-feature-flags.controller";
import { NotificationsController } from "../../../apps/api/src/modules/audit-notification/notifications.controller";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
const { Reflector } = createRequire(resolve("apps/api/package.json"))(
  "@nestjs/core",
);

export function principal(
  realm: BootstrapRequestIdentity["realm"],
  actorId = `${realm}-reader`,
  tenantId: string | null = null,
  scopes?: string[],
): BootstrapRequestIdentity {
  return {
    authMode: "jwt_bearer",
    actorType:
      realm === "tenant"
        ? "tenant_admin"
        : realm === "driver"
          ? "driver_user"
          : realm === "ops"
            ? "ops_user"
            : "platform_admin",
    actorId,
    principalId: actorId,
    realm,
    tenantId,
    roleFamilies: [],
    roles: [],
    scopes:
      scopes ??
      (realm === "tenant"
        ? ["tenant:read", "tenant:write"]
        : realm === "platform"
          ? ["foundation:read", "foundation:write"]
          : ["notifications:read", "notifications:write"]),
    authTime: new Date().toISOString(),
    amr: ["mfa"],
    sessionId: `session-${actorId}`,
    requestId: "notice-test",
  };
}
export function wireHarness() {
  const audit = new AuditNotificationService();
  const service = new PlatformAdminService(audit);
  const flags = new FeatureFlagsService(undefined, audit);
  const admin = new PlatformAdminController(service);
  const recipients = new PlatformNoticesController(service);
  const flagAdmin = new FeatureFlagsController(flags);
  const tenantFlags = new TenantFeatureFlagsController(flags);
  const globalNotifications = new NotificationsController(audit);
  const jwt = new JwtAuthService();
  const stepUp = new StepUpProofService();
  const identityController = new IdentityController(
    undefined,
    undefined,
    stepUp,
  );
  const guard = new BootstrapAuthGuard(
    new Reflector(),
    jwt,
    undefined,
    audit,
    undefined,
    undefined,
    stepUp,
  );
  const requests: {
    method: string;
    path: string;
    body: unknown;
    signal: AbortSignal | null | undefined;
  }[] = [];
  const wireBodies: unknown[] = [];
  let beforeReturn:
    | ((
        path: string,
        response: unknown,
        signal?: AbortSignal | null,
      ) => Promise<void>)
    | undefined;
  const tokens = new Map<string, Promise<string | null>>();
  const fetchImpl: typeof fetch = async (input, init) => {
    const token =
      tokens.get(new Headers(init?.headers).get("authorization") ?? "") ??
      Promise.resolve(null);
    const url = new URL(String(input));
    const path = url.pathname;
    const method = init?.method ?? "GET";
    const body =
      typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    requests.push({ method, path, body, signal: init?.signal });
    let target: object;
    let handler: string;
    let args: (id: BootstrapRequestIdentity | null) => unknown[];
    const tenantId = url.searchParams.get("tenantId") ?? undefined;
    if (path === "/api/identity/step-up-proofs") {
      target = identityController;
      handler = "createStepUpProof";
      args = (id) => [body, id];
    } else if (path === "/api/platform-admin/notices") {
      target = admin;
      handler =
        method === "POST" ? "createPlatformNotice" : "listPlatformNotices";
      args = () => (method === "POST" ? [body] : []);
    } else if (/^\/api\/platform-admin\/notices\/[^/]+\/resolve$/.test(path)) {
      target = admin;
      handler = "resolveNotice";
      args = () => [path.split("/")[4]];
    } else if (path === "/api/platform-admin/maintenance-mode") {
      target = admin;
      handler = method === "POST" ? "setMaintenanceMode" : "getMaintenanceMode";
      args = () => (method === "POST" ? [body] : []);
    } else if (path === "/api/admin/flags") {
      target = flagAdmin;
      handler = "getAllFlags";
      args = () => [undefined, undefined, tenantId];
    } else if (/^\/api\/admin\/flags\/[^/]+\/tenant-overrides$/.test(path)) {
      target = flagAdmin;
      handler = "upsertTenantOverride";
      args = () => [decodeURIComponent(path.split("/")[4]!), tenantId, body];
    } else if (/^\/api\/admin\/flags\/[^/]+$/.test(path)) {
      target = flagAdmin;
      handler = "updateFlag";
      args = () => [decodeURIComponent(path.split("/")[4]!), body];
    } else if (path === "/api/tenant/feature-flags") {
      target = tenantFlags;
      handler = "list";
      args = (id) => [
        id,
        undefined,
        tenantId,
        new Headers(init?.headers).get("x-tenant-id") ?? undefined,
      ];
    } else if (path === "/api/notifications") {
      target = globalNotifications;
      handler = "listNotifications";
      args = () => [];
    } else if (
      /^\/api\/(ops|driver|tenant\/notifications)\/platform-notices(?:\/[^/]+\/read|\/notifications)?$/.test(
        path,
      )
    ) {
      target = recipients;
      const audience = path.includes("/tenant/")
        ? "tenant"
        : path.includes("/driver/")
          ? "driver"
          : "ops";
      if (path.endsWith("/read")) {
        handler =
          audience === "tenant"
            ? "readTenant"
            : audience === "driver"
              ? "readDriver"
              : "readOps";
        args = (id) => [path.split("/").at(-2), body, id];
      } else {
        handler = path.endsWith("/notifications")
          ? "driverNotifications"
          : audience;
        args = (id) => [
          id,
          undefined,
          tenantId,
          new Headers(init?.headers).get("x-tenant-id") ?? undefined,
        ];
      }
    } else
      return Response.json(
        { error: { code: "NOT_FOUND", message: "No production route" } },
        { status: 404 },
      );
    try {
      const issued = await token;
      const request = {
        method,
        originalUrl: `${path}${url.search}`,
        url: `${path}${url.search}`,
        body,
        headers: {
          ...Object.fromEntries(new Headers(init?.headers)),
          ...(issued ? { authorization: `Bearer ${issued}` } : {}),
        },
        identity: undefined as BootstrapRequestIdentity | undefined,
      };
      await guard.canActivate({
        switchToHttp: () => ({ getRequest: () => request }),
        getHandler: () => Reflect.get(target, handler),
        getClass: () => target.constructor,
      } as never);
      const result = await Reflect.apply(
        Reflect.get(target, handler),
        target,
        args(request.identity ?? null),
      );
      const wire = deepToSnakeCase(result);
      wireBodies.push(wire);
      await beforeReturn?.(path, wire, init?.signal);
      return Response.json(wire);
    } catch (e) {
      if (e instanceof ApiRequestError)
        return Response.json(e.getResponse(), { status: e.getStatus() });
      return Response.json(
        {
          error: {
            code: "INTERNAL_ERROR",
            message: e instanceof Error ? e.message : String(e),
          },
        },
        { status: 500 },
      );
    }
  };
  vi.stubGlobal("fetch", fetchImpl);
  function client(identity: BootstrapRequestIdentity | null) {
    const marker = `Bearer socket-free-${tokens.size}`;
    tokens.set(
      marker,
      identity
        ? jwt.issueSessionToken(identity).then((r) => r.token)
        : Promise.resolve(null),
    );
    return new ApiClient({
      baseUrl: "http://socket-free.invalid",
      defaultHeaders: { authorization: marker },
    });
  }
  return {
    audit,
    service,
    flags,
    admin,
    recipients,
    client,
    requests,
    wireBodies,
    setBeforeReturn(fn: typeof beforeReturn) {
      beforeReturn = fn;
    },
  };
}
