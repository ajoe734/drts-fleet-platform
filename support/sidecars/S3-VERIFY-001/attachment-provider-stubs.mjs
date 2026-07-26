// S3-VERIFY-001 — controlled local provider endpoints for the Driver SOS
// attachment pipeline.
//
// HONESTY BOUNDARY — read before citing any result produced with these stubs:
//   These are LOCAL CONTROLLED ENDPOINTS, not the production object store and
//   not a real malware scanner. They exist to exercise the repository-owned
//   adapters (`S3DriverSosAttachmentStorageAdapter`,
//   `HttpsJsonDriverSosAttachmentScannerAdapter`) over real HTTP with real
//   presigned SigV4 URLs and a real request/response contract, so the landed
//   implementation is verified at runtime rather than only against in-process
//   fakes. They do NOT constitute external-provider evidence: real S3/malware
//   provider binding, credentials, quarantine store, and provider reports
//   remain `blocked_ext` for S3-VERIFY-003.
//
// Behaviour:
//   * S3 stub (path-style): PUT /<bucket>/<key> stores bytes; GET returns them
//     with Content-Type and Content-Length. Signatures are accepted as-is —
//     this stub does not authenticate, so it proves transport/metadata
//     handling, not credential enforcement.
//   * Scanner stub: implements the `2026-07-24` JSON contract, requires the
//     bearer token, fetches the object from the S3 stub, and classifies:
//       - body containing `EICAR`             -> infected
//       - body containing `SCANNER-ERROR`     -> error
//       - body containing `SCANNER-FLAKY` and attempt 1 -> error, then clean
//       - otherwise                           -> clean
//
// Usage: node attachment-provider-stubs.mjs [s3Port] [scannerPort]

import { createServer } from "node:http";

const S3_PORT = Number(process.argv[2] ?? 3921);
const SCANNER_PORT = Number(process.argv[3] ?? 3922);
const SCANNER_TOKEN =
  process.env.STUB_SCANNER_TOKEN ?? "s3-verify-001-scanner-token";

const objects = new Map();
const scanAttempts = new Map();

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

const s3 = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${S3_PORT}`);
  const objectPath = decodeURIComponent(url.pathname.replace(/^\/+/, ""));

  if (req.method === "PUT") {
    const body = await readBody(req);
    objects.set(objectPath, {
      body,
      contentType: req.headers["content-type"] ?? "application/octet-stream",
    });
    console.log(`[s3-stub] PUT ${objectPath} (${body.byteLength} bytes)`);
    res.writeHead(200, { etag: '"stub"' });
    res.end();
    return;
  }

  if (req.method === "GET" || req.method === "HEAD") {
    const stored = objects.get(objectPath);
    if (!stored) {
      console.log(`[s3-stub] ${req.method} ${objectPath} -> 404`);
      res.writeHead(404, { "content-type": "application/xml" });
      res.end("<Error><Code>NoSuchKey</Code></Error>");
      return;
    }
    console.log(`[s3-stub] ${req.method} ${objectPath} -> 200`);
    res.writeHead(200, {
      "content-type": stored.contentType,
      "content-length": String(stored.body.byteLength),
    });
    res.end(req.method === "HEAD" ? undefined : stored.body);
    return;
  }

  res.writeHead(405);
  res.end();
});

const scanner = createServer(async (req, res) => {
  if (req.method !== "POST") {
    res.writeHead(405);
    res.end();
    return;
  }
  if (req.headers.authorization !== `Bearer ${SCANNER_TOKEN}`) {
    console.log("[scanner-stub] rejected unauthenticated scan request");
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "unauthorized" }));
    return;
  }

  const raw = await readBody(req);
  let request;
  try {
    request = JSON.parse(raw.toString("utf8"));
  } catch {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "invalid_json" }));
    return;
  }

  const objectPath = `${request?.object?.bucket}/${request?.object?.key}`;
  const stored = objects.get(objectPath);
  const attachmentId = request?.context?.attachmentId ?? objectPath;
  const attempt = (scanAttempts.get(attachmentId) ?? 0) + 1;
  scanAttempts.set(attachmentId, attempt);

  let status = "clean";
  let reason = null;

  if (!stored) {
    status = "error";
    reason = "object_not_found_in_stub_store";
  } else {
    const text = stored.body.toString("utf8");
    if (text.includes("EICAR")) {
      status = "infected";
      reason = "stub_eicar_signature";
    } else if (text.includes("SCANNER-ERROR")) {
      status = "error";
      reason = "stub_forced_error";
    } else if (text.includes("SCANNER-FLAKY") && attempt === 1) {
      status = "error";
      reason = "stub_transient_error";
    }
  }

  console.log(
    `[scanner-stub] contract=${request?.contractVersion} sha256=${String(
      request?.object?.sha256,
    ).slice(0, 12)}… attempt=${attempt} -> ${status}`,
  );

  res.writeHead(200, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      status,
      reason,
      scannedAt: new Date().toISOString(),
    }),
  );
});

s3.listen(S3_PORT, "127.0.0.1", () =>
  console.log(`[s3-stub] listening on http://127.0.0.1:${S3_PORT}`),
);
scanner.listen(SCANNER_PORT, "127.0.0.1", () =>
  console.log(`[scanner-stub] listening on http://127.0.0.1:${SCANNER_PORT}`),
);
