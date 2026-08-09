import type { BankStatement } from "@/lib/bank-dev-read-models";

function csvField(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function buildStatementArtifactFilename(
  statement: Pick<BankStatement, "statementNo">,
): string {
  return `${statement.statementNo}-signed-artifact.txt`;
}

export function buildStatementArtifactContent(args: {
  tenantIssuerCode: string;
  statement: BankStatement;
  downloadedAt: string;
}): string {
  const { tenantIssuerCode, statement, downloadedAt } = args;
  return [
    "DRTS Bank Settlement Statement — Signed Artifact",
    `issuer=${tenantIssuerCode}`,
    `statement_no=${statement.statementNo}`,
    `period=${statement.period}`,
    `status=${statement.status}`,
    `issued_at=${statement.issuedAt}`,
    `due_at=${statement.dueAt}`,
    `total_fare=${statement.totalFareAmount}`,
    `total_subsidised=${statement.totalSubsidisedAmount}`,
    `total_paid=${statement.totalPaidAmount}`,
    `total_issuer_payable=${statement.totalIssuerPayableAmount}`,
    `trip_count=${statement.totalTrips}`,
    `downloaded_at=${downloadedAt}`,
  ].join("\n");
}

export function buildTripArtifactFilename(tripId: string): string {
  return `${tripId}-artifact.txt`;
}

export function buildTripArtifactContent(args: {
  statement: Pick<BankStatement, "statementNo" | "period">;
  trip: BankStatement["trips"][number];
  downloadedAt: string;
}): string {
  const { statement, trip, downloadedAt } = args;
  return [
    "DRTS Bank Settlement Statement — Trip Artifact",
    `statement_no=${statement.statementNo}`,
    `period=${statement.period}`,
    `trip_id=${trip.tripId}`,
    `order_no=${trip.orderNo}`,
    `trip_date=${trip.tripDate}`,
    `fare=${trip.fareAmount}`,
    `subsidised=${trip.subsidisedAmount}`,
    `paid=${trip.paidAmount}`,
    `benefit_ref_masked=${trip.benefitReferenceMasked}`,
    `cardholder_ref_masked=${trip.cardholderReferenceMasked}`,
    `card_ref_masked=${trip.cardReferenceMasked}`,
    `downloaded_at=${downloadedAt}`,
  ].join("\n");
}

export function buildTripCsvFilename(
  statement: Pick<BankStatement, "statementNo">,
): string {
  return `${statement.statementNo}-trip-lines.csv`;
}

export function buildTripCsvContent(args: {
  statement: BankStatement;
  downloadedAt: string;
}): string {
  const { statement, downloadedAt } = args;
  const header = [
    "trip_id",
    "order_no",
    "trip_date",
    "fare",
    "subsidised",
    "paid",
    "benefit_ref_masked",
    "cardholder_ref_masked",
    "card_ref_masked",
  ];
  const rows = statement.trips.map((trip) =>
    [
      trip.tripId,
      trip.orderNo,
      trip.tripDate,
      trip.fareAmount,
      trip.subsidisedAmount,
      trip.paidAmount,
      trip.benefitReferenceMasked,
      trip.cardholderReferenceMasked,
      trip.cardReferenceMasked,
    ]
      .map(csvField)
      .join(","),
  );

  return [
    `# downloaded_at=${downloadedAt}`,
    `# statement_no=${statement.statementNo}`,
    header.join(","),
    ...rows,
  ].join("\n");
}
