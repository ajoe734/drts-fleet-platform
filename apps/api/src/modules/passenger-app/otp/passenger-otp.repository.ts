import { Injectable } from "@nestjs/common";
import type { PoolClient, QueryResultRow } from "pg";
import { DatabaseService } from "../../../common/db/database.service";
import type { OtpRecord, OtpStore, OtpTransaction } from "./passenger-otp.port";

function iso(value: unknown): string {
  return new Date(value as string).toISOString();
}
function record(row: QueryResultRow): OtpRecord {
  return {
    otpId: row.otp_id,
    challengeHash: row.challenge_hash,
    targetHash: row.target_hash,
    provider: row.provider,
    purpose: row.purpose,
    codeHash: row.code_hash,
    ipHash: row.ip_hash,
    drtsPassengerId: row.drts_passenger_id,
    sessionFamily: row.session_family,
    createdAt: iso(row.created_at),
    expiresAt: iso(row.expires_at),
    resendAfter: iso(row.resend_after),
    attempts: row.attempts,
    consumedAt: row.consumed_at === null ? null : iso(row.consumed_at),
    invalidatedAt: row.invalidated_at === null ? null : iso(row.invalidated_at),
  };
}

export class PostgresOtpTransaction implements OtpTransaction {
  constructor(private readonly client: PoolClient) {}
  async now() {
    const result = await this.client.query("SELECT clock_timestamp() AS now");
    return new Date(result.rows[0]!.now);
  }
  async lockRequest(targetHash: string, ipHash: string) {
    // All replicas lock target then IP before counting/inserting. A fixed ordering avoids cycles.
    for (const key of [
      `passenger-otp-target:${targetHash}`,
      `passenger-otp-ip:${ipHash}`,
    ])
      await this.client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [key],
      );
  }
  async rateState(targetHash: string, ipHash: string, since: string) {
    const result = await this.client.query(
      `SELECT count(*) FILTER (WHERE target_hash=$1)::int AS target_count,
       count(*) FILTER (WHERE ip_hash=$2)::int AS ip_count,
       max(resend_after) FILTER (WHERE target_hash=$1) AS resend_after
       FROM passenger.otps WHERE created_at > $3 AND (target_hash=$1 OR ip_hash=$2)`,
      [targetHash, ipHash, since],
    );
    const row = result.rows[0]!;
    return {
      targetCount: row.target_count,
      ipCount: row.ip_count,
      resendAfter: row.resend_after === null ? null : iso(row.resend_after),
    };
  }
  async invalidateTarget(targetHash: string, now: string) {
    await this.client.query(
      "UPDATE passenger.otps SET invalidated_at=$2 WHERE target_hash=$1 AND consumed_at IS NULL AND invalidated_at IS NULL",
      [targetHash, now],
    );
  }
  async insert(r: OtpRecord) {
    await this.client.query(
      `INSERT INTO passenger.otps
       (otp_id, challenge_hash, target_hash, provider, purpose, code_hash, ip_hash,
        drts_passenger_id, session_family, created_at, expires_at, resend_after,
        attempts, consumed_at, invalidated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        r.otpId,
        r.challengeHash,
        r.targetHash,
        r.provider,
        r.purpose,
        r.codeHash,
        r.ipHash,
        r.drtsPassengerId,
        r.sessionFamily,
        r.createdAt,
        r.expiresAt,
        r.resendAfter,
        r.attempts,
        r.consumedAt,
        r.invalidatedAt,
      ],
    );
  }
  async lockChallenge(hash: string) {
    const result = await this.client.query(
      "SELECT * FROM passenger.otps WHERE challenge_hash=$1 FOR UPDATE",
      [hash],
    );
    return result.rows[0] ? record(result.rows[0]) : null;
  }
  async save(r: OtpRecord) {
    await this.client.query(
      "UPDATE passenger.otps SET attempts=$2, consumed_at=$3, invalidated_at=$4 WHERE otp_id=$1",
      [r.otpId, r.attempts, r.consumedAt, r.invalidatedAt],
    );
  }
}

@Injectable()
export class PassengerOtpRepository implements OtpStore {
  constructor(private readonly database: DatabaseService) {}
  async transaction<T>(work: (tx: OtpTransaction) => Promise<T>): Promise<T> {
    const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      const result = await work(new PostgresOtpTransaction(client));
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
