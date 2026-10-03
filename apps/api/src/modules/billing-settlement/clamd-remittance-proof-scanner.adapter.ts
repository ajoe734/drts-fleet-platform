import { createHash } from "node:crypto";
import { connect as connectTcp, type Socket } from "node:net";
import { connect as connectTls } from "node:tls";

import type {
  RemittanceProofScanInput,
  RemittanceProofScannerPort,
} from "./remittance-proof-scanner.port";
import type { RemittanceProofStorageProvider } from "./remittance-proof-storage.port";
import { MAX_PROOF_BYTES } from "./s3-remittance-proof-storage.adapter";

export interface ClamdConfig {
  host: string;
  port: number;
  tls: boolean;
  timeoutMs: number;
}

/** clamd's documented INSTREAM framing, not a proprietary invented API. */
export function encodeClamdInstream(bytes: Buffer): Buffer {
  if (!bytes.length || bytes.length > MAX_PROOF_BYTES)
    throw new Error("Invalid proof size for scan.");
  const parts: Buffer[] = [Buffer.from("zINSTREAM\0")];
  for (let offset = 0; offset < bytes.length; offset += 64 * 1024) {
    const chunk = bytes.subarray(offset, offset + 64 * 1024);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(chunk.length);
    parts.push(length, chunk);
  }
  parts.push(Buffer.alloc(4));
  return Buffer.concat(parts);
}

/** Bounded single request; TLS verifies the configured endpoint certificate. */
export function exchangeWithClamd(
  config: ClamdConfig,
  payload: Buffer,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let socket: Socket | undefined;
    let response = Buffer.alloc(0);
    let settled = false;
    const finish = (error?: Error, reply?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket?.destroy();
      if (error) reject(error);
      else resolve(reply!);
    };
    const timer = setTimeout(
      () => finish(new Error("Clamd request timed out.")),
      config.timeoutMs,
    );
    const onConnect = () => socket!.write(payload);
    try {
      socket = config.tls
        ? connectTls(
            {
              host: config.host,
              port: config.port,
              servername: config.host,
              rejectUnauthorized: true,
            },
            onConnect,
          )
        : connectTcp({ host: config.host, port: config.port }, onConnect);
      socket.on("error", (error) => finish(error));
      socket.on("close", () => {
        if (!settled)
          finish(new Error("Clamd closed without a complete verdict."));
      });
      socket.on("data", (chunk: Buffer) => {
        response = Buffer.concat([response, chunk]);
        if (response.length > 4096)
          return finish(new Error("Clamd response exceeds limit."));
        const end = response.indexOf(0);
        if (end >= 0) {
          if (end !== response.length - 1)
            return finish(new Error("Unexpected trailing clamd data."));
          finish(undefined, response.subarray(0, end).toString("utf8"));
        }
      });
    } catch (error) {
      finish(
        error instanceof Error ? error : new Error("Clamd connection failed."),
      );
    }
  });
}

export class ClamdRemittanceProofScannerAdapter implements RemittanceProofScannerPort {
  readonly providerName = "clamd-instream";
  constructor(
    private readonly storage: RemittanceProofStorageProvider,
    private readonly config: ClamdConfig,
    private readonly exchange: typeof exchangeWithClamd = exchangeWithClamd,
  ) {}

  availability() {
    return this.storage.availability();
  }

  async scan(input: RemittanceProofScanInput) {
    const content = await this.storage.read(input.contentHash);
    if (
      !content ||
      content.bytes.length !== input.sizeBytes ||
      content.contentType !== input.contentType ||
      createHash("sha256").update(content.bytes).digest("hex") !==
        input.contentHash
    ) {
      throw new Error(
        "Cannot scan: proof bytes do not match recorded identity.",
      );
    }
    const response = await this.exchange(
      this.config,
      encodeClamdInstream(content.bytes),
    );
    const scanCompletedAt = new Date().toISOString();
    if (response === "stream: OK")
      return {
        scanState: "clean" as const,
        rejectionReason: null,
        scanCompletedAt,
      };
    if (/^stream: [^\r\n\0]+ FOUND$/.test(response)) {
      return {
        scanState: "rejected" as const,
        rejectionReason: "MALWARE_DETECTED",
        scanCompletedAt,
      };
    }
    // Includes size-limit ERROR, out-of-date/unavailable engine, and malformed
    // responses. Never convert transport/engine failure into clean or terminal
    // rejection: leave pending_scan so the authorized operation can retry.
    throw new Error("Clamd did not return a definitive scan verdict.");
  }
}
