import { describe, expect, it, vi } from "vitest";
import { uploadOperationalDocument } from "../e2e/operational-document-upload";
import { type APIRequestContext } from "@playwright/test";
import { createHash } from "node:crypto";

describe("uploadOperationalDocument", () => {
  const origin = "https://example.com";
  const intentPath = "/api/fleet-partner/supply-submissions/sub-123/documents/upload-url";
  const intentBody = { doc: "type1", documentType: "type1" };
  const confirmPath = "/api/fleet-partner/supply-submissions/sub-123/documents/confirm";
  const confirmBody = { doc: "type1" };
  const headers = { Authorization: "Bearer token" };

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

  it("completes full lifecycle with intent, PUT, confirm, and GET download", async () => {
    const request = {
      post: vi.fn(),
      put: vi.fn(),
      get: vi.fn(),
    } as unknown as APIRequestContext;

    vi.mocked(request.post).mockImplementation(async (url) => {
      if (url.toString().includes("/upload-url")) {
        return {
          status: () => 200,
          headers: () => ({ "x-drts-candidate-sha": "mock-sha" }),
          text: async () => JSON.stringify({
            data: {
              object_key: "obj-123",
              upload_url: "/api/fleet-partner/supply-submissions/sub-123/documents/content?objectKey=obj-123",
              method: "PUT",
              headers: { "content-type": "application/octet-stream" }
            },
          }),
        } as any;
      }
      if (url.toString().includes("/confirm")) {
        return {
          status: () => 200,
          headers: () => ({ "x-drts-candidate-sha": "mock-sha" }),
          text: async () => JSON.stringify({
            data: {
              document_id: "doc-123",
              file_object_key: "obj-123",
              checksum_sha256: expectedSha,
              file_size: expectedSize,
              content_type: "application/pdf",
              submission_id: "sub-123",
              fleet_partner_id: "fleet-123",
              document_type: "type1"
            }
          })
        } as any;
      }
    });

    vi.mocked(request.put).mockImplementation(async () => {
      return {
        status: () => 200,
        headers: () => ({ "x-drts-candidate-sha": "mock-sha" }),
        text: async () => JSON.stringify({
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
    expect(result.documentId).toBe("doc-123");

    expect(request.put).toHaveBeenCalledWith(
      expect.stringContaining("/control-plane-proxy/fleet-partner/supply-submissions/sub-123/documents/content?objectKey=obj-123"),
      expect.objectContaining({
        headers: expect.objectContaining({ "content-type": "application/octet-stream", "Authorization": "Bearer token" }),
        data: expect.any(Buffer),
      }),
    );

    expect(request.get).toHaveBeenCalledWith(
      expect.stringContaining("/control-plane-proxy/fleet-partner/supply-submissions/sub-123/documents/doc-123/download"),
      expect.objectContaining({
        headers: expect.objectContaining({ "Authorization": "Bearer token" }),
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
      if (url.toString().includes("/upload-url")) {
        return {
          status: () => 200,
          headers: () => ({ "x-drts-candidate-sha": "mock-sha" }),
          text: async () => JSON.stringify({
            data: {
              object_key: "obj-123",
              upload_url: "/api/fleet-partner/supply-submissions/sub-123/documents/content?objectKey=obj-123",
              method: "PUT",
              headers: { "content-type": "application/octet-stream" }
            },
          }),
        } as any;
      }
      if (url.toString().includes("/confirm")) {
        return {
          status: () => 200,
          headers: () => ({ "x-drts-candidate-sha": "mock-sha" }),
          text: async () => JSON.stringify({
            data: {
              document_id: "doc-123",
              file_object_key: "obj-123",
              checksum_sha256: expectedSha,
              file_size: expectedSize,
              content_type: "application/pdf",
              submission_id: "sub-123",
              fleet_partner_id: "fleet-123",
              document_type: "type1"
            }
          })
        } as any;
      }
    });

    vi.mocked(request.get).mockResolvedValue({
      status: () => 200,
      headers: () => ({ "x-drts-candidate-sha": "mock-sha", "content-type": "application/pdf" }),
      body: async () => expectedPdfBytes
    } as any);

    let putAttempts = 0;
    vi.mocked(request.put).mockImplementation(async () => {
      putAttempts++;
      if (putAttempts < 3) {
        return {
          status: () => 503,
          headers: () => ({ "x-drts-candidate-sha": "mock-sha" }),
          text: async () => JSON.stringify({ error: { code: "DOCUMENT_SCANNER_UNAVAILABLE" } }),
        } as any;
      }
      return {
        status: () => 200,
        headers: () => ({ "x-drts-candidate-sha": "mock-sha" }),
        text: async () => JSON.stringify({
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

  it("rejects 302 redirects instead of following them", async () => {
    const request = {
      post: vi.fn(),
      put: vi.fn(),
      get: vi.fn(),
    } as unknown as APIRequestContext;

    vi.mocked(request.post).mockResolvedValue({
      status: () => 302,
      headers: () => ({ "x-drts-candidate-sha": "mock-sha" }),
    } as any);

    await expect(uploadOperationalDocument(
      request, origin, intentPath, intentBody, confirmPath, confirmBody, headers
    )).rejects.toThrow();
  });

  it("fails if total deadline is exceeded during transient wait", async () => {
    const request = {
      post: vi.fn(),
      put: vi.fn(),
      get: vi.fn(),
    } as unknown as APIRequestContext;

    vi.mocked(request.post).mockResolvedValue({
      status: () => 200,
      headers: () => ({ "x-drts-candidate-sha": "mock-sha" }),
      text: async () => JSON.stringify({
        data: {
          object_key: "obj-123",
          upload_url: "/api/fleet-partner/supply-submissions/sub-123/documents/content?objectKey=obj-123",
          method: "PUT",
          headers: { "content-type": "application/octet-stream" }
        },
      }),
    } as any);

    vi.mocked(request.put).mockImplementation(async () => {
      // Simulate advancing time past budget
      vi.advanceTimersByTime(35000);
      return {
        status: () => 503,
        headers: () => ({ "x-drts-candidate-sha": "mock-sha" }),
        text: async () => JSON.stringify({ error: { code: "DOCUMENT_SCANNER_UNAVAILABLE" } }),
      } as any;
    });

    vi.useFakeTimers();

    const promise = uploadOperationalDocument(
      request, origin, intentPath, intentBody, confirmPath, confirmBody, headers
    );

    await expect(promise).rejects.toThrow(/budget/i);

    vi.useRealTimers();
  });
});
