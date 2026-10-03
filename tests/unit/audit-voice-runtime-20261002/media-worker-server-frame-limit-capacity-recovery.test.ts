import { describe, it, expect } from "vitest";
import * as http from "node:http";
import type { Socket } from "node:net";
import { MediaWorkerServer } from "../../../apps/voice-media-worker/src/server/media-worker-server";
import { VOICE_MEDIA_INTERNAL_KEY_HEADER } from "../../../apps/voice-media-worker/src/server/internal-auth";
import { FakeCallAuthority } from "./fake-call-authority";

/**
 * Codex review round 1 (reopen, AUDIT-VOICE-RUNTIME-20261002) R3:
 * `WebSocketServerChannel.close()` set `isClosed` before the underlying
 * socket's own "close" event fired, so `handleClose()` saw `isClosed` already
 * true and never emitted the "close" event `MediaWorkerServer` relies on to
 * free the session slot. A size-limit closure therefore left the session
 * counted as active forever, leaking capacity. This exercises the real
 * worker upgrade listener end to end (not just the channel in isolation).
 */

const INTERNAL_KEY = "test-internal-key-capacity-recovery";

async function startServer() {
  const callAuthority = new FakeCallAuthority();
  const server = new MediaWorkerServer({
    port: 0,
    internalKey: INTERNAL_KEY,
    maxConcurrentSessions: 1,
    maxWsFrameBytes: 8,
    wsTimeoutMs: 0,
    callAuthorityVerifier: callAuthority,
  });
  const port = await server.start();
  return { server, port, callAuthority };
}

async function admit(
  port: number,
  callAuthority: FakeCallAuthority,
  sessionId: string,
): Promise<{ status: number; grant?: { token: string } }> {
  const { token } = callAuthority.issue(sessionId);
  const res = await fetch(`http://127.0.0.1:${port}/sessions`, {
    method: "POST",
    headers: { [VOICE_MEDIA_INTERNAL_KEY_HEADER]: INTERNAL_KEY },
    body: JSON.stringify({ callAuthorityToken: token }),
  });
  if (res.status !== 201) return { status: res.status };
  const body = (await res.json()) as { grant: { token: string } };
  return { status: res.status, grant: body.grant };
}

function attach(
  port: number,
  sessionId: string,
  token: string,
): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: "127.0.0.1",
      port,
      path: `/ws?sessionId=${sessionId}&grant=${token}`,
      method: "GET",
      headers: {
        Connection: "Upgrade",
        Upgrade: "websocket",
        "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
        "Sec-WebSocket-Version": "13",
        [VOICE_MEDIA_INTERNAL_KEY_HEADER]: INTERNAL_KEY,
      },
    });
    req.on("upgrade", (res, socket: Socket) => {
      if (res.statusCode !== 101) {
        reject(new Error(`attach failed: ${res.statusCode}`));
        return;
      }
      resolve(socket);
    });
    req.on("response", (res) => {
      reject(new Error(`attach failed: ${res.statusCode}`));
      res.resume();
    });
    req.on("error", reject);
    req.end();
  });
}

describe("AUDIT-VOICE-RUNTIME-20261002: worker session capacity recovers after a frame-size-limit closure", () => {
  it("frees the admitted session slot once an oversized frame closes the channel, allowing a replacement admission", async () => {
    const { server, port, callAuthority } = await startServer();
    try {
      const admitted = await admit(port, callAuthority, "sess-cap-1");
      expect(admitted.status).toBe(201);
      const socket = await attach(port, "sess-cap-1", admitted.grant!.token);
      expect(server.sessionCount).toBe(1);

      const closed = new Promise<{ sessionId: string; code: number }>(
        (resolve) => {
          server.once(
            "session.closed",
            (evt: { sessionId: string; code: number; reason: string }) => {
              resolve(evt);
            },
          );
        },
      );

      // Announce a 9-byte masked binary frame (opcode 0x02, MASK bit set,
      // declared length 9) while maxWsFrameBytes=8. The rest of the frame
      // is never sent -- the server must close as soon as the length is
      // known, never waiting on bytes that would never arrive.
      socket.write(Buffer.from([0x82, 0x89]));

      const closeEvent = await closed;
      expect(closeEvent.sessionId).toBe("sess-cap-1");
      expect(closeEvent.code).toBe(1009);
      expect(server.sessionCount).toBe(0);

      const replacement = await admit(port, callAuthority, "sess-cap-2");
      expect(replacement.status).toBe(201);
      expect(server.sessionCount).toBe(1);

      socket.destroy();
    } finally {
      await server.stop();
    }
  });
});
