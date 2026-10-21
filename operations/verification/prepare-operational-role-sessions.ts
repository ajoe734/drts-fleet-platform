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
    | "partner-bootstrap-exchange";
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
  if (
    adminOrigin &&
    (adminOrigin === apiOrigin || adminOrigin === opsOrigin)
  ) {
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
  assert(
    response.ok,
    `${label} request failed with HTTP ${response.status}`,
  );
  assert.equal(
    response.headers.get("x-drts-candidate-sha"),
    config.candidateSha,
  );
  return normalizeApiResponse(await response.json()) as T;
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
  let systemToken: string | undefined;
  let driverToken: string | undefined;
  let registrationCode: string | undefined;
  let invitationAttempted = false;
  let foreignFleetToken: string | undefined;
  let ownForeignFleetSessionId: string | undefined;
  let foreignFleetBootstrapIssued = false;
  let adminToken: string | undefined;
  let ownAdminSessionId: string | undefined;
  let adminBffIssued = false;

  const cleanupIssuedResources = async () => {
    const cleanupFailures: string[] = [];
    if (registrationCode && systemToken) {
      try {
        await revokeOperationalDriverInvitation(
          apiRequest,
          systemToken,
          registrationCode,
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
    if (ownForeignFleetSessionId && foreignFleetToken) {
      try {
        await revokeOperationalApplicationSession(
          apiRequest,
          foreignFleetToken,
          ownForeignFleetSessionId,
        );
        deps.exportSession(
          "DRTS_OPERATIONAL_FOREIGN_FLEET_SESSION_REVOKED",
          "true",
        );
      } catch {
        cleanupFailures.push("foreign_fleet_session");
      }
    } else if (foreignFleetBootstrapIssued && !ownForeignFleetSessionId) {
      cleanupFailures.push("foreign_fleet_session_unconfirmed");
    }
    if (ownOpsSessionId && opsToken) {
      try {
        await revokeOperationalApplicationSession(
          apiRequest,
          opsToken,
          ownOpsSessionId,
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
    if (ownAdminSessionId && adminToken) {
      try {
        await revokeOperationalApplicationSession(
          apiRequest,
          adminToken,
          ownAdminSessionId,
        );
        deps.exportSession(
          "DRTS_OPERATIONAL_PLATFORM_ADMIN_SESSION_REVOKED",
          "true",
        );
      } catch {
        cleanupFailures.push("admin_session");
      }
    } else if (adminBffIssued && !ownAdminSessionId) {
      cleanupFailures.push("admin_session_unconfirmed");
    }
    if (cleanupFailures.length === 0) {
      if (
        registrationCode ||
        ownForeignFleetSessionId ||
        ownOpsSessionId ||
        ownAdminSessionId
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

  const verifyCanonicalForeignFleetViaAdminBff = async (partnerId: string) => {
    if (!config.adminOrigin) {
      return;
    }
    evidence.stage = "foreign_fleet:verify-canonical-fleet";
    const adminInvocation =
      nonEmptyTrimmed(env.DRTS_OPERATIONAL_PLATFORM_ADMIN_ID_TOKEN) ??
      nonEmptyTrimmed(env.DRTS_DEV_PLATFORM_ADMIN_ID_TOKEN);
    if (!adminInvocation) {
      throw new Error(
        "DRTS_OPERATIONAL_PLATFORM_ADMIN_ID_TOKEN or DRTS_DEV_PLATFORM_ADMIN_ID_TOKEN is required for Platform Admin BFF canonical Fleet verification",
      );
    }
    assertOpaqueCredential(
      adminInvocation,
      "DRTS_OPERATIONAL_PLATFORM_ADMIN_ID_TOKEN",
    );
    deps.mask(adminInvocation);

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
      evidence.cleanup = "unconfirmed";
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
      evidence.cleanup = "required";
      deps.exportSession(
        "DRTS_OPERATIONAL_PLATFORM_ADMIN_OWNED_SESSION_ID",
        ownAdminSessionId,
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
    if (!suppliedAdminSessionToken && ownAdminSessionId && issuedAdminPrincipalId) {
      assert.equal(adminIdentity.sessionId, ownAdminSessionId);
      assert.equal(adminIdentity.principalId, issuedAdminPrincipalId);
    }

    const fleetUrl = `${config.adminOrigin}/control-plane-proxy/admin/fleet-partners/${encodeURIComponent(partnerId)}`;
    assertAllowedTargetUrl(fleetUrl, config.allowedTargets);
    const fleetResponse = await deps.fetch(fleetUrl, {
      method: "GET",
      headers: {
        authorization: `Bearer ${adminInvocation}`,
        "x-drts-authorization": `Bearer ${adminToken}`,
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
      evidence.cleanup = "unconfirmed";
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
      deps.exportSession("DRTS_LIVE_MAP_INVITATION_ATTEMPTED", "true");
      invitationAttempted = true;
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
      evidence.cleanup = "unconfirmed";
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
    } else {
      evidence.foreign_fleet_precondition = "missing-external-fixture";
      throw new OperationalForeignFleetFixturePreconditionError(
        `External foreign_fleet fixture precondition unmet: provide DRTS_OPERATIONAL_FOREIGN_FLEET_SESSION_TOKEN (or DRTS_OPERATIONAL_OTHER_FLEET_SESSION_TOKEN) or canonical foreign Fleet partner bootstrap credentials DRTS_OPERATIONAL_FOREIGN_FLEET_ENTRY_SLUG + DRTS_OPERATIONAL_FOREIGN_FLEET_API_KEY bound to an active Fleet partner distinct from ${config.expectedOwnFleetId}`,
      );
    }

    const hasExternalCleanupMarker = Boolean(
      nonEmptyTrimmed(env.DRTS_LIVE_MAP_INVITE_CODE) ||
      nonEmptyTrimmed(env.DRTS_LIVE_MAP_INVITATION_ATTEMPTED) === "true" ||
      nonEmptyTrimmed(env.DRTS_OPERATIONAL_OPS_NON_REVIEWER_OWNED_SESSION_ID) ||
      nonEmptyTrimmed(
        env.DRTS_OPERATIONAL_OPS_NON_REVIEWER_ISSUED_ATTEMPTED,
      ) === "true" ||
      nonEmptyTrimmed(env.DRTS_OPERATIONAL_FOREIGN_FLEET_OWNED_SESSION_ID) ||
      nonEmptyTrimmed(env.DRTS_OPERATIONAL_FOREIGN_FLEET_ISSUED_ATTEMPTED) ===
        "true" ||
      nonEmptyTrimmed(env.DRTS_OPERATIONAL_PLATFORM_ADMIN_OWNED_SESSION_ID) ||
      nonEmptyTrimmed(env.DRTS_OPERATIONAL_PLATFORM_ADMIN_ISSUED_ATTEMPTED) ===
        "true",
    );
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
    throw new OperationalRoleSessionBootstrapError(
      evidence.stage,
      "no credential details retained",
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
  const apiRequest = createOperationalRoleSessionRequest(config, deps.fetch);
  const readGoogleIdToken =
    deps.readGoogleIdToken ??
    ((purpose: "observer" | "provisioning") => {
      if (purpose === "provisioning") {
        return readOperationalGoogleProvisioningIdToken(env, config);
      }
      throw new Error("Unexpected observer token request during teardown");
    });

  const evidence: OperationalRoleSessionsCleanupEvidence = {
    candidate_sha: config.candidateSha,
    status: "failed",
    driver_id: config.driverId,
    driver_recovery: "not-required",
    driver_revoked: false,
    ops_session_revoked: false,
    foreign_fleet_session_revoked: false,
  };

  try {
    if (env.DRTS_OPERATIONAL_ROLE_SESSIONS_CLEANUP_STATUS === "passed") {
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
      evidence.status = "passed";
      return evidence;
    }

    const teardownFailures: string[] = [];

    const inviteCode = nonEmptyTrimmed(env.DRTS_LIVE_MAP_INVITE_CODE);
    const invitationAttempted =
      nonEmptyTrimmed(env.DRTS_LIVE_MAP_INVITATION_ATTEMPTED) === "true";
    const driverAlreadyRevoked =
      nonEmptyTrimmed(env.DRTS_OPERATIONAL_DRIVER_INVITATION_REVOKED) ===
      "true";

    if (!inviteCode) {
      // An attempted invitation mutation with lost recovery data must fail closed.
      if (invitationAttempted) {
        teardownFailures.push("driver_invitation_unconfirmed");
      } else {
        evidence.driver_recovery = "not-required";
      }
    } else if (driverAlreadyRevoked) {
      deps.mask(inviteCode);
      evidence.driver_recovery = "consumed-invitation";
      evidence.driver_revoked = true;
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
          "DRTS_OPERATIONAL_DRIVER_INVITATION_REVOKED",
          "true",
        );
        evidence.driver_revoked = true;
      } catch {
        teardownFailures.push("driver_invitation");
      }
    }

    const ownForeignSessionId = nonEmptyTrimmed(
      env.DRTS_OPERATIONAL_FOREIGN_FLEET_OWNED_SESSION_ID,
    );
    const foreignIssuedAttempted =
      nonEmptyTrimmed(env.DRTS_OPERATIONAL_FOREIGN_FLEET_ISSUED_ATTEMPTED) ===
      "true";
    const foreignAlreadyRevoked =
      nonEmptyTrimmed(env.DRTS_OPERATIONAL_FOREIGN_FLEET_SESSION_REVOKED) ===
      "true";
    if (!ownForeignSessionId) {
      if (foreignIssuedAttempted) {
        teardownFailures.push("foreign_fleet_session_unconfirmed");
      }
    } else if (foreignAlreadyRevoked) {
      deps.mask(ownForeignSessionId);
      evidence.foreign_fleet_session_revoked = true;
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
            "DRTS_OPERATIONAL_FOREIGN_FLEET_SESSION_REVOKED",
            "true",
          );
          evidence.foreign_fleet_session_revoked = true;
        } catch {
          teardownFailures.push("foreign_fleet_session");
        }
      }
    }

    const ownOpsSessionId = nonEmptyTrimmed(
      env.DRTS_OPERATIONAL_OPS_NON_REVIEWER_OWNED_SESSION_ID,
    );
    const opsIssuedAttempted =
      nonEmptyTrimmed(
        env.DRTS_OPERATIONAL_OPS_NON_REVIEWER_ISSUED_ATTEMPTED,
      ) === "true";
    const opsAlreadyRevoked =
      nonEmptyTrimmed(
        env.DRTS_OPERATIONAL_OPS_NON_REVIEWER_SESSION_REVOKED,
      ) === "true";
    if (!ownOpsSessionId) {
      if (opsIssuedAttempted) {
        teardownFailures.push("ops_session_unconfirmed");
      }
    } else if (opsAlreadyRevoked) {
      deps.mask(ownOpsSessionId);
      evidence.ops_session_revoked = true;
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
            "DRTS_OPERATIONAL_OPS_NON_REVIEWER_SESSION_REVOKED",
            "true",
          );
          evidence.ops_session_revoked = true;
        } catch {
          teardownFailures.push("ops_session");
        }
      }
    }

    const ownAdminSessionId = nonEmptyTrimmed(
      env.DRTS_OPERATIONAL_PLATFORM_ADMIN_OWNED_SESSION_ID,
    );
    const adminIssuedAttempted =
      nonEmptyTrimmed(env.DRTS_OPERATIONAL_PLATFORM_ADMIN_ISSUED_ATTEMPTED) ===
      "true";
    const adminAlreadyRevoked =
      nonEmptyTrimmed(env.DRTS_OPERATIONAL_PLATFORM_ADMIN_SESSION_REVOKED) ===
      "true";
    if (!ownAdminSessionId) {
      if (adminIssuedAttempted) {
        teardownFailures.push("admin_session_unconfirmed");
      }
    } else if (adminAlreadyRevoked) {
      deps.mask(ownAdminSessionId);
    } else {
      deps.mask(ownAdminSessionId);
      const adminToken = nonEmptyTrimmed(
        env.DRTS_OPERATIONAL_PLATFORM_ADMIN_RECOVERY_TOKEN,
      );
      if (!adminToken) {
        teardownFailures.push("admin_session_missing_token");
      } else {
        deps.mask(adminToken);
        try {
          await revokeOperationalApplicationSession(
            apiRequest,
            adminToken,
            ownAdminSessionId,
          );
          deps.exportSession?.(
            "DRTS_OPERATIONAL_PLATFORM_ADMIN_SESSION_REVOKED",
            "true",
          );
        } catch {
          teardownFailures.push("admin_session");
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
