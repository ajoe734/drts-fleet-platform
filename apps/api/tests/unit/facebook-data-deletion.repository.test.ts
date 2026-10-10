import { createHmac, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PassengerAccountRepository } from "../../src/modules/passenger-app/account/passenger-account.repository";
import { FacebookDataDeletionService } from "../../src/modules/passenger-app/oauth/facebook-data-deletion.service";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function fixture(
  options: {
    otherIdentity?: boolean;
    stale?: boolean;
    failWrite?: boolean;
  } = {},
) {
  vi.stubEnv("FACEBOOK_APP_ID", "123456");
  vi.stubEnv("FACEBOOK_APP_SECRET", "unit-secret");
  vi.stubEnv(
    "FACEBOOK_DATA_DELETION_STATUS_ORIGIN",
    "https://api.example.test",
  );
  const id = `drts_passenger_${randomUUID()}`;
  const login = {
    identity_id: randomUUID(),
    drts_passenger_id: id,
    provider: "facebook",
    subject: "998877",
  };
  const calls: { sql: string; values: readonly unknown[] }[] = [];
  let subjectReads = 0;
  const client = {
    query: vi.fn(async (sql: string, values: readonly unknown[] = []) => {
      calls.push({ sql, values });
      if (sql.includes("FROM passenger.accounts"))
        return {
          rows: [
            {
              drts_passenger_id: id,
              display_name: "Passenger",
              contact_phone: null,
              contact_phone_verified: false,
              verified_phone: null,
              verified_email: null,
              terms_version: null,
              privacy_version: null,
              fee_acknowledgement_version: null,
              contact_consent: false,
              status: "active",
              created_at: new Date(),
              deleted_at: null,
            },
          ],
        };
      if (
        sql.includes("FROM passenger.logins") &&
        sql.includes("provider = $1")
      ) {
        subjectReads++;
        return { rows: options.stale && subjectReads > 1 ? [] : [login] };
      }
      if (sql.includes("FROM passenger.logins"))
        return {
          rows: [
            login,
            ...(options.otherIdentity
              ? [
                  {
                    ...login,
                    identity_id: randomUUID(),
                    provider: "email",
                    subject: "owner@example.test",
                  },
                ]
              : []),
          ],
        };
      if (options.failWrite && sql.startsWith("UPDATE passenger.accounts"))
        throw new Error("unit write failure");
      return { rows: [] };
    }),
    release: vi.fn(),
  };
  const repo = new PassengerAccountRepository({
    connect: async () => client,
  } as never);
  const deletion = new FacebookDataDeletionService(repo);
  const encoded = Buffer.from(
    JSON.stringify({ algorithm: "HMAC-SHA256", user_id: login.subject }),
  ).toString("base64url");
  const command = {
    signed_request: `${createHmac("sha256", "unit-secret").update(encoded).digest("base64url")}.${encoded}`,
  };
  return { id, login, calls, client, deletion, command };
}

/** Execute the production account repository and deletion service against a
 * stub PoolClient; verifies bound SQL/control flow, not live PG semantics. */
describe("Facebook deletion production repository boundary (PG stub only)", () => {
  it("locks identity then account, re-reads ownership, revokes and anonymizes before COMMIT", async () => {
    const f = fixture();
    await f.deletion.delete(f.command);
    expect(f.calls[0]!.sql).toBe("BEGIN");
    expect(f.calls[1]!.sql).toContain("pg_advisory_xact_lock");
    expect(f.calls[1]!.values).toEqual([
      JSON.stringify(["passenger-identity", "facebook", "998877"]),
    ]);
    expect(f.calls[3]!.sql).toContain("FOR UPDATE");
    expect(f.calls[4]!.values).toEqual(["facebook", "998877"]);
    const revoke = f.calls.find((c) =>
      c.sql.startsWith("UPDATE passenger.sessions SET revoked_at"),
    )!;
    expect(revoke.values).toEqual([
      f.id,
      expect.any(String),
      "facebook_data_deleted",
    ]);
    expect(f.calls.some((c) => c.sql.includes("status='deleted'"))).toBe(true);
    expect(f.calls.some((c) => c.sql.includes("device_ua=NULL"))).toBe(true);
    expect(f.calls.at(-1)!.sql).toBe("COMMIT");
    expect(f.client.release).toHaveBeenCalledOnce();
    expect(f.calls.some((c) => /\b(billing|mobility)\./.test(c.sql))).toBe(
      false,
    );
  });
  it("removes only the specified login when another method remains", async () => {
    const f = fixture({ otherIdentity: true });
    await f.deletion.delete(f.command);
    const remove = f.calls.find((c) =>
      c.sql.startsWith("DELETE FROM passenger.logins"),
    )!;
    expect(remove.values).toEqual([f.id, f.login.identity_id]);
    expect(remove.sql).toContain("identity_id=$2");
    expect(
      f.calls.some((c) => c.sql.startsWith("UPDATE passenger.accounts")),
    ).toBe(false);
    expect(f.calls.at(-1)!.sql).toBe("COMMIT");
  });
  it("does not mutate a stale identity removed while waiting for the account lock", async () => {
    const f = fixture({ stale: true });
    await f.deletion.delete(f.command);
    expect(f.calls.some((c) => /^(UPDATE|DELETE)/.test(c.sql))).toBe(false);
    expect(f.calls.at(-1)!.sql).toBe("COMMIT");
  });
  it("rolls back storage errors rather than returning a completion receipt", async () => {
    const f = fixture({ failWrite: true });
    await expect(f.deletion.delete(f.command)).rejects.toThrow(
      "unit write failure",
    );
    expect(f.calls.at(-1)!.sql).toBe("ROLLBACK");
    expect(f.calls.some((c) => c.sql === "COMMIT")).toBe(false);
    expect(f.client.release).toHaveBeenCalledOnce();
  });
});
