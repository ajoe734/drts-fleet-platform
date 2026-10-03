import { describe, expect, it, vi } from "vitest";

import { MediaWorkerServer } from "../../../apps/voice-media-worker/src/server/media-worker-server";
import type {
  VoiceSessionBinding,
  VoiceSessionBindingResolver,
} from "../../../apps/voice-media-worker/src/dialogue/voice-session-binding";

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

  it("fails closed to undefined -- never throws, never fails admission -- when the resolver rejects (e.g. apps/api has no voice.session row yet for this id)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const resolve = vi.fn(async () => {
      throw new Error("VOICE_SESSION_NOT_OWNER: Voice session not found.");
    });
    const server = new MediaWorkerServer({
      sessionBindingResolver: { resolve },
    });

    const result = await (
      server as unknown as ServerWithPrivateResolver
    ).resolveSessionBinding("session-no-row-yet");

    expect(result).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("session-no-row-yet"),
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("VOICE_SESSION_NOT_OWNER"),
    );
    warn.mockRestore();
  });
});
