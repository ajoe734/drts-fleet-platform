import type { VoiceDialogueState } from "./dialogue-state";
import type { VoiceDialogueRequest } from "./voice-dialogue-provider";
import type { VoiceSessionBinding } from "./voice-session-binding";
import type {
  IssueCapabilityCommand,
  VoiceApiClient,
} from "../server/voice-api-client";

/**
 * Explicitly isolates fixture-mode persistence from a trusted, durable
 * runtime port (Codex reopen round 2/3, R4): `VoiceCallTurnCoordinator`
 * previously supplied a bare, always-successful no-op closure with no type
 * distinguishing it from a real CAS-backed persist, so missing/rejected/
 * stale persistence could never be represented at all, let alone fail
 * closed before the dependent state-commit/tool-execution/playback
 * `VoiceDialogueEngine.turn` otherwise gates on it.
 *
 * `mode: "fixture"` ports must never claim durability: `persist` may
 * succeed (so this worker's own in-memory conversation can proceed in the
 * absence of a reachable session store), but nothing it does outlives
 * this process, and `VoiceCallTurnCoordinator` refuses to run one for a
 * `production: true` engine (see `createFixtureDialoguePersistPort`'s own
 * doc and `VoiceCallTurnCoordinator`'s constructor) -- a caller cannot
 * accidentally end up fabricating authority this way.
 *
 * `mode: "trusted"` is the seam a real port implements once one exists:
 * `apps/api`'s DB-backed `VoiceSessionService` (`resolveInput`,
 * `recordControlEvent`) already provides the authoritative revision/
 * input/lease CAS `VoiceDialogueTurnPorts.persist`'s own contract
 * requires -- what is missing is only the issuance/route/HTTP-client
 * triple this worker needs to reach it (see `VoiceCallTurnCoordinator`'s
 * class doc), not a port shape to persist through once that exists. A
 * `mode: "trusted"` port's `persist` must reject (never silently
 * no-op/succeed) on an absent, rejected, or stale CAS so
 * `VoiceDialogueEngine.turn`'s existing fail-closed gating actually has
 * something to gate on.
 */
export interface VoiceDialoguePersistPort {
  readonly mode: "fixture" | "trusted";
  persist(
    state: VoiceDialogueState,
    request: VoiceDialogueRequest,
  ): Promise<void>;
}

/**
 * The only persist port this worker can honestly provide today (see
 * `VoiceCallTurnCoordinator`'s class doc): no durable per-call session
 * store is reachable from this process -- that is `voice.session` in
 * apps/api's Postgres, behind an HTTP client/issuance/route triple this
 * worker does not have. `VoiceDialogueEngine`'s own in-memory
 * `Object.assign(state, next)` immediately after this resolves is the
 * only persistence this port can honestly provide, scoped to this
 * process's own lifetime (lost on restart, never shared with apps/api,
 * never a CAS against any authoritative revision). Callers must never
 * mistake its success for a durable commit.
 */
export function createFixtureDialoguePersistPort(): VoiceDialoguePersistPort {
  return {
    mode: "fixture",
    async persist() {
      // Intentionally empty -- see class doc above.
    },
  };
}

const PERSIST_CAPABILITY_SCOPES: IssueCapabilityCommand["scopes"] = [
  "session_execute",
];

/**
 * The `mode: "trusted"` port this class's own doc names as the seam to
 * implement once the issuance/route/HTTP-client triple exists (Codex
 * reopen round 5/6, R4) -- `VoiceApiClient` is that triple.
 * `VoiceSessionService.resolveInput` (apps/api) is the authoritative CAS
 * this maps onto: every admitted turn that reaches `persist()` already
 * represents real dialogue content the engine decided to act on, so it is
 * always submitted as `resolution: "relevant"`, never "irrelevant" (that
 * value is for an explicitly-unrelated utterance the engine never even
 * reaches this port for).
 *
 * `binding` is a live accessor, not a snapshot: it must always return
 * `undefined` until a real call-admission flow supplies one for this
 * attachment (none exists yet, see `../dialogue/voice-session-binding.ts`),
 * and `persist` rejects rather than silently no-op/succeed in that case --
 * a `production: true` engine must never be told persistence succeeded
 * when there was nothing trustworthy to persist through.
 */
export function createTrustedDialoguePersistPort(
  client: VoiceApiClient,
  binding: () => VoiceSessionBinding | undefined,
): VoiceDialoguePersistPort {
  return {
    mode: "trusted",
    async persist(_state, request) {
      const current = binding();
      if (!current) {
        throw new Error(
          "voice_trusted_persist_unbound: no VoiceSessionBinding is attached for this session.",
        );
      }
      const capability = await client.issueCapability({
        voiceSessionId: current.voiceSessionId,
        resourceScopeId: current.resourceScopeId,
        routeProfileVersion: current.routeProfileVersion,
        leaseEpoch: current.leaseEpoch,
        scopes: PERSIST_CAPABILITY_SCOPES,
      });
      const result = await client.resolveInput(
        current.voiceSessionId,
        capability.token,
        {
          expectedSessionVersion: current.sessionVersion,
          inputEpoch: request.inputEpoch,
          resolution: "relevant",
        },
      );
      // The CAS write just advanced the authoritative revision -- the next
      // call through this same binding must submit *that* value, never the
      // one just consumed, or every subsequent call would deterministically
      // fail as stale.
      current.sessionVersion = result.session.sessionVersion;
    },
  };
}
