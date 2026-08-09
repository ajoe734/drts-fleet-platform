import { describe, expect, it } from "vitest";
import {
  canExportBankStatements,
  resolveBankConsoleRole,
} from "../../lib/session";

describe("canExportBankStatements", () => {
  it("denies export for the read-only ops viewer role", () => {
    expect(canExportBankStatements("bank_ops_viewer")).toBe(false);
  });

  it("permits export for finance", () => {
    expect(canExportBankStatements("bank_finance")).toBe(true);
  });

  it("permits export for the program admin", () => {
    expect(canExportBankStatements("bank_program_admin")).toBe(true);
  });
});

describe("resolveBankConsoleRole", () => {
  it("resolves the ops alias to bank_ops_viewer", () => {
    expect(resolveBankConsoleRole("ops")).toBe("bank_ops_viewer");
    expect(resolveBankConsoleRole("viewer")).toBe("bank_ops_viewer");
  });

  it("resolves the finance alias to bank_finance", () => {
    expect(resolveBankConsoleRole("finance")).toBe("bank_finance");
  });

  it("falls back to bank_program_admin for unknown or missing role values", () => {
    expect(resolveBankConsoleRole(undefined)).toBe("bank_program_admin");
    expect(resolveBankConsoleRole("not-a-real-role")).toBe(
      "bank_program_admin",
    );
  });
});
