import { MediaWorkerServer } from "./server/media-worker-server";
import { isStrictVoiceMediaEnvironment } from "./server/environment";
import { composeVoiceMediaProviders } from "./server/provider-composition";
import { VoiceSessionComposer } from "./server/session-composer";
import { VoiceCallTurnCoordinator } from "./dialogue/call-turn-coordinator";
import { OpenAiRealtimeFixtureAdapter } from "./providers/native-voice/native-voice-adapter";

async function main() {
  const composition = composeVoiceMediaProviders();
  // The dialogue *provider* always stays fixture-mode here regardless of
  // `composition.productionCapable`: no live VoiceDialogueProvider
  // implementation exists at all yet (see
  // ./providers/native-voice/native-voice-adapter.ts), so `production:
  // true` would make every turn fail closed with `voice_fixture_forbidden`
  // rather than ever actually speaking to a caller.
  const turnCoordinator = new VoiceCallTurnCoordinator(
    () => new OpenAiRealtimeFixtureAdapter(),
  );
  const sessionComposer = new VoiceSessionComposer(
    composition.providerFactory,
    turnCoordinator,
  );

  const server = new MediaWorkerServer({
    sessionComposer,
    voiceRuntimeProductionCapable: composition.productionCapable,
    voiceRuntimeNotCapableReason: composition.notCapableReason,
    // `recordingAdapter` stays unset so `/recording/finalize` correctly
    // fails closed (503). Two independent, precisely-scoped gaps block it
    // (see docs/04-uat/audit-voice-application-wiring-20261003.md):
    // (1) `RecorderObjectStore` has a real, unit-tested implementation
    // against the provider-neutral `ObjectStoreClient` seam
    // (./recording/object-store-recorder.ts) but no concrete backend
    // client -- that needs `@aws-sdk/client-s3` added to this package's
    // own dependencies, a manifest/lockfile change outside this task's
    // write_scopes requiring the dependency-gates owner's coordination;
    // (2) `RecordingClosureLedger` needs a trusted call-close event from
    // the real call/line authority, which is the same missing
    // `apps/api/src/modules/cti-ivr` channel `callAuthorityVerifier` below
    // is blocked on -- resolving (1) alone would still not unblock
    // `MediaRecordingAdapter`.
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
      "machinery but every tool proposal other than request_handoff forces an honest 'unavailable' " +
      "handoff, and persist() is an in-process-only no-op: apps/api's VoiceToolGatewayService/" +
      "VoiceSessionService already exist and are DB-backed, but apps/api exposes no authenticated " +
      "HTTP route for a live turn to reach them, and this worker has no capability-token issuance " +
      "path to call one if it existed -- that reviewed cross-service contract (route + token " +
      "issuance), not a missing 'apps/api/src/modules/cti-ivr' folder, is the exact unresolved " +
      "decision. See docs/04-uat/audit-voice-application-wiring-20261003.md.",
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
