import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { PoolClient, QueryResultRow } from "pg";
import type { MultiTaxiManagedFareVersion } from "@drts/contracts";
import { ApiRequestError } from "../../../common/api-envelope";
import { DatabaseService } from "../../../common/db";
import { computePayloadHash } from "../../../common/idempotency/canonical-json";
import {
  createAuditLogRecord,
  normalizeUuidOrNull,
} from "../../audit-notification/audit-log.persistence";
import { managedFare } from "./fare-version.mapping";
import type {
  FareCommandInput,
  FareState,
  FareTransaction,
  FareVersionData,
  FareVersionStore,
} from "./fare-version.types";

function iso(value: unknown): string {
  return new Date(value as string).toISOString();
}
function fromRow(row: QueryResultRow): FareVersionData {
  const createdAt = iso(row.created_at);
  return {
    tariff: {
      version: row.version,
      effectiveAt: iso(row.effective_at),
      effectiveUntil:
        row.effective_until === null ? null : iso(row.effective_until),
      baseFare: row.base_fare,
      baseDistanceMeters: row.base_distance_meters,
      distanceRate: row.distance_rate,
      distanceIncrementMeters: row.distance_increment_meters,
      delayRate: row.delay_rate,
      delayIncrementSeconds: row.delay_increment_seconds,
      nightSurchargeAmount: row.night_surcharge_amount,
      nightSurchargeWindowStart: row.night_window_start,
      nightSurchargeWindowEnd: row.night_window_end,
      additionalFees: row.additional_fees,
      distanceRounding: row.distance_rounding,
      delayRounding: row.delay_rounding,
      totalRounding: row.total_rounding,
      totalIncrement: row.total_increment,
      nightApplication: row.night_application,
      sourceReference: row.source_reference,
    },
    dbStatus: row.status,
    displayName: row.display_name ?? row.version,
    publicSummary: row.public_summary ?? row.source_reference,
    authorityFilingRef: row.authority_filing_ref ?? null,
    filingEvidenceReference: row.filing_evidence_reference ?? null,
    filedAt: row.filed_at === null ? null : iso(row.filed_at),
    filedBy: row.filed_by ?? null,
    revision: Number(row.revision ?? 0),
    createdAt,
    createdBy: row.created_by ?? null,
    updatedAt: row.updated_at === null ? createdAt : iso(row.updated_at),
    updatedBy: row.updated_by ?? "",
    retiredReason: row.retired_reason ?? null,
  };
}

const READ_STATE = `WITH evaluated AS (SELECT clock_timestamp() AS at), records AS (
  SELECT f.*, m.display_name, m.public_summary, m.authority_filing_ref,
    m.filing_evidence_reference, m.filed_at, m.filed_by, m.revision,
    m.created_by, m.updated_by, m.updated_at, m.retired_reason
  FROM passenger.fare_versions f
  LEFT JOIN passenger.fare_version_management m ON m.fare_version = f.version
) SELECT evaluated.at AS evaluated_at,
  COALESCE(jsonb_agg(to_jsonb(records) ORDER BY records.effective_at DESC, records.version)
    FILTER (WHERE records.version IS NOT NULL), '[]'::jsonb) AS records
FROM evaluated LEFT JOIN records ON true GROUP BY evaluated.at`;

@Injectable()
export class FareVersionRepository implements FareVersionStore {
  constructor(private readonly database: DatabaseService) {}

  private async state(client?: PoolClient): Promise<FareState> {
    const result = client
      ? await client.query(READ_STATE)
      : await this.database.query(READ_STATE);
    return {
      records: result.rows[0]!.records.map(fromRow),
      evaluatedAt: iso(result.rows[0]!.evaluated_at),
    };
  }

  private unavailable(error: unknown): never {
    if (error instanceof ApiRequestError) throw error;
    throw new ApiRequestError(
      503,
      "fare_management_unavailable",
      "Fare management storage is unavailable. Retry the same operation.",
      undefined,
      true,
    );
  }

  async read(): Promise<FareState> {
    try {
      return await this.state();
    } catch (error) {
      return this.unavailable(error);
    }
  }

  async execute(
    input: FareCommandInput,
    operation: (transaction: FareTransaction) => Promise<void>,
  ): Promise<MultiTaxiManagedFareVersion> {
    let client: PoolClient | undefined;
    try {
      client = await this.database.connect();
      await client.query("BEGIN");
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        ["passenger.public-fare-management"],
      );
      const payloadHash = computePayloadHash({
        version: input.version,
        payload: input.payload,
      });
      const existing = await client.query(
        `SELECT fare_version, payload_hash FROM passenger.fare_version_command_receipts
         WHERE actor_id=$1 AND operation=$2 AND idempotency_key=$3`,
        [input.actorId, input.operation, input.idempotencyKey],
      );
      const state = await this.state(client);
      const previous = structuredClone(state.records);
      if (existing.rows[0]) {
        if (existing.rows[0].payload_hash !== payloadHash)
          throw new ApiRequestError(
            409,
            "IDEMPOTENCY_KEY_REUSED",
            "This operation key was used for a different fare command.",
          );
      } else {
        const tx: FareTransaction = {
          ...state,
          save: async (record) => {
            await this.save(client!, record);
            const index = state.records.findIndex(
              (row) => row.tariff.version === record.tariff.version,
            );
            if (index === -1) state.records.push(record);
            else state.records[index] = record;
          },
        };
        await operation(tx);
        const audit = createAuditLogRecord({
          auditId: randomUUID(),
          requestId: input.requestId ?? randomUUID(),
          actorId: input.actorId,
          actorType: input.actorType,
          tenantId: null,
          moduleName: "multi-taxi",
          actionName: `${input.operation}_public_fare_version`,
          resourceType: "public_fare_version",
          resourceId: input.version,
          oldValuesSummary: { versions: previous },
          newValuesSummary: { versions: state.records },
        });
        await client.query(
          `INSERT INTO admin.audit_logs
          (audit_id,actor_id,actor_type,tenant_id,module_name,action_name,resource_type,resource_id,old_value,new_value,request_id,created_at)
          VALUES ($1,$2,$3,NULL,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11)`,
          [
            audit.auditId,
            normalizeUuidOrNull(audit.actorId),
            audit.actorType,
            audit.moduleName,
            audit.actionName,
            audit.resourceType,
            audit.resourceId,
            JSON.stringify(audit.oldValuesSummary),
            JSON.stringify(audit.newValuesSummary),
            audit.requestId,
            state.evaluatedAt,
          ],
        );
        await this.insertReceipt(
          client,
          input,
          payloadHash,
          audit.auditId,
          state.evaluatedAt,
        );
      }
      const row = state.records.find(
        (item) => item.tariff.version === input.version,
      );
      if (!row)
        throw new ApiRequestError(
          404,
          "fare_version_not_found",
          "Fare version was not found.",
        );
      const result = managedFare(row, state.evaluatedAt);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      if (client) await client.query("ROLLBACK").catch(() => undefined);
      return this.unavailable(error);
    } finally {
      client?.release();
    }
  }

  protected async insertReceipt(
    client: PoolClient,
    input: FareCommandInput,
    payloadHash: string,
    auditId: string,
    at: string,
  ) {
    await client.query(
      `INSERT INTO passenger.fare_version_command_receipts
      (actor_id,operation,idempotency_key,fare_version,payload_hash,committed_at,audit_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        input.actorId,
        input.operation,
        input.idempotencyKey,
        input.version,
        payloadHash,
        at,
        auditId,
      ],
    );
  }

  private async save(client: PoolClient, record: FareVersionData) {
    const t = record.tariff;
    await client.query(
      `INSERT INTO passenger.fare_versions
      (version,status,effective_at,effective_until,base_fare,base_distance_meters,distance_rate,
       distance_increment_meters,delay_rate,delay_increment_seconds,night_surcharge_amount,
       night_window_start,night_window_end,additional_fees,distance_rounding,delay_rounding,
       total_rounding,total_increment,night_application,source_reference,created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16,$17,$18,$19,$20,$21)
      ON CONFLICT (version) DO UPDATE SET status=EXCLUDED.status,effective_at=EXCLUDED.effective_at,
       effective_until=EXCLUDED.effective_until,base_fare=EXCLUDED.base_fare,
       base_distance_meters=EXCLUDED.base_distance_meters,distance_rate=EXCLUDED.distance_rate,
       distance_increment_meters=EXCLUDED.distance_increment_meters,delay_rate=EXCLUDED.delay_rate,
       delay_increment_seconds=EXCLUDED.delay_increment_seconds,night_surcharge_amount=EXCLUDED.night_surcharge_amount,
       night_window_start=EXCLUDED.night_window_start,night_window_end=EXCLUDED.night_window_end,
       additional_fees=EXCLUDED.additional_fees,distance_rounding=EXCLUDED.distance_rounding,
       delay_rounding=EXCLUDED.delay_rounding,total_rounding=EXCLUDED.total_rounding,
       total_increment=EXCLUDED.total_increment,night_application=EXCLUDED.night_application,
       source_reference=EXCLUDED.source_reference`,
      [
        t.version,
        record.dbStatus,
        t.effectiveAt,
        t.effectiveUntil,
        t.baseFare,
        t.baseDistanceMeters,
        t.distanceRate,
        t.distanceIncrementMeters,
        t.delayRate,
        t.delayIncrementSeconds,
        t.nightSurchargeAmount,
        t.nightSurchargeWindowStart,
        t.nightSurchargeWindowEnd,
        JSON.stringify(t.additionalFees),
        t.distanceRounding,
        t.delayRounding,
        t.totalRounding,
        t.totalIncrement,
        t.nightApplication,
        t.sourceReference,
        record.createdAt,
      ],
    );
    await client.query(
      `INSERT INTO passenger.fare_version_management
      (fare_version,display_name,public_summary,authority_filing_ref,filing_evidence_reference,
       filed_at,filed_by,revision,created_by,updated_by,updated_at,retired_reason)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      ON CONFLICT (fare_version) DO UPDATE SET display_name=EXCLUDED.display_name,
       public_summary=EXCLUDED.public_summary,authority_filing_ref=EXCLUDED.authority_filing_ref,
       filing_evidence_reference=EXCLUDED.filing_evidence_reference,filed_at=EXCLUDED.filed_at,
       filed_by=EXCLUDED.filed_by,revision=EXCLUDED.revision,updated_by=EXCLUDED.updated_by,
       updated_at=EXCLUDED.updated_at,retired_reason=EXCLUDED.retired_reason`,
      [
        t.version,
        record.displayName,
        record.publicSummary,
        record.authorityFilingRef,
        record.filingEvidenceReference,
        record.filedAt,
        record.filedBy,
        record.revision,
        record.createdBy,
        record.updatedBy,
        record.updatedAt,
        record.retiredReason,
      ],
    );
  }
}
