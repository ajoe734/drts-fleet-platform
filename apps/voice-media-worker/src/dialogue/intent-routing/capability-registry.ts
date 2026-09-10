/**
 * Voice Operation Capability Registry (SD §12.3, §12.4).
 *
 * Defines and tracks operational capabilities for unattended voice booking:
 * - order_create: instant booking creation
 * - order_query: order status query (bound session or verified identity)
 * - order_cancel: cancellation (default disabled in Phase 1)
 * - order_amend: order amendment (default disabled in Phase 1)
 * - order_reservation: scheduled reservation (default disabled in Phase 1)
 * - multi_vehicle: multi-car dispatch in single call (default disabled in Phase 1)
 * - special_products: special vehicle requirements (wheelchair, child seat, etc.)
 */

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

export const DEFAULT_PHASE1_CAPABILITY_CONFIG: CapabilityRegistryConfig = {
  capabilities: {
    order_create: "enabled",
    order_query: "conditional", // bound session minimal disclosure; non-bound requires identity proof
    order_cancel: "disabled", // SD §12.4: default gated/disabled in Phase 1
    order_amend: "disabled", // SD §12.4: default disabled in Phase 1
    order_reservation: "disabled", // SD §12.4: default disabled in Phase 1
    multi_vehicle: "disabled", // SD §12.3 / UV-AC-019: multi-car routed to human handoff
    special_products: "conditional", // SD §12.4 / UV-AC-018: requires qualification; fallback to handoff
  },
};

export class VoiceCapabilityRegistry {
  private readonly capabilities: Record<
    VoiceOperationCapability,
    VoiceCapabilityStatus
  >;

  constructor(config?: Partial<CapabilityRegistryConfig>) {
    this.capabilities = {
      ...DEFAULT_PHASE1_CAPABILITY_CONFIG.capabilities,
      ...(config?.capabilities ?? {}),
    };
  }

  getStatus(capability: VoiceOperationCapability): VoiceCapabilityStatus {
    return this.capabilities[capability] ?? "disabled";
  }

  isEnabled(capability: VoiceOperationCapability): boolean {
    return this.getStatus(capability) === "enabled";
  }

  isConditional(capability: VoiceOperationCapability): boolean {
    return this.getStatus(capability) === "conditional";
  }

  isDisabled(capability: VoiceOperationCapability): boolean {
    return this.getStatus(capability) === "disabled";
  }

  setCapability(
    capability: VoiceOperationCapability,
    status: VoiceCapabilityStatus,
  ): void {
    this.capabilities[capability] = status;
  }

  getAllCapabilities(): Record<
    VoiceOperationCapability,
    VoiceCapabilityStatus
  > {
    return { ...this.capabilities };
  }

  assertCapabilityEnabled(capability: VoiceOperationCapability): void {
    const status = this.getStatus(capability);
    if (status === "disabled") {
      throw new Error(`voice_capability_disabled:${capability}`);
    }
  }
}
