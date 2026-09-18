import { Injectable } from "@nestjs/common";
import { QueryResultRow } from "pg";

import { PartnerEntryNotificationBinding } from "@drts/contracts";
import { DatabaseService } from "../../common/db";

export type PartnerEntryNotificationBindingQueryExecutor = {
  query<T extends QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: T[] }>;
};

@Injectable()
export class PartnerEntryNotificationBindingRepository {
  constructor(private readonly db: DatabaseService) {}

  async findByEntrySlug(
    entrySlug: string,
    executor: PartnerEntryNotificationBindingQueryExecutor = this.db,
  ): Promise<PartnerEntryNotificationBinding | null> {
    const result = await executor.query<{ record: PartnerEntryNotificationBinding }>(
      `
        SELECT record
        FROM admin.phase1_partner_notification_bindings
        WHERE entry_slug = $1
      `,
      [entrySlug],
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0].record;
  }

  async persist(
    binding: PartnerEntryNotificationBinding,
    executor: PartnerEntryNotificationBindingQueryExecutor = this.db,
  ): Promise<void> {
    await executor.query(
      `
        INSERT INTO admin.phase1_partner_notification_bindings (
          entry_slug,
          binding_id,
          tenant_id,
          partner_id,
          webhook_id,
          version,
          state,
          event_types,
          ack_policy,
          endpoint_fingerprint,
          validated_at,
          updated_at,
          record
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13::jsonb
        )
        ON CONFLICT (entry_slug) DO UPDATE SET
          binding_id = EXCLUDED.binding_id,
          tenant_id = EXCLUDED.tenant_id,
          partner_id = EXCLUDED.partner_id,
          webhook_id = EXCLUDED.webhook_id,
          version = EXCLUDED.version,
          state = EXCLUDED.state,
          event_types = EXCLUDED.event_types,
          ack_policy = EXCLUDED.ack_policy,
          endpoint_fingerprint = EXCLUDED.endpoint_fingerprint,
          validated_at = EXCLUDED.validated_at,
          updated_at = EXCLUDED.updated_at,
          record = EXCLUDED.record
      `,
      [
        binding.entrySlug,
        binding.bindingId,
        binding.tenantId,
        binding.partnerId,
        binding.webhookId,
        binding.version,
        binding.state,
        JSON.stringify(binding.eventTypes),
        binding.acknowledgementPolicy,
        binding.validatedEndpointFingerprint,
        binding.validatedAt,
        binding.updatedAt,
        JSON.stringify(binding),
      ],
    );
  }
}
