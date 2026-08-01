import { createHash, randomUUID } from "node:crypto";

import { Injectable, Logger, Optional } from "@nestjs/common";
import type { PoolClient } from "pg";

import type {
  CanonicalRefreshFamilyRecord,
  CanonicalRefreshTokenRecord,
  CanonicalSessionRecord,
} from "@drts/contracts";

import { DatabaseService } from "../../common/db";

type JsonRecordRow = {
  record: unknown;
};

type DriverDeviceSessionIssueInput = {
  driverId: string;
  deviceId: string;
  deviceLabel: string | null;
  riskSummary: CanonicalSessionRecord["riskSummary"];
  issuedAt: string;
  idleExpiresAt: string;
  absoluteExpiresAt: string;
  refreshToken: string;
};

type DriverRefreshRotationInput = {
  deviceId: string;
  refreshToken: string;
  nextRefreshToken: string;
  rotatedAt: string;
  idleExpiresAt: string;
  riskSummary: CanonicalSessionRecord["riskSummary"];
};

type DriverSessionView = {
  session: CanonicalSessionRecord;
  family: CanonicalRefreshFamilyRecord;
  currentRefreshToken: CanonicalRefreshTokenRecord;
};

type RotateDriverRefreshResult =
  | {
      outcome: "rotated";
      session: CanonicalSessionRecord;
      family: CanonicalRefreshFamilyRecord;
      currentRefreshToken: CanonicalRefreshTokenRecord;
    }
  | { outcome: "invalid" };

@Injectable()
export class DriverDeviceSessionRepository {
  private readonly logger = new Logger(DriverDeviceSessionRepository.name);

  private readonly fallbackSessions = new Map<string, CanonicalSessionRecord>();

  private readonly fallbackFamilies = new Map<
    string,
    CanonicalRefreshFamilyRecord
  >();

  private readonly fallbackRefreshTokens = new Map<
    string,
    CanonicalRefreshTokenRecord
  >();

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  isEnabled() {
    return this.databaseService?.isEnabled() ?? false;
  }

  async issueDriverDeviceSession(
    input: DriverDeviceSessionIssueInput,
  ): Promise<DriverSessionView> {
    const sessionId = `drv_session_${randomUUID()}`;
    const familyId = `drv_family_${randomUUID()}`;
    const refreshTokenId = `drv_refresh_${randomUUID()}`;
    const refreshTokenHash = this.hashSecret(input.refreshToken);
    const session = this.buildSessionRecord({
      sessionId,
      familyId,
      driverId: input.driverId,
      deviceId: input.deviceId,
      deviceLabel: input.deviceLabel,
      riskSummary: input.riskSummary,
      issuedAt: input.issuedAt,
      refreshedAt: input.issuedAt,
      expiresAt: input.idleExpiresAt,
      revokedAt: null,
      revokeReason: null,
      status: "active",
    });
    const family = this.buildFamilyRecord({
      familyId,
      sessionId,
      currentTokenId: null,
      previousTokenId: null,
      issuedAt: input.issuedAt,
      lastRotatedAt: input.issuedAt,
      absoluteExpiresAt: input.absoluteExpiresAt,
      revokedAt: null,
      revokeReason: null,
      status: "active",
    });
    const refreshTokenRecord = this.buildRefreshTokenRecord({
      refreshTokenId,
      familyId,
      sessionId,
      tokenHash: refreshTokenHash,
      deviceId: input.deviceId,
      issuedAt: input.issuedAt,
      expiresAt: input.idleExpiresAt,
      consumedAt: null,
      revokedAt: null,
    });

    if (!this.isEnabled()) {
      const persistedFamily = this.buildFamilyRecord({
        familyId: family.familyId,
        sessionId: family.sessionId,
        currentTokenId: refreshTokenRecord.refreshTokenId,
        previousTokenId: family.previousTokenId,
        issuedAt: family.createdAt,
        lastRotatedAt: family.lastRotatedAt,
        absoluteExpiresAt: family.absoluteExpiresAt,
        revokedAt: family.revokedAt,
        revokeReason: family.revokeReason,
        status: family.status,
        createdAt: family.createdAt,
      });
      this.upsertFallbackSession(session);
      this.upsertFallbackFamily(persistedFamily);
      this.upsertFallbackRefreshToken(refreshTokenRecord);
      return {
        session,
        family: persistedFamily,
        currentRefreshToken: refreshTokenRecord,
      };
    }

    const client = await this.databaseService!.connect();
    try {
      await client.query("BEGIN");
      await this.insertSession(client, session);
      await this.insertFamily(client, family);
      await this.insertRefreshToken(client, refreshTokenRecord);
      const persistedFamily = this.buildFamilyRecord({
        familyId: family.familyId,
        sessionId: family.sessionId,
        currentTokenId: refreshTokenRecord.refreshTokenId,
        previousTokenId: family.previousTokenId,
        issuedAt: family.createdAt,
        lastRotatedAt: family.lastRotatedAt,
        absoluteExpiresAt: family.absoluteExpiresAt,
        revokedAt: family.revokedAt,
        revokeReason: family.revokeReason,
        status: family.status,
        createdAt: family.createdAt,
      });
      await client.query(
        `
          UPDATE iam.refresh_families
          SET current_token_id = $2::varchar,
              updated_at = $3::timestamptz,
              record = jsonb_set(
                jsonb_set(record, '{currentTokenId}', to_jsonb($2::text), true),
                '{updatedAt}',
                to_jsonb($3::text),
                true
              )
          WHERE family_id = $1::varchar
        `,
        [
          family.familyId,
          refreshTokenRecord.refreshTokenId,
          persistedFamily.updatedAt,
        ],
      );
      await client.query("COMMIT");
      return {
        session,
        family: persistedFamily,
        currentRefreshToken: refreshTokenRecord,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async rotateDriverRefreshToken(
    input: DriverRefreshRotationInput,
  ): Promise<RotateDriverRefreshResult> {
    const refreshTokenHash = this.hashSecret(input.refreshToken);
    const nextRefreshTokenId = `drv_refresh_${randomUUID()}`;
    const nextRefreshTokenHash = this.hashSecret(input.nextRefreshToken);

    if (!this.isEnabled()) {
      return this.rotateDriverRefreshTokenFallback({
        ...input,
        refreshTokenHash,
        nextRefreshTokenId,
        nextRefreshTokenHash,
      });
    }

    const client = await this.databaseService!.connect();
    try {
      await client.query("BEGIN");
      const matchedToken = await this.findRefreshTokenByHash(client, refreshTokenHash);
      if (!matchedToken) {
        await client.query("ROLLBACK");
        return { outcome: "invalid" };
      }

      const session = await this.getSessionById(client, matchedToken.sessionId);
      const family = await this.getFamilyById(client, matchedToken.familyId);
      if (!session || !family) {
        await client.query("ROLLBACK");
        return { outcome: "invalid" };
      }

      const nextIdleExpiresAt = this.resolveNextIdleExpiry(
        input.idleExpiresAt,
        family.absoluteExpiresAt,
      );

      if (
        matchedToken.deviceId !== input.deviceId ||
        matchedToken.consumedAt !== null ||
        matchedToken.revokedAt !== null ||
        family.status !== "active" ||
        session.status !== "active" ||
        matchedToken.expiresAt <= input.rotatedAt ||
        family.absoluteExpiresAt <= input.rotatedAt ||
        session.expiresAt <= input.rotatedAt
      ) {
        await this.revokeFamilyTransaction(
          client,
          session,
          family,
          input.rotatedAt,
          matchedToken.consumedAt ? "refresh_token_reuse_detected" : "refresh_token_invalid",
        );
        await client.query("COMMIT");
        return { outcome: "invalid" };
      }

      const consumeResult = await client.query(
        `
          UPDATE iam.refresh_tokens
          SET consumed_at = $2,
              updated_at = $2,
              record = jsonb_set(
                jsonb_set(record, '{consumedAt}', to_jsonb($2::text), true),
                '{updatedAt}',
                to_jsonb($2::text),
                true
              )
          WHERE refresh_token_id = $1
            AND consumed_at IS NULL
            AND revoked_at IS NULL
            AND expires_at > $2
          RETURNING record
        `,
        [matchedToken.refreshTokenId, input.rotatedAt],
      );

      if (consumeResult.rowCount !== 1) {
        await this.revokeFamilyTransaction(
          client,
          session,
          family,
          input.rotatedAt,
          "refresh_token_reuse_detected",
        );
        await client.query("COMMIT");
        return { outcome: "invalid" };
      }

      const nextRefreshToken = this.buildRefreshTokenRecord({
        refreshTokenId: nextRefreshTokenId,
        familyId: family.familyId,
        sessionId: session.sessionId,
        tokenHash: nextRefreshTokenHash,
        deviceId: session.deviceId,
        issuedAt: input.rotatedAt,
        expiresAt: nextIdleExpiresAt,
        consumedAt: null,
        revokedAt: null,
      });
      const nextSession = this.buildSessionRecord({
        sessionId: session.sessionId,
        familyId: session.familyId,
        driverId: session.driverId ?? session.actorId,
        deviceId: session.deviceId,
        deviceLabel: session.deviceLabel,
        riskSummary: input.riskSummary,
        issuedAt: session.startedAt,
        refreshedAt: input.rotatedAt,
        expiresAt: nextIdleExpiresAt,
        revokedAt: null,
        revokeReason: null,
        status: "active",
        createdAt: session.createdAt,
      });
      const nextFamily = this.buildFamilyRecord({
        familyId: family.familyId,
        sessionId: session.sessionId,
        currentTokenId: nextRefreshToken.refreshTokenId,
        previousTokenId: matchedToken.refreshTokenId,
        issuedAt: family.createdAt,
        lastRotatedAt: input.rotatedAt,
        absoluteExpiresAt: family.absoluteExpiresAt,
        revokedAt: null,
        revokeReason: null,
        status: "active",
        createdAt: family.createdAt,
      });

      await this.insertRefreshToken(client, nextRefreshToken);
      await this.updateSession(client, nextSession);
      await this.updateFamily(client, nextFamily);
      await client.query("COMMIT");

      return {
        outcome: "rotated",
        session: nextSession,
        family: nextFamily,
        currentRefreshToken: nextRefreshToken,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async revokeDriverSession(
    command:
      | { bindingId: string; deviceId?: string | null }
      | { bindingId?: string | null; deviceId: string },
    revokedAt: string,
    revokeReason: string,
  ): Promise<CanonicalSessionRecord | null> {
    if (!this.isEnabled()) {
      return this.revokeDriverSessionFallback(command, revokedAt, revokeReason);
    }

    const client = await this.databaseService!.connect();
    try {
      await client.query("BEGIN");
      const session =
        "bindingId" in command && command.bindingId
          ? await this.getSessionById(client, command.bindingId)
          : await this.getActiveSessionByDeviceId(
              client,
              "deviceId" in command ? (command.deviceId ?? "") : "",
            );
      if (!session) {
        await client.query("ROLLBACK");
        return null;
      }
      const family = await this.getFamilyById(client, session.familyId);
      if (!family) {
        await client.query("ROLLBACK");
        return null;
      }
      await this.revokeFamilyTransaction(
        client,
        session,
        family,
        revokedAt,
        revokeReason,
      );
      await client.query("COMMIT");
      return this.getSessionById(this.databaseService!, session.sessionId);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async isDriverSessionActive(
    bindingId: string,
    deviceId: string,
    driverId: string,
    now: string,
  ): Promise<boolean> {
    if (!this.isEnabled()) {
      const session = this.fallbackSessions.get(bindingId);
      return this.isSessionActive(session, deviceId, driverId, now);
    }

    const session = await this.getSessionById(this.databaseService!, bindingId);
    return this.isSessionActive(session, deviceId, driverId, now);
  }

  async loadSession(bindingId: string): Promise<CanonicalSessionRecord | null> {
    if (!this.isEnabled()) {
      return this.fallbackSessions.get(bindingId) ?? null;
    }

    return this.getSessionById(this.databaseService!, bindingId);
  }

  async loadActiveSessionByDeviceId(
    deviceId: string,
  ): Promise<CanonicalSessionRecord | null> {
    if (!this.isEnabled()) {
      return (
        Array.from(this.fallbackSessions.values()).find(
          (candidate) =>
            candidate.deviceId === deviceId && candidate.status === "active",
        ) ?? null
      );
    }

    return this.getActiveSessionByDeviceId(this.databaseService!, deviceId);
  }

  listFallbackSessions() {
    return Array.from(this.fallbackSessions.values(), (session) => ({
      ...session,
      riskSummary: session.riskSummary
        ? {
            riskLevel: session.riskSummary.riskLevel,
            signals: [...session.riskSummary.signals],
          }
        : null,
    }));
  }

  listFallbackFamilies() {
    return Array.from(this.fallbackFamilies.values(), (family) => ({ ...family }));
  }

  listFallbackRefreshTokens() {
    return Array.from(this.fallbackRefreshTokens.values(), (token) => ({
      ...token,
    }));
  }

  reportPersistenceFailure(error: unknown, context: string) {
    const detail = error instanceof Error ? error.message : String(error);
    this.logger.warn(
      `Driver device session persistence skipped during ${context}: ${detail}`,
    );
  }

  private async rotateDriverRefreshTokenFallback(
    input: DriverRefreshRotationInput & {
      refreshTokenHash: string;
      nextRefreshTokenId: string;
      nextRefreshTokenHash: string;
    },
  ): Promise<RotateDriverRefreshResult> {
    const matchedToken =
      Array.from(this.fallbackRefreshTokens.values()).find(
        (candidate) => candidate.tokenHash === input.refreshTokenHash,
      ) ?? null;
    if (!matchedToken) {
      return { outcome: "invalid" };
    }

    const session = this.fallbackSessions.get(matchedToken.sessionId) ?? null;
    const family = this.fallbackFamilies.get(matchedToken.familyId) ?? null;
    if (!session || !family) {
      return { outcome: "invalid" };
    }

    const nextIdleExpiresAt = this.resolveNextIdleExpiry(
      input.idleExpiresAt,
      family.absoluteExpiresAt,
    );

    if (
      matchedToken.deviceId !== input.deviceId ||
      matchedToken.consumedAt !== null ||
      matchedToken.revokedAt !== null ||
      !this.isSessionActive(session, input.deviceId, session.actorId, input.rotatedAt) ||
      family.status !== "active" ||
      matchedToken.expiresAt <= input.rotatedAt ||
      family.absoluteExpiresAt <= input.rotatedAt
    ) {
      this.revokeFamilyFallback(
        session,
        family,
        input.rotatedAt,
        matchedToken.consumedAt ? "refresh_token_reuse_detected" : "refresh_token_invalid",
      );
      return { outcome: "invalid" };
    }

    const consumedToken = this.buildRefreshTokenRecord({
      refreshTokenId: matchedToken.refreshTokenId,
      familyId: matchedToken.familyId,
      sessionId: matchedToken.sessionId,
      tokenHash: matchedToken.tokenHash,
      deviceId: matchedToken.deviceId,
      issuedAt: matchedToken.issuedAt,
      expiresAt: matchedToken.expiresAt,
      consumedAt: input.rotatedAt,
      revokedAt: null,
      createdAt: matchedToken.createdAt,
    });
    const nextRefreshToken = this.buildRefreshTokenRecord({
      refreshTokenId: input.nextRefreshTokenId,
      familyId: family.familyId,
      sessionId: session.sessionId,
      tokenHash: input.nextRefreshTokenHash,
      deviceId: session.deviceId,
      issuedAt: input.rotatedAt,
      expiresAt: nextIdleExpiresAt,
      consumedAt: null,
      revokedAt: null,
    });
    const nextSession = this.buildSessionRecord({
      sessionId: session.sessionId,
      familyId: session.familyId,
      driverId: session.driverId ?? session.actorId,
      deviceId: session.deviceId,
      deviceLabel: session.deviceLabel,
      riskSummary: input.riskSummary,
      issuedAt: session.startedAt,
      refreshedAt: input.rotatedAt,
      expiresAt: nextIdleExpiresAt,
      revokedAt: null,
      revokeReason: null,
      status: "active",
      createdAt: session.createdAt,
    });
    const nextFamily = this.buildFamilyRecord({
      familyId: family.familyId,
      sessionId: session.sessionId,
      currentTokenId: nextRefreshToken.refreshTokenId,
      previousTokenId: consumedToken.refreshTokenId,
      issuedAt: family.createdAt,
      lastRotatedAt: input.rotatedAt,
      absoluteExpiresAt: family.absoluteExpiresAt,
      revokedAt: null,
      revokeReason: null,
      status: "active",
      createdAt: family.createdAt,
    });

    this.upsertFallbackRefreshToken(consumedToken);
    this.upsertFallbackRefreshToken(nextRefreshToken);
    this.upsertFallbackSession(nextSession);
    this.upsertFallbackFamily(nextFamily);
    return {
      outcome: "rotated",
      session: nextSession,
      family: nextFamily,
      currentRefreshToken: nextRefreshToken,
    };
  }

  private revokeDriverSessionFallback(
    command:
      | { bindingId: string; deviceId?: string | null }
      | { bindingId?: string | null; deviceId: string },
    revokedAt: string,
    revokeReason: string,
  ) {
    const session =
      "bindingId" in command && command.bindingId
        ? this.fallbackSessions.get(command.bindingId) ?? null
        : Array.from(this.fallbackSessions.values()).find(
            (candidate) =>
              candidate.deviceId === command.deviceId &&
              candidate.status === "active",
          ) ?? null;
    if (!session) {
      return null;
    }

    const family = this.fallbackFamilies.get(session.familyId) ?? null;
    if (!family) {
      return null;
    }

    this.revokeFamilyFallback(session, family, revokedAt, revokeReason);
    return this.fallbackSessions.get(session.sessionId) ?? null;
  }

  private revokeFamilyFallback(
    session: CanonicalSessionRecord,
    family: CanonicalRefreshFamilyRecord,
    revokedAt: string,
    revokeReason: string,
  ) {
    const revokedSession = this.buildSessionRecord({
      sessionId: session.sessionId,
      familyId: session.familyId,
      driverId: session.driverId ?? session.actorId,
      deviceId: session.deviceId,
      deviceLabel: session.deviceLabel,
      riskSummary: session.riskSummary,
      issuedAt: session.startedAt,
      refreshedAt: revokedAt,
      expiresAt: session.expiresAt,
      revokedAt,
      revokeReason,
      status: "revoked",
      createdAt: session.createdAt,
    });
    const revokedFamily = this.buildFamilyRecord({
      familyId: family.familyId,
      sessionId: family.sessionId,
      currentTokenId: family.currentTokenId,
      previousTokenId: family.previousTokenId,
      issuedAt: family.createdAt,
      lastRotatedAt: revokedAt,
      absoluteExpiresAt: family.absoluteExpiresAt,
      revokedAt,
      revokeReason,
      status: "revoked",
      createdAt: family.createdAt,
    });

    this.upsertFallbackSession(revokedSession);
    this.upsertFallbackFamily(revokedFamily);
    for (const token of this.fallbackRefreshTokens.values()) {
      if (token.familyId !== family.familyId || token.revokedAt !== null) {
        continue;
      }
      this.upsertFallbackRefreshToken(
        this.buildRefreshTokenRecord({
          refreshTokenId: token.refreshTokenId,
          familyId: token.familyId,
          sessionId: token.sessionId,
          tokenHash: token.tokenHash,
          deviceId: token.deviceId,
          issuedAt: token.issuedAt,
          expiresAt: token.expiresAt,
          consumedAt: token.consumedAt,
          revokedAt,
          createdAt: token.createdAt,
        }),
      );
    }
  }

  private async revokeFamilyTransaction(
    client: PoolClient,
    session: CanonicalSessionRecord,
    family: CanonicalRefreshFamilyRecord,
    revokedAt: string,
    revokeReason: string,
  ) {
    const revokedSession = this.buildSessionRecord({
      sessionId: session.sessionId,
      familyId: session.familyId,
      driverId: session.driverId ?? session.actorId,
      deviceId: session.deviceId,
      deviceLabel: session.deviceLabel,
      riskSummary: session.riskSummary,
      issuedAt: session.startedAt,
      refreshedAt: revokedAt,
      expiresAt: session.expiresAt,
      revokedAt,
      revokeReason,
      status: "revoked",
      createdAt: session.createdAt,
    });
    const revokedFamily = this.buildFamilyRecord({
      familyId: family.familyId,
      sessionId: family.sessionId,
      currentTokenId: family.currentTokenId,
      previousTokenId: family.previousTokenId,
      issuedAt: family.createdAt,
      lastRotatedAt: revokedAt,
      absoluteExpiresAt: family.absoluteExpiresAt,
      revokedAt,
      revokeReason,
      status: "revoked",
      createdAt: family.createdAt,
    });

    await this.updateSession(client, revokedSession);
    await this.updateFamily(client, revokedFamily);
    await client.query(
      `
        UPDATE iam.refresh_tokens
        SET revoked_at = COALESCE(revoked_at, $2),
            updated_at = $2,
            record = jsonb_set(
              jsonb_set(record, '{revokedAt}', to_jsonb($2::text), true),
              '{updatedAt}',
              to_jsonb($2::text),
              true
            )
        WHERE family_id = $1
      `,
      [family.familyId, revokedAt],
    );
  }

  private async insertSession(client: PoolClient, record: CanonicalSessionRecord) {
    await client.query(
      `
        INSERT INTO iam.sessions (
          session_id,
          family_id,
          realm,
          actor_type,
          actor_id,
          tenant_id,
          partner_id,
          driver_id,
          device_id,
          device_label,
          session_status,
          revoke_reason,
          risk_summary,
          started_at,
          last_refreshed_at,
          expires_at,
          revoked_at,
          created_at,
          updated_at,
          record
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb,
          $14, $15, $16, $17, $18, $19, $20::jsonb
        )
      `,
      [
        record.sessionId,
        record.familyId,
        record.realm,
        record.actorType,
        record.actorId,
        record.tenantId,
        record.partnerId,
        record.driverId,
        record.deviceId,
        record.deviceLabel,
        record.status,
        record.revokeReason,
        JSON.stringify(record.riskSummary),
        record.startedAt,
        record.lastRefreshedAt,
        record.expiresAt,
        record.revokedAt,
        record.createdAt,
        record.updatedAt,
        JSON.stringify(record),
      ],
    );
  }

  private async updateSession(client: PoolClient, record: CanonicalSessionRecord) {
    await client.query(
      `
        UPDATE iam.sessions
        SET session_status = $2,
            revoke_reason = $3,
            risk_summary = $4::jsonb,
            last_refreshed_at = $5,
            expires_at = $6,
            revoked_at = $7,
            updated_at = $8,
            device_label = $9,
            record = $10::jsonb
        WHERE session_id = $1
      `,
      [
        record.sessionId,
        record.status,
        record.revokeReason,
        JSON.stringify(record.riskSummary),
        record.lastRefreshedAt,
        record.expiresAt,
        record.revokedAt,
        record.updatedAt,
        record.deviceLabel,
        JSON.stringify(record),
      ],
    );
  }

  private async insertFamily(
    client: PoolClient,
    record: CanonicalRefreshFamilyRecord,
  ) {
    await client.query(
      `
        INSERT INTO iam.refresh_families (
          family_id,
          session_id,
          family_type,
          family_status,
          current_token_id,
          previous_token_id,
          absolute_expires_at,
          last_rotated_at,
          revoked_at,
          revoke_reason,
          created_at,
          updated_at,
          record
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb
        )
      `,
      [
        record.familyId,
        record.sessionId,
        record.familyType,
        record.status,
        record.currentTokenId,
        record.previousTokenId,
        record.absoluteExpiresAt,
        record.lastRotatedAt,
        record.revokedAt,
        record.revokeReason,
        record.createdAt,
        record.updatedAt,
        JSON.stringify(record),
      ],
    );
  }

  private async updateFamily(
    client: PoolClient,
    record: CanonicalRefreshFamilyRecord,
  ) {
    await client.query(
      `
        UPDATE iam.refresh_families
        SET family_status = $2,
            current_token_id = $3,
            previous_token_id = $4,
            absolute_expires_at = $5,
            last_rotated_at = $6,
            revoked_at = $7,
            revoke_reason = $8,
            updated_at = $9,
            record = $10::jsonb
        WHERE family_id = $1
      `,
      [
        record.familyId,
        record.status,
        record.currentTokenId,
        record.previousTokenId,
        record.absoluteExpiresAt,
        record.lastRotatedAt,
        record.revokedAt,
        record.revokeReason,
        record.updatedAt,
        JSON.stringify(record),
      ],
    );
  }

  private async insertRefreshToken(
    client: PoolClient,
    record: CanonicalRefreshTokenRecord,
  ) {
    await client.query(
      `
        INSERT INTO iam.refresh_tokens (
          refresh_token_id,
          family_id,
          session_id,
          token_hash,
          device_id,
          issued_at,
          expires_at,
          consumed_at,
          revoked_at,
          created_at,
          updated_at,
          record
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb
        )
      `,
      [
        record.refreshTokenId,
        record.familyId,
        record.sessionId,
        record.tokenHash,
        record.deviceId,
        record.issuedAt,
        record.expiresAt,
        record.consumedAt,
        record.revokedAt,
        record.createdAt,
        record.updatedAt,
        JSON.stringify(record),
      ],
    );
  }

  private async findRefreshTokenByHash(
    client: PoolClient,
    tokenHash: string,
  ): Promise<CanonicalRefreshTokenRecord | null> {
    const result = await client.query<JsonRecordRow>(
      `
        SELECT record
        FROM iam.refresh_tokens
        WHERE token_hash = $1
        FOR UPDATE
        LIMIT 1
      `,
      [tokenHash],
    );

    return result.rows[0]
      ? this.parseRecord<CanonicalRefreshTokenRecord>(
          result.rows[0].record,
          "iam.refresh_tokens",
        )
      : null;
  }

  private async getSessionById(
    client: Pick<DatabaseService, "query"> | PoolClient,
    sessionId: string,
  ): Promise<CanonicalSessionRecord | null> {
    const result = await this.queryRecords(
      client,
      `
        SELECT record
        FROM iam.sessions
        WHERE session_id = $1
        LIMIT 1
      `,
      [sessionId],
    );
    return result.rows[0]
      ? this.parseRecord<CanonicalSessionRecord>(result.rows[0].record, "iam.sessions")
      : null;
  }

  private async getActiveSessionByDeviceId(
    client: Pick<DatabaseService, "query"> | PoolClient,
    deviceId: string,
  ): Promise<CanonicalSessionRecord | null> {
    const result = await this.queryRecords(
      client,
      `
        SELECT record
        FROM iam.sessions
        WHERE device_id = $1
          AND session_status = 'active'
        ORDER BY updated_at DESC
        LIMIT 1
      `,
      [deviceId],
    );
    return result.rows[0]
      ? this.parseRecord<CanonicalSessionRecord>(result.rows[0].record, "iam.sessions")
      : null;
  }

  private async getFamilyById(
    client: Pick<DatabaseService, "query"> | PoolClient,
    familyId: string,
  ): Promise<CanonicalRefreshFamilyRecord | null> {
    const result = await this.queryRecords(
      client,
      `
        SELECT record
        FROM iam.refresh_families
        WHERE family_id = $1
        LIMIT 1
      `,
      [familyId],
    );
    return result.rows[0]
      ? this.parseRecord<CanonicalRefreshFamilyRecord>(
          result.rows[0].record,
          "iam.refresh_families",
        )
      : null;
  }

  private isSessionActive(
    session: CanonicalSessionRecord | null | undefined,
    deviceId: string,
    driverId: string,
    now: string,
  ) {
    return Boolean(
      session &&
        session.status === "active" &&
        session.revokedAt === null &&
        session.deviceId === deviceId &&
        session.actorId === driverId &&
        session.expiresAt > now,
    );
  }

  private hashSecret(value: string) {
    return createHash("sha256").update(value).digest("hex");
  }

  private buildSessionRecord(input: {
    sessionId: string;
    familyId: string;
    driverId: string;
    deviceId: string | null;
    deviceLabel: string | null;
    riskSummary: CanonicalSessionRecord["riskSummary"];
    issuedAt: string;
    refreshedAt: string;
    expiresAt: string;
    revokedAt: string | null;
    revokeReason: string | null;
    status: CanonicalSessionRecord["status"];
    createdAt?: string;
  }): CanonicalSessionRecord {
    return {
      sessionId: input.sessionId,
      familyId: input.familyId,
      realm: "driver",
      actorType: "driver_user",
      actorId: input.driverId,
      tenantId: null,
      partnerId: null,
      driverId: input.driverId,
      deviceId: input.deviceId,
      deviceLabel: input.deviceLabel,
      status: input.status,
      revokeReason: input.revokeReason,
      riskSummary: input.riskSummary
        ? {
            riskLevel: input.riskSummary.riskLevel,
            signals: [...input.riskSummary.signals],
          }
        : null,
      startedAt: input.issuedAt,
      lastRefreshedAt: input.refreshedAt,
      expiresAt: input.expiresAt,
      revokedAt: input.revokedAt,
      createdAt: input.createdAt ?? input.issuedAt,
      updatedAt: input.refreshedAt,
    };
  }

  private buildFamilyRecord(input: {
    familyId: string;
    sessionId: string;
    currentTokenId: string | null;
    previousTokenId: string | null;
    issuedAt: string;
    lastRotatedAt: string;
    absoluteExpiresAt: string;
    revokedAt: string | null;
    revokeReason: string | null;
    status: CanonicalRefreshFamilyRecord["status"];
    createdAt?: string;
  }): CanonicalRefreshFamilyRecord {
    return {
      familyId: input.familyId,
      sessionId: input.sessionId,
      familyType: "driver_device",
      status: input.status,
      currentTokenId: input.currentTokenId,
      previousTokenId: input.previousTokenId,
      absoluteExpiresAt: input.absoluteExpiresAt,
      lastRotatedAt: input.lastRotatedAt,
      revokedAt: input.revokedAt,
      revokeReason: input.revokeReason,
      createdAt: input.createdAt ?? input.issuedAt,
      updatedAt: input.lastRotatedAt,
    };
  }

  private buildRefreshTokenRecord(input: {
    refreshTokenId: string;
    familyId: string;
    sessionId: string;
    tokenHash: string;
    deviceId: string | null;
    issuedAt: string;
    expiresAt: string;
    consumedAt: string | null;
    revokedAt: string | null;
    createdAt?: string;
  }): CanonicalRefreshTokenRecord {
    return {
      refreshTokenId: input.refreshTokenId,
      familyId: input.familyId,
      sessionId: input.sessionId,
      tokenHash: input.tokenHash,
      deviceId: input.deviceId,
      issuedAt: input.issuedAt,
      expiresAt: input.expiresAt,
      consumedAt: input.consumedAt,
      revokedAt: input.revokedAt,
      createdAt: input.createdAt ?? input.issuedAt,
      updatedAt: input.consumedAt ?? input.revokedAt ?? input.issuedAt,
    };
  }

  private upsertFallbackSession(record: CanonicalSessionRecord) {
    this.fallbackSessions.set(record.sessionId, record);
  }

  private upsertFallbackFamily(record: CanonicalRefreshFamilyRecord) {
    this.fallbackFamilies.set(record.familyId, record);
  }

  private upsertFallbackRefreshToken(record: CanonicalRefreshTokenRecord) {
    this.fallbackRefreshTokens.set(record.refreshTokenId, record);
  }

  private resolveNextIdleExpiry(
    candidateIdleExpiresAt: string,
    absoluteExpiresAt: string,
  ) {
    return candidateIdleExpiresAt <= absoluteExpiresAt
      ? candidateIdleExpiresAt
      : absoluteExpiresAt;
  }

  private queryRecords(
    client: Pick<DatabaseService, "query"> | PoolClient,
    text: string,
    values: readonly unknown[],
  ) {
    return (client as Pick<DatabaseService, "query">).query<JsonRecordRow>(
      text,
      values,
    );
  }

  private parseRecord<T>(record: unknown, tableName: string): T {
    if (!record || typeof record !== "object") {
      throw new Error(`Invalid driver device session record loaded from ${tableName}.`);
    }

    return record as T;
  }
}
