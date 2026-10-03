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
  const request = { inputEpoch: 3 } as VoiceDialogueRequest;

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
      resolveInputBody = JSON.parse(init!.body as string);
      return jsonResponse(200, { data: { session: { sessionVersion: 6 } } });
    });
    const client_ = new VoiceApiClient(
      { baseUrl: "https://api.example.test", fetchImpl },
      { getToken: vi.fn(async () => "workload-token") },
    );
    const port = createTrustedDialoguePersistPort(client_, () => binding);

    await port.persist({} as VoiceDialogueState, request);

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
