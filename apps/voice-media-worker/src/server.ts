import { MediaWorkerServer } from "./server/media-worker-server";
import { isStrictVoiceMediaEnvironment } from "./server/environment";
import { composeVoiceMediaProviders } from "./server/provider-composition";
import { VoiceSessionComposer } from "./server/session-composer";
import { VoiceCallTurnCoordinator } from "./dialogue/call-turn-coordinator";
import { OpenAiRealtimeFixtureAdapter } from "./providers/native-voice/native-voice-adapter";
import { createVoiceRecordingAdapter } from "./recording/recording-adapter-factory";
import { createVoiceApiClient } from "./server/voice-api-client-factory";

async function main() {
  const composition = composeVoiceMediaProviders();
  // Opt-in, fail-closed-when-absent (see
  // ./server/voice-api-client-factory.ts) -- `undefined` in every
  // environment this worker runs in today. Even when configured, it has
  // no observable effect yet: nothing below supplies any attachment a
  // `VoiceSessionBinding` (no call-admission flow exists -- see
  // ./dialogue/voice-session-binding.ts), which `VoiceCallTurnCoordinator`
  // requires before it will use this client for a given attachment at
  // all (see its own `attach()` doc).
  const voiceApiClient = createVoiceApiClient();
  // The dialogue *provider* always stays fixture-mode here regardless of
  // `composition.productionCapable`: no live VoiceDialogueProvider
  // implementation exists at all yet (see
  // ./providers/native-voice/native-voice-adapter.ts), so `production:
  // true` would make every turn fail closed with `voice_fixture_forbidden`
  // rather than ever actually speaking to a caller.
  const turnCoordinator = new VoiceCallTurnCoordinator(
    () => new OpenAiRealtimeFixtureAdapter(),
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
      "persist() uses that client for any attachment a real VoiceSessionBinding is supplied to (none is, " +
      "today -- no call-admission flow exists yet) and otherwise remains the original in-process-only " +
      "no-op. A further route/client (sessions/:id/events, backing VoiceSessionService.recordControlEvent's " +
      "durable speech-start watermark) exists but this coordinator does not yet call it during a live " +
      "turn. See docs/04-uat/audit-voice-application-wiring-20261003.md.",
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
