import { createHash } from "node:crypto";
import {
  GoogleCloudHttpError,
  GoogleMetadataTokens,
  readCloudBody,
  withCloudDeadline,
  type GoogleCloudTokens,
} from "../../common/google-cloud/google-cloud-object-client";
import type {
  RemittanceProofScanInput,
  RemittanceProofScannerPort,
} from "./remittance-proof-scanner.port";
import type { RemittanceProofStorageProvider } from "./remittance-proof-storage.port";

export class CloudRunRemittanceProofScannerAdapter implements RemittanceProofScannerPort {
  readonly providerName = "cloud-run-clamd";
  private readonly origin: string;
  constructor(
    private readonly storage: RemittanceProofStorageProvider,
    origin: string,
    private readonly timeoutMs = 60_000,
    private readonly tokens: GoogleCloudTokens = new GoogleMetadataTokens(),
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    const url = new URL(origin);
    if (
      url.protocol !== "https:" ||
      !url.hostname.endsWith(".run.app") ||
      url.username ||
      url.password ||
      url.port ||
      url.search ||
      url.hash ||
      url.pathname !== "/" ||
      origin !== url.origin
    ) {
      throw new Error("Scanner must be an exact HTTPS Cloud Run origin.");
    }
    if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 60_000)
      throw new Error("Invalid scanner deadline.");
    this.origin = url.origin;
  }
  availability() {
    return this.storage.availability();
  }
  async scan(command: RemittanceProofScanInput) {
    const input = { ...command };
    return withCloudDeadline(this.timeoutMs, async (signal) => {
      const object = await this.storage.read(input.contentHash);
      signal.throwIfAborted();
      const bytes = object ? Buffer.from(object.bytes) : null;
      if (
        !object ||
        !bytes ||
        !bytes.length ||
        bytes.length > 10 * 1024 * 1024 ||
        bytes.length !== input.sizeBytes ||
        object.contentType !== input.contentType ||
        createHash("sha256").update(bytes).digest("hex") !== input.contentHash
      ) {
        throw new Error("Cannot scan: proof identity mismatch.");
      }
      const token = await this.tokens.identityToken(this.origin, signal);
      signal.throwIfAborted();
      const response = await this.fetchImpl(`${this.origin}/scan`, {
        method: "POST",
        redirect: "error",
        signal,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": input.contentType,
          "X-Content-SHA256": input.contentHash,
        },
        body: new Uint8Array(bytes),
      });
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        throw new GoogleCloudHttpError(response.status, "scanner");
      }
      const verdict = JSON.parse(
        (await readCloudBody(response, 4096, signal)).toString("utf8"),
      );
      if (
        verdict.sha256 !== input.contentHash ||
        verdict.sizeBytes !== input.sizeBytes ||
        (verdict.verdict !== "clean" && verdict.verdict !== "infected")
      ) {
        throw new Error("Scanner returned no correlated definitive verdict.");
      }
      return {
        scanState:
          verdict.verdict === "clean"
            ? ("clean" as const)
            : ("rejected" as const),
        rejectionReason:
          verdict.verdict === "clean" ? null : "MALWARE_DETECTED",
        scanCompletedAt: new Date().toISOString(),
      };
    });
  }
}
