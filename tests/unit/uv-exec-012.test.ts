import { beforeEach, describe, expect, it } from "vitest";
import type {
  VoiceCapabilityTokenClaims,
  VoiceProof,
} from "@drts/contracts";

import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import {
  resolveVoiceDialogueConfig,
} from "../../apps/api/src/common/llm-gateway/voice-dialogue-profile";
import {
  VoiceToolGatewayService,
  VOICE_ALLOWED_TOOLS,
} from "../../apps/api/src/modules/voice-booking/voice-tool-gateway.service";
import type {
  VoiceBookingRepository,
  VoiceIntentRecord,
  VoiceResourceScopeRecord,
  VoiceSessionRecord,
} from "../../apps/api/src/modules/voice-booking/voice-booking.repository";
import {
  VoiceDialogueError,
  VoiceDialogueProvider,
} from "../../apps/voice-media-worker/src/dialogue/voice-dialogue-provider";
import {
  groupHouseNumber,
  groupPhoneNumber,
  groupPickupTime,
  repairHouseNumber,
  repairPhoneNumber,
  repairPickupTime,
} from "../../apps/voice-media-worker/src/dialogue/number-grouping";
import {
  classifyDialogueIntent,
  isNonBookingHandoffIntent,
} from "../../apps/voice-media-worker/src/dialogue/intent-router";
import { SlotRepairManager } from "../../apps/voice-media-worker/src/dialogue/slot-repair";

const VOICE_SESSION_ID = "11111111-1111-4111-8111-111111111111";
const RESOURCE_SCOPE_ID = "22222222-2222-4222-8222-222222222222";
const INTENT_ID = "33333333-3333-4333-8333-333333333333";
const CONFIRMATION_ID = "44444444-4444-4444-8444-444444444444";

function makeClaims(
  overrides: Partial<VoiceCapabilityTokenClaims> = {},
): VoiceCapabilityTokenClaims {
  return {
    iss: "drts_voice_capability_issuer",
    aud: "voice-tool-gateway",
    exp: Math.floor(Date.now() / 1000) + 120,
    servicePrincipalId: "principal-voice-worker-1",
    voiceSessionId: VOICE_SESSION_ID,
    resourceScopeId: RESOURCE_SCOPE_ID,
    routeProfileVersion: 1,
    leaseEpoch: 1,
    scopes: [
      "session_execute",
      "address_resolve",
      "order_create_bound",
      "order_read_bound",
      "handoff_request",
    ],
    ...overrides,
  };
}

async function expectApiRequestError(
  action: () => Promise<unknown>,
  expectedStatus: number,
  expectedCode: string,
) {
  try {
    await action();
    throw new Error("Expected ApiRequestError to be thrown");
  } catch (error) {
    expect(error).toBeInstanceOf(ApiRequestError);
    const apiErr = error as ApiRequestError;
    expect(apiErr.getStatus()).toBe(expectedStatus);
    expect(apiErr.code).toBe(expectedCode);
  }
}

function makeSessionRecord(
  overrides: Partial<VoiceSessionRecord> = {},
): VoiceSessionRecord {
  return {
    voiceSessionId: VOICE_SESSION_ID,
    callId: "call-1",
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
    confirmationState: "absent",
    outcome: null,
    inputEpoch: 1,
    pendingInput: false,
    lastResolvedInputEpoch: 1,
    lastAppliedControlSequence: 10,
    createdAt: "2026-09-08T10:00:00.000Z",
    updatedAt: "2026-09-08T10:00:00.000Z",
    ...overrides,
  };
}

class FakeVoiceBookingRepository {
  session: VoiceSessionRecord | null = makeSessionRecord();
  intent: VoiceIntentRecord | null = {
    intentId: INTENT_ID,
    voiceSessionId: VOICE_SESSION_ID,
    action: "create_owned_order",
    currentDraftVersion: 1,
    boundOrderId: "00000000-0000-4000-8000-000000000001",
    status: "active",
    createdAt: "2026-09-08T10:00:00.000Z",
    updatedAt: "2026-09-08T10:00:00.000Z",
  };
  resourceScope: VoiceResourceScopeRecord | null = {
    scopeId: RESOURCE_SCOPE_ID,
    brandId: "brand-taxi-tw",
    operatingUnitId: null,
    runtimeMapping: {},
    grantedBy: "admin",
    status: "active",
    version: 1,
  };

  async findSessionById(id: string): Promise<VoiceSessionRecord | null> {
    if (this.session && this.session.voiceSessionId === id) return this.session;
    return null;
  }

  async findActiveCreateIntent(sessionId: string): Promise<VoiceIntentRecord | null> {
    if (this.intent && this.intent.voiceSessionId === sessionId) return this.intent;
    return null;
  }

  async findResourceScopeById(id: string): Promise<VoiceResourceScopeRecord | null> {
    if (this.resourceScope && this.resourceScope.scopeId === id) return this.resourceScope;
    return null;
  }
}

describe("UV-EXEC-012: 受約束對話引擎、欄位修復及工具閘道", () => {
  // =========================================================================
  // Gate 1: structured_provider_contract_evidence
  // =========================================================================
  describe("structured_provider_contract_evidence", () => {
    it("enforces request deadline / timeout with AbortSignal", async () => {
      const provider = new VoiceDialogueProvider({ timeoutMs: 50 });

      // Case 1: Caller signal already aborted
      const preAbortedController = new AbortController();
      preAbortedController.abort();
      await expect(
        provider.processTurn(
          {
            sessionId: VOICE_SESSION_ID,
            turnId: "turn-1",
            inputEpoch: 1,
            leaseEpoch: 1,
            customerUtterance: "我要叫車去台北車站",
          },
          preAbortedController.signal,
        ),
      ).rejects.toThrow(VoiceDialogueError);

      // Case 2: Slow tool execution exceeding deadline
      const slowProvider = new VoiceDialogueProvider({
        timeoutMs: 30,
        toolExecutor: async () => {
          await new Promise((resolve) => setTimeout(resolve, 80));
          return { candidates: [] };
        },
      });

      await expect(
        slowProvider.processTurn({
          sessionId: VOICE_SESSION_ID,
          turnId: "turn-2",
          inputEpoch: 1,
          leaseEpoch: 1,
          customerUtterance: "我要去台北車站",
        }),
      ).rejects.toThrow(/timed out/i);
    });

    it("enforces tool loop budget per turn", async () => {
      let callCount = 0;
      const limitedProvider = new VoiceDialogueProvider({
        maxToolIterationsPerTurn: 2,
        toolExecutor: async () => {
          callCount++;
          return { candidates: [] };
        },
      });

      const res = await limitedProvider.processTurn({
        sessionId: VOICE_SESSION_ID,
        turnId: "turn-3",
        inputEpoch: 1,
        leaseEpoch: 1,
        customerUtterance: "我要去台北車站",
      });

      expect(callCount).toBeLessThanOrEqual(2);
      expect(res.terminalState).toBeDefined();
    });

    it("rejects synthetic / mock gateway in production mode", async () => {
      // Production gate: SD §3.5: "正式 voice profile 禁用 mock，production 不使用 synthetic gateway 回覆冒充完成"
      const prodProvider = new VoiceDialogueProvider({
        isProduction: true,
        providerType: "mock",
      });

      await expect(
        prodProvider.processTurn({
          sessionId: VOICE_SESSION_ID,
          turnId: "turn-4",
          inputEpoch: 1,
          leaseEpoch: 1,
          customerUtterance: "我要叫車",
        }),
      ).rejects.toThrow(/production 不使用 synthetic gateway 回覆冒充完成/i);

      // Also verify config resolver fails closed in production for mock
      expect(() =>
        resolveVoiceDialogueConfig({
          env: {
            NODE_ENV: "production",
            VOICE_LLM_PROVIDER: "mock",
          },
        }),
      ).toThrow(/Production voice profile strictly forbids mock/i);
    });

    it("attaches verified inputEpoch and leaseEpoch to turn output", async () => {
      const provider = new VoiceDialogueProvider({ isProduction: false });
      const output = await provider.processTurn({
        sessionId: VOICE_SESSION_ID,
        turnId: "turn-5",
        inputEpoch: 7,
        leaseEpoch: 3,
        customerUtterance: "請問司機到了嗎",
      });

      expect(output.epoch.inputEpoch).toBe(7);
      expect(output.epoch.leaseEpoch).toBe(3);
      expect(output.intent).toBe("query_booking");
      expect(output.toolProposals[0]?.toolName).toBe("get_bound_booking_status");
    });
  });

  // =========================================================================
  // Gate 2: intent_repair_scenarios
  // =========================================================================
  describe("intent_repair_scenarios", () => {
    describe("Non-booking safety & handoff routing (Acceptance §3)", () => {
      it("stops promoting booking immediately on emergency / safety intent", async () => {
        const provider = new VoiceDialogueProvider({ isProduction: false });
        const res = await provider.processTurn({
          sessionId: VOICE_SESSION_ID,
          turnId: "turn-emergency",
          inputEpoch: 1,
          leaseEpoch: 1,
          customerUtterance: "發生車禍了！請救命！",
        });

        expect(res.intent).toBe("emergency");
        expect(res.terminalState).toBe("handoff");
        expect(res.handoffReason).toBe("urgent_safety");
        expect(res.toolProposals[0]?.toolName).toBe("request_handoff");
        expect(res.toolProposals[0]?.parameters["reasonCode"]).toBe("urgent_safety");
        // Must NOT pitch ride or ask for booking slots
        expect(res.text).toContain("通報緊急協助專線");
        expect(res.text).not.toContain("請問您要從哪裡出發");
        expect(res.text).not.toContain("目的地是哪裡");
      });

      it("stops promoting booking immediately on complaint intent", async () => {
        const provider = new VoiceDialogueProvider({ isProduction: false });
        const res = await provider.processTurn({
          sessionId: VOICE_SESSION_ID,
          turnId: "turn-complaint",
          inputEpoch: 1,
          leaseEpoch: 1,
          customerUtterance: "司機態度很差，還故意繞路，我要投訴！",
        });

        expect(res.intent).toBe("complaint");
        expect(res.terminalState).toBe("handoff");
        expect(res.handoffReason).toBe("complaint");
        expect(res.toolProposals[0]?.toolName).toBe("request_handoff");
        expect(res.toolProposals[0]?.parameters["reasonCode"]).toBe("complaint");
        expect(res.text).toContain("客訴處理專員");
        expect(res.text).not.toContain("請問您要從哪裡出發");
      });

      it("stops promoting booking immediately on lost-and-found intent", async () => {
        const provider = new VoiceDialogueProvider({ isProduction: false });
        const res = await provider.processTurn({
          sessionId: VOICE_SESSION_ID,
          turnId: "turn-lost",
          inputEpoch: 1,
          leaseEpoch: 1,
          customerUtterance: "我的錢包好像掉在車上了，可以幫我協尋嗎？",
        });

        expect(res.intent).toBe("lost_and_found");
        expect(res.terminalState).toBe("handoff");
        expect(res.handoffReason).toBe("lost_and_found");
        expect(res.toolProposals[0]?.toolName).toBe("request_handoff");
        expect(res.toolProposals[0]?.parameters["reasonCode"]).toBe("lost_and_found");
        expect(res.text).toContain("遺失物協尋");
        expect(res.text).not.toContain("請問您要從哪裡出發");
      });

      it("stops promoting booking immediately when customer explicitly asks for human agent", async () => {
        const provider = new VoiceDialogueProvider({ isProduction: false });
        const res = await provider.processTurn({
          sessionId: VOICE_SESSION_ID,
          turnId: "turn-human",
          inputEpoch: 1,
          leaseEpoch: 1,
          customerUtterance: "我要找真人客服專員，不要跟機器人講話",
        });

        expect(res.intent).toBe("request_human");
        expect(res.terminalState).toBe("handoff");
        expect(res.handoffReason).toBe("customer_requested");
        expect(res.toolProposals[0]?.toolName).toBe("request_handoff");
        expect(res.toolProposals[0]?.parameters["reasonCode"]).toBe("customer_requested");
        expect(res.text).toContain("真人客服專員");
      });
    });

    describe("Digit grouping and slot correction (Acceptance §2)", () => {
      it("groups telephone numbers into 4-3-3 and performs partial correction", () => {
        // Initial phone collection:
        const initial = groupPhoneNumber("0912345678");
        expect(initial.isValid).toBe(true);
        expect(initial.groups).toEqual(["0912", "345", "678"]);
        expect(initial.spokenReadback).toBe("0912、345、678");

        // Chinese spoken input:
        const chineseUtterance = groupPhoneNumber("零九一二三四五六七八");
        expect(chineseUtterance.normalized).toBe("0912345678");
        expect(chineseUtterance.groups).toEqual(["0912", "345", "678"]);

        // Suffix correction ("不對，後面三碼是 789"):
        const repairedSuffix = repairPhoneNumber(initial, "不對，後面三碼是 789");
        expect(repairedSuffix.isCorrected).toBe(true);
        expect(repairedSuffix.repaired.normalized).toBe("0912345789");
        expect(repairedSuffix.repaired.spokenReadback).toBe("0912、345、789");

        // Middle group correction ("中間是 888 不是 345"):
        const repairedMiddle = repairPhoneNumber(initial, "中間是 888");
        expect(repairedMiddle.isCorrected).toBe(true);
        expect(repairedMiddle.repaired.normalized).toBe("0912888678");
      });

      it("groups house/door numbers digit-by-digit and handles corrections", () => {
        // House number grouping avoids hundred confusion:
        const initial = groupHouseNumber("105號");
        expect(initial.normalized).toBe("105號");
        expect(initial.spokenReadback).toBe("1 0 5 號");

        // Correction: "不是 105 號，是 150 號"
        const repaired = repairHouseNumber(initial, "不是 105 號，是 150 號");
        expect(repaired.isCorrected).toBe(true);
        expect(repaired.repaired.normalized).toBe("150號");
        expect(repaired.repaired.spokenReadback).toBe("1 5 0 號");
      });

      it("groups pickup time and handles corrections", () => {
        const initial = groupPickupTime("14:30");
        expect(initial.normalized).toBe("14:30");
        expect(initial.spokenReadback).toBe("下午 2 點 半");

        // Correction: "改下午三點"
        const repaired = repairPickupTime(initial, "改下午三點");
        expect(repaired.isCorrected).toBe(true);
        expect(repaired.repaired.normalized).toBe("15:30");
        expect(repaired.repaired.spokenReadback).toBe("下午 3 點 半");
      });

      it("validates direct intent classification and slot manager behaviors", () => {
        expect(isNonBookingHandoffIntent("emergency")).toBe(true);
        expect(isNonBookingHandoffIntent("create_booking")).toBe(false);
        const classified = classifyDialogueIntent("司機態度很差要投訴");
        expect(classified.intent).toBe("complaint");
        expect(classified.shouldHaltBooking).toBe(true);

        const slotMgr = new SlotRepairManager();
        const slot = slotMgr.updatePhoneNumber("0912345678", "turn-1");
        expect(slot.validationState).toBe("valid");
        expect(slot.groupedReadbackText).toBe("0912、345、678");
      });
    });

    describe("Two-round address repair with verbatim utterance & candidate preservation (Acceptance §2)", () => {
      it("retains all verbatim utterances and candidates upon 2-round resolution failure", async () => {
        const ambiguousCandidates = [
          {
            candidateId: "cand-1",
            displayName: "桃園區大勇街",
            address: "桃園市桃園區大勇街",
            area: "桃園區",
          },
          {
            candidateId: "cand-2",
            displayName: "八德區大勇街",
            address: "桃園市八德區大勇街",
            area: "八德區",
          },
        ];

        let attempt = 0;
        const provider = new VoiceDialogueProvider({
          isProduction: false,
          toolExecutor: async () => {
            attempt++;
            // Both attempts return ambiguous candidates
            return { candidates: ambiguousCandidates };
          },
        });

        // Round 1: ambiguous address
        const round1 = await provider.processTurn({
          sessionId: VOICE_SESSION_ID,
          turnId: "turn-r1",
          inputEpoch: 1,
          leaseEpoch: 1,
          customerUtterance: "我要去大勇街",
        });

        expect(round1.terminalState).toBe("continue");
        expect(round1.repairState?.failedAttempts).toBe(1);
        expect(round1.repairState?.rawUtterances).toEqual(["我要去大勇街"]);
        expect(round1.text).toContain("桃園區大勇街");
        expect(round1.text).toContain("八德區大勇街");

        // Round 2: clarification utterance still ambiguous -> fails closed to handoff!
        const round2 = await provider.processTurn({
          sessionId: VOICE_SESSION_ID,
          turnId: "turn-r2",
          inputEpoch: 2,
          leaseEpoch: 1,
          customerUtterance: "在大公園旁邊那間大勇街",
          existingSlots: round1.slots,
          repairState: round1.repairState,
        });

        expect(attempt).toBe(2);
        expect(round2.terminalState).toBe("handoff");
        expect(round2.handoffReason).toBe("location_unresolved");
        expect(round2.handoffSummary).toBeDefined();

        // Check preserved verbatim inputs and candidate evidence
        const evidence = round2.handoffSummary?.addressRepairEvidence;
        expect(evidence?.failedAttempts).toBe(2);
        expect(evidence?.rawUtterances).toEqual([
          "我要去大勇街",
          "在大公園旁邊那間大勇街",
        ]);
        expect(evidence?.candidates).toHaveLength(2);
        expect(evidence?.candidates[0]?.displayName).toBe("桃園區大勇街");
        expect(evidence?.candidates[1]?.displayName).toBe("八德區大勇街");

        // Verification: LLM cannot fabricate coordinates on failed resolution
        expect(round2.slots["pickupAddress"]?.normalizedValue).toBeNull();
      });
    });
  });

  // =========================================================================
  // Gate 3: tool_authorization_negative_evidence
  // =========================================================================
  describe("tool_authorization_negative_evidence", () => {
    let repo: FakeVoiceBookingRepository;
    let gateway: VoiceToolGatewayService;

    beforeEach(() => {
      repo = new FakeVoiceBookingRepository();
      gateway = new VoiceToolGatewayService(repo as unknown as VoiceBookingRepository);
    });

    describe("Tool allowlist enforcement (SD §6.3)", () => {
      it("rejects non-allowlisted tools", async () => {
        expect(VOICE_ALLOWED_TOOLS).toContain("resolve_location");
        expect(VOICE_ALLOWED_TOOLS).toContain("commit_confirmed_booking");
        const forbiddenTools = [
          "execute_http",
          "execute_sql",
          "run_shell",
          "fetch_url",
          "select_driver",
          "assign_driver",
          "override_price",
          "arbitrary_mutation",
        ];

        for (const tool of forbiddenTools) {
          await expectApiRequestError(
            () =>
              gateway.executeTool({
                toolName: tool,
                parameters: {},
                claims: makeClaims(),
              }),
            403,
            "VOICE_UNSUPPORTED_ACTION",
          );
        }
      });
    });

    describe("Parameter negative checks (Acceptance §1: LLM 不能選 driver、自造價格/座標或任意 mutation)", () => {
      it("rejects attempts to inject driver selection in tool parameters", async () => {
        await expectApiRequestError(
          () =>
            gateway.executeTool({
              toolName: "check_booking_eligibility",
              parameters: {
                driverId: "drv-fraud-007",
              },
              claims: makeClaims(),
            }),
          403,
          "VOICE_UNAUTHORIZED_SCOPE",
        );

        await expectApiRequestError(
          () =>
            gateway.executeTool({
              toolName: "prepare_booking_readback",
              parameters: {
                intentId: INTENT_ID,
                draftVersion: 1,
                pickupAddress: "台北車站",
                passengerPhone: "0912345678",
                passengerCount: 1,
                selectedDriver: "preferred-driver-99",
              },
              claims: makeClaims(),
            }),
          403,
          "VOICE_UNAUTHORIZED_SCOPE",
        );
      });

      it("rejects attempts to invent or override fares/prices", async () => {
        await expectApiRequestError(
          () =>
            gateway.executeTool({
              toolName: "prepare_booking_readback",
              parameters: {
                intentId: INTENT_ID,
                draftVersion: 1,
                pickupAddress: "台北車站",
                passengerPhone: "0912345678",
                passengerCount: 1,
                price: 150,
              },
              claims: makeClaims(),
            }),
          403,
          "VOICE_UNAUTHORIZED_SCOPE",
        );
      });

      it("rejects attempts to inject arbitrary SQL mutations", async () => {
        await expectApiRequestError(
          () =>
            gateway.executeTool({
              toolName: "prepare_booking_readback",
              parameters: {
                sql: "UPDATE dispatch.orders SET status = 'completed'",
              },
              claims: makeClaims(),
            }),
          403,
          "VOICE_UNAUTHORIZED_SCOPE",
        );
      });
    });

    describe("Capability scope fencing", () => {
      it("rejects tools when capability lacks required scope", async () => {
        // Capability with ONLY address_resolve scope
        const readOnlyClaims = makeClaims({
          scopes: ["address_resolve"],
        });

        // Calling prepare_booking_readback requires order_create_bound
        await expectApiRequestError(
          () =>
            gateway.executeTool({
              toolName: "prepare_booking_readback",
              parameters: {
                intentId: INTENT_ID,
                draftVersion: 1,
                pickupAddress: "台北車站",
                passengerPhone: "0912345678",
                passengerCount: 1,
              },
              claims: readOnlyClaims,
            }),
          403,
          "VOICE_UNAUTHORIZED_SCOPE",
        );

        // Calling commit_confirmed_booking requires order_create_bound
        await expectApiRequestError(
          () =>
            gateway.executeTool({
              toolName: "commit_confirmed_booking",
              parameters: {
                intentId: INTENT_ID,
                confirmationId: CONFIRMATION_ID,
                draftVersion: 1,
                proof: {},
              },
              claims: readOnlyClaims,
            }),
          403,
          "VOICE_UNAUTHORIZED_SCOPE",
        );

        // Calling request_handoff requires handoff_request
        await expectApiRequestError(
          () =>
            gateway.executeTool({
              toolName: "request_handoff",
              parameters: {
                reasonCode: "customer_requested",
              },
              claims: readOnlyClaims,
            }),
          403,
          "VOICE_UNAUTHORIZED_SCOPE",
        );
      });
    });

    describe("Lease epoch, session, and resource scope fencing", () => {
      it("rejects capability with stale leaseEpoch", async () => {
        // Session has advanced to leaseEpoch 2
        repo.session = makeSessionRecord({ leaseEpoch: 2 });

        // Capability token is still at leaseEpoch 1
        const staleClaims = makeClaims({ leaseEpoch: 1 });

        await expectApiRequestError(
          () =>
            gateway.executeTool({
              toolName: "resolve_location",
              parameters: { query: "台北車站" },
              claims: staleClaims,
            }),
          403,
          "VOICE_SESSION_NOT_OWNER",
        );
      });

      it("rejects capability minted for a different resourceScopeId", async () => {
        const mismatchScopeClaims = makeClaims({
          resourceScopeId: "99999999-9999-4999-8999-999999999999",
        });

        await expectApiRequestError(
          () =>
            gateway.executeTool({
              toolName: "resolve_location",
              parameters: { query: "台北車站" },
              claims: mismatchScopeClaims,
            }),
          403,
          "VOICE_SCOPE_DENIED",
        );
      });
    });

    describe("Allowed tool execution and proof validation", () => {
      it("executes resolve_location and returns capped candidates without passenger leakage", async () => {
        const result = (await gateway.executeTool({
          toolName: "resolve_location",
          parameters: { query: "台北車站" },
          claims: makeClaims(),
        })) as { candidates: Array<{ displayName: string }> };

        expect(result.candidates).toBeDefined();
        expect(result.candidates.length).toBeLessThanOrEqual(3);
        expect(result.candidates[0]?.displayName).toContain("台北車站");
      });

      it("validates proof structure and expiration in commit_confirmed_booking", async () => {
        // Case 1: Malformed proof fails Zod validation
        await expectApiRequestError(
          () =>
            gateway.executeTool({
              toolName: "commit_confirmed_booking",
              parameters: {
                intentId: INTENT_ID,
                confirmationId: CONFIRMATION_ID,
                draftVersion: 1,
                proof: { bad: "data" },
              },
              claims: makeClaims(),
            }),
          400,
          "VOICE_INVALID_PROOF",
        );

        // Case 2: Expired proof
        const expiredProof: VoiceProof = {
          confirmationId: CONFIRMATION_ID,
          voiceSessionId: VOICE_SESSION_ID,
          intentId: INTENT_ID,
          action: "create_owned_immediate_order",
          draftVersion: 1,
          snapshotHash: "hash-123",
          readbackPlaybackId: "00000000-0000-4000-8000-000000000001",
          readbackCompletedEventId: "00000000-0000-4000-8000-000000000002",
          inputEpoch: 1,
          controlCutoff: { mediaEpoch: 1, controlSequence: 10 },
          leaseEpoch: 1,
          recordingCheckpointId: "00000000-0000-4000-8000-000000000003",
          confirmedAt: "2026-09-08T10:00:00.000Z",
          expiresAt: "2026-09-08T10:02:00.000Z", // In the past
          confirmationMethod: "speech",
          evidence: {
            turnId: "00000000-0000-4000-8000-000000000004",
            finalEventId: "00000000-0000-4000-8000-000000000005",
          },
        };

        await expectApiRequestError(
          () =>
            gateway.executeTool({
              toolName: "commit_confirmed_booking",
              parameters: {
                intentId: INTENT_ID,
                confirmationId: CONFIRMATION_ID,
                draftVersion: 1,
                proof: expiredProof,
              },
              claims: makeClaims(),
            }),
          409,
          "VOICE_CONFIRMATION_EXPIRED",
        );
      });
    });
  });
});
