import { Body, Controller, Get, Headers, Patch, Post } from "@nestjs/common";

import type {
  CreateDriverProfileCommand,
  DriverProfileRecord,
  UpdateDriverProfileCommand,
} from "@drts/contracts";

import { toApiSuccessEnvelope } from "../../common/api-envelope";
import { CurrentIdentity } from "../../common/auth";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { DriverProfileService } from "./driver-profile.service";

@Controller("driver/profile")
export class DriverProfileController {
  constructor(private readonly driverProfileService: DriverProfileService) {}

  @Get()
  getProfile(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope<DriverProfileRecord>(
      this.driverProfileService.getProfile(identity?.actorId),
      requestId,
    );
  }

  @Post()
  createProfile(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Body() command: CreateDriverProfileCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope<DriverProfileRecord>(
      this.driverProfileService.createProfile(
        identity?.actorId,
        command,
        requestId,
      ),
      requestId,
    );
  }

  @Patch()
  updateProfile(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Body() command: UpdateDriverProfileCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope<DriverProfileRecord>(
      this.driverProfileService.updateProfile(
        identity?.actorId,
        command,
        requestId,
      ),
      requestId,
    );
  }
}
