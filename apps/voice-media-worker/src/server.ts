import { MediaWorkerServer } from "./server/media-worker-server";
import { isStrictVoiceMediaEnvironment } from "./server/environment";
import { composeVoiceMediaProviders } from "./server/provider-composition";
import { VoiceSessionComposer } from "./server/session-composer";
import { VoiceCallTurnCoordinator } from "./dialogue/call-turn-coordinator";
import { composeVoiceDialogueProvider } from "./dialogue/dialogue-provider-composition";
import { createVoiceRecordingContinuation } from "./recording/recording-adapter-factory";
import type {
  RecordingContinuationSource,
  RecordingContinuationJournal,
} from "./recording/recording-continuation";
import type { VoiceCallAuthorityVerifier } from "./server/call-authority";
import { createVoiceRecordingAdapter } from "./recording/recording-adapter-factory";
import { createVoiceApiClient } from "./server/voice-api-client-factory";
import type { VoiceSessionBindingResolver } from "./dialogue/voice-session-binding";

/** The same canonical resolver consumed by main and socket-free composition. */
export function createVoiceSessionBindingResolver(
  client: Pick<
    import("./server/voice-api-client").VoiceApiClient,
    "getSession"
  >,
): VoiceSessionBindingResolver {
  return {
    resolve: async (voiceSessionId, signal) => {
      const { session, recordingContext } = await client.getSession(
        voiceSessionId,
        signal,
      );
      if (session.voiceSessionId !== voiceSessionId) {
        throw new Error(
          `voice session binding mismatch: requested '${voiceSessionId}' but apps/api returned session '${session.voiceSessionId}'`,
        );
      }
      if (!recordingContext?.brandId || !recordingContext.callId) {
        throw new Error(
          "voice session canonical recording context unavailable",
        );
      }
      return {
        voiceSessionId: session.voiceSessionId,
        resourceScopeId: session.resourceScopeId,
        brandId: recordingContext.brandId,
        callId: recordingContext.callId,
        routeProfileVersion: session.routeProfileVersion,
        leaseEpoch: session.leaseEpoch,
        sessionVersion: session.sessionVersion,
      };
    },
  };
}

async function main(
  options: {
    recordingSource?: RecordingContinuationSource;
    callAuthorityVerifier?: VoiceCallAuthorityVerifier;
  } = {},
) {
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
  const sessionBindingResolver = voiceApiClient
    ? createVoiceSessionBindingResolver(voiceApiClient)
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
  const recordingJournal: RecordingContinuationJournal | undefined =
    voiceApiClient
      ? {
          append: async (session, event) =>
            (
              await voiceApiClient.appendRecordingEvent(
                session,
                event,
                AbortSignal.timeout(8000),
              )
            ).event,
          read: async (session, scope) =>
            (
              await voiceApiClient.getRecordingEvents(
                session,
                AbortSignal.timeout(8000),
              )
            ).events.filter((event) =>
              (["brandId", "callId", "recordingId", "legId"] as const).every(
                (key) => !scope || event.scope[key] === scope[key],
              ),
            ),
        }
      : undefined;
  const recordingContinuation = createVoiceRecordingContinuation(
    process.env,
    options.recordingSource,
    recordingJournal,
  );
  const sessionComposer = new VoiceSessionComposer(
    composition.providerFactory,
    turnCoordinator,
    recordingContinuation,
  );

  const server = new MediaWorkerServer({
    sessionComposer,
    sessionBindingResolver,
    recordingContinuation,
    callAuthorityVerifier: options.callAuthorityVerifier,
    voiceRuntimeProductionCapable: composition.productionCapable,
    voiceRuntimeNotCapableReason: composition.notCapableReason,
    // The configured continuation above consumes real fork/closure events,
    // durable journal metadata and immutable S3 readback. The legacy adapter
    // preserves the original unconfigured-source denial when no upstream
    // recording source is supplied; storage configuration alone is insufficient.
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
  if (!options.callAuthorityVerifier)
    console.warn(
      "[voice-media-worker] No call-authority verifier is configured; admission and finalization remain unavailable until the external call/line authority is supplied.",
    );
  console.warn(
    "[voice-media-worker] Bound dialogue turns use the first-party API for durable snapshots, ordered control events, location, qualification and immutable readback. " +
      "Provider/model/issuer/recording-fork/storage resources remain explicit configured or SIM boundaries; no playback completion or WebSocket close constitutes consent or recorder closure.",
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
