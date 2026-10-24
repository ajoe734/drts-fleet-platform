import { z } from "zod";
import {
  VoiceCallbackStatusSchema,
  type VoiceCallbackStatus,
  type VoiceCallbackAttemptOutcome,
} from "./unattended-voice";

/**
 * zod v4's `.datetime()` tightened the default ISO grammar (mandatory
 * seconds, colon-delimited range-checked offset); this reproduces the
 * exact v3.25 grammar callers and consumers of these fields were built
 * against (minute precision allowed, basic "+HHMM" offset accepted).
 */
const voiceDatetimeOffsetRegex =
  /^((\d\d[2468][048]|\d\d[13579][26]|\d\d0[48]|[02468][048]00|[13579][26]00)-02-29|\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\d|3[01])|(0[469]|11)-(0[1-9]|[12]\d|30)|(02)-(0[1-9]|1\d|2[0-8])))T([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d+)?)?(Z|([+-]\d{2}:?\d{2}))$/;

export const VoiceCallbackTaskIdSchema = z.string().guid();
export const VoiceCallbackActionKeySchema = z.string().trim().min(1).max(255);
export const VoiceCallbackReceiptLookupSchema = z.string().min(1);
export const VoiceCallbackQueueFilterSchema = z.object({
  resourceScopeId: z.string().guid(),
  status: VoiceCallbackStatusSchema.optional(),
  voiceSessionId: z.string().guid().optional(),
});
export const VoiceContactCorrectionSchema = z
  .object({
    role: z.enum(["booker", "passenger", "driverContact", "callbackRecipient"]),
    phone: z.string().trim().min(1),
    name: z.string().trim().min(1).optional(),
    consentRef: z.string().trim().min(1).optional(),
    reason: z.string().trim().min(1),
  })
  .strict();
export const VoiceCallbackCreateRequestSchema = z
  .object({
    contactPhoneEncrypted: z.string().min(1).optional(),
    contactPhoneLookupToken: z.string().min(1).optional(),
    consentSnapshotHash: z.string().min(1).optional(),
    contactRevisionNumber: z.number().int().positive().optional(),
    consentRef: z.string().trim().min(1).optional(),
    replacesTaskId: z.string().guid().optional(),
    reason: z.string().optional(),
    priority: z.enum(["normal", "urgent", "emergency"]).optional(),
    scheduledAt: z
      .string()
      .regex(voiceDatetimeOffsetRegex)
      .nullable()
      .optional(),
    dueAt: z.string().regex(voiceDatetimeOffsetRegex).nullable().optional(),
  })
  .strict()
  .refine(
    (value) =>
      (value.contactRevisionNumber !== undefined && !!value.consentRef) ||
      (!!value.contactPhoneEncrypted &&
        !!value.contactPhoneLookupToken &&
        !!value.consentSnapshotHash),
    {
      message:
        "An explicit revision/consent or complete legacy sealed snapshot is required.",
    },
  );
export interface VoiceContactRolesView {
  voiceSessionId: string;
  callbackRecipient: { name: string; phone: string };
  callbackRecipientRole: "booker" | "passenger" | "custom";
  callbackRecipientConsentRef: string | null;
  callbackRecipientRevisionNumber: number | null;
  totalRevisions: number;
}
export type VoiceContactCorrection = z.infer<
  typeof VoiceContactCorrectionSchema
>;
export const VoiceCallbackOperationRequestSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    leaseDurationMs: z.number().int().positive().optional(),
    outcome: z
      .enum(["answered", "no_answer", "busy", "failed", "succeeded"])
      .optional(),
    dialOperationKey: z.string().min(1).optional(),
    dialStatus: z.enum(["dialing", "bridged", "hung_up"]).optional(),
    hangupConfirmed: z.boolean().optional(),
    notes: z.string().optional(),
    reason: z.string().min(1).optional(),
    toOperatorId: z.string().min(1).max(100).optional(),
  })
  .strict();
export type VoiceCallbackCreateRequest = z.infer<
  typeof VoiceCallbackCreateRequestSchema
>;
export type VoiceCallbackOperationRequest = z.infer<
  typeof VoiceCallbackOperationRequestSchema
>;
export type VoiceCallbackOperation =
  | "claim"
  | "attempt"
  | "complete"
  | "cancel"
  | "transfer";

export interface VoiceCallbackTaskView {
  taskId: string;
  voiceSessionId: string;
  resourceScopeId: string;
  brandId: string;
  callId: string;
  linkedOrderId?: string | null;
  /**
   * AUDIT-VOICE-APPLICATION-REGRESSION-20261018 Package C/D: the server-
   * resolved, sealed callback recipient's name and the consent reference
   * backing it (`VoiceContactService`/`voice.contact_role_revision`), NOT
   * the caller-supplied create-request fields. Empty string when no
   * durable contact state has ever been recorded for this session -- an
   * honest "not yet known" value, never a fabricated placeholder.
   */
  contactName: string;
  consentRef: string;
  contactPhone?: string;
  contactRole?:
    | "caller"
    | "booker"
    | "passenger"
    | "driverContact"
    | "callbackRecipient";
  contactRevisionNumber?: number | null;
  contactRevisionBoundAt?: string | null;
  replacesTaskId?: string | null;
  replacementTaskId?: string | null;
  contactHistory?: Array<{
    taskId: string;
    revisionNumber: number;
    role: string;
    name: string;
    consentRef: string | null;
    boundAt: string;
    reason: string;
    replacesTaskId: string | null;
  }>;
  reason: string;
  priority: "normal" | "urgent" | "emergency";
  dueAt: string;
  scheduledAt: string | null;
  status: VoiceCallbackStatus;
  assignedOperatorId: string | null;
  claimExpiresAt: string | null;
  version: number;
  attemptCount: number;
  maxAttempts: number;
  lastOutcome: VoiceCallbackAttemptOutcome | null;
  actionKey: string;
  cancellationReason?: string | null;
  dialReconcileRequired?: boolean;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

export interface VoiceCallbackAttemptView {
  attemptId: string;
  taskId: string;
  attemptNumber: number;
  operatorId: string;
  startedAt: string;
  endedAt: string | null;
  outcome: VoiceCallbackAttemptOutcome;
  nextAction: string | null;
  dialOperationKey: string | null;
  dialStatus: "dialing" | "bridged" | "hung_up" | "reconcile_required";
  hangupConfirmed: boolean;
  notes: string | null;
  createdAt: string;
}

export interface VoiceCallbackOperationResponse {
  task: VoiceCallbackTaskView;
  attempt?: VoiceCallbackAttemptView;
  transfer?: {
    fromOperatorId: string | null;
    toOperatorId: string;
    reason: string;
  };
  actualPhoneHungUp?: boolean;
  dialReconcileRequired?: boolean;
  operatorNotes: string | null;
  receipt: {
    commandId: string;
    taskId: string;
    action: VoiceCallbackOperation;
    operatorId: string;
    createdAt: string;
  };
  replayed: boolean;
}
export interface VoiceCallbackTaskDetail {
  task: VoiceCallbackTaskView;
  attempts: VoiceCallbackAttemptView[];
  commands: VoiceCallbackOperationResponse[];
}

export interface VoiceCallbackCreateResponse {
  task: VoiceCallbackTaskView | null;
  receipt: {
    commandId: string;
    actionKey: string;
    taskId: string | null;
    status: string;
    createdAt: string;
  } | null;
  replayed?: boolean;
}
