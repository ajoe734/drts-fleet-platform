import { createHash, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PassengerAccountRepository } from "../../../apps/api/src/modules/passenger-app/account/passenger-account.repository";
import { PassengerAccountService } from "../../../apps/api/src/modules/passenger-app/account/passenger-account.service";
import { PassengerJwtService } from "../../../apps/api/src/common/auth/passenger-jwt.service";

afterEach(() => vi.restoreAllMocks());
/** Pool boundary stub. These tests execute production repository SQL but do not emulate PG semantics. */
function clientFixture(
  respond: (
    sql: string,
    values: readonly unknown[],
  ) => Record<string, unknown>[] = () => [],
) {
  const calls: { sql: string; values: readonly unknown[] }[] = [];
  const client = {
    query: vi.fn(async (sql: string, values: readonly unknown[] = []) => {
      calls.push({ sql, values });
      return { rows: respond(sql, values) };
    }),
    release: vi.fn(),
  };
  const database = { connect: vi.fn(async () => client) };
  return {
    client,
    calls,
    repository: new PassengerAccountRepository(database as never),
  };
}
function accountRow(id: string) {
  return {
    drts_passenger_id: id,
    display_name: "Passenger",
    contact_phone: null,
    contact_phone_verified: false,
    verified_phone: null,
    verified_email: "user@example.test",
    terms_version: "terms-v1",
    privacy_version: null,
    fee_acknowledgement_version: null,
    contact_consent: false,
    status: "active",
    created_at: new Date(),
    deleted_at: null,
  };
}
describe("production PostgreSQL repository transaction boundary (PG stub only)", () => {
  it("commits replay revocation before the service throws invalid_grant, binds hashes rather than tokens, and re-reads after the account lock", async () => {
    const id = `drts_passenger_${randomUUID()}`;
    const family = randomUUID();
    const refreshToken = "A".repeat(43);
    const row = {
      session_id: randomUUID(),
      drts_passenger_id: id,
      refresh_token_family: family,
      refresh_token_hash: createHash("sha256")
        .update(refreshToken)
        .digest("hex"),
      device_ua: "ua",
      created_at: new Date(),
      expires_at: new Date(Date.now() + 86400000),
      consumed_at: new Date(),
      revoked_at: null,
    };
    const f = clientFixture((sql) =>
      sql.includes("FROM passenger.accounts")
        ? [accountRow(id)]
        : sql.includes("FROM passenger.sessions")
          ? [row]
          : [],
    );
    const service = new PassengerAccountService(
      f.repository,
      new PassengerJwtService(),
    );
    await expect(service.refresh(refreshToken)).rejects.toMatchObject({
      code: "invalid_grant",
    });
    expect(f.calls[0]?.sql).toBe("BEGIN");
    expect(f.calls.at(-1)?.sql).toBe("COMMIT");
    expect(f.calls.map((c) => c.sql)).not.toContain("ROLLBACK");
    expect(f.calls[2]?.sql).toContain("FOR UPDATE");
    expect(f.calls[3]?.sql).toContain("refresh_token_hash");
    const revoke = f.calls.find((c) =>
      c.sql.startsWith("UPDATE passenger.sessions"),
    )!;
    expect(revoke.values).toEqual([
      id,
      family,
      expect.any(String),
      "refresh_reuse",
    ]);
    expect(JSON.stringify(f.calls)).not.toContain(refreshToken);
    expect(f.client.release).toHaveBeenCalledOnce();
  });
  it("rolls back a failed unit of work and releases the client", async () => {
    const f = clientFixture();
    await expect(
      f.repository.transaction(async (tx) => {
        await tx.lockAccount("id");
        throw new Error("write failure");
      }),
    ).rejects.toThrow("write failure");
    expect(f.calls.map((c) => c.sql)).toContain("ROLLBACK");
    expect(f.calls.map((c) => c.sql)).not.toContain("COMMIT");
    expect(f.client.release).toHaveBeenCalledOnce();
  });
  it("maps nullable account fields without exposing raw DB records", async () => {
    const row = accountRow("id");
    const f = clientFixture(() => [row]);
    const mapped = await f.repository.transaction((tx) => tx.lockAccount("id"));
    expect(mapped).toEqual({
      drtsPassengerId: "id",
      displayName: "Passenger",
      contactPhoneVerified: false,
      verifiedEmail: "user@example.test",
      termsVersion: "terms-v1",
      contactConsent: false,
      status: "active",
      createdAt: row.created_at.toISOString(),
    });
  });
  it("deletion writes only account/login/session tables and binds the authenticated account on every mutation", async () => {
    const f = clientFixture();
    const now = new Date().toISOString();
    await f.repository.transaction(async (tx) => {
      await tx.revokeAll("caller-id", now, "account_deleted");
      await tx.anonymize("caller-id", now);
    });
    const writes = f.calls.filter((c) => /^(UPDATE|DELETE)/.test(c.sql));
    expect(writes).toHaveLength(4);
    expect(
      writes.map((c) => c.sql.match(/^(?:UPDATE|DELETE FROM)\s+(\S+)/)?.[1]),
    ).toEqual([
      "passenger.sessions",
      "passenger.accounts",
      "passenger.logins",
      "passenger.sessions",
    ]);
    for (const call of writes) {
      expect(call.sql).toContain("WHERE drts_passenger_id=$1");
      expect(call.values[0]).toBe("caller-id");
    }
    const scrub = writes.find((c) =>
      c.sql.startsWith("UPDATE passenger.accounts"),
    )!;
    for (const column of [
      "display_name",
      "contact_phone",
      "verified_phone",
      "verified_email",
    ])
      expect(scrub.sql).toContain(`${column}=NULL`);
    expect(scrub.values).toEqual(["caller-id", now]);
  });
});
