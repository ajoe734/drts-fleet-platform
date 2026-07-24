import { createHash } from "node:crypto";
import { Readable } from "node:stream";

import {
  GetObjectCommand,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { MODULE_METADATA } from "@nestjs/common/constants";
import type { DriverSosAttachmentRecord } from "@drts/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DRIVER_SOS_ATTACHMENT_SCANNER,
  DRIVER_SOS_ATTACHMENT_STORAGE,
} from "../../src/modules/driver-sos/driver-sos-attachment.ports";
import {
  createDriverSosAttachmentScanner,
  createDriverSosAttachmentStorageProvider,
  DriverSosModule,
} from "../../src/modules/driver-sos/driver-sos.module";
import {
  resolveDriverSosHttpsScannerConfig,
  resolveDriverSosS3StorageConfig,
  type DriverSosHttpsScannerConfig,
  type DriverSosS3StorageConfig,
} from "../../src/modules/driver-sos/driver-sos-provider.config";
import {
  DRIVER_SOS_SCANNER_CONTRACT_VERSION,
  HttpsJsonDriverSosAttachmentScannerAdapter,
} from "../../src/modules/driver-sos/https-json-driver-sos-attachment-scanner.adapter";
import { S3DriverSosAttachmentStorageAdapter } from "../../src/modules/driver-sos/s3-driver-sos-attachment-storage.adapter";

const storageConfig: DriverSosS3StorageConfig = {
  providerName: "test-s3",
  bucket: "driver-sos-test",
  region: "ap-northeast-1",
  endpoint: "https://s3.example.test/",
  forcePathStyle: true,
};

const scannerConfig: DriverSosHttpsScannerConfig = {
  providerName: "test-scanner",
  endpoint: "https://scanner.example.test/v1/scan",
  authToken: "test-auth-token",
  timeoutMs: 100,
  storageBucket: storageConfig.bucket,
};

function attachment(): DriverSosAttachmentRecord {
  const timestamp = "2026-07-24T09:00:00.000Z";
  return {
    attachmentId: "att-001",
    sosEventId: "sos-001",
    attachmentType: "photo",
    objectKey: "driver-sos/sos-001/attachment.jpg",
    originalFileName: "attachment.jpg",
    contentType: "image/jpeg",
    fileSize: 12,
    checksumSha256: "a".repeat(64),
    scanStatus: "pending",
    scannerProvider: null,
    scanReason: null,
    scanAttemptCount: 0,
    lastScanAttemptAt: null,
    uploadedAt: timestamp,
    scannedAt: null,
    updatedAt: timestamp,
  };
}

describe("S3DriverSosAttachmentStorageAdapter", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("issues a short-lived PUT URL with signed object metadata", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-24T09:00:00.000Z"));
    const send = vi.fn();
    const presign = vi.fn().mockResolvedValue("https://upload.example.test");
    const adapter = new S3DriverSosAttachmentStorageAdapter(storageConfig, {
      client: { send } as unknown as S3Client,
      presign: presign as never,
    });

    const result = await adapter.createUploadIntent({
      sosEventId: "sos-001",
      driverId: "drv-001",
      attachmentType: "photo",
      objectKey: "driver-sos/sos-001/attachment.jpg",
      originalFileName: "attachment.jpg",
      contentType: "image/jpeg",
      fileSize: 4096,
      expiresAt: "2026-07-24T09:30:00.000Z",
    });

    expect(result).toEqual({
      uploadUrl: "https://upload.example.test",
      method: "PUT",
      headers: {
        "content-type": "image/jpeg",
      },
    });
    const command = presign.mock.calls[0]?.[1];
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toEqual({
      Bucket: storageConfig.bucket,
      Key: "driver-sos/sos-001/attachment.jpg",
      ContentType: "image/jpeg",
      ContentLength: 4096,
    });
    expect(presign).toHaveBeenCalledWith(expect.anything(), command, {
      expiresIn: 900,
    });
  });

  it("streams the provider object and computes SHA-256 itself", async () => {
    const bytes = Buffer.from("provider-object");
    const send = vi.fn().mockResolvedValue({
      Body: Readable.from([bytes.subarray(0, 4), bytes.subarray(4)]),
      ContentLength: bytes.length,
      ContentType: "IMAGE/JPEG",
      ChecksumSHA256: "untrusted-provider-checksum",
    });
    const adapter = new S3DriverSosAttachmentStorageAdapter(storageConfig, {
      client: { send } as unknown as S3Client,
      presign: vi.fn() as never,
    });

    const result = await adapter.inspectUploadedObject(
      "driver-sos/sos-001/attachment.jpg",
    );

    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(GetObjectCommand);
    expect(result).toEqual({
      objectKey: "driver-sos/sos-001/attachment.jpg",
      contentType: "image/jpeg",
      fileSize: bytes.length,
      checksumSha256: createHash("sha256").update(bytes).digest("hex"),
    });
    expect(result.checksumSha256).not.toBe("untrusted-provider-checksum");
  });

  it("rejects a provider length that differs from the streamed object", async () => {
    const send = vi.fn().mockResolvedValue({
      Body: Readable.from([Buffer.from("short")]),
      ContentLength: 100,
      ContentType: "image/jpeg",
    });
    const adapter = new S3DriverSosAttachmentStorageAdapter(storageConfig, {
      client: { send } as unknown as S3Client,
      presign: vi.fn() as never,
    });

    await expect(
      adapter.inspectUploadedObject("driver-sos/sos-001/attachment.jpg"),
    ).rejects.toThrow("length changed");
  });
});

describe("HttpsJsonDriverSosAttachmentScannerAdapter", () => {
  it.each(["clean", "infected", "error"] as const)(
    "returns only normalized %s scanner results",
    async (status) => {
      const fetchImpl = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          status,
          reason: status === "clean" ? "ignored" : `provider_${status}`,
          scannedAt: "2026-07-24T09:01:00+00:00",
        }),
      });
      const adapter = new HttpsJsonDriverSosAttachmentScannerAdapter(
        scannerConfig,
        fetchImpl,
      );

      const result = await adapter.scan({ attachment: attachment() });

      expect(result).toEqual({
        status,
        reason: status === "clean" ? null : `provider_${status}`,
        scannedAt: "2026-07-24T09:01:00.000Z",
      });
      const [url, request] = fetchImpl.mock.calls[0]!;
      expect(url).toBe(scannerConfig.endpoint);
      expect(request.headers.authorization).toBe(
        `Bearer ${scannerConfig.authToken}`,
      );
      expect(request.redirect).toBe("error");
      expect(JSON.parse(request.body)).toEqual({
        contractVersion: DRIVER_SOS_SCANNER_CONTRACT_VERSION,
        object: {
          storageProvider: "s3-compatible",
          bucket: storageConfig.bucket,
          key: attachment().objectKey,
          contentType: attachment().contentType,
          size: attachment().fileSize,
          sha256: attachment().checksumSha256,
        },
        context: {
          attachmentId: attachment().attachmentId,
          sosEventId: attachment().sosEventId,
          attachmentType: attachment().attachmentType,
        },
      });
    },
  );

  it("maps timeout and invalid provider statuses to error", async () => {
    const timeoutAdapter = new HttpsJsonDriverSosAttachmentScannerAdapter(
      { ...scannerConfig, timeoutMs: 1 },
      (_url, request) =>
        new Promise((_resolve, reject) => {
          request?.signal?.addEventListener("abort", () =>
            reject(new Error("aborted")),
          );
        }),
    );
    await expect(
      timeoutAdapter.scan({ attachment: attachment() }),
    ).resolves.toEqual(
      expect.objectContaining({
        status: "error",
        reason: "scanner_timeout",
      }),
    );

    const invalidAdapter = new HttpsJsonDriverSosAttachmentScannerAdapter(
      scannerConfig,
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          status: "unknown",
          scannedAt: "2026-07-24T09:01:00.000Z",
        }),
      }),
    );
    await expect(
      invalidAdapter.scan({ attachment: attachment() }),
    ).resolves.toEqual(
      expect.objectContaining({
        status: "error",
        reason: "scanner_invalid_status",
      }),
    );
  });
});

describe("Driver SOS provider configuration and module wiring", () => {
  const enabledStorageEnv = {
    NODE_ENV: "production",
    DRIVER_SOS_ATTACHMENT_STORAGE_PROVIDER: "s3",
    DRIVER_SOS_S3_BUCKET: "driver-sos",
    DRIVER_SOS_S3_REGION: "ap-northeast-1",
  };

  it("keeps both providers unconfigured and fail closed by default", () => {
    expect(createDriverSosAttachmentStorageProvider({})).toBeUndefined();
    expect(createDriverSosAttachmentScanner({})).toBeUndefined();

    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      DriverSosModule,
    ) as Array<{ provide?: symbol }>;
    expect(
      providers.some(
        ({ provide }) => provide === DRIVER_SOS_ATTACHMENT_STORAGE,
      ),
    ).toBe(true);
    expect(
      providers.some(
        ({ provide }) => provide === DRIVER_SOS_ATTACHMENT_SCANNER,
      ),
    ).toBe(true);
  });

  it("validates enabled provider requirements without exposing secret values", () => {
    expect(() =>
      resolveDriverSosS3StorageConfig({
        DRIVER_SOS_ATTACHMENT_STORAGE_PROVIDER: "s3",
      }),
    ).toThrow("DRIVER_SOS_S3_BUCKET is required");
    expect(() =>
      resolveDriverSosS3StorageConfig({
        ...enabledStorageEnv,
        DRIVER_SOS_S3_ACCESS_KEY_ID: "access",
      }),
    ).toThrow("must be configured together");

    const storage = resolveDriverSosS3StorageConfig(enabledStorageEnv);
    expect(() =>
      resolveDriverSosHttpsScannerConfig(
        {
          ...enabledStorageEnv,
          DRIVER_SOS_ATTACHMENT_SCANNER_PROVIDER: "https-json",
          DRIVER_SOS_SCANNER_URL: "https://scanner.example.test/scan",
        },
        storage,
      ),
    ).toThrow("DRIVER_SOS_SCANNER_AUTH_TOKEN is required");
  });

  it("rejects HTTP except for explicitly enabled local/test localhost", () => {
    expect(() =>
      resolveDriverSosS3StorageConfig({
        ...enabledStorageEnv,
        DRIVER_SOS_S3_ENDPOINT: "http://127.0.0.1:9000",
        DRIVER_SOS_PROVIDER_ALLOW_HTTP_LOCAL: "true",
      }),
    ).toThrow("must use HTTPS");

    expect(
      resolveDriverSosS3StorageConfig({
        ...enabledStorageEnv,
        NODE_ENV: "test",
        DRIVER_SOS_S3_ENDPOINT: "http://127.0.0.1:9000",
        DRIVER_SOS_PROVIDER_ALLOW_HTTP_LOCAL: "true",
      })?.endpoint,
    ).toBe("http://127.0.0.1:9000/");
  });
});
