import {
  CONTROL_PLANE_DEFAULT_EMAILS,
  CONTROL_PLANE_REQUEST_AUTH_HEADER,
  isControlPlaneIapEnabled,
  isStrictControlPlaneIapEnvironment,
  issueControlPlaneRequestAuth,
} from "@drts/control-plane-auth";

import {
  JourneyFailure,
  camelWire,
  mask,
  object,
  requireFact,
  text,
  type CallOptions,
  type Role,
} from "../../tests/e2e/owned-referral-business-journey/protocol";
import {
  activateExistingOperator,
  revokeOwnSession,
  safeFailure,
  verifySession,
  type DataCall,
  type SetupPorts,
} from "./core";

export const HOSTED_API = "http://127.0.0.1:3001";
const ADMIN_PRINCIPAL = "principal_platform_admin_default";
const EVIDENCE_DIRS = new Set([
  ".artifacts/pax-review-shared-order",
  ".artifacts/pax-bureau-acceptance",
]);
const ERROR_CODES = new Set([
  "SCOPE_REQUIRED",
  "WORKLOAD_ROUTE_SCOPE_DENIED",
  "AUTH_REQUIRED",
  "SESSION_REVOKED",
  "SESSION_EXPIRED",
  "CONFLICT",
  "NOT_FOUND",
  "FORBIDDEN",
  "VALIDATION_ERROR",
  "ORDER_NOT_CANCELABLE",
  "AUTH_REALM_DENIED",
  "AUTH_SCOPE_DENIED",
  "DEV_WORKFORCE_SESSION_EXCHANGE_DENIED",
]);
export type HostedFixtureJournal = {
  mode: "hosted-normal-existing-Ops-fixture";
  completed: boolean;
  activation: "not-attempted" | "ack-unknown" | "acknowledged";
  canonicalPrincipalId: string | null;
  membershipId: string | null;
  actualCanonicalRealm: "ops" | null;
  adminSessionAcknowledged: boolean;
  opsSessionAcknowledged: boolean;
  canonicalOpsVerified: boolean;
  cleaned: ("admin" | "ops")[];
  cleanupErrors: ("admin" | "ops")[];
  failure: ReturnType<typeof safeFailure> | null;
};
export type HostedFixturePorts = {
  fetch: typeof fetch;
  persist(journal: HostedFixtureJournal): Promise<void>;
};

/** This hosted fixture is not a Cloud Run setup or a configurable API client. */
export function validateHostedFixtureEnvironment(env: NodeJS.ProcessEnv) {
  requireFact(
    env.GITHUB_ACTIONS === "true" &&
      env.DRTS_HOSTED_OPS_FIXTURE_SETUP === "true" &&
      env.DRTS_ENV === "test" &&
      env.AUTH_MODE === "test" &&
      env.DRTS_API_URL === HOSTED_API &&
      env.DRTS_DEV_MFA_WAIVED?.trim().toLowerCase() === "true" &&
      !isStrictControlPlaneIapEnvironment(env) &&
      !isControlPlaneIapEnabled(env) &&
      Boolean(env.JWT_SECRET?.trim()),
    "explicit isolated hosted Ops fixture required",
  );
  const directory =
    env.PAX_REVIEW_OPS_FIXTURE_EVIDENCE_DIR ??
    ".artifacts/pax-review-shared-order";
  requireFact(
    EVIDENCE_DIRS.has(directory),
    "fixed hosted fixture evidence directory required",
  );
  return directory;
}

function apiPath(role: Role, path: string) {
  requireFact(
    ["admin", "api", "ops", "opsApi"].includes(role),
    "hosted fixture role required",
  );
  const mapped = path.startsWith("/control-plane-proxy/")
    ? `/api/${path.slice("/control-plane-proxy/".length)}`
    : path;
  requireFact(
    [
      "/api/auth/token",
      "/api/auth/session",
      "/api/auth/sessions/revoke",
      "/api/platform-admin/users",
      "/api/identity/step-up-proofs",
    ].includes(mapped) ||
      /^\/api\/platform-admin\/users\/[A-Za-z0-9_.:%-]+\/role$/.test(mapped),
    "fixed normal hosted fixture route required",
  );
  return mapped;
}

/** Real package proofs + normal API/session/activation contracts; no seed/grant. */
export async function prepareHostedOpsFixture(
  env: NodeJS.ProcessEnv,
  ports: HostedFixturePorts,
): Promise<{
  canonicalPrincipalId: string;
  membershipId: string;
  canonicalRealm: "ops";
}> {
  validateHostedFixtureEnvironment(env); // Before even the first request/persist.
  const journal: HostedFixtureJournal = {
    mode: "hosted-normal-existing-Ops-fixture",
    completed: false,
    activation: "not-attempted",
    canonicalPrincipalId: null,
    membershipId: null,
    actualCanonicalRealm: null,
    adminSessionAcknowledged: false,
    opsSessionAcknowledged: false,
    canonicalOpsVerified: false,
    cleaned: [],
    cleanupErrors: [],
    failure: null,
  };
  const sessions: Partial<
    Record<"admin" | "ops", { token: string; sid: string }>
  > = {};
  let failed: unknown;
  let result: Awaited<ReturnType<typeof activateExistingOperator>> | undefined;

  const request = async (
    path: string,
    options: CallOptions = {},
    sessionToken?: string,
    proof?: string,
  ): Promise<{ status: number; data: unknown }> => {
    const target = new URL(path, HOSTED_API);
    requireFact(
      target.origin === HOSTED_API && !target.search && !target.hash,
      "fixed loopback hosted API required",
    );
    const extras = options.headers ?? {};
    requireFact(
      Object.keys(extras).every(
        (key) => key.toLowerCase() === "x-drts-step-up-reference",
      ),
      "hosted fixture cannot replace authority headers",
    );
    let response: Response;
    try {
      response = await ports.fetch(target.toString(), {
        method: options.method ?? "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(15_000),
        headers: {
          "Content-Type": "application/json",
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
          ...(proof ? { [CONTROL_PLANE_REQUEST_AUTH_HEADER]: proof } : {}),
          ...extras,
        },
        ...(options.body === undefined
          ? {}
          : { body: JSON.stringify(options.body) }),
      });
    } catch {
      throw new JourneyFailure("hosted-Ops-fixture:transport");
    }
    const reader = response.body?.getReader();
    const parts: Uint8Array[] = [];
    let length = 0;
    try {
      if (reader)
        for (;;) {
          const part = await reader.read();
          if (part.done) break;
          length += part.value.length;
          requireFact(
            length <= 1024 * 1024,
            "bounded hosted response required",
          );
          parts.push(part.value);
        }
    } finally {
      if (reader) {
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
    }
    let payload: unknown;
    try {
      payload = camelWire(JSON.parse(Buffer.concat(parts).toString("utf8")));
    } catch {
      throw new JourneyFailure(
        "hosted-Ops-fixture:invalid-json",
        response.status,
      );
    }
    if (!(options.expected ?? [200, 201]).includes(response.status)) {
      const root =
        payload !== null &&
        typeof payload === "object" &&
        !Array.isArray(payload)
          ? (payload as Record<string, unknown>)
          : {};
      const error =
        root.error !== null &&
        typeof root.error === "object" &&
        !Array.isArray(root.error)
          ? (root.error as Record<string, unknown>)
          : {};
      throw new JourneyFailure(
        "hosted-Ops-fixture:request",
        response.status,
        typeof error.code === "string" && ERROR_CODES.has(error.code)
          ? error.code
          : undefined,
      );
    }
    if (response.status >= 400)
      return { status: response.status, data: payload };
    const envelope = object(payload);
    if (path === "/api/auth/token") {
      requireFact(
        typeof envelope.token === "string" &&
          typeof envelope.sessionId === "string",
        "normal hosted auth token ACK required",
      );
      return { status: response.status, data: envelope };
    }
    requireFact(
      envelope.data !== undefined,
      "normal hosted API envelope required",
    );
    return { status: response.status, data: envelope.data };
  };
  const call: SetupPorts["call"] = (role, path, options) => {
    const owner = role === "ops" || role === "opsApi" ? "ops" : "admin";
    const token = sessions[owner]?.token;
    requireFact(token, "own hosted session required");
    return request(apiPath(role, path), options, token);
  };
  const dataCall: DataCall = async (...args) => (await call(...args)).data;
  const establish = async (role: "admin" | "ops", principalId: string) => {
    const actor = role === "admin" ? "platform_admin" : "ops_user";
    const proof = await issueControlPlaneRequestAuth({
      actorType: actor,
      defaultEmail: CONTROL_PLANE_DEFAULT_EMAILS[actor],
      devCanonicalPrincipalId: principalId,
      headers: new Headers(),
      strictIapMode: false,
      iapEnabled: false,
      jwtSecret: env.JWT_SECRET!,
      ...(env.JWT_ISSUER ? { jwtIssuer: env.JWT_ISSUER } : {}),
      ...(env.JWT_AUDIENCE ? { jwtAudience: env.JWT_AUDIENCE } : {}),
    });
    const signed = text(proof.headers[CONTROL_PLANE_REQUEST_AUTH_HEADER]);
    mask(signed);
    const ack = object(
      (
        await request(
          "/api/auth/token",
          { method: "POST", body: {} },
          undefined,
          signed,
        )
      ).data,
    );
    const token = text(ack.token);
    mask(token);
    const sid = text(ack.sessionId);
    mask(sid);
    sessions[role] = { token, sid }; // Retain own ACK before further validation.
    if (role === "admin") journal.adminSessionAcknowledged = true;
    else journal.opsSessionAcknowledged = true;
    const identity = verifySession(
      await dataCall(role === "admin" ? "api" : "opsApi", "/api/auth/session"),
      sid,
      actor,
      principalId,
    );
    return identity;
  };
  try {
    await establish("admin", ADMIN_PRINCIPAL);
    result = await activateExistingOperator(dataCall, {
      selected: (user) => {
        journal.canonicalPrincipalId = user.principalId;
        journal.membershipId = user.membershipId;
      },
      beforeWrite: async () => {
        journal.activation = "ack-unknown";
        await ports.persist(journal);
      },
      acknowledged: async () => {
        journal.activation = "acknowledged";
        await ports.persist(journal);
      },
    });
    journal.actualCanonicalRealm = result.canonicalRealm;
    const identity = await establish("ops", result.principalId);
    requireFact(
      identity.membershipId === result.membershipId && identity.realm === "ops",
      "same activated hosted Ops membership required",
    );
    journal.canonicalOpsVerified = true;
  } catch (error) {
    failed = error;
    journal.failure = safeFailure(error);
  } finally {
    for (const role of ["ops", "admin"] as const) {
      const session = sessions[role];
      if (!session) continue;
      try {
        await revokeOwnSession(
          call,
          role === "ops" ? "opsApi" : "api",
          session.sid,
        );
        journal.cleaned.push(role);
      } catch {
        journal.cleanupErrors.push(role);
      }
    }
    journal.completed =
      journal.failure === null &&
      journal.canonicalOpsVerified &&
      journal.cleaned.includes("admin") &&
      journal.cleaned.includes("ops") &&
      journal.cleanupErrors.length === 0;
    await ports.persist(journal);
  }
  if (failed) throw failed;
  requireFact(
    journal.completed && result,
    "normal hosted Ops fixture incomplete",
  );
  return {
    canonicalPrincipalId: result.principalId,
    membershipId: result.membershipId,
    canonicalRealm: "ops",
  };
}
