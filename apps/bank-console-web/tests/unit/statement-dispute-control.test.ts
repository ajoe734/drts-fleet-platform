import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadBankStatementsData } from "../../lib/bank-dev-read-models";

const statementActionsSource = readFileSync(
  path.resolve(__dirname, "../../components/statement-actions.tsx"),
  "utf8",
);

vi.mock("server-only", () => ({}));

function envelope<T>(data: T) {
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

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
        benefitReference: "BEN-CTBC-2026-88421",
        issuerAuthorizationRef: "AUTH-CTBC-2026-77310",
        cardholderRefMasked: "CH-9931-4470",
      },
      {
        tripId: "trip_live_002",
        completedAt: "2026-07-06T03:00:00Z",
        fare: { amountMinor: 132000, currency: "TWD" },
        subsidisedAmount: { amountMinor: 110000, currency: "TWD" },
        paidAmount: { amountMinor: 22000, currency: "TWD" },
        benefitReference: "BEN-CTBC-2026-99120",
        issuerAuthorizationRef: "AUTH-CTBC-2026-88410",
        cardholderRefMasked: "CH-1120-5581",
      },
    ],
    totals: {
      tripCount: 2,
      fareTotal: { amountMinor: 277000, currency: "TWD" },
      subsidisedTotal: { amountMinor: 230000, currency: "TWD" },
      paidTotal: { amountMinor: 47000, currency: "TWD" },
      issuerPayable: { amountMinor: 230000, currency: "TWD" },
    },
    artifactRef: {
      artifactId: "artifact_stmt_2026_07",
      kind: "settlement_statement",
      manifestHash: "hash",
    },
    generatedAt: "2026-07-06T00:00:00Z",
  },
];

describe("bank console dispute control stays unsupported", () => {
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
            return envelope({ items: [] });
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

  it("never marks a live-sourced trip line as disputed, so the detail page can only render the disabled dispute-unavailable control", async () => {
    const result = await loadBankStatementsData(
      "tenant_ctbc",
      "bank_program_admin",
    );
    const trips = result.data.statements[0]?.trips ?? [];

    expect(trips.length).toBeGreaterThan(0);
    expect(trips.every((trip) => trip.disputed === false)).toBe(true);
  });

  it("does not expose a dispute-submission action alongside the supported read/export actions", () => {
    expect(statementActionsSource).toContain(
      "export function StatementArtifactDownloadButton",
    );
    expect(statementActionsSource).toContain(
      "export function StatementCsvExportButton",
    );
    expect(statementActionsSource).toContain(
      "export function TripArtifactDownloadButton",
    );
    expect(/export function \w*[Dd]ispute/.test(statementActionsSource)).toBe(
      false,
    );
  });

  it("renders the trip dispute cell as a disabled, non-interactive control in the statement detail page", () => {
    const pageSource = readFileSync(
      path.resolve(
        __dirname,
        "../../app/statements/[period]/page.tsx",
      ),
      "utf8",
    );
    const disputeCellMatch = pageSource.match(
      /\{trip\.disputed \? \([\s\S]*?disputeUnavailable[\s\S]*?\)\}/,
    );

    expect(disputeCellMatch).not.toBeNull();
    const disputeCell = disputeCellMatch![0];
    expect(disputeCell).toContain("disabled");
    expect(disputeCell).not.toContain("onClick");
  });
});
