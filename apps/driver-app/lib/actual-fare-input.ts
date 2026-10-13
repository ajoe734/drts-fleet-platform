import {
  normalisePlatformCurrency,
  PLATFORM_CURRENCY,
  type ActualTripFareBreakdown,
  type DriverCompleteTaskCommand,
  type MoneyAmount,
} from "@drts/contracts";

export const actualFareFields = [
  "startMinor",
  "distanceMinor",
  "delayMinor",
  "nightMinor",
] as const;

export type ActualFareDraft = Record<
  (typeof actualFareFields)[number] | "aggregate",
  string
>;

export function emptyActualFareDraft(): ActualFareDraft {
  return {
    startMinor: "",
    distanceMinor: "",
    delayMinor: "",
    nightMinor: "",
    aggregate: "",
  };
}

/** Parse entered dollars exactly; never round fractional minor units. */
export function parseActualFareMinor(text: string): number | null {
  const value = text.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const digits = `${whole}${fraction.padEnd(2, "0")}`.replace(/^0+/, "") || "0";
  if (digits.length > 16) return null;
  const minor = BigInt(digits);
  return minor <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(minor) : null;
}

export type ActualFareInputIssue =
  | "partial"
  | "invalid"
  | "overflow"
  | "aggregate"
  | "fixedFare";
type ActualFareInputResult =
  | { issue: ActualFareInputIssue }
  | {
      issue: null;
      command: Pick<DriverCompleteTaskCommand, "fare" | "actualFareBreakdown">;
    };

export function readActualFareInput(
  draft: ActualFareDraft,
  fixedPrice: boolean,
  quotedFare?: MoneyAmount | null,
): ActualFareInputResult {
  const values = actualFareFields.map((field) => draft[field].trim());
  if (
    values.every((value) => !value) &&
    (fixedPrice || !draft.aggregate.trim())
  ) {
    return { issue: null, command: {} };
  }
  if (values.some((value) => !value)) return { issue: "partial" };
  const minors = values.map(parseActualFareMinor);
  if (minors.some((value) => value === null)) return { issue: "invalid" };
  const actualFareBreakdown = Object.fromEntries(
    actualFareFields.map((field, index) => [field, minors[index]]),
  ) as unknown as ActualTripFareBreakdown;
  if (
    !Number.isSafeInteger(
      minors.reduce<number>((sum, value) => sum + value!, 0),
    )
  ) {
    return { issue: "overflow" };
  }
  if (fixedPrice) {
    if (
      !quotedFare ||
      normalisePlatformCurrency(quotedFare.currency) !== PLATFORM_CURRENCY ||
      !Number.isSafeInteger(quotedFare.amountMinor) ||
      quotedFare.amountMinor < 0
    ) {
      return { issue: "fixedFare" };
    }
    return { issue: null, command: { actualFareBreakdown } };
  }
  const amountMinor = parseActualFareMinor(draft.aggregate);
  if (amountMinor === null) return { issue: "aggregate" };
  return {
    issue: null,
    command: {
      actualFareBreakdown,
      fare: { currency: PLATFORM_CURRENCY, amountMinor },
    },
  };
}
