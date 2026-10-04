import { existsSync } from "node:fs";
import { createServer } from "node:http";

import { exchangeWithClamd, pingClamd } from "./clamd-transport";
import { createRequestHandler } from "./handler";

/**
 * Thin process entrypoint: wires real env/sockets/clock into the pure
 * `createRequestHandler`. Not imported by any test -- the handler, clamd
 * protocol and validate modules carry all the logic that is actually
 * unit-tested.
 */
const port = Number(process.env.PORT ?? "8080");
const clamd = {
  host: process.env.CLAMD_HOST ?? "127.0.0.1",
  port: Number(process.env.CLAMD_PORT ?? "3310"),
  timeoutMs: Number(process.env.CLAMD_TIMEOUT_MS ?? "55000"),
};
const readyMarkerPath =
  process.env.CLAMAV_READY_MARKER ?? "/var/run/clamav-ready/ready";

const handler = createRequestHandler({
  clamd,
  isReady: async () => existsSync(readyMarkerPath) && (await pingClamd(clamd)),
  exchange: exchangeWithClamd,
  log: (fields) => console.log(JSON.stringify(fields)),
});

createServer((req, res) => {
  void handler(req, res);
}).listen(port, () => {
  console.log(JSON.stringify({ event: "listening", port }));
});
