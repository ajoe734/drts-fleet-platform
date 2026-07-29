import type {
  DriverSosAttachmentScanner,
  DriverSosAttachmentScanResult,
  DriverSosAttachmentScanInput,
} from "./driver-sos-attachment.ports";
import type { DriverSosHttpsScannerConfig } from "./driver-sos-provider.config";

export const DRIVER_SOS_SCANNER_CONTRACT_VERSION = "2026-07-24";

type ScannerFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Pick<Response, "json" | "ok" | "status">>;

type ScannerStatus = DriverSosAttachmentScanResult["status"];

export interface DriverSosScannerRequestV1 {
  contractVersion: typeof DRIVER_SOS_SCANNER_CONTRACT_VERSION;
  object: {
    storageProvider: "s3-compatible";
    bucket: string;
    key: string;
    contentType: string;
    size: number;
    sha256: string;
  };
  context: {
    attachmentId: string;
    sosEventId: string;
    attachmentType: "photo" | "audio";
  };
}

export interface DriverSosScannerResponseV1 {
  status: ScannerStatus;
  reason: string | null;
  scannedAt: string;
}

interface UntrustedScannerResponse {
  status?: unknown;
  reason?: unknown;
  scannedAt?: unknown;
}

export class HttpsJsonDriverSosAttachmentScannerAdapter implements DriverSosAttachmentScanner {
  readonly providerName: string;

  constructor(
    private readonly config: DriverSosHttpsScannerConfig,
    private readonly fetchImpl: ScannerFetch = globalThis.fetch.bind(
      globalThis,
    ),
  ) {
    this.providerName = config.providerName;
  }

  availability() {
    return { state: "available" as const };
  }

  async scan(
    input: DriverSosAttachmentScanInput,
  ): Promise<DriverSosAttachmentScanResult> {
    const request: DriverSosScannerRequestV1 = {
      contractVersion: DRIVER_SOS_SCANNER_CONTRACT_VERSION,
      object: {
        storageProvider: "s3-compatible",
        bucket: this.config.storageBucket,
        key: input.attachment.objectKey,
        contentType: input.attachment.contentType,
        size: input.attachment.fileSize,
        sha256: input.attachment.checksumSha256,
      },
      context: {
        attachmentId: input.attachment.attachmentId,
        sosEventId: input.attachment.sosEventId,
        attachmentType: input.attachment.attachmentType,
      },
    };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    let response: Pick<Response, "json" | "ok" | "status">;

    try {
      response = await this.fetchImpl(this.config.endpoint, {
        method: "POST",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${this.config.authToken}`,
          "content-type": "application/json",
          "user-agent": "drts-driver-sos-scanner/1.0",
        },
        body: JSON.stringify(request),
        redirect: "error",
        signal: controller.signal,
      });
    } catch {
      return this.errorResult(
        controller.signal.aborted
          ? "scanner_timeout"
          : "scanner_request_failed",
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      return this.errorResult(`scanner_http_${response.status}`);
    }

    let payload: UntrustedScannerResponse;
    try {
      payload = (await response.json()) as UntrustedScannerResponse;
    } catch {
      return this.errorResult("scanner_invalid_json");
    }
    return this.normalizeResponse(payload);
  }

  private normalizeResponse(
    payload: UntrustedScannerResponse,
  ): DriverSosAttachmentScanResult {
    const status = payload.status;
    if (!this.isScannerStatus(status)) {
      return this.errorResult("scanner_invalid_status");
    }

    const scannedAt =
      typeof payload.scannedAt === "string" ? payload.scannedAt.trim() : "";
    if (!scannedAt || !Number.isFinite(Date.parse(scannedAt))) {
      return this.errorResult("scanner_invalid_timestamp");
    }

    return {
      status,
      reason:
        status === "clean"
          ? null
          : (this.normalizedReason(payload.reason) ??
            (status === "infected"
              ? "malware_detected"
              : "scanner_reported_error")),
      scannedAt: new Date(scannedAt).toISOString(),
    };
  }

  private isScannerStatus(status: unknown): status is ScannerStatus {
    return status === "clean" || status === "infected" || status === "error";
  }

  private normalizedReason(reason: unknown) {
    if (typeof reason !== "string") {
      return null;
    }
    const normalized = reason.trim();
    return normalized ? normalized.slice(0, 500) : null;
  }

  private errorResult(reason: string): DriverSosAttachmentScanResult {
    return {
      status: "error",
      reason,
      scannedAt: new Date().toISOString(),
    };
  }
}
