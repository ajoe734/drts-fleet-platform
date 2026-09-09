import type { VoiceDialogueOutput, VoiceToolProposal } from "@drts/contracts";
import { VoiceCapabilityRegistry } from "./capability-registry";
import { VoiceIntentRouter, type IntentRoutingContext } from "./intent-router";

/**
 * IntentRoutingGuard enforces runtime isolation and capability bounds
 * before dialogue output reaches tool execution or TTS playback.
 *
 * SD §12.3/§12.4:
 * - Mutation tools for cancel/amend/reservation are refused when capability is closed.
 * - Dialogue text must not falsely report completion.
 * - Scheduled time must never be silently converted into an immediate booking.
 * - Multi-vehicle or duplicate orders are diverted from creating unwanted bookings.
 */
export class IntentRoutingGuard {
  private readonly router: VoiceIntentRouter;

  constructor(
    private readonly registry: VoiceCapabilityRegistry = new VoiceCapabilityRegistry(),
  ) {
    this.router = new VoiceIntentRouter(this.registry);
  }

  /**
   * Sanitizes dialogue output and tool proposals.
   * If capability is disabled or diversion condition is met, replaces proposals
   * with request_handoff and adjusts terminal to handoff.
   */
  guardDialogueOutput(
    output: VoiceDialogueOutput,
    context: IntentRoutingContext = {},
  ): {
    guardedOutput: VoiceDialogueOutput;
    diverted: boolean;
    divertReason?: string;
  } {
    const routed = this.router.route(output, context);

    if (routed.diverted) {
      const guardedOutput: VoiceDialogueOutput = {
        ...output,
        intent: routed.intent,
        terminal: "handoff",
        tools: routed.tools,
        text: routed.promptZh,
      };

      return {
        guardedOutput,
        diverted: true,
        divertReason: routed.divertReason,
      };
    }

    // Secondary assertion: ensure no mutation proposal is allowed if capability is disabled
    const safeTools = output.tools.filter((tool) => {
      if (
        (tool.name as string) === "cancel_booking" &&
        this.registry.isDisabled("order_cancel")
      ) {
        return false;
      }
      if (
        (tool.name as string) === "amend_booking" &&
        this.registry.isDisabled("order_amend")
      ) {
        return false;
      }
      if (
        (tool.name as string) === "create_reservation" &&
        this.registry.isDisabled("order_reservation")
      ) {
        return false;
      }
      return true;
    });

    const hasBlockedTool = safeTools.length < output.tools.length;

    const guardedOutput: VoiceDialogueOutput = hasBlockedTool
      ? {
          ...output,
          terminal: "handoff",
          tools: [
            {
              name: "request_handoff",
              args: { reason: "service_unsupported" },
            },
          ],
          text: "該項操作目前不支援自動處理，將為您轉接專員為您服務。",
        }
      : {
          ...output,
          tools: safeTools,
        };

    return {
      guardedOutput,
      diverted: hasBlockedTool,
      divertReason: hasBlockedTool ? "capability_disabled" : undefined,
    };
  }

  /**
   * Asserts whether a given tool proposal is permitted by current registry capabilities.
   * Throws if proposal requires a disabled capability.
   */
  assertToolProposalPermitted(proposal: VoiceToolProposal): void {
    if (proposal.name === "resolve_location") {
      this.registry.assertCapabilityEnabled("order_create");
    } else if (proposal.name === "get_bound_booking_status") {
      if (this.registry.isDisabled("order_query")) {
        throw new Error("voice_capability_disabled:order_query");
      }
    }
  }
}
