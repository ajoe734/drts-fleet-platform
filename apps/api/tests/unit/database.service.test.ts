import type { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";
import { describe, expect, it } from "vitest";

import {
  DatabaseService,
  resolveDatabasePoolMax,
} from "../../src/common/db/database.service";

function makeQueryResult<T extends QueryResultRow = QueryResultRow>(
  rows: T[] = [],
  command = "SELECT",
): QueryResult<T> {
  return {
    command,
    rowCount: rows.length,
    oid: 0,
    rows,
    fields: [],
  };
}

describe("resolveDatabasePoolMax", () => {
  it("preserves the pg default when no override is configured", () => {
    expect(resolveDatabasePoolMax(undefined)).toBeUndefined();
    expect(resolveDatabasePoolMax("  ")).toBeUndefined();
  });

  it("accepts a positive integer override", () => {
    expect(resolveDatabasePoolMax("2")).toBe(2);
  });

  it.each(["0", "-1", "1.5", "invalid"])(
    "rejects invalid pool maximum %s",
    (value) => {
      expect(() => resolveDatabasePoolMax(value)).toThrow(
        "DATABASE_POOL_MAX must be a positive integer",
      );
    },
  );
});

describe("DatabaseService ambient transaction authority", () => {
  it("delegates query() and connect() to the pool outside transactions", async () => {
    const poolQueries: Array<{ text: string; values?: unknown[] }> = [];
    const clientQueries: string[] = [];
    let clientReleased = false;

    const fakePool: Pick<Pool, "query" | "connect" | "end"> = {
      query: async (text: string, values?: unknown[]) => {
        poolQueries.push({ text, values });
        return makeQueryResult([{ ok: 1 }]);
      },
      connect: async () =>
        ({
          query: async (text: string) => {
            clientQueries.push(text);
            return makeQueryResult();
          },
          release: () => {
            clientReleased = true;
          },
        }) as unknown as PoolClient,
      end: async () => undefined,
    };

    const db = new DatabaseService(fakePool as Pool);
    expect(db.isEnabled()).toBe(true);
    expect(db.getActiveTransactionClient()).toBeUndefined();

    const queryResult = await db.query<{ ok: number }>(
      "SELECT $1::int AS ok",
      [1],
    );
    expect(queryResult.rows[0]?.ok).toBe(1);
    expect(poolQueries).toEqual([
      { text: "SELECT $1::int AS ok", values: [1] },
    ]);

    const client = await db.connect();
    await client.query("SELECT 1");
    client.release();

    expect(clientQueries).toEqual(["SELECT 1"]);
    expect(clientReleased).toBe(true);
  });

  it("reuses a single PoolClient across ambient query() and nested connect() with serialized execution under a 1-client cap", async () => {
    let activeCheckouts = 0;
    let totalCheckouts = 0;
    let releaseCount = 0;
    let inFlightClientQueries = 0;
    let maxConcurrentClientQueries = 0;
    const statements: string[] = [];

    const fakePool: Pick<Pool, "query" | "connect" | "end"> = {
      query: async () => {
        throw new Error(
          "pool.query should not be called while ambient transaction is active",
        );
      },
      connect: async () => {
        if (activeCheckouts >= 1) {
          throw new Error("Pool capacity=1 exceeded by second checkout");
        }
        activeCheckouts += 1;
        totalCheckouts += 1;
        return {
          query: async (text: string) => {
            inFlightClientQueries += 1;
            maxConcurrentClientQueries = Math.max(
              maxConcurrentClientQueries,
              inFlightClientQueries,
            );
            await new Promise((resolve) => setTimeout(resolve, 2));
            statements.push(text.trim());
            inFlightClientQueries -= 1;
            return makeQueryResult();
          },
          release: () => {
            activeCheckouts -= 1;
            releaseCount += 1;
          },
        } as unknown as PoolClient;
      },
      end: async () => undefined,
    };

    const db = new DatabaseService(fakePool as Pool);

    await db.withTransaction(async (txClient) => {
      expect(db.getActiveTransactionClient()).toBe(txClient);
      await txClient.query("SELECT pg_advisory_xact_lock(1)");

      await Promise.all([
        db.query("SELECT * FROM reg.phase1_registry_drivers FOR UPDATE"),
        db.query("SELECT * FROM ops.driver_profiles WHERE driver_id = $1", [
          "drv-1",
        ]),
        (async () => {
          const nested = await db.connect();
          try {
            await nested.query("BEGIN");
            await nested.query(
              "UPDATE iam.identity_sessions SET status = 'revoked'",
            );
            await nested.query("COMMIT");
          } finally {
            nested.release();
          }
        })(),
      ]);

      expect(activeCheckouts).toBe(1);
      expect(releaseCount).toBe(0);
    });

    expect(totalCheckouts).toBe(1);
    expect(activeCheckouts).toBe(0);
    expect(releaseCount).toBe(1);
    expect(maxConcurrentClientQueries).toBe(1);
    expect(statements).toEqual([
      "BEGIN",
      "SELECT pg_advisory_xact_lock(1)",
      "SELECT * FROM reg.phase1_registry_drivers FOR UPDATE",
      "SELECT * FROM ops.driver_profiles WHERE driver_id = $1",
      "SAVEPOINT sp_1",
      "UPDATE iam.identity_sessions SET status = 'revoked'",
      "RELEASE SAVEPOINT sp_1",
      "COMMIT",
    ]);
  });

  it("translates nested connect() ROLLBACK and nested withTransaction() savepoints without aborting the outer transaction", async () => {
    const statements: string[] = [];

    const fakePool: Pick<Pool, "query" | "connect" | "end"> = {
      query: async () => makeQueryResult(),
      connect: async () =>
        ({
          query: async (text: string) => {
            statements.push(text.trim());
            return makeQueryResult();
          },
          release: () => undefined,
        }) as unknown as PoolClient,
      end: async () => undefined,
    };

    const db = new DatabaseService(fakePool as Pool);

    await db.withTransaction(async () => {
      // 1. Nested connect() that rolls back (e.g. IdentityRepository.revokeSession when 0 rows matched)
      const nestedClient = await db.connect();
      try {
        await nestedClient.query("BEGIN");
        await nestedClient.query(
          "UPDATE iam.identity_sessions SET status = 'revoked' WHERE session_id = 'missing'",
        );
        await nestedClient.query("ROLLBACK");
      } finally {
        nestedClient.release();
      }

      // 2. Nested withTransaction() that throws and is caught by outer caller
      await expect(
        db.withTransaction(async () => {
          await db.query("INSERT INTO iam.driver_device_bindings VALUES (1)");
          throw new Error("nested failure");
        }),
      ).rejects.toThrow("nested failure");

      // 3. Nested withTransaction() that succeeds
      await db.withTransaction(async () => {
        await db.query("INSERT INTO iam.driver_device_bindings VALUES (2)");
      });
    });

    expect(statements).toEqual([
      "BEGIN",
      "SAVEPOINT sp_1",
      "UPDATE iam.identity_sessions SET status = 'revoked' WHERE session_id = 'missing'",
      "ROLLBACK TO SAVEPOINT sp_1",
      "RELEASE SAVEPOINT sp_1",
      "SAVEPOINT sp_2",
      "INSERT INTO iam.driver_device_bindings VALUES (1)",
      "ROLLBACK TO SAVEPOINT sp_2",
      "RELEASE SAVEPOINT sp_2",
      "SAVEPOINT sp_3",
      "INSERT INTO iam.driver_device_bindings VALUES (2)",
      "RELEASE SAVEPOINT sp_3",
      "COMMIT",
    ]);
  });

  it("rolls back outer transaction (including prior nested savepoint commits) on exception and routes late post-close queries to pool", async () => {
    const clientStatements: string[] = [];
    const poolStatements: string[] = [];
    let released = false;
    let triggerLateQuery!: () => Promise<void>;

    const fakePool: Pick<Pool, "query" | "connect" | "end"> = {
      query: async (text: string) => {
        poolStatements.push(text.trim());
        return makeQueryResult();
      },
      connect: async () =>
        ({
          query: async (text: string) => {
            clientStatements.push(text.trim());
            return makeQueryResult();
          },
          release: () => {
            released = true;
          },
        }) as unknown as PoolClient,
      end: async () => undefined,
    };

    const db = new DatabaseService(fakePool as Pool);

    await expect(
      db.withTransaction(async () => {
        const nested = await db.connect();
        try {
          await nested.query("BEGIN");
          await nested.query(
            "UPDATE iam.identity_sessions SET status = 'revoked' WHERE session_id = 'old-session'",
          );
          await nested.query("COMMIT");
        } finally {
          nested.release();
        }

        triggerLateQuery = async () => {
          await db.query("INSERT INTO ops.driver_profiles VALUES ('late')");
        };

        throw new Error("issueSession failed after revokeSession");
      }),
    ).rejects.toThrow("issueSession failed after revokeSession");

    expect(released).toBe(true);
    expect(clientStatements).toEqual([
      "BEGIN",
      "SAVEPOINT sp_1",
      "UPDATE iam.identity_sessions SET status = 'revoked' WHERE session_id = 'old-session'",
      "RELEASE SAVEPOINT sp_1",
      "ROLLBACK",
    ]);

    // Late query captured inside AsyncLocalStorage scope but executed after transaction closed uses pool.query
    await triggerLateQuery();
    expect(poolStatements).toEqual([
      "INSERT INTO ops.driver_profiles VALUES ('late')",
    ]);
  });

  it("isolates concurrent ambient transactions onto their own PoolClients without cross-talk", async () => {
    const clientLogs = new Map<number, string[]>();
    const poolLogs: string[] = [];
    let nextClientId = 0;

    const fakePool: Pick<Pool, "query" | "connect" | "end"> = {
      query: async (text: string) => {
        poolLogs.push(text.trim());
        return makeQueryResult();
      },
      connect: async () => {
        const clientId = ++nextClientId;
        const log: string[] = [];
        clientLogs.set(clientId, log);
        return {
          query: async (text: string) => {
            log.push(text.trim());
            return makeQueryResult();
          },
          release: () => {
            log.push("RELEASED");
          },
        } as unknown as PoolClient;
      },
      end: async () => undefined,
    };

    const db = new DatabaseService(fakePool as Pool);

    await Promise.all([
      db.withTransaction(async () => {
        await db.query("SELECT 'tx-1-step-1'");
        await new Promise((resolve) => setTimeout(resolve, 5));
        await db.query("SELECT 'tx-1-step-2'");
      }),
      db.withTransaction(async () => {
        await db.query("SELECT 'tx-2-step-1'");
        await new Promise((resolve) => setTimeout(resolve, 5));
        await db.query("SELECT 'tx-2-step-2'");
      }),
      db.query("SELECT 'outside-pool'"),
    ]);

    expect(clientLogs.get(1)).toEqual([
      "BEGIN",
      "SELECT 'tx-1-step-1'",
      "SELECT 'tx-1-step-2'",
      "COMMIT",
      "RELEASED",
    ]);
    expect(clientLogs.get(2)).toEqual([
      "BEGIN",
      "SELECT 'tx-2-step-1'",
      "SELECT 'tx-2-step-2'",
      "COMMIT",
      "RELEASED",
    ]);
    expect(poolLogs).toEqual(["SELECT 'outside-pool'"]);
  });
});
