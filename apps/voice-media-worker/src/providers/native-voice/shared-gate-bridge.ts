import {
  voiceToolProposalSchema,
  type VoiceDialogueOutput,
  type VoiceToolProposal,
} from "@drts/contracts";
import type {
  RealtimeToolDefinition,
  RealtimeFunctionCallArgumentsDoneEvent,
  NativeVoiceTruncationRecord,
} from "./types";
import type { VoiceMediaOutputFence } from "../../media/output-fence";
import type { VoiceConfirmationController } from "../../dialogue/confirmation/confirmation-controller";

/**
 * Maps the canonical DRTS voice tools into the OpenAI Realtime function calling schema.
 * Only these whitelisted tools can be called by the native voice model.
 */
export const DRTS_REALTIME_TOOLS: RealtimeToolDefinition[] = [
  {
    type: "function",
    name: "resolve_location",
    description: "Geocode and normalize an address or landmark within supported service areas.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Raw address or landmark spoken by the caller.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "check_booking_eligibility",
    description: "Check booking qualification and product availability for collected details.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "prepare_booking_readback",
    description: "Prepare deterministic readback script and snapshot hash before asking confirmation.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "get_bound_booking_status",
    description: "Query current status of an already bound booking order for this caller.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "request_handoff",
    description: "Transfer call to human operator queue upon failure or customer request.",
    parameters: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          enum: [
            "customer_requested",
            "location_unresolved",
            "service_unsupported",
            "urgent_safety",
            "provider_unavailable",
          ],
        },
      },
      required: ["reason"],
      additionalProperties: false,
    },
  },
];

/**
 * Validates and maps a Realtime function call event into a canonical VoiceToolProposal.
 * Fails closed if the tool name is unknown or arguments fail Zod parsing.
 */
export function parseRealtimeFunctionCall(
  event: RealtimeFunctionCallArgumentsDoneEvent,
): VoiceToolProposal {
  let parsedArgs: unknown;
  try {
    parsedArgs = JSON.parse(event.arguments || "{}");
  } catch (err) {
    throw new Error(`Invalid JSON in Realtime function call arguments: ${event.arguments}`);
  }

  const proposal = voiceToolProposalSchema.safeParse({
    name: event.name,
    args: parsedArgs,
  });

  if (!proposal.success) {
    throw new Error(
      `Realtime function call violates tool proposal schema: ${proposal.error.message}`,
    );
  }

  return proposal.data;
}

/**
 * Enforces the shared cancellation and timing fence for caller barge-in.
 * Truncates model audio playback, invalidates in-flight readbacks, and increments output generation.
 */
export class RealtimeSharedGateBridge {
  private truncationHistory: NativeVoiceTruncationRecord[] = [];

  constructor(
    private readonly fence?: VoiceMediaOutputFence,
    private readonly confirmationController?: VoiceConfirmationController,
  ) {}

  /**
   * Called when server VAD detects caller speech onset (input_audio_buffer.speech_started).
   * Immediately clears the output sink and invalidates active readback.
   */
  async handleBargeIn(itemId: string, audioEndMs: number): Promise<NativeVoiceTruncationRecord> {
    const record: NativeVoiceTruncationRecord = {
      itemId,
      audioEndMs,
      truncatedAt: new Date().toISOString(),
      reason: "caller_barge_in",
    };
    this.truncationHistory.push(record);

    // 1. Synchronously halt audio playback and advance generation in OutputFence
    if (this.fence) {
      this.fence.localClear();
    }

    // 2. Invalidate active readback plan in VoiceConfirmationController
    if (this.confirmationController) {
      await this.confirmationController.interrupt("unknown_input");
    }

    return record;
  }

  /**
   * Verifies that the model output does not bypass the transaction confirmation gate.
   * Model output can never directly create an order without passing through the transactional
   * receipt service guarded by verified confirmation proof.
   */
  validateNoBypassedMutations(output: VoiceDialogueOutput): void {
    for (const tool of output.tools) {
      // Disallowed mutation tools that must only be called via transactional service
      if ((tool.name as string) === "create_booking_receipt" || (tool.name as string) === "create_order") {
        throw new Error(
          "Direct booking mutation tool forbidden from dialogue proposal; must pass through confirmation gate.",
        );
      }
    }
  }

  getTruncationHistory(): readonly NativeVoiceTruncationRecord[] {
    return this.truncationHistory;
  }
}
