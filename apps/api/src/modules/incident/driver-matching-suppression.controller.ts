import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from "@nestjs/common";

import type { ExtendDriverMatchingSuppressionCommand } from "@drts/contracts";

import {
  toApiListData,
  toApiSuccessEnvelope,
} from "../../common/api-envelope";
import { DriverMatchingSuppressionService } from "./driver-matching-suppression.service";

@Controller("driver-matching-suppressions")
export class DriverMatchingSuppressionController {
  constructor(
    private readonly suppressionService: DriverMatchingSuppressionService,
  ) {}

  @Get()
  list(
    @Query("driverId") driverId?: string,
    @Query("activeOnly") activeOnly?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const items = this.suppressionService.listSuppressions({
      ...(driverId ? { driverId } : {}),
      activeOnly: activeOnly === "true",
    });
    return toApiSuccessEnvelope(toApiListData(items), requestId);
  }

  @Get(":suppressionId")
  get(
    @Param("suppressionId") suppressionId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.suppressionService.getSuppression(suppressionId),
      requestId,
    );
  }

  @Post(":suppressionId/extend")
  extend(
    @Param("suppressionId") suppressionId: string,
    @Body() command: ExtendDriverMatchingSuppressionCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.suppressionService.extendSuppression(
        suppressionId,
        command,
        requestId,
      ),
      requestId,
    );
  }
}
