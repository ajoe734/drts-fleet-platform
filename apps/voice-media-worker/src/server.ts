import { MediaWorkerServer } from "./server/media-worker-server";
import { isStrictVoiceMediaEnvironment } from "./server/environment";
import { composeVoiceMediaProviders } from "./server/provider-composition";
import { VoiceSessionComposer } from "./server/session-composer";

async function main() {
  const composition = composeVoiceMediaProviders();
  const sessionComposer = new VoiceSessionComposer(composition.providerFactory);

  const server = new MediaWorkerServer({
    sessionComposer,
    voiceRuntimeProductionCapable: composition.productionCapable,
    voiceRuntimeNotCapableReason: composition.notCapableReason,
    // No durable `RecorderObjectStore` implementation exists yet (see
    // docs/04-uat/audit-voice-runtime-20261002.md) -- leaving
    // `recordingAdapter` unset means `/recording/finalize` correctly fails
    // closed (503) rather than claiming a storage backend this worker does
    // not actually have.
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
