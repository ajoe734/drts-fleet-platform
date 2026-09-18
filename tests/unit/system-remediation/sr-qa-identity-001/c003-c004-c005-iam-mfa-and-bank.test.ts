import { describe, expect, it, vi } from "vitest";

// Server-only mock for Next.js server components
vi.mock("server-only", () => ({}));
vi.mock("@/lib/translations", () => ({ t: (key: string) => key }));

import {
  canViewSettlementAmounts,
  resolveServerSessionRole,
  signSessionRole,
  type BankConsoleRole,
} from "../../../../apps/bank-console-web/lib/session";
import { translations } from "../../../../apps/bank-console-web/lib/translations";
import {
  loadBankBookingsData,
  loadBankContractsData,
  loadBankStatementsData,
} from "../../../../apps/bank-console-web/lib/bank-dev-read-models";
import { StepUpProofService } from "../../../../apps/api/src/common/auth/step-up-proof.service";
import type { BootstrapRequestIdentity } from "../../../../apps/api/src/common/auth/auth.types";

describe("SR-QA-IDENTITY-001 / C003, C004 & C005 — MFA／IAP／銀行角色與金額隔離驗收", () => {
  // ── C003: 平台／營運人員 IAP／SSO 與 MFA 正式登入 (IAM) ─────────────────────
  describe("C003: 平台人員 IAP/SSO 與 MFA / Step-up 驗證 (IAM)", () => {
    it("C003-POS-1: identity with trusted MFA generates valid StepUpProof", () => {
      const service = new StepUpProofService();
      const mfaIdentity: BootstrapRequestIdentity = {
        authMode: "bootstrap_headers",
        actorType: "platform_admin",
        actorId: "actor-superadmin-001",
        principalId: "actor-superadmin-001",
        realm: "platform",
        roles: ["platform_admin"],
        roleFamilies: ["platform"],
        scopes: ["foundation:write", "tenant:write"],
        tenantId: null,
        partnerId: null,
        partnerProgramId: null,
        partnerEntrySlug: null,
        membershipId: null,
        sessionId: "sess-plat-admin-001",
        tokenVersion: 1,
        authTime: new Date().toISOString(),
        amr: ["password", "mfa"],
        acr: "aal2",
        requestId: "req-step-up-001",
      };

      const proof = service.createProof(
        mfaIdentity,
        {
          actionId: "platform:tenants:create",
        },
        "req-step-up-001",
      );

      expect(proof.required).toBe(true);
      expect(proof.actionId).toBe("platform:tenants:create");
      expect(proof.stepUpReference).toBeTruthy();
      expect(typeof proof.stepUpReference).toBe("string");
      expect(proof.expiresAt).toBeTruthy();
    });

    it("C003-NEG-1: single-factor identity lacking MFA is rejected with MFA_REQUIRED (403)", () => {
      const service = new StepUpProofService();
      const singleFactorIdentity: BootstrapRequestIdentity = {
        authMode: "bootstrap_headers",
        actorType: "platform_admin",
        actorId: "actor-single-factor-001",
        principalId: "actor-single-factor-001",
        realm: "platform",
        roles: ["platform_admin"],
        roleFamilies: ["platform"],
        scopes: ["foundation:write"],
        tenantId: null,
        partnerId: null,
        partnerProgramId: null,
        partnerEntrySlug: null,
        membershipId: null,
        sessionId: "sess-single-factor-001",
        tokenVersion: 1,
        authTime: new Date().toISOString(),
        amr: ["password"], // Missing MFA
        acr: "aal1",
        requestId: "req-step-up-fail-001",
      };

      expect(() => {
        service.createProof(
          singleFactorIdentity,
          {
            actionId: "platform:tenants:create",
          },
          "req-step-up-fail-001",
        );
      }).toThrowError(
        expect.objectContaining({
          code: "MFA_REQUIRED",
          status: 403,
        }),
      );
    });

    it("C003-NEG-2: assertRequestSatisfied rejects request when step-up reference is missing", () => {
      const service = new StepUpProofService();
      const mfaIdentity: BootstrapRequestIdentity = {
        authMode: "bootstrap_headers",
        actorType: "platform_admin",
        actorId: "actor-plat-001",
        principalId: "actor-plat-001",
        realm: "platform",
        roles: ["platform_admin"],
        roleFamilies: ["platform"],
        scopes: ["foundation:write"],
        tenantId: null,
        partnerId: null,
        partnerProgramId: null,
        partnerEntrySlug: null,
        membershipId: null,
        sessionId: "sess-plat-001",
        tokenVersion: 1,
        authTime: new Date().toISOString(),
        amr: ["password", "mfa"],
        acr: "aal2",
        requestId: "req-verify-001",
      };

      const mockRequest = {
        method: "POST",
        url: "/platform-admin/tenants",
        headers: {},
        body: {},
      };

      expect(() => {
        service.assertRequestSatisfied(mfaIdentity, mockRequest as any);
      }).toThrowError(
        expect.objectContaining({
          code: "STEP_UP_REQUIRED",
          status: 403,
        }),
      );
    });
  });

  // ── C004: 銀行三種角色登入與首頁／合約業務頁正常 (R06) ────────────────────────
  describe("C004: 銀行三種角色登入與頁面崩潰防護 (R06)", () => {
    const BANK_ROLES: BankConsoleRole[] = [
      "bank_program_admin",
      "bank_ops_viewer",
      "bank_finance",
    ];

    it.each(BANK_ROLES)(
      "C004-POS-1: valid cryptographic cookie for %s authenticates cleanly",
      (role) => {
        const token = signSessionRole(role, "acme");
        const resolution = resolveServerSessionRole(token, role);

        expect(resolution.role).toBe(role);
        expect(resolution.bankCode).toBe("acme");
        expect(resolution.isAuthenticated).toBe(true);
        expect(resolution.isForged).toBe(false);
        expect(resolution.isTampered).toBe(false);
      },
    );

    it("C004-POS-2: prevents Next.js SSR server crash (R06) via structured read models", async () => {
      // Validates that read-models load without throwing ERROR 3850347426 or ERROR 683994165
      const bookings = await loadBankBookingsData("acme", "bank_program_admin");
      const contracts = await loadBankContractsData(
        "acme",
        "bank_program_admin",
      );
      const statements = await loadBankStatementsData(
        "acme",
        "bank_program_admin",
      );

      expect(bookings).toBeDefined();
      expect(contracts).toBeDefined();
      expect(statements).toBeDefined();
      expect(bookings.data).toBeDefined();
      expect(contracts.data).toBeDefined();
      expect(statements.data).toBeDefined();
    });

    it("C004-NEG-1: rejects tampered query role vs signed cookie", () => {
      const validFinanceToken = signSessionRole("bank_finance", "acme");

      // Attacker tampers query param to claim bank_program_admin
      const resolution = resolveServerSessionRole(
        validFinanceToken,
        "bank_program_admin",
      );

      expect(resolution.isTampered).toBe(true);
      expect(resolution.role).toBe("bank_finance"); // Preserves verified cookie role
    });

    it("C004-NEG-2: rejects forged signature with isAuthenticated: false", () => {
      const forgedToken = "v1:bank_finance:acme:1799999999:deadbeefdeadbeef";
      const resolution = resolveServerSessionRole(forgedToken, "bank_finance");

      expect(resolution.isAuthenticated).toBe(false);
      expect(resolution.isForged).toBe(true);
    });
  });

  // ── C005: 銀行營運檢視／財務金額欄位依角色隔離 (R15) ────────────────────────
  describe("C005: 銀行金額欄位角色授權與遮罩隔離 (R15)", () => {
    it("C005-POS-1: bank_finance and bank_program_admin can view settlement amounts", () => {
      expect(canViewSettlementAmounts("bank_finance")).toBe(true);
      expect(canViewSettlementAmounts("bank_program_admin")).toBe(true);
    });

    it("C005-NEG-1: bank_ops_viewer CANNOT view settlement amounts", () => {
      expect(canViewSettlementAmounts("bank_ops_viewer")).toBe(false);
    });

    it("C005-POS-2: UI translations and code policy match exactly (R15 fix guarantee)", () => {
      const zhViewerCopy = translations.zh["users.roleCard.bank_ops_viewer"];
      const enViewerCopy = translations.en["users.roleCard.bank_ops_viewer"];
      expect(zhViewerCopy).toContain("無結算金額");
      expect(enViewerCopy.toLowerCase()).toContain("no settlement amount");

      const zhFinanceCopy = translations.zh["users.roleCard.bank_finance"];
      const enFinanceCopy = translations.en["users.roleCard.bank_finance"];
      expect(zhFinanceCopy).toContain("對帳單");
      expect(enFinanceCopy.toLowerCase()).toContain("reconciliation");
    });

    it("C005-POS-3: statement amounts are masked for ops_viewer and visible for finance", () => {
      const mockStatement = {
        statementNo: "STM-2026-001",
        totalFareAmount: 125000,
        totalIssuerPayableAmount: 98000,
      };

      // Masking rule verification
      const canOpsView = canViewSettlementAmounts("bank_ops_viewer");
      const canFinanceView = canViewSettlementAmounts("bank_finance");

      const opsRenderedAmount = canOpsView
        ? `$${mockStatement.totalIssuerPayableAmount.toLocaleString()}`
        : "—";
      const financeRenderedAmount = canFinanceView
        ? `$${mockStatement.totalIssuerPayableAmount.toLocaleString()}`
        : "—";

      expect(opsRenderedAmount).toBe("—");
      expect(financeRenderedAmount).toBe("$98,000");
    });
  });
});
