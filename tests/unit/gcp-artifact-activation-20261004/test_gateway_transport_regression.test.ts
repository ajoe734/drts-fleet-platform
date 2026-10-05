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
  it("fast VERSION + fast INSTREAM -> 200, held VERSION -> 503, fast VERSION + held INSTREAM -> 502, recovery -> 200", async () => {
    let mode: "healthy" | "held_version" | "held_instream" | "connect_error" =
      "healthy";

    let scans = 0;

    const mockConnect = (options: any, onConnect: () => void) => {
      const socket = new MockSocket();
      socket.dataCallback = (data: Buffer) => {
        const cmd = data.toString("utf8");
        if (cmd === "zVERSION\0") {
          if (mode === "connect_error") {
            setTimeout(
              () => socket.emit("error", new Error("CONNECT_ERROR")),
              0,
            );
          } else if (mode === "held_version") {
            // do nothing, let it timeout
          } else {
            setTimeout(
              () =>
                socket.emit(
                  "data",
                  Buffer.from("ClamAV 1.4.6/27315/Fri Oct  3 07:33:03 2026\0"),
                ),
              0,
            );
          }
        } else if (cmd.startsWith("zINSTREAM\0")) {
          scans++;
          if (mode === "held_instream") {
            // let it timeout
          } else {
            setTimeout(
              () => socket.emit("data", Buffer.from("stream: OK\0")),
              0,
            );
          }
        }
      };
      setTimeout(onConnect, 0);
      return socket as unknown as Socket;
    };

    const clamdConfig = { host: "127.0.0.1", port: 3311, timeoutMs: 15 };

    const isReady = createIsReady({
      maxAgeMs: 6 * 60 * 60 * 1000,
      now: () => Date.now(),
      readMarkerMtimeMs: () => Date.now(),
      readExpectedVersion: () => "27315", // numeric expected DB version
      queryLoadedVersion: () => versionClamd(clamdConfig, mockConnect),
    });

    const handler = createRequestHandler({
      clamd: clamdConfig,
      isReady,
      exchange: (config, payload) =>
        exchangeWithClamd(config, payload, mockConnect),
      log: () => {},
    });

    const runReq = async () => {
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
      return { status, bodyStr };
    };

    // 1. fast VERSION + fast INSTREAM -> 200 clean, one VERSION/one scan
    mode = "healthy";
    let res = await runReq();
    expect(res.status).toBe(200);
    expect(JSON.parse(res.bodyStr).verdict).toBe("clean");
    expect(scans).toBe(1);

    // 2. held VERSION -> 503 not_ready, one VERSION/zero scans
    scans = 0;
    mode = "held_version";
    res = await runReq();
    expect(res.status).toBe(503);
    expect(JSON.parse(res.bodyStr).error).toBe("scan_engine_not_ready");
    expect(scans).toBe(0);

    // 3. fast VERSION + held INSTREAM -> 502 unavailable, one VERSION/one scan
    scans = 0;
    mode = "held_instream";
    res = await runReq();
    expect(res.status).toBe(502);
    expect(JSON.parse(res.bodyStr).error).toBe("scan_engine_unavailable");
    expect(scans).toBe(1);

    // 4. wrong port -> 503
    scans = 0;
    mode = "connect_error";
    res = await runReq();
    expect(res.status).toBe(503);
    expect(JSON.parse(res.bodyStr).error).toBe("scan_engine_not_ready");
    expect(scans).toBe(0);

    // 5. subsequent fast recovery -> 200 clean
    scans = 0;
    mode = "healthy";
    res = await runReq();
    expect(res.status).toBe(200);
    expect(JSON.parse(res.bodyStr).verdict).toBe("clean");
    expect(scans).toBe(1);
  });
});
