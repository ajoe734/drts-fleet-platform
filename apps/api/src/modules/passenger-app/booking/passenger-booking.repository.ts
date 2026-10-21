import { Injectable, Logger } from "@nestjs/common";
import { DatabaseService } from "../../../common/db/database.service";
import type { PoolClient } from "pg";
import { ApiRequestError } from "../../../common/api-envelope";
import type { OwnedMobilityQueryExecutor } from "../../owned-mobility/owned-mobility.repository";
import { assertPassengerCanBook } from "../payment/booking-payment.guard";

export interface BookingCommandReceipt {
  key: string;
  payloadHash: string;
}
export class PassengerBookingReplay extends Error {
  constructor(public readonly orderId: string) {
    super("The original booking command has already committed.");
  }
}
type BookingReceiptRow = {
  actor_id: string | null;
  payload_hash: string;
  status: string;
  response_body: { orderId?: unknown } | null;
};

function bookingScope(passengerId: string) {
  return `passenger.create-ride:${passengerId}`;
}

function completedOrder(
  row: BookingReceiptRow,
  passengerId: string,
  command: BookingCommandReceipt,
) {
  if (row.actor_id !== passengerId || row.payload_hash !== command.payloadHash)
    throw new ApiRequestError(
      409,
      "IDEMPOTENCY_KEY_REUSED",
      "The booking request key was already used for a different command.",
    );
  if (row.status !== "completed")
    throw new ApiRequestError(
      409,
      "IDEMPOTENCY_IN_PROGRESS",
      "The original booking command is still being processed.",
      undefined,
      true,
    );
  const orderId = row.response_body?.orderId;
  if (typeof orderId !== "string" || !/^[0-9a-f-]{36}$/.test(orderId))
    throw new ApiRequestError(
      503,
      "PASSENGER_BOOKING_REPLAY_UNAVAILABLE",
      "The original booking result is unavailable.",
    );
  return orderId;
}

@Injectable()
export class PassengerBookingRepository {
  private readonly logger = new Logger(PassengerBookingRepository.name);
  constructor(private readonly db: DatabaseService) {}

  async findCompletedBooking(
    passengerId: string,
    command: BookingCommandReceipt,
  ) {
    if (command.key.length > 255)
      throw new ApiRequestError(
        400,
        "IDEMPOTENCY_KEY_TOO_LONG",
        "The booking request key exceeds 255 characters.",
      );
    const result = await this.db.query<BookingReceiptRow>(
      `SELECT actor_id,payload_hash,status,response_body FROM ops.idempotency_records
       WHERE scope=$1 AND idempotency_key=$2`,
      [bookingScope(passengerId), command.key],
    );
    return result.rows[0]
      ? completedOrder(result.rows[0], passengerId, command)
      : null;
  }

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
    paymentMethodId: string,
    persistRide: (executor: PoolClient) => Promise<void>,
    command?: BookingCommandReceipt,
  ): Promise<void> {
    const client = await this.db.connect();
    let committed = false;
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout = '3s'");
      await client.query("SET LOCAL statement_timeout = '8s'");
      if (command) {
        const scope = bookingScope(passengerId);
        // The unique receipt is claimed and completed inside the existing
        // order/history/access transaction, including an unknown COMMIT reply.
        const claimed = await client.query(
          `INSERT INTO ops.idempotency_records
             (scope,idempotency_key,actor_id,payload_hash,status,request_path)
           VALUES ($1,$2,$3,$4,'processing','/api/passenger-app/rides')
           ON CONFLICT (scope,idempotency_key) DO NOTHING`,
          [scope, command.key, passengerId, command.payloadHash],
        );
        const receipt = await client.query<BookingReceiptRow>(
          `SELECT actor_id,payload_hash,status,response_body FROM ops.idempotency_records
           WHERE scope=$1 AND idempotency_key=$2 FOR UPDATE`,
          [scope, command.key],
        );
        const row = receipt.rows[0];
        if (!row)
          throw new ApiRequestError(
            503,
            "PASSENGER_BOOKING_REPLAY_UNAVAILABLE",
            "The booking command could not be claimed.",
          );
        if (
          row.actor_id !== passengerId ||
          row.payload_hash !== command.payloadHash
        )
          completedOrder(row, passengerId, command);
        if (row.status === "completed") {
          const originalOrderId = completedOrder(row, passengerId, command);
          await client.query("COMMIT");
          committed = true;
          // Abort the caller's newly prepared order before it enters mobility
          // memory or publishes events. The service reads the owned original.
          throw new PassengerBookingReplay(originalOrderId);
        }
        if (claimed.rowCount !== 1)
          throw new ApiRequestError(
            409,
            "IDEMPOTENCY_IN_PROGRESS",
            "The original booking command is still being processed.",
            undefined,
            true,
          );
      }
      await assertPassengerCanBook(client, passengerId, paymentMethodId);
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
      if (command)
        await client.query(
          `UPDATE ops.idempotency_records SET status='completed',status_code=201,
             response_body=$3::jsonb,updated_at=now()
           WHERE scope=$1 AND idempotency_key=$2`,
          [bookingScope(passengerId), command.key, JSON.stringify({ orderId })],
        );
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
