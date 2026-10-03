import { MediaWorkerServer } from "./server/media-worker-server";
import { isStrictVoiceMediaEnvironment } from "./server/environment";
import { composeVoiceMediaProviders } from "./server/provider-composition";
import { VoiceSessionComposer } from "./server/session-composer";
import { VoiceCallTurnCoordinator } from "./dialogue/call-turn-coordinator";
import { composeVoiceDialogueProvider } from "./dialogue/dialogue-provider-composition";
import { createVoiceRecordingAdapter } from "./recording/recording-adapter-factory";
import { createVoiceApiClient } from "./server/voice-api-client-factory";
import type { VoiceSessionBindingResolver } from "./dialogue/voice-session-binding";

async function main() {
  const composition = composeVoiceMediaProviders();
  // Opt-in, fail-closed-when-absent (see
  // ./server/voice-api-client-factory.ts) -- `undefined` in every
  // environment this worker runs in today.
  const voiceApiClient = createVoiceApiClient();
  // AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-entry: the real consumer
  // `MediaWorkerServer.admitSession`'s `POST /sessions` handler now calls
  // to resolve a `VoiceSessionBinding` for a call-authority-admitted
  // session, before `sessionComposer.attach()` ever runs for it. Still
  // `undefined` in every environment this worker runs in today (no
  // `voiceApiClient`), and even when configured, resolution genuinely
  // fails until apps/api has a durable `voice.session` row for the admitted
  // id -- the real, still-missing SD §4.1 provider webhook is the actual
  // remaining external gate, not this wiring.
  const sessionBindingResolver: VoiceSessionBindingResolver | undefined =
    voiceApiClient
      ? {
          resolve: async (voiceSessionId, signal) => {
            const { session } = await voiceApiClient.getSession(
              voiceSessionId,
              signal,
            );
            return {
              voiceSessionId: session.voiceSessionId,
              resourceScopeId: session.resourceScopeId,
              routeProfileVersion: session.routeProfileVersion,
              leaseEpoch: session.leaseEpoch,
              sessionVersion: session.sessionVersion,
            };
          },
        }
      : undefined;
  // The dialogue *provider* always stays fixture-mode here regardless of
  // `composition.productionCapable`: no live VoiceDialogueProvider
  // implementation exists at all yet (see
  // ./providers/native-voice/native-voice-adapter.ts), so `production:
  // true` would make every turn fail closed with `voice_fixture_forbidden`
  // rather than ever actually speaking to a caller. R4 residual ("no
  // explicit non-strict fixture opt-in"): `composeVoiceDialogueProvider`
  // (see its own doc) now refuses to construct this provider at all in a
  // strict environment, and requires an explicit
  // `VOICE_DIALOGUE_PROVIDER_NAME=fixture` opt-in otherwise -- the same
  // fail-closed-unless-configured convention `composeVoiceMediaProviders`
  // already enforces for ASR/TTS, instead of this worker silently
  // defaulting to fixture mode just because nothing else exists.
  // `createProvider` throws per-attach (never at process startup) when
  // unconfigured; `MediaWorkerServer`'s existing WS-upgrade handler already
  // catches exactly that and closes the channel instead of crashing (see
  // `provider-composition.ts`'s own `createAdapters` for the same
  // established per-session fail-closed convention).
  const dialogueComposition = composeVoiceDialogueProvider();
  const turnCoordinator = new VoiceCallTurnCoordinator(
    dialogueComposition.createProvider,
    undefined,
    undefined,
    false,
    voiceApiClient,
  );
  const sessionComposer = new VoiceSessionComposer(
    composition.providerFactory,
    turnCoordinator,
  );

  const server = new MediaWorkerServer({
    sessionComposer,
    sessionBindingResolver,
    voiceRuntimeProductionCapable: composition.productionCapable,
    voiceRuntimeNotCapableReason: composition.notCapableReason,
    // `recordingAdapter` is now constructed whenever this worker's own
    // `VOICE_RECORDING_OBJECT_STORE_PROVIDER` is configured (see
    // ./recording/recording-adapter-factory.ts): the dependency-manifest/
    // lockfile gap that previously blocked a concrete `ObjectStoreClient`
    // backend is resolved -- `@aws-sdk/client-s3` is now this package's own
    // dependency (AUDIT-DEPENDENCY-GATES-20261002 #2287 delegated that
    // addition to this task; see
    // docs/04-uat/audit-voice-application-wiring-20261003.md). `undefined`
    // when unconfigured (e.g. this VM, with no `VOICE_RECORDING_S3_*`
    // variables set), which still correctly fails `/recording/finalize`
    // closed at 503 exactly as before. Even when configured, sealing a
    // recording still correctly fails closed: the adapter's
    // `RecordingClosureLedger` has no trusted call-close event source yet
    // (that is the separate, still-missing `apps/api/src/modules/cti-ivr`
    // `callAuthorityVerifier` channel below is also blocked on), so
    // `/recording/finalize` now fails at that specific, real remaining
    // gate instead of a generic "adapter not configured" one.
    recordingAdapter: createVoiceRecordingAdapter(),
  });

  if (
    isStrictVoiceMediaEnvironment() &&
    !process.env.VOICE_MEDIA_INTERNAL_KEY
  ) {
    console.error(
      "[voice-media-worker] VOICE_MEDIA_INTERNAL_KEY is not set in a staging/production environment; " +
        "/drain, /sessions, /recording/finalize and the WebSocket upgrade will refuse every request until it is configured.",
    );
  }
  console.warn(
    `[voice-media-worker] ${composition.notCapableReason} /ready will report not-ready in a staging/production environment.`,
  );
  if (isStrictVoiceMediaEnvironment()) {
    console.warn(
      `[voice-media-worker] ${dialogueComposition.notCapableReason} Every attach() will fail closed in this staging/production environment.`,
    );
  } else if (process.env.VOICE_DIALOGUE_PROVIDER_NAME?.trim() !== "fixture") {
    console.warn(
      "[voice-media-worker] VOICE_DIALOGUE_PROVIDER_NAME is not set to 'fixture'; every attach() will " +
        "fail closed until this non-strict environment explicitly opts into fixture-mode dialogue " +
        "(see ./dialogue/dialogue-provider-composition.ts).",
    );
  }
  console.warn(
    "[voice-media-worker] No call-authority verifier is configured (apps/api/src/modules/cti-ivr, " +
      "which would issue/verify these tokens from the real call/line authority, does not exist yet -- " +
      "see docs/04-uat/audit-voice-runtime-20261002.md). POST /sessions and POST /recording/finalize " +
      "will refuse every request (503) until one is wired.",
  );
  console.warn(
    "[voice-media-worker] Dialogue turns run against the real VoiceDialogueEngine/VoiceDialogueState " +
      "machinery; every tool proposal other than request_handoff still forces an honest 'unavailable' " +
      "handoff (no reachable domain-execution channel for any other tool exists). Codex reopen round " +
      "5/6 (R4) built the issuance route, the VoiceCapabilityGuard-guarded sessions/:id/input-resolutions " +
      "and sessions/:id/handoffs routes, and this worker's own VoiceApiClient to call them -- an earlier " +
      "version of this message claiming none of that existed is now obsolete and explicitly superseded. " +
      "persist() uses that client for any attachment resolveSessionBinding (MediaWorkerServer's own " +
      "POST /sessions admission, R4-entry) actually resolves a real VoiceSessionBinding for -- which " +
      "still genuinely fails today, since apps/api has no durable voice.session row for any admitted id " +
      "until the real, still-missing SD §4.1 provider webhook creates one -- and otherwise remains the " +
      "original in-process-only no-op. recordAuthoritativeSpeechStart calls sessions/:id/events on a real " +
      "speech-start, but Codex reopen round 15 (R4-control) found that is not yet the ordered, gap-" +
      "recoverable control-event ingestion SD §5.4 requires. See " +
      "docs/04-uat/audit-voice-application-wiring-20261003.md.",
  );

  let draining = false;
  const handleShutdown = async (signal: string) => {
    if (draining) return;
    draining = true;
    console.log(
      `[voice-media-worker] Received ${signal}, starting graceful drain...`,
    );
    try {
      const result = await server.drain();
      console.log(
        `[voice-media-worker] Drain complete. Drained ${result.drainedSessions} sessions (timedOut: ${result.timedOut}). Exiting.`,
      );
      process.exit(0);
    } catch (err) {
      console.error("[voice-media-worker] Error during drain:", err);
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => void handleShutdown("SIGTERM"));
  process.on("SIGINT", () => void handleShutdown("SIGINT"));

  const port = await server.start();
  console.log(
    `[voice-media-worker] Started on port ${port} (version: 0.1.0, env: ${process.env.NODE_ENV ?? "development"})`,
  );
}

if (require.main === module) {
  void main();
}

export { main };
