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
import type { VoiceDialogueState } from "../../../apps/voice-media-worker/src/dialogue/dialogue-state";
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
              content: { handoff: { reason: "urgent_safety" } },
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
    // resolving successfully.
    expect(restoreFromSnapshotContent).toHaveBeenCalledWith({
      handoff: { reason: "urgent_safety" },
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
              content: { handoff: { reason: "urgent_safety" } },
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
    expect(restoreFromSnapshotContent).toHaveBeenCalledWith({
      handoff: { reason: "urgent_safety" },
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
