import { describe, expect, it, vi } from "vitest";

import type { DriverSosAttachmentRecord } from "@drts/contracts";

import {
  syncDriverSosAttachments,
  type DriverSosAttachmentTransport,
} from "@/lib/driver-sos-attachment-upload";
import type { DriverSosAttachmentDraft } from "@/lib/driver-sos-outbox";

function draft(
  overrides: Partial<DriverSosAttachmentDraft> = {},
): DriverSosAttachmentDraft {
  return {
    id: "draft-1",
    uri: "file:///scene.jpg",
    fileName: "scene.jpg",
    mimeType: "image/jpeg",
    fileSize: 1024,
    addedAt: "2026-07-24T00:00:00.000Z",
    uploadState: "local",
    serverAttachmentId: null,
    scanStatus: null,
    lastError: null,
    ...overrides,
  };
}

function serverAttachment(
  scanStatus: DriverSosAttachmentRecord["scanStatus"],
): DriverSosAttachmentRecord {
  return {
    attachmentId: "attachment-1",
    sosEventId: "sos-1",
    attachmentType: "photo",
    objectKey: "driver-sos/sos-1/object-1",
    originalFileName: "scene.jpg",
    contentType: "image/jpeg",
    fileSize: 1024,
    checksumSha256: "a".repeat(64),
    scanStatus,
    scannerProvider: scanStatus === "unavailable" ? null : "hermetic-scanner",
    scanReason:
      scanStatus === "unavailable" ? "No scanner is configured." : null,
    scanAttemptCount: scanStatus === "unavailable" ? 0 : 1,
    lastScanAttemptAt: null,
    uploadedAt: "2026-07-24T00:00:01.000Z",
    scannedAt: null,
    updatedAt: "2026-07-24T00:00:01.000Z",
  };
}

function transport(
  overrides: Partial<DriverSosAttachmentTransport> = {},
): DriverSosAttachmentTransport {
  return {
    prepare: vi.fn().mockResolvedValue({
      body: new Blob(["attachment"], { type: "image/jpeg" }),
      contentType: "image/jpeg",
      fileSize: 1024,
    }),
    createUploadIntent: vi.fn().mockResolvedValue({
      state: "ready",
      sosEventId: "sos-1",
      objectKey: "driver-sos/sos-1/object-1",
      uploadUrl: "http://127.0.0.1/hermetic-upload",
      expiresAt: "2026-07-24T00:15:00.000Z",
      method: "PUT",
      headers: { "content-type": "image/jpeg" },
      provider: "hermetic-storage",
    }),
    upload: vi.fn().mockResolvedValue(undefined),
    confirm: vi.fn().mockResolvedValue({
      state: "confirmed",
      attachment: serverAttachment("clean"),
    }),
    retryScan: vi.fn().mockResolvedValue(serverAttachment("clean")),
    ...overrides,
  };
}

describe("syncDriverSosAttachments", () => {
  it("preserves explicit storage unavailable state without uploading", async () => {
    const fakeTransport = transport({
      createUploadIntent: vi.fn().mockResolvedValue({
        state: "unavailable",
        sosEventId: "sos-1",
        reasonCode: "storage_provider_unavailable",
        reason: "No attachment storage provider is configured.",
        retryable: true,
      }),
    });

    const result = await syncDriverSosAttachments({
      sosEventId: "sos-1",
      attachments: [draft()],
      transport: fakeTransport,
    });

    expect(result.unavailableCount).toBe(1);
    expect(result.attachments[0]?.uploadState).toBe("unavailable");
    expect(fakeTransport.upload).not.toHaveBeenCalled();
    expect(fakeTransport.confirm).not.toHaveBeenCalled();
  });

  it("uploads and keeps scanner unavailable as a visible fail-closed result", async () => {
    const fakeTransport = transport({
      confirm: vi.fn().mockResolvedValue({
        state: "confirmed",
        attachment: serverAttachment("unavailable"),
      }),
    });

    const result = await syncDriverSosAttachments({
      sosEventId: "sos-1",
      attachments: [draft()],
      transport: fakeTransport,
    });

    expect(result.confirmedCount).toBe(1);
    expect(result.unavailableCount).toBe(1);
    expect(result.attachments[0]).toEqual(
      expect.objectContaining({
        uploadState: "confirmed",
        serverAttachmentId: "attachment-1",
        scanStatus: "unavailable",
      }),
    );
  });

  it("retries scanning without uploading the same object again", async () => {
    const fakeTransport = transport();
    const result = await syncDriverSosAttachments({
      sosEventId: "sos-1",
      attachments: [
        draft({
          uploadState: "confirmed",
          serverAttachmentId: "attachment-1",
          scanStatus: "unavailable",
        }),
      ],
      transport: fakeTransport,
    });

    expect(fakeTransport.retryScan).toHaveBeenCalledWith(
      "sos-1",
      "attachment-1",
    );
    expect(fakeTransport.prepare).not.toHaveBeenCalled();
    expect(result.attachments[0]?.scanStatus).toBe("clean");
  });
});
