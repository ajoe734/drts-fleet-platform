import { describe, expect, it, vi } from "vitest";

import { VoiceHandoffQueueService } from "../../apps/api/src/modules/callcenter/voice-handoff-queue.service";
import {
  VoiceCtiAdapter,
  type VoiceCtiProviderAdapter,
} from "../../apps/api/src/modules/callcenter/voice-cti.adapter";
import {
  VoiceHandoffService,
  type HandoffSummary,
  type InitiateHandoffCommand,
  type LateAiToolResultCommand,
  type RecordHandoffInputCommand,
} from "../../apps/api/src/modules/voice-booking/voice-handoff.service";
import { VoiceSessionService } from "../../apps/api/src/modules/voice-booking/voice-session.service";
import type {
  VoiceCommandReceiptRecord,
  VoiceConfirmationRecord,
  VoiceSessionRecord,
} from "../../apps/api/src/modules/voice-booking/voice-booking.repository";
import { HandoffAudioCoordinator } from "../../apps/voice-media-worker/src/handoff";
import {
  VoiceMediaOutputFence,
  type VoiceMediaOutputSink,
} from "../../apps/voice-media-worker/src/media/output-fence";

const VOICE_SESSION_ID = "11111111-1111-4111-8111-111111111111";
const RESOURCE_SCOPE_ID = "22222222-2222-4222-8222-222222222222";
const CALL_ID = "call-017-test";

function createSessionRecord(
  overrides: Partial<VoiceSessionRecord> = {},
): VoiceSessionRecord {
  return {
    voiceSessionId: VOICE_SESSION_ID,
    callId: CALL_ID,
    providerAccountId: "provider-1",
    providerCallId: "provider-call-1",
    resourceScopeId: RESOURCE_SCOPE_ID,
    lineBindingId: "line-binding-1",
    routeProfileId: "route-profile-1",
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
    lastAppliedControlSequence: 5,
    createdAt: "2026-09-06T00:00:00.000Z",
    updatedAt: "2026-09-06T00:00:00.000Z",
    ...overrides,
  };
}

function buildTestHarness(options: {
  sessionOverrides?: Partial<VoiceSessionRecord>;
  pendingReceipts?: VoiceCommandReceiptRecord[];
  activeConfirmation?: VoiceConfirmationRecord | null;
} = {}) {
  let currentSession = createSessionRecord(options.sessionOverrides);
  const pendingReceipts = options.pendingReceipts ?? [];
  let activeConf = options.activeConfirmation ?? null;

  const sessionRepository = {
    findSessionById: vi.fn(async (id: string) => {
      return id === currentSession.voiceSessionId ? { ...currentSession } : null;
    }),
    casUpdateSessionControl: vi.fn(
      async (
        id: string,
        expectedVersion: number,
        patch: Partial<VoiceSessionRecord>,
      ) => {
        if (id !== currentSession.voiceSessionId || currentSession.sessionVersion !== expectedVersion) {
          return null;
        }
        currentSession = {
          ...currentSession,
          ...patch,
          sessionVersion: currentSession.sessionVersion + 1,
          updatedAt: new Date().toISOString(),
        };
        return { ...currentSession };
      },
    ),
    invalidateActiveConfirmationForSession: vi.fn(async (id: string) => {
      if (id === currentSession.voiceSessionId) {
        currentSession.confirmationState = "invalidated";
        if (activeConf) {
          activeConf = null;
        }
      }
      return null;
    }),
    findPendingReceiptsForSession: vi.fn(async (id: string) => {
      return id === currentSession.voiceSessionId ? [...pendingReceipts] : [];
    }),
  };

  const bookingRepository = {
    findSessionById: sessionRepository.findSessionById,
    findActiveConfirmation: vi.fn(async () => activeConf),
    findIntentById: vi.fn(async () => ({
      intentId: "intent-1",
      voiceSessionId: currentSession.voiceSessionId,
      action: "create_owned_order",
    })),
    findResourceScopeById: vi.fn(async () => ({
      resourceScopeId: RESOURCE_SCOPE_ID,
      brandId: "brand-a",
      status: "active",
    })),
    findReceiptByActionKey: vi.fn(
      async (
        _brandId: string,
        _callId: string,
        _intentId: string,
        _action: string,
      ) => pendingReceipts[0] ?? null,
    ),
  };

  const auditLogs: unknown[] = [];
  const auditService = {
    recordAuditLog: vi.fn((log: unknown) => {
      auditLogs.push(log);
      return log;
    }),
  };

  const sessionService = new VoiceSessionService(sessionRepository as never);
  const handoffQueueService = new VoiceHandoffQueueService();

  const handoffService = new VoiceHandoffService(
    sessionRepository as never,
    sessionService,
    bookingRepository as never,
    handoffQueueService,
    auditService as never,
  );

  return {
    sessionRepository,
    bookingRepository,
    sessionService,
    handoffQueueService,
    auditService,
    auditLogs,
    handoffService,
    getSession: () => ({ ...currentSession }),
  };
}

function buildAudioFence(options: { sinkThrowsOnClear?: boolean } = {}) {
  const sink: VoiceMediaOutputSink = {
    clear: vi.fn(() => {
      if (options.sinkThrowsOnClear) {
        throw new Error("CTI connection reset");
      }
    }),
    write: vi.fn(),
  };

  const fence = new VoiceMediaOutputFence({
    sessionId: VOICE_SESSION_ID,
    scopeId: `scope-${RESOURCE_SCOPE_ID}`,
    sink,
    maxBufferedAudioMs: 200,
    initialOwner: "ai",
    initialPrincipalId: "ai-worker-1",
  });

  const aiAccess = fence.issueAccess("ai-worker-1")!;
  const coordinator = new HandoffAudioCoordinator(fence, "coordinator-1");

  return { fence, sink, aiAccess, coordinator };
}

describe("UV-EXEC-017: 真人轉接 coordinator 與排隊控制權移交", () => {
  // --------------------------------------------------------------------------
  // Acceptance Evidence Key 1: control_owner_race_evidence
  // --------------------------------------------------------------------------
  describe("control_owner_race_evidence", () => {
    it("atomically transfers control owner to coordinator and increments lease epoch via CAS", async () => {
      const h = buildTestHarness();
      expect(h.getSession().controlOwner).toBe("ai");
      expect(h.getSession().leaseEpoch).toBe(1);
      expect(h.getSession().sessionVersion).toBe(1);

      const command: InitiateHandoffCommand = {
        voiceSessionId: VOICE_SESSION_ID,
        expectedSessionVersion: 1,
        expectedLeaseEpoch: 1,
        reason: "customer_requested",
        priority: "normal",
        nextResponsibleParty: "human_agent",
      };

      const result = await h.handoffService.initiateHandoff(command);

      expect(result.session.controlOwner).toBe("coordinator");
      expect(result.session.leaseEpoch).toBe(2);
      expect(result.session.sessionVersion).toBe(2);
      expect(result.session.dialogState).toBe("handoff_pending");

      // Verify minimal coordinator scopes: order_create_bound is strictly excluded
      expect(result.coordinatorClaims.scopes).toContain("session_execute");
      expect(result.coordinatorClaims.scopes).toContain("order_read_bound");
      expect(result.coordinatorClaims.scopes).toContain("handoff_request");
      expect(result.coordinatorClaims.scopes).not.toContain("order_create_bound");
    });

    it("enforces mutual exclusion: stale AI write using superseded lease or version is rejected", async () => {
      const h = buildTestHarness();

      // Initiate handoff: moves owner to coordinator, leaseEpoch 1 -> 2, sessionVersion 1 -> 2
      await h.handoffService.initiateHandoff({
        voiceSessionId: VOICE_SESSION_ID,
        expectedSessionVersion: 1,
        expectedLeaseEpoch: 1,
        reason: "location_unresolved",
      });

      // AI tries to write using stale leaseEpoch 1 -> rejected with VOICE_SESSION_NOT_OWNER
      await expect(
        h.sessionService.claimControlOwner(VOICE_SESSION_ID, 2, 1, "ai"),
      ).rejects.toMatchObject({
        code: "VOICE_SESSION_NOT_OWNER",
      });

      // AI tries to write using stale sessionVersion 1 -> rejected with VOICE_DRAFT_STALE
      await expect(
        h.sessionService.claimControlOwner(VOICE_SESSION_ID, 1, 2, "ai"),
      ).rejects.toMatchObject({
        code: "VOICE_DRAFT_STALE",
      });

      // Coordinator writing with valid version and lease succeeds
      const updatedByCoordinator = await h.sessionService.claimControlOwner(
        VOICE_SESSION_ID,
        2,
        2,
        "human",
      );
      expect(updatedByCoordinator.controlOwner).toBe("human");
      expect(updatedByCoordinator.leaseEpoch).toBe(3);
    });

    it("routes late AI tool results arriving after handoff into audit logs and blocks execution", async () => {
      const h = buildTestHarness();

      // AI dispatched a tool when leaseEpoch was 1
      const toolCommand: LateAiToolResultCommand = {
        voiceSessionId: VOICE_SESSION_ID,
        leaseEpoch: 1,
        toolName: "resolve_location",
        toolResult: { candidates: [{ placeId: "p1", label: "台北車站" }] },
      };

      // Before handoff: tool result from current owner/lease is accepted
      const beforeHandoff = await h.handoffService.handleLateAiToolResult(toolCommand);
      expect(beforeHandoff.accepted).toBe(true);
      expect(beforeHandoff.audited).toBe(false);

      // Now handoff occurs: advances leaseEpoch to 2 and owner to coordinator
      await h.handoffService.initiateHandoff({
        voiceSessionId: VOICE_SESSION_ID,
        expectedSessionVersion: 1,
        expectedLeaseEpoch: 1,
        reason: "urgent_safety",
      });

      // Another late AI tool result from epoch 1 arrives after handoff
      const afterHandoff = await h.handoffService.handleLateAiToolResult(toolCommand);

      // Result must NOT be accepted for state execution, but audited for compliance
      expect(afterHandoff.accepted).toBe(false);
      expect(afterHandoff.audited).toBe(true);
      expect(afterHandoff.reason).toBe("session_handed_off_owner_changed");

      // Verify audit log was recorded with exact contextual metadata
      expect(h.auditService.recordAuditLog).toHaveBeenCalled();
      expect(h.auditLogs).toHaveLength(1);
      expect(h.auditLogs[0]).toMatchObject({
        actionName: "late_ai_tool_result_discarded",
        resourceType: "voice_session",
        resourceId: VOICE_SESSION_ID,
        newValuesSummary: expect.objectContaining({
          reason: "session_handed_off_owner_changed",
          callingLeaseEpoch: 1,
          currentLeaseEpoch: 2,
          currentControlOwner: "coordinator",
          toolName: "resolve_location",
        }),
      });

      // Session state remains unmutated by the late tool result
      expect(h.getSession().controlOwner).toBe("coordinator");
      expect(h.getSession().leaseEpoch).toBe(2);
    });

    it("prevents old AI from self-issuing or requesting a new lease epoch after handoff", async () => {
      const h = buildTestHarness();

      // Handoff to coordinator
      await h.handoffService.initiateHandoff({
        voiceSessionId: VOICE_SESSION_ID,
        expectedSessionVersion: 1,
        expectedLeaseEpoch: 1,
        reason: "customer_requested",
      });

      // Old AI tries to claim or assert authority for epoch 1 -> rejected
      await expect(
        h.handoffService.assertCanIssueEpoch(VOICE_SESSION_ID, 1, "ai"),
      ).rejects.toMatchObject({
        code: "VOICE_SESSION_NOT_OWNER",
      });

      // Old AI trying to assert authority for new epoch 2 as "ai" -> rejected (owner is coordinator)
      await expect(
        h.handoffService.assertCanIssueEpoch(VOICE_SESSION_ID, 2, "ai"),
      ).rejects.toMatchObject({
        code: "VOICE_SESSION_NOT_OWNER",
      });

      // Coordinator asserting epoch 2 succeeds
      const validCoordinator = await h.handoffService.assertCanIssueEpoch(
        VOICE_SESSION_ID,
        2,
        "coordinator",
      );
      expect(validCoordinator.controlOwner).toBe("coordinator");
    });
  });

  // --------------------------------------------------------------------------
  // Acceptance Evidence Key 2: handoff_queue_drop_evidence
  // --------------------------------------------------------------------------
  describe("handoff_queue_drop_evidence", () => {
    it("isolates old AI audio prior to handoff and retains pending when CTI clear fails/uncertain", () => {
      // Normal case: CTI clear succeeds -> audio isolated, coordinator access issued
      const normal = buildAudioFence({ sinkThrowsOnClear: false });
      const normalResult = normal.coordinator.isolateAiAudio(normal.aiAccess);
      expect(normalResult.success).toBe(true);
      expect(normalResult.status).toBe("isolated");
      expect(normalResult.coordinatorAccess).not.toBeNull();
      expect(normal.coordinator.isAudioIsolated()).toBe(true);
      expect(normal.sink.clear).toHaveBeenCalledTimes(1);

      // Failure case: CTI clear throws / disconnects
      const faulty = buildAudioFence({ sinkThrowsOnClear: true });
      const faultyResult = faulty.coordinator.isolateAiAudio(faulty.aiAccess);

      // Acceptance: 移交時先隔離舊 AI 音訊，CTI clear/bridge 不確定時保留 pending 而非宣稱已接通
      expect(faultyResult.success).toBe(false);
      expect(faultyResult.status).toBe("pending");
      expect(faultyResult.coordinatorAccess).toBeNull();
      expect(faulty.coordinator.isAudioIsolated()).toBe(false);
      expect(faulty.coordinator.getIsolationState()).toBe("pending");
    });

    it("streams wait audio during queueing, clears hold audio before bridge, and keeps pending if bridge is unconfirmed", async () => {
      const { coordinator, aiAccess } = buildAudioFence();
      const isolation = coordinator.isolateAiAudio(aiAccess);
      expect(isolation.success).toBe(true);
      const coordAccess = isolation.coordinatorAccess!;

      // Coordinator streams hold audio
      const played = coordinator.playWaitAudio(
        coordAccess,
        "hold-prompt-1",
        new Int16Array(80),
        { sampleRateHz: 8_000, channels: 1 },
      );
      expect(played).toBe(true);
      expect(coordinator.isHoldAudioPlaying()).toBe(true);

      // Attempt bridging with an uncertain / rejected bridge action
      const unconfirmedBridge = await coordinator.bridgeToHuman(
        coordAccess,
        "human-agent-1",
        async () => ({ accepted: false, connected: false }),
      );

      // Acceptance: CTI clear/bridge 不確定時保留 pending 而非宣稱已接通
      expect(unconfirmedBridge.success).toBe(false);
      expect(unconfirmedBridge.status).toBe("pending");
      expect(unconfirmedBridge.humanAccess).toBeNull();
      expect(coordinator.getBridgeState()).toBe("pending");

      // Successful bridge action transitions to bridged
      const confirmedBridge = await coordinator.bridgeToHuman(
        coordAccess,
        "human-agent-1",
        async () => ({ accepted: true, connected: true }),
      );
      expect(confirmedBridge.success).toBe(true);
      expect(confirmedBridge.status).toBe("bridged");
      expect(confirmedBridge.humanAccess).not.toBeNull();
      expect(coordinator.getBridgeState()).toBe("bridged");
    });

    it("maintains bridging pending in queue service when CTI transfer is initiated, until confirmed", async () => {
      const h = buildTestHarness();
      const mockProvider: VoiceCtiProviderAdapter = {
        providerName: "sandbox",
        isProductionCapable: false,
        verifyAndDecode: vi.fn(),
        requestTransfer: vi.fn(async () => ({
          accepted: true,
          providerTransferId: "transfer-123",
        })),
      };
      const ctiAdapter = new VoiceCtiAdapter({
        providers: [mockProvider],
        productionMode: false,
      });

      const init = await h.handoffService.initiateHandoff({
        voiceSessionId: VOICE_SESSION_ID,
        expectedSessionVersion: 1,
        expectedLeaseEpoch: 1,
        reason: "customer_requested",
      });

      const queueItem = init.queueItem;
      expect(queueItem.status).toBe("queued");

      // Agent is assigned
      h.handoffQueueService.assignAgent(queueItem.handoffId, "agent-007");
      expect(h.handoffQueueService.getHandoffItem(queueItem.handoffId)?.status).toBe("assigned");

      // Request CTI bridge: even when accepted, status must remain "bridging" (pending)
      await h.handoffQueueService.requestBridge(queueItem.handoffId, ctiAdapter, "sandbox");
      expect(h.handoffQueueService.getHandoffItem(queueItem.handoffId)?.status).toBe("bridging");

      // Only upon explicit confirmation does it become connected
      h.handoffQueueService.confirmBridge(queueItem.handoffId);
      expect(h.handoffQueueService.getHandoffItem(queueItem.handoffId)?.status).toBe("connected");
    });

    it("handles unanswered queue timeout (未接) properly", async () => {
      const h = buildTestHarness();
      const init = await h.handoffService.initiateHandoff({
        voiceSessionId: VOICE_SESSION_ID,
        expectedSessionVersion: 1,
        expectedLeaseEpoch: 1,
        reason: "customer_requested",
      });

      // Queue timeout occurs
      const unanswered = h.handoffQueueService.handleUnanswered(
        init.handoffId,
        "queue_wait_timeout_exceeded",
      );
      expect(unanswered.status).toBe("unanswered");
      expect(unanswered.lastError).toBe("queue_wait_timeout_exceeded");
    });

    it("handles post-bridge drop: closes session on caller drop, but redispatches on agent drop (接後掉線及重新分派)", async () => {
      const h = buildTestHarness();
      const init = await h.handoffService.initiateHandoff({
        voiceSessionId: VOICE_SESSION_ID,
        expectedSessionVersion: 1,
        expectedLeaseEpoch: 1,
        reason: "customer_requested",
      });

      // Complete handoff to human
      await h.handoffService.completeHandoffToHuman({
        voiceSessionId: VOICE_SESSION_ID,
        handoffId: init.handoffId,
        expectedSessionVersion: 2,
        expectedLeaseEpoch: 2,
        agentId: "agent-007",
      });

      expect(h.getSession().controlOwner).toBe("human");
      expect(h.getSession().leaseEpoch).toBe(3);
      expect(h.getSession().sessionVersion).toBe(3);
      expect(h.getSession().dialogState).toBe("human_controlled");

      // Case A: Agent drops (callee_hangup), but caller is still on the line
      const agentDropResult = await h.handoffService.handlePostBridgeDrop({
        voiceSessionId: VOICE_SESSION_ID,
        handoffId: init.handoffId,
        hangupReason: "callee_hangup",
        callerStillConnected: true,
        expectedSessionVersion: 3,
      });

      // Verify re-dispatch: control returns to coordinator with incremented leaseEpoch, queue item re-enqueued
      expect(agentDropResult.callerStillConnected).toBe(true);
      expect(agentDropResult.redispatched).toBe(true);
      expect(agentDropResult.sessionClosed).toBe(false);
      expect(agentDropResult.session?.controlOwner).toBe("coordinator");
      expect(agentDropResult.session?.leaseEpoch).toBe(4);
      expect(agentDropResult.session?.dialogState).toBe("handoff_pending");

      const requeuedItem = h.handoffQueueService.getHandoffItem(init.handoffId);
      expect(requeuedItem?.status).toBe("queued");
      expect(requeuedItem?.redispatchCount).toBe(1);
      expect(requeuedItem?.assignedAgentId).toBeNull();

      // Case B: Caller hangs up (caller_hangup)
      const callerDropResult = await h.handoffService.handlePostBridgeDrop({
        voiceSessionId: VOICE_SESSION_ID,
        handoffId: init.handoffId,
        hangupReason: "caller_hangup",
        callerStillConnected: false,
        expectedSessionVersion: 4,
      });

      // Session is closed
      expect(callerDropResult.callerStillConnected).toBe(false);
      expect(callerDropResult.redispatched).toBe(false);
      expect(callerDropResult.sessionClosed).toBe(true);
      expect(h.getSession().dialogState).toBe("closed");
      expect(h.getSession().mediaState).toBe("ended");
      expect(h.handoffQueueService.getHandoffItem(init.handoffId)?.status).toBe("caller_dropped");
    });
  });

  // --------------------------------------------------------------------------
  // Acceptance Evidence Key 3: unknown_operation_handoff_evidence
  // --------------------------------------------------------------------------
  describe("unknown_operation_handoff_evidence", () => {
    it("includes unknown receipt, draft, proof, real order, raw utterances, and candidates in handoff summary", async () => {
      const pendingCommand: VoiceCommandReceiptRecord = {
        commandId: "cmd-pending-123",
        intentId: "intent-123",
        brandId: "brand-a",
        callId: CALL_ID,
        action: "create_owned_order",
        payloadHash: "sha256-pending-hash",
        status: "pending",
        orderId: null,
        resultVersion: 1,
        errorCode: null,
        errorReason: null,
        createdAt: "2026-09-06T00:00:00.000Z",
        updatedAt: "2026-09-06T00:00:00.000Z",
      };

      const activeConfirmation: VoiceConfirmationRecord = {
        confirmationId: "conf-proof-456",
        voiceSessionId: VOICE_SESSION_ID,
        intentId: "intent-123",
        action: "create_owned_order",
        draftVersion: 2,
        snapshotHash: "sha256-snapshot-456",
        readbackPlaybackId: "rb-playback-1",
        readbackCompletedEventId: "rb-event-1",
        confirmationMethod: "speech",
        inputEpoch: 1,
        mediaEpoch: 1,
        controlSequence: 10,
        leaseEpoch: 1,
        recordingCheckpointId: "chk-1",
        evidence: null,
        state: "accepted",
        consumedCommandId: null,
        confirmedAt: "2026-09-06T00:01:00.000Z",
        expiresAt: "2026-09-06T00:03:00.000Z",
      };

      const h = buildTestHarness({
        pendingReceipts: [pendingCommand],
        activeConfirmation,
      });

      const init = await h.handoffService.initiateHandoff({
        voiceSessionId: VOICE_SESSION_ID,
        expectedSessionVersion: 1,
        expectedLeaseEpoch: 1,
        reason: "location_unresolved",
        draft: {
          draftVersion: 2,
          slots: { pickup: "台北市信義區松高路11號", dropoff: "台北車站" },
          validationErrors: ["address_disambiguation_failed_twice"],
        },
        rawUtterances: ["我要去松高路", "信義誠品那邊", "還是轉人工好了"],
        candidates: [
          {
            field: "pickup",
            rawText: "松高路",
            candidate: "台北市信義區松高路11號",
            candidates: ["台北市信義區松高路11號", "台北市信義區松高路12號"],
          },
        ],
        nextResponsibleParty: "queue:ops-disambiguation",
      });

      const summary: HandoffSummary = init.summary;

      // Acceptance: handoff 摘要包含 draft/proof/真實 order/unknown receipt、原話/候選及下一責任方
      expect(summary.unknownReceipt).toEqual({
        commandId: "cmd-pending-123",
        intentId: "intent-123",
        action: "create_owned_order",
        status: "pending",
        payloadHash: "sha256-pending-hash",
      });
      expect(summary.realOrder).toBeNull(); // Pending command has no orderId yet
      expect(summary.proof).toEqual({
        confirmationId: "conf-proof-456",
        snapshotHash: "sha256-snapshot-456",
        confirmedAt: "2026-09-06T00:01:00.000Z",
      });
      expect(summary.draft).toMatchObject({
        draftVersion: 2,
        slots: { pickup: "台北市信義區松高路11號", dropoff: "台北車站" },
        validationErrors: ["address_disambiguation_failed_twice"],
      });
      expect(summary.rawUtterances).toEqual([
        "我要去松高路",
        "信義誠品那邊",
        "還是轉人工好了",
      ]);
      expect(summary.candidates).toHaveLength(1);
      expect(summary.candidates[0]?.rawText).toBe("松高路");
      expect(summary.nextResponsibleParty).toBe("queue:ops-disambiguation");
      expect(summary.reason).toBe("location_unresolved");
    });

    it("coordinator cannot create booking order, but can query pending receipt for reconciliation", async () => {
      const pendingCommand: VoiceCommandReceiptRecord = {
        commandId: "cmd-unknown-789",
        intentId: "intent-1",
        brandId: "brand-a",
        callId: CALL_ID,
        action: "create_owned_order",
        payloadHash: "sha256-hash-789",
        status: "pending",
        orderId: null,
        resultVersion: 1,
        errorCode: null,
        errorReason: null,
      };

      const h = buildTestHarness({ pendingReceipts: [pendingCommand] });
      const init = await h.handoffService.initiateHandoff({
        voiceSessionId: VOICE_SESSION_ID,
        expectedSessionVersion: 1,
        expectedLeaseEpoch: 1,
        reason: "customer_requested",
      });

      // Coordinator capability scopes strictly forbid order_create_bound
      expect(init.coordinatorClaims.scopes).not.toContain("order_create_bound");

      // Verify coordinator query for reconciliation succeeds
      const receipt = await h.bookingRepository.findReceiptByActionKey(
        "brand-a",
        CALL_ID,
        "intent-1",
        "create_owned_order",
      );
      expect(receipt).toEqual(pendingCommand);
    });

    it("safely invalidates active confirmation when customer speaks during handoff, without creating an order", async () => {
      const activeConfirmation: VoiceConfirmationRecord = {
        confirmationId: "conf-to-invalidate",
        voiceSessionId: VOICE_SESSION_ID,
        intentId: "intent-1",
        action: "create_owned_order",
        draftVersion: 1,
        snapshotHash: "sha256-hash",
        readbackPlaybackId: "rb-1",
        readbackCompletedEventId: "evt-1",
        confirmationMethod: "speech",
        inputEpoch: 1,
        mediaEpoch: 1,
        controlSequence: 5,
        leaseEpoch: 1,
        recordingCheckpointId: "chk-1",
        evidence: null,
        state: "accepted",
        consumedCommandId: null,
        confirmedAt: "2026-09-06T00:00:00.000Z",
        expiresAt: "2026-09-06T00:02:00.000Z",
        createdAt: "2026-09-06T00:00:00.000Z",
        updatedAt: "2026-09-06T00:00:00.000Z",
      };

      const h = buildTestHarness({ activeConfirmation });

      // Handoff initiated
      await h.handoffService.initiateHandoff({
        voiceSessionId: VOICE_SESSION_ID,
        expectedSessionVersion: 1,
        expectedLeaseEpoch: 1,
        reason: "customer_requested",
      });

      expect(h.getSession().confirmationState).toBe("awaiting_answer");
      expect(h.getSession().inputEpoch).toBe(1);

      // Customer speaks during handoff: "我不要叫車了，我要改地點"
      const inputCmd: RecordHandoffInputCommand = {
        voiceSessionId: VOICE_SESSION_ID,
        expectedSessionVersion: 2,
        speechText: "我不要叫車了",
      };

      const inputResult = await h.handoffService.recordCustomerInputDuringHandoff(inputCmd);

      // Confirmation is invalidated, inputEpoch incremented, pendingInput is true
      expect(inputResult.invalidatedConfirmation).toBe(true);
      expect(inputResult.inputEpoch).toBe(2);
      expect(inputResult.session.confirmationState).toBe("invalidated");
      expect(inputResult.session.pendingInput).toBe(true);
      expect(h.sessionRepository.invalidateActiveConfirmationForSession).toHaveBeenCalledWith(
        VOICE_SESSION_ID,
      );

      // Coordinator does NOT create any order; commitStatus remains none
      expect(inputResult.session.commitStatus).toBe("none");
      expect(inputResult.session.controlOwner).toBe("coordinator");
    });
  });
});
