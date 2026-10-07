import { describe, it, expect, vi } from "vitest";

vi.mock("@playwright/test", () => ({
  test: Object.assign(vi.fn(), { describe: vi.fn(), afterEach: vi.fn(), afterAll: vi.fn(), fn: vi.fn(), step: vi.fn() }),
  expect: expect,
}));

import { runInvoiceMailPreflight } from "../../../../tests/e2e/system-remediation/sr-live-invoice-mail-20261007/live-invoice-mail.spec";

describe("F2/F4/F6 spec guards", () => {
  it("throws on invoice fixture mismatch (wrong tenant)", async () => {
    const request = {
      get: vi.fn().mockResolvedValue({
        status: () => 200,
        json: async () => ({ data: { tenantId: "wrong", invoiceId: "invoice" } })
      })
    };
    const evidenceData = { httpCalls: [], unimplementedLiveSurfaces: [] };
    await expect(runInvoiceMailPreflight(request, { apiOrigin: "http://test", sessionToken: "token", tenantId: "tenant", authorizedRecipient: "test@test.com", invoiceId: "invoice" }, evidenceData)).rejects.toThrow("Invoice fixture does not belong");
  });

  it("throws on invoice fixture mismatch (wrong invoice)", async () => {
    const request = {
      get: vi.fn().mockResolvedValue({
        status: () => 200,
        json: async () => ({ data: { tenantId: "tenant", invoiceId: "wrong" } })
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

  it("passes legally positive runInvoiceMailPreflight case", async () => {
    const request = {
      get: vi.fn().mockImplementation(async (url) => {
        if (url.includes("billing/profile")) {
          return { status: () => 200, json: async () => ({ data: { email: "test@test.com" } }) };
        }
        if (!url.includes("invoice") || url.match(/[0-9a-f]{8}-[0-9a-f]{4}/)) { // A basic check for the random UUID generated
          return { status: () => 404, json: async () => ({}) };
        }
        return { status: () => 200, json: async () => ({ data: { tenantId: "tenant", invoiceId: "invoice", items: [{invoiceId: "invoice"}] } }) };
      }),
      post: vi.fn().mockResolvedValue({ status: () => 404, json: async () => ({}) })
    };
    const evidenceData = { httpCalls: [], unimplementedLiveSurfaces: [], errors: [] };
    process.env.DRTS_LIVE_INVOICE_MAIL_TEST_AUTHORIZED = "true";
    process.env.DRTS_LIVE_INVOICE_MAIL_EFFECTIVE_ALLOWLIST = "test.com";
    const result = await runInvoiceMailPreflight(request, { apiOrigin: "http://test", sessionToken: "token", tenantId: "tenant", authorizedRecipient: "test@test.com", invoiceId: "invoice" }, evidenceData);
    expect(result).toHaveProperty("invoiceData");
    expect(result).toHaveProperty("allowedEntries");
    expect(result.allowedEntries).toContain("test.com");
  });
});

import { runReadOnlyPreflight, runNonAllowlistPreflight } from "../../../../tests/e2e/system-remediation/sr-live-invoice-mail-20261007/live-invoice-mail.spec";

describe("F2/F4/F6 Read-only and non-allowlist guards", () => {
  it("throws on read-only mismatch and performs zero sends", async () => {
    const request = {
      get: vi.fn().mockImplementation(async (url) => {
        if (url.includes("auth/session")) return { status: () => 200, json: async () => ({ data: { identity: { scopes: ["tenant:billing:read"] } } }) };
        if (url.includes("billing/profile")) return { status: () => 200, json: async () => ({ data: { tenantId: "tenant-ro", email: "wrong@ro.com" } }) }; // mismatch here
        return { status: () => 200, json: async () => ({ data: { tenantId: "tenant-ro", invoiceId: "invoice-ro" } }) };
      }),
      post: vi.fn()
    };
    await expect(runReadOnlyPreflight(request, { apiOrigin: "http://test", readOnlyToken: "token", readOnlyTenantId: "tenant-ro", readOnlyInvoiceId: "invoice-ro", readOnlyRecipient: "ro@test.com" })).rejects.toThrow("Read-only recipient mismatch");
    expect(request.post).not.toHaveBeenCalled();
  });

  it("throws on read-only invoice fixture mismatch (wrong tenant)", async () => {
    const request = {
      get: vi.fn().mockImplementation(async (url) => {
        if (url.includes("auth/session")) return { status: () => 200, json: async () => ({ data: { identity: { scopes: ["tenant:billing:read"] } } }) };
        if (url.includes("billing/profile")) return { status: () => 200, json: async () => ({ data: { tenantId: "tenant-ro", email: "ro@test.com" } }) };
        return { status: () => 200, json: async () => ({ data: { tenantId: "wrong", invoiceId: "invoice-ro" } }) };
      }),
      post: vi.fn()
    };
    await expect(runReadOnlyPreflight(request, { apiOrigin: "http://test", readOnlyToken: "token", readOnlyTenantId: "tenant-ro", readOnlyInvoiceId: "invoice-ro", readOnlyRecipient: "ro@test.com" })).rejects.toThrow("Read-only invoice fixture mismatch");
    expect(request.post).not.toHaveBeenCalled();
  });

  it("throws on read-only invoice fixture mismatch (wrong invoice)", async () => {
    const request = {
      get: vi.fn().mockImplementation(async (url) => {
        if (url.includes("auth/session")) return { status: () => 200, json: async () => ({ data: { identity: { scopes: ["tenant:billing:read"] } } }) };
        if (url.includes("billing/profile")) return { status: () => 200, json: async () => ({ data: { tenantId: "tenant-ro", email: "ro@test.com" } }) };
        return { status: () => 200, json: async () => ({ data: { tenantId: "tenant-ro", invoiceId: "wrong" } }) };
      }),
      post: vi.fn()
    };
    await expect(runReadOnlyPreflight(request, { apiOrigin: "http://test", readOnlyToken: "token", readOnlyTenantId: "tenant-ro", readOnlyInvoiceId: "invoice-ro", readOnlyRecipient: "ro@test.com" })).rejects.toThrow("Read-only invoice fixture mismatch");
    expect(request.post).not.toHaveBeenCalled();
  });

  it("passes legally positive runReadOnlyPreflight case", async () => {
    const request = {
      get: vi.fn().mockImplementation(async (url) => {
        if (url.includes("auth/session")) return { status: () => 200, json: async () => ({ data: { identity: { scopes: ["tenant:billing:read"] } } }) };
        if (url.includes("billing/profile")) return { status: () => 200, json: async () => ({ data: { tenantId: "tenant-ro", email: "ro@test.com" } }) };
        return { status: () => 200, json: async () => ({ data: { tenantId: "tenant-ro", invoiceId: "invoice-ro" } }) };
      }),
      post: vi.fn()
    };
    await expect(runReadOnlyPreflight(request, { apiOrigin: "http://test", readOnlyToken: "token", readOnlyTenantId: "tenant-ro", readOnlyInvoiceId: "invoice-ro", readOnlyRecipient: "ro@test.com" })).resolves.toBeUndefined();
  });

  it("throws on non-allowlisted mismatch and performs zero sends", async () => {
    const request = {
      get: vi.fn().mockImplementation(async (url) => {
        if (url.includes("billing/profile")) return { status: () => 200, json: async () => ({ data: { email: "wrong@na.com" } }) }; // mismatch here
        return { status: () => 200, json: async () => ({ data: { tenantId: "tenant-na", invoiceId: "invoice-na", items: [{invoiceId: "invoice-na"}] } }) };
      }),
      post: vi.fn()
    };
    await expect(runNonAllowlistPreflight(request, { apiOrigin: "http://test", nonAllowlistedToken: "token", nonAllowlistTenantId: "tenant-na", nonAllowlistInvoiceId: "invoice-na", nonAllowlistedRecipient: "na@test.com" }, ["allow.com"])).rejects.toThrow("Non-allowlist fixture email does not match reserved negative recipient");
    expect(request.post).not.toHaveBeenCalled();
  });

  it("throws on non-allowlist invoice fixture mismatch (wrong tenant)", async () => {
    const request = {
      get: vi.fn().mockImplementation(async (url) => {
        if (url.includes("billing/profile")) return { status: () => 200, json: async () => ({ data: { email: "na@test.com" } }) };
        return { status: () => 200, json: async () => ({ data: { tenantId: "wrong", invoiceId: "invoice-na", items: [{invoiceId: "invoice-na"}] } }) };
      }),
      post: vi.fn()
    };
    await expect(runNonAllowlistPreflight(request, { apiOrigin: "http://test", nonAllowlistedToken: "token", nonAllowlistTenantId: "tenant-na", nonAllowlistInvoiceId: "invoice-na", nonAllowlistedRecipient: "na@test.com" }, ["allow.com"])).rejects.toThrow("Non-allowlist invoice fixture mismatch");
    expect(request.post).not.toHaveBeenCalled();
  });

  it("throws on non-allowlist invoice fixture mismatch (wrong invoice)", async () => {
    const request = {
      get: vi.fn().mockImplementation(async (url) => {
        if (url.includes("billing/profile")) return { status: () => 200, json: async () => ({ data: { email: "na@test.com" } }) };
        return { status: () => 200, json: async () => ({ data: { tenantId: "tenant-na", invoiceId: "wrong", items: [{invoiceId: "wrong"}] } }) };
      }),
      post: vi.fn()
    };
    await expect(runNonAllowlistPreflight(request, { apiOrigin: "http://test", nonAllowlistedToken: "token", nonAllowlistTenantId: "tenant-na", nonAllowlistInvoiceId: "invoice-na", nonAllowlistedRecipient: "na@test.com" }, ["allow.com"])).rejects.toThrow("Non-allowlist invoice fixture mismatch");
    expect(request.post).not.toHaveBeenCalled();
  });

  it("passes legally positive runNonAllowlistPreflight case", async () => {
    const request = {
      get: vi.fn().mockImplementation(async (url) => {
        if (url.includes("billing/profile")) return { status: () => 200, json: async () => ({ data: { email: "na@test.com" } }) };
        return { status: () => 200, json: async () => ({ data: { tenantId: "tenant-na", invoiceId: "invoice-na", items: [{invoiceId: "invoice-na"}] } }) };
      }),
      post: vi.fn()
    };
    await expect(runNonAllowlistPreflight(request, { apiOrigin: "http://test", nonAllowlistedToken: "token", nonAllowlistTenantId: "tenant-na", nonAllowlistInvoiceId: "invoice-na", nonAllowlistedRecipient: "na@test.com" }, ["allow.com"])).resolves.toBeUndefined();
  });
});

import { verifyInvoiceLinks } from "../../../../tests/e2e/system-remediation/sr-live-invoice-mail-20261007/live-invoice-mail.spec";

describe("F4/F6 verifyInvoiceLinks regressions", () => {
  it("passes for repeated same-invoice anchor", () => {
    const hrefs = [
      "/invoices?invoiceId=20000000-0000-0000-0000-000000000456",
      "/invoices?invoiceId=20000000-0000-0000-0000-000000000456",
      null
    ];
    expect(() => verifyInvoiceLinks(hrefs, "20000000-0000-0000-0000-000000000456")).not.toThrow();
  });

  it("throws when multiple distinct invoice IDs exist", () => {
    const hrefs = [
      "/invoices?invoiceId=20000000-0000-0000-0000-000000000456",
      "/invoices?invoiceId=20000000-0000-0000-0000-000000000789"
    ];
    expect(() => verifyInvoiceLinks(hrefs, "20000000-0000-0000-0000-000000000456")).toThrow();
  });
});

import { evaluateDownloadResponse } from "../../../../tests/e2e/system-remediation/sr-live-invoice-mail-20261007/live-invoice-mail.spec";

describe("F4/F6 evaluateDownloadResponse", () => {
  const validManifestHash = "2d3e9114777d1ff04b2a65825df3890f55cf5eb393430531bdc8636e0d37e4fb"; // echo -n '%PDF-test' | sha256sum
  const createMockResponse = (overrides = {}) => ({
    headers: () => ({
      'content-type': 'application/pdf',
      'x-drts-candidate-sha': 'a'.repeat(40),
      ...overrides.headers
    }),
    body: async () => Buffer.from('%PDF-test'),
    url: () => 'http://portal.invalid/api/downloads/tenant-invoice/inv1?sig=1',
    status: () => 200,
    ...overrides
  });

  it("passes for valid download", async () => {
    const res = createMockResponse();
    const proof = await evaluateDownloadResponse(res, 'a'.repeat(40), validManifestHash, "inv1", "tenant1");
    expect(proof.matched).toBe(true);
    expect(proof.manifestHash).toBe(validManifestHash);
  });

  it("throws on wrong candidate SHA", async () => {
    const res = createMockResponse({ headers: { 'content-type': 'application/pdf', 'x-drts-candidate-sha': 'wrong' } });
    await expect(evaluateDownloadResponse(res, 'a'.repeat(40), validManifestHash, "inv1", "tenant1")).rejects.toThrow("Candidate SHA mismatch");
  });

  it("throws on wrong MIME type", async () => {
    const res = createMockResponse({ headers: { 'content-type': 'text/plain', 'x-drts-candidate-sha': 'a'.repeat(40) } });
    await expect(evaluateDownloadResponse(res, 'a'.repeat(40), validManifestHash, "inv1", "tenant1")).rejects.toThrow("Invalid mime");
  });

  it("throws on invalid PDF magic bytes", async () => {
    const res = createMockResponse({ body: async () => Buffer.from('NOTPDF') });
    await expect(evaluateDownloadResponse(res, 'a'.repeat(40), validManifestHash, "inv1", "tenant1")).rejects.toThrow("Invalid PDF magic");
  });

  it("throws on hash mismatch", async () => {
    const res = createMockResponse();
    await expect(evaluateDownloadResponse(res, 'a'.repeat(40), "wronghash", "inv1", "tenant1")).rejects.toThrow("Hash mismatch");
  });
});
