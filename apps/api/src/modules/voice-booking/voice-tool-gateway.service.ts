import { z } from "zod";
import { voiceDialogueOutputSchema, type VoiceCapabilityTokenClaims, type VoiceToolProposal } from "@drts/contracts";
import { VoiceCapabilityGuard } from "../../common/auth/voice-capability.guard";
import { assertVoiceCapabilityScope } from "../../common/auth/voice-capability.service";
import { VoiceBookingRepository } from "./voice-booking.repository";
import { VoiceBookingAuthorizationService } from "./voice-booking-authorization.service";

const label = z.string().min(1).max(500);
const results = {
  resolve_location: z.object({ candidates: z.array(z.object({ placeId: label, label, region: label }).strict()).max(3) }).strict(),
  check_booking_eligibility: z.object({ status: z.enum(["serviceable", "manual_review", "not_serviceable"]), reason: label }).strict(),
  prepare_booking_readback: z.object({ script: z.string().min(1).max(4000), playbackTaskId: label, draftVersion: z.number().int().nonnegative() }).strict(),
  get_bound_booking_status: z.object({ orderId: label, status: label }).strict().nullable(),
  request_handoff: z.object({ status: z.enum(["queued", "connected", "unavailable"]), handoffId: label.nullable() }).strict(),
};

/** Trusted domain adapters must revalidate scope, service area, draft freshness
 * and CAS control ownership at their read/transaction boundary. No generic
 * HTTP, mutation, price or driver-selection port is available to the model. */
export interface VoiceToolDomainPorts {
  execute(proposal: VoiceToolProposal, context: {
    claims: VoiceCapabilityTokenClaims; inputEpoch: number;
    boundOrderId: string | null; signal: AbortSignal;
  }): Promise<unknown>;
}

/** One instance per admitted turn; retries share this instance and budget.
 * Not registered until real domain ports are supplied: there is no mock
 * production fallback or endpoint accepting caller-supplied claims. */
export class VoiceToolGatewayService {
  private used = 0;
  private running = false;
  private stopped = false;

  constructor(
    private readonly guard: VoiceCapabilityGuard,
    private readonly repository: VoiceBookingRepository,
    private readonly authorization: VoiceBookingAuthorizationService,
    private readonly ports: VoiceToolDomainPorts,
    private readonly turn: { headers: Record<string, string | string[] | undefined>; inputEpoch: number; deadline: number; signal: AbortSignal },
  ) {}

  async execute(raw: unknown): Promise<unknown[]> {
    if (this.running || this.stopped) throw new Error("voice_tool_turn_closed");
    const output = voiceDialogueOutputSchema.parse(raw);
    const handoffReasons: Record<string, string> = { human: "customer_requested", complaint: "customer_requested", lost_property: "customer_requested", emergency: "urgent_safety", cancel: "service_unsupported", amend: "service_unsupported", reservation: "service_unsupported" };
    const reason = handoffReasons[output.intent];
    const proposals: VoiceToolProposal[] = reason || output.terminal === "handoff"
      ? [{ name: "request_handoff", args: { reason: (reason ?? "customer_requested") as "customer_requested" | "urgent_safety" | "service_unsupported" } }]
      : output.tools;
    if (this.used + proposals.length > 3) throw new Error("voice_tool_budget_exceeded");
    this.used += proposals.length;
    this.running = true;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancel = () => {};
    try {
      const remaining = this.turn.deadline - Date.now();
      if (!Number.isFinite(remaining) || remaining <= 0 || remaining > 30_000) throw new Error("voice_deadline_invalid");
      const cancelled = new Promise<never>((_, reject) => {
        cancel = () => { controller.abort(); reject(new Error("voice_aborted")); };
        this.turn.signal.addEventListener("abort", cancel, { once: true });
        timer = setTimeout(cancel, remaining);
      });
      if (this.turn.signal.aborted) cancel();
      return await Promise.race([cancelled, (async () => {
        const collected: unknown[] = [];
        for (const proposal of proposals) {
          controller.signal.throwIfAborted();
          const claims = await this.guard.authenticate(this.turn.headers);
          const assertCurrent = async () => {
            controller.signal.throwIfAborted();
            const session = await this.repository.findSessionById(claims.voiceSessionId);
            if (!session || session.resourceScopeId !== claims.resourceScopeId || session.leaseEpoch !== claims.leaseEpoch || session.inputEpoch !== this.turn.inputEpoch || session.controlOwner !== "ai" || session.dialogState === "closed") throw new Error("voice_tool_stale_session");
            controller.signal.throwIfAborted();
          };
          await assertCurrent();
          assertVoiceCapabilityScope(claims, "session_execute");
          assertVoiceCapabilityScope(claims, proposal.name === "resolve_location" ? "address_resolve" : proposal.name === "get_bound_booking_status" ? "order_read_bound" : proposal.name === "request_handoff" ? "handoff_request" : "session_execute");
          const bound = proposal.name === "get_bound_booking_status" ? await this.authorization.getBoundBookingStatus(claims) : null;
          await assertCurrent();
          const value = proposal.name === "get_bound_booking_status" && !bound ? null : await this.ports.execute(proposal, { claims, inputEpoch: this.turn.inputEpoch, boundOrderId: bound?.orderId ?? null, signal: controller.signal });
          controller.signal.throwIfAborted();
          if (proposal.name !== "request_handoff") await assertCurrent();
          else this.stopped = true;
          const parsed = results[proposal.name].parse(value);
          if (proposal.name === "get_bound_booking_status" && parsed && "orderId" in parsed && parsed.orderId !== bound?.orderId) throw new Error("voice_tool_order_mismatch");
          collected.push(parsed);
        }
        return collected;
      })()]);
    } catch (error) {
      this.stopped = true;
      throw error;
    } finally {
      clearTimeout(timer);
      this.turn.signal.removeEventListener("abort", cancel);
      controller.abort();
      this.running = false;
    }
  }
}
