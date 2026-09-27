import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import type { PassengerDispatchDisclosureSnapshot } from "@drts/contracts";
import { DatabaseService } from "../../src/common/db";
import {
  OwnedMobilityRepository,
  type OwnedMobilityQueryExecutor,
} from "../../src/modules/owned-mobility/owned-mobility.repository";

const DATABASE_URL = process.env.DATABASE_URL;

class FailAfterSnapshotRepository extends OwnedMobilityRepository {
  async persistChangesWithExecutor(
    executor: OwnedMobilityQueryExecutor,
    changes: any,
  ) {
    await super.persistChangesWithExecutor(executor, changes);
    if (changes.passengerDisclosureSnapshots?.length) {
      throw new Error("PG_GATE_INJECTED_AFTER_SNAPSHOT");
    }
  }
}

describe("SR-PARTNER-NOTIFY-FIX-SNAPSHOT-20260927: disclosure snapshot SQL type conflict", () => {
  it("requires a migrated real PostgreSQL", async () => {
    expect(DATABASE_URL).toBeTruthy();
    if (!DATABASE_URL) return;
    const database = new DatabaseService();
    const result = await database.query<{ server_version: string }>(
      "SELECT current_setting('server_version') AS server_version"
    );
    expect(result.rows[0]?.server_version).toMatch(/^16\./);
    await database.onModuleDestroy();
  });

  it("handles initial snapshot, v2 supersedes v1, replay no extra sequence, and full rollback on failure", async () => {
    if (!DATABASE_URL) return;
    const database = new DatabaseService();
    const repository = new OwnedMobilityRepository(database);
    
    const tenantId = randomUUID();
    const orderId = randomUUID();
    const dispatchJobId = randomUUID();
    const assignmentId1 = randomUUID();
    const assignmentId2 = randomUUID();

    try {
      // Setup prerequisites
      await database.query(
        `INSERT INTO core.tenants (tenant_id, tenant_code, tenant_name, tenant_type, status, settings)
         VALUES ($1::uuid, $2, $3, 'enterprise', 'active', '{}'::jsonb)`,
        [tenantId, `pg-${tenantId}`, "Stage1 PG Gate Snapshot Test"],
      );
      
      const now = new Date().toISOString();
      const order = {
        orderId, orderNo: `PG-${orderId}`, orderSource: "api", orderDomain: "owned",
        tenantId, status: "assigned", serviceBucket: "business_dispatch", dispatchSemantics: "reservation",
        businessDispatchSubtype: "enterprise_dispatch", runtimeProfileCode: "multi_taxi_direct",
        pickup: { address: "A" }, dropoff: { address: "B" }, passenger: { passengerId: "P1", name: "PG Gate", phone: "0912000000" },
        createdAt: now, updatedAt: now
      };
      
      await repository.persistChanges({
        orders: [order as any],
        dispatchJobs: [
          { dispatchJobId, orderId, status: "assigned", mode: "auto", latestEtaMinutes: 5, createdAt: now, updatedAt: now } as any
        ]
      });

      const snapshot1: PassengerDispatchDisclosureSnapshot = {
        snapshotId: randomUUID(),
        orderId,
        dispatchJobId,
        assignmentId: assignmentId1,
        assignmentVersion: 1,
        vehicle: { licensePlate: "ABC-123", make: "Toyota", model: "Camry", color: "Silver", version: 1, status: "complete", missingFieldCodes: [] },
        driver: { name: "Driver 1", phone: "0912123123", rating: "4.9", driverId: "d1", maskedDisplay: "d1", status: "verified_active", version: 1 },
        createdAt: new Date().toISOString(),
        supersededAt: null,
      } as any;

      // 1. Initial snapshot
      await repository.persistChanges({ passengerDisclosureSnapshots: [snapshot1] });

      const res1 = await database.query<{ assignment_version: number, superseded_at: Date | null }>("SELECT * FROM ops.passenger_dispatch_disclosure_snapshots WHERE order_id = $1", [orderId]);
      expect(res1.rows).toHaveLength(1);
      expect(res1.rows[0].assignment_version).toBe(1);
      expect(res1.rows[0].superseded_at).toBeNull();

      // 2. v2 supersedes v1
      const snapshot2: PassengerDispatchDisclosureSnapshot = {
        snapshotId: randomUUID(),
        orderId,
        dispatchJobId,
        assignmentId: assignmentId2,
        assignmentVersion: 2,
        vehicle: { licensePlate: "XYZ-789", make: "Honda", model: "Civic", color: "Black", version: 1, status: "complete", missingFieldCodes: [] },
        driver: { name: "Driver 2", phone: "0999888777", rating: "4.8", driverId: "d2", maskedDisplay: "d2", status: "verified_active", version: 1 },
        createdAt: new Date().toISOString(),
        supersededAt: null
      } as any;

      await repository.persistChanges({ passengerDisclosureSnapshots: [snapshot2] });

      const res2 = await database.query<{ assignment_version: number, superseded_at: Date | null, record: any }>("SELECT * FROM ops.passenger_dispatch_disclosure_snapshots WHERE order_id = $1 ORDER BY assignment_version ASC", [orderId]);
      expect(res2.rows).toHaveLength(2);
      expect(res2.rows[0].assignment_version).toBe(1);
      expect(res2.rows[0].superseded_at).not.toBeNull();
      expect(res2.rows[0].record.supersededAt).toBe(new Date(res2.rows[0].superseded_at!).toISOString());
      
      expect(res2.rows[1].assignment_version).toBe(2);
      expect(res2.rows[1].superseded_at).toBeNull();

      // 3. Replay no extra sequence (DO NOTHING ON CONFLICT)
      await repository.persistChanges({ passengerDisclosureSnapshots: [snapshot2] });
      const res3 = await database.query("SELECT * FROM ops.passenger_dispatch_disclosure_snapshots WHERE order_id = $1", [orderId]);
      expect(res3.rows).toHaveLength(2);

      // 4. Injected failure full rollback
      const snapshot3: PassengerDispatchDisclosureSnapshot = {
        snapshotId: randomUUID(),
        orderId,
        dispatchJobId,
        assignmentId: randomUUID(),
        assignmentVersion: 3,
        vehicle: { licensePlate: "YYY-123", make: "Nissan", model: "Sentra", color: "White", version: 1, status: "complete", missingFieldCodes: [] },
        driver: { name: "Driver 3", phone: "0988777666", rating: "4.7", driverId: "d3", maskedDisplay: "d3", status: "verified_active", version: 1 },
        createdAt: new Date().toISOString(),
        supersededAt: null
      } as any;

      const failRepository = new FailAfterSnapshotRepository(database);
      
      let errorThrown = false;
      try {
        await failRepository.withTransaction((executor) => 
          failRepository.persistChangesWithExecutor(executor, { passengerDisclosureSnapshots: [snapshot3] })
        );
      } catch (e: any) {
        if (e.message === "PG_GATE_INJECTED_AFTER_SNAPSHOT") {
          errorThrown = true;
        }
      }
      expect(errorThrown).toBe(true);

      const res4 = await database.query<{ assignment_version: number, superseded_at: Date | null }>("SELECT * FROM ops.passenger_dispatch_disclosure_snapshots WHERE order_id = $1 ORDER BY assignment_version ASC", [orderId]);
      expect(res4.rows).toHaveLength(2);
      expect(res4.rows[0].assignment_version).toBe(1);
      expect(res4.rows[0].superseded_at).not.toBeNull();
      expect(res4.rows[1].assignment_version).toBe(2);
      expect(res4.rows[1].superseded_at).toBeNull();

    } finally {
      await database.query("DELETE FROM ops.passenger_dispatch_disclosure_snapshots WHERE order_id = $1", [orderId]);
      await database.query("DELETE FROM ops.phase1_dispatch_jobs WHERE order_id = $1", [orderId]);
      await database.query("DELETE FROM ops.phase1_owned_orders WHERE order_id = $1", [orderId]);
      await database.query("DELETE FROM core.tenants WHERE tenant_id = $1::uuid", [tenantId]);
      await database.onModuleDestroy();
    }
  });
});
