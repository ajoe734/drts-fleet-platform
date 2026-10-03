import { timingSafeEqual } from "node:crypto";

import { isStrictVoiceMediaEnvironment } from "./environment";

/** Same header the rest of the platform uses for service-to-service calls
 * (see `apps/api/src/common/auth/internal-key.middleware.ts`). */
export const VOICE_MEDIA_INTERNAL_KEY_HEADER = "x-drts-internal-key";

export type VoiceMediaAuthHeaders = Readonly<
  Record<string, string | string[] | undefined>
>;

export class VoiceMediaAuthError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "VoiceMediaAuthError";
  }
}

export interface VoiceMediaInternalKeyConfig {
  configuredKey: string | undefined;
  previousKey?: string | undefined;
}

function normalizeHeader(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0]?.trim() ?? "";
  }
  return typeof value === "string" ? value.trim() : "";
}

function timingSafeKeyEquals(provided: string, expected: string): boolean {
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  if (providedBuf.length !== expectedBuf.length) {
    return false;
  }
  return timingSafeEqual(providedBuf, expectedBuf);
}

/**
 * Fail-closed caller authentication for this worker's operational surface
 * (`/drain`, `/sessions`, `/recording/finalize`, the WebSocket upgrade).
 * Mirrors the shape of `requireScopedInternalKey`
 * (apps/api/src/common/auth/internal-key.middleware.ts): a purpose-bound
 * shared secret carried in the same `x-drts-internal-key` header the rest of
 * the platform already uses, with a short rotation window via a previous
 * key. Re-implemented locally (rather than imported) because this worker has
 * no runtime dependency on apps/api.
 *
 * In production/staging this always requires a configured key and rejects
 * every request without a valid one. Outside those environments, an
 * unconfigured key leaves the surface open, matching how
 * `InternalKeyMiddleware` behaves in local/dev/test, so existing tests and
 * local runs that never set `VOICE_MEDIA_INTERNAL_KEY` keep working.
 */
export function verifyVoiceMediaCaller(
  headers: VoiceMediaAuthHeaders,
  config: VoiceMediaInternalKeyConfig,
): void {
  const configuredKey = config.configuredKey?.trim();

  if (!configuredKey) {
    if (isStrictVoiceMediaEnvironment()) {
      throw new VoiceMediaAuthError(
        503,
        "VOICE_MEDIA_INTERNAL_KEY_NOT_CONFIGURED",
        "VOICE_MEDIA_INTERNAL_KEY is not configured for this environment; refusing to accept operational requests.",
      );
    }
    return;
  }

  const provided = normalizeHeader(headers[VOICE_MEDIA_INTERNAL_KEY_HEADER]);
  if (!provided) {
    throw new VoiceMediaAuthError(
      401,
      "VOICE_MEDIA_INTERNAL_KEY_REQUIRED",
      `${VOICE_MEDIA_INTERNAL_KEY_HEADER} header is required.`,
    );
  }

  const previousKey = config.previousKey?.trim();
  if (
    timingSafeKeyEquals(provided, configuredKey) ||
    (previousKey && timingSafeKeyEquals(provided, previousKey))
  ) {
    return;
  }

  throw new VoiceMediaAuthError(
    401,
    "VOICE_MEDIA_INTERNAL_KEY_INVALID",
    `${VOICE_MEDIA_INTERNAL_KEY_HEADER} header is invalid.`,
  );
}
