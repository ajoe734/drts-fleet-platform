import { Injectable, Logger, Optional } from "@nestjs/common";

import type { FeatureFlag } from "@drts/contracts";

import { DatabaseService } from "../../common/db";

interface FeatureFlagRow {
  flag_key: string;
  enabled: boolean;
  description: string;
  tenant_id: string | null;
  updated_at: Date | string;
}

@Injectable()
export class FeatureFlagRepository {
  private readonly logger = new Logger(FeatureFlagRepository.name);

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  isEnabled() {
    return this.databaseService?.isEnabled() ?? false;
  }

  async findAll(): Promise<FeatureFlag[]> {
    if (!this.isEnabled()) {
      return [];
    }

    try {
      const result = await this.databaseService!.query<FeatureFlagRow>(
        `SELECT flag_key, enabled, description, tenant_id, updated_at
         FROM admin.feature_flags
         ORDER BY flag_key, tenant_id`,
      );
      return result.rows.map((row) => this.mapRow(row));
    } catch (error) {
      this.logger.warn(`Failed to load feature flags: ${error}`);
      return [];
    }
  }

  async findByKey(
    key: string,
    tenantId?: string,
  ): Promise<FeatureFlag | undefined> {
    if (!this.isEnabled()) {
      return undefined;
    }

    try {
      // If tenantId is provided, look for tenant-specific override; fall back to global
      const query = tenantId
        ? `SELECT flag_key, enabled, description, tenant_id, updated_at
           FROM admin.feature_flags
           WHERE flag_key = $1 AND (tenant_id = $2 OR tenant_id IS NULL)
           ORDER BY tenant_id DESC NULLS LAST
           LIMIT 1`
        : `SELECT flag_key, enabled, description, tenant_id, updated_at
           FROM admin.feature_flags
           WHERE flag_key = $1 AND tenant_id IS NULL
           LIMIT 1`;

      const params = tenantId ? [key, tenantId] : [key];
      const result = await this.databaseService!.query<FeatureFlagRow>(
        query,
        params,
      );

      if (result.rows.length === 0) return undefined;
      // Safe: checked length > 0
      const row = result.rows[0]!;
      return this.mapRow(row);
    } catch (error) {
      this.logger.warn(`Failed to find feature flag ${key}: ${error}`);
      return undefined;
    }
  }

  async updateFlag(
    key: string,
    enabled: boolean,
  ): Promise<FeatureFlag | undefined> {
    if (!this.isEnabled()) {
      return undefined;
    }

    try {
      const result = await this.databaseService!.query<FeatureFlagRow>(
        `UPDATE admin.feature_flags
         SET enabled = $2, updated_at = NOW()
         WHERE flag_key = $1 AND tenant_id IS NULL
         RETURNING flag_key, enabled, description, tenant_id, updated_at`,
        [key, enabled],
      );

      if (result.rows.length === 0) return undefined;
      const row = result.rows[0]!;
      return this.mapRow(row);
    } catch (error) {
      this.logger.warn(`Failed to update feature flag ${key}: ${error}`);
      return undefined;
    }
  }

  async upsertTenantOverride(
    key: string,
    tenantId: string,
    enabled: boolean,
    description: string,
  ): Promise<FeatureFlag | undefined> {
    if (!this.isEnabled()) {
      return undefined;
    }

    try {
      const result = await this.databaseService!.query<FeatureFlagRow>(
        `INSERT INTO admin.feature_flags (flag_key, enabled, description, tenant_id, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (flag_key, tenant_id)
         DO UPDATE SET enabled = $2, description = $3, updated_at = NOW()
         RETURNING flag_key, enabled, description, tenant_id, updated_at`,
        [key, enabled, description, tenantId],
      );

      if (result.rows.length === 0) return undefined;
      const row = result.rows[0]!;
      return this.mapRow(row);
    } catch (error) {
      this.logger.warn(
        `Failed to upsert tenant override for ${key}/${tenantId}: ${error}`,
      );
      return undefined;
    }
  }

  private mapRow(row: FeatureFlagRow): FeatureFlag {
    const updatedAt =
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : new Date(row.updated_at).toISOString();

    const result: FeatureFlag = {
      key: row.flag_key,
      enabled: row.enabled,
      description: row.description,
      updatedAt,
    };
    if (row.tenant_id != null) {
      result.tenantId = row.tenant_id;
    }
    return result;
  }
}
