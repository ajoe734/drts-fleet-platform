import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
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

function asHeaderRecord(
  headers: unknown,
): Record<string, string | string[] | undefined> {
  if (!headers || typeof headers !== "object") {
    return {};
  }

  return headers as Record<string, string | string[] | undefined>;
}

function includesAll(haystack: string[], needles: string[]): boolean {
  return needles.every((needle) => haystack.includes(needle));
}

@Injectable()
export class BootstrapAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isOpenRoute =
      this.reflector.getAllAndOverride<boolean>(AUTH_OPEN_ROUTE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? false;

    if (isOpenRoute) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedRequestLike>();
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
        : resolveRouteAuthPolicy(
            request.method ?? "GET",
            request.originalUrl ?? request.url ?? "",
          );

    if (!policy) {
      const anonymousIdentity = extractBootstrapRequestIdentity(
        asHeaderRecord(request.headers),
        {
          allowAnonymous: true,
          method: request.method ?? undefined,
          requestUrl: request.originalUrl ?? request.url ?? undefined,
        },
      );
      if (anonymousIdentity) {
        request.identity = anonymousIdentity;
      }
      return true;
    }

    const identity = extractBootstrapRequestIdentity(
      asHeaderRecord(request.headers),
      {
        allowAnonymous: false,
        method: request.method ?? undefined,
        requestUrl: request.originalUrl ?? request.url ?? undefined,
      },
    );

    if (!identity) {
      throw new ApiRequestError(
        401,
        "AUTH_REQUIRED",
        "Bootstrap auth headers are required for this route.",
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
