import { z } from "zod";
import type {
  ResolvedAddressPayload,
  ServiceAreaEvaluationResult,
} from "./index";

/** SD §6.4: immutable requirements carried through dispatch, never just notes. */
export const bookingRequirementsSchema = z
  .object({
    passengerCount: z.number().int().min(1),
    luggageCount: z.number().int().min(0),
    luggageSize: z.enum(["standard", "oversized"]),
    requiredCapabilities: z.array(z.enum(["wheelchair", "child_seat"])),
    bookerContact: z
      .object({ name: z.string(), phone: z.string().min(1) })
      .strict(),
    passengerContact: z
      .object({ name: z.string(), phone: z.string().min(1) })
      .strict(),
    driverContactRole: z.enum(["booker", "passenger"]),
    policyVersion: z.string().min(1),
    validationReference: z.string().min(1),
  })
  .strict();

export type BookingRequirements = z.infer<typeof bookingRequirementsSchema>;

export interface VoiceResolvedLocation {
  rawText: string;
  selectedCandidateId: string;
  entranceId: string | null;
  address: ResolvedAddressPayload;
  resolutionVersion: string;
  validUntil: string;
}

export interface BookingQualification {
  resourceScopeId: string;
  scopeVersion: number;
  runtimeProfileCode: "ordinary_taxi";
  serviceProductCode: "taxi_realtime";
  requestedAt: string;
  timeZone: "Asia/Taipei";
  timingMode: "on_demand";
  pickup: VoiceResolvedLocation;
  dropoff: VoiceResolvedLocation;
  serviceArea: ServiceAreaEvaluationResult;
  validatedAt: string;
  validUntil: string;
}

/**
 * zod v4's `.datetime()` tightened the default ISO grammar (mandatory
 * seconds, colon-delimited range-checked offset); this reproduces the
 * exact v3.25 grammar callers and consumers of this field were built
 * against (minute precision allowed, basic "+HHMM" offset accepted).
 */
const voiceDatetimeOffsetRegex =
  /^((\d\d[2468][048]|\d\d[13579][26]|\d\d0[48]|[02468][048]00|[13579][26]00)-02-29|\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\d|3[01])|(0[469]|11)-(0[1-9]|[12]\d|30)|(02)-(0[1-9]|1\d|2[0-8])))T([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d+)?)?(Z|([+-]\d{2}:?\d{2}))$/;

export const voiceAbsoluteTimeSchema = z
  .string()
  .regex(voiceDatetimeOffsetRegex);
export const voiceOrdinaryRuntimeMappingSchema = z
  .object({
    runtimeProfileCode: z.literal("ordinary_taxi"),
    serviceProductCode: z.literal("taxi_realtime"),
  })
  .strict();
