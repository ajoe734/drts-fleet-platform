import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { DatabaseService } from "../../../common/db/database.service";
import { JwtAuthService } from "../../../common/auth/jwt-auth.service";
import { randomUUID, randomBytes, createHash } from "crypto";

@Injectable()
export class PassengerAccountService {
  constructor(
    private readonly db: DatabaseService,
    private readonly jwt: JwtAuthService,
  ) {}

  private async transaction<T>(cb: (client: any) => Promise<T>): Promise<T> {
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      const result = await cb(client);
      await client.query("COMMIT");
      return result;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  async findOrCreateByIdentity(
    provider: string,
    subject: string,
    verifiedAttributes?: { phone?: string; email?: string },
  ) {
    return this.transaction(async (tx) => {
      // Find existing identity
      const existing = await tx.query(
        `SELECT drts_passenger_id FROM passenger.passenger_identities WHERE provider = $1 AND subject = $2`,
        [provider, subject],
      );

      let drtsPassengerId: string;
      if (existing.rowCount > 0) {
        drtsPassengerId = existing.rows[0].drts_passenger_id;
        const account = await tx.query(
          `SELECT is_deleted FROM passenger.passenger_accounts WHERE drts_passenger_id = $1`,
          [drtsPassengerId],
        );
        if (account.rowCount > 0 && account.rows[0].is_deleted) {
          throw new UnauthorizedException("account_deleted");
        }
      } else {
        // Create new account
        const accountRes = await tx.query(
          `INSERT INTO passenger.passenger_accounts (contact_phone, contact_phone_verified, contact_email, contact_email_verified) 
           VALUES ($1, $2, $3, $4) RETURNING drts_passenger_id`,
          [
            verifiedAttributes?.phone || null,
            !!verifiedAttributes?.phone,
            verifiedAttributes?.email || null,
            !!verifiedAttributes?.email,
          ],
        );
        drtsPassengerId = accountRes.rows[0].drts_passenger_id;

        await tx.query(
          `INSERT INTO passenger.passenger_identities (drts_passenger_id, provider, subject) 
           VALUES ($1, $2, $3)`,
          [drtsPassengerId, provider, subject],
        );
      }

      return drtsPassengerId;
    });
  }

  async linkIdentity(
    drtsPassengerId: string,
    provider: string,
    subject: string,
  ) {
    return this.transaction(async (tx) => {
      // Lock account to ensure it exists and is active, preventing links to deleted or non-existent accounts
      const account = await tx.query(
        `SELECT is_deleted FROM passenger.passenger_accounts WHERE drts_passenger_id = $1 FOR UPDATE`,
        [drtsPassengerId],
      );
      if (account.rowCount === 0 || account.rows[0].is_deleted) {
        throw new UnauthorizedException("invalid_account");
      }

      const existing = await tx.query(
        `SELECT drts_passenger_id FROM passenger.passenger_identities WHERE provider = $1 AND subject = $2`,
        [provider, subject],
      );

      if (existing.rowCount > 0) {
        if (existing.rows[0].drts_passenger_id === drtsPassengerId) {
          return; // Already linked
        }
        throw new ConflictException("identity_already_linked");
      }

      await tx.query(
        `INSERT INTO passenger.passenger_identities (drts_passenger_id, provider, subject) 
         VALUES ($1, $2, $3)`,
        [drtsPassengerId, provider, subject],
      );
    });
  }

  async unlinkIdentity(drtsPassengerId: string, identityId: string) {
    return this.transaction(async (tx) => {
      // Serialize operations on the account to prevent concurrent deletion of last identity
      const acc = await tx.query(
        `SELECT is_deleted FROM passenger.passenger_accounts WHERE drts_passenger_id = $1 FOR UPDATE`,
        [drtsPassengerId],
      );
      if (acc.rowCount === 0 || acc.rows[0].is_deleted)
        throw new UnauthorizedException("invalid_account");

      const countRes = await tx.query(
        `SELECT count(*) as count FROM passenger.passenger_identities WHERE drts_passenger_id = $1`,
        [drtsPassengerId],
      );
      if (parseInt(countRes.rows[0].count, 10) <= 1) {
        throw new BadRequestException("last_identity_error");
      }

      await tx.query(
        `DELETE FROM passenger.passenger_identities WHERE drts_passenger_id = $1 AND id = $2`,
        [drtsPassengerId, identityId],
      );
    });
  }

  async issueSession(drtsPassengerId: string, purpose: string) {
    const familyId = randomUUID();
    const plainHash = randomBytes(32).toString("hex");
    const hash = this.hashToken(plainHash);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days

    const { token: accessToken, sessionId } = await this.jwt.issueSessionToken(
      {
        authMode: "jwt_bearer",
        actorType: "first_party_passenger" as any,
        actorId: drtsPassengerId,
        tenantId: null,
        realm: "passenger" as any,
        drtsPassengerId,
        roleFamilies: ["passenger"] as any,
        roles: ["first_party_passenger"],
        scopes: ["owned:read", "owned:write"],
      },
      { expiresIn: "15m" },
    );

    await this.db.query(
      `INSERT INTO passenger.passenger_sessions (drts_passenger_id, iam_session_id, family_id, refresh_token_hash, purpose, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [drtsPassengerId, sessionId, familyId, hash, purpose, expiresAt],
    );

    return {
      accessToken,
      refreshToken: plainHash,
    };
  }

  async refreshSession(refreshToken: string) {
    const hash = this.hashToken(refreshToken);
    const client = await this.db.connect();
    let familyIdToRevoke: string | null = null;

    try {
      await client.query("BEGIN");
      const session = await client.query(
        `SELECT id, drts_passenger_id, family_id, is_revoked, expires_at, purpose, iam_session_id 
         FROM passenger.passenger_sessions WHERE refresh_token_hash = $1 FOR UPDATE`,
        [hash],
      );

      if (session.rowCount === 0) {
        await client.query("ROLLBACK");
        throw new UnauthorizedException("invalid_grant");
      }

      const sess = session.rows[0];

      if (sess.is_revoked || new Date(sess.expires_at) < new Date()) {
        familyIdToRevoke = sess.family_id;
        await client.query("ROLLBACK");
      } else {
        await client.query(
          `UPDATE passenger.passenger_sessions SET is_revoked = true WHERE id = $1`,
          [sess.id],
        );

        // Revoke the old IAM session for strict 1-to-1 refresh mapping (though it naturally expires in 15m)
        if (sess.iam_session_id) {
          await this.jwt
            .revokeCurrentSession(sess.iam_session_id)
            .catch(() => {});
        }

        const newPlainHash = randomBytes(32).toString("hex");
        const newHash = this.hashToken(newPlainHash);
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);

        const { token: accessToken, sessionId } =
          await this.jwt.issueSessionToken(
            {
              authMode: "jwt_bearer",
              actorType: "first_party_passenger" as any,
              actorId: sess.drts_passenger_id,
              tenantId: null,
              realm: "passenger" as any,
              drtsPassengerId: sess.drts_passenger_id,
              roleFamilies: ["passenger"] as any,
              roles: ["first_party_passenger"],
              scopes: ["owned:read", "owned:write"],
            },
            { expiresIn: "15m" },
          );

        await client.query(
          `INSERT INTO passenger.passenger_sessions (drts_passenger_id, iam_session_id, family_id, refresh_token_hash, purpose, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            sess.drts_passenger_id,
            sessionId,
            sess.family_id,
            newHash,
            sess.purpose,
            expiresAt,
          ],
        );

        await client.query("COMMIT");

        return {
          accessToken,
          refreshToken: newPlainHash,
        };
      }
    } catch (e) {
      if (familyIdToRevoke === null) {
        await client.query("ROLLBACK").catch(() => {});
      }
      throw e;
    } finally {
      client.release();
    }

    if (familyIdToRevoke) {
      const famSess = await this.db.query(
        `UPDATE passenger.passenger_sessions SET is_revoked = true WHERE family_id = $1 RETURNING iam_session_id`,
        [familyIdToRevoke],
      );
      for (const row of famSess.rows) {
        if (row.iam_session_id) {
          await this.jwt
            .revokeCurrentSession(row.iam_session_id)
            .catch(() => {});
        }
      }
      throw new UnauthorizedException("invalid_grant");
    }
  }

  async logout(refreshToken: string) {
    const hash = this.hashToken(refreshToken);
    const res = await this.db.query(
      `UPDATE passenger.passenger_sessions SET is_revoked = true WHERE refresh_token_hash = $1 RETURNING iam_session_id`,
      [hash],
    );
    if (res.rowCount === 0) {
      throw new UnauthorizedException("invalid_session");
    }
    const sess = res.rows[0]!;
    if (sess.iam_session_id) {
      await this.jwt.revokeCurrentSession(sess.iam_session_id).catch(() => {});
    }
  }

  async logoutAll(drtsPassengerId: string) {
    await this.db.query(
      `UPDATE passenger.passenger_sessions SET is_revoked = true WHERE drts_passenger_id = $1`,
      [drtsPassengerId],
    );
    await this.jwt.revokeAllSessionsForPrincipal(drtsPassengerId);
  }

  async deleteAccount(drtsPassengerId: string) {
    return this.transaction(async (tx) => {
      await tx.query(
        `UPDATE passenger.passenger_accounts 
         SET is_deleted = true, 
             deleted_at = now(),
             display_name = 'Deleted User',
             contact_phone = null,
             contact_email = null,
             e19a_ack_version = null,
             terms_ack_version = null,
             privacy_version = null,
             contact_consent = null
         WHERE drts_passenger_id = $1`,
        [drtsPassengerId],
      );

      await tx.query(
        `UPDATE passenger.passenger_sessions SET is_revoked = true WHERE drts_passenger_id = $1`,
        [drtsPassengerId],
      );

      await tx.query(
        `DELETE FROM passenger.passenger_identities WHERE drts_passenger_id = $1`,
        [drtsPassengerId],
      );

      await this.jwt.revokeAllSessionsForPrincipal(drtsPassengerId);
    });
  }

  async getAccount(drtsPassengerId: string) {
    const res = await this.db.query(
      `SELECT * FROM passenger.passenger_accounts WHERE drts_passenger_id = $1`,
      [drtsPassengerId],
    );
    const acc = res.rows[0];
    if (res.rowCount === 0 || !acc || acc.is_deleted) {
      throw new UnauthorizedException();
    }
    return {
      drtsPassengerId: acc.drts_passenger_id,
      displayName: acc.display_name,
      contactPhone: acc.contact_phone,
      contactPhoneVerified: acc.contact_phone_verified,
      contactEmail: acc.contact_email,
      contactEmailVerified: acc.contact_email_verified,
      termsVersion: acc.terms_ack_version,
      feeAcknowledgementVersion: acc.e19a_ack_version,
      privacyVersion: acc.privacy_version,
      contactConsent: acc.contact_consent,
      status: acc.is_deleted ? "deleted" : "active",
      createdAt: acc.created_at,
    };
  }

  async updateAccount(drtsPassengerId: string, updates: any) {
    return this.transaction(async (tx) => {
      const sets: string[] = [];
      const values: any[] = [];
      let i = 1;

      if (updates.displayName !== undefined) {
        sets.push(`display_name = $${i++}`);
        values.push(updates.displayName);
      }
      if (updates.contactPhone !== undefined) {
        sets.push(`contact_phone = $${i++}`);
        values.push(updates.contactPhone);
        sets.push(`contact_phone_verified = $${i++}`);
        values.push(false);
      }
      if (updates.contactEmail !== undefined) {
        sets.push(`contact_email = $${i++}`);
        values.push(updates.contactEmail);
        sets.push(`contact_email_verified = $${i++}`);
        values.push(false);
      }
      if (updates.termsVersion !== undefined) {
        sets.push(`terms_ack_version = $${i++}`);
        values.push(updates.termsVersion);
      }
      if (updates.feeAcknowledgementVersion !== undefined) {
        sets.push(`e19a_ack_version = $${i++}`);
        values.push(updates.feeAcknowledgementVersion);
      }
      if (updates.privacyVersion !== undefined) {
        sets.push(`privacy_version = $${i++}`);
        values.push(updates.privacyVersion);
      }
      if (updates.contactConsent !== undefined) {
        sets.push(`contact_consent = $${i++}`);
        values.push(updates.contactConsent);
      }

      if (sets.length === 0) return;

      sets.push(`updated_at = now()`);
      values.push(drtsPassengerId);

      const res = await tx.query(
        `UPDATE passenger.passenger_accounts SET ${sets.join(", ")} WHERE drts_passenger_id = $${i} AND is_deleted = false RETURNING *`,
        values,
      );
      if (res.rowCount === 0) {
        throw new UnauthorizedException();
      }

      const acc = res.rows[0];
      return {
        drtsPassengerId: acc.drts_passenger_id,
        displayName: acc.display_name,
        contactPhone: acc.contact_phone,
        contactPhoneVerified: acc.contact_phone_verified,
        contactEmail: acc.contact_email,
        contactEmailVerified: acc.contact_email_verified,
        termsVersion: acc.terms_ack_version,
        feeAcknowledgementVersion: acc.e19a_ack_version,
        privacyVersion: acc.privacy_version,
        contactConsent: acc.contact_consent,
        status: acc.is_deleted ? "deleted" : "active",
        createdAt: acc.created_at,
      };
    });
  }

  async getIdentities(drtsPassengerId: string) {
    const res = await this.db.query(
      `SELECT id as "identityId", provider, subject, drts_passenger_id as "drtsPassengerId" 
       FROM passenger.passenger_identities WHERE drts_passenger_id = $1`,
      [drtsPassengerId],
    );
    return res.rows;
  }
}
