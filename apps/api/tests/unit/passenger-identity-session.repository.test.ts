import { createHash, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PassengerJwtService } from "../../src/common/auth/passenger-jwt.service";
import { PassengerAccountRepository } from "../../src/modules/passenger-app/account/passenger-account.repository";
import { PassengerAccountService } from "../../src/modules/passenger-app/account/passenger-account.service";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function fixture(
  options: {
    removedOnLock?: boolean;
    otherOwner?: boolean;
    failInsert?: boolean;
  } = {},
) {
  vi.stubEnv("JWT_SECRET", "unit-only-passenger-session-key");
  vi.stubEnv("JWT_KEY_RING_JSON", "");
  vi.stubEnv("JWT_PRIVATE_KEY", "");
  vi.stubEnv("JWT_PUBLIC_KEY", "");
  vi.stubEnv("JWT_ALGORITHM", "HS256");
  vi.stubEnv("JWT_ALGORITHMS", "HS256");
  const id = `drts_passenger_${randomUUID()}`;
  const calls: { sql: string; values: readonly unknown[] }[] = [];
  let accountLocked = false;
  const client = {
    query: vi.fn(async (sql: string, values: readonly unknown[] = []) => {
      calls.push({ sql, values });
      if (sql.includes("FROM passenger.accounts")) {
        accountLocked = true;
        return {
          rows: [
            {
              drts_passenger_id: id,
              status: "active",
              contact_phone_verified: false,
              contact_consent: false,
              created_at: new Date(),
              deleted_at: null,
            },
          ],
        };
      }
      if (sql.includes("FROM passenger.logins"))
        return {
          rows:
            options.removedOnLock && accountLocked
              ? []
              : [
                  {
                    identity_id: randomUUID(),
                    drts_passenger_id: options.otherOwner
                      ? "drts_passenger_other"
                      : id,
                    provider: values[0],
                    subject: values[1],
                  },
                ],
        };
      if (
        options.failInsert &&
        sql.startsWith("INSERT INTO passenger.sessions")
      )
        throw new Error("unit session insert failure");
      return { rows: [] };
    }),
    release: vi.fn(),
  };
  const repo = new PassengerAccountRepository({
    connect: async () => client,
  } as never);
  const jwt = new PassengerJwtService();
  const sign = vi.spyOn(jwt, "sign");
  return {
    id,
    calls,
    client,
    jwt,
    sign,
    service: new PassengerAccountService(repo, jwt),
  };
}

// PoolClient is the only stub. Formal service/repository/JWT run unchanged;
// account-lock completion models an unlink that committed while issuance waited.
// This verifies transaction/control flow and SQL binding, not live PG concurrency.
describe("Verified identity session issuance through production repository (PG stub)", () => {
  it.each(["facebook", "google", "line"] as const)(
    "issues %s credentials under identity and account locks in one transaction",
    async (provider) => {
      const f = fixture();
      const session = await f.service.issueSession(f.id, "unit-device", {
        provider,
        subject: "verified-subject",
      });
      expect(
        f.calls
          .map((c) => c.sql === "BEGIN" || c.sql === "COMMIT")
          .filter(Boolean),
      ).toHaveLength(2);
      expect(f.calls[0]!.sql).toBe("BEGIN");
      expect(f.calls[1]!.sql).toContain("pg_advisory_xact_lock");
      expect(f.calls[1]!.values).toEqual([
        JSON.stringify(["passenger-identity", provider, "verified-subject"]),
      ]);
      expect(f.calls[2]!.sql).toContain("FOR UPDATE");
      expect(f.calls[2]!.values).toEqual([f.id]);
      expect(f.calls[3]!.sql).toContain("FROM passenger.logins");
      expect(f.calls[3]!.values).toEqual([provider, "verified-subject"]);
      expect(f.calls[4]!.sql).toContain("INSERT INTO passenger.sessions");
      expect(f.calls[4]!.values[1]).toBe(f.id);
      expect(f.calls[4]!.values[3]).toBe(
        createHash("sha256").update(session.refreshToken).digest("hex"),
      );
      expect(f.calls[4]!.values[4]).toBe("unit-device");
      expect(f.calls.at(-1)!.sql).toBe("COMMIT");
      expect(f.jwt.verify(session.accessToken)).toMatchObject({
        drtsPassengerId: f.id,
        sessionId: f.calls[4]!.values[2],
      });
      expect(f.client.release).toHaveBeenCalledOnce();
    },
  );
  it.each([{ removedOnLock: true }, { otherOwner: true }])(
    "rejects identity loss or changed ownership after acquiring the account lock (%j)",
    async (options) => {
      const f = fixture(options);
      await expect(
        f.service.issueSession(f.id, "", {
          provider: "facebook",
          subject: "998877",
        }),
      ).rejects.toMatchObject({ code: "unauthorized" });
      expect(f.sign).not.toHaveBeenCalled();
      expect(f.calls.some((c) => c.sql.startsWith("INSERT"))).toBe(false);
      expect(f.calls.at(-1)!.sql).toBe("ROLLBACK");
      expect(f.client.release).toHaveBeenCalledOnce();
    },
  );
  it("rolls back insertion failure without returning credentials", async () => {
    const f = fixture({ failInsert: true });
    await expect(
      f.service.issueSession(f.id, "", {
        provider: "facebook",
        subject: "998877",
      }),
    ).rejects.toThrow("unit session insert failure");
    expect(f.calls.at(-1)!.sql).toBe("ROLLBACK");
    expect(f.calls.some((c) => c.sql === "COMMIT")).toBe(false);
    expect(f.client.release).toHaveBeenCalledOnce();
  });
  it("retains the two-argument OTP issuance contract", async () => {
    const f = fixture();
    const session = await f.service.issueSession(f.id, "otp-device");
    expect(f.jwt.verify(session.accessToken)).toMatchObject({
      drtsPassengerId: f.id,
    });
    expect(
      f.calls.some(
        (c) =>
          c.sql.includes("pg_advisory_xact_lock") ||
          c.sql.includes("FROM passenger.logins"),
      ),
    ).toBe(false);
    expect(f.calls.at(-1)!.sql).toBe("COMMIT");
  });
});
