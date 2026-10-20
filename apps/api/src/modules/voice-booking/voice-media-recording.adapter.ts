import { isDeepStrictEqual } from "node:util";
import {
  voiceRecordingFinalizationSchema,
  type VoiceRecordingFinalization,
} from "@drts/contracts";
import { VoiceBookingRepository } from "./voice-booking.repository";
import type {
  FinalizeRecordingParams,
  VoiceMediaRecordingAdapter,
} from "./voice-evidence.service";

/** Existing upstream call authority, independently issued for finalize. Missing
 * issuance/configuration remains an external unavailable boundary. */
export const VOICE_RECORDING_FINALIZE_AUTHORITY = Symbol(
  "VOICE_RECORDING_FINALIZE_AUTHORITY",
);
export interface VoiceRecordingFinalizeAuthority {
  resolve(
    params: FinalizeRecordingParams,
  ): Promise<{ sessionId: string; callAuthorityToken: string }>;
}
export function validateFinalRecordingResult(
  raw: unknown,
  expected?: {
    brandId: string;
    callId: string;
    recordingId: string;
    legId?: string | null | undefined;
  },
): VoiceRecordingFinalization {
  const value = raw as Partial<VoiceRecordingFinalization> | null;
  const parsed = voiceRecordingFinalizationSchema.safeParse({
    scope: value?.scope,
    recordingId: value?.recordingId,
    manifestRef: value?.manifestRef,
    coverage: value?.coverage,
    verifiedAt: value?.verifiedAt,
  });
  if (!parsed.success)
    throw new Error(
      "voice_recording_manifest_unverified: incomplete immutable identity/version/checksum/coverage",
    );
  const final = parsed.data;
  if (
    Object.values(final.scope).some(value=>!value.trim()) || !final.manifestRef.objectKey.trim() || !final.manifestRef.objectVersion.trim() ||
    !final.coverage.closedEventId.trim() || final.recordingId !== final.scope.recordingId ||
    Date.parse(final.manifestRef.durableAt) > Date.parse(final.verifiedAt) ||
    Date.parse(final.coverage.endedAt) >
      Date.parse(final.manifestRef.durableAt) ||
    (expected &&
      (final.scope.brandId !== expected.brandId ||
        final.scope.callId !== expected.callId ||
        final.scope.recordingId !== expected.recordingId ||
        (expected.legId != null && final.scope.legId !== expected.legId)))
  )
    throw new Error(
      "voice_recording_manifest_unverified: recording scope/coverage correlation mismatch",
    );
  return final;
}
export class FirstPartyVoiceMediaRecordingAdapter implements VoiceMediaRecordingAdapter {
  constructor(
    private readonly repository: VoiceBookingRepository,
    private readonly authority: VoiceRecordingFinalizeAuthority,
    private readonly config: {
      baseUrl: string;
      internalKey: string;
      fetchImpl?: typeof fetch;
    },
  ) {}
  async finalizeRecording(
    params: FinalizeRecordingParams,
  ): Promise<VoiceRecordingFinalization> {
    if (!params.voiceSessionId)
      throw new Error("voice_recording_session_required");
    const scope = await this.repository.resolveRecordingContinuationScope(
      params.voiceSessionId,
    );
    if (
      scope.brandId !== params.scope.brandId ||
      scope.callId !== params.scope.callId ||
      (params.scope.recordingId &&
        scope.recordingId !== params.scope.recordingId) ||
      (params.scope.legId && scope.legId !== params.scope.legId)
    )
      throw new Error("voice_recording_context_mismatch");
    const events = await this.repository.readRecordingContinuation(
      params.voiceSessionId,
      scope,
    );
    const closed = events.find((e) => e.kind === "closure");
    if (!closed || closed.kind !== "closure")
      throw new Error("voice_recording_closure_unavailable");
    const access = await this.authority.resolve({ ...params, scope });
    const response = await (this.config.fetchImpl ?? fetch)(
      new URL("/recording/finalize", this.config.baseUrl),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-drts-internal-key": this.config.internalKey,
        },
        // Segments and closure come from the durable producer journal, not body.
        body: JSON.stringify({
          sessionId: access.sessionId,
          callAuthorityToken: access.callAuthorityToken,
        }),
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!response.ok)
      throw new Error(`voice_recording_worker_unavailable:${response.status}`);
    const final = validateFinalRecordingResult(await response.json(), scope);
    if (
      final.coverage.endMs !== closed.payload.endMs ||
      final.coverage.closedEventId !== closed.payload.closedEventId ||
      final.coverage.endedAt !== closed.payload.endedAt
    )
      throw new Error("voice_recording_closure_mismatch");
    const durable = (
      await this.repository.readRecordingContinuation(
        params.voiceSessionId,
        scope,
      )
    ).find((e) => e.kind === "finalized");
    if (!durable || !isDeepStrictEqual(durable.payload, final))
      throw new Error("voice_recording_final_manifest_not_journaled");
    return final;
  }
}
export function createVoiceMediaRecordingAdapter(
  repository: VoiceBookingRepository,
  authority: VoiceRecordingFinalizeAuthority | undefined,
  env: NodeJS.ProcessEnv = process.env,
): VoiceMediaRecordingAdapter | undefined {
  const baseUrl = env.VOICE_MEDIA_WORKER_BASE_URL?.trim(),
    internalKey = env.VOICE_MEDIA_INTERNAL_KEY?.trim();
  if (!baseUrl || !internalKey || !authority) return undefined;
  return new FirstPartyVoiceMediaRecordingAdapter(repository, authority, {
    baseUrl,
    internalKey,
  });
}
