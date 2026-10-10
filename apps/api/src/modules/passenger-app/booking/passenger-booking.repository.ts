import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../../../common/db/database.service";

@Injectable()
export class PassengerBookingRepository {
  constructor(private readonly db: DatabaseService) {}

  async createBookingHistory(
    passengerId: string,
    orderId: string,
    fareSnapshotId: string,
    passengerConfirmedAt: string,
  ) {
    await this.db.query(
      `
      INSERT INTO passenger.booking_histories
        (drts_passenger_id, order_id, fare_snapshot_id, passenger_confirmed_at)
      VALUES
        ($1, $2, $3, $4)
      `,
      [passengerId, orderId, fareSnapshotId, passengerConfirmedAt],
    );
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

  async rollbackFailedOrder(orderId: string) {
    await this.db.query(
      `
      UPDATE ops.phase1_owned_orders
      SET status = 'cancelled', cancel_reason = 'passenger_booking_history_failed', cancelled_at = now(), updated_at = now()
      WHERE order_id = $1 AND status IN ('created', 'ready_for_dispatch')
      `,
      [orderId],
    );
  }
}
