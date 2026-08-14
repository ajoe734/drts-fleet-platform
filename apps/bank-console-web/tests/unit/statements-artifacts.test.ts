import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import jwt from "jsonwebtoken";
import type {
  AuditLogRecord,
  IssuerContractStatusRecord,
  OwnedOrderRecord,
  TenantProgramUsageRecord,
  TenantServiceProgramRecord,
  TenantUserRoleRecord,
} from "@drts/contracts";
import { GET as getStatementArtifact } from "../../app/artifacts/statements/[id]/route";
import { GET as getTripArtifact } from "../../app/artifacts/trips/[id]/route";
import { GET as exportPeriodCsv } from "../../app/api/statements/[period]/export/route";
import { GET as exportAllCsv } from "../../app/api/statements/export/route";
import { POST as loginUser } from "../../app/api/auth/login/route";
import {
  DEFAULT_TEST_PROXY_SECRET,
  TRUSTED_PROXY_HEADER,
  signSessionRole,
} from "../../lib/session";

vi.mock("server-only", () => ({}));

function envelope<T>(data: T) {
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

const servicePrograms: TenantServiceProgramRecord[] = [
  {
    programId: "ctbc-world-elite",
    tenantId: "tenant_ctbc",
    programType: "credit_card_airport_transfer",
    displayName: "中信機場 World Elite",
    active: true,
  },
] as unknown as TenantServiceProgramRecord[];

const usage: TenantProgramUsageRecord[] = [
  {
    programId: "ctbc-world-elite",
    programCode: "CTB-AIR-WE",
    period: "2026-08",
    quotaTotal: 120,
    quotaRemaining: 117,
    tripsConsumed: 3,
    cardholdersServed: 3,
  },
] as unknown as TenantProgramUsageRecord[];

const orders: OwnedOrderRecord[] = [];
const contracts: IssuerContractStatusRecord[] = [];
const users: TenantUserRoleRecord[] = [];
const auditLogs: AuditLogRecord[] = [];

const statements = [
  {
    statementId: "settlement-statement-tenant_ctbc-2026-08",
    tenantId: "tenant_ctbc",
    period: "2026-08",
    status: "due",
    lines: [
      {
        tripId: "trip_ctbc_260601_001",
        completedAt: "2026-08-05T03:00:00Z",
        fare: { amountMinor: 145000, currency: "TWD" },
        subsidisedAmount: { amountMinor: 120000, currency: "TWD" },
        paidAmount: { amountMinor: 25000, currency: "TWD" },
        benefitReference: "BEN-CTBC-0003",
        issuerAuthorizationRef: "AUTH-CTBC-003",
        cardholderRefMasked: "CH••••33",
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
      artifactId: "settlement-statement-tenant_ctbc-2026-08",
      kind: "settlement_statement",
      manifestHash: "hash",
    },
    generatedAt: "2026-08-06T00:00:00Z",
  },
];

const cathayStatements = [
  {
    statementId: "settlement-statement-tenant-cathay-001-2026-08",
    tenantId: "tenant-cathay-001",
    period: "2026-08",
    status: "due",
    lines: [
      {
        tripId: "trip_cathay_260601_001",
        completedAt: "2026-08-05T03:00:00Z",
        fare: { amountMinor: 180000, currency: "TWD" },
        subsidisedAmount: { amountMinor: 150000, currency: "TWD" },
        paidAmount: { amountMinor: 30000, currency: "TWD" },
        benefitReference: "BEN-CATHAY-0001",
        issuerAuthorizationRef: "AUTH-CATHAY-001",
        cardholderRefMasked: "CH••••88",
      },
    ],
    totals: {
      tripCount: 1,
      fareTotal: { amountMinor: 180000, currency: "TWD" },
      subsidisedTotal: { amountMinor: 150000, currency: "TWD" },
      paidTotal: { amountMinor: 30000, currency: "TWD" },
      issuerPayable: { amountMinor: 150000, currency: "TWD" },
    },
    artifactRef: {
      artifactId: "settlement-statement-tenant-cathay-001-2026-08",
      kind: "settlement_statement",
      manifestHash: "hash_cathay",
    },
    generatedAt: "2026-08-06T00:00:00Z",
  },
];

describe("S1F-BANK-002 Statement Artifacts and Role Authorization", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = new URL(
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url,
        );

        if (url.hostname === "metadata.google.internal") {
          return new Response("metadata unavailable", { status: 404 });
        }

        const reqHeaders =
          input instanceof Request
            ? input.headers
            : (init?.headers as Record<string, string> | undefined);
        const tenantHeader =
          reqHeaders instanceof Headers
            ? reqHeaders.get("x-tenant-id")
            : reqHeaders?.["x-tenant-id"];

        const path = `${url.pathname}${url.search}`;

        switch (path) {
          case "/api/tenant/service-programs":
            return envelope({ items: servicePrograms });
          case "/api/tenant/program-usage":
            return envelope({ items: usage });
          case "/api/tenant/orders?serviceProduct=credit_card_airport_transfer":
            return envelope({ items: orders });
          case "/api/tenant/contracts":
            return envelope({ items: contracts });
          case "/api/tenant/settlement-statements":
            if (tenantHeader === "tenant-cathay-001") {
              return envelope({ items: cathayStatements });
            }
            return envelope({ items: statements });
          case "/api/tenant/users":
            return envelope({ items: users });
          case "/api/tenant/audit":
            return envelope({ items: auditLogs });
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

  it("allows bank_finance and bank_program_admin to download statement artifacts with valid server session cookie", async () => {
    const signedFinance = signSessionRole("bank_finance", "ctbc");
    const signedAdmin = signSessionRole("bank_program_admin", "ctbc");

    const reqFinance = new NextRequest(
      "http://localhost:3000/artifacts/statements/settlement-statement-tenant_ctbc-2026-08.pdf?bank=ctbc&role=bank_finance",
      { headers: { cookie: `drts_bank_console_session=${signedFinance}` } },
    );
    const resFinance = await getStatementArtifact(reqFinance, {
      params: Promise.resolve({
        id: "settlement-statement-tenant_ctbc-2026-08.pdf",
      }),
    });

    expect(resFinance.status).toBe(200);
    expect(resFinance.headers.get("content-type")).toContain("text/plain");
    expect(resFinance.headers.get("content-disposition")).toContain(
      "attachment",
    );

    const text = await resFinance.text();
    expect(text).toContain("DRTS SETTLEMENT STATEMENT (NON-FIXTURE ARTIFACT)");
    expect(text).toContain("DIGITAL SIGNATURE & AUDIT MANIFEST");
    expect(text).toContain("Issuer Auth Domain : drts.settlement.issuer");

    const reqAdmin = new NextRequest(
      "http://localhost:3000/artifacts/statements/2026-08?bank=ctbc&role=bank_program_admin",
      { headers: { cookie: `drts_bank_console_session=${signedAdmin}` } },
    );
    const resAdmin = await getStatementArtifact(reqAdmin, {
      params: Promise.resolve({ id: "2026-08" }),
    });
    expect(resAdmin.status).toBe(200);
  });

  it("rejects forged unsigned cookie e.g. drts_bank_console_role=bank_finance without valid HMAC signature (403 Forbidden)", async () => {
    const reqUnsignedCookie = new NextRequest(
      "http://localhost:3000/artifacts/statements/settlement-statement-tenant_ctbc-2026-08.pdf?bank=ctbc&role=bank_finance",
      { headers: { cookie: "drts_bank_console_role=bank_finance" } },
    );
    const resUnsignedCookie = await getStatementArtifact(reqUnsignedCookie, {
      params: Promise.resolve({
        id: "settlement-statement-tenant_ctbc-2026-08.pdf",
      }),
    });
    expect(resUnsignedCookie.status).toBe(403);
    const body = await resUnsignedCookie.json();
    expect(body.error.code).toBe("FORBIDDEN");
    expect(body.error.message).toContain("signature");

    const reqUnsignedExport = new NextRequest(
      "http://localhost:3000/api/statements/export?bank=ctbc&role=bank_finance",
      { headers: { cookie: "drts_bank_console_session=bank_finance" } },
    );
    const resUnsignedExport = await exportAllCsv(reqUnsignedExport);
    expect(resUnsignedExport.status).toBe(403);
  });

  it("rejects tampered cookie signature (403 Forbidden)", async () => {
    const fakeToken =
      "bank_finance:ctbc.0000000000000000000000000000000000000000000000000000000000000000";
    const reqFake = new NextRequest(
      "http://localhost:3000/api/statements/export?bank=ctbc&role=bank_finance",
      { headers: { cookie: `drts_bank_console_session=${fakeToken}` } },
    );
    const resFake = await exportAllCsv(reqFake);
    expect(resFake.status).toBe(403);
  });

  it("rejects tenant scope mismatch between session cookie and requested bank (403 Forbidden)", async () => {
    const signedCtbc = signSessionRole("bank_finance", "ctbc");
    const reqMismatch = new NextRequest(
      "http://localhost:3000/api/statements/export?bank=cathay&role=bank_finance",
      { headers: { cookie: `drts_bank_console_session=${signedCtbc}` } },
    );
    const resMismatch = await exportAllCsv(reqMismatch);
    expect(resMismatch.status).toBe(403);
    const body = await resMismatch.json();
    expect(body.error.code).toBe("FORBIDDEN");
    expect(body.error.message).toContain("Tenant scope mismatch");
  });

  it("prevents unauthenticated requests without session cookie from exporting/downloading even if ?role= is supplied (403 Forbidden)", async () => {
    const reqFinanceNoCookie = new NextRequest(
      "http://localhost:3000/artifacts/statements/settlement-statement-tenant_ctbc-2026-08.pdf?bank=ctbc&role=bank_finance",
    );
    const resFinanceNoCookie = await getStatementArtifact(reqFinanceNoCookie, {
      params: Promise.resolve({
        id: "settlement-statement-tenant_ctbc-2026-08.pdf",
      }),
    });
    expect(resFinanceNoCookie.status).toBe(403);

    const reqExportNoCookie = new NextRequest(
      "http://localhost:3000/api/statements/export?bank=ctbc&role=bank_finance",
    );
    const resExportNoCookie = await exportAllCsv(reqExportNoCookie);
    expect(resExportNoCookie.status).toBe(403);
  });

  it("prevents bank_ops_viewer from downloading statement artifacts (403 Forbidden)", async () => {
    const signedOps = signSessionRole("bank_ops_viewer", "ctbc");
    const reqOps = new NextRequest(
      "http://localhost:3000/artifacts/statements/settlement-statement-tenant_ctbc-2026-08.pdf?bank=ctbc&role=bank_ops_viewer",
      { headers: { cookie: `drts_bank_console_session=${signedOps}` } },
    );
    const resOps = await getStatementArtifact(reqOps, {
      params: Promise.resolve({
        id: "settlement-statement-tenant_ctbc-2026-08.pdf",
      }),
    });

    expect(resOps.status).toBe(403);
    const body = await resOps.json();
    expect(body.error.code).toBe("FORBIDDEN");
    expect(body.error.message).toContain("bank_ops_viewer");
  });

  it("prevents bank_ops_viewer from downloading trip artifacts (403 Forbidden)", async () => {
    const signedOps = signSessionRole("bank_ops_viewer", "ctbc");
    const reqOps = new NextRequest(
      "http://localhost:3000/artifacts/trips/trip_ctbc_260601_001.pdf?bank=ctbc&role=bank_ops_viewer",
      { headers: { cookie: `drts_bank_console_session=${signedOps}` } },
    );
    const resOps = await getTripArtifact(reqOps, {
      params: Promise.resolve({ id: "trip_ctbc_260601_001.pdf" }),
    });

    expect(resOps.status).toBe(403);
    const body = await resOps.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("allows authorized roles to download trip artifacts", async () => {
    const signedFinance = signSessionRole("bank_finance", "ctbc");
    const reqFinance = new NextRequest(
      "http://localhost:3000/artifacts/trips/trip_ctbc_260601_001.pdf?bank=ctbc&role=bank_finance",
      { headers: { cookie: `drts_bank_console_session=${signedFinance}` } },
    );
    const resFinance = await getTripArtifact(reqFinance, {
      params: Promise.resolve({ id: "trip_ctbc_260601_001.pdf" }),
    });

    expect(resFinance.status).toBe(200);
    const text = await resFinance.text();
    expect(text).toContain(
      "DRTS TRIP SETTLEMENT RECEIPT (NON-FIXTURE ARTIFACT)",
    );
    expect(text).toContain("MASKED IDENTIFIERS");
  });

  it("prevents bank_ops_viewer from exporting period CSV (403 Forbidden)", async () => {
    const signedOps = signSessionRole("bank_ops_viewer", "ctbc");
    const reqOps = new NextRequest(
      "http://localhost:3000/api/statements/2026-08/export?bank=ctbc&role=bank_ops_viewer",
      { headers: { cookie: `drts_bank_console_session=${signedOps}` } },
    );
    const resOps = await exportPeriodCsv(reqOps, {
      params: Promise.resolve({ period: "2026-08" }),
    });

    expect(resOps.status).toBe(403);
  });

  it("allows authorized roles to export period CSV", async () => {
    const signedFinance = signSessionRole("bank_finance", "ctbc");
    const reqFinance = new NextRequest(
      "http://localhost:3000/api/statements/2026-08/export?bank=ctbc&role=bank_finance",
      { headers: { cookie: `drts_bank_console_session=${signedFinance}` } },
    );
    const resFinance = await exportPeriodCsv(reqFinance, {
      params: Promise.resolve({ period: "2026-08" }),
    });

    expect(resFinance.status).toBe(200);
    expect(resFinance.headers.get("content-type")).toContain("text/csv");
    const csv = await resFinance.text();
    expect(csv).toContain("Period,StatementNo,TripID");
    expect(csv).toContain("2026-08");
  });

  it("prevents bank_ops_viewer from exporting all-statements CSV (403 Forbidden)", async () => {
    const signedOps = signSessionRole("bank_ops_viewer", "ctbc");
    const reqOps = new NextRequest(
      "http://localhost:3000/api/statements/export?bank=ctbc&role=bank_ops_viewer",
      { headers: { cookie: `drts_bank_console_session=${signedOps}` } },
    );
    const resOps = await exportAllCsv(reqOps);

    expect(resOps.status).toBe(403);
  });

  it("allows authorized roles to export all-statements CSV", async () => {
    const signedFinance = signSessionRole("bank_finance", "ctbc");
    const reqFinance = new NextRequest(
      "http://localhost:3000/api/statements/export?bank=ctbc&role=bank_finance",
      { headers: { cookie: `drts_bank_console_session=${signedFinance}` } },
    );
    const resFinance = await exportAllCsv(reqFinance);

    expect(resFinance.status).toBe(200);
    expect(resFinance.headers.get("content-type")).toContain("text/csv");
    const csv = await resFinance.text();
    expect(csv).toContain("Period,StatementNo,ProgramLabel");
  });

  it("rejects query parameter role tampering when cookie indicates bank_ops_viewer (403 Forbidden across all GET export/artifact routes)", async () => {
    const signedOps = signSessionRole("bank_ops_viewer", "ctbc");
    const cookieHeader = `drts_bank_console_session=${signedOps}`;

    // 1. All-statements export route
    const reqExportAll = new NextRequest(
      "http://localhost:3000/api/statements/export?bank=ctbc&role=bank_finance",
      { headers: { cookie: cookieHeader } },
    );
    const resExportAll = await exportAllCsv(reqExportAll);
    expect(resExportAll.status).toBe(403);
    const bodyAll = await resExportAll.json();
    expect(bodyAll.error.code).toBe("FORBIDDEN");
    expect(bodyAll.error.message).toContain("tampering");

    // 2. Single period export route
    const reqPeriod = new NextRequest(
      "http://localhost:3000/api/statements/2026-08/export?bank=ctbc&role=bank_finance",
      { headers: { cookie: cookieHeader } },
    );
    const resPeriod = await exportPeriodCsv(reqPeriod, {
      params: Promise.resolve({ period: "2026-08" }),
    });
    expect(resPeriod.status).toBe(403);
    const bodyPeriod = await resPeriod.json();
    expect(bodyPeriod.error.code).toBe("FORBIDDEN");
    expect(bodyPeriod.error.message).toContain("tampering");

    // 3. Statement artifact download route
    const reqStmtArtifact = new NextRequest(
      "http://localhost:3000/artifacts/statements/settlement-statement-tenant_ctbc-2026-08.pdf?bank=ctbc&role=bank_finance",
      { headers: { cookie: cookieHeader } },
    );
    const resStmtArtifact = await getStatementArtifact(reqStmtArtifact, {
      params: Promise.resolve({
        id: "settlement-statement-tenant_ctbc-2026-08.pdf",
      }),
    });
    expect(resStmtArtifact.status).toBe(403);
    const bodyStmt = await resStmtArtifact.json();
    expect(bodyStmt.error.code).toBe("FORBIDDEN");
    expect(bodyStmt.error.message).toContain("tampering");

    // 4. Trip artifact download route
    const reqTripArtifact = new NextRequest(
      "http://localhost:3000/artifacts/trips/trip_ctbc_260601_001.pdf?bank=ctbc&role=bank_finance",
      { headers: { cookie: cookieHeader } },
    );
    const resTripArtifact = await getTripArtifact(reqTripArtifact, {
      params: Promise.resolve({ id: "trip_ctbc_260601_001.pdf" }),
    });
    expect(resTripArtifact.status).toBe(403);
    const bodyTrip = await resTripArtifact.json();
    expect(bodyTrip.error.code).toBe("FORBIDDEN");
    expect(bodyTrip.error.message).toContain("tampering");
  });

  it("uses trusted server session cookie even when role query parameter is omitted", async () => {
    const signedFinance = signSessionRole("bank_finance", "ctbc");
    const cookieHeader = `drts_bank_console_session=${signedFinance}`;

    const reqAll = new NextRequest(
      "http://localhost:3000/api/statements/export?bank=ctbc",
      { headers: { cookie: cookieHeader } },
    );
    const resAll = await exportAllCsv(reqAll);
    expect(resAll.status).toBe(200);

    const reqStmt = new NextRequest(
      "http://localhost:3000/artifacts/statements/settlement-statement-tenant_ctbc-2026-08.pdf?bank=ctbc",
      { headers: { cookie: cookieHeader } },
    );
    const resStmt = await getStatementArtifact(reqStmt, {
      params: Promise.resolve({
        id: "settlement-statement-tenant_ctbc-2026-08.pdf",
      }),
    });
    expect(resStmt.status).toBe(200);
  });

  it("authenticates via POST /api/auth/login with trusted proxy header and trusted server email header", async () => {
    const reqLogin = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [TRUSTED_PROXY_HEADER]: DEFAULT_TEST_PROXY_SECRET,
        "x-authenticated-user-email": "finance@ctbc.demo",
      },
      body: JSON.stringify({
        bank: "ctbc",
        locale: "zh",
        role: "bank_finance",
      }),
    });

    const resLogin = await loginUser(reqLogin);
    expect(resLogin.status).toBe(303);
    expect(resLogin.headers.get("location")).toBe(
      "http://localhost:3000/?bank=ctbc&locale=zh&role=bank_finance",
    );
    const cookies = resLogin.headers.get("set-cookie");
    expect(cookies).toContain("drts_bank_console_session=");
    expect(cookies).toContain("drts_bank_console_signed_out=");
  });

  it("END-TO-END NEGATIVE TEST: rejects spoofing of x-goog-authenticated-user-email without trusted proxy header (403 Forbidden)", async () => {
    const req = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-authenticated-user-email": "finance@ctbc.demo",
      },
      body: JSON.stringify({
        bank: "ctbc",
        locale: "zh",
        role: "bank_finance",
      }),
    });
    const res = await loginUser(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("FORBIDDEN");
    expect(body.error.message).toContain(
      "spoofed authenticated identity header",
    );
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("END-TO-END NEGATIVE TEST: rejects spoofing of x-authenticated-user-email without trusted proxy header (403 Forbidden)", async () => {
    const req = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-authenticated-user-email": "finance@ctbc.demo",
      },
      body: JSON.stringify({
        bank: "ctbc",
        locale: "zh",
        role: "bank_finance",
      }),
    });
    const res = await loginUser(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("FORBIDDEN");
    expect(body.error.message).toContain(
      "spoofed authenticated identity header",
    );
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("END-TO-END NEGATIVE TEST: rejects spoofing of x-authenticated-user without trusted proxy header (403 Forbidden)", async () => {
    const req = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-authenticated-user": "admin@ctbc.demo",
      },
      body: JSON.stringify({
        bank: "ctbc",
        locale: "zh",
        role: "bank_program_admin",
      }),
    });
    const res = await loginUser(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("FORBIDDEN");
    expect(body.error.message).toContain(
      "spoofed authenticated identity header",
    );
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("END-TO-END NEGATIVE TEST: rejects spoofing of x-authenticated-role without trusted proxy header (403 Forbidden)", async () => {
    const req = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-authenticated-role": "bank_finance",
      },
      body: JSON.stringify({
        bank: "ctbc",
        locale: "zh",
        role: "bank_finance",
      }),
    });
    const res = await loginUser(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("FORBIDDEN");
    expect(body.error.message).toContain(
      "spoofed authenticated identity header",
    );
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("END-TO-END NEGATIVE TEST: rejects spoofing of x-authenticated-tenant without trusted proxy header (403 Forbidden)", async () => {
    const req = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-authenticated-tenant": "ctbc",
      },
      body: JSON.stringify({
        bank: "ctbc",
        locale: "zh",
        role: "bank_finance",
      }),
    });
    const res = await loginUser(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("FORBIDDEN");
    expect(body.error.message).toContain(
      "spoofed authenticated identity header",
    );
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("END-TO-END NEGATIVE TEST: rejects spoofing of x-authenticated-bank without trusted proxy header (403 Forbidden)", async () => {
    const req = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-authenticated-bank": "ctbc",
      },
      body: JSON.stringify({
        bank: "ctbc",
        locale: "zh",
        role: "bank_finance",
      }),
    });
    const res = await loginUser(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("FORBIDDEN");
    expect(body.error.message).toContain(
      "spoofed authenticated identity header",
    );
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("END-TO-END NEGATIVE TEST: rejects forged x-goog-iap-jwt-assertion dummy string with spoofed email header (403 Forbidden)", async () => {
    const req = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-iap-jwt-assertion": "dummy_unverified_jwt_assertion",
        "x-authenticated-user-email": "finance@ctbc.demo",
      },
      body: JSON.stringify({
        bank: "ctbc",
        locale: "zh",
        role: "bank_finance",
      }),
    });
    const res = await loginUser(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("FORBIDDEN");
    expect(body.error.message).toContain(
      "invalid or unverified IAP JWT assertion",
    );
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("END-TO-END NEGATIVE TEST: rejects forged x-iap-jwt-assertion with invalid signature (403 Forbidden)", async () => {
    const badToken = jwt.sign(
      {
        sub: "unauthorized-attacker",
        email: "finance@ctbc.demo",
        iss: "https://cloud.google.com/iap",
      },
      "wrong_invalid_secret_key_12345",
    );
    const req = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-iap-jwt-assertion": badToken,
        "x-authenticated-user-email": "finance@ctbc.demo",
      },
      body: JSON.stringify({
        bank: "ctbc",
        locale: "zh",
        role: "bank_finance",
      }),
    });
    const res = await loginUser(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("FORBIDDEN");
    expect(body.error.message).toContain(
      "invalid or unverified IAP JWT assertion",
    );
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("authenticates successfully with validly signed IAP JWT assertion and matching claims", async () => {
    const validToken = jwt.sign(
      {
        sub: "user-12345",
        email: "finance@ctbc.demo",
        iss: "https://cloud.google.com/iap",
      },
      "drts_bank_test_iap_jwt_secret_key_2026",
    );
    const req = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-iap-jwt-assertion": validToken,
        "x-authenticated-user-email": "finance@ctbc.demo",
      },
      body: JSON.stringify({
        bank: "ctbc",
        locale: "zh",
        role: "bank_finance",
      }),
    });
    const res = await loginUser(req);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(
      "http://localhost:3000/?bank=ctbc&locale=zh&role=bank_finance",
    );
    const cookies = res.headers.get("set-cookie");
    expect(cookies).toContain("drts_bank_console_session=");
  });

  it("END-TO-END NEGATIVE TEST: rejects valid IAP JWT assertion with mismatched x-authenticated-user-email header (403 Forbidden)", async () => {
    const token = jwt.sign(
      {
        sub: "user-12345",
        email: "viewer@cathay.demo",
        iss: "https://cloud.google.com/iap",
      },
      "drts_bank_test_iap_jwt_secret_key_2026",
    );
    const req = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-iap-jwt-assertion": token,
        "x-authenticated-user-email": "finance@ctbc.demo",
      },
      body: JSON.stringify({
        bank: "ctbc",
        locale: "zh",
        role: "bank_finance",
      }),
    });
    const res = await loginUser(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("FORBIDDEN");
    expect(body.error.message).toContain(
      "header mismatch between x-authenticated-user-email",
    );
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("END-TO-END NEGATIVE TEST: rejects valid IAP JWT assertion with mismatched x-authenticated-tenant header (403 Forbidden)", async () => {
    const token = jwt.sign(
      {
        sub: "user-12345",
        email: "finance@cathay.demo",
        tenant: "cathay",
        iss: "https://cloud.google.com/iap",
      },
      "drts_bank_test_iap_jwt_secret_key_2026",
    );
    const req = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-iap-jwt-assertion": token,
        "x-authenticated-user-email": "finance@cathay.demo",
        "x-authenticated-tenant": "ctbc",
      },
      body: JSON.stringify({
        bank: "cathay",
        locale: "zh",
        role: "bank_finance",
      }),
    });
    const res = await loginUser(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("FORBIDDEN");
    expect(body.error.message).toContain(
      "header mismatch between x-authenticated-tenant",
    );
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("authenticates successfully with valid IAP JWT assertion deriving tenant and role directly from claims when headers are omitted", async () => {
    const token = jwt.sign(
      {
        sub: "user-9999",
        email: "finance@cathay.demo",
        tenant: "cathay",
        role: "bank_finance",
        iss: "https://cloud.google.com/iap",
      },
      "drts_bank_test_iap_jwt_secret_key_2026",
    );
    const req = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-iap-jwt-assertion": token,
      },
      body: JSON.stringify({
        bank: "cathay",
        locale: "zh",
        role: "bank_finance",
      }),
    });
    const res = await loginUser(req);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(
      "http://localhost:3000/?bank=cathay&locale=zh&role=bank_finance",
    );
    const cookies = res.headers.get("set-cookie");
    expect(cookies).toContain("drts_bank_console_session=");
  });

  it("END-TO-END NEGATIVE TEST: rejects spoofed client x-dev-identity header in POST /api/auth/login (403 Forbidden)", async () => {
    const reqSpoofDev = new NextRequest(
      "http://localhost:3000/api/auth/login",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-dev-identity": "finance@ctbc.demo",
        },
        body: JSON.stringify({
          bank: "ctbc",
          locale: "zh",
          role: "bank_finance",
        }),
      },
    );

    const resSpoofDev = await loginUser(reqSpoofDev);
    expect(resSpoofDev.status).toBe(403);
    const bodySpoof = await resSpoofDev.json();
    expect(bodySpoof.ok).toBe(false);
    expect(bodySpoof.error.code).toBe("FORBIDDEN");
    expect(bodySpoof.error.message).toContain(
      "missing trusted proxy or IAP boundary",
    );
    expect(resSpoofDev.headers.get("set-cookie")).toBeNull();
  });

  it("allows a privileged demo persona only when the explicit Dev login switch is enabled", async () => {
    const previousEnvironment = process.env.DRTS_ENV;
    const previousSwitch = process.env.BANK_CONSOLE_DEMO_LOGIN;
    process.env.DRTS_ENV = "development";
    process.env.BANK_CONSOLE_DEMO_LOGIN = "true";

    try {
      const response = await loginUser(
        new NextRequest("http://localhost:3000/api/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            bank: "ctbc",
            locale: "zh",
            role: "bank_program_admin",
          }),
        }),
      );

      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe(
        "http://localhost:3000/?bank=ctbc&locale=zh&role=bank_program_admin",
      );
    } finally {
      if (previousEnvironment === undefined) delete process.env.DRTS_ENV;
      else process.env.DRTS_ENV = previousEnvironment;
      if (previousSwitch === undefined)
        delete process.env.BANK_CONSOLE_DEMO_LOGIN;
      else process.env.BANK_CONSOLE_DEMO_LOGIN = previousSwitch;
    }
  });

  it("END-TO-END NEGATIVE TEST: rejects cross-bank body claim in POST /api/auth/login (403 Forbidden)", async () => {
    const reqCrossBank = new NextRequest(
      "http://localhost:3000/api/auth/login",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [TRUSTED_PROXY_HEADER]: DEFAULT_TEST_PROXY_SECRET,
          "x-authenticated-user-email": "finance@ctbc.demo",
        },
        body: JSON.stringify({
          bank: "cathay",
          locale: "zh",
          role: "bank_finance",
        }),
      },
    );

    const resCrossBank = await loginUser(reqCrossBank);
    expect(resCrossBank.status).toBe(403);
    const bodyCross = await resCrossBank.json();
    expect(bodyCross.ok).toBe(false);
    expect(bodyCross.error.code).toBe("FORBIDDEN");
    expect(bodyCross.error.message).toContain(
      "Cross-bank tenant claim rejected",
    );
    expect(resCrossBank.headers.get("set-cookie")).toBeNull();
  });

  it("END-TO-END NEGATIVE TEST: rejects untrusted body/form identity claims in POST /api/auth/login (403 Forbidden)", async () => {
    const reqLoginAttack = new NextRequest(
      "http://localhost:3000/api/auth/login",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          bank: "ctbc",
          locale: "zh",
          role: "bank_finance",
          identityClaim: "finance@ctbc.demo",
          userEmail: "admin@ctbc.demo",
        }),
      },
    );

    const resLoginAttack = await loginUser(reqLoginAttack);
    expect(resLoginAttack.status).toBe(403);
    const bodyAttack = await resLoginAttack.json();
    expect(bodyAttack.ok).toBe(false);
    expect(bodyAttack.error.code).toBe("FORBIDDEN");
    expect(bodyAttack.error.message).toContain(
      "missing trusted proxy or IAP boundary",
    );

    expect(resLoginAttack.headers.get("set-cookie")).toBeNull();

    const reqExport = new NextRequest(
      "http://localhost:3000/api/statements/export?bank=ctbc&role=bank_finance",
    );
    const resExport = await exportAllCsv(reqExport);
    expect(resExport.status).toBe(403);
    const exportBody = await resExport.json();
    expect(exportBody.error.code).toBe("FORBIDDEN");
  });

  it("SECURITY TEST: rejects client-submitted x-trusted-proxy-secret in JSON body during POST /api/auth/login and prevents privileged role session minting", async () => {
    const reqBodyAttack = new NextRequest(
      "http://localhost:3000/api/auth/login",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          bank: "ctbc",
          locale: "zh",
          role: "bank_finance",
          "x-trusted-proxy-secret": DEFAULT_TEST_PROXY_SECRET,
        }),
      },
    );

    const res = await loginUser(reqBodyAttack);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("FORBIDDEN");
    expect(body.error.message).toContain(
      "missing trusted proxy or IAP boundary",
    );
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("SECURITY TEST: rejects client-submitted x-trusted-proxy-secret in FormData during POST /api/auth/login and prevents privileged role session minting", async () => {
    const formData = new FormData();
    formData.set("bank", "ctbc");
    formData.set("locale", "zh");
    formData.set("role", "bank_program_admin");
    formData.set("x-trusted-proxy-secret", DEFAULT_TEST_PROXY_SECRET);

    const reqFormAttack = new NextRequest(
      "http://localhost:3000/api/auth/login",
      {
        method: "POST",
        body: formData,
      },
    );

    const res = await loginUser(reqFormAttack);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("FORBIDDEN");
    expect(body.error.message).toContain(
      "missing trusted proxy or IAP boundary",
    );
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("END-TO-END NEGATIVE TEST: rejects role escalation when ops-viewer actor attempts to claim bank_finance in POST /api/auth/login (403 Forbidden) and prevents statement export", async () => {
    const reqEscalation = new NextRequest(
      "http://localhost:3000/api/auth/login",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [TRUSTED_PROXY_HEADER]: DEFAULT_TEST_PROXY_SECRET,
          "x-authenticated-user-email": "opsViewer@ctbc.demo",
        },
        body: JSON.stringify({
          bank: "ctbc",
          locale: "zh",
          role: "bank_finance",
        }),
      },
    );
    const resEscalation = await loginUser(reqEscalation);
    expect(resEscalation.status).toBe(403);
    const escalationBody = await resEscalation.json();
    expect(escalationBody.error.code).toBe("FORBIDDEN");
    expect(escalationBody.error.message).toContain("Role escalation rejected");

    const reqOpsLogin = new NextRequest(
      "http://localhost:3000/api/auth/login",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [TRUSTED_PROXY_HEADER]: DEFAULT_TEST_PROXY_SECRET,
          "x-authenticated-user-email": "opsViewer@ctbc.demo",
        },
        body: JSON.stringify({
          bank: "ctbc",
          locale: "zh",
          role: "bank_ops_viewer",
        }),
      },
    );
    const resOpsLogin = await loginUser(reqOpsLogin);
    expect(resOpsLogin.status).toBe(303);
    const setCookie = resOpsLogin.headers.get("set-cookie") || "";
    const sessionMatch = setCookie.match(/drts_bank_console_session=([^;]+)/);
    expect(sessionMatch).not.toBeNull();
    const opsSessionToken = sessionMatch![1];

    const reqOpsExport = new NextRequest(
      "http://localhost:3000/api/statements/export?bank=ctbc&role=bank_finance",
      { headers: { cookie: `drts_bank_console_session=${opsSessionToken}` } },
    );
    const resOpsExport = await exportAllCsv(reqOpsExport);
    expect(resOpsExport.status).toBe(403);
  });

  it("END-TO-END NEGATIVE TEST: rejects verified IAP JWT assertion with unknown role claim (e.g. role=auditor) (403 Forbidden) and prevents export session creation", async () => {
    const token = jwt.sign(
      {
        sub: "auditor-user-1",
        email: "auditor@ctbc.demo",
        tenant: "ctbc",
        role: "auditor",
        iss: "https://cloud.google.com/iap",
      },
      "drts_bank_test_iap_jwt_secret_key_2026",
    );
    const req = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-iap-jwt-assertion": token,
      },
      body: JSON.stringify({
        bank: "ctbc",
        locale: "zh",
        role: "bank_program_admin",
      }),
    });
    const res = await loginUser(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("FORBIDDEN");
    expect(body.error.message).toContain(
      "unrecognized role claim in verified IAP JWT assertion",
    );
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("END-TO-END NEGATIVE TEST: rejects request with unrecognized x-authenticated-role header (e.g. auditor) (403 Forbidden)", async () => {
    const req = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [TRUSTED_PROXY_HEADER]: DEFAULT_TEST_PROXY_SECRET,
        "x-authenticated-user-email": "user@ctbc.demo",
        "x-authenticated-role": "auditor",
      },
      body: JSON.stringify({
        bank: "ctbc",
        locale: "zh",
        role: "bank_program_admin",
      }),
    });
    const res = await loginUser(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("FORBIDDEN");
    expect(body.error.message).toContain(
      "unrecognized role in x-authenticated-role header",
    );
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("uses ephemeral random secret when NODE_ENV is not test and secret env vars are omitted", () => {
    const origEnv = process.env.NODE_ENV;
    try {
      (process.env as Record<string, string | undefined>).NODE_ENV =
        "production";
      delete process.env.BANK_SESSION_SECRET;
      delete process.env.SESSION_SECRET;
      const token = signSessionRole("bank_finance", "ctbc");
      expect(token).toBeDefined();
      expect(token).not.toContain(
        "drts_bank_console_server_session_secret_2026_key",
      );
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = origEnv;
    }
  });

  it("returns 404 NOT_FOUND for unknown statement artifact IDs", async () => {
    const signedFinance = signSessionRole("bank_finance", "ctbc");
    const reqStmt = new NextRequest(
      "http://localhost:3000/artifacts/statements/unknown-statement-999.pdf?bank=ctbc",
      { headers: { cookie: `drts_bank_console_session=${signedFinance}` } },
    );
    const resStmt = await getStatementArtifact(reqStmt, {
      params: Promise.resolve({ id: "unknown-statement-999.pdf" }),
    });

    expect(resStmt.status).toBe(404);
    const body = await resStmt.json();
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.message).toContain("Statement not found");
  });

  it("returns 404 NOT_FOUND for unknown trip artifact IDs without manufacturing fallbacks", async () => {
    const signedFinance = signSessionRole("bank_finance", "ctbc");
    const reqTrip = new NextRequest(
      "http://localhost:3000/artifacts/trips/unknown-trip-999.pdf?bank=ctbc",
      { headers: { cookie: `drts_bank_console_session=${signedFinance}` } },
    );
    const resTrip = await getTripArtifact(reqTrip, {
      params: Promise.resolve({ id: "unknown-trip-999.pdf" }),
    });

    expect(resTrip.status).toBe(404);
    const body = await resTrip.json();
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.message).toContain(
      "Trip artifact unknown-trip-999 not found",
    );
  });

  // ---------------------------------------------------------------------------
  // Four Negative Tests for Server Tenant Scope (Signed Session vs ?bank param)
  // ---------------------------------------------------------------------------

  it("1. exportAllCsv: derives cathay tenant from signed session when ?bank is omitted, and rejects mismatch ?bank=ctbc (403)", async () => {
    const signedCathay = signSessionRole("bank_finance", "cathay");

    // Omit ?bank -> target tenant derived from session as cathay
    const reqOmitted = new NextRequest(
      "http://localhost:3000/api/statements/export?role=bank_finance",
      { headers: { cookie: `drts_bank_console_session=${signedCathay}` } },
    );
    const resOmitted = await exportAllCsv(reqOmitted);
    expect(resOmitted.status).toBe(200);
    const csvText = await resOmitted.text();
    expect(csvText).toContain("settlement-statement-tenant-cathay-001-2026-08");
    expect(csvText).toContain("1500"); // Cathay issuer payable total in major units

    // Mismatched ?bank=ctbc -> 403 Forbidden
    const reqMismatch = new NextRequest(
      "http://localhost:3000/api/statements/export?bank=ctbc&role=bank_finance",
      { headers: { cookie: `drts_bank_console_session=${signedCathay}` } },
    );
    const resMismatch = await exportAllCsv(reqMismatch);
    expect(resMismatch.status).toBe(403);
    const bodyMismatch = await resMismatch.json();
    expect(bodyMismatch.error.code).toBe("FORBIDDEN");
    expect(bodyMismatch.error.message).toContain("Tenant scope mismatch");
  });

  it("2. exportPeriodCsv: derives cathay tenant from signed session when ?bank is omitted, and rejects mismatch ?bank=ctbc (403)", async () => {
    const signedCathay = signSessionRole("bank_finance", "cathay");

    // Omit ?bank -> target tenant derived from session as cathay
    const reqOmitted = new NextRequest(
      "http://localhost:3000/api/statements/2026-08/export?role=bank_finance",
      { headers: { cookie: `drts_bank_console_session=${signedCathay}` } },
    );
    const resOmitted = await exportPeriodCsv(reqOmitted, {
      params: Promise.resolve({ period: "2026-08" }),
    });
    expect(resOmitted.status).toBe(200);
    const csvText = await resOmitted.text();
    expect(csvText).toContain("trip_cathay_260601_001");

    // Mismatched ?bank=ctbc -> 403 Forbidden
    const reqMismatch = new NextRequest(
      "http://localhost:3000/api/statements/2026-08/export?bank=ctbc&role=bank_finance",
      { headers: { cookie: `drts_bank_console_session=${signedCathay}` } },
    );
    const resMismatch = await exportPeriodCsv(reqMismatch, {
      params: Promise.resolve({ period: "2026-08" }),
    });
    expect(resMismatch.status).toBe(403);
    const bodyMismatch = await resMismatch.json();
    expect(bodyMismatch.error.code).toBe("FORBIDDEN");
    expect(bodyMismatch.error.message).toContain("Tenant scope mismatch");
  });

  it("3. getStatementArtifact: derives cathay tenant from signed session when ?bank is omitted, and rejects mismatch ?bank=ctbc (403)", async () => {
    const signedCathay = signSessionRole("bank_finance", "cathay");

    // Omit ?bank -> target tenant derived from session as cathay
    const reqOmitted = new NextRequest(
      "http://localhost:3000/artifacts/statements/settlement-statement-tenant-cathay-001-2026-08.pdf?role=bank_finance",
      { headers: { cookie: `drts_bank_console_session=${signedCathay}` } },
    );
    const resOmitted = await getStatementArtifact(reqOmitted, {
      params: Promise.resolve({
        id: "settlement-statement-tenant-cathay-001-2026-08.pdf",
      }),
    });
    expect(resOmitted.status).toBe(200);
    const text = await resOmitted.text();
    expect(text).toContain("國泰世華銀行");
    expect(text).toContain("tenant-cathay-001");

    // Mismatched ?bank=ctbc -> 403 Forbidden
    const reqMismatch = new NextRequest(
      "http://localhost:3000/artifacts/statements/settlement-statement-tenant-cathay-001-2026-08.pdf?bank=ctbc&role=bank_finance",
      { headers: { cookie: `drts_bank_console_session=${signedCathay}` } },
    );
    const resMismatch = await getStatementArtifact(reqMismatch, {
      params: Promise.resolve({
        id: "settlement-statement-tenant-cathay-001-2026-08.pdf",
      }),
    });
    expect(resMismatch.status).toBe(403);
    const bodyMismatch = await resMismatch.json();
    expect(bodyMismatch.error.code).toBe("FORBIDDEN");
    expect(bodyMismatch.error.message).toContain("Tenant scope mismatch");
  });

  it("4. getTripArtifact: derives cathay tenant from signed session when ?bank is omitted, and rejects mismatch ?bank=ctbc (403)", async () => {
    const signedCathay = signSessionRole("bank_finance", "cathay");

    // Omit ?bank -> target tenant derived from session as cathay
    const reqOmitted = new NextRequest(
      "http://localhost:3000/artifacts/trips/trip_cathay_260601_001.pdf?role=bank_finance",
      { headers: { cookie: `drts_bank_console_session=${signedCathay}` } },
    );
    const resOmitted = await getTripArtifact(reqOmitted, {
      params: Promise.resolve({ id: "trip_cathay_260601_001.pdf" }),
    });
    expect(resOmitted.status).toBe(200);
    const text = await resOmitted.text();
    expect(text).toContain("國泰世華銀行");
    expect(text).toContain("trip_cathay_260601_001");

    // Mismatched ?bank=ctbc -> 403 Forbidden
    const reqMismatch = new NextRequest(
      "http://localhost:3000/artifacts/trips/trip_cathay_260601_001.pdf?bank=ctbc&role=bank_finance",
      { headers: { cookie: `drts_bank_console_session=${signedCathay}` } },
    );
    const resMismatch = await getTripArtifact(reqMismatch, {
      params: Promise.resolve({ id: "trip_cathay_260601_001.pdf" }),
    });
    expect(resMismatch.status).toBe(403);
    const bodyMismatch = await resMismatch.json();
    expect(bodyMismatch.error.code).toBe("FORBIDDEN");
    expect(bodyMismatch.error.message).toContain("Tenant scope mismatch");
  });

  it("rejects invalid bank tenant code parameter for unauthenticated export requests (400 Bad Request)", async () => {
    const reqInvalid = new NextRequest(
      "http://localhost:3000/api/statements/export?bank=invalid_bank_code",
    );
    const resInvalid = await exportAllCsv(reqInvalid);
    expect(resInvalid.status).toBe(400);
    const bodyInvalid = await resInvalid.json();
    expect(bodyInvalid.error.code).toBe("BAD_REQUEST");
    expect(bodyInvalid.error.message).toContain(
      "Missing or invalid bank tenant",
    );
  });

  it("fails closed on login route when verified IAP JWT has an unknown role claim (e.g. role=auditor)", async () => {
    const iapSecret = "drts_bank_test_iap_jwt_secret_key_2026";
    const iapToken = jwt.sign(
      {
        sub: "auditor@ctbcbank.com",
        tenant: "ctbc",
        role: "auditor",
        iss: "https://cloud.google.com/iap",
      },
      iapSecret,
    );

    const loginReq = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-iap-jwt-assertion": iapToken,
      },
      body: JSON.stringify({ bank: "ctbc", locale: "zh" }),
    });

    const res = await loginUser(loginReq);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("FORBIDDEN");
    expect(body.error.message).toContain("unrecognized role claim");
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("fails closed on login route when x-authenticated-role header is an unknown role", async () => {
    const loginReq = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-trusted-proxy-secret": DEFAULT_TEST_PROXY_SECRET,
        "x-authenticated-role": "auditor",
      },
      body: JSON.stringify({ bank: "ctbc", locale: "zh" }),
    });

    const res = await loginUser(loginReq);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("FORBIDDEN");
    expect(body.error.message).toContain(
      "unrecognized role in x-authenticated-role header",
    );
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("rejects statement export when role parameter is an unknown role (e.g. ?role=auditor)", async () => {
    const req = new NextRequest(
      "http://localhost:3000/api/statements/export?bank=ctbc&role=auditor",
    );
    const res = await exportAllCsv(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("FORBIDDEN");
  });
});
