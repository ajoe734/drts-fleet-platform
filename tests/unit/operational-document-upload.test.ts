import { describe, expect, it, vi } from "vitest";
import { uploadOperationalDocument } from "../e2e/operational-document-upload";
import { type APIRequestContext } from "@playwright/test";

describe("uploadOperationalDocument", () => {
  const origin = "https://example.com";
  const intentPath = "/intent";
  const intentBody = { doc: "type1" };
  const confirmPath = "/confirm";
  const confirmBody = { doc: "type1" };
  const headers = { Authorization: "Bearer token" };

  it("completes full lifecycle with intent, PUT, and confirm", async () => {
    const request = {
      post: vi.fn(),
      put: vi.fn(),
    } as unknown as APIRequestContext;

    vi.mocked(request.post).mockImplementation(async (url) => {
      if (url.toString().includes("/intent")) {
        return {
          status: () => 200,
          json: async () => ({
            data: { object_key: "obj-123", upload_url: "/upload-url" },
          }),
        } as any;
      }
      if (url.toString().includes("/confirm")) {
        return { status: () => 200 } as any;
      }
    });

    vi.mocked(request.put).mockImplementation(async () => {
      return { status: () => 200 } as any;
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
    expect(result.fileSize).toBeGreaterThan(0);
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);

    expect(request.post).toHaveBeenCalledWith(
      expect.stringContaining("/intent"),
      expect.objectContaining({
        data: expect.objectContaining({
          doc: "type1",
          contentType: "application/pdf",
        }),
      }),
    );

    expect(request.put).toHaveBeenCalledWith(
      expect.stringContaining("/upload-url"),
      expect.objectContaining({
        headers: expect.objectContaining({ "Content-Type": "application/pdf" }),
        data: expect.any(Buffer),
      }),
    );

    expect(request.post).toHaveBeenCalledWith(
      expect.stringContaining("/confirm"),
      expect.objectContaining({
        data: expect.objectContaining({
          doc: "type1",
          objectKey: "obj-123",
          checksumSha256: result.sha256,
          fileSize: result.fileSize,
        }),
      }),
    );
  });

  it("retries PUT on 503 DOCUMENT_SCANNER_UNAVAILABLE", async () => {
    const request = {
      post: vi.fn(),
      put: vi.fn(),
    } as unknown as APIRequestContext;

    vi.mocked(request.post).mockResolvedValue({
      status: () => 200,
      json: async () => ({
        data: { object_key: "obj-123", upload_url: "/upload-url" },
      }),
    } as any);

    let putAttempts = 0;
    vi.mocked(request.put).mockImplementation(async () => {
      putAttempts++;
      if (putAttempts < 3) {
        return {
          status: () => 503,
          json: async () => ({ code: "DOCUMENT_SCANNER_UNAVAILABLE" }),
        } as any;
      }
      return { status: () => 200 } as any;
    });

    // To prevent the test from taking too long due to setTimeout, we can mock timers or just let it run if it's 1 sec.
    // Let's mock timers.
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

    // fast forward timers
    for (let i = 0; i < 3; i++) {
      await vi.runAllTimersAsync();
    }

    await promise;
    vi.useRealTimers();

    expect(putAttempts).toBe(3);
  });
});
