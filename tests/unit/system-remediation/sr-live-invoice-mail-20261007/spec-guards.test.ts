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
    await expect(runReadOnlyPreflight(request, { apiOrigin: "http://test", readOnlyToken: "token", readOnlyTenantId: "tenant-ro", readOnlyInvoiceId: "invoice-ro", readOnlyRecipient: "ro@test.com" })).resolves.toEqual(expect.objectContaining({ roInvoiceData: expect.any(Object) }));
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

import { evaluateDownloadResponse, observeAndEvaluateDownload } from "../../../../tests/e2e/system-remediation/sr-live-invoice-mail-20261007/live-invoice-mail.spec";

describe("F4/F6 evaluateDownloadResponse", () => {
  const validManifestHash = "3c87d37f1dbea6909f917ce437c390fb8e655a774387d9e69301c0b2283d5b63"; // echo -n '%PDF-test' | sha256sum
  const validQuery = `?signed_at=1&expires_at=2&key_id=3&manifest_hash=${validManifestHash}&sig=valid&sig_v=1`;
  const createMockResponse = (overrides: any = {}) => {
    const { headers: headersOverride, ...otherOverrides } = overrides;
    return {
      headers: () => ({
        'content-type': 'application/pdf',
        'x-drts-candidate-sha': 'a'.repeat(40),
        ...headersOverride
      }),
      body: async () => Buffer.from('%PDF-test'),
      url: () => 'http://portal.invalid/downloads/tenant-invoice/inv1' + validQuery,
      status: () => 200,
      ...otherOverrides
    };
  };

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

  it("throws on contradictory hash claim", async () => {
    const res = createMockResponse({ url: () => `http://portal.invalid/downloads/tenant-invoice/inv1?signed_at=1&expires_at=2&key_id=3&manifest_hash=wrong&sig=valid&sig_v=1` });
    await expect(evaluateDownloadResponse(res, 'a'.repeat(40), validManifestHash, "inv1", "tenant1")).rejects.toThrow("Contradictory manifest hash in download link");
  });
});

describe("F4/F6 observeAndEvaluateDownload regressions", () => {
  const validManifestHash = "3c87d37f1dbea6909f917ce437c390fb8e655a774387d9e69301c0b2283d5b63";
  const validQuery = `?signed_at=1&expires_at=2&key_id=3&manifest_hash=${validManifestHash}&sig=valid&sig_v=1`;
  const createMockResponse = (overrides: any = {}) => {
    const { headers: headersOverride, ...otherOverrides } = overrides;
    return {
      headers: () => ({
        'content-type': 'application/pdf',
        'x-drts-candidate-sha': 'a'.repeat(40),
        ...headersOverride
      }),
      body: async () => Buffer.from('%PDF-test'),
      url: () => 'http://portal.invalid/downloads/tenant-invoice/inv1' + validQuery,
      status: () => 200,
      ...otherOverrides
    };
  };

  it("passes valid observation and redacts query driven by click", async () => {
    let predicateFn: any;
    let eventResolve: any;
    let registered = false;

    const context = {
      waitForEvent: vi.fn().mockImplementation((event, options) => {
        registered = true;
        predicateFn = options.predicate;
        return new Promise((resolve) => {
          eventResolve = resolve;
        });
      })
    };

    const mockResponse = createMockResponse();
    const locator = {
      click: vi.fn().mockImplementation(async () => {
        if (!registered) throw new Error("Clicked before registered");
        if (predicateFn(mockResponse)) {
          eventResolve(mockResponse);
        } else {
          throw new Error("Predicate rejected in mock click");
        }
      })
    };

    const proof = await observeAndEvaluateDownload(
      context,
      locator,
      "/downloads/tenant-invoice/inv1" + validQuery,
      "http://portal.invalid",
      "a".repeat(40),
      validManifestHash,
      "inv1",
      "tenant1"
    );

    expect(proof.matched).toBe(true);
    expect(proof.query).toContain("sig=REDACTED");
    expect(locator.click).toHaveBeenCalled();
  });

  it("rejects unmatched events and times out", async () => {
    let predicateFn: any;
    let registered = false;

    const context = {
      waitForEvent: vi.fn().mockImplementation((event, options) => {
        registered = true;
        predicateFn = options.predicate;
        return Promise.reject(new Error("Timeout"));
      })
    };

    const wrongOriginResponse = createMockResponse({ url: () => 'http://wrong.invalid/downloads/tenant-invoice/inv1' + validQuery });

    const locator = {
      click: vi.fn().mockImplementation(async () => {
        if (!registered) throw new Error("Clicked before registered");
        // Emulate an unmatched event that doesn't trigger the resolver
        const match = predicateFn(wrongOriginResponse);
        expect(match).toBe(false);
      })
    };

    await expect(observeAndEvaluateDownload(
      context,
      locator,
      "/downloads/tenant-invoice/inv1" + validQuery,
      "http://portal.invalid",
      "a".repeat(40),
      validManifestHash,
      "inv1",
      "tenant1"
    )).rejects.toThrow("Timeout");
  });

  it("throws on evaluateDownloadResponse failure without failing the event observer", async () => {
    let predicateFn: any;
    let eventResolve: any;
    let registered = false;

    const context = {
      waitForEvent: vi.fn().mockImplementation((event, options) => {
        registered = true;
        predicateFn = options.predicate;
        return new Promise((resolve) => {
          eventResolve = resolve;
        });
      })
    };

    const badMimeResponse = createMockResponse({ headers: { 'content-type': 'text/plain' } });
    const locator = {
      click: vi.fn().mockImplementation(async () => {
        if (!registered) throw new Error("Clicked before registered");
        if (predicateFn(badMimeResponse)) {
          eventResolve(badMimeResponse);
        }
      })
    };

    await expect(observeAndEvaluateDownload(
      context,
      locator,
      "/downloads/tenant-invoice/inv1" + validQuery,
      "http://portal.invalid",
      "a".repeat(40),
      validManifestHash,
      "inv1",
      "tenant1"
    )).rejects.toThrow("Invalid mime");
  });

  it("ignores wrong resource and wrong query, then accepts valid event", async () => {
    let predicateFn: any;
    let eventResolve: any;
    let registered = false;

    const context = {
      waitForEvent: vi.fn().mockImplementation((event, options) => {
        registered = true;
        predicateFn = options.predicate;
        return new Promise((resolve) => {
          eventResolve = resolve;
        });
      })
    };

    const wrongResourceResponse = createMockResponse({ url: () => 'http://portal.invalid/downloads/tenant-invoice/wrong' + validQuery });
    const wrongQueryResponse = createMockResponse({ url: () => 'http://portal.invalid/downloads/tenant-invoice/inv1?wrong=1' });
    const validResponse = createMockResponse();

    const locator = {
      click: vi.fn().mockImplementation(async () => {
        if (!registered) throw new Error("Clicked before registered");

        // Emulate wrong resource
        expect(predicateFn(wrongResourceResponse)).toBe(false);
        // Emulate wrong query
        expect(predicateFn(wrongQueryResponse)).toBe(false);
        // Emulate valid
        if (predicateFn(validResponse)) {
          eventResolve(validResponse);
        }
      })
    };

    const proof = await observeAndEvaluateDownload(
      context,
      locator,
      "/downloads/tenant-invoice/inv1" + validQuery,
      "http://portal.invalid",
      "a".repeat(40),
      validManifestHash,
      "inv1",
      "tenant1"
    );

    expect(proof.matched).toBe(true);
    expect(proof.query).toContain("sig=REDACTED");
  });

  it("discards unknown query keys and emits explicit allowlist", async () => {
    const res = createMockResponse({ url: () => `http://portal.invalid/downloads/tenant-invoice/inv1?signed_at=1&expires_at=2&key_id=3&manifest_hash=${validManifestHash}&sig=valid&sig_v=1&token=SYNTHETIC_TOKEN_SENTINEL` });
    const proof = await evaluateDownloadResponse(res, 'a'.repeat(40), validManifestHash, "inv1", "tenant1");
    expect(proof.query).toBe(`?manifest_hash=${validManifestHash}&signed_at=1&expires_at=2&key_id=3&sig_v=1&sig=REDACTED`);
    expect(proof.query).not.toContain("SYNTHETIC_TOKEN_SENTINEL");
  });
});
