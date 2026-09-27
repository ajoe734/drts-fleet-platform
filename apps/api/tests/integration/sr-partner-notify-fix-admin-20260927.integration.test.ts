import { expect, test, vi } from "vitest";
import { MultiTaxiRepository } from "../../src/modules/multi-taxi/multi-taxi.repository";

test("multi-taxi.repository listPartnerNotificationDeliveries converts Dates to ISO strings", async () => {
  const mockDatabaseService = {
    query: vi.fn(),
  };

  const repository = new MultiTaxiRepository(mockDatabaseService as any);
  
  // First query is count, second is the data
  mockDatabaseService.query
    .mockResolvedValueOnce({ rows: [{ cnt: "1" }] })
    .mockResolvedValueOnce({
      rows: [
        {
          outboxId: "test-outbox",
          orderId: "test-order",
          createdAt: new Date("2026-09-27T10:00:00Z"),
          deliveredAt: new Date("2026-09-27T10:05:00Z"),
          expiresAt: new Date("2026-09-27T12:00:00Z"),
          nextAttemptAt: new Date("2026-09-27T10:10:00Z"),
          leaseExpiresAt: new Date("2026-09-27T10:15:00Z"),
        }
      ]
    });

  const result = await repository.listPartnerNotificationDeliveries(
    { entrySlug: "test", tenantId: "t-1", partnerId: "p-1" },
    {}
  );

  expect(result.total).toBe(1);
  const row = result.rows[0];
  
  expect(typeof row.createdAt).toBe("string");
  expect(row.createdAt).toBe("2026-09-27T10:00:00.000Z");
  
  expect(typeof row.deliveredAt).toBe("string");
  expect(row.deliveredAt).toBe("2026-09-27T10:05:00.000Z");
  
  expect(typeof row.expiresAt).toBe("string");
  expect(row.expiresAt).toBe("2026-09-27T12:00:00.000Z");
  
  expect(typeof row.nextAttemptAt).toBe("string");
  expect(row.nextAttemptAt).toBe("2026-09-27T10:10:00.000Z");
  
  expect(typeof row.leaseExpiresAt).toBe("string");
  expect(row.leaseExpiresAt).toBe("2026-09-27T10:15:00.000Z");
});

test("multi-taxi.repository listPartnerNotificationDeliveries handles null dates", async () => {
  const mockDatabaseService = {
    query: vi.fn(),
  };

  const repository = new MultiTaxiRepository(mockDatabaseService as any);
  
  mockDatabaseService.query
    .mockResolvedValueOnce({ rows: [{ cnt: "1" }] })
    .mockResolvedValueOnce({
      rows: [
        {
          outboxId: "test-outbox",
          orderId: "test-order",
          createdAt: new Date("2026-09-27T10:00:00Z"),
          deliveredAt: null,
          expiresAt: null,
          nextAttemptAt: null,
          leaseExpiresAt: null,
        }
      ]
    });

  const result = await repository.listPartnerNotificationDeliveries(
    { entrySlug: "test", tenantId: "t-1", partnerId: "p-1" },
    {}
  );

  const row = result.rows[0];
  
  expect(typeof row.createdAt).toBe("string");
  expect(row.deliveredAt).toBeNull();
  expect(row.expiresAt).toBeNull();
  expect(row.nextAttemptAt).toBeNull();
  expect(row.leaseExpiresAt).toBeNull();
});
