import { describe, it, expect, vi } from "vitest";

vi.mock("@playwright/test", () => ({
  test: Object.assign(vi.fn(), { describe: vi.fn(), afterEach: vi.fn(), afterAll: vi.fn(), fn: vi.fn(), step: vi.fn() }),
  expect: expect,
}));

import { runInvoiceMailPreflight } from "../../../../tests/e2e/system-remediation/sr-live-invoice-mail-20261007/live-invoice-mail.spec";

describe("F2/F4/F6 spec guards", () => {
  it("throws on invoice fixture mismatch", async () => {
    const request = {
      get: vi.fn().mockResolvedValue({
        status: () => 200,
        json: async () => ({ data: { tenantId: "wrong", invoiceId: "wrong" } })
      })
    };
    const evidenceData = { httpCalls: [], unimplementedLiveSurfaces: [] };
    await expect(runInvoiceMailPreflight(request, { apiOrigin: "http://test", sessionToken: "token", tenantId: "tenant", authorizedRecipient: "test@test.com", invoiceId: "invoice" }, evidenceData)).rejects.toThrow("Invoice fixture does not belong");
  });

  it("throws on billing profile mismatch and performs zero sends", async () => {
    const request = {
      get: vi.fn().mockImplementation(async (url) => {
        if (url.includes("billing/profile")) {
          return { status: () => 200, json: async () => ({ data: { email: "wrong@wrong.com" } }) };
        }
        return { status: () => 200, json: async () => ({ data: { tenantId: "tenant", invoiceId: "invoice", items: [{invoiceId: "invoice"}] } }) };
      }),
      post: vi.fn() // The mail sending mock
    };
    const evidenceData = { httpCalls: [], unimplementedLiveSurfaces: [], errors: [] };
    process.env.DRTS_LIVE_INVOICE_MAIL_TEST_AUTHORIZED = "true";
    await expect(runInvoiceMailPreflight(request, { apiOrigin: "http://test", sessionToken: "token", tenantId: "tenant", authorizedRecipient: "test@test.com", invoiceId: "invoice" }, evidenceData)).rejects.toThrow("Billing profile email does not match authorized recipient");
    expect(request.post).not.toHaveBeenCalled(); // zero sends
  });
});
