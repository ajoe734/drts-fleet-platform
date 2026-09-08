import { z } from "zod";

const text = z.string().min(1).max(500);
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
      args: z.object({ query: text }).strict(),
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
            field: z.enum([
              "pickup",
              "dropoff",
              "bookerContact",
              "passengerContact",
              "time",
              "passengerCount",
              "notes",
            ]),
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
        .array(z.object({ placeId: label, label, region: label }).strict())
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
