import { Body, Controller, Headers, Post, Req } from "@nestjs/common";

import { toApiSuccessEnvelope } from "../../common/api-envelope";
import { TeslaRegulatoryEventsService } from "./tesla-regulatory-events.service";

type RawBodyRequest = {
  rawBody?: Buffer;
  rawHeaders?: string[];
};

export const TESLA_REGULATORY_EVENTS_ROUTE =
  "internal/providers/tesla/regulatory-events";

@Controller()
export class TeslaRegulatoryEventsController {
  constructor(
    private readonly teslaRegulatoryEventsService: TeslaRegulatoryEventsService,
  ) {}

  @Post(TESLA_REGULATORY_EVENTS_ROUTE)
  async ingest(
    @Body() body: unknown,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Headers("x-request-id") requestId: string | undefined,
    @Req() request: RawBodyRequest,
  ) {
    const ingressRequest = {
      body,
      headers,
      rawHeaders: request.rawHeaders ?? [],
      ...(request.rawBody ? { rawBody: request.rawBody } : {}),
      ...(requestId ? { requestId } : {}),
    };

    return toApiSuccessEnvelope(
      await this.teslaRegulatoryEventsService.ingest(ingressRequest),
      requestId,
    );
  }
}
