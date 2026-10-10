import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PassengerOAuthTransactionRepository } from "../../src/modules/passenger-app/oauth/oauth-transaction.repository";
import type { OAuthTransactionRecord } from "../../src/modules/passenger-app/oauth/oauth-transaction.port";

afterEach(() => vi.restoreAllMocks());

/** Pool boundary stub. These tests execute production repository SQL but do
 * not emulate PG semantics (see passenger-account.repository.test.ts). */
function clientFixture(
  respond: (
    sql: string,
    values: readonly unknown[],
  ) => Record<string, unknown>[] = () => [],
) {
  const calls: { sql: string; values: readonly unknown[] }[] = [];
  const database = {
    query: vi.fn(async (sql: string, values: readonly unknown[] = []) => {
      calls.push({ sql, values });
      return { rows: respond(sql, values) };
    }),
  };
  return {
    calls,
    repository: new PassengerOAuthTransactionRepository(database as never),
  };
}

function record(id = randomUUID()): OAuthTransactionRecord {
  return {
    transactionId: id,
    provider: "google",
    purpose: "login",
    stateHash: "a".repeat(64),
    nonce: "nonce-value",
    codeVerifier: "verifier-value",
    codeChallenge: "challenge-value",
    redirectUri: "https://ride.smarttransport.tw/auth/callback/google",
    drtsPassengerId: null,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
    consumedAt: null,
  };
}

describe("passenger OAuth transaction repository (PG stub only)", () => {
  it("inserts every transaction column bound by position, never string-interpolated", async () => {
    const f = clientFixture();
    const r = record();
    await f.repository.insert(r);
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]!.sql).toContain("INSERT INTO passenger.oauth_transactions");
    expect(f.calls[0]!.values).toEqual([
      r.transactionId,
      r.provider,
      r.purpose,
      r.stateHash,
      r.nonce,
      r.codeVerifier,
      r.codeChallenge,
      r.redirectUri,
      r.drtsPassengerId,
      r.createdAt,
      r.expiresAt,
    ]);
  });

  it("claims by id with a single atomic UPDATE guarded by consumed_at and expiry", async () => {
    const row = {
      transaction_id: "tx-1",
      provider: "line",
      purpose: "link",
      state_hash: "b".repeat(64),
      nonce: "n",
      code_verifier: "v",
      code_challenge: "c",
      redirect_uri: "https://ride.smarttransport.tw/auth/callback/line",
      drts_passenger_id: "drts_passenger_1",
      created_at: new Date(),
      expires_at: new Date(Date.now() + 1000),
      consumed_at: new Date(),
    };
    const f = clientFixture(() => [row]);
    const now = new Date().toISOString();
    const claimed = await f.repository.claim("tx-1", now);
    expect(f.calls[0]!.sql).toContain("UPDATE passenger.oauth_transactions");
    expect(f.calls[0]!.sql).toContain("WHERE transaction_id = $1 AND consumed_at IS NULL AND expires_at > $2");
    expect(f.calls[0]!.values).toEqual(["tx-1", now]);
    expect(claimed).toMatchObject({
      transactionId: "tx-1",
      provider: "line",
      purpose: "link",
      drtsPassengerId: "drts_passenger_1",
    });
  });

  it("returns null when the UPDATE matches no row (unknown, already consumed, or expired)", async () => {
    const f = clientFixture(() => []);
    expect(await f.repository.claim("missing", new Date().toISOString())).toBeNull();
  });
});
