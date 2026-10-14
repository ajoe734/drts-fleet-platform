import "../../../apps/api/node_modules/reflect-metadata";
import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import { DatabaseService } from "../../../apps/api/src/common/db/database.service";
import { PassengerBookingService } from "../../../apps/api/src/modules/passenger-app/booking/passenger-booking.service";
import { PassengerBookingRepository } from "../../../apps/api/src/modules/passenger-app/booking/passenger-booking.repository";
import { PassengerPushDevicesService } from "../../../apps/api/src/modules/passenger-push-devices/passenger-push-devices.service";
import { PassengerPushDevicesRepository } from "../../../apps/api/src/modules/passenger-push-devices/passenger-push-devices.repository";

const { Pool } = createRequire(
  new URL("../../../apps/api/package.json", import.meta.url),
)("pg") as typeof import("pg");
afterEach(() => vi.unstubAllEnvs());

describe("Production booking and resolver with a real bounded pg Pool", () => {
  it.each([1, 6])(
    "settles %i simultaneous no-device bookings without reserving nested leases",
    async (capacity) => {
      const statements: Array<{ client: SocketFreeClient; sql: string }> = [];
      const methodId = "00000000-0000-4000-8000-000000000003";
      // Only the socket/query-result boundary is synthetic. Pool acquisition,
      // queueing, resolver, booking transaction and release are production code.
      class SocketFreeClient extends EventEmitter {
        _queryable = true;
        _ending = false;
        connect(callback: (error: Error | null) => void) {
          queueMicrotask(() => callback(null));
        }
        end(callback?: () => void) {
          this._ending = true;
          this.emit("end");
          if (callback) queueMicrotask(callback);
        }
        ref() {}
        unref() {}
        query(
          sql: string,
          values?: unknown[] | ((error: null, result: unknown) => void),
          callback?: (error: null, result: unknown) => void,
        ) {
          if (typeof values === "function") callback = values;
          statements.push({ client: this, sql });
          let rows: unknown[] = [];
          if (sql.includes("SELECT status FROM passenger.accounts"))
            rows = [{ status: "active" }];
          if (sql.includes("SELECT payment_method_id FROM passenger.psp_tokens"))
            rows = [{ payment_method_id: methodId }];
          const result = { rows, rowCount: rows.length };
          if (callback) {
            const done = callback;
            queueMicrotask(() => done(null, result));
            return;
          }
          return Promise.resolve(result);
        }
      }
      const pool = new Pool({
        max: capacity,
        idleTimeoutMillis: 0,
        // Ensures failed old-source runs settle too; no leaked promises/leases.
        connectionTimeoutMillis: 2000,
        Client: SocketFreeClient,
      } as ConstructorParameters<typeof Pool>[0]);
      vi.stubEnv("DATABASE_URL", undefined);
      vi.stubEnv("REQUIRE_SMS_VERIFICATION", "false");
      const db = new DatabaseService();
      Object.defineProperty(db, "pool", { value: pool });
      const repository = new PassengerBookingRepository(db);
      const devices = new PassengerPushDevicesService(
        new PassengerPushDevicesRepository(db),
      );
      const command = {
        scheduledAt: new Date(Date.now() + 3600000).toISOString(),
        origin: { lat: 25, lng: 121 },
        destination: { lat: 25.1, lng: 121.1 },
        fareSnapshotId: "00000000-0000-4000-8000-000000000001",
        paymentMethodId: methodId,
        passengerConfirmedAt: new Date(Date.now() - 1000).toISOString(),
      };
      let published = 0;
      const multi = {
        async createTrustedPassengerRide(
          _command: unknown,
          owner: string,
          _requestId: string | undefined,
          persist: (
            orderId: string,
            persistRide: (client: PoolClient) => Promise<void>,
          ) => Promise<void>,
        ) {
          const orderId = `00000000-0000-4000-8000-${owner.split("_").at(-1)!.padStart(12, "0")}`;
          await persist(orderId, async (client) => {
            await client.query(
              "INSERT INTO ops.phase1_owned_orders (order_id) VALUES ($1)",
              [orderId],
            );
          });
          return { ride: { orderId } };
        },
        async getPassengerRideById(orderId: string) {
          published += 1;
          expect(statements.filter(({ sql }) => sql === "COMMIT").length)
            .toBeGreaterThanOrEqual(published);
          return { order: { orderId } };
        },
      };
      const fares = {
        async findOwnedSnapshot() {
          return {
            ...command,
            expiresAt: new Date(Date.now() + 900000).toISOString(),
          };
        },
      };
      const accounts = {
        async transaction(work: (tx: unknown) => unknown) {
          return work({
            async lockAccount() {
              return { displayName: "fixture", contactPhone: "0900000000" };
            },
          });
        },
      };
      const service = new PassengerBookingService(
        repository,
        multi as never,
        fares as never,
        accounts as never,
        undefined,
        devices,
      );
      const bookings = Array.from({ length: capacity }, (_, index) =>
        service.createRide(`drts_passenger_pool_${index + 1}`, command),
      );
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const outcome = await Promise.race([
          Promise.all(bookings).then(() => "completed"),
          new Promise<string>((resolve) => {
            timer = setTimeout(() => resolve("timed_out"), 1000);
          }),
        ]);
        // On 02f3a949 this snapshot is timed_out/idle0/waiting=capacity,
        // with zero history/COMMIT/publications, even though BEGIN succeeded.
        expect({ outcome, waiting: pool.waitingCount, published }).toEqual({
          outcome: "completed",
          waiting: 0,
          published: capacity,
        });
        expect(pool.totalCount).toBeLessThanOrEqual(capacity);
        expect(pool.idleCount).toBe(pool.totalCount);
        const sql = statements.map((entry) => entry.sql);
        expect(sql.filter((s) => s.includes("FROM iam.phase1_passenger_push_devices")))
          .toHaveLength(capacity);
        expect(sql.filter((s) => s === "BEGIN")).toHaveLength(capacity);
        expect(sql.filter((s) => s === "COMMIT")).toHaveLength(capacity);
        expect(sql.filter((s) => s.includes("INSERT INTO passenger.booking_histories")))
          .toHaveLength(capacity);
        expect(sql.some((s) => s.includes("phase1_order_first_party_notification_routes")))
          .toBe(false);
        expect(sql).not.toContain("ROLLBACK");
        // Both durable writes belong to their outer booking transaction.
        for (const client of new Set(statements.map((entry) => entry.client))) {
          const ownSql = statements.filter((entry) => entry.client === client)
            .map((entry) => entry.sql);
          expect(ownSql.filter((s) => s.includes("INSERT INTO ops.phase1_owned_orders")))
            .toHaveLength(ownSql.filter((s) => s === "COMMIT").length);
          expect(ownSql.filter((s) => s.includes("INSERT INTO passenger.booking_histories")))
            .toHaveLength(ownSql.filter((s) => s === "COMMIT").length);
        }
      } finally {
        clearTimeout(timer);
        await Promise.allSettled(bookings);
        await pool.end();
      }
    },
  );
});
