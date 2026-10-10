import { Injectable, Logger } from "@nestjs/common";
import { DatabaseService } from "../../../common/db/database.service";
import type { PoolClient } from "pg";
import { ApiRequestError } from "../../../common/api-envelope";
import type { OwnedMobilityQueryExecutor } from "../../owned-mobility/owned-mobility.repository";

@Injectable()
export class PassengerBookingRepository {
  private readonly logger = new Logger(PassengerBookingRepository.name);
  constructor(private readonly db: DatabaseService) {}

  async createBookingHistory(
    passengerId: string,
    orderId: string,
    fareSnapshotId: string,
    passengerConfirmedAt: string,
    executor: OwnedMobilityQueryExecutor = this.db,
  ) {
    await executor.query(
      `
      INSERT INTO passenger.booking_histories
        (drts_passenger_id, order_id, fare_snapshot_id, passenger_confirmed_at)
      VALUES
        ($1, $2, $3, $4)
      `,
      [passengerId, orderId, fareSnapshotId, passengerConfirmedAt],
    );
  }

  async commitBooking(
    passengerId: string,
    orderId: string,
    fareSnapshotId: string,
    passengerConfirmedAt: string,
    persistRide: (executor: PoolClient) => Promise<void>,
  ): Promise<void> {
    const client = await this.db.connect();
    let committed = false;
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout = '3s'");
      await client.query("SET LOCAL statement_timeout = '8s'");
      await persistRide(client);
      try {
        await this.createBookingHistory(
          passengerId,
          orderId,
          fareSnapshotId,
          passengerConfirmedAt,
          client,
        );
      } catch {
        throw new ApiRequestError(
          500,
          "PASSENGER_BOOKING_HISTORY_FAILED",
          "Failed to save booking history.",
        );
      }
      await client.query("COMMIT");
      committed = true;
    } finally {
      // Evict any uncommitted connection, even if ROLLBACK fails. A lost
      // COMMIT reply can leave a full booking, never an unowned order.
      if (!committed) {
        try {
          await client.query("ROLLBACK");
        } catch {
          this.logger.warn(
            "Booking rollback failed; discarding the transaction connection.",
          );
        } finally {
          client.release(true);
        }
      } else {
        client.release();
      }
    }
  }

  async listBookingHistories(
    passengerId: string,
    limit: number,
    cursorCreatedAt?: string,
    cursorOrderId?: string,
  ): Promise<{ orderId: string; createdAt: string }[]> {
    let query = `
      SELECT order_id, created_at::text as created_at_str
      FROM passenger.booking_histories
      WHERE drts_passenger_id = $1
    `;
    const params: any[] = [passengerId, limit];

    if (cursorCreatedAt && cursorOrderId) {
      query += ` AND (created_at < $3::timestamptz OR (created_at = $3::timestamptz AND order_id < $4)) `;
      params.push(cursorCreatedAt, cursorOrderId);
    }

    query += `
      ORDER BY created_at DESC, order_id DESC
      LIMIT $2
    `;

    const result = await this.db.query(query, params);
    return result.rows.map((r) => ({
      orderId: r.order_id,
      createdAt: r.created_at_str,
    }));
  }

  async getBookingHistoryOwner(orderId: string): Promise<string | null> {
    const result = await this.db.query(
      `
      SELECT drts_passenger_id
      FROM passenger.booking_histories
      WHERE order_id = $1
      `,
      [orderId],
    );
    return result.rows[0]?.drts_passenger_id ?? null;
  }
}
