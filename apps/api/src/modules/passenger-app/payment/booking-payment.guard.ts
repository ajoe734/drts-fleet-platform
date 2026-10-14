import type { PoolClient } from "pg";
import { ApiRequestError } from "../../../common/api-envelope";
import { requireActivePaymentMethod } from "./payment-method.repository";
import { assertNoUnpaidPassengerRides } from "./unpaid-payment.guard";

export function bookingPaymentMethodId(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new ApiRequestError(
      400,
      "invalid_method",
      "An owned active payment method is required.",
    );
  return value.toLowerCase();
}

/** These reads and locks must precede order/token/history writes on their client.
 * The earlier account/quote reads in the service are not a commit-time fence.
 */
export async function assertPassengerCanBook(
  client: Pick<PoolClient, "query">,
  passengerId: string,
  paymentMethodId: string,
): Promise<void> {
  const id = bookingPaymentMethodId(paymentMethodId);
  const account = await client.query(
    "SELECT status FROM passenger.accounts WHERE drts_passenger_id=$1 FOR UPDATE",
    [passengerId],
  );
  if (account.rows[0]?.status !== "active")
    throw new ApiRequestError(
      401,
      "PASSENGER_ACCOUNT_NOT_FOUND",
      "An active passenger account is required.",
    );
  await assertNoUnpaidPassengerRides(client, passengerId, "booking");
  await requireActivePaymentMethod(client, passengerId, id, false, true);
}
