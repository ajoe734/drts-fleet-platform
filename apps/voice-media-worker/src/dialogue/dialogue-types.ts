export type VoiceDialogueIntent =
  | "create_booking"
  | "query_booking"
  | "cancel_booking"
  | "request_human"
  | "complaint"
  | "lost_and_found"
  | "emergency"
  | "unknown";

export type VoiceHandoffReasonCode =
  | "customer_requested"
  | "speech_unresolved"
  | "language_unsupported"
  | "location_unresolved"
  | "identity_unverified"
  | "service_unsupported"
  | "recording_unavailable"
  | "provider_unavailable"
  | "command_reconciliation_needed"
  | "urgent_safety"
  | "complaint"
  | "lost_and_found";

export type VoiceSlotValidationState =
  | "unvalidated"
  | "valid"
  | "invalid"
  | "needs_repair";

export interface VoiceDialogueSlot<T = unknown> {
  name: string;
  rawText: string;
  normalizedValue: T | null;
  sourceTurnIds: string[];
  providerConfidence: number | null;
  validationState: VoiceSlotValidationState;
  confirmedByCustomerAt: string | null;
  groupedReadbackText?: string | undefined;
}

export interface VoiceAddressCandidate {
  candidateId: string;
  displayName: string;
  address: string;
  area?: string | undefined;
  location?: { lat: number; lng: number } | undefined;
  confidence?: number | undefined;
}

export interface VoiceAddressRepairState {
  slotName: "pickupAddress" | "dropoffAddress";
  failedAttempts: number;
  rawUtterances: string[];
  candidates: VoiceAddressCandidate[];
  lastQuery: string;
  resolved: boolean;
  abandonedToHandoff: boolean;
}

export interface VoiceHandoffSummary {
  reasonCode: VoiceHandoffReasonCode;
  confirmedSlots: Record<string, unknown>;
  unconfirmedSlots: Record<string, unknown>;
  lastCustomerUtterance: string;
  language: string;
  addressRepairEvidence?: {
    rawUtterances: string[];
    candidates: VoiceAddressCandidate[];
    failedAttempts: number;
  } | undefined;
  orderId?: string | null | undefined;
  recordingRefs: string[];
  handoffRequestedAt: string;
}

export interface VoiceToolProposal {
  callId: string;
  toolName: string;
  parameters: Record<string, unknown>;
}

export interface VoiceDialogueTurnInput {
  sessionId: string;
  turnId: string;
  inputEpoch: number;
  leaseEpoch: number;
  customerUtterance: string;
  language?: string | undefined;
  verifiedContext?: {
    brandId: string;
    resourceScopeId: string;
    customerPhone?: string | undefined;
    routeProfileVersion: number;
  } | undefined;
  existingSlots?: Record<string, VoiceDialogueSlot> | undefined;
  repairState?: VoiceAddressRepairState | undefined;
}

export interface VoiceDialogueTurnOutput {
  text: string;
  intent: VoiceDialogueIntent;
  toolProposals: VoiceToolProposal[];
  terminalState?: "continue" | "handoff" | "completed" | "closed" | undefined;
  handoffReason?: VoiceHandoffReasonCode | undefined;
  handoffSummary?: VoiceHandoffSummary | undefined;
  slots: Record<string, VoiceDialogueSlot>;
  repairState?: VoiceAddressRepairState | undefined;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  epoch: {
    inputEpoch: number;
    leaseEpoch: number;
  };
}

export interface VoiceDialogueProviderOptions {
  timeoutMs?: number | undefined;
  maxToolIterationsPerTurn?: number | undefined;
  isProduction?: boolean | undefined;
  environment?: string | undefined;
}
