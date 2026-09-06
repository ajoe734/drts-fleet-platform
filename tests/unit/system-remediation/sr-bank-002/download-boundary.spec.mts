import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  BANK_CONSOLE_SESSION_COOKIE,
  signSessionRole,
  type BankConsoleRole,
} from "@/lib/session";
import { loadBankStatementsData } from "@/lib/bank-dev-read-models";
import { GET as exportAll } from "../../../../apps/bank-console-web/app/api/statements/export/route";
import { GET as exportPeriod } from "../../../../apps/bank-console-web/app/api/statements/[period]/export/route";
import { GET as statementArtifact } from "../../../../apps/bank-console-web/app/artifacts/statements/[id]/route";
import { GET as tripArtifact } from "../../../../apps/bank-console-web/app/artifacts/trips/[id]/route";

vi.mock("server-only", () => ({}));

const roles: BankConsoleRole[] = [
  "bank_program_admin",
  "bank_finance",
  "bank_ops_viewer",
];
const money = { amount_minor: 98765400, currency: "TWD" };
const rawCardholder = "CH-PRIVATE-CARDHOLDER-1234";
const rawBenefit = "BEN-PRIVATE-BENEFIT-1234";
const rawPassenger = "SR BANK PRIVATE PASSENGER";
const rawStatement = {
  statement_id: "sr-bank-002-statement",
  tenant_id: "tenant-demo-001",
  period: "2026-03",
  status: "published",
  issued_at: "2026-03-01",
  due_at: "2026-03-31",
  totals: {
    fare_total: money,
    subsidised_total: money,
    paid_total: money,
    issuer_payable: money,
    trip_count: 1,
  },
  lines: [
    {
      trip_id: "sr-bank-002-trip",
      fare: money,
      subsidised_amount: money,
      paid_amount: money,
      benefit_reference: rawBenefit,
      cardholder_ref_masked: rawCardholder,
      passenger_name: rawPassenger,
      phone: "0912345678",
      card_number: "4111111111111111",
    },
  ],
};

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubEnv("DRTS_API_URL", "http://bank-api.test");
  vi.stubEnv("DRTS_API_AUTH_AUDIENCE", "");
  fetchMock.mockReset().mockImplementation(
    async (input: URL) =>
      new Response(
        JSON.stringify({
          data: {
            items: input.pathname.endsWith("settlement-statements")
              ? [rawStatement]
              : [],
          },
        }),
        { headers: { "content-type": "application/json" } },
      ),
  );
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const endpoints = [
  ["all CSV", (request: NextRequest) => exportAll(request)],
  [
    "period CSV",
    (request: NextRequest) =>
      exportPeriod(request, { params: Promise.resolve({ period: "2026-03" }) }),
  ],
  [
    "statement artifact",
    (request: NextRequest) =>
      statementArtifact(request, {
        params: Promise.resolve({ id: "sr-bank-002-statement.pdf" }),
      }),
  ],
  [
    "trip artifact",
    (request: NextRequest) =>
      tripArtifact(request, {
        params: Promise.resolve({ id: "sr-bank-002-trip.pdf" }),
      }),
  ],
] as const;

function request(
  role: BankConsoleRole,
  bank: string,
  token = signSessionRole(role, "ctbc"),
) {
  return new NextRequest(
    `http://bank.test/download?bank=${bank}&role=${role}`,
    {
      headers: { cookie: `${BANK_CONSOLE_SESSION_COOKIE}=${token}` },
    },
  );
}

for (const role of roles) {
  describe(role, () => {
    for (const [name, get] of endpoints) {
      it(`${name}: same-tenant authorization and PII masking`, async () => {
        const response = await get(request(role, "ctbc"));
        const body = await response.text();
        expect(response.status).toBe(role === "bank_ops_viewer" ? 403 : 200);
        if (role === "bank_ops_viewer") {
          expect(fetchMock).not.toHaveBeenCalled();
          expect(body).not.toContain("987654");
        } else {
          expect(fetchMock).toHaveBeenCalled();
          expect(body).toMatch(/987,?654/);
          expect(response.headers.get("cache-control")).toContain("no-store");
        }
        for (const pii of [
          rawCardholder,
          rawBenefit,
          rawPassenger,
          "0912345678",
          "4111111111111111",
        ]) {
          expect(body).not.toContain(pii);
        }
      });
      it(`${name}: cross-tenant denial occurs before fetching`, async () => {
        const response = await get(request(role, "cathay"));
        expect(response.status).toBe(403);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(await response.text()).not.toContain("sr-bank-002-statement");
      });
    }
  });
}

for (const [name, get] of endpoints) {
  it(`${name}: forged cookie and query-role escalation are rejected`, async () => {
    for (const token of [
      "forged.cookie",
      signSessionRole("bank_ops_viewer", "ctbc"),
    ]) {
      const response = await get(request("bank_finance", "ctbc", token));
      expect(response.status).toBe(403);
      expect(fetchMock).not.toHaveBeenCalled();
    }
  });
}

it("the real statement mapper removes raw PII from serialized financial data", async () => {
  const result = await loadBankStatementsData(
    "tenant-demo-001",
    "bank_finance",
  );
  const json = JSON.stringify(result.data);
  expect(json).toContain("987654");
  for (const pii of [
    rawCardholder,
    rawBenefit,
    rawPassenger,
    "0912345678",
    "4111111111111111",
  ]) {
    expect(json).not.toContain(pii);
  }
  expect(json).toContain("••••");
});
