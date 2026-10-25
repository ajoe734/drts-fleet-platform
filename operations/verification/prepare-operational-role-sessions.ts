import assert from "node:assert/strict";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertMapDriverIsolation,
  DriverIsolationError,
  inspectMapDriverIsolation,
  type DriverIsolationEvidence,
} from "../../tests/e2e/system-remediation/sr-live-map-001/driver-isolation";
import {
  SEEDED_MAP_DRIVER_ID,
  type LiveEnv,
} from "../../tests/e2e/system-remediation/sr-live-map-001/live-map-config";
import {
  issueMapProvisioningSession,
  MAP_DRIVER_SCOPES,
  MAP_PROVISIONER_ID,
  verifyMapProvisioningSession,
  type BootstrapDeps,
  type MapSessionRequest,
} from "../../tests/e2e/system-remediation/sr-live-map-001/session-bootstrap";
import { normalizeApiResponse } from "../../tests/e2e/system-remediation/sr-live-map-001/wire-response";

export {
  DriverIsolationError,
  MAP_DRIVER_SCOPES,
  MAP_PROVISIONER_ID,
  SEEDED_MAP_DRIVER_ID,
};

export const OPERATIONAL_OWN_FLEET_PARTNER_ID = "fleet-demo-001";

export const OPERATIONAL_ROLE_SESSION_ENV_NAMES = [
  "DRTS_OPERATIONAL_OPS_NON_REVIEWER_SESSION_TOKEN",
  "DRTS_OPERATIONAL_SYSTEM_SESSION_TOKEN",
  "DRTS_OPERATIONAL_DRIVER_SESSION_TOKEN",
  "DRTS_OPERATIONAL_FOREIGN_FLEET_SESSION_TOKEN",
  "DRTS_OPERATIONAL_OTHER_FLEET_SESSION_TOKEN",
] as const;

const INVOCATION_TOKEN_ENV_NAMES = [
  "DRTS_DEV_API_ID_TOKEN",
  "DRTS_OPERATIONAL_API_ID_TOKEN",
  "DRTS_DEV_OPS_CONSOLE_ID_TOKEN",
  "DRTS_OPERATIONAL_OPS_CONSOLE_ID_TOKEN",
  "DRTS_DEV_PLATFORM_ADMIN_ID_TOKEN",
  "DRTS_OPERATIONAL_PLATFORM_ADMIN_ID_TOKEN",
  "DRTS_DEV_FLEET_PARTNER_PORTAL_ID_TOKEN",
  "DRTS_OPERATIONAL_FLEET_PARTNER_PORTAL_ID_TOKEN",
  "DRTS_DEV_TENANT_CONSOLE_ID_TOKEN",
  "DRTS_OPERATIONAL_TENANT_CONSOLE_ID_TOKEN",
  "DRTS_DEV_BANK_CONSOLE_ID_TOKEN",
  "DRTS_OPERATIONAL_BANK_CONSOLE_ID_TOKEN",
  "DRTS_DEV_ENTERPRISE_DISPATCH_ID_TOKEN",
  "DRTS_OPERATIONAL_ENTERPRISE_DISPATCH_ID_TOKEN",
  "DRTS_DEV_CHANNEL_PARTNER_PORTAL_ID_TOKEN",
  "DRTS_OPERATIONAL_CHANNEL_PARTNER_PORTAL_ID_TOKEN",
  "DRTS_LIVE_MAP_GOOGLE_PROVISIONING_ID_TOKEN",
  "DRTS_OPERATIONAL_GOOGLE_PROVISIONING_ID_TOKEN",
  "DRTS_LIVE_MAP_GOOGLE_OBSERVER_ID_TOKEN",
] as const;

const NON_PROVISIONING_INVOCATION_TOKEN_ENV_NAMES =
  INVOCATION_TOKEN_ENV_NAMES.filter(
    (name) =>
      name !== "DRTS_LIVE_MAP_GOOGLE_PROVISIONING_ID_TOKEN" &&
      name !== "DRTS_OPERATIONAL_GOOGLE_PROVISIONING_ID_TOKEN",
  );

const DISALLOWED_OPS_REVIEWER_ROLES = new Set([
  "platform_reviewer",
  "platform_admin",
  "super_admin",
  "superadmin",
]);

const MANIFEST_DISALLOWED_TENANT_UUID = "10000000-0000-0000-0000-000000000201";
const DEMO_SEED_TENANT_ID = "tenant-demo-001";
const DEMO_SEED_PROGRAM_ID = "program-referral-community";
const IDENTITY_SESSION_REVOKE_CSRF_TOKEN =
  "operational-role-session-recovery-csrf";

export class OperationalForeignFleetFixturePreconditionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OperationalForeignFleetFixturePreconditionError";
  }
}

export class OperationalRoleSessionBootstrapError extends Error {
  constructor(
    public readonly stage: string,
    detail: string,
  ) {
    super(`Operational role session bootstrap failed at ${stage}; ${detail}`);
    this.name = "OperationalRoleSessionBootstrapError";
  }
}

export type OperationalRoleSessionTargetConfig = {
  candidateSha: string;
  apiOrigin: string;
  opsOrigin: string;
  adminOrigin?: string;
  allowedTargets: string[];
  driverId: string;
  expectedOwnFleetId: string;
  gcpProjectId?: string;
};

export type OperationalRoleSessionDeps = Pick<
  BootstrapDeps,
  "fetch" | "mask" | "exportSession"
> & {
  save: (name: string, evidence: OperationalRoleSessionsEvidence) => void;
  readGoogleIdToken?: (purpose: "observer" | "provisioning") => string;
};

export type OperationalRoleSessionTeardownDeps = Pick<
  BootstrapDeps,
  "fetch" | "mask"
> & {
  exportSession?: (name: string, value: string) => void;
  save: (evidence: OperationalRoleSessionsCleanupEvidence) => void;
  readGoogleIdToken?: (purpose: "observer" | "provisioning") => string;
};

export type OperationalRoleSessionSummary = {
  role: "ops_non_reviewer" | "system" | "driver" | "foreign_fleet";
  source:
    | "provided-session"
    | "ops-bff-exchange"
    | "google-workload-provisioning-exchange"
    | "driver-device-invite-register"
    | "partner-bootstrap-exchange"
    | "owned-canonical-fleet-bootstrap-exchange";
  realm: string;
  actor_type: string;
  actor_id: string;
  partner_id?: string;
  scopes: string[];
  expires_in?: string;
};

export type OperationalRoleSessionsEvidence = {
  candidate_sha: string;
  status: "passed" | "failed";
  stage: string;
  cleanup: "not-required" | "required" | "passed" | "failed" | "unconfirmed";
  driver_isolation: DriverIsolationEvidence | undefined;
  foreign_fleet_precondition:
    | "pending"
    | "satisfied-by-provided-session"
    | "satisfied-by-partner-bootstrap"
    | "satisfied-by-owned-canonical-fleet"
    | "missing-external-fixture"
    | "invalid-external-fixture";
  sessions: OperationalRoleSessionSummary[];
};

export type OperationalRoleSessionsCleanupEvidence = {
  candidate_sha: string;
  status: "passed" | "failed";
  driver_id: string;
  driver_recovery: "not-required" | "consumed-invitation";
  driver_revoked: boolean;
  ops_session_revoked: boolean;
  foreign_fleet_session_revoked: boolean;
  foreign_fleet_key_revoked?: boolean;
  foreign_fleet_entry_revoked?: boolean;
  foreign_fleet_master_deactivated?: boolean;
  admin_session_revoked?: boolean;
};

function objectRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function nonEmptyTrimmed(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function assertOpaqueCredential(value: unknown, label: string): string {
  assert(
    typeof value === "string" && value.trim().length > 0 && !/\s/.test(value),
    `${label} must be a non-empty credential without whitespace`,
  );
  return value;
}

function parseHttpsOrigin(raw: string, label: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${label} must be a valid HTTPS origin`);
  }
  if (
    parsed.protocol !== "https:" ||
    !parsed.hostname ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    (parsed.pathname !== "/" && parsed.pathname !== "")
  ) {
    throw new Error(
      `${label} must be an HTTPS origin without credentials, paths, queries, or fragments`,
    );
  }
  return parsed.origin;
}

function assertAllowedTargetUrl(url: string, allowedTargets: string[]) {
  const parsed = new URL(url);
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.hash ||
    !allowedTargets.includes(parsed.origin)
  ) {
    throw new Error("Request target is outside allowed operational origins");
  }
}

export function validateOperationalRoleSessionTargets(
  env: LiveEnv,
): OperationalRoleSessionTargetConfig {
  const candidateSha = nonEmptyTrimmed(env.DRTS_CANDIDATE_SHA);
  if (!candidateSha || !/^[0-9a-f]{40}$/.test(candidateSha)) {
    throw new Error(
      "DRTS_CANDIDATE_SHA must be a full 40-character lowercase hex SHA",
    );
  }
  const rawApiOrigin =
    nonEmptyTrimmed(env.DRTS_OPERATIONAL_API_URL) ??
    nonEmptyTrimmed(env.DRTS_DEV_API_BASE_URL);
  if (!rawApiOrigin) {
    throw new Error(
      "DRTS_OPERATIONAL_API_URL or DRTS_DEV_API_BASE_URL is required",
    );
  }
  const rawOpsOrigin =
    nonEmptyTrimmed(env.DRTS_OPERATIONAL_OPS_CONSOLE_URL) ??
    nonEmptyTrimmed(env.DRTS_DEV_OPS_CONSOLE_BASE_URL);
  if (!rawOpsOrigin) {
    throw new Error(
      "DRTS_OPERATIONAL_OPS_CONSOLE_URL or DRTS_DEV_OPS_CONSOLE_BASE_URL is required",
    );
  }
  const apiOrigin = parseHttpsOrigin(rawApiOrigin, "API origin");
  const opsOrigin = parseHttpsOrigin(rawOpsOrigin, "Ops Console origin");
  if (apiOrigin === opsOrigin) {
    throw new Error("API origin and Ops Console origin must be distinct");
  }
  const rawAdminOrigin =
    nonEmptyTrimmed(env.DRTS_OPERATIONAL_PLATFORM_ADMIN_URL) ??
    nonEmptyTrimmed(env.DRTS_DEV_PLATFORM_ADMIN_BASE_URL);
  const adminOrigin = rawAdminOrigin
    ? parseHttpsOrigin(rawAdminOrigin, "Platform Admin origin")
    : undefined;
  if (adminOrigin && (adminOrigin === apiOrigin || adminOrigin === opsOrigin)) {
    throw new Error(
      "Platform Admin origin must be distinct from API origin and Ops Console origin",
    );
  }
  const driverId =
    nonEmptyTrimmed(env.DRTS_LIVE_MAP_TEST_DRIVER_ID) ??
    nonEmptyTrimmed(env.DRTS_OPERATIONAL_DRIVER_ID) ??
    SEEDED_MAP_DRIVER_ID;
  if (driverId !== SEEDED_MAP_DRIVER_ID) {
    throw new Error(
      `DRTS_LIVE_MAP_TEST_DRIVER_ID must be the audited offline seed ${SEEDED_MAP_DRIVER_ID}`,
    );
  }
  const expectedOwnFleetId =
    nonEmptyTrimmed(env.DRTS_OPERATIONAL_OWN_FLEET_PARTNER_ID) ??
    OPERATIONAL_OWN_FLEET_PARTNER_ID;
  if (expectedOwnFleetId !== OPERATIONAL_OWN_FLEET_PARTNER_ID) {
    throw new Error(
      `Expected own Fleet partnerId must remain ${OPERATIONAL_OWN_FLEET_PARTNER_ID}`,
    );
  }
  const gcpProjectId = nonEmptyTrimmed(env.DEV_GCP_PROJECT_ID);
  return {
    candidateSha,
    apiOrigin,
    opsOrigin,
    ...(adminOrigin ? { adminOrigin } : {}),
    allowedTargets: [
      apiOrigin,
      opsOrigin,
      ...(adminOrigin ? [adminOrigin] : []),
    ],
    driverId,
    expectedOwnFleetId,
    ...(gcpProjectId ? { gcpProjectId } : {}),
  };
}

export function createOperationalRoleSessionRequest(
  config: Pick<
    OperationalRoleSessionTargetConfig,
    "apiOrigin" | "allowedTargets" | "candidateSha"
  >,
  fetchImpl: typeof fetch,
): MapSessionRequest {
  return async <T>(path: string, init: RequestInit): Promise<T> => {
    const normalizedPath = path.replace(/^\/+/, "").replace(/^api\/+/, "");
    const url = `${config.apiOrigin}/api/${normalizedPath}`;
    assertAllowedTargetUrl(url, config.allowedTargets);
    const response = await fetchImpl(url, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    assert(response.ok, `API request failed with HTTP ${response.status}`);
    assert.equal(
      response.headers.get("x-drts-candidate-sha"),
      config.candidateSha,
    );
    return normalizeApiResponse(await response.json()) as T;
  };
}

class ControlPlaneProxyHttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly errorCode: string | undefined,
    label: string,
    public readonly candidateShaMatched: boolean = false,
  ) {
    super(
      `${label} request failed with HTTP ${statusCode}${errorCode ? ` (${errorCode})` : ""}`,
    );
    this.name = "ControlPlaneProxyHttpError";
  }
}

function isAuthoritativeInactiveControlPlaneSessionError(
  error: unknown,
): boolean {
  return (
    error instanceof ControlPlaneProxyHttpError &&
    error.candidateShaMatched &&
    error.statusCode === 401 &&
    (error.errorCode === "JWT_INVALID" ||
      error.errorCode === "SESSION_EXPIRED" ||
      error.errorCode === "SESSION_REVOKED")
  );
}

function extractSafeErrorCode(rawBody: unknown): string | undefined {
  const normalized = objectRecord(normalizeApiResponse(rawBody));
  const nestedError = objectRecord(normalized.error);
  const nestedData = objectRecord(normalized.data);
  const candidate =
    nonEmptyTrimmed(nestedError.code) ??
    nonEmptyTrimmed(normalized.code) ??
    nonEmptyTrimmed(nestedData.code);
  return candidate && /^[A-Z0-9_]{2,64}$/.test(candidate)
    ? candidate
    : undefined;
}

async function requestControlPlaneProxy<T>(
  proxyOrigin: string,
  config: Pick<
    OperationalRoleSessionTargetConfig,
    "allowedTargets" | "candidateSha"
  >,
  fetchImpl: typeof fetch,
  path: string,
  init: RequestInit,
  label = "BFF proxy",
): Promise<T> {
  const normalizedPath = path
    .replace(/^\/+/, "")
    .replace(/^control-plane-proxy\/+/, "");
  const url = `${proxyOrigin}/control-plane-proxy/${normalizedPath}`;
  assertAllowedTargetUrl(url, config.allowedTargets);
  const response = await fetchImpl(url, {
    ...init,
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const candidateShaMatched =
      response.headers.get("x-drts-candidate-sha") === config.candidateSha;
    let errorCode: string | undefined;
    try {
      errorCode = extractSafeErrorCode(await response.json());
    } catch {
      errorCode = undefined;
    }
    throw new ControlPlaneProxyHttpError(
      response.status,
      errorCode,
      label,
      candidateShaMatched,
    );
  }
  assert.equal(
    response.headers.get("x-drts-candidate-sha"),
    config.candidateSha,
  );
  return normalizeApiResponse(await response.json()) as T;
}

type PlatformAdminStepUpActionId =
  | "platform:partner-entries:create"
  | "platform:partner-entries:deactivate"
  | "platform:partner-entries:revoke"
  | "platform:partner-credentials:issue"
  | "platform:partner-credentials:revoke";

async function issuePlatformAdminStepUpProof(
  adminOrigin: string,
  config: Pick<
    OperationalRoleSessionTargetConfig,
    "allowedTargets" | "candidateSha"
  >,
  fetchImpl: typeof fetch,
  adminInvocation: string,
  adminToken: string,
  actionId: PlatformAdminStepUpActionId,
  targetPath: string,
  mask?: (value: string) => void,
): Promise<string | undefined> {
  const rawProof = await requestControlPlaneProxy<Record<string, unknown>>(
    adminOrigin,
    config,
    fetchImpl,
    "identity/step-up-proofs",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${adminInvocation}`,
        "x-drts-authorization": `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        actionId,
        method: "POST",
        path: targetPath,
      }),
    },
    "Platform Admin BFF proxy",
  );
  const proofRecord = objectRecord(rawProof.data ?? rawProof);
  const stepUpReference = nonEmptyTrimmed(proofRecord.stepUpReference);
  if (stepUpReference) {
    assertOpaqueCredential(stepUpReference, "Platform Admin stepUpReference");
    mask?.(stepUpReference);
  } else if (proofRecord.required !== false) {
    throw new Error(
      `Step-up proof response for ${actionId} did not include stepUpReference`,
    );
  }
  return stepUpReference;
}

async function requestOpsControlPlaneProxy<T>(
  config: Pick<
    OperationalRoleSessionTargetConfig,
    "opsOrigin" | "allowedTargets" | "candidateSha"
  >,
  fetchImpl: typeof fetch,
  path: string,
  init: RequestInit,
): Promise<T> {
  return requestControlPlaneProxy<T>(
    config.opsOrigin,
    config,
    fetchImpl,
    path,
    init,
    "Ops BFF proxy",
  );
}

function collectInvocationTokens(
  env: LiveEnv,
  mask: (value: string) => void,
): Set<string> {
  const tokens = new Set<string>();
  for (const name of INVOCATION_TOKEN_ENV_NAMES) {
    const value = nonEmptyTrimmed(env[name]);
    if (value) {
      mask(value);
      tokens.add(value);
    }
  }
  return tokens;
}

function assertDistinctFromInvocationTokens(
  token: string,
  invocationTokens: Set<string>,
  roleLabel: string,
) {
  if (invocationTokens.has(token)) {
    throw new Error(
      `${roleLabel} session token must be a server-issued application session distinct from Cloud Run or Google invocation tokens`,
    );
  }
}

function decodeJwtPayloadIfStructured(
  token: string,
): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    return null;
  }
  try {
    const decoded = Buffer.from(parts[1], "base64url").toString("utf8");
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Non-JWT opaque token in unit simulations is validated via endpoint/header contracts.
  }
  return null;
}

export function readOperationalGoogleProvisioningIdToken(
  env: LiveEnv,
  config?: Pick<
    OperationalRoleSessionTargetConfig,
    "apiOrigin" | "gcpProjectId"
  >,
): string {
  const rawToken =
    nonEmptyTrimmed(env.DRTS_LIVE_MAP_GOOGLE_PROVISIONING_ID_TOKEN) ??
    nonEmptyTrimmed(env.DRTS_OPERATIONAL_GOOGLE_PROVISIONING_ID_TOKEN);
  if (!rawToken) {
    throw new Error(
      "DRTS_LIVE_MAP_GOOGLE_PROVISIONING_ID_TOKEN is required to issue the SYSTEM driver-provisioning session",
    );
  }
  assertOpaqueCredential(
    rawToken,
    "DRTS_LIVE_MAP_GOOGLE_PROVISIONING_ID_TOKEN",
  );
  for (const envName of NON_PROVISIONING_INVOCATION_TOKEN_ENV_NAMES) {
    const other = nonEmptyTrimmed(env[envName]);
    if (other && other === rawToken) {
      throw new Error(
        "DRTS_LIVE_MAP_GOOGLE_PROVISIONING_ID_TOKEN must be a dedicated driver-provisioning assertion, not a general service invocation ID token",
      );
    }
  }
  const claims = decodeJwtPayloadIfStructured(rawToken);
  if (claims && config) {
    if (claims.aud !== undefined) {
      const expectedAudience = `${config.apiOrigin}/driver-provisioning`;
      if (claims.aud !== expectedAudience) {
        throw new Error(
          "Google provisioning ID token audience must match <ApiOrigin>/driver-provisioning",
        );
      }
    }
    if (claims.email !== undefined) {
      const email = String(claims.email);
      const expectedPattern = config.gcpProjectId
        ? new RegExp(
            `^drts-dev-live-map@${config.gcpProjectId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.iam\\.gserviceaccount\\.com$`,
          )
        : /^drts-dev-live-map@[a-z0-9-]+\.iam\.gserviceaccount\.com$/;
      if (!expectedPattern.test(email)) {
        throw new Error(
          "Google provisioning ID token principal must be drts-dev-live-map@<project>.iam.gserviceaccount.com",
        );
      }
    }
  }
  return rawToken;
}

async function verifyOpsNonReviewerSession(
  apiRequest: MapSessionRequest,
  token: string,
  expectedIssued?: { sessionId: string; principalId: string },
): Promise<{
  realm: string;
  actorType: string;
  actorId: string;
  sessionId?: string;
  scopes: string[];
}> {
  const response = await apiRequest<{
    data?: Record<string, unknown>;
  }>("auth/session", {
    method: "GET",
    headers: { authorization: `Bearer ${token}` },
  });
  const data = objectRecord(response.data ?? response);
  const identity = objectRecord(data.identity);
  assert.equal(data.active, true, "ops_non_reviewer session must be active");
  const realm = String(identity.realm ?? "");
  const actorType = String(identity.actorType ?? "");
  const actorId = String(identity.actorId ?? "");
  const roles = Array.isArray(identity.roles)
    ? identity.roles.map((r) => String(r))
    : [];
  const scopes = Array.isArray(identity.scopes)
    ? identity.scopes.map((s) => String(s))
    : [];

  assert(
    realm === "ops" || realm === "platform",
    "ops_non_reviewer session must be in ops or platform realm",
  );
  assert(
    actorType === "ops_user" ||
      actorType === "ops_observer" ||
      realm === "ops" ||
      roles.includes("ops_user") ||
      roles.includes("operator") ||
      roles.includes("ops_dispatcher"),
    "ops_non_reviewer session must carry ops identity",
  );
  assert(
    actorType !== "platform_admin" &&
      !roles.some((role) => DISALLOWED_OPS_REVIEWER_ROLES.has(role)),
    "ops_non_reviewer session must not carry platform reviewer or admin authority",
  );
  assert(actorId.trim().length > 0, "ops_non_reviewer actorId is required");
  assert(
    scopes.includes("regulatory:read"),
    "ops_non_reviewer session must include regulatory:read scope",
  );

  if (expectedIssued) {
    assert.equal(identity.authMode, "jwt_bearer");
    assert.equal(identity.sessionId, expectedIssued.sessionId);
    assert.equal(identity.principalId, expectedIssued.principalId);
    assert.equal(actorId, expectedIssued.principalId);
  }

  const sessionId = nonEmptyTrimmed(identity.sessionId);
  return {
    realm,
    actorType,
    actorId,
    ...(sessionId ? { sessionId } : {}),
    scopes,
  };
}

async function verifyDriverRoleSession(
  apiRequest: MapSessionRequest,
  driverId: string,
  token: string,
): Promise<{
  realm: string;
  actorType: string;
  actorId: string;
  scopes: string[];
}> {
  const session = await apiRequest<{
    data: {
      active: boolean;
      identity: {
        realm: string;
        actorType: string;
        actorId: string;
        scopes: string[];
      };
    };
  }>("auth/session", {
    method: "GET",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(session.data.active, true);
  assert.equal(session.data.identity.realm, "driver");
  assert.equal(session.data.identity.actorType, "driver_user");
  assert.equal(session.data.identity.actorId, driverId);
  assert.deepEqual(
    [...session.data.identity.scopes].sort(),
    [...MAP_DRIVER_SCOPES].sort(),
  );
  return {
    realm: session.data.identity.realm,
    actorType: session.data.identity.actorType,
    actorId: session.data.identity.actorId,
    scopes: [...session.data.identity.scopes],
  };
}

async function verifyForeignFleetRoleSession(
  apiRequest: MapSessionRequest,
  token: string,
  expectedOwnFleetId: string,
  expectedForeignPartnerId?: string,
  requireSessionId = false,
): Promise<{
  realm: string;
  actorType: string;
  actorId: string;
  partnerId: string;
  sessionId?: string;
  scopes: string[];
}> {
  const response = await apiRequest<{
    data?: Record<string, unknown>;
  }>("auth/session", {
    method: "GET",
    headers: { authorization: `Bearer ${token}` },
  });
  const data = objectRecord(response.data ?? response);
  const identity = objectRecord(data.identity);
  const jwtClaims = decodeJwtPayloadIfStructured(token);
  if (data.active !== true) {
    throw new OperationalForeignFleetFixturePreconditionError(
      "Foreign Fleet session is not active in /api/auth/session",
    );
  }
  const realm = String(identity.realm ?? "");
  const actorType = String(identity.actorType ?? "");
  const actorId = String(identity.actorId ?? "").trim();
  const partnerId = String(identity.partnerId ?? "").trim();
  const scopes = Array.isArray(identity.scopes)
    ? identity.scopes.map((s) => String(s))
    : [];

  if (
    realm !== "partner" ||
    !["partner_user", "partner_api_key"].includes(actorType) ||
    !actorId ||
    !partnerId
  ) {
    throw new OperationalForeignFleetFixturePreconditionError(
      "Foreign Fleet session must be an active partner-realm Fleet identity with non-empty partnerId",
    );
  }
  if (partnerId === expectedOwnFleetId) {
    throw new OperationalForeignFleetFixturePreconditionError(
      `Foreign Fleet session partnerId (${partnerId}) must differ from own Fleet (${expectedOwnFleetId})`,
    );
  }
  if (expectedForeignPartnerId && partnerId !== expectedForeignPartnerId) {
    throw new OperationalForeignFleetFixturePreconditionError(
      `Foreign Fleet session partnerId (${partnerId}) does not match expected foreign Fleet (${expectedForeignPartnerId})`,
    );
  }
  const sessionId =
    nonEmptyTrimmed(identity.sessionId) ?? nonEmptyTrimmed(jwtClaims?.sid);
  if (requireSessionId && !sessionId) {
    throw new OperationalForeignFleetFixturePreconditionError(
      "Bootstrapped foreign Fleet session must include a revocable sessionId",
    );
  }
  return {
    realm,
    actorType,
    actorId,
    partnerId,
    ...(sessionId ? { sessionId } : {}),
    scopes,
  };
}

export async function revokeOperationalDriverInvitation(
  apiRequest: MapSessionRequest,
  provisionerToken: string,
  registrationCode: string,
) {
  assertOpaqueCredential(provisionerToken, "provisionerToken");
  assertOpaqueCredential(registrationCode, "registrationCode");
  const result = await apiRequest<{
    data?: { revoked?: boolean };
  }>("auth/driver/device/invite/revoke", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${provisionerToken}`,
    },
    body: JSON.stringify({ registrationCode }),
  });
  assert.equal(result.data?.revoked, true);
}

export async function revokeOperationalApplicationSession(
  apiRequest: MapSessionRequest,
  sessionToken: string,
  sessionId: string,
) {
  assertOpaqueCredential(sessionToken, "sessionToken");
  assertOpaqueCredential(sessionId, "sessionId");
  const result = await apiRequest<{
    data?: { revoked?: boolean; sessionId?: string };
  }>("auth/sessions/revoke", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${sessionToken}`,
    },
    body: JSON.stringify({ sessionId }),
  });
  assert.equal(result.data?.revoked, true);
  assert.equal(result.data?.sessionId, sessionId);
}

function splitNonEmptyCsv(raw: unknown): string[] {
  const trimmed = nonEmptyTrimmed(raw);
  if (!trimmed) return [];
  return Array.from(
    new Set(
      trimmed
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    ),
  );
}

function extractItemsArray(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) {
    return raw.map((item) => objectRecord(item));
  }
  const top = objectRecord(raw);
  const unwrapped = top.data !== undefined ? top.data : raw;
  if (Array.isArray(unwrapped)) {
    return unwrapped.map((item) => objectRecord(item));
  }
  const record = objectRecord(unwrapped);
  if (Array.isArray(record.items)) {
    return record.items.map((item) => objectRecord(item));
  }
  return [];
}

export async function revokeOperationalPartnerCredential(
  adminOrigin: string,
  config: Pick<
    OperationalRoleSessionTargetConfig,
    "allowedTargets" | "candidateSha"
  >,
  fetchImpl: typeof fetch,
  adminInvocation: string,
  adminToken: string,
  entrySlug: string,
  keyId: string,
  mask?: (value: string) => void,
) {
  assertOpaqueCredential(adminInvocation, "adminInvocation");
  assertOpaqueCredential(adminToken, "adminToken");
  assertOpaqueCredential(entrySlug, "entrySlug");
  assertOpaqueCredential(keyId, "keyId");
  const relativePath = `platform-admin/partner-entries/${encodeURIComponent(entrySlug)}/credentials/${encodeURIComponent(keyId)}/revoke`;
  const stepUpReference = await issuePlatformAdminStepUpProof(
    adminOrigin,
    config,
    fetchImpl,
    adminInvocation,
    adminToken,
    "platform:partner-credentials:revoke",
    `/api/${relativePath}`,
    mask,
  );
  const raw = await requestControlPlaneProxy<Record<string, unknown>>(
    adminOrigin,
    config,
    fetchImpl,
    relativePath,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${adminInvocation}`,
        "x-drts-authorization": `Bearer ${adminToken}`,
        ...(stepUpReference
          ? { "x-drts-step-up-reference": stepUpReference }
          : {}),
      },
      body: JSON.stringify({
        revokeReason: "operational_c125_owned_foreign_fleet_teardown",
      }),
    },
    "Platform Admin BFF proxy",
  );
  const record = objectRecord(raw.data ?? raw);
  const credential = objectRecord(record.credential ?? record);
  assert.equal(credential.keyId, keyId);
  assert(
    credential.status === "revoked" ||
      Boolean(nonEmptyTrimmed(credential.revokedAt)),
    "Revoked partner credential must report status=revoked or non-null revokedAt",
  );
  if (credential.activeFlag !== undefined) {
    assert.equal(credential.activeFlag, false);
  }
}

export async function revokeOperationalPartnerEntry(
  adminOrigin: string,
  config: Pick<
    OperationalRoleSessionTargetConfig,
    "allowedTargets" | "candidateSha"
  >,
  fetchImpl: typeof fetch,
  adminInvocation: string,
  adminToken: string,
  entrySlug: string,
  mask?: (value: string) => void,
) {
  assertOpaqueCredential(adminInvocation, "adminInvocation");
  assertOpaqueCredential(adminToken, "adminToken");
  assertOpaqueCredential(entrySlug, "entrySlug");
  const deactivatePath = `platform-admin/partner-entries/${encodeURIComponent(entrySlug)}/deactivate`;
  const deactivateStepUpRef = await issuePlatformAdminStepUpProof(
    adminOrigin,
    config,
    fetchImpl,
    adminInvocation,
    adminToken,
    "platform:partner-entries:deactivate",
    `/api/${deactivatePath}`,
    mask,
  );
  try {
    const rawDeactivated = await requestControlPlaneProxy<
      Record<string, unknown>
    >(
      adminOrigin,
      config,
      fetchImpl,
      deactivatePath,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${adminInvocation}`,
          "x-drts-authorization": `Bearer ${adminToken}`,
          ...(deactivateStepUpRef
            ? { "x-drts-step-up-reference": deactivateStepUpRef }
            : {}),
        },
        body: "{}",
      },
      "Platform Admin BFF proxy",
    );
    const deactivatedRecord = objectRecord(
      rawDeactivated.data ?? rawDeactivated,
    );
    assert.equal(deactivatedRecord.entrySlug, entrySlug);
    if (deactivatedRecord.activeFlag !== undefined) {
      assert.equal(deactivatedRecord.activeFlag, false);
    }
  } catch (err) {
    if (
      !(
        err instanceof ControlPlaneProxyHttpError &&
        err.statusCode === 409 &&
        err.errorCode === "PARTNER_ENTRY_REVOKED"
      )
    ) {
      throw err;
    }
  }

  const revokePath = `platform-admin/partner-entries/${encodeURIComponent(entrySlug)}/revoke`;
  const revokeStepUpRef = await issuePlatformAdminStepUpProof(
    adminOrigin,
    config,
    fetchImpl,
    adminInvocation,
    adminToken,
    "platform:partner-entries:revoke",
    `/api/${revokePath}`,
    mask,
  );
  const raw = await requestControlPlaneProxy<Record<string, unknown>>(
    adminOrigin,
    config,
    fetchImpl,
    revokePath,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${adminInvocation}`,
        "x-drts-authorization": `Bearer ${adminToken}`,
        ...(revokeStepUpRef
          ? { "x-drts-step-up-reference": revokeStepUpRef }
          : {}),
      },
      body: JSON.stringify({
        reason: "operational_c125_owned_foreign_fleet_teardown",
      }),
    },
    "Platform Admin BFF proxy",
  );
  const record = objectRecord(raw.data ?? raw);
  assert.equal(record.entrySlug, entrySlug);
  assert.equal(record.status, "revoked");
  if (record.activeFlag !== undefined) {
    assert.equal(record.activeFlag, false);
  }
}

export async function deactivateOperationalCanonicalFleet(
  adminOrigin: string,
  config: Pick<
    OperationalRoleSessionTargetConfig,
    "allowedTargets" | "candidateSha" | "expectedOwnFleetId"
  >,
  fetchImpl: typeof fetch,
  adminInvocation: string,
  adminToken: string,
  fleetPartnerId: string,
) {
  assertOpaqueCredential(adminInvocation, "adminInvocation");
  assertOpaqueCredential(adminToken, "adminToken");
  assertOpaqueCredential(fleetPartnerId, "fleetPartnerId");
  assert.notEqual(
    fleetPartnerId,
    config.expectedOwnFleetId,
    `Refusing to deactivate protected own Fleet partner (${config.expectedOwnFleetId})`,
  );
  const raw = await requestControlPlaneProxy<Record<string, unknown>>(
    adminOrigin,
    config,
    fetchImpl,
    `admin/fleet-partners/${encodeURIComponent(fleetPartnerId)}`,
    {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${adminInvocation}`,
        "x-drts-authorization": `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ active: false }),
    },
    "Platform Admin BFF proxy",
  );
  const record = objectRecord(raw.data ?? raw);
  assert.equal(record.fleetPartnerId, fleetPartnerId);
  assert.equal(record.active, false);
}

async function recoverOwnedCanonicalFleetIds(
  adminOrigin: string,
  config: Pick<
    OperationalRoleSessionTargetConfig,
    "allowedTargets" | "candidateSha" | "expectedOwnFleetId"
  >,
  fetchImpl: typeof fetch,
  adminInvocation: string,
  adminToken: string,
  registrationMarker: string,
  expectedLegalName?: string,
): Promise<string[]> {
  const raw = await requestControlPlaneProxy<Record<string, unknown>>(
    adminOrigin,
    config,
    fetchImpl,
    "admin/fleet-partners",
    {
      method: "GET",
      headers: {
        authorization: `Bearer ${adminInvocation}`,
        "x-drts-authorization": `Bearer ${adminToken}`,
      },
    },
    "Platform Admin BFF proxy",
  );
  const items = extractItemsArray(raw);
  const matchedIds: string[] = [];
  for (const item of items) {
    const fleetPartnerId = nonEmptyTrimmed(item.fleetPartnerId);
    const businessRegistrationNo = nonEmptyTrimmed(item.businessRegistrationNo);
    const legalName = nonEmptyTrimmed(item.legalName);
    if (
      fleetPartnerId &&
      fleetPartnerId !== config.expectedOwnFleetId &&
      businessRegistrationNo === registrationMarker &&
      (!expectedLegalName || legalName === expectedLegalName)
    ) {
      matchedIds.push(fleetPartnerId);
    }
  }
  return Array.from(new Set(matchedIds));
}

async function recoverOwnedPartnerEntrySlug(
  adminOrigin: string,
  config: Pick<
    OperationalRoleSessionTargetConfig,
    "allowedTargets" | "candidateSha" | "expectedOwnFleetId"
  >,
  fetchImpl: typeof fetch,
  adminInvocation: string,
  adminToken: string,
  expectedEntrySlug: string,
  expectedPartnerIds: string[],
  expectedTenantId?: string,
  expectedProgramId?: string,
  expectedPartnerCode?: string,
): Promise<
  | { status: "missing" }
  | { status: "collision" }
  | { status: "owned"; entrySlug: string; item: Record<string, unknown> }
> {
  const raw = await requestControlPlaneProxy<Record<string, unknown>>(
    adminOrigin,
    config,
    fetchImpl,
    "platform-admin/partner-entries",
    {
      method: "GET",
      headers: {
        authorization: `Bearer ${adminInvocation}`,
        "x-drts-authorization": `Bearer ${adminToken}`,
      },
    },
    "Platform Admin BFF proxy",
  );
  const items = extractItemsArray(raw);
  const found = items.find(
    (item) => nonEmptyTrimmed(item.entrySlug) === expectedEntrySlug,
  );
  if (!found) {
    return { status: "missing" };
  }
  const partnerId =
    nonEmptyTrimmed(found.partnerId) ?? nonEmptyTrimmed(found.fleetPartnerId);
  const partnerType = nonEmptyTrimmed(found.partnerType);
  const tenantId = nonEmptyTrimmed(found.tenantId);
  const programId = nonEmptyTrimmed(found.programId);
  const partnerCode = nonEmptyTrimmed(found.partnerCode);
  const partnerMatches =
    Boolean(partnerId) &&
    partnerId !== config.expectedOwnFleetId &&
    (expectedPartnerIds.length === 0 ||
      expectedPartnerIds.includes(partnerId!));
  const tenantMatches = !expectedTenantId || tenantId === expectedTenantId;
  const programMatches = !expectedProgramId || programId === expectedProgramId;
  const codeMatches =
    !expectedPartnerCode ||
    partnerCode?.toUpperCase() === expectedPartnerCode.toUpperCase();
  if (
    partnerMatches &&
    partnerType === "fleet_partner" &&
    tenantMatches &&
    programMatches &&
    codeMatches
  ) {
    return { status: "owned", entrySlug: expectedEntrySlug, item: found };
  }
  return { status: "collision" };
}

async function recoverOwnedPartnerCredentialIds(
  adminOrigin: string,
  config: Pick<
    OperationalRoleSessionTargetConfig,
    "allowedTargets" | "candidateSha"
  >,
  fetchImpl: typeof fetch,
  adminInvocation: string,
  adminToken: string,
  entrySlug: string,
  expectedOwnerRef: string | undefined,
  mask: (value: string) => void,
): Promise<string[]> {
  const raw = await requestControlPlaneProxy<Record<string, unknown>>(
    adminOrigin,
    config,
    fetchImpl,
    `platform-admin/partner-entries/${encodeURIComponent(entrySlug)}/credentials`,
    {
      method: "GET",
      headers: {
        authorization: `Bearer ${adminInvocation}`,
        "x-drts-authorization": `Bearer ${adminToken}`,
      },
    },
    "Platform Admin BFF proxy",
  );
  const items = extractItemsArray(raw);
  const keyIds: string[] = [];
  for (const item of items) {
    const keyId = nonEmptyTrimmed(item.keyId);
    const ownerRef = nonEmptyTrimmed(item.ownerRef);
    if (keyId && (!expectedOwnerRef || ownerRef === expectedOwnerRef)) {
      mask(keyId);
      keyIds.push(keyId);
    }
  }
  return Array.from(new Set(keyIds));
}

async function recoverAndRevokeOwnedPartnerSessionsByPrincipals(
  apiRequest: MapSessionRequest,
  adminToken: string,
  keyIds: string[],
  tenantId: string | undefined,
  expectedPartnerIds: string[],
  mask: (value: string) => void,
): Promise<{ recoveredCount: number; revokedIds: string[] }> {
  assertOpaqueCredential(adminToken, "adminToken");
  if (keyIds.length === 0) {
    return { recoveredCount: 0, revokedIds: [] };
  }
  let recoveredCount = 0;
  const revokedIds: string[] = [];
  for (const keyId of keyIds) {
    assertOpaqueCredential(keyId, "keyId");
    const query = new URLSearchParams({
      principalId: keyId,
      realm: "partner",
      ...(tenantId ? { tenantId } : {}),
    });
    const listResponse = await apiRequest<unknown>(
      `identity/sessions?${query.toString()}`,
      {
        method: "GET",
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      },
    );
    const items = extractItemsArray(listResponse);
    for (const item of items) {
      const principalId = nonEmptyTrimmed(item.principalId);
      const realm = nonEmptyTrimmed(item.realm);
      const partnerId = nonEmptyTrimmed(item.partnerId);
      if (
        principalId !== keyId ||
        realm !== "partner" ||
        (expectedPartnerIds.length > 0 &&
          (!partnerId || !expectedPartnerIds.includes(partnerId)))
      ) {
        continue;
      }
      const sid = assertOpaqueCredential(
        item.sessionId,
        "recovered partner sessionId",
      );
      mask(sid);
      recoveredCount += 1;
      if (item.status !== "revoked" && !nonEmptyTrimmed(item.revokedAt)) {
        const revokeResponse = await apiRequest<{
          data?: Record<string, unknown>;
        }>(`identity/sessions/${encodeURIComponent(sid)}/revoke`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${adminToken}`,
            "x-csrf-token": IDENTITY_SESSION_REVOKE_CSRF_TOKEN,
          },
          body: JSON.stringify({
            reason:
              "operational_c125_owned_foreign_fleet_lost_bootstrap_recovery",
          }),
        });
        const revokedRecord = objectRecord(
          revokeResponse.data ?? revokeResponse,
        );
        const revokedSession = objectRecord(revokedRecord.session);
        assert.equal(revokedRecord.sessionId ?? revokedSession.sessionId, sid);
        assert(
          revokedRecord.revoked === true ||
            revokedRecord.status === "revoked" ||
            revokedSession.status === "revoked",
          "Admin session revoke response must confirm session revocation",
        );
      }
      revokedIds.push(sid);
    }
  }
  return {
    recoveredCount,
    revokedIds: Array.from(new Set(revokedIds)),
  };
}

export async function prepareOperationalRoleSessions(
  env: LiveEnv,
  deps: OperationalRoleSessionDeps,
): Promise<OperationalRoleSessionsEvidence> {
  const config = validateOperationalRoleSessionTargets(env);
  const invocationTokens = collectInvocationTokens(env, deps.mask);
  const apiRequest = createOperationalRoleSessionRequest(config, deps.fetch);
  const readGoogleIdToken =
    deps.readGoogleIdToken ??
    ((purpose: "observer" | "provisioning") => {
      if (purpose === "provisioning") {
        return readOperationalGoogleProvisioningIdToken(env, config);
      }
      const observer = nonEmptyTrimmed(
        env.DRTS_LIVE_MAP_GOOGLE_OBSERVER_ID_TOKEN,
      );
      if (!observer) {
        throw new Error("DRTS_LIVE_MAP_GOOGLE_OBSERVER_ID_TOKEN is required");
      }
      return observer;
    });

  const evidence: OperationalRoleSessionsEvidence = {
    candidate_sha: config.candidateSha,
    status: "failed",
    stage: "init",
    cleanup: "not-required",
    driver_isolation: undefined,
    foreign_fleet_precondition: "pending",
    sessions: [],
  };

  let opsToken: string | undefined;
  let ownOpsSessionId: string | undefined;
  let opsBffIssued = false;
  let opsSessionRevoked = false;
  let systemToken: string | undefined;
  let driverToken: string | undefined;
  let registrationCode: string | undefined;
  let invitationAttempted = false;
  let driverInvitationRevoked = false;
  let foreignFleetToken: string | undefined;
  let ownForeignFleetSessionId: string | undefined;
  let foreignFleetBootstrapIssued = false;
  let foreignFleetSessionRevoked = false;
  let ownForeignFleetPartnerIds: string[] = [];
  let foreignFleetCreateAttempted = false;
  let foreignFleetMasterDeactivated = false;
  let ownForeignFleetRegistrationMarker: string | undefined;
  let ownForeignFleetExpectedLegalName: string | undefined;
  let ownForeignFleetEntrySlug: string | undefined;
  let ownForeignFleetExpectedEntrySlug: string | undefined;
  let ownForeignFleetExpectedPartnerCode: string | undefined;
  let ownForeignFleetTenantId: string | undefined;
  let ownForeignFleetProgramId: string | undefined;
  let foreignFleetEntryCreateAttempted = false;
  let foreignFleetEntryRevoked = false;
  let ownForeignFleetKeyIds: string[] = [];
  let ownForeignFleetKeyOwnerRef: string | undefined;
  let foreignFleetKeyIssueAttempted = false;
  let foreignFleetKeyRevoked = false;
  let adminToken: string | undefined;
  let adminInvocationToken: string | undefined;
  let ownAdminSessionId: string | undefined;
  const ownAdminSessionIds: string[] = [];
  const revokedPrepareAdminSessionIds = new Set<string>();
  let adminBffIssued = false;
  let adminSessionRevoked = false;

  const ensurePlatformAdminSession = async (): Promise<{
    adminOrigin: string;
    adminInvocation: string;
    adminToken: string;
  }> => {
    if (!config.adminOrigin) {
      evidence.foreign_fleet_precondition = "missing-external-fixture";
      throw new OperationalForeignFleetFixturePreconditionError(
        "External foreign_fleet fixture precondition unmet: DRTS_OPERATIONAL_PLATFORM_ADMIN_URL (or DRTS_DEV_PLATFORM_ADMIN_BASE_URL) is required to verify canonical foreign Fleet record via Platform Admin BFF",
      );
    }
    const adminInvocation =
      nonEmptyTrimmed(env.DRTS_OPERATIONAL_PLATFORM_ADMIN_ID_TOKEN) ??
      nonEmptyTrimmed(env.DRTS_DEV_PLATFORM_ADMIN_ID_TOKEN);
    if (!adminInvocation) {
      evidence.foreign_fleet_precondition = "missing-external-fixture";
      throw new OperationalForeignFleetFixturePreconditionError(
        "External foreign_fleet fixture precondition unmet: DRTS_OPERATIONAL_PLATFORM_ADMIN_ID_TOKEN (or DRTS_DEV_PLATFORM_ADMIN_ID_TOKEN) is required to verify canonical foreign Fleet record via Platform Admin BFF",
      );
    }
    assertOpaqueCredential(
      adminInvocation,
      "DRTS_OPERATIONAL_PLATFORM_ADMIN_ID_TOKEN",
    );
    deps.mask(adminInvocation);
    adminInvocationToken = adminInvocation;

    if (adminToken && !adminSessionRevoked) {
      return {
        adminOrigin: config.adminOrigin,
        adminInvocation,
        adminToken,
      };
    }

    const suppliedAdminSessionToken =
      nonEmptyTrimmed(env.DRTS_OPERATIONAL_PLATFORM_ADMIN_SESSION_TOKEN) ??
      nonEmptyTrimmed(env.DRTS_OPERATIONAL_PLATFORM_REVIEWER_SESSION_TOKEN);
    let issuedAdminPrincipalId: string | undefined;

    if (suppliedAdminSessionToken) {
      assertOpaqueCredential(
        suppliedAdminSessionToken,
        "DRTS_OPERATIONAL_PLATFORM_ADMIN_SESSION_TOKEN",
      );
      deps.mask(suppliedAdminSessionToken);
      assertDistinctFromInvocationTokens(
        suppliedAdminSessionToken,
        invocationTokens,
        "platform_admin",
      );
      adminToken = suppliedAdminSessionToken;
    } else {
      const rawAdminIssued = await requestControlPlaneProxy<
        Record<string, unknown>
      >(
        config.adminOrigin,
        config,
        deps.fetch,
        "auth/token",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${adminInvocation}`,
          },
          body: "{}",
        },
        "Platform Admin BFF proxy",
      );
      const adminIssued = objectRecord(rawAdminIssued.data ?? rawAdminIssued);
      const issuedToken = assertOpaqueCredential(
        adminIssued.token,
        "Platform Admin BFF issued token",
      );
      deps.mask(issuedToken);
      assertDistinctFromInvocationTokens(
        issuedToken,
        invocationTokens,
        "platform_admin",
      );
      adminToken = issuedToken;
      adminBffIssued = true;
      adminSessionRevoked = false;
      evidence.cleanup = "unconfirmed";
      deps.exportSession(
        "DRTS_OPERATIONAL_PLATFORM_ADMIN_CLEANUP_STATUS",
        "pending",
      );
      deps.exportSession(
        "DRTS_OPERATIONAL_PLATFORM_ADMIN_RECOVERY_TOKEN",
        adminToken,
      );
      deps.exportSession(
        "DRTS_OPERATIONAL_PLATFORM_ADMIN_ISSUED_ATTEMPTED",
        "true",
      );

      const adminJwtClaims = decodeJwtPayloadIfStructured(issuedToken);
      const issuedSessionId = assertOpaqueCredential(
        adminIssued.sessionId ??
          adminJwtClaims?.sid ??
          adminJwtClaims?.sessionId,
        "Platform Admin BFF issued sessionId",
      );
      deps.mask(issuedSessionId);
      ownAdminSessionId = issuedSessionId;
      revokedPrepareAdminSessionIds.delete(issuedSessionId);
      if (!ownAdminSessionIds.includes(issuedSessionId)) {
        ownAdminSessionIds.push(issuedSessionId);
      }
      evidence.cleanup = "required";
      deps.exportSession(
        "DRTS_OPERATIONAL_PLATFORM_ADMIN_OWNED_SESSION_ID",
        ownAdminSessionIds.join(","),
      );

      issuedAdminPrincipalId = assertOpaqueCredential(
        adminIssued.principalId,
        "Platform Admin BFF issued principalId",
      );
      assert.equal(adminIssued.realm, "platform");
      assert.equal(adminIssued.actorType, "platform_admin");
    }

    const rawAdminSession = await requestControlPlaneProxy<
      Record<string, unknown>
    >(
      config.adminOrigin,
      config,
      deps.fetch,
      "auth/session",
      {
        method: "GET",
        headers: {
          authorization: `Bearer ${adminInvocation}`,
          "x-drts-authorization": `Bearer ${adminToken}`,
        },
      },
      "Platform Admin BFF proxy",
    );
    const adminSession = objectRecord(rawAdminSession.data ?? rawAdminSession);
    const adminIdentity = objectRecord(adminSession.identity);
    assert.equal(
      adminSession.active,
      true,
      "Platform Admin session must be active",
    );
    assert.equal(adminIdentity.authMode, "jwt_bearer");
    assert.equal(adminIdentity.realm, "platform");
    assert.equal(adminIdentity.actorType, "platform_admin");
    if (
      !suppliedAdminSessionToken &&
      ownAdminSessionId &&
      issuedAdminPrincipalId
    ) {
      assert.equal(adminIdentity.sessionId, ownAdminSessionId);
      assert.equal(adminIdentity.principalId, issuedAdminPrincipalId);
    }

    return {
      adminOrigin: config.adminOrigin,
      adminInvocation,
      adminToken,
    };
  };

  const cleanupIssuedResources = async () => {
    const cleanupFailures: string[] = [];
    if (registrationCode && systemToken && !driverInvitationRevoked) {
      try {
        await revokeOperationalDriverInvitation(
          apiRequest,
          systemToken,
          registrationCode,
        );
        driverInvitationRevoked = true;
        deps.exportSession(
          "DRTS_OPERATIONAL_DRIVER_INVITATION_CLEANUP_STATUS",
          "passed",
        );
        deps.exportSession(
          "DRTS_OPERATIONAL_DRIVER_INVITATION_REVOKED",
          "true",
        );
      } catch {
        cleanupFailures.push("driver_invitation");
      }
    } else if (invitationAttempted && !registrationCode) {
      cleanupFailures.push("driver_invitation_unconfirmed");
    }

    const needsAdminCleanup =
      (foreignFleetBootstrapIssued &&
        !ownForeignFleetSessionId &&
        !foreignFleetSessionRevoked &&
        (ownForeignFleetKeyIds.length > 0 || foreignFleetKeyIssueAttempted)) ||
      ((ownForeignFleetKeyIds.length > 0 || foreignFleetKeyIssueAttempted) &&
        !foreignFleetKeyRevoked) ||
      ((Boolean(ownForeignFleetEntrySlug) ||
        foreignFleetEntryCreateAttempted) &&
        !foreignFleetEntryRevoked) ||
      ((ownForeignFleetPartnerIds.length > 0 || foreignFleetCreateAttempted) &&
        !foreignFleetMasterDeactivated);

    if (
      needsAdminCleanup &&
      (!adminToken || adminSessionRevoked) &&
      config.adminOrigin
    ) {
      try {
        await ensurePlatformAdminSession();
      } catch {
        // Individual cleanup blocks below will record concrete failure/unconfirmed markers.
      }
    }

    // Recover owned Fleet IDs, entrySlug, and keyIds first when needed so lost-session
    // recovery and reverse-order teardown have the fullest possible context.
    if (
      ownForeignFleetPartnerIds.length === 0 &&
      foreignFleetCreateAttempted &&
      !foreignFleetMasterDeactivated &&
      ownForeignFleetRegistrationMarker &&
      config.adminOrigin &&
      adminInvocationToken &&
      adminToken
    ) {
      try {
        const recoveredFleetIds = await recoverOwnedCanonicalFleetIds(
          config.adminOrigin,
          config,
          deps.fetch,
          adminInvocationToken,
          adminToken,
          ownForeignFleetRegistrationMarker,
          ownForeignFleetExpectedLegalName,
        );
        if (recoveredFleetIds.length > 0) {
          ownForeignFleetPartnerIds = recoveredFleetIds;
          deps.exportSession(
            "DRTS_OPERATIONAL_FOREIGN_FLEET_OWNED_PARTNER_ID",
            ownForeignFleetPartnerIds.join(","),
          );
        }
      } catch {
        // Handled in master cleanup step below.
      }
    }

    if (
      !ownForeignFleetEntrySlug &&
      foreignFleetEntryCreateAttempted &&
      !foreignFleetEntryRevoked &&
      ownForeignFleetExpectedEntrySlug &&
      config.adminOrigin &&
      adminInvocationToken &&
      adminToken
    ) {
      try {
        const recoveredEntry = await recoverOwnedPartnerEntrySlug(
          config.adminOrigin,
          config,
          deps.fetch,
          adminInvocationToken,
          adminToken,
          ownForeignFleetExpectedEntrySlug,
          ownForeignFleetPartnerIds,
          ownForeignFleetTenantId,
          ownForeignFleetProgramId,
          ownForeignFleetExpectedPartnerCode,
        );
        if (recoveredEntry.status === "owned") {
          ownForeignFleetEntrySlug = recoveredEntry.entrySlug;
          deps.exportSession(
            "DRTS_OPERATIONAL_FOREIGN_FLEET_OWNED_ENTRY_CONFIRMED",
            "true",
          );
        } else if (recoveredEntry.status === "collision") {
          // Never touch an unrelated pre-existing entry collision.
          foreignFleetEntryCreateAttempted = false;
          deps.exportSession(
            "DRTS_OPERATIONAL_FOREIGN_FLEET_ENTRY_CREATE_ATTEMPTED",
            "false",
          );
          deps.exportSession(
            "DRTS_OPERATIONAL_FOREIGN_FLEET_ENTRY_CLEANUP_STATUS",
            "not-required",
          );
        }
      } catch {
        // Handled in entry cleanup step below.
      }
    }

    if (
      ownForeignFleetKeyIds.length === 0 &&
      foreignFleetKeyIssueAttempted &&
      !foreignFleetKeyRevoked &&
      ownForeignFleetEntrySlug &&
      config.adminOrigin &&
      adminInvocationToken &&
      adminToken
    ) {
      try {
        const recoveredKeyIds = await recoverOwnedPartnerCredentialIds(
          config.adminOrigin,
          config,
          deps.fetch,
          adminInvocationToken,
          adminToken,
          ownForeignFleetEntrySlug,
          ownForeignFleetKeyOwnerRef,
          deps.mask,
        );
        if (recoveredKeyIds.length > 0) {
          ownForeignFleetKeyIds = recoveredKeyIds;
          deps.exportSession(
            "DRTS_OPERATIONAL_FOREIGN_FLEET_OWNED_KEY_ID",
            ownForeignFleetKeyIds.join(","),
          );
        }
      } catch {
        // Handled in key cleanup step below.
      }
    }

    if (
      ownForeignFleetSessionId &&
      foreignFleetToken &&
      !foreignFleetSessionRevoked
    ) {
      try {
        await revokeOperationalApplicationSession(
          apiRequest,
          foreignFleetToken,
          ownForeignFleetSessionId,
        );
        foreignFleetSessionRevoked = true;
        deps.exportSession(
          "DRTS_OPERATIONAL_FOREIGN_FLEET_CLEANUP_STATUS",
          "passed",
        );
        deps.exportSession(
          "DRTS_OPERATIONAL_FOREIGN_FLEET_SESSION_REVOKED",
          "true",
        );
      } catch {
        cleanupFailures.push("foreign_fleet_session");
      }
    } else if (
      foreignFleetBootstrapIssued &&
      !ownForeignFleetSessionId &&
      !foreignFleetSessionRevoked
    ) {
      if (ownForeignFleetKeyIds.length > 0 && adminToken) {
        try {
          const recoveredSessions =
            await recoverAndRevokeOwnedPartnerSessionsByPrincipals(
              apiRequest,
              adminToken,
              ownForeignFleetKeyIds,
              ownForeignFleetTenantId,
              ownForeignFleetPartnerIds,
              deps.mask,
            );
          if (recoveredSessions.recoveredCount > 0) {
            ownForeignFleetSessionId = recoveredSessions.revokedIds[0];
            foreignFleetSessionRevoked = true;
            if (ownForeignFleetSessionId) {
              deps.exportSession(
                "DRTS_OPERATIONAL_FOREIGN_FLEET_OWNED_SESSION_ID",
                ownForeignFleetSessionId,
              );
            }
            deps.exportSession(
              "DRTS_OPERATIONAL_FOREIGN_FLEET_CLEANUP_STATUS",
              "passed",
            );
            deps.exportSession(
              "DRTS_OPERATIONAL_FOREIGN_FLEET_SESSION_REVOKED",
              "true",
            );
          } else {
            cleanupFailures.push("foreign_fleet_session_unconfirmed");
          }
        } catch {
          cleanupFailures.push("foreign_fleet_session");
        }
      } else {
        cleanupFailures.push("foreign_fleet_session_unconfirmed");
      }
    }

    if (
      (ownForeignFleetKeyIds.length > 0 || foreignFleetKeyIssueAttempted) &&
      !foreignFleetKeyRevoked
    ) {
      if (
        ownForeignFleetKeyIds.length > 0 &&
        ownForeignFleetEntrySlug &&
        config.adminOrigin &&
        adminInvocationToken &&
        adminToken
      ) {
        try {
          for (const keyId of ownForeignFleetKeyIds) {
            await revokeOperationalPartnerCredential(
              config.adminOrigin,
              config,
              deps.fetch,
              adminInvocationToken,
              adminToken,
              ownForeignFleetEntrySlug,
              keyId,
              deps.mask,
            );
          }
          foreignFleetKeyRevoked = true;
          deps.exportSession(
            "DRTS_OPERATIONAL_FOREIGN_FLEET_KEY_CLEANUP_STATUS",
            "passed",
          );
          deps.exportSession(
            "DRTS_OPERATIONAL_FOREIGN_FLEET_KEY_REVOKED",
            "true",
          );
        } catch {
          cleanupFailures.push("foreign_fleet_key");
        }
      } else if (ownForeignFleetKeyIds.length === 0) {
        cleanupFailures.push("foreign_fleet_key_unconfirmed");
      } else {
        cleanupFailures.push("foreign_fleet_key");
      }
    }

    if (
      (Boolean(ownForeignFleetEntrySlug) || foreignFleetEntryCreateAttempted) &&
      !foreignFleetEntryRevoked
    ) {
      if (
        ownForeignFleetEntrySlug &&
        config.adminOrigin &&
        adminInvocationToken &&
        adminToken
      ) {
        try {
          await revokeOperationalPartnerEntry(
            config.adminOrigin,
            config,
            deps.fetch,
            adminInvocationToken,
            adminToken,
            ownForeignFleetEntrySlug,
            deps.mask,
          );
          foreignFleetEntryRevoked = true;
          deps.exportSession(
            "DRTS_OPERATIONAL_FOREIGN_FLEET_ENTRY_CLEANUP_STATUS",
            "passed",
          );
          deps.exportSession(
            "DRTS_OPERATIONAL_FOREIGN_FLEET_ENTRY_REVOKED",
            "true",
          );
        } catch {
          cleanupFailures.push("foreign_fleet_entry");
        }
      } else if (!ownForeignFleetEntrySlug) {
        cleanupFailures.push("foreign_fleet_entry_unconfirmed");
      } else {
        cleanupFailures.push("foreign_fleet_entry");
      }
    }

    if (
      (ownForeignFleetPartnerIds.length > 0 || foreignFleetCreateAttempted) &&
      !foreignFleetMasterDeactivated
    ) {
      if (
        ownForeignFleetPartnerIds.length > 0 &&
        config.adminOrigin &&
        adminInvocationToken &&
        adminToken
      ) {
        try {
          for (const fleetId of ownForeignFleetPartnerIds) {
            await deactivateOperationalCanonicalFleet(
              config.adminOrigin,
              config,
              deps.fetch,
              adminInvocationToken,
              adminToken,
              fleetId,
            );
          }
          foreignFleetMasterDeactivated = true;
          deps.exportSession(
            "DRTS_OPERATIONAL_FOREIGN_FLEET_MASTER_CLEANUP_STATUS",
            "passed",
          );
          deps.exportSession(
            "DRTS_OPERATIONAL_FOREIGN_FLEET_MASTER_DEACTIVATED",
            "true",
          );
        } catch {
          cleanupFailures.push("foreign_fleet_master");
        }
      } else if (ownForeignFleetPartnerIds.length === 0) {
        cleanupFailures.push("foreign_fleet_master_unconfirmed");
      } else {
        cleanupFailures.push("foreign_fleet_master");
      }
    }

    if (ownOpsSessionId && opsToken && !opsSessionRevoked) {
      try {
        await revokeOperationalApplicationSession(
          apiRequest,
          opsToken,
          ownOpsSessionId,
        );
        opsSessionRevoked = true;
        deps.exportSession(
          "DRTS_OPERATIONAL_OPS_NON_REVIEWER_CLEANUP_STATUS",
          "passed",
        );
        deps.exportSession(
          "DRTS_OPERATIONAL_OPS_NON_REVIEWER_SESSION_REVOKED",
          "true",
        );
      } catch {
        cleanupFailures.push("ops_session");
      }
    } else if (opsBffIssued && !ownOpsSessionId) {
      cleanupFailures.push("ops_session_unconfirmed");
    }

    const hasPendingAdminManagedCleanup = cleanupFailures.some(
      (item) =>
        item.startsWith("foreign_fleet_key") ||
        item.startsWith("foreign_fleet_entry") ||
        item.startsWith("foreign_fleet_master") ||
        (item.startsWith("foreign_fleet_session") &&
          (ownForeignFleetKeyIds.length > 0 || foreignFleetKeyIssueAttempted)),
    );

    if (
      ownAdminSessionIds.length > 0 &&
      adminToken &&
      !adminSessionRevoked &&
      !hasPendingAdminManagedCleanup
    ) {
      const pendingPrepareAdminSids = ownAdminSessionIds.filter(
        (sid) => !revokedPrepareAdminSessionIds.has(sid),
      );
      const orderedPrepareAdminSids = [
        ...pendingPrepareAdminSids.filter((sid) => sid !== ownAdminSessionId),
        ...pendingPrepareAdminSids.filter((sid) => sid === ownAdminSessionId),
      ];
      for (const adminSid of orderedPrepareAdminSids) {
        try {
          await revokeOperationalApplicationSession(
            apiRequest,
            adminToken,
            adminSid,
          );
          revokedPrepareAdminSessionIds.add(adminSid);
        } catch {
          // Handled below via remainingPrepareAdminSids.
        }
      }
      const remainingPrepareAdminSids = ownAdminSessionIds.filter(
        (sid) => !revokedPrepareAdminSessionIds.has(sid),
      );
      if (remainingPrepareAdminSids.length === 0) {
        adminSessionRevoked = true;
        deps.exportSession(
          "DRTS_OPERATIONAL_PLATFORM_ADMIN_CLEANUP_STATUS",
          "passed",
        );
        deps.exportSession(
          "DRTS_OPERATIONAL_PLATFORM_ADMIN_SESSION_REVOKED",
          "true",
        );
      } else {
        cleanupFailures.push("admin_session");
      }
    } else if (adminBffIssued && ownAdminSessionIds.length === 0) {
      cleanupFailures.push("admin_session_unconfirmed");
    }
    if (cleanupFailures.length === 0) {
      if (
        registrationCode ||
        ownForeignFleetSessionId ||
        ownForeignFleetKeyIds.length > 0 ||
        ownForeignFleetEntrySlug ||
        ownForeignFleetPartnerIds.length > 0 ||
        ownOpsSessionId ||
        ownAdminSessionIds.length > 0
      ) {
        evidence.cleanup = "passed";
        deps.exportSession(
          "DRTS_OPERATIONAL_ROLE_SESSIONS_CLEANUP_STATUS",
          "passed",
        );
      }
    } else {
      const onlyUnconfirmed = cleanupFailures.every((item) =>
        item.endsWith("_unconfirmed"),
      );
      evidence.cleanup = onlyUnconfirmed ? "unconfirmed" : "failed";
      deps.exportSession(
        "DRTS_OPERATIONAL_ROLE_SESSIONS_CLEANUP_STATUS",
        evidence.cleanup,
      );
    }
  };

  const verifyCanonicalForeignFleetViaAdminBff = async (
    partnerId: string,
    options?: { retainAdminSession?: boolean },
  ) => {
    evidence.stage = "foreign_fleet:verify-canonical-fleet";
    const cleanupBeforeAdmin = evidence.cleanup;
    const adminCtx = await ensurePlatformAdminSession();

    try {
      const fleetUrl = `${adminCtx.adminOrigin}/control-plane-proxy/admin/fleet-partners/${encodeURIComponent(partnerId)}`;
      assertAllowedTargetUrl(fleetUrl, config.allowedTargets);
      const fleetResponse = await deps.fetch(fleetUrl, {
        method: "GET",
        headers: {
          authorization: `Bearer ${adminCtx.adminInvocation}`,
          "x-drts-authorization": `Bearer ${adminCtx.adminToken}`,
        },
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
      });
      assert.equal(
        fleetResponse.headers.get("x-drts-candidate-sha"),
        config.candidateSha,
      );
      if (fleetResponse.status === 404) {
        evidence.foreign_fleet_precondition = "invalid-external-fixture";
        throw new OperationalForeignFleetFixturePreconditionError(
          `Foreign Fleet partnerId (${partnerId}) does not have an active canonical Fleet record`,
        );
      }
      assert(
        fleetResponse.ok,
        `Canonical Fleet read failed with HTTP ${fleetResponse.status}`,
      );
      const fleetPayload = objectRecord(
        normalizeApiResponse(await fleetResponse.json()),
      );
      const fleetRecord = objectRecord(fleetPayload.data ?? fleetPayload);
      const canonicalFleetId = nonEmptyTrimmed(fleetRecord.fleetPartnerId);
      if (
        canonicalFleetId !== partnerId ||
        fleetRecord.active !== true ||
        canonicalFleetId === config.expectedOwnFleetId
      ) {
        evidence.foreign_fleet_precondition = "invalid-external-fixture";
        throw new OperationalForeignFleetFixturePreconditionError(
          `Foreign Fleet partnerId (${partnerId}) is not an active canonical Fleet partner distinct from own Fleet (${config.expectedOwnFleetId})`,
        );
      }
    } finally {
      if (
        !options?.retainAdminSession &&
        ownAdminSessionIds.length > 0 &&
        adminToken &&
        !adminSessionRevoked
      ) {
        const pendingPrepareAdminSids = ownAdminSessionIds.filter(
          (sid) => !revokedPrepareAdminSessionIds.has(sid),
        );
        const orderedPrepareAdminSids = [
          ...pendingPrepareAdminSids.filter((sid) => sid !== ownAdminSessionId),
          ...pendingPrepareAdminSids.filter((sid) => sid === ownAdminSessionId),
        ];
        try {
          for (const adminSid of orderedPrepareAdminSids) {
            await revokeOperationalApplicationSession(
              apiRequest,
              adminToken,
              adminSid,
            );
            revokedPrepareAdminSessionIds.add(adminSid);
          }
          adminSessionRevoked = true;
          deps.exportSession(
            "DRTS_OPERATIONAL_PLATFORM_ADMIN_CLEANUP_STATUS",
            "passed",
          );
          deps.exportSession(
            "DRTS_OPERATIONAL_PLATFORM_ADMIN_SESSION_REVOKED",
            "true",
          );
          evidence.cleanup = cleanupBeforeAdmin;
        } catch {
          // Leave adminSessionRevoked false so cleanupIssuedResources / teardown retries.
        }
      }
    }
  };

  try {
    // 1. ops_non_reviewer application session (DRTS_OPERATIONAL_OPS_NON_REVIEWER_SESSION_TOKEN)
    evidence.stage = "ops_non_reviewer:resolve";
    const suppliedOpsToken =
      nonEmptyTrimmed(env.DRTS_OPERATIONAL_OPS_NON_REVIEWER_SESSION_TOKEN) ??
      nonEmptyTrimmed(env.DRTS_LIVE_MAP_OBSERVER_SESSION_TOKEN);
    const suppliedReviewerTokens = new Set(
      [
        nonEmptyTrimmed(env.DRTS_OPERATIONAL_PLATFORM_REVIEWER_SESSION_TOKEN),
        nonEmptyTrimmed(env.DRTS_OPERATIONAL_PLATFORM_ADMIN_SESSION_TOKEN),
      ].filter((v): v is string => Boolean(v)),
    );
    for (const reviewerToken of suppliedReviewerTokens) {
      deps.mask(reviewerToken);
    }

    if (suppliedOpsToken) {
      assertOpaqueCredential(
        suppliedOpsToken,
        "DRTS_OPERATIONAL_OPS_NON_REVIEWER_SESSION_TOKEN",
      );
      deps.mask(suppliedOpsToken);
      assertDistinctFromInvocationTokens(
        suppliedOpsToken,
        invocationTokens,
        "ops_non_reviewer",
      );
      if (suppliedReviewerTokens.has(suppliedOpsToken)) {
        throw new Error(
          "ops_non_reviewer session token must be distinct from platform reviewer/admin session token",
        );
      }
      evidence.stage = "ops_non_reviewer:verify-session";
      const verifiedOps = await verifyOpsNonReviewerSession(
        apiRequest,
        suppliedOpsToken,
      );
      opsToken = suppliedOpsToken;
      evidence.sessions.push({
        role: "ops_non_reviewer",
        source: "provided-session",
        realm: verifiedOps.realm,
        actor_type: verifiedOps.actorType,
        actor_id: verifiedOps.actorId,
        scopes: verifiedOps.scopes,
      });
    } else {
      evidence.stage = "ops_non_reviewer:issue";
      const opsIdToken =
        nonEmptyTrimmed(env.DRTS_OPERATIONAL_OPS_CONSOLE_ID_TOKEN) ??
        nonEmptyTrimmed(env.DRTS_DEV_OPS_CONSOLE_ID_TOKEN);
      if (!opsIdToken) {
        throw new Error(
          "DRTS_OPERATIONAL_OPS_CONSOLE_ID_TOKEN or DRTS_DEV_OPS_CONSOLE_ID_TOKEN is required for Ops BFF session exchange",
        );
      }
      assertOpaqueCredential(
        opsIdToken,
        "DRTS_OPERATIONAL_OPS_CONSOLE_ID_TOKEN",
      );
      deps.mask(opsIdToken);
      const rawIssued = await requestOpsControlPlaneProxy<
        Record<string, unknown>
      >(config, deps.fetch, "auth/token", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${opsIdToken}`,
        },
        body: "{}",
      });
      const issued = objectRecord(rawIssued.data ?? rawIssued);
      const token = assertOpaqueCredential(
        issued.token,
        "Ops BFF issued token",
      );
      deps.mask(token);
      assertDistinctFromInvocationTokens(
        token,
        invocationTokens,
        "ops_non_reviewer",
      );
      opsToken = token;
      opsBffIssued = true;
      opsSessionRevoked = false;
      evidence.cleanup = "unconfirmed";
      deps.exportSession(
        "DRTS_OPERATIONAL_OPS_NON_REVIEWER_CLEANUP_STATUS",
        "pending",
      );
      deps.exportSession(
        "DRTS_OPERATIONAL_OPS_NON_REVIEWER_RECOVERY_TOKEN",
        opsToken,
      );
      deps.exportSession(
        "DRTS_OPERATIONAL_OPS_NON_REVIEWER_ISSUED_ATTEMPTED",
        "true",
      );

      const opsJwtClaims = decodeJwtPayloadIfStructured(token);
      const sessionId = assertOpaqueCredential(
        issued.sessionId ?? opsJwtClaims?.sid ?? opsJwtClaims?.sessionId,
        "Ops BFF issued sessionId",
      );
      deps.mask(sessionId);
      ownOpsSessionId = sessionId;
      evidence.cleanup = "required";
      deps.exportSession(
        "DRTS_OPERATIONAL_OPS_NON_REVIEWER_OWNED_SESSION_ID",
        ownOpsSessionId,
      );

      const principalId = assertOpaqueCredential(
        issued.principalId,
        "Ops BFF issued principalId",
      );
      const expiresIn = nonEmptyTrimmed(issued.expiresIn) ?? "8h";
      assert(
        /^(?:[1-9]\d*[sm]|[1-8]h)$/.test(expiresIn),
        "Ops BFF expiresIn must be a bounded duration",
      );
      assert.equal(issued.realm, "ops");
      assert.equal(issued.actorType, "ops_user");

      evidence.stage = "ops_non_reviewer:verify-session";
      const verifiedOps = await verifyOpsNonReviewerSession(
        apiRequest,
        opsToken,
        { sessionId, principalId },
      );
      evidence.sessions.push({
        role: "ops_non_reviewer",
        source: "ops-bff-exchange",
        realm: verifiedOps.realm,
        actor_type: verifiedOps.actorType,
        actor_id: verifiedOps.actorId,
        scopes: verifiedOps.scopes,
        expires_in: expiresIn,
      });
    }

    // 2. system application session (DRTS_OPERATIONAL_SYSTEM_SESSION_TOKEN)
    evidence.stage = "system:resolve";
    const suppliedSystemToken =
      nonEmptyTrimmed(env.DRTS_OPERATIONAL_SYSTEM_SESSION_TOKEN) ??
      nonEmptyTrimmed(env.DRTS_LIVE_MAP_PROVISIONER_SESSION_TOKEN);
    if (suppliedSystemToken) {
      assertOpaqueCredential(
        suppliedSystemToken,
        "DRTS_OPERATIONAL_SYSTEM_SESSION_TOKEN",
      );
      deps.mask(suppliedSystemToken);
      assertDistinctFromInvocationTokens(
        suppliedSystemToken,
        invocationTokens,
        "system",
      );
      if (suppliedSystemToken === opsToken) {
        throw new Error(
          "system session token must be distinct from ops session",
        );
      }
      evidence.stage = "system:verify-session";
      await verifyMapProvisioningSession(
        config.driverId,
        apiRequest,
        suppliedSystemToken,
      );
      systemToken = suppliedSystemToken;
      evidence.sessions.push({
        role: "system",
        source: "provided-session",
        realm: "system",
        actor_type: "system",
        actor_id: MAP_PROVISIONER_ID,
        scopes: ["driver:provision"],
      });
    } else {
      evidence.stage = "system:issue";
      const issuedSystem = await issueMapProvisioningSession(
        config.driverId,
        apiRequest,
        {
          readGoogleIdToken: (purpose) => {
            const assertion = readGoogleIdToken(purpose).trim();
            if (purpose === "provisioning") {
              for (const envName of NON_PROVISIONING_INVOCATION_TOKEN_ENV_NAMES) {
                const other = nonEmptyTrimmed(env[envName]);
                if (other && other === assertion) {
                  throw new Error(
                    "Google provisioning assertion must not equal a service invocation ID token",
                  );
                }
              }
              const claims = decodeJwtPayloadIfStructured(assertion);
              if (claims) {
                if (
                  claims.aud !== undefined &&
                  claims.aud !== `${config.apiOrigin}/driver-provisioning`
                ) {
                  throw new Error(
                    "Google provisioning assertion audience must match <ApiOrigin>/driver-provisioning",
                  );
                }
                if (claims.email !== undefined) {
                  const email = String(claims.email);
                  const expectedPattern = config.gcpProjectId
                    ? new RegExp(
                        `^drts-dev-live-map@${config.gcpProjectId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.iam\\.gserviceaccount\\.com$`,
                      )
                    : /^drts-dev-live-map@[a-z0-9-]+\.iam\.gserviceaccount\.com$/;
                  if (!expectedPattern.test(email)) {
                    throw new Error(
                      "Google provisioning assertion email must be drts-dev-live-map@<project>.iam.gserviceaccount.com",
                    );
                  }
                }
              }
            }
            return assertion;
          },
          mask: deps.mask,
        },
      );
      assertDistinctFromInvocationTokens(
        issuedSystem.token,
        invocationTokens,
        "system",
      );
      systemToken = issuedSystem.token;
      evidence.sessions.push({
        role: "system",
        source: "google-workload-provisioning-exchange",
        realm: "system",
        actor_type: "system",
        actor_id: MAP_PROVISIONER_ID,
        scopes: ["driver:provision"],
        expires_in: issuedSystem.expiresIn,
      });
    }

    // 3. driver application session (DRTS_OPERATIONAL_DRIVER_SESSION_TOKEN)
    evidence.stage = "driver:resolve";
    const suppliedDriverToken =
      nonEmptyTrimmed(env.DRTS_OPERATIONAL_DRIVER_SESSION_TOKEN) ??
      nonEmptyTrimmed(env.DRTS_LIVE_MAP_DRIVER_SESSION_TOKEN);
    if (suppliedDriverToken) {
      assertOpaqueCredential(
        suppliedDriverToken,
        "DRTS_OPERATIONAL_DRIVER_SESSION_TOKEN",
      );
      deps.mask(suppliedDriverToken);
      assertDistinctFromInvocationTokens(
        suppliedDriverToken,
        invocationTokens,
        "driver",
      );
      if (
        suppliedDriverToken === opsToken ||
        suppliedDriverToken === systemToken
      ) {
        throw new Error(
          "driver session token must be distinct from ops and system sessions",
        );
      }
      evidence.stage = "driver:verify-session";
      const verifiedDriver = await verifyDriverRoleSession(
        apiRequest,
        config.driverId,
        suppliedDriverToken,
      );
      driverToken = suppliedDriverToken;
      evidence.sessions.push({
        role: "driver",
        source: "provided-session",
        realm: verifiedDriver.realm,
        actor_type: verifiedDriver.actorType,
        actor_id: verifiedDriver.actorId,
        scopes: verifiedDriver.scopes,
      });
    } else {
      // Check reserved driver's live isolation before creating any invitation
      // or replacing its device binding.
      evidence.stage = "driver:isolation";
      const registry = await apiRequest<unknown>(
        "regulatory-registry/drivers",
        {
          method: "GET",
          headers: { authorization: `Bearer ${opsToken}` },
        },
      );
      evidence.driver_isolation = inspectMapDriverIsolation(
        registry,
        config.driverId,
      );
      assertMapDriverIsolation(evidence.driver_isolation);

      evidence.stage = "driver:issue-invite";
      deps.exportSession(
        "DRTS_LIVE_MAP_PROVISIONER_SESSION_TOKEN",
        systemToken,
      );
      deps.exportSession(
        "DRTS_OPERATIONAL_DRIVER_INVITATION_CLEANUP_STATUS",
        "pending",
      );
      deps.exportSession("DRTS_LIVE_MAP_INVITATION_ATTEMPTED", "true");
      invitationAttempted = true;
      driverInvitationRevoked = false;
      evidence.cleanup = "unconfirmed";

      const invite = await apiRequest<{
        data: { registrationCode: string };
      }>("auth/driver/device/invite", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${systemToken}`,
        },
        body: JSON.stringify({ driverId: config.driverId }),
      });
      const issuedCode = assertOpaqueCredential(
        invite.data?.registrationCode,
        "driver registrationCode",
      );
      deps.mask(issuedCode);
      registrationCode = issuedCode;
      deps.exportSession("DRTS_LIVE_MAP_INVITE_CODE", registrationCode);
      evidence.cleanup = "required";

      evidence.stage = "driver:register-device";
      const deviceId = `operational-c125-run-${Date.now()}`;
      const registered = await apiRequest<{
        data: {
          accessToken: string;
          refreshToken?: string;
          expiresIn: string;
          driverId?: string;
          deviceId?: string;
        };
      }>("auth/driver/device/register", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ registrationCode, deviceId }),
      });
      const issuedDriverToken = assertOpaqueCredential(
        registered.data?.accessToken,
        "driver accessToken",
      );
      deps.mask(issuedDriverToken);
      if (typeof registered.data?.refreshToken === "string") {
        deps.mask(registered.data.refreshToken);
      }
      assertDistinctFromInvocationTokens(
        issuedDriverToken,
        invocationTokens,
        "driver",
      );
      assert.equal(registered.data?.expiresIn, "15m");
      if (registered.data?.driverId !== undefined) {
        assert.equal(registered.data.driverId, config.driverId);
      }
      if (registered.data?.deviceId !== undefined) {
        assert.equal(registered.data.deviceId, deviceId);
      }

      evidence.stage = "driver:verify-session";
      const verifiedDriver = await verifyDriverRoleSession(
        apiRequest,
        config.driverId,
        issuedDriverToken,
      );
      driverToken = issuedDriverToken;
      deps.exportSession("DRTS_LIVE_MAP_DRIVER_SESSION_TOKEN", driverToken);
      deps.exportSession("DRTS_LIVE_MAP_DRIVER_DEVICE_ID", deviceId);
      evidence.sessions.push({
        role: "driver",
        source: "driver-device-invite-register",
        realm: verifiedDriver.realm,
        actor_type: verifiedDriver.actorType,
        actor_id: verifiedDriver.actorId,
        scopes: verifiedDriver.scopes,
        expires_in: registered.data.expiresIn,
      });
    }

    // 4. foreign_fleet application session (DRTS_OPERATIONAL_FOREIGN_FLEET_SESSION_TOKEN)
    evidence.stage = "foreign_fleet:resolve";
    const suppliedForeignFleetToken =
      nonEmptyTrimmed(env.DRTS_OPERATIONAL_FOREIGN_FLEET_SESSION_TOKEN) ??
      nonEmptyTrimmed(env.DRTS_OPERATIONAL_OTHER_FLEET_SESSION_TOKEN);
    const foreignEntrySlug =
      nonEmptyTrimmed(env.DRTS_OPERATIONAL_FOREIGN_FLEET_ENTRY_SLUG) ??
      nonEmptyTrimmed(env.DRTS_OPERATIONAL_OTHER_FLEET_ENTRY_SLUG);
    const foreignApiKey =
      nonEmptyTrimmed(env.DRTS_OPERATIONAL_FOREIGN_FLEET_API_KEY) ??
      nonEmptyTrimmed(env.DRTS_OPERATIONAL_OTHER_FLEET_API_KEY);
    const expectedForeignPartnerId =
      nonEmptyTrimmed(env.DRTS_OPERATIONAL_FOREIGN_FLEET_PARTNER_ID) ??
      nonEmptyTrimmed(env.DRTS_OPERATIONAL_OTHER_FLEET_PARTNER_ID);

    if (foreignApiKey) {
      deps.mask(foreignApiKey);
    }
    const ownFleetSessionToken = nonEmptyTrimmed(
      env.DRTS_OPERATIONAL_FLEET_SESSION_TOKEN,
    );
    if (ownFleetSessionToken) {
      deps.mask(ownFleetSessionToken);
    }

    if (
      expectedForeignPartnerId &&
      expectedForeignPartnerId === config.expectedOwnFleetId
    ) {
      evidence.foreign_fleet_precondition = "invalid-external-fixture";
      throw new OperationalForeignFleetFixturePreconditionError(
        `Foreign Fleet fixture precondition invalid: expected foreign partnerId (${expectedForeignPartnerId}) must differ from own Fleet (${config.expectedOwnFleetId})`,
      );
    }

    if (suppliedForeignFleetToken) {
      assertOpaqueCredential(
        suppliedForeignFleetToken,
        "DRTS_OPERATIONAL_FOREIGN_FLEET_SESSION_TOKEN",
      );
      deps.mask(suppliedForeignFleetToken);
      assertDistinctFromInvocationTokens(
        suppliedForeignFleetToken,
        invocationTokens,
        "foreign_fleet",
      );
      const disallowedMatches = new Set(
        [
          ownFleetSessionToken,
          opsToken,
          systemToken,
          driverToken,
          nonEmptyTrimmed(env.DRTS_OPERATIONAL_TENANT_SESSION_TOKEN),
          nonEmptyTrimmed(env.DRTS_OPERATIONAL_TENANT_ADMIN_SESSION_TOKEN),
          nonEmptyTrimmed(env.DRTS_OPERATIONAL_DISPATCH_SESSION_TOKEN),
          nonEmptyTrimmed(env.DRTS_OPERATIONAL_TENANT_OPS_SESSION_TOKEN),
          ...suppliedReviewerTokens,
        ].filter((v): v is string => Boolean(v)),
      );
      if (disallowedMatches.has(suppliedForeignFleetToken)) {
        evidence.foreign_fleet_precondition = "invalid-external-fixture";
        throw new OperationalForeignFleetFixturePreconditionError(
          "Foreign Fleet session token must be a dedicated foreign partner session distinct from own Fleet, Admin, Tenant, Ops, Driver, and System sessions",
        );
      }
      evidence.stage = "foreign_fleet:verify-session";
      let verifiedForeign: Awaited<
        ReturnType<typeof verifyForeignFleetRoleSession>
      >;
      try {
        verifiedForeign = await verifyForeignFleetRoleSession(
          apiRequest,
          suppliedForeignFleetToken,
          config.expectedOwnFleetId,
          expectedForeignPartnerId,
          false,
        );
      } catch (err) {
        evidence.foreign_fleet_precondition = "invalid-external-fixture";
        throw err instanceof OperationalForeignFleetFixturePreconditionError
          ? err
          : new OperationalForeignFleetFixturePreconditionError(
              "Provided foreign Fleet session failed /api/auth/session verification",
            );
      }
      await verifyCanonicalForeignFleetViaAdminBff(verifiedForeign.partnerId);
      foreignFleetToken = suppliedForeignFleetToken;
      evidence.foreign_fleet_precondition = "satisfied-by-provided-session";
      evidence.sessions.push({
        role: "foreign_fleet",
        source: "provided-session",
        realm: verifiedForeign.realm,
        actor_type: verifiedForeign.actorType,
        actor_id: verifiedForeign.actorId,
        partner_id: verifiedForeign.partnerId,
        scopes: verifiedForeign.scopes,
      });
    } else if (foreignEntrySlug && foreignApiKey) {
      if (!/^[a-z0-9][a-z0-9-]*$/.test(foreignEntrySlug)) {
        evidence.foreign_fleet_precondition = "invalid-external-fixture";
        throw new OperationalForeignFleetFixturePreconditionError(
          "Foreign Fleet entrySlug must be a valid canonical lowercase partner entry slug",
        );
      }
      if (/\s/.test(foreignApiKey)) {
        evidence.foreign_fleet_precondition = "invalid-external-fixture";
        throw new OperationalForeignFleetFixturePreconditionError(
          "Foreign Fleet apiKey must not contain whitespace",
        );
      }
      evidence.stage = "foreign_fleet:bootstrap-session";
      let bootstrapResponse: {
        data?: Record<string, unknown>;
      };
      try {
        bootstrapResponse = await apiRequest<{
          data?: Record<string, unknown>;
        }>("auth/partner/bootstrap-session", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            entrySlug: foreignEntrySlug,
            apiKey: foreignApiKey,
          }),
        });
      } catch {
        evidence.foreign_fleet_precondition = "invalid-external-fixture";
        throw new OperationalForeignFleetFixturePreconditionError(
          `Foreign Fleet partner bootstrap failed for entrySlug ${foreignEntrySlug}`,
        );
      }
      const bootstrap = objectRecord(
        bootstrapResponse.data ?? bootstrapResponse,
      );
      const accessToken = nonEmptyTrimmed(bootstrap.accessToken);
      if (!accessToken || /\s/.test(accessToken)) {
        evidence.foreign_fleet_precondition = "invalid-external-fixture";
        throw new OperationalForeignFleetFixturePreconditionError(
          "Foreign Fleet partner bootstrap did not return a valid accessToken",
        );
      }
      deps.mask(accessToken);
      assertDistinctFromInvocationTokens(
        accessToken,
        invocationTokens,
        "foreign_fleet",
      );
      if (ownFleetSessionToken && accessToken === ownFleetSessionToken) {
        evidence.foreign_fleet_precondition = "invalid-external-fixture";
        throw new OperationalForeignFleetFixturePreconditionError(
          "Foreign Fleet partner bootstrap token must differ from own Fleet session token",
        );
      }

      // Record owned session recovery metadata immediately after bootstrap-session
      // issues a token so that any subsequent partnerEntry validation error or
      // transient /api/auth/session failure still revokes the newly issued session.
      foreignFleetToken = accessToken;
      foreignFleetBootstrapIssued = true;
      foreignFleetSessionRevoked = false;
      evidence.cleanup = "unconfirmed";
      deps.exportSession(
        "DRTS_OPERATIONAL_FOREIGN_FLEET_CLEANUP_STATUS",
        "pending",
      );
      deps.exportSession(
        "DRTS_OPERATIONAL_FOREIGN_FLEET_RECOVERY_TOKEN",
        foreignFleetToken,
      );
      deps.exportSession(
        "DRTS_OPERATIONAL_FOREIGN_FLEET_ISSUED_ATTEMPTED",
        "true",
      );

      const partnerEntry = objectRecord(bootstrap.partnerEntry);
      const bootstrapIdentity = objectRecord(bootstrap.identity);
      const bootstrapJwtClaims = decodeJwtPayloadIfStructured(accessToken);
      const issuedForeignSessionId =
        nonEmptyTrimmed(bootstrap.sessionId) ??
        nonEmptyTrimmed(bootstrapIdentity.sessionId) ??
        nonEmptyTrimmed(bootstrapJwtClaims?.sid) ??
        nonEmptyTrimmed(bootstrapJwtClaims?.sessionId);
      if (issuedForeignSessionId && !/\s/.test(issuedForeignSessionId)) {
        deps.mask(issuedForeignSessionId);
        ownForeignFleetSessionId = issuedForeignSessionId;
        evidence.cleanup = "required";
        deps.exportSession(
          "DRTS_OPERATIONAL_FOREIGN_FLEET_OWNED_SESSION_ID",
          ownForeignFleetSessionId,
        );
      }

      const resolvedPartnerId = String(partnerEntry.partnerId ?? "").trim();
      const resolvedPartnerType = nonEmptyTrimmed(partnerEntry.partnerType);
      const expiresIn = nonEmptyTrimmed(bootstrap.expiresIn) ?? "1h";
      if (
        bootstrap.tokenType !== "Bearer" ||
        partnerEntry.entrySlug !== foreignEntrySlug ||
        !resolvedPartnerId ||
        bootstrapIdentity.realm !== "partner" ||
        !["partner_user", "partner_api_key"].includes(
          String(bootstrapIdentity.actorType ?? ""),
        ) ||
        bootstrapIdentity.partnerId !== resolvedPartnerId ||
        (partnerEntry.status !== undefined &&
          partnerEntry.status !== "active") ||
        (partnerEntry.activeFlag !== undefined &&
          partnerEntry.activeFlag !== true)
      ) {
        evidence.foreign_fleet_precondition = "invalid-external-fixture";
        throw new OperationalForeignFleetFixturePreconditionError(
          "Foreign Fleet partner bootstrap receipt did not match canonical partner entry binding",
        );
      }
      if (resolvedPartnerType !== "fleet_partner") {
        evidence.foreign_fleet_precondition = "invalid-external-fixture";
        throw new OperationalForeignFleetFixturePreconditionError(
          `Foreign Fleet partnerEntry.partnerType (${resolvedPartnerType ?? "missing"}) must be fleet_partner`,
        );
      }
      if (resolvedPartnerId === config.expectedOwnFleetId) {
        evidence.foreign_fleet_precondition = "invalid-external-fixture";
        throw new OperationalForeignFleetFixturePreconditionError(
          `Foreign Fleet partnerEntry.partnerId (${resolvedPartnerId}) must differ from own Fleet (${config.expectedOwnFleetId})`,
        );
      }
      if (
        expectedForeignPartnerId &&
        resolvedPartnerId !== expectedForeignPartnerId
      ) {
        evidence.foreign_fleet_precondition = "invalid-external-fixture";
        throw new OperationalForeignFleetFixturePreconditionError(
          `Foreign Fleet partnerEntry.partnerId (${resolvedPartnerId}) does not match expected foreign Fleet (${expectedForeignPartnerId})`,
        );
      }

      evidence.stage = "foreign_fleet:verify-session";
      const verifiedForeign = await verifyForeignFleetRoleSession(
        apiRequest,
        foreignFleetToken,
        config.expectedOwnFleetId,
        resolvedPartnerId,
        true,
      );
      if (verifiedForeign.sessionId) {
        if (
          ownForeignFleetSessionId &&
          verifiedForeign.sessionId !== ownForeignFleetSessionId
        ) {
          throw new Error(
            "Foreign Fleet sessionId mismatch between bootstrap token and /api/auth/session",
          );
        }
        ownForeignFleetSessionId = verifiedForeign.sessionId;
        deps.mask(ownForeignFleetSessionId);
        evidence.cleanup = "required";
        deps.exportSession(
          "DRTS_OPERATIONAL_FOREIGN_FLEET_OWNED_SESSION_ID",
          ownForeignFleetSessionId,
        );
      }
      if (!ownForeignFleetSessionId) {
        throw new Error(
          "Issued foreign Fleet session must expose a revocable sessionId",
        );
      }
      await verifyCanonicalForeignFleetViaAdminBff(verifiedForeign.partnerId);
      evidence.foreign_fleet_precondition = "satisfied-by-partner-bootstrap";
      evidence.sessions.push({
        role: "foreign_fleet",
        source: "partner-bootstrap-exchange",
        realm: verifiedForeign.realm,
        actor_type: verifiedForeign.actorType,
        actor_id: verifiedForeign.actorId,
        partner_id: verifiedForeign.partnerId,
        scopes: verifiedForeign.scopes,
        expires_in: expiresIn,
      });
    } else if (foreignEntrySlug || foreignApiKey || expectedForeignPartnerId) {
      evidence.foreign_fleet_precondition = "missing-external-fixture";
      throw new OperationalForeignFleetFixturePreconditionError(
        `External foreign_fleet fixture precondition unmet: provide DRTS_OPERATIONAL_FOREIGN_FLEET_SESSION_TOKEN (or DRTS_OPERATIONAL_OTHER_FLEET_SESSION_TOKEN) or canonical foreign Fleet partner bootstrap credentials DRTS_OPERATIONAL_FOREIGN_FLEET_ENTRY_SLUG + DRTS_OPERATIONAL_FOREIGN_FLEET_API_KEY bound to an active Fleet partner distinct from ${config.expectedOwnFleetId}`,
      );
    } else {
      evidence.stage = "foreign_fleet:admin-session";
      const adminCtx = await ensurePlatformAdminSession();
      deps.exportSession(
        "DRTS_OPERATIONAL_PLATFORM_ADMIN_URL",
        adminCtx.adminOrigin,
      );

      evidence.stage = "foreign_fleet:resolve-tenant-program";
      const runNonce = `${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      const runTag = `${config.candidateSha.slice(0, 8)}-${runNonce}`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "");
      const ownedRegistrationMarker = `C125-OWNED-FLEET-${runTag.toUpperCase()}`;
      const ownedLegalName = `C125 Operational Owned Foreign Fleet ${runTag}`;
      const ownedDisplayName = `C125 Owned Foreign Fleet ${runTag}`;
      const ownedEntrySlug = `c125-owned-foreign-fleet-${runTag}`;
      const ownedPartnerCode =
        `C125_OWNED_FF_${runTag.toUpperCase().replace(/-/g, "_")}`.slice(0, 48);
      const ownedKeyOwnerRef = `c125-owned-key-${runTag}`;

      const rawExistingEntries = await requestControlPlaneProxy<
        Record<string, unknown>
      >(
        adminCtx.adminOrigin,
        config,
        deps.fetch,
        "platform-admin/partner-entries",
        {
          method: "GET",
          headers: {
            authorization: `Bearer ${adminCtx.adminInvocation}`,
            "x-drts-authorization": `Bearer ${adminCtx.adminToken}`,
          },
        },
        "Platform Admin BFF proxy",
      );
      const existingEntriesPayload = objectRecord(
        rawExistingEntries.data ?? rawExistingEntries,
      );
      const existingEntries = Array.isArray(existingEntriesPayload.items)
        ? existingEntriesPayload.items.map((item) => objectRecord(item))
        : [];

      for (const item of existingEntries) {
        const itemSlug = nonEmptyTrimmed(item.entrySlug)?.toLowerCase();
        const itemCode = nonEmptyTrimmed(item.partnerCode)?.toUpperCase();
        if (itemSlug === ownedEntrySlug || itemCode === ownedPartnerCode) {
          throw new Error(
            "Generated run-owned partner entry identifiers collided with an existing partner entry",
          );
        }
      }

      const activeEntries = existingEntries.filter(
        (item) =>
          item.status === "active" &&
          item.activeFlag !== false &&
          !nonEmptyTrimmed(item.revokedAt),
      );
      if (activeEntries.length === 0) {
        evidence.foreign_fleet_precondition = "missing-external-fixture";
        throw new OperationalForeignFleetFixturePreconditionError(
          "Cannot resolve canonical (tenantId, programId) pair: no active partner entries found in Platform Admin readback",
        );
      }

      const programToTenant = new Map<string, string>();
      for (const item of activeEntries) {
        const itemTenantId = nonEmptyTrimmed(item.tenantId);
        const itemProgramId = nonEmptyTrimmed(item.programId);
        if (!itemTenantId || !itemProgramId) {
          evidence.foreign_fleet_precondition = "invalid-external-fixture";
          throw new OperationalForeignFleetFixturePreconditionError(
            "Active partner entry in Platform Admin readback is missing canonical tenantId or programId",
          );
        }
        const mixesManifestAndSeed =
          (itemTenantId === MANIFEST_DISALLOWED_TENANT_UUID &&
            itemProgramId === DEMO_SEED_PROGRAM_ID) ||
          (itemTenantId === DEMO_SEED_TENANT_ID &&
            /^10000000-0000-0000-0000-/i.test(itemProgramId)) ||
          itemTenantId === MANIFEST_DISALLOWED_TENANT_UUID;
        if (mixesManifestAndSeed) {
          evidence.foreign_fleet_precondition = "invalid-external-fixture";
          throw new OperationalForeignFleetFixturePreconditionError(
            `Active partner entry mixes disallowed manifest tenant (${itemTenantId}) with program (${itemProgramId})`,
          );
        }
        const priorTenant = programToTenant.get(itemProgramId);
        if (priorTenant && priorTenant !== itemTenantId) {
          evidence.foreign_fleet_precondition = "invalid-external-fixture";
          throw new OperationalForeignFleetFixturePreconditionError(
            `Conflicting tenantId bindings (${priorTenant} vs ${itemTenantId}) found for programId (${itemProgramId})`,
          );
        }
        programToTenant.set(itemProgramId, itemTenantId);
      }

      const preferredSourceEntry =
        activeEntries.find(
          (item) =>
            (nonEmptyTrimmed(item.partnerId) ??
              nonEmptyTrimmed(item.fleetPartnerId)) ===
            config.expectedOwnFleetId,
        ) ?? activeEntries[0]!;
      const sourceTenantId = nonEmptyTrimmed(preferredSourceEntry.tenantId)!;
      const sourceProgramId = nonEmptyTrimmed(preferredSourceEntry.programId)!;

      // Stage 3C: Create run-owned canonical foreign Fleet
      evidence.stage = "foreign_fleet:create-canonical-fleet";
      ownForeignFleetRegistrationMarker = ownedRegistrationMarker;
      ownForeignFleetExpectedLegalName = ownedLegalName;
      foreignFleetCreateAttempted = true;
      foreignFleetMasterDeactivated = false;
      evidence.cleanup = "unconfirmed";
      deps.exportSession("DRTS_OPERATIONAL_FOREIGN_FLEET_RUN_TAG", runTag);
      deps.exportSession(
        "DRTS_OPERATIONAL_FOREIGN_FLEET_REGISTRATION_MARKER",
        ownedRegistrationMarker,
      );
      deps.exportSession(
        "DRTS_OPERATIONAL_FOREIGN_FLEET_EXPECTED_LEGAL_NAME",
        ownedLegalName,
      );
      deps.exportSession(
        "DRTS_OPERATIONAL_FOREIGN_FLEET_CREATE_ATTEMPTED",
        "true",
      );
      deps.exportSession(
        "DRTS_OPERATIONAL_FOREIGN_FLEET_MASTER_CLEANUP_STATUS",
        "pending",
      );

      let createdFleetId: string | undefined;
      try {
        const rawCreatedFleet = await requestControlPlaneProxy<
          Record<string, unknown>
        >(
          adminCtx.adminOrigin,
          config,
          deps.fetch,
          "admin/fleet-partners",
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${adminCtx.adminInvocation}`,
              "x-drts-authorization": `Bearer ${adminCtx.adminToken}`,
            },
            body: JSON.stringify({
              legalName: ownedLegalName,
              displayName: ownedDisplayName,
              businessRegistrationNo: ownedRegistrationMarker,
              contactName: "C125 Operational Verification",
              contactPhone: "+886-2-5550-0125",
              partnershipType: "fleet_management",
              active: true,
            }),
          },
          "Platform Admin BFF proxy",
        );
        const createdFleetRecord = objectRecord(
          rawCreatedFleet.data ?? rawCreatedFleet,
        );
        const returnedFleetId = nonEmptyTrimmed(
          createdFleetRecord.fleetPartnerId,
        );
        if (!returnedFleetId) {
          throw new Error(
            "Canonical Fleet creation response did not include fleetPartnerId",
          );
        }
        if (returnedFleetId === config.expectedOwnFleetId) {
          // Never adopt or deactivate own Fleet (fleet-demo-001)
          foreignFleetCreateAttempted = false;
          deps.exportSession(
            "DRTS_OPERATIONAL_FOREIGN_FLEET_CREATE_ATTEMPTED",
            "false",
          );
          deps.exportSession(
            "DRTS_OPERATIONAL_FOREIGN_FLEET_MASTER_CLEANUP_STATUS",
            "not-required",
          );
          evidence.foreign_fleet_precondition = "invalid-external-fixture";
          throw new OperationalForeignFleetFixturePreconditionError(
            `Created foreign Fleet partnerId (${returnedFleetId}) must differ from own Fleet (${config.expectedOwnFleetId})`,
          );
        }
        ownForeignFleetPartnerIds = [returnedFleetId];
        deps.exportSession(
          "DRTS_OPERATIONAL_FOREIGN_FLEET_OWNED_PARTNER_ID",
          returnedFleetId,
        );
        evidence.cleanup = "required";
        if (createdFleetRecord.active !== true) {
          evidence.foreign_fleet_precondition = "invalid-external-fixture";
          throw new OperationalForeignFleetFixturePreconditionError(
            `Created foreign Fleet partner (${returnedFleetId}) is not active`,
          );
        }
        createdFleetId = returnedFleetId;
      } catch (err) {
        if (err instanceof OperationalForeignFleetFixturePreconditionError) {
          throw err;
        }
        // Lost-response recovery without blind retry
        let recoveredIds: string[] = [];
        try {
          recoveredIds = await recoverOwnedCanonicalFleetIds(
            adminCtx.adminOrigin,
            config,
            deps.fetch,
            adminCtx.adminInvocation,
            adminCtx.adminToken,
            ownedRegistrationMarker,
            ownedLegalName,
          );
        } catch {
          throw err;
        }
        if (recoveredIds.length === 1) {
          createdFleetId = recoveredIds[0]!;
          ownForeignFleetPartnerIds = [createdFleetId];
          deps.exportSession(
            "DRTS_OPERATIONAL_FOREIGN_FLEET_OWNED_PARTNER_ID",
            createdFleetId,
          );
          evidence.cleanup = "required";
        } else if (recoveredIds.length > 1) {
          ownForeignFleetPartnerIds = recoveredIds;
          deps.exportSession(
            "DRTS_OPERATIONAL_FOREIGN_FLEET_OWNED_PARTNER_ID",
            recoveredIds.join(","),
          );
          evidence.cleanup = "required";
          throw new Error(
            "Ambiguous duplicate canonical Fleet records found during lost-response recovery",
          );
        } else {
          throw err;
        }
      }

      // Stage 3D: Create run-owned partner entry bound to createdFleetId
      evidence.stage = "foreign_fleet:create-partner-entry";
      ownForeignFleetExpectedEntrySlug = ownedEntrySlug;
      ownForeignFleetExpectedPartnerCode = ownedPartnerCode;
      ownForeignFleetTenantId = sourceTenantId;
      ownForeignFleetProgramId = sourceProgramId;

      let entryCreateStepUpRef: string | undefined;
      try {
        entryCreateStepUpRef = await issuePlatformAdminStepUpProof(
          adminCtx.adminOrigin,
          config,
          deps.fetch,
          adminCtx.adminInvocation,
          adminCtx.adminToken,
          "platform:partner-entries:create",
          "/api/platform-admin/partner-entries",
          deps.mask,
        );
      } catch (err) {
        if (
          err instanceof ControlPlaneProxyHttpError &&
          err.statusCode === 403 &&
          (err.errorCode === "MFA_REQUIRED" ||
            err.errorCode === "STEP_UP_REQUIRED")
        ) {
          evidence.foreign_fleet_precondition = "missing-external-fixture";
          throw new OperationalForeignFleetFixturePreconditionError(
            `Platform Admin step-up proof precondition unmet (${err.errorCode}): caller session requires recent MFA or dev step-up waiver for platform:partner-entries:create`,
          );
        }
        throw err;
      }

      foreignFleetEntryCreateAttempted = true;
      foreignFleetEntryRevoked = false;
      evidence.cleanup = "unconfirmed";
      deps.exportSession(
        "DRTS_OPERATIONAL_FOREIGN_FLEET_ENTRY_CREATE_ATTEMPTED",
        "true",
      );
      deps.exportSession(
        "DRTS_OPERATIONAL_FOREIGN_FLEET_OWNED_ENTRY_SLUG",
        ownedEntrySlug,
      );
      deps.exportSession(
        "DRTS_OPERATIONAL_FOREIGN_FLEET_OWNED_PARTNER_CODE",
        ownedPartnerCode,
      );
      deps.exportSession(
        "DRTS_OPERATIONAL_FOREIGN_FLEET_OWNED_TENANT_ID",
        sourceTenantId,
      );
      deps.exportSession(
        "DRTS_OPERATIONAL_FOREIGN_FLEET_OWNED_PROGRAM_ID",
        sourceProgramId,
      );
      deps.exportSession(
        "DRTS_OPERATIONAL_FOREIGN_FLEET_ENTRY_CLEANUP_STATUS",
        "pending",
      );

      try {
        const rawCreatedEntry = await requestControlPlaneProxy<
          Record<string, unknown>
        >(
          adminCtx.adminOrigin,
          config,
          deps.fetch,
          "platform-admin/partner-entries",
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${adminCtx.adminInvocation}`,
              "x-drts-authorization": `Bearer ${adminCtx.adminToken}`,
              ...(entryCreateStepUpRef
                ? { "x-drts-step-up-reference": entryCreateStepUpRef }
                : {}),
            },
            body: JSON.stringify({
              tenantId: sourceTenantId,
              fleetPartnerId: createdFleetId,
              partnerCode: ownedPartnerCode,
              partnerType: "fleet_partner",
              programId: sourceProgramId,
              entrySlug: ownedEntrySlug,
              displayName: ownedDisplayName,
              businessDispatchSubtype: "enterprise_dispatch",
              authMode: "partner_api_key",
              eligibilityMode: "none",
              status: "active",
              activeFlag: true,
            }),
          },
          "Platform Admin BFF proxy",
        );
        const createdEntryRecord = objectRecord(
          rawCreatedEntry.data ?? rawCreatedEntry,
        );
        const returnedEntrySlug = nonEmptyTrimmed(createdEntryRecord.entrySlug);
        const returnedPartnerId =
          nonEmptyTrimmed(createdEntryRecord.partnerId) ??
          nonEmptyTrimmed(createdEntryRecord.fleetPartnerId);
        const returnedPartnerType = nonEmptyTrimmed(
          createdEntryRecord.partnerType,
        );
        const returnedTenantId = nonEmptyTrimmed(createdEntryRecord.tenantId);
        const returnedProgramId = nonEmptyTrimmed(createdEntryRecord.programId);
        if (
          returnedEntrySlug !== ownedEntrySlug ||
          returnedPartnerId !== createdFleetId ||
          returnedPartnerType !== "fleet_partner" ||
          returnedTenantId !== sourceTenantId ||
          returnedProgramId !== sourceProgramId ||
          createdEntryRecord.status !== "active" ||
          createdEntryRecord.activeFlag === false
        ) {
          throw new Error(
            "Created partner entry response did not match canonical foreign Fleet binding",
          );
        }
        ownForeignFleetEntrySlug = ownedEntrySlug;
        deps.exportSession(
          "DRTS_OPERATIONAL_FOREIGN_FLEET_OWNED_ENTRY_CONFIRMED",
          "true",
        );
        evidence.cleanup = "required";
      } catch (err) {
        // Lost-response recovery without blind retry (since POST is UPSERT)
        let recoveredEntry: Awaited<
          ReturnType<typeof recoverOwnedPartnerEntrySlug>
        >;
        try {
          recoveredEntry = await recoverOwnedPartnerEntrySlug(
            adminCtx.adminOrigin,
            config,
            deps.fetch,
            adminCtx.adminInvocation,
            adminCtx.adminToken,
            ownedEntrySlug,
            [createdFleetId],
            sourceTenantId,
            sourceProgramId,
            ownedPartnerCode,
          );
        } catch {
          throw err;
        }
        if (
          recoveredEntry.status === "owned" &&
          recoveredEntry.item.status === "active" &&
          recoveredEntry.item.activeFlag !== false
        ) {
          ownForeignFleetEntrySlug = ownedEntrySlug;
          deps.exportSession(
            "DRTS_OPERATIONAL_FOREIGN_FLEET_OWNED_ENTRY_CONFIRMED",
            "true",
          );
          evidence.cleanup = "required";
        } else if (
          recoveredEntry.status === "collision" ||
          (recoveredEntry.status === "missing" &&
            err instanceof ControlPlaneProxyHttpError &&
            err.statusCode === 403 &&
            (err.errorCode === "STEP_UP_REQUIRED" ||
              err.errorCode === "MFA_REQUIRED"))
        ) {
          foreignFleetEntryCreateAttempted = false;
          deps.exportSession(
            "DRTS_OPERATIONAL_FOREIGN_FLEET_ENTRY_CREATE_ATTEMPTED",
            "false",
          );
          deps.exportSession(
            "DRTS_OPERATIONAL_FOREIGN_FLEET_ENTRY_CLEANUP_STATUS",
            "not-required",
          );
          throw err;
        } else {
          throw err;
        }
      }

      // Stage 3E: Issue run-owned partner API key (never retry since issue rotates)
      evidence.stage = "foreign_fleet:issue-partner-key";
      ownForeignFleetKeyOwnerRef = ownedKeyOwnerRef;
      const issueKeyRelativePath = `platform-admin/partner-entries/${encodeURIComponent(ownedEntrySlug)}/credentials/issue`;
      let keyIssueStepUpRef: string | undefined;
      try {
        keyIssueStepUpRef = await issuePlatformAdminStepUpProof(
          adminCtx.adminOrigin,
          config,
          deps.fetch,
          adminCtx.adminInvocation,
          adminCtx.adminToken,
          "platform:partner-credentials:issue",
          `/api/${issueKeyRelativePath}`,
          deps.mask,
        );
      } catch (err) {
        if (
          err instanceof ControlPlaneProxyHttpError &&
          err.statusCode === 403 &&
          (err.errorCode === "MFA_REQUIRED" ||
            err.errorCode === "STEP_UP_REQUIRED")
        ) {
          evidence.foreign_fleet_precondition = "missing-external-fixture";
          throw new OperationalForeignFleetFixturePreconditionError(
            `Platform Admin step-up proof precondition unmet (${err.errorCode}): caller session requires recent MFA or dev step-up waiver for platform:partner-credentials:issue`,
          );
        }
        throw err;
      }

      foreignFleetKeyIssueAttempted = true;
      foreignFleetKeyRevoked = false;
      evidence.cleanup = "unconfirmed";
      deps.exportSession(
        "DRTS_OPERATIONAL_FOREIGN_FLEET_KEY_ISSUE_ATTEMPTED",
        "true",
      );
      deps.exportSession(
        "DRTS_OPERATIONAL_FOREIGN_FLEET_OWNED_KEY_OWNER_REF",
        ownedKeyOwnerRef,
      );
      deps.exportSession(
        "DRTS_OPERATIONAL_FOREIGN_FLEET_KEY_CLEANUP_STATUS",
        "pending",
      );

      let rawIssuedKey: Record<string, unknown>;
      try {
        rawIssuedKey = await requestControlPlaneProxy<Record<string, unknown>>(
          adminCtx.adminOrigin,
          config,
          deps.fetch,
          issueKeyRelativePath,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${adminCtx.adminInvocation}`,
              "x-drts-authorization": `Bearer ${adminCtx.adminToken}`,
              ...(keyIssueStepUpRef
                ? { "x-drts-step-up-reference": keyIssueStepUpRef }
                : {}),
            },
            body: JSON.stringify({
              ownerRef: ownedKeyOwnerRef,
              ownerName: ownedDisplayName,
              ownerType: "service",
              purpose: "operational_verification_c125_foreign_fleet",
            }),
          },
          "Platform Admin BFF proxy",
        );
      } catch (err) {
        if (
          err instanceof ControlPlaneProxyHttpError &&
          err.statusCode === 403 &&
          (err.errorCode === "STEP_UP_REQUIRED" ||
            err.errorCode === "MFA_REQUIRED")
        ) {
          let recoveredKeyIds: string[] = [];
          try {
            recoveredKeyIds = await recoverOwnedPartnerCredentialIds(
              adminCtx.adminOrigin,
              config,
              deps.fetch,
              adminCtx.adminInvocation,
              adminCtx.adminToken,
              ownedEntrySlug,
              ownedKeyOwnerRef,
              deps.mask,
            );
          } catch {
            throw err;
          }
          if (recoveredKeyIds.length === 0) {
            foreignFleetKeyIssueAttempted = false;
            deps.exportSession(
              "DRTS_OPERATIONAL_FOREIGN_FLEET_KEY_ISSUE_ATTEMPTED",
              "false",
            );
            deps.exportSession(
              "DRTS_OPERATIONAL_FOREIGN_FLEET_KEY_CLEANUP_STATUS",
              "not-required",
            );
          }
        }
        throw err;
      }
      const issuedKeyPayload = objectRecord(rawIssuedKey.data ?? rawIssuedKey);
      const credentialRecord = objectRecord(issuedKeyPayload.credential);
      const issuedKeyId = assertOpaqueCredential(
        credentialRecord.keyId,
        "Foreign Fleet issued keyId",
      );
      const plaintextKey = assertOpaqueCredential(
        issuedKeyPayload.plaintextKey,
        "Foreign Fleet issued plaintextKey",
      );
      deps.mask(plaintextKey);
      deps.mask(issuedKeyId);
      ownForeignFleetKeyIds = [issuedKeyId];
      deps.exportSession(
        "DRTS_OPERATIONAL_FOREIGN_FLEET_OWNED_KEY_ID",
        issuedKeyId,
      );
      evidence.cleanup = "required";

      // Stage 3F: Bootstrap partner session from owned entry + key
      evidence.stage = "foreign_fleet:bootstrap-session";
      foreignFleetBootstrapIssued = true;
      foreignFleetSessionRevoked = false;
      evidence.cleanup = "unconfirmed";
      deps.exportSession(
        "DRTS_OPERATIONAL_FOREIGN_FLEET_CLEANUP_STATUS",
        "pending",
      );
      deps.exportSession(
        "DRTS_OPERATIONAL_FOREIGN_FLEET_ISSUED_ATTEMPTED",
        "true",
      );

      const bootstrapResponse = await apiRequest<{
        data?: Record<string, unknown>;
      }>("auth/partner/bootstrap-session", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          entrySlug: ownedEntrySlug,
          apiKey: plaintextKey,
        }),
      });
      const bootstrap = objectRecord(
        bootstrapResponse.data ?? bootstrapResponse,
      );
      const accessToken = assertOpaqueCredential(
        bootstrap.accessToken,
        "Foreign Fleet partner bootstrap accessToken",
      );
      deps.mask(accessToken);
      assertDistinctFromInvocationTokens(
        accessToken,
        invocationTokens,
        "foreign_fleet",
      );
      if (ownFleetSessionToken && accessToken === ownFleetSessionToken) {
        evidence.foreign_fleet_precondition = "invalid-external-fixture";
        throw new OperationalForeignFleetFixturePreconditionError(
          "Foreign Fleet partner bootstrap token must differ from own Fleet session token",
        );
      }
      foreignFleetToken = accessToken;
      deps.exportSession(
        "DRTS_OPERATIONAL_FOREIGN_FLEET_RECOVERY_TOKEN",
        foreignFleetToken,
      );

      const partnerEntry = objectRecord(bootstrap.partnerEntry);
      const bootstrapIdentity = objectRecord(bootstrap.identity);
      const bootstrapJwtClaims = decodeJwtPayloadIfStructured(accessToken);
      const issuedForeignSessionId =
        nonEmptyTrimmed(bootstrap.sessionId) ??
        nonEmptyTrimmed(bootstrapIdentity.sessionId) ??
        nonEmptyTrimmed(bootstrapJwtClaims?.sid) ??
        nonEmptyTrimmed(bootstrapJwtClaims?.sessionId);
      if (issuedForeignSessionId && !/\s/.test(issuedForeignSessionId)) {
        deps.mask(issuedForeignSessionId);
        ownForeignFleetSessionId = issuedForeignSessionId;
        evidence.cleanup = "required";
        deps.exportSession(
          "DRTS_OPERATIONAL_FOREIGN_FLEET_OWNED_SESSION_ID",
          ownForeignFleetSessionId,
        );
      }

      const resolvedPartnerId = String(partnerEntry.partnerId ?? "").trim();
      const resolvedPartnerType = nonEmptyTrimmed(partnerEntry.partnerType);
      const expiresIn = nonEmptyTrimmed(bootstrap.expiresIn) ?? "1h";
      if (
        bootstrap.tokenType !== "Bearer" ||
        partnerEntry.entrySlug !== ownedEntrySlug ||
        resolvedPartnerId !== createdFleetId ||
        resolvedPartnerType !== "fleet_partner" ||
        nonEmptyTrimmed(partnerEntry.tenantId) !== sourceTenantId ||
        nonEmptyTrimmed(partnerEntry.programId) !== sourceProgramId ||
        bootstrapIdentity.realm !== "partner" ||
        !["partner_user", "partner_api_key"].includes(
          String(bootstrapIdentity.actorType ?? ""),
        ) ||
        nonEmptyTrimmed(bootstrapIdentity.actorId) !== issuedKeyId ||
        bootstrapIdentity.partnerId !== createdFleetId ||
        (partnerEntry.status !== undefined &&
          partnerEntry.status !== "active") ||
        (partnerEntry.activeFlag !== undefined &&
          partnerEntry.activeFlag !== true)
      ) {
        throw new Error(
          "Owned foreign Fleet partner bootstrap receipt did not match canonical owned entry/key binding",
        );
      }

      evidence.stage = "foreign_fleet:verify-session";
      const verifiedForeign = await verifyForeignFleetRoleSession(
        apiRequest,
        foreignFleetToken,
        config.expectedOwnFleetId,
        createdFleetId,
        true,
      );
      assert.equal(
        verifiedForeign.actorId,
        issuedKeyId,
        "Owned foreign Fleet /api/auth/session actorId must match issued keyId",
      );
      if (verifiedForeign.sessionId) {
        if (
          ownForeignFleetSessionId &&
          verifiedForeign.sessionId !== ownForeignFleetSessionId
        ) {
          throw new Error(
            "Foreign Fleet sessionId mismatch between bootstrap token and /api/auth/session",
          );
        }
        ownForeignFleetSessionId = verifiedForeign.sessionId;
        deps.mask(ownForeignFleetSessionId);
        evidence.cleanup = "required";
        deps.exportSession(
          "DRTS_OPERATIONAL_FOREIGN_FLEET_OWNED_SESSION_ID",
          ownForeignFleetSessionId,
        );
      }
      if (!ownForeignFleetSessionId) {
        throw new Error(
          "Issued foreign Fleet session must expose a revocable sessionId",
        );
      }
      await verifyCanonicalForeignFleetViaAdminBff(verifiedForeign.partnerId, {
        retainAdminSession: true,
      });
      evidence.foreign_fleet_precondition =
        "satisfied-by-owned-canonical-fleet";
      evidence.sessions.push({
        role: "foreign_fleet",
        source: "owned-canonical-fleet-bootstrap-exchange",
        realm: verifiedForeign.realm,
        actor_type: verifiedForeign.actorType,
        actor_id: verifiedForeign.actorId,
        partner_id: verifiedForeign.partnerId,
        scopes: verifiedForeign.scopes,
        expires_in: expiresIn,
      });
    }

    const hasUnrevokedDriverMarker =
      (Boolean(nonEmptyTrimmed(env.DRTS_LIVE_MAP_INVITE_CODE)) ||
        nonEmptyTrimmed(env.DRTS_LIVE_MAP_INVITATION_ATTEMPTED) === "true") &&
      nonEmptyTrimmed(env.DRTS_OPERATIONAL_DRIVER_INVITATION_CLEANUP_STATUS) !==
        "passed" &&
      nonEmptyTrimmed(env.DRTS_OPERATIONAL_DRIVER_INVITATION_REVOKED) !==
        "true";
    const hasUnrevokedOpsMarker =
      (Boolean(
        nonEmptyTrimmed(env.DRTS_OPERATIONAL_OPS_NON_REVIEWER_OWNED_SESSION_ID),
      ) ||
        nonEmptyTrimmed(
          env.DRTS_OPERATIONAL_OPS_NON_REVIEWER_ISSUED_ATTEMPTED,
        ) === "true") &&
      nonEmptyTrimmed(env.DRTS_OPERATIONAL_OPS_NON_REVIEWER_CLEANUP_STATUS) !==
        "passed" &&
      nonEmptyTrimmed(env.DRTS_OPERATIONAL_OPS_NON_REVIEWER_SESSION_REVOKED) !==
        "true";
    const hasUnrevokedForeignMarker =
      (Boolean(
        nonEmptyTrimmed(env.DRTS_OPERATIONAL_FOREIGN_FLEET_OWNED_SESSION_ID),
      ) ||
        nonEmptyTrimmed(env.DRTS_OPERATIONAL_FOREIGN_FLEET_ISSUED_ATTEMPTED) ===
          "true") &&
      nonEmptyTrimmed(env.DRTS_OPERATIONAL_FOREIGN_FLEET_CLEANUP_STATUS) !==
        "passed" &&
      nonEmptyTrimmed(env.DRTS_OPERATIONAL_FOREIGN_FLEET_SESSION_REVOKED) !==
        "true";
    const hasUnrevokedForeignKeyMarker =
      (Boolean(
        nonEmptyTrimmed(env.DRTS_OPERATIONAL_FOREIGN_FLEET_OWNED_KEY_ID),
      ) ||
        nonEmptyTrimmed(
          env.DRTS_OPERATIONAL_FOREIGN_FLEET_KEY_ISSUE_ATTEMPTED,
        ) === "true") &&
      nonEmptyTrimmed(env.DRTS_OPERATIONAL_FOREIGN_FLEET_KEY_CLEANUP_STATUS) !==
        "passed" &&
      nonEmptyTrimmed(env.DRTS_OPERATIONAL_FOREIGN_FLEET_KEY_REVOKED) !==
        "true";
    const hasUnrevokedForeignEntryMarker =
      (Boolean(
        nonEmptyTrimmed(env.DRTS_OPERATIONAL_FOREIGN_FLEET_OWNED_ENTRY_SLUG),
      ) ||
        nonEmptyTrimmed(
          env.DRTS_OPERATIONAL_FOREIGN_FLEET_ENTRY_CREATE_ATTEMPTED,
        ) === "true") &&
      !["passed", "not-required"].includes(
        nonEmptyTrimmed(
          env.DRTS_OPERATIONAL_FOREIGN_FLEET_ENTRY_CLEANUP_STATUS,
        ) ?? "",
      ) &&
      nonEmptyTrimmed(env.DRTS_OPERATIONAL_FOREIGN_FLEET_ENTRY_REVOKED) !==
        "true";
    const hasUnrevokedForeignMasterMarker =
      (Boolean(
        nonEmptyTrimmed(env.DRTS_OPERATIONAL_FOREIGN_FLEET_OWNED_PARTNER_ID),
      ) ||
        nonEmptyTrimmed(env.DRTS_OPERATIONAL_FOREIGN_FLEET_CREATE_ATTEMPTED) ===
          "true") &&
      !["passed", "not-required"].includes(
        nonEmptyTrimmed(
          env.DRTS_OPERATIONAL_FOREIGN_FLEET_MASTER_CLEANUP_STATUS,
        ) ?? "",
      ) &&
      nonEmptyTrimmed(env.DRTS_OPERATIONAL_FOREIGN_FLEET_MASTER_DEACTIVATED) !==
        "true";
    const hasUnrevokedAdminMarker =
      (Boolean(
        nonEmptyTrimmed(env.DRTS_OPERATIONAL_PLATFORM_ADMIN_OWNED_SESSION_ID),
      ) ||
        nonEmptyTrimmed(
          env.DRTS_OPERATIONAL_PLATFORM_ADMIN_ISSUED_ATTEMPTED,
        ) === "true") &&
      nonEmptyTrimmed(env.DRTS_OPERATIONAL_PLATFORM_ADMIN_CLEANUP_STATUS) !==
        "passed" &&
      nonEmptyTrimmed(env.DRTS_OPERATIONAL_PLATFORM_ADMIN_SESSION_REVOKED) !==
        "true";
    const hasExternalCleanupMarker =
      hasUnrevokedDriverMarker ||
      hasUnrevokedOpsMarker ||
      hasUnrevokedForeignMarker ||
      hasUnrevokedForeignKeyMarker ||
      hasUnrevokedForeignEntryMarker ||
      hasUnrevokedForeignMasterMarker ||
      hasUnrevokedAdminMarker;
    if (hasExternalCleanupMarker && evidence.cleanup === "not-required") {
      evidence.cleanup = "required";
    }

    // Export all four verified role session tokens only after every check passes.
    deps.exportSession(
      "DRTS_OPERATIONAL_OPS_NON_REVIEWER_SESSION_TOKEN",
      opsToken,
    );
    deps.exportSession("DRTS_OPERATIONAL_SYSTEM_SESSION_TOKEN", systemToken);
    deps.exportSession("DRTS_OPERATIONAL_DRIVER_SESSION_TOKEN", driverToken);
    deps.exportSession(
      "DRTS_OPERATIONAL_FOREIGN_FLEET_SESSION_TOKEN",
      foreignFleetToken,
    );
    deps.exportSession(
      "DRTS_OPERATIONAL_OTHER_FLEET_SESSION_TOKEN",
      foreignFleetToken,
    );
    deps.exportSession(
      "DRTS_OPERATIONAL_ROLE_SESSIONS_CLEANUP_STATUS",
      evidence.cleanup === "required" ? "pending" : "passed",
    );

    evidence.status = "passed";
    evidence.stage = "complete";
    return evidence;
  } catch (error) {
    await cleanupIssuedResources();
    if (
      error instanceof OperationalForeignFleetFixturePreconditionError ||
      error instanceof DriverIsolationError
    ) {
      throw error;
    }
    const safeErrorCode =
      error instanceof ControlPlaneProxyHttpError &&
      error.errorCode &&
      /^[A-Z0-9_]{2,64}$/.test(error.errorCode)
        ? ` (${error.errorCode})`
        : "";
    throw new OperationalRoleSessionBootstrapError(
      evidence.stage,
      `no credential details retained${safeErrorCode}`,
    );
  } finally {
    deps.save("role-sessions", evidence);
  }
}

export async function teardownOperationalRoleSessions(
  env: LiveEnv,
  deps: OperationalRoleSessionTeardownDeps,
): Promise<OperationalRoleSessionsCleanupEvidence> {
  const config = validateOperationalRoleSessionTargets(env);
  const invocationTokens = collectInvocationTokens(env, deps.mask);
  const apiRequest = createOperationalRoleSessionRequest(config, deps.fetch);
  const readGoogleIdToken =
    deps.readGoogleIdToken ??
    ((purpose: "observer" | "provisioning") => {
      if (purpose === "provisioning") {
        return readOperationalGoogleProvisioningIdToken(env, config);
      }
      throw new Error("Unexpected observer token request during teardown");
    });

  let ownForeignPartnerIds = splitNonEmptyCsv(
    env.DRTS_OPERATIONAL_FOREIGN_FLEET_OWNED_PARTNER_ID,
  );
  const foreignCreateAttempted =
    nonEmptyTrimmed(env.DRTS_OPERATIONAL_FOREIGN_FLEET_CREATE_ATTEMPTED) ===
    "true";
  const foreignMasterAlreadyDeactivated =
    nonEmptyTrimmed(
      env.DRTS_OPERATIONAL_FOREIGN_FLEET_MASTER_CLEANUP_STATUS,
    ) === "passed" ||
    nonEmptyTrimmed(env.DRTS_OPERATIONAL_FOREIGN_FLEET_MASTER_DEACTIVATED) ===
      "true";
  const foreignMasterNotRequired =
    nonEmptyTrimmed(
      env.DRTS_OPERATIONAL_FOREIGN_FLEET_MASTER_CLEANUP_STATUS,
    ) === "not-required";

  const expectedForeignEntrySlug = nonEmptyTrimmed(
    env.DRTS_OPERATIONAL_FOREIGN_FLEET_OWNED_ENTRY_SLUG,
  );
  const foreignEntryConfirmed =
    nonEmptyTrimmed(
      env.DRTS_OPERATIONAL_FOREIGN_FLEET_OWNED_ENTRY_CONFIRMED,
    ) === "true";
  let ownForeignEntrySlug = foreignEntryConfirmed
    ? expectedForeignEntrySlug
    : undefined;
  let foreignEntryCreateAttempted =
    nonEmptyTrimmed(
      env.DRTS_OPERATIONAL_FOREIGN_FLEET_ENTRY_CREATE_ATTEMPTED,
    ) === "true";
  const foreignEntryAlreadyRevoked =
    nonEmptyTrimmed(env.DRTS_OPERATIONAL_FOREIGN_FLEET_ENTRY_CLEANUP_STATUS) ===
      "passed" ||
    nonEmptyTrimmed(env.DRTS_OPERATIONAL_FOREIGN_FLEET_ENTRY_REVOKED) ===
      "true";
  const foreignEntryNotRequired =
    nonEmptyTrimmed(env.DRTS_OPERATIONAL_FOREIGN_FLEET_ENTRY_CLEANUP_STATUS) ===
    "not-required";

  let ownForeignKeyIds = splitNonEmptyCsv(
    env.DRTS_OPERATIONAL_FOREIGN_FLEET_OWNED_KEY_ID,
  );
  const foreignKeyIssueAttempted =
    nonEmptyTrimmed(env.DRTS_OPERATIONAL_FOREIGN_FLEET_KEY_ISSUE_ATTEMPTED) ===
    "true";
  const foreignKeyAlreadyRevoked =
    nonEmptyTrimmed(env.DRTS_OPERATIONAL_FOREIGN_FLEET_KEY_CLEANUP_STATUS) ===
      "passed" ||
    nonEmptyTrimmed(env.DRTS_OPERATIONAL_FOREIGN_FLEET_KEY_REVOKED) === "true";

  const hadOwnedForeignFixture =
    ownForeignPartnerIds.length > 0 ||
    foreignCreateAttempted ||
    foreignMasterAlreadyDeactivated ||
    Boolean(expectedForeignEntrySlug) ||
    foreignEntryCreateAttempted ||
    foreignEntryAlreadyRevoked ||
    ownForeignKeyIds.length > 0 ||
    foreignKeyIssueAttempted ||
    foreignKeyAlreadyRevoked;

  const ownAdminSessionIds = splitNonEmptyCsv(
    env.DRTS_OPERATIONAL_PLATFORM_ADMIN_OWNED_SESSION_ID,
  );
  let adminIssuedAttempted =
    nonEmptyTrimmed(env.DRTS_OPERATIONAL_PLATFORM_ADMIN_ISSUED_ATTEMPTED) ===
    "true";
  let adminAlreadyRevoked =
    nonEmptyTrimmed(env.DRTS_OPERATIONAL_PLATFORM_ADMIN_CLEANUP_STATUS) ===
      "passed" ||
    nonEmptyTrimmed(env.DRTS_OPERATIONAL_PLATFORM_ADMIN_SESSION_REVOKED) ===
      "true";
  const hasUnrevokedOwnedAdminMarker =
    (ownAdminSessionIds.length > 0 || adminIssuedAttempted) &&
    !adminAlreadyRevoked;

  const evidence: OperationalRoleSessionsCleanupEvidence = {
    candidate_sha: config.candidateSha,
    status: "failed",
    driver_id: config.driverId,
    driver_recovery: "not-required",
    driver_revoked: false,
    ops_session_revoked: false,
    foreign_fleet_session_revoked: false,
    ...(hadOwnedForeignFixture
      ? {
          foreign_fleet_key_revoked: false,
          foreign_fleet_entry_revoked: false,
          foreign_fleet_master_deactivated: false,
          admin_session_revoked: false,
        }
      : {}),
  };

  try {
    if (
      env.DRTS_OPERATIONAL_ROLE_SESSIONS_CLEANUP_STATUS === "passed" &&
      !hasUnrevokedOwnedAdminMarker
    ) {
      const hadInviteCode = Boolean(
        nonEmptyTrimmed(env.DRTS_LIVE_MAP_INVITE_CODE),
      );
      evidence.driver_recovery = hadInviteCode
        ? "consumed-invitation"
        : "not-required";
      evidence.driver_revoked = hadInviteCode;
      evidence.ops_session_revoked = Boolean(
        nonEmptyTrimmed(env.DRTS_OPERATIONAL_OPS_NON_REVIEWER_OWNED_SESSION_ID),
      );
      evidence.foreign_fleet_session_revoked = Boolean(
        nonEmptyTrimmed(env.DRTS_OPERATIONAL_FOREIGN_FLEET_OWNED_SESSION_ID),
      );
      if (hadOwnedForeignFixture) {
        evidence.foreign_fleet_key_revoked =
          foreignKeyAlreadyRevoked || ownForeignKeyIds.length > 0;
        evidence.foreign_fleet_entry_revoked =
          foreignEntryAlreadyRevoked || Boolean(expectedForeignEntrySlug);
        evidence.foreign_fleet_master_deactivated =
          foreignMasterAlreadyDeactivated || ownForeignPartnerIds.length > 0;
        evidence.admin_session_revoked = Boolean(
          nonEmptyTrimmed(
            env.DRTS_OPERATIONAL_PLATFORM_ADMIN_OWNED_SESSION_ID,
          ) ||
          nonEmptyTrimmed(
            env.DRTS_OPERATIONAL_PLATFORM_ADMIN_SESSION_REVOKED,
          ) === "true",
        );
      }
      evidence.status = "passed";
      return evidence;
    }

    const teardownFailures: string[] = [];

    // 1. Driver invitation teardown
    const inviteCode = nonEmptyTrimmed(env.DRTS_LIVE_MAP_INVITE_CODE);
    const invitationAttempted =
      nonEmptyTrimmed(env.DRTS_LIVE_MAP_INVITATION_ATTEMPTED) === "true";
    const driverAlreadyRevoked =
      nonEmptyTrimmed(env.DRTS_OPERATIONAL_DRIVER_INVITATION_CLEANUP_STATUS) ===
        "passed" ||
      nonEmptyTrimmed(env.DRTS_OPERATIONAL_DRIVER_INVITATION_REVOKED) ===
        "true";

    if (driverAlreadyRevoked) {
      if (inviteCode) {
        deps.mask(inviteCode);
      }
      evidence.driver_recovery = "consumed-invitation";
      evidence.driver_revoked = true;
    } else if (!inviteCode) {
      // An attempted invitation mutation with lost recovery data must fail closed.
      if (invitationAttempted) {
        teardownFailures.push("driver_invitation_unconfirmed");
      } else {
        evidence.driver_recovery = "not-required";
      }
    } else {
      deps.mask(inviteCode);
      evidence.driver_recovery = "consumed-invitation";
      try {
        let provisionerToken =
          nonEmptyTrimmed(env.DRTS_LIVE_MAP_PROVISIONER_SESSION_TOKEN) ??
          nonEmptyTrimmed(env.DRTS_OPERATIONAL_SYSTEM_SESSION_TOKEN);
        if (provisionerToken) {
          deps.mask(provisionerToken);
          try {
            await verifyMapProvisioningSession(
              config.driverId,
              apiRequest,
              provisionerToken,
            );
          } catch {
            provisionerToken = undefined;
          }
        }
        if (!provisionerToken) {
          const issued = await issueMapProvisioningSession(
            config.driverId,
            apiRequest,
            {
              readGoogleIdToken,
              mask: deps.mask,
            },
          );
          provisionerToken = issued.token;
        }
        await revokeOperationalDriverInvitation(
          apiRequest,
          provisionerToken,
          inviteCode,
        );
        deps.exportSession?.(
          "DRTS_OPERATIONAL_DRIVER_INVITATION_CLEANUP_STATUS",
          "passed",
        );
        deps.exportSession?.(
          "DRTS_OPERATIONAL_DRIVER_INVITATION_REVOKED",
          "true",
        );
        evidence.driver_revoked = true;
      } catch {
        teardownFailures.push("driver_invitation");
      }
    }

    // Determine whether Admin BFF authority is required for owned foreign Fleet teardown/recovery
    let ownForeignSessionId = nonEmptyTrimmed(
      env.DRTS_OPERATIONAL_FOREIGN_FLEET_OWNED_SESSION_ID,
    );
    const foreignIssuedAttempted =
      nonEmptyTrimmed(env.DRTS_OPERATIONAL_FOREIGN_FLEET_ISSUED_ATTEMPTED) ===
      "true";
    const foreignAlreadyRevoked =
      nonEmptyTrimmed(env.DRTS_OPERATIONAL_FOREIGN_FLEET_CLEANUP_STATUS) ===
        "passed" ||
      nonEmptyTrimmed(env.DRTS_OPERATIONAL_FOREIGN_FLEET_SESSION_REVOKED) ===
        "true";

    const needsAdminForForeignSessionRecovery =
      !foreignAlreadyRevoked &&
      !ownForeignSessionId &&
      foreignIssuedAttempted &&
      (ownForeignKeyIds.length > 0 || foreignKeyIssueAttempted);
    const needsAdminForForeignKey =
      !foreignKeyAlreadyRevoked &&
      (ownForeignKeyIds.length > 0 || foreignKeyIssueAttempted);
    const needsAdminForForeignEntry =
      !foreignEntryAlreadyRevoked &&
      !foreignEntryNotRequired &&
      (Boolean(ownForeignEntrySlug) ||
        Boolean(expectedForeignEntrySlug) ||
        foreignEntryCreateAttempted);
    const needsAdminForForeignMaster =
      !foreignMasterAlreadyDeactivated &&
      !foreignMasterNotRequired &&
      (ownForeignPartnerIds.length > 0 || foreignCreateAttempted);
    const needsAdminAuthority =
      needsAdminForForeignSessionRecovery ||
      needsAdminForForeignKey ||
      needsAdminForForeignEntry ||
      needsAdminForForeignMaster;

    const adminInvocation =
      nonEmptyTrimmed(env.DRTS_OPERATIONAL_PLATFORM_ADMIN_ID_TOKEN) ??
      nonEmptyTrimmed(env.DRTS_DEV_PLATFORM_ADMIN_ID_TOKEN);
    if (adminInvocation) {
      deps.mask(adminInvocation);
    }

    const initialRecoveryAdminToken = !adminAlreadyRevoked
      ? nonEmptyTrimmed(env.DRTS_OPERATIONAL_PLATFORM_ADMIN_RECOVERY_TOKEN)
      : undefined;
    if (initialRecoveryAdminToken) {
      deps.mask(initialRecoveryAdminToken);
    }
    const suppliedAdminToken =
      nonEmptyTrimmed(env.DRTS_OPERATIONAL_PLATFORM_ADMIN_SESSION_TOKEN) ??
      nonEmptyTrimmed(env.DRTS_OPERATIONAL_PLATFORM_REVIEWER_SESSION_TOKEN);
    if (suppliedAdminToken) {
      deps.mask(suppliedAdminToken);
    }
    let activeAdminToken = initialRecoveryAdminToken ?? suppliedAdminToken;
    const adminTokenBySessionId = new Map<string, string>();
    const authoritativelyInactiveAdminSessionIds = new Set<string>();
    const revokedAdminSessionIds = new Set<string>();
    let currentActiveAdminSessionId: string | undefined;

    if (initialRecoveryAdminToken && ownAdminSessionIds.length > 0) {
      const recoveryClaims = decodeJwtPayloadIfStructured(
        initialRecoveryAdminToken,
      );
      const recoveryClaimSid = nonEmptyTrimmed(
        recoveryClaims?.sid ?? recoveryClaims?.sessionId,
      );
      const mappedRecoverySid =
        recoveryClaimSid && ownAdminSessionIds.includes(recoveryClaimSid)
          ? recoveryClaimSid
          : ownAdminSessionIds[ownAdminSessionIds.length - 1];
      if (mappedRecoverySid) {
        adminTokenBySessionId.set(mappedRecoverySid, initialRecoveryAdminToken);
        if (activeAdminToken === initialRecoveryAdminToken) {
          currentActiveAdminSessionId = mappedRecoverySid;
        }
      }
    }

    if (needsAdminAuthority && config.adminOrigin && adminInvocation) {
      if (activeAdminToken) {
        const checkedToken = activeAdminToken;
        const checkedOwnedSessionId =
          checkedToken === initialRecoveryAdminToken
            ? currentActiveAdminSessionId
            : undefined;
        try {
          const rawAdminSession = await requestControlPlaneProxy<
            Record<string, unknown>
          >(
            config.adminOrigin,
            config,
            deps.fetch,
            "auth/session",
            {
              method: "GET",
              headers: {
                authorization: `Bearer ${adminInvocation}`,
                "x-drts-authorization": `Bearer ${checkedToken}`,
              },
            },
            "Platform Admin BFF proxy",
          );
          const adminSession = objectRecord(
            rawAdminSession.data ?? rawAdminSession,
          );
          const adminIdentity = objectRecord(adminSession.identity);
          const reportedSessionId =
            nonEmptyTrimmed(adminIdentity.sessionId) ??
            nonEmptyTrimmed(adminIdentity.session_id) ??
            nonEmptyTrimmed(adminSession.sessionId) ??
            nonEmptyTrimmed(adminSession.session_id);
          if (adminSession.active === true) {
            if (
              checkedOwnedSessionId &&
              reportedSessionId &&
              reportedSessionId !== checkedOwnedSessionId
            ) {
              activeAdminToken = undefined;
              currentActiveAdminSessionId = undefined;
            } else if (reportedSessionId) {
              currentActiveAdminSessionId = reportedSessionId;
              if (ownAdminSessionIds.includes(reportedSessionId)) {
                adminTokenBySessionId.set(reportedSessionId, checkedToken);
              }
            }
          } else {
            if (
              adminSession.active === false &&
              checkedOwnedSessionId &&
              (!reportedSessionId ||
                reportedSessionId === checkedOwnedSessionId)
            ) {
              authoritativelyInactiveAdminSessionIds.add(checkedOwnedSessionId);
            }
            activeAdminToken = undefined;
            currentActiveAdminSessionId = undefined;
          }
        } catch (err) {
          if (
            checkedOwnedSessionId &&
            isAuthoritativeInactiveControlPlaneSessionError(err)
          ) {
            authoritativelyInactiveAdminSessionIds.add(checkedOwnedSessionId);
          }
          activeAdminToken = undefined;
          currentActiveAdminSessionId = undefined;
        }
      }
      if (!activeAdminToken) {
        try {
          adminIssuedAttempted = true;
          adminAlreadyRevoked = false;
          deps.exportSession?.(
            "DRTS_OPERATIONAL_PLATFORM_ADMIN_CLEANUP_STATUS",
            "pending",
          );
          if (
            nonEmptyTrimmed(
              env.DRTS_OPERATIONAL_PLATFORM_ADMIN_SESSION_REVOKED,
            ) === "true"
          ) {
            deps.exportSession?.(
              "DRTS_OPERATIONAL_PLATFORM_ADMIN_SESSION_REVOKED",
              "false",
            );
          }
          deps.exportSession?.(
            "DRTS_OPERATIONAL_PLATFORM_ADMIN_ISSUED_ATTEMPTED",
            "true",
          );
          const rawAdminIssued = await requestControlPlaneProxy<
            Record<string, unknown>
          >(
            config.adminOrigin,
            config,
            deps.fetch,
            "auth/token",
            {
              method: "POST",
              headers: {
                "content-type": "application/json",
                authorization: `Bearer ${adminInvocation}`,
              },
              body: "{}",
            },
            "Platform Admin BFF proxy",
          );
          const adminIssued = objectRecord(
            rawAdminIssued.data ?? rawAdminIssued,
          );
          const issuedToken = assertOpaqueCredential(
            adminIssued.token,
            "Platform Admin BFF issued token",
          );
          deps.mask(issuedToken);
          assertDistinctFromInvocationTokens(
            issuedToken,
            invocationTokens,
            "platform_admin",
          );
          const adminJwtClaims = decodeJwtPayloadIfStructured(issuedToken);
          const issuedSessionId = assertOpaqueCredential(
            adminIssued.sessionId ??
              adminJwtClaims?.sid ??
              adminJwtClaims?.sessionId,
            "Platform Admin BFF issued sessionId",
          );
          deps.mask(issuedSessionId);
          activeAdminToken = issuedToken;
          currentActiveAdminSessionId = issuedSessionId;
          adminTokenBySessionId.set(issuedSessionId, issuedToken);
          authoritativelyInactiveAdminSessionIds.delete(issuedSessionId);
          revokedAdminSessionIds.delete(issuedSessionId);
          if (!ownAdminSessionIds.includes(issuedSessionId)) {
            ownAdminSessionIds.push(issuedSessionId);
          }
          deps.exportSession?.(
            "DRTS_OPERATIONAL_PLATFORM_ADMIN_RECOVERY_TOKEN",
            activeAdminToken,
          );
          deps.exportSession?.(
            "DRTS_OPERATIONAL_PLATFORM_ADMIN_OWNED_SESSION_ID",
            ownAdminSessionIds.join(","),
          );
        } catch {
          activeAdminToken = undefined;
          currentActiveAdminSessionId = undefined;
        }
      }
    }

    const registrationMarker = nonEmptyTrimmed(
      env.DRTS_OPERATIONAL_FOREIGN_FLEET_REGISTRATION_MARKER,
    );
    const expectedLegalName = nonEmptyTrimmed(
      env.DRTS_OPERATIONAL_FOREIGN_FLEET_EXPECTED_LEGAL_NAME,
    );
    const expectedPartnerCode = nonEmptyTrimmed(
      env.DRTS_OPERATIONAL_FOREIGN_FLEET_OWNED_PARTNER_CODE,
    );
    const ownedTenantId = nonEmptyTrimmed(
      env.DRTS_OPERATIONAL_FOREIGN_FLEET_OWNED_TENANT_ID,
    );
    const ownedProgramId = nonEmptyTrimmed(
      env.DRTS_OPERATIONAL_FOREIGN_FLEET_OWNED_PROGRAM_ID,
    );
    const ownedKeyOwnerRef = nonEmptyTrimmed(
      env.DRTS_OPERATIONAL_FOREIGN_FLEET_OWNED_KEY_OWNER_REF,
    );

    // Pre-recover missing owned Fleet IDs, entrySlug, and key IDs before reverse-order teardown
    if (
      ownForeignPartnerIds.length === 0 &&
      foreignCreateAttempted &&
      !foreignMasterAlreadyDeactivated &&
      !foreignMasterNotRequired &&
      registrationMarker &&
      config.adminOrigin &&
      adminInvocation &&
      activeAdminToken
    ) {
      try {
        const recoveredIds = await recoverOwnedCanonicalFleetIds(
          config.adminOrigin,
          config,
          deps.fetch,
          adminInvocation,
          activeAdminToken,
          registrationMarker,
          expectedLegalName,
        );
        if (recoveredIds.length > 0) {
          ownForeignPartnerIds = recoveredIds;
          deps.exportSession?.(
            "DRTS_OPERATIONAL_FOREIGN_FLEET_OWNED_PARTNER_ID",
            ownForeignPartnerIds.join(","),
          );
        }
      } catch {
        // Handled in master deactivation block below.
      }
    }

    if (
      !ownForeignEntrySlug &&
      (foreignEntryCreateAttempted || Boolean(expectedForeignEntrySlug)) &&
      !foreignEntryAlreadyRevoked &&
      !foreignEntryNotRequired &&
      expectedForeignEntrySlug &&
      config.adminOrigin &&
      adminInvocation &&
      activeAdminToken
    ) {
      try {
        const recoveredEntry = await recoverOwnedPartnerEntrySlug(
          config.adminOrigin,
          config,
          deps.fetch,
          adminInvocation,
          activeAdminToken,
          expectedForeignEntrySlug,
          ownForeignPartnerIds,
          ownedTenantId,
          ownedProgramId,
          expectedPartnerCode,
        );
        if (recoveredEntry.status === "owned") {
          ownForeignEntrySlug = recoveredEntry.entrySlug;
          deps.exportSession?.(
            "DRTS_OPERATIONAL_FOREIGN_FLEET_OWNED_ENTRY_CONFIRMED",
            "true",
          );
        } else if (recoveredEntry.status === "collision") {
          foreignEntryCreateAttempted = false;
          deps.exportSession?.(
            "DRTS_OPERATIONAL_FOREIGN_FLEET_ENTRY_CREATE_ATTEMPTED",
            "false",
          );
          deps.exportSession?.(
            "DRTS_OPERATIONAL_FOREIGN_FLEET_ENTRY_CLEANUP_STATUS",
            "not-required",
          );
        }
      } catch {
        // Handled in entry revoke block below.
      }
    }

    if (
      ownForeignKeyIds.length === 0 &&
      foreignKeyIssueAttempted &&
      !foreignKeyAlreadyRevoked &&
      ownForeignEntrySlug &&
      config.adminOrigin &&
      adminInvocation &&
      activeAdminToken
    ) {
      try {
        const recoveredKeyIds = await recoverOwnedPartnerCredentialIds(
          config.adminOrigin,
          config,
          deps.fetch,
          adminInvocation,
          activeAdminToken,
          ownForeignEntrySlug,
          ownedKeyOwnerRef,
          deps.mask,
        );
        if (recoveredKeyIds.length > 0) {
          ownForeignKeyIds = recoveredKeyIds;
          deps.exportSession?.(
            "DRTS_OPERATIONAL_FOREIGN_FLEET_OWNED_KEY_ID",
            ownForeignKeyIds.join(","),
          );
        }
      } catch {
        // Handled in key revoke block below.
      }
    }

    // 2. Owned foreign Fleet session teardown (or Admin session inventory recovery)
    if (foreignAlreadyRevoked) {
      if (ownForeignSessionId) {
        deps.mask(ownForeignSessionId);
      }
      evidence.foreign_fleet_session_revoked = true;
    } else if (!ownForeignSessionId) {
      if (foreignIssuedAttempted) {
        if (ownForeignKeyIds.length > 0 && activeAdminToken) {
          try {
            const recoveredSessions =
              await recoverAndRevokeOwnedPartnerSessionsByPrincipals(
                apiRequest,
                activeAdminToken,
                ownForeignKeyIds,
                ownedTenantId,
                ownForeignPartnerIds,
                deps.mask,
              );
            if (recoveredSessions.recoveredCount > 0) {
              ownForeignSessionId = recoveredSessions.revokedIds[0];
              if (ownForeignSessionId) {
                deps.exportSession?.(
                  "DRTS_OPERATIONAL_FOREIGN_FLEET_OWNED_SESSION_ID",
                  ownForeignSessionId,
                );
              }
              deps.exportSession?.(
                "DRTS_OPERATIONAL_FOREIGN_FLEET_CLEANUP_STATUS",
                "passed",
              );
              deps.exportSession?.(
                "DRTS_OPERATIONAL_FOREIGN_FLEET_SESSION_REVOKED",
                "true",
              );
              evidence.foreign_fleet_session_revoked = true;
            } else {
              teardownFailures.push("foreign_fleet_session_unconfirmed");
            }
          } catch {
            teardownFailures.push("foreign_fleet_session");
          }
        } else {
          teardownFailures.push("foreign_fleet_session_unconfirmed");
        }
      }
    } else {
      deps.mask(ownForeignSessionId);
      const foreignToken =
        nonEmptyTrimmed(env.DRTS_OPERATIONAL_FOREIGN_FLEET_RECOVERY_TOKEN) ??
        nonEmptyTrimmed(env.DRTS_OPERATIONAL_FOREIGN_FLEET_SESSION_TOKEN) ??
        nonEmptyTrimmed(env.DRTS_OPERATIONAL_OTHER_FLEET_SESSION_TOKEN);
      if (!foreignToken) {
        teardownFailures.push("foreign_fleet_session_missing_token");
      } else {
        deps.mask(foreignToken);
        try {
          await revokeOperationalApplicationSession(
            apiRequest,
            foreignToken,
            ownForeignSessionId,
          );
          deps.exportSession?.(
            "DRTS_OPERATIONAL_FOREIGN_FLEET_CLEANUP_STATUS",
            "passed",
          );
          deps.exportSession?.(
            "DRTS_OPERATIONAL_FOREIGN_FLEET_SESSION_REVOKED",
            "true",
          );
          evidence.foreign_fleet_session_revoked = true;
        } catch {
          teardownFailures.push("foreign_fleet_session");
        }
      }
    }

    // 3. Owned foreign Fleet API key(s) teardown
    if (foreignKeyAlreadyRevoked) {
      for (const keyId of ownForeignKeyIds) {
        deps.mask(keyId);
      }
      if (hadOwnedForeignFixture) {
        evidence.foreign_fleet_key_revoked = true;
      }
    } else if (ownForeignKeyIds.length > 0 || foreignKeyIssueAttempted) {
      for (const keyId of ownForeignKeyIds) {
        deps.mask(keyId);
      }
      if (ownForeignKeyIds.length === 0) {
        teardownFailures.push("foreign_fleet_key_unconfirmed");
      } else if (
        !ownForeignEntrySlug ||
        !config.adminOrigin ||
        !adminInvocation ||
        !activeAdminToken
      ) {
        teardownFailures.push("foreign_fleet_key");
      } else {
        try {
          for (const keyId of ownForeignKeyIds) {
            await revokeOperationalPartnerCredential(
              config.adminOrigin,
              config,
              deps.fetch,
              adminInvocation,
              activeAdminToken,
              ownForeignEntrySlug,
              keyId,
              deps.mask,
            );
          }
          deps.exportSession?.(
            "DRTS_OPERATIONAL_FOREIGN_FLEET_KEY_CLEANUP_STATUS",
            "passed",
          );
          deps.exportSession?.(
            "DRTS_OPERATIONAL_FOREIGN_FLEET_KEY_REVOKED",
            "true",
          );
          if (hadOwnedForeignFixture) {
            evidence.foreign_fleet_key_revoked = true;
          }
        } catch {
          teardownFailures.push("foreign_fleet_key");
        }
      }
    }

    // 4. Owned foreign Fleet partner entry teardown
    if (foreignEntryAlreadyRevoked) {
      if (hadOwnedForeignFixture) {
        evidence.foreign_fleet_entry_revoked = true;
      }
    } else if (
      !foreignEntryNotRequired &&
      (Boolean(ownForeignEntrySlug) || foreignEntryCreateAttempted)
    ) {
      if (!ownForeignEntrySlug) {
        teardownFailures.push("foreign_fleet_entry_unconfirmed");
      } else if (!config.adminOrigin || !adminInvocation || !activeAdminToken) {
        teardownFailures.push("foreign_fleet_entry");
      } else {
        try {
          await revokeOperationalPartnerEntry(
            config.adminOrigin,
            config,
            deps.fetch,
            adminInvocation,
            activeAdminToken,
            ownForeignEntrySlug,
            deps.mask,
          );
          deps.exportSession?.(
            "DRTS_OPERATIONAL_FOREIGN_FLEET_ENTRY_CLEANUP_STATUS",
            "passed",
          );
          deps.exportSession?.(
            "DRTS_OPERATIONAL_FOREIGN_FLEET_ENTRY_REVOKED",
            "true",
          );
          if (hadOwnedForeignFixture) {
            evidence.foreign_fleet_entry_revoked = true;
          }
        } catch {
          teardownFailures.push("foreign_fleet_entry");
        }
      }
    }

    // 5. Owned foreign Fleet master record(s) deactivation
    if (foreignMasterAlreadyDeactivated) {
      if (hadOwnedForeignFixture) {
        evidence.foreign_fleet_master_deactivated = true;
      }
    } else if (
      !foreignMasterNotRequired &&
      (ownForeignPartnerIds.length > 0 || foreignCreateAttempted)
    ) {
      if (ownForeignPartnerIds.length === 0) {
        teardownFailures.push("foreign_fleet_master_unconfirmed");
      } else if (!config.adminOrigin || !adminInvocation || !activeAdminToken) {
        teardownFailures.push("foreign_fleet_master");
      } else {
        try {
          for (const fleetId of ownForeignPartnerIds) {
            await deactivateOperationalCanonicalFleet(
              config.adminOrigin,
              config,
              deps.fetch,
              adminInvocation,
              activeAdminToken,
              fleetId,
            );
          }
          deps.exportSession?.(
            "DRTS_OPERATIONAL_FOREIGN_FLEET_MASTER_CLEANUP_STATUS",
            "passed",
          );
          deps.exportSession?.(
            "DRTS_OPERATIONAL_FOREIGN_FLEET_MASTER_DEACTIVATED",
            "true",
          );
          if (hadOwnedForeignFixture) {
            evidence.foreign_fleet_master_deactivated = true;
          }
        } catch {
          teardownFailures.push("foreign_fleet_master");
        }
      }
    }

    // 6. Owned Ops non-reviewer session teardown
    const ownOpsSessionId = nonEmptyTrimmed(
      env.DRTS_OPERATIONAL_OPS_NON_REVIEWER_OWNED_SESSION_ID,
    );
    const opsIssuedAttempted =
      nonEmptyTrimmed(
        env.DRTS_OPERATIONAL_OPS_NON_REVIEWER_ISSUED_ATTEMPTED,
      ) === "true";
    const opsAlreadyRevoked =
      nonEmptyTrimmed(env.DRTS_OPERATIONAL_OPS_NON_REVIEWER_CLEANUP_STATUS) ===
        "passed" ||
      nonEmptyTrimmed(env.DRTS_OPERATIONAL_OPS_NON_REVIEWER_SESSION_REVOKED) ===
        "true";
    if (opsAlreadyRevoked) {
      if (ownOpsSessionId) {
        deps.mask(ownOpsSessionId);
      }
      evidence.ops_session_revoked = true;
    } else if (!ownOpsSessionId) {
      if (opsIssuedAttempted) {
        teardownFailures.push("ops_session_unconfirmed");
      }
    } else {
      deps.mask(ownOpsSessionId);
      const opsToken =
        nonEmptyTrimmed(env.DRTS_OPERATIONAL_OPS_NON_REVIEWER_RECOVERY_TOKEN) ??
        nonEmptyTrimmed(env.DRTS_OPERATIONAL_OPS_NON_REVIEWER_SESSION_TOKEN);
      if (!opsToken) {
        teardownFailures.push("ops_session_missing_token");
      } else {
        deps.mask(opsToken);
        try {
          await revokeOperationalApplicationSession(
            apiRequest,
            opsToken,
            ownOpsSessionId,
          );
          deps.exportSession?.(
            "DRTS_OPERATIONAL_OPS_NON_REVIEWER_CLEANUP_STATUS",
            "passed",
          );
          deps.exportSession?.(
            "DRTS_OPERATIONAL_OPS_NON_REVIEWER_SESSION_REVOKED",
            "true",
          );
          evidence.ops_session_revoked = true;
        } catch {
          teardownFailures.push("ops_session");
        }
      }
    }

    // 7. Owned Platform Admin session teardown (LAST, only when no Admin-managed resources remain pending)
    const hasPendingAdminManagedTeardown = teardownFailures.some(
      (item) =>
        item.startsWith("foreign_fleet_key") ||
        item.startsWith("foreign_fleet_entry") ||
        item.startsWith("foreign_fleet_master") ||
        (item.startsWith("foreign_fleet_session") &&
          (ownForeignKeyIds.length > 0 || foreignKeyIssueAttempted)),
    );

    if (adminAlreadyRevoked) {
      for (const adminSid of ownAdminSessionIds) {
        deps.mask(adminSid);
      }
      if (hadOwnedForeignFixture) {
        evidence.admin_session_revoked = true;
      }
    } else if (ownAdminSessionIds.length === 0) {
      if (adminIssuedAttempted) {
        teardownFailures.push("admin_session_unconfirmed");
      }
    } else if (!hasPendingAdminManagedTeardown) {
      for (const adminSid of ownAdminSessionIds) {
        deps.mask(adminSid);
      }
      const pendingAdminSessionIds = ownAdminSessionIds.filter(
        (sid) =>
          !authoritativelyInactiveAdminSessionIds.has(sid) &&
          !revokedAdminSessionIds.has(sid),
      );
      const orderedPendingAdminSessionIds = [
        ...pendingAdminSessionIds.filter(
          (sid) => sid !== currentActiveAdminSessionId,
        ),
        ...pendingAdminSessionIds.filter(
          (sid) => sid === currentActiveAdminSessionId,
        ),
      ];
      const primaryAdminToken =
        activeAdminToken ??
        initialRecoveryAdminToken ??
        nonEmptyTrimmed(env.DRTS_OPERATIONAL_PLATFORM_ADMIN_RECOVERY_TOKEN);
      if (orderedPendingAdminSessionIds.length > 0 && !primaryAdminToken) {
        teardownFailures.push("admin_session_missing_token");
      } else {
        if (primaryAdminToken) {
          deps.mask(primaryAdminToken);
        }
        for (const adminSid of orderedPendingAdminSessionIds) {
          const tokenForSid =
            (activeAdminToken &&
            !revokedAdminSessionIds.has(currentActiveAdminSessionId ?? "")
              ? activeAdminToken
              : undefined) ??
            adminTokenBySessionId.get(adminSid) ??
            primaryAdminToken;
          if (!tokenForSid) {
            break;
          }
          deps.mask(tokenForSid);
          try {
            await revokeOperationalApplicationSession(
              apiRequest,
              tokenForSid,
              adminSid,
            );
            revokedAdminSessionIds.add(adminSid);
          } catch {
            // Leave adminSid unrevoked so remainingOwnedAdminSessionIds fails closed below.
          }
        }
        const remainingOwnedAdminSessionIds = ownAdminSessionIds.filter(
          (sid) =>
            !authoritativelyInactiveAdminSessionIds.has(sid) &&
            !revokedAdminSessionIds.has(sid),
        );
        if (remainingOwnedAdminSessionIds.length === 0) {
          deps.exportSession?.(
            "DRTS_OPERATIONAL_PLATFORM_ADMIN_CLEANUP_STATUS",
            "passed",
          );
          deps.exportSession?.(
            "DRTS_OPERATIONAL_PLATFORM_ADMIN_SESSION_REVOKED",
            "true",
          );
          if (hadOwnedForeignFixture) {
            evidence.admin_session_revoked = true;
          }
        } else {
          teardownFailures.push("admin_session");
          deps.exportSession?.(
            "DRTS_OPERATIONAL_PLATFORM_ADMIN_OWNED_SESSION_ID",
            remainingOwnedAdminSessionIds.join(","),
          );
          const remainingRecoveryToken = remainingOwnedAdminSessionIds
            .map((sid) => adminTokenBySessionId.get(sid))
            .find((tok): tok is string => Boolean(tok));
          if (remainingRecoveryToken) {
            deps.exportSession?.(
              "DRTS_OPERATIONAL_PLATFORM_ADMIN_RECOVERY_TOKEN",
              remainingRecoveryToken,
            );
          }
          deps.exportSession?.(
            "DRTS_OPERATIONAL_PLATFORM_ADMIN_CLEANUP_STATUS",
            "pending",
          );
          deps.exportSession?.(
            "DRTS_OPERATIONAL_PLATFORM_ADMIN_SESSION_REVOKED",
            "false",
          );
        }
      }
    }

    assert.equal(
      teardownFailures.length,
      0,
      `Operational role session cleanup incomplete: ${teardownFailures.join(", ")}`,
    );

    deps.exportSession?.(
      "DRTS_OPERATIONAL_ROLE_SESSIONS_CLEANUP_STATUS",
      "passed",
    );
    evidence.status = "passed";
    return evidence;
  } catch {
    deps.exportSession?.(
      "DRTS_OPERATIONAL_ROLE_SESSIONS_CLEANUP_STATUS",
      "failed",
    );
    throw new Error(
      "Operational role session cleanup failed; no credential details retained",
    );
  } finally {
    deps.save(evidence);
  }
}

function writeOperationalEvidenceFile(path: string, evidence: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(evidence, null, 2)}\n`, {
    mode: 0o600,
  });
}

function parseCliArgs(argv: string[]): {
  teardown: boolean;
  envFile?: string;
} {
  let teardown = false;
  let envFile: string | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--teardown") {
      teardown = true;
    } else if (arg === "--env-file") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error("--env-file requires a path argument");
      }
      envFile = value;
      i += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return { teardown, ...(envFile ? { envFile } : {}) };
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const githubEnvPath = nonEmptyTrimmed(process.env.GITHUB_ENV);
  const evidenceDir =
    nonEmptyTrimmed(process.env.DRTS_OPERATIONAL_EVIDENCE_DIR) ??
    "test-results/operational-browser";

  const mask = (value: string) => {
    if (!value) return;
    console.log(
      `::add-mask::${value.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A")}`,
    );
  };

  const exportSession = (name: string, value: string) => {
    assert(
      /^(?:DRTS_OPERATIONAL_|DRTS_LIVE_MAP_)[A-Z0-9_]+$/.test(name),
      `Disallowed session export variable name: ${name}`,
    );
    assert(
      !/[\r\n]/.test(value),
      `Invalid newline in exported value for ${name}`,
    );
    if (args.envFile) {
      appendFileSync(args.envFile, `${name}=${value}\n`, { mode: 0o600 });
    }
    if (githubEnvPath) {
      appendFileSync(githubEnvPath, `${name}=${value}\n`);
    }
    process.env[name] = value;
  };

  if (args.teardown) {
    await teardownOperationalRoleSessions(process.env, {
      fetch,
      mask,
      exportSession,
      save: (evidence) =>
        writeOperationalEvidenceFile(
          `${evidenceDir}/role-sessions-cleanup-evidence.json`,
          evidence,
        ),
    });
    return;
  }

  await prepareOperationalRoleSessions(process.env, {
    fetch,
    mask,
    exportSession,
    save: (name, evidence) =>
      writeOperationalEvidenceFile(
        `${evidenceDir}/${name}-evidence.json`,
        evidence,
      ),
  });
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error: unknown) => {
    console.error(
      error instanceof Error
        ? error.message
        : "Operational role session bootstrap failed",
    );
    process.exitCode = 1;
  });
}
