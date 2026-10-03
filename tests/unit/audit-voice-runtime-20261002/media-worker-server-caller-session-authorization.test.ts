import { describe, it, expect, afterEach } from "vitest";
import * as http from "node:http";
import { MediaWorkerServer } from "../../../apps/voice-media-worker/src/server/media-worker-server";
import { VOICE_MEDIA_INTERNAL_KEY_HEADER } from "../../../apps/voice-media-worker/src/server/internal-auth";

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
  const server = new MediaWorkerServer({
    port: 0,
    internalKey: INTERNAL_KEY,
    ...overrides,
  });
  const port = await server.start();
  return { server, port };
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

  it("admits a session when the correct internal key is presented", async () => {
    const { server, port } = await startServer();
    try {
      const res = await fetch(`http://127.0.0.1:${port}/sessions`, {
        method: "POST",
        headers: { [VOICE_MEDIA_INTERNAL_KEY_HEADER]: INTERNAL_KEY },
        body: JSON.stringify({ sessionId: "sess-ok-1" }),
      });
      expect(res.status).toBe(201);
      expect(server.sessionCount).toBe(1);
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
    const { server, port } = await startServer();
    try {
      const first = await fetch(`http://127.0.0.1:${port}/sessions`, {
        method: "POST",
        headers: { [VOICE_MEDIA_INTERNAL_KEY_HEADER]: INTERNAL_KEY },
        body: JSON.stringify({ sessionId: "sess-dup-1" }),
      });
      expect(first.status).toBe(201);

      const second = await fetch(`http://127.0.0.1:${port}/sessions`, {
        method: "POST",
        headers: { [VOICE_MEDIA_INTERNAL_KEY_HEADER]: INTERNAL_KEY },
        body: JSON.stringify({ sessionId: "sess-dup-1" }),
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

  it("completes a WebSocket upgrade when the internal key header is valid", async () => {
    const { server, port } = await startServer();
    try {
      const upgraded = await new Promise<boolean>((resolve, reject) => {
        const req = http.request({
          host: "127.0.0.1",
          port,
          path: "/ws?sessionId=sess-ws-ok-1",
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
          resolve(res.statusCode === 101);
          socket.destroy();
        });
        req.on("response", () => resolve(false));
        req.on("error", reject);
        req.end();
      });
      expect(upgraded).toBe(true);
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
