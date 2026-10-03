import { describe, it, expect } from "vitest";
import { MediaWorkerServer } from "../../../apps/voice-media-worker/src/server/media-worker-server";
import { MediaRecordingAdapter } from "../../../apps/voice-media-worker/src/recording/media-recording-adapter";
import { VOICE_MEDIA_INTERNAL_KEY_HEADER } from "../../../apps/voice-media-worker/src/server/internal-auth";
import type { RecorderObjectStore } from "../../../apps/voice-media-worker/src/recording/sealed-recorder";
import type { RecordingClosureLedger } from "../../../apps/voice-media-worker/src/recording/final-manifest";
import { FakeCallAuthority } from "./fake-call-authority";

/**
 * Codex review round 3 (reopen, AUDIT-VOICE-RUNTIME-20261002) R2: holding
 * the shared operations key only proves "a trusted operator of this
 * worker," never which specific call/session/recording a request is
 * entitled to. These tests exercise the remainder of the repair-boundary
 * checklist -- expired/revoked/replayed call-authority tokens -- against
 * the real `MediaWorkerServer` admission path, mocking only the external
 * issuer (`FakeCallAuthority`), never the server's own verification logic.
 */

const INTERNAL_KEY = "test-internal-key-call-authority";

class NullRecorderObjectStore implements RecorderObjectStore {
  async putRecordingImmutable(): Promise<never> {
    throw new Error("not used in this test file");
  }
  async putImmutable(): Promise<never> {
    throw new Error("not used in this test file");
  }
  async readVersion(): Promise<never> {
    throw new Error("not used in this test file");
  }
  async headObject(): Promise<{ exists: boolean }> {
    return { exists: false };
  }
}

function makeCountingLedger(): RecordingClosureLedger & { calls: number } {
  const ledger = {
    calls: 0,
    resolve: async () => {
      ledger.calls++;
      return null;
    },
  };
  return ledger;
}

async function startServer() {
  const callAuthority = new FakeCallAuthority();
  const adapter = new MediaRecordingAdapter(
    new NullRecorderObjectStore(),
    makeCountingLedger(),
  );
  const server = new MediaWorkerServer({
    port: 0,
    internalKey: INTERNAL_KEY,
    recordingAdapter: adapter,
    callAuthorityVerifier: callAuthority,
  });
  const port = await server.start();
  return { server, port, callAuthority };
}

async function postSessions(port: number, callAuthorityToken: string) {
  const res = await fetch(`http://127.0.0.1:${port}/sessions`, {
    method: "POST",
    headers: { [VOICE_MEDIA_INTERNAL_KEY_HEADER]: INTERNAL_KEY },
    body: JSON.stringify({ callAuthorityToken }),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, body: json };
}

describe("AUDIT-VOICE-RUNTIME-20261002: call-authority token lifecycle at admission", () => {
  it("rejects admission with an expired call-authority token", async () => {
    const { server, port, callAuthority } = await startServer();
    try {
      const { token } = callAuthority.issue("sess-expired-token", {
        expiresAt: Date.now() - 1,
      });
      const result = await postSessions(port, token);
      expect(result.status).toBe(403);
      expect(result.body.code).toBe("VOICE_MEDIA_CALL_AUTHORITY_EXPIRED");
      expect(server.sessionCount).toBe(0);
    } finally {
      await server.stop();
    }
  });

  it("rejects admission with a revoked call-authority token", async () => {
    const { server, port, callAuthority } = await startServer();
    try {
      const { token } = callAuthority.issue("sess-revoked-token");
      callAuthority.revoke(token);
      const result = await postSessions(port, token);
      expect(result.status).toBe(403);
      expect(result.body.code).toBe("VOICE_MEDIA_CALL_AUTHORITY_REVOKED");
      expect(server.sessionCount).toBe(0);
    } finally {
      await server.stop();
    }
  });

  it("rejects replaying the same call-authority token for a second admission while the first is still active", async () => {
    const { server, port, callAuthority } = await startServer();
    try {
      const { token } = callAuthority.issue("sess-replayed-token");
      const first = await postSessions(port, token);
      expect(first.status).toBe(201);

      const replay = await postSessions(port, token);
      expect(replay.status).not.toBe(201);
      expect(server.sessionCount).toBe(1);
    } finally {
      await server.stop();
    }
  });

  it("rejects reissuing an equal-or-lower epoch for a session id once a higher epoch has already been admitted", async () => {
    const { server, port, callAuthority } = await startServer();
    try {
      const higher = callAuthority.issue("sess-epoch-order", { epoch: 5 });
      const admitted = await postSessions(port, higher.token);
      expect(admitted.status).toBe(201);
      server.closeSession("sess-epoch-order");

      const lowerOrEqual = callAuthority.issue("sess-epoch-order", {
        epoch: 5,
      });
      const result = await postSessions(port, lowerOrEqual.token);
      expect(result.status).toBe(409);
    } finally {
      await server.stop();
    }
  });
});
