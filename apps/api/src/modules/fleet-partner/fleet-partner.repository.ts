import { Injectable, Logger, Optional } from "@nestjs/common";

import type {
  DriverFleetAffiliationRecord,
  FleetPartnerRecord,
  FleetPartnerRevenueShareRuleRecord,
  FleetPartnerStatementRecord,
} from "@drts/contracts";
import type { QueryResult, QueryResultRow } from "pg";

import { DatabaseService } from "../../common/db";

type JsonRecordRow = {
  record: unknown;
};

export type FleetPartnerState = {
  fleetPartners: FleetPartnerRecord[];
  driverAffiliations: DriverFleetAffiliationRecord[];
  revenueShareRules: FleetPartnerRevenueShareRuleRecord[];
  statements: FleetPartnerStatementRecord[];
};

export type PersistFleetPartnerChanges = {
  fleetPartners?: readonly FleetPartnerRecord[];
  driverAffiliations?: readonly DriverFleetAffiliationRecord[];
  revenueShareRules?: readonly FleetPartnerRevenueShareRuleRecord[];
  statements?: readonly FleetPartnerStatementRecord[];
};

type Queryable = {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<T>>;
};

@Injectable()
export class FleetPartnerRepository {
  private readonly logger = new Logger(FleetPartnerRepository.name);

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  isEnabled() {
    return this.databaseService?.isEnabled() ?? false;
  }

  async loadState(): Promise<FleetPartnerState> {
    if (!this.isEnabled()) {
      return {
        fleetPartners: [],
        driverAffiliations: [],
        revenueShareRules: [],
        statements: [],
      };
    }

    const [partnersResult, affiliationsResult, rulesResult, statementsResult] =
      await Promise.all([
        this.databaseService!.query<JsonRecordRow>(
          `
            SELECT record
            FROM admin.phase1_fleet_partners
            ORDER BY updated_at DESC
          `,
        ),
        this.databaseService!.query<JsonRecordRow>(
          `
            SELECT record
            FROM admin.phase1_driver_fleet_affiliations
            ORDER BY updated_at DESC
          `,
        ),
        this.databaseService!.query<JsonRecordRow>(
          `
            SELECT record
            FROM billing.phase1_fleet_partner_revenue_share_rules
            ORDER BY updated_at DESC
          `,
        ),
        this.databaseService!.query<JsonRecordRow>(
          `
            SELECT record
            FROM billing.phase1_fleet_partner_statements
            ORDER BY updated_at DESC, created_at DESC
          `,
        ),
      ]);

    return {
      fleetPartners: partnersResult.rows.map((row) =>
        this.parseRecord<FleetPartnerRecord>(
          row.record,
          "admin.phase1_fleet_partners",
        ),
      ),
      driverAffiliations: affiliationsResult.rows.map((row) =>
        this.parseRecord<DriverFleetAffiliationRecord>(
          row.record,
          "admin.phase1_driver_fleet_affiliations",
        ),
      ),
      revenueShareRules: rulesResult.rows.map((row) =>
        this.parseRecord<FleetPartnerRevenueShareRuleRecord>(
          row.record,
          "billing.phase1_fleet_partner_revenue_share_rules",
        ),
      ),
      statements: statementsResult.rows.map((row) =>
        this.parseRecord<FleetPartnerStatementRecord>(
          row.record,
          "billing.phase1_fleet_partner_statements",
        ),
      ),
    };
  }

  async persistChanges(changes: PersistFleetPartnerChanges) {
    if (!this.isEnabled()) {
      return;
    }

    const writes: Promise<unknown>[] = [];

    for (const partner of changes.fleetPartners ?? []) {
      writes.push(
        this.databaseService!.query(
          `
            INSERT INTO admin.phase1_fleet_partners (
              fleet_partner_id,
              active,
              partnership_type,
              updated_at,
              record
            ) VALUES (
              $1, $2, $3, $4, $5::jsonb
            )
            ON CONFLICT (fleet_partner_id) DO UPDATE SET
              active = EXCLUDED.active,
              partnership_type = EXCLUDED.partnership_type,
              updated_at = EXCLUDED.updated_at,
              record = EXCLUDED.record
          `,
          [
            partner.fleetPartnerId,
            partner.active,
            partner.partnershipType,
            new Date().toISOString(),
            JSON.stringify(partner),
          ],
        ),
      );
    }

    for (const affiliation of changes.driverAffiliations ?? []) {
      writes.push(
        this.databaseService!.query(
          `
            INSERT INTO admin.phase1_driver_fleet_affiliations (
              affiliation_id,
              fleet_partner_id,
              driver_id,
              affiliation_type,
              effective_from,
              effective_until,
              updated_at,
              record
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8::jsonb
            )
            ON CONFLICT (affiliation_id) DO UPDATE SET
              fleet_partner_id = EXCLUDED.fleet_partner_id,
              driver_id = EXCLUDED.driver_id,
              affiliation_type = EXCLUDED.affiliation_type,
              effective_from = EXCLUDED.effective_from,
              effective_until = EXCLUDED.effective_until,
              updated_at = EXCLUDED.updated_at,
              record = EXCLUDED.record
          `,
          [
            affiliation.affiliationId,
            affiliation.fleetPartnerId,
            affiliation.driverId,
            affiliation.affiliationType,
            affiliation.effectiveFrom,
            affiliation.effectiveUntil,
            new Date().toISOString(),
            JSON.stringify(affiliation),
          ],
        ),
      );
    }

    for (const rule of changes.revenueShareRules ?? []) {
      writes.push(
        this.databaseService!.query(
          `
            INSERT INTO billing.phase1_fleet_partner_revenue_share_rules (
              rule_id,
              fleet_partner_id,
              applies_to,
              formula,
              effective_from,
              effective_until,
              updated_at,
              record
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8::jsonb
            )
            ON CONFLICT (rule_id) DO UPDATE SET
              fleet_partner_id = EXCLUDED.fleet_partner_id,
              applies_to = EXCLUDED.applies_to,
              formula = EXCLUDED.formula,
              effective_from = EXCLUDED.effective_from,
              effective_until = EXCLUDED.effective_until,
              updated_at = EXCLUDED.updated_at,
              record = EXCLUDED.record
          `,
          [
            rule.ruleId,
            rule.fleetPartnerId,
            rule.appliesTo,
            rule.formula,
            rule.effectiveFrom,
            rule.effectiveUntil ?? null,
            new Date().toISOString(),
            JSON.stringify(rule),
          ],
        ),
      );
    }

    for (const statement of changes.statements ?? []) {
      writes.push(this.upsertStatement(this.databaseService!, statement));
    }

    await Promise.all(writes);
  }

  async replaceStatementsForPeriodMonth(
    periodMonth: string,
    statements: readonly FleetPartnerStatementRecord[],
    fleetPartnerId?: string,
  ) {
    if (!this.isEnabled()) {
      return;
    }

    const client = await this.databaseService!.connect();
    try {
      await client.query("BEGIN");
      await this.deleteStatementsForPeriodMonth(
        client,
        periodMonth,
        fleetPartnerId,
      );
      for (const statement of statements) {
        await this.upsertStatement(client, statement);
      }
      await client.query("COMMIT");
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Ignore rollback failures and surface the original error.
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteRevenueShareRule(ruleId: string) {
    if (!this.isEnabled()) {
      return;
    }

    await this.databaseService!.query(
      `
        DELETE FROM billing.phase1_fleet_partner_revenue_share_rules
        WHERE rule_id = $1
      `,
      [ruleId],
    );
  }

  reportPersistenceFailure(error: unknown, context: string) {
    const detail = error instanceof Error ? error.message : String(error);
    this.logger.warn(
      `Fleet-partner persistence skipped during ${context}: ${detail}`,
    );
  }

  private parseRecord<T>(record: unknown, source: string): T {
    if (!record || typeof record !== "object") {
      throw new Error(`Invalid persisted record loaded from ${source}`);
    }

    return record as T;
  }

  private async deleteStatementsForPeriodMonth(
    queryable: Queryable,
    periodMonth: string,
    fleetPartnerId?: string,
  ) {
    if (fleetPartnerId) {
      await queryable.query(
        `
          DELETE FROM billing.phase1_fleet_partner_statements
          WHERE period_month = $1
            AND fleet_partner_id = $2
        `,
        [periodMonth, fleetPartnerId],
      );
      return;
    }

    await queryable.query(
      `
        DELETE FROM billing.phase1_fleet_partner_statements
        WHERE period_month = $1
      `,
      [periodMonth],
    );
  }

  private upsertStatement(
    queryable: Queryable,
    statement: FleetPartnerStatementRecord,
  ) {
    return queryable.query(
      `
        INSERT INTO billing.phase1_fleet_partner_statements (
          statement_id,
          fleet_partner_id,
          period_month,
          payout_status,
          created_at,
          updated_at,
          record
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7::jsonb
        )
        ON CONFLICT (statement_id) DO UPDATE SET
          fleet_partner_id = EXCLUDED.fleet_partner_id,
          period_month = EXCLUDED.period_month,
          payout_status = EXCLUDED.payout_status,
          created_at = EXCLUDED.created_at,
          updated_at = EXCLUDED.updated_at,
          record = EXCLUDED.record
      `,
      [
        statement.statementId,
        statement.fleetPartnerId,
        statement.periodMonth,
        statement.payoutStatus,
        statement.createdAt,
        statement.updatedAt,
        JSON.stringify(statement),
      ],
    );
  }
}
