import { Injectable, Logger, Optional } from "@nestjs/common";

import type {
  PartnerChannelEntryRecord,
  PartnerEligibilityVerificationRecord,
  TenantAddressRecord,
  TenantApiKeyRecord,
  TenantNotificationPreferences,
  TenantPassengerRecord,
  TenantSlaProfile,
  TenantUserRoleRecord,
  TenantWebhookEndpoint,
  WebhookDeliveryRecord,
} from "@drts/contracts";

import { DatabaseService } from "../../common/db";

type JsonRecordRow = {
  record: unknown;
};

type WebhookRetryPolicy = {
  maxAttempts: number;
  initialBackoffSeconds: number;
  backoffMultiplier: number;
  maxBackoffSeconds: number;
  retryableStatusCodes: number[];
};

type WebhookSecretRotationRecord = {
  secretVersion: number;
  rotatedAt: string;
  rotationReason: string | null;
  secretPreview: string;
};

type WebhookRuntimeMetadata = {
  deliveryCount: number;
  failedDeliveryCount: number;
  lastAttemptAt: string | null;
  lastDeliveredAt: string | null;
  nextAttemptAt: string | null;
  lastSignaturePreview: string | null;
  retryPolicy: WebhookRetryPolicy;
  secretRotation: {
    currentVersion: number;
    rotatedAt: string;
    rotationCount: number;
    history: WebhookSecretRotationRecord[];
  };
};

export type StoredWebhookEndpointRecord = TenantWebhookEndpoint & {
  secretValue: string;
  retryPolicy: WebhookRetryPolicy;
  runtimeMetadata: WebhookRuntimeMetadata;
  secretHistory: WebhookSecretRotationRecord[];
};

export type StoredWebhookDeliveryRecord = WebhookDeliveryRecord & {
  attemptedAt: string;
  nextAttemptAt: string | null;
  signatureHeader: string;
  signatureVersion: number;
  secretVersion: number;
  retryPolicySnapshot: WebhookRetryPolicy;
  rawBody: Record<string, unknown>;
};

export type StoredTenantApiKeyRecord = TenantApiKeyRecord & {
  keyHash: string;
};

export type TenantPartnerState = {
  notificationPreferences: TenantNotificationPreferences[];
  webhookEndpoints: StoredWebhookEndpointRecord[];
  webhookDeliveries: StoredWebhookDeliveryRecord[];
  slaProfiles: TenantSlaProfile[];
  partnerEntries: PartnerChannelEntryRecord[];
  partnerEligibilityVerifications: PartnerEligibilityVerificationRecord[];
  passengers: TenantPassengerRecord[];
  addresses: TenantAddressRecord[];
  userRoles: TenantUserRoleRecord[];
  apiKeys: StoredTenantApiKeyRecord[];
};

export type PersistTenantPartnerChanges = {
  notificationPreferences?: readonly TenantNotificationPreferences[];
  webhookEndpoints?: readonly StoredWebhookEndpointRecord[];
  webhookDeliveries?: readonly StoredWebhookDeliveryRecord[];
  slaProfiles?: readonly TenantSlaProfile[];
  partnerEntries?: readonly PartnerChannelEntryRecord[];
  partnerEligibilityVerifications?: readonly PartnerEligibilityVerificationRecord[];
  passengers?: readonly TenantPassengerRecord[];
  addresses?: readonly TenantAddressRecord[];
  userRoles?: readonly TenantUserRoleRecord[];
  apiKeys?: readonly StoredTenantApiKeyRecord[];
};

@Injectable()
export class TenantPartnerRepository {
  private readonly logger = new Logger(TenantPartnerRepository.name);

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  isEnabled() {
    return this.databaseService?.isEnabled() ?? false;
  }

  async loadState(): Promise<TenantPartnerState> {
    if (!this.isEnabled()) {
      return {
        notificationPreferences: [],
        webhookEndpoints: [],
        webhookDeliveries: [],
        slaProfiles: [],
        partnerEntries: [],
        partnerEligibilityVerifications: [],
        passengers: [],
        addresses: [],
        userRoles: [],
        apiKeys: [],
      };
    }

    const [
      notificationResult,
      webhookEndpointsResult,
      webhookDeliveriesResult,
      slaProfileResult,
      partnerEntriesResult,
      partnerEligibilityVerificationsResult,
      passengersResult,
      addressesResult,
      userRolesResult,
      apiKeysResult,
    ] = await Promise.all([
      this.databaseService!.query<JsonRecordRow>(
        `
          SELECT record
          FROM admin.phase1_tenant_notification_preferences
          ORDER BY updated_at DESC
        `,
      ),
      this.databaseService!.query<JsonRecordRow>(
        `
          SELECT record
          FROM admin.phase1_tenant_webhook_endpoints
          ORDER BY updated_at DESC, created_at DESC
        `,
      ),
      this.databaseService!.query<JsonRecordRow>(
        `
          SELECT record
          FROM admin.phase1_tenant_webhook_deliveries
          ORDER BY created_at DESC
        `,
      ),
      this.databaseService!.query<JsonRecordRow>(
        `
          SELECT record
          FROM admin.phase1_tenant_sla_profiles
          ORDER BY updated_at DESC
        `,
      ),
      this.databaseService!.query<JsonRecordRow>(
        `
          SELECT record
          FROM admin.phase1_partner_channel_entries
          ORDER BY updated_at DESC, created_at DESC
        `,
      ),
      this.databaseService!.query<JsonRecordRow>(
        `
          SELECT record
          FROM admin.phase1_partner_eligibility_verifications
          ORDER BY verified_at DESC, updated_at DESC
        `,
      ),
      this.databaseService!.query<JsonRecordRow>(
        `
          SELECT record
          FROM core.phase1_tenant_passengers
          ORDER BY updated_at DESC, created_at DESC
        `,
      ),
      this.databaseService!.query<JsonRecordRow>(
        `
          SELECT record
          FROM core.phase1_tenant_addresses
          ORDER BY updated_at DESC, created_at DESC
        `,
      ),
      this.databaseService!.query<JsonRecordRow>(
        `
          SELECT record
          FROM admin.phase1_tenant_user_roles
          ORDER BY updated_at DESC, invited_at DESC
        `,
      ),
      this.databaseService!.query<JsonRecordRow>(
        `
          SELECT record
          FROM admin.phase1_tenant_api_keys
          ORDER BY created_at DESC
        `,
      ),
    ]);

    return {
      notificationPreferences: notificationResult.rows.map((row) =>
        this.parseRecord<TenantNotificationPreferences>(
          row.record,
          "admin.phase1_tenant_notification_preferences",
        ),
      ),
      webhookEndpoints: webhookEndpointsResult.rows.map((row) =>
        this.parseRecord<StoredWebhookEndpointRecord>(
          row.record,
          "admin.phase1_tenant_webhook_endpoints",
        ),
      ),
      webhookDeliveries: webhookDeliveriesResult.rows.map((row) =>
        this.parseRecord<StoredWebhookDeliveryRecord>(
          row.record,
          "admin.phase1_tenant_webhook_deliveries",
        ),
      ),
      slaProfiles: slaProfileResult.rows.map((row) =>
        this.parseRecord<TenantSlaProfile>(
          row.record,
          "admin.phase1_tenant_sla_profiles",
        ),
      ),
      partnerEntries: partnerEntriesResult.rows.map((row) =>
        this.parseRecord<PartnerChannelEntryRecord>(
          row.record,
          "admin.phase1_partner_channel_entries",
        ),
      ),
      partnerEligibilityVerifications:
        partnerEligibilityVerificationsResult.rows.map((row) =>
          this.parseRecord<PartnerEligibilityVerificationRecord>(
            row.record,
            "admin.phase1_partner_eligibility_verifications",
          ),
        ),
      passengers: passengersResult.rows.map((row) =>
        this.parseRecord<TenantPassengerRecord>(
          row.record,
          "core.phase1_tenant_passengers",
        ),
      ),
      addresses: addressesResult.rows.map((row) =>
        this.parseRecord<TenantAddressRecord>(
          row.record,
          "core.phase1_tenant_addresses",
        ),
      ),
      userRoles: userRolesResult.rows.map((row) =>
        this.parseRecord<TenantUserRoleRecord>(
          row.record,
          "admin.phase1_tenant_user_roles",
        ),
      ),
      apiKeys: apiKeysResult.rows.map((row) =>
        this.parseRecord<StoredTenantApiKeyRecord>(
          row.record,
          "admin.phase1_tenant_api_keys",
        ),
      ),
    };
  }

  async persistChanges(changes: PersistTenantPartnerChanges) {
    if (!this.isEnabled()) {
      return;
    }

    const writes: Promise<unknown>[] = [];

    for (const preferences of changes.notificationPreferences ?? []) {
      writes.push(
        this.databaseService!.query(
          `
            INSERT INTO admin.phase1_tenant_notification_preferences (
              tenant_id,
              updated_at,
              record
            ) VALUES (
              $1, $2, $3::jsonb
            )
            ON CONFLICT (tenant_id) DO UPDATE SET
              updated_at = EXCLUDED.updated_at,
              record = EXCLUDED.record
          `,
          [
            preferences.tenantId,
            preferences.updatedAt,
            JSON.stringify(preferences),
          ],
        ),
      );
    }

    for (const slaProfile of changes.slaProfiles ?? []) {
      writes.push(
        this.databaseService!.query(
          `
            INSERT INTO admin.phase1_tenant_sla_profiles (
              tenant_id,
              updated_at,
              record
            ) VALUES (
              $1, $2, $3::jsonb
            )
            ON CONFLICT (tenant_id) DO UPDATE SET
              updated_at = EXCLUDED.updated_at,
              record = EXCLUDED.record
          `,
          [
            slaProfile.tenantId,
            slaProfile.updatedAt,
            JSON.stringify(slaProfile),
          ],
        ),
      );
    }

    for (const entry of changes.partnerEntries ?? []) {
      writes.push(
        this.databaseService!.query(
          `
            INSERT INTO admin.phase1_partner_channel_entries (
              entry_slug,
              tenant_id,
              partner_id,
              program_id,
              bank_code,
              status,
              created_at,
              updated_at,
              record
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb
            )
            ON CONFLICT (entry_slug) DO UPDATE SET
              tenant_id = EXCLUDED.tenant_id,
              partner_id = EXCLUDED.partner_id,
              program_id = EXCLUDED.program_id,
              bank_code = EXCLUDED.bank_code,
              status = EXCLUDED.status,
              created_at = EXCLUDED.created_at,
              updated_at = EXCLUDED.updated_at,
              record = EXCLUDED.record
          `,
          [
            entry.entrySlug,
            entry.tenantId,
            entry.partnerId,
            entry.programId,
            entry.bankCode,
            entry.status,
            entry.createdAt,
            entry.updatedAt,
            JSON.stringify(entry),
          ],
        ),
      );
    }

    for (const verification of changes.partnerEligibilityVerifications ?? []) {
      writes.push(
        this.databaseService!.query(
          `
            INSERT INTO admin.phase1_partner_eligibility_verifications (
              eligibility_verification_id,
              tenant_id,
              partner_id,
              program_id,
              entry_slug,
              verification_status,
              verified_at,
              updated_at,
              expires_at,
              record
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb
            )
            ON CONFLICT (eligibility_verification_id) DO UPDATE SET
              tenant_id = EXCLUDED.tenant_id,
              partner_id = EXCLUDED.partner_id,
              program_id = EXCLUDED.program_id,
              entry_slug = EXCLUDED.entry_slug,
              verification_status = EXCLUDED.verification_status,
              verified_at = EXCLUDED.verified_at,
              updated_at = EXCLUDED.updated_at,
              expires_at = EXCLUDED.expires_at,
              record = EXCLUDED.record
          `,
          [
            verification.eligibilityVerificationId,
            verification.tenantId,
            verification.partnerId,
            verification.partnerProgramId,
            verification.partnerEntrySlug,
            verification.verificationStatus,
            verification.verifiedAt,
            verification.updatedAt,
            verification.expiresAt,
            JSON.stringify(verification),
          ],
        ),
      );
    }

    for (const endpoint of changes.webhookEndpoints ?? []) {
      writes.push(
        this.databaseService!.query(
          `
            INSERT INTO admin.phase1_tenant_webhook_endpoints (
              webhook_id,
              tenant_id,
              status,
              created_at,
              updated_at,
              record
            ) VALUES (
              $1, $2, $3, $4, $5, $6::jsonb
            )
            ON CONFLICT (webhook_id) DO UPDATE SET
              tenant_id = EXCLUDED.tenant_id,
              status = EXCLUDED.status,
              created_at = EXCLUDED.created_at,
              updated_at = EXCLUDED.updated_at,
              record = EXCLUDED.record
          `,
          [
            endpoint.webhookId,
            endpoint.tenantId,
            endpoint.status,
            endpoint.createdAt,
            endpoint.updatedAt,
            JSON.stringify(endpoint),
          ],
        ),
      );
    }

    for (const delivery of changes.webhookDeliveries ?? []) {
      writes.push(
        this.databaseService!.query(
          `
            INSERT INTO admin.phase1_tenant_webhook_deliveries (
              delivery_id,
              webhook_id,
              tenant_id,
              event_type,
              status,
              created_at,
              record
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7::jsonb
            )
            ON CONFLICT (delivery_id) DO UPDATE SET
              webhook_id = EXCLUDED.webhook_id,
              tenant_id = EXCLUDED.tenant_id,
              event_type = EXCLUDED.event_type,
              status = EXCLUDED.status,
              created_at = EXCLUDED.created_at,
              record = EXCLUDED.record
          `,
          [
            delivery.deliveryId,
            delivery.webhookId,
            delivery.tenantId,
            delivery.eventType,
            delivery.status,
            delivery.createdAt,
            JSON.stringify(delivery),
          ],
        ),
      );
    }

    for (const passenger of changes.passengers ?? []) {
      writes.push(
        this.databaseService!.query(
          `
            INSERT INTO core.phase1_tenant_passengers (
              passenger_id,
              tenant_id,
              active_flag,
              created_at,
              updated_at,
              record
            ) VALUES (
              $1, $2, $3, $4, $5, $6::jsonb
            )
            ON CONFLICT (passenger_id) DO UPDATE SET
              tenant_id = EXCLUDED.tenant_id,
              active_flag = EXCLUDED.active_flag,
              created_at = EXCLUDED.created_at,
              updated_at = EXCLUDED.updated_at,
              record = EXCLUDED.record
          `,
          [
            passenger.passengerId,
            passenger.tenantId,
            passenger.activeFlag,
            passenger.createdAt,
            passenger.updatedAt,
            JSON.stringify(passenger),
          ],
        ),
      );
    }

    for (const address of changes.addresses ?? []) {
      writes.push(
        this.databaseService!.query(
          `
            INSERT INTO core.phase1_tenant_addresses (
              address_id,
              tenant_id,
              active_flag,
              created_at,
              updated_at,
              record
            ) VALUES (
              $1, $2, $3, $4, $5, $6::jsonb
            )
            ON CONFLICT (address_id) DO UPDATE SET
              tenant_id = EXCLUDED.tenant_id,
              active_flag = EXCLUDED.active_flag,
              created_at = EXCLUDED.created_at,
              updated_at = EXCLUDED.updated_at,
              record = EXCLUDED.record
          `,
          [
            address.addressId,
            address.tenantId,
            address.activeFlag,
            address.createdAt,
            address.updatedAt,
            JSON.stringify(address),
          ],
        ),
      );
    }

    for (const userRole of changes.userRoles ?? []) {
      writes.push(
        this.databaseService!.query(
          `
            INSERT INTO admin.phase1_tenant_user_roles (
              user_id,
              tenant_id,
              role_code,
              status,
              invited_at,
              updated_at,
              record
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7::jsonb
            )
            ON CONFLICT (user_id) DO UPDATE SET
              tenant_id = EXCLUDED.tenant_id,
              role_code = EXCLUDED.role_code,
              status = EXCLUDED.status,
              invited_at = EXCLUDED.invited_at,
              updated_at = EXCLUDED.updated_at,
              record = EXCLUDED.record
          `,
          [
            userRole.userId,
            userRole.tenantId,
            userRole.roleCode,
            userRole.status,
            userRole.invitedAt,
            userRole.updatedAt,
            JSON.stringify(userRole),
          ],
        ),
      );
    }

    for (const apiKey of changes.apiKeys ?? []) {
      writes.push(
        this.databaseService!.query(
          `
            INSERT INTO admin.phase1_tenant_api_keys (
              api_key_id,
              tenant_id,
              revoked_at,
              created_at,
              record
            ) VALUES (
              $1, $2, $3, $4, $5::jsonb
            )
            ON CONFLICT (api_key_id) DO UPDATE SET
              tenant_id = EXCLUDED.tenant_id,
              revoked_at = EXCLUDED.revoked_at,
              created_at = EXCLUDED.created_at,
              record = EXCLUDED.record
          `,
          [
            apiKey.apiKeyId,
            apiKey.tenantId,
            apiKey.revokedAt,
            apiKey.createdAt,
            JSON.stringify(apiKey),
          ],
        ),
      );
    }

    await Promise.all(writes);
  }

  reportPersistenceFailure(error: unknown, context: string) {
    const detail = error instanceof Error ? error.message : String(error);
    this.logger.warn(
      `Tenant-partner persistence skipped during ${context}: ${detail}`,
    );
  }

  private parseRecord<T>(record: unknown, source: string): T {
    if (!record || typeof record !== "object") {
      throw new Error(`Invalid persisted record loaded from ${source}`);
    }

    return record as T;
  }
}
