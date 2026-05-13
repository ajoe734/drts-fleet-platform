import { Injectable, Logger, Optional } from "@nestjs/common";
import type { PoolClient, QueryResult, QueryResultRow } from "pg";

import type {
  PartnerChannelEntryRecord,
  PartnerEligibilityVerificationRecord,
  PartnerIngressCredentialRecord,
  TenantAddressRecord,
  TenantApprovalRuleRecord,
  TenantApiKeyRecord,
  TenantCostCenterRecord,
  TenantNotificationPreferences,
  TenantPassengerRecord,
  TenantQuotaLedgerEntry,
  TenantQuotaPeriod,
  TenantQuotaPolicyRecord,
  TenantQuotaUsage,
  TenantSlaProfile,
  TenantUserRoleRecord,
  TenantWebhookEndpoint,
  WebhookDeliveryRecord,
} from "@drts/contracts";

import { DatabaseService } from "../../common/db";

type JsonRecordRow = {
  record: unknown;
};

export type TenantPartnerQueryExecutor = {
  query<T extends QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<T>>;
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
  lastValidatedAt: string | null;
  nextAttemptAt: string | null;
  lastSignaturePreview: string | null;
  disabledAt: string | null;
  disableReason: "manual_disable" | "delivery_failed" | null;
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

export type StoredPartnerIngressCredentialRecord =
  PartnerIngressCredentialRecord & {
    keyHash: string;
  };

export type TenantQuotaMonthlySnapshotRecord = {
  tenantId: string;
  costCenterCode: string | null;
  period: TenantQuotaPeriod;
  periodKey: string;
  limit: TenantQuotaPolicyRecord["limit"];
  usage: TenantQuotaUsage;
  refreshedAt: string;
};

export type TenantPartnerState = {
  notificationPreferences: TenantNotificationPreferences[];
  webhookEndpoints: StoredWebhookEndpointRecord[];
  webhookDeliveries: StoredWebhookDeliveryRecord[];
  slaProfiles: TenantSlaProfile[];
  partnerEntries: PartnerChannelEntryRecord[];
  partnerIngressCredentials: StoredPartnerIngressCredentialRecord[];
  partnerEligibilityVerifications: PartnerEligibilityVerificationRecord[];
  approvalRules: TenantApprovalRuleRecord[];
  passengers: TenantPassengerRecord[];
  addresses: TenantAddressRecord[];
  costCenters: TenantCostCenterRecord[];
  quotaPolicies: TenantQuotaPolicyRecord[];
  quotaLedger: TenantQuotaLedgerEntry[];
  quotaMonthlySnapshots: TenantQuotaMonthlySnapshotRecord[];
  userRoles: TenantUserRoleRecord[];
  apiKeys: StoredTenantApiKeyRecord[];
};

export type PersistTenantPartnerChanges = {
  notificationPreferences?: readonly TenantNotificationPreferences[];
  webhookEndpoints?: readonly StoredWebhookEndpointRecord[];
  webhookDeliveries?: readonly StoredWebhookDeliveryRecord[];
  slaProfiles?: readonly TenantSlaProfile[];
  partnerEntries?: readonly PartnerChannelEntryRecord[];
  partnerIngressCredentials?: readonly StoredPartnerIngressCredentialRecord[];
  partnerEligibilityVerifications?: readonly PartnerEligibilityVerificationRecord[];
  approvalRules?: readonly TenantApprovalRuleRecord[];
  passengers?: readonly TenantPassengerRecord[];
  addresses?: readonly TenantAddressRecord[];
  costCenters?: readonly TenantCostCenterRecord[];
  quotaPolicies?: readonly TenantQuotaPolicyRecord[];
  quotaLedger?: readonly TenantQuotaLedgerEntry[];
  quotaMonthlySnapshots?: readonly TenantQuotaMonthlySnapshotRecord[];
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
        partnerIngressCredentials: [],
        partnerEligibilityVerifications: [],
        approvalRules: [],
        passengers: [],
        addresses: [],
        costCenters: [],
        quotaPolicies: [],
        quotaLedger: [],
        quotaMonthlySnapshots: [],
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
      partnerIngressCredentialsResult,
      partnerEligibilityVerificationsResult,
      approvalRulesResult,
      passengersResult,
      addressesResult,
      costCentersResult,
      quotaPoliciesResult,
      quotaLedgerResult,
      quotaMonthlySnapshotsResult,
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
          FROM admin.phase1_partner_ingress_credentials
          ORDER BY created_at DESC
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
          FROM core.phase1_tenant_approval_rules
          ORDER BY tenant_id ASC, updated_at DESC, created_at DESC
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
          FROM core.phase1_tenant_cost_centers
          ORDER BY updated_at DESC, created_at DESC
        `,
      ),
      this.databaseService!.query<JsonRecordRow>(
        `
          SELECT record
          FROM core.phase1_tenant_quota_policies
          ORDER BY updated_at DESC, created_at DESC
        `,
      ),
      this.databaseService!.query<JsonRecordRow>(
        `
          SELECT record
          FROM core.phase1_tenant_quota_ledger
          ORDER BY created_at DESC, ledger_entry_id DESC
        `,
      ),
      this.databaseService!.query<JsonRecordRow>(
        `
          SELECT record
          FROM core.phase1_tenant_quota_monthly_snapshots
          ORDER BY refreshed_at DESC
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
      partnerIngressCredentials: partnerIngressCredentialsResult.rows.map(
        (row) =>
          this.parseRecord<StoredPartnerIngressCredentialRecord>(
            row.record,
            "admin.phase1_partner_ingress_credentials",
          ),
      ),
      partnerEligibilityVerifications:
        partnerEligibilityVerificationsResult.rows.map((row) =>
          this.parseRecord<PartnerEligibilityVerificationRecord>(
            row.record,
            "admin.phase1_partner_eligibility_verifications",
          ),
        ),
      approvalRules: approvalRulesResult.rows.map((row) =>
        this.parseRecord<TenantApprovalRuleRecord>(
          row.record,
          "core.phase1_tenant_approval_rules",
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
      costCenters: costCentersResult.rows.map((row) =>
        this.parseRecord<TenantCostCenterRecord>(
          row.record,
          "core.phase1_tenant_cost_centers",
        ),
      ),
      quotaPolicies: quotaPoliciesResult.rows.map((row) =>
        this.parseRecord<TenantQuotaPolicyRecord>(
          row.record,
          "core.phase1_tenant_quota_policies",
        ),
      ),
      quotaLedger: quotaLedgerResult.rows.map((row) =>
        this.parseRecord<TenantQuotaLedgerEntry>(
          row.record,
          "core.phase1_tenant_quota_ledger",
        ),
      ),
      quotaMonthlySnapshots: quotaMonthlySnapshotsResult.rows.map((row) =>
        this.parseRecord<TenantQuotaMonthlySnapshotRecord>(
          row.record,
          "core.phase1_tenant_quota_monthly_snapshots",
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

    for (const credential of changes.partnerIngressCredentials ?? []) {
      writes.push(
        this.databaseService!.query(
          `
            INSERT INTO admin.phase1_partner_ingress_credentials (
              key_id,
              entry_slug,
              revoked_at,
              created_at,
              record
            ) VALUES (
              $1, $2, $3, $4, $5::jsonb
            )
            ON CONFLICT (key_id) DO UPDATE SET
              entry_slug = EXCLUDED.entry_slug,
              revoked_at = EXCLUDED.revoked_at,
              created_at = EXCLUDED.created_at,
              record = EXCLUDED.record
          `,
          [
            credential.keyId,
            credential.entrySlug,
            credential.revokedAt,
            credential.createdAt,
            JSON.stringify(credential),
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

    for (const rule of changes.approvalRules ?? []) {
      writes.push(
        this.databaseService!.query(
          `
            INSERT INTO core.phase1_tenant_approval_rules (
              rule_id,
              tenant_id,
              active_flag,
              created_at,
              updated_at,
              record
            ) VALUES (
              $1, $2, $3, $4, $5, $6::jsonb
            )
            ON CONFLICT (rule_id) DO UPDATE SET
              tenant_id = EXCLUDED.tenant_id,
              active_flag = EXCLUDED.active_flag,
              created_at = EXCLUDED.created_at,
              updated_at = EXCLUDED.updated_at,
              record = EXCLUDED.record
          `,
          [
            rule.ruleId,
            rule.tenantId,
            rule.activeFlag,
            rule.createdAt,
            rule.updatedAt,
            JSON.stringify(rule),
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

    for (const costCenter of changes.costCenters ?? []) {
      writes.push(
        this.databaseService!.query(
          `
            INSERT INTO core.phase1_tenant_cost_centers (
              tenant_id,
              code,
              active_flag,
              created_at,
              updated_at,
              record
            ) VALUES (
              $1, $2, $3, $4, $5, $6::jsonb
            )
            ON CONFLICT (tenant_id, code) DO UPDATE SET
              active_flag = EXCLUDED.active_flag,
              created_at = EXCLUDED.created_at,
              updated_at = EXCLUDED.updated_at,
              record = EXCLUDED.record
          `,
          [
            costCenter.tenantId,
            costCenter.code,
            costCenter.activeFlag,
            costCenter.createdAt,
            costCenter.updatedAt,
            JSON.stringify(costCenter),
          ],
        ),
      );
    }

    for (const policy of changes.quotaPolicies ?? []) {
      writes.push(
        this.databaseService!.query(
          `
            INSERT INTO core.phase1_tenant_quota_policies (
              tenant_id,
              cost_center_code,
              period,
              updated_at,
              created_at,
              record
            ) VALUES (
              $1, $2, $3, $4, $5, $6::jsonb
            )
            ON CONFLICT (tenant_id, cost_center_code, period) DO UPDATE SET
              updated_at = EXCLUDED.updated_at,
              created_at = EXCLUDED.created_at,
              record = EXCLUDED.record
          `,
          [
            policy.tenantId,
            policy.costCenterCode,
            policy.period,
            policy.updatedAt,
            policy.createdAt,
            JSON.stringify(policy),
          ],
        ),
      );
    }

    for (const entry of changes.quotaLedger ?? []) {
      writes.push(
        this.databaseService!.query(
          `
            INSERT INTO core.phase1_tenant_quota_ledger (
              ledger_entry_id,
              tenant_id,
              cost_center_code,
              period_key,
              dimension,
              entry_type,
              booking_id,
              evaluation_id,
              created_at,
              record
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb
            )
            ON CONFLICT (ledger_entry_id) DO UPDATE SET
              tenant_id = EXCLUDED.tenant_id,
              cost_center_code = EXCLUDED.cost_center_code,
              period_key = EXCLUDED.period_key,
              dimension = EXCLUDED.dimension,
              entry_type = EXCLUDED.entry_type,
              booking_id = EXCLUDED.booking_id,
              evaluation_id = EXCLUDED.evaluation_id,
              created_at = EXCLUDED.created_at,
              record = EXCLUDED.record
          `,
          [
            entry.ledgerEntryId,
            entry.tenantId,
            entry.costCenterCode,
            entry.periodKey,
            entry.dimension,
            entry.entryType,
            entry.bookingId,
            entry.evaluationId,
            entry.createdAt,
            JSON.stringify(entry),
          ],
        ),
      );
    }

    for (const snapshot of changes.quotaMonthlySnapshots ?? []) {
      writes.push(
        this.databaseService!.query(
          `
            INSERT INTO core.phase1_tenant_quota_monthly_snapshots (
              tenant_id,
              cost_center_code,
              period,
              period_key,
              refreshed_at,
              record
            ) VALUES (
              $1, $2, $3, $4, $5, $6::jsonb
            )
            ON CONFLICT (tenant_id, cost_center_code, period, period_key) DO UPDATE SET
              refreshed_at = EXCLUDED.refreshed_at,
              record = EXCLUDED.record
          `,
          [
            snapshot.tenantId,
            snapshot.costCenterCode,
            snapshot.period,
            snapshot.periodKey,
            snapshot.refreshedAt,
            JSON.stringify(snapshot),
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

  async withTransaction<T>(work: (executor: PoolClient) => Promise<T>) {
    if (!this.isEnabled()) {
      throw new Error("DATABASE_URL is not configured");
    }

    const client = await this.databaseService!.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        this.logger.warn(
          `Tenant-partner transaction rollback failed: ${
            rollbackError instanceof Error
              ? rollbackError.message
              : String(rollbackError)
          }`,
        );
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async loadQuotaPoliciesForUpdate(
    executor: TenantPartnerQueryExecutor,
    tenantId: string,
    costCenterCode: string | null,
  ) {
    const { clause, values } = this.buildQuotaScopeClause(
      tenantId,
      costCenterCode,
      "monthly",
    );
    const result = await executor.query<JsonRecordRow>(
      `
        SELECT record
        FROM core.phase1_tenant_quota_policies
        WHERE ${clause}
        ORDER BY cost_center_code NULLS FIRST
        FOR UPDATE
      `,
      values,
    );

    return result.rows.map((row) =>
      this.parseRecord<TenantQuotaPolicyRecord>(
        row.record,
        "core.phase1_tenant_quota_policies",
      ),
    );
  }

  async ensureQuotaMonthlySnapshots(
    executor: TenantPartnerQueryExecutor,
    snapshots: readonly TenantQuotaMonthlySnapshotRecord[],
  ) {
    await Promise.all(
      snapshots.map((snapshot) =>
        executor.query(
          `
            INSERT INTO core.phase1_tenant_quota_monthly_snapshots (
              tenant_id,
              cost_center_code,
              period,
              period_key,
              refreshed_at,
              record
            ) VALUES (
              $1, $2, $3, $4, $5, $6::jsonb
            )
            ON CONFLICT (tenant_id, cost_center_code, period, period_key) DO NOTHING
          `,
          [
            snapshot.tenantId,
            snapshot.costCenterCode,
            snapshot.period,
            snapshot.periodKey,
            snapshot.refreshedAt,
            JSON.stringify(snapshot),
          ],
        ),
      ),
    );
  }

  async loadQuotaMonthlySnapshotsForUpdate(
    executor: TenantPartnerQueryExecutor,
    tenantId: string,
    costCenterCode: string | null,
    periodKey: string,
  ) {
    const values: unknown[] = [tenantId, "monthly", periodKey];
    let scopeClause = "cost_center_code IS NULL";
    if (costCenterCode !== null) {
      values.push(costCenterCode);
      scopeClause = "(cost_center_code IS NULL OR cost_center_code = $4)";
    }
    const result = await executor.query<JsonRecordRow>(
      `
        SELECT record
        FROM core.phase1_tenant_quota_monthly_snapshots
        WHERE tenant_id = $1
          AND period = $2
          AND period_key = $3
          AND ${scopeClause}
        ORDER BY cost_center_code NULLS FIRST
        FOR UPDATE
      `,
      values,
    );

    return result.rows.map((row) =>
      this.parseRecord<TenantQuotaMonthlySnapshotRecord>(
        row.record,
        "core.phase1_tenant_quota_monthly_snapshots",
      ),
    );
  }

  async persistQuotaReservation(
    executor: TenantPartnerQueryExecutor,
    changes: {
      quotaLedger?: readonly TenantQuotaLedgerEntry[];
      quotaMonthlySnapshots?: readonly TenantQuotaMonthlySnapshotRecord[];
    },
  ) {
    await Promise.all([
      this.persistQuotaLedgerWithExecutor(executor, changes.quotaLedger ?? []),
      this.persistQuotaSnapshotsWithExecutor(
        executor,
        changes.quotaMonthlySnapshots ?? [],
      ),
    ]);
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

  private buildQuotaScopeClause(
    tenantId: string,
    costCenterCode: string | null,
    period: TenantQuotaPeriod,
  ) {
    const values: unknown[] = [tenantId, period];
    if (costCenterCode === null) {
      return {
        clause: "tenant_id = $1 AND period = $2 AND cost_center_code IS NULL",
        values,
      };
    }

    values.push(costCenterCode);
    return {
      clause:
        "tenant_id = $1 AND period = $2 AND (cost_center_code IS NULL OR cost_center_code = $3)",
      values,
    };
  }

  private async persistQuotaLedgerWithExecutor(
    executor: TenantPartnerQueryExecutor,
    entries: readonly TenantQuotaLedgerEntry[],
  ) {
    await Promise.all(
      entries.map((entry) =>
        executor.query(
          `
            INSERT INTO core.phase1_tenant_quota_ledger (
              ledger_entry_id,
              tenant_id,
              cost_center_code,
              period_key,
              dimension,
              entry_type,
              booking_id,
              evaluation_id,
              created_at,
              record
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb
            )
            ON CONFLICT (ledger_entry_id) DO UPDATE SET
              tenant_id = EXCLUDED.tenant_id,
              cost_center_code = EXCLUDED.cost_center_code,
              period_key = EXCLUDED.period_key,
              dimension = EXCLUDED.dimension,
              entry_type = EXCLUDED.entry_type,
              booking_id = EXCLUDED.booking_id,
              evaluation_id = EXCLUDED.evaluation_id,
              created_at = EXCLUDED.created_at,
              record = EXCLUDED.record
          `,
          [
            entry.ledgerEntryId,
            entry.tenantId,
            entry.costCenterCode,
            entry.periodKey,
            entry.dimension,
            entry.entryType,
            entry.bookingId,
            entry.evaluationId,
            entry.createdAt,
            JSON.stringify(entry),
          ],
        ),
      ),
    );
  }

  private async persistQuotaSnapshotsWithExecutor(
    executor: TenantPartnerQueryExecutor,
    snapshots: readonly TenantQuotaMonthlySnapshotRecord[],
  ) {
    await Promise.all(
      snapshots.map((snapshot) =>
        executor.query(
          `
            INSERT INTO core.phase1_tenant_quota_monthly_snapshots (
              tenant_id,
              cost_center_code,
              period,
              period_key,
              refreshed_at,
              record
            ) VALUES (
              $1, $2, $3, $4, $5, $6::jsonb
            )
            ON CONFLICT (tenant_id, cost_center_code, period, period_key) DO UPDATE SET
              refreshed_at = EXCLUDED.refreshed_at,
              record = EXCLUDED.record
          `,
          [
            snapshot.tenantId,
            snapshot.costCenterCode,
            snapshot.period,
            snapshot.periodKey,
            snapshot.refreshedAt,
            JSON.stringify(snapshot),
          ],
        ),
      ),
    );
  }
}
