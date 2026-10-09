import { VoiceApiClient } from "./voice-api-client";
import { GoogleMetadataIdentityTokenSource } from "./workload-identity-token-source";

/**
 * Opt-in, fail-closed-when-absent composition for the first-party worker/
 * API client (Codex reopen round 5/6, R4) -- the same posture every other
 * provider seam in this worker already uses (TWM in
 * `./provider-composition.ts`, the S3 recording backend in
 * `../recording/recording-adapter-factory.ts`). Returns `undefined` when
 * `VOICE_API_BASE_URL` is unset, which is every environment this worker
 * currently runs in (this VM, CI): nothing in `../server.ts` or
 * `./session-composer.ts`'s actual composition supplies a
 * `VoiceSessionBinding` to any attachment yet (no call-admission flow
 * exists -- see `../dialogue/voice-session-binding.ts`), so a configured
 * client with no bound attachment to use it for is harmless, not a
 * fabricated "trusted" claim.
 */
export function createVoiceApiClient(
  env: NodeJS.ProcessEnv = process.env,
): VoiceApiClient | undefined {
  const baseUrl = env.VOICE_API_BASE_URL?.trim();
  if (!baseUrl) return undefined;

  const audience = env.VOICE_API_WORKLOAD_AUDIENCE?.trim() || baseUrl;
  const tokenSource = new GoogleMetadataIdentityTokenSource({ audience });
  return new VoiceApiClient({ baseUrl }, tokenSource);
}
