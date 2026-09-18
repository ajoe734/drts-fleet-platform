import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import type { Duplex } from "node:stream";

const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

export interface WebSocketChannelOptions {
  timeoutMs?: number | undefined;
}

export class WebSocketServerChannel extends EventEmitter {
  private readonly socket: Duplex;
  private readonly timeoutMs: number;
  private timer: NodeJS.Timeout | null = null;
  private buffer: Buffer = Buffer.alloc(0);
  private isClosed = false;

  constructor(socket: Duplex, options?: WebSocketChannelOptions) {
    super();
    this.socket = socket;
    this.timeoutMs = options?.timeoutMs ?? 300_000; // default 5 min

    this.socket.on("data", (chunk: Buffer) => this.handleData(chunk));
    this.socket.on("close", () => this.handleClose());
    this.socket.on("error", (err: Error) => this.emit("error", err));

    this.resetTimeout();
  }

  get remoteAddress(): string | undefined {
    return (this.socket as { remoteAddress?: string }).remoteAddress;
  }

  get destroyed(): boolean {
    return this.socket.destroyed || this.isClosed;
  }

  resetTimeout(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    if (this.timeoutMs > 0 && !this.isClosed) {
      this.timer = setTimeout(() => {
        this.emit("timeout");
        this.close(1000, "Idle timeout exceeded");
      }, this.timeoutMs);
    }
  }

  sendText(text: string): void {
    if (this.isClosed || this.socket.destroyed) return;
    const payload = Buffer.from(text, "utf8");
    const frame = this.encodeFrame(0x01, payload);
    this.socket.write(frame);
  }

  sendBinary(data: Buffer): void {
    if (this.isClosed || this.socket.destroyed) return;
    const frame = this.encodeFrame(0x02, data);
    this.socket.write(frame);
  }

  ping(): void {
    if (this.isClosed || this.socket.destroyed) return;
    const frame = this.encodeFrame(0x09, Buffer.alloc(0));
    this.socket.write(frame);
  }

  pong(): void {
    if (this.isClosed || this.socket.destroyed) return;
    const frame = this.encodeFrame(0x0a, Buffer.alloc(0));
    this.socket.write(frame);
  }

  close(code = 1000, reason = ""): void {
    if (this.isClosed) return;
    this.isClosed = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    const reasonBuf = Buffer.from(reason, "utf8");
    const payload = Buffer.alloc(2 + reasonBuf.length);
    payload.writeUInt16BE(code, 0);
    reasonBuf.copy(payload, 2);

    try {
      const frame = this.encodeFrame(0x08, payload);
      this.socket.write(frame, () => {
        this.socket.end();
      });
    } catch {
      this.socket.destroy();
    }
  }

  private encodeFrame(opcode: number, payload: Buffer): Buffer {
    const length = payload.length;
    let headerLength = 2;
    if (length > 65535) {
      headerLength += 8;
    } else if (length > 125) {
      headerLength += 2;
    }

    const header = Buffer.alloc(headerLength);
    header[0] = 0x80 | (opcode & 0x0f);

    if (length > 65535) {
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(length), 2);
    } else if (length > 125) {
      header[1] = 126;
      header.writeUInt16BE(length, 2);
    } else {
      header[1] = length;
    }

    return Buffer.concat([header, payload]);
  }

  private handleData(chunk: Buffer): void {
    this.resetTimeout();
    this.buffer = Buffer.concat([this.buffer, chunk]);

    while (this.buffer.length >= 2) {
      const b0 = this.buffer[0];
      const b1 = this.buffer[1];
      if (b0 === undefined || b1 === undefined) return;

      const opcode = b0 & 0x0f;
      const isMasked = (b1 & 0x80) !== 0;
      let payloadLength = b1 & 0x7f;
      let offset = 2;

      if (payloadLength === 126) {
        if (this.buffer.length < 4) return;
        payloadLength = this.buffer.readUInt16BE(2);
        offset = 4;
      } else if (payloadLength === 127) {
        if (this.buffer.length < 10) return;
        payloadLength = Number(this.buffer.readBigUInt64BE(2));
        offset = 10;
      }

      let maskKey: Buffer | null = null;
      if (isMasked) {
        if (this.buffer.length < offset + 4) return;
        maskKey = this.buffer.subarray(offset, offset + 4);
        offset += 4;
      }

      if (this.buffer.length < offset + payloadLength) {
        return;
      }

      let payload = this.buffer.subarray(offset, offset + payloadLength);
      if (isMasked && maskKey) {
        const unmasked = Buffer.alloc(payload.length);
        for (let i = 0; i < payload.length; i++) {
          const pByte = payload[i] ?? 0;
          const mByte = maskKey[i % 4] ?? 0;
          unmasked[i] = pByte ^ mByte;
        }
        payload = unmasked;
      }

      this.buffer = this.buffer.subarray(offset + payloadLength);
      this.processFrame(opcode, payload);
    }
  }

  private processFrame(opcode: number, payload: Buffer): void {
    switch (opcode) {
      case 0x01: // Text
        this.emit("message", payload.toString("utf8"), false);
        break;
      case 0x02: // Binary
        this.emit("message", payload, true);
        break;
      case 0x08: {
        // Close
        const code = payload.length >= 2 ? payload.readUInt16BE(0) : 1000;
        const reason =
          payload.length > 2 ? payload.subarray(2).toString("utf8") : "";
        this.close(code, reason);
        this.emit("close", code, reason);
        break;
      }
      case 0x09: // Ping
        this.pong();
        this.emit("ping", payload);
        break;
      case 0x0a: // Pong
        this.emit("pong", payload);
        break;
      default:
        break;
    }
  }

  private handleClose(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.isClosed) {
      this.isClosed = true;
      this.emit("close", 1006, "Abnormal closure");
    }
  }
}

export function completeWebSocketHandshake(
  secWebSocketKey: string | undefined,
  socket: Duplex,
  options?: WebSocketChannelOptions,
): WebSocketServerChannel | null {
  if (!secWebSocketKey) {
    socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
    socket.destroy();
    return null;
  }

  const acceptKey = createHash("sha1")
    .update(secWebSocketKey + WS_GUID)
    .digest("base64");

  const responseHeaders = [
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${acceptKey}`,
    "\r\n",
  ].join("\r\n");

  socket.write(responseHeaders);
  return new WebSocketServerChannel(socket, options);
}
