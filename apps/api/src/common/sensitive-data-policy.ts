import { createHash } from "node:crypto";

const CONTROLLED_DOWNLOAD_SECRET_ENV = "CONTROLLED_DOWNLOAD_SIGNING_SECRET";
const CONTROLLED_DOWNLOAD_HOST_ENV = "CONTROLLED_DOWNLOAD_HOST";
const CONTROLLED_DOWNLOAD_KEY_ID_ENV = "CONTROLLED_DOWNLOAD_KEY_ID";
const CONTROLLED_DOWNLOAD_TTL_MINUTES_ENV = "CONTROLLED_DOWNLOAD_TTL_MINUTES";
const CONTROLLED_DOWNLOAD_SIGNATURE_VERSION_ENV =
  "CONTROLLED_DOWNLOAD_SIGNATURE_VERSION";

const TEST_ONLY_CONTROLLED_DOWNLOAD_SECRET =
  "drts-test-controlled-download-signing-secret";

export interface ControlledDownloadPolicy {
  host: string;
  keyId: string;
  signingSecret: string;
  ttlMinutes: number;
  signatureVersion: number;
}

function normalizeNonBlankText(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function parsePositiveInteger(
  value: string | null | undefined,
  fallback: number,
) {
  const normalized = normalizeNonBlankText(value);
  if (!normalized) {
    return fallback;
  }

  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

/**
 * Pseudonymous passenger identity used by every passenger-authority surface
 * (ride access tokens, ratings, notification outbox). A known passenger id is
 * already pseudonymous; a phone-only passenger is peppered and hashed so no raw
 * phone number is ever persisted as a subject reference.
 *
 * Both callers must derive the ref the same way, otherwise a phone-only ride
 * gets two identities and its rating/notification rows stop joining.
 */
export function resolvePassengerSubjectRef(passenger: {
  passengerId?: string | null;
  phone: string;
}) {
  const passengerId = normalizeNonBlankText(passenger.passengerId);
  if (passengerId) {
    return passengerId;
  }
  const pepper =
    normalizeNonBlankText(process.env.PASSENGER_SUBJECT_PEPPER) ??
    normalizeNonBlankText(process.env.PASSENGER_RIDE_TOKEN_PEPPER) ??
    "";
  const digest = createHash("sha256")
    .update(`phone\0${pepper}\0${passenger.phone.trim()}`)
    .digest("hex");
  return `phone_sha256:${digest}`;
}

export function maskName(value: string | null | undefined) {
  const normalized = normalizeNonBlankText(value);
  if (!normalized) {
    return null;
  }

  if (normalized.length === 1) {
    return "*";
  }
  if (normalized.length === 2) {
    return `${normalized[0]}*`;
  }

  return `${normalized[0]}${"*".repeat(normalized.length - 2)}${normalized.at(-1)}`;
}

export function maskPhone(value: string | null | undefined) {
  const normalized = normalizeNonBlankText(value);
  if (!normalized) {
    return null;
  }

  const digitsOnly = normalized.replace(/\D+/g, "");
  if (!digitsOnly) {
    return "***";
  }
  if (digitsOnly.length <= 4) {
    return "*".repeat(digitsOnly.length);
  }

  return `${"*".repeat(Math.max(0, digitsOnly.length - 4))}${digitsOnly.slice(-4)}`;
}

export function maskEmail(value: string | null | undefined) {
  const normalized = normalizeNonBlankText(value);
  if (!normalized) {
    return null;
  }

  const [local, domain] = normalized.split("@");
  if (!local || !domain) {
    return maskOpaqueToken(normalized, 1, 1);
  }

  const visibleLocalPrefix = local.slice(0, 1);
  return `${visibleLocalPrefix}***@${domain}`;
}

export function maskAddress(value: string | null | undefined) {
  const normalized = normalizeNonBlankText(value);
  if (!normalized) {
    return null;
  }

  if (normalized.length <= 6) {
    return `${normalized.slice(0, 2)}***`;
  }

  return `${normalized.slice(0, 6)}...`;
}

export function maskOpaqueToken(
  value: string | null | undefined,
  visiblePrefix = 6,
  visibleSuffix = 4,
) {
  const normalized = normalizeNonBlankText(value);
  if (!normalized) {
    return null;
  }

  const prefix = Math.max(0, visiblePrefix);
  const suffix = Math.max(0, visibleSuffix);
  if (normalized.length <= prefix + suffix + 3) {
    if (normalized.length <= 2) {
      return "*".repeat(normalized.length);
    }
    return `${normalized[0]}***${normalized.at(-1)}`;
  }

  const tail = suffix > 0 ? normalized.slice(-suffix) : "";
  return `${normalized.slice(0, prefix)}...${tail}`;
}

export function previewOpaqueValue(
  value: string | null | undefined,
  visiblePrefix = 20,
) {
  const normalized = normalizeNonBlankText(value);
  if (!normalized) {
    return null;
  }

  return normalized.slice(0, Math.max(0, visiblePrefix));
}

export function resolveControlledDownloadPolicy(
  overrides: Partial<ControlledDownloadPolicy>,
  defaults: Omit<ControlledDownloadPolicy, "signingSecret"> & {
    signingSecret?: string | null;
  },
): ControlledDownloadPolicy {
  const signingSecret =
    normalizeNonBlankText(overrides.signingSecret) ??
    normalizeNonBlankText(process.env[CONTROLLED_DOWNLOAD_SECRET_ENV]) ??
    normalizeNonBlankText(defaults.signingSecret) ??
    (process.env.NODE_ENV === "test"
      ? TEST_ONLY_CONTROLLED_DOWNLOAD_SECRET
      : null);

  if (!signingSecret) {
    throw new Error(
      `${CONTROLLED_DOWNLOAD_SECRET_ENV} must be configured before issuing sensitive download artifacts.`,
    );
  }

  return {
    host:
      normalizeNonBlankText(overrides.host) ??
      normalizeNonBlankText(process.env[CONTROLLED_DOWNLOAD_HOST_ENV]) ??
      defaults.host,
    keyId:
      normalizeNonBlankText(overrides.keyId) ??
      normalizeNonBlankText(process.env[CONTROLLED_DOWNLOAD_KEY_ID_ENV]) ??
      defaults.keyId,
    signingSecret,
    ttlMinutes:
      overrides.ttlMinutes ??
      parsePositiveInteger(
        process.env[CONTROLLED_DOWNLOAD_TTL_MINUTES_ENV],
        defaults.ttlMinutes,
      ),
    signatureVersion:
      overrides.signatureVersion ??
      parsePositiveInteger(
        process.env[CONTROLLED_DOWNLOAD_SIGNATURE_VERSION_ENV],
        defaults.signatureVersion,
      ),
  };
}
