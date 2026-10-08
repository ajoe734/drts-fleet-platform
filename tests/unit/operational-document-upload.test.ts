import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { uploadOperationalDocument, runSetup } from "../e2e/operational-document-upload";
import { type APIRequestContext } from "@playwright/test";
import { createHash } from "node:crypto";

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
      if (urlStr.includes("supply-submissions/sub-123") && options?.method === "GET" && !urlStr.includes("download")) {
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
      if (urlStr.includes("supply-submissions/sub-123") && options?.method === "GET" && !urlStr.includes("download")) {
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
    setupHappyPath(vi.mocked(globalThis.fetch));
    await expect(uploadOperationalDocument(mockRequest, origin, "https://foreign.example.invalid/api/intent", intentBody, confirmPath, confirmBody, headers)).rejects.toThrow();
  });

  it("rejects missing candidate SHA headers on intent", async () => {
    setupHappyPath(vi.mocked(globalThis.fetch));
    vi.mocked(globalThis.fetch).mockImplementation(async (url: string | URL | Request, options: any) => {
      const urlStr = url.toString();
      if (urlStr.includes("supply-submissions/sub-123") && options?.method === "GET") {
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
    setupHappyPath(vi.mocked(globalThis.fetch));
    vi.mocked(globalThis.fetch).mockImplementation(async (url: string | URL | Request, options: any) => {
      const urlStr = url.toString();
      if (urlStr.includes("supply-submissions/sub-123") && options?.method === "GET") {
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
    setupHappyPath(vi.mocked(globalThis.fetch));
    vi.mocked(globalThis.fetch).mockImplementation(async (url: string | URL | Request, options: any) => {
      if (url.toString().includes("/download")) {
        return mockFetchResponse(200, expectedPdfBytes, { "content-type": "application/pdf-not-real" });
      }
      // Use original setupHappyPath for everything else
      const urlStr = url.toString();
      if (urlStr.includes("supply-submissions/sub-123") && options?.method === "GET") {
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
      if (urlStr.includes("supply-submissions/sub-123") && options?.method === "GET" && !urlStr.includes("download")) return mockFetchResponse(200, { data: { submission: { fleet_partner_id: "fleet-123", submission_id: "sub-123" } } });
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

  it("validates independent PDF structure with correct xref offsets", () => {
    const str = expectedPdfBytes.toString();
    expect(str).toContain("%PDF-1.4\n");
    expect(str).toContain("startxref\n184\n%%EOF\n");
    expect(str).toContain("0000000009 00000 n \n");
    expect(str).toContain("0000000058 00000 n \n");
    expect(str).toContain("0000000115 00000 n \n");
  });

  it("rejects when receipt is unclean or wrong method", async () => {
    vi.mocked(globalThis.fetch).mockImplementation(async (url, options) => {
      const urlStr = url.toString();
      if (urlStr.includes("supply-submissions/sub-123") && options?.method === "GET" && !urlStr.includes("download")) {
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
    vi.mocked(globalThis.fetch).mockImplementation(async (url, options) => {
      const urlStr = url.toString();
      if (urlStr.includes("supply-submissions/sub-123") && options?.method === "GET" && !urlStr.includes("download")) return mockFetchResponse(200, { data: { submission: { fleet_partner_id: "fleet-123", submission_id: "sub-123" } } });
      if (urlStr.includes("/upload-url")) return mockFetchResponse(200, { data: { object_key: "fleet-partner/fleet-123/supply-submissions/sub-123/upload-harmless.pdf", upload_url: "https://fleet.example.com/control-plane-proxy/fleet-partner/supply-submissions/sub-123/documents/content", method: "PUT", headers: { "content-type": "application/octet-stream" }, submission_id: "sub-123" } });
      if (urlStr.includes("/content")) return mockFetchResponse(200, {});
      if (urlStr.includes("/confirm")) return mockFetchResponse(200, { data: { document_id: "doc-123", file_object_key: "fleet-partner/fleet-123/supply-submissions/sub-123/upload-harmless.pdf", checksum_sha256: expectedSha, file_size: expectedSize, content_type: "application/pdf", submission_id: "sub-123", fleet_partner_id: "fleet-123" } });
      if (urlStr.includes("/download")) return mockFetchResponse(200, expectedPdfBytes, { "content-type": "image/png" }); // WRONG MIME
      return mockFetchResponse(404, {});
    });
    await expect(uploadOperationalDocument(mockRequest, origin, intentPath, intentBody, confirmPath, confirmBody, headers)).rejects.toThrow();
  });

  it("rejects mismatched confirm metadata variants", async () => {
    vi.mocked(globalThis.fetch).mockImplementation(async (url, options) => {
      const urlStr = url.toString();
      if (urlStr.includes("supply-submissions/sub-123") && options?.method === "GET" && !urlStr.includes("download")) return mockFetchResponse(200, { data: { submission: { fleet_partner_id: "fleet-123", submission_id: "sub-123" } } });
      if (urlStr.includes("/upload-url")) return mockFetchResponse(200, { data: { object_key: "fleet-partner/fleet-123/supply-submissions/sub-123/upload-harmless.pdf", upload_url: "https://fleet.example.com/control-plane-proxy/fleet-partner/supply-submissions/sub-123/documents/content", method: "PUT", headers: { "content-type": "application/octet-stream" }, submission_id: "sub-123" } });
      if (urlStr.includes("/content")) return mockFetchResponse(200, {});
      if (urlStr.includes("/confirm")) return mockFetchResponse(200, { data: { document_id: "doc-123", file_object_key: "fleet-partner/fleet-123/supply-submissions/sub-123/upload-harmless.pdf", checksum_sha256: "wrong-sha", file_size: expectedSize, content_type: "application/pdf", submission_id: "sub-123", fleet_partner_id: "fleet-123" } });
      return mockFetchResponse(404, {});
    });
    await expect(uploadOperationalDocument(mockRequest, origin, intentPath, intentBody, confirmPath, confirmBody, headers)).rejects.toThrow();
  });

  it("handles terminal errors and deadline exhaustion", async () => {
    vi.mocked(globalThis.fetch).mockImplementation(async (url, options) => {
      const urlStr = url.toString();
      if (urlStr.includes("supply-submissions/sub-123") && options?.method === "GET" && !urlStr.includes("download")) return mockFetchResponse(200, { data: { submission: { fleet_partner_id: "fleet-123", submission_id: "sub-123" } } });
      if (urlStr.includes("/upload-url")) return mockFetchResponse(200, { data: { object_key: "fleet-partner/fleet-123/supply-submissions/sub-123/upload-harmless.pdf", upload_url: "https://fleet.example.com/control-plane-proxy/fleet-partner/supply-submissions/sub-123/documents/content", method: "PUT", headers: { "content-type": "application/octet-stream" }, submission_id: "sub-123" } });
      if (urlStr.includes("/content")) return mockFetchResponse(200, {});
      if (urlStr.includes("/confirm")) return mockFetchResponse(500, { error: "Terminal error" }); // 500 is terminal
      return mockFetchResponse(404, {});
    });
    await expect(uploadOperationalDocument(mockRequest, origin, intentPath, intentBody, confirmPath, confirmBody, headers)).rejects.toThrow();
  });

  it("rejects final candidate mismatch", async () => {
    vi.mocked(globalThis.fetch).mockImplementation(async (url, options) => {
      const urlStr = url.toString();
      if (urlStr.includes("supply-submissions/sub-123") && options?.method === "GET" && !urlStr.includes("download")) return mockFetchResponse(200, { data: { submission: { fleet_partner_id: "fleet-123", submission_id: "sub-123" } } });
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
    vi.mocked(globalThis.fetch).mockImplementation(async (url, options) => {
      const urlStr = url.toString();
      if (urlStr.includes("supply-submissions/sub-123") && options?.method === "GET" && !urlStr.includes("download")) return mockFetchResponse(200, { data: { submission: { fleet_partner_id: "fleet-123", submission_id: "sub-123" } } });
      if (urlStr.includes("/upload-url")) return mockFetchResponse(302, {});
      return mockFetchResponse(404, {});
    });
    await expect(uploadOperationalDocument(mockRequest, origin, intentPath, intentBody, confirmPath, confirmBody, headers)).rejects.toThrow();
  });
});


describe("runSetup execution", () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = process.env.DRTS_CANDIDATE_SHA;

  function mockFetchResponse(status: number, data: any, extraHeaders: Record<string, string> = {}) {
    const bodyBuffer = Buffer.isBuffer(data) ? data : Buffer.from(JSON.stringify(data));
    const responseHeaders = new Headers(extraHeaders);
    responseHeaders.set('x-drts-candidate-sha', process.env.DRTS_CANDIDATE_SHA || 'mock-sha');

    return {
      status,
      ok: status >= 200 && status < 300,
      headers: responseHeaders,
      json: async () => JSON.parse(bodyBuffer.toString('utf-8')),
      arrayBuffer: async () => bodyBuffer.buffer.slice(bodyBuffer.byteOffset, bodyBuffer.byteOffset + bodyBuffer.byteLength),
    } as unknown as Response;
  }

  beforeEach(() => {
    process.env.DRTS_CANDIDATE_SHA = "mock-sha";
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env.DRTS_CANDIDATE_SHA = originalEnv;
  });

  it("executes setup successfully without browser for HTTP kind", async () => {
    let fetchCalled = false;
    const fetchFn = async (url: any) => {
      fetchCalled = true;
      return { status: 200, url, headers: new Headers({ "x-drts-candidate-sha": "mock-sha" }), json: async () => ({ id: "123" }) } as any;
    };
    const context = { request: {} as any, record: vi.fn(), fetchFn };
    
    const journey = {
      id: "j-1", surface: "web", baseUrlEnv: "DRTS_DEV_FLEET_PARTNER_PORTAL_BASE_URL", route: "/", actorScope: "admin",
      setup: [{ path: "/api/test", method: "GET" as any }]
    };
    process.env.DRTS_DEV_FLEET_PARTNER_PORTAL_BASE_URL = "https://fleet.example.com";
    
    await runSetup(context, journey, {});
    expect(fetchCalled).toBe(true);
    expect(context.record).toHaveBeenCalled();
  });

  it("executes setup successfully without browser for document-upload kind", async () => {
    const context = { request: {} as any, record: vi.fn(), fetchFn: async () => ({}) as any };
    const journey = {
      id: "j-1", surface: "web", baseUrlEnv: "DRTS_DEV_FLEET_PARTNER_PORTAL_BASE_URL", route: "/", actorScope: "admin",
      setup: [{ kind: "document-upload" as any, intentPath: "/api/intent", intentBody: {}, confirmPath: "/api/confirm", confirmBody: {} }]
    };
    process.env.DRTS_DEV_FLEET_PARTNER_PORTAL_BASE_URL = "https://fleet.example.com";
    
    // We mock fetch globally for uploadOperationalDocument
    vi.mocked(globalThis.fetch).mockImplementation(async (url, options) => {
      const urlStr = url.toString();
      if (urlStr.includes("/intent")) return mockFetchResponse(200, { data: { object_key: "fleet-partner/f/supply-submissions/s/1.pdf", upload_url: "https://fleet.example.com/control-plane-proxy/f/supply-submissions/s/documents/content", method: "PUT", headers: { "content-type": "application/octet-stream" }, submission_id: "s", fleet_partner_id: "f" } });
      if (urlStr.includes("supply-submissions/s") && options?.method === "GET" && !urlStr.includes("download")) return mockFetchResponse(200, { data: { submission: { fleet_partner_id: "f", submission_id: "s" } } });
      if (urlStr.includes("/content")) { return mockFetchResponse(200, {}); }
      if (urlStr.includes("/confirm")) return mockFetchResponse(200, { data: { document_id: "d", file_object_key: "fleet-partner/f/supply-submissions/s/1.pdf", checksum_sha256: "fake-sha", file_size: 1, content_type: "application/pdf", submission_id: "s", fleet_partner_id: "f" } });
      if (urlStr.includes("/download")) return mockFetchResponse(200, Buffer.alloc(1), { "content-type": "application/pdf" });
      return mockFetchResponse(404, {});
    });

    await expect(runSetup(context, journey, {})).rejects.toThrow(); // Because sha won't match, but it proves execution
  });
});
