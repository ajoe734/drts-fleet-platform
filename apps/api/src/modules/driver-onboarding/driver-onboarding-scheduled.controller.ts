import { Controller, Headers, HttpStatus, Post } from "@nestjs/common";
import {
  ApiRequestError,
  toApiSuccessEnvelope,
} from "../../common/api-envelope";
import {
  CurrentIdentity,
  RequireRealms,
  RequireScopes,
} from "../../common/auth/auth.decorators";
import type { BootstrapRequestIdentity } from "../../common/auth/auth.types";
import { DriverOnboardingDeliveryService } from "./driver-onboarding-delivery.service";

const DRAIN_SCOPE = "driver:onboarding:notify";

@Controller()
export class DriverOnboardingScheduledController {
  constructor(private readonly delivery: DriverOnboardingDeliveryService) {}

  @Post("internal/scheduled-tasks/driver-onboarding-notifications/drain")
  @RequireRealms("system")
  @RequireScopes(DRAIN_SCOPE)
  async drain(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    if (
      identity?.realm !== "system" ||
      identity.actorType !== "system" ||
      identity.issuer !== "https://accounts.google.com" ||
      !identity.scopes.includes(DRAIN_SCOPE)
    ) {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "AUTHZ_SCOPE_DENIED",
        "Only the authorized scheduler workload can drain driver onboarding notifications.",
      );
    }
    return toApiSuccessEnvelope(await this.delivery.drain(), requestId);
  }
}
