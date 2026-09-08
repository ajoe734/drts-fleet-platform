import { z } from "zod";

/** SD §6.4: immutable requirements carried through dispatch, never just notes. */
export const bookingRequirementsSchema = z.object({
  passengerCount: z.number().int().min(1),
  luggageCount: z.number().int().min(0),
  luggageSize: z.enum(["standard", "oversized"]),
  requiredCapabilities: z.array(z.enum(["wheelchair", "child_seat"])),
  bookerContact: z.object({ name: z.string(), phone: z.string().min(1) }).strict(),
  passengerContact: z.object({ name: z.string(), phone: z.string().min(1) }).strict(),
  driverContactRole: z.enum(["booker", "passenger"]),
  policyVersion: z.string().min(1),
  validationReference: z.string().min(1),
}).strict();

export type BookingRequirements = z.infer<typeof bookingRequirementsSchema>;
