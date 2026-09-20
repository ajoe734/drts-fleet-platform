import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { DatabaseService } from "../../apps/api/src/common/db";
import { PartnerNotificationNavigationRepository } from "../../apps/api/src/modules/tenant-partner/partner-notification-navigation.repository";

describe("SR-PARTNER-NOTIFY-NAV-20260917 Integration", () => {
  let db: DatabaseService;
  let navRepo: PartnerNotificationNavigationRepository;

  beforeAll(async () => {
    db = new DatabaseService();
    navRepo = new PartnerNotificationNavigationRepository(db);
  });

  afterAll(async () => {
    await db.onModuleDestroy();
  });

  it("should successfully resolve a multi-taxi order route (null tenantId)", async () => {
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const orderId = "test-order-multi";
      const entrySlug = "test-entry-multi";
      const passengerId = "test-pass";
      const rideRef = "ride-ref-multi";
      const userRef = "user-multi";
      const partnerId = "p-1";

      await client.query(
        `INSERT INTO ops.phase1_owned_orders (order_id, order_no, record)
         VALUES ($1, 'MULTI123', $2::jsonb)`,
        [
          orderId,
          JSON.stringify({
            tenantId: null,
            partnerEntrySlug: entrySlug,
            status: "driver_assigned",
            passenger: { passengerId }
          })
        ]
      );

      await client.query(
        `INSERT INTO mobility.phase1_order_partner_notification_routes
         (order_id, tenant_id, partner_id, entry_slug, partner_user_ref, drts_passenger_id, ride_ref)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [orderId, "t-1", partnerId, entrySlug, userRef, passengerId, rideRef]
      );

      const result = await navRepo.resolveRoute(entrySlug, rideRef, userRef);
      expect(result).not.toBeNull();
      expect(result?.orderId).toBe(orderId);
      expect(result?.tenantId).toBe("t-1");
      expect(result?.status).toBe("driver_assigned");
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  it("should reject resolving route when ownership mismatches (cross subject)", async () => {
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const orderId = "test-order-cross";
      const entrySlug = "test-entry-cross";
      const passengerId = "test-pass-cross";
      const rideRef = "ride-ref-cross";
      const userRef = "user-cross";
      const partnerId = "p-2";

      await client.query(
        `INSERT INTO ops.phase1_owned_orders (order_id, order_no, record)
         VALUES ($1, 'CROSS123', $2::jsonb)`,
        [
          orderId,
          JSON.stringify({
            tenantId: "t-2",
            partnerEntrySlug: entrySlug,
            status: "completed",
            passenger: { passengerId }
          })
        ]
      );

      await client.query(
        `INSERT INTO mobility.phase1_order_partner_notification_routes
         (order_id, tenant_id, partner_id, entry_slug, partner_user_ref, drts_passenger_id, ride_ref)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [orderId, "t-2", partnerId, entrySlug, userRef, "different-pass", rideRef]
      );

      // drts_passenger_id in route (different-pass) != passengerId in order (test-pass-cross)
      const result = await navRepo.resolveRoute(entrySlug, rideRef, userRef);
      expect(result).toBeNull();
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
});
