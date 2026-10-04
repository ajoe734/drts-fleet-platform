import type { IncomingMessage, ServerResponse } from "node:http";

import {
  type ClamdVerdict,
  encodeInstream,
  parseInstreamReply,
} from "./clamd-protocol";
import type { ClamdTransportConfig } from "./clamd-transport";
import {
  ALLOWED_MIME_TYPES,
  MAX_PROOF_BYTES,
  isValidSha256Hex,
  sha256Hex,
} from "./validate";

export interface GatewayConfig {
  clamd: ClamdTransportConfig;
  /** True only once the sidecar has loaded real signatures and answered a
   * live ping; a container merely being started is not "ready". */
  isReady: () => Promise<boolean>;
  exchange: (config: ClamdTransportConfig, payload: Buffer) => Promise<string>;
  log: (fields: Record<string, unknown>) => void;
}

interface ScanSuccess {
  sha256: string;
  sizeBytes: number;
  verdict: ClamdVerdict;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readBoundedBody(
  req: IncomingMessage,
  limit: number,
): Promise<Buffer | "too_large"> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;
    req.on("data", (chunk: Buffer) => {
      if (settled) return;
      total += chunk.length;
      if (total > limit) {
        settled = true;
        req.destroy();
        resolve("too_large");
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!settled) {
        settled = true;
        resolve(Buffer.concat(chunks));
      }
    });
    req.on("error", (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
  });
}

/**
 * The first-party `/scan` and `/health` contract: body is exact proof
 * bytes, `Content-Type` must be an allowed MIME type, `X-Content-SHA256`
 * must match the body. A success reply is only ever emitted after a real,
 * definitive clamd verdict; every other condition (bad input, transport
 * failure, indeterminate reply) is an error, never a fabricated `clean`.
 * No request/response body bytes are ever passed to `log`.
 */
export function createRequestHandler(config: GatewayConfig) {
  return async function handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const startedAt = Date.now();
    const method = req.method ?? "";
    const url = req.url ?? "";
    try {
      if (method === "GET" && url === "/health") {
        const ready = await config.isReady();
        sendJson(
          res,
          ready ? 200 : 503,
          ready ? { status: "ready" } : { status: "not_ready" },
        );
        return;
      }
      if (method !== "POST" || url !== "/scan") {
        sendJson(res, 404, { error: "not_found" });
        return;
      }

      const contentType = req.headers["content-type"] ?? "";
      if (typeof contentType !== "string" || !ALLOWED_MIME_TYPES.has(contentType)) {
        sendJson(res, 415, { error: "unsupported_content_type" });
        return;
      }
      const hashHeader = req.headers["x-content-sha256"];
      if (typeof hashHeader !== "string" || !isValidSha256Hex(hashHeader)) {
        sendJson(res, 400, { error: "invalid_content_sha256_header" });
        return;
      }

      const body = await readBoundedBody(req, MAX_PROOF_BYTES);
      if (body === "too_large") {
        sendJson(res, 413, { error: "payload_too_large" });
        return;
      }
      if (body.length === 0) {
        sendJson(res, 400, { error: "empty_body" });
        return;
      }
      const actualHash = sha256Hex(body);
      if (actualHash !== hashHeader) {
        sendJson(res, 400, { error: "content_sha256_mismatch" });
        return;
      }

      // A scan must never be attempted against an engine that is not
      // actually ready (cold start, dead sidecar, or signatures that have
      // gone stale past the configured age) -- /health is not the only
      // caller that needs this check (R8).
      if (!(await config.isReady())) {
        sendJson(res, 503, { error: "scan_engine_not_ready" });
        return;
      }

      let reply: string;
      try {
        reply = await config.exchange(config.clamd, encodeInstream(body));
      } catch {
        sendJson(res, 502, { error: "scan_engine_unavailable" });
        return;
      }
      const verdict = parseInstreamReply(reply);
      if (verdict === null) {
        sendJson(res, 502, { error: "scan_engine_indeterminate" });
        return;
      }

      const result: ScanSuccess = {
        sha256: actualHash,
        sizeBytes: body.length,
        verdict,
      };
      sendJson(res, 200, result);
      config.log({
        route: "/scan",
        status: 200,
        sizeBytes: result.sizeBytes,
        verdict: result.verdict,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      config.log({
        route: url,
        error: error instanceof Error ? error.message : "unknown_error",
        durationMs: Date.now() - startedAt,
      });
      if (!res.headersSent) sendJson(res, 500, { error: "internal_error" });
    }
  };
}
