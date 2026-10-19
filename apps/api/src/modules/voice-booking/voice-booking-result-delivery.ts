export const VOICE_BOOKING_RESULT_DELIVERY = Symbol(
  "VOICE_BOOKING_RESULT_DELIVERY",
);

export interface VoiceBookingResultMessage {
  idempotencyKey: string;
  commandId: string;
  voiceSessionId: string;
  brandId: string;
  callId: string;
  orderId: string | null;
  bookingStatus: "succeeded" | "rejected";
  errorCode: string | null;
}

/** External delivery adapters must replay the acknowledgement for this key. */
export interface VoiceBookingResultDelivery {
  readonly provider: string;
  deliver(message: VoiceBookingResultMessage): Promise<{
    status: "delivered" | "simulated";
    providerMessageId: string;
  }>;
}

/** Explicit review simulation; an absent external provider stays unavailable. */
export function createVoiceBookingResultDelivery(
  env: NodeJS.ProcessEnv = process.env,
): VoiceBookingResultDelivery | null {
  if (env.VOICE_BOOKING_RESULT_DELIVERY !== "simulation") return null;
  return {
    provider: "simulation",
    async deliver(message) {
      return {
        status: "simulated",
        providerMessageId: `simulation:${message.idempotencyKey}`,
      };
    },
  };
}
