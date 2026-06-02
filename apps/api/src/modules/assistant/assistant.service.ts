import { Injectable } from "@nestjs/common";

import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import { OPS_ASSISTANT_FLAG_KEY } from "./assistant.constants";

/**
 * Read-model describing whether the ops-console assistant is available for a
 * given realm/tenant. The ops-console widget consults this to decide whether to
 * render, and backend assistant routes gate on the same flag.
 */
export interface AssistantAvailability {
  flagKey: string;
  enabled: boolean;
  tenantId: string | null;
}

@Injectable()
export class AssistantService {
  constructor(private readonly featureFlags: FeatureFlagsService) {}

  /**
   * Resolve assistant availability for the supplied realm/tenant. A tenant
   * override takes precedence over the global default (handled by
   * FeatureFlagsService); when no flag exists the assistant stays disabled.
   */
  async getAvailability(
    tenantId?: string | null,
  ): Promise<AssistantAvailability> {
    const enabled = await this.featureFlags.isEnabled(
      OPS_ASSISTANT_FLAG_KEY,
      tenantId ?? undefined,
    );

    return {
      flagKey: OPS_ASSISTANT_FLAG_KEY,
      enabled,
      tenantId: tenantId ?? null,
    };
  }

  /**
   * Convenience predicate for backend callers that only need the boolean.
   */
  async isEnabled(tenantId?: string | null): Promise<boolean> {
    return this.featureFlags.isEnabled(
      OPS_ASSISTANT_FLAG_KEY,
      tenantId ?? undefined,
    );
  }
}
