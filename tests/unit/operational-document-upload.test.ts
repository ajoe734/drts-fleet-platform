import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { uploadOperationalDocument, runSetup } from "../e2e/operational-document-upload";
import { type APIRequestContext } from "@playwright/test";
import { createHash } from "node:crypto";
import journeysData from "../e2e/fixtures/operational-browser-journeys.json";

function checkActualPdf(bytes: Buffer) {
  const text = bytes.toString('ascii');
  expect(text.startsWith('%PDF-')).toBe(true);
  const sx = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(text);
  expect(sx).toBeTruthy();
  const xrefOffset = Number(sx![1]);
  expect(text.slice(xrefOffset, xrefOffset + 4)).toBe('xref');
  const xref = /^xref\s+0\s+(\d+)\s*\n([\s\S]*?)trailer\s*\n/.exec(text.slice(xrefOffset));
  expect(xref).toBeTruthy();
  const entries = (xref![2] || '').trim().split(/\r?\n/);
  expect(entries.length).toBe(Number(xref![1]));
  expect(entries[0]).toMatch(/^0000000000 65535 f/);
  for (let i = 1; i < entries.length; i++) {
    const entryStr = entries[i] || '';
    const entry = /^(\d{10}) (\d{5}) n/.exec(entryStr);
    expect(entry).toBeTruthy();
    const offset = Number(entry![1]);
    expect(text.slice(offset, offset + `${i} 0 obj`.length)).toBe(`${i} 0 obj`);
    expect(offset).toBeLessThan(xrefOffset);
  }
  expect(text).toMatch(/\/Type\s*\/Catalog\s*\/Pages\s+2\s+0\s+R/);
  expect(text).toMatch(/\/Type\s*\/Pages\s*\/Kids\s*\[3\s+0\s+R\]\s*\/Count\s+1/);
  expect(text).toMatch(/\/Type\s*\/Page\s*\/Parent\s+2\s+0\s+R\s*\/MediaBox\s*\[0\s+0\s+72\s+72\]/);
  expect(text.slice(xrefOffset)).toMatch(/\/Size\s+4\s*\/Root\s+1\s+0\s+R/);
  return { length: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), xrefOffset, objectCount: entries.length - 1 };
}

function jsonResponse(body: any, status = 200, extraHeaders: Record<string, string> = {}) {
  const responseHeaders = new Headers({ 'content-type': 'application/json', 'x-drts-candidate-sha': process.env.DRTS_CANDIDATE_SHA || 'mock-candidate-sha', ...extraHeaders });
  const bodyBuffer = Buffer.from(JSON.stringify(body));
  return {
    status,
    headers: responseHeaders,
    json: async () => body,
    url: () => 'mock-url',
    body: {
      getReader: () => {
        let done = false;
        return {
          read: async () => {
            if (done) return { done: true };
            done = true;
            return { done: false, value: bodyBuffer };
          },
          cancel: () => {}
        };
      }
    }
  } as any;
}

function pdfResponse(bytes: Buffer, status = 200, extraHeaders: Record<string, string> = {}) {
  const responseHeaders = new Headers({ 'content-type': 'application/pdf', 'x-drts-candidate-sha': process.env.DRTS_CANDIDATE_SHA || 'mock-candidate-sha', ...extraHeaders });
  return {
    status,
    headers: responseHeaders,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    url: () => 'mock-url',
    body: {
      getReader: () => {
        let done = false;
        return {
          read: async () => {
            if (done) return { done: true };
            done = true;
            return { done: false, value: bytes };
          },
          cancel: () => {}
        };
      }
    }
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
  parent = "/control-plane-proxy/fleet-partner/supply-submissions/sub-setup-123";
  fleet = "fleet-setup-123";
  runId = "socket-free-dummy-run";

  explicitAuthorization = false;
  expectedAuth = "Bearer fleet-dummy-id-token";

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

    putMethod: 'PUT',
    putMissingCandidateSha: false,
    putOversized: false,
    put503Count: 0,
    put503Delay: 0,
    put503ErrorCode: 'DOCUMENT_SCANNER_UNAVAILABLE',
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
      const method = init.method || 'GET';
      const headers = new Headers(init.headers);
      const body = init.data !== undefined ? init.data : typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
      const bytes = method === 'PUT' ? Buffer.from(init.body || []) : undefined;

      this.calls.push({
        method,
        url: url.toString(),
        pathname: url.pathname,
        search: url.search,
        query: Object.fromEntries(url.searchParams.entries()),
        headers: Object.fromEntries(headers.entries()),
        data: body,
        bytes,
        ioBoundary: init.ioBoundary || 'raw-fetch',
        authSource: this.explicitAuthorization ? 'explicit' : 'fleet-env'
      });

      if (this.mutations.intentForeignUrl && this.calls.length === 1) {
        // foreign intent URL check bypass for initial call
      } else {
        expect(url.origin).toBe(this.origin);
      }

      if (this.mutations.missingIntentAuth) {
        // skip auth check
      } else {
        expect(headers.get('authorization')).toBe(this.expectedAuth);
      }

      if (url.pathname === '/control-plane-proxy/fleet-partner/supply-submissions/drivers' && method === 'POST') {
        return jsonResponse({ data: { submission: { submission_id: 'sub-setup-123', fleet_partner_id: this.fleet, revision_no: this.revision } } });
      }

      if (url.pathname === this.parent && method === 'GET') {
        if (this.mutations.authorityStatus !== 200) {
          return jsonResponse({ error: 'Authority failed' }, this.mutations.authorityStatus);
        }
        return jsonResponse(
          { data: { submission: { submission_id: 'sub-setup-123', fleet_partner_id: this.fleet, revision_no: this.revision } } },
          200,
          this.mutations.authorityMissingCandidateSha ? { 'x-drts-candidate-sha': '' } : {}
        );
      }

      if (url.pathname === this.parent + '/documents/upload-url') {
        if (this.mutations.intentWrongMethod) {
          expect(method).toBe('GET');
        } else {
          expect(method).toBe('POST');
        }

        if (this.mutations.intentStatus !== 200) {
          return jsonResponse({ error: 'Intent failed' }, this.mutations.intentStatus);
        }

        if (body?.expectedRevisionNo !== undefined) {
          expect(body.expectedRevisionNo).toBe(this.revision);
        }

        this.active = { objectKey: `fleet-partner/${this.fleet}/supply-submissions/sub-setup-123/${body.documentType}.pdf`, documentType: body.documentType, documentId: `doc-${this.documents.length + 1}` };
        const returned = new URL(this.parent.replace(/^\/control-plane-proxy\//, '/api/') + '/documents/content', this.origin);
        returned.searchParams.set('objectKey', this.active.objectKey);

        return jsonResponse(
          { data: { object_key: this.active.objectKey, upload_url: returned.pathname + returned.search, method: this.mutations.putMethod, headers: { 'content-type': 'application/octet-stream' }, submission_id: 'sub-setup-123' } },
          200,
          this.mutations.intentMissingCandidateSha ? { 'x-drts-candidate-sha': '' } : {}
        );
      }

      if (url.pathname === this.parent + '/documents/content') {
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
            await new Promise((resolve) => setTimeout(resolve, this.mutations.put503Delay));
          }
          return jsonResponse(
            { error: { code: this.mutations.put503ErrorCode } },
            503,
            this.mutations.putMissingCandidateSha ? { 'x-drts-candidate-sha': '' } : {}
          );
        }

        if (this.mutations.putReceiptMissing) {
          return jsonResponse({}, 200, this.mutations.putMissingCandidateSha ? { 'x-drts-candidate-sha': '' } : {});
        }

        this.documents.push({ ...this.active, structure });

        if (this.mutations.advanceTimeAfterPut > 0) {
          vi.advanceTimersByTime(this.mutations.advanceTimeAfterPut);
        }

        return jsonResponse({
          data: {
            checksum_sha256: this.mutations.putReceiptWrongHash ? 'wrong-hash' : this.hash,
            file_size: this.mutations.putReceiptWrongSize ? 999999 : this.bytes.length,
            scan_state: this.mutations.putReceiptUnclean ? 'infected' : 'clean'
          }
        }, 200, this.mutations.putMissingCandidateSha ? { 'x-drts-candidate-sha': '' } : {});
      }

      if (url.pathname === this.parent + '/documents/confirm') {
        if (this.mutations.confirmMissing) {
          return jsonResponse({}, 200, this.mutations.confirmMissingCandidateSha ? { 'x-drts-candidate-sha': '' } : {});
        }
        if (this.mutations.confirmTerminal500) {
          return jsonResponse({ error: 'Terminal' }, 500);
        }
        if (this.mutations.confirmStatus !== 200) {
          return jsonResponse({ error: 'Confirm status failed' }, this.mutations.confirmStatus);
        }

        this.revision++;
        return jsonResponse({
          data: {
            document_id: this.mutations.confirmWrongId ? 'invalid/segment/id' : (this.active?.documentId || 'doc-1'),
            file_object_key: this.mutations.confirmWrongKey ? 'wrong-key' : this.active?.objectKey,
            checksum_sha256: this.mutations.confirmWrongHash ? 'wrong-hash' : this.hash,
            file_size: this.mutations.confirmWrongSize ? 999999 : this.bytes!.length,
            content_type: this.mutations.confirmWrongMime ? 'image/png' : 'application/pdf',
            document_type: this.mutations.confirmWrongDocType ? 'wrong_type' : (this.active?.documentType || 'professional_driver_license'),
            submission_id: this.mutations.confirmWrongSubmission ? 'wrong-sub' : 'sub-setup-123',
            fleet_partner_id: this.mutations.confirmWrongFleet ? 'wrong-fleet' : this.fleet
          }
        }, 200, this.mutations.confirmMissingCandidateSha ? { 'x-drts-candidate-sha': '' } : {});
      }

      if (url.pathname === this.parent + '/documents/' + (this.active?.documentId || 'doc-1') + '/download') {
        if (this.mutations.readbackAbsent) {
          return jsonResponse({}, 404);
        }

        const candidateHeader = this.mutations.readbackMissingCandidateSha ? '' : (process.env.DRTS_CANDIDATE_SHA || 'mock-candidate-sha');
        const downloadHeaders = new Headers({
          'content-type': this.mutations.readbackWrongMime ? 'image/png' : 'application/pdf',
          'x-drts-candidate-sha': candidateHeader
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
                    return new Promise<{ done: boolean; value?: Uint8Array }>((_resolve, reject) => {
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
                    });
                  },
                  cancel: () => {}
                };
              }
            }
          } as any;
        }

        if (this.mutations.readbackMultiChunkOversized) {
          const chunks = [
            Buffer.alloc(600 * 1024, 0x41),
            Buffer.alloc(500 * 1024, 0x42),
            Buffer.alloc(100 * 1024, 0x43)
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
                  }
                };
              }
            }
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
          downloadBuffer = Buffer.from('corrupt');
        }

        return pdfResponse(downloadBuffer, 200, {
          'content-type': this.mutations.readbackWrongMime ? 'image/png' : 'application/pdf',
          'x-drts-candidate-sha': candidateHeader
        });
      }

      if (url.pathname === this.parent + '/submit') {
        return jsonResponse({ data: { submission: { submission_id: 'sub-setup-123', fleet_partner_id: this.fleet, revision_no: ++this.revision } } });
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
  const intentPath = "/control-plane-proxy/fleet-partner/supply-submissions/sub-setup-123/documents/upload-url";
  const intentBody = { documentType: "professional_driver_license" };
  const confirmPath = "/control-plane-proxy/fleet-partner/supply-submissions/sub-setup-123/documents/confirm";
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
        const res = await (globalThis.fetch as any)(url, { ...options, ioBoundary: 'api-request' });
        return { status: () => res.status, url: () => url, headers: () => Object.fromEntries(res.headers), json: () => res.json() };
      })
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
    const result = await uploadOperationalDocument(mockRequest, origin, intentPath, intentBody, confirmPath, confirmBody, headers);
    expect(result.documentId).toBe("doc-1");
    expect(server.calls.length).toBe(5);
    expect(server.calls.map(c => c.method)).toEqual(['GET', 'POST', 'PUT', 'POST', 'GET']);
    expect(server.calls[2]?.bytes).toBeDefined();
    expect(server.calls[2]?.bytes?.length).toBe(327);
  });

  it("rejects foreign origin intent URL", async () => {
    server.mutations.intentForeignUrl = true;
    await expect(uploadOperationalDocument(mockRequest, origin, "https://foreign.example.invalid/api/intent", intentBody, confirmPath, confirmBody, headers))
      .rejects.toThrow(/Received: "https:\/\/foreign\.example\.invalid"/);
    expect(server.calls.length).toBe(0);
  });

  it("rejects intent URL containing query parameters", async () => {
    await expect(uploadOperationalDocument(mockRequest, origin, intentPath + "?unexpected=param", intentBody, confirmPath, confirmBody, headers))
      .rejects.toThrow(/Received: 1/);
    expect(server.calls.length).toBe(0);
  });

  it("rejects intent URL containing fragment", async () => {
    await expect(uploadOperationalDocument(mockRequest, origin, intentPath + "#unexpected-fragment", intentBody, confirmPath, confirmBody, headers))
      .rejects.toThrow(/Received: "#unexpected-fragment"/);
    expect(server.calls.length).toBe(0);
  });

  it("rejects traversal or non-matching parent prefix in intent URL", async () => {
    await expect(uploadOperationalDocument(mockRequest, origin, "/control-plane-proxy/other/path/documents/upload-url", intentBody, confirmPath, confirmBody, headers))
      .rejects.toThrow(/Received: null/);
    expect(server.calls.length).toBe(0);
  });

  it("rejects foreign origin confirm URL", async () => {
    await expect(uploadOperationalDocument(mockRequest, origin, intentPath, intentBody, "https://foreign.example.invalid/documents/confirm", confirmBody, headers))
      .rejects.toThrow(/Received: "https:\/\/foreign\.example\.invalid"/);
    expect(server.calls.length).toBe(0);
  });

  it("rejects confirm URL pathname not matching parent scope", async () => {
    await expect(uploadOperationalDocument(mockRequest, origin, intentPath, intentBody, "/control-plane-proxy/fleet-partner/supply-submissions/other-sub/documents/confirm", confirmBody, headers))
      .rejects.toThrow(/Received: "\/control-plane-proxy\/fleet-partner\/supply-submissions\/other-sub\/documents\/confirm"/);
    expect(server.calls.length).toBe(0);
  });

  it("rejects missing candidate SHA on authoritative readback", async () => {
    server.mutations.authorityMissingCandidateSha = true;
    await expect(uploadOperationalDocument(mockRequest, origin, intentPath, intentBody, confirmPath, confirmBody, headers))
      .rejects.toThrow(/Received: (null|"")/);
    expect(server.calls.length).toBe(1);
    expect(server.calls[0]?.method).toBe('GET');
  });

  it("rejects unexpected status on authoritative readback", async () => {
    server.mutations.authorityStatus = 500;
    await expect(uploadOperationalDocument(mockRequest, origin, intentPath, intentBody, confirmPath, confirmBody, headers))
      .rejects.toThrow(/Received: 500/);
    expect(server.calls.length).toBe(1);
    expect(server.calls[0]?.method).toBe('GET');
  });

  it("rejects missing candidate SHA headers on intent", async () => {
    server.mutations.intentMissingCandidateSha = true;
    await expect(uploadOperationalDocument(mockRequest, origin, intentPath, intentBody, confirmPath, confirmBody, headers))
      .rejects.toThrow(/Received: (null|"")/);
    expect(server.calls.length).toBe(2);
    expect(server.calls.map(c => c.method)).toEqual(['GET', 'POST']);
  });

  it("rejects unexpected status on intent request", async () => {
    server.mutations.intentStatus = 500;
    await expect(uploadOperationalDocument(mockRequest, origin, intentPath, intentBody, confirmPath, confirmBody, headers))
      .rejects.toThrow(/Received: false/);
    expect(server.calls.length).toBe(2);
  });

  it("rejects missing candidate SHA on PUT response", async () => {
    server.mutations.putMissingCandidateSha = true;
    await expect(uploadOperationalDocument(mockRequest, origin, intentPath, intentBody, confirmPath, confirmBody, headers))
      .rejects.toThrow(/Received: (null|"")/);
    expect(server.calls.length).toBe(3);
    expect(server.calls.map(c => c.method)).toEqual(['GET', 'POST', 'PUT']);
  });

  it("rejects missing candidate SHA on confirm response", async () => {
    server.mutations.confirmMissingCandidateSha = true;
    await expect(uploadOperationalDocument(mockRequest, origin, intentPath, intentBody, confirmPath, confirmBody, headers))
      .rejects.toThrow(/Received: (null|"")/);
    expect(server.calls.length).toBe(4);
    expect(server.calls.map(c => c.method)).toEqual(['GET', 'POST', 'PUT', 'POST']);
  });

  it("rejects final candidate mismatch on download readback", async () => {
    server.mutations.readbackMissingCandidateSha = true;
    await expect(uploadOperationalDocument(mockRequest, origin, intentPath, intentBody, confirmPath, confirmBody, headers))
      .rejects.toThrow(/Received: (null|"")/);
    expect(server.calls.length).toBe(5);
  });

  it("rejects oversized response exceeding 1MB", async () => {
    server.mutations.readbackOversized = true;
    await expect(uploadOperationalDocument(mockRequest, origin, intentPath, intentBody, confirmPath, confirmBody, headers))
      .rejects.toThrow(/Response exceeded bounded limit of 1MB/);
    expect(server.calls.length).toBe(5);
  });

  it("rejects multi-chunk response cumulatively exceeding 1MB and observes reader cancel", async () => {
    server.mutations.readbackMultiChunkOversized = true;
    await expect(uploadOperationalDocument(mockRequest, origin, intentPath, intentBody, confirmPath, confirmBody, headers))
      .rejects.toThrow(/Response exceeded bounded limit of 1MB/);
    expect(server.readerCancelObserved).toBe(true);
    expect(server.readbackChunksRead).toBe(2);
    expect(server.calls.length).toBe(5);
  });

  it("accepts exact 1MiB payload through byte guard before readback checksum validation", async () => {
    server.mutations.readbackExact1MiB = true;
    await expect(uploadOperationalDocument(mockRequest, origin, intentPath, intentBody, confirmPath, confirmBody, headers))
      .rejects.toThrow(/4028af3714fa07d2f20e758649532faef11b4818c99a2b8dc0c88170a0dc8784/);
    expect(server.calls.length).toBe(5);
  });

  it("rejects exact 1MiB plus 1 byte payload at byte guard", async () => {
    server.mutations.readback1MiBPlus1 = true;
    await expect(uploadOperationalDocument(mockRequest, origin, intentPath, intentBody, confirmPath, confirmBody, headers))
      .rejects.toThrow(/Response exceeded bounded limit of 1MB/);
    expect(server.calls.length).toBe(5);
  });

  it("rejects strict MIME gap on readback", async () => {
    server.mutations.readbackWrongMime = true;
    await expect(uploadOperationalDocument(mockRequest, origin, intentPath, intentBody, confirmPath, confirmBody, headers))
      .rejects.toThrow(/Received: "image\/png"/);
    expect(server.calls.length).toBe(5);
  });

  it("rejects corrupt readback content with checksum mismatch", async () => {
    server.mutations.readbackCorrupt = true;
    await expect(uploadOperationalDocument(mockRequest, origin, intentPath, intentBody, confirmPath, confirmBody, headers))
      .rejects.toThrow(/4028af3714fa07d2f20e758649532faef11b4818c99a2b8dc0c88170a0dc8784/);
    expect(server.calls.length).toBe(5);
  });

  it("rejects absent download readback with 404", async () => {
    server.mutations.readbackAbsent = true;
    await expect(uploadOperationalDocument(mockRequest, origin, intentPath, intentBody, confirmPath, confirmBody, headers))
      .rejects.toThrow(/Received: 404/);
    expect(server.calls.length).toBe(5);
  });

  it("retries PUT on 503 DOCUMENT_SCANNER_UNAVAILABLE and verifies identical payload across attempts", async () => {
    server.mutations.put503Count = 3;
    vi.useFakeTimers();
    const promise = uploadOperationalDocument(mockRequest, origin, intentPath, intentBody, confirmPath, confirmBody, headers);
    for (let i = 0; i < 3; i++) {
      await vi.runAllTimersAsync();
    }
    const result = await promise;
    expect(result.documentId).toBe("doc-1");
    expect(server.calls.length).toBe(8);
    const putCalls = server.calls.filter(c => c.method === 'PUT');
    expect(putCalls.length).toBe(4);
    for (const call of putCalls) {
      expect(call.bytes!.length).toBe(327);
      expect(createHash('sha256').update(call.bytes!).digest('hex')).toBe('4028af3714fa07d2f20e758649532faef11b4818c99a2b8dc0c88170a0dc8784');
    }
  });

  it("succeeds after cold-start pending observation (>15 attempts, ~400ms overhead + 1s delay) with identical bytes and clean receipt", async () => {
    server.mutations.put503Count = 20;
    server.mutations.put503Delay = 400;
    vi.useFakeTimers();
    const promise = uploadOperationalDocument(mockRequest, origin, intentPath, intentBody, confirmPath, confirmBody, headers);
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
    expect(result.sha256).toBe("4028af3714fa07d2f20e758649532faef11b4818c99a2b8dc0c88170a0dc8784");
    expect(result.readbackFileSize).toBe(327);
    expect(result.readbackSha256).toBe("4028af3714fa07d2f20e758649532faef11b4818c99a2b8dc0c88170a0dc8784");

    expect(server.calls.length).toBe(25);
    const putCalls = server.calls.filter(c => c.method === 'PUT');
    expect(putCalls.length).toBe(21);
    for (const call of putCalls) {
      expect(call.bytes).toBeDefined();
      expect(call.bytes!.length).toBe(327);
      expect(createHash('sha256').update(call.bytes!).digest('hex')).toBe('4028af3714fa07d2f20e758649532faef11b4818c99a2b8dc0c88170a0dc8784');
      expect(call.headers['content-type']).toBe('application/octet-stream');
      expect(call.headers['authorization']).toBe('Bearer fleet-dummy-id-token');
      expect(call.query['objectKey']).toBe(server.active?.objectKey);
    }
    const confirmCall = server.calls.find(c => c.url.includes('/confirm'));
    expect(confirmCall).toBeDefined();
    expect(confirmCall!.data.checksumSha256).toBe("4028af3714fa07d2f20e758649532faef11b4818c99a2b8dc0c88170a0dc8784");
    expect(confirmCall!.data.fileSize).toBe(327);

    const downloadCall = server.calls.find(c => c.url.includes('/download'));
    expect(downloadCall).toBeDefined();
  });

  it("exhausts max 45 pending retries on 503 DOCUMENT_SCANNER_UNAVAILABLE with identical bytes", async () => {
    server.mutations.put503Count = 45;
    vi.useFakeTimers();
    const promise = uploadOperationalDocument(mockRequest, origin, intentPath, intentBody, confirmPath, confirmBody, headers);
    const rejectionPromise = expect(promise).rejects.toThrow(/Scanner must eventually process the bytes and return clean receipt within deadline|Received: false/);
    for (let i = 0; i < 45; i++) {
      await vi.runAllTimersAsync();
    }
    await rejectionPromise;
    expect(server.calls.length).toBe(47);
    const putCalls = server.calls.filter(c => c.method === 'PUT');
    expect(putCalls.length).toBe(45);
    for (const call of putCalls) {
      expect(call.bytes).toBeDefined();
      expect(call.bytes!.length).toBe(327);
      expect(createHash('sha256').update(call.bytes!).digest('hex')).toBe('4028af3714fa07d2f20e758649532faef11b4818c99a2b8dc0c88170a0dc8784');
    }
    expect(server.calls.some(c => c.url.includes('/confirm'))).toBe(false);
    expect(server.calls.some(c => c.url.includes('/download'))).toBe(false);
  });

  it("terminates without retry on unexpected 503 error code", async () => {
    server.mutations.put503Count = 1;
    server.mutations.put503ErrorCode = 'SERVER_ERROR';
    await expect(uploadOperationalDocument(mockRequest, origin, intentPath, intentBody, confirmPath, confirmBody, headers))
      .rejects.toThrow(/PUT exact bytes to .* must be 200 or 201|Received: false/);
    expect(server.calls.length).toBe(3);
    const putCalls = server.calls.filter(c => c.method === 'PUT');
    expect(putCalls.length).toBe(1);
  });

  it("rejects when operational document upload lifecycle exceeds total 60s time budget", async () => {
    server.mutations.advanceTimeAfterPut = 60001;
    vi.useFakeTimers();
    const promise = uploadOperationalDocument(mockRequest, origin, intentPath, intentBody, confirmPath, confirmBody, headers);
    await expect(promise).rejects.toThrow(/Operational document upload lifecycle exceeded time budget/);
    expect(server.calls.length).toBe(3);
    expect(server.calls.map(c => c.method)).toEqual(['GET', 'POST', 'PUT']);
    expect(server.calls.some(c => c.url.includes('/confirm'))).toBe(false);
    expect(server.calls.some(c => c.url.includes('/download'))).toBe(false);
  });

  it("aborts when download response headers arrive but body reader hangs until timeout signal", async () => {
    server.mutations.downloadBodyHangs = true;
    vi.useFakeTimers();
    const promise = uploadOperationalDocument(mockRequest, origin, intentPath, intentBody, confirmPath, confirmBody, headers);
    const rejection = expect(promise).rejects.toThrow(/Timeout/);
    await vi.advanceTimersByTimeAsync(60001);
    await rejection;

    expect(server.downloadReaderStarted).toBe(true);
    expect(server.downloadReaderAborted).toBe(true);
    expect(server.downloadPassedSignal).toBeTruthy();
    expect(server.calls.length).toBe(5);
    expect(server.calls.map(c => c.method)).toEqual(['GET', 'POST', 'PUT', 'POST', 'GET']);
  });

  it("rejects when receipt is unclean", async () => {
    server.mutations.putReceiptUnclean = true;
    await expect(uploadOperationalDocument(mockRequest, origin, intentPath, intentBody, confirmPath, confirmBody, headers))
      .rejects.toThrow(/Received: "infected"/);
    expect(server.calls.length).toBe(3);
  });

  it("rejects when receipt method is wrong", async () => {
    server.mutations.putMethod = 'POST';
    await expect(uploadOperationalDocument(mockRequest, origin, intentPath, intentBody, confirmPath, confirmBody, headers))
      .rejects.toThrow(/Received: "POST"/);
    expect(server.calls.length).toBe(2);
  });

  it("rejects missing receipt", async () => {
    server.mutations.putReceiptMissing = true;
    await expect(uploadOperationalDocument(mockRequest, origin, intentPath, intentBody, confirmPath, confirmBody, headers))
      .rejects.toThrow(/Received: undefined/);
    expect(server.calls.length).toBe(3);
  });

  it("rejects when receipt returns wrong checksum hash", async () => {
    server.mutations.putReceiptWrongHash = true;
    await expect(uploadOperationalDocument(mockRequest, origin, intentPath, intentBody, confirmPath, confirmBody, headers))
      .rejects.toThrow(/Received: "wrong-hash"/);
    expect(server.calls.length).toBe(3);
  });

  it("rejects when receipt returns wrong file size", async () => {
    server.mutations.putReceiptWrongSize = true;
    await expect(uploadOperationalDocument(mockRequest, origin, intentPath, intentBody, confirmPath, confirmBody, headers))
      .rejects.toThrow(/Received: 999999/);
    expect(server.calls.length).toBe(3);
  });

  it("rejects when confirm returns terminal 500", async () => {
    server.mutations.confirmTerminal500 = true;
    await expect(uploadOperationalDocument(mockRequest, origin, intentPath, intentBody, confirmPath, confirmBody, headers))
      .rejects.toThrow(/confirm request to .* must be 200 or 201|Received: false/);
    expect(server.calls.length).toBe(4);
    expect(server.calls.some(c => c.url.includes('/download'))).toBe(false);
  });

  it("rejects when confirm returns wrong checksum hash", async () => {
    server.mutations.confirmWrongHash = true;
    await expect(uploadOperationalDocument(mockRequest, origin, intentPath, intentBody, confirmPath, confirmBody, headers))
      .rejects.toThrow(/Received: "wrong-hash"/);
    expect(server.calls.length).toBe(4);
  });

  it("rejects when confirm returns wrong file size", async () => {
    server.mutations.confirmWrongSize = true;
    await expect(uploadOperationalDocument(mockRequest, origin, intentPath, intentBody, confirmPath, confirmBody, headers))
      .rejects.toThrow(/Received: 999999/);
    expect(server.calls.length).toBe(4);
  });

  it("rejects when confirm returns wrong content type", async () => {
    server.mutations.confirmWrongMime = true;
    await expect(uploadOperationalDocument(mockRequest, origin, intentPath, intentBody, confirmPath, confirmBody, headers))
      .rejects.toThrow(/Received: "image\/png"/);
    expect(server.calls.length).toBe(4);
  });

  it("rejects when confirm returns documentId with path traversal or non-segment characters", async () => {
    server.mutations.confirmWrongId = true;
    await expect(uploadOperationalDocument(mockRequest, origin, intentPath, intentBody, confirmPath, confirmBody, headers))
      .rejects.toThrow(/Expected pattern: \/\^\[-a-zA-Z0-9_\]\+\$\/|documentId must be a strict single segment/);
    expect(server.calls.length).toBe(4);
  });

  it("rejects when confirm returns mismatched submissionId", async () => {
    server.mutations.confirmWrongSubmission = true;
    await expect(uploadOperationalDocument(mockRequest, origin, intentPath, intentBody, confirmPath, confirmBody, headers))
      .rejects.toThrow(/Received: "wrong-sub"/);
    expect(server.calls.length).toBe(4);
  });

  it("rejects when confirm returns mismatched fleetPartnerId", async () => {
    server.mutations.confirmWrongFleet = true;
    await expect(uploadOperationalDocument(mockRequest, origin, intentPath, intentBody, confirmPath, confirmBody, headers))
      .rejects.toThrow(/Received: "wrong-fleet"/);
    expect(server.calls.length).toBe(4);
  });

  it("rejects when confirm returns mismatched documentType", async () => {
    server.mutations.confirmWrongDocType = true;
    await expect(uploadOperationalDocument(mockRequest, origin, intentPath, intentBody, confirmPath, confirmBody, headers))
      .rejects.toThrow(/Received: "wrong_type"/);
    expect(server.calls.length).toBe(4);
  });

  it("rejects when confirm returns mismatched fileObjectKey", async () => {
    server.mutations.confirmWrongKey = true;
    await expect(uploadOperationalDocument(mockRequest, origin, intentPath, intentBody, confirmPath, confirmBody, headers))
      .rejects.toThrow(/Received: "wrong-key"/);
    expect(server.calls.length).toBe(4);
  });
});

describe("runSetup execution with actual manifest", () => {
  let server: MockServer;
  let originalFetch: typeof globalThis.fetch;
  let originalCandidateSha: string | undefined;
  let originalFleetBaseUrl: string | undefined;
  let originalFleetIdToken: string | undefined;
  let mockRequest: APIRequestContext;

  beforeEach(() => {
    server = new MockServer();
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(server.createFetch()) as any;
    originalCandidateSha = process.env.DRTS_CANDIDATE_SHA;
    originalFleetBaseUrl = process.env.DRTS_DEV_FLEET_PARTNER_PORTAL_BASE_URL;
    originalFleetIdToken = process.env.DRTS_DEV_FLEET_PARTNER_PORTAL_ID_TOKEN;

    process.env.DRTS_CANDIDATE_SHA = "mock-candidate-sha";
    process.env.DRTS_DEV_FLEET_PARTNER_PORTAL_BASE_URL = server.origin;
    process.env.DRTS_DEV_FLEET_PARTNER_PORTAL_ID_TOKEN = "fleet-dummy-id-token";

    mockRequest = {
      fetch: vi.fn(async (url, options = {}) => {
        const res = await (globalThis.fetch as any)(url, { ...options, ioBoundary: 'api-request' });
        return { status: () => res.status, url: () => url, headers: () => Object.fromEntries(res.headers), json: () => res.json() };
      })
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
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("executes fleet-submit-read-withdraw-resubmit setup successfully", async () => {
    const context = { request: mockRequest, record: vi.fn(e => server.records.push(e)) };
    const journey = (journeysData as any).journeys.find((j: any) => j.id === "fleet-submit-read-withdraw-resubmit");
    await runSetup(context, journey, { runId: "socket-free-dummy-run" });

    const docs = server.records.filter(e => e.kind === 'setup-document-upload');
    expect(docs.length).toBe(2);
    expect(server.documents.length).toBe(2);

    for (const doc of docs) {
      expect(doc.actorScope).toBe(journey.actorScope);
      expect(doc.putScanState).toBe('clean');
      expect(doc.downloadStatus).toBe(200);
      expect(doc.readbackSha256).toBe(doc.sha256);
      expect(doc.readbackFileSize).toBe(doc.fileSize);
      expect(doc.confirmFleetPartnerId).toBe(server.fleet);
    }

    // Call order validation:
    // Call 0: generic driver submission creation (api-request)
    // Calls 1..5: document upload 1 (authority GET, intent POST, PUT, confirm POST, download GET) (raw-fetch)
    // Call 6: generic submission readback (api-request)
    // Calls 7..11: document upload 2 (authority GET, intent POST, PUT, confirm POST, download GET) (raw-fetch)
    expect(server.calls.length).toBe(12);
    expect(server.calls[0]?.ioBoundary).toBe('api-request');
    expect(server.calls[0]?.pathname).toBe('/control-plane-proxy/fleet-partner/supply-submissions/drivers');
    expect(server.calls[6]?.ioBoundary).toBe('api-request');
    expect(server.calls[6]?.pathname).toBe('/control-plane-proxy/fleet-partner/supply-submissions/sub-setup-123');
    const docCalls1 = server.calls.slice(1, 6);
    for (const c of docCalls1) {
      expect(c.ioBoundary).toBe('raw-fetch');
    }
    const docCalls2 = server.calls.slice(7, 12);
    for (const c of docCalls2) {
      expect(c.ioBoundary).toBe('raw-fetch');
    }
  });

  it("executes admin-review-approve-readback setup successfully with fleet origin override", async () => {
    const context = { request: mockRequest, record: vi.fn(e => server.records.push(e)) };
    const journey = (journeysData as any).journeys.find((j: any) => j.id === "admin-review-approve-readback");
    await runSetup(context, journey, { runId: "socket-free-dummy-run" });

    const docs = server.records.filter(e => e.kind === 'setup-document-upload');
    expect(docs.length).toBe(2);

    // Verify all upload calls used the fleet origin and token
    for (const call of server.calls) {
      expect(call.url.startsWith(server.origin)).toBe(true);
      expect(call.headers['authorization']).toBe(server.expectedAuth);
    }
  });

  it("executes shared-executor-explicit-authorization successfully", async () => {
    server.explicitAuthorization = true;
    server.expectedAuth = 'Bearer explicit-dummy-only';
    const context = { request: mockRequest, record: vi.fn(e => server.records.push(e)) };
    const journey = structuredClone((journeysData as any).journeys.find((j: any) => j.id === "fleet-submit-read-withdraw-resubmit"));
    for (const step of journey.setup) {
      step.headers = { ...(step.headers || {}), authorization: 'Bearer explicit-dummy-only' };
    }

    await runSetup(context, journey, { runId: "socket-free-dummy-run" });

    const docs = server.records.filter(e => e.kind === 'setup-document-upload');
    expect(docs.length).toBe(2);
  });

  it("fails runSetup when receipt is unclean", async () => {
    server.mutations.putReceiptUnclean = true;
    const context = { request: mockRequest, record: vi.fn(e => server.records.push(e)) };
    const journey = (journeysData as any).journeys.find((j: any) => j.id === "fleet-submit-read-withdraw-resubmit");
    await expect(runSetup(context, journey, { runId: "socket-free-dummy-run" })).rejects.toThrow(/Received: "infected"/);
  });

  it("fails runSetup when missing readback", async () => {
    server.mutations.readbackAbsent = true;
    const context = { request: mockRequest, record: vi.fn(e => server.records.push(e)) };
    const journey = (journeysData as any).journeys.find((j: any) => j.id === "fleet-submit-read-withdraw-resubmit");
    await expect(runSetup(context, journey, { runId: "socket-free-dummy-run" })).rejects.toThrow(/Received: 404/);
  });
});
