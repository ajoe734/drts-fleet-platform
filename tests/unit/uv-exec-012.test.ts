import { afterEach, describe, expect, it, vi } from "vitest";
import {
  voiceDialogueOutputSchema,
  type VoiceDialogueOutput,
} from "@drts/contracts";
import {
  runVoiceDialogue,
  type VoiceDialogueRequest,
} from "../../apps/voice-media-worker/src/dialogue/voice-dialogue-provider";
import {
  VoiceDialogueState,
  voiceNumericReadback,
} from "../../apps/voice-media-worker/src/dialogue/dialogue-state";
import { VoiceDialogueTransport } from "../../apps/api/src/common/llm-gateway/voice-dialogue-transport";
import { VoiceToolGatewayService } from "../../apps/api/src/modules/voice-booking/voice-tool-gateway.service";
import { VoiceDialogueEngine } from "../../apps/voice-media-worker/src/dialogue/dialogue-engine";
import type { VoiceCapabilityGuard } from "../../apps/api/src/common/auth/voice-capability.guard";
import type { VoiceBookingRepository } from "../../apps/api/src/modules/voice-booking/voice-booking.repository";
import type { VoiceBookingAuthorizationService } from "../../apps/api/src/modules/voice-booking/voice-booking-authorization.service";

afterEach(() => vi.useRealTimers());

describe("UV-EXEC-012 controlled turn entry", () => {
  it("never plays fabricated success and persists before executing tools", async () => {
    const engine = new VoiceDialogueEngine(
      {
        mode: "live",
        profileVersion: "v1",
        propose: async () => output({ text: "已派車，車資100元" }),
      },
      true,
    );
    const events: string[] = [];
    const result = await engine.turn(
      request(),
      new VoiceDialogueState(),
      () => 1,
      {
        persist: async () => {
          events.push("persist");
        },
        execute: async () => {
          events.push("execute");
          return [];
        },
      },
    );
    expect(events).toEqual(["persist", "execute"]);
    expect(result.prompt).not.toContain("100");
    expect(result.prompt).toContain("上車地點");
  });
  it("blocks tools after failed CAS or an epoch change during persistence", async () => {
    const engine = new VoiceDialogueEngine(
      { mode: "live", profileVersion: "v1", propose: async () => output() },
      true,
    );
    const execute = vi.fn(async () => []);
    await expect(
      engine.turn(request(), new VoiceDialogueState(), () => 1, {
        persist: async () => {
          throw new Error("CAS");
        },
        execute,
      }),
    ).rejects.toThrow("CAS");
    let epoch = 1;
    await expect(
      engine.turn(request(), new VoiceDialogueState(), () => epoch, {
        persist: async () => {
          epoch = 2;
        },
        execute,
      }),
    ).rejects.toThrow("stale");
    expect(execute).not.toHaveBeenCalled();
  });
  it("does not resume collection after explicit tool handoff", async () => {
    const propose = vi.fn(async () =>
      output({
        tools: [
          { name: "request_handoff", args: { reason: "location_unresolved" } },
        ],
      }),
    );
    const engine = new VoiceDialogueEngine(
      { mode: "live", profileVersion: "v1", propose },
      true,
    );
    const state = new VoiceDialogueState();
    const ports = { persist: async () => {}, execute: async () => [] };
    const result = await engine.turn(request(), state, () => 1, ports);
    expect(result.terminal).toBe("handoff");
    expect(state.handoff?.reason).toBe("location_unresolved");
    expect((await engine.turn(request(), state, () => 1, ports)).prompt).toBe(
      "",
    );
    expect(propose).toHaveBeenCalledOnce();
  });
});
const output = (
  patch: Partial<VoiceDialogueOutput> = {},
): VoiceDialogueOutput => ({
  intent: "book",
  text: "",
  slots: [],
  tools: [],
  usage: { inputTokens: null, outputTokens: null },
  terminal: "turn_complete",
  ...patch,
});
const request = (
  patch: Partial<VoiceDialogueRequest> = {},
): VoiceDialogueRequest => ({
  sessionId: "session",
  turnId: "turn",
  inputEpoch: 1,
  segmentIds: ["segment"],
  transcript: "台北一二三號",
  verifiedContext: {},
  deadline: Date.now() + 1000,
  signal: new AbortController().signal,
  ...patch,
});
const slot = (candidate = "台北123號") => ({
  field: "pickup" as const,
  rawText: "台北一二三號",
  candidate,
  sourceSegmentIds: ["segment"],
  providerConfidence: null,
});

describe("UV-EXEC-012 provider constraints", () => {
  it.each([
    "execute_http",
    "assign_driver",
    "commit_confirmed_booking",
    "cancel_bound_booking",
  ])("rejects %s", (name) => {
    expect(
      voiceDialogueOutputSchema.safeParse({
        ...output(),
        tools: [{ name, args: {} }],
      }).success,
    ).toBe(false);
  });
  it("rejects coordinates, proof and prices injected as tool arguments", () => {
    for (const extra of [
      { latitude: 25 },
      { price: 100 },
      { confirmed: true },
      { driverId: "x" },
    ])
      expect(
        voiceDialogueOutputSchema.safeParse({
          ...output(),
          tools: [
            { name: "resolve_location", args: { query: "台北", ...extra } },
          ],
        }).success,
      ).toBe(false);
  });
  it("rejects fixture production, fabricated evidence and stale epochs", async () => {
    const provider = {
      mode: "live" as const,
      profileVersion: "v1",
      propose: vi.fn(async () => output({ slots: [slot()] })),
    };
    await expect(
      runVoiceDialogue(
        { ...provider, mode: "fixture" },
        request(),
        () => 1,
        true,
      ),
    ).rejects.toThrow("fixture");
    await expect(
      runVoiceDialogue(provider, request({ segmentIds: [] }), () => 1, true),
    ).rejects.toThrow("evidence");
    await expect(
      runVoiceDialogue(provider, request(), () => 2, true),
    ).rejects.toThrow("stale");
    expect(
      (await runVoiceDialogue(provider, request(), () => 1, true)).slots,
    ).toHaveLength(1);
  });
  it("bounds a provider ignoring cancellation and never invokes pre-aborted requests", async () => {
    vi.useFakeTimers();
    const propose = vi.fn(() => new Promise<unknown>(() => {}));
    const provider = { mode: "live" as const, profileVersion: "v1", propose };
    const result = expect(
      runVoiceDialogue(provider, request(), () => 1, true),
    ).rejects.toThrow("aborted");
    await vi.advanceTimersByTimeAsync(1000);
    await result;
    propose.mockClear();
    await expect(
      runVoiceDialogue(
        provider,
        request({ signal: AbortSignal.abort() }),
        () => 1,
        true,
      ),
    ).rejects.toThrow("aborted");
    expect(propose).not.toHaveBeenCalled();
  });
  it("uses live transport with bounded tokens and actual usage, refusing mock fallback", async () => {
    expect(() => new VoiceDialogueTransport("v1", 100, {})).toThrow(
      "live_provider",
    );
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(output()) } }],
            usage: {
              prompt_tokens: 12,
              completion_tokens: 9,
              total_tokens: 21,
            },
          }),
          { status: 200 },
        ),
    );
    const provider = new VoiceDialogueTransport(
      "v1",
      100,
      {
        VOICE_LLM_PROVIDER: "openai",
        VOICE_LLM_MODEL: "fixture-model",
        LLM_GATEWAY_API_KEY: "test-only",
      },
      fetcher,
    );
    const result = await runVoiceDialogue(provider, request(), () => 1, true);
    expect(result.usage).toEqual({ inputTokens: 12, outputTokens: 9 });
    expect(fetcher).toHaveBeenCalledOnce();
  });
});

describe("UV-EXEC-012 repair and handoff", () => {
  it("invalidates confirmation on correction and retains both failed address answers", () => {
    const state = new VoiceDialogueState();
    state.apply(output({ slots: [slot()] }), "turn1");
    state.confirmationId = "proof";
    state.unresolvedAddress(
      "pickup",
      [{ placeId: "one", label: "候選一", region: "台北" }],
      false,
    );
    state.apply(output({ slots: [slot("新北123號")] }), "turn2");
    expect(state.confirmationId).toBeNull();
    expect(state.draftVersion).toBe(2);
    state.unresolvedAddress("pickup", [], true);
    expect(state.handoff).toBeNull();
    state.unresolvedAddress(
      "pickup",
      [{ placeId: "two", label: "候選二", region: "新北" }],
      true,
    );
    expect(state.handoff?.reason).toBe("location_unresolved");
    expect(state.handoffSummary().addresses).toHaveLength(3);
    expect(state.handoffSummary().addresses[0].rawText).toBe("台北一二三號");
  });
  it.each([
    "human",
    "complaint",
    "lost_property",
    "emergency",
    "cancel",
    "amend",
    "reservation",
  ] as const)("stops collection for %s", (intent) => {
    const state = new VoiceDialogueState();
    state.apply(output({ intent, slots: [slot()] }), "t1");
    state.apply(output({ slots: [slot()] }), "t2");
    expect(state.handoff).not.toBeNull();
    expect(state.slots).toEqual({});
  });
  it("reads phone, door and Taipei date/time in digit groups", () => {
    expect(voiceNumericReadback("phone", "0912345678")).toBe(
      "0 9 1，2 3 4，5 6 7，8",
    );
    expect(voiceNumericReadback("door", "123之4號")).toBe("1 2 3之4號");
    expect(voiceNumericReadback("time", "2026-09-08T17:00:00Z")).toBe(
      "2 0 2 6 年 0 9 月 0 9 日 0 1 點 0 0 分",
    );
  });
});

function gateway() {
  const claims = {
    voiceSessionId: "s",
    resourceScopeId: "r",
    leaseEpoch: 1,
    routeProfileVersion: 1,
    scopes: [
      "session_execute",
      "address_resolve",
      "handoff_request",
      "order_read_bound",
    ],
  };
  const session = {
    resourceScopeId: "r",
    leaseEpoch: 1,
    routeProfileVersion: 1,
    inputEpoch: 1,
    controlOwner: "ai",
    dialogState: "collecting",
  };
  const scope = { status: "active" };
  const authenticate = vi.fn(async () => claims);
  const execute = vi.fn(async (_proposal: unknown, _context: unknown) => {
    void _proposal;
    void _context;
    return { candidates: [] } as unknown;
  });
  const service = new VoiceToolGatewayService(
    { authenticate } as unknown as VoiceCapabilityGuard,
    {
      findSessionById: async () => session,
      findResourceScopeById: async () => scope,
    } as unknown as VoiceBookingRepository,
    {
      getBoundBookingStatus: async () => ({ orderId: "owned" }),
    } as unknown as VoiceBookingAuthorizationService,
    { execute },
    {
      headers: {},
      inputEpoch: 1,
      deadline: Date.now() + 1000,
      signal: new AbortController().signal,
    },
  );
  return { service, session, scope, claims, execute, authenticate };
}
const resolve = output({
  tools: [{ name: "resolve_location", args: { query: "台北" } }],
});
describe("UV-EXEC-012 tool authorization", () => {
  it("rejects revoked resources even when authentication used a verifier without a repository", async () => {
    const g = gateway();
    g.scope.status = "revoked";
    await expect(g.service.execute(resolve)).rejects.toThrow("scope_revoked");
    expect(g.execute).not.toHaveBeenCalled();
  });
  it("prioritizes explicit handoff over earlier booking tools", async () => {
    const g = gateway();
    g.execute.mockResolvedValue({ status: "unavailable", handoffId: null });
    await g.service.execute(
      output({
        tools: [
          resolve.tools[0]!,
          { name: "request_handoff", args: { reason: "location_unresolved" } },
        ],
      }),
    );
    expect(g.execute).toHaveBeenCalledOnce();
    expect(g.execute.mock.calls[0]?.[0]).toEqual({
      name: "request_handoff",
      args: { reason: "location_unresolved" },
    });
  });
  it("shares a three-call budget across loop retries", async () => {
    const g = gateway();
    for (let i = 0; i < 3; i++) await g.service.execute(resolve);
    await expect(g.service.execute(resolve)).rejects.toThrow("budget");
    expect(g.execute).toHaveBeenCalledTimes(3);
  });
  it.each([
    "leaseEpoch",
    "inputEpoch",
    "resourceScopeId",
    "controlOwner",
  ] as const)("rejects stale or foreign %s", async (field) => {
    const g = gateway();
    Object.assign(g.session, {
      [field]: field.endsWith("Epoch") ? 2 : "other",
    });
    await expect(g.service.execute(resolve)).rejects.toThrow("stale");
    expect(g.execute).not.toHaveBeenCalled();
  });
  it("rejects missing authorization before domain calls", async () => {
    const g = gateway();
    g.claims.scopes = [];
    await expect(g.service.execute(resolve)).rejects.toThrow();
    expect(g.execute).not.toHaveBeenCalled();
  });
  it("replaces booking proposals with emergency handoff and closes the turn", async () => {
    const g = gateway();
    g.execute.mockResolvedValue({ status: "queued", handoffId: "h" });
    await g.service.execute({ ...resolve, intent: "emergency" });
    expect(g.execute.mock.calls[0]?.[0]).toEqual({
      name: "request_handoff",
      args: { reason: "urgent_safety" },
    });
    await expect(g.service.execute(resolve)).rejects.toThrow("closed");
  });
  it("rejects unvalidated tool output and cross-order status", async () => {
    const g = gateway();
    g.execute.mockResolvedValue({ candidates: [], price: 10 });
    await expect(g.service.execute(resolve)).rejects.toThrow();
    const other = gateway();
    other.execute.mockResolvedValue({ orderId: "foreign", status: "accepted" });
    await expect(
      other.service.execute(
        output({ tools: [{ name: "get_bound_booking_status", args: {} }] }),
      ),
    ).rejects.toThrow("order_mismatch");
  });
  it("times out ignored signals without allowing a subsequent tool", async () => {
    vi.useFakeTimers();
    const g = gateway();
    g.execute.mockImplementation(() => new Promise(() => {}));
    const result = expect(g.service.execute(resolve)).rejects.toThrow(
      "aborted",
    );
    await vi.advanceTimersByTimeAsync(1000);
    await result;
    await expect(g.service.execute(resolve)).rejects.toThrow("closed");
  });
});
