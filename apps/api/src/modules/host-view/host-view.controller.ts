import {
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { toApiSuccessEnvelope } from "../../common/api-envelope";
import {
  CurrentIdentity,
  RequireRealms,
  RequireScopes,
} from "../../common/auth/auth.decorators";
import type { BootstrapRequestIdentity } from "../../common/auth/auth.types";
import { HostViewService } from "./host-view.service";

@Controller("host")
@RequireRealms("partner")
export class HostViewController {
  constructor(private readonly hostViewService: HostViewService) {}

  /**
   * GET /api/host/vehicles
   * Queries vehicles owned by the authenticated partner.
   */
  @Get("vehicles")
  @RequireScopes("owned:read")
  async listVehicles(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Query("page") page?: number,
    @Query("pageSize") pageSize?: number,
    @Headers("x-request-id") requestId?: string,
  ) {
    const result = await this.hostViewService.listVehicles(identity, {
      page: page != null ? Number(page) : undefined,
      pageSize: pageSize != null ? Number(pageSize) : undefined,
    });
    return toApiSuccessEnvelope(result, requestId);
  }

  /**
   * GET /api/host/vehicles/:vehicleId/earnings
   * Queries earnings summary for a vehicle owned by the authenticated partner.
   */
  @Get("vehicles/:vehicleId/earnings")
  @RequireScopes("reports:read", "owned:read")
  async getEarnings(
    @Param("vehicleId") vehicleId: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Query("month") month?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const result = await this.hostViewService.getVehicleEarnings(
      vehicleId,
      identity,
      month,
    );
    return toApiSuccessEnvelope(result, requestId);
  }

  /**
   * GET /api/host/vehicles/:vehicleId/maintenance
   * Queries maintenance logs for a vehicle owned by the authenticated partner.
   */
  @Get("vehicles/:vehicleId/maintenance")
  @RequireScopes("maintenance:read", "owned:read")
  async listMaintenance(
    @Param("vehicleId") vehicleId: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Query("page") page?: number,
    @Query("pageSize") pageSize?: number,
    @Headers("x-request-id") requestId?: string,
  ) {
    const result = await this.hostViewService.listVehicleMaintenance(
      vehicleId,
      identity,
      {
        page: page != null ? Number(page) : undefined,
        pageSize: pageSize != null ? Number(pageSize) : undefined,
      },
    );
    return toApiSuccessEnvelope(result, requestId);
  }

  /**
   * GET /api/host/vehicles/:vehicleId/trips
   * Queries de-identified trips for a vehicle owned by the authenticated partner.
   */
  @Get("vehicles/:vehicleId/trips")
  @RequireScopes("owned:read")
  async listTrips(
    @Param("vehicleId") vehicleId: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Query("page") page?: number,
    @Query("pageSize") pageSize?: number,
    @Headers("x-request-id") requestId?: string,
  ) {
    const result = await this.hostViewService.listVehicleTrips(
      vehicleId,
      identity,
      {
        page: page != null ? Number(page) : undefined,
        pageSize: pageSize != null ? Number(pageSize) : undefined,
      },
    );
    return toApiSuccessEnvelope(result, requestId);
  }

  /**
   * GET /api/host/vehicles/:vehicleId/cases
   * Queries de-identified complaint cases for a vehicle owned by the authenticated partner.
   */
  @Get("vehicles/:vehicleId/cases")
  @RequireScopes("owned:read")
  async listCases(
    @Param("vehicleId") vehicleId: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Query("page") page?: number,
    @Query("pageSize") pageSize?: number,
    @Headers("x-request-id") requestId?: string,
  ) {
    const result = await this.hostViewService.listVehicleCases(
      vehicleId,
      identity,
      {
        page: page != null ? Number(page) : undefined,
        pageSize: pageSize != null ? Number(pageSize) : undefined,
      },
    );
    return toApiSuccessEnvelope(result, requestId);
  }

  // --------------------------------------------------------------------------
  // AC-HOST-NEG-2: Mutation endpoints strictly prohibited (405 Method Not Allowed)
  // --------------------------------------------------------------------------

  @Post("vehicles*")
  rejectPost(): never {
    return this.hostViewService.assertReadOnly();
  }

  @Put("vehicles*")
  rejectPut(): never {
    return this.hostViewService.assertReadOnly();
  }

  @Patch("vehicles*")
  rejectPatch(): never {
    return this.hostViewService.assertReadOnly();
  }

  @Delete("vehicles*")
  rejectDelete(): never {
    return this.hostViewService.assertReadOnly();
  }
}
