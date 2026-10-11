import type { PoolClient } from "pg";
import { ApiRequestError } from "../../../common/api-envelope";

/** Caller holds the account row lock in the SAME transaction as deletion or
 * booking. Completion persistence and payment writers must also serialize on
 * that row; SQL-only reads outside the commit boundary are not a race fence.
 */
export async function assertNoUnpaidPassengerRides(
  client: Pick<PoolClient, "query">,
  passengerId: string,
  purpose: "booking" | "deletion",
): Promise<void> {
  const result = await client.query(
    `SELECT 1 FROM passenger.booking_histories h
     LEFT JOIN ops.phase1_owned_orders o ON o.order_id=h.order_id::text
     LEFT JOIN billing.multi_taxi_passenger_payments p ON p.order_id=h.order_id::text
     WHERE h.drts_passenger_id=$1 AND (o.order_id IS NULL OR
       (o.status<>'cancelled' AND (p.status IS NULL OR p.status NOT IN ('captured','refunded'))
         AND ($2='deletion' OR o.status='completed' OR p.status IN ('failed','manual_recovery'))))
     LIMIT 1`,
    [passengerId, purpose],
  );
  if (result.rows.length)
    throw new ApiRequestError(
      409,
      "pending_payment_block",
      "A ride has an unsettled payment.",
    );
}
