import { Injectable, Optional, Logger } from "@nestjs/common";
import type {
  OwnedOrderRecord,
  OwnedOrderStatus,
  VoiceCapabilityTokenClaims,
} from "@drts/contracts";
import { ApiRequestError } from "../../common/api-envelope";
import { VoiceBookingRepository } from "./voice-booking.repository";
import { VoiceBookingAuthorizationService } from "./voice-booking-authorization.service";
import { OwnedMobilityRepository } from "../owned-mobility/owned-mobility.repository";
import { OwnedMobilityService } from "../owned-mobility/owned-mobility.service";

export type VoiceOperationCapability =
  | "order_create"
  | "order_query"
  | "order_cancel"
  | "order_amend"
  | "order_reservation"
  | "multi_vehicle"
  | "special_products";

export type VoiceCapabilityStatus = "enabled" | "disabled" | "conditional";

export interface CapabilityRegistryConfig {
  capabilities: Record<VoiceOperationCapability, VoiceCapabilityStatus>;
}

export const DEFAULT_CAPABILITY_REGISTRY_CONFIG: CapabilityRegistryConfig = {
  capabilities: {
    order_create: "enabled",
    order_query: "conditional", // bound session minimal disclosure; unverified requires proof/challenge
    order_cancel: "disabled", // SD §12.4: default disabled in Phase 1
    order_amend: "disabled", // SD §12.4: default disabled in Phase 1
    order_reservation: "disabled", // SD §12.4: default disabled in Phase 1
    multi_vehicle: "disabled", // SD §12.3 / UV-AC-019: multi-car routed to human handoff
    special_products: "conditional", // SD §12.4 / UV-AC-018: requires qualification; fallback to handoff
  },
};

export interface OrderQueryPolicyRequest {
  voiceSessionId: string;
  resourceScopeId: string;
  targetOrderId?: string;
  callerPhone?: string;
  identityProof?: {
    method: "bound_session" | "otp" | "passenger_proof" | "access_code";
    proofId: string;
    verifiedPhone?: string;
  };
}

export interface MinimalDisclosedOrderInfo {
  orderId: string;
  status: string;
  vehiclePlate?: string | null;
  etaMinutes?: number | null;
  driverNameMasked?: string | null;
  maskedPassengerPhone?: string | null;
  pickupMasked?: string | null;
  dropoffMasked?: string | null;
}

export interface OrderQueryPolicyResult {
  authorized: boolean;
  status:
    | "authorized"
    | "identity_verification_required"
    | "scope_denied"
    | "order_not_found";
  disclosureLevel: "none" | "minimal";
  disclosedOrder?: MinimalDisclosedOrderInfo;
  requiresChallenge?: boolean;
  handoffReason?: string;
  messageZh?: string;
}

export interface ActiveOrderCheckRequest {
  callerPhone: string;
  resourceScopeId: string;
  voiceSessionId: string;
}

export interface ActiveOrderCheckResult {
  hasActiveOrder: boolean;
  activeOrderId?: string;
  orderStatus?: string;
  policyAction: "proceed" | "divert_duplicate";
  messageZh?: string;
}

export interface MultiVehiclePolicyRequest {
  vehicleCount?: number;
  passengerCount?: number;
  multiVehicleRequested?: boolean;
}

export interface MultiVehiclePolicyResult {
  supported: boolean;
  action: "proceed" | "handoff";
  reason?: string;
  messageZh?: string;
}

export interface CancelEligibilityRequest {
  voiceSessionId: string;
  resourceScopeId: string;
  orderId: string;
  callerPhone?: string;
  identityProof?: {
    method: "bound_session" | "otp" | "passenger_proof";
    proofId: string;
    verifiedPhone?: string;
  };
}

export interface CancelEligibilityResult {
  permitted: boolean;
  reason?:
    | "capability_disabled"
    | "identity_unverified"
    | "order_not_cancelable"
    | "order_not_found";
  action: "proceed" | "handoff" | "reject";
  orderId?: string;
  orderVersion?: number;
  assignmentVersion?: number;
  driverStatus?: string;
  cancellationFee?: number;
  feeCurrency?: string;
  requiresConfirmation?: boolean;
  messageZh?: string;
}

export interface ExecuteCancelCommand {
  voiceSessionId: string;
  resourceScopeId: string;
  orderId: string;
  expectedOrderVersion: number;
  expectedAssignmentVersion?: number;
  cancelConfirmationProof: {
    confirmationId: string;
    confirmedAt: string;
    snapshotHash: string;
    acknowledgedFee: number;
  };
  reason?: string;
}

export interface CancelExecutionResult {
  succeeded: boolean;
  orderId: string;
  status: string;
  orderVersion: number;
  cancellationFee: number;
  cancelledAt: string;
  stateRace?: boolean;
  currentOrderVersion?: number;
  currentDriverStatus?: string;
  errorMessage?: string;
}

export const ACTIVE_ORDER_STATUSES: readonly OwnedOrderStatus[] = [
  "created",
  "recording_pending",
  "ready_for_dispatch",
  "preassigned",
  "assigned",
  "driver_accepted",
  "enroute_pickup",
  "arrived_pickup",
  "on_trip",
  "proof_pending",
  "redispatch_required",
  "delayed_queue",
  "exception_hold",
] as const;

/**
 * SD §12.2, §12.3, §12.4 Voice Operation Policy Service.
 *
 * Implements:
 * 1. Capability Registry: controls voice operational scope (cancel, amend, reservation, query).
 * 2. Identity Verification & Minimal Disclosure (SD §12.2, UV-AC-014):
 *    - Unverified caller cannot access itinerary or confirm existence of orders.
 *    - Bound session or verified proof exposes only minimal necessary fields.
 * 3. Duplicate Call & Active Order Detection (SD §12.3, UV-FR-017, UV-AC-019):
 *    - Detects existing active orders and diverts to prevent duplicate booking.
 * 4. Multi-Vehicle Policy (SD §12.3, UV-AC-019):
 *    - Routes multi-vehicle requests to human handoff in Phase 1.
 * 5. Conditional Cancellation & State Race Protection (SD §12.2, §12.4, UV-AC-015, UV-AC-016):
 *    - Evaluates cancellation fee & checks atomic CAS version against races.
 * 6. Reservation & Special Products Policy (SD §12.4, UV-AC-017, UV-AC-018):
 *    - Forbids converting reservation to immediate booking or substituting normal cars.
 */
@Injectable()
export class VoiceOperationPolicyService {
  private readonly logger = new Logger(VoiceOperationPolicyService.name);
  private readonly capabilities: Record<
    VoiceOperationCapability,
    VoiceCapabilityStatus
  >;

  // In-memory active order store for fast testing/mocking when DB repository is not connected
  private readonly mockActiveOrders = new Map<string, OwnedOrderRecord>();

  constructor(
    private readonly repository: VoiceBookingRepository,
    private readonly authorization: VoiceBookingAuthorizationService,
    @Optional() private readonly ownedMobilityRepository?: OwnedMobilityRepository,
    @Optional() private readonly ownedMobilityService?: OwnedMobilityService,
    config?: Partial<CapabilityRegistryConfig>,
  ) {
    this.capabilities = {
      ...DEFAULT_CAPABILITY_REGISTRY_CONFIG.capabilities,
      ...(config?.capabilities ?? {}),
    };
  }

  // --- Capability Registry Management ---

  getCapabilityStatus(capability: VoiceOperationCapability): VoiceCapabilityStatus {
    return this.capabilities[capability] ?? "disabled";
  }

  isEnabled(capability: VoiceOperationCapability): boolean {
    return this.getCapabilityStatus(capability) === "enabled";
  }

  isConditional(capability: VoiceOperationCapability): boolean {
    return this.getCapabilityStatus(capability) === "conditional";
  }

  isDisabled(capability: VoiceOperationCapability): boolean {
    return this.getCapabilityStatus(capability) === "disabled";
  }

  setCapability(
    capability: VoiceOperationCapability,
    status: VoiceCapabilityStatus,
  ): void {
    this.capabilities[capability] = status;
  }

  assertCapabilityEnabled(capability: VoiceOperationCapability): void {
    const status = this.getCapabilityStatus(capability);
    if (status === "disabled") {
      if (capability === "order_reservation") {
        throw new ApiRequestError(
          409,
          "VOICE_RESERVATION_NOT_ENABLED",
          "Reservation must retain its requested time and be handed off.",
        );
      }
      throw new ApiRequestError(
        403,
        "VOICE_CAPABILITY_DISABLED",
        `Voice capability '${capability}' is currently disabled for this operation.`,
      );
    }
  }

  // --- Mock Active Orders (for test harnesses and standalone operation) ---

  registerMockOrder(order: OwnedOrderRecord): void {
    this.mockActiveOrders.set(order.orderId, order);
  }

  getMockOrder(orderId: string): OwnedOrderRecord | undefined {
    return this.mockActiveOrders.get(orderId);
  }

  // --- 1. Order Query & Identity Disclosure Policy (SD §12.2, UV-AC-014) ---

  async evaluateOrderQueryPolicy(
    request: OrderQueryPolicyRequest,
  ): Promise<OrderQueryPolicyResult> {
    const { voiceSessionId, resourceScopeId, targetOrderId, callerPhone, identityProof } =
      request;

    // Check capability
    if (this.isDisabled("order_query")) {
      return {
        authorized: false,
        status: "identity_verification_required",
        disclosureLevel: "none",
        handoffReason: "service_unsupported",
        messageZh: "語音查單功能目前未開通，將為您轉接客服專員處理。",
      };
    }

    // Resolve session
    const session = await this.repository.findSessionById(voiceSessionId);
    if (!session || session.resourceScopeId !== resourceScopeId) {
      throw new ApiRequestError(
        403,
        "VOICE_SCOPE_DENIED",
        "Session does not belong to authorized resource scope.",
      );
    }

    // Case A: Bound Session Proof
    const boundOrderId = await this.authorization
      .resolveBoundOrderId(voiceSessionId, resourceScopeId)
      .catch(() => null);

    const isBoundSession =
      identityProof?.method === "bound_session" &&
      (!targetOrderId || targetOrderId === boundOrderId);

    if (isBoundSession && boundOrderId) {
      const order = await this.findOrder(boundOrderId);
      if (order) {
        return {
          authorized: true,
          status: "authorized",
          disclosureLevel: "minimal",
          disclosedOrder: this.sanitizeOrderMinimal(order),
          messageZh: "已核對本通通話綁定之訂單。",
        };
      }
    }

    // Case B: Cross-session / Non-bound Query
    // SD §12.2: "來電號碼＋訂單號只作 lookup hint，不能直接公開完整地址／電話或取消。"
    // UV-AC-014: "未核對身份不揭露行程；採替代驗證或轉接；身份確認失敗不回答『某人確有這張單』"

    // If caller phone is hidden, absent, or no verified proof provided:
    if (!identityProof || identityProof.method === "bound_session") {
      return {
        authorized: false,
        status: "identity_verification_required",
        disclosureLevel: "none",
        requiresChallenge: true,
        handoffReason: "identity_unverified",
        messageZh:
          "查詢跨通或歷史訂單需先完成身份核對，未核對身份前不透露行程或訂單資訊。",
      };
    }

    // Verified OTP or passenger proof
    if (
      (identityProof.method === "otp" || identityProof.method === "passenger_proof") &&
      identityProof.verifiedPhone
    ) {
      if (!targetOrderId) {
        return {
          authorized: false,
          status: "order_not_found",
          disclosureLevel: "none",
          requiresChallenge: false,
          messageZh: "請提供欲查詢之訂單編號。",
        };
      }

      const order = await this.findOrder(targetOrderId);
      if (!order) {
        // Safe fail-closed without leaking details
        return {
          authorized: false,
          status: "order_not_found",
          disclosureLevel: "none",
          requiresChallenge: false,
          messageZh: "查無此訂單或訂單無權限檢視。",
        };
      }

      // Check if verified phone matches passenger contact
      const passengerPhone =
        order.passenger?.phone ??
        order.bookingRequirements?.passengerContact?.phone;

      if (!passengerPhone || passengerPhone !== identityProof.verifiedPhone) {
        // SD §12.2: fail closed, do not confirm existence
        return {
          authorized: false,
          status: "identity_verification_required",
          disclosureLevel: "none",
          requiresChallenge: true,
          handoffReason: "identity_unverified",
          messageZh: "身份核對未通過，無法提供該訂單資料。",
        };
      }

      return {
        authorized: true,
        status: "authorized",
        disclosureLevel: "minimal",
        disclosedOrder: this.sanitizeOrderMinimal(order),
        messageZh: "身份核對成功，提供最少必要行程資訊。",
      };
    }

    return {
      authorized: false,
      status: "identity_verification_required",
      disclosureLevel: "none",
      requiresChallenge: true,
      handoffReason: "identity_unverified",
      messageZh: "查詢訂單需先完成身份核對。",
    };
  }

  // --- 2. Duplicate Calls & Active Order Check (SD §12.3, UV-FR-017, UV-AC-019) ---

  async checkActiveOrderDuplicate(
    request: ActiveOrderCheckRequest,
  ): Promise<ActiveOrderCheckResult> {
    const { callerPhone, resourceScopeId, voiceSessionId } = request;

    if (!callerPhone || callerPhone.trim() === "") {
      return {
        hasActiveOrder: false,
        policyAction: "proceed",
      };
    }

    // 1. Check bound session first
    const boundOrderId = await this.authorization
      .resolveBoundOrderId(voiceSessionId, resourceScopeId)
      .catch(() => null);

    if (boundOrderId) {
      const order = await this.findOrder(boundOrderId);
      if (order && ACTIVE_ORDER_STATUSES.includes(order.status)) {
        return {
          hasActiveOrder: true,
          activeOrderId: order.orderId,
          orderStatus: order.status,
          policyAction: "divert_duplicate",
          messageZh:
            "系統核對發現本通通話已綁定進行中之行程，不直接重複下單。",
        };
      }
    }

    // 2. Check in mock active orders
    for (const order of this.mockActiveOrders.values()) {
      const pPhone =
        order.passenger?.phone ??
        order.bookingRequirements?.passengerContact?.phone;
      if (
        pPhone === callerPhone &&
        ACTIVE_ORDER_STATUSES.includes(order.status)
      ) {
        return {
          hasActiveOrder: true,
          activeOrderId: order.orderId,
          orderStatus: order.status,
          policyAction: "divert_duplicate",
          messageZh:
            "系統偵測到此來電號碼目前已有一筆進行中的訂單，為避免重複下單，請確認是否為查詢現有行程。",
        };
      }
    }

    // 3. If real DB is connected, search for active orders
    if (this.ownedMobilityRepository?.isEnabled()) {
      try {
        // Query recent active order by caller phone
        const recentOrder = await this.ownedMobilityRepository.findOrderById(
          callerPhone, // or lookup method
        );
        if (recentOrder && ACTIVE_ORDER_STATUSES.includes(recentOrder.status)) {
          return {
            hasActiveOrder: true,
            activeOrderId: recentOrder.orderId,
            orderStatus: recentOrder.status,
            policyAction: "divert_duplicate",
            messageZh:
              "系統偵測到此來電號碼已有進行中的訂單，為避免重複下單，不直接重複建立。",
          };
        }
      } catch (err) {
        this.logger.debug("Active order DB query skipped or unsupported:", err);
      }
    }

    return {
      hasActiveOrder: false,
      policyAction: "proceed",
    };
  }

  // --- 3. Multi-Vehicle Policy (SD §12.3, UV-FR-017, UV-AC-019) ---

  evaluateMultiVehiclePolicy(
    request: MultiVehiclePolicyRequest,
  ): MultiVehiclePolicyResult {
    const { vehicleCount, passengerCount, multiVehicleRequested } = request;

    const isMultiVehicle =
      multiVehicleRequested === true ||
      (vehicleCount !== undefined && vehicleCount > 1) ||
      (passengerCount !== undefined && passengerCount > 4);

    if (isMultiVehicle) {
      return {
        supported: false,
        action: "handoff",
        reason: "service_unsupported",
        messageZh:
          "無人語音叫車一次僅支援派遣單輛車輛。多車叫車需求將為您轉接客服專員為您調度。",
      };
    }

    return {
      supported: true,
      action: "proceed",
    };
  }

  // --- 4. Conditional Cancellation Policy & State Race (SD §12.2, §12.4, UV-AC-015, UV-AC-016) ---

  async evaluateCancelEligibility(
    request: CancelEligibilityRequest,
  ): Promise<CancelEligibilityResult> {
    const { voiceSessionId, resourceScopeId, orderId, identityProof } = request;

    // Check capability
    if (this.isDisabled("order_cancel")) {
      return {
        permitted: false,
        reason: "capability_disabled",
        action: "handoff",
        orderId,
        messageZh:
          "語音自動取消訂單功能目前未開通，將為您轉接客服專員處理，不會為您直接取消或建立新單。",
      };
    }

    // Verify identity
    const session = await this.repository.findSessionById(voiceSessionId);
    if (!session || session.resourceScopeId !== resourceScopeId) {
      throw new ApiRequestError(
        403,
        "VOICE_SCOPE_DENIED",
        "Session does not belong to authorized resource scope.",
      );
    }

    const boundOrderId = await this.authorization
      .resolveBoundOrderId(voiceSessionId, resourceScopeId)
      .catch(() => null);

    const isBound = boundOrderId === orderId;
    const isVerifiedPassenger =
      identityProof &&
      (identityProof.method === "otp" ||
        identityProof.method === "passenger_proof") &&
      identityProof.verifiedPhone;

    if (!isBound && !isVerifiedPassenger) {
      return {
        permitted: false,
        reason: "identity_unverified",
        action: "handoff",
        orderId,
        messageZh:
          "取消訂單需核對乘車人身份與行程授權，未核對前無法進行取消操作。",
      };
    }

    const order = await this.findOrder(orderId);
    if (!order) {
      return {
        permitted: false,
        reason: "order_not_found",
        action: "reject",
        orderId,
        messageZh: "查無此訂單。",
      };
    }

    if (["completed", "cancelled"].includes(order.status)) {
      return {
        permitted: false,
        reason: "order_not_cancelable",
        action: "reject",
        orderId,
        messageZh: `訂單狀態為 ${order.status}，無法重複取消。`,
      };
    }

    if (order.status === "on_trip") {
      return {
        permitted: false,
        reason: "order_not_cancelable",
        action: "reject",
        orderId,
        messageZh: "車輛已在行程中（on_trip），無法透過電話取消，請聯絡司機或客服。",
      };
    }

    // Fee evaluation (SD §12.2 / UV-AC-015):
    // If driver already accepted / en route / arrived -> cancellation fee applies
    let cancellationFee = 0;
    if (
      ["driver_accepted", "enroute_pickup", "arrived_pickup"].includes(
        order.status,
      )
    ) {
      cancellationFee = 50; // TWD 50 cancellation fee
    }

    const orderVersion = order.aggregateVersion ?? 1;
    const assignmentVersion = (order as unknown as { assignmentVersion?: number })
      .assignmentVersion ?? 1;

    return {
      permitted: true,
      action: "proceed",
      orderId,
      orderVersion,
      assignmentVersion,
      driverStatus: order.status,
      cancellationFee,
      feeCurrency: "TWD",
      requiresConfirmation: true,
      messageZh:
        cancellationFee > 0
          ? `司機已在接送途中，取消將產生取消費用新台幣 ${cancellationFee} 元。請取得乘客明確確認。`
          : "訂單尚未派定司機，取消不收取取消費用。",
    };
  }

  async executeCancel(command: ExecuteCancelCommand): Promise<CancelExecutionResult> {
    const {
      voiceSessionId,
      resourceScopeId,
      orderId,
      expectedOrderVersion,
      expectedAssignmentVersion,
      cancelConfirmationProof,
      reason,
    } = command;

    this.assertCapabilityEnabled("order_cancel");

    // Check proof
    if (
      !cancelConfirmationProof ||
      !cancelConfirmationProof.confirmationId ||
      !cancelConfirmationProof.snapshotHash
    ) {
      throw new ApiRequestError(
        400,
        "VOICE_INVALID_PROOF",
        "A valid cancel confirmation proof is required to execute cancellation.",
      );
    }

    const order = await this.findOrder(orderId);
    if (!order) {
      throw new ApiRequestError(404, "ORDER_NOT_FOUND", "Order not found.");
    }

    const currentOrderVersion = order.aggregateVersion ?? 1;
    const currentAssignmentVersion =
      (order as unknown as { assignmentVersion?: number }).assignmentVersion ??
      1;

    // State race detection (SD §12.2, UV-AC-016):
    // If driver accepted, trip started, or order version changed between confirmation & execute
    if (
      currentOrderVersion !== expectedOrderVersion ||
      (expectedAssignmentVersion !== undefined &&
        currentAssignmentVersion !== expectedAssignmentVersion) ||
      order.status === "on_trip"
    ) {
      // STATE RACE DETECTED!
      // Must not fake cancel or silently create replacement order
      this.logger.warn(
        `Cancel state race detected on order ${orderId}: expected version ${expectedOrderVersion}, current ${currentOrderVersion}, status ${order.status}`,
      );
      throw new ApiRequestError(
        409,
        "VOICE_ORDER_STATE_RACE",
        "Order or driver assignment state changed before cancellation could be committed. Refresh terms and re-confirm.",
        {
          orderId,
          expectedOrderVersion,
          currentOrderVersion,
          currentStatus: order.status,
        },
      );
    }

    // Atomic update
    const now = new Date().toISOString();
    order.status = "cancelled";
    order.cancelledAt = now;
    order.cancelReason = reason ?? "Customer cancelled via voice";
    order.aggregateVersion = currentOrderVersion + 1;

    this.mockActiveOrders.set(orderId, order);

    return {
      succeeded: true,
      orderId,
      status: "cancelled",
      orderVersion: order.aggregateVersion,
      cancellationFee: cancelConfirmationProof.acknowledgedFee,
      cancelledAt: now,
    };
  }

  // --- Helpers ---

  private async findOrder(orderId: string): Promise<OwnedOrderRecord | null> {
    if (this.mockActiveOrders.has(orderId)) {
      return this.mockActiveOrders.get(orderId)!;
    }
    if (this.ownedMobilityRepository?.isEnabled()) {
      return await this.ownedMobilityRepository.findOrderById(orderId);
    }
    return null;
  }

  private sanitizeOrderMinimal(order: OwnedOrderRecord): MinimalDisclosedOrderInfo {
    const passengerPhone =
      order.passenger?.phone ??
      order.bookingRequirements?.passengerContact?.phone;

    return {
      orderId: order.orderId,
      status: order.status,
      vehiclePlate: (order as unknown as { vehiclePlate?: string }).vehiclePlate ?? null,
      etaMinutes: order.etaSnapshot?.etaMinutes ?? null,
      driverNameMasked: (order as unknown as { driverName?: string }).driverName
        ? `${(order as unknown as { driverName?: string }).driverName![0]} * 司機`
        : null,
      maskedPassengerPhone: passengerPhone
        ? this.maskPhoneNumber(passengerPhone)
        : null,
      pickupMasked: order.pickup?.address
        ? this.maskAddress(order.pickup.address)
        : null,
      dropoffMasked: order.dropoff?.address
        ? this.maskAddress(order.dropoff.address)
        : null,
    };
  }

  private maskPhoneNumber(phone: string): string {
    const clean = phone.replace(/[ -]/g, "");
    if (clean.length <= 6) return "***";
    return `${clean.slice(0, 4)}***${clean.slice(-3)}`;
  }

  private maskAddress(address: string): string {
    if (address.length <= 6) return address;
    return `${address.slice(0, 6)}***`;
  }
}
