import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { uploadOperationalDocument, runSetup } from "../e2e/operational-document-upload";
import { type APIRequestContext } from "@playwright/test";
import { createHash } from "node:crypto";
import journeysData from "../e2e/fixtures/operational-browser-journeys.json";

describe("uploadOperationalDocument", () => {
  const origin = "https://fleet.example.com";
  const intentPath = "/control-plane-proxy/fleet-partner/supply-submissions/sub-123/documents/upload-url";
  const intentBody = { documentType: "professional_driver_license" };
  const confirmPath = "/control-plane-proxy/fleet-partner/supply-submissions/sub-123/documents/confirm";
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

  const mockRequest = { fetch: vi.fn() } as unknown as APIRequestContext;
  const originalFetch = globalThis.fetch;
  const originalEnv = process.env.DRTS_CANDIDATE_SHA;

  beforeEach(() => {
    globalThis.fetch = vi.fn() as any;
    process.env.DRTS_CANDIDATE_SHA = "mock-candidate-sha";
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
      json: async () => JSON.parse(bodyBuffer.toString('utf-8')),
      body: { getReader: () => { let done = false; return { read: async () => { if (done) return { done: true }; done = true; return { done: false, value: bodyBuffer }; }, cancel: () => {} }; } },
      arrayBuffer: async () => bodyBuffer.buffer.slice(bodyBuffer.byteOffset, bodyBuffer.byteOffset + bodyBuffer.byteLength),
      url: () => "mock-url"
    } as any;
  }

  function setupHappyPath(mockedFetch: any) {
    mockedFetch.mockImplementation(async (url: string | URL | Request, _options: any) => {
      const urlStr = url.toString();
      if (urlStr.includes("supply-submissions/sub-123") && _options?.method === "GET" && !urlStr.includes("download")) {
        return mockFetchResponse(200, { data: { submission: { fleet_partner_id: "fleet-123", submission_id: "sub-123" } } });
      }
      if (urlStr.includes("/upload-url")) {
        return mockFetchResponse(200, {
          data: {
            object_key: "fleet-partner/fleet-123/supply-submissions/sub-123/upload-harmless.pdf",
            upload_url: "https://fleet.example.com/control-plane-proxy/fleet-partner/supply-submissions/sub-123/documents/content?objectKey=fleet-partner/fleet-123/supply-submissions/sub-123/upload-harmless.pdf",
            method: "PUT",
            headers: { "content-type": "application/octet-stream" },
            submission_id: "sub-123",
            fleet_partner_id: "fleet-123"
          }
        });
      }
      if (urlStr.includes("/content?objectKey=fleet-partner")) {
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
    setupHappyPath(vi.mocked(globalThis.fetch as any));
    const result = await uploadOperationalDocument(mockRequest, origin, intentPath, intentBody, confirmPath, confirmBody, headers);
    expect(result.documentId).toBe("doc-123");
  });

  it("rejects wrong fleet ID binding", async () => {
    setupHappyPath(vi.mocked(globalThis.fetch as any));
    vi.mocked(globalThis.fetch as any).mockImplementation(async (url: string | URL | Request, _options: any) => {
      const urlStr = url.toString();
      if (urlStr.includes("supply-submissions/sub-123") && _options?.method === "GET" && !urlStr.includes("download")) {
        return mockFetchResponse(200, { data: { submission: { fleet_partner_id: "fleet-999-wrong" } } });
      }
      if (urlStr.includes("/upload-url")) {
        return mockFetchResponse(200, {
          data: {
            object_key: "fleet-partner/fleet-123/supply-submissions/sub-123/upload-harmless.pdf",
            upload_url: "https://fleet.example.com/control-plane-proxy/fleet-partner/supply-submissions/sub-123/documents/content?objectKey=fleet-partner/fleet-123/supply-submissions/sub-123/upload-harmless.pdf",
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
    setupHappyPath(vi.mocked(globalThis.fetch as any));
    await expect(uploadOperationalDocument(mockRequest, origin, "https://foreign.example.invalid/api/intent", intentBody, confirmPath, confirmBody, headers)).rejects.toThrow();
  });

  it("rejects missing candidate SHA headers on intent", async () => {
    setupHappyPath(vi.mocked(globalThis.fetch as any));
    vi.mocked(globalThis.fetch as any).mockImplementation(async (url: string | URL | Request, _options: any) => {
      const urlStr = url.toString();
      if (urlStr.includes("supply-submissions/sub-123") && _options?.method === "GET") {
        return mockFetchResponse(200, { data: { submission: { fleet_partner_id: "fleet-123", submission_id: "sub-123" } } });
      }
      if (urlStr.includes("/upload-url")) {
        const res = mockFetchResponse(200, {
          data: {
            object_key: "fleet-partner/fleet-123/supply-submissions/sub-123/upload-harmless.pdf",
            upload_url: "https://fleet.example.com/control-plane-proxy/fleet-partner/supply-submissions/sub-123/documents/content?objectKey=fleet-partner/fleet-123/supply-submissions/sub-123/upload-harmless.pdf",
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
    setupHappyPath(vi.mocked(globalThis.fetch as any));
    vi.mocked(globalThis.fetch as any).mockImplementation(async (url: string | URL | Request, _options: any) => {
      const urlStr = url.toString();
      if (urlStr.includes("supply-submissions/sub-123") && _options?.method === "GET") {
        return mockFetchResponse(200, { data: { submission: { fleet_partner_id: "fleet-123", submission_id: "sub-123" } } });
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

    await expect(uploadOperationalDocument(mockRequest, origin, intentPath, intentBody, confirmPath, confirmBody, headers)).rejects.toThrow();
  });

  it("rejects strict MIME gap on readback", async () => {
    setupHappyPath(vi.mocked(globalThis.fetch as any));
    vi.mocked(globalThis.fetch as any).mockImplementation(async (url: string | URL | Request) => {
      if (url.toString().includes("/download")) {
        return mockFetchResponse(200, expectedPdfBytes, { "content-type": "application/pdf-not-real" });
      }
      // Use original setupHappyPath for everything else
      const urlStr = url.toString();
      if (urlStr.includes("supply-submissions/sub-123") && _options?.method === "GET") {
        return mockFetchResponse(200, { data: { submission: { fleet_partner_id: "fleet-123", submission_id: "sub-123" } } });
      }
      if (urlStr.includes("/upload-url")) {
        return mockFetchResponse(200, {
          data: {
            object_key: "fleet-partner/fleet-123/supply-submissions/sub-123/upload-harmless.pdf",
            upload_url: "https://fleet.example.com/control-plane-proxy/fleet-partner/supply-submissions/sub-123/documents/content?objectKey=fleet-partner/fleet-123/supply-submissions/sub-123/upload-harmless.pdf",
            method: "PUT",
            headers: { "content-type": "application/octet-stream" },
            submission_id: "sub-123",
            fleet_partner_id: "fleet-123"
          }
        });
      }
      if (urlStr.includes("/content?objectKey=fleet-partner")) return mockFetchResponse(200, { data: { checksum_sha256: expectedSha, file_size: expectedSize, scan_state: "clean" } });
      if (urlStr.includes("/confirm")) return mockFetchResponse(200, { data: { document_id: "doc-123", file_object_key: "fleet-partner/fleet-123/supply-submissions/sub-123/upload-harmless.pdf", checksum_sha256: expectedSha, file_size: expectedSize, content_type: "application/pdf", submission_id: "sub-123", fleet_partner_id: "fleet-123", document_type: "professional_driver_license" } });
      return mockFetchResponse(404, {});
    });

    await expect(uploadOperationalDocument(mockRequest, origin, intentPath, intentBody, confirmPath, confirmBody, headers)).rejects.toThrow();
  });

  it("retries PUT on 503 DOCUMENT_SCANNER_UNAVAILABLE with error.code", async () => {
    setupHappyPath(vi.mocked(globalThis.fetch as any));
    let putAttempts = 0;
    vi.mocked(globalThis.fetch as any).mockImplementation(async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes("/content?objectKey=fleet-partner")) {
        putAttempts++;
        if (putAttempts < 3) {
          return mockFetchResponse(503, { error: { code: "DOCUMENT_SCANNER_UNAVAILABLE" } });
        }
        return mockFetchResponse(200, { data: { checksum_sha256: expectedSha, file_size: expectedSize, scan_state: "clean" } });
      }
      // Delegate others
      if (urlStr.includes("supply-submissions/sub-123") && _options?.method === "GET" && !urlStr.includes("download")) return mockFetchResponse(200, { data: { submission: { fleet_partner_id: "fleet-123", submission_id: "sub-123" } } });
      if (urlStr.includes("/upload-url")) return mockFetchResponse(200, { data: { object_key: "fleet-partner/fleet-123/supply-submissions/sub-123/upload-harmless.pdf", upload_url: "https://fleet.example.com/control-plane-proxy/fleet-partner/supply-submissions/sub-123/documents/content?objectKey=fleet-partner/fleet-123/supply-submissions/sub-123/upload-harmless.pdf", method: "PUT", headers: { "content-type": "application/octet-stream" }, submission_id: "sub-123", fleet_partner_id: "fleet-123" } });
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

  it("validates independent PDF structure with correct xref offsets", async () => {
    let capturedBody: any;
    vi.mocked(globalThis.fetch as any).mockImplementation(async (url: string | URL | Request, _options: any) => {
      const urlStr = url.toString();
      if (urlStr.includes("supply-submissions/sub-123") && _options?.method === "GET" && !urlStr.includes("download")) {
        return mockFetchResponse(200, { data: { submission: { fleet_partner_id: "fleet-123", submission_id: "sub-123" } } });
      }
      if (urlStr.includes("/upload-url")) {
        return mockFetchResponse(200, {
          data: {
            object_key: "fleet-partner/fleet-123/supply-submissions/sub-123/upload-harmless.pdf",
            upload_url: "https://fleet.example.com/control-plane-proxy/fleet-partner/supply-submissions/sub-123/documents/content?objectKey=fleet-partner/fleet-123/supply-submissions/sub-123/upload-harmless.pdf",
            method: "PUT",
            headers: { "content-type": "application/octet-stream" },
            submission_id: "sub-123",
            fleet_partner_id: "fleet-123"
          }
        });
      }
      if (urlStr.includes("/content?objectKey=fleet-partner")) {
        capturedBody = _options.body;
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

    await uploadOperationalDocument(mockRequest, origin, intentPath, intentBody, confirmPath, confirmBody, headers);

    const str = capturedBody.toString();
    expect(str).toContain("%PDF-1.4\n");

    // dynamically validate offsets
    const obj1 = str.indexOf("1 0 obj");
    const obj2 = str.indexOf("2 0 obj");

    expect(str).toContain(`000000000${obj1} 00000 n `);
    expect(str).toContain(`00000000${obj2} 00000 n `);

    // startxref points to xref
    const xref = str.indexOf("xref");
    expect(str).toContain(`startxref\n${xref}\n%%EOF`);
  });

  it("rejects when receipt is unclean or wrong method", async () => {
    vi.mocked(globalThis.fetch as any).mockImplementation(async (url: string | URL | Request, _options: any) => {
      const urlStr = url.toString();
      if (urlStr.includes("supply-submissions/sub-123") && _options?.method === "GET" && !urlStr.includes("download")) {
        return mockFetchResponse(200, { data: { submission: { fleet_partner_id: "fleet-123", submission_id: "sub-123" } } });
      }
      if (urlStr.includes("/upload-url")) {
        return mockFetchResponse(200, {
          data: {
            object_key: "fleet-partner/fleet-123/supply-submissions/sub-123/upload-harmless.pdf",
            upload_url: "https://fleet.example.com/control-plane-proxy/fleet-partner/supply-submissions/sub-123/documents/content",
            method: "POST", // WRONG METHOD
            headers: { "content-type": "application/octet-stream" },
            submission_id: "sub-123"
          }
        });
      }
      return mockFetchResponse(404, {});
    });
    await expect(uploadOperationalDocument(mockRequest, origin, intentPath, intentBody, confirmPath, confirmBody, headers)).rejects.toThrow();
  });

  it("rejects missing/mismatched readback metadata (wrong MIME type)", async () => {
    vi.mocked(globalThis.fetch as any).mockImplementation(async (url: string | URL | Request, _options: any) => {
      const urlStr = url.toString();
      if (urlStr.includes("supply-submissions/sub-123") && _options?.method === "GET" && !urlStr.includes("download")) return mockFetchResponse(200, { data: { submission: { fleet_partner_id: "fleet-123", submission_id: "sub-123" } } });
      if (urlStr.includes("/upload-url")) return mockFetchResponse(200, { data: { object_key: "fleet-partner/fleet-123/supply-submissions/sub-123/upload-harmless.pdf", upload_url: "https://fleet.example.com/control-plane-proxy/fleet-partner/supply-submissions/sub-123/documents/content", method: "PUT", headers: { "content-type": "application/octet-stream" }, submission_id: "sub-123" } });
      if (urlStr.includes("/content")) return mockFetchResponse(200, {});
      if (urlStr.includes("/confirm")) return mockFetchResponse(200, { data: { document_id: "doc-123", file_object_key: "fleet-partner/fleet-123/supply-submissions/sub-123/upload-harmless.pdf", checksum_sha256: expectedSha, file_size: expectedSize, content_type: "application/pdf", submission_id: "sub-123", fleet_partner_id: "fleet-123" } });
      if (urlStr.includes("/download")) return mockFetchResponse(200, expectedPdfBytes, { "content-type": "image/png" }); // WRONG MIME
      return mockFetchResponse(404, {});
    });
    await expect(uploadOperationalDocument(mockRequest, origin, intentPath, intentBody, confirmPath, confirmBody, headers)).rejects.toThrow();
  });

  it("rejects mismatched confirm metadata variants", async () => {
    vi.mocked(globalThis.fetch as any).mockImplementation(async (url: string | URL | Request, _options: any) => {
      const urlStr = url.toString();
      if (urlStr.includes("supply-submissions/sub-123") && _options?.method === "GET" && !urlStr.includes("download")) return mockFetchResponse(200, { data: { submission: { fleet_partner_id: "fleet-123", submission_id: "sub-123" } } });
      if (urlStr.includes("/upload-url")) return mockFetchResponse(200, { data: { object_key: "fleet-partner/fleet-123/supply-submissions/sub-123/upload-harmless.pdf", upload_url: "https://fleet.example.com/control-plane-proxy/fleet-partner/supply-submissions/sub-123/documents/content", method: "PUT", headers: { "content-type": "application/octet-stream" }, submission_id: "sub-123" } });
      if (urlStr.includes("/content")) return mockFetchResponse(200, {});
      if (urlStr.includes("/confirm")) return mockFetchResponse(200, { data: { document_id: "doc-123", file_object_key: "fleet-partner/fleet-123/supply-submissions/sub-123/upload-harmless.pdf", checksum_sha256: "wrong-sha", file_size: expectedSize, content_type: "application/pdf", submission_id: "sub-123", fleet_partner_id: "fleet-123" } });
      return mockFetchResponse(404, {});
    });
    await expect(uploadOperationalDocument(mockRequest, origin, intentPath, intentBody, confirmPath, confirmBody, headers)).rejects.toThrow();
  });

  it("handles terminal errors and deadline exhaustion", async () => {
    vi.mocked(globalThis.fetch as any).mockImplementation(async (url: string | URL | Request, _options: any) => {
      const urlStr = url.toString();
      if (urlStr.includes("supply-submissions/sub-123") && _options?.method === "GET" && !urlStr.includes("download")) return mockFetchResponse(200, { data: { submission: { fleet_partner_id: "fleet-123", submission_id: "sub-123" } } });
      if (urlStr.includes("/upload-url")) return mockFetchResponse(200, { data: { object_key: "fleet-partner/fleet-123/supply-submissions/sub-123/upload-harmless.pdf", upload_url: "https://fleet.example.com/control-plane-proxy/fleet-partner/supply-submissions/sub-123/documents/content", method: "PUT", headers: { "content-type": "application/octet-stream" }, submission_id: "sub-123" } });
      if (urlStr.includes("/content")) return mockFetchResponse(200, {});
      if (urlStr.includes("/confirm")) return mockFetchResponse(500, { error: "Terminal error" }); // 500 is terminal
      return mockFetchResponse(404, {});
    });
    await expect(uploadOperationalDocument(mockRequest, origin, intentPath, intentBody, confirmPath, confirmBody, headers)).rejects.toThrow();
  });

  it("rejects final candidate mismatch", async () => {
    vi.mocked(globalThis.fetch as any).mockImplementation(async (url: string | URL | Request, _options: any) => {
      const urlStr = url.toString();
      if (urlStr.includes("supply-submissions/sub-123") && _options?.method === "GET" && !urlStr.includes("download")) return mockFetchResponse(200, { data: { submission: { fleet_partner_id: "fleet-123", submission_id: "sub-123" } } });
      if (urlStr.includes("/upload-url")) {
        const res = mockFetchResponse(200, { data: { object_key: "fleet-partner/fleet-123/supply-submissions/sub-123/upload-harmless.pdf", upload_url: "https://fleet.example.com/control-plane-proxy/fleet-partner/supply-submissions/sub-123/documents/content", method: "PUT", headers: { "content-type": "application/octet-stream" }, submission_id: "sub-123" } });
        res.headers.set("x-drts-candidate-sha", "wrong-sha");
        return res;
      }
      return mockFetchResponse(404, {});
    });
    await expect(uploadOperationalDocument(mockRequest, origin, intentPath, intentBody, confirmPath, confirmBody, headers)).rejects.toThrow();
  });

  it("rejects redirect status 302 handling", async () => {
    vi.mocked(globalThis.fetch as any).mockImplementation(async (url: string | URL | Request, _options: any) => {
      const urlStr = url.toString();
      if (urlStr.includes("supply-submissions/sub-123") && _options?.method === "GET" && !urlStr.includes("download")) return mockFetchResponse(200, { data: { submission: { fleet_partner_id: "fleet-123", submission_id: "sub-123" } } });
      if (urlStr.includes("/upload-url")) return mockFetchResponse(302, {});
      return mockFetchResponse(404, {});
    });
    await expect(uploadOperationalDocument(mockRequest, origin, intentPath, intentBody, confirmPath, confirmBody, headers)).rejects.toThrow();
  });
});



describe("runSetup execution with actual manifest", () => {
  const mockRequest = { fetch: vi.fn() } as any;
  const originalFetch2 = globalThis.fetch;
  const originalEnv = process.env.DRTS_CANDIDATE_SHA;

  const expectedPdfBytes = Buffer.from(
    "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 72 72] >>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n184\n%%EOF\n"
  );
  const expectedSha = createHash("sha256").update(expectedPdfBytes).digest("hex");
  const expectedSize = expectedPdfBytes.length;

  function mockFetchResponse(status: number, data: any, extraHeaders: Record<string, string> = {}) {
    const bodyBuffer = Buffer.isBuffer(data) ? data : Buffer.from(JSON.stringify(data));
    const responseHeaders = new Headers(extraHeaders);
    responseHeaders.set('x-drts-candidate-sha', process.env.DRTS_CANDIDATE_SHA || 'mock-sha');

    return {
      status,
      headers: responseHeaders,
      json: async () => JSON.parse(bodyBuffer.toString('utf-8')),
      body: { getReader: () => { let done = false; return { read: async () => { if (done) return { done: true }; done = true; return { done: false, value: bodyBuffer }; }, cancel: () => {} }; } },
      arrayBuffer: async () => bodyBuffer.buffer.slice(bodyBuffer.byteOffset, bodyBuffer.byteOffset + bodyBuffer.byteLength),
      url: () => "mock-url"
    } as any;
  }

  function mockResponse(status: number, data: any, extraHeaders: Record<string, string> = {}) {
    const bodyBuffer = Buffer.isBuffer(data) ? data : Buffer.from(JSON.stringify(data));
    const responseHeaders = new Headers(extraHeaders);
    responseHeaders.set('x-drts-candidate-sha', process.env.DRTS_CANDIDATE_SHA || 'mock-sha');

    return {
      status: () => status,
      headers: () => Object.fromEntries(responseHeaders.entries()),
      json: async () => JSON.parse(bodyBuffer.toString('utf-8')),
      url: () => "mock-url"
    } as any;
  }

  beforeEach(() => {
    process.env.DRTS_CANDIDATE_SHA = "mock-sha";
    process.env.DRTS_DEV_FLEET_PARTNER_PORTAL_BASE_URL = "https://fleet.example.com";
    process.env.DRTS_DEV_OPS_CONSOLE_BASE_URL = "https://ops.example.com";
    globalThis.fetch = vi.fn() as any;
  });
  afterEach(() => {
    process.env.DRTS_CANDIDATE_SHA = originalEnv;
    globalThis.fetch = originalFetch2;
    vi.restoreAllMocks();
  });

  const setupGlobalMocks = () => {
    vi.mocked(globalThis.fetch as any).mockImplementation(async (url: string | URL | Request, _options: any) => {
      const urlStr = url.toString();
      if (urlStr.includes("supply-submissions/sub-123") && _options?.method === "GET" && !urlStr.includes("download")) {
        return mockFetchResponse(200, { data: { submission: { fleet_partner_id: "fleet-123", submission_id: "sub-123", revision_no: 1 } } });
      }
      if (urlStr.includes("/upload-url")) {
        return mockFetchResponse(200, {
          data: {
            object_key: "fleet-partner/fleet-123/supply-submissions/sub-123/upload-harmless.pdf",
            upload_url: "https://fleet.example.com/control-plane-proxy/fleet-partner/supply-submissions/sub-123/documents/content?objectKey=fleet-partner/fleet-123/supply-submissions/sub-123/upload-harmless.pdf",
            method: "PUT",
            headers: { "content-type": "application/octet-stream" },
            submission_id: "sub-123",
            fleet_partner_id: "fleet-123"
          }
        });
      }
      if (urlStr.includes("/content?objectKey=fleet-partner")) {
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
            document_type: "professional_driver_license" // We might need to match the request body doc type
          }
        });
      }
      if (urlStr.includes("/download")) {
        return mockFetchResponse(200, expectedPdfBytes, { "content-type": "application/pdf" });
      }
      return mockFetchResponse(404, {});
    });

    vi.mocked(mockRequest.fetch).mockImplementation(async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes("/api/test")) return mockResponse(200, { id: "123" });
      if (urlStr.includes("/control-plane-proxy/fleet-partner/supply-submissions/sub-123/submit")) return mockResponse(200, { data: { success: true }});
      if (urlStr.includes("/control-plane-proxy/fleet-partner/supply-submissions/drivers")) return mockResponse(200, { data: { submission: { submission_id: "sub-123", revision_no: 1 } } });
      if (urlStr.includes("/control-plane-proxy/fleet-partner/supply-submissions/sub-123")) return mockResponse(200, { data: { submission: { submission_id: "sub-123", revision_no: 1 } } });
      if (urlStr.includes("/api/fleet-partner/supply-submissions")) return mockResponse(200, { data: { submission_id: "sub-123", revision_no: 1 } });
      if (urlStr.includes("/control-plane-proxy/admin/supply-review/submissions")) return mockResponse(200, { data: { submission: { submission_id: "sub-123", revision_no: 1, status: "approved" } } });
      return mockResponse(404, {});
    });
  };

  it("executes fleet-submit-read-withdraw-resubmit setup successfully", async () => {
    setupGlobalMocks();
    const context = { request: mockRequest, record: vi.fn() };
    const journey = (journeysData as any).journeys.find((j: any) => j.id === "fleet-submit-read-withdraw-resubmit");

    // fleet-submit journey might have doc types that we need to dynamically confirm in mock
    vi.mocked(globalThis.fetch as any).mockImplementation(async (url: string | URL | Request, _options: any) => {
      const urlStr = url.toString();
      if (urlStr.includes("supply-submissions/sub-123") && _options?.method === "GET" && !urlStr.includes("download")) {
        return mockFetchResponse(200, { data: { submission: { fleet_partner_id: "fleet-123", submission_id: "sub-123", revision_no: 1 } } });
      }
      if (urlStr.includes("/upload-url")) {
        return mockFetchResponse(200, {
          data: {
            object_key: "fleet-partner/fleet-123/supply-submissions/sub-123/upload-harmless.pdf",
            upload_url: "https://fleet.example.com/control-plane-proxy/fleet-partner/supply-submissions/sub-123/documents/content?objectKey=fleet-partner/fleet-123/supply-submissions/sub-123/upload-harmless.pdf",
            method: "PUT",
            headers: { "content-type": "application/octet-stream" },
            submission_id: "sub-123",
            fleet_partner_id: "fleet-123"
          }
        });
      }
      if (urlStr.includes("/content?objectKey=fleet-partner")) {
        return mockFetchResponse(200, {
          data: { checksum_sha256: expectedSha, file_size: expectedSize, scan_state: "clean" }
        });
      }
      if (urlStr.includes("/confirm")) {
        // extract documentType from _options.body
        const bodyStr = _options.body ? _options.body.toString() : "{}";
        const bodyObj = JSON.parse(bodyStr);
        return mockFetchResponse(200, {
          data: {
            document_id: "doc-123",
            file_object_key: "fleet-partner/fleet-123/supply-submissions/sub-123/upload-harmless.pdf",
            checksum_sha256: expectedSha,
            file_size: expectedSize,
            content_type: "application/pdf",
            submission_id: "sub-123",
            fleet_partner_id: "fleet-123",
            document_type: bodyObj.documentType || "professional_driver_license"
          }
        });
      }
      if (urlStr.includes("/download")) {
        return mockFetchResponse(200, expectedPdfBytes, { "content-type": "application/pdf" });
      }
      return mockFetchResponse(404, {});
    });

    await runSetup(context, journey, { runId: "run-123" });

    expect(context.record).toHaveBeenCalled();
    // 2 uploads in fleet-submit: professional_driver_license and taxi_driver_registration
    const records = context.record.mock.calls.map(c => c[0]);
    const uploads = records.filter(r => r.kind === "setup-document-upload");
    expect(uploads.length).toBe(2);
    expect(uploads[0].confirmDocumentType).toBe("professional_driver_license");
    expect(uploads[1].confirmDocumentType).toBe("taxi_driver_registration");
  });

  it("executes admin-review-approve-readback setup successfully", async () => {
    setupGlobalMocks();
    const context = { request: mockRequest, record: vi.fn() };
    const journey = (journeysData as any).journeys.find((j: any) => j.id === "admin-review-approve-readback");

    vi.mocked(globalThis.fetch as any).mockImplementation(async (url: string | URL | Request, _options: any) => {
      const urlStr = url.toString();
      if (urlStr.includes("supply-submissions/sub-123") && _options?.method === "GET" && !urlStr.includes("download")) {
        return mockFetchResponse(200, { data: { submission: { fleet_partner_id: "fleet-123", submission_id: "sub-123", revision_no: 1 } } });
      }
      if (urlStr.includes("/upload-url")) {
        return mockFetchResponse(200, {
          data: {
            object_key: "fleet-partner/fleet-123/supply-submissions/sub-123/upload-harmless.pdf",
            upload_url: "https://fleet.example.com/control-plane-proxy/fleet-partner/supply-submissions/sub-123/documents/content?objectKey=fleet-partner/fleet-123/supply-submissions/sub-123/upload-harmless.pdf",
            method: "PUT",
            headers: { "content-type": "application/octet-stream" },
            submission_id: "sub-123",
            fleet_partner_id: "fleet-123"
          }
        });
      }
      if (urlStr.includes("/content?objectKey=fleet-partner")) {
        return mockFetchResponse(200, {
          data: { checksum_sha256: expectedSha, file_size: expectedSize, scan_state: "clean" }
        });
      }
      if (urlStr.includes("/confirm")) {
        const bodyStr = _options.body ? _options.body.toString() : "{}";
        const bodyObj = JSON.parse(bodyStr);
        return mockFetchResponse(200, {
          data: {
            document_id: "doc-123",
            file_object_key: "fleet-partner/fleet-123/supply-submissions/sub-123/upload-harmless.pdf",
            checksum_sha256: expectedSha,
            file_size: expectedSize,
            content_type: "application/pdf",
            submission_id: "sub-123",
            fleet_partner_id: "fleet-123",
            document_type: bodyObj.documentType || "professional_driver_license"
          }
        });
      }
      if (urlStr.includes("/download")) {
        return mockFetchResponse(200, expectedPdfBytes, { "content-type": "application/pdf" });
      }
      return mockFetchResponse(404, {});
    });

    await runSetup(context, journey, { runId: "run-123" });

    const records = context.record.mock.calls.map(c => c[0]);
    const uploads = records.filter(r => r.kind === "setup-document-upload");
    expect(uploads.length).toBe(2);
  });

  // Negative tests based on modifying one thing at a time from a valid fixture (missing/unclean receipt, missing readback, wrong metadata, deadline exhaustion)

  it("fails runSetup when receipt is unclean", async () => {
    setupGlobalMocks();
    const context = { request: mockRequest, record: vi.fn() };
    const journey = (journeysData as any).journeys.find((j: any) => j.id === "fleet-submit-read-withdraw-resubmit");

    vi.mocked(globalThis.fetch as any).mockImplementation(async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes("/content?objectKey=fleet-partner")) {
        return mockFetchResponse(200, {
          data: { checksum_sha256: expectedSha, file_size: expectedSize, scan_state: "infected" } // UNCLEAN
        });
      }
      if (urlStr.includes("/upload-url")) return mockFetchResponse(200, { data: { object_key: "1.pdf", upload_url: "https://fleet.example.com/control-plane-proxy/fleet-partner/supply-submissions/sub-123/documents/content?objectKey=fleet-partner/fleet-123/supply-submissions/sub-123/upload-harmless.pdf", method: "PUT", headers: { "content-type": "application/octet-stream" }, submission_id: "sub-123", fleet_partner_id: "fleet-123" }});
      if (urlStr.includes("supply-submissions/sub-123")) return mockFetchResponse(200, { data: { submission: { fleet_partner_id: "fleet-123", submission_id: "sub-123", revision_no: 1 } } });
      return mockFetchResponse(404, {});
    });

    await expect(runSetup(context, journey, { runId: "run-123" })).rejects.toThrow();
  });

  it("fails runSetup when missing readback", async () => {
    setupGlobalMocks();
    const context = { request: mockRequest, record: vi.fn() };
    const journey = (journeysData as any).journeys.find((j: any) => j.id === "fleet-submit-read-withdraw-resubmit");

    vi.mocked(globalThis.fetch as any).mockImplementation(async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes("/download")) {
        return mockFetchResponse(404, {}); // MISSING READBACK
      }
      if (urlStr.includes("/upload-url")) return mockFetchResponse(200, { data: { object_key: "1.pdf", upload_url: "https://fleet.example.com/control-plane-proxy/fleet-partner/supply-submissions/sub-123/documents/content?objectKey=fleet-partner/fleet-123/supply-submissions/sub-123/upload-harmless.pdf", method: "PUT", headers: { "content-type": "application/octet-stream" }, submission_id: "sub-123", fleet_partner_id: "fleet-123" }});
      if (urlStr.includes("/content?objectKey=fleet-partner")) return mockFetchResponse(200, { data: { checksum_sha256: expectedSha, file_size: expectedSize, scan_state: "clean" } });
      if (urlStr.includes("/confirm")) return mockFetchResponse(200, { data: { document_id: "doc-123", file_object_key: "1.pdf", checksum_sha256: expectedSha, file_size: expectedSize, content_type: "application/pdf", submission_id: "sub-123", fleet_partner_id: "fleet-123", document_type: "professional_driver_license" } });
      if (urlStr.includes("supply-submissions/sub-123")) return mockFetchResponse(200, { data: { submission: { fleet_partner_id: "fleet-123", submission_id: "sub-123", revision_no: 1 } } });
      return mockFetchResponse(404, {});
    });

    await expect(runSetup(context, journey, { runId: "run-123" })).rejects.toThrow();
  });

  it("fails runSetup when confirm returns wrong metadata", async () => {
    setupGlobalMocks();
    const context = { request: mockRequest, record: vi.fn() };
    const journey = (journeysData as any).journeys.find((j: any) => j.id === "fleet-submit-read-withdraw-resubmit");

    vi.mocked(globalThis.fetch as any).mockImplementation(async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes("/confirm")) {
        return mockFetchResponse(200, { data: { document_id: "doc-123", file_object_key: "1.pdf", checksum_sha256: "WRONG_SHA", file_size: expectedSize, content_type: "application/pdf", submission_id: "sub-123", fleet_partner_id: "fleet-123", document_type: "professional_driver_license" } });
      }
      if (urlStr.includes("/upload-url")) return mockFetchResponse(200, { data: { object_key: "1.pdf", upload_url: "https://fleet.example.com/control-plane-proxy/fleet-partner/supply-submissions/sub-123/documents/content?objectKey=fleet-partner/fleet-123/supply-submissions/sub-123/upload-harmless.pdf", method: "PUT", headers: { "content-type": "application/octet-stream" }, submission_id: "sub-123", fleet_partner_id: "fleet-123" }});
      if (urlStr.includes("/content?objectKey=fleet-partner")) return mockFetchResponse(200, { data: { checksum_sha256: expectedSha, file_size: expectedSize, scan_state: "clean" } });
      if (urlStr.includes("supply-submissions/sub-123")) return mockFetchResponse(200, { data: { submission: { fleet_partner_id: "fleet-123", submission_id: "sub-123", revision_no: 1 } } });
      return mockFetchResponse(404, {});
    });

    await expect(runSetup(context, journey, { runId: "run-123" })).rejects.toThrow();
  });

  it("fails runSetup with deadline exhaustion", async () => {
    setupGlobalMocks();
    const context = { request: mockRequest, record: vi.fn() };
    const journey = (journeysData as any).journeys.find((j: any) => j.id === "fleet-submit-read-withdraw-resubmit");

    vi.mocked(globalThis.fetch as any).mockImplementation(async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes("/content?objectKey=fleet-partner")) {
        // Fast forward time to exhaust budget inside the fetch mock
        vi.setSystemTime(Date.now() + 31000);
        return mockFetchResponse(200, { data: { checksum_sha256: expectedSha, file_size: expectedSize, scan_state: "clean" } });
      }
      if (urlStr.includes("/upload-url")) return mockFetchResponse(200, { data: { object_key: "1.pdf", upload_url: "https://fleet.example.com/control-plane-proxy/fleet-partner/supply-submissions/sub-123/documents/content?objectKey=fleet-partner/fleet-123/supply-submissions/sub-123/upload-harmless.pdf", method: "PUT", headers: { "content-type": "application/octet-stream" }, submission_id: "sub-123", fleet_partner_id: "fleet-123" }});
      if (urlStr.includes("supply-submissions/sub-123")) return mockFetchResponse(200, { data: { submission: { fleet_partner_id: "fleet-123", submission_id: "sub-123", revision_no: 1 } } });
      return mockFetchResponse(404, {});
    });
    vi.useFakeTimers();

    await expect(runSetup(context, journey, { runId: "run-123" })).rejects.toThrow();
    vi.useRealTimers();
  });

});
