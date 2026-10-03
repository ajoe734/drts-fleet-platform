import { describe, it, expect } from "vitest";
import { MediaWorkerServer } from "../../../apps/voice-media-worker/src/server/media-worker-server";
import type { VoiceSessionComposer } from "../../../apps/voice-media-worker/src/server/session-composer";

/**
 * Codex review round 6 (reopen, AUDIT-VOICE-RUNTIME-20261002) R11 scenario
 * (d): `MediaWorkerServer.stop()` closed every active session's channel
 * (synchronously starting the composer's ASR teardown) and then resolved
 * immediately, never once awaiting that teardown -- `drain()`'s final
 * `await this.stop()` inherited the same gap. A provider's bounded EOS
 * drain (e.g. `TwmAsrNetworkAdapter`'s configured `eosDrainMs`) could
 * easily still be running when the caller of `drain()`/`stop()` believed
 * shutdown had already finished.
 *
 * These tests exercise `stop()`/`drain()` directly against a minimal
 * `VoiceSessionComposer` double exposing exactly the one method this
 * server actually calls on it for this path (`awaitPendingCloses`) --
 * `VoiceSessionComposer.awaitPendingCloses` itself is covered against a
 * real ASR adapter double in `session-composer.test.ts`. The HTTP listener
 * is deliberately never started (`server.start()` is never called) --
 * this VM must not open a real listening socket -- which also proves the
 * awaited fix does not depend on `isRunning` being `true`.
 */

function pendingCloseComposer(): {
  composer: VoiceSessionComposer;
  resolveClose: () => void;
} {
  let resolveClose: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => {
    resolveClose = resolve;
  });
  const composer = {
    attach: () => undefined,
    get: () => undefined,
    awaitPendingCloses: () => pending,
  } as unknown as VoiceSessionComposer;
  return { composer, resolveClose: resolveClose! };
}

describe("AUDIT-VOICE-RUNTIME-20261002: MediaWorkerServer.stop()/drain() await the session composer's pending ASR teardown (R11 scenario d)", () => {
  it("stop() does not resolve until the composer's pending ASR teardown settles, even though the HTTP listener was never started", async () => {
    const { composer, resolveClose } = pendingCloseComposer();
    const server = new MediaWorkerServer({ sessionComposer: composer });

    let stopped = false;
    const stopPromise = server.stop().then(() => {
      stopped = true;
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(stopped).toBe(false);

    resolveClose();
    await stopPromise;
    expect(stopped).toBe(true);
  });

  it("drain() does not resolve until the composer's pending ASR teardown settles, with no active sessions and no listener ever started", async () => {
    const { composer, resolveClose } = pendingCloseComposer();
    const server = new MediaWorkerServer({ sessionComposer: composer });

    let drained = false;
    const drainPromise = server.drain(5).then(() => {
      drained = true;
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(drained).toBe(false);

    resolveClose();
    await drainPromise;
    expect(drained).toBe(true);
  });

  it("stop() still resolves promptly when no session composer is configured at all", async () => {
    const server = new MediaWorkerServer();
    await expect(server.stop()).resolves.toBeUndefined();
  });
});
