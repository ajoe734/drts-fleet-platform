import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { uploadOperationalDocument } from "../e2e/operational-document-upload";
import { type APIRequestContext } from "@playwright/test";
import { createHash } from "node:crypto";

describe("uploadOperationalDocument", () => {
  const origin = "https://fleet.example.com";
  const intentPath = "/api/fleet-partner/supply-submissions/sub-123/documents/upload-url";
  const intentBody = { documentType: "professional_driver_license" };
  const confirmPath = "/api/fleet-partner/supply-submissions/sub-123/documents/confirm";
  const confirmBody = { documentType: "professional_driver_license" };
  const headers = { Authorization: "Bearer valid-token" };

  const expectedPdfBytes = Buffer.from(
    "%PDF-1.4\n" +
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n" +
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n" +
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 72 72] >>\nendobj\n" +
    "xref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n" +
    "trailer\n<< /Size 4 /Root 1 0 R >>\n" +
    "startxref\n184\n%%EOF\n"
  );
  const expectedSha = createHash("sha256").update(expectedPdfBytes).digest("hex");
  const expectedSize = expectedPdfBytes.length;

  const mockRequest = {} as APIRequestContext;
  const originalFetch = globalThis.fetch;
  const originalEnv = process.env.DRTS_CANDIDATE_SHA;

  beforeEach(() => {
    process.env.DRTS_CANDIDATE_SHA = "mock-candidate-sha";
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env.DRTS_CANDIDATE_SHA = originalEnv;
    vi.useRealTimers();
  });

  function mockFetchResponse(status: number, data: any, extraHeaders: Record<string, string> = {}) {
    const bodyBuffer = Buffer.isBuffer(data) ? data : Buffer.from(JSON.stringify(data));
    const responseHeaders = new Headers(extraHeaders);
    responseHeaders.set('x-drts-candidate-sha', process.env.DRTS_CANDIDATE_SHA || 'mock-sha');
    
    return {
      status,
      headers: responseHeaders,
      body: {
        getReader: () => {
          let done = false;
          return {
            read: async () => {
              if (done) return { done: true };
              done = true;
              return { done: false, value: bodyBuffer };
            },
            cancel: async () => {}
          };
        }
      }
    } as any;
  }

  function setupHappyPath(mockedFetch: any) {
    mockedFetch.mockImplementation(async (url: string | URL | Request, options: any) => {
      const urlStr = url.toString();
      if (urlStr.includes("supply-submissions/sub-123") && options.method === "GET" && !urlStr.includes("download")) {
        return mockFetchResponse(200, { data: { submission: { fleet_partner_id: "fleet-123" } } });
      }
      if (urlStr.includes("/upload-url")) {
        return mockFetchResponse(200, {
          data: {
            object_key: "fleet-partner/fleet-123/supply-submissions/sub-123/upload-harmless.pdf",
            upload_url: "/control-plane-proxy/fleet-partner/supply-submissions/sub-123/documents/content?objectKey=fleet-partner/fleet-123/supply-submissions/sub-123/upload-harmless.pdf",
            method: "PUT",
            headers: { "content-type": "application/octet-stream" },
            submission_id: "sub-123",
            fleet_partner_id: "fleet-123"
          }
        });
      }
      if (urlStr.includes("/content?objectKey=")) {
        return mockFetchResponse(200, {
          data: { checksum_sha256: expectedSha, file_size: expectedSize, scan_state: "clean" }
        });
      }
      if (urlStr.includes("/confirm")) {
        return mockFetchResponse(200, {
          data: {
            document_id: "doc-123",
            file_object_key: "fleet-partner/fleet-123/supply-submissions/sub-123/upload-harmless.pdf",
            checksum_sha256: expectedSha,
            file_size: expectedSize,
            content_type: "application/pdf",
            submission_id: "sub-123",
            fleet_partner_id: "fleet-123",
            document_type: "professional_driver_license"
          }
        });
      }
      if (urlStr.includes("/download")) {
        return mockFetchResponse(200, expectedPdfBytes, { "content-type": "application/pdf" });
      }
      return mockFetchResponse(404, {});
    });
  }

  it("completes full lifecycle with intent, PUT, confirm, and GET download", async () => {
    setupHappyPath(vi.mocked(globalThis.fetch));
    const result = await uploadOperationalDocument(mockRequest, origin, intentPath, intentBody, confirmPath, confirmBody, headers);
    expect(result.documentId).toBe("doc-123");
  });

  it("rejects wrong fleet ID binding", async () => {
    setupHappyPath(vi.mocked(globalThis.fetch));
    vi.mocked(globalThis.fetch).mockImplementation(async (url: string | URL | Request, options: any) => {
      const urlStr = url.toString();
      if (urlStr.includes("supply-submissions/sub-123") && options.method === "GET" && !urlStr.includes("download")) {
        return mockFetchResponse(200, { data: { submission: { fleet_partner_id: "fleet-999-wrong" } } });
      }
      if (urlStr.includes("/upload-url")) {
        return mockFetchResponse(200, {
          data: {
            object_key: "fleet-partner/fleet-123/supply-submissions/sub-123/upload-harmless.pdf",
            upload_url: "/control-plane-proxy/fleet-partner/supply-submissions/sub-123/documents/content?objectKey=fleet-partner/fleet-123/supply-submissions/sub-123/upload-harmless.pdf",
            method: "PUT",
            headers: { "content-type": "application/octet-stream" },
            submission_id: "sub-123",
            fleet_partner_id: "fleet-123" // Returned intent fleet doesn't matter, readback is authoritative
          }
        });
      }
      return mockFetchResponse(404, {});
    });

    await expect(uploadOperationalDocument(mockRequest, origin, intentPath, intentBody, confirmPath, confirmBody, headers)).rejects.toThrow();
  });

  it("rejects foreign origin intent URL", async () => {
    setupHappyPath(vi.mocked(globalThis.fetch));
    await expect(uploadOperationalDocument(mockRequest, origin, "https://foreign.example.invalid/api/intent", intentBody, confirmPath, confirmBody, headers)).rejects.toThrow();
  });

  it("rejects missing candidate SHA headers on intent", async () => {
    setupHappyPath(vi.mocked(globalThis.fetch));
    vi.mocked(globalThis.fetch).mockImplementation(async (url: string | URL | Request, options: any) => {
      const urlStr = url.toString();
      if (urlStr.includes("supply-submissions/sub-123") && options.method === "GET") {
        return mockFetchResponse(200, { data: { submission: { fleet_partner_id: "fleet-123" } } });
      }
      if (urlStr.includes("/upload-url")) {
        const res = mockFetchResponse(200, {
          data: {
            object_key: "fleet-partner/fleet-123/supply-submissions/sub-123/upload-harmless.pdf",
            upload_url: "/control-plane-proxy/fleet-partner/supply-submissions/sub-123/documents/content?objectKey=fleet-partner/fleet-123/supply-submissions/sub-123/upload-harmless.pdf",
            method: "PUT",
            headers: { "content-type": "application/octet-stream" }
          }
        });
        res.headers = new Headers(); // Strip x-drts-candidate-sha
        return res;
      }
      return mockFetchResponse(404, {});
    });

    await expect(uploadOperationalDocument(mockRequest, origin, intentPath, intentBody, confirmPath, confirmBody, headers)).rejects.toThrow();
  });

  it("rejects oversized response exceeding 1MB", async () => {
    setupHappyPath(vi.mocked(globalThis.fetch));
    vi.mocked(globalThis.fetch).mockImplementation(async (url: string | URL | Request, options: any) => {
      const urlStr = url.toString();
      if (urlStr.includes("supply-submissions/sub-123") && options.method === "GET") {
        return mockFetchResponse(200, { data: { submission: { fleet_partner_id: "fleet-123" } } });
      }
      if (urlStr.includes("/upload-url")) {
        return {
          status: 200,
          headers: new Headers({ 'x-drts-candidate-sha': 'mock-candidate-sha' }),
          body: {
            getReader: () => {
              let done = false;
              return {
                read: async () => {
                  if (done) return { done: true };
                  done = true;
                  return { done: false, value: Buffer.alloc(1024 * 1024 + 10) }; // Oversized
                },
                cancel: async () => {}
              };
            }
          }
        } as any;
      }
      return mockFetchResponse(404, {});
    });

    await expect(uploadOperationalDocument(mockRequest, origin, intentPath, intentBody, confirmPath, confirmBody, headers)).rejects.toThrow(/exceeded bounded limit/);
  });

  it("rejects strict MIME gap on readback", async () => {
    setupHappyPath(vi.mocked(globalThis.fetch));
    vi.mocked(globalThis.fetch).mockImplementation(async (url: string | URL | Request, options: any) => {
      if (url.toString().includes("/download")) {
        return mockFetchResponse(200, expectedPdfBytes, { "content-type": "application/pdf-not-real" });
      }
      // Use original setupHappyPath for everything else
      const urlStr = url.toString();
      if (urlStr.includes("supply-submissions/sub-123") && options.method === "GET") {
        return mockFetchResponse(200, { data: { submission: { fleet_partner_id: "fleet-123" } } });
      }
      if (urlStr.includes("/upload-url")) {
        return mockFetchResponse(200, {
          data: {
            object_key: "fleet-partner/fleet-123/supply-submissions/sub-123/upload-harmless.pdf",
            upload_url: "/control-plane-proxy/fleet-partner/supply-submissions/sub-123/documents/content?objectKey=fleet-partner/fleet-123/supply-submissions/sub-123/upload-harmless.pdf",
            method: "PUT",
            headers: { "content-type": "application/octet-stream" },
            submission_id: "sub-123",
            fleet_partner_id: "fleet-123"
          }
        });
      }
      if (urlStr.includes("/content?objectKey=")) return mockFetchResponse(200, { data: { checksum_sha256: expectedSha, file_size: expectedSize, scan_state: "clean" } });
      if (urlStr.includes("/confirm")) return mockFetchResponse(200, { data: { document_id: "doc-123", file_object_key: "fleet-partner/fleet-123/supply-submissions/sub-123/upload-harmless.pdf", checksum_sha256: expectedSha, file_size: expectedSize, content_type: "application/pdf", submission_id: "sub-123", fleet_partner_id: "fleet-123", document_type: "professional_driver_license" } });
      return mockFetchResponse(404, {});
    });

    await expect(uploadOperationalDocument(mockRequest, origin, intentPath, intentBody, confirmPath, confirmBody, headers)).rejects.toThrow();
  });

  it("retries PUT on 503 DOCUMENT_SCANNER_UNAVAILABLE with error.code", async () => {
    setupHappyPath(vi.mocked(globalThis.fetch));
    let putAttempts = 0;
    vi.mocked(globalThis.fetch).mockImplementation(async (url: string | URL | Request, options: any) => {
      const urlStr = url.toString();
      if (urlStr.includes("/content?objectKey=")) {
        putAttempts++;
        if (putAttempts < 3) {
          return mockFetchResponse(503, { error: { code: "DOCUMENT_SCANNER_UNAVAILABLE" } });
        }
        return mockFetchResponse(200, { data: { checksum_sha256: expectedSha, file_size: expectedSize, scan_state: "clean" } });
      }
      // Delegate others
      if (urlStr.includes("supply-submissions/sub-123") && options.method === "GET" && !urlStr.includes("download")) return mockFetchResponse(200, { data: { submission: { fleet_partner_id: "fleet-123" } } });
      if (urlStr.includes("/upload-url")) return mockFetchResponse(200, { data: { object_key: "fleet-partner/fleet-123/supply-submissions/sub-123/upload-harmless.pdf", upload_url: "/control-plane-proxy/fleet-partner/supply-submissions/sub-123/documents/content?objectKey=fleet-partner/fleet-123/supply-submissions/sub-123/upload-harmless.pdf", method: "PUT", headers: { "content-type": "application/octet-stream" }, submission_id: "sub-123", fleet_partner_id: "fleet-123" } });
      if (urlStr.includes("/confirm")) return mockFetchResponse(200, { data: { document_id: "doc-123", file_object_key: "fleet-partner/fleet-123/supply-submissions/sub-123/upload-harmless.pdf", checksum_sha256: expectedSha, file_size: expectedSize, content_type: "application/pdf", submission_id: "sub-123", fleet_partner_id: "fleet-123", document_type: "professional_driver_license" } });
      if (urlStr.includes("/download")) return mockFetchResponse(200, expectedPdfBytes, { "content-type": "application/pdf" });
      return mockFetchResponse(404, {});
    });

    vi.useFakeTimers();
    const promise = uploadOperationalDocument(mockRequest, origin, intentPath, intentBody, confirmPath, confirmBody, headers);
    for (let i = 0; i < 3; i++) await vi.runAllTimersAsync();
    await promise;
    expect(putAttempts).toBe(3);
  });
});
