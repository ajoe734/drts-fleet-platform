import { describe, it, expect } from "vitest";
import * as http from "node:http";
import { MediaWorkerServer } from "../../../apps/voice-media-worker/src/server/media-worker-server";
import { VOICE_MEDIA_INTERNAL_KEY_HEADER } from "../../../apps/voice-media-worker/src/server/internal-auth";
import { FakeCallAuthority } from "./fake-call-authority";

/**
 * Codex review round 3 (reopen, AUDIT-VOICE-RUNTIME-20261002) R5:
 * `admitSession` reserves a slot in `activeSessions` at `POST /sessions`
 * time, but nothing freed that reservation if the grant was never consumed
 * -- an expired grant, a session that never attempts to attach at all, or
 * a failed handshake (e.g. a missing `Sec-WebSocket-Key`) all left the slot
 * held forever, leaking capacity. `VoiceMediaSessionAuthority` now emits
 * `grant.expired` once a pending grant's TTL elapses without being
 * consumed, and `MediaWorkerServer` frees the matching reservation (only
 * when no channel ever attached) in response. These tests exercise the
 * real worker end to end -- a real HTTP server, real upgrade listener, a
 * real grant-TTL timer -- never a channel-in-isolation unit.
 */

const INTERNAL_KEY = "test-internal-key-grant-expiry";

async function startServer(sessionGrantTtlMs: number) {
  const callAuthority = new FakeCallAuthority();
  const server = new MediaWorkerServer({
    port: 0,
    internalKey: INTERNAL_KEY,
    maxConcurrentSessions: 1,
    sessionGrantTtlMs,
    callAuthorityVerifier: callAuthority,
  });
  const port = await server.start();
  return { server, port, callAuthority };
}

async function admit(
  port: number,
  callAuthority: FakeCallAuthority,
  sessionId: string,
): Promise<{ status: number; token?: string }> {
  const { token } = callAuthority.issue(sessionId);
  const res = await fetch(`http://127.0.0.1:${port}/sessions`, {
    method: "POST",
    headers: { [VOICE_MEDIA_INTERNAL_KEY_HEADER]: INTERNAL_KEY },
    body: JSON.stringify({ callAuthorityToken: token }),
  });
  if (res.status !== 201) return { status: res.status };
  return { status: res.status, token };
}

function attemptWsUpgradeNoKey(
  port: number,
  sessionId: string,
): Promise<{ statusCode: number; upgraded: boolean }> {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: "127.0.0.1",
      port,
      path: `/ws?sessionId=${sessionId}`,
      method: "GET",
      headers: {
        Connection: "Upgrade",
        Upgrade: "websocket",
        // Deliberately missing Sec-WebSocket-Key -- a failed handshake
        // after the server has already authenticated and resolved the
        // session, not a rejected caller.
        "Sec-WebSocket-Version": "13",
        [VOICE_MEDIA_INTERNAL_KEY_HEADER]: INTERNAL_KEY,
      },
    });
    req.on("upgrade", (res, socket) => {
      resolve({ statusCode: res.statusCode ?? 0, upgraded: true });
      socket.destroy();
    });
    req.on("response", (res) => {
      resolve({ statusCode: res.statusCode ?? 0, upgraded: false });
      res.resume();
    });
    req.on("error", reject);
    req.end();
  });
}

describe("AUDIT-VOICE-RUNTIME-20261002: session-grant expiry frees admission capacity", () => {
  it("frees the reservation once the grant expires without ever being attached, allowing a replacement admission", async () => {
    const { server, port, callAuthority } = await startServer(300);
    try {
      const admitted = await admit(port, callAuthority, "sess-never-attach");
      expect(admitted.status).toBe(201);
      expect(server.sessionCount).toBe(1);

      const blocked = await admit(port, callAuthority, "sess-blocked");
      expect(blocked.status).toBe(503);

      const closed = new Promise<{ sessionId: string; reason: string }>(
        (resolve) => {
          server.once(
            "session.closed",
            (evt: { sessionId: string; code: number; reason: string }) => {
              resolve(evt);
            },
          );
        },
      );
      const closeEvent = await closed;
      expect(closeEvent.sessionId).toBe("sess-never-attach");
      expect(closeEvent.reason).toBe("grant_expired");
      expect(server.sessionCount).toBe(0);

      const replacement = await admit(port, callAuthority, "sess-replacement");
      expect(replacement.status).toBe(201);
      expect(server.sessionCount).toBe(1);
    } finally {
      await server.stop();
    }
  });

  it("frees the reservation once the grant expires after a failed handshake (missing Sec-WebSocket-Key)", async () => {
    const { server, port, callAuthority } = await startServer(300);
    try {
      const admitted = await admit(
        port,
        callAuthority,
        "sess-failed-handshake",
      );
      expect(admitted.status).toBe(201);

      const result = await attemptWsUpgradeNoKey(port, "sess-failed-handshake");
      expect(result.upgraded).toBe(false);
      expect(result.statusCode).toBe(400);
      // The failed handshake alone must not immediately free the slot --
      // the same grant could still be retried successfully until it
      // actually expires.
      expect(server.sessionCount).toBe(1);

      const closed = new Promise<{ sessionId: string }>((resolve) => {
        server.once(
          "session.closed",
          (evt: { sessionId: string; reason: string }) => {
            resolve(evt);
          },
        );
      });
      await closed;
      expect(server.sessionCount).toBe(0);

      const replacement = await admit(port, callAuthority, "sess-recovered");
      expect(replacement.status).toBe(201);
    } finally {
      await server.stop();
    }
  });

  it("does not free an already-attached session's slot when its grant's original TTL elapses", async () => {
    const { server, port, callAuthority } = await startServer(300);
    try {
      const { token } = callAuthority.issue("sess-attached-survives");
      const res = await fetch(`http://127.0.0.1:${port}/sessions`, {
        method: "POST",
        headers: { [VOICE_MEDIA_INTERNAL_KEY_HEADER]: INTERNAL_KEY },
        body: JSON.stringify({ callAuthorityToken: token }),
      });
      expect(res.status).toBe(201);
      const { grant } = (await res.json()) as { grant: { token: string } };

      const socket = await new Promise<import("node:net").Socket>(
        (resolve, reject) => {
          const req = http.request({
            host: "127.0.0.1",
            port,
            path: `/ws?sessionId=sess-attached-survives&grant=${grant.token}`,
            method: "GET",
            headers: {
              Connection: "Upgrade",
              Upgrade: "websocket",
              "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
              "Sec-WebSocket-Version": "13",
              [VOICE_MEDIA_INTERNAL_KEY_HEADER]: INTERNAL_KEY,
            },
          });
          req.on("upgrade", (upgradeRes, sock) => {
            if (upgradeRes.statusCode !== 101) {
              reject(new Error(`attach failed: ${upgradeRes.statusCode}`));
              return;
            }
            resolve(sock);
          });
          req.on("error", reject);
          req.end();
        },
      );

      // Wait past the original grant TTL -- the session is already
      // attached, so the (already-cleared) expiry timer must not touch it.
      await new Promise((resolve) => setTimeout(resolve, 320));
      expect(server.sessionCount).toBe(1);

      socket.destroy();
    } finally {
      await server.stop();
    }
  });
});
