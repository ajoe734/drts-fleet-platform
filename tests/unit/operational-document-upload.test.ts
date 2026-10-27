import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  uploadOperationalDocument,
  prepareOperationalReferralHandoff,
  observeOperationalReferralZeroOrders,
  runSetup,
  runOperationalDocumentAcceptance,
  operationalRequestHeaders,
  operationalReviewerRequestHeaders,
  downloadOperationalDocumentAsReviewer,
  operationalRoleRequestHeaders,
  verifyOperationalRoleSession,
  probeOperationalDocumentRoleAccess,
  resolveOperationalEditableCase,
  getOperationalDocumentFixture,
  OPERATIONAL_PDF_BYTES,
  OPERATIONAL_PNG_BYTES,
  OPERATIONAL_JPEG_BYTES,
  installOperationalBrowserHeaders,
  fetchOperationalSurface,
  prepareOperationalFleetSession,
  type PreparedOperationalFleetSession,
  type Journey,
  type DocumentAcceptanceManifest,
} from "../e2e/operational-document-upload";
import {
  type APIRequestContext,
  type Page,
  type Route,
} from "@playwright/test";
import { createHash } from "node:crypto";
import journeysData from "../e2e/fixtures/operational-browser-journeys.json";
import { deepToSnakeCase } from "../../apps/api/src/common/snake-case.interceptor";
import { resolveRouteAuthPolicy } from "../../apps/api/src/common/auth/auth.policy";
import { BootstrapAuthGuard } from "../../apps/api/src/common/auth/bootstrap-auth.guard";
import { SupplyDocumentService } from "../../apps/api/src/modules/fleet-partner/supply-document.service";
import { SupplySubmissionService } from "../../apps/api/src/modules/fleet-partner/supply-submission.service";
import { SupplySubmissionRepository } from "../../apps/api/src/modules/fleet-partner/supply-submission.repository";
import { RegulatoryRegistryService } from "../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { fleetStorageFixture } from "./helpers/fleet-document-fixture";

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
    text: async () => bodyBuffer.toString("utf8"),
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
  const declaredScopes = ["billing:read", "partner:read", "partner:write"];
  const issuedScopes = () =>
    (calls.find((c) => c.path.endsWith("/credentials/issue"))?.body
      .scopes as string[]) ?? ["billing:read"];
  const credential = () => ({
    keyId: "own-key-dummy",
    entrySlug:
      fault === "receipt-foreign-entry" ? "foreign-entry" : entry.entrySlug,
    realm: "partner",
    ownerRef:
      fault === "receipt-foreign-owner" ? "foreign-owner" : entry.entrySlug,
    ownerType: "operational_acceptance",
    resourceScope: `partner_entry:${String(entry.entrySlug)}`,
    scopes:
      fault === "receipt-missing"
        ? null
        : fault === "receipt-read-only"
          ? ["billing:read"]
          : fault === "receipt-extra"
            ? [...issuedScopes(), "billing:write"]
            : issuedScopes(),
    expiresAt:
      fault === "receipt-expiry"
        ? "2000-01-01T00:00:00.000Z"
        : calls.find((c) => c.path.endsWith("/credentials/issue"))?.body
            .expiresAt,
    status: revokedKey || fault === "receipt-revoked" ? "revoked" : "active",
    revokedAt:
      revokedKey || fault === "receipt-revoked" ? "2026-10-19T00:00:00Z" : null,
  });
  const directScopes = [
    "billing:read",
    "fleet:read",
    "fleet:finance:read",
    "fleet:supply:write",
  ];
  const providedScopeSets: Record<string, string[]> = {
    "provided-direct": directScopes,
    "provided-direct-inactive": directScopes,
    "provided-direct-foreign-tenant": directScopes,
    "provided-direct-foreign-fleet": directScopes,
    "provided-direct-revoked": directScopes,
    "provided-mixed": ["billing:read", "partner:read", "fleet:supply:write"],
    "provided-direct-read-only": directScopes.slice(0, 3),
    "provided-direct-write-only": ["billing:read", "fleet:supply:write"],
    "provided-finance-only": [
      "billing:read",
      "fleet:finance:read",
      "fleet:supply:write",
    ],
    "provided-mixed-without-legacy-read": [
      "billing:read",
      "fleet:read",
      "fleet:finance:read",
      "partner:write",
    ],
    "provided-read-only": ["billing:read", "partner:read"],
  };
  const identity = () => ({
    authMode: "jwt_bearer",
    realm: fault === "wrong-role" ? "tenant" : "partner",
    actorType: "partner_api_key",
    actorId: fault === "wrong-key" ? "foreign-key-dummy" : "own-key-dummy",
    principalId: "own-key-dummy",
    partnerId:
      fault === "wrong-fleet" || fault === "provided-direct-foreign-fleet"
        ? "foreign-fleet-dummy"
        : configuration.fleetPartnerId,
    partnerEntrySlug:
      fault === "foreign-entry" ? "foreign-entry" : entry.entrySlug,
    tenantId:
      fault === "foreign-tenant" || fault === "provided-direct-foreign-tenant"
        ? "foreign-tenant"
        : configuration.tenantId,
    partnerProgramId:
      fault === "foreign-program" ? "foreign-program" : entry.programId,
    sessionId: "own-session-dummy",
    scopes:
      providedScopeSets[fault] ??
      (fault === "session-read-only"
        ? ["billing:read"]
        : fault === "session-extra"
          ? [...issuedScopes(), "billing:write"]
          : calls.some((c) => c.path.endsWith("/credentials/issue"))
            ? issuedScopes()
            : declaredScopes),
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
          if (
            fault === "session-revoked" ||
            fault === "provided-direct-revoked"
          )
            return authError("SESSION_REVOKED", 401);
          return reply({
            active:
              fault !== "session-inactive" &&
              fault !== "provided-direct-inactive",
            identity:
              fault === "session-echo-actor"
                ? { ...identity(), actorId: "other-key" }
                : identity(),
          });
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
    expect(businessCalls()[2]?.body.scopes).toEqual(declaredScopes);
    const expiry = Date.parse(String(businessCalls()[2]?.body.expiresAt));
    expect(expiry - Date.now()).toBeGreaterThan(0);
    expect(expiry - Date.now()).toBeLessThanOrEqual(60 * 60_000);
    const guard = new BootstrapAuthGuard({} as any) as any;
    const route = "/api/fleet-partner/supply-submissions/drivers";
    const policy = resolveRouteAuthPolicy("POST", route)!;
    expect(policy.requiredScopes).toEqual(["fleet:supply:write"]);
    const principal = { ...identity(), membershipId: null, roles: [] };
    const req = { method: "POST", originalUrl: route, headers: {} };
    const result = (subject: any, required: string[], request: any) => {
      try {
        guard.assertScopesAllowed(subject, required, request);
        return "allowed";
      } catch (error) {
        return { status: (error as any).status, code: (error as any).code };
      }
    };
    expect(
      result(
        { ...principal, scopes: ["billing:read"] },
        policy.requiredScopes,
        req,
      ),
    ).toEqual({ status: 403, code: "AUTH_SCOPE_DENIED" });
    expect(result(principal, policy.requiredScopes, req)).toBe("allowed");
    for (const scopes of [
      ["billing:read", "partner:read"],
      ["billing:read", "partner:write"],
    ])
      expect(
        result({ ...principal, scopes }, policy.requiredScopes, req),
      ).toEqual({ status: 403, code: "AUTH_SCOPE_DENIED" });
    expect(
      result(principal, policy.requiredScopes, {
        ...req,
        headers: { "x-fleet-partner-id": "foreign-fleet" },
      }),
    ).toEqual({ status: 403, code: "FLEET_SCOPE_DENIED" });
    expect(
      result(
        {
          ...principal,
          actorType: "partner_user",
          membershipId: "finance-member",
          roles: ["fleet_partner_finance"],
          scopes: ["fleet:finance:read"],
        },
        policy.requiredScopes,
        req,
      ),
    ).toEqual({ status: 403, code: "AUTH_SCOPE_DENIED" });
    const finance = "/api/fleet-partner/statements/test/dispute";
    expect(
      result(
        principal,
        resolveRouteAuthPolicy("POST", finance)!.requiredScopes,
        { ...req, originalUrl: finance },
      ),
    ).toEqual({ status: 403, code: "AUTH_SCOPE_DENIED" });
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

  it.each(["provided-direct", "provided-mixed"])(
    "accepts a backend-authorized %s provided own Fleet session without minting or revoking anything",
    async (variant) => {
      vi.stubEnv(
        "DRTS_OPERATIONAL_FLEET_SESSION_TOKEN",
        "provided-session-dummy",
      );
      fault = variant;
      const principal = { ...identity(), membershipId: null, roles: [] };
      const guard = new BootstrapAuthGuard({} as any) as any;
      for (const [method, route] of [
        ["GET", "/api/fleet-partner/dashboard"],
        ["GET", "/api/fleet-partner/supply-submissions"],
        ["POST", "/api/fleet-partner/supply-submissions/drivers"],
      ] as const) {
        const policy = resolveRouteAuthPolicy(method, route)!;
        expect(policy).toBeTruthy();
        expect(() =>
          guard.assertScopesAllowed(principal, policy.requiredScopes, {
            method,
            originalUrl: route,
            headers: {},
          }),
        ).not.toThrow();
      }
      prepared = await prepareOperationalFleetSession(configuration);
      expect(prepared.metadata.source).toBe("provided-session");
      await prepared.cleanup();
      expect(calls.map((c) => c.path)).toEqual(["/api/auth/session"]);
      expect(revokedKey || revokedEntry || adminRevoked).toBe(false);
      expect(maskOutput).toEqual(["::add-mask::provided-session-dummy\n"]);
    },
  );

  it.each([
    "provided-direct-read-only",
    "provided-direct-write-only",
    "provided-finance-only",
    "provided-mixed-without-legacy-read",
    "provided-direct-inactive",
    "provided-direct-foreign-tenant",
    "provided-direct-foreign-fleet",
    "provided-direct-revoked",
  ])(
    "rejects insufficient %s provided session without any mutation",
    async (variant) => {
      vi.stubEnv(
        "DRTS_OPERATIONAL_FLEET_SESSION_TOKEN",
        "provided-session-dummy",
      );
      fault = variant;
      if (
        ![
          "provided-direct-inactive",
          "provided-direct-foreign-tenant",
          "provided-direct-foreign-fleet",
          "provided-direct-revoked",
        ].includes(variant)
      ) {
        const route =
          variant === "provided-direct-write-only" ||
          variant === "provided-finance-only"
            ? "/api/fleet-partner/dashboard"
            : "/api/fleet-partner/supply-submissions/drivers";
        const method = route.endsWith("/drivers") ? "POST" : "GET";
        const guard = new BootstrapAuthGuard({} as any) as any;
        const policy = resolveRouteAuthPolicy(method, route)!;
        expect(() =>
          guard.assertScopesAllowed(
            { ...identity(), membershipId: null, roles: [] },
            policy.requiredScopes,
            { method, originalUrl: route, headers: {} },
          ),
        ).toThrow();
      }
      await expect(
        prepareOperationalFleetSession(configuration),
      ).rejects.toThrow(
        variant === "provided-direct-revoked"
          ? /provided session failed \(HTTP 401 code SESSION_REVOKED\)/
          : /verified session/,
      );
      expect(calls.map((c) => c.path)).toEqual(["/api/auth/session"]);
      expect(revokedKey || revokedEntry || adminRevoked).toBe(false);
    },
  );

  it("rejects a real provided read-only session before any mutation without minting or revoking it", async () => {
    vi.stubEnv(
      "DRTS_OPERATIONAL_FLEET_SESSION_TOKEN",
      "provided-session-dummy",
    );
    fault = "provided-read-only";
    await expect(prepareOperationalFleetSession(configuration)).rejects.toThrow(
      /verified session/,
    );
    expect(calls.map((c) => c.path)).toEqual(["/api/auth/session"]);
    expect(revokedKey || revokedEntry || adminRevoked).toBe(false);
  });

  it.each([
    "receipt-missing",
    "receipt-read-only",
    "receipt-extra",
    "receipt-expiry",
    "receipt-foreign-owner",
    "receipt-revoked",
  ])(
    "rejects %s after normal first-key issuance and cleans owned resources",
    async (failure) => {
      fault = failure;
      await expect(
        prepareOperationalFleetSession(configuration),
      ).rejects.toThrow(/first key receipt/);
      expect(revokedKey && revokedEntry && adminRevoked).toBe(true);
      expect(calls.some((c) => c.path.endsWith("bootstrap-session"))).toBe(
        false,
      );
    },
  );

  it("does not revoke a key whose issue receipt names a foreign Entry", async () => {
    fault = "receipt-foreign-entry";
    await expect(prepareOperationalFleetSession(configuration)).rejects.toThrow(
      /first key receipt/,
    );
    expect(revokedKey).toBe(false);
    expect(revokedEntry && adminRevoked).toBe(true);
    expect(
      calls.some((c) => c.path.includes("foreign-entry/credentials")),
    ).toBe(false);
  });

  it.each([
    "session-read-only",
    "session-extra",
    "foreign-entry",
    "foreign-tenant",
    "foreign-program",
    "session-inactive",
    "session-echo-actor",
  ])(
    "rejects %s bootstrap identity without leaking secrets, cleans own resources",
    async (failure) => {
      fault = failure;
      const error = await prepareOperationalFleetSession(configuration).catch(
        (e: unknown) => e,
      );
      expect(String(error)).toMatch(/session/);
      expect(String(error)).not.toContain(plaintextKey);
      expect(String(error)).not.toContain(token);
      expect(revokedKey && revokedEntry && adminRevoked).toBe(true);
    },
  );

  it.each([
    "foreign-tenant",
    "wrong-fleet",
    "session-inactive",
    "session-revoked",
  ])(
    "rejects %s supplied session without minting or revoking other resources",
    async (failure) => {
      vi.stubEnv(
        "DRTS_OPERATIONAL_FLEET_SESSION_TOKEN",
        "provided-session-dummy",
      );
      fault = failure;
      await expect(
        prepareOperationalFleetSession(configuration),
      ).rejects.toThrow(/provided session|verified session/);
      expect(calls.map((c) => c.path)).toEqual(["/api/auth/session"]);
    },
  );

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

function checkActualPng(bytes: Buffer) {
  expect(bytes.subarray(0, 8)).toEqual(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
  const chunks: string[] = [];
  let offset = 8;
  while (offset < bytes.length) {
    expect(offset + 8).toBeLessThanOrEqual(bytes.length);
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString("ascii");
    chunks.push(type);
    offset += 12 + length;
  }
  expect(offset).toBe(bytes.length);
  expect(chunks[0]).toBe("IHDR");
  expect(chunks).toContain("IDAT");
  expect(chunks.at(-1)).toBe("IEND");
  return {
    length: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    chunks,
  };
}

function checkActualJpeg(bytes: Buffer) {
  expect(bytes[0]).toBe(0xff);
  expect(bytes[1]).toBe(0xd8);
  expect(bytes[bytes.length - 2]).toBe(0xff);
  expect(bytes[bytes.length - 1]).toBe(0xd9);
  expect(bytes.subarray(6, 11).toString("ascii")).toBe("JFIF\0");
  return {
    length: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

describe("C125 full document families, Case attachments, Reviewer readback, and Cross-Role access matrix", () => {
  const origin = "https://fleet.example.invalid";
  const adminOrigin = "https://admin.example.invalid";
  const mockRequest = {} as APIRequestContext;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    vi.stubEnv("DRTS_CANDIDATE_SHA", "c125abc");
    vi.stubEnv("DRTS_DEV_FLEET_PARTNER_PORTAL_BASE_URL", origin);
    vi.stubEnv(
      "DRTS_DEV_FLEET_PARTNER_PORTAL_ID_TOKEN",
      "fleet-cloud-run-invocation-token",
    );
    vi.stubEnv(
      "DRTS_OPERATIONAL_FLEET_SESSION_TOKEN",
      "own-fleet-session-token",
    );
    vi.stubEnv("DRTS_DEV_PLATFORM_ADMIN_BASE_URL", adminOrigin);
    vi.stubEnv(
      "DRTS_DEV_PLATFORM_ADMIN_ID_TOKEN",
      "admin-cloud-run-invocation-token",
    );
    vi.stubEnv(
      "DRTS_OPERATIONAL_PLATFORM_ADMIN_SESSION_TOKEN",
      "platform-reviewer-session-token",
    );
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  it("verifies structurally valid PDF, PNG, and JPEG binary fixtures and rejects unsupported MIME types", () => {
    const pdf = getOperationalDocumentFixture("application/pdf");
    const pdfFacts = checkActualPdf(pdf.bytes);
    expect(pdf.bytes).toEqual(OPERATIONAL_PDF_BYTES);
    expect(pdf.fileSize).toBe(327);
    expect(pdf.sha256).toBe(pdfFacts.sha256);
    expect(pdf.originalFileName).toBe("harmless-upload.pdf");

    const png = getOperationalDocumentFixture("image/png", "evidence.png");
    const pngFacts = checkActualPng(png.bytes);
    expect(png.bytes).toEqual(OPERATIONAL_PNG_BYTES);
    expect(png.fileSize).toBe(69);
    expect(png.sha256).toBe(
      "2128be2646bad332aa1e97b2676d9f960a43ff1a9d80bc6baf42c2d131034b83",
    );
    expect(png.sha256).toBe(pngFacts.sha256);
    expect(png.originalFileName).toBe("evidence.png");

    const jpeg = getOperationalDocumentFixture("image/jpeg", "evidence.jpg");
    const jpegFacts = checkActualJpeg(jpeg.bytes);
    expect(jpeg.bytes).toEqual(OPERATIONAL_JPEG_BYTES);
    expect(jpeg.fileSize).toBe(332);
    expect(jpeg.sha256).toBe(
      "2873aca24970d8ab5f392f0d694229e3b14cf65c9425cadd92a8295399576288",
    );
    expect(jpeg.sha256).toBe(jpegFacts.sha256);
    expect(jpeg.originalFileName).toBe("evidence.jpg");

    expect(() => getOperationalDocumentFixture("image/gif")).toThrow(
      /Unsupported operational document contentType/,
    );
  });

  it("executes Supply vehicle, contract, and PNG/JPEG other uploads and rejects invented photo enum or mismatched parent contracts", async () => {
    const uploadedObjects = new Map<
      string,
      { bytes: Buffer; contentType: string; documentType: string }
    >();

    global.fetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        const method = init?.method || "GET";

        if (
          method === "GET" &&
          url.pathname ===
            "/control-plane-proxy/fleet-partner/supply-submissions/sub-veh-001"
        ) {
          return jsonResponse({
            data: {
              submission: {
                submission_id: "sub-veh-001",
                fleet_id: "fleet-demo-001",
                submission_type: "vehicle_onboarding",
                revision_no: 1,
              },
            },
          });
        }
        if (
          method === "GET" &&
          url.pathname ===
            "/control-plane-proxy/fleet-partner/supply-submissions/sub-drv-001"
        ) {
          return jsonResponse({
            data: {
              submission: {
                submission_id: "sub-drv-001",
                fleet_id: "fleet-demo-001",
                submission_type: "driver_onboarding",
                revision_no: 1,
              },
            },
          });
        }
        if (
          method === "POST" &&
          url.pathname.endsWith("/documents/upload-url")
        ) {
          const subId = url.pathname.split("/")[4]!;
          const body = JSON.parse(String(init?.body || "{}"));
          const objKey = `fleet-partner/fleet-demo-001/supply-submissions/${subId}/${body.documentType}/${body.originalFileName}`;
          uploadedObjects.set(objKey, {
            bytes: Buffer.alloc(0),
            contentType: body.contentType,
            documentType: body.documentType,
          });
          return jsonResponse({
            data: {
              submission_id: subId,
              fleet_partner_id: "fleet-demo-001",
              object_key: objKey,
              upload_url: `${origin}/control-plane-proxy/fleet-partner/supply-submissions/${subId}/documents/content?objectKey=${encodeURIComponent(objKey)}`,
              method: "PUT",
              headers: { "Content-Type": "application/octet-stream" },
            },
          });
        }
        if (method === "PUT" && url.pathname.endsWith("/documents/content")) {
          const objKey = url.searchParams.get("objectKey")!;
          const buf = Buffer.from(init?.body as Uint8Array);
          const existing = uploadedObjects.get(objKey)!;
          existing.bytes = buf;
          return jsonResponse({
            data: {
              checksum_sha256: createHash("sha256").update(buf).digest("hex"),
              file_size: buf.length,
              scan_state: "clean",
            },
          });
        }
        if (method === "POST" && url.pathname.endsWith("/documents/confirm")) {
          const subId = url.pathname.split("/")[4]!;
          const body = JSON.parse(String(init?.body || "{}"));
          const stored = uploadedObjects.get(body.objectKey)!;
          const docId = `doc-${body.documentType}`;
          uploadedObjects.set(`${subId}:${docId}`, stored);
          return jsonResponse({
            data: {
              document_id: docId,
              submission_id: subId,
              fleet_partner_id: "fleet-demo-001",
              document_type: body.documentType,
              file_object_key: body.objectKey,
              checksum_sha256: body.checksumSha256,
              file_size: body.fileSize,
              content_type: body.contentType,
            },
          });
        }
        if (method === "GET" && url.pathname.endsWith("/download")) {
          const adminMatch = url.pathname.match(
            /^\/control-plane-proxy\/admin\/fleet-partners\/supply-documents\/([^/]+)\/([^/]+)\/download$/,
          );
          const parts = url.pathname.split("/");
          const subId = adminMatch ? adminMatch[1]! : parts[4]!;
          const docId = adminMatch ? adminMatch[2]! : parts[6]!;
          const stored = uploadedObjects.get(`${subId}:${docId}`)!;
          return new Response(new Uint8Array(stored.bytes), {
            status: 200,
            headers: {
              "content-type": stored.contentType,
              "x-drts-candidate-sha": "c125abc",
            },
          });
        }
        return jsonResponse({ error: { code: "NOT_FOUND" } }, 404);
      },
    );

    for (const spec of [
      {
        subId: "sub-veh-001",
        documentType: "vehicle_registration",
        contentType: "application/pdf",
        originalFileName: "veh-reg.pdf",
      },
      {
        subId: "sub-veh-001",
        documentType: "insurance_policy",
        contentType: "application/pdf",
        originalFileName: "insurance.pdf",
      },
      {
        subId: "sub-veh-001",
        documentType: "fleet_participation_contract",
        contentType: "application/pdf",
        originalFileName: "veh-participation.pdf",
      },
      {
        subId: "sub-veh-001",
        documentType: "vehicle_management_contract",
        contentType: "application/pdf",
        originalFileName: "veh-mgmt.pdf",
      },
      {
        subId: "sub-veh-001",
        documentType: "other",
        contentType: "image/png",
        originalFileName: "veh-photo.png",
      },
      {
        subId: "sub-veh-001",
        documentType: "other",
        contentType: "image/jpeg",
        originalFileName: "veh-photo.jpg",
      },
      {
        subId: "sub-drv-001",
        documentType: "driver_management_contract",
        contentType: "application/pdf",
        originalFileName: "drv-mgmt.pdf",
      },
    ]) {
      const ev = await uploadOperationalDocument(
        mockRequest,
        origin,
        `/control-plane-proxy/fleet-partner/supply-submissions/${spec.subId}/documents/upload-url`,
        {
          expectedRevisionNo: 1,
          documentType: spec.documentType,
          contentType: spec.contentType,
          originalFileName: spec.originalFileName,
        },
        `/control-plane-proxy/fleet-partner/supply-submissions/${spec.subId}/documents/confirm`,
        {
          expectedRevisionNo: 1,
          documentType: spec.documentType,
          contentType: spec.contentType,
          originalFileName: spec.originalFileName,
        },
        { Authorization: "Bearer tok" },
      );
      expect(ev.confirmDocumentType).toBe(spec.documentType);
      expect(ev.readbackContentType).toBe(spec.contentType);
      expect(ev.readbackSha256).toBe(ev.sha256);
      const reviewerSupplyReadback =
        await downloadOperationalDocumentAsReviewer(
          adminOrigin,
          "DRTS_DEV_PLATFORM_ADMIN_BASE_URL",
          {
            kind: "supply",
            submissionId: spec.subId,
            documentId: ev.documentId!,
          },
          {
            sha256: ev.sha256,
            fileSize: ev.fileSize,
            contentType: spec.contentType as any,
          },
        );
      expect(reviewerSupplyReadback.downloadStatus).toBe(200);
      expect(reviewerSupplyReadback.readbackSha256).toBe(ev.sha256);
    }

    // Reject invented photo enum
    await expect(
      uploadOperationalDocument(
        mockRequest,
        origin,
        "/control-plane-proxy/fleet-partner/supply-submissions/sub-veh-001/documents/upload-url",
        { expectedRevisionNo: 1, documentType: "photo" },
        "/control-plane-proxy/fleet-partner/supply-submissions/sub-veh-001/documents/confirm",
        { expectedRevisionNo: 1, documentType: "photo" },
        { Authorization: "Bearer tok" },
      ),
    ).rejects.toThrow(/no invented photo enum/);

    // Reject vehicle_management_contract on driver submission
    await expect(
      uploadOperationalDocument(
        mockRequest,
        origin,
        "/control-plane-proxy/fleet-partner/supply-submissions/sub-drv-001/documents/upload-url",
        { expectedRevisionNo: 1, documentType: "vehicle_management_contract" },
        "/control-plane-proxy/fleet-partner/supply-submissions/sub-drv-001/documents/confirm",
        { expectedRevisionNo: 1, documentType: "vehicle_management_contract" },
        { Authorization: "Bearer tok" },
      ),
    ).rejects.toThrow(/driver supply submission sub-drv-001 does not allow/);

    // Reject driver_management_contract on vehicle submission
    await expect(
      uploadOperationalDocument(
        mockRequest,
        origin,
        "/control-plane-proxy/fleet-partner/supply-submissions/sub-veh-001/documents/upload-url",
        { expectedRevisionNo: 1, documentType: "driver_management_contract" },
        "/control-plane-proxy/fleet-partner/supply-submissions/sub-veh-001/documents/confirm",
        { expectedRevisionNo: 1, documentType: "driver_management_contract" },
        { Authorization: "Bearer tok" },
      ),
    ).rejects.toThrow(/vehicle supply submission sub-veh-001 does not allow/);
  });

  it("confirms the actual SupplyDocumentService rejects the revised own_fleet invalid-metadata probes with zero intent writes and accepts the matching valid controls", async () => {
    const { storage, store } = fleetStorageFixture("clean");
    const repository = new SupplySubmissionRepository();
    const submissions = new SupplySubmissionService(
      repository,
      new RegulatoryRegistryService(
        undefined as never,
        undefined as never,
        undefined as never,
      ),
    );
    const service = new SupplyDocumentService(submissions, repository, storage);
    const driverDraft = await submissions.createDriverDraft(
      "fleet-demo-001",
      "owner",
      {
        name: "Probe Driver",
        mobile: "+886900111222",
        professionalDriverLicenseNo: "PROBE-LICENSE",
        professionalDriverLicenseExpiry: "2027-12-31",
        taxiDriverRegistrationNo: "PROBE-REG",
        taxiDriverRegistrationArea: "TPE",
        taxiDriverRegistrationExpiry: "2027-12-31",
        supportedServiceProductCodes: ["taxi_realtime"],
        preferredVehicleSubmissionId: null,
      },
    );
    const vehicleDraft = await submissions.createVehicleDraft(
      "fleet-demo-001",
      "owner",
      {
        plateNo: "PROBE-9999",
        licenseType: "taxi",
        brand: "Toyota",
        model: "Camry",
        modelYear: 2024,
        seatCount: 4,
        luggageCapacity: 2,
        businessArea: "TPE",
        supportedServiceProductCodes: ["taxi_realtime"],
        currentDriverSubmissionId: null,
        doorCount: null,
        color: null,
        fixedFareAllowed: false,
        airportTransferEligible: false,
      },
    );

    const putIfAbsentSpy = vi.spyOn(store, "putIfAbsent");

    await expect(
      service.createUploadUrl(
        "fleet-demo-001",
        driverDraft.submission.submissionId,
        "owner",
        {
          expectedRevisionNo: 1,
          documentType: "professional_driver_license",
          contentType: "application/pdf",
          originalFileName: " ",
        },
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      service.createUploadUrl(
        "fleet-demo-001",
        vehicleDraft.submission.submissionId,
        "owner",
        {
          expectedRevisionNo: 1,
          documentType: "vehicle_registration",
          contentType: "application/pdf",
          originalFileName: " ",
        },
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(putIfAbsentSpy).not.toHaveBeenCalled();

    const driverIntent = await service.createUploadUrl(
      "fleet-demo-001",
      driverDraft.submission.submissionId,
      "owner",
      {
        expectedRevisionNo: 1,
        documentType: "professional_driver_license",
        contentType: "application/pdf",
        originalFileName: "driver-license.pdf",
      },
    );
    expect(driverIntent.method).toBe("PUT");
    const vehicleIntent = await service.createUploadUrl(
      "fleet-demo-001",
      vehicleDraft.submission.submissionId,
      "owner",
      {
        expectedRevisionNo: 1,
        documentType: "vehicle_registration",
        contentType: "application/pdf",
        originalFileName: "vehicle-registration.pdf",
      },
    );
    expect(vehicleIntent.method).toBe("PUT");
  });

  it("executes Case attachment 7-hop lifecycle across PDF/PNG/JPEG, reviewer readback, and rejects closed/foreign/corrupt cases", async () => {
    let caseStatus = "open";
    let caseResponsibility = "shared";
    let caseFleetId = "fleet-demo-001";
    let transientScanner503Remaining = 1;
    let attachmentCounter = 0;
    const caseAttachments = new Map<
      string,
      {
        attachment_id: string;
        object_key: string;
        file_size: number;
        content_type: string;
        name: string;
        state: string;
        bytes: Buffer;
      }
    >();

    global.fetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        const method = init?.method || "GET";

        if (
          method === "GET" &&
          url.pathname ===
            "/control-plane-proxy/fleet-partner/cases/CASE-STL-202603-001"
        ) {
          return jsonResponse({
            data: {
              case_detail: {
                id: "CASE-STL-202603-001",
                fleet_partner_id: caseFleetId,
                status: caseStatus,
                responsibility: caseResponsibility,
              },
              attachments: Array.from(caseAttachments.values()).map((a) => ({
                attachment_id: a.attachment_id,
                case_id: "CASE-STL-202603-001",
                fleet_partner_id: caseFleetId,
                object_key: a.object_key,
                file_size: a.file_size,
                content_type: a.content_type,
                name: a.name,
                state: a.state,
              })),
            },
          });
        }
        if (
          method === "POST" &&
          url.pathname ===
            "/control-plane-proxy/fleet-partner/cases/CASE-STL-202603-001/attachments/upload-url"
        ) {
          const body = JSON.parse(String(init?.body || "{}"));
          attachmentCounter += 1;
          const attachmentId = `att_c125_${attachmentCounter}`;
          const objectKey = `fleet-partner/${caseFleetId}/cases/CASE-STL-202603-001/${attachmentId}-${body.fileName}`;
          caseAttachments.set(attachmentId, {
            attachment_id: attachmentId,
            object_key: objectKey,
            file_size: body.fileSize,
            content_type: body.contentType,
            name: body.fileName,
            state: "pending",
            bytes: Buffer.alloc(0),
          });
          return jsonResponse({
            data: {
              attachment_id: attachmentId,
              case_id: "CASE-STL-202603-001",
              fleet_partner_id: caseFleetId,
              object_key: objectKey,
              upload_url: `${origin}/control-plane-proxy/fleet-partner/cases/CASE-STL-202603-001/attachments/content?objectKey=${encodeURIComponent(objectKey)}`,
              method: "PUT",
              headers: { "Content-Type": "application/octet-stream" },
            },
          });
        }
        if (
          method === "PUT" &&
          url.pathname ===
            "/control-plane-proxy/fleet-partner/cases/CASE-STL-202603-001/attachments/content"
        ) {
          if (transientScanner503Remaining > 0) {
            transientScanner503Remaining -= 1;
            return jsonResponse(
              { error: { code: "DOCUMENT_SCANNER_UNAVAILABLE" } },
              503,
            );
          }
          const objectKey = url.searchParams.get("objectKey")!;
          const record = Array.from(caseAttachments.values()).find(
            (a) => a.object_key === objectKey,
          )!;
          const buf = Buffer.from(init?.body as Uint8Array);
          record.bytes = buf;
          return jsonResponse({
            data: {
              attachment_id: record.attachment_id,
              case_id: "CASE-STL-202603-001",
              checksum_sha256: createHash("sha256").update(buf).digest("hex"),
              file_size: buf.length,
              scan_state: "clean",
            },
          });
        }
        if (
          method === "POST" &&
          url.pathname ===
            "/control-plane-proxy/fleet-partner/cases/CASE-STL-202603-001/attachments/confirm"
        ) {
          const body = JSON.parse(String(init?.body || "{}"));
          const record = caseAttachments.get(body.attachmentId)!;
          record.state = "done";
          return jsonResponse({
            data: {
              attachment_id: record.attachment_id,
              case_id: "CASE-STL-202603-001",
              fleet_partner_id: caseFleetId,
              object_key: record.object_key,
              file_size: record.file_size,
              content_type: record.content_type,
              name: record.name,
              state: "done",
            },
          });
        }
        if (
          method === "GET" &&
          url.pathname.match(
            /^\/control-plane-proxy\/fleet-partner\/cases\/CASE-STL-202603-001\/attachments\/([^/]+)\/read-url$/,
          )
        ) {
          const attachmentId = url.pathname.split("/")[6]!;
          const record = caseAttachments.get(attachmentId)!;
          return jsonResponse({
            data: {
              authorized: true,
              attachment_id: attachmentId,
              name: record.name,
              expires_at: "2026-12-31T00:00:00.000Z",
              download_url: `${url.origin}/api/fleet-partner/cases/CASE-STL-202603-001/attachments/${attachmentId}/download?expiresAt=1798675200000&sig=valid_hmac_sig`,
            },
          });
        }
        if (
          method === "GET" &&
          (url.pathname.match(
            /^\/control-plane-proxy\/fleet-partner\/cases\/CASE-STL-202603-001\/attachments\/([^/]+)\/download$/,
          ) ||
            url.pathname.match(
              /^\/control-plane-proxy\/admin\/fleet-partners\/case-attachments\/CASE-STL-202603-001\/([^/]+)\/download$/,
            ))
        ) {
          const adminMatch = url.pathname.match(
            /^\/control-plane-proxy\/admin\/fleet-partners\/case-attachments\/CASE-STL-202603-001\/([^/]+)\/download$/,
          );
          const attachmentId = adminMatch
            ? adminMatch[1]!
            : url.pathname.split("/")[6]!;
          const record = caseAttachments.get(attachmentId)!;
          return new Response(new Uint8Array(record.bytes), {
            status: 200,
            headers: {
              "content-type": record.content_type,
              "x-drts-candidate-sha": "c125abc",
            },
          });
        }
        return jsonResponse({ error: { code: "NOT_FOUND" } }, 404);
      },
    );

    for (const mime of [
      "application/pdf",
      "image/png",
      "image/jpeg",
    ] as const) {
      const ext =
        mime === "application/pdf"
          ? "pdf"
          : mime === "image/png"
            ? "png"
            : "jpg";
      const ev = await uploadOperationalDocument(
        mockRequest,
        origin,
        "/control-plane-proxy/fleet-partner/cases/CASE-STL-202603-001/attachments/upload-url",
        {
          expectedFleetPartnerId: "fleet-demo-001",
          contentType: mime,
          originalFileName: `case-file.${ext}`,
        },
        "/control-plane-proxy/fleet-partner/cases/CASE-STL-202603-001/attachments/confirm",
        {
          contentType: mime,
          originalFileName: `case-file.${ext}`,
        },
        { Authorization: "Bearer tok" },
      );
      expect(ev.confirmCaseId).toBe("CASE-STL-202603-001");
      expect(ev.confirmFleetPartnerId).toBe("fleet-demo-001");
      expect(ev.confirmAttachmentState).toBe("done");
      expect(ev.canonicalReadbackStatus).toBe(200);
      expect(ev.readUrlStatus).toBe(200);
      expect(ev.readbackContentType).toBe(mime);
      expect(ev.readbackSha256).toBe(ev.sha256);

      const reviewerReadback = await downloadOperationalDocumentAsReviewer(
        adminOrigin,
        "DRTS_DEV_PLATFORM_ADMIN_BASE_URL",
        {
          kind: "case",
          caseId: "CASE-STL-202603-001",
          attachmentId: ev.attachmentId!,
        },
        {
          sha256: ev.sha256,
          fileSize: ev.fileSize,
          contentType: mime,
        },
      );
      expect(reviewerReadback.downloadStatus).toBe(200);
      expect(reviewerReadback.readbackSha256).toBe(ev.sha256);
    }

    // Closed case rejected before intent
    caseStatus = "closed";
    await expect(
      uploadOperationalDocument(
        mockRequest,
        origin,
        "/control-plane-proxy/fleet-partner/cases/CASE-STL-202603-001/attachments/upload-url",
        { expectedFleetPartnerId: "fleet-demo-001" },
        "/control-plane-proxy/fleet-partner/cases/CASE-STL-202603-001/attachments/confirm",
        {},
        { Authorization: "Bearer tok" },
      ),
    ).rejects.toThrow(/must be editable/);
    caseStatus = "open";

    // Platform responsibility rejected before intent
    caseResponsibility = "platform";
    await expect(
      uploadOperationalDocument(
        mockRequest,
        origin,
        "/control-plane-proxy/fleet-partner/cases/CASE-STL-202603-001/attachments/upload-url",
        { expectedFleetPartnerId: "fleet-demo-001" },
        "/control-plane-proxy/fleet-partner/cases/CASE-STL-202603-001/attachments/confirm",
        {},
        { Authorization: "Bearer tok" },
      ),
    ).rejects.toThrow(/must be fleet-editable/);
    caseResponsibility = "shared";

    // Foreign fleet case rejected before intent
    caseFleetId = "METRO_FLEET";
    await expect(
      uploadOperationalDocument(
        mockRequest,
        origin,
        "/control-plane-proxy/fleet-partner/cases/CASE-STL-202603-001/attachments/upload-url",
        { expectedFleetPartnerId: "fleet-demo-001" },
        "/control-plane-proxy/fleet-partner/cases/CASE-STL-202603-001/attachments/confirm",
        {},
        { Authorization: "Bearer tok" },
      ),
    ).rejects.toThrow(/must match expectedFleetPartnerId/);
  });

  it("resolves canonical editable Case for fleet-demo-001 and creates statement dispute case when none exists", async () => {
    let casesList: Array<Record<string, unknown>> = [
      {
        id: "CASE-CP-20260301-001",
        fleet_partner_id: "METRO_FLEET",
        status: "open",
        responsibility: "fleet",
      },
      {
        id: "CASE-CLOSED-001",
        fleet_partner_id: "fleet-demo-001",
        status: "closed",
        responsibility: "fleet",
      },
      {
        id: "CASE-OPEN-OWN-001",
        fleet_partner_id: "fleet-demo-001",
        status: "open",
        responsibility: "shared",
      },
    ];

    global.fetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        const method = init?.method || "GET";
        if (
          method === "GET" &&
          url.pathname === "/control-plane-proxy/fleet-partner/cases"
        ) {
          return jsonResponse({
            data: {
              items: casesList,
              page_info: {
                page: 1,
                page_size: Math.max(casesList.length, 20),
                total_items: casesList.length,
                total_pages: casesList.length > 0 ? 1 : 0,
              },
            },
          });
        }
        if (
          method === "GET" &&
          url.pathname === "/control-plane-proxy/driver-fee-plans"
        ) {
          return jsonResponse({
            data: {
              items: [
                {
                  fee_plan_id: "fee-plan-existing-001",
                  plan_name: "Existing Driver Fee Plan",
                  version: "v1",
                  status: "published",
                },
              ],
            },
          });
        }
        if (
          method === "GET" &&
          url.pathname === "/control-plane-proxy/fleet-partner/statements"
        ) {
          return jsonResponse({
            data: {
              items: [
                {
                  statement_id: "STL-2026-03-fleet-demo-001",
                  fleet_partner_id: "fleet-demo-001",
                },
              ],
              page_info: {
                page: 1,
                page_size: 20,
                total_items: 1,
                total_pages: 1,
              },
            },
          });
        }
        if (
          method === "POST" &&
          url.pathname ===
            "/control-plane-proxy/fleet-partner/statements/STL-2026-03-fleet-demo-001/dispute"
        ) {
          return jsonResponse({
            data: {
              dispute_case_id: "CASE-STL-2026-03-fleet-demo-001",
            },
          });
        }
        if (
          method === "GET" &&
          url.pathname ===
            "/control-plane-proxy/fleet-partner/cases/CASE-STL-2026-03-fleet-demo-001"
        ) {
          return jsonResponse({
            data: {
              case_detail: {
                id: "CASE-STL-2026-03-fleet-demo-001",
                fleet_partner_id: "fleet-demo-001",
                status: "open",
                responsibility: "shared",
              },
            },
          });
        }
        return jsonResponse({ error: { code: "NOT_FOUND" } }, 404);
      },
    );

    const existing = await resolveOperationalEditableCase(
      "DRTS_DEV_FLEET_PARTNER_PORTAL_BASE_URL",
      "fleet-demo-001",
    );
    expect(existing).toEqual({
      caseId: "CASE-OPEN-OWN-001",
      fleetPartnerId: "fleet-demo-001",
      status: "open",
      responsibility: "shared",
      resolution: "existing",
    });

    // When only foreign or closed cases exist, creates dispute case from fleet statement
    casesList = [
      {
        id: "CASE-CP-20260301-001",
        fleet_partner_id: "METRO_FLEET",
        status: "open",
        responsibility: "fleet",
      },
    ];
    const created = await resolveOperationalEditableCase(
      "DRTS_DEV_FLEET_PARTNER_PORTAL_BASE_URL",
      "fleet-demo-001",
    );
    expect(created).toEqual({
      caseId: "CASE-STL-2026-03-fleet-demo-001",
      fleetPartnerId: "fleet-demo-001",
      status: "open",
      responsibility: "shared",
      resolution: "created_from_statement_dispute",
      statementId: "STL-2026-03-fleet-demo-001",
    });
  });

  it("publishes an active driver fee plan via the official admin API when none exists yet, then completes the real case setup", async () => {
    let feePlanPublishCalls = 0;
    const casesList: Array<Record<string, unknown>> = [
      {
        id: "CASE-CP-20260301-001",
        fleet_partner_id: "METRO_FLEET",
        status: "open",
        responsibility: "fleet",
      },
    ];

    global.fetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        const method = init?.method || "GET";
        if (
          method === "GET" &&
          url.pathname === "/control-plane-proxy/fleet-partner/cases"
        ) {
          return jsonResponse({ data: { items: casesList } });
        }
        if (
          method === "GET" &&
          url.pathname === "/control-plane-proxy/driver-fee-plans"
        ) {
          return jsonResponse({ data: { items: [] } });
        }
        if (
          method === "POST" &&
          url.pathname === "/control-plane-proxy/driver-fee-plans/publish"
        ) {
          feePlanPublishCalls += 1;
          expect(JSON.parse(String(init?.body))).toMatchObject({
            planName: expect.any(String),
            version: expect.any(String),
          });
          return jsonResponse(
            {
              data: {
                fee_plan_id: "fee-plan-new-001",
                status: "published",
              },
            },
            201,
          );
        }
        if (
          method === "GET" &&
          url.pathname === "/control-plane-proxy/fleet-partner/statements"
        ) {
          return jsonResponse({
            data: {
              items: [
                {
                  statement_id: "STL-2026-03-fleet-demo-001",
                  fleet_partner_id: "fleet-demo-001",
                },
              ],
            },
          });
        }
        if (
          method === "POST" &&
          url.pathname ===
            "/control-plane-proxy/fleet-partner/statements/STL-2026-03-fleet-demo-001/dispute"
        ) {
          return jsonResponse({
            data: { dispute_case_id: "CASE-STL-2026-03-fleet-demo-001" },
          });
        }
        if (
          method === "GET" &&
          url.pathname ===
            "/control-plane-proxy/fleet-partner/cases/CASE-STL-2026-03-fleet-demo-001"
        ) {
          return jsonResponse({
            data: {
              case_detail: {
                id: "CASE-STL-2026-03-fleet-demo-001",
                fleet_partner_id: "fleet-demo-001",
                status: "open",
                responsibility: "shared",
              },
            },
          });
        }
        return jsonResponse({ error: { code: "NOT_FOUND" } }, 404);
      },
    );

    const resolved = await resolveOperationalEditableCase(
      "DRTS_DEV_FLEET_PARTNER_PORTAL_BASE_URL",
      "fleet-demo-001",
    );
    expect(feePlanPublishCalls).toBe(1);
    expect(resolved).toEqual({
      caseId: "CASE-STL-2026-03-fleet-demo-001",
      fleetPartnerId: "fleet-demo-001",
      status: "open",
      responsibility: "shared",
      resolution: "created_from_statement_dispute",
      statementId: "STL-2026-03-fleet-demo-001",
    });
  });

  it("surfaces the real error code and message when the statements lookup still fails after the fee plan precondition is confirmed", async () => {
    global.fetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        const method = init?.method || "GET";
        if (
          method === "GET" &&
          url.pathname === "/control-plane-proxy/fleet-partner/cases"
        ) {
          return jsonResponse({ data: { items: [] } });
        }
        if (
          method === "GET" &&
          url.pathname === "/control-plane-proxy/driver-fee-plans"
        ) {
          return jsonResponse({
            data: { items: [{ fee_plan_id: "fee-plan-existing-001" }] },
          });
        }
        if (
          method === "GET" &&
          url.pathname === "/control-plane-proxy/fleet-partner/statements"
        ) {
          return jsonResponse(
            {
              error: {
                code: "VALIDATION_ERROR",
                message:
                  "No eligible trips found for the requested statement period.",
              },
            },
            400,
          );
        }
        return jsonResponse({ error: { code: "NOT_FOUND" } }, 404);
      },
    );

    await expect(
      resolveOperationalEditableCase(
        "DRTS_DEV_FLEET_PARTNER_PORTAL_BASE_URL",
        "fleet-demo-001",
      ),
    ).rejects.toThrow(
      /returned 400 code=VALIDATION_ERROR message=No eligible trips found for the requested statement period\./,
    );
  });

  // C125-F2: resolveOperationalEditableCase must not abort when the first
  // candidate period's statement already carries a different, confirmed
  // decision (a legitimate STATEMENT_DECISION_CONFLICT on a real dispute
  // attempt) -- it must fall through to the next real candidate period
  // instead. Exercises the actual helper and its real HTTP contract; only
  // the network boundary is mocked.
  it("skips a confirmed March statement's real STATEMENT_DECISION_CONFLICT and creates the dispute case from the legal June statement", async () => {
    let marchDisputeAttempts = 0;
    let juneDisputeAttempts = 0;
    global.fetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        const method = init?.method || "GET";
        if (
          method === "GET" &&
          url.pathname === "/control-plane-proxy/fleet-partner/cases"
        ) {
          return jsonResponse({ data: { items: [] } });
        }
        if (
          method === "GET" &&
          url.pathname === "/control-plane-proxy/driver-fee-plans"
        ) {
          return jsonResponse({
            data: { items: [{ fee_plan_id: "fee-plan-existing-001" }] },
          });
        }
        if (
          method === "GET" &&
          url.pathname === "/control-plane-proxy/fleet-partner/statements" &&
          url.searchParams.get("periodMonth") === "2026-03"
        ) {
          return jsonResponse({
            data: {
              items: [
                {
                  statement_id: "STL-2026-03-fleet-demo-001",
                  fleet_partner_id: "fleet-demo-001",
                },
              ],
            },
          });
        }
        if (
          method === "POST" &&
          url.pathname ===
            "/control-plane-proxy/fleet-partner/statements/STL-2026-03-fleet-demo-001/dispute"
        ) {
          marchDisputeAttempts += 1;
          // March was already confirmed by a real prior decision; a real
          // dispute attempt on it genuinely conflicts.
          return jsonResponse(
            {
              error: {
                code: "STATEMENT_DECISION_CONFLICT",
                message: "This statement already has a different decision.",
              },
            },
            409,
          );
        }
        if (
          method === "GET" &&
          url.pathname === "/control-plane-proxy/fleet-partner/statements" &&
          url.searchParams.get("periodMonth") === "2026-06"
        ) {
          return jsonResponse({
            data: {
              items: [
                {
                  statement_id: "STL-2026-06-fleet-demo-001",
                  fleet_partner_id: "fleet-demo-001",
                },
              ],
            },
          });
        }
        if (
          method === "POST" &&
          url.pathname ===
            "/control-plane-proxy/fleet-partner/statements/STL-2026-06-fleet-demo-001/dispute"
        ) {
          juneDisputeAttempts += 1;
          return jsonResponse({
            data: { dispute_case_id: "CASE-STL-2026-06-fleet-demo-001" },
          });
        }
        if (
          method === "GET" &&
          url.pathname ===
            "/control-plane-proxy/fleet-partner/cases/CASE-STL-2026-06-fleet-demo-001"
        ) {
          return jsonResponse({
            data: {
              case_detail: {
                id: "CASE-STL-2026-06-fleet-demo-001",
                fleet_partner_id: "fleet-demo-001",
                status: "open",
                responsibility: "shared",
              },
            },
          });
        }
        return jsonResponse({ error: { code: "NOT_FOUND" } }, 404);
      },
    );

    const resolved = await resolveOperationalEditableCase(
      "DRTS_DEV_FLEET_PARTNER_PORTAL_BASE_URL",
      "fleet-demo-001",
    );
    expect(marchDisputeAttempts).toBe(1);
    expect(juneDisputeAttempts).toBe(1);
    expect(resolved).toEqual({
      caseId: "CASE-STL-2026-06-fleet-demo-001",
      fleetPartnerId: "fleet-demo-001",
      status: "open",
      responsibility: "shared",
      resolution: "created_from_statement_dispute",
      statementId: "STL-2026-06-fleet-demo-001",
    });
  });

  // Negative control for the same real helper: a genuine (non-conflict)
  // dispute failure on the first candidate period must still abort with its
  // real error code/message, not be swallowed as if it were an expected
  // "try the next period" outcome.
  it("still propagates a real non-conflict dispute failure on the first candidate period instead of silently trying the next one", async () => {
    let juneStatementsRequested = false;
    global.fetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        const method = init?.method || "GET";
        if (
          method === "GET" &&
          url.pathname === "/control-plane-proxy/fleet-partner/cases"
        ) {
          return jsonResponse({ data: { items: [] } });
        }
        if (
          method === "GET" &&
          url.pathname === "/control-plane-proxy/driver-fee-plans"
        ) {
          return jsonResponse({
            data: { items: [{ fee_plan_id: "fee-plan-existing-001" }] },
          });
        }
        if (
          method === "GET" &&
          url.pathname === "/control-plane-proxy/fleet-partner/statements" &&
          url.searchParams.get("periodMonth") === "2026-03"
        ) {
          return jsonResponse({
            data: {
              items: [
                {
                  statement_id: "STL-2026-03-fleet-demo-001",
                  fleet_partner_id: "fleet-demo-001",
                },
              ],
            },
          });
        }
        if (
          method === "POST" &&
          url.pathname ===
            "/control-plane-proxy/fleet-partner/statements/STL-2026-03-fleet-demo-001/dispute"
        ) {
          return jsonResponse(
            {
              error: {
                code: "STATEMENT_ALREADY_PAID",
                message: "Paid statements cannot receive a new decision.",
              },
            },
            409,
          );
        }
        if (
          method === "GET" &&
          url.pathname === "/control-plane-proxy/fleet-partner/statements" &&
          url.searchParams.get("periodMonth") === "2026-06"
        ) {
          juneStatementsRequested = true;
          return jsonResponse({ data: { items: [] } });
        }
        return jsonResponse({ error: { code: "NOT_FOUND" } }, 404);
      },
    );

    await expect(
      resolveOperationalEditableCase(
        "DRTS_DEV_FLEET_PARTNER_PORTAL_BASE_URL",
        "fleet-demo-001",
      ),
    ).rejects.toThrow(
      /must succeed, got 409 code=STATEMENT_ALREADY_PAID message=Paid statements cannot receive a new decision\./,
    );
    expect(juneStatementsRequested).toBe(false);
  });

  it("verifies backend role sessions, rejects spoofed identity headers, and executes cross-role denial probes", async () => {
    const apiOrigin = "https://api.example.invalid";
    vi.stubEnv("DRTS_OPERATIONAL_API_URL", apiOrigin);
    vi.stubEnv(
      "DRTS_OPERATIONAL_API_ID_TOKEN",
      "api-cloud-run-invocation-token",
    );
    vi.stubEnv(
      "DRTS_OPERATIONAL_FOREIGN_FLEET_SESSION_TOKEN",
      "foreign-fleet-session-token",
    );
    vi.stubEnv(
      "DRTS_OPERATIONAL_TENANT_SESSION_TOKEN",
      "tenant-admin-session-token",
    );
    vi.stubEnv(
      "DRTS_OPERATIONAL_DISPATCH_SESSION_TOKEN",
      "tenant-ops-session-token",
    );
    vi.stubEnv("DRTS_OPERATIONAL_DRIVER_SESSION_TOKEN", "driver-session-token");
    vi.stubEnv(
      "DRTS_OPERATIONAL_OPS_NON_REVIEWER_SESSION_TOKEN",
      "ops-non-reviewer-session-token",
    );
    vi.stubEnv("DRTS_OPERATIONAL_SYSTEM_SESSION_TOKEN", "system-session-token");

    // Reject spoofed headers on both standard and role header builders
    for (const spoofHeader of [
      "x-realm",
      "x-roles",
      "x-role-families",
      "x-actor-id",
      "x-actor-type",
      "x-scopes",
      "x-auth-mode",
    ]) {
      expect(() =>
        operationalRequestHeaders(
          "DRTS_DEV_FLEET_PARTNER_PORTAL_BASE_URL",
          origin,
          { [spoofHeader]: "spoofed" },
        ),
      ).toThrow(/Spoofed identity header/);
      expect(() =>
        operationalReviewerRequestHeaders(
          "DRTS_DEV_PLATFORM_ADMIN_BASE_URL",
          adminOrigin,
          { [spoofHeader]: "spoofed" },
        ),
      ).toThrow(/Spoofed identity header/);
      expect(() =>
        operationalRoleRequestHeaders(
          "foreign_fleet",
          "DRTS_DEV_FLEET_PARTNER_PORTAL_BASE_URL",
          origin,
          { [spoofHeader]: "spoofed" },
        ),
      ).toThrow(/Spoofed identity header/);
    }

    global.fetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        const headers = new Headers(init?.headers);
        const appAuth = headers.get("x-drts-authorization") || "";

        if (
          url.origin === origin &&
          url.pathname === "/control-plane-proxy/auth/session" &&
          appAuth !== "Bearer own-fleet-session-token"
        ) {
          return jsonResponse(
            { error: { code: "FLEET_PARTNER_AUTHORITY_REQUIRED" } },
            403,
          );
        }

        if (
          (url.origin === apiOrigin && url.pathname === "/api/auth/session") ||
          (url.origin === origin &&
            url.pathname === "/control-plane-proxy/auth/session")
        ) {
          if (appAuth === "Bearer own-fleet-session-token") {
            return jsonResponse({
              data: {
                active: true,
                identity: {
                  realm: "partner",
                  actorType: "partner_user",
                  partnerId: "fleet-demo-001",
                  roles: ["fleet_admin"],
                },
              },
            });
          }
          if (appAuth === "Bearer foreign-fleet-session-token") {
            return jsonResponse({
              data: {
                active: true,
                identity: {
                  realm: "partner",
                  actorType: "partner_user",
                  partnerId: "METRO_FLEET",
                  roles: ["fleet_admin"],
                },
              },
            });
          }
          if (appAuth === "Bearer platform-reviewer-session-token") {
            return jsonResponse({
              data: {
                active: true,
                identity: {
                  realm: "platform",
                  actorType: "platform_admin",
                  roles: ["platform_reviewer"],
                },
              },
            });
          }
          if (appAuth === "Bearer tenant-admin-session-token") {
            return jsonResponse({
              data: {
                active: true,
                identity: {
                  realm: "tenant",
                  actorType: "tenant_admin",
                  roles: ["tenant_admin"],
                },
              },
            });
          }
          if (appAuth === "Bearer tenant-ops-session-token") {
            return jsonResponse({
              data: {
                active: true,
                identity: {
                  realm: "tenant",
                  actorType: "tenant_admin",
                  roles: ["tenant_ops_admin"],
                },
              },
            });
          }
          if (appAuth === "Bearer driver-session-token") {
            return jsonResponse({
              data: {
                active: true,
                identity: {
                  realm: "driver",
                  actorType: "driver",
                  roles: ["driver"],
                },
              },
            });
          }
          if (appAuth === "Bearer ops-non-reviewer-session-token") {
            return jsonResponse({
              data: {
                active: true,
                identity: {
                  realm: "ops",
                  actorType: "ops_user",
                  roles: ["ops_user"],
                },
              },
            });
          }
          if (appAuth === "Bearer system-session-token") {
            return jsonResponse({
              data: {
                active: true,
                identity: {
                  realm: "system",
                  actorType: "system",
                  roles: ["system"],
                },
              },
            });
          }
          return jsonResponse({ error: { code: "UNAUTHENTICATED" } }, 401);
        }

        // Business endpoints: only own_fleet on fleet-partner routes or platform_reviewer on admin routes allowed
        if (
          !appAuth ||
          appAuth === "Bearer invalid.operational.session.token"
        ) {
          return jsonResponse(
            { error: { code: "AUTHENTICATION_REQUIRED" } },
            401,
          );
        }
        const isAdminReviewerRoute = url.pathname.startsWith(
          "/control-plane-proxy/admin/fleet-partners/",
        );
        if (isAdminReviewerRoute) {
          if (appAuth === "Bearer platform-reviewer-session-token") {
            return jsonResponse({ data: { ok: true } }, 200);
          }
          return jsonResponse(
            { error: { code: "DOCUMENT_REVIEW_DENIED" } },
            403,
          );
        }
        if (appAuth === "Bearer foreign-fleet-session-token") {
          return jsonResponse(
            { error: { code: "SUPPLY_SUBMISSION_NOT_FOUND" } },
            404,
          );
        }
        if (appAuth === "Bearer own-fleet-session-token") {
          return jsonResponse({ data: { ok: true } }, 200);
        }
        return jsonResponse({ error: { code: "FORBIDDEN" } }, 403);
      },
    );

    const recorded: Array<Record<string, unknown>> = [];
    const acceptance: DocumentAcceptanceManifest = {
      id: "role-matrix-unit",
      surface: "fleet",
      baseUrlEnv: "DRTS_DEV_FLEET_PARTNER_PORTAL_BASE_URL",
      actorScope: "cross-role",
      setup: [
        {
          kind: "role-access-probe",
          role: "own_fleet",
          path: "/control-plane-proxy/fleet-partner/supply-submissions/sub-1",
          method: "GET",
          expectedStatus: 200,
        },
        {
          kind: "role-access-probe",
          baseUrlEnv: "DRTS_DEV_PLATFORM_ADMIN_BASE_URL",
          role: "own_fleet",
          verifySession: false,
          path: "/control-plane-proxy/admin/fleet-partners/supply-documents/sub-1/doc-1/download",
          method: "GET",
          expectedStatus: 403,
          expectedErrorCode: "DOCUMENT_REVIEW_DENIED",
        },
        {
          kind: "role-access-probe",
          baseUrlEnv: "DRTS_DEV_PLATFORM_ADMIN_BASE_URL",
          role: "platform_reviewer",
          path: "/control-plane-proxy/admin/fleet-partners/supply-documents/sub-1/doc-1/download",
          method: "GET",
          expectedStatus: 200,
        },
        {
          kind: "role-access-probe",
          role: "foreign_fleet",
          path: "/control-plane-proxy/fleet-partner/supply-submissions/sub-1/documents/doc-1/download",
          method: "GET",
          expectedStatus: [403, 404],
          expectedErrorCode: "SUPPLY_SUBMISSION_NOT_FOUND",
        },
        {
          kind: "role-access-probe",
          role: "tenant_admin",
          path: "/control-plane-proxy/fleet-partner/cases/CASE-1/attachments/att-1/read-url",
          method: "GET",
          expectedStatus: 403,
          expectedErrorCode: "FORBIDDEN",
        },
        {
          kind: "role-access-probe",
          role: "tenant_ops",
          path: "/control-plane-proxy/fleet-partner/cases/CASE-1/attachments/att-1/read-url",
          method: "GET",
          expectedStatus: 403,
          expectedErrorCode: "FORBIDDEN",
        },
        {
          kind: "role-access-probe",
          role: "driver",
          path: "/control-plane-proxy/fleet-partner/cases/CASE-1/attachments/att-1/read-url",
          method: "GET",
          expectedStatus: 403,
          expectedErrorCode: "FORBIDDEN",
        },
        {
          kind: "role-access-probe",
          role: "ops_non_reviewer",
          path: "/control-plane-proxy/fleet-partner/cases/CASE-1/attachments/att-1/read-url",
          method: "GET",
          expectedStatus: 403,
          expectedErrorCode: "FORBIDDEN",
        },
        {
          kind: "role-access-probe",
          baseUrlEnv: "DRTS_DEV_PLATFORM_ADMIN_BASE_URL",
          role: "ops_non_reviewer",
          verifySession: false,
          path: "/control-plane-proxy/admin/fleet-partners/case-attachments/CASE-1/att-1/download",
          method: "GET",
          expectedStatus: 403,
          expectedErrorCode: "DOCUMENT_REVIEW_DENIED",
        },
        {
          kind: "role-access-probe",
          role: "system",
          path: "/control-plane-proxy/fleet-partner/cases/CASE-1/attachments/att-1/read-url",
          method: "GET",
          expectedStatus: 403,
          expectedErrorCode: "FORBIDDEN",
        },
        {
          kind: "role-access-probe",
          role: "unauthenticated",
          path: "/control-plane-proxy/fleet-partner/cases/CASE-1/attachments/att-1/read-url",
          method: "GET",
          expectedStatus: 401,
          expectedErrorCode: "AUTHENTICATION_REQUIRED",
        },
        {
          kind: "role-access-probe",
          role: "invalid_session",
          path: "/control-plane-proxy/fleet-partner/cases/CASE-1/attachments/att-1/read-url",
          method: "GET",
          expectedStatus: 401,
          expectedErrorCode: "AUTHENTICATION_REQUIRED",
        },
      ],
    };

    await runOperationalDocumentAcceptance(
      { request: mockRequest, record: (entry) => recorded.push(entry) },
      acceptance,
      {},
    );
    expect(recorded).toHaveLength(12);
    expect(recorded.map((r) => r.role)).toEqual([
      "own_fleet",
      "own_fleet",
      "platform_reviewer",
      "foreign_fleet",
      "tenant_admin",
      "tenant_ops",
      "driver",
      "ops_non_reviewer",
      "ops_non_reviewer",
      "system",
      "unauthenticated",
      "invalid_session",
    ]);

    const directProbe = await probeOperationalDocumentRoleAccess({
      kind: "role-access-probe",
      role: "foreign_fleet",
      verifySession: false,
      path: "/control-plane-proxy/fleet-partner/cases/CASE-1/attachments/content?objectKey=fleet-partner/fleet-demo-001/cases/CASE-1/att-1-file.pdf",
      method: "PUT",
      rawBodyContentType: "application/pdf",
      expectedStatus: [403, 404],
    });
    expect(directProbe.status).toBe(404);

    // Missing session token fails closed without faking success
    vi.stubEnv("DRTS_OPERATIONAL_DRIVER_SESSION_TOKEN", "");
    await expect(
      verifyOperationalRoleSession(
        "driver",
        "DRTS_DEV_FLEET_PARTNER_PORTAL_BASE_URL",
      ),
    ).rejects.toThrow(/requires a verified backend session token/);
  });
});

// External HTTP ports only are simulated. These execute the real issuer and
// Ops evidence helpers; no browser, server, JWT issuer or database is started.
describe("original referral first-visit issuer and canonical zero-order evidence", () => {
  const sha = "a".repeat(40);
  const origin = "https://api.example.invalid";
  const entry = {
    entry_slug: "yuhe-residence",
    entry_host: "host.example.invalid",
    tenant_id: "tenant-RAM",
    partner_id: "partner-RAM",
    program_id: "program-RAM",
  };
  const issued = {
    handoff_id: "ref_handoff_00000000-0000-4000-8000-000000000001",
    artifact: "x".repeat(32),
    token_type: "SingleUse",
    expires_in: "120s",
    expires_at: "2099-01-01T00:00:00Z",
    partner_entry_slug: entry.entry_slug,
    entry_host: entry.entry_host,
    drts_passenger_id: "passenger-RAM",
    consent_required: true,
    consent_bundle_version: null,
  };
  const subject = {
    drtsPassengerId: issued.drts_passenger_id,
    tenantId: entry.tenant_id,
    partnerId: entry.partner_id,
    partnerProgramId: entry.program_id,
    entrySlug: entry.entry_slug,
    entryHost: entry.entry_host,
  };
  const row = {
    order_id: "private-unrelated-order",
    passenger: { passenger_id: "other-person", name: "private-name" },
    tenant_id: entry.tenant_id,
    partner_id: entry.partner_id,
    partner_program_id: entry.program_id,
    partner_entry_slug: entry.entry_slug,
  };
  beforeEach(() => {
    vi.stubEnv("DRTS_CANDIDATE_SHA", sha);
    vi.stubEnv("DRTS_DEV_API_BASE_URL", origin);
    vi.stubEnv("DRTS_OPERATIONAL_API_ID_TOKEN", "WIF-RAM");
    vi.stubEnv("DRTS_OPERATIONAL_OPS_NON_REVIEWER_SESSION_TOKEN", "OPS-RAM");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  function ports(
    change: {
      entry?: unknown;
      issued?: unknown;
      orders?: unknown;
      orderStatus?: number;
      orderSha?: string;
      sessionStatus?: number;
      sessionSha?: string;
      identity?: Record<string, unknown>;
    } = {},
  ) {
    const calls: Array<{ path: string; options: RequestInit }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, options: RequestInit) => {
        const url = new URL(input);
        expect(url.origin).toBe(origin);
        expect(options.redirect).toBe("manual");
        calls.push({ path: url.pathname, options });
        const reply = (data: unknown, status = 200, candidate = sha) =>
          new Response(JSON.stringify({ data }), {
            status,
            headers: {
              "x-drts-candidate-sha": candidate,
              "content-type": "application/json",
            },
          });
        if (url.pathname === "/api/partner/entries/yuhe-residence")
          return reply(change.entry ?? entry);
        if (url.pathname === "/api/partner/ingress/referral-embed-handoff")
          return reply(change.issued ?? issued);
        if (url.pathname === "/api/auth/session")
          return reply(
            {
              active: true,
              identity: {
                realm: "ops",
                actor_type: "ops_user",
                actor_id: "ops-RAM",
                roles: ["ops_user"],
                scopes: ["owned:read"],
                ...change.identity,
              },
            },
            change.sessionStatus,
            change.sessionSha,
          );
        if (url.pathname === "/api/orders")
          return reply(
            change.orders ?? { items: [row] },
            change.orderStatus,
            change.orderSha,
          );
        throw new Error("unexpected external port");
      }),
    );
    return calls;
  }
  it("uses one fresh synthetic issuer subject, separate WIF/issuer proof, and independently verified Ops before/after counts", async () => {
    const calls = ports();
    const first = await prepareOperationalReferralHandoff(
      entry.entry_slug,
      entry.entry_host,
    );
    await prepareOperationalReferralHandoff(entry.entry_slug, entry.entry_host);
    expect(first.subject).toEqual(subject);
    const issueCalls = calls.filter((call) => call.path.endsWith("handoff"));
    const commands = issueCalls.map((call) =>
      JSON.parse(String(call.options.body)),
    );
    expect(commands[0]).toEqual({
      entrySlug: entry.entry_slug,
      entryHost: entry.entry_host,
      partnerUserRef: expect.stringMatching(
        /^operational-refusal-[0-9a-f-]{36}$/,
      ),
      consentBundle: null,
    });
    expect(commands[0].partnerUserRef).not.toBe(commands[1].partnerUserRef);
    expect(issueCalls[0]!.options.headers).toMatchObject({
      Authorization: "Bearer WIF-RAM",
      "x-drts-google-id-token": "WIF-RAM",
    });
    const before = await observeOperationalReferralZeroOrders(
      first.subject,
      "before-refusal",
    );
    const after = await observeOperationalReferralZeroOrders(
      first.subject,
      "after-refusal",
    );
    expect(before.subjectKey).toBe(after.subjectKey);
    expect(before).toMatchObject({
      count: 0,
      status: 200,
      sessionStatus: 200,
      durableSourceProof: "pending-original-deployment-record",
    });
    expect(calls.slice(-4).map(({ path }) => path)).toEqual([
      "/api/auth/session",
      "/api/orders",
      "/api/auth/session",
      "/api/orders",
    ]);
    for (const { options } of calls.slice(-4)) {
      expect(options.headers).toEqual({
        Authorization: "Bearer WIF-RAM",
        "x-drts-authorization": "Bearer OPS-RAM",
      });
      expect(options.method).toBe("GET");
    }
    expect(JSON.stringify([before, after])).not.toMatch(
      /RAM|private|other-person|WIF|OPS/,
    );
  });
  it.each([
    ["missing passenger", { drts_passenger_id: undefined }],
    ["missing handoff", { handoff_id: undefined }],
    ["wrong entry", { partner_entry_slug: "other" }],
    ["wrong host", { entry_host: "other" }],
    ["active consent", { consent_required: false }],
    ["bundle", { consent_bundle_version: "unsafe" }],
    ["missing artifact", { artifact: undefined }],
    ["expired", { expires_at: "2000-01-01" }],
    ["wrong type", { token_type: "Bearer" }],
  ])("rejects issuer %s", async (_label, fields) => {
    ports({ issued: { ...issued, ...fields } });
    await expect(
      prepareOperationalReferralHandoff(entry.entry_slug, entry.entry_host),
    ).rejects.toThrow("issuance contract invalid");
  });
  it.each([
    { tenant_id: undefined },
    { partner_id: undefined },
    { program_id: undefined },
    { entry_slug: "other" },
    { entry_host: "other" },
  ])("rejects missing/changed canonical entry binding %j", async (fields) => {
    const calls = ports({ entry: { ...entry, ...fields } });
    await expect(
      prepareOperationalReferralHandoff(entry.entry_slug, entry.entry_host),
    ).rejects.toThrow("entry binding invalid");
    expect(calls).toHaveLength(1);
  });
  it.each([
    {
      label: "nonzero",
      orders: {
        items: [
          { ...row, passenger: { passenger_id: subject.drtsPassengerId } },
        ],
      },
    },
    {
      label: "wrong-scope subject order",
      orders: {
        items: [
          {
            ...row,
            tenant_id: "other",
            partner_entry_slug: "other",
            passenger: { passenger_id: subject.drtsPassengerId },
          },
        ],
      },
    },
    { label: "missing list", orders: {} },
    { label: "null list", orders: { items: null } },
    { label: "partial", orders: { items: [], page_info: { total_items: 2 } } },
    { label: "malformed row", orders: { items: [null] } },
    {
      label: "missing row owner",
      orders: { items: [{ ...row, passenger: {} }] },
    },
    {
      label: "missing tenant",
      orders: { items: [{ ...row, tenant_id: undefined }] },
    },
    { label: "orders non-200", orderStatus: 403 },
    { label: "orders wrong SHA", orderSha: "b".repeat(40) },
    { label: "session rejected", sessionStatus: 401 },
    { label: "session wrong SHA", sessionSha: "b".repeat(40) },
    { label: "missing owned:read", identity: { scopes: ["owned:write"] } },
    {
      label: "wrong role",
      identity: { realm: "driver", actor_type: "driver", roles: ["driver"] },
    },
  ])("fails closed on canonical $label", async (change) => {
    ports(change);
    await expect(
      observeOperationalReferralZeroOrders(subject, "before-refusal"),
    ).rejects.toThrow();
  });
  it("rejects missing credentials, invalid candidate and absent issued subject without exposing transport data", async () => {
    ports();
    vi.stubEnv("DRTS_OPERATIONAL_API_ID_TOKEN", "");
    await expect(
      prepareOperationalReferralHandoff(entry.entry_slug, entry.entry_host),
    ).rejects.toThrow("WIF");
    vi.stubEnv("DRTS_OPERATIONAL_API_ID_TOKEN", "WIF-RAM");
    vi.stubEnv("DRTS_OPERATIONAL_OPS_NON_REVIEWER_SESSION_TOKEN", "");
    await expect(
      observeOperationalReferralZeroOrders(subject, "after-refusal"),
    ).rejects.toThrow("requires a verified backend session");
    vi.stubEnv("DRTS_OPERATIONAL_OPS_NON_REVIEWER_SESSION_TOKEN", "OPS-RAM");
    vi.stubEnv("DRTS_CANDIDATE_SHA", "");
    await expect(
      prepareOperationalReferralHandoff(entry.entry_slug, entry.entry_host),
    ).rejects.toThrow("immutable candidate");
    vi.stubEnv("DRTS_CANDIDATE_SHA", sha);
    await expect(
      observeOperationalReferralZeroOrders(
        { ...subject, drtsPassengerId: "" },
        "after-refusal",
      ),
    ).rejects.toThrow("subject binding missing");
    vi.stubGlobal("fetch", async () => {
      throw new Error("secret artifact WIF-RAM private-name");
    });
    await expect(
      prepareOperationalReferralHandoff(entry.entry_slug, entry.entry_host),
    ).rejects.toThrow(
      /^Referral evidence GET \/api\/partner\/entries\/yuhe-residence failed$/,
    );
  });
});
