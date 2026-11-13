import type { VoiceSessionRecord } from "./voice-booking.repository";
import type { InitiateHandoffCommand } from "./voice-handoff.service";

/**
 * CALLCENTER-AI-ASSIST-20261111: pressing 0 at any point of an AI-handled
 * call asks for a human. The AI greeting announces it. Digits 1-3 stay
 * reserved for language selection and 1 for booking confirmation.
 */
export const HUMAN_HANDOFF_DIGIT = "0";

export function isHumanHandoffKeypress(
  eventType: string,
  payload: unknown,
): boolean {
  if (eventType !== "dtmf" && eventType !== "dtmf.received") {
    return false;
  }
  const digit =
    typeof payload === "object" && payload !== null
      ? (payload as { digit?: unknown }).digit
      : undefined;
  return digit === HUMAN_HANDOFF_DIGIT;
}

/** Only a call the AI still owns is handed over; a human already has the
 * others, and a closed call has nobody left to transfer. */
export function shouldHandOffOnKeypress(
  session: Pick<VoiceSessionRecord, "controlOwner" | "dialogState">,
): boolean {
  return session.controlOwner === "ai" && session.dialogState !== "closed";
}

export interface KeypressHandoffPort {
  initiateHandoff(command: InitiateHandoffCommand): Promise<unknown>;
}

/**
 * Hand the call to a human after the caller pressed 0. The session that
 * recorded the key press is the CAS baseline; if a concurrent AI turn
 * moved it on, re-read once and retry, so a caller pressing 0 is not
 * silently ignored. Never throws: the key-press event itself is already
 * durable and its acknowledgement must not fail because of the transfer.
 */
export async function handOffOnKeypress(
  port: KeypressHandoffPort,
  session: VoiceSessionRecord,
  reload: (voiceSessionId: string) => Promise<VoiceSessionRecord | null>,
  onError: (error: unknown) => void = () => undefined,
): Promise<boolean> {
  let current: VoiceSessionRecord | null = session;
  for (let attempt = 0; attempt < 2 && current; attempt += 1) {
    if (!shouldHandOffOnKeypress(current)) {
      return false;
    }
    try {
      await port.initiateHandoff({
        voiceSessionId: current.voiceSessionId,
        expectedSessionVersion: current.sessionVersion,
        expectedLeaseEpoch: current.leaseEpoch,
        reason: "customer_requested",
        priority: "normal",
        nextResponsibleParty: "human_agent",
      });
      return true;
    } catch (error) {
      if (attempt === 1) {
        onError(error);
        return false;
      }
      current = await reload(current.voiceSessionId).catch(() => null);
    }
  }
  return false;
}
