import type { MoneyAmount } from "@drts/contracts";

const LOCALE = "zh-TW";
const MINUS_SIGN = "−";

const CURRENCY_LABELS: Record<string, string> = {
  TWD: "NT$",
  USD: "US$",
  JPY: "¥",
};

export function buildMoneyAmount(
  amountMinor = 0,
  currency = "TWD",
): MoneyAmount {
  return {
    currency,
    amountMinor,
  };
}

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

export function getCurrencyLabel(currency: string | null | undefined): string {
  if (!currency) {
    return "";
  }
  return CURRENCY_LABELS[currency] ?? currency;
}

export interface AmountFormatOptions {
  fractionDigits?: number;
  showSign?: "auto" | "always" | "never";
  zeroPlaceholder?: string;
}

export function formatAmountNumber(
  amount: MoneyAmount | null | undefined,
  options: AmountFormatOptions = {},
): string {
  if (!amount) {
    return options.zeroPlaceholder ?? "—";
  }

  const fractionDigits = options.fractionDigits ?? 0;
  const major = amount.amountMinor / 100;

  if (
    options.showSign !== "always" &&
    options.zeroPlaceholder !== undefined &&
    amount.amountMinor === 0
  ) {
    return options.zeroPlaceholder;
  }

  const formatter = new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });

  const formatted = formatter.format(Math.abs(major));
  const sign = options.showSign ?? "auto";

  if (amount.amountMinor < 0) {
    return `${MINUS_SIGN}${formatted}`;
  }

  if (sign === "always" && amount.amountMinor > 0) {
    return `+${formatted}`;
  }

  return formatted;
}

export function formatSignedAmountNumber(
  amount: MoneyAmount | null | undefined,
  options: Omit<AmountFormatOptions, "showSign"> = {},
): string {
  return formatAmountNumber(amount, { ...options, showSign: "always" });
}

export function sumMoneyAmounts(
  amounts: Array<MoneyAmount | null | undefined>,
  currencyFallback = "TWD",
): MoneyAmount {
  const currency =
    amounts.find((amount) => amount?.currency)?.currency ?? currencyFallback;

  return {
    currency,
    amountMinor: amounts.reduce(
      (sum, amount) => sum + (amount?.amountMinor ?? 0),
      0,
    ),
  };
}
