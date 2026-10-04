import * as http from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MediaWorkerServer } from "../../../apps/voice-media-worker/src/server/media-worker-server";
import { VOICE_MEDIA_INTERNAL_KEY_HEADER } from "../../../apps/voice-media-worker/src/server/internal-auth";
import type { VoiceSessionComposer } from "../../../apps/voice-media-worker/src/server/session-composer";
import { FakeCallAuthority } from "../audit-voice-runtime-20261002/fake-call-authority";
import type {
  VoiceSessionBinding,
  VoiceSessionBindingResolver,
} from "../../../apps/voice-media-worker/src/dialogue/voice-session-binding";

const INTERNAL_KEY = "test-internal-key-r4-entry";

const ORIGINAL_ENV = { ...process.env };
function resetEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  Object.assign(process.env, ORIGINAL_ENV);
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

/**
 * AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-entry (Codex reopen round
 * 15/16): `MediaWorkerServer` previously had no production call site that
 * ever attempted to resolve a `VoiceSessionBinding` for an admitted
 * session -- `VoiceSessionComposer.attach`'s `binding` parameter was
 * reachable only from manually-constructed test attachments. These tests
 * exercise the real `resolveSessionBinding` method this worker's own
 * `POST /sessions` admission handler now calls, with only the
 * `VoiceSessionBindingResolver` boundary (apps/api, reached over HTTP in
 * production via `VoiceApiClient.getSession`) doubled -- never product
 * code. `MediaWorkerServer` is constructed but `.start()` is never called:
 * no listening server, no real network, consistent with this task's VM
 * restriction against running product servers.
 */

type ServerWithPrivateResolver = {
  resolveSessionBinding(
    voiceSessionId: string,
  ): Promise<VoiceSessionBinding | undefined>;
};

function binding(): VoiceSessionBinding {
  return {
    voiceSessionId: "22222222-2222-2222-2222-222222222222",
    resourceScopeId: "33333333-3333-3333-3333-333333333333",
    routeProfileVersion: 1,
    leaseEpoch: 1,
    sessionVersion: 5,
  };
}

describe("MediaWorkerServer.resolveSessionBinding (R4-entry)", () => {
  it("returns undefined and never calls a resolver when none is configured -- the pre-R4-entry default", async () => {
    const server = new MediaWorkerServer();

    const result = await (
      server as unknown as ServerWithPrivateResolver
    ).resolveSessionBinding("session-1");

    expect(result).toBeUndefined();
  });

  it("resolves the real binding for the exact admitted session id, from the configured resolver", async () => {
    const resolve = vi.fn(async (voiceSessionId: string) => {
      expect(voiceSessionId).toBe(binding().voiceSessionId);
      return binding();
    });
    const sessionBindingResolver: VoiceSessionBindingResolver = { resolve };
    const server = new MediaWorkerServer({ sessionBindingResolver });

    const result = await (
      server as unknown as ServerWithPrivateResolver
    ).resolveSessionBinding(binding().voiceSessionId);

    expect(resolve).toHaveBeenCalledTimes(1);
    expect(result).toEqual(binding());
  });

  it("propagates the rejection (fail-closed) instead of swallowing it to undefined once a resolver IS configured (Codex reopen round 18, R4-entry)", async () => {
    const resolve = vi.fn(async () => {
      throw new Error("VOICE_SESSION_NOT_OWNER: Voice session not found.");
    });
    const server = new MediaWorkerServer({
      sessionBindingResolver: { resolve },
    });

    await expect(
      (server as unknown as ServerWithPrivateResolver).resolveSessionBinding(
        "session-no-row-yet",
      ),
    ).rejects.toThrow("VOICE_SESSION_NOT_OWNER");
  });

  /**
   * AUDIT-VOICE-APPLICATION-WIRING-20261003 R11/R12 boundedness residual
   * (Codex reopen, canonical 2026-10-03T19:24:15Z): the prior fix here
   * only ever passed `controller.signal` to the resolver and trusted it
   * to respect that signal -- merely firing `controller.abort()` on a
   * timer is not itself a bound against a resolver that never checks
   * `signal` at all (the reviewer's own probe: "after 160ms signal is
   * aborted but the resolver promise still pending until manually
   * released"). This double is deliberately uncooperative: it ignores
   * the signal it is handed and never settles on its own either.
   */
  it("settles bounded by sessionGrantTtlMs even when the resolver never checks signal and never settles on its own", async () => {
    const resolve = vi.fn(
      () => new Promise<VoiceSessionBinding>(() => {
        // Never settles, never reads its own `signal` argument.
      }),
    );
    const server = new MediaWorkerServer({
      sessionBindingResolver: { resolve },
      sessionGrantTtlMs: 30,
    });

    await expect(
      (server as unknown as ServerWithPrivateResolver).resolveSessionBinding(
        binding().voiceSessionId,
      ),
    ).rejects.toThrow(/timed_out/);
  });
});

/**
 * AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-entry / R12 (Codex reopen round
 * 18): the real HTTP `POST /sessions` admission path end-to-end, with only
 * the `VoiceCallAuthorityVerifier` and `VoiceSessionBindingResolver`
 * boundaries doubled -- `MediaWorkerServer.start()` opens a real ephemeral
 * (`port: 0`) listener on loopback, matching the established pattern in
 * `tests/unit/audit-voice-runtime-20261002/media-worker-server-caller-
 * session-authorization.test.ts`, never a product dev/preview server.
 */
describe("MediaWorkerServer POST /sessions -> WS upgrade -> composer.attach (R4-entry / R12)", () => {
  afterEach(resetEnv);

  it("passes the real resolved binding through to sessionComposer.attach on WS upgrade (positive path)", async () => {
    const attach = vi.fn();
    const composer = {
      attach,
      get: () => undefined,
      on: () => undefined,
      drain: async () => undefined,
      awaitPendingCloses: async () => undefined,
    } as unknown as VoiceSessionComposer;
    const resolve = vi.fn(async (voiceSessionId: string) => ({
      ...binding(),
      voiceSessionId,
    }));
    const callAuthority = new FakeCallAuthority();
    const server = new MediaWorkerServer({
      port: 0,
      internalKey: INTERNAL_KEY,
      callAuthorityVerifier: callAuthority,
      sessionBindingResolver: { resolve },
      sessionComposer: composer,
    });
    const port = await server.start();
    try {
      const { token } = callAuthority.issue("sess-bound-ok");
      const admitRes = await fetch(`http://127.0.0.1:${port}/sessions`, {
        method: "POST",
        headers: { [VOICE_MEDIA_INTERNAL_KEY_HEADER]: INTERNAL_KEY },
        body: JSON.stringify({ callAuthorityToken: token }),
      });
      expect(admitRes.status).toBe(201);
      const admitted = (await admitRes.json()) as {
        grant: { token: string };
      };

      const upgrade = await attemptWsUpgrade(
        port,
        `?sessionId=sess-bound-ok&grant=${admitted.grant.token}`,
      );
      expect(upgrade.upgraded).toBe(true);

      expect(attach).toHaveBeenCalledTimes(1);
      const [attachedSessionId, , attachedBinding] = attach.mock.calls[0]!;
      expect(attachedSessionId).toBe("sess-bound-ok");
      expect(attachedBinding).toEqual({ ...binding(), voiceSessionId: "sess-bound-ok" });
    } finally {
      await server.stop();
    }
  });

  it("fails admission closed (never 201) when a configured resolver rejects, instead of falling back to unbound fixture persistence", async () => {
    const resolve = vi.fn(async () => {
      throw new Error("VOICE_SESSION_NOT_OWNER: Voice session not found.");
    });
    const callAuthority = new FakeCallAuthority();
    const server = new MediaWorkerServer({
      port: 0,
      internalKey: INTERNAL_KEY,
      callAuthorityVerifier: callAuthority,
      sessionBindingResolver: { resolve },
    });
    const port = await server.start();
    try {
      const { token } = callAuthority.issue("sess-binding-denied");
      const res = await fetch(`http://127.0.0.1:${port}/sessions`, {
        method: "POST",
        headers: { [VOICE_MEDIA_INTERNAL_KEY_HEADER]: INTERNAL_KEY },
        body: JSON.stringify({ callAuthorityToken: token }),
      });

      // This is the exact previously-reopened defect: a configured
      // resolver's rejection must not be swallowed into a successful
      // `201 admitted` that silently attaches on the fixture-only path.
      expect(res.status).not.toBe(201);
      const body = (await res.json()) as { code?: string };
      expect(body.code).toBe("VOICE_MEDIA_SESSION_BINDING_FAILED");
      expect(server.sessionCount).toBe(0);

      // The grant/session this attempt reserved must also be cleaned up --
      // a later admission for the same session id must not be rejected as
      // a stale-admission conflict.
      const retryToken = callAuthority.issue("sess-binding-denied").token;
      const retryResolve = vi.fn(async (voiceSessionId: string) => ({
        ...binding(),
        voiceSessionId,
      }));
      (
        server as unknown as {
          sessionBindingResolver: VoiceSessionBindingResolver;
        }
      ).sessionBindingResolver = { resolve: retryResolve };
      const retryRes = await fetch(`http://127.0.0.1:${port}/sessions`, {
        method: "POST",
        headers: { [VOICE_MEDIA_INTERNAL_KEY_HEADER]: INTERNAL_KEY },
        body: JSON.stringify({ callAuthorityToken: retryToken }),
      });
      expect(retryRes.status).toBe(201);
    } finally {
      await server.stop();
    }
  });

  it("fails admission closed (never a stale 201) when the grant is reaped by TTL expiry while binding resolution is still in flight", async () => {
    let releaseResolver: (() => void) | undefined;
    const held = new Promise<void>((resolve) => {
      releaseResolver = resolve;
    });
    const resolve = vi.fn(async (voiceSessionId: string) => {
      await held;
      return { ...binding(), voiceSessionId };
    });
    const callAuthority = new FakeCallAuthority();
    const server = new MediaWorkerServer({
      port: 0,
      internalKey: INTERNAL_KEY,
      callAuthorityVerifier: callAuthority,
      sessionBindingResolver: { resolve },
      // Short enough that the TTL timer fires well before `held` resolves
      // below, reproducing the real race: grant-expiry reaps the session
      // out of `activeSessions` while `POST /sessions` is still awaiting
      // the (slow, real-network) binding resolution.
      sessionGrantTtlMs: 20,
    });
    const port = await server.start();
    try {
      const { token } = callAuthority.issue("sess-reaped-mid-resolve");
      const admitPromise = fetch(`http://127.0.0.1:${port}/sessions`, {
        method: "POST",
        headers: { [VOICE_MEDIA_INTERNAL_KEY_HEADER]: INTERNAL_KEY },
        body: JSON.stringify({ callAuthorityToken: token }),
      });

      // Let the grant's TTL timer fire and reap the still-unattached
      // session before letting the resolver settle.
      await new Promise((r) => setTimeout(r, 60));
      expect(server.sessionCount).toBe(0);
      // AUDIT-VOICE-APPLICATION-WIRING-20261003 R11/R12 boundedness
      // residual (Codex reopen, canonical 2026-10-03T19:24:15Z):
      // `resolveSessionBinding` now races the resolver call against its
      // own `sessionGrantTtlMs` bound (not merely an abort signal the
      // resolver could ignore forever), so this attempt already fails
      // closed with `VOICE_MEDIA_SESSION_BINDING_FAILED` at the TTL
      // mark -- strictly faster, and still never a stale 201 -- rather
      // than waiting for this slow resolver to settle before the
      // separate grant-liveness check below gets a chance to classify it
      // as `VOICE_MEDIA_SESSION_ADMISSION_EXPIRED`. Releasing the
      // resolver now is harmless: nothing awaits its result any more.
      releaseResolver!();

      const res = await admitPromise;
      expect(res.status).not.toBe(201);
      const body = (await res.json()) as { code?: string };
      expect(body.code).toBe("VOICE_MEDIA_SESSION_BINDING_FAILED");

      // An immediate WS upgrade with the (already-stale) grant this
      // response never actually delivered must not succeed either.
      const upgrade = await attemptWsUpgrade(
        port,
        "?sessionId=sess-reaped-mid-resolve",
      );
      expect(upgrade.upgraded).toBe(false);
    } finally {
      await server.stop();
    }
  });
});
