import { describe, it, expect, afterEach } from "vitest";
import * as http from "node:http";
import { MediaWorkerServer } from "../../../apps/voice-media-worker/src/server/media-worker-server";
import { VOICE_MEDIA_INTERNAL_KEY_HEADER } from "../../../apps/voice-media-worker/src/server/internal-auth";
import { FakeCallAuthority } from "./fake-call-authority";

const ORIGINAL_ENV = { ...process.env };

function resetEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  Object.assign(process.env, ORIGINAL_ENV);
}

const INTERNAL_KEY = "test-internal-key-001";

async function startServer(
  overrides: ConstructorParameters<typeof MediaWorkerServer>[0] = {},
) {
  const callAuthority =
    overrides.callAuthorityVerifier ?? new FakeCallAuthority();
  const server = new MediaWorkerServer({
    port: 0,
    internalKey: INTERNAL_KEY,
    ...overrides,
    callAuthorityVerifier: callAuthority,
  });
  const port = await server.start();
  return { server, port, callAuthority: callAuthority as FakeCallAuthority };
}

describe("AUDIT-VOICE-RUNTIME-20261002: media worker caller/session authorization", () => {
  afterEach(resetEnv);

  it("rejects /drain, /sessions, and /recording/finalize without the internal key header", async () => {
    const { server, port } = await startServer();
    try {
      const drainRes = await fetch(`http://127.0.0.1:${port}/drain`, {
        method: "POST",
      });
      expect(drainRes.status).toBe(401);

      const sessionsRes = await fetch(`http://127.0.0.1:${port}/sessions`, {
        method: "POST",
        body: "{}",
      });
      expect(sessionsRes.status).toBe(401);

      const finalizeRes = await fetch(
        `http://127.0.0.1:${port}/recording/finalize`,
        { method: "POST", body: "{}" },
      );
      expect(finalizeRes.status).toBe(401);
    } finally {
      await server.stop();
    }
  });

  it("rejects an incorrect internal key with 401", async () => {
    const { server, port } = await startServer();
    try {
      const res = await fetch(`http://127.0.0.1:${port}/sessions`, {
        method: "POST",
        headers: { [VOICE_MEDIA_INTERNAL_KEY_HEADER]: "wrong-key" },
        body: "{}",
      });
      expect(res.status).toBe(401);
    } finally {
      await server.stop();
    }
  });

  it("admits a session when the correct internal key and a valid call-authority token are presented, and issues a session grant", async () => {
    const { server, port, callAuthority } = await startServer();
    try {
      const { token } = callAuthority.issue("sess-ok-1");
      const res = await fetch(`http://127.0.0.1:${port}/sessions`, {
        method: "POST",
        headers: { [VOICE_MEDIA_INTERNAL_KEY_HEADER]: INTERNAL_KEY },
        body: JSON.stringify({ callAuthorityToken: token }),
      });
      expect(res.status).toBe(201);
      expect(server.sessionCount).toBe(1);
      const body = (await res.json()) as {
        session: { sessionId: string };
        grant: { token: string; epoch: number; expiresAt: number };
      };
      expect(body.session.sessionId).toBe("sess-ok-1");
      expect(typeof body.grant.token).toBe("string");
      expect(body.grant.token.length).toBeGreaterThan(0);
      expect(typeof body.grant.epoch).toBe("number");
    } finally {
      await server.stop();
    }
  });

  /**
   * Codex review round 3 (reopen, AUDIT-VOICE-RUNTIME-20261002) R2: holding
   * only the shared operations key proves nothing about which specific
   * session/scope the caller is entitled to. `sessionId`/`scope` must be
   * resolved from a verified call-authority token, not trusted from the
   * request body.
   */
  it("rejects admission when no call-authority verifier is configured, even with a valid internal key (fail closed, not trust-the-body)", async () => {
    const server = new MediaWorkerServer({
      port: 0,
      internalKey: INTERNAL_KEY,
    });
    const port = await server.start();
    try {
      const res = await fetch(`http://127.0.0.1:${port}/sessions`, {
        method: "POST",
        headers: { [VOICE_MEDIA_INTERNAL_KEY_HEADER]: INTERNAL_KEY },
        body: JSON.stringify({ sessionId: "attacker-declared-session" }),
      });
      expect(res.status).toBe(503);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe("VOICE_MEDIA_CALL_AUTHORITY_NOT_CONFIGURED");
      expect(server.sessionCount).toBe(0);
    } finally {
      await server.stop();
    }
  });

  it("rejects admission with a valid internal key but no call-authority token (operations-key-only is not enough)", async () => {
    const { server, port } = await startServer();
    try {
      const res = await fetch(`http://127.0.0.1:${port}/sessions`, {
        method: "POST",
        headers: { [VOICE_MEDIA_INTERNAL_KEY_HEADER]: INTERNAL_KEY },
        body: JSON.stringify({ sessionId: "attacker-declared-session" }),
      });
      expect(res.status).toBe(401);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe("VOICE_MEDIA_CALL_AUTHORITY_TOKEN_REQUIRED");
      expect(server.sessionCount).toBe(0);
    } finally {
      await server.stop();
    }
  });

  it("rejects admission with an unknown/forged call-authority token", async () => {
    const { server, port } = await startServer();
    try {
      const res = await fetch(`http://127.0.0.1:${port}/sessions`, {
        method: "POST",
        headers: { [VOICE_MEDIA_INTERNAL_KEY_HEADER]: INTERNAL_KEY },
        body: JSON.stringify({ callAuthorityToken: "forged-token" }),
      });
      expect(res.status).toBe(403);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe("VOICE_MEDIA_CALL_AUTHORITY_INVALID");
      expect(server.sessionCount).toBe(0);
    } finally {
      await server.stop();
    }
  });

  it("admits under the session id resolved from the token's claims, ignoring any different sessionId the caller declares in the body", async () => {
    const { server, port, callAuthority } = await startServer();
    try {
      const { token } = callAuthority.issue("sess-authoritative-id");
      const res = await fetch(`http://127.0.0.1:${port}/sessions`, {
        method: "POST",
        headers: { [VOICE_MEDIA_INTERNAL_KEY_HEADER]: INTERNAL_KEY },
        body: JSON.stringify({
          callAuthorityToken: token,
          sessionId: "attacker-chosen-session-id",
        }),
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as { session: { sessionId: string } };
      expect(body.session.sessionId).toBe("sess-authoritative-id");
    } finally {
      await server.stop();
    }
  });

  it("keeps /health and /ready public (no internal key required)", async () => {
    const { server, port } = await startServer();
    try {
      const health = await fetch(`http://127.0.0.1:${port}/health`);
      expect(health.status).toBe(200);
      const ready = await fetch(`http://127.0.0.1:${port}/ready`);
      expect(ready.status).toBe(200);
    } finally {
      await server.stop();
    }
  });

  it("rejects admitting a second session with an already-active sessionId (session hijack/collision guard)", async () => {
    const { server, port, callAuthority } = await startServer();
    try {
      const firstToken = callAuthority.issue("sess-dup-1").token;
      const first = await fetch(`http://127.0.0.1:${port}/sessions`, {
        method: "POST",
        headers: { [VOICE_MEDIA_INTERNAL_KEY_HEADER]: INTERNAL_KEY },
        body: JSON.stringify({ callAuthorityToken: firstToken }),
      });
      expect(first.status).toBe(201);

      const secondToken = callAuthority.issue("sess-dup-1").token;
      const second = await fetch(`http://127.0.0.1:${port}/sessions`, {
        method: "POST",
        headers: { [VOICE_MEDIA_INTERNAL_KEY_HEADER]: INTERNAL_KEY },
        body: JSON.stringify({ callAuthorityToken: secondToken }),
      });
      expect(second.status).toBe(409);
      expect(server.sessionCount).toBe(1);
    } finally {
      await server.stop();
    }
  });

  it("rejects a /sessions body larger than the configured limit with 413", async () => {
    const { server, port } = await startServer({ maxHttpBodyBytes: 64 });
    try {
      const oversizedMetadata = "x".repeat(1024);
      const res = await fetch(`http://127.0.0.1:${port}/sessions`, {
        method: "POST",
        headers: { [VOICE_MEDIA_INTERNAL_KEY_HEADER]: INTERNAL_KEY },
        body: JSON.stringify({ metadata: { note: oversizedMetadata } }),
      });
      expect(res.status).toBe(413);
      expect(server.sessionCount).toBe(0);
    } finally {
      await server.stop();
    }
  });

  it("rejects a WebSocket upgrade without the internal key header", async () => {
    const { server, port } = await startServer();
    try {
      const rejected = await new Promise<number>((resolve, reject) => {
        const req = http.request({
          host: "127.0.0.1",
          port,
          path: "/ws",
          method: "GET",
          headers: {
            Connection: "Upgrade",
            Upgrade: "websocket",
            "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
            "Sec-WebSocket-Version": "13",
          },
        });
        req.on("upgrade", () => {
          reject(new Error("upgrade must not succeed without a valid key"));
        });
        req.on("response", (res) => {
          resolve(res.statusCode ?? 0);
          res.resume();
        });
        req.on("error", reject);
        req.end();
      });
      expect(rejected).toBe(401);
      expect(server.sessionCount).toBe(0);
    } finally {
      await server.stop();
    }
  });

  async function postSessions(
    port: number,
    callAuthorityToken: string,
  ): Promise<{
    status: number;
    session?: { sessionId: string };
    grant?: { token: string; epoch: number; expiresAt: number };
  }> {
    const res = await fetch(`http://127.0.0.1:${port}/sessions`, {
      method: "POST",
      headers: { [VOICE_MEDIA_INTERNAL_KEY_HEADER]: INTERNAL_KEY },
      body: JSON.stringify({ callAuthorityToken }),
    });
    if (res.status !== 201) return { status: res.status };
    const parsed = (await res.json()) as {
      session: { sessionId: string };
      grant: { token: string; epoch: number; expiresAt: number };
    };
    return { status: res.status, session: parsed.session, grant: parsed.grant };
  }

  function attemptWsUpgrade(
    port: number,
    query: string,
  ): Promise<{ statusCode: number; upgraded: boolean }> {
    return new Promise((resolve, reject) => {
      const req = http.request({
        host: "127.0.0.1",
        port,
        path: `/ws${query}`,
        method: "GET",
        headers: {
          Connection: "Upgrade",
          Upgrade: "websocket",
          "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
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

  it("rejects a WebSocket attach for a sessionId that was never admitted via POST /sessions, even with a valid internal key (no self-admission on WS)", async () => {
    const { server, port } = await startServer();
    try {
      const result = await attemptWsUpgrade(
        port,
        "?sessionId=unissued-session",
      );
      expect(result.upgraded).toBe(false);
      expect(result.statusCode).toBe(403);
      expect(server.sessionCount).toBe(0);
    } finally {
      await server.stop();
    }
  });

  it("rejects a WebSocket attach for an admitted session with no grant token presented", async () => {
    const { server, port, callAuthority } = await startServer();
    try {
      const admitted = await postSessions(
        port,
        callAuthority.issue("sess-no-grant").token,
      );
      expect(admitted.status).toBe(201);
      const result = await attemptWsUpgrade(port, "?sessionId=sess-no-grant");
      expect(result.upgraded).toBe(false);
      expect(result.statusCode).toBe(403);
    } finally {
      await server.stop();
    }
  });

  it("rejects a WebSocket attach when the grant belongs to a different session id (cross-session grant)", async () => {
    const { server, port, callAuthority } = await startServer();
    try {
      const a = await postSessions(
        port,
        callAuthority.issue("sess-cross-a").token,
      );
      const b = await postSessions(
        port,
        callAuthority.issue("sess-cross-b").token,
      );
      expect(a.status).toBe(201);
      expect(b.status).toBe(201);
      const result = await attemptWsUpgrade(
        port,
        `?sessionId=sess-cross-a&grant=${b.grant!.token}`,
      );
      expect(result.upgraded).toBe(false);
      expect(result.statusCode).toBe(403);
    } finally {
      await server.stop();
    }
  });

  it("rejects a WebSocket attach once the grant has expired", async () => {
    const { server, port, callAuthority } = await startServer({
      sessionGrantTtlMs: 1,
    });
    try {
      const admitted = await postSessions(
        port,
        callAuthority.issue("sess-expired").token,
      );
      expect(admitted.status).toBe(201);
      await new Promise((resolve) => setTimeout(resolve, 20));
      const result = await attemptWsUpgrade(
        port,
        `?sessionId=sess-expired&grant=${admitted.grant!.token}`,
      );
      expect(result.upgraded).toBe(false);
      expect(result.statusCode).toBe(403);
    } finally {
      await server.stop();
    }
  });

  it("completes a WebSocket upgrade for a same-session valid grant, and rejects replaying that same grant", async () => {
    const { server, port, callAuthority } = await startServer();
    try {
      const admitted = await postSessions(
        port,
        callAuthority.issue("sess-ws-ok-1").token,
      );
      expect(admitted.status).toBe(201);

      const first = await attemptWsUpgrade(
        port,
        `?sessionId=sess-ws-ok-1&grant=${admitted.grant!.token}`,
      );
      expect(first.upgraded).toBe(true);
      expect(first.statusCode).toBe(101);

      // Give the server a tick to process the socket destroy from the first
      // attach before probing replay, matching how a real reconnect attempt
      // would arrive after the first connection already ended.
      await new Promise((resolve) => setTimeout(resolve, 10));

      const replay = await attemptWsUpgrade(
        port,
        `?sessionId=sess-ws-ok-1&grant=${admitted.grant!.token}`,
      );
      expect(replay.upgraded).toBe(false);
      expect([403, 409]).toContain(replay.statusCode);
    } finally {
      await server.stop();
    }
  });
});

describe("AUDIT-VOICE-RUNTIME-20261002: /ready reflects real production capability", () => {
  afterEach(resetEnv);

  it("stays ready in a non-strict (test/dev) environment even though no provider is production-capable", async () => {
    process.env.NODE_ENV = "test";
    const { server, port } = await startServer();
    try {
      const res = await fetch(`http://127.0.0.1:${port}/ready`);
      expect(res.status).toBe(200);
    } finally {
      await server.stop();
    }
  });

  it("reports not-ready in a strict environment when no provider is production-capable", async () => {
    process.env.DRTS_ENV = "production";
    const { server, port } = await startServer();
    try {
      const res = await fetch(`http://127.0.0.1:${port}/ready`);
      expect(res.status).toBe(503);
      const body = (await res.json()) as { reason: string };
      expect(body.reason).toBe("voice_runtime_not_production_capable");
    } finally {
      await server.stop();
    }
  });

  it("reports ready in a strict environment once the composition declares production capability", async () => {
    process.env.DRTS_ENV = "production";
    const { server, port } = await startServer({
      voiceRuntimeProductionCapable: true,
    });
    try {
      const res = await fetch(`http://127.0.0.1:${port}/ready`);
      expect(res.status).toBe(200);
    } finally {
      await server.stop();
    }
  });
});
