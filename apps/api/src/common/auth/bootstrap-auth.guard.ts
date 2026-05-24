import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Optional,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { AuditLogRecord } from "@drts/contracts";

import { ApiRequestError } from "../api-envelope";
import { DriverDeviceSessionService } from "../../modules/auth/driver-device-session.service";
import { AuditNotificationService } from "../../modules/audit-notification/audit-notification.service";
import {
  AUTH_ALLOWED_REALMS_KEY,
  AUTH_OPEN_ROUTE_KEY,
  AUTH_REQUIRED_SCOPES_KEY,
} from "./auth.constants";
import type {
  AuthenticatedRequestLike,
  BootstrapRequestIdentity,
} from "./auth.types";
import { extractBootstrapRequestIdentity } from "./auth.extractor";
import { resolveRouteAuthPolicy } from "./auth.policy";
import { JwtAuthService, type JwtIdentityPayload } from "./jwt-auth.service";

function asHeaderRecord(
  headers: unknown,
): Record<string, string | string[] | undefined> {
  if (!headers || typeof headers !== "object") {
    return {};
  }

  return headers as Record<string, string | string[] | undefined>;
}

function asQueryRecord(
  query: unknown,
): Record<string, string | string[] | undefined> {
  if (!query || typeof query !== "object") {
    return {};
  }

  return query as Record<string, string | string[] | undefined>;
}

function normalizeRoutePath(url: string): string {
  return url.split("?", 1)[0]?.replace(/^\/+/, "") ?? "";
}

function isSseBootstrapQueryRoute(method: string, url: string): boolean {
  if (method.toUpperCase() !== "GET") {
    return false;
  }

  const routePath = normalizeRoutePath(url).replace(/^api\/+/, "");
  return (
    routePath === "driver/task-events" || routePath === "ops/dispatch-events"
  );
}

function mergeSseBootstrapQueryIdentity(
  headers: Record<string, string | string[] | undefined>,
  query: Record<string, string | string[] | undefined>,
): Record<string, string | string[] | undefined> {
  const merged = { ...headers };
  const queryKeyMap: Record<string, string> = {
    actorType: "x-actor-type",
    actorId: "x-actor-id",
    realm: "x-realm",
    tenantId: "x-tenant-id",
    roles: "x-roles",
    roleFamilies: "x-role-families",
    scopes: "x-scopes",
    requestId: "x-request-id",
  };

  for (const [queryKey, headerKey] of Object.entries(queryKeyMap)) {
    if (merged[headerKey]) {
      continue;
    }
    const value = query[queryKey];
    if (value) {
      merged[headerKey] = value;
    }
  }

  return merged;
}

function includesAll(haystack: string[], needles: string[]): boolean {
  return needles.every((needle) => haystack.includes(needle));
}

function extractBearerToken(
  headers: Record<string, string | string[] | undefined>,
): string | null {
  const authHeader =
    headers["x-drts-authorization"] ?? headers["authorization"];
  const value = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  if (!value || !value.startsWith("Bearer ")) return null;
  return value.slice(7).trim() || null;
}

@Injectable()
export class BootstrapAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Optional() private readonly jwtAuthService?: JwtAuthService,
    @Optional()
    private readonly driverDeviceSessionService?: DriverDeviceSessionService,
    @Optional()
    private readonly auditNotificationService?: AuditNotificationService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedRequestLike>();
    const requestUrl = request.originalUrl ?? request.url ?? "";
    const baseHeaders = asHeaderRecord(request.headers);
    const isOpenRoute =
      this.reflector.getAllAndOverride<boolean>(AUTH_OPEN_ROUTE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? false;

    if (isOpenRoute) {
      this.populateOpenRouteIdentity(request, baseHeaders, requestUrl);
      return true;
    }

    // JWT fast-path: verify Bearer token if present
    if (this.jwtAuthService) {
      const token = extractBearerToken(baseHeaders);
      if (token) {
        const payload = this.jwtAuthService.verify(token);
        if (payload) {
          this.assertDriverBindingActive(payload, requestUrl);
          request.identity = this.jwtAuthService.toRequestIdentity(payload);
          return true;
        }
        throw new ApiRequestError(
          401,
          "JWT_INVALID",
          "Bearer token is invalid or expired.",
          { route: requestUrl },
        );
      }
    }
    const headers = isSseBootstrapQueryRoute(
      request.method ?? "GET",
      requestUrl,
    )
      ? mergeSseBootstrapQueryIdentity(
          baseHeaders,
          asQueryRecord((request as { query?: unknown }).query),
        )
      : baseHeaders;
    const decoratorScopes =
      this.reflector.getAllAndOverride<string[]>(AUTH_REQUIRED_SCOPES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    const decoratorRealms =
      this.reflector.getAllAndOverride<string[]>(AUTH_ALLOWED_REALMS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    const policy =
      decoratorScopes.length > 0 || decoratorRealms.length > 0
        ? {
            requiredScopes: decoratorScopes,
            allowedRealms: decoratorRealms,
            description: "Decorator-authenticated route",
            routeKey: "decorator",
          }
        : resolveRouteAuthPolicy(request.method ?? "GET", requestUrl);

    if (!policy) {
      const anonymousIdentity = extractBootstrapRequestIdentity(headers, {
        allowAnonymous: true,
        method: request.method ?? undefined,
        requestUrl: requestUrl || undefined,
      });
      if (anonymousIdentity) {
        request.identity = anonymousIdentity;
      }
      return true;
    }

    const identity = extractBootstrapRequestIdentity(headers, {
      allowAnonymous: false,
      method: request.method ?? undefined,
      requestUrl: requestUrl || undefined,
    });

    if (!identity) {
      this.recordRejectedAccess({
        request,
        code: "AUTH_REQUIRED",
        details: {
          route: request.originalUrl ?? request.url,
          method: request.method ?? "GET",
          requiredScopes: policy.requiredScopes,
          allowedRealms: policy.allowedRealms,
        },
      });
      throw new ApiRequestError(
        401,
        "AUTH_REQUIRED",
        "Bearer token or bootstrap auth headers are required for this route.",
        {
          route: request.originalUrl ?? request.url,
          method: request.method ?? "GET",
          requiredScopes: policy.requiredScopes,
          allowedRealms: policy.allowedRealms,
        },
      );
    }

    request.identity = identity;
    this.assertRealmAllowed(identity, policy.allowedRealms, request);
    this.assertScopesAllowed(identity, policy.requiredScopes, request);

    return true;
  }

  private populateOpenRouteIdentity(
    request: AuthenticatedRequestLike,
    baseHeaders: Record<string, string | string[] | undefined>,
    requestUrl: string,
  ) {
    if (this.jwtAuthService) {
      const token = extractBearerToken(baseHeaders);
      if (token) {
        const payload = this.jwtAuthService.verify(token);
        if (payload) {
          this.assertDriverBindingActive(payload, requestUrl);
          request.identity = this.jwtAuthService.toRequestIdentity(payload);
          return;
        }
        throw new ApiRequestError(
          401,
          "JWT_INVALID",
          "Bearer token is invalid or expired.",
          { route: requestUrl },
        );
      }
    }

    const anonymousIdentity = extractBootstrapRequestIdentity(baseHeaders, {
      allowAnonymous: true,
      method: request.method ?? undefined,
      requestUrl: requestUrl || undefined,
    });
    if (anonymousIdentity) {
      request.identity = anonymousIdentity;
    }
  }

  private assertRealmAllowed(
    identity: BootstrapRequestIdentity,
    allowedRealms: string[],
    request: AuthenticatedRequestLike,
  ) {
    if (allowedRealms.length === 0) {
      return;
    }

    if (allowedRealms.includes(identity.realm)) {
      return;
    }

    this.recordRejectedAccess({
      request,
      identity,
      code: "AUTH_REALM_DENIED",
      details: {
        route: request.originalUrl ?? request.url,
        method: request.method ?? "GET",
        allowedRealms,
        realm: identity.realm,
      },
    });
    throw new ApiRequestError(
      403,
      "AUTH_REALM_DENIED",
      "Bootstrap identity realm is not allowed for this route.",
      {
        route: request.originalUrl ?? request.url,
        method: request.method ?? "GET",
        allowedRealms,
        realm: identity.realm,
      },
    );
  }

  private assertScopesAllowed(
    identity: BootstrapRequestIdentity,
    requiredScopes: string[],
    request: AuthenticatedRequestLike,
  ) {
    if (requiredScopes.length === 0) {
      return;
    }

    if (includesAll(identity.scopes, requiredScopes)) {
      return;
    }

    this.recordRejectedAccess({
      request,
      identity,
      code: "AUTH_SCOPE_DENIED",
      details: {
        route: request.originalUrl ?? request.url,
        method: request.method ?? "GET",
        requiredScopes,
        grantedScopes: identity.scopes,
      },
    });
    throw new ApiRequestError(
      403,
      "AUTH_SCOPE_DENIED",
      "Bootstrap identity is missing one or more required scopes.",
      {
        route: request.originalUrl ?? request.url,
        method: request.method ?? "GET",
        requiredScopes,
        grantedScopes: identity.scopes,
      },
    );
  }

  private assertDriverBindingActive(
    payload: JwtIdentityPayload,
    route: string,
  ) {
    if (
      payload.actorType !== "driver_user" ||
      !this.driverDeviceSessionService
    ) {
      return;
    }

    this.driverDeviceSessionService.assertSessionAccessAllowed(
      payload.driverBindingId,
      payload.driverDeviceId,
      payload.sub,
      route,
    );
  }

  private recordRejectedAccess(input: {
    request: AuthenticatedRequestLike;
    code: "AUTH_REQUIRED" | "AUTH_REALM_DENIED" | "AUTH_SCOPE_DENIED";
    details: Record<string, unknown>;
    identity?: BootstrapRequestIdentity | null;
  }) {
    if (!this.auditNotificationService) {
      return;
    }

    const requestId = this.extractHeaderValue(
      asHeaderRecord(input.request.headers),
      "x-request-id",
    );
    const identity = input.identity ?? null;
    const route =
      (input.details.route as string | undefined) ??
      input.request.originalUrl ??
      input.request.url ??
      null;
    const method =
      (input.details.method as string | undefined) ??
      input.request.method ??
      null;

    this.auditNotificationService.recordAuditLog({
      actorId: identity?.actorId ?? null,
      actorType:
        (identity?.actorType as AuditLogRecord["actorType"] | undefined) ??
        "system",
      tenantId: identity?.tenantId ?? null,
      moduleName: "auth",
      actionName: "reject_route_access",
      resourceType: "route_access",
      resourceId: route,
      newValuesSummary: {
        outcome: "rejected",
        errorCode: input.code,
        route,
        method,
        realm: identity?.realm ?? null,
        actorType: identity?.actorType ?? null,
        ...input.details,
      },
      ...(requestId ? { requestId } : {}),
    });
  }

  private extractHeaderValue(
    headers: Record<string, string | string[] | undefined>,
    key: string,
  ) {
    const value = headers[key];
    return Array.isArray(value) ? value[0] : value;
  }
}
