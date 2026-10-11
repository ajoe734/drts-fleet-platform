import { Injectable } from "@nestjs/common";
import type { PoolClient, QueryResultRow } from "pg";
import type { AuthProvider, PassengerLoginIdentity } from "@drts/contracts";
import { DatabaseService } from "../../../common/db/database.service";
import type {
  AccountRecord,
  PassengerAccountStore,
  PassengerAccountTransaction,
  SessionRecord,
} from "./passenger-account.port";

function iso(value: unknown): string {
  return new Date(value as string).toISOString();
}
function account(row: QueryResultRow): AccountRecord {
  return {
    drtsPassengerId: row.drts_passenger_id,
    ...(row.display_name === null ? {} : { displayName: row.display_name }),
    ...(row.contact_phone === null ? {} : { contactPhone: row.contact_phone }),
    contactPhoneVerified: row.contact_phone_verified,
    ...(row.verified_phone === null
      ? {}
      : { verifiedPhone: row.verified_phone }),
    ...(row.verified_email === null
      ? {}
      : { verifiedEmail: row.verified_email }),
    ...(row.terms_version === null ? {} : { termsVersion: row.terms_version }),
    ...(row.privacy_version === null
      ? {}
      : { privacyVersion: row.privacy_version }),
    ...(row.fee_acknowledgement_version === null
      ? {}
      : { feeAcknowledgementVersion: row.fee_acknowledgement_version }),
    contactConsent: row.contact_consent,
    status: row.status,
    createdAt: iso(row.created_at),
    ...(row.deleted_at === null ? {} : { deletedAt: iso(row.deleted_at) }),
  };
}
function login(row: QueryResultRow): PassengerLoginIdentity {
  return {
    identityId: row.identity_id,
    drtsPassengerId: row.drts_passenger_id,
    provider: row.provider,
    subject: row.subject,
  };
}
function session(row: QueryResultRow): SessionRecord {
  return {
    sessionId: row.session_id,
    drtsPassengerId: row.drts_passenger_id,
    refreshTokenFamily: row.refresh_token_family,
    refreshTokenHash: row.refresh_token_hash,
    deviceUa: row.device_ua,
    createdAt: iso(row.created_at),
    expiresAt: iso(row.expires_at),
    consumedAt: row.consumed_at === null ? null : iso(row.consumed_at),
    revokedAt: row.revoked_at === null ? null : iso(row.revoked_at),
  };
}

export class PostgresPassengerAccountTransaction implements PassengerAccountTransaction {
  constructor(private readonly client: PoolClient) {}
  async lockIdentity(provider: AuthProvider, subject: string) {
    await this.client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [JSON.stringify(["passenger-identity", provider, subject])],
    );
  }
  async findIdentity(provider: AuthProvider, subject: string) {
    const r = await this.client.query(
      "SELECT identity_id, drts_passenger_id, provider, subject FROM passenger.logins WHERE provider = $1 AND subject = $2",
      [provider, subject],
    );
    return r.rows[0] ? login(r.rows[0]) : null;
  }
  async lockAccount(id: string) {
    const r = await this.client.query(
      "SELECT * FROM passenger.accounts WHERE drts_passenger_id = $1 FOR UPDATE",
      [id],
    );
    return r.rows[0] ? account(r.rows[0]) : null;
  }
  async insertAccount(a: AccountRecord) {
    await this.client.query(
      `INSERT INTO passenger.accounts
      (drts_passenger_id, display_name, contact_phone, contact_phone_verified, verified_phone, verified_email,
       terms_version, privacy_version, fee_acknowledgement_version, contact_consent, status, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        a.drtsPassengerId,
        a.displayName ?? null,
        a.contactPhone ?? null,
        a.contactPhoneVerified,
        a.verifiedPhone ?? null,
        a.verifiedEmail ?? null,
        a.termsVersion ?? null,
        a.privacyVersion ?? null,
        a.feeAcknowledgementVersion ?? null,
        a.contactConsent,
        a.status,
        a.createdAt,
      ],
    );
  }
  async saveAccount(a: AccountRecord) {
    await this.client.query(
      `UPDATE passenger.accounts SET display_name=$2, contact_phone=$3,
      contact_phone_verified=$4, verified_phone=$5, verified_email=$6, terms_version=$7,
      privacy_version=$8, fee_acknowledgement_version=$9, contact_consent=$10, updated_at=now()
      WHERE drts_passenger_id=$1`,
      [
        a.drtsPassengerId,
        a.displayName ?? null,
        a.contactPhone ?? null,
        a.contactPhoneVerified,
        a.verifiedPhone ?? null,
        a.verifiedEmail ?? null,
        a.termsVersion ?? null,
        a.privacyVersion ?? null,
        a.feeAcknowledgementVersion ?? null,
        a.contactConsent,
      ],
    );
  }
  async listIdentities(id: string) {
    const r = await this.client.query(
      "SELECT identity_id, drts_passenger_id, provider, subject FROM passenger.logins WHERE drts_passenger_id=$1 ORDER BY created_at, identity_id",
      [id],
    );
    return r.rows.map(login);
  }
  async insertIdentity(i: PassengerLoginIdentity) {
    await this.client.query(
      "INSERT INTO passenger.logins (identity_id, drts_passenger_id, provider, subject) VALUES ($1,$2,$3,$4)",
      [i.identityId, i.drtsPassengerId, i.provider, i.subject],
    );
  }
  async removeIdentity(id: string, identityId: string) {
    await this.client.query(
      "DELETE FROM passenger.logins WHERE drts_passenger_id=$1 AND identity_id=$2",
      [id, identityId],
    );
  }
  async findSessionByHash(hash: string) {
    const r = await this.client.query(
      "SELECT * FROM passenger.sessions WHERE refresh_token_hash=$1",
      [hash],
    );
    return r.rows[0] ? session(r.rows[0]) : null;
  }
  async findLiveFamily(id: string, family: string, now: string) {
    const r = await this.client.query(
      `SELECT * FROM passenger.sessions WHERE drts_passenger_id=$1
      AND refresh_token_family=$2 AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at > $3`,
      [id, family, now],
    );
    return r.rows[0] ? session(r.rows[0]) : null;
  }
  async insertSession(s: SessionRecord) {
    await this.client.query(
      `INSERT INTO passenger.sessions
      (session_id, drts_passenger_id, refresh_token_family, refresh_token_hash, device_ua, created_at, expires_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        s.sessionId,
        s.drtsPassengerId,
        s.refreshTokenFamily,
        s.refreshTokenHash,
        s.deviceUa,
        s.createdAt,
        s.expiresAt,
      ],
    );
  }
  async consumeSession(sessionId: string, now: string) {
    await this.client.query(
      "UPDATE passenger.sessions SET consumed_at=$2 WHERE session_id=$1",
      [sessionId, now],
    );
  }
  async revokeFamily(id: string, family: string, now: string, reason: string) {
    await this.client.query(
      `UPDATE passenger.sessions SET revoked_at=$3, revocation_reason=$4
      WHERE drts_passenger_id=$1 AND refresh_token_family=$2 AND revoked_at IS NULL`,
      [id, family, now, reason],
    );
  }
  async revokeAll(id: string, now: string, reason: string) {
    await this.client.query(
      "UPDATE passenger.sessions SET revoked_at=$2, revocation_reason=$3 WHERE drts_passenger_id=$1 AND revoked_at IS NULL",
      [id, now, reason],
    );
  }
  async anonymize(id: string, now: string) {
    await this.client.query(
      `UPDATE passenger.accounts SET display_name=NULL, contact_phone=NULL,
      contact_phone_verified=false, verified_phone=NULL, verified_email=NULL, contact_consent=false,
      status='deleted', deleted_at=$2, updated_at=$2 WHERE drts_passenger_id=$1`,
      [id, now],
    );
    await this.client.query(
      "DELETE FROM passenger.logins WHERE drts_passenger_id=$1",
      [id],
    );
    await this.client.query(
      "UPDATE passenger.sessions SET device_ua=NULL WHERE drts_passenger_id=$1",
      [id],
    );
    // Never touch booking/payment tables: historical drts_passenger_id remains stable.
  }
}

@Injectable()
export class PassengerAccountRepository implements PassengerAccountStore {
  constructor(private readonly database: DatabaseService) {}
  async transaction<T>(
    work: (tx: PassengerAccountTransaction) => Promise<T>,
  ): Promise<T> {
    const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      const result = await work(
        new PostgresPassengerAccountTransaction(client),
      );
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
