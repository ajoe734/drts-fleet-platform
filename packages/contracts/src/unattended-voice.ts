import { z } from "zod";

export const BookingActorTypeSchema = z.enum(["voice_agent", "human"]);
export type BookingActorType = z.infer<typeof BookingActorTypeSchema>;

export const VoiceAgentBookingActorSchema = z
  .object({
    type: z.literal("voice_agent"),
    voiceSessionId: z.string().uuid(),
    principalId: z.string(),
  })
  .strict();
export type VoiceAgentBookingActor = z.infer<
  typeof VoiceAgentBookingActorSchema
>;

export const HumanBookingActorSchema = z
  .object({
    type: z.literal("human"),
    agentId: z.string(),
  })
  .strict();
export type HumanBookingActor = z.infer<typeof HumanBookingActorSchema>;

export const BookingActorSchema = z.discriminatedUnion("type", [
  VoiceAgentBookingActorSchema,
  HumanBookingActorSchema,
]);
export type BookingActor = z.infer<typeof BookingActorSchema>;

export const VoiceControlCutoffSchema = z
  .object({
    mediaEpoch: z.number().int(),
    controlSequence: z.number().int(),
  })
  .strict();
export type VoiceControlCutoff = z.infer<typeof VoiceControlCutoffSchema>;

export const VoiceSpeechEvidenceSchema = z
  .object({
    turnId: z.string().uuid(),
    finalEventId: z.string().uuid(),
  })
  .strict();
export type VoiceSpeechEvidence = z.infer<typeof VoiceSpeechEvidenceSchema>;

export const DTMF_DIGIT_REGEX = /^[0-9*#A-Da-d]$/;

export const VoiceDtmfEvidenceSchema = z
  .object({
    eventId: z.string().uuid(),
    digit: z
      .string()
      .regex(
        DTMF_DIGIT_REGEX,
        "Must be a single valid CTI DTMF digit (0-9, *, #, A-D)",
      ),
  })
  .strict();
export type VoiceDtmfEvidence = z.infer<typeof VoiceDtmfEvidenceSchema>;

export const SpeechProofSchema = z
  .object({
    confirmationMethod: z.literal("speech"),
    evidence: VoiceSpeechEvidenceSchema,
  })
  .strict();
export type SpeechProof = z.infer<typeof SpeechProofSchema>;

export const DtmfProofSchema = z
  .object({
    confirmationMethod: z.literal("dtmf"),
    evidence: VoiceDtmfEvidenceSchema,
  })
  .strict();
export type DtmfProof = z.infer<typeof DtmfProofSchema>;

export const VoiceProofUnionSchema = z.discriminatedUnion(
  "confirmationMethod",
  [SpeechProofSchema, DtmfProofSchema],
);
export type VoiceProofUnion = z.infer<typeof VoiceProofUnionSchema>;

export const BaseVoiceProofSchema = z.object({
  confirmationId: z.string().uuid(),
  voiceSessionId: z.string().uuid(),
  intentId: z.string().uuid(),
  action: z.string(),
  draftVersion: z.number().int(),
  snapshotHash: z.string(),
  readbackPlaybackId: z.string().uuid(),
  readbackCompletedEventId: z.string().uuid(),
  inputEpoch: z.number().int(),
  controlCutoff: VoiceControlCutoffSchema,
  leaseEpoch: z.number().int(),
  recordingCheckpointId: z.string().uuid(),
  confirmedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});

export const SpeechVoiceProofSchema = BaseVoiceProofSchema.extend({
  confirmationMethod: z.literal("speech"),
  evidence: VoiceSpeechEvidenceSchema,
}).strict();
export type SpeechVoiceProof = z.infer<typeof SpeechVoiceProofSchema>;

export const DtmfVoiceProofSchema = BaseVoiceProofSchema.extend({
  confirmationMethod: z.literal("dtmf"),
  evidence: VoiceDtmfEvidenceSchema,
}).strict();
export type DtmfVoiceProof = z.infer<typeof DtmfVoiceProofSchema>;

export const VoiceProofSchema = z.discriminatedUnion("confirmationMethod", [
  SpeechVoiceProofSchema,
  DtmfVoiceProofSchema,
]);
export type VoiceProof = z.infer<typeof VoiceProofSchema>;

export const VoiceScopeProfileSchema = z
  .object({
    resourceScopeId: z.string().uuid(),
    brandId: z.string(),
    operatingProfileId: z.string(),
    operatingProfileVersion: z.number().int(),
  })
  .strict();
export type VoiceScopeProfile = z.infer<typeof VoiceScopeProfileSchema>;

export const VOICE_ERROR_CODES = [
  // SD §10.3 error codes
  "VOICE_LINE_NOT_BOUND",
  "VOICE_SCOPE_DENIED",
  "VOICE_SESSION_NOT_OWNER",
  "VOICE_DRAFT_STALE",
  "VOICE_CONFIRMATION_REQUIRED",
  "VOICE_CONFIRMATION_EXPIRED",
  "VOICE_RECORDING_NOT_DURABLE",
  "VOICE_LOCATION_AMBIGUOUS",
  "VOICE_SERVICE_NOT_AVAILABLE",
  "VOICE_ACTION_PAYLOAD_CONFLICT",
  "VOICE_PASSENGER_PROOF_REQUIRED",
  "VOICE_PROVIDER_CAPACITY",
  "VOICE_PROVIDER_UNAVAILABLE",
  // Verification, proof and capability error codes
  "VOICE_INVALID_PROOF",
  "VOICE_PROOF_EXPIRED",
  "VOICE_UNAUTHORIZED_SCOPE",
  "VOICE_INVALID_ACTOR",
  "VOICE_CAPABILITY_REJECTED",
  "VOICE_UNSUPPORTED_ACTION",
] as const;

export const VoiceErrorCodeSchema = z.enum(VOICE_ERROR_CODES);
export type VoiceErrorCode = z.infer<typeof VoiceErrorCodeSchema>;

export const VoiceDialogStateSchema = z.enum([
  "admitted",
  "greeting",
  "collecting",
  "resolving",
  "confirming",
  "committing",
  "reconciling",
  "awaiting_dispatch",
  "reporting",
  "handoff_pending",
  "human_controlled",
  "callback_pending",
  "closed",
]);
export type VoiceDialogState = z.infer<typeof VoiceDialogStateSchema>;

export const VoiceMediaStateSchema = z.enum([
  "connecting",
  "active",
  "reconnecting",
  "ended",
]);
export type VoiceMediaState = z.infer<typeof VoiceMediaStateSchema>;

export const VoiceControlOwnerSchema = z.enum([
  "ai",
  "handoff",
  "human",
  "none",
]);
export type VoiceControlOwner = z.infer<typeof VoiceControlOwnerSchema>;

export const VoiceCommitStatusSchema = z.enum([
  "none",
  "pending",
  "succeeded",
  "rejected",
]);
export type VoiceCommitStatus = z.infer<typeof VoiceCommitStatusSchema>;

export const VoiceRecordingStateSchema = z.enum([
  "starting",
  "capturing",
  "checkpoint_ready",
  "finalizing",
  "finalized",
  "failed",
  "expired",
]);
export type VoiceRecordingState = z.infer<typeof VoiceRecordingStateSchema>;

export const VoiceConfirmationStateSchema = z.enum([
  "absent",
  "readback_playing",
  "awaiting_answer",
  "accepted",
  "invalidated",
  "consumed",
]);
export type VoiceConfirmationState = z.infer<
  typeof VoiceConfirmationStateSchema
>;

export const VoiceOutcomeSchema = z.enum([
  "auto_booking_created",
  "auto_no_service",
  "auto_query_completed",
  "human_handoff",
  "callback_scheduled",
  "abandoned",
  "technical_failure",
]);
export type VoiceOutcome = z.infer<typeof VoiceOutcomeSchema>;

export const VoiceSessionSchema = z.object({
  voiceSessionId: z.string().uuid(),
  callId: z.string().min(1),
  callLegId: z.string().uuid().optional(),
  scope: VoiceScopeProfileSchema,
  dialogState: VoiceDialogStateSchema,
  mediaState: VoiceMediaStateSchema,
  controlOwner: VoiceControlOwnerSchema.optional(),
  leaseEpoch: z.number().int().optional(),
  sessionVersion: z.number().int().optional(),
  commitStatus: VoiceCommitStatusSchema.optional(),
  recordingState: VoiceRecordingStateSchema.optional(),
  confirmationState: VoiceConfirmationStateSchema.optional(),
  outcome: VoiceOutcomeSchema.optional(),
  inputEpoch: z.number().int().optional(),
  pendingInput: z.boolean().optional(),
  lastResolvedInputEpoch: z.number().int().optional(),
  lastAppliedControlSequence: z.number().int().optional(),
});
export type VoiceSession = z.infer<typeof VoiceSessionSchema>;

export const VoiceDraftSchema = z.object({
  intentId: z.string().uuid(),
  draftVersion: z.number().int(),
  rawText: z.string().optional(),
  normalizedValue: z.unknown().optional(),
  sourceTurnIds: z.array(z.string().uuid()),
  sourceSegmentIds: z.array(z.string()),
  providerConfidence: z.number().nullable(),
  validationState: z.string(),
  confirmedByCustomerAt: z.string().datetime().nullable(),
});
export type VoiceDraft = z.infer<typeof VoiceDraftSchema>;

export const VOICE_RECEIPT_STATUSES = [
  "pending",
  "succeeded",
  "rejected",
] as const;

export const VoiceReceiptStatusSchema = z.enum(VOICE_RECEIPT_STATUSES);
export type VoiceReceiptStatus = z.infer<typeof VoiceReceiptStatusSchema>;

export const VoicePendingReceiptSchema = z
  .object({
    commandId: z.string().uuid(),
    status: z.literal("pending"),
    orderId: z.null().optional(),
    nextAction: z.string().optional(),
    pollAfterMs: z.number().int().optional(),
    actionKey: z.string().optional(),
  })
  .strict();
export type VoicePendingReceipt = z.infer<typeof VoicePendingReceiptSchema>;

export const VoiceSucceededReceiptSchema = z
  .object({
    commandId: z.string().uuid(),
    status: z.literal("succeeded"),
    orderId: z.string().uuid(),
    nextAction: z.string().optional(),
    pollAfterMs: z.number().int().optional(),
    actionKey: z.string().optional(),
  })
  .strict();
export type VoiceSucceededReceipt = z.infer<typeof VoiceSucceededReceiptSchema>;

export const VoiceRejectedReceiptSchema = z
  .object({
    commandId: z.string().uuid(),
    status: z.literal("rejected"),
    orderId: z.null().optional(),
    rejectionReason: z.string().optional(),
    nextAction: z.string().optional(),
    pollAfterMs: z.number().int().optional(),
    actionKey: z.string().optional(),
  })
  .strict();
export type VoiceRejectedReceipt = z.infer<typeof VoiceRejectedReceiptSchema>;

export const VoiceReceiptSchema = z.discriminatedUnion("status", [
  VoicePendingReceiptSchema,
  VoiceSucceededReceiptSchema,
  VoiceRejectedReceiptSchema,
]);
export type VoiceReceipt = z.infer<typeof VoiceReceiptSchema>;

export const VoiceReceiptRecordSchema = z
  .object({
    actionKey: z.string().min(1),
    commandId: z.string().uuid(),
    status: VoiceReceiptStatusSchema,
    orderId: z.string().uuid().nullable().optional(),
    payloadHash: z.string().optional(),
    resultVersion: z.number().int().optional(),
    rejectionReason: z.string().optional(),
    createdAt: z.string().datetime().optional(),
    updatedAt: z.string().datetime().optional(),
  })
  .strict();
export type VoiceReceiptRecord = z.infer<typeof VoiceReceiptRecordSchema>;

export const VoiceActionKeyRecordSchema = VoiceReceiptRecordSchema;
export type VoiceActionKeyRecord = VoiceReceiptRecord;

export const VoiceCallbackStatusSchema = z.enum([
  "pending",
  "claimed",
  "in_progress",
  "completed",
  "failed",
  "cancelled",
  "unreachable",
]);
export type VoiceCallbackStatus = z.infer<typeof VoiceCallbackStatusSchema>;

export const VoiceCallbackSchema = z.object({
  callbackId: z.string().uuid(),
  voiceSessionId: z.string().uuid(),
  contactPhone: z.string(),
  consentSnapshotHash: z.string(),
  status: VoiceCallbackStatusSchema,
  scheduledAt: z.string().datetime().optional(),
});
export type VoiceCallback = z.infer<typeof VoiceCallbackSchema>;

export const VOICE_CAPABILITY_SCOPES = [
  "session_execute",
  "address_resolve",
  "order_create_bound",
  "order_read_bound",
  "handoff_request",
  "cancel_bound",
] as const;

export const VoiceCapabilityScopeSchema = z.enum(VOICE_CAPABILITY_SCOPES);
export type VoiceCapabilityScope = z.infer<typeof VoiceCapabilityScopeSchema>;

export const VoiceCapabilitySchema = z
  .object({
    iss: z.string().min(1).optional(),
    aud: z.literal("voice-tool-gateway"),
    exp: z.number().int().positive().optional(),
    iat: z.number().int().positive().optional(),
    nbf: z.number().int().positive().optional(),
    servicePrincipalId: z.string().min(1),
    voiceSessionId: z.string().uuid(),
    resourceScopeId: z.string().uuid(),
    routeProfileVersion: z.number().int(),
    leaseEpoch: z.number().int(),
    scopes: z.array(VoiceCapabilityScopeSchema),
  })
  .strict();
export type VoiceCapability = z.infer<typeof VoiceCapabilitySchema>;

export const VoiceCapabilityTokenClaimsSchema = z
  .object({
    iss: z.string().min(1),
    aud: z.literal("voice-tool-gateway"),
    exp: z.number().int().positive(),
    iat: z.number().int().positive().optional(),
    nbf: z.number().int().positive().optional(),
    servicePrincipalId: z.string().min(1),
    voiceSessionId: z.string().uuid(),
    resourceScopeId: z.string().uuid(),
    routeProfileVersion: z.number().int(),
    leaseEpoch: z.number().int(),
    scopes: z.array(VoiceCapabilityScopeSchema),
  })
  .strict();
export type VoiceCapabilityTokenClaims = z.infer<
  typeof VoiceCapabilityTokenClaimsSchema
>;

export const VoiceCapabilityClaimsSchema = VoiceCapabilityTokenClaimsSchema;
export type VoiceCapabilityClaims = VoiceCapabilityTokenClaims;

export const VoiceCapabilityTokenEnvelopeSchema = z
  .object({
    token: z.string().min(1),
    tokenType: z.literal("Bearer").default("Bearer"),
    expiresIn: z.number().int().positive(),
    claims: VoiceCapabilityTokenClaimsSchema,
  })
  .strict();
export type VoiceCapabilityTokenEnvelope = z.infer<
  typeof VoiceCapabilityTokenEnvelopeSchema
>;
