import { describe, expect, it, vi } from "vitest";

import {
  canonicalizeJson,
  computePayloadHash,
  executeWithIdempotency,
  IdempotencyRepository,
  IdempotencyService,
} from "../../apps/api/src/common/idempotency";
import {
  IDEMPOTENCY_KEY_REQUIRED,
  IDEMPOTENCY_KEY_REUSED,
  IDEMPOTENCY_KEY_TOO_LONG,
} from "@drts/contracts";

describe("Idempotency Foundation (CONF-IDEM-001)", () => {
  describe("Canonical JSON Serialization & Hashing", () => {
    it("sorts object keys lexicographically regardless of declaration order", () => {
      const payload1 = { b: 2, a: 1, c: 3 };
      const payload2 = { c: 3, a: 1, b: 2 };
      const payload3 = { a: 1, b: 2, c: 3 };

      const canon1 = canonicalizeJson(payload1);
      const canon2 = canonicalizeJson(payload2);
      const canon3 = canonicalizeJson(payload3);

      expect(canon1).toBe('{"a":1,"b":2,"c":3}');
      expect(canon2).toBe(canon1);
      expect(canon3).toBe(canon1);

      expect(computePayloadHash(payload1)).toBe(computePayloadHash(payload2));
      expect(computePayloadHash(payload1)).toBe(computePayloadHash(payload3));
    });

    it("recursively canonicalizes nested objects and arrays", () => {
      const payload1 = {
        orderId: "ORD-001",
        passenger: { phone: "0912345678", name: "Alice" },
        waypoints: [
          { lat: 25.033, lng: 121.565, tag: "pickup" },
          { lng: 121.566, lat: 25.034, tag: "dropoff" },
        ],
      };

      const payload2 = {
        passenger: { name: "Alice", phone: "0912345678" },
        waypoints: [
          { tag: "pickup", lng: 121.565, lat: 25.033 },
          { lat: 25.034, lng: 121.566, tag: "dropoff" },
        ],
        orderId: "ORD-001",
      };

      expect(canonicalizeJson(payload1)).toBe(canonicalizeJson(payload2));
      expect(computePayloadHash(payload1)).toBe(computePayloadHash(payload2));
    });

    it("omits undefined properties in objects while preserving nulls", () => {
      const payload1 = { a: 1, b: undefined, c: null };
      const payload2 = { a: 1, c: null };

      expect(canonicalizeJson(payload1)).toBe('{"a":1,"c":null}');
      expect(canonicalizeJson(payload1)).toBe(canonicalizeJson(payload2));
      expect(computePayloadHash(payload1)).toBe(computePayloadHash(payload2));
    });

    it("canonicalizes Date objects to ISO 8601 strings", () => {
      const date = new Date("2026-08-17T12:00:00.000Z");
      const payload = { timestamp: date, amount: 150 };

      expect(canonicalizeJson(payload)).toBe(
        '{"amount":150,"timestamp":"2026-08-17T12:00:00.000Z"}',
      );
    });

    it("produces different hashes for different payloads", () => {
      const hash1 = computePayloadHash({ amount: 100, currency: "NTD" });
      const hash2 = computePayloadHash({ amount: 200, currency: "NTD" });

      expect(hash1).not.toBe(hash2);
      expect(hash1).toHaveLength(64);
      expect(hash2).toHaveLength(64);
    });
  });

  describe("Idempotency Execution Semantics", () => {
    it("Case 1: executes fresh command when key is unseen and persists result", async () => {
      const repository = new IdempotencyRepository();
      const service = new IdempotencyService(repository);
      const executeFn = vi.fn().mockResolvedValue({
        data: { orderId: "ORD-101", status: "created" },
        statusCode: 201,
        actionReceipt: {
          actionId: "idem-key-101",
          auditId: "audit-101",
          resourceType: "order",
          resourceId: "ORD-101",
          status: "completed" as const,
        },
      });

      const result = await service.execute({
        scope: "orders:passenger_create",
        idempotencyKey: "idem-key-101",
        payload: { passengerId: "P-001", fare: 350 },
        execute: executeFn,
      });

      expect(executeFn).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        data: { orderId: "ORD-101", status: "created" },
        statusCode: 201,
        isReplay: false,
        actionReceipt: {
          actionId: "idem-key-101",
          auditId: "audit-101",
          resourceType: "order",
          resourceId: "ORD-101",
          status: "completed",
        },
      });

      const saved = await repository.findByKey(
        "orders:passenger_create",
        "idem-key-101",
      );
      expect(saved).not.toBeNull();
      expect(saved?.status).toBe("completed");
      expect(saved?.statusCode).toBe(201);
      expect(saved?.responseBody).toEqual({
        orderId: "ORD-101",
        status: "created",
      });
    });

    it("Case 2: replays stored response when matching payload is retried without re-executing", async () => {
      const repository = new IdempotencyRepository();
      const service = new IdempotencyService(repository);
      const executeFn = vi.fn().mockResolvedValue({
        data: { payoutId: "PAYOUT-500", amountMinor: 500000 },
        statusCode: 200,
        actionReceipt: {
          actionId: "idem-payout-001",
          auditId: "audit-payout-001",
          resourceType: "driver_payout",
          resourceId: "PAYOUT-500",
          status: "completed" as const,
        },
      });

      const payload = { driverId: "DRV-1", amountMinor: 500000 };

      // First call (executes)
      const firstResult = await service.execute({
        scope: "billing:driver_payout",
        idempotencyKey: "idem-payout-001",
        payload,
        execute: executeFn,
      });

      expect(firstResult.isReplay).toBe(false);
      expect(executeFn).toHaveBeenCalledTimes(1);

      // Second call with same payload (replays)
      const secondResult = await service.execute({
        scope: "billing:driver_payout",
        idempotencyKey: "idem-payout-001",
        payload: { ...payload }, // new object instance, same content
        execute: executeFn,
      });

      expect(secondResult.isReplay).toBe(true);
      expect(secondResult.statusCode).toBe(200);
      expect(secondResult.data).toEqual({
        payoutId: "PAYOUT-500",
        amountMinor: 500000,
      });
      expect(secondResult.actionReceipt?.auditId).toBe("audit-payout-001");
      // Critical check: domain logic was NOT executed a second time
      expect(executeFn).toHaveBeenCalledTimes(1);
    });

    it("Case 3: returns 409 IDEMPOTENCY_KEY_REUSED when key is reused with differing payload", async () => {
      const repository = new IdempotencyRepository();
      const service = new IdempotencyService(repository);
      const executeFn = vi.fn().mockResolvedValue({
        data: { caseNo: "C-20260817-0001" },
        statusCode: 201,
      });

      // First call
      await service.execute({
        scope: "crm:complaint:case_create",
        idempotencyKey: "idem-complaint-001",
        payload: { orderId: "ORD-1", category: "fare_dispute" },
        execute: executeFn,
      });

      expect(executeFn).toHaveBeenCalledTimes(1);

      // Second call with differing payload
      await expect(
        service.execute({
          scope: "crm:complaint:case_create",
          idempotencyKey: "idem-complaint-001",
          payload: { orderId: "ORD-1", category: "driver_attitude" }, // Changed category
          execute: executeFn,
        }),
      ).rejects.toThrowError(
        expect.objectContaining({
          response: expect.objectContaining({
            error: expect.objectContaining({
              code: IDEMPOTENCY_KEY_REUSED,
              retryable: false,
            }),
          }),
        }),
      );

      // Execute function must NOT have been called for conflicting request
      expect(executeFn).toHaveBeenCalledTimes(1);
    });

    it("rejects missing key with 400 IDEMPOTENCY_KEY_REQUIRED when required", async () => {
      const repository = new IdempotencyRepository();
      const service = new IdempotencyService(repository);
      const executeFn = vi.fn();

      await expect(
        service.execute({
          scope: "orders:passenger_create",
          idempotencyKey: "",
          payload: { orderId: "ORD-1" },
          execute: executeFn,
        }),
      ).rejects.toThrowError(
        expect.objectContaining({
          response: expect.objectContaining({
            error: expect.objectContaining({
              code: IDEMPOTENCY_KEY_REQUIRED,
              retryable: false,
            }),
          }),
        }),
      );

      expect(executeFn).not.toHaveBeenCalled();
    });

    it("executes without idempotency tracking when key is omitted and required: false", async () => {
      const repository = new IdempotencyRepository();
      const service = new IdempotencyService(repository);
      const executeFn = vi.fn().mockResolvedValue({
        data: { unrecorded: true },
        statusCode: 200,
      });

      const result = await service.execute({
        scope: "optional:operation",
        idempotencyKey: undefined,
        required: false,
        payload: { test: true },
        execute: executeFn,
      });

      expect(executeFn).toHaveBeenCalledTimes(1);
      expect(result.data).toEqual({ unrecorded: true });
      expect(result.isReplay).toBe(false);
    });

    it("rejects keys longer than 255 characters with 400 IDEMPOTENCY_KEY_TOO_LONG", async () => {
      const repository = new IdempotencyRepository();
      const service = new IdempotencyService(repository);
      const longKey = "k".repeat(256);

      await expect(
        service.execute({
          scope: "orders:create",
          idempotencyKey: longKey,
          payload: {},
          execute: vi.fn(),
        }),
      ).rejects.toThrowError(
        expect.objectContaining({
          response: expect.objectContaining({
            error: expect.objectContaining({
              code: IDEMPOTENCY_KEY_TOO_LONG,
            }),
          }),
        }),
      );
    });
  });

  describe("Concurrency & Unique Constraint Race Condition Handling", () => {
    it("handles concurrent insert collision gracefully and replays stored result", async () => {
      const repository = new IdempotencyRepository();
      const payload = { jobId: "JOB-1", filter: "month" };
      const payloadHash = computePayloadHash(payload);

      // Pre-seed an already completed idempotency record in repository
      // simulating a race where another concurrent worker completed execution just after look-up
      await repository.createProcessing({
        scope: "reporting:job_create",
        idempotencyKey: "concurrent-key-1",
        payloadHash,
      });
      await repository.complete({
        scope: "reporting:job_create",
        idempotencyKey: "concurrent-key-1",
        statusCode: 202,
        responseBody: { jobId: "JOB-1", status: "queued" },
      });

      // Mock createProcessing to simulate collision (inserted: false)
      vi.spyOn(repository, "findByKey").mockResolvedValueOnce(null); // Initial lookup missed due to concurrency

      const executeFn = vi.fn().mockResolvedValue({
        data: { jobId: "JOB-1-DUPLICATE", status: "queued" },
      });

      const service = new IdempotencyService(repository);
      const result = await service.execute({
        scope: "reporting:job_create",
        idempotencyKey: "concurrent-key-1",
        payload,
        execute: executeFn,
      });

      // Successfully resolved race by replaying the winning concurrent result
      expect(result.isReplay).toBe(true);
      expect(result.statusCode).toBe(202);
      expect(result.data).toEqual({ jobId: "JOB-1", status: "queued" });
      expect(executeFn).not.toHaveBeenCalled();
    });

    it("handles concurrent insert collision with differing payload by returning conflict", async () => {
      const repository = new IdempotencyRepository();
      const initialPayload = { jobId: "JOB-1", filter: "month" };
      const initialHash = computePayloadHash(initialPayload);

      // Winner finished with initialPayload
      await repository.createProcessing({
        scope: "reporting:job_create",
        idempotencyKey: "concurrent-key-2",
        payloadHash: initialHash,
      });
      await repository.complete({
        scope: "reporting:job_create",
        idempotencyKey: "concurrent-key-2",
        statusCode: 202,
        responseBody: { jobId: "JOB-1", status: "queued" },
      });

      // Loser has differing payload and missed initial lookup
      vi.spyOn(repository, "findByKey").mockResolvedValueOnce(null);

      const service = new IdempotencyService(repository);
      await expect(
        service.execute({
          scope: "reporting:job_create",
          idempotencyKey: "concurrent-key-2",
          payload: { jobId: "JOB-1", filter: "year" }, // Differing filter
          execute: vi.fn(),
        }),
      ).rejects.toThrowError(
        expect.objectContaining({
          response: expect.objectContaining({
            error: expect.objectContaining({
              code: IDEMPOTENCY_KEY_REUSED,
            }),
          }),
        }),
      );
    });
  });

  describe("Error Cleanup and Retry Resilience", () => {
    it("cleans up record on execution failure so future retries can execute fresh", async () => {
      const repository = new IdempotencyRepository();
      const service = new IdempotencyService(repository);
      let attempts = 0;

      const flakyExecute = vi.fn().mockImplementation(async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error("Temporary database glitch");
        }
        return {
          data: { success: true, attempt: attempts },
          statusCode: 200,
        };
      });

      const payload = { item: "ticket-1" };

      // Attempt 1 fails
      await expect(
        service.execute({
          scope: "tickets:issue",
          idempotencyKey: "retryable-key-1",
          payload,
          execute: flakyExecute,
        }),
      ).rejects.toThrow("Temporary database glitch");

      // Verify record was cleared
      const recordAfterFailure = await repository.findByKey(
        "tickets:issue",
        "retryable-key-1",
      );
      expect(recordAfterFailure).toBeNull();

      // Attempt 2 succeeds
      const result = await service.execute({
        scope: "tickets:issue",
        idempotencyKey: "retryable-key-1",
        payload,
        execute: flakyExecute,
      });

      expect(result.data).toEqual({ success: true, attempt: 2 });
      expect(result.isReplay).toBe(false);
      expect(flakyExecute).toHaveBeenCalledTimes(2);
    });

    it("works seamlessly with functional executeWithIdempotency helper", async () => {
      const repository = new IdempotencyRepository();
      const result = await executeWithIdempotency(repository, {
        scope: "orders:functional_test",
        idempotencyKey: "func-key-1",
        payload: { x: 42 },
        execute: async () => ({
          data: { result: "ok" },
          statusCode: 200,
        }),
      });

      expect(result.data).toEqual({ result: "ok" });
      expect(result.isReplay).toBe(false);
    });
  });
});
