type Env = NodeJS.ProcessEnv;

const LOCAL_RUNTIME_NAMES = new Set(["development", "dev", "local", "test"]);
const PROVIDER_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

export interface DriverSosS3StorageConfig {
  providerName: string;
  bucket: string;
  region: string;
  endpoint?: string;
  forcePathStyle: boolean;
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  };
}

export interface DriverSosHttpsScannerConfig {
  providerName: string;
  endpoint: string;
  authToken: string;
  timeoutMs: number;
  storageBucket: string;
}

function value(env: Env, name: string) {
  return env[name]?.trim() || undefined;
}

function required(env: Env, name: string) {
  const configured = value(env, name);
  if (!configured) {
    throw new Error(
      `${name} is required when its Driver SOS provider is enabled.`,
    );
  }
  return configured;
}

function providerName(env: Env, name: string, fallback: string) {
  const configured = value(env, name) ?? fallback;
  if (!PROVIDER_NAME_PATTERN.test(configured)) {
    throw new Error(
      `${name} must contain only lowercase letters, numbers, dot, underscore, or hyphen.`,
    );
  }
  return configured;
}

function booleanValue(env: Env, name: string, fallback: boolean): boolean {
  const configured = value(env, name)?.toLowerCase();
  if (!configured) {
    return fallback;
  }
  if (["1", "true", "yes", "on"].includes(configured)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(configured)) {
    return false;
  }
  throw new Error(`${name} must be true or false when provided.`);
}

function positiveInteger(
  env: Env,
  name: string,
  fallback: number,
  maximum: number,
) {
  const configured = value(env, name);
  if (!configured) {
    return fallback;
  }
  const parsed = Number(configured);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > maximum) {
    throw new Error(`${name} must be an integer between 1 and ${maximum}.`);
  }
  return parsed;
}

function isExplicitLocalRuntime(env: Env) {
  const runtime = (
    value(env, "DRTS_ENV") ??
    value(env, "NODE_ENV") ??
    ""
  ).toLowerCase();
  return (
    LOCAL_RUNTIME_NAMES.has(runtime) &&
    booleanValue(env, "DRIVER_SOS_PROVIDER_ALLOW_HTTP_LOCAL", false)
  );
}

function validatedProviderUrl(env: Env, name: string, configured: string) {
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error(`${name} must be a valid absolute URL.`);
  }

  if (url.username || url.password) {
    throw new Error(`${name} must not contain embedded credentials.`);
  }
  if (url.protocol === "https:") {
    return url.toString();
  }

  const localHostname = ["localhost", "127.0.0.1", "::1"].includes(
    url.hostname,
  );
  if (
    url.protocol === "http:" &&
    localHostname &&
    isExplicitLocalRuntime(env)
  ) {
    return url.toString();
  }

  throw new Error(
    `${name} must use HTTPS; HTTP is allowed only for an explicitly enabled local/test localhost endpoint.`,
  );
}

export function resolveDriverSosS3StorageConfig(
  env: Env = process.env,
): DriverSosS3StorageConfig | null {
  const mode = value(env, "DRIVER_SOS_ATTACHMENT_STORAGE_PROVIDER")
    ?.toLowerCase()
    .replace("_", "-");
  if (!mode || mode === "disabled") {
    return null;
  }
  if (!["s3", "s3-compatible"].includes(mode)) {
    throw new Error(
      "DRIVER_SOS_ATTACHMENT_STORAGE_PROVIDER must be s3, s3-compatible, or disabled.",
    );
  }

  const accessKeyId = value(env, "DRIVER_SOS_S3_ACCESS_KEY_ID");
  const secretAccessKey = value(env, "DRIVER_SOS_S3_SECRET_ACCESS_KEY");
  const sessionToken = value(env, "DRIVER_SOS_S3_SESSION_TOKEN");
  if ((accessKeyId && !secretAccessKey) || (!accessKeyId && secretAccessKey)) {
    throw new Error(
      "DRIVER_SOS_S3_ACCESS_KEY_ID and DRIVER_SOS_S3_SECRET_ACCESS_KEY must be configured together.",
    );
  }
  if (sessionToken && (!accessKeyId || !secretAccessKey)) {
    throw new Error(
      "DRIVER_SOS_S3_SESSION_TOKEN requires explicit access-key credentials.",
    );
  }

  const endpoint = value(env, "DRIVER_SOS_S3_ENDPOINT");
  return {
    providerName: providerName(
      env,
      "DRIVER_SOS_S3_PROVIDER_NAME",
      "s3-compatible",
    ),
    bucket: required(env, "DRIVER_SOS_S3_BUCKET"),
    region: required(env, "DRIVER_SOS_S3_REGION"),
    ...(endpoint
      ? {
          endpoint: validatedProviderUrl(
            env,
            "DRIVER_SOS_S3_ENDPOINT",
            endpoint,
          ),
        }
      : {}),
    forcePathStyle: booleanValue(env, "DRIVER_SOS_S3_FORCE_PATH_STYLE", false),
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

export function resolveDriverSosHttpsScannerConfig(
  env: Env = process.env,
  storageConfig: DriverSosS3StorageConfig | null = null,
): DriverSosHttpsScannerConfig | null {
  const mode = value(env, "DRIVER_SOS_ATTACHMENT_SCANNER_PROVIDER")
    ?.toLowerCase()
    .replace("_", "-");
  if (!mode || mode === "disabled") {
    return null;
  }
  if (mode !== "https-json") {
    throw new Error(
      "DRIVER_SOS_ATTACHMENT_SCANNER_PROVIDER must be https-json or disabled.",
    );
  }
  if (!storageConfig) {
    throw new Error(
      "The Driver SOS HTTPS scanner requires the S3-compatible storage provider.",
    );
  }

  return {
    providerName: providerName(
      env,
      "DRIVER_SOS_SCANNER_PROVIDER_NAME",
      "https-json-malware-scanner",
    ),
    endpoint: validatedProviderUrl(
      env,
      "DRIVER_SOS_SCANNER_URL",
      required(env, "DRIVER_SOS_SCANNER_URL"),
    ),
    authToken: required(env, "DRIVER_SOS_SCANNER_AUTH_TOKEN"),
    timeoutMs: positiveInteger(
      env,
      "DRIVER_SOS_SCANNER_TIMEOUT_MS",
      5_000,
      60_000,
    ),
    storageBucket: storageConfig.bucket,
  };
}
