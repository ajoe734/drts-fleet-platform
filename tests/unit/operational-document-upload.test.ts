import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  uploadOperationalDocument,
  runSetup,
  operationalRequestHeaders,
  installOperationalBrowserHeaders,
  fetchOperationalSurface,
  prepareOperationalFleetSession,
  type PreparedOperationalFleetSession,
  type Journey,
} from "../e2e/operational-document-upload";
import {
  type APIRequestContext,
  type Page,
  type Route,
} from "@playwright/test";
import { createHash } from "node:crypto";
import journeysData from "../e2e/fixtures/operational-browser-journeys.json";
import { deepToSnakeCase } from "../../apps/api/src/common/snake-case.interceptor";

function checkActualPdf(bytes: Buffer) {
  const text = bytes.toString("ascii");
  expect(text.startsWith("%PDF-")).toBe(true);
  const sx = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(text);
  expect(sx).toBeTruthy();
  const xrefOffset = Number(sx![1]);
  expect(text.slice(xrefOffset, xrefOffset + 4)).toBe("xref");
  const xref = /^xref\s+0\s+(\d+)\s*\n([\s\S]*?)trailer\s*\n/.exec(
    text.slice(xrefOffset),
  );
  expect(xref).toBeTruthy();
  const entries = (xref![2] || "").trim().split(/\r?\n/);
  expect(entries.length).toBe(Number(xref![1]));
  expect(entries[0]).toMatch(/^0000000000 65535 f/);
  for (let i = 1; i < entries.length; i++) {
    const entryStr = entries[i] || "";
    const entry = /^(\d{10}) (\d{5}) n/.exec(entryStr);
    expect(entry).toBeTruthy();
    const offset = Number(entry![1]);
    expect(text.slice(offset, offset + `${i} 0 obj`.length)).toBe(`${i} 0 obj`);
    expect(offset).toBeLessThan(xrefOffset);
  }
  expect(text).toMatch(/\/Type\s*\/Catalog\s*\/Pages\s+2\s+0\s+R/);
  expect(text).toMatch(
    /\/Type\s*\/Pages\s*\/Kids\s*\[3\s+0\s+R\]\s*\/Count\s+1/,
  );
  expect(text).toMatch(
    /\/Type\s*\/Page\s*\/Parent\s+2\s+0\s+R\s*\/MediaBox\s*\[0\s+0\s+72\s+72\]/,
  );
  expect(text.slice(xrefOffset)).toMatch(/\/Size\s+4\s*\/Root\s+1\s+0\s+R/);
  return {
    length: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    xrefOffset,
    objectCount: entries.length - 1,
  };
}

function jsonResponse(
  body: any,
  status = 200,
  extraHeaders: Record<string, string> = {},
) {
  const responseHeaders = new Headers({
    "content-type": "application/json",
    "x-drts-candidate-sha":
      process.env.DRTS_CANDIDATE_SHA || "mock-candidate-sha",
    ...extraHeaders,
  });
  const bodyBuffer = Buffer.from(JSON.stringify(body));
  return {
    status,
    headers: responseHeaders,
    json: async () => body,
    url: () => "mock-url",
    body: {
      getReader: () => {
        let done = false;
        return {
          read: async () => {
            if (done) return { done: true };
            done = true;
            return { done: false, value: bodyBuffer };
          },
          cancel: () => {},
        };
      },
    },
  } as any;
}

function pdfResponse(
  bytes: Buffer,
  status = 200,
  extraHeaders: Record<string, string> = {},
) {
  const responseHeaders = new Headers({
    "content-type": "application/pdf",
    "x-drts-candidate-sha":
      process.env.DRTS_CANDIDATE_SHA || "mock-candidate-sha",
    ...extraHeaders,
  });
  return {
    status,
    headers: responseHeaders,
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    url: () => "mock-url",
    body: {
      getReader: () => {
        let done = false;
        return {
          read: async () => {
            if (done) return { done: true };
            done = true;
            return { done: false, value: bytes };
          },
          cancel: () => {},
        };
      },
    },
  } as any;
}

export class MockServer {
  calls: Array<{
    method: string;
    url: string;
    pathname: string;
    search: string;
    query: Record<string, string>;
    headers: Record<string, string>;
    data?: any;
    bytes?: Buffer | undefined;
    ioBoundary: string;
    authSource: string;
  }> = [];
  records: any[] = [];
  documents: any[] = [];
  revision = 1;
  active: any = null;
  bytes: Buffer | null = null;
  hash: string | null = null;

  origin = "https://fleet.example.invalid";
  parent =
    "/control-plane-proxy/fleet-partner/supply-submissions/sub-setup-123";
  fleet = "fleet-setup-123";
  runId = "socket-free-dummy-run";

  explicitAuthorization = false;
  expectedAuth = "Bearer fleet-dummy-id-token";
  expectedApplicationAuth: string | undefined;

  downloadReaderStarted = false;
  downloadReaderAborted = false;
  downloadPassedSignal: AbortSignal | null = null;
  readerCancelObserved = false;
  readbackChunksRead = 0;

  mutations = {
    authorityStatus: 200,
    authorityMissingCandidateSha: false,

    intentStatus: 200,
    missingIntentAuth: false,
    intentWrongMethod: false,
    intentForeignUrl: false,
    intentMissingCandidateSha: false,

    putMethod: "PUT",
    putMissingCandidateSha: false,
    putOversized: false,
    put503Count: 0,
    put503Delay: 0,
    put503ErrorCode: "DOCUMENT_SCANNER_UNAVAILABLE",
    putReceiptMissing: false,
    putReceiptUnclean: false,
    putReceiptWrongHash: false,
    putReceiptWrongSize: false,
    advanceTimeAfterPut: 0,

    confirmStatus: 200,
    confirmMissing: false,
    confirmWrongKey: false,
    confirmWrongHash: false,
    confirmWrongSize: false,
    confirmWrongMime: false,
    confirmTerminal500: false,
    confirmWrongSubmission: false,
    confirmWrongFleet: false,
    confirmWrongDocType: false,
    confirmWrongId: false,
    confirmMissingCandidateSha: false,

    readbackAbsent: false,
    readbackWrongMime: false,
    readbackWrongSize: false,
    readbackCorrupt: false,
    readbackMissingCandidateSha: false,
    readbackOversized: false,
    readbackMultiChunkOversized: false,
    readbackExact1MiB: false,
    readback1MiBPlus1: false,
    downloadBodyHangs: false,
  };

  createFetch() {
    return async (input: string | URL | Request, init: any = {}) => {
      const url = new URL(String(input));
      const method = init.method || "GET";
      const headers = new Headers(init.headers);
      const body =
        init.data !== undefined
          ? init.data
          : typeof init.body === "string"
            ? JSON.parse(init.body)
            : undefined;
      const bytes = method === "PUT" ? Buffer.from(init.body || []) : undefined;

      this.calls.push({
        method,
        url: url.toString(),
        pathname: url.pathname,
        search: url.search,
        query: Object.fromEntries(url.searchParams.entries()),
        headers: Object.fromEntries(headers.entries()),
        data: body,
        bytes,
        ioBoundary: init.ioBoundary || "raw-fetch",
        authSource: this.explicitAuthorization ? "explicit" : "fleet-env",
      });

      if (this.mutations.intentForeignUrl && this.calls.length === 1) {
        // foreign intent URL check bypass for initial call
      } else {
        expect(url.origin).toBe(this.origin);
      }

      if (this.mutations.missingIntentAuth) {
        // skip auth check
      } else {
        expect(headers.get("authorization")).toBe(this.expectedAuth);
      }
      if (
        this.expectedApplicationAuth &&
        headers.get("x-drts-authorization") !== this.expectedApplicationAuth
      ) {
        return jsonResponse({ error: { code: "JWT_INVALID" } }, 401);
      }

      if (
        url.pathname ===
          "/control-plane-proxy/fleet-partner/supply-submissions/drivers" &&
        method === "POST"
      ) {
        return jsonResponse({
          data: {
            submission: {
              submission_id: "sub-setup-123",
              fleet_partner_id: this.fleet,
              revision_no: this.revision,
            },
          },
        });
      }

      if (url.pathname === this.parent && method === "GET") {
        if (this.mutations.authorityStatus !== 200) {
          return jsonResponse(
            { error: "Authority failed" },
            this.mutations.authorityStatus,
          );
        }
        return jsonResponse(
          {
            data: {
              submission: {
                submission_id: "sub-setup-123",
                fleet_partner_id: this.fleet,
                revision_no: this.revision,
              },
            },
          },
          200,
          this.mutations.authorityMissingCandidateSha
            ? { "x-drts-candidate-sha": "" }
            : {},
        );
      }

      if (url.pathname === this.parent + "/documents/upload-url") {
        if (this.mutations.intentWrongMethod) {
          expect(method).toBe("GET");
        } else {
          expect(method).toBe("POST");
        }

        if (this.mutations.intentStatus !== 200) {
          return jsonResponse(
            { error: "Intent failed" },
            this.mutations.intentStatus,
          );
        }

        if (body?.expectedRevisionNo !== undefined) {
          expect(body.expectedRevisionNo).toBe(this.revision);
        }

        this.active = {
          objectKey: `fleet-partner/${this.fleet}/supply-submissions/sub-setup-123/${body.documentType}.pdf`,
          documentType: body.documentType,
          documentId: `doc-${this.documents.length + 1}`,
        };
        const returned = new URL(
          this.parent.replace(/^\/control-plane-proxy\//, "/api/") +
            "/documents/content",
          this.origin,
        );
        returned.searchParams.set("objectKey", this.active.objectKey);

        return jsonResponse(
          {
            data: {
              object_key: this.active.objectKey,
              upload_url: returned.pathname + returned.search,
              method: this.mutations.putMethod,
              headers: { "content-type": "application/octet-stream" },
              submission_id: "sub-setup-123",
            },
          },
          200,
          this.mutations.intentMissingCandidateSha
            ? { "x-drts-candidate-sha": "" }
            : {},
        );
      }

      if (url.pathname === this.parent + "/documents/content") {
        expect(method).toBe(this.mutations.putMethod);
        this.bytes = Buffer.from(init.body || []);
        if (this.mutations.putOversized) {
          this.bytes = Buffer.alloc(1024 * 1024 + 10);
        }
        const structure = checkActualPdf(this.bytes);
        this.hash = structure.sha256;

        if (this.mutations.put503Count > 0) {
          this.mutations.put503Count--;
          if (this.mutations.put503Delay > 0) {
            await new Promise((resolve) =>
              setTimeout(resolve, this.mutations.put503Delay),
            );
          }
          return jsonResponse(
            { error: { code: this.mutations.put503ErrorCode } },
            503,
            this.mutations.putMissingCandidateSha
              ? { "x-drts-candidate-sha": "" }
              : {},
          );
        }

        if (this.mutations.putReceiptMissing) {
          return jsonResponse(
            {},
            200,
            this.mutations.putMissingCandidateSha
              ? { "x-drts-candidate-sha": "" }
              : {},
          );
        }

        this.documents.push({ ...this.active, structure });

        if (this.mutations.advanceTimeAfterPut > 0) {
          vi.advanceTimersByTime(this.mutations.advanceTimeAfterPut);
        }

        return jsonResponse(
          {
            data: {
              checksum_sha256: this.mutations.putReceiptWrongHash
                ? "wrong-hash"
                : this.hash,
              file_size: this.mutations.putReceiptWrongSize
                ? 999999
                : this.bytes.length,
              scan_state: this.mutations.putReceiptUnclean
                ? "infected"
                : "clean",
            },
          },
          200,
          this.mutations.putMissingCandidateSha
            ? { "x-drts-candidate-sha": "" }
            : {},
        );
      }

      if (url.pathname === this.parent + "/documents/confirm") {
        if (this.mutations.confirmMissing) {
          return jsonResponse(
            {},
            200,
            this.mutations.confirmMissingCandidateSha
              ? { "x-drts-candidate-sha": "" }
              : {},
          );
        }
        if (this.mutations.confirmTerminal500) {
          return jsonResponse({ error: "Terminal" }, 500);
        }
        if (this.mutations.confirmStatus !== 200) {
          return jsonResponse(
            { error: "Confirm status failed" },
            this.mutations.confirmStatus,
          );
        }

        this.revision++;
        return jsonResponse(
          {
            data: {
              document_id: this.mutations.confirmWrongId
                ? "invalid/segment/id"
                : this.active?.documentId || "doc-1",
              file_object_key: this.mutations.confirmWrongKey
                ? "wrong-key"
                : this.active?.objectKey,
              checksum_sha256: this.mutations.confirmWrongHash
                ? "wrong-hash"
                : this.hash,
              file_size: this.mutations.confirmWrongSize
                ? 999999
                : this.bytes!.length,
              content_type: this.mutations.confirmWrongMime
                ? "image/png"
                : "application/pdf",
              document_type: this.mutations.confirmWrongDocType
                ? "wrong_type"
                : this.active?.documentType || "professional_driver_license",
              submission_id: this.mutations.confirmWrongSubmission
                ? "wrong-sub"
                : "sub-setup-123",
              fleet_partner_id: this.mutations.confirmWrongFleet
                ? "wrong-fleet"
                : this.fleet,
            },
          },
          200,
          this.mutations.confirmMissingCandidateSha
            ? { "x-drts-candidate-sha": "" }
            : {},
        );
      }

      if (
        url.pathname ===
        this.parent +
          "/documents/" +
          (this.active?.documentId || "doc-1") +
          "/download"
      ) {
        if (this.mutations.readbackAbsent) {
          return jsonResponse({}, 404);
        }

        const candidateHeader = this.mutations.readbackMissingCandidateSha
          ? ""
          : process.env.DRTS_CANDIDATE_SHA || "mock-candidate-sha";
        const downloadHeaders = new Headers({
          "content-type": this.mutations.readbackWrongMime
            ? "image/png"
            : "application/pdf",
          "x-drts-candidate-sha": candidateHeader,
        });

        if (this.mutations.downloadBodyHangs) {
          this.downloadPassedSignal = init.signal || null;
          return {
            status: 200,
            headers: downloadHeaders,
            url: () => url.toString(),
            body: {
              getReader: () => {
                return {
                  read: () => {
                    this.downloadReaderStarted = true;
                    return new Promise<{ done: boolean; value?: Uint8Array }>(
                      (_resolve, reject) => {
                        if (init.signal) {
                          if (init.signal.aborted) {
                            this.downloadReaderAborted = true;
                            reject(init.signal.reason || new Error("Timeout"));
                            return;
                          }
                          init.signal.addEventListener("abort", () => {
                            this.downloadReaderAborted = true;
                            reject(init.signal.reason || new Error("Timeout"));
                          });
                        }
                      },
                    );
                  },
                  cancel: () => {},
                };
              },
            },
          } as any;
        }

        if (this.mutations.readbackMultiChunkOversized) {
          const chunks = [
            Buffer.alloc(600 * 1024, 0x41),
            Buffer.alloc(500 * 1024, 0x42),
            Buffer.alloc(100 * 1024, 0x43),
          ];
          let chunkIdx = 0;
          return {
            status: 200,
            headers: downloadHeaders,
            url: () => url.toString(),
            body: {
              getReader: () => {
                return {
                  read: async () => {
                    if (chunkIdx >= chunks.length) return { done: true };
                    const val = chunks[chunkIdx++];
                    this.readbackChunksRead = chunkIdx;
                    return { done: false, value: val };
                  },
                  cancel: () => {
                    this.readerCancelObserved = true;
                  },
                };
              },
            },
          } as any;
        }

        let downloadBuffer = this.bytes!;
        if (this.mutations.readbackOversized) {
          downloadBuffer = Buffer.alloc(1024 * 1024 + 10);
        } else if (this.mutations.readbackExact1MiB) {
          downloadBuffer = Buffer.alloc(1024 * 1024, 0x5a);
        } else if (this.mutations.readback1MiBPlus1) {
          downloadBuffer = Buffer.alloc(1024 * 1024 + 1, 0x5a);
        } else if (this.mutations.readbackCorrupt) {
          downloadBuffer = Buffer.from("corrupt");
        }

        return pdfResponse(downloadBuffer, 200, {
          "content-type": this.mutations.readbackWrongMime
            ? "image/png"
            : "application/pdf",
          "x-drts-candidate-sha": candidateHeader,
        });
      }

      if (url.pathname === this.parent + "/submit") {
        return jsonResponse({
          data: {
            submission: {
              submission_id: "sub-setup-123",
              fleet_partner_id: this.fleet,
              revision_no: ++this.revision,
            },
          },
        });
      }

      throw new Error(`Unexpected exact setup route: ${method} ${url}`);
    };
  }
}

describe("uploadOperationalDocument", () => {
  let server: MockServer;
  let originalFetch: typeof globalThis.fetch;
  let originalEnv: string | undefined;
  let mockRequest: APIRequestContext;

  const origin = "https://fleet.example.invalid";
  const intentPath =
    "/control-plane-proxy/fleet-partner/supply-submissions/sub-setup-123/documents/upload-url";
  const intentBody = { documentType: "professional_driver_license" };
  const confirmPath =
    "/control-plane-proxy/fleet-partner/supply-submissions/sub-setup-123/documents/confirm";
  const confirmBody = { documentType: "professional_driver_license" };
  const headers = { Authorization: "Bearer fleet-dummy-id-token" };

  beforeEach(() => {
    server = new MockServer();
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(server.createFetch()) as any;
    originalEnv = process.env.DRTS_CANDIDATE_SHA;
    process.env.DRTS_CANDIDATE_SHA = "mock-candidate-sha";

    mockRequest = {
      fetch: vi.fn(async (url, options = {}) => {
        const res = await (globalThis.fetch as any)(url, {
          ...options,
          ioBoundary: "api-request",
        });
        return {
          status: () => res.status,
          url: () => url,
          headers: () => Object.fromEntries(res.headers),
          json: () => res.json(),
        };
      }),
    } as unknown as APIRequestContext;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalEnv !== undefined) {
      process.env.DRTS_CANDIDATE_SHA = originalEnv;
    } else {
      delete process.env.DRTS_CANDIDATE_SHA;
    }
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("completes full lifecycle with intent, PUT, confirm, and GET download", async () => {
    const result = await uploadOperationalDocument(
      mockRequest,
      origin,
      intentPath,
      intentBody,
      confirmPath,
      confirmBody,
      headers,
    );
    expect(result.documentId).toBe("doc-1");
    expect(server.calls.length).toBe(5);
    expect(server.calls.map((c) => c.method)).toEqual([
      "GET",
      "POST",
      "PUT",
      "POST",
      "GET",
    ]);
    expect(server.calls[2]?.bytes).toBeDefined();
    expect(server.calls[2]?.bytes?.length).toBe(327);
  });

  it("carries separate Fleet application proof through all five validated document hops", async () => {
    server.expectedApplicationAuth = "Bearer existing-partner-session-dummy";
    const result = await uploadOperationalDocument(
      mockRequest,
      origin,
      intentPath,
      intentBody,
      confirmPath,
      confirmBody,
      { ...headers, "x-drts-authorization": server.expectedApplicationAuth },
    );
    expect(result.readbackSha256).toBe(result.sha256);
    expect(server.calls.map((c) => c.method)).toEqual([
      "GET",
      "POST",
      "PUT",
      "POST",
      "GET",
    ]);
    for (const call of server.calls) {
      expect(call.headers["authorization"]).toBe(headers.Authorization);
      expect(call.headers["x-drts-authorization"]).toBe(
        server.expectedApplicationAuth,
      );
    }
  });

  it("rejects foreign origin intent URL", async () => {
    server.mutations.intentForeignUrl = true;
    await expect(
      uploadOperationalDocument(
        mockRequest,
        origin,
        "https://foreign.example.invalid/api/intent",
        intentBody,
        confirmPath,
        confirmBody,
        headers,
      ),
    ).rejects.toThrow(/Received: "https:\/\/foreign\.example\.invalid"/);
    expect(server.calls.length).toBe(0);
  });

  it("rejects intent URL containing query parameters", async () => {
    await expect(
      uploadOperationalDocument(
        mockRequest,
        origin,
        intentPath + "?unexpected=param",
        intentBody,
        confirmPath,
        confirmBody,
        headers,
      ),
    ).rejects.toThrow(/Received: 1/);
    expect(server.calls.length).toBe(0);
  });

  it("rejects intent URL containing fragment", async () => {
    await expect(
      uploadOperationalDocument(
        mockRequest,
        origin,
        intentPath + "#unexpected-fragment",
        intentBody,
        confirmPath,
        confirmBody,
        headers,
      ),
    ).rejects.toThrow(/Received: "#unexpected-fragment"/);
    expect(server.calls.length).toBe(0);
  });

  it("rejects traversal or non-matching parent prefix in intent URL", async () => {
    await expect(
      uploadOperationalDocument(
        mockRequest,
        origin,
        "/control-plane-proxy/other/path/documents/upload-url",
        intentBody,
        confirmPath,
        confirmBody,
        headers,
      ),
    ).rejects.toThrow(/Received: null/);
    expect(server.calls.length).toBe(0);
  });

  it("rejects foreign origin confirm URL", async () => {
    await expect(
      uploadOperationalDocument(
        mockRequest,
        origin,
        intentPath,
        intentBody,
        "https://foreign.example.invalid/documents/confirm",
        confirmBody,
        headers,
      ),
    ).rejects.toThrow(/Received: "https:\/\/foreign\.example\.invalid"/);
    expect(server.calls.length).toBe(0);
  });

  it("rejects confirm URL pathname not matching parent scope", async () => {
    await expect(
      uploadOperationalDocument(
        mockRequest,
        origin,
        intentPath,
        intentBody,
        "/control-plane-proxy/fleet-partner/supply-submissions/other-sub/documents/confirm",
        confirmBody,
        headers,
      ),
    ).rejects.toThrow(
      /Received: "\/control-plane-proxy\/fleet-partner\/supply-submissions\/other-sub\/documents\/confirm"/,
    );
    expect(server.calls.length).toBe(0);
  });

  it("rejects missing candidate SHA on authoritative readback", async () => {
    server.mutations.authorityMissingCandidateSha = true;
    await expect(
      uploadOperationalDocument(
        mockRequest,
        origin,
        intentPath,
        intentBody,
        confirmPath,
        confirmBody,
        headers,
      ),
    ).rejects.toThrow(/Received: (null|"")/);
    expect(server.calls.length).toBe(1);
    expect(server.calls[0]?.method).toBe("GET");
  });

  it("rejects unexpected status on authoritative readback", async () => {
    server.mutations.authorityStatus = 500;
    await expect(
      uploadOperationalDocument(
        mockRequest,
        origin,
        intentPath,
        intentBody,
        confirmPath,
        confirmBody,
        headers,
      ),
    ).rejects.toThrow(/Received: 500/);
    expect(server.calls.length).toBe(1);
    expect(server.calls[0]?.method).toBe("GET");
  });

  it("rejects missing candidate SHA headers on intent", async () => {
    server.mutations.intentMissingCandidateSha = true;
    await expect(
      uploadOperationalDocument(
        mockRequest,
        origin,
        intentPath,
        intentBody,
        confirmPath,
        confirmBody,
        headers,
      ),
    ).rejects.toThrow(/Received: (null|"")/);
    expect(server.calls.length).toBe(2);
    expect(server.calls.map((c) => c.method)).toEqual(["GET", "POST"]);
  });

  it("rejects unexpected status on intent request", async () => {
    server.mutations.intentStatus = 500;
    await expect(
      uploadOperationalDocument(
        mockRequest,
        origin,
        intentPath,
        intentBody,
        confirmPath,
        confirmBody,
        headers,
      ),
    ).rejects.toThrow(/Received: false/);
    expect(server.calls.length).toBe(2);
  });

  it("rejects missing candidate SHA on PUT response", async () => {
    server.mutations.putMissingCandidateSha = true;
    await expect(
      uploadOperationalDocument(
        mockRequest,
        origin,
        intentPath,
        intentBody,
        confirmPath,
        confirmBody,
        headers,
      ),
    ).rejects.toThrow(/Received: (null|"")/);
    expect(server.calls.length).toBe(3);
    expect(server.calls.map((c) => c.method)).toEqual(["GET", "POST", "PUT"]);
  });

  it("rejects missing candidate SHA on confirm response", async () => {
    server.mutations.confirmMissingCandidateSha = true;
    await expect(
      uploadOperationalDocument(
        mockRequest,
        origin,
        intentPath,
        intentBody,
        confirmPath,
        confirmBody,
        headers,
      ),
    ).rejects.toThrow(/Received: (null|"")/);
    expect(server.calls.length).toBe(4);
    expect(server.calls.map((c) => c.method)).toEqual([
      "GET",
      "POST",
      "PUT",
      "POST",
    ]);
  });

  it("rejects final candidate mismatch on download readback", async () => {
    server.mutations.readbackMissingCandidateSha = true;
    await expect(
      uploadOperationalDocument(
        mockRequest,
        origin,
        intentPath,
        intentBody,
        confirmPath,
        confirmBody,
        headers,
      ),
    ).rejects.toThrow(/Received: (null|"")/);
    expect(server.calls.length).toBe(5);
  });

  it("rejects oversized response exceeding 1MB", async () => {
    server.mutations.readbackOversized = true;
    await expect(
      uploadOperationalDocument(
        mockRequest,
        origin,
        intentPath,
        intentBody,
        confirmPath,
        confirmBody,
        headers,
      ),
    ).rejects.toThrow(/Response exceeded bounded limit of 1MB/);
    expect(server.calls.length).toBe(5);
  });

  it("rejects multi-chunk response cumulatively exceeding 1MB and observes reader cancel", async () => {
    server.mutations.readbackMultiChunkOversized = true;
    await expect(
      uploadOperationalDocument(
        mockRequest,
        origin,
        intentPath,
        intentBody,
        confirmPath,
        confirmBody,
        headers,
      ),
    ).rejects.toThrow(/Response exceeded bounded limit of 1MB/);
    expect(server.readerCancelObserved).toBe(true);
    expect(server.readbackChunksRead).toBe(2);
    expect(server.calls.length).toBe(5);
  });

  it("accepts exact 1MiB payload through byte guard before readback checksum validation", async () => {
    server.mutations.readbackExact1MiB = true;
    await expect(
      uploadOperationalDocument(
        mockRequest,
        origin,
        intentPath,
        intentBody,
        confirmPath,
        confirmBody,
        headers,
      ),
    ).rejects.toThrow(
      /4028af3714fa07d2f20e758649532faef11b4818c99a2b8dc0c88170a0dc8784/,
    );
    expect(server.calls.length).toBe(5);
  });

  it("rejects exact 1MiB plus 1 byte payload at byte guard", async () => {
    server.mutations.readback1MiBPlus1 = true;
    await expect(
      uploadOperationalDocument(
        mockRequest,
        origin,
        intentPath,
        intentBody,
        confirmPath,
        confirmBody,
        headers,
      ),
    ).rejects.toThrow(/Response exceeded bounded limit of 1MB/);
    expect(server.calls.length).toBe(5);
  });

  it("rejects strict MIME gap on readback", async () => {
    server.mutations.readbackWrongMime = true;
    await expect(
      uploadOperationalDocument(
        mockRequest,
        origin,
        intentPath,
        intentBody,
        confirmPath,
        confirmBody,
        headers,
      ),
    ).rejects.toThrow(/Received: "image\/png"/);
    expect(server.calls.length).toBe(5);
  });

  it("rejects corrupt readback content with checksum mismatch", async () => {
    server.mutations.readbackCorrupt = true;
    await expect(
      uploadOperationalDocument(
        mockRequest,
        origin,
        intentPath,
        intentBody,
        confirmPath,
        confirmBody,
        headers,
      ),
    ).rejects.toThrow(
      /4028af3714fa07d2f20e758649532faef11b4818c99a2b8dc0c88170a0dc8784/,
    );
    expect(server.calls.length).toBe(5);
  });

  it("rejects absent download readback with 404", async () => {
    server.mutations.readbackAbsent = true;
    await expect(
      uploadOperationalDocument(
        mockRequest,
        origin,
        intentPath,
        intentBody,
        confirmPath,
        confirmBody,
        headers,
      ),
    ).rejects.toThrow(/Received: 404/);
    expect(server.calls.length).toBe(5);
  });

  it("retries PUT on 503 DOCUMENT_SCANNER_UNAVAILABLE and verifies identical payload across attempts", async () => {
    server.mutations.put503Count = 3;
    vi.useFakeTimers();
    const promise = uploadOperationalDocument(
      mockRequest,
      origin,
      intentPath,
      intentBody,
      confirmPath,
      confirmBody,
      headers,
    );
    for (let i = 0; i < 3; i++) {
      await vi.runAllTimersAsync();
    }
    const result = await promise;
    expect(result.documentId).toBe("doc-1");
    expect(server.calls.length).toBe(8);
    const putCalls = server.calls.filter((c) => c.method === "PUT");
    expect(putCalls.length).toBe(4);
    for (const call of putCalls) {
      expect(call.bytes!.length).toBe(327);
      expect(createHash("sha256").update(call.bytes!).digest("hex")).toBe(
        "4028af3714fa07d2f20e758649532faef11b4818c99a2b8dc0c88170a0dc8784",
      );
    }
  });

  it("succeeds after cold-start pending observation (>15 attempts, ~400ms overhead + 1s delay) with identical bytes and clean receipt", async () => {
    server.mutations.put503Count = 20;
    server.mutations.put503Delay = 400;
    vi.useFakeTimers();
    const promise = uploadOperationalDocument(
      mockRequest,
      origin,
      intentPath,
      intentBody,
      confirmPath,
      confirmBody,
      headers,
    );
    const resolutionPromise = expect(promise).resolves.toBeDefined();
    for (let i = 0; i < 20; i++) {
      await vi.advanceTimersByTimeAsync(400);
      await vi.advanceTimersByTimeAsync(1000);
    }
    await resolutionPromise;
    const result = await promise;
    expect(result.documentId).toBe("doc-1");
    expect(result.putScanState).toBe("clean");
    expect(result.putStatus).toBe(200);
    expect(result.transientHistory.length).toBe(20);
    expect(result.putAttempts).toBe(21);
    expect(result.downloadStatus).toBe(200);
    expect(result.fileSize).toBe(327);
    expect(result.sha256).toBe(
      "4028af3714fa07d2f20e758649532faef11b4818c99a2b8dc0c88170a0dc8784",
    );
    expect(result.readbackFileSize).toBe(327);
    expect(result.readbackSha256).toBe(
      "4028af3714fa07d2f20e758649532faef11b4818c99a2b8dc0c88170a0dc8784",
    );

    expect(server.calls.length).toBe(25);
    const putCalls = server.calls.filter((c) => c.method === "PUT");
    expect(putCalls.length).toBe(21);
    for (const call of putCalls) {
      expect(call.bytes).toBeDefined();
      expect(call.bytes!.length).toBe(327);
      expect(createHash("sha256").update(call.bytes!).digest("hex")).toBe(
        "4028af3714fa07d2f20e758649532faef11b4818c99a2b8dc0c88170a0dc8784",
      );
      expect(call.headers["content-type"]).toBe("application/octet-stream");
      expect(call.headers["authorization"]).toBe("Bearer fleet-dummy-id-token");
      expect(call.query["objectKey"]).toBe(server.active?.objectKey);
    }
    const confirmCall = server.calls.find((c) => c.url.includes("/confirm"));
    expect(confirmCall).toBeDefined();
    expect(confirmCall!.data.checksumSha256).toBe(
      "4028af3714fa07d2f20e758649532faef11b4818c99a2b8dc0c88170a0dc8784",
    );
    expect(confirmCall!.data.fileSize).toBe(327);

    const downloadCall = server.calls.find((c) => c.url.includes("/download"));
    expect(downloadCall).toBeDefined();
  });

  it("exhausts max 45 pending retries on 503 DOCUMENT_SCANNER_UNAVAILABLE with identical bytes", async () => {
    server.mutations.put503Count = 45;
    vi.useFakeTimers();
    const promise = uploadOperationalDocument(
      mockRequest,
      origin,
      intentPath,
      intentBody,
      confirmPath,
      confirmBody,
      headers,
    );
    const rejectionPromise = expect(promise).rejects.toThrow(
      /Scanner must eventually process the bytes and return clean receipt within deadline|Received: false/,
    );
    for (let i = 0; i < 45; i++) {
      await vi.runAllTimersAsync();
    }
    await rejectionPromise;
    expect(server.calls.length).toBe(47);
    const putCalls = server.calls.filter((c) => c.method === "PUT");
    expect(putCalls.length).toBe(45);
    for (const call of putCalls) {
      expect(call.bytes).toBeDefined();
      expect(call.bytes!.length).toBe(327);
      expect(createHash("sha256").update(call.bytes!).digest("hex")).toBe(
        "4028af3714fa07d2f20e758649532faef11b4818c99a2b8dc0c88170a0dc8784",
      );
    }
    expect(server.calls.some((c) => c.url.includes("/confirm"))).toBe(false);
    expect(server.calls.some((c) => c.url.includes("/download"))).toBe(false);
  });

  it("terminates without retry on unexpected 503 error code", async () => {
    server.mutations.put503Count = 1;
    server.mutations.put503ErrorCode = "SERVER_ERROR";
    await expect(
      uploadOperationalDocument(
        mockRequest,
        origin,
        intentPath,
        intentBody,
        confirmPath,
        confirmBody,
        headers,
      ),
    ).rejects.toThrow(
      /PUT exact bytes to .* must be 200 or 201|Received: false/,
    );
    expect(server.calls.length).toBe(3);
    const putCalls = server.calls.filter((c) => c.method === "PUT");
    expect(putCalls.length).toBe(1);
  });

  it("rejects when operational document upload lifecycle exceeds total 60s time budget", async () => {
    server.mutations.advanceTimeAfterPut = 60001;
    vi.useFakeTimers();
    const promise = uploadOperationalDocument(
      mockRequest,
      origin,
      intentPath,
      intentBody,
      confirmPath,
      confirmBody,
      headers,
    );
    await expect(promise).rejects.toThrow(
      /Operational document upload lifecycle exceeded time budget/,
    );
    expect(server.calls.length).toBe(3);
    expect(server.calls.map((c) => c.method)).toEqual(["GET", "POST", "PUT"]);
    expect(server.calls.some((c) => c.url.includes("/confirm"))).toBe(false);
    expect(server.calls.some((c) => c.url.includes("/download"))).toBe(false);
  });

  it("aborts when download response headers arrive but body reader hangs until timeout signal", async () => {
    server.mutations.downloadBodyHangs = true;
    vi.useFakeTimers();
    const promise = uploadOperationalDocument(
      mockRequest,
      origin,
      intentPath,
      intentBody,
      confirmPath,
      confirmBody,
      headers,
    );
    const rejection = expect(promise).rejects.toThrow(/Timeout/);
    await vi.advanceTimersByTimeAsync(60001);
    await rejection;

    expect(server.downloadReaderStarted).toBe(true);
    expect(server.downloadReaderAborted).toBe(true);
    expect(server.downloadPassedSignal).toBeTruthy();
    expect(server.calls.length).toBe(5);
    expect(server.calls.map((c) => c.method)).toEqual([
      "GET",
      "POST",
      "PUT",
      "POST",
      "GET",
    ]);
  });

  it("rejects when receipt is unclean", async () => {
    server.mutations.putReceiptUnclean = true;
    await expect(
      uploadOperationalDocument(
        mockRequest,
        origin,
        intentPath,
        intentBody,
        confirmPath,
        confirmBody,
        headers,
      ),
    ).rejects.toThrow(/Received: "infected"/);
    expect(server.calls.length).toBe(3);
  });

  it("rejects when receipt method is wrong", async () => {
    server.mutations.putMethod = "POST";
    await expect(
      uploadOperationalDocument(
        mockRequest,
        origin,
        intentPath,
        intentBody,
        confirmPath,
        confirmBody,
        headers,
      ),
    ).rejects.toThrow(/Received: "POST"/);
    expect(server.calls.length).toBe(2);
  });

  it("rejects missing receipt", async () => {
    server.mutations.putReceiptMissing = true;
    await expect(
      uploadOperationalDocument(
        mockRequest,
        origin,
        intentPath,
        intentBody,
        confirmPath,
        confirmBody,
        headers,
      ),
    ).rejects.toThrow(/Received: undefined/);
    expect(server.calls.length).toBe(3);
  });

  it("rejects when receipt returns wrong checksum hash", async () => {
    server.mutations.putReceiptWrongHash = true;
    await expect(
      uploadOperationalDocument(
        mockRequest,
        origin,
        intentPath,
        intentBody,
        confirmPath,
        confirmBody,
        headers,
      ),
    ).rejects.toThrow(/Received: "wrong-hash"/);
    expect(server.calls.length).toBe(3);
  });

  it("rejects when receipt returns wrong file size", async () => {
    server.mutations.putReceiptWrongSize = true;
    await expect(
      uploadOperationalDocument(
        mockRequest,
        origin,
        intentPath,
        intentBody,
        confirmPath,
        confirmBody,
        headers,
      ),
    ).rejects.toThrow(/Received: 999999/);
    expect(server.calls.length).toBe(3);
  });

  it("rejects when confirm returns terminal 500", async () => {
    server.mutations.confirmTerminal500 = true;
    await expect(
      uploadOperationalDocument(
        mockRequest,
        origin,
        intentPath,
        intentBody,
        confirmPath,
        confirmBody,
        headers,
      ),
    ).rejects.toThrow(
      /confirm request to .* must be 200 or 201|Received: false/,
    );
    expect(server.calls.length).toBe(4);
    expect(server.calls.some((c) => c.url.includes("/download"))).toBe(false);
  });

  it("rejects when confirm returns wrong checksum hash", async () => {
    server.mutations.confirmWrongHash = true;
    await expect(
      uploadOperationalDocument(
        mockRequest,
        origin,
        intentPath,
        intentBody,
        confirmPath,
        confirmBody,
        headers,
      ),
    ).rejects.toThrow(/Received: "wrong-hash"/);
    expect(server.calls.length).toBe(4);
  });

  it("rejects when confirm returns wrong file size", async () => {
    server.mutations.confirmWrongSize = true;
    await expect(
      uploadOperationalDocument(
        mockRequest,
        origin,
        intentPath,
        intentBody,
        confirmPath,
        confirmBody,
        headers,
      ),
    ).rejects.toThrow(/Received: 999999/);
    expect(server.calls.length).toBe(4);
  });

  it("rejects when confirm returns wrong content type", async () => {
    server.mutations.confirmWrongMime = true;
    await expect(
      uploadOperationalDocument(
        mockRequest,
        origin,
        intentPath,
        intentBody,
        confirmPath,
        confirmBody,
        headers,
      ),
    ).rejects.toThrow(/Received: "image\/png"/);
    expect(server.calls.length).toBe(4);
  });

  it("rejects when confirm returns documentId with path traversal or non-segment characters", async () => {
    server.mutations.confirmWrongId = true;
    await expect(
      uploadOperationalDocument(
        mockRequest,
        origin,
        intentPath,
        intentBody,
        confirmPath,
        confirmBody,
        headers,
      ),
    ).rejects.toThrow(
      /Expected pattern: \/\^\[-a-zA-Z0-9_\]\+\$\/|documentId must be a strict single segment/,
    );
    expect(server.calls.length).toBe(4);
  });

  it("rejects when confirm returns mismatched submissionId", async () => {
    server.mutations.confirmWrongSubmission = true;
    await expect(
      uploadOperationalDocument(
        mockRequest,
        origin,
        intentPath,
        intentBody,
        confirmPath,
        confirmBody,
        headers,
      ),
    ).rejects.toThrow(/Received: "wrong-sub"/);
    expect(server.calls.length).toBe(4);
  });

  it("rejects when confirm returns mismatched fleetPartnerId", async () => {
    server.mutations.confirmWrongFleet = true;
    await expect(
      uploadOperationalDocument(
        mockRequest,
        origin,
        intentPath,
        intentBody,
        confirmPath,
        confirmBody,
        headers,
      ),
    ).rejects.toThrow(/Received: "wrong-fleet"/);
    expect(server.calls.length).toBe(4);
  });

  it("rejects when confirm returns mismatched documentType", async () => {
    server.mutations.confirmWrongDocType = true;
    await expect(
      uploadOperationalDocument(
        mockRequest,
        origin,
        intentPath,
        intentBody,
        confirmPath,
        confirmBody,
        headers,
      ),
    ).rejects.toThrow(/Received: "wrong_type"/);
    expect(server.calls.length).toBe(4);
  });

  it("rejects when confirm returns mismatched fileObjectKey", async () => {
    server.mutations.confirmWrongKey = true;
    await expect(
      uploadOperationalDocument(
        mockRequest,
        origin,
        intentPath,
        intentBody,
        confirmPath,
        confirmBody,
        headers,
      ),
    ).rejects.toThrow(/Received: "wrong-key"/);
    expect(server.calls.length).toBe(4);
  });
});

describe("runSetup execution with actual manifest", () => {
  let server: MockServer;
  let originalFetch: typeof globalThis.fetch;
  let originalCandidateSha: string | undefined;
  let originalFleetBaseUrl: string | undefined;
  let originalFleetIdToken: string | undefined;
  let originalFleetSessionToken: string | undefined;
  let mockRequest: APIRequestContext;

  beforeEach(() => {
    server = new MockServer();
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(server.createFetch()) as any;
    originalCandidateSha = process.env.DRTS_CANDIDATE_SHA;
    originalFleetBaseUrl = process.env.DRTS_DEV_FLEET_PARTNER_PORTAL_BASE_URL;
    originalFleetIdToken = process.env.DRTS_DEV_FLEET_PARTNER_PORTAL_ID_TOKEN;
    originalFleetSessionToken =
      process.env.DRTS_OPERATIONAL_FLEET_SESSION_TOKEN;

    process.env.DRTS_CANDIDATE_SHA = "mock-candidate-sha";
    process.env.DRTS_DEV_FLEET_PARTNER_PORTAL_BASE_URL = server.origin;
    process.env.DRTS_DEV_FLEET_PARTNER_PORTAL_ID_TOKEN = "fleet-dummy-id-token";
    process.env.DRTS_OPERATIONAL_FLEET_SESSION_TOKEN =
      "existing-partner-session-dummy";
    server.expectedApplicationAuth = "Bearer existing-partner-session-dummy";

    mockRequest = {
      fetch: vi.fn(async (url, options = {}) => {
        const res = await (globalThis.fetch as any)(url, {
          ...options,
          ioBoundary: "api-request",
        });
        return {
          status: () => res.status,
          url: () => url,
          headers: () => Object.fromEntries(res.headers),
          json: () => res.json(),
        };
      }),
    } as unknown as APIRequestContext;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalCandidateSha !== undefined) {
      process.env.DRTS_CANDIDATE_SHA = originalCandidateSha;
    } else {
      delete process.env.DRTS_CANDIDATE_SHA;
    }
    if (originalFleetBaseUrl !== undefined) {
      process.env.DRTS_DEV_FLEET_PARTNER_PORTAL_BASE_URL = originalFleetBaseUrl;
    } else {
      delete process.env.DRTS_DEV_FLEET_PARTNER_PORTAL_BASE_URL;
    }
    if (originalFleetIdToken !== undefined) {
      process.env.DRTS_DEV_FLEET_PARTNER_PORTAL_ID_TOKEN = originalFleetIdToken;
    } else {
      delete process.env.DRTS_DEV_FLEET_PARTNER_PORTAL_ID_TOKEN;
    }
    if (originalFleetSessionToken !== undefined) {
      process.env.DRTS_OPERATIONAL_FLEET_SESSION_TOKEN =
        originalFleetSessionToken;
    } else {
      delete process.env.DRTS_OPERATIONAL_FLEET_SESSION_TOKEN;
    }
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("executes fleet-submit-read-withdraw-resubmit setup successfully", async () => {
    const context = {
      request: mockRequest,
      record: vi.fn((e) => server.records.push(e)),
    };
    const journey = (journeysData as any).journeys.find(
      (j: any) => j.id === "fleet-submit-read-withdraw-resubmit",
    );
    await runSetup(context, journey, { runId: "socket-free-dummy-run" });

    const docs = server.records.filter(
      (e) => e.kind === "setup-document-upload",
    );
    expect(docs.length).toBe(2);
    expect(server.documents.length).toBe(2);

    for (const doc of docs) {
      expect(doc.actorScope).toBe(journey.actorScope);
      expect(doc.putScanState).toBe("clean");
      expect(doc.downloadStatus).toBe(200);
      expect(doc.readbackSha256).toBe(doc.sha256);
      expect(doc.readbackFileSize).toBe(doc.fileSize);
      expect(doc.confirmFleetPartnerId).toBe(server.fleet);
    }

    // Call order validation:
    // Call 0: generic driver submission creation (native, without Playwright trace)
    // Calls 1..5: document upload 1 (authority GET, intent POST, PUT, confirm POST, download GET) (raw-fetch)
    // Call 6: generic submission readback (native, without Playwright trace)
    // Calls 7..11: document upload 2 (authority GET, intent POST, PUT, confirm POST, download GET) (raw-fetch)
    expect(server.calls.length).toBe(12);
    expect(server.calls[0]?.ioBoundary).toBe("raw-fetch");
    expect(server.calls[0]?.pathname).toBe(
      "/control-plane-proxy/fleet-partner/supply-submissions/drivers",
    );
    expect(server.calls[6]?.ioBoundary).toBe("raw-fetch");
    expect(server.calls[6]?.pathname).toBe(
      "/control-plane-proxy/fleet-partner/supply-submissions/sub-setup-123",
    );
    const docCalls1 = server.calls.slice(1, 6);
    for (const c of docCalls1) {
      expect(c.ioBoundary).toBe("raw-fetch");
    }
    const docCalls2 = server.calls.slice(7, 12);
    for (const c of docCalls2) {
      expect(c.ioBoundary).toBe("raw-fetch");
    }
    expect(mockRequest.fetch).not.toHaveBeenCalled();
  });

  it("executes admin-review-approve-readback setup successfully with fleet origin override", async () => {
    const context = {
      request: mockRequest,
      record: vi.fn((e) => server.records.push(e)),
    };
    const journey = (journeysData as any).journeys.find(
      (j: any) => j.id === "admin-review-approve-readback",
    );
    await runSetup(context, journey, { runId: "socket-free-dummy-run" });

    const docs = server.records.filter(
      (e) => e.kind === "setup-document-upload",
    );
    expect(docs.length).toBe(2);

    // Verify all upload calls used the fleet origin and token
    for (const call of server.calls) {
      expect(call.url.startsWith(server.origin)).toBe(true);
      expect(call.headers["authorization"]).toBe(server.expectedAuth);
      expect(call.headers["x-drts-authorization"]).toBe(
        server.expectedApplicationAuth,
      );
    }
  });

  it("executes shared-executor-explicit-authorization successfully", async () => {
    server.explicitAuthorization = true;
    server.expectedAuth = "Bearer explicit-dummy-only";
    const context = {
      request: mockRequest,
      record: vi.fn((e) => server.records.push(e)),
    };
    const journey = structuredClone(
      (journeysData as any).journeys.find(
        (j: any) => j.id === "fleet-submit-read-withdraw-resubmit",
      ),
    );
    for (const step of journey.setup) {
      step.headers = {
        ...(step.headers || {}),
        authorization: "Bearer explicit-dummy-only",
      };
    }

    await runSetup(context, journey, { runId: "socket-free-dummy-run" });

    const docs = server.records.filter(
      (e) => e.kind === "setup-document-upload",
    );
    expect(docs.length).toBe(2);
  });

  it("fails runSetup when receipt is unclean", async () => {
    server.mutations.putReceiptUnclean = true;
    const context = {
      request: mockRequest,
      record: vi.fn((e) => server.records.push(e)),
    };
    const journey = (journeysData as any).journeys.find(
      (j: any) => j.id === "fleet-submit-read-withdraw-resubmit",
    );
    await expect(
      runSetup(context, journey, { runId: "socket-free-dummy-run" }),
    ).rejects.toThrow(/Received: "infected"/);
  });

  it("fails runSetup when missing readback", async () => {
    server.mutations.readbackAbsent = true;
    const context = {
      request: mockRequest,
      record: vi.fn((e) => server.records.push(e)),
    };
    const journey = (journeysData as any).journeys.find(
      (j: any) => j.id === "fleet-submit-read-withdraw-resubmit",
    );
    await expect(
      runSetup(context, journey, { runId: "socket-free-dummy-run" }),
    ).rejects.toThrow(/Received: 404/);
  });

  it.each([
    "fleet-submit-read-withdraw-resubmit",
    "admin-review-approve-readback",
  ])(
    "%s rejects missing lawful Fleet application session before any setup mutation",
    async (id) => {
      delete process.env.DRTS_OPERATIONAL_FLEET_SESSION_TOKEN;
      const journey = journeysData.journeys.find(
        (j) => j.id === id,
      )! as unknown as Journey;
      await expect(
        runSetup({ request: mockRequest, record: vi.fn() }, journey, {}),
      ).rejects.toThrow(
        /requires an existing legitimate partner application session/,
      );
      expect(server.calls).toHaveLength(0);
    },
  );

  it("rejects a Fleet setup redirected to a foreign origin before sending either proof", async () => {
    const journey = structuredClone(
      journeysData.journeys.find(
        (j) => j.id === "fleet-submit-read-withdraw-resubmit",
      )!,
    ) as unknown as Journey;
    const first = journey.setup?.[0];
    if (!first || first.kind === "document-upload")
      throw new Error("Expected the original HTTP create setup");
    first.path = "https://foreign.example.invalid/collect";
    await expect(
      runSetup({ request: mockRequest, record: vi.fn() }, journey, {
        runId: "socket-free-dummy-run",
      }),
    ).rejects.toThrow(/exact credential-free origin/);
    expect(server.calls).toHaveLength(0);
  });
});

describe("origin-bound operational application proof", () => {
  const fleetEnv = "DRTS_DEV_FLEET_PARTNER_PORTAL_BASE_URL";
  const origin = "https://fleet.example.invalid";

  beforeEach(() => {
    vi.stubEnv(fleetEnv, origin);
    vi.stubEnv(
      "DRTS_DEV_FLEET_PARTNER_PORTAL_ID_TOKEN",
      "fleet-invocation-dummy",
    );
    vi.stubEnv(
      "DRTS_OPERATIONAL_FLEET_SESSION_TOKEN",
      "partner-application-dummy",
    );
    vi.stubEnv(
      "DRTS_DEV_PLATFORM_ADMIN_BASE_URL",
      "https://admin.example.invalid",
    );
    vi.stubEnv("DRTS_DEV_PLATFORM_ADMIN_ID_TOKEN", "admin-invocation-dummy");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("keeps Fleet inner JWT separate from invocation proof and leaves Admin review identity unchanged", () => {
    expect(operationalRequestHeaders(fleetEnv, origin)).toEqual({
      Authorization: "Bearer fleet-invocation-dummy",
      "x-drts-authorization": "Bearer partner-application-dummy",
    });
    expect(
      operationalRequestHeaders(
        "DRTS_DEV_PLATFORM_ADMIN_BASE_URL",
        "https://admin.example.invalid/review",
      ),
    ).toEqual({
      Authorization: "Bearer admin-invocation-dummy",
    });
  });

  it("does not relabel invocation proof as an application session", () => {
    vi.stubEnv(
      "DRTS_OPERATIONAL_FLEET_SESSION_TOKEN",
      "fleet-invocation-dummy",
    );
    expect(() => operationalRequestHeaders(fleetEnv, origin)).toThrow(
      /distinct from Cloud Run invocation proof/,
    );
  });

  it("rejects an explicitly conflicting application proof instead of changing the declared actor", () => {
    expect(() =>
      operationalRequestHeaders(fleetEnv, origin, {
        "X-Drts-Authorization": "Bearer another-partner-dummy",
      }),
    ).toThrow(/must match its declared existing session/);
  });

  it.each([
    "https://foreign.example.invalid/collect",
    "https://user:password@fleet.example.invalid/collect",
    `${origin}/collect#fragment`,
  ])("refuses proof for invalid target %s", (target) => {
    expect(() => operationalRequestHeaders(fleetEnv, target)).toThrow(
      /exact credential-free origin/,
    );
  });

  it("scopes browser proof to Fleet and fulfills redirects without following them or authenticating foreign requests", async () => {
    let handler: ((route: Route) => Promise<void>) | undefined;
    const context = { setExtraHTTPHeaders: vi.fn() };
    const page = {
      context: () => context,
      route: vi.fn(
        async (_pattern: string, callback: (route: Route) => Promise<void>) => {
          handler = callback;
        },
      ),
    } as unknown as Page;
    await installOperationalBrowserHeaders(page, fleetEnv);
    expect(context.setExtraHTTPHeaders).not.toHaveBeenCalled();
    const response = new Response("decoded response bytes", {
      status: 302,
      headers: [
        ["location", "https://foreign.example.invalid/redirect"],
        ["content-type", "text/html"],
        ["x-drts-candidate-sha", "exact-candidate-dummy"],
        ["content-encoding", "gzip"],
        ["content-length", "999"],
        ["transfer-encoding", "chunked"],
        ["set-cookie", "first=one; Path=/"],
        ["set-cookie", "second=two; Path=/"],
      ],
    });
    const nativeFetch = vi.fn<typeof fetch>(async () => response);
    vi.stubGlobal("fetch", nativeFetch);
    const route = {
      request: () => ({
        url: () => `${origin}/supply`,
        headers: () => ({ accept: "text/html" }),
        method: () => "GET",
        postDataBuffer: () => null,
      }),
      fetch: vi.fn(),
      fulfill: vi.fn(),
      continue: vi.fn(),
    };
    await handler!(route as unknown as Route);
    expect(nativeFetch).toHaveBeenCalledExactlyOnceWith(`${origin}/supply`, {
      method: "GET",
      headers: new Headers({
        accept: "text/html",
        authorization: "Bearer fleet-invocation-dummy",
        "x-drts-authorization": "Bearer partner-application-dummy",
      }),
      redirect: "manual",
      signal: expect.any(AbortSignal),
    });
    expect(route.fetch).not.toHaveBeenCalled();
    expect(route.fulfill).toHaveBeenCalledExactlyOnceWith({
      status: 302,
      headers: {
        location: "https://foreign.example.invalid/redirect",
        "content-type": "text/html",
        "x-drts-candidate-sha": "exact-candidate-dummy",
        "set-cookie": "first=one; Path=/\nsecond=two; Path=/",
      },
      body: Buffer.from("decoded response bytes"),
    });
    expect(JSON.stringify(route.fulfill.mock.calls)).not.toContain(
      "partner-application-dummy",
    );
    const foreignRoute = {
      ...route,
      request: () => ({
        url: () => "https://foreign.example.invalid/redirect",
        headers: () => ({ accept: "text/html" }),
      }),
      fetch: vi.fn(),
      fulfill: vi.fn(),
      continue: vi.fn(),
    };
    await handler!(foreignRoute as unknown as Route);
    expect(foreignRoute.continue).toHaveBeenCalledExactlyOnceWith();
    expect(foreignRoute.fetch).not.toHaveBeenCalled();
    expect(foreignRoute.fulfill).not.toHaveBeenCalled();
    expect(nativeFetch).toHaveBeenCalledTimes(1);
  });

  it("fails browser installation before navigation without an existing application session", async () => {
    vi.stubEnv("DRTS_OPERATIONAL_FLEET_SESSION_TOKEN", "");
    const page = { route: vi.fn() } as unknown as Page;
    await expect(
      installOperationalBrowserHeaders(page, fleetEnv),
    ).rejects.toThrow(/existing legitimate partner application session/);
    expect(page.route).not.toHaveBeenCalled();
  });

  it("keeps Admin browser identity without a Fleet application header or route interceptor", async () => {
    const setExtraHTTPHeaders = vi.fn();
    const page = {
      context: () => ({ setExtraHTTPHeaders }),
      route: vi.fn(),
    } as unknown as Page;
    await installOperationalBrowserHeaders(
      page,
      "DRTS_DEV_PLATFORM_ADMIN_BASE_URL",
    );
    expect(setExtraHTTPHeaders).toHaveBeenCalledExactlyOnceWith({
      Authorization: "Bearer admin-invocation-dummy",
    });
    expect(page.route).not.toHaveBeenCalled();
  });

  it("keeps Fleet readback/download proof out of Playwright API calls while preserving the Admin request rail", async () => {
    const nativeFetch = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ data: { observed: true } }), {
          headers: {
            "content-type": "application/json",
            "x-drts-candidate-sha": "candidate-dummy",
          },
        }),
    );
    vi.stubGlobal("fetch", nativeFetch);
    const adminResponse = { status: () => 200 };
    const request = {
      fetch: vi.fn(async () => adminResponse),
    } as unknown as APIRequestContext;
    const response = await fetchOperationalSurface(
      request,
      fleetEnv,
      `${origin}/supply`,
    );
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ data: { observed: true } });
    expect(response.headers()["x-drts-candidate-sha"]).toBe("candidate-dummy");
    expect(response.ok()).toBe(true);
    expect(request.fetch).not.toHaveBeenCalled();
    const options = nativeFetch.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(options.headers).get("x-drts-authorization")).toBe(
      "Bearer partner-application-dummy",
    );
    expect(options.redirect).toBe("manual");
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(
      await fetchOperationalSurface(
        request,
        "DRTS_DEV_PLATFORM_ADMIN_BASE_URL",
        "https://admin.example.invalid/review",
      ),
    ).toBe(adminResponse);
    expect(request.fetch).toHaveBeenCalledExactlyOnceWith(
      "https://admin.example.invalid/review",
      {
        headers: { Authorization: "Bearer admin-invocation-dummy" },
        maxRedirects: 0,
      },
    );
  });
});

describe("normal operational Fleet issuer and exact own cleanup", () => {
  const api = "https://api.example.invalid";
  const admin = "https://admin.example.invalid";
  const configuration = {
    fleetPartnerId: "fleet-demo-001",
    tenantId: "10000000-0000-0000-0000-000000000201",
  };
  const plaintextKey = "pk_socket-free-key-dummy";
  const token = "backend_issued-session_dummy";
  const adminToken = "backend_admin-session_dummy";
  const adminSessionId = "own-admin-session-dummy";
  let adminVerified: boolean;
  let adminRevoked: boolean;
  let proofs: Map<string, { method: string; path: string; actionId: string }>;
  const adminIdentity = () => ({
    realm: fault === "admin-wrong-realm" ? "partner" : "platform",
    actorType: fault === "admin-wrong-role" ? "tenant_admin" : "platform_admin",
    authMode:
      fault === "admin-proxy-identity" ? "bootstrap_headers" : "jwt_bearer",
    actorId: "canonical-admin-dummy",
    principalId:
      fault === "admin-foreign-principal"
        ? "foreign-admin-dummy"
        : "canonical-admin-dummy",
    membershipId: "canonical-membership-dummy",
    sessionId:
      fault === "admin-missing-session"
        ? null
        : fault === "admin-foreign-session"
          ? "foreign-admin-session-dummy"
          : adminSessionId,
  });
  const businessCalls = () =>
    calls.filter(
      (call) =>
        call.path !== "/control-plane-proxy/auth/token" &&
        call.path !== "/control-plane-proxy/auth/session" &&
        call.path !== "/control-plane-proxy/identity/step-up-proofs" &&
        call.body.sessionId !== adminSessionId,
    );
  const actionFor = (path: string) => {
    if (path === "/api/platform-admin/partner-entries")
      return "platform:partner-entries:create";
    if (/\/credentials\/issue$/.test(path))
      return "platform:partner-credentials:issue";
    if (/\/credentials\/[^/]+\/revoke$/.test(path))
      return "platform:partner-credentials:revoke";
    if (/\/partner-entries\/[^/]+\/revoke$/.test(path))
      return "platform:partner-entries:revoke";
    throw new Error("Unexpected unit policy path");
  };
  let entry: Record<string, unknown>;
  let fault: string;
  let calls: {
    origin: string;
    path: string;
    method: string;
    headers: Headers;
    body: Record<string, unknown>;
  }[];
  let prepared: PreparedOperationalFleetSession | undefined;
  let maskOutput: string[];
  let revokedKey: boolean;
  let revokedEntry: boolean;
  const credential = () => ({
    keyId: "own-key-dummy",
    entrySlug: entry.entrySlug,
    realm: "partner",
    resourceScope: `partner_entry:${String(entry.entrySlug)}`,
    scopes: ["billing:read"],
    status: revokedKey ? "revoked" : "active",
    revokedAt: revokedKey ? "2026-10-19T00:00:00Z" : null,
  });
  const identity = () => ({
    realm: fault === "wrong-role" ? "tenant" : "partner",
    actorType: "partner_api_key",
    actorId: fault === "wrong-key" ? "foreign-key-dummy" : "own-key-dummy",
    principalId: "own-key-dummy",
    partnerId:
      fault === "wrong-fleet"
        ? "foreign-fleet-dummy"
        : configuration.fleetPartnerId,
    partnerEntrySlug: entry.entrySlug,
    tenantId: configuration.tenantId,
    partnerProgramId: entry.programId,
    sessionId: "own-session-dummy",
    scopes: ["billing:read"],
  });
  const reply = (data: unknown, status = 200) =>
    new Response(JSON.stringify(deepToSnakeCase({ data })), {
      status,
      headers: {
        "content-type": "application/json",
        "x-drts-candidate-sha": "candidate-dummy",
      },
    });

  const authError = (code: string, status: number) =>
    new Response(
      JSON.stringify({
        error: { code, message: `${adminToken} ${plaintextKey} ${token}` },
      }),
      { status, headers: { "x-drts-candidate-sha": "candidate-dummy" } },
    );

  beforeEach(() => {
    entry = {};
    fault = "";
    calls = [];
    prepared = undefined;
    maskOutput = [];
    revokedKey = false;
    revokedEntry = false;
    adminVerified = false;
    adminRevoked = false;
    proofs = new Map();
    vi.stubEnv("DRTS_OPERATIONAL_PLATFORM_ADMIN_SESSION_TOKEN", "");
    vi.stubEnv("DRTS_CANDIDATE_SHA", "candidate-dummy");
    vi.stubEnv("DRTS_OPERATIONAL_API_URL", api);
    vi.stubEnv("DRTS_OPERATIONAL_PLATFORM_ADMIN_URL", admin);
    vi.stubEnv(
      "DRTS_OPERATIONAL_PLATFORM_ADMIN_ID_TOKEN",
      "admin-invocation-dummy",
    );
    vi.stubEnv("DRTS_OPERATIONAL_FLEET_SESSION_TOKEN", "");
    vi.stubEnv(
      "DRTS_DEV_FLEET_PARTNER_PORTAL_BASE_URL",
      "https://fleet.example.invalid",
    );
    vi.stubEnv(
      "DRTS_DEV_FLEET_PARTNER_PORTAL_ID_TOKEN",
      "fleet-invocation-dummy",
    );
    vi.stubEnv("GITHUB_ACTIONS", "true");
    vi.spyOn(process.stdout, "write").mockImplementation(
      (value: string | Uint8Array) => {
        maskOutput.push(String(value));
        return true;
      },
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
        const url = new URL(String(input));
        const headers = new Headers(init.headers);
        const body =
          typeof init.body === "string"
            ? (JSON.parse(init.body) as Record<string, unknown>)
            : {};
        const method = init.method ?? "GET";
        calls.push({
          origin: url.origin,
          path: url.pathname,
          method,
          headers,
          body,
        });
        expect(init.redirect).toBe("manual");
        expect(init.signal).toBeInstanceOf(AbortSignal);
        if (url.origin === admin) {
          expect(headers.get("authorization")).toBe(
            "Bearer admin-invocation-dummy",
          );
          if (url.pathname === "/control-plane-proxy/auth/token") {
            expect(headers.has("x-drts-authorization")).toBe(false);
            if (fault === "admin-exchange-denied")
              return authError("WORKLOAD_SESSION_IDENTITY_UNAVAILABLE", 403);
            if (fault === "admin-exchange-typed-denied")
              return authError("DEV_WORKFORCE_SESSION_EXCHANGE_DENIED", 403);
            if (fault === "admin-exchange-oversized")
              return new Response("x".repeat(1024 * 1024 + 1), { status: 201 });
            if (fault === "admin-exchange-hanging")
              return new Response(new ReadableStream({ start() {} }), {
                status: 201,
              });
            if (fault === "admin-exchange-redirect")
              return new Response("", {
                status: 302,
                headers: { location: "https://foreign.example.invalid" },
              });
            if (fault === "elapsed-admin-deadline")
              vi.setSystemTime(Date.now() + 60_001);
            return new Response(
              JSON.stringify({
                token: adminToken,
                expires_in: "8h",
                session_id:
                  fault === "admin-exchange-missing-session"
                    ? null
                    : adminSessionId,
                principal_id: "canonical-admin-dummy",
                realm: "platform",
                actor_type: "platform_admin",
              }),
              {
                status: 201,
                headers: { "x-drts-candidate-sha": "candidate-dummy" },
              },
            );
          }
          expect(headers.get("x-drts-authorization")).toBe(
            `Bearer ${process.env.DRTS_OPERATIONAL_PLATFORM_ADMIN_SESSION_TOKEN || adminToken}`,
          );
          if (url.pathname === "/control-plane-proxy/auth/session") {
            if (fault === "admin-session-denied")
              return authError("SESSION_REVOKED", 401);
            adminVerified = true;
            return reply({
              active: fault !== "admin-inactive",
              identity: adminIdentity(),
            });
          }
          expect(adminVerified).toBe(true);
          if (url.pathname === "/control-plane-proxy/identity/step-up-proofs") {
            expect(method).toBe("POST");
            expect(body.method).toBe("POST");
            const actionId = actionFor(String(body.path));
            if (fault === "proof-mfa-denied")
              return authError("MFA_REQUIRED", 403);
            if (fault === "proof-session-denied")
              return authError("STEP_UP_REQUIRED", 403);
            if (
              fault === "proof-key-revoke-denied" &&
              actionId === "platform:partner-credentials:revoke"
            )
              return authError("STEP_UP_REQUIRED", 403);
            if (fault === "proof-unknown-code")
              return authError(adminToken, 403);
            const reference = `unit-proof-${proofs.size}-${calls.length}`;
            proofs.set(reference, {
              method: "POST",
              path:
                fault === "proof-foreign-path"
                  ? "/api/platform-admin/partner-entries/foreign/revoke"
                  : String(body.path),
              actionId,
            });
            return reply(
              {
                required: fault !== "proof-not-required",
                actionId:
                  fault === "proof-wrong-action"
                    ? "platform:unrelated"
                    : actionId,
                stepUpReference:
                  fault === "proof-missing-reference" ? null : reference,
              },
              201,
            );
          }
          if (method === "POST") {
            const reference = headers.get("x-drts-step-up-reference");
            const proof = proofs.get(reference || "");
            if (
              proof?.path !==
              url.pathname.replace(/^\/control-plane-proxy/, "/api")
            )
              return authError("STEP_UP_REQUIRED", 403);
            expect(proof).toEqual({
              method,
              path: url.pathname.replace(/^\/control-plane-proxy/, "/api"),
              actionId: actionFor(
                url.pathname.replace(/^\/control-plane-proxy/, "/api"),
              ),
            });
            proofs.delete(reference!);
          }
        } else {
          expect(url.origin).toBe(api);
          expect(headers.get("authorization")).not.toBe(
            "Bearer admin-invocation-dummy",
          );
        }
        if (
          url.pathname === "/control-plane-proxy/platform-admin/partner-entries"
        ) {
          if (fault === "create-redirect")
            return reply({ error: plaintextKey }, 302);
          entry = {
            ...body,
            partnerId:
              fault === "random-binding"
                ? "partner-random-dummy"
                : body.fleetPartnerId,
            status: "active",
            activeFlag: true,
            auditMetadata: { requestId: headers.get("x-request-id") },
          };
          if (fault === "elapsed-deadline")
            vi.setSystemTime(Date.now() + 60_001);
          return reply(entry, 201);
        }
        const path = `/control-plane-proxy/platform-admin/partner-entries/${String(entry.entrySlug)}`;
        if (url.pathname === `${path}/credentials` && method === "GET") {
          return reply({
            items:
              fault === "nonempty-keys"
                ? [{ keyId: "do-not-touch-existing-key" }]
                : [],
          });
        }
        if (url.pathname === `${path}/credentials/issue`) {
          if (fault === "issue-denied")
            return reply({ error: plaintextKey }, 403);
          if (fault === "elapsed-key-deadline")
            vi.setSystemTime(Date.now() + 60_001);
          return reply(
            {
              credential: credential(),
              plaintextKey,
              revokedCredentialId: null,
              overlapEndsAt: null,
            },
            201,
          );
        }
        if (url.pathname === "/api/auth/partner/bootstrap-session") {
          expect(headers.has("authorization")).toBe(false);
          expect(body).toEqual({
            entrySlug: entry.entrySlug,
            apiKey: plaintextKey,
          });
          if (fault === "bootstrap-denied") return reply({ error: token }, 401);
          if (fault === "native-secret-error")
            throw new Error(`${plaintextKey} ${token}`);
          return reply(
            {
              accessToken: token,
              tokenType: "Bearer",
              partnerEntry: entry,
              identity: identity(),
            },
            201,
          );
        }
        if (url.pathname === "/api/auth/session") {
          expect(headers.get("authorization")).toBe(
            `Bearer ${process.env.DRTS_OPERATIONAL_FLEET_SESSION_TOKEN || token}`,
          );
          if (fault === "session-denied") return reply({ error: token }, 401);
          return reply({ active: true, identity: identity() });
        }
        if (
          url.pathname === "/api/auth/sessions/revoke" &&
          body.sessionId === adminSessionId
        ) {
          expect(headers.get("authorization")).toBe(`Bearer ${adminToken}`);
          if (fault === "admin-cleanup-denied")
            return authError("FORBIDDEN", 403);
          adminRevoked = true;
          return reply({ revoked: true, sessionId: adminSessionId }, 201);
        }
        if (url.pathname === "/api/auth/sessions/revoke") {
          expect(body).toEqual({ sessionId: "own-session-dummy" });
          expect(headers.get("authorization")).toBe(`Bearer ${token}`);
          return reply({ revoked: true, sessionId: body.sessionId }, 201);
        }
        if (url.pathname === `${path}/credentials/own-key-dummy/revoke`) {
          revokedKey = true;
          return reply(credential(), 201);
        }
        if (url.pathname === `${path}/revoke`) {
          if (fault === "cleanup-denied")
            return reply({ error: `${plaintextKey} ${token}` }, 503);
          revokedEntry = true;
          return reply({ ...entry, status: "revoked", activeFlag: false }, 201);
        }
        throw new Error(
          `Unexpected mocked issuer route ${method} ${url.pathname}`,
        );
      }),
    );
  });

  afterEach(async () => {
    if (prepared) {
      try {
        await prepared.cleanup();
      } catch {
        /* the denial is asserted by its test */
      }
    }
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("runs real helper through unique bound Entry, empty list, first minimal key, bootstrap and backend session, then revokes only its own resources", async () => {
    prepared = await prepareOperationalFleetSession(configuration);
    expect(entry.entrySlug).toMatch(/^operational-fleet-[0-9a-f-]{36}$/);
    expect(entry.partnerId).toBe(configuration.fleetPartnerId);
    expect(businessCalls().map((c) => c.path.split("/").at(-1))).toEqual([
      "partner-entries",
      "credentials",
      "issue",
      "bootstrap-session",
      "session",
    ]);
    expect(businessCalls()[2]?.body.scopes).toEqual(["billing:read"]);
    expect(
      operationalRequestHeaders(
        "DRTS_DEV_FLEET_PARTNER_PORTAL_BASE_URL",
        "https://fleet.example.invalid",
      )["x-drts-authorization"],
    ).toBe(`Bearer ${token}`);
    expect(maskOutput).toEqual(
      expect.arrayContaining([
        `::add-mask::${adminToken}\n`,
        `::add-mask::${plaintextKey}\n`,
        `::add-mask::${token}\n`,
      ]),
    );
    expect(JSON.stringify(prepared.metadata)).not.toContain(plaintextKey);
    expect(JSON.stringify(prepared.metadata)).not.toContain(token);
    await prepared.cleanup();
    expect(
      businessCalls()
        .slice(-3)
        .map((c) => c.path),
    ).toEqual([
      "/api/auth/sessions/revoke",
      `/control-plane-proxy/platform-admin/partner-entries/${String(entry.entrySlug)}/credentials/own-key-dummy/revoke`,
      `/control-plane-proxy/platform-admin/partner-entries/${String(entry.entrySlug)}/revoke`,
    ]);
    expect(revokedKey && revokedEntry).toBe(true);
    const count = calls.length;
    await prepared.cleanup();
    expect(calls).toHaveLength(count);
  });

  it("verifies one canonical Admin session before create and consumes distinct same-session action proofs before all four protected mutations", async () => {
    prepared = await prepareOperationalFleetSession(configuration);
    await prepared.cleanup();
    expect(calls.slice(0, 4).map((c) => c.path)).toEqual([
      "/control-plane-proxy/auth/token",
      "/control-plane-proxy/auth/session",
      "/control-plane-proxy/identity/step-up-proofs",
      "/control-plane-proxy/platform-admin/partner-entries",
    ]);
    const proofCalls = calls.filter((c) =>
      c.path.endsWith("/identity/step-up-proofs"),
    );
    expect(proofCalls.map((c) => actionFor(String(c.body.path)))).toEqual([
      "platform:partner-entries:create",
      "platform:partner-credentials:issue",
      "platform:partner-credentials:revoke",
      "platform:partner-entries:revoke",
    ]);
    expect(
      proofCalls.every(
        (c) => c.headers.get("x-drts-authorization") === `Bearer ${adminToken}`,
      ),
    ).toBe(true);
    expect(calls.at(-1)?.body).toEqual({ sessionId: adminSessionId });
    expect(adminRevoked).toBe(true);
    expect(JSON.stringify(prepared.metadata)).not.toContain(adminToken);
    expect(JSON.stringify(prepared.metadata)).not.toContain("unit-proof");
  });

  it("verifies a supplied canonical Admin session and preserves it without exchanging or revoking it", async () => {
    vi.stubEnv("DRTS_OPERATIONAL_PLATFORM_ADMIN_SESSION_TOKEN", adminToken);
    prepared = await prepareOperationalFleetSession(configuration);
    await prepared.cleanup();
    expect(calls[0]?.path).toBe("/control-plane-proxy/auth/session");
    expect(calls.some((c) => c.path.endsWith("/auth/token"))).toBe(false);
    expect(calls.some((c) => c.body.sessionId === adminSessionId)).toBe(false);
    expect(adminRevoked).toBe(false);
  });

  it("does not exchange or create after a supplied canonical Admin session is denied", async () => {
    vi.stubEnv("DRTS_OPERATIONAL_PLATFORM_ADMIN_SESSION_TOKEN", adminToken);
    fault = "admin-session-denied";
    await expect(prepareOperationalFleetSession(configuration)).rejects.toThrow(
      /HTTP 401.*SESSION_REVOKED/,
    );
    expect(calls.map((c) => c.path)).toEqual([
      "/control-plane-proxy/auth/session",
    ]);
  });

  it.each([
    "admin-wrong-role",
    "admin-wrong-realm",
    "admin-proxy-identity",
    "admin-missing-session",
    "admin-foreign-session",
    "admin-foreign-principal",
    "admin-inactive",
  ])("rejects %s before proof or owned business mutation", async (failure) => {
    fault = failure;
    await expect(prepareOperationalFleetSession(configuration)).rejects.toThrow(
      /verified Admin session/,
    );
    expect(
      calls.some(
        (c) =>
          c.path.includes("partner-entries") ||
          c.path.includes("step-up-proofs"),
      ),
    ).toBe(false);
    expect(
      calls
        .filter((c) => c.path === "/api/auth/sessions/revoke")
        .map((c) => c.body),
    ).toEqual([{ sessionId: adminSessionId }]);
    expect(
      calls.some((c) => c.body.sessionId === "foreign-admin-session-dummy"),
    ).toBe(false);
    expect(adminRevoked).toBe(true);
  });

  it.each([
    "proof-missing-reference",
    "proof-wrong-action",
    "proof-not-required",
  ])("rejects %s without attempting protected create", async (failure) => {
    fault = failure;
    await expect(prepareOperationalFleetSession(configuration)).rejects.toThrow(
      /step up.*receipt/,
    );
    expect(calls.some((c) => c.path.includes("partner-entries"))).toBe(false);
    expect(adminRevoked).toBe(true);
  });

  it.each([
    ["proof-mfa-denied", "MFA_REQUIRED"],
    ["proof-session-denied", "STEP_UP_REQUIRED"],
  ])(
    "retains safe 403 code for %s without secrets, retries or later mutations",
    async (failure, code) => {
      fault = failure;
      const error = await prepareOperationalFleetSession(configuration).catch(
        (e: unknown) => e,
      );
      expect(String(error)).toContain(`HTTP 403 code ${code}`);
      expect(String(error)).not.toContain(adminToken);
      expect(String(error)).not.toContain(plaintextKey);
      expect(
        calls.filter((c) => c.path.endsWith("/step-up-proofs")),
      ).toHaveLength(1);
      expect(calls.some((c) => c.path.includes("partner-entries"))).toBe(false);
      expect(adminRevoked).toBe(true);
    },
  );

  it("cleans an exchange-acknowledged Admin session even when its authority readback fails before Entry creation", async () => {
    fault = "admin-session-denied";
    await expect(prepareOperationalFleetSession(configuration)).rejects.toThrow(
      /HTTP 401 code SESSION_REVOKED/,
    );
    expect(calls.map((c) => c.path)).toEqual([
      "/control-plane-proxy/auth/token",
      "/control-plane-proxy/auth/session",
      "/api/auth/sessions/revoke",
    ]);
    expect(adminRevoked).toBe(true);
    expect(entry).toEqual({});
  });

  it("rejects an authority proof bound to another path and never continues to key issue", async () => {
    fault = "proof-foreign-path";
    await expect(prepareOperationalFleetSession(configuration)).rejects.toThrow(
      /HTTP 403 code STEP_UP_REQUIRED/,
    );
    expect(calls.some((c) => c.path.endsWith("/credentials"))).toBe(false);
    expect(adminRevoked).toBe(true);
    expect(revokedEntry).toBe(false);
  });

  it("retains the exact dev-exchange denial code without exposing the otherwise identical secret-bearing error payload", async () => {
    fault = "admin-exchange-typed-denied";
    const error = await prepareOperationalFleetSession(configuration).catch(
      (e: unknown) => e,
    );
    expect(String(error)).toContain(
      "HTTP 403 code DEV_WORKFORCE_SESSION_EXCHANGE_DENIED",
    );
    for (const secret of [adminToken, token, plaintextKey])
      expect(String(error)).not.toContain(secret);
    expect(calls.map((c) => c.path)).toEqual([
      "/control-plane-proxy/auth/token",
    ]);
  });

  it("omits non-allowlisted response codes and all raw secret-bearing messages", async () => {
    fault = "proof-unknown-code";
    const error = await prepareOperationalFleetSession(configuration).catch(
      (e: unknown) => e,
    );
    expect(String(error)).toContain("HTTP 403");
    for (const secret of [adminToken, token, plaintextKey])
      expect(String(error)).not.toContain(secret);
    expect(String(error)).not.toContain("code ");
    expect(adminRevoked).toBe(true);
  });

  it("propagates a cleanup proof denial and still attempts only its own later cleanup before Admin revocation", async () => {
    prepared = await prepareOperationalFleetSession(configuration);
    fault = "proof-key-revoke-denied";
    const error = await prepared.cleanup().catch((e: unknown) => e);
    expect(String(error)).toMatch(
      /own cleanup failed.*HTTP 403 code STEP_UP_REQUIRED/,
    );
    expect(revokedKey).toBe(false);
    expect(revokedEntry && adminRevoked).toBe(true);
    expect(calls.at(-1)?.body.sessionId).toBe(adminSessionId);
    expect(String(error)).not.toContain(adminToken);
  });

  it("reports owned Admin cleanup denial without leaking its session token", async () => {
    prepared = await prepareOperationalFleetSession(configuration);
    fault = "admin-cleanup-denied";
    const error = await prepared.cleanup().catch((e: unknown) => e);
    expect(String(error)).toMatch(
      /own cleanup failed.*HTTP 403 code FORBIDDEN/,
    );
    expect(revokedKey && revokedEntry).toBe(true);
    expect(adminRevoked).toBe(false);
    expect(String(error)).not.toContain(adminToken);
  });

  it.each([
    "admin-exchange-denied",
    "admin-exchange-redirect",
    "admin-exchange-oversized",
    "admin-exchange-missing-session",
  ])(
    "rejects %s without any authority fallback or business mutation",
    async (failure) => {
      fault = failure;
      await expect(
        prepareOperationalFleetSession(configuration),
      ).rejects.toThrow(/Admin token/);
      expect(calls.map((c) => c.path)).toEqual([
        "/control-plane-proxy/auth/token",
      ]);
      expect(entry).toEqual({});
    },
  );

  it.each(["elapsed-admin-deadline", "elapsed-key-deadline"])(
    "retains exact acknowledged ownership at %s and uses only the original separate cleanup budget",
    async (failure) => {
      vi.useFakeTimers();
      fault = failure;
      await expect(
        prepareOperationalFleetSession(configuration),
      ).rejects.toThrow(/deadline failed/);
      expect(adminRevoked).toBe(true);
      if (failure === "elapsed-admin-deadline") {
        expect(calls.map((c) => c.path)).toEqual([
          "/control-plane-proxy/auth/token",
          "/api/auth/sessions/revoke",
        ]);
        expect(revokedEntry || revokedKey).toBe(false);
      } else {
        expect(revokedEntry && revokedKey).toBe(true);
        expect(calls.some((c) => c.path.endsWith("/bootstrap-session"))).toBe(
          false,
        );
      }
    },
  );

  it("bounds an exchange response body read using its original request deadline", async () => {
    vi.useFakeTimers();
    fault = "admin-exchange-hanging";
    const pending = prepareOperationalFleetSession(configuration);
    const assertion = expect(pending).rejects.toThrow(
      /Admin token exchange failed/,
    );
    await vi.advanceTimersByTimeAsync(15_001);
    await assertion;
    expect(calls).toHaveLength(1);
    expect(entry).toEqual({});
  });

  it("verifies a provided session using the actual backend and never issues or revokes its owner's Entry/key", async () => {
    vi.stubEnv(
      "DRTS_OPERATIONAL_FLEET_SESSION_TOKEN",
      "provided-session-dummy",
    );
    prepared = await prepareOperationalFleetSession(configuration);
    expect(prepared.metadata.source).toBe("provided-session");
    await prepared.cleanup();
    expect(calls.map((c) => c.path)).toEqual(["/api/auth/session"]);
    expect(maskOutput).toEqual(["::add-mask::provided-session-dummy\n"]);
  });

  it("does not mint a substitute after a provided session is denied", async () => {
    vi.stubEnv(
      "DRTS_OPERATIONAL_FLEET_SESSION_TOKEN",
      "provided-session-dummy",
    );
    fault = "session-denied";
    await expect(prepareOperationalFleetSession(configuration)).rejects.toThrow(
      /provided session failed/,
    );
    expect(calls.map((c) => c.path)).toEqual(["/api/auth/session"]);
  });

  it("refuses nonempty credentials without rotation or revoking those unowned keys", async () => {
    fault = "nonempty-keys";
    await expect(prepareOperationalFleetSession(configuration)).rejects.toThrow(
      /unowned credentials; preserved/,
    );
    expect(businessCalls().map((c) => c.path.split("/").at(-1))).toEqual([
      "partner-entries",
      "credentials",
    ]);
    expect(revokedKey || revokedEntry).toBe(false);
  });

  it.each([
    "random-binding",
    "issue-denied",
    "bootstrap-denied",
    "session-denied",
    "wrong-role",
    "wrong-fleet",
    "wrong-key",
    "native-secret-error",
  ])(
    "rejects %s, cleans only acknowledged own resources and never exposes raw key/token in the error",
    async (failure) => {
      fault = failure;
      const error = await prepareOperationalFleetSession(configuration).catch(
        (value: unknown) => value,
      );
      expect(error).toBeInstanceOf(Error);
      expect(String(error)).not.toContain(plaintextKey);
      expect(String(error)).not.toContain(token);
      expect(revokedEntry).toBe(true);
      expect(calls.some((c) => c.path.includes("do-not-touch"))).toBe(false);
      if (failure === "random-binding")
        expect(calls.some((c) => c.path.endsWith("/issue"))).toBe(false);
    },
  );

  it("rejects an issuer redirect without following it or claiming unacknowledged ownership", async () => {
    fault = "create-redirect";
    await expect(prepareOperationalFleetSession(configuration)).rejects.toThrow(
      /ownership not acknowledged/,
    );
    expect(businessCalls()).toHaveLength(1);
    expect(revokedEntry).toBe(false);
  });

  it("fails closed on an unsafe configured origin before sending any credential", async () => {
    vi.stubEnv(
      "DRTS_OPERATIONAL_PLATFORM_ADMIN_URL",
      "https://user:password@admin.example.invalid",
    );
    await expect(prepareOperationalFleetSession(configuration)).rejects.toThrow(
      /configured origin/,
    );
    expect(calls).toHaveLength(0);
  });

  it("enforces the setup deadline and still cleans its acknowledged Entry within a separate finite cleanup budget", async () => {
    vi.useFakeTimers();
    fault = "elapsed-deadline";
    await expect(prepareOperationalFleetSession(configuration)).rejects.toThrow(
      /create bound entry deadline failed/,
    );
    expect(revokedEntry).toBe(true);
    expect(businessCalls().map((c) => c.path.split("/").at(-1))).toEqual([
      "partner-entries",
      "revoke",
    ]);
  });

  it("reports an actual own cleanup failure without leaking secrets or touching another Entry", async () => {
    prepared = await prepareOperationalFleetSession(configuration);
    fault = "cleanup-denied";
    await expect(prepared.cleanup()).rejects.toThrow(/own cleanup failed/);
    expect(revokedKey).toBe(true);
    expect(revokedEntry).toBe(false);
    expect(
      businessCalls()
        .slice(-3)
        .every(
          (c) => c.origin === api || c.path.includes(String(entry.entrySlug)),
        ),
    ).toBe(true);
  });
});
