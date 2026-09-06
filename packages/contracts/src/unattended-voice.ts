import { z } from "zod";

export const BookingActorTypeSchema = z.enum(["voice_agent", "human"]);
export type BookingActorType = z.infer<typeof BookingActorTypeSchema>;

export const BookingActorSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("voice_agent"),
    voiceSessionId: z.string().uuid(),
    principalId: z.string(),
  }),
  z.object({
    type: z.literal("human"),
    agentId: z.string(),
  }),
]);
export type BookingActor = z.infer<typeof BookingActorSchema>;

export const VoiceControlCutoffSchema = z.object({
  mediaEpoch: z.number().int(),
  controlSequence: z.number().int(),
});
export type VoiceControlCutoff = z.infer<typeof VoiceControlCutoffSchema>;

export const SpeechProofSchema = z.object({
  confirmationMethod: z.literal("speech"),
  evidence: z.object({
    turnId: z.string().uuid(),
    finalEventId: z.string().uuid(),
  }),
});

export const DtmfProofSchema = z.object({
  confirmationMethod: z.literal("dtmf"),
  evidence: z.object({
    eventId: z.string().uuid(),
    digit: z.string(),
  }),
});

export const VoiceProofUnionSchema = z.discriminatedUnion(
  "confirmationMethod",
  [SpeechProofSchema, DtmfProofSchema],
);

export const VoiceProofSchema = z.intersection(
  z.object({
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
  }),
  VoiceProofUnionSchema,
);
export type VoiceProof = z.infer<typeof VoiceProofSchema>;

export const VoiceScopeProfileSchema = z.object({
  resourceScopeId: z.string().uuid(),
  brandId: z.string(),
  operatingProfileId: z.string(),
  operatingProfileVersion: z.number().int(),
});
export type VoiceScopeProfile = z.infer<typeof VoiceScopeProfileSchema>;

export const VoiceErrorCodeSchema = z.enum([
  "VOICE_ACTION_PAYLOAD_CONFLICT",
  "VOICE_INVALID_PROOF",
  "VOICE_PROOF_EXPIRED",
  "VOICE_UNAUTHORIZED_SCOPE",
  "VOICE_INVALID_ACTOR",
  "VOICE_CAPABILITY_REJECTED",
  "VOICE_UNSUPPORTED_ACTION",
]);
export type VoiceErrorCode = z.infer<typeof VoiceErrorCodeSchema>;

export const VoiceSessionSchema = z.object({
  voiceSessionId: z.string().uuid(),
  callId: z.string().uuid(),
  callLegId: z.string().uuid().optional(),
  scope: VoiceScopeProfileSchema,
  dialogState: z.string(),
  mediaState: z.string(),
});
export type VoiceSession = z.infer<typeof VoiceSessionSchema>;

export const VoiceDraftSchema = z.object({
  intentId: z.string().uuid(),
  draftVersion: z.number().int(),
  rawText: z.string().optional(),
  normalizedValue: z.any().optional(),
  sourceTurnIds: z.array(z.string().uuid()),
  sourceSegmentIds: z.array(z.string()),
  providerConfidence: z.number().nullable(),
  validationState: z.string(),
  confirmedByCustomerAt: z.string().datetime().nullable(),
});
export type VoiceDraft = z.infer<typeof VoiceDraftSchema>;

export const VoiceReceiptSchema = z.object({
  actionKey: z.string(),
  status: z.enum(["none", "pending", "succeeded", "rejected"]),
  commandId: z.string().uuid().optional(),
  orderId: z.string().uuid().optional(),
  rejectionReason: z.string().optional(),
});
export type VoiceReceipt = z.infer<typeof VoiceReceiptSchema>;

export const VoiceCallbackSchema = z.object({
  callbackId: z.string().uuid(),
  voiceSessionId: z.string().uuid(),
  contactPhone: z.string(),
  consentSnapshotHash: z.string(),
  status: z.enum(["pending", "completed", "failed", "cancelled"]),
  scheduledAt: z.string().datetime().optional(),
});
export type VoiceCallback = z.infer<typeof VoiceCallbackSchema>;

// Capability claims
export const VoiceCapabilitySchema = z
  .object({
    aud: z.literal("voice-tool-gateway"),
    servicePrincipalId: z.string().uuid(),
    voiceSessionId: z.string().uuid(),
    resourceScopeId: z.string().uuid(),
    routeProfileVersion: z.number().int(),
    leaseEpoch: z.number().int(),
    scopes: z.array(z.string()),
  })
  .strict(); // strict prevents url, sql or other arbitrary actor claims
export type VoiceCapability = z.infer<typeof VoiceCapabilitySchema>;
