import { Body, Controller, Get, Headers, Post, Query } from "@nestjs/common";

import type {
  ResolveAddressCommand,
  ReverseGeocodeCommand,
} from "@drts/contracts";

import { toApiSuccessEnvelope } from "../../common/api-envelope";
import { GeoService } from "./geo.service";

@Controller("geo")
export class GeoController {
  constructor(private readonly geoService: GeoService) {}

  @Get("search")
  async search(
    @Query() query: Record<string, string | undefined>,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.geoService.searchFromHttpQuery(query),
      requestId,
    );
  }

  @Post("resolve")
  async resolve(
    @Body() command: ResolveAddressCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.geoService.resolve(command),
      requestId,
    );
  }

  @Post("reverse")
  async reverse(
    @Body() command: ReverseGeocodeCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.geoService.reverse(command),
      requestId,
    );
  }
}
