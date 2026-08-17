import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ApiClient,
  createIdempotencyKey,
  createRequestToken,
} from "../../packages/api-client/src/index";

describe("CONF-IDEM-005: Client Idempotency Key Binding", () => {
  let capturedRequests: Array<{ url: string; method?: string | undefined; headers: Headers }>;

  beforeEach(() => {
    capturedRequests = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        const headers = new Headers(init?.headers);
        capturedRequests.push({
          url,
          method: init?.method,
          headers,
        });

        return new Response(
          JSON.stringify({
            data: { success: true, id: "test-id-123" },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }),
    );
  });

  describe("Blanket key injection removal & explicit intent binding", () => {
    it("does NOT automatically inject Idempotency-Key on POST requests when omitted", async () => {
      const client = new ApiClient({ baseUrl: "https://api.drts.example" });

      await client.post("/api/test-endpoint", {
        body: { foo: "bar" },
      });

      expect(capturedRequests).toHaveLength(1);
      const req = capturedRequests[0]!;
      expect(req.headers.has("Idempotency-Key")).toBe(false);
      expect(req.headers.has("idempotency-key")).toBe(false);
    });

    it("does NOT inject Idempotency-Key on GET, PUT, DELETE requests", async () => {
      const client = new ApiClient({ baseUrl: "https://api.drts.example" });

      await client.get("/api/test-endpoint");
      await client.delete("/api/test-endpoint");

      expect(capturedRequests).toHaveLength(2);
      expect(capturedRequests[0]!.headers.has("Idempotency-Key")).toBe(false);
      expect(capturedRequests[1]!.headers.has("Idempotency-Key")).toBe(false);
    });

    it("sends Idempotency-Key when explicitly provided in options.idempotencyKey", async () => {
      const client = new ApiClient({ baseUrl: "https://api.drts.example" });
      const intentKey = createIdempotencyKey("user-intent-1");

      await client.post("/api/test-endpoint", {
        body: { foo: "bar" },
        idempotencyKey: intentKey,
      });

      expect(capturedRequests).toHaveLength(1);
      expect(capturedRequests[0]!.headers.get("Idempotency-Key")).toBe(intentKey);
    });

    it("sends Idempotency-Key when provided in options.headers", async () => {
      const client = new ApiClient({ baseUrl: "https://api.drts.example" });
      const customKey = "custom-intent-key-999";

      await client.post("/api/test-endpoint", {
        body: { foo: "bar" },
        headers: { "Idempotency-Key": customKey },
      });

      expect(capturedRequests).toHaveLength(1);
      expect(capturedRequests[0]!.headers.get("Idempotency-Key")).toBe(customKey);
    });
  });

  describe("User intent retry semantics (Acceptance Criteria 1)", () => {
    it("sends one identical key across all N retry attempts of the same intent", async () => {
      const client = new ApiClient({ baseUrl: "https://api.drts.example" });
      const intentKey = createIdempotencyKey("booking-submission");

      const retryCount = 5;
      for (let attempt = 0; attempt < retryCount; attempt++) {
        await client.post("/api/bookings", {
          body: { passengerName: "Alice", pickup: "Point A" },
          idempotencyKey: intentKey,
        });
      }

      expect(capturedRequests).toHaveLength(retryCount);
      for (let i = 0; i < retryCount; i++) {
        expect(capturedRequests[i]!.headers.get("Idempotency-Key")).toBe(
          intentKey,
        );
      }
    });

    it("generates distinct keys for distinct user actions", async () => {
      const key1 = createIdempotencyKey("action-1");
      const key2 = createIdempotencyKey("action-2");

      expect(key1).not.toBe(key2);
      expect(key1.startsWith("action-1-")).toBe(true);
      expect(key2.startsWith("action-2-")).toBe(true);
    });

    it("createIdempotencyKey formats correctly with and without prefix", () => {
      const unprefixed = createIdempotencyKey();
      expect(typeof unprefixed).toBe("string");
      expect(unprefixed.length).toBeGreaterThan(10);

      const prefixed = createIdempotencyKey("custom-action");
      expect(prefixed.startsWith("custom-action-")).toBe(true);
    });

    it("createRequestToken returns a random token", () => {
      const token1 = createRequestToken();
      const token2 = createRequestToken();
      expect(token1).not.toBe(token2);
    });
  });

  describe("Domain command method passthrough for all 9 mutations (Acceptance Criteria 2, 3, 4)", () => {
    let client: ApiClient;

    beforeEach(() => {
      client = new ApiClient({ baseUrl: "https://api.drts.example" });
    });

    it("1. createCallCenterOrder / createTenantBooking / createOrder accepts and forwards idempotencyKey", async () => {
      const key1 = createIdempotencyKey("callcenter-order");
      await client.createCallCenterOrder(
        {
          pickup: "A",
          dropoff: "B",
          callerPhone: "+886912345678",
        } as never,
        { idempotencyKey: key1 },
      );
      expect(capturedRequests[capturedRequests.length - 1]!.headers.get("Idempotency-Key")).toBe(key1);

      const key2 = createIdempotencyKey("tenant-booking");
      await client.createTenantBooking(
        {
          pickupAddress: "A",
          dropoffAddress: "B",
        } as never,
        { idempotencyKey: key2 },
      );
      expect(capturedRequests[capturedRequests.length - 1]!.headers.get("Idempotency-Key")).toBe(key2);

      const key3 = createIdempotencyKey("order");
      await client.createOrder(
        {
          pickupAddress: "A",
          dropoffAddress: "B",
        } as never,
        { idempotencyKey: key3 },
      );
      expect(capturedRequests[capturedRequests.length - 1]!.headers.get("Idempotency-Key")).toBe(key3);
    });

    it("2. cancelOrder / cancelTenantBooking accepts and forwards idempotencyKey", async () => {
      const key1 = createIdempotencyKey("cancel-order");
      await client.cancelOrder("ord-123", { reason: "User cancelled" }, { idempotencyKey: key1 });
      expect(capturedRequests[capturedRequests.length - 1]!.headers.get("Idempotency-Key")).toBe(key1);

      const key2 = createIdempotencyKey("cancel-tenant-booking");
      await client.cancelTenantBooking("bk-123", { reason: "User cancelled" }, { idempotencyKey: key2 });
      expect(capturedRequests[capturedRequests.length - 1]!.headers.get("Idempotency-Key")).toBe(key2);
    });

    it("3. updateOrder / updateTenantBooking accepts and forwards idempotencyKey", async () => {
      const key1 = createIdempotencyKey("update-order");
      await client.updateOrder("ord-123", { notes: "Updated note" }, { idempotencyKey: key1 });
      expect(capturedRequests[capturedRequests.length - 1]!.headers.get("Idempotency-Key")).toBe(key1);

      const key2 = createIdempotencyKey("update-tenant-booking");
      await client.updateTenantBooking("bk-123", { notes: "Updated note" }, { idempotencyKey: key2 });
      expect(capturedRequests[capturedRequests.length - 1]!.headers.get("Idempotency-Key")).toBe(key2);
    });

    it("4. applyManualFareOverride accepts and forwards idempotencyKey", async () => {
      const key = createIdempotencyKey("fare-override");
      await client.applyManualFareOverride(
        "ord-123",
        { amount: 500, reason: "Adjustment" } as never,
        { idempotencyKey: key },
      );
      expect(capturedRequests[capturedRequests.length - 1]!.headers.get("Idempotency-Key")).toBe(key);
    });

    it("5. dispatchOrder / redispatchOrder accepts and forwards idempotencyKey", async () => {
      const key1 = createIdempotencyKey("dispatch");
      await client.dispatchOrder("ord-123", { driverId: "drv-1" } as never, { idempotencyKey: key1 });
      expect(capturedRequests[capturedRequests.length - 1]!.headers.get("Idempotency-Key")).toBe(key1);

      const key2 = createIdempotencyKey("redispatch");
      await client.redispatchOrder("ord-123", { reason: "Driver delayed" } as never, { idempotencyKey: key2 });
      expect(capturedRequests[capturedRequests.length - 1]!.headers.get("Idempotency-Key")).toBe(key2);
    });

    it("6. createComplaint / assignComplaint / reopenComplaint / resolveComplaint accepts and forwards idempotencyKey", async () => {
      const key1 = createIdempotencyKey("complaint-create");
      await client.createComplaint(
        {
          caseSource: "web",
          category: "fare_dispute",
          severity: "normal",
          description: "Overcharge",
        } as never,
        { idempotencyKey: key1 },
      );
      expect(capturedRequests[capturedRequests.length - 1]!.headers.get("Idempotency-Key")).toBe(key1);

      const key2 = createIdempotencyKey("complaint-resolve");
      await client.resolveComplaint(
        "CASE-001",
        { resolutionCode: "resolved_refund", closingNote: "Refunded" } as never,
        { idempotencyKey: key2 },
      );
      expect(capturedRequests[capturedRequests.length - 1]!.headers.get("Idempotency-Key")).toBe(key2);
    });

    it("7. publishDriverFeePlan / generateDriverStatements / approveReimbursementBatch accepts and forwards idempotencyKey", async () => {
      const key1 = createIdempotencyKey("fee-plan");
      await client.publishDriverFeePlan({ planName: "Standard" } as never, { idempotencyKey: key1 });
      expect(capturedRequests[capturedRequests.length - 1]!.headers.get("Idempotency-Key")).toBe(key1);

      const key2 = createIdempotencyKey("statements");
      await client.generateDriverStatements({ month: "2026-08" } as never, { idempotencyKey: key2 });
      expect(capturedRequests[capturedRequests.length - 1]!.headers.get("Idempotency-Key")).toBe(key2);

      const key3 = createIdempotencyKey("reimburse-approve");
      await client.approveReimbursementBatch("batch-1", { statementId: "stmt-1" }, { idempotencyKey: key3 });
      expect(capturedRequests[capturedRequests.length - 1]!.headers.get("Idempotency-Key")).toBe(key3);
    });

    it("8. createReportJob / createTenantReportJob / generateFilingPackage accepts and forwards idempotencyKey", async () => {
      const key1 = createIdempotencyKey("report-job");
      await client.createReportJob(
        { jobType: "daily_dispatch_records", format: "csv" } as never,
        { idempotencyKey: key1 },
      );
      expect(capturedRequests[capturedRequests.length - 1]!.headers.get("Idempotency-Key")).toBe(key1);

      const key2 = createIdempotencyKey("tenant-report-job");
      await client.createTenantReportJob(
        { jobType: "tenant_usage_summary", format: "csv" } as never,
        { idempotencyKey: key2 },
      );
      expect(capturedRequests[capturedRequests.length - 1]!.headers.get("Idempotency-Key")).toBe(key2);

      const key3 = createIdempotencyKey("filing-pkg");
      await client.generateFilingPackage(
        { packageType: "monthly_operations" } as never,
        { idempotencyKey: key3 },
      );
      expect(capturedRequests[capturedRequests.length - 1]!.headers.get("Idempotency-Key")).toBe(key3);
    });

    it("9. sendTestWebhook / createWebhookEndpoint accepts and forwards idempotencyKey", async () => {
      const key1 = createIdempotencyKey("test-webhook");
      await client.sendTestWebhook(
        { endpointId: "ep-1", eventType: "order.created" } as never,
        { idempotencyKey: key1 },
      );
      expect(capturedRequests[capturedRequests.length - 1]!.headers.get("Idempotency-Key")).toBe(key1);

      const key2 = createIdempotencyKey("webhook-ep");
      await client.createWebhookEndpoint(
        { url: "https://hook.example/drts", eventTypes: ["order.created"] } as never,
        { idempotencyKey: key2 },
      );
      expect(capturedRequests[capturedRequests.length - 1]!.headers.get("Idempotency-Key")).toBe(key2);
    });

    it("omits Idempotency-Key when options is not provided (Acceptance Criteria 4)", async () => {
      await client.createOrder({ pickupAddress: "A", dropoffAddress: "B" } as never);
      expect(capturedRequests[capturedRequests.length - 1]!.headers.has("Idempotency-Key")).toBe(false);

      await client.createComplaint({ caseSource: "web", category: "other", description: "test" } as never);
      expect(capturedRequests[capturedRequests.length - 1]!.headers.has("Idempotency-Key")).toBe(false);

      await client.createReportJob({ jobType: "test", format: "csv" } as never);
      expect(capturedRequests[capturedRequests.length - 1]!.headers.has("Idempotency-Key")).toBe(false);
    });
  });

  describe("Reporting & filing package state-bound idempotency lifecycle", () => {
    let client: ApiClient;

    beforeEach(() => {
      client = new ApiClient({ baseUrl: "https://api.drts.example" });
    });

    it("maintains the same key across retries on failure for createReportJob, and resets on success", async () => {
      let callCount = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = typeof input === "string" ? input : input.toString();
          const headers = new Headers(init?.headers);
          capturedRequests.push({ url, method: init?.method, headers });

          callCount++;
          if (callCount <= 2) {
            return new Response(JSON.stringify({ error: "Temporary error" }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
          }
          return new Response(
            JSON.stringify({ data: { jobId: "job-123", status: "queued" } }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }),
      );

      let intentKey = createIdempotencyKey("ops-report-job");
      const initialKey = intentKey;

      // Attempt 1 (fails)
      await expect(
        client.createReportJob(
          { jobType: "daily_dispatch_records", format: "csv" } as never,
          { idempotencyKey: intentKey },
        ),
      ).rejects.toThrow();

      // Attempt 2 (retry on error - must reuse initialKey)
      await expect(
        client.createReportJob(
          { jobType: "daily_dispatch_records", format: "csv" } as never,
          { idempotencyKey: intentKey },
        ),
      ).rejects.toThrow();

      // Attempt 3 (success - same key)
      const res = await client.createReportJob(
        { jobType: "daily_dispatch_records", format: "csv" } as never,
        { idempotencyKey: intentKey },
      );
      expect(res).toBeDefined();

      // Upon success, key is regenerated
      intentKey = createIdempotencyKey("ops-report-job");
      expect(intentKey).not.toBe(initialKey);

      // Verify all 3 attempts sent the identical key
      expect(capturedRequests).toHaveLength(3);
      expect(capturedRequests[0]!.headers.get("Idempotency-Key")).toBe(initialKey);
      expect(capturedRequests[1]!.headers.get("Idempotency-Key")).toBe(initialKey);
      expect(capturedRequests[2]!.headers.get("Idempotency-Key")).toBe(initialKey);
    });

    it("maintains the same key across retries on failure for generateFilingPackage, preventing duplicate immutable manifests", async () => {
      let callCount = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = typeof input === "string" ? input : input.toString();
          const headers = new Headers(init?.headers);
          capturedRequests.push({ url, method: init?.method, headers });

          callCount++;
          if (callCount === 1) {
            return new Response(JSON.stringify({ error: "Network timeout" }), {
              status: 504,
              headers: { "Content-Type": "application/json" },
            });
          }
          return new Response(
            JSON.stringify({ data: { packageId: "pkg-456", status: "queued" } }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }),
      );

      const intentKey = createIdempotencyKey("ops-filing-package");

      // Attempt 1 (fails)
      await expect(
        client.generateFilingPackage(
          { packageType: "monthly_report" } as never,
          { idempotencyKey: intentKey },
        ),
      ).rejects.toThrow();

      // Attempt 2 (success retry)
      const pkg = await client.generateFilingPackage(
        { packageType: "monthly_report" } as never,
        { idempotencyKey: intentKey },
      );
      expect(pkg).toBeDefined();

      expect(capturedRequests).toHaveLength(2);
      expect(capturedRequests[0]!.headers.get("Idempotency-Key")).toBe(intentKey);
      expect(capturedRequests[1]!.headers.get("Idempotency-Key")).toBe(intentKey);
    });

    it("maintains the same key across retries on failure for createTenantReportJob / handleRerun", async () => {
      let callCount = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = typeof input === "string" ? input : input.toString();
          const headers = new Headers(init?.headers);
          capturedRequests.push({ url, method: init?.method, headers });

          callCount++;
          if (callCount === 1) {
            return new Response(JSON.stringify({ error: "Rate limit" }), {
              status: 429,
              headers: { "Content-Type": "application/json" },
            });
          }
          return new Response(
            JSON.stringify({ data: { jobId: "tenant-job-789", status: "queued" } }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }),
      );

      const rerunKey = createIdempotencyKey("tenant-report-rerun");

      // Attempt 1 fails
      await expect(
        client.createTenantReportJob(
          { jobType: "monthly_trip_report", format: "xlsx" } as never,
          { idempotencyKey: rerunKey },
        ),
      ).rejects.toThrow();

      // Attempt 2 succeeds
      const result = await client.createTenantReportJob(
        { jobType: "monthly_trip_report", format: "xlsx" } as never,
        { idempotencyKey: rerunKey },
      );
      expect(result).toBeDefined();

      expect(capturedRequests).toHaveLength(2);
      expect(capturedRequests[0]!.headers.get("Idempotency-Key")).toBe(rerunKey);
      expect(capturedRequests[1]!.headers.get("Idempotency-Key")).toBe(rerunKey);
    });
  });
});
