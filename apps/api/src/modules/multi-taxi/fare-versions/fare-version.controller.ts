import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Put,
} from "@nestjs/common";
import type {
  CreatePlatformFareVersionCommand,
  RecordPlatformFareVersionFilingCommand,
  RetirePlatformFareVersionCommand,
  SchedulePlatformFareVersionCommand,
  UpdatePlatformFareVersionCommand,
} from "@drts/contracts";
import {
  ApiRequestError,
  toApiSuccessEnvelope,
} from "../../../common/api-envelope";
import { CurrentIdentity, RequireRealms } from "../../../common/auth";
import type { BootstrapRequestIdentity } from "../../../common/auth";
import type { FareCommandContext } from "./fare-version.types";
import { FareVersionService } from "./fare-version.service";

@Controller("platform-admin/multi-taxi/fare-versions")
@RequireRealms("platform", "system")
export class FareVersionController {
  constructor(private readonly service: FareVersionService) {}

  private context(
    identity: BootstrapRequestIdentity | null,
    requestId?: string,
  ) {
    if (!identity?.actorId)
      throw new ApiRequestError(
        403,
        "actor_required",
        "An authenticated actor is required to record the fare action.",
      );
    return {
      actorId: identity.actorId,
      actorType: identity.actorType as FareCommandContext["actorType"],
      ...(requestId ? { requestId } : {}),
    };
  }

  @Get()
  async list(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(await this.service.list(), requestId);
  }
  @Get(":fareVersionId")
  async get(
    @Param("fareVersionId") id: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(await this.service.get(id), requestId);
  }
  @Post()
  async create(
    @Body() command: CreatePlatformFareVersionCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("idempotency-key") key?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.service.create(
        command,
        key,
        this.context(identity, requestId),
      ),
      requestId,
    );
  }
  @Put(":fareVersionId")
  async update(
    @Param("fareVersionId") id: string,
    @Body() command: UpdatePlatformFareVersionCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("idempotency-key") key?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.service.update(
        id,
        command,
        key,
        this.context(identity, requestId),
      ),
      requestId,
    );
  }
  @Post(":fareVersionId/file")
  async file(
    @Param("fareVersionId") id: string,
    @Body() command: RecordPlatformFareVersionFilingCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("idempotency-key") key?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.service.file(
        id,
        command,
        key,
        this.context(identity, requestId),
      ),
      requestId,
    );
  }
  @Post(":fareVersionId/schedule")
  async schedule(
    @Param("fareVersionId") id: string,
    @Body() command: SchedulePlatformFareVersionCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("idempotency-key") key?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.service.schedule(
        id,
        command,
        key,
        this.context(identity, requestId),
      ),
      requestId,
    );
  }
  @Post(":fareVersionId/retire")
  async retire(
    @Param("fareVersionId") id: string,
    @Body() command: RetirePlatformFareVersionCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("idempotency-key") key?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.service.retire(
        id,
        command,
        key,
        this.context(identity, requestId),
      ),
      requestId,
    );
  }
}
