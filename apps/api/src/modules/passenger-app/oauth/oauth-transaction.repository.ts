import { Injectable } from "@nestjs/common";
import type { QueryResultRow } from "pg";
import { DatabaseService } from "../../../common/db/database.service";
import type {
  OAuthTransactionRecord,
  OAuthTransactionStore,
} from "./oauth-transaction.port";

function iso(value: unknown): string {
  return new Date(value as string).toISOString();
}
function row(r: QueryResultRow): OAuthTransactionRecord {
  return {
    transactionId: r.transaction_id,
    provider: r.provider,
    purpose: r.purpose,
    stateHash: r.state_hash,
    nonce: r.nonce,
    codeVerifier: r.code_verifier,
    codeChallenge: r.code_challenge,
    redirectUri: r.redirect_uri,
    drtsPassengerId: r.drts_passenger_id,
    createdAt: iso(r.created_at),
    expiresAt: iso(r.expires_at),
    consumedAt: r.consumed_at === null ? null : iso(r.consumed_at),
  };
}

@Injectable()
export class PassengerOAuthTransactionRepository implements OAuthTransactionStore {
  constructor(private readonly database: DatabaseService) {}

  async insert(record: OAuthTransactionRecord): Promise<void> {
    await this.database.query(
      `INSERT INTO passenger.oauth_transactions
      (transaction_id, provider, purpose, state_hash, nonce, code_verifier,
       code_challenge, redirect_uri, drts_passenger_id, created_at, expires_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        record.transactionId,
        record.provider,
        record.purpose,
        record.stateHash,
        record.nonce,
        record.codeVerifier,
        record.codeChallenge,
        record.redirectUri,
        record.drtsPassengerId,
        record.createdAt,
        record.expiresAt,
      ],
    );
  }

  async claim(
    transactionId: string,
    now: string,
  ): Promise<OAuthTransactionRecord | null> {
    const r = await this.database.query(
      `UPDATE passenger.oauth_transactions SET consumed_at = $2
       WHERE transaction_id = $1 AND consumed_at IS NULL AND expires_at > $2
       RETURNING *`,
      [transactionId, now],
    );
    return r.rows[0] ? row(r.rows[0]) : null;
  }
}
