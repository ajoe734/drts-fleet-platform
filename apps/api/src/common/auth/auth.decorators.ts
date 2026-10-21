import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from "@nestjs/common";

import type { RequestAuthRealm, RequestIdentity } from "./auth.types";
import {
  AUTH_ALLOWED_REALMS_KEY,
  AUTH_OPEN_ROUTE_KEY,
  AUTH_REQUIRED_SCOPES_KEY,
  FEATURE_GATED_FLAG_KEY,
} from "./auth.constants";
import { extractBootstrapRequestIdentity } from "./auth.extractor";

export const OpenRoute = () => SetMetadata(AUTH_OPEN_ROUTE_KEY, true);

export const RequireScopes = (...scopes: string[]) =>
  SetMetadata(AUTH_REQUIRED_SCOPES_KEY, scopes);

export const RequireRealms = (...allowedRealms: RequestAuthRealm[]) =>
  SetMetadata(AUTH_ALLOWED_REALMS_KEY, allowedRealms);

export const FeatureGated = (flagKey: string) =>
  SetMetadata(FEATURE_GATED_FLAG_KEY, flagKey);

export const CurrentIdentity = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RequestIdentity | null => {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      identity?: RequestIdentity;
      method?: string;
      originalUrl?: string;
      url?: string;
    }>();

    return (
      request.identity ??
      extractBootstrapRequestIdentity(request.headers, {
        allowAnonymous: true,
        method: request.method,
        requestUrl: request.originalUrl ?? request.url,
      })
    );
  },
);
