import { Injectable, Logger, Optional } from "@nestjs/common";

import type {
  DriverFleetAffiliationRecord,
  FleetPartnerRecord,
} from "@drts/contracts";

import { DatabaseService } from "../../common/db";

type JsonRecordRow = {
  record: unknown;
};

@Injectable()
export class FleetPartnerRepository {
  private readonly logger = new Logger(FleetPartnerRepository.name);

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  isEnabled() {
    return this.databaseService?.isEnabled() ?? false;
  }

  async loadFleetPartners(): Promise<FleetPartnerRecord[]> {
    if (!this.isEnabled()) {
      return [];
    }

    const result = await this.databaseService!.query<JsonRecordRow>(
      `
        SELECT record
        FROM admin.phase1_fleet_partners
        ORDER BY updated_at DESC
      `,
    );

    return result.rows.map((row) =>
      this.parseRecord<FleetPartnerRecord>(
        row.record,
        "admin.phase1_fleet_partners",
      ),
    );
  }

  async loadDriverFleetAffiliations(): Promise<DriverFleetAffiliationRecord[]> {
    if (!this.isEnabled()) {
      return [];
    }

    const result = await this.databaseService!.query<JsonRecordRow>(
      `
        SELECT record
        FROM ops.phase1_driver_fleet_affiliations
        ORDER BY updated_at DESC
      `,
    );

    return result.rows.map((row) =>
      this.parseRecord<DriverFleetAffiliationRecord>(
        row.record,
        "ops.phase1_driver_fleet_affiliations",
      ),
    );
  }

  async upsertFleetPartner(partner: FleetPartnerRecord) {
    if (!this.isEnabled()) {
      return;
    }

    await this.databaseService!.query(
      `
        INSERT INTO admin.phase1_fleet_partners (
          fleet_partner_id,
          business_registration_no,
          active,
          partnership_type,
          created_at,
          updated_at,
          record
        ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
        ON CONFLICT (fleet_partner_id) DO UPDATE SET
          business_registration_no = EXCLUDED.business_registration_no,
          active = EXCLUDED.active,
          partnership_type = EXCLUDED.partnership_type,
          updated_at = EXCLUDED.updated_at,
          record = EXCLUDED.record
      `,
      [
        partner.fleetPartnerId,
        partner.businessRegistrationNo,
        partner.active,
        partner.partnershipType,
        partner.createdAt,
        partner.updatedAt,
        JSON.stringify(partner),
      ],
    );
  }

  async upsertDriverFleetAffiliation(
    affiliation: DriverFleetAffiliationRecord,
  ) {
    if (!this.isEnabled()) {
      return;
    }

    await this.databaseService!.query(
      `
        INSERT INTO ops.phase1_driver_fleet_affiliations (
          affiliation_id,
          driver_id,
          fleet_partner_id,
          affiliation_type,
          effective_from,
          effective_until,
          created_at,
          updated_at,
          record
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
        ON CONFLICT (affiliation_id) DO UPDATE SET
          fleet_partner_id = EXCLUDED.fleet_partner_id,
          affiliation_type = EXCLUDED.affiliation_type,
          effective_from = EXCLUDED.effective_from,
          effective_until = EXCLUDED.effective_until,
          updated_at = EXCLUDED.updated_at,
          record = EXCLUDED.record
      `,
      [
        affiliation.affiliationId,
        affiliation.driverId,
        affiliation.fleetPartnerId,
        affiliation.affiliationType,
        affiliation.effectiveFrom,
        affiliation.effectiveUntil,
        affiliation.createdAt,
        affiliation.updatedAt,
        JSON.stringify(affiliation),
      ],
    );
  }

  reportPersistenceFailure(error: unknown, context: string) {
    const detail = error instanceof Error ? error.message : String(error);
    this.logger.warn(
      `Fleet partner persistence skipped during ${context}: ${detail}`,
    );
  }

  private parseRecord<T>(record: unknown, source: string): T {
    if (!record || typeof record !== "object") {
      throw new Error(`Invalid persisted record loaded from ${source}`);
    }

    return record as T;
  }
}
