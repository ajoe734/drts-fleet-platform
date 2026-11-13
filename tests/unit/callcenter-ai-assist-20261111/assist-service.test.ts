import { describe, expect, it, vi } from "vitest";

/** ApiRequestError keeps its human message inside the response envelope. */
async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return {
      code: (error as { code?: string }).code,
      text: JSON.stringify(
        (error as { getResponse?: () => unknown }).getResponse?.(),
      ),
    };
  }
  throw new Error("expected a rejection");
}

import type { VoiceDialogueSnapshotContent } from "@drts/contracts";

import { ApiRequestError } from "../../../apps/api/src/common/api-envelope";
import { CallcenterController } from "../../../apps/api/src/modules/callcenter/callcenter.controller";
import { VoiceHandoffQueueService } from "../../../apps/api/src/modules/callcenter/voice-handoff-queue.service";
import { decideFieldOutcome } from "../../../apps/api/src/modules/callcenter-assist/assist-fields";
import {
  isAssistLlmEnabled,
  parseLlmFields,
  refineAssistFieldsWithLlm,
} from "../../../apps/api/src/modules/callcenter-assist/assist-llm-extractor";
import { extractAssistFieldsByRules } from "../../../apps/api/src/modules/callcenter-assist/assist-rule-extractor";
import { buildAssistFieldsFromDialogue } from "../../../apps/api/src/modules/callcenter-assist/assist-voice-draft";
import { CallcenterAssistRepository } from "../../../apps/api/src/modules/callcenter-assist/callcenter-assist.repository";
import { CallcenterAssistService } from "../../../apps/api/src/modules/callcenter-assist/callcenter-assist.service";
import type { VoiceSessionRecord } from "../../../apps/api/src/modules/voice-booking/voice-booking.repository";
import { VoiceHandoffService } from "../../../apps/api/src/modules/voice-booking/voice-handoff.service";

const T0 = "2026-11-11T02:00:00.000Z";

function slot(
  candidate: string,
  extra: Partial<VoiceDialogueSnapshotContent["slots"][string]> = {},
): VoiceDialogueSnapshotContent["slots"][string] {
  return {
    rawText: candidate,
    normalizedValue: null,
    candidate,
    sourceTurnIds: ["turn-1"],
    sourceSegmentIds: ["seg-1"],
    providerConfidence: 0.9,
    validationState: "unvalidated",
    confirmedByCustomerAt: null,
    ...extra,
  };
}

function dialogue(
  overrides: Partial<VoiceDialogueSnapshotContent> = {},
): VoiceDialogueSnapshotContent {
  return {
    draftVersion: 3,
    confirmationId: null,
    slots: {
      pickup: slot("中山北路二段45巷3號", { providerConfidence: 0.92 }),
      dropoff: slot("台北車站", { providerConfidence: 0.55 }),
      passengerContact: slot("0912345678"),
      passengerCount: slot("2"),
      luggageCount: slot("1"),
      luggageSize: slot("oversized"),
      requiredCapabilities: slot('["wheelchair"]'),
    },
    slotHistory: [{ field: "dropoff", evidence: slot("台北火車站") }],
    addressRepairs: { pickup: 0, dropoff: 1 },
    addressHistory: [
      {
        field: "dropoff",
        rawText: "台北車站",
        candidates: [
          { placeId: "p1", label: "台北車站東三門", region: "中正區" },
          { placeId: "p2", label: "台北車站", region: "中正區" },
        ],
      },
    ],
    handoff: { reason: "location_unresolved", intent: "book" },
    ...overrides,
  };
}

function service(
  options: { llm?: unknown; queue?: VoiceHandoffQueueService } = {},
) {
  const repository = new CallcenterAssistRepository();
  return {
    repository,
    assist: new CallcenterAssistService(
      repository,
      options.llm as never,
      options.queue,
    ),
  };
}

const segment = (
  segmentId: string,
  speaker: "caller" | "agent",
  text: string,
  startedAt?: string,
) => ({ segmentId, speaker, text, ...(startedAt ? { startedAt } : {}) });

describe("buildAssistFieldsFromDialogue", () => {
  it("maps the voice AI's slots to the agent's booking fields", () => {
    const fields = buildAssistFieldsFromDialogue(dialogue(), T0);
    expect(fields.pickup).toMatchObject({
      value: "中山北路二段45巷3號",
      status: "filled",
      origin: "voice_dialogue",
    });
    // Low ASR confidence stays visible as "please check".
    expect(fields.dropoff?.status).toBe("uncertain");
    expect(fields.dropoff?.candidates).toEqual([
      "台北火車站",
      "台北車站東三門",
    ]);
    expect(fields.passengerPhone?.value).toBe("0912345678");
    expect(fields.passengerCount?.value).toBe("2");
    expect(fields.luggage?.value).toBe("1 件（大型）");
    expect(fields.requiredCapabilities?.value).toBe("wheelchair");
  });

  it("trusts values the caller confirmed during read-back", () => {
    const fields = buildAssistFieldsFromDialogue(
      dialogue({
        slots: {
          dropoff: slot("台北車站", {
            providerConfidence: 0.3,
            confirmedByCustomerAt: T0,
          }),
        },
      }),
      T0,
    );
    expect(fields.dropoff?.status).toBe("filled");
    expect(fields.dropoff?.confidence).toBe(0.9);
  });

  it("falls back to the booker's phone with lower confidence", () => {
    const fields = buildAssistFieldsFromDialogue(
      dialogue({ slots: { bookerContact: slot("0222223333") } }),
      T0,
    );
    expect(fields.passengerPhone?.value).toBe("0222223333");
    expect(fields.passengerPhone?.confidence).toBe(0.75);
  });

  it("returns nothing without a snapshot", () => {
    expect(buildAssistFieldsFromDialogue(null, T0)).toEqual({});
  });
});

describe("decideFieldOutcome", () => {
  const ai = extractAssistFieldsByRules(
    [
      {
        segmentId: "s",
        speaker: "caller",
        text: "我要去台北車站",
        startedAt: null,
        receivedAt: T0,
      },
    ],
    T0,
  ).dropoff;

  it.each([
    [{ aiApplied: true, agentEdited: false, finalPresent: true }, "accepted"],
    [{ aiApplied: true, agentEdited: true, finalPresent: true }, "corrected"],
    [{ aiApplied: true, agentEdited: true, finalPresent: false }, "corrected"],
  ] as const)("%j → %s", (flags, outcome) => {
    expect(decideFieldOutcome({ aiValue: ai, ...flags })).toBe(outcome);
  });

  it("counts a field the agent filled alone as missed by the AI", () => {
    expect(
      decideFieldOutcome({
        aiValue: undefined,
        aiApplied: false,
        agentEdited: true,
        finalPresent: true,
      }),
    ).toBe("ai_missing");
    expect(
      decideFieldOutcome({
        aiValue: undefined,
        aiApplied: false,
        agentEdited: false,
        finalPresent: false,
      }),
    ).toBeNull();
  });
});

describe("CallcenterAssistService transcript ingestion", () => {
  it("creates an agent-assist draft and updates it as the call goes on", async () => {
    const { assist } = service();
    const first = await assist.ingestTranscript("call-1", {
      segments: [segment("a1", "caller", "我在中山北路二段45巷3號要叫車")],
    });
    expect(first).toMatchObject({
      callId: "call-1",
      source: "agent_assist",
      draftVersion: 1,
      extractor: "rules",
    });
    expect(first.fields.pickup?.value).toBe("中山北路二段45巷3號");

    const second = await assist.ingestTranscript("call-1", {
      segments: [segment("a2", "caller", "要去台北車站，電話0912345678")],
    });
    expect(second.draftVersion).toBe(2);
    expect(second.fields.dropoff?.value).toBe("台北車站");
    expect(second.fields.passengerPhone?.value).toBe("0912345678");
    expect(second.transcript.map((s) => s.segmentId)).toEqual(["a1", "a2"]);
  });

  it("ignores an exact replay and replaces a revised segment", async () => {
    const { assist } = service();
    await assist.ingestTranscript("call-2", {
      segments: [segment("b1", "caller", "我要去台北車站")],
    });
    const replay = await assist.ingestTranscript("call-2", {
      segments: [segment("b1", "caller", "我要去台北車站")],
    });
    expect(replay.draftVersion).toBe(1);
    const revised = await assist.ingestTranscript("call-2", {
      segments: [segment("b1", "caller", "我要去松山車站")],
    });
    expect(revised.draftVersion).toBe(2);
    expect(revised.fields.dropoff?.value).toBe("松山車站");
    expect(revised.transcript).toHaveLength(1);
  });

  it("serializes concurrent batches for the same call", async () => {
    const { assist } = service();
    await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        assist.ingestTranscript("call-3", {
          segments: [segment(`c${index}`, "caller", `第${index}句`)],
        }),
      ),
    );
    const draft = await assist.getDraft("call-3");
    expect(draft?.transcript).toHaveLength(8);
    expect(draft?.draftVersion).toBe(8);
  });

  it.each([
    [{}, "segments must be an array"],
    [{ segments: [] }, "1-50"],
    [{ segments: [{ speaker: "caller", text: "x" }] }, "segmentId"],
    [{ segments: [{ segmentId: "x", speaker: "bot", text: "x" }] }, "speaker"],
    [{ segments: [{ segmentId: "x", text: "x".repeat(1001) }] }, "text"],
    [
      { segments: [{ segmentId: "x", text: "x", startedAt: "nope" }] },
      "startedAt",
    ],
  ])("rejects malformed batch %j", async (body, message) => {
    const { assist } = service();
    const error = await rejection(assist.ingestTranscript("call-x", body));
    expect(error.code).toBe("CALLCENTER_ASSIST_TRANSCRIPT_INVALID");
    expect(error.text).toContain(message);
  });

  it("keeps the voice AI's values unless newer speech changes them", async () => {
    const { assist } = service();
    const seeded = await assist.seedFromVoiceHandoff({
      callId: "call-4",
      handoffId: "h-4",
      voiceSessionId: "vs-4",
      fields: buildAssistFieldsFromDialogue(dialogue(), T0),
    });
    expect(seeded.source).toBe("voice_handoff");
    const handoffAt = Date.parse(seeded.updatedAt);

    // The caller's earlier words (spoken before the handoff) do not override.
    const replayedEarlier = await assist.ingestTranscript("call-4", {
      segments: [
        segment(
          "d1",
          "caller",
          "我在忠孝東路四段100號",
          new Date(handoffAt - 60_000).toISOString(),
        ),
      ],
    });
    expect(replayedEarlier.fields.pickup?.value).toBe("中山北路二段45巷3號");
    expect(replayedEarlier.fields.pickup?.origin).toBe("voice_dialogue");

    // A correction made to the human agent after the handoff does.
    const corrected = await assist.ingestTranscript("call-4", {
      segments: [
        segment(
          "d2",
          "caller",
          "不好意思，我要去松山機場",
          new Date(handoffAt + 60_000).toISOString(),
        ),
      ],
    });
    expect(corrected.fields.dropoff?.value).toBe("松山機場");
    expect(corrected.fields.dropoff?.candidates).toContain("台北車站");
    expect(corrected.source).toBe("voice_handoff");
    expect(corrected.extractor).toBe("voice_dialogue");
  });
});

describe("CallcenterAssistService outcomes and accuracy", () => {
  it("records kept, corrected and missed fields and reports accuracy", async () => {
    const queue = new VoiceHandoffQueueService();
    await queue.enqueue({
      handoffId: "h-5",
      voiceSessionId: "vs-5",
      callId: "call-5",
      resourceScopeId: "scope",
      reason: "customer_requested",
    });
    const { assist } = service({ queue });
    await assist.seedFromVoiceHandoff({
      callId: "call-5",
      handoffId: "h-5",
      voiceSessionId: "vs-5",
      fields: buildAssistFieldsFromDialogue(dialogue(), T0),
    });
    const result = await assist.recordOutcomes("call-5", {
      orderId: "order-5",
      agentId: "AGENT-1",
      fields: [
        {
          field: "pickup",
          aiApplied: true,
          agentEdited: false,
          finalPresent: true,
        },
        {
          field: "dropoff",
          aiApplied: true,
          agentEdited: true,
          finalPresent: true,
        },
        {
          field: "passengerName",
          aiApplied: false,
          agentEdited: true,
          finalPresent: true,
        },
        {
          field: "notes",
          aiApplied: false,
          agentEdited: false,
          finalPresent: false,
        },
      ],
    });
    expect(result.recorded).toBe(3);
    expect(
      result.outcomes.map((o) => [o.field, o.outcome, o.aiStatus]),
    ).toEqual([
      ["pickup", "accepted", "filled"],
      ["dropoff", "corrected", "uncertain"],
      ["passengerName", "ai_missing", null],
    ]);
    // Values are never stored, only outcomes.
    expect(JSON.stringify(result.outcomes)).not.toContain("中山北路");

    // Idempotent per (call, order, field).
    const again = await assist.recordOutcomes("call-5", {
      orderId: "order-5",
      fields: [
        {
          field: "pickup",
          aiApplied: true,
          agentEdited: false,
          finalPresent: true,
        },
      ],
    });
    expect(again.recorded).toBe(0);

    const draft = await assist.getDraft("call-5");
    expect(draft?.submittedOrderId).toBe("order-5");
    expect((await queue.getHandoffItem("h-5"))?.status).toBe("completed");

    const report = await assist.getAccuracy({});
    expect(report.totals).toEqual({
      accepted: 1,
      corrected: 1,
      aiMissing: 1,
      accuracy: 0.5,
      coverage: 0.667,
    });
    expect(report.byField.map((f) => f.field)).toEqual([
      "pickup",
      "dropoff",
      "passengerName",
    ]);
    expect(report.bySource).toEqual([
      expect.objectContaining({ source: "voice_handoff", accepted: 1 }),
    ]);
  });

  it("records nothing when no AI draft existed", async () => {
    const { assist } = service();
    await expect(
      assist.recordOutcomes("call-none", { orderId: "o", fields: [] }),
    ).resolves.toEqual({ recorded: 0, outcomes: [] });
  });

  it.each([
    [{ fields: [] }, "orderId"],
    [{ orderId: "o", fields: [{ field: "fare" }] }, "known booking field"],
    [
      {
        orderId: "o",
        fields: [
          {
            field: "pickup",
            aiApplied: true,
            agentEdited: false,
            finalPresent: true,
          },
          {
            field: "pickup",
            aiApplied: true,
            agentEdited: false,
            finalPresent: true,
          },
        ],
      },
      "repeated",
    ],
    [
      { orderId: "o", fields: [{ field: "pickup", aiApplied: "yes" }] },
      "aiApplied",
    ],
  ])("rejects malformed outcome batch %j", async (body, message) => {
    const { assist } = service();
    const error = await rejection(assist.recordOutcomes("call", body));
    expect(error.code).toBe("CALLCENTER_ASSIST_OUTCOME_INVALID");
    expect(error.text).toContain(message);
  });

  it("rejects an inverted accuracy range", async () => {
    const { assist } = service();
    await expect(
      assist.getAccuracy({
        since: "2026-11-02T00:00:00Z",
        until: "2026-11-01T00:00:00Z",
      }),
    ).rejects.toBeInstanceOf(ApiRequestError);
  });

  it("expires drafts after the retention window", async () => {
    const { assist, repository } = service();
    await assist.ingestTranscript("call-6", {
      segments: [segment("e1", "caller", "我要去台北車站")],
    });
    const later = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000);
    expect(await repository.findDraft("call-6", later)).toBeNull();
    expect(await repository.purgeExpired(later)).toBe(1);
    expect(await repository.findDraft("call-6")).toBeNull();
  });

  it("reads the retention days from configuration within bounds", () => {
    const { assist } = service();
    expect(assist.retentionDays({})).toBe(7);
    expect(
      assist.retentionDays({ CALLCENTER_ASSIST_RETENTION_DAYS: "30" }),
    ).toBe(30);
    expect(
      assist.retentionDays({ CALLCENTER_ASSIST_RETENTION_DAYS: "0" }),
    ).toBe(7);
    expect(
      assist.retentionDays({ CALLCENTER_ASSIST_RETENTION_DAYS: "365" }),
    ).toBe(7);
  });
});

describe("LLM refinement", () => {
  const live = { isMockProvider: () => false, isOpenClawProvider: () => false };

  it("is off unless explicitly enabled with a live provider", () => {
    expect(isAssistLlmEnabled(live, {})).toBe(false);
    expect(
      isAssistLlmEnabled(live, { CALLCENTER_ASSIST_LLM_ENABLED: "true" }),
    ).toBe(true);
    expect(
      isAssistLlmEnabled(
        { isMockProvider: () => true, isOpenClawProvider: () => false },
        { CALLCENTER_ASSIST_LLM_ENABLED: "true" },
      ),
    ).toBe(false);
    expect(
      isAssistLlmEnabled(undefined, { CALLCENTER_ASSIST_LLM_ENABLED: "true" }),
    ).toBe(false);
  });

  it("overlays the model's fields and keeps disagreeing rule values as candidates", async () => {
    const segments = [
      {
        segmentId: "f1",
        speaker: "caller" as const,
        text: "我在台大醫院，要去台北車站",
        startedAt: null,
        receivedAt: T0,
      },
    ];
    const rules = extractAssistFieldsByRules(segments, T0);
    const gateway = {
      completeChat: vi.fn(async () => ({
        provider: "openai" as const,
        model: "m",
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        text: `好的：{"fields":{"pickup":{"value":"台大醫院急診室","uncertain":false},"dropoff":{"value":"台北車站","uncertain":false},"passengerName":{"value":"王先生","uncertain":true},"fare":{"value":"300"}}}`,
      })),
    };
    const refined = await refineAssistFieldsWithLlm(
      gateway,
      segments,
      rules,
      T0,
    );
    expect(refined.pickup).toMatchObject({
      value: "台大醫院急診室",
      origin: "llm",
      candidates: ["台大醫院"],
    });
    expect(refined.dropoff?.confidence).toBe(0.92);
    expect(refined.passengerName?.status).toBe("uncertain");
    expect(refined).not.toHaveProperty("fare");
  });

  it("falls back to the rule result when the model fails", async () => {
    const { assist } = service({
      llm: {
        ...live,
        completeChat: vi.fn(async () => {
          throw new Error("provider down");
        }),
      },
    });
    const previous = process.env.CALLCENTER_ASSIST_LLM_ENABLED;
    process.env.CALLCENTER_ASSIST_LLM_ENABLED = "true";
    try {
      const draft = await assist.ingestTranscript("call-7", {
        segments: [segment("g1", "caller", "我要去台北車站")],
      });
      expect(draft.extractor).toBe("rules");
      expect(draft.fields.dropoff?.value).toBe("台北車站");
    } finally {
      if (previous === undefined)
        delete process.env.CALLCENTER_ASSIST_LLM_ENABLED;
      else process.env.CALLCENTER_ASSIST_LLM_ENABLED = previous;
    }
  });

  it("ignores malformed model output", () => {
    expect(() => parseLlmFields("x")).toThrow();
    expect(parseLlmFields({ fields: { pickup: { value: "" } } })).toEqual({});
  });
});

describe("VoiceHandoffQueueService (in-memory mode)", () => {
  const base = {
    voiceSessionId: "vs",
    callId: "call",
    resourceScopeId: "scope",
    reason: "customer_requested",
  };

  it("lists open items by priority, then by waiting time", async () => {
    const queue = new VoiceHandoffQueueService();
    await queue.enqueue({ ...base, handoffId: "a", voiceSessionId: "1" });
    await queue.enqueue({
      ...base,
      handoffId: "b",
      voiceSessionId: "2",
      priority: "emergency",
    });
    await queue.enqueue({ ...base, handoffId: "c", voiceSessionId: "3" });
    await queue.handleCallDrop("c", "caller_hangup", false);
    expect((await queue.listQueuedItems()).map((i) => i.handoffId)).toEqual([
      "b",
      "a",
    ]);
  });

  it("claims the open handoff of a call for the taking operator", async () => {
    const queue = new VoiceHandoffQueueService();
    await queue.enqueue({ ...base, handoffId: "h" });
    const claimed = await queue.claimSession({
      callId: "call",
      operatorId: "OP-1",
    });
    expect(claimed).toMatchObject({
      status: "assigned",
      assignedAgentId: "OP-1",
    });
    expect(
      await queue.claimSession({ callId: "other", operatorId: "OP-1" }),
    ).toBeNull();
  });

  it("re-enqueueing keeps the caller's place and counters", async () => {
    const queue = new VoiceHandoffQueueService();
    const first = await queue.enqueue({ ...base, handoffId: "h" });
    await queue.handleUnanswered("h");
    await queue.redispatch("h");
    const again = await queue.enqueue({
      ...base,
      handoffId: "h",
      reason: "location_unresolved",
    });
    expect(again.enqueuedAt).toBe(first.enqueuedAt);
    expect(again.redispatchCount).toBe(1);
    expect(again.reason).toBe("location_unresolved");
    expect((await queue.findActiveForSession("vs"))?.handoffId).toBe("h");
  });

  it("rejects transitions on unknown items", async () => {
    const queue = new VoiceHandoffQueueService();
    await expect(queue.confirmBridge("missing")).rejects.toMatchObject({
      code: "VOICE_HANDOFF_NOT_FOUND",
    });
  });
});

describe("handoff prefills the agent's draft", () => {
  function harness(snapshot: VoiceDialogueSnapshotContent | null | Error) {
    let session: VoiceSessionRecord = {
      voiceSessionId: "11111111-1111-4111-8111-111111111111",
      callId: "call-hand",
      providerAccountId: "p",
      providerCallId: "pc",
      resourceScopeId: "22222222-2222-4222-8222-222222222222",
      lineBindingId: "lb",
      routeProfileId: "rp",
      routeProfileVersion: 1,
      dialogState: "collecting",
      mediaState: "active",
      controlOwner: "ai",
      leaseEpoch: 1,
      sessionVersion: 1,
      commitStatus: "none",
      recordingState: "capturing",
      confirmationState: "awaiting_answer",
      outcome: null,
      inputEpoch: 1,
      pendingInput: false,
      lastResolvedInputEpoch: 1,
      lastAppliedControlSequence: 1,
      createdAt: T0,
      updatedAt: T0,
    } as VoiceSessionRecord;
    const sessionRepository = {
      findSessionById: vi.fn(async () => ({ ...session })),
      casUpdateSessionControl: vi.fn(
        async (
          _id: string,
          version: number,
          patch: Partial<VoiceSessionRecord>,
        ) => {
          if (version !== session.sessionVersion) return null;
          session = { ...session, ...patch, sessionVersion: version + 1 };
          return { ...session };
        },
      ),
      findPendingReceiptsForSession: vi.fn(async () => []),
    };
    const sessionService = {
      getDialogueSnapshotRestoration: vi.fn(async () => {
        if (snapshot instanceof Error) throw snapshot;
        return { session, snapshot: snapshot ? { content: snapshot } : null };
      }),
    };
    const queue = new VoiceHandoffQueueService();
    const { assist } = service({ queue });
    const handoff = new VoiceHandoffService(
      sessionRepository as never,
      sessionService as never,
      { findActiveConfirmation: vi.fn(async () => null) } as never,
      queue,
      undefined,
      assist,
    );
    return { handoff, assist, queue, getSession: () => session };
  }

  it("copies what the AI collected into the summary and the agent draft", async () => {
    const h = harness(dialogue());
    const result = await h.handoff.initiateHandoff({
      voiceSessionId: h.getSession().voiceSessionId,
      expectedSessionVersion: 1,
      expectedLeaseEpoch: 1,
      reason: "location_unresolved",
    });
    expect(result.summary.draft.slots).toMatchObject({
      pickup: { value: "中山北路二段45巷3號", status: "filled" },
      dropoff: { value: "台北車站", status: "uncertain" },
    });
    expect(result.summary.candidates).toContainEqual(
      expect.objectContaining({ field: "dropoff", candidate: "台北車站" }),
    );
    const draft = await h.assist.getDraft("call-hand");
    expect(draft).toMatchObject({
      source: "voice_handoff",
      handoffId: result.handoffId,
      extractor: "voice_dialogue",
    });
    expect(draft?.fields.passengerPhone?.value).toBe("0912345678");
    expect(await h.queue.listQueuedItems()).toHaveLength(1);
  });

  it("still hands off when the dialogue snapshot cannot be read", async () => {
    const h = harness(new Error("voice_dialogue_snapshot_key_unavailable"));
    const result = await h.handoff.initiateHandoff({
      voiceSessionId: h.getSession().voiceSessionId,
      expectedSessionVersion: 1,
      expectedLeaseEpoch: 1,
      reason: "customer_requested",
    });
    expect(result.queueItem.status).toBe("queued");
    expect(result.summary.draft.slots).toEqual({});
    expect((await h.assist.getDraft("call-hand"))?.fields).toEqual({});
  });

  it("reuses the session's open handoff instead of queueing twice", async () => {
    const h = harness(null);
    const first = await h.handoff.initiateHandoff({
      voiceSessionId: h.getSession().voiceSessionId,
      expectedSessionVersion: 1,
      expectedLeaseEpoch: 1,
      reason: "customer_requested",
    });
    const second = await h.handoff.initiateHandoff({
      voiceSessionId: h.getSession().voiceSessionId,
      expectedSessionVersion: 2,
      expectedLeaseEpoch: 2,
      reason: "urgent_safety",
      priority: "urgent",
    });
    expect(second.handoffId).toBe(first.handoffId);
    const items = await h.queue.listQueuedItems();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      priority: "urgent",
      reason: "urgent_safety",
    });
  });
});

describe("CallcenterController assist routes", () => {
  function controller(readable: string[]) {
    const queue = new VoiceHandoffQueueService();
    const { assist } = service({ queue });
    const callcenterService = {
      listCallSessionsForRead: vi.fn(async () =>
        readable.map((callId) => ({ callId })),
      ),
      getCallSessionForRead: vi.fn(async (callId: string) => {
        if (!readable.includes(callId)) {
          throw new ApiRequestError(404, "CALL_SESSION_NOT_FOUND", "nope");
        }
        return { callId };
      }),
    };
    return {
      queue,
      assist,
      callcenterService,
      controller: new CallcenterController(
        callcenterService as never,
        {} as never,
        {} as never,
        {} as never,
        assist,
        queue,
      ),
    };
  }

  it("lists only handoffs of calls the operator may read", async () => {
    const c = controller(["call-a"]);
    await c.queue.enqueue({
      handoffId: "a",
      voiceSessionId: "1",
      callId: "call-a",
      resourceScopeId: "s",
      reason: "r",
    });
    await c.queue.enqueue({
      handoffId: "b",
      voiceSessionId: "2",
      callId: "call-b",
      resourceScopeId: "s",
      reason: "r",
    });
    const result = await c.controller.listHandoffs(null);
    expect(result.data.items.map((item) => item.handoffId)).toEqual(["a"]);
  });

  it("applies the call's read authorization before returning a draft", async () => {
    const c = controller(["call-a"]);
    await c.assist.ingestTranscript("call-b", {
      segments: [segment("x", "caller", "我要去台北車站")],
    });
    await expect(
      c.controller.getAssistDraft("call-b", null),
    ).rejects.toMatchObject({
      code: "CALL_SESSION_NOT_FOUND",
    });
    await expect(
      c.controller.getAssistDraft("call-a", null),
    ).resolves.toMatchObject({
      data: { draft: null },
    });
  });

  it("defaults the outcome's agent to the signed-in operator", async () => {
    const c = controller(["call-a"]);
    await c.assist.ingestTranscript("call-a", {
      segments: [segment("x", "caller", "我要去台北車站")],
    });
    const result = await c.controller.recordAssistOutcomes(
      "call-a",
      {
        orderId: "o-1",
        fields: [
          {
            field: "dropoff",
            aiApplied: true,
            agentEdited: false,
            finalPresent: true,
          },
        ],
      },
      { actorId: "OPS-9" } as never,
    );
    expect(result.data.outcomes[0]).toMatchObject({
      agentId: "OPS-9",
      outcome: "accepted",
    });
  });

  it("acknowledges transcript batches with the new draft version", async () => {
    const c = controller([]);
    const result = await c.controller.ingestAssistTranscript("call-z", {
      segments: [segment("x", "caller", "我要去台北車站")],
    });
    expect(result.data).toEqual({
      callId: "call-z",
      draftVersion: 1,
      extractor: "rules",
    });
  });
});
