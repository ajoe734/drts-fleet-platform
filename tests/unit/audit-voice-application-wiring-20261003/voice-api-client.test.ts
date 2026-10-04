import { describe, expect, it, vi } from "vitest";

import {
  GoogleMetadataIdentityTokenSource,
  type WorkloadIdentityTokenSource,
} from "../../../apps/voice-media-worker/src/server/workload-identity-token-source";
import {
  VoiceApiClient,
  VoiceApiError,
} from "../../../apps/voice-media-worker/src/server/voice-api-client";
import { createVoiceApiClient } from "../../../apps/voice-media-worker/src/server/voice-api-client-factory";
import {
  createFixtureDialoguePersistPort,
  createTrustedDialoguePersistPort,
} from "../../../apps/voice-media-worker/src/dialogue/dialogue-persist-port";
import type { VoiceSessionBinding } from "../../../apps/voice-media-worker/src/dialogue/voice-session-binding";
import { VoiceDialogueState } from "../../../apps/voice-media-worker/src/dialogue/dialogue-state";
import type { VoiceDialogueRequest } from "../../../apps/voice-media-worker/src/dialogue/voice-dialogue-provider";

/**
 * AUDIT-VOICE-APPLICATION-WIRING-20261003 R4 (Codex reopen round 5/6):
 * `voice-media-worker` previously had no HTTP client to call apps/api
 * with at all. These tests exercise the real, newly-added
 * `GoogleMetadataIdentityTokenSource` -> `VoiceApiClient` ->
 * `createTrustedDialoguePersistPort` chain with only the external
 * transport (the GCP metadata server and apps/api itself, via `fetch`)
 * doubled.
 */

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("GoogleMetadataIdentityTokenSource", () => {
  function tokenWithExp(expSecondsFromNow: number): string {
    const header = Buffer.from(JSON.stringify({ alg: "RS256" })).toString(
      "base64url",
    );
    const payload = Buffer.from(
      JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expSecondsFromNow }),
    ).toString("base64url");
    return `${header}.${payload}.sig`;
  }

  it("fails closed when the metadata server is unreachable (true for every environment this worker runs in today)", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    const source = new GoogleMetadataIdentityTokenSource({
      audience: "https://api.example.test",
      fetchImpl,
    });

    await expect(source.getToken()).rejects.toThrow(/Unable to reach/);
  });

  it("fails closed on a non-OK metadata server response", async () => {
    const fetchImpl = vi.fn(async () => new Response("denied", { status: 403 }));
    const source = new GoogleMetadataIdentityTokenSource({
      audience: "https://api.example.test",
      fetchImpl,
    });

    await expect(source.getToken()).rejects.toThrow(/rejected/);
  });

  it("fails closed on an empty token body", async () => {
    const fetchImpl = vi.fn(async () => new Response("   "));
    const source = new GoogleMetadataIdentityTokenSource({
      audience: "https://api.example.test",
      fetchImpl,
    });

    await expect(source.getToken()).rejects.toThrow(/empty/);
  });

  it("requests the configured audience and caches the token until near its own expiry", async () => {
    const token = tokenWithExp(600);
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      expect(String(url)).toContain("audience=https%3A%2F%2Fapi.example.test");
      return new Response(token);
    });
    const source = new GoogleMetadataIdentityTokenSource({
      audience: "https://api.example.test",
      fetchImpl,
    });

    const first = await source.getToken();
    const second = await source.getToken();

    expect(first).toBe(token);
    expect(second).toBe(token);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("refreshes once the cached token is near its own expiry", async () => {
    const soonToken = tokenWithExp(1);
    const freshToken = tokenWithExp(600);
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call += 1;
      return new Response(call === 1 ? soonToken : freshToken);
    });
    const source = new GoogleMetadataIdentityTokenSource({
      audience: "https://api.example.test",
      fetchImpl,
    });

    const first = await source.getToken();
    const second = await source.getToken();

    expect(first).toBe(soonToken);
    expect(second).toBe(freshToken);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  /**
   * Codex reopen round 5/6, R4-persist residual: the metadata-server fetch
   * previously had no cancellation/deadline of its own -- a turn aborted
   * while this call was outstanding left it running regardless.
   */
  it("forwards a caller-supplied signal to the metadata-server fetch, and rejects immediately on an already-aborted one without fetching at all", async () => {
    let observedSignal: AbortSignal | null | undefined;
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      observedSignal = init?.signal;
      return new Response(tokenWithExp(600));
    });
    const source = new GoogleMetadataIdentityTokenSource({
      audience: "https://api.example.test",
      fetchImpl,
    });
    const controller = new AbortController();

    await source.getToken(controller.signal);
    expect(observedSignal).toBe(controller.signal);

    const abortedController = new AbortController();
    abortedController.abort();
    const freshSource = new GoogleMetadataIdentityTokenSource({
      audience: "https://api.example.test",
      fetchImpl,
    });
    await expect(freshSource.getToken(abortedController.signal)).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("VoiceApiClient", () => {
  const binding: VoiceSessionBinding = {
    voiceSessionId: "22222222-2222-2222-2222-222222222222",
    resourceScopeId: "33333333-3333-3333-3333-333333333333",
    routeProfileVersion: 1,
    leaseEpoch: 1,
    sessionVersion: 5,
  };

  function fakeTokenSource(token = "workload-token"): WorkloadIdentityTokenSource {
    return { getToken: vi.fn(async () => token) };
  }

  it("issues a capability using the workload token as bearer auth", async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://api.example.test/callcenter/voice/capabilities");
      expect(init?.headers).toMatchObject({ authorization: "Bearer workload-token" });
      return jsonResponse(200, {
        data: { token: "capability-token", tokenType: "Bearer", expiresIn: 120 },
      });
    });
    const client = new VoiceApiClient(
      { baseUrl: "https://api.example.test", fetchImpl },
      fakeTokenSource(),
    );

    const envelope = await client.issueCapability({
      voiceSessionId: binding.voiceSessionId,
      resourceScopeId: binding.resourceScopeId,
      routeProfileVersion: binding.routeProfileVersion,
      leaseEpoch: binding.leaseEpoch,
      scopes: ["session_execute"],
    });

    expect(envelope.token).toBe("capability-token");
  });

  it("forwards its own signal into the workload token source's getToken call", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, {
        data: { token: "capability-token", tokenType: "Bearer", expiresIn: 120 },
      }),
    );
    const getToken = vi.fn(async () => "workload-token");
    const client = new VoiceApiClient(
      { baseUrl: "https://api.example.test", fetchImpl },
      { getToken },
    );
    const controller = new AbortController();

    await client.issueCapability(
      {
        voiceSessionId: binding.voiceSessionId,
        resourceScopeId: binding.resourceScopeId,
        routeProfileVersion: binding.routeProfileVersion,
        leaseEpoch: binding.leaseEpoch,
        scopes: ["session_execute"],
      },
      controller.signal,
    );

    expect(getToken).toHaveBeenCalledWith(controller.signal);
  });

  /**
   * AUDIT-VOICE-APPLICATION-WIRING-20261003 R11/R12 boundedness residual
   * (Codex reopen, canonical 2026-10-03T19:24:15Z): merely forwarding
   * `signal` into `fetchImpl` and awaiting its result is not itself a
   * bound -- it only protects callers against a COOPERATIVE transport
   * that actually checks `signal` and rejects. This double is
   * deliberately UNCOOPERATIVE: it never reads `init?.signal` at all, the
   * exact "uncooperative/hung upstream call" shape the reopened finding's
   * own probe used against `restoreBoundAttachment`/
   * `MediaWorkerServer.resolveSessionBinding`. Before this fix, aborting
   * `signal` here would leave this `await` pending forever regardless.
   */
  it("settles bounded even when fetchImpl is uncooperative and never itself checks signal", async () => {
    const fetchImpl = vi.fn(
      () => new Promise<Response>(() => {
        // Never settles on its own, and never even reads `init.signal` --
        // nothing here reacts to the abort below at all.
      }),
    );
    const client = new VoiceApiClient(
      { baseUrl: "https://api.example.test", fetchImpl },
      fakeTokenSource(),
    );
    const controller = new AbortController();

    const pending = client.issueCapability(
      {
        voiceSessionId: binding.voiceSessionId,
        resourceScopeId: binding.resourceScopeId,
        routeProfileVersion: binding.routeProfileVersion,
        leaseEpoch: binding.leaseEpoch,
        scopes: ["session_execute"],
      },
      controller.signal,
    );

    await Promise.resolve();
    controller.abort();

    await expect(pending).rejects.toThrow(VoiceApiError);
    await expect(pending).rejects.toMatchObject({
      code: "VOICE_API_UNREACHABLE",
    });
  });

  /**
   * AUDIT-VOICE-APPLICATION-WIRING-20261003 R11 residual (Codex reopen,
   * canonical 2026-10-03T20:13:00Z): the workload-identity mint
   * (`workloadTokenSource.getToken`) is the FIRST await in
   * `issueCapability`/`getSession`, strictly ahead of `request()`'s own
   * already-bound fetch/body stages -- a prior version awaited it
   * directly, outside `raceAgainstAbort`, so an uncooperative token
   * source (the real `GoogleMetadataIdentityTokenSource`'s metadata
   * fetch/body never settling, or any double that ignores `signal`) left
   * every caller (`restoreBoundAttachment`, `recordAuthoritativeControlEvent`,
   * `createTrustedDialoguePersistPort`, ...) pending forever regardless of
   * `signal` firing. This double is deliberately uncooperative, same shape
   * as the fetchImpl double above, but at the token-source seam instead.
   */
  it("settles bounded even when the workload-identity token source is uncooperative and never itself checks signal (R11)", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, {
        data: { token: "capability-token", tokenType: "Bearer", expiresIn: 120 },
      }),
    );
    const getToken = vi.fn(
      () =>
        new Promise<string>(() => {
          // Never settles on its own, and never even reads the `signal`
          // argument `issueCapability` forwards to it.
        }),
    );
    const client = new VoiceApiClient(
      { baseUrl: "https://api.example.test", fetchImpl },
      { getToken },
    );
    const controller = new AbortController();

    const pending = client.issueCapability(
      {
        voiceSessionId: binding.voiceSessionId,
        resourceScopeId: binding.resourceScopeId,
        routeProfileVersion: binding.routeProfileVersion,
        leaseEpoch: binding.leaseEpoch,
        scopes: ["session_execute"],
      },
      controller.signal,
    );

    await Promise.resolve();
    controller.abort();

    await expect(pending).rejects.toThrow(/aborted/);
    // The subsequent capability HTTP call must never start once the
    // identity stage it depends on is already known to have failed.
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("settles bounded on getSession too, even when the workload-identity token source is uncooperative (R11)", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, { data: { voiceSessionId: binding.voiceSessionId, sessionVersion: 1, inputEpoch: 0, pendingInput: false } }),
    );
    const getToken = vi.fn(
      () =>
        new Promise<string>(() => {
          // Never settles on its own.
        }),
    );
    const client = new VoiceApiClient(
      { baseUrl: "https://api.example.test", fetchImpl },
      { getToken },
    );
    const controller = new AbortController();

    const pending = client.getSession(binding.voiceSessionId, controller.signal);

    await Promise.resolve();
    controller.abort();

    await expect(pending).rejects.toThrow(/aborted/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("calls resolveInput using the capability token as bearer auth, scoped to the session path", async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe(
        `https://api.example.test/callcenter/voice/sessions/${binding.voiceSessionId}/input-resolutions`,
      );
      expect(init?.headers).toMatchObject({ authorization: "Bearer capability-token" });
      return jsonResponse(200, { data: { session: { sessionVersion: 6 } } });
    });
    const client = new VoiceApiClient(
      { baseUrl: "https://api.example.test", fetchImpl },
      fakeTokenSource(),
    );

    const result = await client.resolveInput(binding.voiceSessionId, "capability-token", {
      expectedSessionVersion: 5,
      inputEpoch: 2,
      resolution: "relevant",
    });

    expect(result.session.sessionVersion).toBe(6);
  });

  it("calls recordControlEvent using the capability token as bearer auth, scoped to the session's events path", async () => {
    let body: unknown;
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe(
        `https://api.example.test/callcenter/voice/sessions/${binding.voiceSessionId}/events`,
      );
      expect(init?.headers).toMatchObject({ authorization: "Bearer capability-token" });
      body = JSON.parse(init!.body as string);
      return jsonResponse(200, {
        data: {
          deduped: false,
          applied: true,
          gap: false,
          appliedThroughSequence: 1,
          session: {
            voiceSessionId: binding.voiceSessionId,
            sessionVersion: 5,
            inputEpoch: 1,
            pendingInput: true,
          },
        },
      });
    });
    const client = new VoiceApiClient(
      { baseUrl: "https://api.example.test", fetchImpl },
      fakeTokenSource(),
    );

    const result = await client.recordControlEvent(binding.voiceSessionId, "capability-token", {
      source: "media_worker",
      occurredAt: "2026-07-24T09:00:00.000Z",
      sequence: 1,
      mediaEpoch: 1,
      eventType: "speech_start",
    });

    expect(body).toEqual({
      source: "media_worker",
      occurredAt: "2026-07-24T09:00:00.000Z",
      sequence: 1,
      mediaEpoch: 1,
      eventType: "speech_start",
    });
    expect(result).toEqual({
      deduped: false,
      applied: true,
      gap: false,
      appliedThroughSequence: 1,
      session: {
        voiceSessionId: binding.voiceSessionId,
        sessionVersion: 5,
        inputEpoch: 1,
        pendingInput: true,
      },
    });
  });

  it("resolves a session using the WORKLOAD token (never a capability token), scoped to the session path (R4-entry)", async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe(
        `https://api.example.test/callcenter/voice/sessions/${binding.voiceSessionId}`,
      );
      expect(init?.method).toBe("GET");
      expect(init?.headers).toMatchObject({ authorization: "Bearer workload-token" });
      return jsonResponse(200, {
        data: {
          session: {
            voiceSessionId: binding.voiceSessionId,
            resourceScopeId: binding.resourceScopeId,
            routeProfileVersion: binding.routeProfileVersion,
            leaseEpoch: binding.leaseEpoch,
            sessionVersion: binding.sessionVersion,
          },
        },
      });
    });
    const client = new VoiceApiClient(
      { baseUrl: "https://api.example.test", fetchImpl },
      fakeTokenSource(),
    );

    const result = await client.getSession(binding.voiceSessionId);

    expect(result.session).toEqual({
      voiceSessionId: binding.voiceSessionId,
      resourceScopeId: binding.resourceScopeId,
      routeProfileVersion: binding.routeProfileVersion,
      leaseEpoch: binding.leaseEpoch,
      sessionVersion: binding.sessionVersion,
    });
  });

  it("surfaces apps/api's structured error code/message from getSession too, e.g. when no voice.session row exists yet for this id", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(403, {
        error: { code: "VOICE_SESSION_NOT_OWNER", message: "Voice session not found." },
      }),
    );
    const client = new VoiceApiClient(
      { baseUrl: "https://api.example.test", fetchImpl },
      fakeTokenSource(),
    );

    await expect(client.getSession(binding.voiceSessionId)).rejects.toMatchObject({
      code: "VOICE_SESSION_NOT_OWNER",
    });
  });

  it("surfaces apps/api's structured error code/message, never swallowing a rejection as success", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(409, { error: { code: "VOICE_DRAFT_STALE", message: "stale" } }),
    );
    const client = new VoiceApiClient(
      { baseUrl: "https://api.example.test", fetchImpl },
      fakeTokenSource(),
    );

    await expect(
      client.resolveInput(binding.voiceSessionId, "capability-token", {
        expectedSessionVersion: 5,
        inputEpoch: 2,
        resolution: "relevant",
      }),
    ).rejects.toMatchObject({ code: "VOICE_DRAFT_STALE" });
  });

  it("fails closed with VOICE_API_UNREACHABLE when the network call itself fails", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    const client = new VoiceApiClient(
      { baseUrl: "https://api.example.test", fetchImpl },
      fakeTokenSource(),
    );

    await expect(
      client.resolveInput(binding.voiceSessionId, "capability-token", {
        expectedSessionVersion: 5,
        inputEpoch: 2,
        resolution: "relevant",
      }),
    ).rejects.toBeInstanceOf(VoiceApiError);
  });
});

describe("createTrustedDialoguePersistPort", () => {
  const request = { inputEpoch: 3, turnId: "turn-1" } as VoiceDialogueRequest;

  it("rejects when no binding is attached, never silently succeeding like the fixture port would", async () => {
    const fetchImpl = vi.fn();
    const client_ = new VoiceApiClient(
      { baseUrl: "https://api.example.test", fetchImpl },
      { getToken: vi.fn() },
    );
    const port = createTrustedDialoguePersistPort(client_, () => undefined);

    await expect(port.persist({} as VoiceDialogueState, request)).rejects.toThrow(
      /voice_trusted_persist_unbound/,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("issues a capability, calls resolveInput as 'relevant', and advances the binding's sessionVersion from the real response", async () => {
    const binding: VoiceSessionBinding = {
      voiceSessionId: "22222222-2222-2222-2222-222222222222",
      resourceScopeId: "33333333-3333-3333-3333-333333333333",
      routeProfileVersion: 1,
      leaseEpoch: 1,
      sessionVersion: 5,
    };
    let resolveInputBody: unknown;
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).endsWith("/capabilities")) {
        return jsonResponse(200, {
          data: { token: "capability-token", tokenType: "Bearer", expiresIn: 120 },
        });
      }
      if (String(url).endsWith("/dialogue-snapshot")) {
        return jsonResponse(200, {
          data: {
            snapshot: {
              snapshotId: "snapshot-1",
              voiceSessionId: binding.voiceSessionId,
              sessionVersion: 6,
              inputEpoch: 3,
              mediaEpoch: 0,
              turnId: "turn-1",
              content: {},
              createdAt: "2026-07-24T09:00:00.000Z",
              retentionExpiresAt: "2027-01-20T09:00:00.000Z",
            },
            deduped: false,
          },
        });
      }
      resolveInputBody = JSON.parse(init!.body as string);
      return jsonResponse(200, {
        data: {
          session: {
            voiceSessionId: binding.voiceSessionId,
            sessionVersion: 6,
            resourceScopeId: binding.resourceScopeId,
            routeProfileVersion: binding.routeProfileVersion,
            leaseEpoch: binding.leaseEpoch,
            inputEpoch: 3,
            pendingInput: false,
          },
        },
      });
    });
    const client_ = new VoiceApiClient(
      { baseUrl: "https://api.example.test", fetchImpl },
      { getToken: vi.fn(async () => "workload-token") },
    );
    const port = createTrustedDialoguePersistPort(client_, () => binding);

    await port.persist(
      { toSnapshotContent: () => ({}) } as unknown as VoiceDialogueState,
      request,
    );

    expect(resolveInputBody).toEqual({
      expectedSessionVersion: 5,
      inputEpoch: 3,
      resolution: "relevant",
    });
    expect(binding.sessionVersion).toBe(6);
  });

  it("propagates a rejected CAS (e.g. VOICE_DRAFT_STALE) and leaves sessionVersion untouched", async () => {
    const binding: VoiceSessionBinding = {
      voiceSessionId: "22222222-2222-2222-2222-222222222222",
      resourceScopeId: "33333333-3333-3333-3333-333333333333",
      routeProfileVersion: 1,
      leaseEpoch: 1,
      sessionVersion: 5,
    };
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).endsWith("/capabilities")) {
        return jsonResponse(200, {
          data: { token: "capability-token", tokenType: "Bearer", expiresIn: 120 },
        });
      }
      return jsonResponse(409, { error: { code: "VOICE_DRAFT_STALE", message: "stale" } });
    });
    const client_ = new VoiceApiClient(
      { baseUrl: "https://api.example.test", fetchImpl },
      { getToken: vi.fn(async () => "workload-token") },
    );
    const port = createTrustedDialoguePersistPort(client_, () => binding);

    await expect(port.persist({} as VoiceDialogueState, request)).rejects.toMatchObject({
      code: "VOICE_DRAFT_STALE",
    });
    expect(binding.sessionVersion).toBe(5);
  });

  it("fails closed immediately on an already-aborted request, issuing no HTTP call at all", async () => {
    const binding: VoiceSessionBinding = {
      voiceSessionId: "22222222-2222-2222-2222-222222222222",
      resourceScopeId: "33333333-3333-3333-3333-333333333333",
      routeProfileVersion: 1,
      leaseEpoch: 1,
      sessionVersion: 5,
    };
    const fetchImpl = vi.fn();
    const client_ = new VoiceApiClient(
      { baseUrl: "https://api.example.test", fetchImpl },
      { getToken: vi.fn(async () => "workload-token") },
    );
    const port = createTrustedDialoguePersistPort(client_, () => binding);
    const controller = new AbortController();
    controller.abort();

    await expect(
      port.persist(
        {} as VoiceDialogueState,
        { ...request, signal: controller.signal } as VoiceDialogueRequest,
      ),
    ).rejects.toThrow(/voice_trusted_persist_aborted/);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(binding.sessionVersion).toBe(5);
  });

  it("stops before the CAS write when the request is aborted while capability issuance is still pending, forwarding the signal to fetch", async () => {
    const binding: VoiceSessionBinding = {
      voiceSessionId: "22222222-2222-2222-2222-222222222222",
      resourceScopeId: "33333333-3333-3333-3333-333333333333",
      routeProfileVersion: 1,
      leaseEpoch: 1,
      sessionVersion: 5,
    };
    let releaseCapability!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseCapability = resolve;
    });
    const calls: Array<{ path: string; hadSignal: boolean }> = [];
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ path: String(url), hadSignal: init?.signal != null });
      if (String(url).endsWith("/capabilities")) {
        await gate;
        return jsonResponse(200, {
          data: { token: "capability-token", tokenType: "Bearer", expiresIn: 120 },
        });
      }
      return jsonResponse(200, {
        data: {
          session: {
            voiceSessionId: binding.voiceSessionId,
            sessionVersion: 6,
            inputEpoch: 3,
            pendingInput: false,
          },
        },
      });
    });
    const client_ = new VoiceApiClient(
      { baseUrl: "https://api.example.test", fetchImpl },
      { getToken: vi.fn(async () => "workload-token") },
    );
    const port = createTrustedDialoguePersistPort(client_, () => binding);
    const controller = new AbortController();

    const pending = port.persist(
      {} as VoiceDialogueState,
      { ...request, signal: controller.signal } as VoiceDialogueRequest,
    );
    for (let i = 0; i < 10 && calls.length === 0; i++) await Promise.resolve();
    controller.abort();
    releaseCapability();

    await expect(pending).rejects.toThrow(/voice_trusted_persist_aborted/);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.hadSignal).toBe(true);
    expect(binding.sessionVersion).toBe(5);
  });

  it("rejects a resolveInput response whose inputEpoch does not correlate with the request, leaving sessionVersion untouched", async () => {
    const binding: VoiceSessionBinding = {
      voiceSessionId: "22222222-2222-2222-2222-222222222222",
      resourceScopeId: "33333333-3333-3333-3333-333333333333",
      routeProfileVersion: 1,
      leaseEpoch: 1,
      sessionVersion: 5,
    };
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).endsWith("/capabilities")) {
        return jsonResponse(200, {
          data: { token: "capability-token", tokenType: "Bearer", expiresIn: 120 },
        });
      }
      return jsonResponse(200, {
        data: {
          session: {
            voiceSessionId: binding.voiceSessionId,
            sessionVersion: 6,
            inputEpoch: 999,
            pendingInput: false,
          },
        },
      });
    });
    const client_ = new VoiceApiClient(
      { baseUrl: "https://api.example.test", fetchImpl },
      { getToken: vi.fn(async () => "workload-token") },
    );
    const port = createTrustedDialoguePersistPort(client_, () => binding);

    await expect(port.persist({} as VoiceDialogueState, request)).rejects.toThrow(
      /voice_trusted_persist_stale_response/,
    );
    expect(binding.sessionVersion).toBe(5);
  });

  /**
   * Codex reopen round 5/6, R4-persist residual, first independent case:
   * `persist` previously re-checked `signal?.aborted` only after
   * `issueCapability`, never after `resolveInput` itself -- an abort that
   * lands while *that* response is still outstanding let the CAS write
   * commit anyway, with no way for the next turn to find out.
   *
   * The no-history-rewrite successor's R4-persist finding ("abort is not
   * rollback") then required `sessionVersion` to actually RECONCILE to the
   * authoritative committed value in this exact case -- the CAS already
   * truly happened (this test's response, once released, correlates
   * perfectly), so the binding must not keep submitting the stale pre-CAS
   * version forever. `persist()` still rejects (this turn was cancelled),
   * but the next turn through this binding now starts from truth.
   */
  it("still rejects for being cancelled, but reconciles sessionVersion to the authoritative committed value, when a correlated resolveInput response arrives after abort", async () => {
    const binding: VoiceSessionBinding = {
      voiceSessionId: "22222222-2222-2222-2222-222222222222",
      resourceScopeId: "33333333-3333-3333-3333-333333333333",
      routeProfileVersion: 1,
      leaseEpoch: 1,
      sessionVersion: 4,
    };
    let releaseResolveInput!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseResolveInput = resolve;
    });
    let resolveInputStarted = false;
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).endsWith("/capabilities")) {
        return jsonResponse(200, {
          data: { token: "capability-token", tokenType: "Bearer", expiresIn: 120 },
        });
      }
      resolveInputStarted = true;
      await gate;
      return jsonResponse(200, {
        data: {
          session: {
            voiceSessionId: binding.voiceSessionId,
            sessionVersion: 5,
            resourceScopeId: binding.resourceScopeId,
            routeProfileVersion: binding.routeProfileVersion,
            leaseEpoch: binding.leaseEpoch,
            inputEpoch: 3,
            pendingInput: false,
          },
        },
      });
    });
    const client_ = new VoiceApiClient(
      { baseUrl: "https://api.example.test", fetchImpl },
      { getToken: vi.fn(async () => "workload-token") },
    );
    const port = createTrustedDialoguePersistPort(client_, () => binding);
    const controller = new AbortController();

    const pending = port.persist(
      {} as VoiceDialogueState,
      { ...request, signal: controller.signal } as VoiceDialogueRequest,
    );
    // Let the capability call settle and the resolveInput call actually
    // start (its fetch is now held on `gate`) before aborting -- the
    // response, once released, is otherwise a perfectly successful one.
    for (let i = 0; i < 50 && !resolveInputStarted; i++) await Promise.resolve();
    expect(resolveInputStarted).toBe(true);
    controller.abort();
    releaseResolveInput();

    await expect(pending).rejects.toThrow(/voice_trusted_persist_aborted/);
    // Reconciled to the response's authoritative value, not left at the
    // stale pre-CAS 4 and not advanced by this (cancelled) turn's own
    // doing -- a fact about the session, not a success for this turn.
    expect(binding.sessionVersion).toBe(5);
    // A cancelled turn must never reach the content-persist call: it has
    // already rejected by the time that line would run.
    expect(fetchImpl).not.toHaveBeenCalledWith(
      expect.stringContaining("/dialogue-snapshot"),
      expect.anything(),
    );
  });

  /**
   * Codex reopen round 15/16, R4-persist "new late-response race": the
   * prior fix above reconciles a genuinely correlated but late response
   * into `current.sessionVersion` unconditionally. If a NEWER turn's own
   * (separate, already-settled) persist() call has, in the meantime,
   * already advanced that SAME shared binding object further forward,
   * blindly assigning the older response's value regresses it -- not a
   * reconciliation, a corruption the next turn would then CAS against.
   */
  it("never regresses sessionVersion: a genuinely correlated but LATE response must not overwrite a value a newer turn already advanced it past", async () => {
    const binding: VoiceSessionBinding = {
      voiceSessionId: "22222222-2222-2222-2222-222222222222",
      resourceScopeId: "33333333-3333-3333-3333-333333333333",
      routeProfileVersion: 1,
      leaseEpoch: 1,
      sessionVersion: 4,
    };
    let releaseResolveInput!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseResolveInput = resolve;
    });
    let resolveInputStarted = false;
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).endsWith("/capabilities")) {
        return jsonResponse(200, {
          data: { token: "capability-token", tokenType: "Bearer", expiresIn: 120 },
        });
      }
      resolveInputStarted = true;
      await gate;
      // This turn's OWN CAS genuinely committed server-side (4 -> 5) --
      // every field here is a real, correlated response to THIS request --
      // but is only reported back after a newer turn already advanced the
      // same binding further.
      return jsonResponse(200, {
        data: {
          session: {
            voiceSessionId: binding.voiceSessionId,
            sessionVersion: 5,
            resourceScopeId: binding.resourceScopeId,
            routeProfileVersion: binding.routeProfileVersion,
            leaseEpoch: binding.leaseEpoch,
            inputEpoch: 3,
            pendingInput: false,
          },
        },
      });
    });
    const client_ = new VoiceApiClient(
      { baseUrl: "https://api.example.test", fetchImpl },
      { getToken: vi.fn(async () => "workload-token") },
    );
    const port = createTrustedDialoguePersistPort(client_, () => binding);
    const controller = new AbortController();

    const pending = port.persist(
      {} as VoiceDialogueState,
      { ...request, signal: controller.signal } as VoiceDialogueRequest,
    );
    for (let i = 0; i < 50 && !resolveInputStarted; i++) await Promise.resolve();
    expect(resolveInputStarted).toBe(true);
    // A newer turn's own, separate persist() call already advanced the
    // SAME shared binding object past this turn's own expected value --
    // modeled directly here, since this test exercises the persist port
    // in isolation, not the full coordinator's turn sequencing.
    binding.sessionVersion = 7;
    controller.abort();
    releaseResolveInput();

    await expect(pending).rejects.toThrow(/voice_trusted_persist_aborted/);
    // Stays at the newer turn's value -- never regressed by this one's
    // late, now-stale-relative-to-current response.
    expect(binding.sessionVersion).toBe(7);
  });

  it("rejects a resolveInput response with pendingInput: true even though every other field correlates -- the admission watermark was not actually cleared", async () => {
    const binding: VoiceSessionBinding = {
      voiceSessionId: "22222222-2222-2222-2222-222222222222",
      resourceScopeId: "33333333-3333-3333-3333-333333333333",
      routeProfileVersion: 1,
      leaseEpoch: 1,
      sessionVersion: 5,
    };
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).endsWith("/capabilities")) {
        return jsonResponse(200, {
          data: { token: "capability-token", tokenType: "Bearer", expiresIn: 120 },
        });
      }
      return jsonResponse(200, {
        data: {
          session: {
            voiceSessionId: binding.voiceSessionId,
            sessionVersion: 6,
            resourceScopeId: binding.resourceScopeId,
            routeProfileVersion: binding.routeProfileVersion,
            leaseEpoch: binding.leaseEpoch,
            inputEpoch: 3,
            pendingInput: true,
          },
        },
      });
    });
    const client_ = new VoiceApiClient(
      { baseUrl: "https://api.example.test", fetchImpl },
      { getToken: vi.fn(async () => "workload-token") },
    );
    const port = createTrustedDialoguePersistPort(client_, () => binding);

    await expect(port.persist({} as VoiceDialogueState, request)).rejects.toThrow(
      /voice_trusted_persist_stale_response/,
    );
    expect(binding.sessionVersion).toBe(5);
  });

  it("rejects a persistDialogueSnapshot response for a foreign session/version/input/media/turn even though resolveInput already correlated and committed", async () => {
    const binding: VoiceSessionBinding = {
      voiceSessionId: "22222222-2222-2222-2222-222222222222",
      resourceScopeId: "33333333-3333-3333-3333-333333333333",
      routeProfileVersion: 1,
      leaseEpoch: 1,
      sessionVersion: 5,
    };
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).endsWith("/capabilities")) {
        return jsonResponse(200, {
          data: { token: "capability-token", tokenType: "Bearer", expiresIn: 120 },
        });
      }
      if (String(url).endsWith("/dialogue-snapshot")) {
        return jsonResponse(200, {
          data: {
            snapshot: {
              snapshotId: "foreign-snapshot",
              voiceSessionId: "99999999-9999-9999-9999-999999999999",
              sessionVersion: 999,
              inputEpoch: 888,
              mediaEpoch: 777,
              turnId: "some-other-turn",
              content: {},
              createdAt: "2020-01-01T00:00:00.000Z",
              retentionExpiresAt: "2020-01-02T00:00:00.000Z",
            },
            deduped: false,
          },
        });
      }
      return jsonResponse(200, {
        data: {
          session: {
            voiceSessionId: binding.voiceSessionId,
            sessionVersion: 6,
            resourceScopeId: binding.resourceScopeId,
            routeProfileVersion: binding.routeProfileVersion,
            leaseEpoch: binding.leaseEpoch,
            inputEpoch: 3,
            pendingInput: false,
          },
        },
      });
    });
    const client_ = new VoiceApiClient(
      { baseUrl: "https://api.example.test", fetchImpl },
      { getToken: vi.fn(async () => "workload-token") },
    );
    const port = createTrustedDialoguePersistPort(client_, () => binding);

    await expect(
      port.persist(
        { toSnapshotContent: () => ({}) } as unknown as VoiceDialogueState,
        request,
      ),
    ).rejects.toThrow(/voice_trusted_persist_snapshot_mismatch/);
    expect(
      fetchImpl.mock.calls.some(([url]) => String(url).endsWith("/dialogue-snapshot")),
    ).toBe(true);
  });

  it("rejects a persistDialogueSnapshot response whose own retention window has already expired, even with an otherwise fully-correlated identity", async () => {
    const binding: VoiceSessionBinding = {
      voiceSessionId: "22222222-2222-2222-2222-222222222222",
      resourceScopeId: "33333333-3333-3333-3333-333333333333",
      routeProfileVersion: 1,
      leaseEpoch: 1,
      sessionVersion: 5,
    };
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).endsWith("/capabilities")) {
        return jsonResponse(200, {
          data: { token: "capability-token", tokenType: "Bearer", expiresIn: 120 },
        });
      }
      if (String(url).endsWith("/dialogue-snapshot")) {
        const body = JSON.parse(init!.body as string) as {
          expectedSessionVersion: number;
          inputEpoch: number;
          mediaEpoch: number;
          turnId: string;
        };
        return jsonResponse(200, {
          data: {
            snapshot: {
              snapshotId: "snapshot-1",
              voiceSessionId: binding.voiceSessionId,
              sessionVersion: body.expectedSessionVersion,
              inputEpoch: body.inputEpoch,
              mediaEpoch: body.mediaEpoch,
              turnId: body.turnId,
              content: {},
              createdAt: "2020-01-01T00:00:00.000Z",
              // Already in the past: a snapshot cannot be reported as
              // durably persisted while already past its own retention
              // window -- that is either an expired-config bug or a
              // misattributed/replayed response, not a success.
              retentionExpiresAt: "2020-01-02T00:00:00.000Z",
            },
            deduped: false,
          },
        });
      }
      return jsonResponse(200, {
        data: {
          session: {
            voiceSessionId: binding.voiceSessionId,
            sessionVersion: 6,
            resourceScopeId: binding.resourceScopeId,
            routeProfileVersion: binding.routeProfileVersion,
            leaseEpoch: binding.leaseEpoch,
            inputEpoch: 3,
            pendingInput: false,
          },
        },
      });
    });
    const client_ = new VoiceApiClient(
      { baseUrl: "https://api.example.test", fetchImpl },
      { getToken: vi.fn(async () => "workload-token") },
    );
    const port = createTrustedDialoguePersistPort(client_, () => binding);

    await expect(
      port.persist(
        { toSnapshotContent: () => ({}) } as unknown as VoiceDialogueState,
        request,
      ),
    ).rejects.toThrow(/voice_trusted_persist_snapshot_mismatch/);
  });

  /**
   * Widened response correlation (no-history-rewrite successor's
   * R4-persist finding): a response that matches `voiceSessionId`/
   * `inputEpoch`/`sessionVersion+1` but carries a foreign resource scope,
   * route profile version, or lease epoch must never be trusted either --
   * each of these three fields is checked independently.
   */
  it.each([
    ["resourceScopeId", { resourceScopeId: "foreign-scope" }],
    ["routeProfileVersion", { routeProfileVersion: 99 }],
    ["leaseEpoch", { leaseEpoch: 99 }],
  ] as const)(
    "rejects a resolveInput response with a mismatched %s even though voiceSessionId/inputEpoch/sessionVersion correlate",
    async (_label, override) => {
      const binding: VoiceSessionBinding = {
        voiceSessionId: "22222222-2222-2222-2222-222222222222",
        resourceScopeId: "33333333-3333-3333-3333-333333333333",
        routeProfileVersion: 1,
        leaseEpoch: 1,
        sessionVersion: 4,
      };
      const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
        if (String(url).endsWith("/capabilities")) {
          return jsonResponse(200, {
            data: {
              token: "capability-token",
              tokenType: "Bearer",
              expiresIn: 120,
            },
          });
        }
        return jsonResponse(200, {
          data: {
            session: {
              voiceSessionId: binding.voiceSessionId,
              sessionVersion: 5,
              resourceScopeId: binding.resourceScopeId,
              routeProfileVersion: binding.routeProfileVersion,
              leaseEpoch: binding.leaseEpoch,
              inputEpoch: 3,
              pendingInput: false,
              ...override,
            },
          },
        });
      });
      const client_ = new VoiceApiClient(
        { baseUrl: "https://api.example.test", fetchImpl },
        { getToken: vi.fn(async () => "workload-token") },
      );
      const port = createTrustedDialoguePersistPort(client_, () => binding);

      await expect(
        port.persist({} as VoiceDialogueState, request),
      ).rejects.toThrow(/voice_trusted_persist_stale_response/);
      expect(binding.sessionVersion).toBe(4);
    },
  );

  it("persists the turn's encrypted dialogue-content snapshot using the same capability token, immediately after a correlated resolveInput succeeds", async () => {
    const binding: VoiceSessionBinding = {
      voiceSessionId: "22222222-2222-2222-2222-222222222222",
      resourceScopeId: "33333333-3333-3333-3333-333333333333",
      routeProfileVersion: 1,
      leaseEpoch: 1,
      sessionVersion: 5,
    };
    let snapshotCall: { url: string; token: string | null; body: unknown } | null = null;
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).endsWith("/capabilities")) {
        return jsonResponse(200, {
          data: { token: "capability-token", tokenType: "Bearer", expiresIn: 120 },
        });
      }
      if (String(url).endsWith("/dialogue-snapshot")) {
        snapshotCall = {
          url: String(url),
          token: (init?.headers as Record<string, string>)?.authorization ?? null,
          body: JSON.parse(init!.body as string),
        };
        return jsonResponse(200, {
          data: {
            snapshot: {
              snapshotId: "snapshot-1",
              voiceSessionId: binding.voiceSessionId,
              sessionVersion: 6,
              inputEpoch: 3,
              mediaEpoch: 2,
              turnId: "turn-xyz",
              content: { draftVersion: 1 },
              createdAt: "2026-07-24T09:00:00.000Z",
              retentionExpiresAt: "2027-01-20T09:00:00.000Z",
            },
            deduped: false,
          },
        });
      }
      return jsonResponse(200, {
        data: {
          session: {
            voiceSessionId: binding.voiceSessionId,
            sessionVersion: 6,
            resourceScopeId: binding.resourceScopeId,
            routeProfileVersion: binding.routeProfileVersion,
            leaseEpoch: binding.leaseEpoch,
            inputEpoch: 3,
            pendingInput: false,
          },
        },
      });
    });
    const client_ = new VoiceApiClient(
      { baseUrl: "https://api.example.test", fetchImpl },
      { getToken: vi.fn(async () => "workload-token") },
    );
    const port = createTrustedDialoguePersistPort(client_, () => binding);
    const snapshotContent = { draftVersion: 1 };
    const state = {
      toSnapshotContent: vi.fn(() => snapshotContent),
    } as unknown as VoiceDialogueState;

    await port.persist(state, {
      inputEpoch: 3,
      mediaEpoch: 2,
      turnId: "turn-xyz",
    } as VoiceDialogueRequest);

    expect(state.toSnapshotContent).toHaveBeenCalledTimes(1);
    expect(snapshotCall).not.toBeNull();
    expect(snapshotCall!.url).toBe(
      `https://api.example.test/callcenter/voice/sessions/${binding.voiceSessionId}/dialogue-snapshot`,
    );
    expect(snapshotCall!.token).toBe("Bearer capability-token");
    expect(snapshotCall!.body).toEqual({
      expectedSessionVersion: 6,
      inputEpoch: 3,
      mediaEpoch: 2,
      turnId: "turn-xyz",
      content: snapshotContent,
    });
  });

  it("fails the whole persist() call when the content-persist write is rejected, even though the admission CAS already succeeded -- no partial-success state", async () => {
    const binding: VoiceSessionBinding = {
      voiceSessionId: "22222222-2222-2222-2222-222222222222",
      resourceScopeId: "33333333-3333-3333-3333-333333333333",
      routeProfileVersion: 1,
      leaseEpoch: 1,
      sessionVersion: 5,
    };
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).endsWith("/capabilities")) {
        return jsonResponse(200, {
          data: { token: "capability-token", tokenType: "Bearer", expiresIn: 120 },
        });
      }
      if (String(url).endsWith("/dialogue-snapshot")) {
        return jsonResponse(503, {
          error: {
            code: "VOICE_DIALOGUE_SNAPSHOT_ENCRYPTION_UNCONFIGURED",
            message: "key unavailable",
          },
        });
      }
      return jsonResponse(200, {
        data: {
          session: {
            voiceSessionId: binding.voiceSessionId,
            sessionVersion: 6,
            resourceScopeId: binding.resourceScopeId,
            routeProfileVersion: binding.routeProfileVersion,
            leaseEpoch: binding.leaseEpoch,
            inputEpoch: 3,
            pendingInput: false,
          },
        },
      });
    });
    const client_ = new VoiceApiClient(
      { baseUrl: "https://api.example.test", fetchImpl },
      { getToken: vi.fn(async () => "workload-token") },
    );
    const port = createTrustedDialoguePersistPort(client_, () => binding);

    await expect(
      port.persist(
        { toSnapshotContent: () => ({}) } as unknown as VoiceDialogueState,
        request,
      ),
    ).rejects.toMatchObject({
      code: "VOICE_DIALOGUE_SNAPSHOT_ENCRYPTION_UNCONFIGURED",
    });
    // The admission CAS itself already reconciled the binding's revision --
    // that part of the response was real and correlated -- but the whole
    // `persist()` call still failed, which is what blocks this turn's
    // tools/playback (VoiceDialogueEngine.turn awaits `ports.persist`).
    expect(binding.sessionVersion).toBe(6);
  });

  /**
   * Codex reopen round 18, R4-persist ("regress lost replies, not only
   * delayed ones"): a genuinely LOST response (the request never reaches
   * the caller at all -- network error, timeout, proxy reset) is
   * distinct from a correlated-but-late one (already covered above by the
   * "LATE response" tests) -- the write can still have durably committed
   * server-side with nothing at all coming back. Without reconciling,
   * this turn's admission would wrongly fail even though apps/api already
   * applied it.
   */
  it("reconciles a lost (network-unreachable) resolveInput response against authoritative truth instead of failing a CAS that actually committed", async () => {
    const binding: VoiceSessionBinding = {
      voiceSessionId: "22222222-2222-2222-2222-222222222222",
      resourceScopeId: "33333333-3333-3333-3333-333333333333",
      routeProfileVersion: 1,
      leaseEpoch: 1,
      sessionVersion: 5,
    };
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const path = String(url);
      if (path.endsWith("/capabilities")) {
        return jsonResponse(200, {
          data: { token: "capability-token", tokenType: "Bearer", expiresIn: 120 },
        });
      }
      if (init?.method === "POST" && path.endsWith("/input-resolutions")) {
        throw new Error("ECONNRESET: response never arrived");
      }
      if (init?.method === "GET" && path.endsWith("/dialogue-snapshot")) {
        return jsonResponse(200, {
          data: {
            session: {
              voiceSessionId: binding.voiceSessionId,
              sessionVersion: 6,
              resourceScopeId: binding.resourceScopeId,
              routeProfileVersion: binding.routeProfileVersion,
              leaseEpoch: binding.leaseEpoch,
              inputEpoch: request.inputEpoch,
              pendingInput: false,
            },
            snapshot: null,
          },
        });
      }
      if (path.endsWith("/dialogue-snapshot")) {
        return jsonResponse(200, {
          data: {
            snapshot: {
              snapshotId: "snapshot-1",
              voiceSessionId: binding.voiceSessionId,
              sessionVersion: 6,
              inputEpoch: request.inputEpoch,
              mediaEpoch: 0,
              turnId: request.turnId,
              content: {},
              createdAt: "2026-07-24T09:00:00.000Z",
              retentionExpiresAt: "2027-01-20T09:00:00.000Z",
            },
            deduped: false,
          },
        });
      }
      throw new Error(`unexpected request ${init?.method ?? "GET"} ${path}`);
    });
    const client_ = new VoiceApiClient(
      { baseUrl: "https://api.example.test", fetchImpl },
      { getToken: vi.fn(async () => "workload-token") },
    );
    const port = createTrustedDialoguePersistPort(client_, () => binding);

    await port.persist(
      { toSnapshotContent: () => ({}) } as unknown as VoiceDialogueState,
      request,
    );

    expect(binding.sessionVersion).toBe(6);
  });

  it("still fails closed when a lost resolveInput response cannot be reconciled (the reconciliation read itself shows no matching commit)", async () => {
    const binding: VoiceSessionBinding = {
      voiceSessionId: "22222222-2222-2222-2222-222222222222",
      resourceScopeId: "33333333-3333-3333-3333-333333333333",
      routeProfileVersion: 1,
      leaseEpoch: 1,
      sessionVersion: 5,
    };
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const path = String(url);
      if (path.endsWith("/capabilities")) {
        return jsonResponse(200, {
          data: { token: "capability-token", tokenType: "Bearer", expiresIn: 120 },
        });
      }
      if (init?.method === "POST" && path.endsWith("/input-resolutions")) {
        throw new Error("ECONNRESET: response never arrived");
      }
      if (init?.method === "GET" && path.endsWith("/dialogue-snapshot")) {
        // Authoritative truth shows the CAS never actually advanced --
        // this is a genuinely lost write, not merely a lost reply.
        return jsonResponse(200, {
          data: {
            session: {
              voiceSessionId: binding.voiceSessionId,
              sessionVersion: binding.sessionVersion,
              resourceScopeId: binding.resourceScopeId,
              routeProfileVersion: binding.routeProfileVersion,
              leaseEpoch: binding.leaseEpoch,
              inputEpoch: request.inputEpoch - 1,
              pendingInput: true,
            },
            snapshot: null,
          },
        });
      }
      throw new Error(`unexpected request ${init?.method ?? "GET"} ${path}`);
    });
    const client_ = new VoiceApiClient(
      { baseUrl: "https://api.example.test", fetchImpl },
      { getToken: vi.fn(async () => "workload-token") },
    );
    const port = createTrustedDialoguePersistPort(client_, () => binding);

    await expect(
      port.persist(
        { toSnapshotContent: () => ({}) } as unknown as VoiceDialogueState,
        request,
      ),
    ).rejects.toThrow("ECONNRESET");
    expect(binding.sessionVersion).toBe(5);
  });

  it("reconciles a lost (network-unreachable) persistDialogueSnapshot response against authoritative truth instead of losing previously-accepted dialogue content", async () => {
    const binding: VoiceSessionBinding = {
      voiceSessionId: "22222222-2222-2222-2222-222222222222",
      resourceScopeId: "33333333-3333-3333-3333-333333333333",
      routeProfileVersion: 1,
      leaseEpoch: 1,
      sessionVersion: 5,
    };
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const path = String(url);
      if (path.endsWith("/capabilities")) {
        return jsonResponse(200, {
          data: { token: "capability-token", tokenType: "Bearer", expiresIn: 120 },
        });
      }
      if (init?.method === "POST" && path.endsWith("/input-resolutions")) {
        return jsonResponse(200, {
          data: {
            session: {
              voiceSessionId: binding.voiceSessionId,
              sessionVersion: 6,
              resourceScopeId: binding.resourceScopeId,
              routeProfileVersion: binding.routeProfileVersion,
              leaseEpoch: binding.leaseEpoch,
              inputEpoch: request.inputEpoch,
              pendingInput: false,
            },
          },
        });
      }
      if (init?.method === "POST" && path.endsWith("/dialogue-snapshot")) {
        // The content commit actually lands server-side -- this models
        // the exact reopened probe (an emergency/handoff turn's content
        // is durably accepted) but the HTTP acknowledgement is lost.
        throw new Error("ECONNRESET: response never arrived");
      }
      if (init?.method === "GET" && path.endsWith("/dialogue-snapshot")) {
        return jsonResponse(200, {
          data: {
            session: {
              voiceSessionId: binding.voiceSessionId,
              sessionVersion: 6,
              resourceScopeId: binding.resourceScopeId,
              routeProfileVersion: binding.routeProfileVersion,
              leaseEpoch: binding.leaseEpoch,
              inputEpoch: request.inputEpoch,
              pendingInput: false,
            },
            snapshot: {
              snapshotId: "snapshot-1",
              voiceSessionId: binding.voiceSessionId,
              sessionVersion: 6,
              inputEpoch: request.inputEpoch,
              mediaEpoch: 0,
              turnId: request.turnId,
              content: {
                draftVersion: 0,
                confirmationId: null,
                slots: {},
                slotHistory: [],
                addressRepairs: { pickup: 0, dropoff: 0 },
                addressHistory: [],
                handoff: { reason: "urgent_safety", intent: "emergency" },
              },
              createdAt: "2026-07-24T09:00:00.000Z",
              retentionExpiresAt: "2027-01-20T09:00:00.000Z",
            },
          },
        });
      }
      throw new Error(`unexpected request ${init?.method ?? "GET"} ${path}`);
    });
    const client_ = new VoiceApiClient(
      { baseUrl: "https://api.example.test", fetchImpl },
      { getToken: vi.fn(async () => "workload-token") },
    );
    const port = createTrustedDialoguePersistPort(client_, () => binding);
    const restoreFromSnapshotContent = vi.fn();

    await port.persist(
      {
        toSnapshotContent: () => ({ handoff: { reason: "urgent_safety" } }),
        restoreFromSnapshotContent,
      } as unknown as VoiceDialogueState,
      request,
    );

    // persist() resolved successfully -- `VoiceDialogueEngine.turn` will
    // now `Object.assign(state, next)`, so the engine's own in-memory
    // state stays consistent with the content that was actually durably
    // committed, instead of silently believing this turn's content was
    // never recorded and letting the next turn overwrite it.
    expect(binding.sessionVersion).toBe(6);
    // R4-persist (Codex reopen, canonical 2026-10-03T17:41:28Z): the
    // reconciled content is also restored directly into this
    // attachment's dialogue state, not only inferred from `persist()`
    // resolving successfully. The reconciled snapshot's content must be a
    // real, schema-valid `VoiceDialogueSnapshotContent` record (AUDIT-
    // VOICE-APPLICATION-WIRING-20261003 R4-persist incomplete
    // discriminated response validation, Codex reopen, canonical
    // 2026-10-04T01:25:05Z) -- a bare `{handoff: ...}` stub would now
    // correctly fail `voiceDialogueSnapshotContentSchema` and never reach
    // this call at all.
    expect(restoreFromSnapshotContent).toHaveBeenCalledWith({
      draftVersion: 0,
      confirmationId: null,
      slots: {},
      slotHistory: [],
      addressRepairs: { pickup: 0, dropoff: 0 },
      addressHistory: [],
      handoff: { reason: "urgent_safety", intent: "emergency" },
    });
  });

  /**
   * Codex reopen, canonical 2026-10-03T17:41:28Z, R4-persist ("abort is
   * not proof of no commit"): the exact reopened probe -- an emergency
   * turn's handoff snapshot is durably accepted server-side, but
   * `speech.started` cancels the turn (aborts `signal`) before the HTTP
   * acknowledgement is processed. `persist()` must still reject (this
   * turn was genuinely cancelled), but the reconciled content must be
   * carried into the attachment's own dialogue state anyway, or the next
   * (unrelated, empty) turn would silently overwrite the durably-accepted
   * handoff with blank content -- the "snapshot handoffs=[urgent_safety,
   * null]" regression this reopened on.
   */
  it("restores reconciled content into dialogue state even when persist() still rejects for being cancelled mid-write", async () => {
    const binding: VoiceSessionBinding = {
      voiceSessionId: "22222222-2222-2222-2222-222222222222",
      resourceScopeId: "33333333-3333-3333-3333-333333333333",
      routeProfileVersion: 1,
      leaseEpoch: 1,
      sessionVersion: 5,
    };
    const controller = new AbortController();
    let releasePost!: () => void;
    const gate = new Promise<void>((resolve) => {
      releasePost = resolve;
    });
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const path = String(url);
      if (path.endsWith("/capabilities")) {
        return jsonResponse(200, {
          data: { token: "capability-token", tokenType: "Bearer", expiresIn: 120 },
        });
      }
      if (init?.method === "POST" && path.endsWith("/input-resolutions")) {
        return jsonResponse(200, {
          data: {
            session: {
              voiceSessionId: binding.voiceSessionId,
              sessionVersion: 6,
              resourceScopeId: binding.resourceScopeId,
              routeProfileVersion: binding.routeProfileVersion,
              leaseEpoch: binding.leaseEpoch,
              inputEpoch: request.inputEpoch,
              pendingInput: false,
            },
          },
        });
      }
      if (init?.method === "POST" && path.endsWith("/dialogue-snapshot")) {
        // The content commit actually lands server-side; this attempt's
        // own `signal` fires (simulating barge-in) before the gate is
        // released, modelling the response being lost to cancellation.
        controller.abort();
        await gate;
        throw new Error("voice_media_turn_cancelled: aborted mid-write");
      }
      if (init?.method === "GET" && path.endsWith("/dialogue-snapshot")) {
        return jsonResponse(200, {
          data: {
            session: {
              voiceSessionId: binding.voiceSessionId,
              sessionVersion: 6,
              resourceScopeId: binding.resourceScopeId,
              routeProfileVersion: binding.routeProfileVersion,
              leaseEpoch: binding.leaseEpoch,
              inputEpoch: request.inputEpoch,
              pendingInput: false,
            },
            snapshot: {
              snapshotId: "snapshot-1",
              voiceSessionId: binding.voiceSessionId,
              sessionVersion: 6,
              inputEpoch: request.inputEpoch,
              mediaEpoch: 0,
              turnId: request.turnId,
              content: {
                draftVersion: 0,
                confirmationId: null,
                slots: {},
                slotHistory: [],
                addressRepairs: { pickup: 0, dropoff: 0 },
                addressHistory: [],
                handoff: { reason: "urgent_safety", intent: "emergency" },
              },
              createdAt: "2026-07-24T09:00:00.000Z",
              retentionExpiresAt: "2027-01-20T09:00:00.000Z",
            },
          },
        });
      }
      throw new Error(`unexpected request ${init?.method ?? "GET"} ${path}`);
    });
    const client_ = new VoiceApiClient(
      { baseUrl: "https://api.example.test", fetchImpl },
      { getToken: vi.fn(async () => "workload-token") },
    );
    const port = createTrustedDialoguePersistPort(client_, () => binding);
    const restoreFromSnapshotContent = vi.fn();

    const pending = port.persist(
      {
        toSnapshotContent: () => ({ handoff: { reason: "urgent_safety" } }),
        restoreFromSnapshotContent,
      } as unknown as VoiceDialogueState,
      { ...request, signal: controller.signal } as VoiceDialogueRequest,
    );
    for (let i = 0; i < 50 && !controller.signal.aborted; i++) {
      await Promise.resolve();
    }
    expect(controller.signal.aborted).toBe(true);
    releasePost();

    await expect(pending).rejects.toThrow(/voice_trusted_persist_aborted/);
    // AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-persist incomplete
    // discriminated response validation (Codex reopen, canonical
    // 2026-10-04T01:25:05Z): the reconciled snapshot's content must be a
    // real, schema-valid `VoiceDialogueSnapshotContent` record -- a bare
    // `{handoff: ...}` stub would now correctly fail
    // `voiceDialogueSnapshotContentSchema` and never reach this call.
    expect(restoreFromSnapshotContent).toHaveBeenCalledWith({
      draftVersion: 0,
      confirmationId: null,
      slots: {},
      slotHistory: [],
      addressRepairs: { pickup: 0, dropoff: 0 },
      addressHistory: [],
      handoff: { reason: "urgent_safety", intent: "emergency" },
    });
  });

  it("still fails closed when a lost persistDialogueSnapshot response cannot be reconciled (the reconciliation read shows an unrelated/older snapshot)", async () => {
    const binding: VoiceSessionBinding = {
      voiceSessionId: "22222222-2222-2222-2222-222222222222",
      resourceScopeId: "33333333-3333-3333-3333-333333333333",
      routeProfileVersion: 1,
      leaseEpoch: 1,
      sessionVersion: 5,
    };
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const path = String(url);
      if (path.endsWith("/capabilities")) {
        return jsonResponse(200, {
          data: { token: "capability-token", tokenType: "Bearer", expiresIn: 120 },
        });
      }
      if (init?.method === "POST" && path.endsWith("/input-resolutions")) {
        return jsonResponse(200, {
          data: {
            session: {
              voiceSessionId: binding.voiceSessionId,
              sessionVersion: 6,
              resourceScopeId: binding.resourceScopeId,
              routeProfileVersion: binding.routeProfileVersion,
              leaseEpoch: binding.leaseEpoch,
              inputEpoch: request.inputEpoch,
              pendingInput: false,
            },
          },
        });
      }
      if (init?.method === "POST" && path.endsWith("/dialogue-snapshot")) {
        throw new Error("ECONNRESET: response never arrived");
      }
      if (init?.method === "GET" && path.endsWith("/dialogue-snapshot")) {
        // Authoritative truth shows no snapshot for THIS turn's revision
        // at all -- the content write genuinely never landed.
        return jsonResponse(200, {
          data: {
            session: {
              voiceSessionId: binding.voiceSessionId,
              sessionVersion: 6,
              resourceScopeId: binding.resourceScopeId,
              routeProfileVersion: binding.routeProfileVersion,
              leaseEpoch: binding.leaseEpoch,
              inputEpoch: request.inputEpoch,
              pendingInput: false,
            },
            snapshot: {
              snapshotId: "snapshot-prior",
              voiceSessionId: binding.voiceSessionId,
              sessionVersion: 5,
              inputEpoch: request.inputEpoch - 1,
              mediaEpoch: 0,
              turnId: "some-prior-turn",
              content: {},
              createdAt: "2026-07-24T09:00:00.000Z",
              retentionExpiresAt: "2027-01-20T09:00:00.000Z",
            },
          },
        });
      }
      throw new Error(`unexpected request ${init?.method ?? "GET"} ${path}`);
    });
    const client_ = new VoiceApiClient(
      { baseUrl: "https://api.example.test", fetchImpl },
      { getToken: vi.fn(async () => "workload-token") },
    );
    const port = createTrustedDialoguePersistPort(client_, () => binding);

    await expect(
      port.persist(
        { toSnapshotContent: () => ({}) } as unknown as VoiceDialogueState,
        request,
      ),
    ).rejects.toThrow("ECONNRESET");
  });

  /**
   * Codex reopen round 5/6, R4-persist residual, second independent case:
   * a response that correlates by `inputEpoch` alone is not sufficient --
   * a misattributed response for an entirely different session (or one
   * whose `sessionVersion` is not exactly the CAS's own `+1`) must never
   * be trusted to advance (or regress) this binding's revision.
   */
  it("rejects a resolveInput response for a different voiceSessionId even though inputEpoch matches, leaving sessionVersion untouched", async () => {
    const binding: VoiceSessionBinding = {
      voiceSessionId: "22222222-2222-2222-2222-222222222222",
      resourceScopeId: "33333333-3333-3333-3333-333333333333",
      routeProfileVersion: 1,
      leaseEpoch: 1,
      sessionVersion: 4,
    };
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).endsWith("/capabilities")) {
        return jsonResponse(200, {
          data: { token: "capability-token", tokenType: "Bearer", expiresIn: 120 },
        });
      }
      // Correlates on inputEpoch (7, matching the request below) but is
      // for a different session entirely, with a sessionVersion that would
      // *regress* this binding (1, not 4's own CAS-advanced 5).
      return jsonResponse(200, {
        data: {
          session: {
            voiceSessionId: "another-session",
            sessionVersion: 1,
            inputEpoch: 7,
            pendingInput: true,
          },
        },
      });
    });
    const client_ = new VoiceApiClient(
      { baseUrl: "https://api.example.test", fetchImpl },
      { getToken: vi.fn(async () => "workload-token") },
    );
    const port = createTrustedDialoguePersistPort(client_, () => binding);

    await expect(
      port.persist(
        {} as VoiceDialogueState,
        { inputEpoch: 7 } as VoiceDialogueRequest,
      ),
    ).rejects.toThrow(/voice_trusted_persist_stale_response/);
    expect(binding.sessionVersion).toBe(4);
  });

  it("[definitive rejection, Codex reopen canonical 2026-10-03T21:53:56Z] a structured, definitively-rejected content-persist response never marks unresolvedCommit -- no reconciliation GET, no permanent poll-blocking for a write that never landed", async () => {
    const binding: VoiceSessionBinding = {
      voiceSessionId: "22222222-2222-2222-2222-222222222222",
      resourceScopeId: "33333333-3333-3333-3333-333333333333",
      routeProfileVersion: 1,
      leaseEpoch: 1,
      sessionVersion: 5,
    };
    let reconciliationGetCalls = 0;
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const path = String(url);
      if (path.endsWith("/capabilities")) {
        return jsonResponse(200, {
          data: { token: "capability-token", tokenType: "Bearer", expiresIn: 120 },
        });
      }
      if (init?.method === "POST" && path.endsWith("/input-resolutions")) {
        return jsonResponse(200, {
          data: {
            session: {
              voiceSessionId: binding.voiceSessionId,
              sessionVersion: 6,
              resourceScopeId: binding.resourceScopeId,
              routeProfileVersion: binding.routeProfileVersion,
              leaseEpoch: binding.leaseEpoch,
              inputEpoch: request.inputEpoch,
              pendingInput: false,
            },
          },
        });
      }
      if (init?.method === "GET" && path.endsWith("/dialogue-snapshot")) {
        reconciliationGetCalls += 1;
        throw new Error(
          "test failure: no reconciliation GET should ever be issued for a definitive rejection",
        );
      }
      if (path.endsWith("/dialogue-snapshot")) {
        // AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-persist (Codex
        // reopen, canonical 2026-10-03T21:53:56Z, "every failed snapshot
        // write is now made permanently unresolved unless that exact
        // snapshot actually exists"): a structured `VOICE_DRAFT_STALE`
        // response means apps/api actually ran, looked at this exact CAS
        // precondition, and definitively rejected it -- never a transport
        // failure where no response was received at all. There is no
        // ambiguity here: the write is KNOWN to have never landed.
        return jsonResponse(409, {
          error: { code: "VOICE_DRAFT_STALE", message: "stale session version" },
        });
      }
      throw new Error(`unexpected request ${init?.method ?? "GET"} ${path}`);
    });
    const client_ = new VoiceApiClient(
      { baseUrl: "https://api.example.test", fetchImpl },
      { getToken: vi.fn(async () => "workload-token") },
    );
    const port = createTrustedDialoguePersistPort(client_, () => binding);
    const attachmentState = new VoiceDialogueState();

    await expect(
      port.persist(
        { toSnapshotContent: () => ({}) } as unknown as VoiceDialogueState,
        request,
        { attachmentState },
      ),
    ).rejects.toMatchObject({ code: "VOICE_DRAFT_STALE" });

    // `unresolvedCommit` must never be set for a definitive rejection --
    // marking it would block every later turn's persist, retrying a
    // bounded reconciliation GET each time, for a snapshot already known
    // to not exist. Before this fix, EVERY content-persist catch (ANY
    // `err`, regardless of whether apps/api ever actually responded) set
    // this marker unconditionally.
    expect(attachmentState.unresolvedCommit).toBeNull();
    // No reconciliation read was ever issued -- there is nothing
    // ambiguous to reconcile.
    expect(reconciliationGetCalls).toBe(0);
  });

  it("[pre-store failure, Codex reopen canonical 2026-10-03T22:41:06Z] a one-off transport failure before any snapshot is ever stored does not permanently wedge every later turn on this attachment", async () => {
    const binding: VoiceSessionBinding = {
      voiceSessionId: "22222222-2222-2222-2222-222222222222",
      resourceScopeId: "33333333-3333-3333-3333-333333333333",
      routeProfileVersion: 1,
      leaseEpoch: 1,
      sessionVersion: 5,
    };
    let contentPostCount = 0;
    let reconciliationGetCalls = 0;
    let resolveCalls = 0;
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const path = String(url);
      if (path.endsWith("/capabilities")) {
        return jsonResponse(200, {
          data: { token: "capability-token", tokenType: "Bearer", expiresIn: 120 },
        });
      }
      if (init?.method === "POST" && path.endsWith("/input-resolutions")) {
        const body = JSON.parse(init.body as string) as {
          expectedSessionVersion: number;
        };
        return jsonResponse(200, {
          data: {
            session: {
              voiceSessionId: binding.voiceSessionId,
              sessionVersion: body.expectedSessionVersion + 1,
              resourceScopeId: binding.resourceScopeId,
              routeProfileVersion: binding.routeProfileVersion,
              leaseEpoch: binding.leaseEpoch,
              inputEpoch: request.inputEpoch,
              pendingInput: false,
            },
          },
        });
      }
      if (init?.method === "POST" && path.endsWith("/dialogue-snapshot/resolve")) {
        // R4-persist late-acceptance fence: nothing was ever actually
        // stored (every content POST throws before storage below), so the
        // atomic adjudication authoritatively confirms non-acceptance
        // every time, same as the bounded GET polling already truthfully
        // observed. Checked ahead of the plain `/dialogue-snapshot` POST
        // branch below since that branch's own suffix match would not
        // otherwise collide, but ordering it first keeps this double
        // legible as the adjudication path.
        resolveCalls += 1;
        // AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-persist incomplete
        // discriminated response validation (Codex reopen, canonical
        // 2026-10-04T01:25:05Z): the real server now echoes the adjudicated
        // identity plus the fence it just raised -- a bare `{accepted:
        // false}` no longer correlates and must classify as `"unknown"`,
        // not a confirmed rejection. Echo this exact call's own body back,
        // matching `VoiceSessionService.resolveDialogueSnapshotOutcome`'s
        // real contract.
        const body = JSON.parse(init.body as string) as {
          expectedSessionVersion: number;
          inputEpoch: number;
          mediaEpoch: number;
          turnId: string;
        };
        return jsonResponse(200, {
          data: {
            accepted: false,
            voiceSessionId: binding.voiceSessionId,
            sessionVersion: body.expectedSessionVersion,
            inputEpoch: body.inputEpoch,
            mediaEpoch: body.mediaEpoch,
            turnId: body.turnId,
            fenceVersion: body.expectedSessionVersion,
          },
        });
      }
      if (init?.method === "POST" && path.endsWith("/dialogue-snapshot")) {
        // The double NEVER actually stores anything -- every attempt fails
        // before storage, exactly like the reopened probe's "double
        // throws once BEFORE first snapshot storage, thereafter serves
        // truthfully snapshot=null and accepts any new request".
        contentPostCount += 1;
        throw new TypeError("simulated pre-store transport failure");
      }
      if (init?.method === "GET" && path.endsWith("/dialogue-snapshot")) {
        reconciliationGetCalls += 1;
        return jsonResponse(200, {
          data: {
            session: {
              voiceSessionId: binding.voiceSessionId,
              sessionVersion: binding.sessionVersion,
              resourceScopeId: binding.resourceScopeId,
              routeProfileVersion: binding.routeProfileVersion,
              leaseEpoch: binding.leaseEpoch,
              inputEpoch: request.inputEpoch,
              pendingInput: false,
            },
            snapshot: null,
          },
        });
      }
      throw new Error(`unexpected request ${init?.method ?? "GET"} ${path}`);
    });
    const client_ = new VoiceApiClient(
      { baseUrl: "https://api.example.test", fetchImpl },
      { getToken: vi.fn(async () => "workload-token") },
    );
    const port = createTrustedDialoguePersistPort(client_, () => binding);
    const attachmentState = new VoiceDialogueState();

    for (let turn = 1; turn <= 4; turn++) {
      // AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-persist (Codex reopen,
      // canonical 2026-10-03T22:41:06Z, "pre-store failure permanently
      // wedges the attachment"): before this fix, turn 1's own failed
      // write left `attachmentState.unresolvedCommit` set and
      // `reconcileUnresolvedCommit` THREW once its bounded retries
      // exhausted finding nothing -- every later turn's top-of-call gate
      // re-entered that same bounded loop (never resolving it) instead of
      // ever reaching its own fresh submission attempt. Each turn here
      // must fail with its OWN natural transport error, never an opaque
      // internal "unresolved_commit" exhaustion error, proving the gate
      // never wedges.
      await expect(
        port.persist(
          {
            toSnapshotContent: () => ({}),
            committedSessionVersion: attachmentState.committedSessionVersion,
          } as unknown as VoiceDialogueState,
          { ...request, turnId: `turn-${turn}` },
          { attachmentState },
        ),
      ).rejects.toThrow(/simulated pre-store transport failure/);
    }

    expect(contentPostCount).toBe(4);
    // 3 bounded reconciliation attempts per turn, none ever correlating
    // (nothing was ever actually stored) -- 4 turns x 3 = 12.
    expect(reconciliationGetCalls).toBe(12);
    // R4-persist late-acceptance fence: each turn's bounded polling
    // exhausts, then falls back to exactly one atomic adjudication call,
    // which authoritatively confirms non-acceptance -- 4 turns x 1 = 4.
    expect(resolveCalls).toBe(4);
    // Confirmed non-acceptance clears the marker every time -- it must
    // never still be set once the last turn's own bounded retries
    // exhaust, or the NEXT turn after this test would still be wedged.
    expect(attachmentState.unresolvedCommit).toBeNull();
  });

  it("[late acceptance, Codex reopen canonical 2026-10-03T23:31:57Z] three truthful null reads before the delayed write lands are not a fence -- the atomic adjudication call still finds it and installs it", async () => {
    const binding: VoiceSessionBinding = {
      voiceSessionId: "22222222-2222-2222-2222-222222222222",
      resourceScopeId: "33333333-3333-3333-3333-333333333333",
      routeProfileVersion: 1,
      leaseEpoch: 1,
      sessionVersion: 5,
    };
    let resolveCalls = 0;
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const path = String(url);
      if (path.endsWith("/capabilities")) {
        return jsonResponse(200, {
          data: { token: "capability-token", tokenType: "Bearer", expiresIn: 120 },
        });
      }
      if (init?.method === "POST" && path.endsWith("/input-resolutions")) {
        return jsonResponse(200, {
          data: {
            session: {
              voiceSessionId: binding.voiceSessionId,
              sessionVersion: 6,
              resourceScopeId: binding.resourceScopeId,
              routeProfileVersion: binding.routeProfileVersion,
              leaseEpoch: binding.leaseEpoch,
              inputEpoch: request.inputEpoch,
              pendingInput: false,
            },
          },
        });
      }
      if (init?.method === "POST" && path.endsWith("/dialogue-snapshot")) {
        throw new TypeError("simulated lost acknowledgement");
      }
      if (init?.method === "GET" && path.endsWith("/dialogue-snapshot")) {
        // Three genuinely truthful reads, all BEFORE the delayed write
        // lands -- "three successful null reads are no more a fence
        // against late acceptance than one."
        return jsonResponse(200, {
          data: {
            session: {
              voiceSessionId: binding.voiceSessionId,
              sessionVersion: 6,
              resourceScopeId: binding.resourceScopeId,
              routeProfileVersion: binding.routeProfileVersion,
              leaseEpoch: binding.leaseEpoch,
              inputEpoch: request.inputEpoch,
              pendingInput: false,
            },
            snapshot: null,
          },
        });
      }
      if (
        init?.method === "POST" &&
        path.endsWith("/dialogue-snapshot/resolve")
      ) {
        resolveCalls += 1;
        // The atomic adjudication call lands AFTER the bounded polling
        // above already (truthfully) observed nothing -- by now the
        // delayed write has actually landed server-side.
        return jsonResponse(200, {
          data: {
            accepted: true,
            snapshot: {
              snapshotId: "snapshot-1",
              voiceSessionId: binding.voiceSessionId,
              sessionVersion: 6,
              inputEpoch: request.inputEpoch,
              mediaEpoch: 0,
              turnId: request.turnId,
              content: {
                draftVersion: 0,
                confirmationId: null,
                slots: {},
                slotHistory: [],
                addressRepairs: { pickup: 0, dropoff: 0 },
                addressHistory: [],
                handoff: { reason: "urgent_safety", intent: "emergency" },
              },
              createdAt: "2026-07-24T09:00:00.000Z",
              retentionExpiresAt: "2027-01-20T09:00:00.000Z",
            },
          },
        });
      }
      throw new Error(`unexpected request ${init?.method ?? "GET"} ${path}`);
    });
    const client_ = new VoiceApiClient(
      { baseUrl: "https://api.example.test", fetchImpl },
      { getToken: vi.fn(async () => "workload-token") },
    );
    const port = createTrustedDialoguePersistPort(client_, () => binding);
    const attachmentState = new VoiceDialogueState();
    const restoreFromSnapshotContent = vi.fn();

    // This exact write's content commit DID durably land -- the atomic
    // adjudication call found it, so this call's own `persist()` resolves
    // successfully (its content is the recovered one, not a fresh
    // submission), same as the sibling bounded-GET-finds-it probes above.
    await port.persist(
      {
        toSnapshotContent: () => ({ handoff: { reason: "urgent_safety" } }),
        restoreFromSnapshotContent,
        committedSessionVersion: attachmentState.committedSessionVersion,
      } as unknown as VoiceDialogueState,
      request,
      { attachmentState },
    );

    expect(resolveCalls).toBe(1);
    expect(restoreFromSnapshotContent).toHaveBeenCalledWith(
      expect.objectContaining({
        handoff: { reason: "urgent_safety", intent: "emergency" },
      }),
    );
    expect(attachmentState.committedSessionVersion).toBe(6);
    expect(attachmentState.unresolvedCommit).toBeNull();
  });

  it("[outcome unknown, Codex reopen canonical 2026-10-03T23:31:57Z] when the atomic adjudication call is itself unreachable, the marker stays set and a concurrent turn fails closed instead of admitting new content", async () => {
    const binding: VoiceSessionBinding = {
      voiceSessionId: "22222222-2222-2222-2222-222222222222",
      resourceScopeId: "33333333-3333-3333-3333-333333333333",
      routeProfileVersion: 1,
      leaseEpoch: 1,
      sessionVersion: 5,
    };
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const path = String(url);
      if (path.endsWith("/capabilities")) {
        return jsonResponse(200, {
          data: { token: "capability-token", tokenType: "Bearer", expiresIn: 120 },
        });
      }
      if (init?.method === "POST" && path.endsWith("/input-resolutions")) {
        return jsonResponse(200, {
          data: {
            session: {
              voiceSessionId: binding.voiceSessionId,
              sessionVersion: 6,
              resourceScopeId: binding.resourceScopeId,
              routeProfileVersion: binding.routeProfileVersion,
              leaseEpoch: binding.leaseEpoch,
              inputEpoch: request.inputEpoch,
              pendingInput: false,
            },
          },
        });
      }
      if (init?.method === "POST" && path.endsWith("/dialogue-snapshot")) {
        throw new TypeError("simulated lost acknowledgement");
      }
      if (init?.method === "GET" && path.endsWith("/dialogue-snapshot")) {
        return jsonResponse(200, {
          data: {
            session: {
              voiceSessionId: binding.voiceSessionId,
              sessionVersion: 6,
              resourceScopeId: binding.resourceScopeId,
              routeProfileVersion: binding.routeProfileVersion,
              leaseEpoch: binding.leaseEpoch,
              inputEpoch: request.inputEpoch,
              pendingInput: false,
            },
            snapshot: null,
          },
        });
      }
      if (
        init?.method === "POST" &&
        path.endsWith("/dialogue-snapshot/resolve")
      ) {
        // apps/api is itself unreachable for this exact adjudication call
        // -- genuinely unknown, never a confirmed verdict either way.
        throw new TypeError("simulated adjudication transport failure");
      }
      throw new Error(`unexpected request ${init?.method ?? "GET"} ${path}`);
    });
    const client_ = new VoiceApiClient(
      { baseUrl: "https://api.example.test", fetchImpl },
      { getToken: vi.fn(async () => "workload-token") },
    );
    const port = createTrustedDialoguePersistPort(client_, () => binding);
    const attachmentState = new VoiceDialogueState();

    await expect(
      port.persist(
        {
          toSnapshotContent: () => ({}),
          committedSessionVersion: attachmentState.committedSessionVersion,
        } as unknown as VoiceDialogueState,
        request,
        { attachmentState },
      ),
    ).rejects.toThrow(/simulated lost acknowledgement/);

    // The marker must still be set -- the outcome is genuinely unknown,
    // never cleared merely because the bounded retry/adjudication budget
    // ran out.
    expect(attachmentState.unresolvedCommit).not.toBeNull();

    // A later turn's own top-of-call gate must fail closed with a
    // distinct, honest error -- never silently proceed as if the prior
    // write were confirmed non-accepted, and never claim it was
    // "superseded" by a recovered commit that was never actually found.
    await expect(
      port.persist(
        {
          toSnapshotContent: () => ({}),
          committedSessionVersion: attachmentState.committedSessionVersion,
        } as unknown as VoiceDialogueState,
        { ...request, turnId: "turn-2" },
        { attachmentState },
      ),
    ).rejects.toThrow(/voice_trusted_persist_unresolved_commit_unknown/);
  });

  it("[adjudication-response validation, Codex reopen canonical 2026-10-04T00:26:49Z] a malformed resolve response with no `accepted` field at all is UNKNOWN -- never installed, never a confirmed rejection", async () => {
    const binding: VoiceSessionBinding = {
      voiceSessionId: "22222222-2222-2222-2222-222222222222",
      resourceScopeId: "33333333-3333-3333-3333-333333333333",
      routeProfileVersion: 1,
      leaseEpoch: 1,
      sessionVersion: 5,
    };
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const path = String(url);
      if (path.endsWith("/capabilities")) {
        return jsonResponse(200, {
          data: { token: "capability-token", tokenType: "Bearer", expiresIn: 120 },
        });
      }
      if (init?.method === "POST" && path.endsWith("/input-resolutions")) {
        return jsonResponse(200, {
          data: {
            session: {
              voiceSessionId: binding.voiceSessionId,
              sessionVersion: 6,
              resourceScopeId: binding.resourceScopeId,
              routeProfileVersion: binding.routeProfileVersion,
              leaseEpoch: binding.leaseEpoch,
              inputEpoch: request.inputEpoch,
              pendingInput: false,
            },
          },
        });
      }
      if (init?.method === "POST" && path.endsWith("/dialogue-snapshot")) {
        throw new TypeError("simulated lost acknowledgement");
      }
      if (init?.method === "GET" && path.endsWith("/dialogue-snapshot")) {
        return jsonResponse(200, {
          data: {
            session: {
              voiceSessionId: binding.voiceSessionId,
              sessionVersion: 6,
              resourceScopeId: binding.resourceScopeId,
              routeProfileVersion: binding.routeProfileVersion,
              leaseEpoch: binding.leaseEpoch,
              inputEpoch: request.inputEpoch,
              pendingInput: false,
            },
            snapshot: null,
          },
        });
      }
      if (init?.method === "POST" && path.endsWith("/dialogue-snapshot/resolve")) {
        // Malformed/empty envelope -- no `accepted` field at all. Before
        // this fix, a falsy `outcome.accepted` was treated as a confirmed,
        // fence-worthy non-acceptance.
        return jsonResponse(200, { data: {} });
      }
      throw new Error(`unexpected request ${init?.method ?? "GET"} ${path}`);
    });
    const client_ = new VoiceApiClient(
      { baseUrl: "https://api.example.test", fetchImpl },
      { getToken: vi.fn(async () => "workload-token") },
    );
    const port = createTrustedDialoguePersistPort(client_, () => binding);
    const attachmentState = new VoiceDialogueState();
    const restoreFromSnapshotContent = vi.fn();

    await expect(
      port.persist(
        {
          toSnapshotContent: () => ({}),
          restoreFromSnapshotContent,
          committedSessionVersion: attachmentState.committedSessionVersion,
        } as unknown as VoiceDialogueState,
        request,
        { attachmentState },
      ),
    ).rejects.toThrow(/simulated lost acknowledgement/);

    // A malformed response must never be treated as a confirmed verdict in
    // either direction: no content installed, and the marker stays set so
    // a later turn still retries this same reconciliation instead of
    // proceeding as if the write were definitively rejected.
    expect(restoreFromSnapshotContent).not.toHaveBeenCalled();
    expect(attachmentState.committedSessionVersion).toBeNull();
    expect(attachmentState.unresolvedCommit).not.toBeNull();
    await expect(
      port.persist(
        {
          toSnapshotContent: () => ({}),
          committedSessionVersion: attachmentState.committedSessionVersion,
        } as unknown as VoiceDialogueState,
        { ...request, turnId: "turn-2" },
        { attachmentState },
      ),
    ).rejects.toThrow(/voice_trusted_persist_unresolved_commit_unknown/);
  });

  it("[adjudication-response validation, Codex reopen canonical 2026-10-04T00:26:49Z] accepted:true with a FOREIGN session/version/epoch/turn is UNKNOWN -- never installed as if it answered this pending write", async () => {
    const binding: VoiceSessionBinding = {
      voiceSessionId: "22222222-2222-2222-2222-222222222222",
      resourceScopeId: "33333333-3333-3333-3333-333333333333",
      routeProfileVersion: 1,
      leaseEpoch: 1,
      sessionVersion: 5,
    };
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const path = String(url);
      if (path.endsWith("/capabilities")) {
        return jsonResponse(200, {
          data: { token: "capability-token", tokenType: "Bearer", expiresIn: 120 },
        });
      }
      if (init?.method === "POST" && path.endsWith("/input-resolutions")) {
        return jsonResponse(200, {
          data: {
            session: {
              voiceSessionId: binding.voiceSessionId,
              sessionVersion: 6,
              resourceScopeId: binding.resourceScopeId,
              routeProfileVersion: binding.routeProfileVersion,
              leaseEpoch: binding.leaseEpoch,
              inputEpoch: request.inputEpoch,
              pendingInput: false,
            },
          },
        });
      }
      if (init?.method === "POST" && path.endsWith("/dialogue-snapshot")) {
        throw new TypeError("simulated lost acknowledgement");
      }
      if (init?.method === "GET" && path.endsWith("/dialogue-snapshot")) {
        return jsonResponse(200, {
          data: {
            session: {
              voiceSessionId: binding.voiceSessionId,
              sessionVersion: 6,
              resourceScopeId: binding.resourceScopeId,
              routeProfileVersion: binding.routeProfileVersion,
              leaseEpoch: binding.leaseEpoch,
              inputEpoch: request.inputEpoch,
              pendingInput: false,
            },
            snapshot: null,
          },
        });
      }
      if (init?.method === "POST" && path.endsWith("/dialogue-snapshot/resolve")) {
        // `accepted: true` but EVERY identifying field is foreign to this
        // pending write (different session, version, epochs, turn) --
        // before this fix, this was installed onto the attachment with no
        // correlation check at all.
        return jsonResponse(200, {
          data: {
            accepted: true,
            snapshot: {
              snapshotId: "snapshot-foreign",
              voiceSessionId: "99999999-9999-9999-9999-999999999999",
              sessionVersion: 999,
              inputEpoch: 999,
              mediaEpoch: 999,
              turnId: "a-different-turn",
              content: {
                draftVersion: 0,
                confirmationId: null,
                slots: {},
                slotHistory: [],
                addressRepairs: { pickup: 0, dropoff: 0 },
                addressHistory: [],
                handoff: null,
              },
              createdAt: "2026-07-24T09:00:00.000Z",
              retentionExpiresAt: "2027-01-20T09:00:00.000Z",
            },
          },
        });
      }
      throw new Error(`unexpected request ${init?.method ?? "GET"} ${path}`);
    });
    const client_ = new VoiceApiClient(
      { baseUrl: "https://api.example.test", fetchImpl },
      { getToken: vi.fn(async () => "workload-token") },
    );
    const port = createTrustedDialoguePersistPort(client_, () => binding);
    const attachmentState = new VoiceDialogueState();
    const restoreFromSnapshotContent = vi.fn();

    await expect(
      port.persist(
        {
          toSnapshotContent: () => ({}),
          restoreFromSnapshotContent,
          committedSessionVersion: attachmentState.committedSessionVersion,
        } as unknown as VoiceDialogueState,
        request,
        { attachmentState },
      ),
    ).rejects.toThrow(/simulated lost acknowledgement/);

    expect(restoreFromSnapshotContent).not.toHaveBeenCalled();
    expect(attachmentState.committedSessionVersion).toBeNull();
    expect(attachmentState.unresolvedCommit).not.toBeNull();
  });

  it("[R4-resolve expired-content resurrection, Codex reopen canonical 2026-10-04T00:26:49Z] accepted:true, expired:true clears the marker without installing any content -- never a false rollback, never a resurrected expired handoff", async () => {
    const binding: VoiceSessionBinding = {
      voiceSessionId: "22222222-2222-2222-2222-222222222222",
      resourceScopeId: "33333333-3333-3333-3333-333333333333",
      routeProfileVersion: 1,
      leaseEpoch: 1,
      sessionVersion: 5,
    };
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const path = String(url);
      if (path.endsWith("/capabilities")) {
        return jsonResponse(200, {
          data: { token: "capability-token", tokenType: "Bearer", expiresIn: 120 },
        });
      }
      if (init?.method === "POST" && path.endsWith("/input-resolutions")) {
        return jsonResponse(200, {
          data: {
            session: {
              voiceSessionId: binding.voiceSessionId,
              sessionVersion: 6,
              resourceScopeId: binding.resourceScopeId,
              routeProfileVersion: binding.routeProfileVersion,
              leaseEpoch: binding.leaseEpoch,
              inputEpoch: request.inputEpoch,
              pendingInput: false,
            },
          },
        });
      }
      if (init?.method === "POST" && path.endsWith("/dialogue-snapshot")) {
        throw new TypeError("simulated lost acknowledgement");
      }
      if (init?.method === "GET" && path.endsWith("/dialogue-snapshot")) {
        return jsonResponse(200, {
          data: {
            session: {
              voiceSessionId: binding.voiceSessionId,
              sessionVersion: 6,
              resourceScopeId: binding.resourceScopeId,
              routeProfileVersion: binding.routeProfileVersion,
              leaseEpoch: binding.leaseEpoch,
              inputEpoch: request.inputEpoch,
              pendingInput: false,
            },
            snapshot: null,
          },
        });
      }
      if (init?.method === "POST" && path.endsWith("/dialogue-snapshot/resolve")) {
        return jsonResponse(200, {
          data: {
            accepted: true,
            expired: true,
            voiceSessionId: binding.voiceSessionId,
            sessionVersion: 6,
            inputEpoch: request.inputEpoch,
            mediaEpoch: 0,
            turnId: request.turnId,
            retentionExpiresAt: "2020-01-01T00:00:00.000Z",
          },
        });
      }
      throw new Error(`unexpected request ${init?.method ?? "GET"} ${path}`);
    });
    const client_ = new VoiceApiClient(
      { baseUrl: "https://api.example.test", fetchImpl },
      { getToken: vi.fn(async () => "workload-token") },
    );
    const port = createTrustedDialoguePersistPort(client_, () => binding);
    const attachmentState = new VoiceDialogueState();
    const restoreFromSnapshotContent = vi.fn();

    // This exact call's own write is now known accepted-but-expired -- it
    // still fails (nothing restorable to report as this call's own
    // success), but with the ORIGINAL write error, never a fabricated
    // rollback/unknown message.
    await expect(
      port.persist(
        {
          toSnapshotContent: () => ({}),
          restoreFromSnapshotContent,
          committedSessionVersion: attachmentState.committedSessionVersion,
        } as unknown as VoiceDialogueState,
        request,
        { attachmentState },
      ),
    ).rejects.toThrow(/simulated lost acknowledgement/);

    expect(restoreFromSnapshotContent).not.toHaveBeenCalled();
    expect(attachmentState.committedSessionVersion).toBeNull();
    // The marker IS cleared (the outcome is known) -- a later turn is free
    // to proceed instead of being permanently wedged behind content that
    // will never become restorable.
    expect(attachmentState.unresolvedCommit).toBeNull();
  });

  it("[unstructured response, Codex reopen canonical 2026-10-03T22:41:06Z] an opaque intermediary 502/504 with no structured error body is ambiguous, not a confirmed domain rejection -- the durably-landed write is still reconciled", async () => {
    const binding: VoiceSessionBinding = {
      voiceSessionId: "22222222-2222-2222-2222-222222222222",
      resourceScopeId: "33333333-3333-3333-3333-333333333333",
      routeProfileVersion: 1,
      leaseEpoch: 1,
      sessionVersion: 5,
    };
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const path = String(url);
      if (path.endsWith("/capabilities")) {
        return jsonResponse(200, {
          data: { token: "capability-token", tokenType: "Bearer", expiresIn: 120 },
        });
      }
      if (init?.method === "POST" && path.endsWith("/input-resolutions")) {
        return jsonResponse(200, {
          data: {
            session: {
              voiceSessionId: binding.voiceSessionId,
              sessionVersion: 6,
              resourceScopeId: binding.resourceScopeId,
              routeProfileVersion: binding.routeProfileVersion,
              leaseEpoch: binding.leaseEpoch,
              inputEpoch: request.inputEpoch,
              pendingInput: false,
            },
          },
        });
      }
      if (init?.method === "POST" && path.endsWith("/dialogue-snapshot")) {
        // The write is durably accepted server-side (modelled the same
        // way every sibling ambiguous-failure probe in this file does),
        // but what comes back to THIS worker is a bare, non-JSON 502 from
        // an intermediary (reverse proxy, load balancer) -- apps/api
        // itself never produced this reply, so it carries no structured
        // `error.code` at all.
        return new Response("upstream reply unavailable", { status: 502 });
      }
      if (init?.method === "GET" && path.endsWith("/dialogue-snapshot")) {
        return jsonResponse(200, {
          data: {
            session: {
              voiceSessionId: binding.voiceSessionId,
              sessionVersion: 6,
              resourceScopeId: binding.resourceScopeId,
              routeProfileVersion: binding.routeProfileVersion,
              leaseEpoch: binding.leaseEpoch,
              inputEpoch: request.inputEpoch,
              pendingInput: false,
            },
            snapshot: {
              snapshotId: "snapshot-1",
              voiceSessionId: binding.voiceSessionId,
              sessionVersion: 6,
              inputEpoch: request.inputEpoch,
              mediaEpoch: 0,
              turnId: request.turnId,
              content: {
                draftVersion: 0,
                confirmationId: null,
                slots: {},
                slotHistory: [],
                addressRepairs: { pickup: 0, dropoff: 0 },
                addressHistory: [],
                handoff: { reason: "urgent_safety", intent: "emergency" },
              },
              createdAt: "2026-07-24T09:00:00.000Z",
              retentionExpiresAt: "2027-01-20T09:00:00.000Z",
            },
          },
        });
      }
      throw new Error(`unexpected request ${init?.method ?? "GET"} ${path}`);
    });
    const client_ = new VoiceApiClient(
      { baseUrl: "https://api.example.test", fetchImpl },
      { getToken: vi.fn(async () => "workload-token") },
    );
    const port = createTrustedDialoguePersistPort(client_, () => binding);
    const attachmentState = new VoiceDialogueState();
    const restoreFromSnapshotContent = vi.fn();

    // AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-persist (Codex reopen,
    // canonical 2026-10-03T22:41:06Z, "every non-2xx is treated as a
    // trustworthy domain decision"): before this fix, `isDefinitiveRejection`
    // treated this exact opaque 502 (code defaulted to the old generic
    // `VOICE_API_ERROR` label) as a confirmed domain rejection, skipping
    // reconciliation entirely -- the durably-accepted "urgent_safety"
    // commit would be silently lost from the attachment's view the
    // instant a later turn submitted anything else. With this fix it is
    // reconciled like any other ambiguous failure.
    await port.persist(
      {
        toSnapshotContent: () => ({ handoff: { reason: "urgent_safety" } }),
        restoreFromSnapshotContent,
        committedSessionVersion: attachmentState.committedSessionVersion,
      } as unknown as VoiceDialogueState,
      request,
      { attachmentState },
    );

    expect(restoreFromSnapshotContent).toHaveBeenCalledWith(
      expect.objectContaining({
        handoff: { reason: "urgent_safety", intent: "emergency" },
      }),
    );
    expect(attachmentState.unresolvedCommit).toBeNull();
    expect(attachmentState.committedSessionVersion).toBe(6);
  });

  it("[error provenance, Codex reopen canonical 2026-10-03T23:31:57Z] a structured but generic INTERNAL_SERVER_ERROR envelope is ambiguous, never a definitive rejection -- the durably-landed write is still reconciled", async () => {
    const binding: VoiceSessionBinding = {
      voiceSessionId: "22222222-2222-2222-2222-222222222222",
      resourceScopeId: "33333333-3333-3333-3333-333333333333",
      routeProfileVersion: 1,
      leaseEpoch: 1,
      sessionVersion: 5,
    };
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const path = String(url);
      if (path.endsWith("/capabilities")) {
        return jsonResponse(200, {
          data: { token: "capability-token", tokenType: "Bearer", expiresIn: 120 },
        });
      }
      if (init?.method === "POST" && path.endsWith("/input-resolutions")) {
        return jsonResponse(200, {
          data: {
            session: {
              voiceSessionId: binding.voiceSessionId,
              sessionVersion: 6,
              resourceScopeId: binding.resourceScopeId,
              routeProfileVersion: binding.routeProfileVersion,
              leaseEpoch: binding.leaseEpoch,
              inputEpoch: request.inputEpoch,
              pendingInput: false,
            },
          },
        });
      }
      if (init?.method === "POST" && path.endsWith("/dialogue-snapshot")) {
        // AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-persist (Codex
        // reopen, canonical 2026-10-03T23:31:57Z, "an unexpected failure
        // is not a definitive rejection"): the write is durably accepted
        // server-side, but apps/api's own exception filter emits a
        // genuinely structured `INTERNAL_SERVER_ERROR` envelope back to
        // this worker anyway (e.g. a COMMIT acknowledgement that itself
        // threw) -- a real structured body, unlike the sibling bare-502
        // probe above, but still never proof this call's own content was
        // rejected.
        return jsonResponse(500, {
          error: { code: "INTERNAL_SERVER_ERROR", message: "unexpected failure" },
        });
      }
      if (init?.method === "GET" && path.endsWith("/dialogue-snapshot")) {
        return jsonResponse(200, {
          data: {
            session: {
              voiceSessionId: binding.voiceSessionId,
              sessionVersion: 6,
              resourceScopeId: binding.resourceScopeId,
              routeProfileVersion: binding.routeProfileVersion,
              leaseEpoch: binding.leaseEpoch,
              inputEpoch: request.inputEpoch,
              pendingInput: false,
            },
            snapshot: {
              snapshotId: "snapshot-1",
              voiceSessionId: binding.voiceSessionId,
              sessionVersion: 6,
              inputEpoch: request.inputEpoch,
              mediaEpoch: 0,
              turnId: request.turnId,
              content: {
                draftVersion: 0,
                confirmationId: null,
                slots: {},
                slotHistory: [],
                addressRepairs: { pickup: 0, dropoff: 0 },
                addressHistory: [],
                handoff: { reason: "urgent_safety", intent: "emergency" },
              },
              createdAt: "2026-07-24T09:00:00.000Z",
              retentionExpiresAt: "2027-01-20T09:00:00.000Z",
            },
          },
        });
      }
      throw new Error(`unexpected request ${init?.method ?? "GET"} ${path}`);
    });
    const client_ = new VoiceApiClient(
      { baseUrl: "https://api.example.test", fetchImpl },
      { getToken: vi.fn(async () => "workload-token") },
    );
    const port = createTrustedDialoguePersistPort(client_, () => binding);
    const attachmentState = new VoiceDialogueState();
    const restoreFromSnapshotContent = vi.fn();

    await port.persist(
      {
        toSnapshotContent: () => ({ handoff: { reason: "urgent_safety" } }),
        restoreFromSnapshotContent,
        committedSessionVersion: attachmentState.committedSessionVersion,
      } as unknown as VoiceDialogueState,
      request,
      { attachmentState },
    );

    expect(restoreFromSnapshotContent).toHaveBeenCalledWith(
      expect.objectContaining({
        handoff: { reason: "urgent_safety", intent: "emergency" },
      }),
    );
    expect(attachmentState.unresolvedCommit).toBeNull();
    expect(attachmentState.committedSessionVersion).toBe(6);
  });

  it("[overlapping recovery, Codex reopen canonical 2026-10-03T22:41:06Z] a candidate cloned before a concurrent recovery installed new content must never submit over it, even once the marker that triggered that recovery is already cleared", async () => {
    const binding: VoiceSessionBinding = {
      voiceSessionId: "22222222-2222-2222-2222-222222222222",
      resourceScopeId: "33333333-3333-3333-3333-333333333333",
      routeProfileVersion: 1,
      leaseEpoch: 1,
      sessionVersion: 5,
    };
    let releaseRecoveryGet: () => void = () => {};
    const recoveryGate = new Promise<void>((resolve) => {
      releaseRecoveryGet = resolve;
    });
    let releaseTurn2Capability: () => void = () => {};
    const turn2CapabilityGate = new Promise<void>((resolve) => {
      releaseTurn2Capability = resolve;
    });
    let capabilityCallCount = 0;
    let contentPostCount = 0;
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const path = String(url);
      if (path.endsWith("/capabilities")) {
        capabilityCallCount += 1;
        if (capabilityCallCount === 2) {
          // Turn 2's own capability issuance -- held so its clone is
          // observably taken (step 3 of the reopened probe) before its
          // own persist() ever reaches the top-of-call gate.
          await turn2CapabilityGate;
        }
        return jsonResponse(200, {
          data: { token: "capability-token", tokenType: "Bearer", expiresIn: 120 },
        });
      }
      if (init?.method === "POST" && path.endsWith("/input-resolutions")) {
        const body = JSON.parse(init.body as string) as {
          expectedSessionVersion: number;
        };
        return jsonResponse(200, {
          data: {
            session: {
              voiceSessionId: binding.voiceSessionId,
              sessionVersion: body.expectedSessionVersion + 1,
              resourceScopeId: binding.resourceScopeId,
              routeProfileVersion: binding.routeProfileVersion,
              leaseEpoch: binding.leaseEpoch,
              inputEpoch: request.inputEpoch,
              pendingInput: false,
            },
          },
        });
      }
      if (init?.method === "POST" && path.endsWith("/dialogue-snapshot")) {
        contentPostCount += 1;
        if (contentPostCount === 1) {
          // Turn 1 (the emergency final): durably accepted server-side,
          // but its own HTTP acknowledgement is lost.
          throw new TypeError("simulated network failure after commit");
        }
        // Turn 2 would durably succeed here if it were ever allowed to
        // submit -- the fix must never let this be reached at all.
        return jsonResponse(200, {
          data: {
            snapshot: {
              snapshotId: "snapshot-2",
              voiceSessionId: binding.voiceSessionId,
              sessionVersion: 7,
              inputEpoch: request.inputEpoch,
              mediaEpoch: 0,
              turnId: "turn-2",
              content: {},
              createdAt: "2026-10-03T09:00:00.000Z",
              retentionExpiresAt: "2027-01-20T09:00:00.000Z",
            },
            deduped: false,
          },
        });
      }
      if (init?.method === "GET" && path.endsWith("/dialogue-snapshot")) {
        // Turn 1's own ambiguous-commit reconciliation read -- held open
        // until `releaseRecoveryGet()` below.
        await recoveryGate;
        return jsonResponse(200, {
          data: {
            session: {
              voiceSessionId: binding.voiceSessionId,
              sessionVersion: 6,
              resourceScopeId: binding.resourceScopeId,
              routeProfileVersion: binding.routeProfileVersion,
              leaseEpoch: binding.leaseEpoch,
              inputEpoch: request.inputEpoch,
              pendingInput: false,
            },
            snapshot: {
              snapshotId: "snapshot-turn-1",
              voiceSessionId: binding.voiceSessionId,
              sessionVersion: 6,
              inputEpoch: request.inputEpoch,
              mediaEpoch: 0,
              turnId: request.turnId,
              content: {
                draftVersion: 0,
                confirmationId: null,
                slots: {},
                slotHistory: [],
                addressRepairs: { pickup: 0, dropoff: 0 },
                addressHistory: [],
                handoff: { reason: "urgent_safety", intent: "emergency" },
              },
              createdAt: "2026-10-03T09:00:00.000Z",
              retentionExpiresAt: "2027-01-20T09:00:00.000Z",
            },
          },
        });
      }
      throw new Error(`unexpected request ${init?.method ?? "GET"} ${path}`);
    });
    const client_ = new VoiceApiClient(
      { baseUrl: "https://api.example.test", fetchImpl },
      { getToken: vi.fn(async () => "workload-token") },
    );
    const port = createTrustedDialoguePersistPort(client_, () => binding);
    const attachmentState = new VoiceDialogueState();

    // Turn 1: emergency final, content accepted, ack lost -- starts a
    // held reconciliation. Not awaited yet; it stays suspended on the
    // held GET above.
    const turn1 = port.persist(
      {
        toSnapshotContent: () => ({ handoff: { reason: "urgent_safety" } }),
        restoreFromSnapshotContent: vi.fn(),
        committedSessionVersion: attachmentState.committedSessionVersion,
      } as unknown as VoiceDialogueState,
      request,
      { attachmentState },
    );
    for (let i = 0; i < 50; i++) await Promise.resolve();

    // Turn 2: a later, unrelated final. Its OWN candidate state is cloned
    // right now, BEFORE turn 1's recovery has installed anything --
    // mirrors `VoiceDialogueEngine.turn`'s `structuredClone(state)`,
    // taken at the very start of the turn.
    const turn2State = {
      toSnapshotContent: () => ({}),
      restoreFromSnapshotContent: vi.fn(),
      committedSessionVersion: attachmentState.committedSessionVersion,
    } as unknown as VoiceDialogueState;
    const turn2 = port.persist(
      turn2State,
      { ...request, turnId: "turn-2" },
      { attachmentState },
    );
    for (let i = 0; i < 50; i++) await Promise.resolve();

    // Release turn 1's recovery FIRST -- it installs "urgent_safety"
    // directly onto the real `attachmentState` and clears its marker.
    releaseRecoveryGet();
    await turn1;
    expect(attachmentState.committedSessionVersion).toBe(6);
    expect(attachmentState.unresolvedCommit).toBeNull();

    // THEN release turn 2's held capability issuance -- its own
    // top-of-call `unresolvedCommit` check now finds nothing (already
    // cleared), which is exactly the gap this fix closes: without the
    // `committedSessionVersion` fence, turn 2 would proceed to submit its
    // own stale, pre-recovery content over the just-recovered commit.
    releaseTurn2Capability();

    await expect(turn2).rejects.toThrow(
      /voice_trusted_persist_superseded_by_recovered_commit/,
    );
    // Turn 2's own content-persist POST must never have been reached.
    expect(contentPostCount).toBe(1);
    // The recovered emergency content must still be the attachment's own
    // authoritative state -- never overwritten by turn 2's stale clone.
    expect(attachmentState.committedSessionVersion).toBe(6);
  });

  describe("R4-persist incomplete discriminated response validation (Codex reopen, canonical 2026-10-04T01:25:05Z)", () => {
    function harness() {
      const binding: VoiceSessionBinding = {
        voiceSessionId: "22222222-2222-2222-2222-222222222222",
        resourceScopeId: "33333333-3333-3333-3333-333333333333",
        routeProfileVersion: 1,
        leaseEpoch: 1,
        sessionVersion: 5,
      };
      return { binding };
    }

    function baseFetch(
      binding: VoiceSessionBinding,
      resolveResponseData: unknown,
    ) {
      return vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        const path = String(url);
        if (path.endsWith("/capabilities")) {
          return jsonResponse(200, {
            data: { token: "capability-token", tokenType: "Bearer", expiresIn: 120 },
          });
        }
        if (init?.method === "POST" && path.endsWith("/input-resolutions")) {
          return jsonResponse(200, {
            data: {
              session: {
                voiceSessionId: binding.voiceSessionId,
                sessionVersion: 6,
                resourceScopeId: binding.resourceScopeId,
                routeProfileVersion: binding.routeProfileVersion,
                leaseEpoch: binding.leaseEpoch,
                inputEpoch: request.inputEpoch,
                pendingInput: false,
              },
            },
          });
        }
        if (init?.method === "POST" && path.endsWith("/dialogue-snapshot")) {
          throw new TypeError("simulated lost acknowledgement");
        }
        if (init?.method === "GET" && path.endsWith("/dialogue-snapshot")) {
          // Authoritative truth shows nothing (yet) -- bounded polling
          // exhausts truthfully, forcing the fallback to the atomic
          // adjudication call this describe block is actually probing.
          return jsonResponse(200, {
            data: {
              session: {
                voiceSessionId: binding.voiceSessionId,
                sessionVersion: 6,
                resourceScopeId: binding.resourceScopeId,
                routeProfileVersion: binding.routeProfileVersion,
                leaseEpoch: binding.leaseEpoch,
                inputEpoch: request.inputEpoch,
                pendingInput: false,
              },
              snapshot: null,
            },
          });
        }
        if (init?.method === "POST" && path.endsWith("/dialogue-snapshot/resolve")) {
          return jsonResponse(200, { data: resolveResponseData });
        }
        throw new Error(`unexpected request ${init?.method ?? "GET"} ${path}`);
      });
    }

    it("[finding A] an accepted adjudication response whose content fails the shared schema (required `handoff` field omitted) is never installed -- the real attachment stays byte-for-byte unchanged and unresolvedCommit stays set", async () => {
      const { binding } = harness();
      const fetchImpl = baseFetch(binding, {
        accepted: true,
        snapshot: {
          snapshotId: "snapshot-1",
          voiceSessionId: binding.voiceSessionId,
          sessionVersion: 6,
          inputEpoch: request.inputEpoch,
          mediaEpoch: 0,
          turnId: request.turnId,
          content: {
            draftVersion: 0,
            confirmationId: null,
            slots: {},
            slotHistory: [],
            addressRepairs: { pickup: 0, dropoff: 0 },
            addressHistory: [],
            // `handoff` is REQUIRED by `voiceDialogueSnapshotContentSchema`
            // (`.strict()`) -- omitted here on purpose.
          },
          createdAt: "2026-07-24T09:00:00.000Z",
          retentionExpiresAt: "2027-01-20T09:00:00.000Z",
        },
      });
      const client_ = new VoiceApiClient(
        { baseUrl: "https://api.example.test", fetchImpl },
        { getToken: vi.fn(async () => "workload-token") },
      );
      const port = createTrustedDialoguePersistPort(client_, () => binding);
      const attachmentState = new VoiceDialogueState();

      await expect(
        port.persist(
          {
            toSnapshotContent: () => ({}),
            committedSessionVersion: attachmentState.committedSessionVersion,
          } as unknown as VoiceDialogueState,
          request,
          { attachmentState },
        ),
      ).rejects.toThrow(/simulated lost acknowledgement/);

      // Never installed -- the real attachment is still at its pristine,
      // freshly-constructed defaults.
      expect(attachmentState.draftVersion).toBe(0);
      expect(attachmentState.confirmationId).toBeNull();
      expect(attachmentState.handoff).toBeNull();
      expect(attachmentState.slots).toEqual({});
      expect(attachmentState.slotHistory).toEqual([]);
      expect(attachmentState.committedSessionVersion).toBeNull();
      // Malformed content classifies as `"unknown"`, never a confirmed
      // accept -- a later call must still retry this same reconciliation.
      expect(attachmentState.unresolvedCommit).not.toBeNull();
    });

    it("[finding C] a bare, contradictory-identity `accepted:false` response is never trusted as a confirmed rejection -- only a response whose identity AND server-raised fenceVersion both correlate may clear unresolvedCommit", async () => {
      const { binding } = harness();
      const fetchImpl = baseFetch(binding, {
        accepted: false,
        voiceSessionId: "foreign-session",
        sessionVersion: 999,
        inputEpoch: 999,
        mediaEpoch: 999,
        turnId: "foreign-turn",
        fenceVersion: 999,
      });
      const client_ = new VoiceApiClient(
        { baseUrl: "https://api.example.test", fetchImpl },
        { getToken: vi.fn(async () => "workload-token") },
      );
      const port = createTrustedDialoguePersistPort(client_, () => binding);
      const attachmentState = new VoiceDialogueState();

      await expect(
        port.persist(
          {
            toSnapshotContent: () => ({}),
            committedSessionVersion: attachmentState.committedSessionVersion,
          } as unknown as VoiceDialogueState,
          request,
          { attachmentState },
        ),
      ).rejects.toThrow(/simulated lost acknowledgement/);

      expect(attachmentState.committedSessionVersion).toBeNull();
      expect(attachmentState.handoff).toBeNull();
      // A contradictory/foreign body must never clear the marker -- the
      // outcome of THIS pending write is still genuinely unknown.
      expect(attachmentState.unresolvedCommit).not.toBeNull();
    });

    it("[finding D] an `expired:true` response with correct identity but no `retentionExpiresAt` evidence is never trusted -- well-formed expiry evidence is required, not the bare boolean alone", async () => {
      const { binding } = harness();
      const fetchImpl = baseFetch(binding, {
        accepted: true,
        expired: true,
        voiceSessionId: binding.voiceSessionId,
        sessionVersion: 6,
        inputEpoch: request.inputEpoch,
        mediaEpoch: 0,
        turnId: request.turnId,
        // `retentionExpiresAt` deliberately omitted -- there is no
        // evidence the content has actually passed its own retention
        // window, only the bare `expired: true` literal.
      });
      const client_ = new VoiceApiClient(
        { baseUrl: "https://api.example.test", fetchImpl },
        { getToken: vi.fn(async () => "workload-token") },
      );
      const port = createTrustedDialoguePersistPort(client_, () => binding);
      const attachmentState = new VoiceDialogueState();

      await expect(
        port.persist(
          {
            toSnapshotContent: () => ({}),
            committedSessionVersion: attachmentState.committedSessionVersion,
          } as unknown as VoiceDialogueState,
          request,
          { attachmentState },
        ),
      ).rejects.toThrow(/simulated lost acknowledgement/);

      expect(attachmentState.committedSessionVersion).toBeNull();
      expect(attachmentState.handoff).toBeNull();
      // Unproven expiry must not settle the outcome either way -- the
      // marker stays set so a later call retries this reconciliation
      // instead of wrongly treating this as a known-expired verdict.
      expect(attachmentState.unresolvedCommit).not.toBeNull();
    });
  });

  it("is mode 'trusted', distinct from the fixture port's mode 'fixture'", () => {
    const client_ = new VoiceApiClient(
      { baseUrl: "https://api.example.test" },
      { getToken: vi.fn() },
    );
    expect(createTrustedDialoguePersistPort(client_, () => undefined).mode).toBe(
      "trusted",
    );
    expect(createFixtureDialoguePersistPort().mode).toBe("fixture");
  });
});

describe("createVoiceApiClient (opt-in composition factory)", () => {
  it("returns undefined when VOICE_API_BASE_URL is unset -- every environment this worker runs in today", () => {
    expect(createVoiceApiClient({})).toBeUndefined();
  });

  it("constructs a real client when configured", () => {
    const client = createVoiceApiClient({
      VOICE_API_BASE_URL: "https://api.example.test",
    });
    expect(client).toBeInstanceOf(VoiceApiClient);
  });
});
