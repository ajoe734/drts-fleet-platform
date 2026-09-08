import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  VoiceConfirmationService,
  canonicalVoiceSnapshot,
  renderVoiceReadback,
  voiceSnapshotHash,
  type ConfirmationFence,
} from "../../apps/api/src/modules/voice-booking/voice-confirmation.service";
import type {
  VoiceBookingRepository,
  VoiceConfirmationRecord,
  VoiceSessionEventRecord,
} from "../../apps/api/src/modules/voice-booking/voice-booking.repository";
import { VoiceEvidenceService } from "../../apps/api/src/modules/voice-booking/voice-evidence.service";
import type { VoiceCheckpointRepository } from "../../apps/api/src/modules/voice-booking/voice-checkpoint.repository";
import type { VoiceBookingDraftService } from "../../apps/api/src/modules/voice-booking/voice-booking-draft.service";
import { VoiceConfirmationController } from "../../apps/voice-media-worker/src/dialogue/confirmation/confirmation-controller";

function snapshot() {
  const expiry = new Date(Date.now() + 120_000).toISOString();
  const place = (address: string) => ({
    selectedCandidateId: randomUUID(),
    entranceId: "東門",
    resolutionVersion: "v1",
    validUntil: expiry,
    address: {
      address,
      normalizedAddress: address,
      coordinateSource: "provider_candidate",
    },
  });
  return {
    bookingRequirements: {
      passengerCount: 2,
      luggageCount: 1,
      luggageSize: "standard",
      requiredCapabilities: [],
      bookerContact: { name: "代叫者", phone: "0912345678" },
      passengerContact: { name: "乘客", phone: "0987654321" },
      driverContactRole: "passenger",
      policyVersion: "v1",
      validationReference: randomUUID(),
    },
    bookingQualification: {
      resourceScopeId: "scope",
      scopeVersion: 1,
      runtimeProfileCode: "ordinary_taxi",
      serviceProductCode: "taxi_realtime",
      timingMode: "on_demand",
      requestedAt: new Date().toISOString(),
      timeZone: "Asia/Taipei",
      pickup: place("台北市中山路123號"),
      dropoff: place("新北市中正路45號"),
      serviceArea: {
        decision: "serviceable",
        stops: [{ decision: "serviceable" }],
      },
      validUntil: expiry,
    },
    pickupNotes: "東側入口等候",
  };
}
async function harness(method: "speech" | "dtmf" = "speech") {
  const sessionId = randomUUID(),
    intentId = randomUUID();
  const session = {
    voiceSessionId: sessionId,
    callId: "call",
    providerAccountId: "provider",
    resourceScopeId: "scope",
    sessionVersion: 1,
    inputEpoch: 0,
    lastResolvedInputEpoch: 0,
    lastAppliedControlSequence: 1,
    leaseEpoch: 1,
    pendingInput: false,
    controlOwner: "ai",
    dialogState: "confirming",
    commitStatus: "none",
    confirmationState: "absent",
  };
  const intent = {
    intentId,
    voiceSessionId: sessionId,
    action: "create_owned_order",
    currentDraftVersion: 1,
    boundOrderId: null,
  };
  const draft = {
    intentId,
    draftVersion: 1,
    canonicalSnapshot: snapshot(),
    snapshotHash: "",
  };
  draft.snapshotHash = voiceSnapshotHash(draft.canonicalSnapshot);
  let confirmation: VoiceConfirmationRecord | null = null;
  const events: VoiceSessionEventRecord[] = [];
  const event = (eventType: string, payload: unknown = {}) => {
    const row = {
      eventId: randomUUID(),
      voiceSessionId: sessionId,
      legId: "leg",
      source: "trusted-adapter",
      providerAccountId: "provider",
      sourceEventId: randomUUID(),
      occurredAt: new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      sequence: events.length + 1,
      mediaEpoch: 1,
      inputEpoch: session.inputEpoch,
      leaseEpoch: 1,
      eventType,
      payload,
      payloadRef: null,
    };
    events.push(row);
    session.lastAppliedControlSequence = row.sequence;
    return row;
  };
  event("input_resolved_irrelevant");
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    if (sql.startsWith("INSERT INTO voice.confirmation")) {
      confirmation = {
        confirmationId: values[0],
        voiceSessionId: values[1],
        intentId: values[2],
        draftVersion: values[3],
        action: values[4],
        confirmationMethod: "speech",
        snapshotHash: values[5],
        readbackPlaybackId: values[6],
        inputEpoch: values[7],
        mediaEpoch: values[8],
        controlSequence: values[9],
        leaseEpoch: values[10],
        evidence: JSON.parse(values[11] as string),
        state: "readback_playing",
        expiresAt: values[12],
        readbackCompletedEventId: null,
        recordingCheckpointId: null,
        consumedCommandId: null,
        confirmedAt: null,
      } as VoiceConfirmationRecord;
    }
    if (sql.startsWith("UPDATE voice.confirmation SET state = 'accepted'"))
      Object.assign(confirmation!, {
        state: "accepted",
        confirmationMethod: values[1],
        readbackCompletedEventId: values[2],
        inputEpoch: values[3],
        controlSequence: values[4],
        recordingCheckpointId: values[5],
        evidence: JSON.parse(values[6] as string),
        confirmedAt: values[7],
      });
    if (sql.startsWith("UPDATE voice.confirmation SET state = 'invalidated'"))
      confirmation!.state = "invalidated";
    if (sql.startsWith("UPDATE voice.session")) {
      session.sessionVersion++;
      if (sql.includes("confirmation_state = $2")) {
        session.confirmationState = values[1] as string;
        session.pendingInput = values[2] as boolean;
      }
      if (sql.includes("pending_input = true")) session.pendingInput = true;
      if (sql.includes("input_epoch = input_epoch + 1")) {
        session.inputEpoch++;
        session.lastResolvedInputEpoch = session.inputEpoch;
        session.pendingInput = false;
      }
    }
    if (sql.startsWith("INSERT INTO voice.draft_revision")) {
      draft.draftVersion = values[1] as number;
      draft.canonicalSnapshot = JSON.parse(values[4] as string);
      draft.snapshotHash = values[5] as string;
    }
    if (sql.startsWith("UPDATE voice.intent"))
      intent.currentDraftVersion = values[1] as number;
    return { rows: [], rowCount: 1 };
  });
  const repo = {
    withTransaction: async (
      work: (tx: { query: typeof query }) => Promise<unknown>,
    ) => work({ query }),
    findSessionById: async () => structuredClone(session),
    findIntentById: async () => structuredClone(intent),
    findDraftRevision: async () => structuredClone(draft),
    findActiveConfirmation: async () =>
      confirmation &&
      ["readback_playing", "awaiting_answer", "accepted"].includes(
        confirmation.state,
      )
        ? structuredClone(confirmation)
        : null,
    listSessionEvents: async () => structuredClone(events),
    findRecordingCheckpointById: vi.fn(async () => checkpoint),
  };
  const reader = {
    readTrusted: vi.fn(async () => ({
      startMs: 0,
      endMs: 1000,
      confirmationReceipt: coverage.confirmationReceipt,
    })),
  };
  const evidence = new VoiceEvidenceService(
    {} as VoiceCheckpointRepository,
    repo as unknown as VoiceBookingRepository,
    {
      resolve: async () => ({
        binding: {
          scope: coverage.scope,
          snapshotHash: coverage.snapshotHash,
          readbackPlaybackId: coverage.readbackPlaybackId,
          mediaEpoch: 1,
        } as never,
        policyVersion: "retention-v1",
      }),
    },
    reader,
  );
  const qualify = vi.fn(async () => {
    const next = snapshot();
    next.bookingQualification.dropoff.address.normalizedAddress =
      "台北市仁愛路99號";
    return next;
  });
  const service = new VoiceConfirmationService(
    repo as unknown as VoiceBookingRepository,
    evidence,
    { qualify } as unknown as VoiceBookingDraftService,
    {
      authorize: async () => ({
        leaseEpoch: 1,
        resourceScopeId: "scope",
        providerAccountId: "provider",
      }),
    },
  );
  const fence = (): ConfirmationFence => ({
    voiceSessionId: sessionId,
    intentId,
    sessionVersion: session.sessionVersion,
    draftVersion: intent.currentDraftVersion,
    inputEpoch: session.inputEpoch,
    leaseEpoch: session.leaseEpoch,
    controlCutoff: {
      mediaEpoch: 1,
      controlSequence: session.lastAppliedControlSequence,
    },
  });
  const plan = await service.beginReadback("credential", fence());
  const playback = event("playback_completed", {
    readbackPlaybackId: plan.readbackPlaybackId,
    readbackScriptHash: plan.readbackScriptHash,
    audioVersion: "audio-v1",
    completionSource: "provider_playback",
    outcome: "completed",
  });
  session.inputEpoch = 1;
  session.lastResolvedInputEpoch = 1;
  if (method === "speech") event("speech_start");
  const answer = event(method === "speech" ? "asr_final" : "dtmf", {
    readbackPlaybackId: plan.readbackPlaybackId,
    snapshotHash: plan.snapshotHash,
    replay: false,
    ...(method === "speech"
      ? {
          turnId: randomUUID(),
          isFinal: true,
          vadPassed: true,
          echoDetected: false,
          competingSpeech: false,
          sourceAttribution: "passenger",
          intent: "confirm_booking",
          text: "確認叫車",
        }
      : { digit: "1", expectedDigit: "1", timingSource: "provider" }),
  });
  const coverage: Record<string, unknown> = {
    scope: {
      callId: "call",
      brandId: "brand",
      recordingId: "recording",
      legId: "leg",
    },
    snapshotHash: plan.snapshotHash,
    readbackPlaybackId: plan.readbackPlaybackId,
    mediaEpoch: 1,
    startMs: 0,
    endMs: 1000,
    confirmationReceipt: {
      scope: {
        callId: "call",
        brandId: "brand",
        recordingId: "recording",
        legId: "leg",
      },
      snapshotHash: plan.snapshotHash,
      readbackPlaybackId: plan.readbackPlaybackId,
      mediaEpoch: 1,
      readback: {
        completedEventId: playback.eventId,
        sequence: playback.sequence,
        outcome: "completed",
        completionSource: "provider_playback",
      },
      confirmation: {
        eventId: answer.eventId,
        sequence: answer.sequence,
        method,
        readbackPlaybackId: plan.readbackPlaybackId,
        snapshotHash: plan.snapshotHash,
        mediaEpoch: 1,
        ...(method === "dtmf" ? { digit: "1", expectedDigit: "1" } : {}),
      },
    },
  };
  const checkpoint: Record<string, unknown> = {
    checkpointId: randomUUID(),
    callId: "call",
    recordingId: "recording",
    manifest: { checksum: "manifest-hash" },
    manifestHash: "manifest-hash",
    coverage,
    verifiedAt: new Date().toISOString(),
    policyVersion: "retention-v1",
  };
  const accept = () =>
    service.accept("credential", {
      ...fence(),
      confirmationId: plan.confirmationId,
      checkpointId: checkpoint.checkpointId as string,
    });
  return {
    service,
    session,
    intent,
    draft,
    events,
    event,
    query,
    fence,
    plan,
    playback,
    answer,
    checkpoint,
    coverage,
    reader,
    qualify,
    accept,
    confirmation: () => confirmation!,
  };
}

describe("UV-EXEC-014 deterministic readback", () => {
  it("binds all business fields independent of JSON key order and reads Taipei date, doors and separate contacts", () => {
    const s = snapshot();
    expect(voiceSnapshotHash(s)).toBe(
      voiceSnapshotHash(Object.fromEntries(Object.entries(s).reverse())),
    );
    const rendered = renderVoiceReadback(s);
    expect(rendered.script).toContain("中山路1 2 3號");
    expect(rendered.script).toContain("0 9 8 7 6 5 4 3 2 1");
    expect(rendered.script).toContain("司機將聯絡乘車聯絡人");
    expect(rendered.script).toContain("按 1");
    const before = voiceSnapshotHash(s);
    s.bookingRequirements.luggageCount++;
    expect(voiceSnapshotHash(s)).not.toBe(before);
  });
  it.each([undefined, NaN, Infinity, new Date()])(
    "rejects lossy canonical JSON: %s",
    (value) => {
      expect(() => canonicalVoiceSnapshot({ value })).toThrow();
    },
  );
  it("does not silently omit unsupported fares or expired qualifications", () => {
    expect(() => renderVoiceReadback({ ...snapshot(), fare: 999 })).toThrow();
    const s = snapshot();
    s.bookingQualification.validUntil = new Date(0).toISOString();
    expect(() => renderVoiceReadback(s)).toThrow();
  });
});

describe("UV-EXEC-014 speech/DTMF durable confirmation", () => {
  it.each(["speech", "dtmf"] as const)(
    "accepts %s only after evidence retrieval and locked current snapshot validation",
    async (method) => {
      const h = await harness(method);
      const proof = await h.accept();
      expect(proof.confirmationMethod).toBe(method);
      expect(proof.snapshotHash).toBe(h.draft.snapshotHash);
      expect(proof.recordingCheckpointId).toBe(h.checkpoint.checkpointId);
      expect(h.reader.readTrusted).toHaveBeenCalledOnce();
      expect(h.confirmation().state).toBe("accepted");
      expect(proof.evidence).toEqual(
        method === "speech"
          ? {
              turnId: (h.answer.payload as { turnId: string }).turnId,
              finalEventId: h.answer.eventId,
            }
          : { eventId: h.answer.eventId, digit: "1" },
      );
      const locks = h.query.mock.calls
        .map((c) => c[0])
        .filter((sql) => sql.includes("FOR UPDATE"));
      expect(
        locks.slice(-3).map((sql) => sql.split("FROM ")[1].split(" WHERE")[0]),
      ).toEqual(["voice.session", "voice.intent", "voice.confirmation"]);
      await expect(h.accept()).rejects.toThrow();
    },
  );
  it.each(["好", "對", "對，但是去別的地方", "確認叫車嗎？", "", "不要叫車"])(
    "does not accept ambiguous/negative text %s",
    async (text) => {
      const h = await harness();
      Object.assign(h.answer.payload as object, { text });
      await expect(h.accept()).rejects.toThrow();
      expect(h.confirmation().state).not.toBe("accepted");
    },
  );
  it.each([
    { replay: true },
    { isFinal: false },
    { vadPassed: false },
    { echoDetected: true },
    { competingSpeech: true },
    { sourceAttribution: "background_tv" },
    { sourceAttribution: "unknown" },
    { intent: "correction" },
    { turnId: "" },
    { snapshotHash: "old" },
    { readbackPlaybackId: "old" },
  ])("rejects suspicious/stale speech %j", async (patch) => {
    const h = await harness();
    Object.assign(h.answer.payload as object, patch);
    await expect(h.accept()).rejects.toThrow();
  });
  it.each([
    { digit: "2" },
    { expectedDigit: "2" },
    { replay: true },
    { timingSource: "local" },
  ])("rejects untrusted DTMF %j", async (patch) => {
    const h = await harness("dtmf");
    Object.assign(h.answer.payload as object, patch);
    await expect(h.accept()).rejects.toThrow();
  });
  it.each([
    { outcome: "cleared" },
    { completionSource: "local_send" },
    { audioVersion: "" },
    { readbackScriptHash: "freeform-audio" },
  ])("rejects missing actual controlled playback %j", async (patch) => {
    const h = await harness();
    Object.assign(h.playback.payload as object, patch);
    await expect(h.accept()).rejects.toThrow();
  });
  it.each([
    "gap",
    "pending",
    "unresolved",
    "stale_epoch",
    "foreign_leg",
    "missing_event",
    "new_input",
    "old_snapshot",
  ])("rejects %s under lock", async (cause) => {
    const h = await harness();
    if (cause === "gap") h.events.splice(1, 1);
    if (cause === "pending") h.session.pendingInput = true;
    if (cause === "unresolved") h.session.lastResolvedInputEpoch--;
    if (cause === "stale_epoch") h.answer.mediaEpoch--;
    if (cause === "foreign_leg") h.answer.legId = "other";
    if (cause === "missing_event") h.answer.eventId = randomUUID();
    if (cause === "new_input") h.event("speech_start");
    if (cause === "old_snapshot")
      h.draft.canonicalSnapshot.bookingRequirements.passengerCount++;
    await expect(h.accept()).rejects.toThrow();
  });
  it("rechecks revision after asynchronous evidence download", async () => {
    const h = await harness();
    h.reader.readTrusted.mockImplementationOnce(async () => {
      h.session.sessionVersion++;
      return {
        startMs: 0,
        endMs: 1000,
        confirmationReceipt: h.coverage.confirmationReceipt,
      };
    });
    await expect(h.accept()).rejects.toMatchObject({
      code: "VOICE_CONFIRMATION_REQUIRED",
    });
  });
  it("rejects a checkpoint that can no longer be retrieved", async () => {
    const h = await harness();
    h.reader.readTrusted.mockRejectedValueOnce(new Error("object missing"));
    await expect(h.accept()).rejects.toThrow(
      "Recording evidence verification failed",
    );
  });
  it("requires actual checkpoint receipt match, not just a nonempty checkpoint ID", async () => {
    const h = await harness();
    (h.coverage.confirmationReceipt as { snapshotHash: string }).snapshotHash =
      "other";
    await expect(h.accept()).rejects.toThrow();
  });
});

describe("UV-EXEC-014 corrections and disconnect", () => {
  it("unknown input invalidates before reasking and old ASR/marks cannot revive it", async () => {
    const h = await harness();
    const result = await h.service.invalidate(
      "credential",
      h.fence(),
      "unknown_input",
    );
    expect(result.reask).toBe(true);
    expect(h.confirmation().state).toBe("invalidated");
    expect(h.session.pendingInput).toBe(true);
    await expect(h.accept()).rejects.toThrow();
  });
  it.each(["none", "pending"])(
    "disconnect obeys commit status %s",
    async (commit) => {
      const h = await harness();
      await h.accept();
      h.session.commitStatus = commit;
      const before = structuredClone(h.confirmation());
      await h.service.invalidate("credential", h.fence(), "disconnect");
      if (commit === "pending") expect(h.confirmation()).toEqual(before);
      else expect(h.confirmation().state).toBe("invalidated");
    },
  );
  it("unparsed input blocks pending execution without expanding its sealed proof", async () => {
    const h = await harness();
    await h.accept();
    h.session.commitStatus = "pending";
    const before = structuredClone(h.confirmation());
    await h.service.invalidate("credential", h.fence(), "unknown_input");
    expect(h.confirmation()).toEqual(before);
    expect(h.session.pendingInput).toBe(true);
  });
  it("material destination edit appends a revision and invalidates pending confirmation under the same locks", async () => {
    const h = await harness();
    await h.accept();
    h.session.commitStatus = "pending";
    const oldHash = h.draft.snapshotHash;
    const result = await h.service.replaceDraft(
      "credential",
      h.fence(),
      {} as never,
    );
    expect(result.draftVersion).toBe(2);
    expect(h.draft.snapshotHash).not.toBe(oldHash);
    expect(h.confirmation().state).toBe("invalidated");
    expect(
      h.draft.canonicalSnapshot.bookingQualification.dropoff.address
        .normalizedAddress,
    ).toBe("台北市仁愛路99號");
    expect(
      h.query.mock.calls.some(([sql]) =>
        /UPDATE voice.command_receipt/.test(sql),
      ),
    ).toBe(false);
    await expect(h.accept()).rejects.toThrow();
  });
});

describe("UV-EXEC-014 media guard", () => {
  it("local clear happens before API failure and a late mark cannot resurrect the plan", async () => {
    const h = await harness();
    const order: string[] = [];
    const controller = new VoiceConfirmationController({
      play: async () => {},
      clear: () => {
        order.push("clear");
      },
      invalidate: async () => {
        order.push("api");
        throw new Error("offline");
      },
    });
    await controller.readback(h.plan);
    expect(
      controller.canRequestEvidence(h.plan.readbackPlaybackId, false),
    ).toBe(false);
    await expect(controller.interrupt("unknown_input")).rejects.toThrow(
      "offline",
    );
    expect(order).toEqual(["clear", "api"]);
    expect(
      controller.playbackCompleted({
        playbackId: h.plan.readbackPlaybackId,
        eventId: "late",
        outcome: "completed",
        source: "provider_playback",
      }),
    ).toBe(false);
  });
  it("TTS generation and diagnostic replay never enable evidence submission", async () => {
    const h = await harness();
    const controller = new VoiceConfirmationController({
      play: async () => {},
      clear: () => {},
      invalidate: async () => {},
    });
    await controller.readback(h.plan);
    expect(
      controller.playbackCompleted({
        playbackId: h.plan.readbackPlaybackId,
        eventId: "tts",
        outcome: "completed",
        source: "local_send",
      }),
    ).toBe(false);
    expect(
      controller.playbackCompleted({
        playbackId: h.plan.readbackPlaybackId,
        eventId: "provider",
        outcome: "completed",
        source: "provider_playback",
      }),
    ).toBe(true);
    expect(controller.canRequestEvidence(h.plan.readbackPlaybackId, true)).toBe(
      false,
    );
    expect(
      controller.canRequestEvidence(h.plan.readbackPlaybackId, false),
    ).toBe(true);
  });
});

describe("UV-EXEC-014 local confirmation orchestration", () => {
  it("invalidates a rejected answer before returning for clarification", async () => {
    const h = await harness();
    const invalidated = vi.fn(async () => {});
    const controller = new VoiceConfirmationController({
      play: async () => {},
      clear: () => {},
      invalidate: invalidated,
    });
    await controller.readback(h.plan);
    controller.playbackCompleted({
      playbackId: h.plan.readbackPlaybackId,
      eventId: "completed",
      outcome: "completed",
      source: "provider_playback",
    });
    await expect(
      controller.requestConfirmation(
        h.plan.readbackPlaybackId,
        false,
        async () => {
          throw new Error("ambiguous answer");
        },
      ),
    ).rejects.toThrow("ambiguous answer");
    expect(invalidated).toHaveBeenCalledWith("unknown_input");
    await expect(controller.readback(h.plan)).rejects.toThrow(
      "voice_readback_active",
    );
  });
  it("does not publish a proof returned after local interruption", async () => {
    const h = await harness();
    const controller = new VoiceConfirmationController({
      play: async () => {},
      clear: () => {},
      invalidate: async () => {},
    });
    await controller.readback(h.plan);
    controller.playbackCompleted({
      playbackId: h.plan.readbackPlaybackId,
      eventId: "completed",
      outcome: "completed",
      source: "provider_playback",
    });
    await expect(
      controller.requestConfirmation(
        h.plan.readbackPlaybackId,
        false,
        async () => {
          await controller.interrupt("unknown_input");
          return "stale-proof";
        },
      ),
    ).rejects.toThrow("voice_confirmation_interrupted");
  });
  it.each([
    "clear",
    "playback_cleared",
    "material_edit",
    "language_switch",
    "owner_switch",
    "asr_disconnected",
    "input_unknown",
  ])("invalidating control event %s prevents acceptance", async (eventType) => {
    const h = await harness();
    h.event(eventType);
    await expect(h.accept()).rejects.toThrow();
  });
  it("does not trust caller-owned revisions changed while authorization waits", async () => {
    const h = await harness();
    const fence = {
      ...h.fence(),
      confirmationId: h.plan.confirmationId,
      checkpointId: h.checkpoint.checkpointId as string,
    };
    const accepted = h.service.accept("credential", fence);
    fence.controlCutoff.controlSequence = 999;
    expect((await accepted).controlCutoff.controlSequence).toBe(
      h.session.lastAppliedControlSequence,
    );
  });
});
