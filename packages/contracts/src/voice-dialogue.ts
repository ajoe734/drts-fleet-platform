import { z } from "zod";

const text = z.string().min(1).max(500);
export const voiceDialogueSlotFieldSchema = z.enum([
  "pickup",
  "dropoff",
  "bookerContact",
  "passengerContact",
  "time",
  "passengerCount",
  // Structured requirement candidates: integer text, standard/oversized, and
  // a JSON array of wheelchair/child_seat respectively. Domain validation is
  // authoritative; the separate notes field never supplies these constraints.
  "luggageCount",
  "luggageSize",
  "requiredCapabilities",
  "notes",
]);
export type VoiceDialogueSlotField = z.infer<
  typeof voiceDialogueSlotFieldSchema
>;
export const voiceIntentSchema = z.enum([
  "book",
  "status",
  "human",
  "complaint",
  "lost_property",
  "emergency",
  "cancel",
  "amend",
  "reservation",
  "unknown",
]);
export const voiceToolProposalSchema = z.discriminatedUnion("name", [
  z
    .object({
      name: z.literal("resolve_location"),
      args: z
        .object({
          query: text,
          field: z.enum(["pickup", "dropoff"]).optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      name: z.literal("check_booking_eligibility"),
      args: z.object({}).strict(),
    })
    .strict(),
  z
    .object({
      name: z.literal("prepare_booking_readback"),
      args: z.object({}).strict(),
    })
    .strict(),
  z
    .object({
      name: z.literal("get_bound_booking_status"),
      args: z.object({}).strict(),
    })
    .strict(),
  z
    .object({
      name: z.literal("request_handoff"),
      args: z
        .object({
          reason: z.enum([
            "customer_requested",
            "location_unresolved",
            "service_unsupported",
            "urgent_safety",
            "provider_unavailable",
          ]),
        })
        .strict(),
    })
    .strict(),
]);
// Mutations are deliberately absent: only the trusted confirmation coordinator
// may submit them with durable proof, versions and an idempotent action key.
export const voiceDialogueOutputSchema = z
  .object({
    intent: voiceIntentSchema,
    text: z.string().max(1000),
    slots: z
      .array(
        z
          .object({
            field: voiceDialogueSlotFieldSchema,
            rawText: text,
            candidate: text,
            sourceSegmentIds: z.array(text).min(1).max(20),
            providerConfidence: z.number().min(0).max(1).nullable(),
          })
          .strict(),
      )
      .max(7),
    tools: z.array(voiceToolProposalSchema).max(3),
    usage: z
      .object({
        inputTokens: z.number().int().nonnegative().nullable(),
        outputTokens: z.number().int().nonnegative().nullable(),
      })
      .strict(),
    terminal: z.enum(["turn_complete", "tool_required", "handoff"]),
  })
  .strict();
export type VoiceDialogueOutput = z.infer<typeof voiceDialogueOutputSchema>;
export type VoiceToolProposal = z.infer<typeof voiceToolProposalSchema>;

const label = z.string().min(1).max(500);
export const voiceToolResultSchemas = {
  resolve_location: z
    .object({
      candidates: z
        .array(
          z
            .object({
              placeId: label,
              label,
              region: label,
              entranceId: label.optional(),
            })
            .strict(),
        )
        .max(3),
    })
    .strict(),
  check_booking_eligibility: z
    .object({
      status: z.enum(["serviceable", "manual_review", "not_serviceable"]),
      reason: label,
    })
    .strict(),
  prepare_booking_readback: z
    .object({
      script: z.string().min(1).max(4000),
      confirmation: z
        .object({
          confirmationId: label,
          readbackPlaybackId: label,
          snapshotHash: label,
          script: z.string().min(1).max(4000),
          readbackScriptHash: label,
          templateVersion: z.literal("zh-TW-booking-v1"),
          expectedDigit: z.literal("1"),
          expiresAt: z.string().datetime(),
        })
        .strict()
        .optional(),
      playbackTaskId: label,
      draftVersion: z.number().int().nonnegative(),
    })
    .strict(),
  get_bound_booking_status: z
    .object({ orderId: label, status: label })
    .strict()
    .nullable(),
  request_handoff: z
    .object({
      status: z.enum(["queued", "connected", "unavailable"]),
      handoffId: label.nullable(),
    })
    .strict(),
};

/**
 * AUDIT-VOICE-APPLICATION-WIRING-20261003 R4: the versioned, encrypted
 * dialogue-snapshot content shape persisted by
 * `apps/api/src/modules/voice-booking/voice-session.service.ts`'s
 * `persistDialogueSnapshot` (behind `infra/migrations/
 * V0106__voice_dialogue_snapshot.sql`'s `voice.dialogue_snapshot`, see that
 * migration's own doc) and produced/consumed by
 * `apps/voice-media-worker/src/dialogue/dialogue-state.ts`'s
 * `VoiceDialogueState.toSnapshotContent`/`restoreFromSnapshotContent`.
 * Mirrors `VoiceDialogueState`'s own serializable fields field-for-field so
 * the API can actually validate submitted content against a real schema
 * (not accept arbitrary `jsonb`) without this worker and apps/api silently
 * drifting apart on shape.
 */
export const voiceDialogueSnapshotSlotEvidenceSchema = z
  .object({
    rawText: z.string().max(2000),
    normalizedValue: z.string().max(2000).nullable(),
    candidate: z.string().max(2000),
    sourceTurnIds: z.array(z.string().max(200)).max(50),
    sourceSegmentIds: z.array(z.string().max(200)).max(50),
    providerConfidence: z.number().min(0).max(1).nullable(),
    validationState: z.enum(["unvalidated", "validated"]),
    confirmedByCustomerAt: z.string().datetime().nullable(),
  })
  .strict();
export type VoiceDialogueSnapshotSlotEvidence = z.infer<
  typeof voiceDialogueSnapshotSlotEvidenceSchema
>;

export const voiceDialogueSnapshotAddressCandidateSchema = z
  .object({
    placeId: z.string().max(200),
    label: z.string().max(500),
    region: z.string().max(200),
    entranceId: z.string().max(200).optional(),
  })
  .strict();

export const voiceDialogueSnapshotContentSchema = z
  .object({
    draftVersion: z.number().int().nonnegative(),
    confirmationId: z.string().max(200).nullable(),
    slots: z.record(voiceDialogueSnapshotSlotEvidenceSchema),
    slotHistory: z
      .array(
        z
          .object({
            field: voiceDialogueSlotFieldSchema,
            evidence: voiceDialogueSnapshotSlotEvidenceSchema,
          })
          .strict(),
      )
      .max(200),
    addressRepairs: z
      .object({
        pickup: z.number().int().nonnegative(),
        dropoff: z.number().int().nonnegative(),
      })
      .strict(),
    addressHistory: z
      .array(
        z
          .object({
            field: z.enum(["pickup", "dropoff"]),
            rawText: z.string().max(2000),
            candidates: z
              .array(voiceDialogueSnapshotAddressCandidateSchema)
              .max(3),
          })
          .strict(),
      )
      .max(100),
    handoff: z
      .object({ reason: z.string().max(200), intent: z.string().max(100) })
      .strict()
      .nullable(),
  })
  .strict();
export type VoiceDialogueSnapshotContent = z.infer<
  typeof voiceDialogueSnapshotContentSchema
>;

/** Shared first-party recording continuation metadata. Byte provenance is
 * established by SealedRecorder/object-store readback, never this DTO alone. */
export const voiceRecordingScopeSchema = z
  .object({ brandId: text, callId: text, recordingId: text, legId: text })
  .strict();
export const voiceRecordingManifestRefSchema = z
  .object({
    objectKey: label,
    objectVersion: label,
    checksum: z.string().regex(/^[a-f0-9]{64}$/),
    byteLength: z.number().int().positive(),
    durableAt: z.string().datetime(),
  })
  .strict();
export const voiceRecordingSegmentSchema = voiceRecordingScopeSchema
  .extend({
    channel: z.enum(["inbound", "outbound"]),
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().positive(),
    utcStart: z.string().datetime(),
    utcEnd: z.string().datetime(),
    ...voiceRecordingManifestRefSchema.shape,
  })
  .strict();
export const voiceRecordingClosureSchema = z
  .object({
    closedEventId: label,
    endedAt: z.string().datetime(),
    endMs: z.number().int().positive(),
    checkpointRefs: z.array(voiceRecordingManifestRefSchema),
  })
  .strict();
export const voiceRecordingFinalizationSchema = z
  .object({
    scope: voiceRecordingScopeSchema,
    recordingId: label,
    manifestRef: voiceRecordingManifestRefSchema,
    coverage: z
      .object({
        startMs: z.literal(0),
        endMs: z.number().int().positive(),
        channels: z.tuple([z.literal("inbound"), z.literal("outbound")]),
        closedEventId: label,
        endedAt: z.string().datetime(),
      })
      .strict(),
    verifiedAt: z.string().datetime(),
  })
  .strict();
export const voiceRecordingAdmissionSchema = z
  .object({
    admissionId: label,
    principalId: label,
    epoch: z.number().int().nonnegative(),
  })
  .strict();
export type VoiceRecordingAdmission = z.infer<
  typeof voiceRecordingAdmissionSchema
>;
export const voiceRecordingContinuationEventSchema = z.discriminatedUnion(
  "kind",
  [
    z
      .object({
        kind: z.literal("admission"),
        eventKey: label,
        scope: voiceRecordingScopeSchema,
        payload: voiceRecordingAdmissionSchema,
      })
      .strict(),
    z
      .object({
        kind: z.literal("attachment"),
        eventKey: label,
        scope: voiceRecordingScopeSchema,
        payload: voiceRecordingAdmissionSchema,
      })
      .strict(),
    z
      .object({
        kind: z.literal("segment"),
        eventKey: label,
        scope: voiceRecordingScopeSchema,
        payload: voiceRecordingSegmentSchema,
      })
      .strict(),
    z
      .object({
        kind: z.literal("checkpoint"),
        eventKey: label,
        scope: voiceRecordingScopeSchema,
        payload: voiceRecordingManifestRefSchema,
      })
      .strict(),
    z
      .object({
        kind: z.literal("closure"),
        eventKey: label,
        scope: voiceRecordingScopeSchema,
        payload: voiceRecordingClosureSchema,
      })
      .strict(),
    z
      .object({
        kind: z.literal("finalized"),
        eventKey: label,
        scope: voiceRecordingScopeSchema,
        payload: voiceRecordingFinalizationSchema,
        authority: voiceRecordingAdmissionSchema.optional(),
      })
      .strict(),
  ],
);
export type VoiceRecordingContinuationEvent = z.infer<
  typeof voiceRecordingContinuationEventSchema
>;
export type VoiceRecordingFinalization = z.infer<
  typeof voiceRecordingFinalizationSchema
>;

/** Parsed contact proposals carry data only; they never infer consent from ASR.
 * The original asserted caller identity is obtained from durable CRM admission. */
export const voiceDialogueContactCandidateSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    phone: z
      .string()
      .trim()
      .regex(/^\+?\d{8,15}$/),
  })
  .strict();
