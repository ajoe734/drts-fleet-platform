import { Injectable, Logger } from "@nestjs/common";
import {
  ApiRequestError,
  toApiListData,
  type ApiPageInfo,
} from "../../common/api-envelope";
import type { BootstrapRequestIdentity } from "../../common/auth/auth.types";
import { HostViewRepository } from "./host-view.repository";
import {
  HOST_ERROR_CODES,
  type HostVehicleSummary,
  type HostVehicleEarningsSummary,
  type HostVehicleMaintenanceItem,
  type HostVehicleTripItem,
  type HostVehicleCaseItem,
} from "./host-view.types";

export interface PaginationQuery {
  page?: number | undefined;
  pageSize?: number | undefined;
}

@Injectable()
export class HostViewService {
  private readonly logger = new Logger(HostViewService.name);

  constructor(private readonly repository: HostViewRepository) {}

  /**
   * Validates partner identity and extracts the effective authenticated partnerId.
   */
  public resolvePartnerId(
    identity: BootstrapRequestIdentity | null | undefined,
    requiredScope?: string,
  ): string {
    if (!identity) {
      throw new ApiRequestError(
        401,
        HOST_ERROR_CODES.UNAUTHORIZED,
        "Authentication required to access host vehicle views.",
      );
    }

    // System realm is allowed bypass/internal inspection
    if (identity.realm === "system") {
      const partnerId =
        identity.partnerId ?? identity.actorId ?? "system_partner";
      return partnerId;
    }

    if (identity.realm !== "partner") {
      throw new ApiRequestError(
        403,
        HOST_ERROR_CODES.FORBIDDEN,
        "Forbidden: only partner realm principals can access host vehicle views.",
      );
    }

    const partnerId = identity.partnerId ?? identity.actorId;
    if (!partnerId) {
      throw new ApiRequestError(
        401,
        HOST_ERROR_CODES.UNAUTHORIZED,
        "Authentication required: missing partner identification in claim.",
      );
    }

    if (requiredScope && identity.scopes && identity.scopes.length > 0) {
      const hasScope =
        identity.scopes.includes(requiredScope) ||
        identity.scopes.includes("*") ||
        identity.scopes.includes("partner:admin") ||
        identity.scopes.includes("system:internal");
      if (!hasScope) {
        throw new ApiRequestError(
          403,
          HOST_ERROR_CODES.FORBIDDEN,
          `Forbidden: missing required scope '${requiredScope}'.`,
        );
      }
    }

    return partnerId;
  }

  /**
   * Asserts that the vehicle exists AND is actively owned by the authenticated partner.
   * If the vehicle does not exist, or is owned by another partner, or ownership has lapsed,
   * STRICTLY returns 404 HOST_VEHICLE_NOT_FOUND (Anti-enumeration security invariant).
   */
  public async assertVehicleOwnership(
    vehicleId: string,
    partnerId: string,
  ): Promise<HostVehicleSummary> {
    const vehicle = await this.repository.getVehicleByIdAndOwner(
      vehicleId,
      partnerId,
    );
    if (!vehicle) {
      throw new ApiRequestError(
        404,
        HOST_ERROR_CODES.VEHICLE_NOT_FOUND,
        "Host vehicle not found or does not belong to the authenticated owner.",
      );
    }
    return vehicle;
  }

  /**
   * Lists vehicles owned by the authenticated host with pagination.
   */
  async listVehicles(
    identity: BootstrapRequestIdentity | null | undefined,
    query?: PaginationQuery,
  ): Promise<{ items: HostVehicleSummary[]; pageInfo: ApiPageInfo }> {
    const partnerId = this.resolvePartnerId(identity, "owned:read");
    const allVehicles = await this.repository.listVehiclesByOwner(partnerId);

    return this.paginate(allVehicles, query);
  }

  /**
   * Gets vehicle earnings summary for a given month (YYYY-MM).
   * Validates ownership before returning earnings.
   */
  async getVehicleEarnings(
    vehicleId: string,
    identity: BootstrapRequestIdentity | null | undefined,
    month?: string,
  ): Promise<HostVehicleEarningsSummary> {
    const partnerId = this.resolvePartnerId(identity, "reports:read");
    await this.assertVehicleOwnership(vehicleId, partnerId);

    const period = month && /^\d{4}-\d{2}$/.test(month)
      ? month
      : new Date().toISOString().slice(0, 7);

    return this.repository.getEarningsSummary(vehicleId, period);
  }

  /**
   * Lists maintenance records for a host-owned vehicle with pagination.
   * Validates ownership before returning records.
   */
  async listVehicleMaintenance(
    vehicleId: string,
    identity: BootstrapRequestIdentity | null | undefined,
    query?: PaginationQuery,
  ): Promise<{ items: HostVehicleMaintenanceItem[]; pageInfo: ApiPageInfo }> {
    const partnerId = this.resolvePartnerId(identity, "maintenance:read");
    await this.assertVehicleOwnership(vehicleId, partnerId);

    const records = await this.repository.listMaintenanceByVehicle(vehicleId);
    return this.paginate(records, query);
  }

  /**
   * Lists de-identified trips for a host-owned vehicle with pagination.
   * Validates ownership before returning trips.
   */
  async listVehicleTrips(
    vehicleId: string,
    identity: BootstrapRequestIdentity | null | undefined,
    query?: PaginationQuery,
  ): Promise<{ items: HostVehicleTripItem[]; pageInfo: ApiPageInfo }> {
    const partnerId = this.resolvePartnerId(identity, "owned:read");
    await this.assertVehicleOwnership(vehicleId, partnerId);

    const trips = await this.repository.listTripsByVehicle(vehicleId);
    return this.paginate(trips, query);
  }

  /**
   * Lists de-identified cases for a host-owned vehicle with pagination.
   * Validates ownership before returning cases.
   */
  async listVehicleCases(
    vehicleId: string,
    identity: BootstrapRequestIdentity | null | undefined,
    query?: PaginationQuery,
  ): Promise<{ items: HostVehicleCaseItem[]; pageInfo: ApiPageInfo }> {
    const partnerId = this.resolvePartnerId(identity, "owned:read");
    await this.assertVehicleOwnership(vehicleId, partnerId);

    const cases = await this.repository.listCasesByVehicle(vehicleId);
    return this.paginate(cases, query);
  }

  /**
   * Rejects any mutation attempt with 405 Method Not Allowed.
   */
  assertReadOnly(): never {
    throw new ApiRequestError(
      405,
      HOST_ERROR_CODES.MUTATION_NOT_SUPPORTED,
      "Host vehicle views are strictly read-only; mutation requests are not supported.",
    );
  }

  // --------------------------------------------------------------------------
  // Pagination Helper
  // --------------------------------------------------------------------------

  private paginate<T>(
    items: T[],
    query?: PaginationQuery,
  ): { items: T[]; pageInfo: ApiPageInfo } {
    const page = Math.max(1, Number(query?.page ?? 1));
    const rawPageSize = Number(query?.pageSize ?? 20);
    const pageSize = Math.max(1, Math.min(100, isNaN(rawPageSize) ? 20 : rawPageSize));

    const totalItems = items.length;
    const totalPages = Math.ceil(totalItems / pageSize) || (totalItems === 0 ? 0 : 1);
    const startIndex = (page - 1) * pageSize;
    const paginatedItems = items.slice(startIndex, startIndex + pageSize);

    return toApiListData(paginatedItems, {
      page,
      pageSize,
      totalItems,
      totalPages,
    });
  }
}
