import { describe, expect, it } from "vitest";
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
import {
  FakeConcurrencyPgClient,
  FakeDatabaseServiceHandle,
} from "./fake-concurrency-pg-client";

describe("SR-QA-CONCURRENCY-001: Multi-Instance Idempotency Verification", () => {
  function setupTwoInstances() {
    // Shared PostgreSQL database client simulating single database shared by Instance A & B
    const sharedPg = new FakeConcurrencyPgClient();
    const handleA = new FakeDatabaseServiceHandle(sharedPg);
    const handleB = new FakeDatabaseServiceHandle(sharedPg);

    const repoA = new IdempotencyRepository(
      handleA as unknown as DatabaseService,
    );
    const repoB = new IdempotencyRepository(
      handleB as unknown as DatabaseService,
    );

    const serviceA = new IdempotencyService(repoA);
    const serviceB = new IdempotencyService(repoB);

    return { serviceA, serviceB, sharedPg };
  }

  it("Case 1 (Positive): Replays completed result across instances when same key and identical payload is provided", async () => {
    const { serviceA, serviceB, sharedPg } = setupTwoInstances();
    const scope = "tenant_order_creation";
    const idempotencyKey = "order-create-idemp-key-001";
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

    // Verify record in shared DB table
    const table = sharedPg.getTable("ops.idempotency_records");
    expect(table).toHaveLength(1);
    expect(table[0]?.status).toBe("completed");
    expect(table[0]?.idempotency_key).toBe(idempotencyKey);

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
    expect(sharedPg.getTable("ops.idempotency_records")).toHaveLength(1);
  });

  it("Case 2 (Negative): Rejects request with 409 IDEMPOTENCY_KEY_REUSED when same key is sent with different payload", async () => {
    const { serviceA, serviceB, sharedPg } = setupTwoInstances();
    const scope = "tenant_order_creation";
    const idempotencyKey = "order-create-idemp-key-002";
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
    expect(errBody.details?.storedHash).not.toBe(errBody.details?.currentHash);

    // Ensure the original record in DB was NOT modified
    const records = sharedPg.getTable("ops.idempotency_records");
    expect(records).toHaveLength(1);
    expect(records[0]?.response_body).toEqual({ orderId: "ord-orig-2001" });
  });

  it("Case 3 (Negative / Race): Rejects concurrent request with 409 IDEMPOTENCY_IN_PROGRESS when request is still processing", async () => {
    const { serviceA, serviceB } = setupTwoInstances();
    const scope = "tenant_order_creation";
    const idempotencyKey = "order-create-idemp-key-003";
    const payload = {
      tenantId: "tenant-concurrency-alpha",
      passengerId: "pax-103",
      fareAmount: 400,
    };

    let completeInstanceA: (() => void) | undefined;
    const holdInstanceAPromise = new Promise<void>((resolve) => {
      completeInstanceA = resolve;
    });

    // Start Instance A (enters 'processing' state in DB, awaiting hold release)
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

    // Give Instance A time to insert 'processing' row into DB
    await new Promise((r) => setTimeout(r, 10));

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
  });

  it("Case 4 (Negative): Enforces idempotency key validation guardrails", async () => {
    const { serviceA } = setupTwoInstances();
    const scope = "tenant_order_creation";

    // 4.1: Missing key when required (default true)
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

    // 4.2: Key exceeds 255 characters
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

  it("Case 5 (Failure & Recovery): Cleans up processing lock on execution failure so retry can proceed cleanly", async () => {
    const { serviceA, serviceB, sharedPg } = setupTwoInstances();
    const scope = "tenant_order_creation";
    const idempotencyKey = "order-create-idemp-key-failed";
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

    // Processing row was removed upon failure so the key is not permanently blocked
    const records = sharedPg.getTable("ops.idempotency_records");
    expect(records).toHaveLength(0);

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
    // Now completed row exists in DB
    expect(sharedPg.getTable("ops.idempotency_records")).toHaveLength(1);
    expect(sharedPg.getTable("ops.idempotency_records")[0]?.status).toBe(
      "completed",
    );
  });

  it("Case 6 (Optional): Executes without idempotency storage when key is omitted and required=false", async () => {
    const { serviceA, sharedPg } = setupTwoInstances();
    const scope = "tenant_order_creation";

    const result = await serviceA.execute({
      scope,
      idempotencyKey: undefined,
      required: false,
      payload: { anonymous: true },
      execute: async () => ({ anonymousOrder: "ord-anon-999" }),
    });

    expect(result.isReplay).toBe(false);
    expect(result.data).toEqual({ anonymousOrder: "ord-anon-999" });
    // No records inserted into DB
    expect(sharedPg.getTable("ops.idempotency_records")).toHaveLength(0);
  });
});
