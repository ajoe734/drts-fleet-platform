import type { MoneyAmount } from "@drts/contracts";

export function formatMoney(amount: MoneyAmount | null | undefined): string {
  if (!amount) return "Amount pending";
  return `${amount.currency} ${(amount.amountMinor / 100).toFixed(2)}`;
}
