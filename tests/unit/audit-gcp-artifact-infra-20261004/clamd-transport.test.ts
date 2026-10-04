import { EventEmitter } from "node:events";
import type { Socket } from "node:net";

import { describe, expect, it } from "vitest";

import {
  exchangeWithClamd,
  pingClamd,
} from "../../../operations/artifact-scanner/gateway/clamd-transport";

/**
 * No real socket is ever opened in this file: `connect` is injected, and
 * this fake is a plain in-memory EventEmitter, matching the project rule
 * that only pure protocol/gateway functions are exercised offline -- an
 * actual clamd listener is a hosted-only check (see
 * docs/04-uat/audit-gcp-artifact-infra-20261004.md).
 */
class FakeSocket extends EventEmitter {
  written: Buffer[] = [];
  destroyed = false;
  write(data: Buffer): void {
    this.written.push(data);
  }
  destroy(): void {
    this.destroyed = true;
  }
}

function fakeConnect(script: (socket: FakeSocket) => void) {
  let created: FakeSocket | undefined;
  const connect = (
    _options: { host: string; port: number },
    onConnect: () => void,
  ): Socket => {
    const socket = new FakeSocket();
    created = socket;
    queueMicrotask(() => {
      onConnect();
      script(socket);
    });
    return socket as unknown as Socket;
  };
  return { connect, socket: () => created as FakeSocket };
}

const CONFIG = { host: "127.0.0.1", port: 3310, timeoutMs: 50 };

describe("exchangeWithClamd", () => {
  it("resolves with the decoded reply once the socket sends a null-terminated response", async () => {
    const { connect } = fakeConnect((socket) => {
      socket.emit("data", Buffer.from("stream: OK\0"));
    });
    await expect(exchangeWithClamd(CONFIG, Buffer.from("payload"), connect)).resolves.toBe(
      "stream: OK",
    );
  });

  it("writes exactly the supplied payload to the socket", async () => {
    const payload = Buffer.from("zINSTREAM\0test");
    const { connect, socket } = fakeConnect((s) => {
      s.emit("data", Buffer.from("stream: OK\0"));
    });
    await exchangeWithClamd(CONFIG, payload, connect);
    expect(socket().written).toEqual([payload]);
  });

  it("rejects when the socket reports a transport error", async () => {
    const { connect } = fakeConnect((socket) => {
      socket.emit("error", new Error("ECONNREFUSED"));
    });
    await expect(exchangeWithClamd(CONFIG, Buffer.from("x"), connect)).rejects.toThrow(
      "ECONNREFUSED",
    );
  });

  it("rejects when the socket closes before a complete reply arrives", async () => {
    const { connect } = fakeConnect((socket) => {
      socket.emit("data", Buffer.from("stream: O"));
      socket.emit("close");
    });
    await expect(exchangeWithClamd(CONFIG, Buffer.from("x"), connect)).rejects.toThrow(
      /closed without a complete verdict/,
    );
  });

  it("rejects when the response exceeds the reply size limit", async () => {
    const { connect } = fakeConnect((socket) => {
      socket.emit("data", Buffer.alloc(4097, 65)); // no null terminator, over the cap
    });
    await expect(exchangeWithClamd(CONFIG, Buffer.from("x"), connect)).rejects.toThrow(
      /exceeds limit/,
    );
  });

  it("rejects when data follows the null terminator instead of the socket going quiet", async () => {
    const { connect } = fakeConnect((socket) => {
      socket.emit("data", Buffer.concat([Buffer.from("stream: OK\0"), Buffer.from("trailing")]));
    });
    await expect(exchangeWithClamd(CONFIG, Buffer.from("x"), connect)).rejects.toThrow(
      /trailing clamd data/,
    );
  });

  it("rejects once the configured timeout elapses with no reply", async () => {
    const { connect } = fakeConnect(() => {
      /* never emits anything */
    });
    await expect(exchangeWithClamd(CONFIG, Buffer.from("x"), connect)).rejects.toThrow(
      /timed out/,
    );
  });

  it("rejects when connect throws synchronously", async () => {
    const connect = (): Socket => {
      throw new Error("resolve failed");
    };
    await expect(exchangeWithClamd(CONFIG, Buffer.from("x"), connect)).rejects.toThrow(
      "resolve failed",
    );
  });
});

describe("pingClamd", () => {
  it("resolves true only for a literal PONG reply", async () => {
    const { connect } = fakeConnect((socket) => {
      socket.emit("data", Buffer.from("PONG\0"));
    });
    await expect(pingClamd(CONFIG, connect)).resolves.toBe(true);
  });

  it("writes the documented zPING command", async () => {
    const { connect, socket } = fakeConnect((s) => {
      s.emit("data", Buffer.from("PONG\0"));
    });
    await pingClamd(CONFIG, connect);
    expect(socket().written).toEqual([Buffer.from("zPING\0")]);
  });

  it("resolves false for any non-PONG reply", async () => {
    const { connect } = fakeConnect((socket) => {
      socket.emit("data", Buffer.from("ERROR\0"));
    });
    await expect(pingClamd(CONFIG, connect)).resolves.toBe(false);
  });

  it("resolves false on socket error, close or timeout rather than throwing", async () => {
    const error = fakeConnect((socket) => socket.emit("error", new Error("down")));
    await expect(pingClamd(CONFIG, error.connect)).resolves.toBe(false);

    const close = fakeConnect((socket) => socket.emit("close"));
    await expect(pingClamd(CONFIG, close.connect)).resolves.toBe(false);

    const silent = fakeConnect(() => {});
    await expect(pingClamd(CONFIG, silent.connect)).resolves.toBe(false);
  });
});
