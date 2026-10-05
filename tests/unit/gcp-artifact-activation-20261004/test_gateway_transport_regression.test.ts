import { describe, expect, it } from "vitest";
import { createRequestHandler } from "../../../operations/artifact-scanner/gateway/handler";
import { createIsReady } from "../../../operations/artifact-scanner/gateway/readiness";
import {
  exchangeWithClamd,
  versionClamd,
} from "../../../operations/artifact-scanner/gateway/clamd-transport";
import type { Socket } from "node:net";
import { EventEmitter } from "node:events";

class MockSocket extends EventEmitter {
  public dataCallback?: (data: Buffer) => void;
  write(data: Buffer) {
    if (this.dataCallback) this.dataCallback(data);
    return true;
  }
  destroy() {}
}

describe("Gateway Transport Regression (R5b.2)", () => {
  it("wrong-port scenario should yield 503 scan_engine_not_ready, not 502", async () => {
    // If the port is wrong, connect will throw an error immediately, or timeout.
    // Let's simulate a connection error on connect.
    const connectFail = () => {
      const socket = new MockSocket();
      setTimeout(() => socket.emit("error", new Error("CONNECT_ERROR3311")), 0);
      return socket as unknown as Socket;
    };

    const clamdConfig = { host: "127.0.0.1", port: 3311, timeoutMs: 1000 };

    const isReady = createIsReady({
      maxAgeMs: 6 * 60 * 60 * 1000,
      now: () => Date.now(),
      readMarkerMtimeMs: () => Date.now(),
      readExpectedVersion: () => "ClamAV 1.4.6/27315",
      queryLoadedVersion: () => versionClamd(clamdConfig, connectFail),
    });

    const handler = createRequestHandler({
      clamd: clamdConfig,
      isReady,
      exchange: (config, payload) =>
        exchangeWithClamd(config, payload, connectFail),
      log: () => {},
    });

    let status = 0;
    let bodyStr = "";
    const req = new EventEmitter() as any;
    req.method = "POST";
    req.url = "/scan";
    req.headers = {
      "content-type": "application/pdf",
      "x-content-sha256":
        "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
    };

    const res = {
      writeHead: (s: number) => {
        status = s;
      },
      end: (b: string) => {
        bodyStr = b;
      },
      headersSent: false,
    } as any;

    const handlerPromise = handler(req, res);
    req.emit("data", Buffer.from("test"));
    req.emit("end");
    await handlerPromise;

    expect(status).toBe(503);
    expect(JSON.parse(bodyStr)).toEqual({ error: "scan_engine_not_ready" });
  });
});
