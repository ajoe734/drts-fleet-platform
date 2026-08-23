import { HttpStatus } from "@nestjs/common";

import { PLATFORM_CURRENCY, normalisePlatformCurrency } from "@drts/contracts";

import { ApiRequestError } from "./api-envelope";

export interface MoneyLike {
  currency: string;
  amountMinor: number;
}

/**
 * Adds money, and refuses to add money that is not the same money.
 *
 * There were two implementations of this, and both discarded the answer to the
 * only question that makes the addition valid. `billing-settlement` stamped its
 * module's default currency on the result; `fleet-partner` took the currency of
 * whichever element happened to be last, so summing 100 TWD and 50 USD returned
 * 150 USD -- a number that is wrong and a label that is worse, because it looks
 * deliberate.
 *
 * Neither could misbehave while the platform priced in one currency. Both were
 * one feature away from being able to.
 *
 * Legacy `NTD` and current `TWD` are the same currency and are accepted
 * together; see `V0084`.
 */
export function sumMoney(
  amounts: ReadonlyArray<MoneyLike>,
  fallbackCurrency: string = PLATFORM_CURRENCY,
): MoneyLike {
  const currencies = new Set(
    amounts.map((amount) => normalisePlatformCurrency(amount.currency)),
  );

  if (currencies.size > 1) {
    throw new ApiRequestError(
      HttpStatus.INTERNAL_SERVER_ERROR,
      "MONEY_CURRENCY_MISMATCH",
      "Refusing to add amounts in different currencies.",
      { currencies: [...currencies].sort() },
    );
  }

  return {
    currency: [...currencies][0] ?? normalisePlatformCurrency(fallbackCurrency),
    amountMinor: amounts.reduce(
      (total, amount) => total + amount.amountMinor,
      0,
    ),
  };
}
