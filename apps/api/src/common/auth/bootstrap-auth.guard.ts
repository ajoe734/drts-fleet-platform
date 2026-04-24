import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Optional,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { ApiRequestError } from "../api-envelope";
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
