import { connect as connectTcp, type Socket } from "node:net";

export interface ClamdTransportConfig {
  host: string;
  port: number;
  timeoutMs: number;
}

/**
 * Both `connect` parameters default to the real `node:net` socket and are
 * only ever overridden by tests, which inject a fake in-memory
 * EventEmitter-shaped stand-in instead -- no real socket is opened by the
 * local test suite, matching the project rule that only pure
 * protocol/gateway functions are exercised offline; an actual clamd
 * listener is a hosted-only check.
 */
type Connector = (
  options: { host: string; port: number },
  onConnect: () => void,
) => Socket;

const MAX_REPLY_BYTES = 4096;

/** Bounded single request against the clamd sidecar on this same Cloud Run
 * instance's loopback interface -- never reachable from outside it. */
export function exchangeWithClamd(
  config: ClamdTransportConfig,
  payload: Buffer,
  connect: Connector = connectTcp,
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
      else resolve(reply as string);
    };
    const timer = setTimeout(
      () => finish(new Error("Clamd request timed out.")),
      config.timeoutMs,
    );
    try {
      socket = connect({ host: config.host, port: config.port }, () =>
        socket!.write(payload),
      );
      socket.on("error", (error) => finish(error));
      socket.on("close", () => {
        if (!settled) finish(new Error("Clamd closed without a complete verdict."));
      });
      socket.on("data", (chunk: Buffer) => {
        response = Buffer.concat([response, chunk]);
        if (response.length > MAX_REPLY_BYTES) {
          finish(new Error("Clamd response exceeds limit."));
          return;
        }
        const end = response.indexOf(0);
        if (end >= 0) {
          if (end !== response.length - 1) {
            finish(new Error("Unexpected trailing clamd data."));
            return;
          }
          finish(undefined, response.subarray(0, end).toString("utf8"));
        }
      });
    } catch (error) {
      finish(error instanceof Error ? error : new Error("Clamd connection failed."));
    }
  });
}

/**
 * clamd's documented `zVERSION\0` idle command, e.g. a reply of
 * `ClamAV 1.4.6/27315/Fri Oct  3 07:33:03 2026`. The second slash-delimited
 * field is the loaded database's own version number -- the only live proof
 * that the RUNNING engine (not merely the on-disk signature file) has
 * actually activated a given signature update (R8, round 3): the real
 * clamd (clamd/server-th.c) retains its previous engine on a failed
 * reload, so a successful freshclam write, a reload request, or
 * `SelfCheck` merely being scheduled are never sufficient proof that
 * activation completed. Resolves `null` on any malformed reply, transport
 * error, close or timeout -- exactly like `pingClamd`, never throws.
 */
export function versionClamd(
  config: ClamdTransportConfig,
  connect: Connector = connectTcp,
): Promise<string | null> {
  return new Promise((resolve) => {
    let socket: Socket | undefined;
    let response = Buffer.alloc(0);
    let settled = false;
    const finish = (result: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket?.destroy();
      resolve(result);
    };
    const timer = setTimeout(() => finish(null), config.timeoutMs);
    try {
      socket = connect({ host: config.host, port: config.port }, () =>
        socket!.write(Buffer.from("zVERSION\0")),
      );
      socket.on("error", () => finish(null));
      socket.on("close", () => finish(null));
      socket.on("data", (chunk: Buffer) => {
        response = Buffer.concat([response, chunk]);
        const end = response.indexOf(0);
        if (end >= 0) {
          const reply = response.subarray(0, end).toString("utf8");
          const match = /^ClamAV [^/]+\/([^/]+)\//.exec(reply);
          finish(match ? (match[1] ?? null) : null);
        }
      });
    } catch {
      finish(null);
    }
  });
}

/**
 * clamd's documented `zPING\0` idle command. A real `PONG` is the only
 * accepted reply -- a clean socket close, a timeout or anything else means
 * the engine is not actually ready to serve scans, and `/health` must say
 * so rather than assume readiness from the sidecar container merely being
 * up.
 */
export function pingClamd(
  config: ClamdTransportConfig,
  connect: Connector = connectTcp,
): Promise<boolean> {
  return new Promise((resolve) => {
    let socket: Socket | undefined;
    let response = Buffer.alloc(0);
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket?.destroy();
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), config.timeoutMs);
    try {
      socket = connect({ host: config.host, port: config.port }, () =>
        socket!.write(Buffer.from("zPING\0")),
      );
      socket.on("error", () => finish(false));
      socket.on("close", () => finish(false));
      socket.on("data", (chunk: Buffer) => {
        response = Buffer.concat([response, chunk]);
        const end = response.indexOf(0);
        if (end >= 0) finish(response.subarray(0, end).toString("utf8") === "PONG");
      });
    } catch {
      finish(false);
    }
  });
}
