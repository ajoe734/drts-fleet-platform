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

export const voiceAbsoluteTimeSchema = z.string().datetime({ offset: true });
export const voiceOrdinaryRuntimeMappingSchema = z
  .object({
    runtimeProfileCode: z.literal("ordinary_taxi"),
    serviceProductCode: z.literal("taxi_realtime"),
  })
  .strict();
