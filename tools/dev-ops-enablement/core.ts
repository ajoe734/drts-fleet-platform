import {
  JourneyFailure,
  mask,
  object,
  records,
  requireFact,
  text,
  type CallResult,
  type CallOptions,
  type Role,
} from "../../tests/e2e/owned-referral-business-journey/protocol";

export const PROJECT = "drts-dev-devcc-20260825";
export const REGION = "us-central1";
export const OPS_EMAIL = "ops@platform.drts";
export const OPS_ENV_KEY = "DRTS_DEV_WORKFORCE_PRINCIPAL_ID";
export const ROLE_ACTION = "platform:users:role:update";
export const SERVICES = {
  api: "drts-dev-api",
  admin: "drts-dev-platform-admin-web",
  ops: "drts-dev-ops-console-web",
  fleet: "drts-dev-fleet-partner-portal-web",
  referral: "drts-dev-referral-embed-web",
} as const;
export type RuntimeRole = keyof typeof SERVICES;
export type RuntimeRow = {
  service: string;
  revision: string;
  origin: string;
  sha: string;
  image: string;
  configDigest: string;
  activeTraffic: { revision: string; percent: number }[];
  canonicalPrincipalRef: string | null;
  devWaiverEnabled: boolean;
};
export type Runtime = Record<RuntimeRole, RuntimeRow>;
export type SetupContext = {
  definitionSha: string;
  actualCheckoutSha: string;
  runtimeSha: string;
  project: string;
  region: string;
  explicitOptIn: boolean;
};
export type Journal = {
  definitionSha: string;
  runtimeSha: string;
  mode: "explicit-normal-existing-dev-Ops-enablement";
  completed: boolean;
  activation: "not-attempted" | "ack-unknown" | "acknowledged";
  configuration: "not-attempted" | "ack-unknown" | "acknowledged";
  canonicalPrincipalId: string | null;
  membershipId: string | null;
  actualCanonicalRealm: "ops" | null;
  before: Runtime | null;
  after: Runtime | null;
  adminSessionAcknowledged: boolean;
  opsSessionAcknowledged: boolean;
  canonicalOpsVerified: boolean;
  finalRuntimeVerified: boolean;
  cleaned: string[];
  cleanupErrors: string[];
  failure: { stage: string; status?: number; code?: string } | null;
};
export type SetupPorts = {
  readRuntime(): Promise<Runtime>;
  call(
    role: Role,
    path: string,
    options?: CallOptions,
  ): Promise<Pick<CallResult, "status" | "data">>;
  acceptSession(role: "admin" | "ops", token: string): void;
  configureOpsReference(canonicalPrincipalId: string): Promise<void>;
  persist(journal: Journal): Promise<void>;
};

function same(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}
export function validateContext(context: SetupContext) {
  requireFact(
    context.explicitOptIn &&
      context.project === PROJECT &&
      context.region === REGION &&
      /^[a-f0-9]{40}$/.test(context.definitionSha) &&
      context.definitionSha === context.actualCheckoutSha &&
      /^[a-f0-9]{40}$/.test(context.runtimeSha),
    "explicit immutable normal dev Ops setup required",
  );
}
export function validateRuntime(runtime: Runtime, expected: string) {
  requireFact(
    same(Object.keys(runtime).sort(), Object.keys(SERVICES).sort()),
    "fixed five services required",
  );
  for (const role of Object.keys(SERVICES) as RuntimeRole[]) {
    const row = runtime[role];
    const url = new URL(row.origin);
    requireFact(
      row.service === SERVICES[role] &&
        row.sha === expected &&
        Boolean(row.revision) &&
        Boolean(row.image) &&
        /^[a-f0-9]{64}$/.test(row.configDigest) &&
        url.protocol === "https:" &&
        url.hostname.endsWith(".a.run.app") &&
        url.origin === row.origin &&
        row.activeTraffic.length > 0 &&
        row.activeTraffic.every(
          (traffic) =>
            traffic.revision === row.revision &&
            Number.isInteger(traffic.percent) &&
            traffic.percent > 0 &&
            traffic.percent <= 100,
        ) &&
        row.activeTraffic.reduce((sum, traffic) => sum + traffic.percent, 0) ===
          100,
      "stable expected five-role runtime required",
    );
  }
  requireFact(runtime.ops.devWaiverEnabled, "Ops explicit dev mode required");
}
export function existingOperator(value: unknown) {
  const matches = records(value).filter(
    (row) =>
      typeof row.email === "string" &&
      row.email.trim().toLowerCase() === OPS_EMAIL,
  );
  requireFact(
    matches.length === 1,
    "single existing default Ops user required",
  );
  const row = matches[0]!;
  requireFact(
    row.canonicalRealm === "ops" &&
      row.roleCode === "operator" &&
      (row.status === "invited" || row.status === "active"),
    "existing nonsuspended Ops operator required",
  );
  const principalId = text(row.canonicalPrincipalId);
  requireFact(
    /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(principalId),
    "actual canonical principal configuration value required",
  );
  return {
    membershipId: text(row.userId),
    principalId,
    canonicalRealm: row.canonicalRealm as "ops",
    status: row.status,
  };
}
export function validateConfigurationChange(
  before: Runtime,
  after: Runtime,
  expected: string,
  principalId: string,
) {
  validateRuntime(after, expected);
  for (const role of Object.keys(SERVICES) as RuntimeRole[]) {
    const left = before[role];
    const right = after[role];
    if (role !== "ops") {
      requireFact(same(left, right), "non-Ops runtime must remain unchanged");
    } else {
      requireFact(
        left.service === right.service &&
          left.sha === right.sha &&
          left.origin === right.origin &&
          left.image === right.image &&
          left.configDigest === right.configDigest &&
          right.canonicalPrincipalRef === principalId,
        "only Ops private principal reference may change",
      );
    }
  }
}

export function verifySession(
  value: unknown,
  sid: string,
  actor: "platform_admin" | "ops_user",
  principalId?: string,
) {
  const session = object(value);
  const identity = object(session.identity);
  const required =
    actor === "platform_admin"
      ? ["foundation:read", "foundation:write"]
      : [
          "owned:read",
          "owned:write",
          "dispatch:read",
          "dispatch:write",
          "complaints:read",
        ];
  requireFact(
    session.active === true &&
      identity.authMode === "jwt_bearer" &&
      identity.actorType === actor &&
      identity.realm === (actor === "platform_admin" ? "platform" : "ops") &&
      identity.sessionId === sid &&
      typeof identity.principalId === "string" &&
      Boolean(identity.principalId) &&
      identity.actorId === identity.principalId &&
      typeof identity.membershipId === "string" &&
      Boolean(identity.membershipId) &&
      (principalId === undefined || identity.principalId === principalId) &&
      Array.isArray(identity.scopes) &&
      required.every((scope) => (identity.scopes as unknown[]).includes(scope)),
    "canonical active same-session authority required",
  );
  return identity;
}
export function safeFailure(error: unknown): NonNullable<Journal["failure"]> {
  if (error instanceof JourneyFailure)
    return {
      stage: error.stage.replace(/[^A-Za-z0-9_.:-]/g, "-").slice(0, 100),
      ...(error.status === undefined ? {} : { status: error.status }),
      ...(error.code === undefined ? {} : { code: error.code }),
    };
  return { stage: "unexpected-enablement-failure" };
}

export type DataCall = (
  ...args: Parameters<SetupPorts["call"]>
) => Promise<unknown>;
export type ActivationHooks = {
  selected(user: ReturnType<typeof existingOperator>): void;
  beforeWrite(): Promise<void>;
  acknowledged(): Promise<void>;
};

/** One normal existing-member action, shared by cloud setup and hosted fixtures. */
export async function activateExistingOperator(
  call: DataCall,
  hooks: ActivationHooks,
) {
  const user = existingOperator(
    object(await call("api", "/api/platform-admin/users")).items,
  );
  hooks.selected(user);
  const path = `/api/platform-admin/users/${encodeURIComponent(user.membershipId)}/role`;
  const proof = object(
    await call("admin", "/control-plane-proxy/identity/step-up-proofs", {
      method: "POST",
      body: { method: "POST", path },
    }),
  );
  const reference = text(proof.stepUpReference);
  mask(reference);
  requireFact(
    proof.required === true && proof.actionId === ROLE_ACTION,
    "exact same-Admin activation proof required",
  );
  await hooks.beforeWrite();
  const ack = object(
    await call("api", path, {
      method: "POST",
      body: {
        roleCode: "operator",
        status: "active",
        reason:
          "Explicit development Ops enablement for the embedded Referral Demo",
      },
      headers: { "x-drts-step-up-reference": reference },
    }),
  );
  requireFact(ack.status === "active", "normal activation ACK required");
  const acknowledged = existingOperator([ack]);
  requireFact(
    acknowledged.membershipId === user.membershipId &&
      acknowledged.principalId === user.principalId,
    "same existing canonical activation ACK required",
  );
  await hooks.acknowledged();
  const readback = existingOperator(
    object(await call("api", "/api/platform-admin/users")).items,
  );
  requireFact(
    readback.status === "active" &&
      readback.membershipId === user.membershipId &&
      readback.principalId === user.principalId,
    "normal activation current readback required",
  );
  return readback;
}

/** Same acknowledged own session; unchanged native route and status proof. */
export async function revokeOwnSession(
  call: SetupPorts["call"],
  api: "api" | "opsApi",
  sid: string,
) {
  await call(api, "/api/auth/sessions/revoke", {
    method: "POST",
    body: { sessionId: sid },
  });
  const inactive = await call(api, "/api/auth/session", {
    expected: [200, 401],
  });
  requireFact(
    inactive.status === 401 ||
      (inactive.status === 200 && object(inactive.data).active === false),
    "own setup session must be inactive",
  );
}

/** No product orders, account creation, role catalog or direct DB operations. */
export async function enableExistingDevOps(
  context: SetupContext,
  ports: SetupPorts,
): Promise<Journal> {
  const journal: Journal = {
    definitionSha: context.definitionSha,
    runtimeSha: context.runtimeSha,
    mode: "explicit-normal-existing-dev-Ops-enablement",
    completed: false,
    activation: "not-attempted",
    configuration: "not-attempted",
    canonicalPrincipalId: null,
    membershipId: null,
    actualCanonicalRealm: null,
    before: null,
    after: null,
    adminSessionAcknowledged: false,
    opsSessionAcknowledged: false,
    canonicalOpsVerified: false,
    finalRuntimeVerified: false,
    cleaned: [],
    cleanupErrors: [],
    failure: null,
  };
  const sessions: Partial<Record<"admin" | "ops", string>> = {};
  const call = async (...args: Parameters<SetupPorts["call"]>) =>
    (await ports.call(...args)).data;
  let configuredRuntime: Runtime | undefined;
  const accept = (role: "admin" | "ops", value: unknown) => {
    const ack = object(value);
    // Retain the own acknowledged session for finally before later assertions.
    const token = text(ack.token);
    mask(token);
    const sid = text(ack.sessionId);
    mask(sid);
    sessions[role] = sid;
    ports.acceptSession(role, token);
    if (role === "admin") journal.adminSessionAcknowledged = true;
    else journal.opsSessionAcknowledged = true;
    return sid;
  };
  try {
    validateContext(context);
    const before = await ports.readRuntime();
    validateRuntime(before, context.runtimeSha);
    journal.before = before;
    const adminSid = accept(
      "admin",
      await call("admin", "/control-plane-proxy/auth/token", {
        method: "POST",
        body: {},
      }),
    );
    verifySession(
      await call("api", "/api/auth/session"),
      adminSid,
      "platform_admin",
    );
    const user = await activateExistingOperator(call, {
      selected: (selected) => {
        journal.canonicalPrincipalId = selected.principalId;
        journal.membershipId = selected.membershipId;
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
    journal.actualCanonicalRealm = user.canonicalRealm;
    const current = await ports.readRuntime();
    requireFact(same(current, before), "runtime changed before private config");
    journal.configuration = "ack-unknown";
    await ports.persist(journal);
    await ports.configureOpsReference(user.principalId);
    const after = await ports.readRuntime();
    journal.after = after;
    validateConfigurationChange(
      before,
      after,
      context.runtimeSha,
      user.principalId,
    );
    journal.configuration = "acknowledged";
    configuredRuntime = after;
    await ports.persist(journal);
    const opsSid = accept(
      "ops",
      await call("ops", "/control-plane-proxy/auth/token", {
        method: "POST",
        body: {},
      }),
    );
    const identity = verifySession(
      await call("opsApi", "/api/auth/session"),
      opsSid,
      "ops_user",
      user.principalId,
    );
    requireFact(
      identity.membershipId === user.membershipId,
      "same explicitly enabled Ops membership required",
    );
    journal.canonicalOpsVerified = true;
  } catch (error) {
    journal.failure = safeFailure(error);
  } finally {
    for (const role of ["ops", "admin"] as const) {
      const sid = sessions[role];
      if (!sid) continue;
      const api = role === "ops" ? "opsApi" : "api";
      try {
        await revokeOwnSession(ports.call, api, sid);
        journal.cleaned.push(role);
      } catch {
        journal.cleanupErrors.push(role);
      }
    }
    if (
      journal.before &&
      journal.canonicalPrincipalId &&
      journal.configuration !== "not-attempted"
    ) {
      try {
        // A failed cloud ACK is never retried. Preserve a final read-only view
        // as well, without turning metadata into a successful command ACK.
        const finalRuntime = await ports.readRuntime();
        journal.after = finalRuntime;
        validateConfigurationChange(
          journal.before,
          finalRuntime,
          context.runtimeSha,
          journal.canonicalPrincipalId,
        );
        requireFact(
          !configuredRuntime || same(configuredRuntime, finalRuntime),
          "runtime changed during Ops verification and cleanup",
        );
        journal.finalRuntimeVerified = true;
      } catch (error) {
        journal.failure ??= safeFailure(error);
      }
    }
    journal.completed =
      journal.failure === null &&
      journal.canonicalOpsVerified &&
      journal.finalRuntimeVerified &&
      journal.cleaned.includes("admin") &&
      journal.cleaned.includes("ops") &&
      journal.cleanupErrors.length === 0;
    await ports.persist(journal);
  }
  return journal;
}
