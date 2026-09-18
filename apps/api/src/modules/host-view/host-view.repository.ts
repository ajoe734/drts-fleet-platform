import { Injectable, Logger, Optional } from "@nestjs/common";
import { DatabaseService } from "../../common/db";
import {
  maskVin,
  maskAreaSummary,
  mapComplaintCategory,
  mapComplaintStatus,
  mapMaintenanceStatus,
  extractResolutionSummary,
  type HostVehicleSummary,
  type HostVehicleEarningsSummary,
  type HostVehicleMaintenanceItem,
  type HostVehicleTripItem,
  type HostVehicleCaseItem,
} from "./host-view.types";

export interface SeedVehicleRecord {
  vehicleId: string;
  ownerPartnerId: string;
  plateNo: string;
  vin: string;
  vehicleForm: string;
  licenseClass: string;
  energyType: string;
  currentStatus: string;
  operatingFleetName: string;
  activeFlag?: boolean;
  contractPeriod?: {
    startAt: string;
    endAt: string;
    status: string;
  } | null;
}

interface HostVehicleProjectionRow {
  vehicle_id: string;
  owner_partner_id: string;
  plate_no: string;
  vin_masked: string;
  vehicle_form: string;
  license_class: string;
  energy_type: string;
  current_status: string;
  active_flag: boolean;
  operating_fleet_name: string;
  contract_period: unknown;
}

interface MaintenanceLogRow {
  log_id: string;
  vehicle_id: string;
  status: string;
  maintenance_type: string;
  description: string;
  scheduled_date: string | null;
  completed_date: string | null;
  cost_amount: string | number | null;
  notes: string | null;
  record: unknown;
}

interface DriverTaskTripRow {
  task_id: string;
  vehicle_id: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  actual_distance_km: number | null;
  fare_amount: string | number | null;
  pickup_address: string | null;
  dropoff_address: string | null;
}

interface ComplaintCaseRow {
  case_no: string;
  status: string;
  created_at: string;
  updated_at: string;
  record: unknown;
}

@Injectable()
export class HostViewRepository {
  private readonly logger = new Logger(HostViewRepository.name);

  // In-memory backing store for test runs and offline harness
  private readonly memoryVehicles = new Map<string, SeedVehicleRecord>();
  private readonly memoryMaintenance = new Map<
    string,
    HostVehicleMaintenanceItem[]
  >();
  private readonly memoryTrips = new Map<string, HostVehicleTripItem[]>();
  private readonly memoryCases = new Map<string, HostVehicleCaseItem[]>();

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  isEnabled(): boolean {
    return this.databaseService?.isEnabled() ?? false;
  }

  // --------------------------------------------------------------------------
  // In-Memory Setup / Seeding Helpers (For Test & Offline Harness)
  // --------------------------------------------------------------------------

  seedVehicle(vehicle: SeedVehicleRecord): void {
    this.memoryVehicles.set(vehicle.vehicleId, {
      ...vehicle,
      activeFlag: vehicle.activeFlag ?? true,
      contractPeriod: vehicle.contractPeriod ?? null,
    });
  }

  transferVehicleOwnership(
    vehicleId: string,
    newOwnerPartnerId: string,
  ): boolean {
    const existing = this.memoryVehicles.get(vehicleId);
    if (!existing) return false;
    existing.ownerPartnerId = newOwnerPartnerId;
    return true;
  }

  setVehicleActive(vehicleId: string, active: boolean): boolean {
    const existing = this.memoryVehicles.get(vehicleId);
    if (!existing) return false;
    existing.activeFlag = active;
    return true;
  }

  seedMaintenanceItem(item: HostVehicleMaintenanceItem): void {
    const list = this.memoryMaintenance.get(item.vehicleId) ?? [];
    list.push(item);
    this.memoryMaintenance.set(item.vehicleId, list);
  }

  seedTripItem(item: HostVehicleTripItem): void {
    const list = this.memoryTrips.get(item.vehicleId) ?? [];
    list.push(item);
    this.memoryTrips.set(item.vehicleId, list);
  }

  seedCaseItem(item: HostVehicleCaseItem): void {
    const list = this.memoryCases.get(item.vehicleId) ?? [];
    list.push(item);
    this.memoryCases.set(item.vehicleId, list);
  }

  clearMemory(): void {
    this.memoryVehicles.clear();
    this.memoryMaintenance.clear();
    this.memoryTrips.clear();
    this.memoryCases.clear();
  }

  // --------------------------------------------------------------------------
  // Vehicle Projections
  // --------------------------------------------------------------------------

  async listVehiclesByOwner(
    ownerPartnerId: string,
  ): Promise<HostVehicleSummary[]> {
    if (this.isEnabled()) {
      try {
        const result =
          await this.databaseService!.query<HostVehicleProjectionRow>(
            `SELECT vehicle_id, owner_partner_id, plate_no, vin_masked,
                    vehicle_form, license_class, energy_type, current_status,
                    active_flag, operating_fleet_name, contract_period
             FROM ops.phase1_host_vehicle_projections
             WHERE owner_partner_id = $1 AND active_flag = true
             ORDER BY created_at DESC`,
            [ownerPartnerId],
          );
        return result.rows.map((row) => this.mapProjectionRowToSummary(row));
      } catch (error) {
        this.logger.warn(
          `Database query failed in listVehiclesByOwner: ${(error as Error).message}. Falling back to memory.`,
        );
      }
    }

    const items: HostVehicleSummary[] = [];
    for (const v of this.memoryVehicles.values()) {
      if (v.ownerPartnerId === ownerPartnerId && v.activeFlag !== false) {
        items.push({
          vehicleId: v.vehicleId,
          plateNo: v.plateNo,
          vinMasked: maskVin(v.vin),
          vehicleForm: v.vehicleForm,
          licenseClass: v.licenseClass,
          energyType: v.energyType,
          currentStatus: v.currentStatus,
          operatingFleetName: v.operatingFleetName,
          contractPeriod: v.contractPeriod ?? null,
        });
      }
    }
    return items;
  }

  async getVehicleByIdAndOwner(
    vehicleId: string,
    ownerPartnerId: string,
  ): Promise<HostVehicleSummary | null> {
    if (this.isEnabled()) {
      try {
        const result =
          await this.databaseService!.query<HostVehicleProjectionRow>(
            `SELECT vehicle_id, owner_partner_id, plate_no, vin_masked,
                    vehicle_form, license_class, energy_type, current_status,
                    active_flag, operating_fleet_name, contract_period
             FROM ops.phase1_host_vehicle_projections
             WHERE vehicle_id = $1 AND owner_partner_id = $2 AND active_flag = true`,
            [vehicleId, ownerPartnerId],
          );
        if (result.rows.length === 0 || !result.rows[0]) {
          return null;
        }
        return this.mapProjectionRowToSummary(result.rows[0]);
      } catch (error) {
        this.logger.warn(
          `Database query failed in getVehicleByIdAndOwner: ${(error as Error).message}. Falling back to memory.`,
        );
      }
    }

    const v = this.memoryVehicles.get(vehicleId);
    if (!v || v.ownerPartnerId !== ownerPartnerId || v.activeFlag === false) {
      return null;
    }

    return {
      vehicleId: v.vehicleId,
      plateNo: v.plateNo,
      vinMasked: maskVin(v.vin),
      vehicleForm: v.vehicleForm,
      licenseClass: v.licenseClass,
      energyType: v.energyType,
      currentStatus: v.currentStatus,
      operatingFleetName: v.operatingFleetName,
      contractPeriod: v.contractPeriod ?? null,
    };
  }

  // --------------------------------------------------------------------------
  // Maintenance Logs
  // --------------------------------------------------------------------------

  async listMaintenanceByVehicle(
    vehicleId: string,
  ): Promise<HostVehicleMaintenanceItem[]> {
    if (this.isEnabled()) {
      try {
        const result = await this.databaseService!.query<MaintenanceLogRow>(
          `SELECT log_id, vehicle_id, status, maintenance_type, description,
                  scheduled_date, completed_date, cost_amount, notes, record
           FROM ops.phase1_maintenance_logs
           WHERE vehicle_id = $1
           ORDER BY created_at DESC`,
          [vehicleId],
        );
        return result.rows.map((row) => ({
          maintenanceId: row.log_id,
          vehicleId: row.vehicle_id,
          type: row.maintenance_type,
          description: row.description,
          status: mapMaintenanceStatus(row.status),
          scheduledAt: row.scheduled_date ? String(row.scheduled_date) : null,
          completedAt: row.completed_date ? String(row.completed_date) : null,
          cost: row.cost_amount != null ? Number(row.cost_amount) : null,
          notesSummary: row.notes ?? null,
        }));
      } catch (error) {
        this.logger.warn(
          `Database query failed in listMaintenanceByVehicle: ${(error as Error).message}. Falling back to memory.`,
        );
      }
    }

    const items = this.memoryMaintenance.get(vehicleId) ?? [];
    return items.map((m) => ({ ...m }));
  }

  // --------------------------------------------------------------------------
  // Trips
  // --------------------------------------------------------------------------

  async listTripsByVehicle(vehicleId: string): Promise<HostVehicleTripItem[]> {
    if (this.isEnabled()) {
      try {
        const result = await this.databaseService!.query<DriverTaskTripRow>(
          `SELECT t.task_id, t.vehicle_id, t.status, t.started_at, t.completed_at,
                  t.actual_distance_km,
                  COALESCE((t.fare->>'amount')::numeric, (o.record->'quotedFare'->>'amount')::numeric, 0) AS fare_amount,
                  o.record->'pickup'->>'address' AS pickup_address,
                  o.record->'dropoff'->>'address' AS dropoff_address
           FROM ops.phase1_driver_tasks t
           LEFT JOIN ops.phase1_owned_orders o ON o.order_id = t.order_id
           WHERE t.vehicle_id = $1
           ORDER BY t.created_at DESC`,
          [vehicleId],
        );
        return result.rows.map((row) => ({
          tripId: row.task_id,
          vehicleId: row.vehicle_id,
          startedAt: row.started_at ?? new Date().toISOString(),
          completedAt: row.completed_at,
          areaSummary: maskAreaSummary(row.pickup_address, row.dropoff_address),
          distanceKm: Number(row.actual_distance_km ?? 0),
          fareAmount: Number(row.fare_amount ?? 0),
          status: row.status,
        }));
      } catch (error) {
        this.logger.warn(
          `Database query failed in listTripsByVehicle: ${(error as Error).message}. Falling back to memory.`,
        );
      }
    }

    const items = this.memoryTrips.get(vehicleId) ?? [];
    return items.map((t) => ({ ...t }));
  }

  // --------------------------------------------------------------------------
  // Cases (De-identified)
  // --------------------------------------------------------------------------

  async listCasesByVehicle(vehicleId: string): Promise<HostVehicleCaseItem[]> {
    if (this.isEnabled()) {
      try {
        const result = await this.databaseService!.query<ComplaintCaseRow>(
          `SELECT c.case_no, c.status, c.created_at, c.updated_at, c.record
           FROM crm.phase1_complaint_cases c
           WHERE c.record->>'relatedVehicleId' = $1
              OR c.record->>'vehicleId' = $1
              OR c.record->>'relatedOrderId' IN (
                SELECT order_id FROM ops.phase1_dispatch_assignments WHERE vehicle_id = $1
                UNION
                SELECT order_id FROM ops.phase1_driver_tasks WHERE vehicle_id = $1
              )
           ORDER BY c.created_at DESC`,
          [vehicleId],
        );
        return result.rows.map((row) => {
          const rec = (row.record ?? {}) as Record<string, unknown>;
          return {
            caseId: row.case_no,
            vehicleId,
            category: mapComplaintCategory(rec.category as string | undefined),
            status: mapComplaintStatus(row.status),
            reportedAt: row.created_at,
            resolvedAt:
              row.status === "resolved" || row.status === "closed"
                ? row.updated_at
                : null,
            resolutionSummary: extractResolutionSummary({
              closingNote: rec.closingNote as string | undefined,
              resolutionCode: rec.resolutionCode as string | undefined,
            }),
          };
        });
      } catch (error) {
        this.logger.warn(
          `Database query failed in listCasesByVehicle: ${(error as Error).message}. Falling back to memory.`,
        );
      }
    }

    const items = this.memoryCases.get(vehicleId) ?? [];
    return items.map((c) => ({ ...c }));
  }

  // --------------------------------------------------------------------------
  // Earnings Summary
  // --------------------------------------------------------------------------

  async getEarningsSummary(
    vehicleId: string,
    period: string, // YYYY-MM
  ): Promise<HostVehicleEarningsSummary> {
    const trips = await this.listTripsByVehicle(vehicleId);

    // Filter trips for this period (completed within period)
    const matchingTrips = trips.filter((t) => {
      if (!t.startedAt && !t.completedAt) return false;
      const dateStr = t.completedAt ?? t.startedAt;
      return dateStr.startsWith(period);
    });

    const completedTrips = matchingTrips.filter(
      (t) => t.status === "completed",
    );

    const grossRevenue = completedTrips.reduce(
      (sum, t) => sum + (t.fareAmount || 0),
      0,
    );

    // Platform fee calculation: 15% standard platform service fee
    const platformFee = Math.round(grossRevenue * 0.15);

    // Count operating days (distinct calendar dates with completed trips in the period)
    const operatingDaysSet = new Set<string>();
    for (const t of completedTrips) {
      const dateStr = (t.completedAt ?? t.startedAt).slice(0, 10);
      operatingDaysSet.add(dateStr);
    }

    return {
      vehicleId,
      period,
      currency: "TWD",
      grossRevenue,
      platformFee,
      // Boundary invariant: financial_policy_hold_rule strictly mandates null
      fleetCommission: null,
      netEarnings: null,
      tripsCount: completedTrips.length,
      operatingDays: operatingDaysSet.size,
      settlementStatus: "pending_policy",
    };
  }

  // --------------------------------------------------------------------------
  // Row Parsers
  // --------------------------------------------------------------------------

  private mapProjectionRowToSummary(
    row: HostVehicleProjectionRow,
  ): HostVehicleSummary {
    let contractPeriod = null;
    if (row.contract_period) {
      try {
        contractPeriod =
          typeof row.contract_period === "string"
            ? JSON.parse(row.contract_period)
            : row.contract_period;
      } catch {
        contractPeriod = null;
      }
    }

    return {
      vehicleId: row.vehicle_id,
      plateNo: row.plate_no,
      vinMasked: row.vin_masked,
      vehicleForm: row.vehicle_form,
      licenseClass: row.license_class,
      energyType: row.energy_type,
      currentStatus: row.current_status,
      operatingFleetName: row.operating_fleet_name,
      contractPeriod,
    };
  }
}
