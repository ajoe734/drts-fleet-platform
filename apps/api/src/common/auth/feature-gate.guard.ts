import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { ApiRequestError } from "../api-envelope";
import { FeatureFlagsService } from "../../modules/feature-flags/feature-flags.service";
import { FEATURE_GATED_FLAG_KEY } from "./auth.constants";
import type { AuthenticatedRequestLike } from "./auth.types";

function normalizeHeaderValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

@Injectable()
export class FeatureGateGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly featureFlagsService: FeatureFlagsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const flagKey =
      this.reflector.getAllAndOverride<string>(FEATURE_GATED_FLAG_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? null;

    if (!flagKey) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedRequestLike>();
    const tenantId =
      request.identity?.tenantId ??
      (normalizeHeaderValue(request.headers["x-tenant-id"]) || undefined);
    const enabled = await this.featureFlagsService.isEnabled(flagKey, tenantId);

    if (enabled) {
      return true;
    }

    throw new ApiRequestError(
      403,
      "FEATURE_FLAG_DISABLED",
      "Feature flag is disabled for this route.",
      {
        flagKey,
        method: request.method ?? "GET",
        route: request.originalUrl ?? request.url,
        tenantId: tenantId ?? null,
      },
    );
  }
}
