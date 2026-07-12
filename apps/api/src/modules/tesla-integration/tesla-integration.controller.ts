import { Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";

import type {
  BindTeslaVehicleCommand,
  ConfigureTeslaTelemetryCommand,
  IssueTeslaCommandCommand,
  TeslaBeginOAuthCommand,
  TeslaPairVirtualKeyCommand,
  TeslaRefreshOAuthCommand,
  TeslaRevokeOAuthCommand,
} from "@drts/contracts";

import { toApiSuccessEnvelope } from "../../common/api-envelope";
import { TeslaIntegrationService } from "./tesla-integration.service";

@Controller("tesla-integration")
export class TeslaIntegrationController {
  constructor(
    private readonly teslaIntegrationService: TeslaIntegrationService,
  ) {}

  @Get("regions")
  listRegions(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      {
        items: this.teslaIntegrationService.listRegions(),
      },
      requestId,
    );
  }

  @Post("oauth/session")
  beginOAuth(
    @Body() command: TeslaBeginOAuthCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.teslaIntegrationService.beginOAuth(command, requestId),
      requestId,
    );
  }

  @Post("oauth/token/refresh")
  refreshOAuth(
    @Body() command: TeslaRefreshOAuthCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.teslaIntegrationService.refreshOAuth(command, requestId),
      requestId,
    );
  }

  @Post("oauth/token/revoke")
  revokeOAuth(
    @Body() command: TeslaRevokeOAuthCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.teslaIntegrationService.revokeOAuth(command, requestId),
      requestId,
    );
  }

  @Get("vehicles/discover")
  discoverVehicles(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      {
        items: this.teslaIntegrationService.discoverVehicles(),
      },
      requestId,
    );
  }

  @Get("vehicles/bindings")
  listBindings(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      {
        items: this.teslaIntegrationService.listBindings(),
      },
      requestId,
    );
  }

  @Post("vehicles/bind")
  bindVehicle(
    @Body() command: BindTeslaVehicleCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.teslaIntegrationService.bindVehicle(command, requestId),
      requestId,
    );
  }

  @Post("virtual-key/pairing")
  pairVirtualKey(
    @Body() command: TeslaPairVirtualKeyCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.teslaIntegrationService.pairVirtualKey(command, requestId),
      requestId,
    );
  }

  @Get("virtual-key/pairing/:vehicleId")
  getVirtualKeyStatus(
    @Param("vehicleId") vehicleId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.teslaIntegrationService.getVirtualKeyStatus(vehicleId),
      requestId,
    );
  }

  @Post("telemetry/configure")
  configureTelemetry(
    @Body() command: ConfigureTeslaTelemetryCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.teslaIntegrationService.configureTelemetry(command, requestId),
      requestId,
    );
  }

  @Get("telemetry/:vehicleId/status")
  getTelemetryStatus(
    @Param("vehicleId") vehicleId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.teslaIntegrationService.getTelemetryStatus(vehicleId),
      requestId,
    );
  }

  @Get("telemetry/:vehicleId/public-sample")
  getPublicTelemetrySample(
    @Param("vehicleId") vehicleId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.teslaIntegrationService.getPublicTelemetrySample(vehicleId),
      requestId,
    );
  }

  @Get("telemetry/:vehicleId/projection")
  getTelemetryProjection(
    @Param("vehicleId") vehicleId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.teslaIntegrationService.getTelemetryProjection(vehicleId),
      requestId,
    );
  }

  @Post("commands")
  async issueCommand(
    @Body() command: IssueTeslaCommandCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.teslaIntegrationService.issueCommand(command, requestId),
      requestId,
    );
  }

  @Get("commands/:commandId")
  getCommandReceipt(
    @Param("commandId") commandId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.teslaIntegrationService.getReceipt(commandId),
      requestId,
    );
  }
}
