import { describe, it, expect } from "vitest";
import { EventEmitter } from "node:events";
import { WebSocketServerChannel } from "../../../apps/voice-media-worker/src/server/websocket-channel";

/** Minimal Duplex-shaped stub: records writes, lets the test push "received" data. */
class FakeSocket extends EventEmitter {
  readonly writes: Buffer[] = [];
  destroyed = false;
  write(chunk: Buffer | string, cb?: () => void): boolean {
    this.writes.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    cb?.();
    return true;
  }
  end(): void {
    this.destroyed = true;
  }
  destroy(): void {
    this.destroyed = true;
  }
}

/** Decodes the code from a server-written close frame (opcode 0x08, small
 * unmasked payload: 2-byte code + UTF-8 reason). */
function decodeCloseFrameCode(frame: Buffer): number {
  const len = (frame[1] ?? 0) & 0x7f;
  return frame.subarray(2, 2 + len).readUInt16BE(0);
}

function buildHeaderOnlyFrame(payloadLength: number): Buffer {
  // Text frame (0x81), unmasked, 64-bit extended length (127) header announcing
  // `payloadLength` bytes that are never actually sent -- a peer can claim an
  // arbitrary huge frame with only 10 bytes on the wire.
  const header = Buffer.alloc(10);
  header[0] = 0x81;
  header[1] = 127;
  header.writeBigUInt64BE(BigInt(payloadLength), 2);
  return header;
}

describe("AUDIT-VOICE-RUNTIME-20261002: WebSocketServerChannel frame size limit", () => {
  it("closes the channel as soon as an oversized frame length is announced, without buffering the payload", () => {
    const socket = new FakeSocket();
    const channel = new WebSocketServerChannel(socket as any, {
      maxPayloadBytes: 1024,
    });

    // Announce a frame far larger than the 1024-byte cap. Only the 10-byte
    // header is sent -- if this were buffered pending the full payload, a
    // real attacker would never need to actually send the rest to make the
    // server allocate/wait on it.
    socket.emit("data", buildHeaderOnlyFrame(50 * 1024 * 1024));

    expect(channel.destroyed).toBe(true);
    expect(socket.writes.length).toBeGreaterThan(0);
    expect(decodeCloseFrameCode(socket.writes[0]!)).toBe(1009);
  });

  it("still processes a normal, within-limit frame", () => {
    const socket = new FakeSocket();
    const channel = new WebSocketServerChannel(socket as any, {
      maxPayloadBytes: 1024,
    });

    const messages: string[] = [];
    channel.on("message", (data: string) => messages.push(data));

    const payload = Buffer.from("hello");
    const header = Buffer.alloc(2);
    header[0] = 0x81; // text, fin
    header[1] = payload.length; // unmasked, small length
    socket.emit("data", Buffer.concat([header, payload]));

    expect(messages).toEqual(["hello"]);
  });

  it("defaults to a finite cap even when maxPayloadBytes is not specified", () => {
    const socket = new FakeSocket();
    const channel = new WebSocketServerChannel(socket as any);

    // Larger than DEFAULT_WS_MAX_PAYLOAD_BYTES (1 MiB).
    socket.emit("data", buildHeaderOnlyFrame(16 * 1024 * 1024));

    expect(channel.destroyed).toBe(true);
    expect(decodeCloseFrameCode(socket.writes[0]!)).toBe(1009);
  });
});
