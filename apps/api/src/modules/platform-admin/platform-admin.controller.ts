import { Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";

import type {
  CreatePublicInfoVersionCommand,
  GeneratePlacardVersionCommand,
  PublishPublicInfoVersionCommand,
} from "@drts/contracts";

import { toApiSuccessEnvelope } from "../../common/api-envelope";
import { PlatformAdminService } from "./platform-admin.service";

@Controller("platform-admin")
export class PlatformAdminController {
  constructor(private readonly platformAdminService: PlatformAdminService) {}

  @Get("public-info")
  listPublicInfoVersions(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      {
        items: this.platformAdminService.listPublicInfoVersions(),
      },
      requestId,
    );
  }

  @Post("public-info")
  createPublicInfoVersion(
    @Body() command: CreatePublicInfoVersionCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.platformAdminService.createPublicInfoVersion(command, requestId),
      requestId,
    );
  }

  @Post("public-info/:versionId/publish")
  publishPublicInfoVersion(
    @Param("versionId") versionId: string,
    @Body() command: PublishPublicInfoVersionCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.platformAdminService.publishPublicInfoVersion(
        versionId,
        command,
        requestId,
      ),
      requestId,
    );
  }

  @Get("placards")
  listPlacardVersions(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      {
        items: this.platformAdminService.listPlacardVersions(),
      },
      requestId,
    );
  }

  @Post("placards")
  generatePlacardVersion(
    @Body() command: GeneratePlacardVersionCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.platformAdminService.generatePlacardVersion(command, requestId),
      requestId,
    );
  }
}
