import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
type QueryResultRow = Record<string, any>;

type PgClientInstance = {
  query: <T extends QueryResultRow = QueryResultRow>(
    sql: string,
    values?: unknown[],
  ) => Promise<{ rows: T[] }>;
  release: () => void;
};

type PgPoolInstance = {
  query: <T extends QueryResultRow = QueryResultRow>(
    sql: string,
    values?: unknown[],
  ) => Promise<{ rows: T[] }>;
  connect: () => Promise<PgClientInstance>;
  end: () => Promise<void>;
};

type PgPoolConstructor = new (options?: {
  connectionString?: string;
  connectionTimeoutMillis?: number;
}) => PgPoolInstance;

import {
  IDEMPOTENCY_IN_PROGRESS,
  IDEMPOTENCY_KEY_REQUIRED,
  IDEMPOTENCY_KEY_REUSED,
  IDEMPOTENCY_KEY_TOO_LONG,
} from "@drts/contracts";
import { IdempotencyService } from "../../../../apps/api/src/common/idempotency/idempotency.service";
import { IdempotencyRepository } from "../../../../apps/api/src/common/idempotency/idempotency.repository";
import type { DatabaseService } from "../../../../apps/api/src/common/db/database.service";
import { ApiRequestError } from "../../../../apps/api/src/common/api-envelope";

const require = createRequire(
  new URL("../../../../apps/api/package.json", import.meta.url),
);
const { Pool } = require("pg") as { Pool: PgPoolConstructor };

// Explicit isolated test database configuration is required (Acceptance 1 / UV-EXEC-024 pattern).
const connectionString =
  process.env.CONCURRENCY_TEST_DATABASE_URL ||
  process.env.UV_BOOKING_TEST_DATABASE_URL ||
  process.env.DATABASE_URL;

const migration = (name: string) =>
  readFileSync(
    new URL(`../../../../infra/migrations/${name}`, import.meta.url),
    "utf8",
  );

describe("SR-QA-CONCURRENCY-001: Multi-Instance Real PostgreSQL Idempotency Matrix", () => {
  const databaseName = `sr_qa_idemp_${randomUUID().replaceAll("-", "")}`;
  let admin: PgPoolInstance;
  let pool: PgPoolInstance;
  let poolA: PgPoolInstance;
  let poolB: PgPoolInstance;
  let serviceA: IdempotencyService;
  let serviceB: IdempotencyService;
  let created = false;

  beforeAll(async () => {
    if (!connectionString) {
      throw new Error(
        "SR-QA-CONCURRENCY-001 Acceptance Requirement: CONCURRENCY_TEST_DATABASE_URL, UV_BOOKING_TEST_DATABASE_URL, or DATABASE_URL must be explicitly configured with an isolated test database. Test suite fails explicitly when DB is unconfigured.",
      );
    }

    admin = new Pool({ connectionString });
    try {
      await admin.query("SELECT 1");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `SR-QA-CONCURRENCY-001 Acceptance Requirement: Failed to connect to PostgreSQL at ${connectionString}: ${msg}. Suite fails explicitly when DB is unconfigured or unreachable.`,
      );
    }

    await admin.query(`CREATE DATABASE ${databaseName}`);
    created = true;

    const url = new URL(connectionString);
    url.pathname = `/${databaseName}`;
    const testDbUrl = url.toString();

    // Primary admin pool for migrations & verification queries
    pool = new Pool({ connectionString: testDbUrl });

    // Initialize required schema & migration
    await pool.query("CREATE SCHEMA ops;");
    await pool.query(migration("V0079__shared_idempotency_records.sql"));

    // Instance A and Instance B represent two distinct application pods/nodes
    // each with its own connection pool to the shared real PostgreSQL database
    poolA = new Pool({ connectionString: testDbUrl });
    poolB = new Pool({ connectionString: testDbUrl });

    const dbHandleA: DatabaseService = {
      isEnabled: () => true,
      query: <T extends QueryResultRow>(sql: string, values?: unknown[]) =>
        poolA.query<T>(sql, values),
      connect: async () => poolA.connect(),
    } as unknown as DatabaseService;

    const dbHandleB: DatabaseService = {
      isEnabled: () => true,
      query: <T extends QueryResultRow>(sql: string, values?: unknown[]) =>
        poolB.query<T>(sql, values),
      connect: async () => poolB.connect(),
    } as unknown as DatabaseService;

    const repoA = new IdempotencyRepository(dbHandleA);
    const repoB = new IdempotencyRepository(dbHandleB);

    serviceA = new IdempotencyService(repoA);
    serviceB = new IdempotencyService(repoB);
  });

  afterAll(async () => {
    if (poolA) await poolA.end().catch(() => {});
    if (poolB) await poolB.end().catch(() => {});
    if (pool) await pool.end().catch(() => {});
    if (created && admin) {
      await admin
        .query(`DROP DATABASE IF EXISTS ${databaseName}`)
        .catch(() => {});
    }
    if (admin) await admin.end().catch(() => {});
  });

  // =========================================================================
  // SUITE 1: isolated_postgres_environment & Fail-Closed Availability
  // =========================================================================
  describe("Suite 1: isolated_postgres_environment & Fail-Closed Availability", () => {
    it("fails explicitly when database connection is invalid or unreachable, without skipping", async () => {
      const unreachablePool = new Pool({
        connectionString:
          "postgresql://postgres:wrong_pw@127.0.0.1:5433/non_existent",
        connectionTimeoutMillis: 1000,
      });

      let failed = false;
      try {
        await unreachablePool.query("SELECT 1");
      } catch (err: unknown) {
        failed = true;
        expect(err).toBeDefined();
      } finally {
        await unreachablePool.end().catch(() => {});
      }

      expect(failed).toBe(true);
    });

    it("uses an isolated test database with zero prior records", async () => {
      const result = await pool.query(
        "SELECT current_database() as db, count(*)::int as count FROM ops.idempotency_records",
      );
      expect(result.rows[0].db).toBe(databaseName);
      expect(result.rows[0].count).toBe(0);
    });
  });

  // =========================================================================
  // SUITE 2: Multi-Instance Real PostgreSQL Idempotency Matrix
  // =========================================================================
  describe("Suite 2: Multi-Instance Real PostgreSQL Idempotency Matrix", () => {
    it("Case 2.1 (Positive): Replays completed result across instances when same key and identical payload is provided", async () => {
      const scope = "tenant_order_creation";
      const idempotencyKey = `order-create-idemp-key-${randomUUID()}`;
      const payload = {
        tenantId: "tenant-concurrency-alpha",
        passengerId: "pax-101",
        pickup: "Station A",
        dropoff: "Station B",
        fareAmount: 350,
      };

      let executionCount = 0;

      // Instance A executes the initial command
      const resultA = await serviceA.execute({
        scope,
        idempotencyKey,
        tenantId: payload.tenantId,
        payload,
        execute: async () => {
          executionCount++;
          return {
            orderId: "ord-alpha-1001",
            status: "confirmed",
            receiptNo: "REC-20260910-001",
          };
        },
      });

      expect(resultA.isReplay).toBe(false);
      expect(resultA.statusCode).toBe(200);
      expect(resultA.data).toEqual({
        orderId: "ord-alpha-1001",
        status: "confirmed",
        receiptNo: "REC-20260910-001",
      });
      expect(executionCount).toBe(1);

      // Verify record in shared PostgreSQL database
      const dbResult = await pool.query(
        "SELECT status, idempotency_key, response_body FROM ops.idempotency_records WHERE scope = $1 AND idempotency_key = $2",
        [scope, idempotencyKey],
      );
      expect(dbResult.rows).toHaveLength(1);
      expect(dbResult.rows[0].status).toBe("completed");
      expect(dbResult.rows[0].idempotency_key).toBe(idempotencyKey);
      expect(dbResult.rows[0].response_body).toEqual({
        orderId: "ord-alpha-1001",
        status: "confirmed",
        receiptNo: "REC-20260910-001",
      });

      // Instance B receives the identical key and identical payload
      const resultB = await serviceB.execute({
        scope,
        idempotencyKey,
        tenantId: payload.tenantId,
        payload,
        execute: async () => {
          executionCount++;
          return {
            orderId: "ord-should-not-be-created",
            status: "duplicate",
          };
        },
      });

      // Verify result is a replay, with no additional execution
      expect(resultB.isReplay).toBe(true);
      expect(resultB.statusCode).toBe(200);
      expect(resultB.data).toEqual({
        orderId: "ord-alpha-1001",
        status: "confirmed",
        receiptNo: "REC-20260910-001",
      });
      expect(executionCount).toBe(1); // Crucial: command was NOT re-executed

      // Confirm DB still has exactly 1 record
      const postResult = await pool.query(
        "SELECT count(*)::int as cnt FROM ops.idempotency_records WHERE scope = $1 AND idempotency_key = $2",
        [scope, idempotencyKey],
      );
      expect(postResult.rows[0].cnt).toBe(1);
    });

    it("Case 2.2 (Negative): Rejects request with 409 IDEMPOTENCY_KEY_REUSED when same key is sent with different payload", async () => {
      const scope = "tenant_order_creation";
      const idempotencyKey = `order-create-idemp-key-${randomUUID()}`;
      const payloadA = {
        tenantId: "tenant-concurrency-alpha",
        passengerId: "pax-101",
        fareAmount: 350,
      };
      const payloadB = {
        tenantId: "tenant-concurrency-alpha",
        passengerId: "pax-102", // Different passenger
        fareAmount: 500, // Different fare
      };

      // Instance A completes command with payloadA
      await serviceA.execute({
        scope,
        idempotencyKey,
        tenantId: payloadA.tenantId,
        payload: payloadA,
        execute: async () => ({
          orderId: "ord-orig-2001",
        }),
      });

      // Instance B attempts execution with payloadB using the same key
      let caughtError: unknown;
      try {
        await serviceB.execute({
          scope,
          idempotencyKey,
          tenantId: payloadB.tenantId,
          payload: payloadB,
          execute: async () => ({
            orderId: "ord-should-never-execute",
          }),
        });
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(ApiRequestError);
      const apiError = caughtError as ApiRequestError;
      expect(apiError.getStatus()).toBe(409);
      expect(apiError.code).toBe(IDEMPOTENCY_KEY_REUSED);
      const errBody = (
        apiError.getResponse() as {
          error: { retryable: boolean; details?: Record<string, unknown> };
        }
      ).error;
      expect(errBody.retryable).toBe(false);
      expect(errBody.details?.storedHash).toBeDefined();
      expect(errBody.details?.currentHash).toBeDefined();
      expect(errBody.details?.storedHash).not.toBe(
        errBody.details?.currentHash,
      );

      // Ensure the original record in real DB was NOT modified
      const records = await pool.query(
        "SELECT response_body FROM ops.idempotency_records WHERE scope = $1 AND idempotency_key = $2",
        [scope, idempotencyKey],
      );
      expect(records.rows).toHaveLength(1);
      expect(records.rows[0].response_body).toEqual({
        orderId: "ord-orig-2001",
      });
    });

    it("Case 2.3 (Negative / Race): Rejects concurrent request with 409 IDEMPOTENCY_IN_PROGRESS when request is still processing", async () => {
      const scope = "tenant_order_creation";
      const idempotencyKey = `order-create-idemp-key-${randomUUID()}`;
      const payload = {
        tenantId: "tenant-concurrency-alpha",
        passengerId: "pax-103",
        fareAmount: 400,
      };

      let completeInstanceA: (() => void) | undefined;
      const holdInstanceAPromise = new Promise<void>((resolve) => {
        completeInstanceA = resolve;
      });

      // Start Instance A (enters 'processing' state in real PostgreSQL, awaiting hold release)
      const promiseA = serviceA.execute({
        scope,
        idempotencyKey,
        tenantId: payload.tenantId,
        payload,
        execute: async () => {
          await holdInstanceAPromise;
          return { orderId: "ord-3001" };
        },
      });

      // Poll until Instance A has actually committed the 'processing' row into real PostgreSQL
      let rowInserted = false;
      for (let i = 0; i < 50; i++) {
        const res = await pool.query(
          "SELECT status FROM ops.idempotency_records WHERE scope = $1 AND idempotency_key = $2",
          [scope, idempotencyKey],
        );
        if (res.rows.length > 0 && res.rows[0].status === "processing") {
          rowInserted = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 20));
      }
      expect(rowInserted).toBe(true);

      // While Instance A is still processing, Instance B attempts execution with the same key
      let caughtError: unknown;
      try {
        await serviceB.execute({
          scope,
          idempotencyKey,
          tenantId: payload.tenantId,
          payload,
          execute: async () => ({ orderId: "ord-racing-3002" }),
        });
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(ApiRequestError);
      const apiError = caughtError as ApiRequestError;
      expect(apiError.getStatus()).toBe(409);
      expect(apiError.code).toBe(IDEMPOTENCY_IN_PROGRESS);
      const errBody = (
        apiError.getResponse() as { error: { retryable: boolean } }
      ).error;
      expect(errBody.retryable).toBe(true); // Retryable because it's currently processing

      // Now release Instance A and let it finish
      completeInstanceA?.();
      const resultA = await promiseA;
      expect(resultA.isReplay).toBe(false);
      expect(resultA.data).toEqual({ orderId: "ord-3001" });

      // Confirm DB now shows completed
      const finalRes = await pool.query(
        "SELECT status FROM ops.idempotency_records WHERE scope = $1 AND idempotency_key = $2",
        [scope, idempotencyKey],
      );
      expect(finalRes.rows[0].status).toBe("completed");
    });

    it("Case 2.4 (Negative): Enforces idempotency key validation guardrails", async () => {
      const scope = "tenant_order_creation";

      // Missing key when required (default true)
      let missingKeyError: unknown;
      try {
        await serviceA.execute({
          scope,
          idempotencyKey: "",
          payload: { test: 1 },
          execute: async () => ({ ok: true }),
        });
      } catch (err) {
        missingKeyError = err;
      }
      expect(missingKeyError).toBeInstanceOf(ApiRequestError);
      expect((missingKeyError as ApiRequestError).getStatus()).toBe(400);
      expect((missingKeyError as ApiRequestError).code).toBe(
        IDEMPOTENCY_KEY_REQUIRED,
      );

      // Key exceeds 255 characters
      const overlongKey = "k".repeat(256);
      let tooLongError: unknown;
      try {
        await serviceA.execute({
          scope,
          idempotencyKey: overlongKey,
          payload: { test: 1 },
          execute: async () => ({ ok: true }),
        });
      } catch (err) {
        tooLongError = err;
      }
      expect(tooLongError).toBeInstanceOf(ApiRequestError);
      expect((tooLongError as ApiRequestError).getStatus()).toBe(400);
      expect((tooLongError as ApiRequestError).code).toBe(
        IDEMPOTENCY_KEY_TOO_LONG,
      );
    });

    it("Case 2.5 (Failure & Recovery): Cleans up processing lock on execution failure so retry can proceed cleanly", async () => {
      const scope = "tenant_order_creation";
      const idempotencyKey = `order-create-idemp-key-failed-${randomUUID()}`;
      const payload = { test: "failing-command" };

      let caught: unknown;
      try {
        await serviceA.execute({
          scope,
          idempotencyKey,
          payload,
          execute: async () => {
            throw new Error(
              "Simulated payment gateway timeout during order creation",
            );
          },
        });
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeDefined();
      expect((caught as Error).message).toContain(
        "Simulated payment gateway timeout",
      );

      // Processing row was removed from real PostgreSQL upon failure so the key is not permanently blocked
      const records = await pool.query(
        "SELECT * FROM ops.idempotency_records WHERE scope = $1 AND idempotency_key = $2",
        [scope, idempotencyKey],
      );
      expect(records.rows).toHaveLength(0);

      // Instance B (or restarted Instance A) retries with the same key and succeeds
      const retryResult = await serviceB.execute({
        scope,
        idempotencyKey,
        payload,
        execute: async () => ({
          orderId: "ord-recovered-after-fail",
          recovered: true,
        }),
      });

      expect(retryResult.isReplay).toBe(false);
      expect(retryResult.data).toEqual({
        orderId: "ord-recovered-after-fail",
        recovered: true,
      });

      // Now completed row exists in real PostgreSQL
      const finalRecords = await pool.query(
        "SELECT status FROM ops.idempotency_records WHERE scope = $1 AND idempotency_key = $2",
        [scope, idempotencyKey],
      );
      expect(finalRecords.rows).toHaveLength(1);
      expect(finalRecords.rows[0].status).toBe("completed");
    });

    it("Case 2.6 (Optional): Executes without idempotency storage when key is omitted and required=false", async () => {
      const scope = "tenant_order_creation";

      const preCountRes = await pool.query(
        "SELECT count(*)::int as cnt FROM ops.idempotency_records",
      );
      const preCount = preCountRes.rows[0].cnt;

      const result = await serviceA.execute({
        scope,
        idempotencyKey: undefined,
        required: false,
        payload: { anonymous: true },
        execute: async () => ({ anonymousOrder: "ord-anon-999" }),
      });

      expect(result.isReplay).toBe(false);
      expect(result.data).toEqual({ anonymousOrder: "ord-anon-999" });

      // No new records inserted into DB
      const postCountRes = await pool.query(
        "SELECT count(*)::int as cnt FROM ops.idempotency_records",
      );
      expect(postCountRes.rows[0].cnt).toBe(preCount);
    });
  });
});
