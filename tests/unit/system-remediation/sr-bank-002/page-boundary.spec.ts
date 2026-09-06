import { beforeEach, describe, expect, it, vi } from "vitest";
import React from "../../../../apps/bank-console-web/node_modules/react";
import { renderToStaticMarkup } from "../../../../apps/bank-console-web/node_modules/react-dom/server";

vi.mock("server-only", () => ({}));

const boundary = vi.hoisted(() => ({ cookie: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => boundary.cookie ? { value: boundary.cookie } : undefined }),
}));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/lib/bank-dev-read-models", () => ({
  loadBankStatementsData: vi.fn(),
  loadBankUsersData: vi.fn(),
}));

import { signSessionRole, type BankConsoleRole } from "../../../../apps/bank-console-web/lib/session";
import { loadBankStatementsData, loadBankUsersData } from "@/lib/bank-dev-read-models";
import StatementsPage from "../../../../apps/bank-console-web/app/statements/page";
import StatementDetailPage from "../../../../apps/bank-console-web/app/statements/[period]/page";
import UsersPage from "../../../../apps/bank-console-web/app/users/page";

// Synthetic sentinels test disclosure only; they are not live settlement evidence.
const statement = {
  period: "2026-03", statementNo: "sr-bank-002-statement", programLabel: "test program",
  issuedAt: "2026-03-01", dueAt: "2026-03-31", status: "published",
  totalFareAmount: 987654, totalSubsidisedAmount: 987654, totalPaidAmount: 0,
  totalIssuerPayableAmount: 987654, totalTrips: 0, trips: [],
  signedArtifactHref: "/artifacts/statements/sr-bank-002-statement.pdf",
};
const roles: BankConsoleRole[] = ["bank_program_admin", "bank_finance", "bank_ops_viewer"];

beforeEach(() => {
  vi.stubGlobal("React", React);
  boundary.cookie = undefined;
  vi.clearAllMocks();
  vi.mocked(loadBankStatementsData).mockResolvedValue({ data: { statements: [statement] }, degradedMessage: null });
  vi.mocked(loadBankUsersData).mockResolvedValue({
    data: { users: [{ name: "Private Directory User", email: "private@issuer.example", role: "bank_finance", status: "active", lastActivity: "2026-03-01" }] },
    degradedMessage: null,
  });
});

for (const role of roles) {
  describe(role, () => {
    for (const [name, page] of [
      ["list", (query: Record<string, string>) => StatementsPage({ searchParams: Promise.resolve(query) })],
      ["detail", (query: Record<string, string>) => StatementDetailPage({ params: Promise.resolve({ period: "2026-03" }), searchParams: Promise.resolve(query) })],
    ] as const) {
      it(`${name}: same-tenant amounts follow the signed role`, async () => {
        boundary.cookie = signSessionRole(role, "ctbc");
        const html = renderToStaticMarkup(await page({ bank: "ctbc", role, locale: "en" }));
        if (role === "bank_ops_viewer") {
          expect(loadBankStatementsData).not.toHaveBeenCalled();
          expect(html).not.toContain("987,654");
          expect(html).not.toContain("sr-bank-002-statement");
        } else {
          expect(loadBankStatementsData).toHaveBeenCalledWith("tenant-demo-001", role);
          expect(html).toContain("987,654");
        }
      });
      it(`${name}: cross-tenant requests stop before reading financial data`, async () => {
        boundary.cookie = signSessionRole(role, "ctbc");
        await expect(page({ bank: "cathay", role })).rejects.toThrow("NOT_FOUND");
        expect(loadBankStatementsData).not.toHaveBeenCalled();
      });
    }
    it("users: cross-tenant directory requests stop before reading PII", async () => {
      boundary.cookie = signSessionRole(role, "ctbc");
      await expect(UsersPage({ searchParams: Promise.resolve({ bank: "cathay", role }) })).rejects.toThrow("NOT_FOUND");
      expect(loadBankUsersData).not.toHaveBeenCalled();
    });
  });
}

for (const cookie of [undefined, "forged.cookie", "bank_program_admin"]) {
  it(`rejects privileged query without a verified session (${cookie})`, async () => {
    boundary.cookie = cookie;
    const query = Promise.resolve({ bank: "ctbc", role: "bank_program_admin" });
    await expect(StatementsPage({ searchParams: query })).rejects.toThrow("NOT_FOUND");
    await expect(StatementDetailPage({ params: Promise.resolve({ period: "2026-03" }), searchParams: query })).rejects.toThrow("NOT_FOUND");
    await expect(UsersPage({ searchParams: query })).rejects.toThrow("NOT_FOUND");
    expect(loadBankStatementsData).not.toHaveBeenCalled();
    expect(loadBankUsersData).not.toHaveBeenCalled();
  });
}

it("rejects role escalation before loading the directory", async () => {
  boundary.cookie = signSessionRole("bank_ops_viewer", "ctbc");
  await expect(UsersPage({ searchParams: Promise.resolve({ bank: "ctbc", role: "bank_program_admin" }) })).rejects.toThrow("NOT_FOUND");
  expect(loadBankUsersData).not.toHaveBeenCalled();
});

it("uses the signed tenant when the bank query is omitted and preserves authoritative email", async () => {
  boundary.cookie = signSessionRole("bank_program_admin", "cathay");
  const html = renderToStaticMarkup(await UsersPage({}));
  expect(loadBankUsersData).toHaveBeenCalledWith("tenant-cathay-001", "bank_program_admin");
  expect(html).toContain("private@issuer.example");
});
