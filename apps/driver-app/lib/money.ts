import type { MoneyAmount } from "@drts/contracts";

const LOCALE = "zh-TW";

export function formatMoney(amount: MoneyAmount | null | undefined): string {
  if (!amount) {
    return "金額待確認";
  }

  const formatter = new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency: amount.currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return formatter.format(amount.amountMinor / 100);
}
