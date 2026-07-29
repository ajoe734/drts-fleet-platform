import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  StreamableFile,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";

import { toApiSuccessEnvelope } from "../../common/api-envelope";
import type { BootstrapRequestIdentity } from "../../common/auth";
import {
  CurrentIdentity,
  RequireRealms,
  RequireScopes,
} from "../../common/auth";
import { READ_HEAVY_RATE_LIMIT } from "../../common/throttling/rate-limit.constants";
import { CertificateSupportService } from "./certificate-support.service";
import type { CertificateRegenerationCommand } from "./certificate-support.types";

@RequireRealms("platform")
@RequireScopes("foundation:read")
@Controller("platform-admin/multi-taxi/certificates")
export class CertificateSupportController {
  constructor(private readonly service: CertificateSupportService) {}

  @Get()
  @Throttle(READ_HEAVY_RATE_LIMIT)
  async list(
    @Query("q") search?: string,
    @Query("state") state?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const items = await this.service.list({
      ...(search !== undefined ? { search } : {}),
      ...(state !== undefined ? { state } : {}),
    });
    return toApiSuccessEnvelope(
      {
        items,
        total: items.length,
        query: search?.trim() || null,
      },
      requestId,
    );
  }

  @Get(":certificateId")
  @Throttle(READ_HEAVY_RATE_LIMIT)
  async get(
    @Param("certificateId") certificateId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.service.get(certificateId),
      requestId,
    );
  }

  @Get(":certificateId/artifacts/html")
  @Throttle(READ_HEAVY_RATE_LIMIT)
  async getHtmlArtifact(@Param("certificateId") certificateId: string) {
    return this.toStreamableFile(
      await this.service.getArtifact(certificateId, "html"),
    );
  }

  @Get(":certificateId/artifacts/pdf")
  @Throttle(READ_HEAVY_RATE_LIMIT)
  async getPdfArtifact(@Param("certificateId") certificateId: string) {
    return this.toStreamableFile(
      await this.service.getArtifact(certificateId, "pdf"),
    );
  }

  @Post(":certificateId/actions/regenerate")
  @RequireScopes("foundation:write")
  async regenerate(
    @Param("certificateId") certificateId: string,
    @Body() command: CertificateRegenerationCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("idempotency-key") idempotencyKey?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.service.regenerate(certificateId, {
        actorId: identity?.actorId ?? "",
        ...(command.reason !== undefined ? { reason: command.reason } : {}),
        ...(idempotencyKey ? { idempotencyKey } : {}),
        ...(requestId ? { requestId } : {}),
      }),
      requestId,
    );
  }

  private toStreamableFile(artifact: {
    buffer: Buffer;
    contentType: string;
    fileName: string;
  }) {
    return new StreamableFile(artifact.buffer, {
      type: artifact.contentType,
      disposition: `inline; filename="${artifact.fileName}"`,
    });
  }
}
