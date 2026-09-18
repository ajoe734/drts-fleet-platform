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
import {
  CurrentIdentity,
  RequireRealms,
  RequireScopes,
} from "../../common/auth";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { TeslaIntegrationService } from "./tesla-integration.service";

@Controller("tesla-integration")
@RequireRealms("system", "ops", "driver")
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
  @RequireScopes("owned:write")
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
  @RequireScopes("owned:write")
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
  @RequireScopes("owned:write")
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
  @RequireScopes("owned:read")
  discoverVehicles(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      {
        items: this.teslaIntegrationService.discoverVehicles(),
      },
      requestId,
    );
  }

  @Get("vehicles/bindings")
  @RequireScopes("owned:read")
  listBindings(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      {
        items: this.teslaIntegrationService.listBindings(),
      },
      requestId,
    );
  }

  @Post("vehicles/bind")
  @RequireScopes("owned:write")
  bindVehicle(
    @Body() command: BindTeslaVehicleCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity,
    @Headers("x-request-id") requestId?: string,
  ) {
    this.teslaIntegrationService.assertIdentityCanAccessVehicle(
      identity,
      command.vehicleId,
    );
    return toApiSuccessEnvelope(
      this.teslaIntegrationService.bindVehicle(command, requestId),
      requestId,
    );
  }

  @Post("virtual-key/pairing")
  @RequireScopes("owned:write")
  pairVirtualKey(
    @Body() command: TeslaPairVirtualKeyCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity,
    @Headers("x-request-id") requestId?: string,
  ) {
    this.teslaIntegrationService.assertIdentityCanAccessVehicle(
      identity,
      command.vehicleId,
    );
    return toApiSuccessEnvelope(
      this.teslaIntegrationService.pairVirtualKey(command, requestId),
      requestId,
    );
  }

  @Get("virtual-key/pairing/:vehicleId")
  @RequireScopes("owned:read")
  getVirtualKeyStatus(
    @Param("vehicleId") vehicleId: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity,
    @Headers("x-request-id") requestId?: string,
  ) {
    this.teslaIntegrationService.assertIdentityCanAccessVehicle(
      identity,
      vehicleId,
    );
    return toApiSuccessEnvelope(
      this.teslaIntegrationService.getVirtualKeyStatus(vehicleId),
      requestId,
    );
  }

  @Post("telemetry/configure")
  @RequireScopes("owned:write")
  configureTelemetry(
    @Body() command: ConfigureTeslaTelemetryCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity,
    @Headers("x-request-id") requestId?: string,
  ) {
    this.teslaIntegrationService.assertIdentityCanAccessVehicle(
      identity,
      command.vehicleId,
    );
    return toApiSuccessEnvelope(
      this.teslaIntegrationService.configureTelemetry(command, requestId),
      requestId,
    );
  }

  @Get("telemetry/:vehicleId/status")
  @RequireScopes("owned:read")
  getTelemetryStatus(
    @Param("vehicleId") vehicleId: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity,
    @Headers("x-request-id") requestId?: string,
  ) {
    this.teslaIntegrationService.assertIdentityCanAccessVehicle(
      identity,
      vehicleId,
    );
    return toApiSuccessEnvelope(
      this.teslaIntegrationService.getTelemetryStatus(vehicleId),
      requestId,
    );
  }

  @Get("telemetry/:vehicleId/public-sample")
  @RequireScopes("owned:read")
  getPublicTelemetrySample(
    @Param("vehicleId") vehicleId: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity,
    @Headers("x-request-id") requestId?: string,
  ) {
    this.teslaIntegrationService.assertIdentityCanAccessVehicle(
      identity,
      vehicleId,
    );
    return toApiSuccessEnvelope(
      this.teslaIntegrationService.getPublicTelemetrySample(vehicleId),
      requestId,
    );
  }

  @Get("telemetry/:vehicleId/projection")
  @RequireScopes("owned:read")
  getTelemetryProjection(
    @Param("vehicleId") vehicleId: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity,
    @Headers("x-request-id") requestId?: string,
  ) {
    this.teslaIntegrationService.assertIdentityCanAccessVehicle(
      identity,
      vehicleId,
    );
    return toApiSuccessEnvelope(
      this.teslaIntegrationService.getTelemetryProjection(vehicleId),
      requestId,
    );
  }

  @Post("commands")
  @RequireScopes("owned:write")
  async issueCommand(
    @Body() command: IssueTeslaCommandCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity,
    @Headers("x-request-id") requestId?: string,
  ) {
    this.teslaIntegrationService.assertIdentityCanAccessVehicle(
      identity,
      command.vehicleId,
    );
    return toApiSuccessEnvelope(
      await this.teslaIntegrationService.issueCommand(command, requestId),
      requestId,
    );
  }

  @Get("commands/:commandId")
  @RequireScopes("owned:read")
  getCommandReceipt(
    @Param("commandId") commandId: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity,
    @Headers("x-request-id") requestId?: string,
  ) {
    const receipt = this.teslaIntegrationService.getReceipt(commandId);
    this.teslaIntegrationService.assertIdentityCanAccessVehicle(
      identity,
      receipt.vehicleId,
    );
    return toApiSuccessEnvelope(receipt, requestId);
  }
}
