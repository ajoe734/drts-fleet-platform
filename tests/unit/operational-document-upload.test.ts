import { describe, expect, it, vi } from "vitest";
import { uploadOperationalDocument } from "../e2e/operational-document-upload";
import { type APIRequestContext } from "@playwright/test";
import { createHash } from "node:crypto";

describe("uploadOperationalDocument", () => {
  const origin = "https://example.com";
  const intentPath = "/intent";
  const intentBody = { doc: "type1" };
  const confirmPath = "/confirm";
  const confirmBody = { doc: "type1" };
  const headers = { Authorization: "Bearer token" };
  
  const expectedPdfBytes = Buffer.from(
    "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 72 72] >>\nendobj\ntrailer\n<< /Size 4 /Root 1 0 R >>\n%%EOF\n"
  );
  const expectedSha = createHash("sha256").update(expectedPdfBytes).digest("hex");
  const expectedSize = expectedPdfBytes.length;

  it("completes full lifecycle with intent, PUT, GET readback, and confirm", async () => {
    const request = {
      post: vi.fn(),
      put: vi.fn(),
      get: vi.fn(),
    } as unknown as APIRequestContext;

    vi.mocked(request.post).mockImplementation(async (url) => {
      if (url.toString().includes("/intent")) {
        return {
          status: () => 200,
          headers: () => ({ "x-drts-candidate-sha": "mock-sha" }),
          json: async () => ({
            data: { object_key: "obj-123", upload_url: "/api/upload-url", method: "PUT", headers: { "content-type": "application/octet-stream" } },
          }),
        } as any;
      }
      if (url.toString().includes("/confirm")) {
        return { 
          status: () => 200,
          headers: () => ({ "x-drts-candidate-sha": "mock-sha" }),
        } as any;
      }
    });

    vi.mocked(request.put).mockImplementation(async () => {
      return { 
        status: () => 200,
        headers: () => ({ "x-drts-candidate-sha": "mock-sha" }),
        json: async () => ({
          data: { checksum_sha256: expectedSha, file_size: expectedSize, scan_state: "clean" }
        })
      } as any;
    });

    vi.mocked(request.get).mockImplementation(async () => {
      return { 
        status: () => 200,
        headers: () => ({ "x-drts-candidate-sha": "mock-sha", "content-type": "application/pdf" }),
        body: async () => expectedPdfBytes
      } as any;
    });

    const result = await uploadOperationalDocument(
      request,
      origin,
      intentPath,
      intentBody,
      confirmPath,
      confirmBody,
      headers,
    );

    expect(result.objectKey).toBe("obj-123");
    expect(result.fileSize).toBe(expectedSize);
    expect(result.sha256).toBe(expectedSha);

    // Should rewrite /api/ to /control-plane-proxy/
    expect(request.put).toHaveBeenCalledWith(
      expect.stringContaining("/control-plane-proxy/upload-url"),
      expect.objectContaining({
        headers: expect.objectContaining({ "content-type": "application/octet-stream", "Authorization": "Bearer token" }),
        data: expect.any(Buffer),
      }),
    );
  });

  it("retries PUT on 503 DOCUMENT_SCANNER_UNAVAILABLE with error.code", async () => {
    const request = {
      post: vi.fn(),
      put: vi.fn(),
      get: vi.fn(),
    } as unknown as APIRequestContext;

    vi.mocked(request.post).mockImplementation(async (url) => {
      if (url.toString().includes("/intent")) {
        return {
          status: () => 200,
          headers: () => ({}),
          json: async () => ({
            data: { object_key: "obj-123", upload_url: "/upload-url" },
          }),
        } as any;
      }
      return { status: () => 200, headers: () => ({}) } as any;
    });

    vi.mocked(request.get).mockResolvedValue({
      status: () => 200,
      headers: () => ({ "content-type": "application/pdf" }),
      body: async () => expectedPdfBytes
    } as any);

    let putAttempts = 0;
    vi.mocked(request.put).mockImplementation(async () => {
      putAttempts++;
      if (putAttempts < 3) {
        return {
          status: () => 503,
          headers: () => ({}),
          json: async () => ({ error: { code: "DOCUMENT_SCANNER_UNAVAILABLE" } }),
        } as any;
      }
      return { 
        status: () => 200, 
        headers: () => ({}),
        json: async () => ({
          data: { checksum_sha256: expectedSha, file_size: expectedSize, scan_state: "clean" }
        })
      } as any;
    });

    vi.useFakeTimers();

    const promise = uploadOperationalDocument(
      request,
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

    await promise;
    vi.useRealTimers();

    expect(putAttempts).toBe(3);
  });
});

