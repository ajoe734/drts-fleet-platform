import { describe, expect, it } from "vitest";

import { JourneyFailure } from "../../../tests/e2e/owned-referral-business-journey/protocol";
import {
  OPS_EMAIL,
  PROJECT,
  REGION,
  ROLE_ACTION,
  SERVICES,
  enableExistingDevOps,
  existingOperator,
  validateConfigurationChange,
  validateContext,
  validateRuntime,
  type Journal,
  type Runtime,
  type RuntimeRole,
  type SetupContext,
  type SetupPorts,
} from "../../../tools/dev-ops-enablement/core";
import { projectRuntime } from "../../../tools/dev-ops-enablement/runtime";

const D = "d".repeat(40);
const S = "a".repeat(40);
const principalId = "principal_existing_ops";
const membershipId = "membership_existing_ops";
const user = {
  userId: membershipId,
  canonicalPrincipalId: principalId,
  email: OPS_EMAIL,
  roleCode: "operator",
  status: "invited",
};
const context: SetupContext = {
  definitionSha: D,
  actualCheckoutSha: D,
  runtimeSha: S,
  project: PROJECT,
  region: REGION,
  explicitOptIn: true,
};
function runtime(): Runtime {
  return Object.fromEntries(
    (Object.keys(SERVICES) as RuntimeRole[]).map((role) => [
      role,
      {
        service: SERVICES[role],
        revision: `${role}-before`,
        origin: `https://synthetic-${role}.a.run.app`,
        sha: S,
        image: `synthetic/${role}:${S}`,
        configDigest: "b".repeat(64),
        activeTraffic: [{ revision: `${role}-before`, percent: 100 }],
        canonicalPrincipalRef: null,
        devWaiverEnabled: role === "ops",
      },
    ]),
  ) as Runtime;
}
function harness() {
  const calls: { role: string; path: string; options: unknown }[] = [];
  const saved: Journal[] = [];
  const state = {
    runtime: runtime(),
    users: [{ ...user }],
    activated: false,
    configured: [] as string[],
    revoked: new Set<string>(),
    accepted: new Map<string, string>(),
    proofAction: ROLE_ACTION,
    opsPrincipal: principalId,
  };
  const ports: SetupPorts = {
    readRuntime: async () => structuredClone(state.runtime),
    acceptSession: (role, token) => state.accepted.set(role, token),
    configureOpsReference: async (id) => {
      state.configured.push(id);
      state.runtime.ops.canonicalPrincipalRef = id;
      state.runtime.ops.revision = "ops-after";
      state.runtime.ops.activeTraffic = [
        { revision: "ops-after", percent: 100 },
      ];
    },
    persist: async (journal) => {
      saved.push(structuredClone(journal));
    },
    call: async (role, path, options) => {
      calls.push({ role, path, options });
      if (path === "/control-plane-proxy/auth/token")
        return {
          token: `${role}-SECRET-token`,
          sessionId: `${role}-SECRET-sid`,
        };
      if (path.endsWith("/revoke")) {
        state.revoked.add(role);
        return { revoked: true };
      }
      if (path === "/api/auth/session") {
        if (state.revoked.has(role)) return { active: false };
        const ops = role === "opsApi";
        return {
          active: true,
          identity: {
            sessionId: `${ops ? "ops" : "admin"}-SECRET-sid`,
            principalId: ops ? state.opsPrincipal : "principal_admin",
            actorId: ops ? state.opsPrincipal : "principal_admin",
            membershipId: ops ? membershipId : "membership_admin",
            realm: ops ? "ops" : "platform",
            actorType: ops ? "ops_user" : "platform_admin",
            authMode: "jwt_bearer",
            scopes: ops
              ? [
                  "owned:read",
                  "owned:write",
                  "dispatch:read",
                  "dispatch:write",
                  "complaints:read",
                ]
              : ["foundation:read", "foundation:write"],
          },
        };
      }
      if (path === "/api/platform-admin/users")
        return state.users.map((row) => ({
          ...row,
          status: state.activated ? "active" : row.status,
        }));
      if (path === "/control-plane-proxy/identity/step-up-proofs")
        return {
          required: true,
          actionId: state.proofAction,
          stepUpReference: "SECRET-proof",
        };
      if (path === `/api/platform-admin/users/${membershipId}/role`) {
        state.activated = true;
        return { ...user, status: "active" };
      }
      throw new Error("Unexpected fake adapter call");
    },
  };
  return { state, calls, saved, ports };
}

describe("normal existing development Ops enablement", () => {
  it("activates the exact existing member, configures its actual principal and cleans both real-session adapters", async () => {
    const h = harness();
    const result = await enableExistingDevOps(context, h.ports);
    expect(result.completed).toBe(true);
    expect(result.activation).toBe("acknowledged");
    expect(result.configuration).toBe("acknowledged");
    expect(result.finalRuntimeVerified).toBe(true);
    expect(result.canonicalPrincipalId).toBe(principalId);
    expect(result.membershipId).toBe(membershipId);
    expect(h.state.configured).toEqual([principalId]);
    const activation = h.calls.filter((c) =>
      c.path.endsWith(`/${membershipId}/role`),
    );
    expect(activation).toEqual([
      {
        role: "api",
        path: `/api/platform-admin/users/${membershipId}/role`,
        options: {
          method: "POST",
          body: {
            roleCode: "operator",
            status: "active",
            reason: expect.any(String),
          },
          headers: { "x-drts-step-up-reference": "SECRET-proof" },
        },
      },
    ]);
    expect(result.cleaned).toEqual(["ops", "admin"]);
    expect(h.saved.some((s) => s.activation === "ack-unknown")).toBe(true);
    expect(h.saved.some((s) => s.configuration === "ack-unknown")).toBe(true);
    expect(JSON.stringify(h.saved)).not.toContain("SECRET");
    expect(
      h.calls.some((c) => /orders|dispatch|drivers|vehicles/.test(c.path)),
    ).toBe(false);
    expect(
      h.calls
        .filter((c) => c.path === "/api/platform-admin/users")
        .every((c) => !c.options),
    ).toBe(true);
  });

  it.each([
    ["not explicitly selected", { explicitOptIn: false }],
    ["different project", { project: "unapproved-project" }],
    ["different region", { region: "other-region" }],
    ["different actual checkout", { actualCheckoutSha: "e".repeat(40) }],
    ["mutable definition", { definitionSha: "dev" }],
    ["mutable runtime", { runtimeSha: "dev" }],
  ])(
    "rejects %s before all cloud/session/mutation operations",
    async (_name, patch) => {
      const h = harness();
      let reads = 0;
      h.ports.readRuntime = async () => {
        reads++;
        return runtime();
      };
      const result = await enableExistingDevOps(
        { ...context, ...patch },
        h.ports,
      );
      expect(result.completed).toBe(false);
      expect(reads).toBe(0);
      expect(h.calls).toEqual([]);
      expect(h.state.configured).toEqual([]);
    },
  );

  it.each([
    [
      "mixed source",
      (r: Runtime) => {
        r.api.sha = "c".repeat(40);
      },
    ],
    [
      "partial traffic",
      (r: Runtime) => {
        r.ops.activeTraffic[0]!.percent = 90;
      },
    ],
    [
      "old revision traffic",
      (r: Runtime) => {
        r.ops.activeTraffic[0]!.revision = "old";
      },
    ],
    [
      "Ops mode disabled",
      (r: Runtime) => {
        r.ops.devWaiverEnabled = false;
      },
    ],
    [
      "missing image",
      (r: Runtime) => {
        r.ops.image = "";
      },
    ],
    [
      "credentialed origin",
      (r: Runtime) => {
        r.api.origin = "https://secret@synthetic-api.a.run.app";
      },
    ],
  ])("rejects %s without invoking account APIs", async (_name, change) => {
    const h = harness();
    change(h.state.runtime);
    const result = await enableExistingDevOps(context, h.ports);
    expect(result.completed).toBe(false);
    expect(h.calls).toEqual([]);
  });

  it.each([
    ["absent", []],
    ["ambiguous", [{ ...user }, { ...user }]],
    ["suspended", [{ ...user, status: "suspended" }]],
    ["wrong role", [{ ...user, roleCode: "admin" }]],
    ["no canonical readback", [{ ...user, canonicalPrincipalId: undefined }]],
    [
      "unsafe env value",
      [{ ...user, canonicalPrincipalId: "bad,second=setting" }],
    ],
  ])(
    "rejects %s user and only cleans the already acknowledged Admin",
    async (_name, users) => {
      const h = harness();
      h.state.users = users as typeof h.state.users;
      const result = await enableExistingDevOps(context, h.ports);
      expect(result.completed).toBe(false);
      expect(result.activation).toBe("not-attempted");
      expect(result.cleaned).toEqual(["admin"]);
      expect(h.state.activated).toBe(false);
      expect(h.state.configured).toEqual([]);
    },
  );

  it("requires the exact normal activation action proof before writing", async () => {
    const h = harness();
    h.state.proofAction = "another:action";
    const result = await enableExistingDevOps(context, h.ports);
    expect(result.activation).toBe("not-attempted");
    expect(result.cleaned).toEqual(["admin"]);
  });
  it("persists before an activation write and never retries an unknown ACK", async () => {
    const h = harness();
    const original = h.ports.call;
    let writes = 0;
    h.ports.call = async (role, path, options) => {
      if (path.endsWith(`/${membershipId}/role`)) {
        writes++;
        expect(h.saved.at(-1)?.activation).toBe("ack-unknown");
        throw new JourneyFailure("api:transport");
      }
      return original(role, path, options);
    };
    const result = await enableExistingDevOps(context, h.ports);
    expect(writes).toBe(1);
    expect(result.activation).toBe("ack-unknown");
    expect(result.configuration).toBe("not-attempted");
    expect(result.cleaned).toEqual(["admin"]);
  });
  it("stops if the normal activation ACK names another principal", async () => {
    const h = harness();
    const original = h.ports.call;
    h.ports.call = async (role, path, options) =>
      path.endsWith(`/${membershipId}/role`)
        ? {
            ...user,
            status: "active",
            canonicalPrincipalId: "foreign_principal",
          }
        : original(role, path, options);
    const result = await enableExistingDevOps(context, h.ports);
    expect(result.activation).toBe("ack-unknown");
    expect(h.state.configured).toEqual([]);
  });
  it("retains known activation but refuses to configure after a concurrent runtime change", async () => {
    const h = harness();
    const read = h.ports.readRuntime;
    let reads = 0;
    h.ports.readRuntime = async () => {
      const r = await read();
      if (++reads === 2) r.api.revision = "changed";
      return r;
    };
    const result = await enableExistingDevOps(context, h.ports);
    expect(result.activation).toBe("acknowledged");
    expect(result.configuration).toBe("not-attempted");
    expect(h.state.configured).toEqual([]);
  });
  it("persists an unacknowledged cloud update once without retry or Ops session creation", async () => {
    const h = harness();
    let writes = 0;
    h.ports.configureOpsReference = async () => {
      writes++;
      expect(h.saved.at(-1)?.configuration).toBe("ack-unknown");
      throw new Error("SECRET raw cloud stderr");
    };
    const result = await enableExistingDevOps(context, h.ports);
    expect(writes).toBe(1);
    expect(result.configuration).toBe("ack-unknown");
    expect(result.opsSessionAcknowledged).toBe(false);
    expect(result.cleaned).toEqual(["admin"]);
    expect(JSON.stringify(result)).not.toContain("SECRET");
  });
  it("cleans the own acknowledged Ops session even when canonical identity verification fails", async () => {
    const h = harness();
    h.state.opsPrincipal = "foreign_principal";
    const result = await enableExistingDevOps(context, h.ports);
    expect(result.configuration).toBe("acknowledged");
    expect(result.canonicalOpsVerified).toBe(false);
    expect(result.completed).toBe(false);
    expect(result.cleaned).toEqual(["ops", "admin"]);
  });
  it("does not claim completion if own Ops revocation fails, while Admin cleanup still runs", async () => {
    const h = harness();
    const original = h.ports.call;
    h.ports.call = async (role, path, options) => {
      if (role === "opsApi" && path.endsWith("/revoke"))
        throw new Error("SECRET");
      return original(role, path, options);
    };
    const result = await enableExistingDevOps(context, h.ports);
    expect(result.canonicalOpsVerified).toBe(true);
    expect(result.completed).toBe(false);
    expect(result.cleanupErrors).toEqual(["ops"]);
    expect(result.cleaned).toEqual(["admin"]);
  });
  it("rejects a final runtime change after Ops verification even when both sessions were cleaned", async () => {
    const h = harness();
    const original = h.ports.call;
    h.ports.call = async (role, path, options) => {
      const result = await original(role, path, options);
      if (role === "api" && path.endsWith("/revoke"))
        h.state.runtime.fleet.revision = "concurrent-fleet-revision";
      return result;
    };
    const result = await enableExistingDevOps(context, h.ports);
    expect(result.canonicalOpsVerified).toBe(true);
    expect(result.cleaned).toEqual(["ops", "admin"]);
    expect(result.finalRuntimeVerified).toBe(false);
    expect(result.completed).toBe(false);
    expect(result.after?.fleet.revision).toBe("concurrent-fleet-revision");
  });
  it("does not write when the pre-write journal cannot be persisted", async () => {
    const h = harness();
    const persist = h.ports.persist;
    let count = 0;
    h.ports.persist = async (journal) => {
      if (++count === 1) throw new Error("disk unavailable");
      await persist(journal);
    };
    const result = await enableExistingDevOps(context, h.ports);
    expect(result.completed).toBe(false);
    expect(h.state.activated).toBe(false);
    expect(h.state.configured).toEqual([]);
    expect(result.cleaned).toEqual(["admin"]);
  });
});

function cloudService() {
  return {
    status: {
      latestReadyRevisionName: "ops-before",
      latestCreatedRevisionName: "ops-before",
      url: "https://synthetic-ops.a.run.app",
      traffic: [{ revisionName: "ops-before", percent: 100 }],
    },
    spec: {
      template: {
        metadata: {
          annotations: { "run.googleapis.com/client-name": "gcloud" },
        },
        spec: {
          serviceAccountName: "synthetic-runtime",
          containers: [
            {
              image: `synthetic/ops:${S}`,
              env: [
                { name: "DRTS_CANDIDATE_SHA", value: S },
                { name: "DRTS_DEV_MFA_WAIVED", value: "true" },
                { name: "JWT_SECRET", value: "SECRET-never-export" },
              ] as Record<string, unknown>[],
              resources: { limits: { cpu: "1" } },
            },
          ],
        },
      },
    },
  };
}
describe("normal setup runtime projection and bounded configuration", () => {
  it("keeps raw config out of evidence and ignores only the intentional Ops reference and CLI bookkeeping", () => {
    const a = cloudService();
    const before = projectRuntime("ops", a);
    a.spec.template.spec.containers[0]!.env.push({
      name: "DRTS_DEV_WORKFORCE_PRINCIPAL_ID",
      value: principalId,
    });
    a.spec.template.spec.containers[0]!.env.reverse();
    a.spec.template.metadata.annotations["run.googleapis.com/client-name"] =
      "another-version";
    a.status.latestReadyRevisionName = a.status.latestCreatedRevisionName =
      "ops-after";
    a.status.traffic[0]!.revisionName = "ops-after";
    const after = projectRuntime("ops", a);
    expect(after.configDigest).toBe(before.configDigest);
    expect(after.canonicalPrincipalRef).toBe(principalId);
    expect(JSON.stringify(after)).not.toContain("SECRET");
  });
  it("detects material hardware changes even if image and served source match", () => {
    const a = cloudService();
    const before = projectRuntime("ops", a);
    a.spec.template.spec.containers[0]!.resources.limits.cpu = "2";
    expect(projectRuntime("ops", a).configDigest).not.toBe(before.configDigest);
  });
  it("rejects an unfinished rollout or duplicate environment key before account writes", () => {
    const a = cloudService();
    a.status.latestCreatedRevisionName = "pending";
    expect(() => projectRuntime("ops", a)).toThrow();
    a.status.latestCreatedRevisionName = "ops-before";
    a.spec.template.spec.containers[0]!.env.push({
      name: "DRTS_CANDIDATE_SHA",
      value: S,
    });
    expect(() => projectRuntime("ops", a)).toThrow();
  });
  it.each(["api", "admin", "fleet", "referral"] as const)(
    "rejects any %s configuration or revision change",
    (role) => {
      const before = runtime();
      const after = structuredClone(before);
      after.ops.canonicalPrincipalRef = principalId;
      after[role].configDigest = "c".repeat(64);
      expect(() =>
        validateConfigurationChange(before, after, S, principalId),
      ).toThrow();
    },
  );
  it("rejects a changed Ops image or material config and a foreign principal reference", () => {
    const before = runtime();
    const after = structuredClone(before);
    after.ops.canonicalPrincipalRef = principalId;
    validateConfigurationChange(before, after, S, principalId);
    after.ops.image = "another-image";
    expect(() =>
      validateConfigurationChange(before, after, S, principalId),
    ).toThrow();
    after.ops.image = before.ops.image;
    after.ops.configDigest = "c".repeat(64);
    expect(() =>
      validateConfigurationChange(before, after, S, principalId),
    ).toThrow();
    after.ops.configDigest = before.ops.configDigest;
    after.ops.canonicalPrincipalRef = "other";
    expect(() =>
      validateConfigurationChange(before, after, S, principalId),
    ).toThrow();
  });
  it("reads the canonical principal field rather than treating the membership ID as a principal", () => {
    expect(existingOperator([user])).toEqual({
      membershipId,
      principalId,
      status: "invited",
    });
    expect(() =>
      existingOperator([{ ...user, canonicalPrincipalId: undefined }]),
    ).toThrow();
    expect(() =>
      validateContext({ ...context, explicitOptIn: false }),
    ).toThrow();
    validateRuntime(runtime(), S);
  });
});
