// PartnerEntryNotificationBinding persistence — SR-PARTNER-NOTIFY-ROUTE-20260917
// §3.1. entry_slug is the primary key (one primary binding per entry in v1);
// `version` is optimistic-concurrency only, never a history counter. Every
// governance mutation (PUT / enable / disable) must go through
// `compareAndSwap`, which enforces `WHERE entry_slug = $1 AND version =
// $expectedVersion` at the SQL layer so a stale caller's write is rejected
// rather than silently applied.

import { randomUUID } from "node:crypto";

import { Injectable, Optional } from "@nestjs/common";

import type {
  PartnerEntryNotificationBinding,
  PartnerEntryNotificationBindingState,
  PartnerPassengerEventType,
} from "@drts/contracts";
import {
  PARTNER_ENTRY_NOTIFICATION_BINDING_PURPOSE,
  PARTNER_NOTIFICATION_ACKNOWLEDGEMENT_POLICY,
  PARTNER_NOTIFICATION_SCHEMA_VERSION,
} from "@drts/contracts";

import { DatabaseService } from "../../common/db";

type BindingRow = {
  entry_slug: string;
  binding_id: string;
  tenant_id: string;
  partner_id: string;
  webhook_id: string;
  version: number;
  state: PartnerEntryNotificationBindingState;
  event_types: unknown;
  validated_endpoint_fingerprint: string | null;
  validated_at: string | Date | null;
  updated_at: string | Date;
};

export type PutPartnerEntryNotificationBindingInput = {
  entrySlug: string;
  tenantId: string;
  partnerId: string;
  webhookId: string;
  eventTypes: PartnerPassengerEventType[];
  expectedVersion: number;
  now: string;
};

export type BindingWriteOutcome =
  | { outcome: "written"; binding: PartnerEntryNotificationBinding }
  | { outcome: "version_conflict"; current: PartnerEntryNotificationBinding | null };

export type SetBindingValidatedInput = {
  entrySlug: string;
  expectedVersion: number;
  validatedEndpointFingerprint: string;
  now: string;
};

export type SetBindingStateInput = {
  entrySlug: string;
  expectedVersion: number;
  nextState: PartnerEntryNotificationBindingState;
  now: string;
};

@Injectable()
export class PartnerEntryNotificationBindingRepository {
  private readonly fallback = new Map<string, PartnerEntryNotificationBinding>();

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  isEnabled() {
    return this.databaseService?.isEnabled() ?? false;
  }

  async findByEntrySlug(
    entrySlugInput: string,
  ): Promise<PartnerEntryNotificationBinding | null> {
    const entrySlug = entrySlugInput.trim();

    if (!this.isEnabled()) {
      const existing = this.fallback.get(entrySlug);
      return existing ? { ...existing } : null;
    }

    const result = await this.databaseService!.query<BindingRow>(
      `
        SELECT entry_slug, binding_id, tenant_id, partner_id, webhook_id,
               version, state, event_types, validated_endpoint_fingerprint,
               validated_at, updated_at
        FROM admin.phase1_partner_notification_bindings
        WHERE entry_slug = $1
      `,
      [entrySlug],
    );

    return result.rows[0] ? this.fromRow(result.rows[0]) : null;
  }

  /**
   * PUT semantics: `expectedVersion = 0` creates (only valid when no binding
   * exists yet); any other value updates an existing binding. Any successful
   * write via this method resets the binding to `test_pending` and clears
   * the validated fingerprint/timestamp — a URL/events/webhook rotation must
   * be re-validated before it can be enabled again (design §3.1).
   */
  async put(
    input: PutPartnerEntryNotificationBindingInput,
  ): Promise<BindingWriteOutcome> {
    if (!this.isEnabled()) {
      const existing = this.fallback.get(input.entrySlug);
      if (!existing) {
        if (input.expectedVersion !== 0) {
          return { outcome: "version_conflict", current: null };
        }
        const created: PartnerEntryNotificationBinding = {
          bindingId: randomUUID(),
          entrySlug: input.entrySlug,
          tenantId: input.tenantId,
          partnerId: input.partnerId,
          webhookId: input.webhookId,
          version: 1,
          state: "test_pending",
          purpose: PARTNER_ENTRY_NOTIFICATION_BINDING_PURPOSE,
          eventTypes: [...input.eventTypes],
          schemaVersion: PARTNER_NOTIFICATION_SCHEMA_VERSION,
          acknowledgementPolicy: PARTNER_NOTIFICATION_ACKNOWLEDGEMENT_POLICY,
          validatedEndpointFingerprint: null,
          validatedAt: null,
          updatedAt: input.now,
        };
        this.fallback.set(input.entrySlug, created);
        return { outcome: "written", binding: { ...created } };
      }

      if (existing.version !== input.expectedVersion) {
        return { outcome: "version_conflict", current: { ...existing } };
      }

      const updated: PartnerEntryNotificationBinding = {
        ...existing,
        webhookId: input.webhookId,
        eventTypes: [...input.eventTypes],
        version: existing.version + 1,
        state: "test_pending",
        validatedEndpointFingerprint: null,
        validatedAt: null,
        updatedAt: input.now,
      };
      this.fallback.set(input.entrySlug, updated);
      return { outcome: "written", binding: { ...updated } };
    }

    const client = await this.databaseService!.connect();
    try {
      await client.query("BEGIN");
      const existingResult = await client.query<BindingRow>(
        `
          SELECT entry_slug, binding_id, tenant_id, partner_id, webhook_id,
                 version, state, event_types, validated_endpoint_fingerprint,
                 validated_at, updated_at
          FROM admin.phase1_partner_notification_bindings
          WHERE entry_slug = $1
          FOR UPDATE
        `,
        [input.entrySlug],
      );
      const existingRow = existingResult.rows[0];

      if (!existingRow) {
        if (input.expectedVersion !== 0) {
          await client.query("COMMIT");
          return { outcome: "version_conflict", current: null };
        }
        const insertResult = await client.query<BindingRow>(
          `
            INSERT INTO admin.phase1_partner_notification_bindings (
              entry_slug, tenant_id, partner_id, webhook_id, version, state,
              event_types, updated_at
            ) VALUES (
              $1, $2, $3, $4, 1, 'test_pending', $5::jsonb, $6::timestamptz
            )
            RETURNING entry_slug, binding_id, tenant_id, partner_id,
              webhook_id, version, state, event_types,
              validated_endpoint_fingerprint, validated_at, updated_at
          `,
          [
            input.entrySlug,
            input.tenantId,
            input.partnerId,
            input.webhookId,
            JSON.stringify(input.eventTypes),
            input.now,
          ],
        );
        await client.query("COMMIT");
        return { outcome: "written", binding: this.fromRow(insertResult.rows[0]!) };
      }

      if (existingRow.version !== input.expectedVersion) {
        await client.query("COMMIT");
        return { outcome: "version_conflict", current: this.fromRow(existingRow) };
      }

      const updateResult = await client.query<BindingRow>(
        `
          UPDATE admin.phase1_partner_notification_bindings
          SET webhook_id = $3,
              event_types = $4::jsonb,
              version = version + 1,
              state = 'test_pending',
              validated_endpoint_fingerprint = NULL,
              validated_at = NULL,
              updated_at = $5::timestamptz
          WHERE entry_slug = $1
            AND version = $2
          RETURNING entry_slug, binding_id, tenant_id, partner_id, webhook_id,
            version, state, event_types, validated_endpoint_fingerprint,
            validated_at, updated_at
        `,
        [
          input.entrySlug,
          input.expectedVersion,
          input.webhookId,
          JSON.stringify(input.eventTypes),
          input.now,
        ],
      );
      await client.query("COMMIT");
      const updatedRow = updateResult.rows[0];
      if (!updatedRow) {
        return { outcome: "version_conflict", current: this.fromRow(existingRow) };
      }
      return { outcome: "written", binding: this.fromRow(updatedRow) };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  /** Records a successful `passenger.notification.test.v1` validation. Never changes `state` or `version` by itself. */
  async setValidated(
    input: SetBindingValidatedInput,
  ): Promise<BindingWriteOutcome> {
    if (!this.isEnabled()) {
      const existing = this.fallback.get(input.entrySlug);
      if (!existing || existing.version !== input.expectedVersion) {
        return {
          outcome: "version_conflict",
          current: existing ? { ...existing } : null,
        };
      }
      const updated: PartnerEntryNotificationBinding = {
        ...existing,
        validatedEndpointFingerprint: input.validatedEndpointFingerprint,
        validatedAt: input.now,
        updatedAt: input.now,
      };
      this.fallback.set(input.entrySlug, updated);
      return { outcome: "written", binding: { ...updated } };
    }

    const result = await this.databaseService!.query<BindingRow>(
      `
        UPDATE admin.phase1_partner_notification_bindings
        SET validated_endpoint_fingerprint = $3,
            validated_at = $4::timestamptz,
            updated_at = $4::timestamptz
        WHERE entry_slug = $1
          AND version = $2
        RETURNING entry_slug, binding_id, tenant_id, partner_id, webhook_id,
          version, state, event_types, validated_endpoint_fingerprint,
          validated_at, updated_at
      `,
      [
        input.entrySlug,
        input.expectedVersion,
        input.validatedEndpointFingerprint,
        input.now,
      ],
    );
    if (!result.rows[0]) {
      const current = await this.findByEntrySlug(input.entrySlug);
      return { outcome: "version_conflict", current };
    }
    return { outcome: "written", binding: this.fromRow(result.rows[0]) };
  }

  /** Transitions `state` (enable -> 'ready', disable -> 'disabled'); bumps `version` like any other governance mutation. */
  async setState(input: SetBindingStateInput): Promise<BindingWriteOutcome> {
    if (!this.isEnabled()) {
      const existing = this.fallback.get(input.entrySlug);
      if (!existing || existing.version !== input.expectedVersion) {
        return {
          outcome: "version_conflict",
          current: existing ? { ...existing } : null,
        };
      }
      const updated: PartnerEntryNotificationBinding = {
        ...existing,
        state: input.nextState,
        version: existing.version + 1,
        updatedAt: input.now,
      };
      this.fallback.set(input.entrySlug, updated);
      return { outcome: "written", binding: { ...updated } };
    }

    const result = await this.databaseService!.query<BindingRow>(
      `
        UPDATE admin.phase1_partner_notification_bindings
        SET state = $3,
            version = version + 1,
            updated_at = $4::timestamptz
        WHERE entry_slug = $1
          AND version = $2
        RETURNING entry_slug, binding_id, tenant_id, partner_id, webhook_id,
          version, state, event_types, validated_endpoint_fingerprint,
          validated_at, updated_at
      `,
      [input.entrySlug, input.expectedVersion, input.nextState, input.now],
    );
    if (!result.rows[0]) {
      const current = await this.findByEntrySlug(input.entrySlug);
      return { outcome: "version_conflict", current };
    }
    return { outcome: "written", binding: this.fromRow(result.rows[0]) };
  }

  private fromRow(row: BindingRow): PartnerEntryNotificationBinding {
    const eventTypes = Array.isArray(row.event_types)
      ? (row.event_types as PartnerPassengerEventType[])
      : (JSON.parse(String(row.event_types)) as PartnerPassengerEventType[]);
    return {
      bindingId: row.binding_id,
      entrySlug: row.entry_slug,
      tenantId: row.tenant_id,
      partnerId: row.partner_id,
      webhookId: row.webhook_id,
      version: row.version,
      state: row.state,
      purpose: PARTNER_ENTRY_NOTIFICATION_BINDING_PURPOSE,
      eventTypes,
      schemaVersion: PARTNER_NOTIFICATION_SCHEMA_VERSION,
      acknowledgementPolicy: PARTNER_NOTIFICATION_ACKNOWLEDGEMENT_POLICY,
      validatedEndpointFingerprint: row.validated_endpoint_fingerprint,
      validatedAt: row.validated_at
        ? new Date(row.validated_at).toISOString()
        : null,
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }
}
