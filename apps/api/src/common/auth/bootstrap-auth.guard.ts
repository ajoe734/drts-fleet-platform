import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Optional,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { ApiRequestError } from "../api-envelope";
import { DriverDeviceSessionService } from "../../modules/auth/driver-device-session.service";
import { AuditNotificationService } from "../../modules/audit-notification/audit-notification.service";
import { IAPSubjectAdapter } from "../../modules/auth/iap-subject.adapter";
import { extractIapJwtAssertion } from "@drts/control-plane-auth";
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
import { JwtAuthService } from "./jwt-auth.service";
import { detectAuthEnvironment } from "../../config/auth-startup-config";

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

function mergeUnique<T>(...values: readonly T[][]): T[] {
  return [...new Set(values.flat())];
}

function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
  return typeof (value as Promise<T> | null)?.then === "function";
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

function hasControlPlaneInnerBearer(
  headers: Record<string, string | string[] | undefined>,
): boolean {
  const value = headers["x-drts-authorization"];
  const header = Array.isArray(value) ? value[0] : value;
  return Boolean(header?.startsWith("Bearer "));
}

function hasBootstrapAuthSignal(
  headers: Record<string, string | string[] | undefined>,
): boolean {
  return [
    "x-actor-type",
    "x-actor-id",
    "x-realm",
    "x-roles",
    "x-role-families",
    "x-scopes",
    "x-auth-mode",
    "x-tenant-id",
    "x-partner-id",
    "x-partner-program-id",
    "x-partner-entry-slug",
  ].some((key) => {
    const value = headers[key];
    return Array.isArray(value)
      ? value.some((entry) => Boolean(entry?.trim()))
      : typeof value === "string" && value.trim().length > 0;
  });
}

function isStrictAuthEnvironment(): boolean {
  const environment = detectAuthEnvironment(process.env);
  return environment === "production" || environment === "staging";
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
    @Optional()
    private readonly iapSubjectAdapter?: IAPSubjectAdapter,
  ) {}

  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedRequestLike>();
    const requestUrl = request.originalUrl ?? request.url ?? "";
    const baseHeaders = asHeaderRecord(request.headers);
    const strictEnvironment = isStrictAuthEnvironment();

    if (strictEnvironment && hasBootstrapAuthSignal(baseHeaders)) {
      throw new ApiRequestError(
        401,
        "AUTH_BOOTSTRAP_HEADERS_FORBIDDEN",
        "Bootstrap identity headers are disabled in strict auth environments.",
        {
          route: request.originalUrl ?? request.url,
          method: request.method ?? "GET",
        },
      );
    }

    const isOpenRoute =
      this.reflector.getAllAndOverride<boolean>(AUTH_OPEN_ROUTE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? false;

    if (isOpenRoute) {
      const resolution = this.populateOpenRouteIdentity(
        request,
        baseHeaders,
        requestUrl,
      );
      return isPromiseLike(resolution) ? resolution.then(() => true) : true;
    }

    const routePolicy = resolveRouteAuthPolicy(
      request.method ?? "GET",
      requestUrl,
    );
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
    const mergedScopes = mergeUnique(
      routePolicy?.requiredScopes ?? [],
      decoratorScopes,
    );
    const mergedRealms = mergeUnique(
      routePolicy?.allowedRealms ?? [],
      decoratorRealms,
    );
    let policy =
      mergedScopes.length > 0 || mergedRealms.length > 0
        ? {
            requiredScopes: mergedScopes,
            allowedRealms: mergedRealms,
            description: routePolicy
              ? routePolicy.description
              : "Decorator-authenticated route",
            routeKey: routePolicy?.routeKey ?? "decorator",
          }
        : null;

    // Every controller route is either explicitly public, covered by a route
    // policy/decorator, or (outside strict deployments) is an authenticated
    // fallback. Strict environments deliberately do not have a permissive
    // fallback: a newly added route must be classified before it can serve.
    if (!policy) {
      if (strictEnvironment) {
        throw new ApiRequestError(
          403,
          "AUTH_ROUTE_UNCLASSIFIED",
          "This route is not classified for strict environment authorization.",
          {
            route: request.originalUrl ?? request.url,
            method: request.method ?? "GET",
          },
        );
      }
      policy = {
        requiredScopes: [],
        allowedRealms: [],
        description: "Default authenticated controller route",
        routeKey: "default-authenticated",
      };
    }

    // IAP workforce subject resolution if IAP assertion is present
    const rawIapAssertion = extractIapJwtAssertion(baseHeaders);
    if (rawIapAssertion && this.iapSubjectAdapter) {
      return this.resolveIapAssertionAndActivate(request, baseHeaders, policy);
    }

    return this.activateNonIap(request, baseHeaders, requestUrl, policy);
  }

  private async resolveIapAssertionAndActivate(
    request: AuthenticatedRequestLike,
    baseHeaders: Record<string, string | string[] | undefined>,
    policy: { requiredScopes: string[]; allowedRealms: string[] } | null,
  ): Promise<boolean> {
    const authEnvironment = detectAuthEnvironment(process.env);
    const isStrictIap =
      process.env.STRICT_IAP_MODE === "true" ||
      authEnvironment === "production" ||
      authEnvironment === "staging";
    const expectedAudience =
      process.env.IAP_EXPECTED_AUDIENCE ||
      process.env.IAP_AUDIENCE ||
      process.env.JWT_AUDIENCE;
    const expectedIssuer = process.env.IAP_EXPECTED_ISSUER;
    const jwtSecretOrPublicKey =
      process.env.IAP_JWT_SECRET_OR_PUBLIC_KEY || process.env.IAP_JWT_SECRET;

    const resolved = await this.iapSubjectAdapter!.resolveSubject(baseHeaders, {
      strictIapMode: isStrictIap,
      ...(expectedAudience ? { expectedAudience } : {}),
      ...(expectedIssuer ? { expectedIssuer } : {}),
      ...(jwtSecretOrPublicKey ? { jwtSecretOrPublicKey } : {}),
      autoProvision: !isStrictIap,
    });

    const identity: BootstrapRequestIdentity = {
      authMode: "jwt_bearer",
      actorType:
        resolved.membership.realm === "platform"
          ? "platform_admin"
          : "ops_user",
      actorId: resolved.principal.principalId,
      subject: resolved.principal.subject,
      realm: resolved.membership.realm as "platform" | "ops",
      tenantId: null,
      roleFamilies: [resolved.membership.realm as "platform" | "ops"],
      roles: resolved.effectiveRoles,
      scopes: resolved.effectiveScopes,
      requestId: (baseHeaders["x-request-id"] as string | undefined) ?? null,
    };

    request.identity = identity;
    if (policy) {
      try {
        this.assertRealmAllowed(identity, policy.allowedRealms, request);
        this.assertScopesAllowed(identity, policy.requiredScopes, request);
      } catch (error) {
        this.recordAuthorizationDenialAudit(identity, request, error);
        throw error;
      }
    }
    return true;
  }

  private activateNonIap(
    request: AuthenticatedRequestLike,
    baseHeaders: Record<string, string | string[] | undefined>,
    requestUrl: string,
    policy: { requiredScopes: string[]; allowedRealms: string[] } | null,
  ): boolean | Promise<boolean> {
    const strictEnvironment = isStrictAuthEnvironment();
    // JWT fast-path: verify Bearer token if present
    if (this.jwtAuthService) {
      const token = extractBearerToken(baseHeaders);
      if (token) {
        return this.jwtAuthService
          .verifyAccessToken(token, {
            allowControlPlaneProxyToken:
              hasControlPlaneInnerBearer(baseHeaders),
          })
          .then((payload) => {
            if (!payload) {
              throw new ApiRequestError(
                401,
                "JWT_INVALID",
                "Bearer token is invalid or expired.",
                { route: requestUrl },
              );
            }

            const identity = this.jwtAuthService!.toRequestIdentity(payload);
            request.identity = identity;
            if (policy) {
              try {
                this.assertRealmAllowed(
                  identity,
                  policy.allowedRealms,
                  request,
                );
                this.assertScopesAllowed(
                  identity,
                  policy.requiredScopes,
                  request,
                );
              } catch (error) {
                this.recordAuthorizationDenialAudit(identity, request, error);
                throw error;
              }
            }
            return true;
          });
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

    const bootstrapIdentity = extractBootstrapRequestIdentity(headers, {
      allowAnonymous: false,
      method: request.method ?? undefined,
      requestUrl: requestUrl || undefined,
    });

    if (strictEnvironment && bootstrapIdentity) {
      throw new ApiRequestError(
        401,
        "AUTH_BOOTSTRAP_HEADERS_FORBIDDEN",
        "Bootstrap identity headers are disabled in strict auth environments.",
        {
          route: request.originalUrl ?? request.url,
          method: request.method ?? "GET",
        },
      );
    }

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
    const identity = bootstrapIdentity;

    if (!identity) {
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
    try {
      this.assertRealmAllowed(identity, policy.allowedRealms, request);
      this.assertScopesAllowed(identity, policy.requiredScopes, request);
    } catch (error) {
      this.recordAuthorizationDenialAudit(identity, request, error);
      throw error;
    }

    return true;
  }

  private populateOpenRouteIdentity(
    request: AuthenticatedRequestLike,
    baseHeaders: Record<string, string | string[] | undefined>,
    requestUrl: string,
  ): void | Promise<void> {
    const strictEnvironment = isStrictAuthEnvironment();
    if (this.jwtAuthService) {
      const token = extractBearerToken(baseHeaders);
      if (token) {
        return this.jwtAuthService
          .verifyAccessToken(token, {
            allowControlPlaneProxyToken:
              hasControlPlaneInnerBearer(baseHeaders),
          })
          .then((payload) => {
            if (!payload) {
              throw new ApiRequestError(
                401,
                "JWT_INVALID",
                "Bearer token is invalid or expired.",
                { route: requestUrl },
              );
            }
            request.identity = this.jwtAuthService!.toRequestIdentity(payload);
          });
      }
    }

    const bootstrapIdentity = extractBootstrapRequestIdentity(baseHeaders, {
      allowAnonymous: false,
      method: request.method ?? undefined,
      requestUrl: requestUrl || undefined,
    });
    if (strictEnvironment && bootstrapIdentity) {
      throw new ApiRequestError(
        401,
        "AUTH_BOOTSTRAP_HEADERS_FORBIDDEN",
        "Bootstrap identity headers are disabled in strict auth environments.",
        {
          route: request.originalUrl ?? request.url,
          method: request.method ?? "GET",
        },
      );
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

  // A realm/scope denial on an authenticated identity is a governance-relevant
  // security event; record it so the audit trail covers rejected/denied
  // control-plane attempts (not just successful mutations). Only AUTH_REALM_DENIED
  // / AUTH_SCOPE_DENIED are audited; other failures propagate untouched.
  private recordAuthorizationDenialAudit(
    identity: BootstrapRequestIdentity,
    request: AuthenticatedRequestLike,
    error: unknown,
  ) {
    if (!this.auditNotificationService) {
      return;
    }
    const code =
      error instanceof ApiRequestError
        ? ((error.getResponse() as { error?: { code?: string } })?.error
            ?.code ?? null)
        : null;
    if (code !== "AUTH_REALM_DENIED" && code !== "AUTH_SCOPE_DENIED") {
      return;
    }
    // The audit actorType union excludes driver_user; coerce that lone case.
    const auditActorType =
      identity.actorType === "driver_user" ? "system" : identity.actorType;
    const method = (request.method ?? "GET").toUpperCase();
    const rawPath =
      (request.originalUrl ?? request.url ?? "").split("?")[0] ?? "";
    const routePath = rawPath
      .replace(/^\/+/, "")
      .replace(/^api\/+/, "")
      .replace(/\/+$/, "");
    // Map denied control-plane mutations to a semantic reject action so the
    // governance audit trail names the operation that was blocked; other routes
    // fall back to the generic marker.
    const denialActionByRoute: Record<string, string> = {
      "POST platform-admin/tenants": "reject_platform_tenant_create",
      "POST platform-admin/pricing-rules": "reject_platform_pricing_publish",
    };
    const denialAction =
      denialActionByRoute[`${method} ${routePath}`] ?? "reject_authorization";
    try {
      this.auditNotificationService.recordAuditLog({
        actorId: identity.actorId ?? null,
        actorType: auditActorType,
        tenantId: identity.tenantId ?? null,
        moduleName: "auth",
        actionName: denialAction,
        resourceType: "route",
        resourceId: `${request.method ?? "GET"} ${
          request.originalUrl ?? request.url ?? ""
        }`,
        newValuesSummary: {
          errorCode: code,
          realm: identity.realm,
        },
      });
    } catch {
      // never let audit recording mask the original authorization error
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
}
