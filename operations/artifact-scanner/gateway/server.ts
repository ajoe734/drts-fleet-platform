import { readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";

import { exchangeWithClamd, versionClamd } from "./clamd-transport";
import { createRequestHandler } from "./handler";
import { createIsReady } from "./readiness";

/**
 * Thin process entrypoint: wires real env/sockets/clock/fs into the pure
 * `createRequestHandler`/`createIsReady`. Not imported by any test -- the
 * handler, clamd protocol, validate and readiness modules carry all the
 * logic that is actually unit-tested.
 */
const port = Number(process.env.PORT ?? "8080");
const clamd = {
  host: process.env.CLAMD_HOST ?? "127.0.0.1",
  port: Number(process.env.CLAMD_PORT ?? "3310"),
  timeoutMs: Number(process.env.CLAMD_TIMEOUT_MS ?? "55000"),
};
const readyMarkerPath =
  process.env.CLAMAV_READY_MARKER ?? "/var/run/clamav-ready/ready";
// Sibling file `clamd-entrypoint.sh` publishes the on-disk signature
// file's own ClamAV-VDB version alongside the marker (R8, round 3).
const readyVersionPath =
  process.env.CLAMAV_READY_VERSION_FILE ?? `${readyMarkerPath}.version`;
const maxSignatureAgeMs = Number(
  process.env.MAX_SIGNATURE_AGE_MS ?? String(6 * 60 * 60 * 1000),
);

const isReady = createIsReady({
  maxAgeMs: maxSignatureAgeMs,
  now: () => Date.now(),
  readMarkerMtimeMs: () => {
    try {
      return statSync(readyMarkerPath).mtimeMs;
    } catch {
      return null;
    }
  },
  readExpectedVersion: () => {
    try {
      const content = readFileSync(readyVersionPath, "utf8").trim();
      return content.length > 0 ? content : null;
    } catch {
      return null;
    }
  },
  queryLoadedVersion: () => versionClamd(clamd),
});

const handler = createRequestHandler({
  clamd,
  isReady,
  exchange: exchangeWithClamd,
  log: (fields) => console.log(JSON.stringify(fields)),
});

createServer((req, res) => {
  void handler(req, res);
}).listen(port, () => {
  console.log(JSON.stringify({ event: "listening", port }));
});
