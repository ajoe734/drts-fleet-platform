import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { PassengerOtpRepository } from "../../../apps/api/src/modules/passenger-app/otp/passenger-otp.repository";
import type { OtpRecord } from "../../../apps/api/src/modules/passenger-app/otp/passenger-otp.port";

/** Stub only at PoolClient. Executes production repository; hosted PAX-QA must check PG semantics. */
function fixture(
  respond: (
    sql: string,
    params: unknown[],
  ) => Record<string, unknown>[] = () => [],
) {
  const client = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => ({
      rows: respond(sql, params),
    })),
    release: vi.fn(),
  };
  const database = { connect: vi.fn(async () => client) };
  return { client, repository: new PassengerOtpRepository(database as never) };
}
function record(): OtpRecord {
  return {
    otpId: randomUUID(),
    challengeHash: "a".repeat(64),
    targetHash: "b".repeat(64),
    provider: "email",
    purpose: "link",
    codeHash: "c".repeat(64),
    ipHash: "d".repeat(64),
    drtsPassengerId: `drts_passenger_${randomUUID()}`,
    sessionFamily: randomUUID(),
    createdAt: "2026-10-10T01:00:00.000Z",
    expiresAt: "2026-10-10T01:05:00.000Z",
    resendAfter: "2026-10-10T01:01:00.000Z",
    attempts: 0,
    consumedAt: null,
    invalidatedAt: null,
  };
}
describe("OTP production repository SQL boundary", () => {
  it("locks target then IP, uses a fresh database clock, counts the rolling hour and persists all 15 formal schema columns", async () => {
    const r = record();
    const f = fixture((sql) =>
      sql.includes("clock_timestamp")
        ? [{ now: new Date(r.createdAt) }]
        : sql.includes("count(*)")
          ? [
              {
                target_count: 2,
                ip_count: 3,
                resend_after: new Date(r.resendAfter),
              },
            ]
          : [],
    );
    const rate = await f.repository.transaction(async (tx) => {
      await tx.lockRequest(r.targetHash, r.ipHash);
      expect((await tx.now()).toISOString()).toBe(r.createdAt);
      const state = await tx.rateState(
        r.targetHash,
        r.ipHash,
        "2026-10-10T00:00:00.000Z",
      );
      await tx.invalidateTarget(r.targetHash, r.createdAt);
      await tx.insert(r);
      return state;
    });
    expect(rate).toEqual({
      targetCount: 2,
      ipCount: 3,
      resendAfter: r.resendAfter,
    });
    const calls = f.client.query.mock.calls;
    expect(calls.slice(0, 4)).toEqual([
      ["BEGIN"],
      [
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`passenger-otp-target:${r.targetHash}`],
      ],
      [
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`passenger-otp-ip:${r.ipHash}`],
      ],
      ["SELECT clock_timestamp() AS now"],
    ]);
    const insert = calls.find(([sql]) =>
      sql.includes("INSERT INTO passenger.otps"),
    )!;
    expect(insert[1]).toEqual([
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
    ]);
    expect(calls.at(-1)).toEqual(["COMMIT"]);
    expect(f.client.release).toHaveBeenCalledOnce();
  });
  it("maps PostgreSQL timestamps/nulls, locks the challenge and writes failed attempts/consumption in the transaction", async () => {
    const r = record();
    const row = {
      otp_id: r.otpId,
      challenge_hash: r.challengeHash,
      target_hash: r.targetHash,
      provider: r.provider,
      purpose: r.purpose,
      code_hash: r.codeHash,
      ip_hash: r.ipHash,
      drts_passenger_id: r.drtsPassengerId,
      session_family: r.sessionFamily,
      created_at: new Date(r.createdAt),
      expires_at: new Date(r.expiresAt),
      resend_after: new Date(r.resendAfter),
      attempts: 0,
      consumed_at: null,
      invalidated_at: null,
    };
    const f = fixture((sql) => (sql.includes("FOR UPDATE") ? [row] : []));
    await f.repository.transaction(async (tx) => {
      const loaded = (await tx.lockChallenge(r.challengeHash))!;
      expect(loaded).toEqual(r);
      loaded.attempts = 5;
      loaded.invalidatedAt = r.createdAt;
      await tx.save(loaded);
    });
    expect(f.client.query).toHaveBeenCalledWith(
      "SELECT * FROM passenger.otps WHERE challenge_hash=$1 FOR UPDATE",
      [r.challengeHash],
    );
    expect(f.client.query).toHaveBeenCalledWith(
      "UPDATE passenger.otps SET attempts=$2, consumed_at=$3, invalidated_at=$4 WHERE otp_id=$1",
      [r.otpId, 5, null, r.createdAt],
    );
    expect(f.client.query).toHaveBeenLastCalledWith("COMMIT");
  });
  it("returns missing records, rolls back persistence failures and always releases the client", async () => {
    const f = fixture();
    expect(
      await f.repository.transaction((tx) => tx.lockChallenge("a".repeat(64))),
    ).toBeNull();
    await expect(
      f.repository.transaction(async (tx) => {
        await tx.insert(record());
        throw new Error("write failed");
      }),
    ).rejects.toThrow("write failed");
    expect(f.client.query).toHaveBeenLastCalledWith("ROLLBACK");
    expect(f.client.release).toHaveBeenCalledTimes(2);
  });
});
