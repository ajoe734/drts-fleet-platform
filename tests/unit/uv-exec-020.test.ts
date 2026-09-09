import { describe, expect, it, vi } from "vitest";
import type {
  OwnedOrderRecord,
  VoiceCapabilityTokenClaims,
  VoiceDialogueOutput,
} from "@drts/contracts";

import {
  VoiceOperationPolicyService,
  type OrderQueryPolicyRequest,
  type ActiveOrderCheckRequest,
  type MultiVehiclePolicyRequest,
  type CancelEligibilityRequest,
  type ExecuteCancelCommand,
} from "../../apps/api/src/modules/voice-booking/voice-operation-policy.service";
import {
  VoiceCapabilityRegistry,
  VoiceIntentRouter,
  IntentRoutingGuard,
} from "../../apps/voice-media-worker/src/dialogue/intent-routing";
import { VoiceToolGatewayService } from "../../apps/api/src/modules/voice-booking/voice-tool-gateway.service";
import type { VoiceCapabilityGuard } from "../../apps/api/src/common/auth/voice-capability.guard";
import type { VoiceBookingRepository } from "../../apps/api/src/modules/voice-booking/voice-booking.repository";
import type { VoiceBookingAuthorizationService } from "../../apps/api/src/modules/voice-booking/voice-booking-authorization.service";
import { OwnedMobilityRepository } from "../../apps/api/src/modules/owned-mobility/owned-mobility.repository";
import { ApiRequestError } from "../../apps/api/src/common/api-envelope";

// --- Test Fixtures & Helpers ---

const SESSION_ID = "33333333-3333-4333-8333-333333333333";
const SCOPE_ID = "44444444-4444-4444-8444-444444444444";
const CALL_ID = "call-020-test";
const ORDER_ID = "order-020-owned";

function createMockOrder(overrides: Partial<OwnedOrderRecord> = {}): OwnedOrderRecord {
  return {
    orderId: ORDER_ID,
    orderNo: "TPE-20260909-001",
    orderSource: "phone",
    orderDomain: "owned",
    tenantId: "tenant-1",
    partnerId: null,
    partnerProgramId: null,
    partnerEntrySlug: null,
    eligibilityVerificationId: null,
    issuerAuthorizationRef: null,
    passengerDisclosure: null,
    serviceBucket: "standard_taxi",
    dispatchSemantics: "realtime",
    businessDispatchSubtype: null,
    serviceProductCode: "taxi_realtime",
    status: "driver_accepted",
    pickup: {
      address: "台北市信義區市府路1號",
      lat: 25.0375,
      lng: 121.5637,
    },
    dropoff: {
      address: "台北市中正區忠孝西路一段49號",
      lat: 25.0463,
      lng: 121.5171,
    },
    passenger: {
      name: "張小明",
      phone: "0912345678",
    },
    bookingRequirements: {
      passengerCount: 2,
      luggageCount: 1,
      luggageSize: "standard",
      requiredCapabilities: [],
      bookerContact: { name: "張小明", phone: "0912345678" },
      passengerContact: { name: "張小明", phone: "0912345678" },
      driverContactRole: "passenger",
      policyVersion: "v1",
      validationReference: "val-ref-020",
    },
    bookingId: null,
    bookingType: "instant",
    etaSnapshot: {
      etaMinutes: 6,
      generatedAt: "2026-09-09T12:00:00.000Z",
    },
    callId: CALL_ID,
    voiceIntentId: "intent-020",
    aggregateVersion: 1,
    ...overrides,
  };
}

function buildServiceHarness(options: {
  boundOrderId?: string | null;
  sessionRecord?: Record<string, unknown>;
  initialOrders?: OwnedOrderRecord[];
  capabilityConfig?: Partial<Record<string, "enabled" | "disabled" | "conditional">>;
  ownedMobilityRepository?: any;
  confirmations?: Map<string, any>;
} = {}) {
  const boundId = options.boundOrderId !== undefined ? options.boundOrderId : ORDER_ID;
  const session = {
    voiceSessionId: SESSION_ID,
    resourceScopeId: SCOPE_ID,
    callId: CALL_ID,
    leaseEpoch: 1,
    routeProfileVersion: 1,
    dialogState: "collecting",
    controlOwner: "ai",
    inputEpoch: 1,
    sessionVersion: 1,
    ...(options.sessionRecord ?? {}),
  };

  const repository = {
    findSessionById: vi.fn(async (id: string) =>
      id === SESSION_ID ? (session as never) : null,
    ),
    findResourceScopeById: vi.fn(async (id: string) =>
      id === SCOPE_ID ? ({ scopeId: SCOPE_ID, status: "active", version: 1 } as never) : null,
    ),
    findActiveCreateIntent: vi.fn(async () => ({
      voiceSessionId: SESSION_ID,
      boundOrderId: boundId,
    })),
    findConfirmationById: vi.fn(async (id: string) =>
      options.confirmations?.get(id) ?? null,
    ),
  };

  const authorization = {
    resolveBoundOrderId: vi.fn(async (sessionId: string, scopeId: string) => {
      if (sessionId === SESSION_ID && scopeId === SCOPE_ID && boundId) {
        return boundId;
      }
      return null;
    }),
    getBoundBookingStatus: vi.fn(async () =>
      boundId ? { orderId: boundId } : null,
    ),
  };

  const service = new VoiceOperationPolicyService(
    repository as unknown as VoiceBookingRepository,
    authorization as unknown as VoiceBookingAuthorizationService,
    options.ownedMobilityRepository,
    undefined,
    options.capabilityConfig ? { capabilities: options.capabilityConfig as never } : undefined,
  );

  if (options.initialOrders) {
    for (const order of options.initialOrders) {
      service.registerMockOrder(order);
    }
  } else {
    service.registerMockOrder(createMockOrder());
  }

  return { service, repository, authorization, session };
}

function buildDialogueOutput(
  intent: VoiceDialogueOutput["intent"],
  overrides: Partial<VoiceDialogueOutput> = {},
): VoiceDialogueOutput {
  return {
    intent,
    text: "對話測試訊息",
    slots: [],
    tools: [],
    usage: { inputTokens: 10, outputTokens: 20 },
    terminal: "turn_complete",
    ...overrides,
  };
}

// --- Acceptance Test Suites ---

describe("UV-EXEC-020: 查單、重複來電及條件能力安全分流", () => {
  // =========================================================================
  // 1. capability_disabled_negative_matrix
  // Acceptance: 關閉 cancel/amend/reservation 時工具層拒絕 mutation，對話不假報完成或改成普通即時單。
  // =========================================================================
  describe("capability_disabled_negative_matrix", () => {
    it("rejects cancel mutation when order_cancel capability is disabled, routes to handoff and does NOT claim cancelled", async () => {
      const h = buildServiceHarness();
      expect(h.service.isDisabled("order_cancel")).toBe(true);

      // 1. API Policy Service check
      const cancelElig = await h.service.evaluateCancelEligibility({
        voiceSessionId: SESSION_ID,
        resourceScopeId: SCOPE_ID,
        orderId: ORDER_ID,
      });
      expect(cancelElig.permitted).toBe(false);
      expect(cancelElig.reason).toBe("capability_disabled");
      expect(cancelElig.action).toBe("handoff");
      expect(cancelElig.messageZh).toContain("未開通");

      // 2. Worker Intent Router check
      const router = new VoiceIntentRouter();
      const output = buildDialogueOutput("cancel");
      const routed = router.route(output);

      expect(routed.diverted).toBe(true);
      expect(routed.terminal).toBe("handoff");
      expect(routed.handoffReason).toBe("service_unsupported");
      expect(routed.tools).toEqual([
        { name: "request_handoff", args: { reason: "service_unsupported" } },
      ]);
      // Must NOT claim cancelled
      expect(routed.promptZh).toContain("尚未開通");
      expect(routed.promptZh).not.toContain("已為您取消");

      // 3. Tool Gateway Fencing
      expect(() => h.service.assertCapabilityEnabled("order_cancel")).toThrow(
        ApiRequestError,
      );
    });

    it("rejects amend mutation when order_amend capability is disabled, routes to handoff and does NOT create replacement order", async () => {
      const h = buildServiceHarness();
      expect(h.service.isDisabled("order_amend")).toBe(true);

      const router = new VoiceIntentRouter();
      const output = buildDialogueOutput("amend");
      const routed = router.route(output);

      expect(routed.diverted).toBe(true);
      expect(routed.terminal).toBe("handoff");
      expect(routed.handoffReason).toBe("service_unsupported");
      expect(routed.tools).toEqual([
        { name: "request_handoff", args: { reason: "service_unsupported" } },
      ]);
      expect(routed.promptZh).toContain("尚未開通語音改單");
      expect(routed.promptZh).not.toContain("已完成改單");

      expect(() => h.service.assertCapabilityEnabled("order_amend")).toThrow(
        ApiRequestError,
      );
    });

    it("rejects reservation mutation when order_reservation is disabled, reads back Taipei time and does NOT convert to immediate booking", async () => {
      const h = buildServiceHarness();
      expect(h.service.isDisabled("order_reservation")).toBe(true);

      const router = new VoiceIntentRouter();
      const scheduledTimeIsoUtc = "2026-09-10T07:00:00.000Z"; // 15:00 in Taipei
      const output = buildDialogueOutput("reservation");
      const routed = router.route(output, {
        scheduledTimeIsoUtc,
      });

      expect(routed.diverted).toBe(true);
      expect(routed.divertReason).toBe("reservation_not_enabled");
      expect(routed.terminal).toBe("handoff");
      expect(routed.handoffReason).toBe("service_unsupported");
      // Readback contains Taipei time format and refusal to create immediate booking
      expect(routed.promptZh).toContain("2 0 2 6 年 0 9 月 1 0 日 1 5 點 0 0 分");
      expect(routed.promptZh).toContain("不會為您建立即時單");

      // Draft/tool gateway level assertion: throws VOICE_RESERVATION_NOT_ENABLED
      try {
        h.service.assertCapabilityEnabled("order_reservation");
        expect.unreachable();
      } catch (err) {
        expect(err).toBeInstanceOf(ApiRequestError);
        expect((err as ApiRequestError).code).toBe(
          "VOICE_RESERVATION_NOT_ENABLED",
        );
      }
    });

    it("rejects multi-vehicle requests in a single call, does NOT place automated single or duplicate bookings, and routes to handoff", () => {
      const h = buildServiceHarness();
      expect(h.service.isDisabled("multi_vehicle")).toBe(true);

      // Policy service check: vehicleCount > 1
      const policyRes1 = h.service.evaluateMultiVehiclePolicy({
        vehicleCount: 2,
      });
      expect(policyRes1.supported).toBe(false);
      expect(policyRes1.action).toBe("handoff");
      expect(policyRes1.reason).toBe("service_unsupported");

      // Policy service check: passengerCount > 4 (requiring multiple cars)
      const policyRes2 = h.service.evaluateMultiVehiclePolicy({
        passengerCount: 6,
      });
      expect(policyRes2.supported).toBe(false);
      expect(policyRes2.action).toBe("handoff");

      // Worker Router check
      const router = new VoiceIntentRouter();
      const output = buildDialogueOutput("book");
      const routed = router.route(output, { multiVehicleRequested: true });

      expect(routed.diverted).toBe(true);
      expect(routed.divertReason).toBe("multi_vehicle_unsupported");
      expect(routed.terminal).toBe("handoff");
      expect(routed.handoffReason).toBe("service_unsupported");
      expect(routed.promptZh).toContain("一次僅能受理單輛車派遣");
      expect(routed.promptZh).toContain("不會直接重複下單");
    });

    it("rejects unsupported special products (wheelchair/baby seat without vehicle supply), does NOT omit requirement to dispatch regular taxi (UV-AC-018)", () => {
      const router = new VoiceIntentRouter();
      const output = buildDialogueOutput("book");
      const routed = router.route(output, {
        specialRequirements: ["wheelchair"],
        specialRequirementServiceable: false, // No wheelchair vehicle supply certified
      });

      expect(routed.diverted).toBe(true);
      expect(routed.divertReason).toBe("special_product_unsupported");
      expect(routed.terminal).toBe("handoff");
      expect(routed.handoffReason).toBe("service_unsupported");
      expect(routed.promptZh).toContain("輪椅／安全座椅");
      expect(routed.promptZh).toContain("不會僅填寫備註派普通車");
    });

    it("IntentRoutingGuard strips mutation proposals and forces handoff when model output contains disabled tools", () => {
      const guard = new IntentRoutingGuard();
      const dangerousOutput: VoiceDialogueOutput = {
        intent: "cancel",
        text: "幫您取消囉！",
        slots: [],
        tools: [
          {
            name: "resolve_location",
            args: { query: "台北車站" },
          },
        ],
        usage: { inputTokens: 5, outputTokens: 5 },
        terminal: "turn_complete",
      };

      const result = guard.guardDialogueOutput(dangerousOutput);
      expect(result.diverted).toBe(true);
      expect(result.guardedOutput.terminal).toBe("handoff");
      expect(result.guardedOutput.tools).toEqual([
        { name: "request_handoff", args: { reason: "service_unsupported" } },
      ]);
      expect(result.guardedOutput.text).not.toContain("幫您取消囉");
    });
  });

  // =========================================================================
  // 2. identity_duplicate_call_evidence
  // Acceptance: 查單身份與歸屬核對後才揭露必要資料；多車/已有單不直接重複下單。
  // =========================================================================
  describe("identity_duplicate_call_evidence", () => {
    it("UV-AC-014: hidden caller ID or foreign caller querying order without verified proof refuses disclosure and does not confirm existence", async () => {
      const h = buildServiceHarness();

      // Case A: Hidden caller number, requests query on someone else's order
      const hiddenCallerQuery: OrderQueryPolicyRequest = {
        voiceSessionId: SESSION_ID,
        resourceScopeId: SCOPE_ID,
        targetOrderId: ORDER_ID,
        callerPhone: undefined, // Hidden / unavailable caller ID
        identityProof: undefined, // No verified OTP or bound proof
      };

      const result = await h.service.evaluateOrderQueryPolicy(hiddenCallerQuery);

      expect(result.authorized).toBe(false);
      expect(result.status).toBe("identity_verification_required");
      expect(result.disclosureLevel).toBe("none");
      expect(result.disclosedOrder).toBeUndefined();
      expect(result.requiresChallenge).toBe(true);
      expect(result.handoffReason).toBe("identity_unverified");
      // Security non-negotiable: does NOT answer "某人確有這張單"
      expect(result.messageZh).not.toContain("張小明確有這張單");
      expect(result.messageZh).toContain("未核對身份前不透露");
    });

    it("UV-AC-014: bound session proof discloses ONLY minimal necessary data and masks sensitive fields", async () => {
      const order = createMockOrder({
        status: "enroute_pickup",
        pickup: { address: "台北市信義區忠孝東路五段100號3樓", lat: 25.04, lng: 121.56 },
        dropoff: { address: "新北市板橋區縣民大道二段7號", lat: 25.01, lng: 121.46 },
        passenger: { name: "王大明", phone: "0912345678" },
      });
      (order as unknown as { vehiclePlate?: string; driverName?: string }).vehiclePlate = "ABC-1234";
      (order as unknown as { driverName?: string }).driverName = "陳大文";

      const h = buildServiceHarness({
        boundOrderId: order.orderId,
        initialOrders: [order],
      });

      const result = await h.service.evaluateOrderQueryPolicy({
        voiceSessionId: SESSION_ID,
        resourceScopeId: SCOPE_ID,
        identityProof: {
          method: "bound_session",
          proofId: "bound-proof-1",
        },
      });

      expect(result.authorized).toBe(true);
      expect(result.status).toBe("authorized");
      expect(result.disclosureLevel).toBe("minimal");
      expect(result.disclosedOrder).toBeDefined();

      const disclosed = result.disclosedOrder!;
      expect(disclosed.orderId).toBe(order.orderId);
      expect(disclosed.status).toBe("enroute_pickup");
      expect(disclosed.vehiclePlate).toBe("ABC-1234");
      expect(disclosed.driverNameMasked).toBe("陳 * 司機");
      // Sensitive fields must be masked
      expect(disclosed.maskedPassengerPhone).toBe("0912***678");
      expect(disclosed.pickupMasked).toBe("台北市信義區***");
      expect(disclosed.pickupMasked).not.toContain("100號3樓");
      expect(disclosed.dropoffMasked).toBe("新北市板橋區***");
    });

    it("UV-AC-014: cross-session OTP proof with mismatched phone is denied without leaking order existence", async () => {
      const order = createMockOrder({
        orderId: "order-secret-999",
        passenger: { name: "林先生", phone: "0988777666" },
      });
      const h = buildServiceHarness({
        boundOrderId: null,
        initialOrders: [order],
      });

      const result = await h.service.evaluateOrderQueryPolicy({
        voiceSessionId: SESSION_ID,
        resourceScopeId: SCOPE_ID,
        targetOrderId: "order-secret-999",
        identityProof: {
          method: "otp",
          proofId: "otp-proof-1",
          verifiedPhone: "0911222333", // Different phone!
        },
      });

      expect(result.authorized).toBe(false);
      expect(result.status).toBe("identity_verification_required");
      expect(result.disclosureLevel).toBe("none");
      expect(result.disclosedOrder).toBeUndefined();
      expect(result.handoffReason).toBe("identity_unverified");
    });

    it("UV-AC-019: duplicate call detected when caller already has an active order, diverts to avoid double booking", async () => {
      const activeOrder = createMockOrder({
        orderId: "order-active-123",
        status: "driver_accepted",
        passenger: { name: "張小明", phone: "0912345678" },
      });
      const h = buildServiceHarness({
        boundOrderId: null,
        initialOrders: [activeOrder],
      });

      const checkReq: ActiveOrderCheckRequest = {
        callerPhone: "0912345678",
        resourceScopeId: SCOPE_ID,
        voiceSessionId: SESSION_ID,
      };

      const checkResult = await h.service.checkActiveOrderDuplicate(checkReq);
      expect(checkResult.hasActiveOrder).toBe(true);
      expect(checkResult.activeOrderId).toBe("order-active-123");
      expect(checkResult.orderStatus).toBe("driver_accepted");
      expect(checkResult.messageZh).toContain("進行中的訂單");
      expect(checkResult.messageZh).toContain("為避免重複下單");

      // Worker Router verifies that intent 'book' is diverted
      const router = new VoiceIntentRouter();
      const output = buildDialogueOutput("book");
      const routed = router.route(output, {
        hasActiveOrder: checkResult.hasActiveOrder,
        activeOrderId: checkResult.activeOrderId,
      });

      expect(routed.diverted).toBe(true);
      expect(routed.divertReason).toBe("duplicate_active_order");
      expect(routed.terminal).toBe("handoff");
      expect(routed.promptZh).toContain("進行中的行程");
      expect(routed.promptZh).toContain("為避免重複下單");
      expect(routed.promptZh).toContain("不會直接建立第二筆訂單");
    });

    it("UV-AC-019: completed/cancelled historical order does NOT trigger duplicate call diversion", async () => {
      const closedOrder = createMockOrder({
        orderId: "order-closed-456",
        status: "completed",
        passenger: { name: "張小明", phone: "0912345678" },
      });
      const h = buildServiceHarness({
        boundOrderId: null,
        initialOrders: [closedOrder],
      });

      const checkResult = await h.service.checkActiveOrderDuplicate({
        callerPhone: "0912345678",
        resourceScopeId: SCOPE_ID,
        voiceSessionId: SESSION_ID,
      });

      expect(checkResult.hasActiveOrder).toBe(false);
      expect(checkResult.policyAction).toBe("proceed");
    });
  });

  // =========================================================================
  // 3. conditional_acceptance_matrix
  // Acceptance: 若接上既有可核准取消能力，需獨立 proof/fee/state race；未開通之 AC 保留 conditional evidence，不能標假通過。
  // =========================================================================
  describe("conditional_acceptance_matrix", () => {
    it("UV-AC-015: conditionally enabled cancel evaluates driver dispatch state, fee disclosure, and requires explicit confirmation", async () => {
      const dispatchedOrder = createMockOrder({
        orderId: "order-dispatched-001",
        status: "driver_accepted", // Driver already assigned and accepted
        aggregateVersion: 2,
      });
      (dispatchedOrder as unknown as { assignmentVersion?: number }).assignmentVersion = 1;

      const h = buildServiceHarness({
        boundOrderId: "order-dispatched-001",
        initialOrders: [dispatchedOrder],
        capabilityConfig: {
          order_cancel: "enabled", // Conditionally opened for this test
        },
      });

      expect(h.service.isEnabled("order_cancel")).toBe(true);

      const cancelElig = await h.service.evaluateCancelEligibility({
        voiceSessionId: SESSION_ID,
        resourceScopeId: SCOPE_ID,
        orderId: "order-dispatched-001",
        identityProof: {
          method: "bound_session",
          proofId: "bound-1",
        },
      });

      expect(cancelElig.permitted).toBe(true);
      expect(cancelElig.action).toBe("proceed");
      expect(cancelElig.orderId).toBe("order-dispatched-001");
      expect(cancelElig.orderVersion).toBe(2);
      expect(cancelElig.assignmentVersion).toBe(1);
      expect(cancelElig.cancellationFee).toBe(50); // Fee applies when driver accepted
      expect(cancelElig.requiresConfirmation).toBe(true);
      expect(cancelElig.messageZh).toContain("取消費用新台幣 50 元");
    });

    it("UV-AC-015: conditionally enabled cancel has 0 fee when driver has not yet been dispatched", async () => {
      const matchingOrder = createMockOrder({
        orderId: "order-matching-002",
        status: "ready_for_dispatch",
        aggregateVersion: 1,
      });

      const h = buildServiceHarness({
        boundOrderId: "order-matching-002",
        initialOrders: [matchingOrder],
        capabilityConfig: {
          order_cancel: "enabled",
        },
      });

      const cancelElig = await h.service.evaluateCancelEligibility({
        voiceSessionId: SESSION_ID,
        resourceScopeId: SCOPE_ID,
        orderId: "order-matching-002",
        identityProof: {
          method: "bound_session",
          proofId: "bound-2",
        },
      });

      expect(cancelElig.permitted).toBe(true);
      expect(cancelElig.cancellationFee).toBe(0); // 0 fee during matching
      expect(cancelElig.messageZh).toContain("不收取取消費用");
    });

    it("UV-AC-016: detects state race when driver/order status changes between confirmation and execute, fails closed without faking cancellation", async () => {
      const dynamicOrder = createMockOrder({
        orderId: "order-race-003",
        status: "driver_accepted",
        aggregateVersion: 2,
      });
      (dynamicOrder as unknown as { assignmentVersion?: number }).assignmentVersion = 1;

      const h = buildServiceHarness({
        boundOrderId: "order-race-003",
        initialOrders: [dynamicOrder],
        capabilityConfig: {
          order_cancel: "enabled",
        },
      });

      // Simulating: Passenger confirmed cancellation under version 2 (driver_accepted, fee 50)
      const command: ExecuteCancelCommand = {
        voiceSessionId: SESSION_ID,
        resourceScopeId: SCOPE_ID,
        orderId: "order-race-003",
        expectedOrderVersion: 2, // Passenger confirmed against version 2
        expectedAssignmentVersion: 1,
        cancelConfirmationProof: {
          confirmationId: "cancel-conf-uuid",
          confirmedAt: new Date().toISOString(),
          snapshotHash: "hash-ver-2",
          acknowledgedFee: 50,
        },
        reason: "Passenger requested cancellation",
      };

      // RACE EVENT: Before execute arrives, driver started trip (on_trip) or orderVersion advanced to 3!
      dynamicOrder.status = "on_trip";
      dynamicOrder.aggregateVersion = 3;
      h.service.registerMockOrder(dynamicOrder);

      // Execute must fail closed with state race
      await expect(h.service.executeCancel(command)).rejects.toMatchObject({
        code: "VOICE_ORDER_STATE_RACE",
      });

      // Order must NOT be marked cancelled
      const freshOrder = h.service.getMockOrder("order-race-003");
      expect(freshOrder?.status).toBe("on_trip");
      expect(freshOrder?.status).not.toBe("cancelled");
    });

    it("UV-AC-016: atomic cancel execution succeeds when CAS versions match without state race", async () => {
      const order = createMockOrder({
        orderId: "order-norace-004",
        status: "driver_accepted",
        aggregateVersion: 2,
      });
      (order as unknown as { assignmentVersion?: number }).assignmentVersion = 1;

      const h = buildServiceHarness({
        boundOrderId: "order-norace-004",
        initialOrders: [order],
        capabilityConfig: {
          order_cancel: "enabled",
        },
      });

      const command: ExecuteCancelCommand = {
        voiceSessionId: SESSION_ID,
        resourceScopeId: SCOPE_ID,
        orderId: "order-norace-004",
        expectedOrderVersion: 2,
        expectedAssignmentVersion: 1,
        cancelConfirmationProof: {
          confirmationId: "cancel-conf-ok",
          confirmedAt: new Date().toISOString(),
          snapshotHash: "hash-ok",
          acknowledgedFee: 50,
        },
      };

      const result = await h.service.executeCancel(command);
      expect(result.succeeded).toBe(true);
      expect(result.status).toBe("cancelled");
      expect(result.orderVersion).toBe(3); // Version advanced monotonically

      const freshOrder = h.service.getMockOrder("order-norace-004");
      expect(freshOrder?.status).toBe("cancelled");
    });

    it("UV-AC-017: absolute date and time normalization preserves specified time without faking realtime booking", () => {
      const router = new VoiceIntentRouter();

      // Case 1: "明天凌晨零點" (e.g. 2026-09-10T00:00:00 Taipei -> 2026-09-09T16:00:00Z)
      const midnightTaipeiUtc = "2026-09-09T16:00:00.000Z";
      const out1 = buildDialogueOutput("reservation");
      const routed1 = router.route(out1, {
        scheduledTimeIsoUtc: midnightTaipeiUtc,
      });
      expect(routed1.promptZh).toContain("2 0 2 6 年 0 9 月 1 0 日 0 0 點 0 0 分");
      expect(routed1.promptZh).toContain("不會為您建立即時單");
      expect(routed1.terminal).toBe("handoff");

      // Case 2: "下週五下午三點" (e.g. 2026-09-18T15:00:00 Taipei -> 2026-09-18T07:00:00Z)
      const friday3pmTaipeiUtc = "2026-09-18T07:00:00.000Z";
      const out2 = buildDialogueOutput("book");
      const routed2 = router.route(out2, {
        scheduledTimeIsoUtc: friday3pmTaipeiUtc,
      });
      expect(routed2.promptZh).toContain("2 0 2 6 年 0 9 月 1 8 日 1 5 點 0 0 分");
      expect(routed2.promptZh).toContain("不會自動偷換成即時單下單");
      expect(routed2.terminal).toBe("handoff");
    });
  });

  // =========================================================================
  // 4. Tool Gateway integration with VoiceOperationPolicyService
  // =========================================================================
  describe("VoiceToolGatewayService integration with policy", () => {
    it("delegates capability assertions to policy service and blocks disabled tools", async () => {
      const h = buildServiceHarness({
        capabilityConfig: {
          order_create: "disabled", // Disable order_create
        },
      });

      const claims: VoiceCapabilityTokenClaims = {
        iss: "drts_voice_capability_issuer",
        aud: "voice-tool-gateway",
        exp: Math.floor(Date.now() / 1000) + 120,
        iat: Math.floor(Date.now() / 1000),
        servicePrincipalId: "principal-1",
        voiceSessionId: SESSION_ID,
        resourceScopeId: SCOPE_ID,
        routeProfileVersion: 1,
        leaseEpoch: 1,
        scopes: ["session_execute", "address_resolve"],
      };

      const guard = {
        authenticate: vi.fn(async () => claims),
      } as unknown as VoiceCapabilityGuard;

      const executePort = vi.fn(async () => ({ candidates: [] }));

      const gateway = new VoiceToolGatewayService(
        guard,
        h.repository as unknown as VoiceBookingRepository,
        h.authorization as unknown as VoiceBookingAuthorizationService,
        { execute: executePort },
        {
          headers: {},
          inputEpoch: 1,
          deadline: Date.now() + 1000,
          signal: new AbortController().signal,
        },
        h.service, // Inject policy service!
      );

      const resolveProposal = buildDialogueOutput("book", {
        tools: [{ name: "resolve_location", args: { query: "台北市信義區" } }],
      });

      // order_create is disabled in policy -> must throw ApiRequestError
      await expect(gateway.execute(resolveProposal)).rejects.toMatchObject({
        code: "VOICE_CAPABILITY_DISABLED",
      });
      expect(executePort).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 5. Codex Review Blocker Regressions: Repository Phone Lookup, Scope & Fee Binding
  // =========================================================================
  describe("Codex Review Blocker Regressions: Phone Lookup, Cancel Auth & Fee Binding", () => {
    describe("checkActiveOrderDuplicate with OwnedMobilityRepository phone lookup", () => {
      it("queries repository findActiveOrderByPassengerPhone and diverts when active order exists", async () => {
        const activeDbOrder = createMockOrder({
          orderId: "order-db-active-001",
          status: "driver_accepted",
          passenger: { name: "李阿姨", phone: "0988776655" },
        });

        const mockRepo = {
          isEnabled: vi.fn(() => true),
          findActiveOrderByPassengerPhone: vi.fn(async (phone: string) => {
            if (phone === "0988776655") {
              return activeDbOrder;
            }
            return null;
          }),
        };

        const h = buildServiceHarness({
          boundOrderId: null,
          ownedMobilityRepository: mockRepo,
        });

        const result = await h.service.checkActiveOrderDuplicate({
          callerPhone: "0988776655",
          resourceScopeId: SCOPE_ID,
          voiceSessionId: SESSION_ID,
        });

        expect(mockRepo.findActiveOrderByPassengerPhone).toHaveBeenCalledWith(
          "0988776655",
          expect.anything(),
        );
        expect(result.hasActiveOrder).toBe(true);
        expect(result.activeOrderId).toBe("order-db-active-001");
        expect(result.policyAction).toBe("divert_duplicate");
      });

      it("returns proceed when repository findActiveOrderByPassengerPhone finds no active order", async () => {
        const mockRepo = {
          isEnabled: vi.fn(() => true),
          findActiveOrderByPassengerPhone: vi.fn(async () => null),
        };

        const h = buildServiceHarness({
          boundOrderId: null,
          ownedMobilityRepository: mockRepo,
        });

        const result = await h.service.checkActiveOrderDuplicate({
          callerPhone: "0911000111",
          resourceScopeId: SCOPE_ID,
          voiceSessionId: SESSION_ID,
        });

        expect(result.hasActiveOrder).toBe(false);
        expect(result.policyAction).toBe("proceed");
      });

      it("OwnedMobilityRepository.findActiveOrderByPassengerPhone queries DB with activeStatuses and phone", async () => {
        const query = vi.fn().mockResolvedValue({
          rows: [{ record: createMockOrder({ orderId: "order-db-123" }) }],
        });
        const repo = new OwnedMobilityRepository({
          isEnabled: () => true,
          query,
        } as never);

        const order = await repo.findActiveOrderByPassengerPhone("0912345678");
        expect(order?.orderId).toBe("order-db-123");
        expect(query).toHaveBeenCalledWith(
          expect.stringContaining("ops.phase1_owned_orders"),
          expect.arrayContaining([expect.any(Array), "0912345678"]),
        );
      });
    });

    describe("executeCancel fail-closed voiceSessionId / resourceScopeId authorization", () => {
      it("rejects when voiceSessionId or resourceScopeId is missing", async () => {
        const h = buildServiceHarness({
          capabilityConfig: { order_cancel: "enabled" },
        });

        const commandNoSession: ExecuteCancelCommand = {
          voiceSessionId: "",
          resourceScopeId: SCOPE_ID,
          orderId: ORDER_ID,
          expectedOrderVersion: 1,
          cancelConfirmationProof: {
            confirmationId: "conf-1",
            confirmedAt: new Date().toISOString(),
            snapshotHash: "hash-1",
            acknowledgedFee: 50,
          },
        };

        await expect(h.service.executeCancel(commandNoSession)).rejects.toMatchObject({
          code: "VOICE_INVALID_REQUEST",
        });

        const commandNoScope: ExecuteCancelCommand = {
          ...commandNoSession,
          voiceSessionId: SESSION_ID,
          resourceScopeId: "",
        };

        await expect(h.service.executeCancel(commandNoScope)).rejects.toMatchObject({
          code: "VOICE_INVALID_REQUEST",
        });
      });

      it("rejects with VOICE_SESSION_NOT_OWNER when session does not exist", async () => {
        const h = buildServiceHarness({
          capabilityConfig: { order_cancel: "enabled" },
        });

        const command: ExecuteCancelCommand = {
          voiceSessionId: "non-existent-session",
          resourceScopeId: SCOPE_ID,
          orderId: ORDER_ID,
          expectedOrderVersion: 1,
          cancelConfirmationProof: {
            confirmationId: "conf-1",
            confirmedAt: new Date().toISOString(),
            snapshotHash: "hash-1",
            acknowledgedFee: 50,
          },
        };

        await expect(h.service.executeCancel(command)).rejects.toMatchObject({
          code: "VOICE_SESSION_NOT_OWNER",
        });
      });

      it("rejects with VOICE_SCOPE_DENIED when resourceScopeId does not match session", async () => {
        const h = buildServiceHarness({
          capabilityConfig: { order_cancel: "enabled" },
        });

        const command: ExecuteCancelCommand = {
          voiceSessionId: SESSION_ID,
          resourceScopeId: "scope-other-cross-tenant",
          orderId: ORDER_ID,
          expectedOrderVersion: 1,
          cancelConfirmationProof: {
            confirmationId: "conf-1",
            confirmedAt: new Date().toISOString(),
            snapshotHash: "hash-1",
            acknowledgedFee: 50,
          },
        };

        await expect(h.service.executeCancel(command)).rejects.toMatchObject({
          code: "VOICE_SCOPE_DENIED",
        });
      });

      it("rejects with VOICE_SCOPE_DENIED when caller/session is not authorized to cancel foreign order", async () => {
        const foreignOrder = createMockOrder({
          orderId: "order-foreign-999",
          callId: "call-different-other-user",
          status: "driver_accepted",
          passenger: { name: "陳某某", phone: "0933999888" },
        });

        const h = buildServiceHarness({
          boundOrderId: "order-own-111", // Bound to a different order!
          initialOrders: [foreignOrder],
          capabilityConfig: { order_cancel: "enabled" },
        });

        const command: ExecuteCancelCommand = {
          voiceSessionId: SESSION_ID,
          resourceScopeId: SCOPE_ID,
          orderId: "order-foreign-999",
          expectedOrderVersion: 1,
          cancelConfirmationProof: {
            confirmationId: "conf-foreign",
            confirmedAt: new Date().toISOString(),
            snapshotHash: "hash-foreign",
            acknowledgedFee: 50,
          },
        };

        // Unauthorized caller cannot cancel foreign order
        await expect(h.service.executeCancel(command)).rejects.toMatchObject({
          code: "VOICE_SCOPE_DENIED",
        });
      });

      it("rejects with VOICE_SCOPE_DENIED when confirmation proof belongs to a different session", async () => {
        const order = createMockOrder({
          orderId: "order-conf-mismatch-1",
          status: "driver_accepted",
          aggregateVersion: 1,
        });

        const confirmations = new Map<string, any>([
          [
            "conf-session-diff",
            {
              confirmationId: "conf-session-diff",
              voiceSessionId: "other-session-777", // Different session!
              snapshotHash: "hash-conf",
            },
          ],
        ]);

        const h = buildServiceHarness({
          boundOrderId: "order-conf-mismatch-1",
          initialOrders: [order],
          capabilityConfig: { order_cancel: "enabled" },
          confirmations,
        });

        const command: ExecuteCancelCommand = {
          voiceSessionId: SESSION_ID,
          resourceScopeId: SCOPE_ID,
          orderId: "order-conf-mismatch-1",
          expectedOrderVersion: 1,
          cancelConfirmationProof: {
            confirmationId: "conf-session-diff",
            confirmedAt: new Date().toISOString(),
            snapshotHash: "hash-conf",
            acknowledgedFee: 50,
          },
        };

        await expect(h.service.executeCancel(command)).rejects.toMatchObject({
          code: "VOICE_SCOPE_DENIED",
        });
      });

      it("succeeds when verified passenger proof is supplied for order cancellation", async () => {
        const order = createMockOrder({
          orderId: "order-verified-proof-01",
          callId: "prior-call-id",
          status: "driver_accepted",
          aggregateVersion: 1,
          passenger: { name: "王乘客", phone: "0922333444" },
        });

        const h = buildServiceHarness({
          boundOrderId: null, // Not bound to session
          initialOrders: [order],
          capabilityConfig: { order_cancel: "enabled" },
        });

        const command: ExecuteCancelCommand = {
          voiceSessionId: SESSION_ID,
          resourceScopeId: SCOPE_ID,
          orderId: "order-verified-proof-01",
          expectedOrderVersion: 1,
          cancelConfirmationProof: {
            confirmationId: "conf-otp-verified",
            confirmedAt: new Date().toISOString(),
            snapshotHash: "hash-otp",
            acknowledgedFee: 50,
          },
          identityProof: {
            method: "otp",
            proofId: "otp-proof-123",
            verifiedPhone: "0922333444",
          },
        };

        const result = await h.service.executeCancel(command);
        expect(result.succeeded).toBe(true);
        expect(result.status).toBe("cancelled");
        expect(result.cancellationFee).toBe(50);
      });
    });

    describe("executeCancel fail-closed cancellation fee binding", () => {
      it("rejects with VOICE_INVALID_PROOF when acknowledgedFee is invalid or negative", async () => {
        const h = buildServiceHarness({
          capabilityConfig: { order_cancel: "enabled" },
        });

        const invalidProofs = [
          { acknowledgedFee: -10 },
          { acknowledgedFee: NaN },
          { acknowledgedFee: undefined as unknown as number },
        ];

        for (const proof of invalidProofs) {
          const command: ExecuteCancelCommand = {
            voiceSessionId: SESSION_ID,
            resourceScopeId: SCOPE_ID,
            orderId: ORDER_ID,
            expectedOrderVersion: 1,
            cancelConfirmationProof: {
              confirmationId: "conf-fee-invalid",
              confirmedAt: new Date().toISOString(),
              snapshotHash: "hash-fee",
              ...proof,
            },
          };

          await expect(h.service.executeCancel(command)).rejects.toMatchObject({
            code: "VOICE_INVALID_PROOF",
          });
        }
      });

      it("rejects with VOICE_CANCELLATION_FEE_MISMATCH when passenger acknowledged 0 but driver accepted (fee 50)", async () => {
        const order = createMockOrder({
          orderId: "order-fee-50",
          status: "driver_accepted", // Fee is 50
          aggregateVersion: 1,
        });

        const h = buildServiceHarness({
          boundOrderId: "order-fee-50",
          initialOrders: [order],
          capabilityConfig: { order_cancel: "enabled" },
        });

        const command: ExecuteCancelCommand = {
          voiceSessionId: SESSION_ID,
          resourceScopeId: SCOPE_ID,
          orderId: "order-fee-50",
          expectedOrderVersion: 1,
          cancelConfirmationProof: {
            confirmationId: "conf-fee-0",
            confirmedAt: new Date().toISOString(),
            snapshotHash: "hash-fee-0",
            acknowledgedFee: 0, // Passenger acknowledged 0 fee, but fee is 50!
          },
        };

        await expect(h.service.executeCancel(command)).rejects.toMatchObject({
          code: "VOICE_CANCELLATION_FEE_MISMATCH",
        });
      });

      it("rejects with VOICE_CANCELLATION_FEE_MISMATCH when passenger acknowledged 50 but order is pre-assignment (fee 0)", async () => {
        const order = createMockOrder({
          orderId: "order-fee-0",
          status: "ready_for_dispatch", // Fee is 0
          aggregateVersion: 1,
        });

        const h = buildServiceHarness({
          boundOrderId: "order-fee-0",
          initialOrders: [order],
          capabilityConfig: { order_cancel: "enabled" },
        });

        const command: ExecuteCancelCommand = {
          voiceSessionId: SESSION_ID,
          resourceScopeId: SCOPE_ID,
          orderId: "order-fee-0",
          expectedOrderVersion: 1,
          cancelConfirmationProof: {
            confirmationId: "conf-fee-50",
            confirmedAt: new Date().toISOString(),
            snapshotHash: "hash-fee-50",
            acknowledgedFee: 50, // Passenger acknowledged 50, but actual fee is 0!
          },
        };

        await expect(h.service.executeCancel(command)).rejects.toMatchObject({
          code: "VOICE_CANCELLATION_FEE_MISMATCH",
        });
      });

      it("succeeds and binds cancellationFee when acknowledgedFee matches current fee exactly", async () => {
        const order = createMockOrder({
          orderId: "order-fee-free",
          status: "ready_for_dispatch", // Fee is 0
          aggregateVersion: 1,
        });

        const h = buildServiceHarness({
          boundOrderId: "order-fee-free",
          initialOrders: [order],
          capabilityConfig: { order_cancel: "enabled" },
        });

        const command: ExecuteCancelCommand = {
          voiceSessionId: SESSION_ID,
          resourceScopeId: SCOPE_ID,
          orderId: "order-fee-free",
          expectedOrderVersion: 1,
          cancelConfirmationProof: {
            confirmationId: "conf-free-ok",
            confirmedAt: new Date().toISOString(),
            snapshotHash: "hash-free-ok",
            acknowledgedFee: 0,
          },
        };

        const result = await h.service.executeCancel(command);
        expect(result.succeeded).toBe(true);
        expect(result.cancellationFee).toBe(0);
        expect(result.status).toBe("cancelled");
      });
    });
  });
});
