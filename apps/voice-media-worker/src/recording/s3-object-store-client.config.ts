import type { S3ObjectStoreClientConfig } from "./s3-object-store-client";

type Env = NodeJS.ProcessEnv;
const PROVIDER_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

function value(env: Env, name: string) {
  return env[name]?.trim() || undefined;
}

function required(env: Env, name: string) {
  const configured = value(env, name);
  if (!configured) {
    throw new Error(
      `${name} is required when VOICE_RECORDING_OBJECT_STORE_PROVIDER=s3.`,
    );
  }
  return configured;
}

function booleanValue(env: Env, name: string, fallback: boolean): boolean {
  const configured = value(env, name)?.toLowerCase();
  if (!configured) return fallback;
  if (["1", "true", "yes", "on"].includes(configured)) return true;
  if (["0", "false", "no", "off"].includes(configured)) return false;
  throw new Error(`${name} must be true or false when provided.`);
}

/**
 * Mirrors `resolveDriverSosS3StorageConfig`'s opt-in, fail-closed-when-
 * absent/partial convention (../../../api/src/modules/driver-sos/
 * driver-sos-provider.config.ts) for this worker's own recording object
 * store. Returns `null` when the provider is unset or explicitly
 * "disabled" -- that is the honest "not configured" state `server.ts`
 * already handles by leaving `recordingAdapter` unset; it is not, itself,
 * an error.
 */
export function resolveVoiceRecordingS3StorageConfig(
  env: Env = process.env,
): S3ObjectStoreClientConfig | null {
  const mode = value(env, "VOICE_RECORDING_OBJECT_STORE_PROVIDER")
    ?.toLowerCase()
    .replace("_", "-");
  if (!mode || mode === "disabled") {
    return null;
  }
  if (!["s3", "s3-compatible"].includes(mode)) {
    throw new Error(
      "VOICE_RECORDING_OBJECT_STORE_PROVIDER must be s3, s3-compatible, or disabled.",
    );
  }

  const accessKeyId = value(env, "VOICE_RECORDING_S3_ACCESS_KEY_ID");
  const secretAccessKey = value(env, "VOICE_RECORDING_S3_SECRET_ACCESS_KEY");
  const sessionToken = value(env, "VOICE_RECORDING_S3_SESSION_TOKEN");
  if ((accessKeyId && !secretAccessKey) || (!accessKeyId && secretAccessKey)) {
    throw new Error(
      "VOICE_RECORDING_S3_ACCESS_KEY_ID and VOICE_RECORDING_S3_SECRET_ACCESS_KEY must be configured together.",
    );
  }
  if (sessionToken && (!accessKeyId || !secretAccessKey)) {
    throw new Error(
      "VOICE_RECORDING_S3_SESSION_TOKEN requires explicit access-key credentials.",
    );
  }

  const providerName =
    value(env, "VOICE_RECORDING_S3_PROVIDER_NAME") ?? "s3-compatible";
  if (!PROVIDER_NAME_PATTERN.test(providerName)) {
    throw new Error(
      "VOICE_RECORDING_S3_PROVIDER_NAME must contain only lowercase letters, numbers, dot, underscore, or hyphen.",
    );
  }

  const endpoint = value(env, "VOICE_RECORDING_S3_ENDPOINT");
  return {
    providerName,
    bucket: required(env, "VOICE_RECORDING_S3_BUCKET"),
    region: required(env, "VOICE_RECORDING_S3_REGION"),
    ...(endpoint ? { endpoint } : {}),
    forcePathStyle: booleanValue(
      env,
      "VOICE_RECORDING_S3_FORCE_PATH_STYLE",
      false,
    ),
    ...(accessKeyId && secretAccessKey
      ? {
          credentials: {
            accessKeyId,
            secretAccessKey,
            ...(sessionToken ? { sessionToken } : {}),
          },
        }
      : {}),
  };
}
