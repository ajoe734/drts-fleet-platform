import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// lib/demo-tenants.ts (imported transitively by lib/session.ts) still
// resolves its own translations through the Next.js "@/lib/translations"
// path alias, which only the app-local (Next.js) build/test config knows how
// to map. The root Vitest config used by this task's required check command
// (`pnpm exec vitest run tests/unit/system-remediation/sr-bank-002/`) has no
// such alias, so a lightweight passthrough keeps the import graph resolvable
// without needing to touch demo-tenants.ts (out of SR-BANK-002 write scope).
// lib/session.ts's own `t` calls resolve through its *relative*
// "./translations" import (in write scope) and are therefore unaffected —
// this mock is only ever hit for demo-tenants.ts's copy, which none of the
// assertions below depend on.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/translations", () => ({ t: (key: string) => key }));

import {
  canViewSettlementAmounts,
  resolveServerSessionRole,
  signSessionRole,
  type BankConsoleRole,
} from "../../../../apps/bank-console-web/lib/session";
import { translations } from "../../../../apps/bank-console-web/lib/translations";
import { loadBankStatementsData } from "../../../../apps/bank-console-web/lib/bank-dev-read-models";

const BANK_CONSOLE_ROLES: BankConsoleRole[] = [
  "bank_program_admin",
  "bank_ops_viewer",
  "bank_finance",
];

const STATEMENTS_PAGE_SRC = readFileSync(
  join(__dirname, "../../../../apps/bank-console-web/app/statements/page.tsx"),
  "utf8",
);
const STATEMENT_DETAIL_PAGE_SRC = readFileSync(
  join(
    __dirname,
    "../../../../apps/bank-console-web/app/statements/[period]/page.tsx",
  ),
  "utf8",
);
const USERS_PAGE_SRC = readFileSync(
  join(__dirname, "../../../../apps/bank-console-web/app/users/page.tsx"),
  "utf8",
);

describe("SR-BANK-002: Bank role amount / PII / export consistent isolation (R15)", () => {
  describe("1. canViewSettlementAmounts — three-role matrix", () => {
    it("bank_program_admin and bank_finance may view settlement amounts", () => {
      expect(canViewSettlementAmounts("bank_program_admin")).toBe(true);
      expect(canViewSettlementAmounts("bank_finance")).toBe(true);
    });

    it("bank_ops_viewer may not view settlement amounts", () => {
      expect(canViewSettlementAmounts("bank_ops_viewer")).toBe(false);
    });
  });

  describe("2. Role copy matches enforced policy (the R15 defect)", () => {
    it("users.roleCard.bank_ops_viewer claims no settlement-amount access, and code enforcement agrees", () => {
      const enCopy = translations.en["users.roleCard.bank_ops_viewer"];
      const zhCopy = translations.zh["users.roleCard.bank_ops_viewer"];
      expect(enCopy.toLowerCase()).toContain("no settlement amount");
      expect(zhCopy).toContain("無結算金額");
      expect(canViewSettlementAmounts("bank_ops_viewer")).toBe(false);
    });

    it("users.roleCard.bank_finance claims settlement/statement access, and code enforcement agrees", () => {
      const enCopy = translations.en["users.roleCard.bank_finance"];
      expect(enCopy.toLowerCase()).toContain("settlement");
      expect(canViewSettlementAmounts("bank_finance")).toBe(true);
    });
  });

  describe("3. resolveServerSessionRole — real-session vs. query-param tampering, three-role matrix", () => {
    it.each(BANK_CONSOLE_ROLES)(
      "valid signed %s cookie matching the query role authenticates cleanly",
      (role) => {
        const token = signSessionRole(role, "ctbc");
        const result = resolveServerSessionRole(token, role);
        expect(result.role).toBe(role);
        expect(result.bankCode).toBe("ctbc");
        expect(result.isAuthenticated).toBe(true);
        expect(result.isForged).toBe(false);
        expect(result.isTampered).toBe(false);
        expect(result.isAuthorizedForExport).toBe(
          role === "bank_finance" || role === "bank_program_admin",
        );
      },
    );

    it("an unsigned/forged cookie is never authenticated, regardless of requested role", () => {
      for (const role of BANK_CONSOLE_ROLES) {
        const result = resolveServerSessionRole(
          `${role}:ctbc`, // no HMAC suffix
          role,
        );
        expect(result.isForged).toBe(true);
        expect(result.isAuthenticated).toBe(false);
        expect(result.isAuthorizedForExport).toBe(false);
      }
    });

    it("a tampered signature (flipped hex digest) is rejected", () => {
      const token = signSessionRole("bank_finance", "ctbc");
      const [payload] = token.split(".");
      const tamperedToken = `${payload}.${"0".repeat(64)}`;
      const result = resolveServerSessionRole(tamperedToken, "bank_finance");
      expect(result.isForged).toBe(true);
      expect(result.isAuthenticated).toBe(false);
      expect(result.isAuthorizedForExport).toBe(false);
    });

    it("an authenticated ops-viewer session cannot escalate to finance by tampering the query role param", () => {
      const opsToken = signSessionRole("bank_ops_viewer", "ctbc");
      const result = resolveServerSessionRole(opsToken, "bank_finance");
      // Real signed session identity wins; the query string is untrusted input.
      expect(result.role).toBe("bank_ops_viewer");
      expect(result.isTampered).toBe(true);
      expect(result.isAuthorizedForExport).toBe(false);
    });

    it("a mismatched query role denies export even when the real signed session is privileged (finance)", () => {
      const financeToken = signSessionRole("bank_finance", "ctbc");
      const result = resolveServerSessionRole(financeToken, "bank_ops_viewer");
      // The authenticated identity (finance) still wins for *display* role...
      expect(result.role).toBe("bank_finance");
      expect(result.isTampered).toBe(true);
      // ...but any cookie/query mismatch is treated as suspicious and denies
      // export authorization outright, even though the cookie alone would
      // qualify. Fail closed on tampering rather than trusting either side.
      expect(result.isAuthorizedForExport).toBe(false);
    });

    it("an unauthenticated request cannot buy export authorization by supplying ?role=bank_finance alone", () => {
      const result = resolveServerSessionRole(undefined, "bank_finance");
      expect(result.role).toBe("bank_finance");
      expect(result.isAuthenticated).toBe(false);
      expect(result.isAuthorizedForExport).toBe(false);
    });

    it("with no cookie and no query role, the session defaults to the least-privileged ops viewer", () => {
      const result = resolveServerSessionRole(undefined, undefined);
      expect(result.role).toBe("bank_ops_viewer");
      expect(result.isAuthorizedForExport).toBe(false);
    });
  });

  describe("4. Data layer still returns real amounts for every role (masking is a presentation-layer duty)", () => {
    it.each(BANK_CONSOLE_ROLES)(
      "loadBankStatementsData does not pre-filter totals by role (%s) — the page must gate rendering",
      async (role) => {
        const result = await loadBankStatementsData("tenant-demo-001", role);
        expect(Array.isArray(result.data.statements)).toBe(true);
        expect(result.data.statements.length).toBeGreaterThan(0);
        expect(
          result.data.statements[0]!.totalIssuerPayableAmount,
        ).toBeGreaterThan(0);
      },
    );
  });

  describe("5. Statement pages must route every amount cell through the role gate (source contract)", () => {
    it("app/statements/page.tsx never calls formatCurrency(...) directly for a statement amount", () => {
      // The only bare formatCurrency(...) call allowed is inside
      // formatAmountForRole's own definition; every render call-site must go
      // through formatAmountForRole so bank_ops_viewer never receives the
      // real figure in the HTML response.
      const rawAmountCalls = STATEMENTS_PAGE_SRC.match(
        /(?<!function formatAmountForRole\([\s\S]{0,80})formatCurrency\(\s*(statement|totalIssuerPaid)/g,
      );
      expect(rawAmountCalls).toBeNull();
      expect(STATEMENTS_PAGE_SRC).toContain("function formatAmountForRole(");
      expect(STATEMENTS_PAGE_SRC).toContain("canViewSettlementAmounts");
      const gatedCallSites =
        STATEMENTS_PAGE_SRC.match(/formatAmountForRole\(/g) ?? [];
      // strip page display total (strip stat), KPI card, and per-row cell.
      expect(gatedCallSites.length).toBeGreaterThanOrEqual(3);
    });

    it("app/statements/[period]/page.tsx never calls formatCurrency(...) directly for a statement or trip amount", () => {
      const rawAmountCalls = STATEMENT_DETAIL_PAGE_SRC.match(
        /(?<!function formatAmountForRole\([\s\S]{0,80})formatCurrency\(\s*(statement|trip)\./g,
      );
      expect(rawAmountCalls).toBeNull();
      expect(STATEMENT_DETAIL_PAGE_SRC).toContain(
        "function formatAmountForRole(",
      );
      const gatedCallSites =
        STATEMENT_DETAIL_PAGE_SRC.match(/formatAmountForRole\(/g) ?? [];
      // 4 statement-level totals + 3 per-trip columns.
      expect(gatedCallSites.length).toBeGreaterThanOrEqual(7);
    });

    it("the restricted-amount placeholder never contains a digit (cannot leak a real figure length/shape)", () => {
      for (const src of [STATEMENTS_PAGE_SRC, STATEMENT_DETAIL_PAGE_SRC]) {
        const match = src.match(/RESTRICTED_AMOUNT_PLACEHOLDER = "([^"]+)"/);
        expect(match).not.toBeNull();
        expect(match![1]).not.toMatch(/\d/);
      }
    });
  });

  describe("6. /users page derives role from the real signed session, not a spoofable query param (source contract)", () => {
    it("imports and calls resolveServerSessionRole instead of trusting params.role directly", () => {
      expect(USERS_PAGE_SRC).toContain("resolveServerSessionRole");
      expect(USERS_PAGE_SRC).toContain(
        "getBankConsoleSession(tenant, locale, sessionRole)",
      );
      expect(USERS_PAGE_SRC).not.toContain(
        "getBankConsoleSession(tenant, locale, params?.role)",
      );
    });
  });
});
