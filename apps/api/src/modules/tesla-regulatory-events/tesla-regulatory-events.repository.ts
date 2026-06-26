import { Injectable, Logger, Optional } from "@nestjs/common";

import type {
  TeslaRegulatoryCapabilityProfile,
  TeslaRegulatoryEvent,
  TeslaRegulatoryReasonCodeDictionary,
  TeslaRegulatoryReasonCodeEntry,
} from "@drts/contracts";

import { DatabaseService } from "../../common/db";

type JsonRecordRow = {
  record: unknown;
};

type TeslaReasonCodeDictionaryRow = {
  dictionaryRecord: unknown;
  entryRecords: unknown[] | null;
};

export type TeslaRegulatoryEventsState = {
  capabilityProfiles: TeslaRegulatoryCapabilityProfile[];
  reasonCodeDictionaries: TeslaRegulatoryReasonCodeDictionary[];
};

@Injectable()
export class TeslaRegulatoryEventsRepository {
  private readonly logger = new Logger(TeslaRegulatoryEventsRepository.name);

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  isEnabled() {
    return this.databaseService?.isEnabled() ?? false;
  }

  async loadState(): Promise<TeslaRegulatoryEventsState> {
    if (!this.isEnabled()) {
      return {
        capabilityProfiles: [],
        reasonCodeDictionaries: [],
      };
    }

    const [capabilityProfilesResult, reasonCodeDictionariesResult] =
      await Promise.all([
        this.databaseService!.query<JsonRecordRow>(
          `
            SELECT record
            FROM av_sandbox.tesla_capability_profiles
            ORDER BY checked_at DESC
          `,
        ),
        this.databaseService!.query<TeslaReasonCodeDictionaryRow>(
          `
            SELECT
              version.record AS "dictionaryRecord",
              COALESCE(
                json_agg(entry.record ORDER BY entry.reason_code)
                  FILTER (WHERE entry.entry_id IS NOT NULL),
                '[]'::json
              ) AS "entryRecords"
            FROM av_sandbox.tesla_reason_code_dictionary_versions version
            LEFT JOIN av_sandbox.tesla_reason_code_dictionary_entries entry
              ON entry.dictionary_id = version.dictionary_id
            GROUP BY version.dictionary_id, version.published_at, version.record
            ORDER BY version.published_at DESC
          `,
        ),
      ]);

    return {
      capabilityProfiles: capabilityProfilesResult.rows.map(
        (row: JsonRecordRow) =>
        this.parseRecord<TeslaRegulatoryCapabilityProfile>(
          row.record,
          "av_sandbox.tesla_capability_profiles",
        ),
      ),
      reasonCodeDictionaries: reasonCodeDictionariesResult.rows.map(
        (row: TeslaReasonCodeDictionaryRow) => {
        const dictionary = this.parseRecord<
          Omit<TeslaRegulatoryReasonCodeDictionary, "entries">
        >(
          row.dictionaryRecord,
          "av_sandbox.tesla_reason_code_dictionary_versions",
        );

          const entries = (row.entryRecords ?? []).map((record: unknown) =>
          this.parseRecord<TeslaRegulatoryReasonCodeEntry>(
            record,
            "av_sandbox.tesla_reason_code_dictionary_entries",
          ),
        );

          return {
            ...dictionary,
            entries,
          };
        },
      ),
    };
  }

  async upsertCapabilityProfile(profile: TeslaRegulatoryCapabilityProfile) {
    if (!this.isEnabled()) {
      return;
    }

    await this.databaseService!.query(
      `
        INSERT INTO av_sandbox.tesla_capability_profiles (
          profile_id,
          vehicle_id,
          vin,
          external_vehicle_ref,
          provider_code,
          provider_schema_version,
          checked_at,
          required_capabilities,
          capabilities,
          missing_required_capabilities,
          passenger_service_status,
          passenger_service_reason_code,
          reason_code_dictionary_version,
          source_system,
          source_ref,
          source_ingested_at,
          source_recorded_at,
          source_signature_ref,
          source_schema_version,
          record
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8::jsonb, $9::jsonb, $10::jsonb, $11, $12, $13,
          $14, $15, $16, $17, $18, $19, $20::jsonb
        )
        ON CONFLICT (vin) DO UPDATE SET
          profile_id = EXCLUDED.profile_id,
          vehicle_id = EXCLUDED.vehicle_id,
          external_vehicle_ref = EXCLUDED.external_vehicle_ref,
          provider_code = EXCLUDED.provider_code,
          provider_schema_version = EXCLUDED.provider_schema_version,
          checked_at = EXCLUDED.checked_at,
          required_capabilities = EXCLUDED.required_capabilities,
          capabilities = EXCLUDED.capabilities,
          missing_required_capabilities = EXCLUDED.missing_required_capabilities,
          passenger_service_status = EXCLUDED.passenger_service_status,
          passenger_service_reason_code = EXCLUDED.passenger_service_reason_code,
          reason_code_dictionary_version = EXCLUDED.reason_code_dictionary_version,
          source_system = EXCLUDED.source_system,
          source_ref = EXCLUDED.source_ref,
          source_ingested_at = EXCLUDED.source_ingested_at,
          source_recorded_at = EXCLUDED.source_recorded_at,
          source_signature_ref = EXCLUDED.source_signature_ref,
          source_schema_version = EXCLUDED.source_schema_version,
          record = EXCLUDED.record
      `,
      [
        profile.profileId,
        profile.vehicleId,
        profile.vin,
        profile.externalVehicleRef,
        profile.providerCode,
        profile.providerSchemaVersion,
        profile.checkedAt,
        JSON.stringify(profile.requiredCapabilities),
        JSON.stringify(profile.capabilities),
        JSON.stringify(profile.missingRequiredCapabilities),
        profile.passengerServiceStatus,
        profile.passengerServiceReasonCode,
        profile.reasonCodeDictionaryVersion,
        profile.source.sourceSystem,
        profile.source.sourceRef,
        profile.source.ingestedAt,
        profile.source.recordedAt,
        profile.source.signatureRef,
        profile.source.schemaVersion,
        JSON.stringify(profile),
      ],
    );
  }

  async upsertReasonCodeDictionary(
    dictionary: TeslaRegulatoryReasonCodeDictionary,
  ) {
    if (!this.isEnabled()) {
      return;
    }

    const client = await this.databaseService!.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `
          INSERT INTO av_sandbox.tesla_reason_code_dictionary_versions (
            dictionary_id,
            provider_code,
            dictionary_version,
            effective_from,
            published_at,
            source_system,
            source_ref,
            source_ingested_at,
            source_recorded_at,
            source_signature_ref,
            source_schema_version,
            record
          ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9, $10, $11, $12::jsonb
          )
          ON CONFLICT (provider_code, dictionary_version) DO UPDATE SET
            dictionary_id = EXCLUDED.dictionary_id,
            effective_from = EXCLUDED.effective_from,
            published_at = EXCLUDED.published_at,
            source_system = EXCLUDED.source_system,
            source_ref = EXCLUDED.source_ref,
            source_ingested_at = EXCLUDED.source_ingested_at,
            source_recorded_at = EXCLUDED.source_recorded_at,
            source_signature_ref = EXCLUDED.source_signature_ref,
            source_schema_version = EXCLUDED.source_schema_version,
            record = EXCLUDED.record
        `,
        [
          dictionary.dictionaryId,
          dictionary.providerCode,
          dictionary.dictionaryVersion,
          dictionary.effectiveFrom,
          dictionary.publishedAt,
          dictionary.source.sourceSystem,
          dictionary.source.sourceRef,
          dictionary.source.ingestedAt,
          dictionary.source.recordedAt,
          dictionary.source.signatureRef,
          dictionary.source.schemaVersion,
          JSON.stringify({
            ...dictionary,
            entries: undefined,
          }),
        ],
      );

      await client.query(
        `
          DELETE FROM av_sandbox.tesla_reason_code_dictionary_entries
          WHERE dictionary_id = $1
        `,
        [dictionary.dictionaryId],
      );

      for (const entry of dictionary.entries) {
        await client.query(
          `
            INSERT INTO av_sandbox.tesla_reason_code_dictionary_entries (
              entry_id,
              dictionary_id,
              provider_code,
              dictionary_version,
              reason_code,
              display_label,
              description,
              related_event_types,
              source_system,
              source_ref,
              source_ingested_at,
              source_recorded_at,
              source_signature_ref,
              source_schema_version,
              record
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7,
              $8::jsonb, $9, $10, $11, $12, $13, $14, $15::jsonb
            )
          `,
          [
            entry.entryId,
            dictionary.dictionaryId,
            entry.providerCode,
            entry.dictionaryVersion,
            entry.reasonCode,
            entry.displayLabel,
            entry.description,
            JSON.stringify(entry.relatedEventTypes),
            entry.source.sourceSystem,
            entry.source.sourceRef,
            entry.source.ingestedAt,
            entry.source.recordedAt,
            entry.source.signatureRef,
            entry.source.schemaVersion,
            JSON.stringify(entry),
          ],
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async appendRegulatoryEvents(events: readonly TeslaRegulatoryEvent[]) {
    if (!this.isEnabled() || events.length === 0) {
      return;
    }

    for (const event of events) {
      await this.databaseService!.query(
        `
          INSERT INTO av_sandbox.tesla_regulatory_events (
            event_id,
            vehicle_id,
            external_vehicle_ref,
            event_type,
            occurred_at,
            location_lat,
            location_lng,
            speed_mps,
            heading_deg,
            disengagement_cause,
            provider_reason_code,
            safety_operator_id,
            roc_operator_id,
            odd_zone_id,
            source_system,
            source_ref,
            source_ingested_at,
            source_recorded_at,
            source_signature_ref,
            source_schema_version
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
          )
          ON CONFLICT (event_id) DO NOTHING
        `,
        [
          event.eventId,
          event.vehicleId,
          event.externalVehicleRef,
          event.eventType,
          event.occurredAt,
          event.location?.lat ?? null,
          event.location?.lng ?? null,
          event.speedMps,
          event.headingDeg,
          event.disengagementCause,
          event.providerReasonCode,
          event.safetyOperatorId,
          event.rocOperatorId,
          event.oddZoneId,
          event.source.sourceSystem,
          event.source.sourceRef,
          event.source.ingestedAt,
          event.source.recordedAt,
          event.source.signatureRef,
          event.source.schemaVersion,
        ],
      );
    }
  }

  reportPersistenceFailure(error: unknown, context: string) {
    const detail = error instanceof Error ? error.message : String(error);
    this.logger.warn(
      `Tesla regulatory persistence skipped during ${context}: ${detail}`,
    );
  }

  private parseRecord<T>(record: unknown, source: string): T {
    if (!record || typeof record !== "object") {
      throw new Error(`Invalid persisted record loaded from ${source}`);
    }

    return record as T;
  }
}
