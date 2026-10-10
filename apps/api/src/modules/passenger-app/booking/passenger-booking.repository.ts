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
    offset: number,
  ): Promise<string[]> {
    const result = await this.db.query(
      `
      SELECT order_id
      FROM passenger.booking_histories
      WHERE drts_passenger_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
      `,
      [passengerId, limit, offset],
    );
    return result.rows.map((r) => r.order_id);
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
