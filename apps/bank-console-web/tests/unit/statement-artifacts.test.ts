import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadBankStatementsData } from "../../lib/bank-dev-read-models";
import {
  buildStatementArtifactContent,
  buildStatementArtifactFilename,
  buildTripArtifactContent,
  buildTripCsvContent,
  buildTripCsvFilename,
} from "../../lib/statement-artifacts";

vi.mock("server-only", () => ({}));

function envelope<T>(data: T) {
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

// Raw values a live tenant API response would carry pre-masking. These must
// never appear verbatim in a downloaded artifact or CSV export.
const RAW_BENEFIT_REFERENCE = "BEN-CTBC-2026-88421";
const RAW_AUTHORIZATION_REF = "AUTH-CTBC-2026-77310";
const RAW_CARDHOLDER_REF = "CH-9931-4470";

const statementRecords = [
  {
    statementId: "stmt_2026_07",
    tenantId: "tenant_ctbc",
    period: "2026-07",
    status: "published",
    lines: [
      {
        tripId: "trip_live_001",
        completedAt: "2026-07-05T03:00:00Z",
        fare: { amountMinor: 145000, currency: "TWD" },
        subsidisedAmount: { amountMinor: 120000, currency: "TWD" },
        paidAmount: { amountMinor: 25000, currency: "TWD" },
        benefitReference: RAW_BENEFIT_REFERENCE,
        issuerAuthorizationRef: RAW_AUTHORIZATION_REF,
        cardholderRefMasked: RAW_CARDHOLDER_REF,
      },
    ],
    totals: {
      tripCount: 1,
      fareTotal: { amountMinor: 145000, currency: "TWD" },
      subsidisedTotal: { amountMinor: 120000, currency: "TWD" },
      paidTotal: { amountMinor: 25000, currency: "TWD" },
      issuerPayable: { amountMinor: 120000, currency: "TWD" },
    },
    artifactRef: {
      artifactId: "artifact_stmt_2026_07",
      kind: "settlement_statement",
      manifestHash: "hash",
    },
    generatedAt: "2026-07-06T00:00:00Z",
  },
];

const usage = [
  {
    programId: "ctbc-world-elite",
    programCode: "CTB-AIR-WE",
    period: "2026-07",
    quotaTotal: 120,
    quotaRemaining: 100,
    tripsConsumed: 20,
    cardholdersServed: 20,
  },
];

describe("statement artifact and CSV content (non-fixture, API-sourced statement)", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = new URL(
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url,
        );
        const path = `${url.pathname}${url.search}`;

        switch (path) {
          case "/api/tenant/service-programs":
            return envelope({ items: [] });
          case "/api/tenant/program-usage":
            return envelope({ items: usage });
          case "/api/tenant/orders?serviceProduct=credit_card_airport_transfer":
            return envelope({ items: [] });
          case "/api/tenant/contracts":
            return envelope({ items: [] });
          case "/api/tenant/settlement-statements":
            return envelope({ items: statementRecords });
          case "/api/tenant/users":
            return envelope({ items: [] });
          case "/api/tenant/audit":
            return envelope({ items: [] });
          default:
            throw new Error(`Unhandled fetch URL: ${path}`);
        }
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("masks PII on the statement read model before it reaches artifact builders", async () => {
    const result = await loadBankStatementsData(
      "tenant_ctbc",
      "bank_program_admin",
    );
    const trip = result.data.statements[0]?.trips[0];

    expect(trip?.benefitReferenceMasked).not.toBe(RAW_BENEFIT_REFERENCE);
    expect(trip?.benefitReferenceMasked).toContain("••••");
  });

  it("retains masked references and excludes raw PII from the signed statement artifact", async () => {
    const result = await loadBankStatementsData(
      "tenant_ctbc",
      "bank_program_admin",
    );
    const statement = result.data.statements[0]!;

    const content = buildStatementArtifactContent({
      tenantIssuerCode: "CTBC",
      statement,
      downloadedAt: "2026-08-09T00:00:00Z",
    });

    expect(content).not.toContain(RAW_BENEFIT_REFERENCE);
    expect(content).not.toContain(RAW_AUTHORIZATION_REF);
    expect(content).not.toContain(RAW_CARDHOLDER_REF);
    expect(buildStatementArtifactFilename(statement)).toBe(
      `${statement.statementNo}-signed-artifact.txt`,
    );
  });

  it("retains masked references and excludes raw PII from the trip artifact", async () => {
    const result = await loadBankStatementsData(
      "tenant_ctbc",
      "bank_program_admin",
    );
    const statement = result.data.statements[0]!;
    const trip = statement.trips[0]!;

    const content = buildTripArtifactContent({
      statement,
      trip,
      downloadedAt: "2026-08-09T00:00:00Z",
    });

    expect(content).not.toContain(RAW_BENEFIT_REFERENCE);
    expect(content).not.toContain(RAW_AUTHORIZATION_REF);
    expect(content).not.toContain(RAW_CARDHOLDER_REF);
    expect(content).toContain(trip.benefitReferenceMasked);
    expect(content).toContain(trip.cardholderReferenceMasked);
  });

  it("retains masked references and excludes raw PII from the trip-line CSV export", async () => {
    const result = await loadBankStatementsData(
      "tenant_ctbc",
      "bank_program_admin",
    );
    const statement = result.data.statements[0]!;

    const content = buildTripCsvContent({
      statement,
      downloadedAt: "2026-08-09T00:00:00Z",
    });

    expect(content).not.toContain(RAW_BENEFIT_REFERENCE);
    expect(content).not.toContain(RAW_AUTHORIZATION_REF);
    expect(content).not.toContain(RAW_CARDHOLDER_REF);
    expect(content).toContain(statement.trips[0]!.benefitReferenceMasked);
    expect(content.split("\n")).toContain(
      "trip_id,order_no,trip_date,fare,subsidised,paid,benefit_ref_masked,cardholder_ref_masked,card_ref_masked",
    );
    expect(buildTripCsvFilename(statement)).toBe(
      `${statement.statementNo}-trip-lines.csv`,
    );
  });
});
