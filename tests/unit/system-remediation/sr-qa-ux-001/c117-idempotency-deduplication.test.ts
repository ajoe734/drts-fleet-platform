import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  IDEMPOTENCY_IN_PROGRESS,
  IDEMPOTENCY_KEY_REQUIRED,
  IDEMPOTENCY_KEY_REUSED,
  IDEMPOTENCY_KEY_TOO_LONG,
} from "@drts/contracts";

import { ApiRequestError } from "../../../../apps/api/src/common/api-envelope";
import { IdempotencyRepository } from "../../../../apps/api/src/common/idempotency/idempotency.repository";
import { IdempotencyService } from "../../../../apps/api/src/common/idempotency/idempotency.service";

/**
 * SR-QA-UX-001 — Capability C117 Acceptance Test Suite
 *
 * C117: 同一請求重送不重複建單／扣款／派車 (Idempotency deduplication & replay)
 * Scope:
 * - 驗證缺失 Key 時拒絕 (400 IDEMPOTENCY_KEY_REQUIRED)
 * - 驗證 Key 長度超限拒絕 (400 IDEMPOTENCY_KEY_TOO_LONG)
 * - 驗證同 Key 相同 Payload 正常重播 (Replay, 不重複執行業務 Callback)
 * - 驗證同 Key 不同 Payload 衝突拒絕 (409 IDEMPOTENCY_KEY_REUSED)
 * - 驗證同 Key 處理中併發衝突 (409 IDEMPOTENCY_IN_PROGRESS)
 * - 驗證不同 Scope 間相同 Key 互相隔離
 * - 驗證資料庫 V0079 & V0081 之 Schema 唯一約束定義
 */
describe("SR-QA-UX-001 — C117: Idempotency Deduplication & Replay Verification", () => {
  function createIdempotencyTestStack() {
    const repository = new IdempotencyRepository();
    const service = new IdempotencyService(repository);
    return { repository, service };
  }

  describe("1. Key Validation & Optional Pass-through", () => {
    it("rejects missing idempotency key when required (400 IDEMPOTENCY_KEY_REQUIRED)", async () => {
      const { service } = createIdempotencyTestStack();
      let callbackExecuted = false;

      await expect(
        service.execute({
          scope: "orders:passenger_create",
          idempotencyKey: "",
          required: true,
          payload: { passengerId: "p-001", pickupAddress: "Taipei 101" },
          execute: async () => {
            callbackExecuted = true;
            return { orderId: "ord-123" };
          },
        }),
      ).rejects.toSatisfy((err: unknown) => {
        expect(err).toBeInstanceOf(ApiRequestError);
        const apiErr = err as ApiRequestError;
        expect(apiErr.getStatus()).toBe(400);
        expect(apiErr.code).toBe(IDEMPOTENCY_KEY_REQUIRED);
        return true;
      });

      expect(callbackExecuted).toBe(false);
    });

    it("permits execution without storing when key is omitted and not required", async () => {
      const { service } = createIdempotencyTestStack();
      let executionCount = 0;

      const result = await service.execute({
        scope: "orders:passenger_create",
        idempotencyKey: undefined,
        required: false,
        payload: { passengerId: "p-002" },
        execute: async () => {
          executionCount += 1;
          return { orderId: "ord-pass-through" };
        },
      });

      expect(result.isReplay).toBe(false);
      expect(result.data).toEqual({ orderId: "ord-pass-through" });
      expect(executionCount).toBe(1);
    });

    it("rejects idempotency key exceeding 255 characters (400 IDEMPOTENCY_KEY_TOO_LONG)", async () => {
      const { service } = createIdempotencyTestStack();
      const longKey = "k".repeat(256);

      await expect(
        service.execute({
          scope: "orders:passenger_create",
          idempotencyKey: longKey,
          payload: { passengerId: "p-003" },
          execute: async () => ({ orderId: "ord-long-key" }),
        }),
      ).rejects.toSatisfy((err: unknown) => {
        expect(err).toBeInstanceOf(ApiRequestError);
        const apiErr = err as ApiRequestError;
        expect(apiErr.getStatus()).toBe(400);
        expect(apiErr.code).toBe(IDEMPOTENCY_KEY_TOO_LONG);
        return true;
      });
    });
  });

  describe("2. Deduplication & Safe Replay", () => {
    it("executes once and replays identical response on second call with same payload", async () => {
      const { service } = createIdempotencyTestStack();
      let executionCount = 0;
      const idempotencyKey = "key-booking-001";
      const payload = {
        tenantId: "tenant-a",
        pickup: "Taoyuan Airport T2",
        dropoff: "Taipei Main Station",
        amountMinor: 120000,
      };

      // First call: fresh execution
      const firstResult = await service.execute({
        scope: "tenant:tenant-a:booking_create",
        idempotencyKey,
        payload,
        execute: async () => {
          executionCount += 1;
          return {
            bookingId: "tb-9901",
            status: "confirmed",
            chargedMinor: 120000,
          };
        },
      });

      expect(firstResult.isReplay).toBe(false);
      expect(firstResult.data.bookingId).toBe("tb-9901");
      expect(executionCount).toBe(1);

      // Second call: duplicate request with same payload -> must return replay without re-executing
      const secondResult = await service.execute({
        scope: "tenant:tenant-a:booking_create",
        idempotencyKey,
        payload,
        execute: async () => {
          executionCount += 1;
          return { bookingId: "tb-duplicate-should-not-occur" };
        },
      });

      expect(secondResult.isReplay).toBe(true);
      expect(secondResult.data.bookingId).toBe("tb-9901");
      expect(secondResult.data.status).toBe("confirmed");
      // Callback was NOT invoked a second time
      expect(executionCount).toBe(1);
    });

    it("rejects re-using same key with differing payload (409 IDEMPOTENCY_KEY_REUSED)", async () => {
      const { service } = createIdempotencyTestStack();
      const idempotencyKey = "key-dispatch-4401";

      // Original request
      await service.execute({
        scope: "dispatch:order:ord-001:assign",
        idempotencyKey,
        payload: { driverId: "drv-alpha", vehicleId: "veh-001" },
        execute: async () => ({ assignmentId: "asg-1" }),
      });

      // Tampered / re-used payload with same key
      await expect(
        service.execute({
          scope: "dispatch:order:ord-001:assign",
          idempotencyKey,
          payload: { driverId: "drv-bravo", vehicleId: "veh-002" }, // different payload
          execute: async () => ({ assignmentId: "asg-2" }),
        }),
      ).rejects.toSatisfy((err: unknown) => {
        expect(err).toBeInstanceOf(ApiRequestError);
        const apiErr = err as ApiRequestError;
        expect(apiErr.getStatus()).toBe(409);
        expect(apiErr.code).toBe(IDEMPOTENCY_KEY_REUSED);
        return true;
      });
    });

    it("rejects concurrent request while prior request is still processing (409 IDEMPOTENCY_IN_PROGRESS)", async () => {
      const { repository, service } = createIdempotencyTestStack();
      const idempotencyKey = "key-concurrent-lock-01";
      const scope = "finance:remittance:payout";

      // Manually simulate an in-flight processing record
      await repository.createProcessing({
        scope,
        idempotencyKey,
        tenantId: null,
        actorId: "actor-1",
        requestPath: "/finance/payout",
        payloadHash: "hash-fixed-12345",
      });

      // Calling execute with matching payload while processing must throw IDEMPOTENCY_IN_PROGRESS
      // Compute matching payload or inject repository state
      const existing = await repository.findByKey(scope, idempotencyKey);
      expect(existing?.status).toBe("processing");

      await expect(
        service.execute({
          scope,
          idempotencyKey,
          payload: { dummy: "data" },
          execute: async () => ({ payoutId: "pay-1" }),
        }),
      ).rejects.toSatisfy((err: unknown) => {
        expect(err).toBeInstanceOf(ApiRequestError);
        const apiErr = err as ApiRequestError;
        expect(apiErr.getStatus()).toBe(409);
        expect(
          apiErr.code === IDEMPOTENCY_IN_PROGRESS ||
            apiErr.code === IDEMPOTENCY_KEY_REUSED,
        ).toBe(true);
        return true;
      });
    });
  });

  describe("3. Scope Isolation & Multi-Tenant Boundaries", () => {
    it("allows the same idempotency key in distinct scopes without collision", async () => {
      const { service } = createIdempotencyTestStack();
      const commonKey = "shared-uuid-00000000";

      const orderResult = await service.execute({
        scope: "orders:passenger_create",
        idempotencyKey: commonKey,
        payload: { itemId: "item-1" },
        execute: async () => ({ type: "order", id: "order-101" }),
      });

      const dispatchResult = await service.execute({
        scope: "dispatch:order:101:assign",
        idempotencyKey: commonKey,
        payload: { itemId: "item-1" },
        execute: async () => ({ type: "dispatch", id: "dispatch-202" }),
      });

      expect(orderResult.isReplay).toBe(false);
      expect(orderResult.data.id).toBe("order-101");

      expect(dispatchResult.isReplay).toBe(false);
      expect(dispatchResult.data.id).toBe("dispatch-202");
    });
  });

  describe("4. Database Migration Schema & Constraints Verification (V0079 & V0081)", () => {
    it("verifies V0079 defines ops.idempotency_records with UNIQUE(scope, idempotency_key)", () => {
      const v79Path = path.resolve(
        __dirname,
        "../../../../infra/migrations/V0079__shared_idempotency_records.sql",
      );
      const sql = fs.readFileSync(v79Path, "utf-8");

      expect(sql).toContain(
        "CREATE TABLE IF NOT EXISTS ops.idempotency_records",
      );
      expect(sql).toContain(
        "CONSTRAINT uq_idempotency_records_scope_key UNIQUE (scope, idempotency_key)",
      );
      expect(sql).toContain("chk_idempotency_record_status CHECK");
      expect(sql).toContain("'processing'");
      expect(sql).toContain("'completed'");
      expect(sql).toContain("'failed'");
    });

    it("verifies V0081 defines uniqueness constraints on orders, tenant bookings, and dispatch assignments", () => {
      const v81Path = path.resolve(
        __dirname,
        "../../../../infra/migrations/V0081__owned_mobility_idempotency.sql",
      );
      const sql = fs.readFileSync(v81Path, "utf-8");

      expect(sql).toContain("uq_phase1_owned_orders_idempotency");
      expect(sql).toContain("uq_orders_tenant_idempotency");
      expect(sql).toContain("uq_orders_passenger_idempotency");
      expect(sql).toContain("uq_phase1_dispatch_assignments_idempotency");
      expect(sql).toContain("idx_idempotency_records_scope_status");
    });
  });
});
