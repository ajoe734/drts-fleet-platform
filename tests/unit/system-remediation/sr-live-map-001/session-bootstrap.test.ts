import { expect, it, vi } from "vitest";
import { deepToSnakeCase } from "../../../../apps/api/src/common/snake-case.interceptor";
import { OpsDispatchEventsService } from "../../../../apps/api/src/common/ops-dispatch-events.service";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { DriverProfileService } from "../../../../apps/api/src/modules/driver-profile/driver-profile.service";
import { RegulatoryRegistryController } from "../../../../apps/api/src/modules/regulatory-registry/regulatory-registry.controller";
import { RegulatoryRegistryService } from "../../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { bootstrapMapSessions } from "../../../e2e/system-remediation/sr-live-map-001/session-bootstrap";
import { teardownMapSessions } from "../../../e2e/system-remediation/sr-live-map-001/session-teardown";

const sha = "a".repeat(40);
const env = {
  GITHUB_ACTIONS: "true",
  RUNNER_ENVIRONMENT: "github-hosted",
  DRTS_CANDIDATE_SHA: sha,
  WORKFLOW_SHA: sha,
  DRTS_LIVE_MAP_TEST_AUTHORIZED: "true",
  DRTS_LIVE_MAP_TEST_ORIGIN: "https://ops.example.test",
  DRTS_LIVE_MAP_API_ORIGIN: "https://api.example.test",
  DRTS_LIVE_MAP_ALLOWED_TARGETS:
    "https://ops.example.test,https://api.example.test,https://maps.googleapis.com",
  DRTS_LIVE_MAP_TEST_DRIVER_ID: "drv-demo-002",
};

// External HTTP and Google assertion boundaries only. The separate production
// session-contract probe verifies the real issuance and revocation contracts.
function harness(
  options: {
    snake?: boolean;
    healthSha?: string;
    backend?: string;
    status?: number;
    wrongScope?: boolean;
    onDuty?: boolean;
    wrongRealm?: boolean;
    expiresIn?: string;
    headerSha?: string;
    registry?: unknown;
  } = {},
) {
  const readGoogleIdToken = vi.fn(() => "google-id-token");
  const mask = vi.fn();
  const exportSession = vi.fn();
  const evidence: Record<string, unknown> = {};
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    expect(init?.redirect).toBe("error");
    const url = new URL(String(input));
    expect(url.origin).toBe(env.DRTS_LIVE_MAP_API_ORIGIN);
    const reply = (value: unknown, status = 200) =>
      Response.json(options.snake ? deepToSnakeCase(value) : value, {
        status,
        headers: { "x-drts-candidate-sha": options.headerSha ?? sha },
      });
    if (url.pathname === "/api/health")
      return reply({
        candidateSha: options.healthSha ?? sha,
        mapProvider: { effectiveBackend: options.backend ?? "google" },
      });
    if (url.pathname === "/api/regulatory-registry/drivers")
      return reply(
        "registry" in options
          ? options.registry
          : {
              data: {
                items: [
                  {
                    driverId: "drv-demo-002",
                    workState: options.onDuty ? "available" : "offline",
                    dispatchEligible: Boolean(options.onDuty),
                  },
                ],
              },
            },
      );
    if (url.pathname === "/api/auth/token") {
      const headers = new Headers(init?.headers);
      const realm = headers.get("x-realm")!;
      const actorType = headers.get("x-actor-type")!;

      expect(headers.get("x-drts-google-id-token")).toBe("google-id-token");
      expect(headers.has("x-drts-internal-key")).toBe(false);
      expect(init?.body).toBe("{}");
      const actorId = headers.get("x-actor-id")!;
      const scopes = headers.get("x-scopes");

      if (actorType === "system") {
        expect(realm).toBe("system");
        expect(actorId).toBe("dev-live-map");
        expect(scopes).toBeNull();
        return reply({
          token: "temp-ops-test-secret",
          expiresIn: "15m",
        });
      }

      expect(realm).toBe("ops");
      expect(actorType).toBe("ops_observer");
      expect(actorId).toBe("live-map-observer");
      expect(scopes).toBeNull();

      expect(mask).toHaveBeenCalledWith("google-id-token");
      return reply({
        token: "ops-test-secret",
        expiresIn: options.expiresIn ?? "8h",
      });
    }

    if (url.pathname === "/api/auth/driver/device/invite") {
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe("Bearer temp-ops-test-secret");
      const body = JSON.parse(String(init?.body));
      expect(body.driverId).toBe("drv-demo-002");
      return reply({
        data: { registrationCode: "test-reg-code" },
      });
    }

    if (url.pathname === "/api/auth/driver/device/register") {
      const body = JSON.parse(String(init?.body));
      expect(body.registrationCode).toBe("test-reg-code");
      expect(typeof body.deviceId).toBe("string");
      return reply({
        data: {
          accessToken: "driver-test-secret",
          expiresIn: options.expiresIn ?? "15m",
        },
      });
    }

    if (url.pathname === "/api/auth/session") {
      const auth = new Headers(init?.headers).get("authorization");
      if (auth === "Bearer temp-ops-test-secret")
        return reply({
          data: {
            active: true,
            identity: {
              realm: "system",
              actorType: "system",
              actorId: "dev-live-map",
              scopes: ["driver:provision"],
              driverProvisioningDriverId: "drv-demo-002",
            },
          },
        });
      expect(auth).toMatch(/^Bearer (ops-test-secret|driver-test-secret)$/);
      const isDriver = auth === "Bearer driver-test-secret";
      expect(mask).toHaveBeenCalledWith(
        isDriver ? "driver-test-secret" : "ops-test-secret",
      );

      return reply(
        {
          data: {
            active: true,
            identity: {
              realm: isDriver
                ? options.wrongRealm
                  ? "system"
                  : "driver"
                : options.wrongRealm
                  ? "system"
                  : "ops",
              actorType: isDriver ? "driver_user" : "ops_observer",
              actorId: isDriver ? "drv-demo-002" : "live-map-observer",
              scopes: options.wrongScope
                ? ["*"]
                : isDriver
                  ? ["driver:read", "driver:write", "dispatch:read"]
                  : ["regulatory:read"],
            },
          },
        },
        options.status,
      );
    }
    throw new Error("Unexpected HTTP call");
  });
  return {
    fetch,
    readGoogleIdToken,
    mask,
    exportSession,
    save: (name: string, value: unknown) => {
      evidence[name] = structuredClone(value);
    },
    evidence,
  };
}

it.each([true, false])(
  "mints and verifies both least-scope sessions with snake serialization=%s",
  async (snake) => {
    const deps = harness({ snake });
    await bootstrapMapSessions(env, deps);
    expect(deps.fetch).toHaveBeenCalledTimes(9);
    expect(deps.exportSession.mock.calls).toEqual([
      ["DRTS_LIVE_MAP_PROVISIONER_SESSION_TOKEN", "temp-ops-test-secret"],
      ["DRTS_LIVE_MAP_INVITATION_ATTEMPTED", "true"],
      ["DRTS_LIVE_MAP_INVITE_CODE", "test-reg-code"],
      ["DRTS_LIVE_MAP_OBSERVER_SESSION_TOKEN", "ops-test-secret"],
      ["DRTS_LIVE_MAP_DRIVER_SESSION_TOKEN", "driver-test-secret"],
      ["DRTS_LIVE_MAP_DRIVER_DEVICE_ID", expect.any(String)],
    ]);
    expect(deps.evidence.sessions).toMatchObject({
      status: "passed",
      candidate_sha: sha,
    });
    expect(JSON.stringify(deps.evidence)).not.toContain("test-secret");
  },
);

it("binds every bootstrap response to the explicitly requested runtime, retaining the test candidate", async () => {
  const deployedSha = "b".repeat(40);
  const deps = harness({
    healthSha: deployedSha,
    headerSha: deployedSha,
    snake: true,
  });
  await bootstrapMapSessions(
    { ...env, DRTS_LIVE_MAP_EXPECTED_DEPLOYED_SHA: deployedSha },
    deps,
  );
  expect(deps.fetch).toHaveBeenCalledTimes(9);
  expect(deps.evidence.sessions).toMatchObject({
    status: "passed",
    candidate_sha: sha,
    deployed_sha: deployedSha,
  });
  expect(deps.evidence.deployment).toMatchObject({
    status: "passed",
    candidate_sha: sha,
    deployed_sha: deployedSha,
  });
});

it.each([
  { DRTS_LIVE_MAP_TEST_AUTHORIZED: "false" },
  { RUNNER_ENVIRONMENT: "self-hosted" },
  { DRTS_LIVE_MAP_API_ORIGIN: "https://not-allowed.example.test" },
  { WORKFLOW_SHA: "b".repeat(40) },
  { DRTS_LIVE_MAP_TEST_DRIVER_ID: "drv-demo-001" },
])("rejects gate %j before secret access and HTTP", async (override) => {
  const deps = harness();
  await expect(
    bootstrapMapSessions({ ...env, ...override }, deps),
  ).rejects.toThrow();
  expect(deps.fetch).not.toHaveBeenCalled();
  expect(deps.readGoogleIdToken).not.toHaveBeenCalled();
});

it.each([
  { healthSha: "b".repeat(40) },
  { healthSha: "" },
  { headerSha: "b".repeat(40) },
  { backend: "mock" },
])("rejects runtime %j before secret access or issuance", async (options) => {
  const deps = harness(options);
  // A stale static repository value cannot authorize a foreign deployment.
  await expect(
    bootstrapMapSessions(
      { ...env, DRTS_LIVE_MAP_DEPLOYED_SHA: options.healthSha },
      deps,
    ),
  ).rejects.toThrow(/health/);
  expect(deps.fetch).toHaveBeenCalledTimes(1);
  expect(deps.readGoogleIdToken).not.toHaveBeenCalled();
  expect(deps.evidence.deployment).toMatchObject({ status: "failed" });
});

it.each([
  { status: 401 },
  { wrongScope: true },
  { wrongRealm: true },
  { expiresIn: "365d" },
])(
  "rejects unusable session %j with masked tokens and no exports",
  async (options) => {
    const deps = harness(options);
    await expect(bootstrapMapSessions(env, deps)).rejects.toThrow(
      /bootstrap failed/,
    );
    expect(deps.exportSession).not.toHaveBeenCalled();
    expect(deps.evidence.sessions).toMatchObject({ status: "failed" });
    expect(JSON.stringify(deps.evidence)).not.toContain("test-secret");
  },
);

it("does not expose raw provider errors containing credentials", async () => {
  const deps = harness();
  deps.readGoogleIdToken.mockImplementation(() => {
    throw new Error("google-id-token-secret");
  });
  await expect(bootstrapMapSessions(env, deps)).rejects.toThrow(
    "Map session bootstrap failed at google-workload-identity; no credential details retained",
  );
  expect(JSON.stringify(deps.evidence)).not.toContain("test-secret");
});

it("rejects an on-duty driver before invitation or binding mutation", async () => {
  const deps = harness({ onDuty: true });
  await expect(bootstrapMapSessions(env, deps)).rejects.toThrow(
    "driver:isolation",
  );
  expect(deps.readGoogleIdToken).toHaveBeenCalledTimes(1);
  expect(
    deps.fetch.mock.calls.every(([url]) => !String(url).includes("device/")),
  ).toBe(true);
});

it.each([
  {
    row: null,
    failure: "driver_missing",
    workState: "missing",
    eligible: "missing",
  },
  {
    row: { workState: "available", dispatchEligible: true },
    failure: "work_state_not_offline,dispatch_eligible",
    workState: "available",
    eligible: true,
  },
  {
    row: { workState: "offline", dispatchEligible: true },
    failure: "dispatch_eligible",
    workState: "offline",
    eligible: true,
  },
  {
    row: { dispatchEligible: false },
    failure: "work_state_missing",
    workState: "missing",
    eligible: false,
  },
  {
    row: { workState: "offline" },
    failure: "dispatch_eligible_missing",
    workState: "offline",
    eligible: "missing",
  },
  {
    row: {
      workState: "private-secret-body",
      dispatchEligible: "private-secret-body",
    },
    failure: "work_state_invalid,dispatch_eligible_invalid",
    workState: "invalid",
    eligible: "invalid",
  },
])(
  "records bounded isolation diagnostics without provisioning: $failure",
  async ({ row, failure, workState, eligible }) => {
    const deps = harness({
      snake: true,
      registry: {
        data: {
          items: row
            ? [
                {
                  driverId: env.DRTS_LIVE_MAP_TEST_DRIVER_ID,
                  name: "private-secret-name",
                  ...row,
                },
              ]
            : [],
        },
      },
    });
    await expect(bootstrapMapSessions(env, deps)).rejects.toThrow(
      `Driver isolation failed: ${failure}; workState=${workState}; dispatchEligible=${eligible}`,
    );
    expect(deps.evidence.sessions).toMatchObject({
      status: "failed",
      stage: "driver:isolation",
      cleanup: "not-required",
      driver_isolation: {
        driver_id: env.DRTS_LIVE_MAP_TEST_DRIVER_ID,
        status: "failed",
        found: row !== null,
        work_state: workState,
        dispatch_eligible: eligible,
        failures: failure.split(","),
      },
    });
    expect(deps.readGoogleIdToken).toHaveBeenCalledTimes(1);
    expect(deps.exportSession).not.toHaveBeenCalled();
    expect(
      deps.fetch.mock.calls.every(([url]) => !String(url).includes("device/")),
    ).toBe(true);
    expect(JSON.stringify(deps.evidence)).not.toContain("private-secret");
  },
);

it.each([null, {}, { data: { items: "private-secret-body" } }])(
  "reports a malformed registry envelope without dumping the response",
  async (registry) => {
    const deps = harness({ registry });
    await expect(bootstrapMapSessions(env, deps)).rejects.toThrow(
      "registry_shape_invalid",
    );
    expect(deps.evidence.sessions).toMatchObject({
      driver_isolation: { failures: ["registry_shape_invalid"] },
    });
    expect(deps.exportSession).not.toHaveBeenCalled();
    expect(JSON.stringify(deps.evidence)).not.toContain("private-secret");
  },
);

it.each([false, true])(
  "uses the actual registry controller/seed and production serializer, snake=%s",
  async (snake) => {
    const emit = vi.fn();
    const audit = new AuditNotificationService();
    const registry = new RegulatoryRegistryService(
      new OpsDispatchEventsService({ emit } as never),
      audit,
      new DriverProfileService(audit),
    );
    const controller = new RegulatoryRegistryController(registry);
    const deps = harness({ snake, registry: controller.listDrivers() });
    await bootstrapMapSessions(env, deps);
    expect(deps.evidence.sessions).toMatchObject({
      driver_isolation: {
        status: "passed",
        found: true,
        work_state: "offline",
        dispatch_eligible: false,
        failures: [],
      },
    });
    expect(emit).not.toHaveBeenCalled();
  },
);

it("retains invitation attempt before a lost issuance response", async () => {
  const deps = harness();
  const fetch = deps.fetch.getMockImplementation()!;
  deps.fetch.mockImplementation(async (input, init) => {
    if (String(input).endsWith("auth/driver/device/invite")) {
      expect(deps.exportSession).toHaveBeenCalledWith(
        "DRTS_LIVE_MAP_INVITATION_ATTEMPTED",
        "true",
      );
      throw new Error("private-secret-response");
    }
    return fetch(input, init);
  });
  await expect(bootstrapMapSessions(env, deps)).rejects.toThrow(
    "driver:issue-invite",
  );
  expect(deps.exportSession).toHaveBeenCalledWith(
    "DRTS_LIVE_MAP_INVITATION_ATTEMPTED",
    "true",
  );
  expect(deps.evidence.sessions).toMatchObject({ cleanup: "unconfirmed" });
  expect(JSON.stringify(deps.evidence)).not.toContain("private-secret");
});

it("rejects ambiguous duplicate reserved drivers before provisioning", async () => {
  const row = {
    driverId: env.DRTS_LIVE_MAP_TEST_DRIVER_ID,
    workState: "offline",
    dispatchEligible: false,
  };
  const deps = harness({ registry: { data: { items: [row, row] } } });
  await expect(bootstrapMapSessions(env, deps)).rejects.toThrow(
    "driver_duplicate",
  );
  expect(deps.exportSession).not.toHaveBeenCalled();
});

it("keeps a real lifecycle reactivation isolated until the existing work-state command restores offline", async () => {
  // Actual controller/service/serializer; external HTTP auth and persistence
  // are memory boundaries. This is not evidence of the current dev DB state.
  const emit = vi.fn();
  const audit = new AuditNotificationService();
  const registry = new RegulatoryRegistryService(
    new OpsDispatchEventsService({ emit } as never),
    audit,
    new DriverProfileService(audit),
  );
  const controller = new RegulatoryRegistryController(registry);
  const driverId = env.DRTS_LIVE_MAP_TEST_DRIVER_ID;
  controller.updateDriverLifecycle(driverId, { lifecycleStatus: "active" });
  const deps = harness({ snake: true, registry: controller.listDrivers() });
  await expect(bootstrapMapSessions(env, deps)).rejects.toThrow(
    "workState=available",
  );
  expect(deps.exportSession).not.toHaveBeenCalled();

  // The hosted always() teardown must not mask the real isolation failure with
  // a fabricated cleanup failure, nor make a new HTTP/auth request.
  const fetchCount = deps.fetch.mock.calls.length;
  const teardownEvidence = vi.fn();
  await teardownMapSessions(env, { ...deps, save: teardownEvidence });
  expect(deps.fetch).toHaveBeenCalledTimes(fetchCount);
  expect(deps.readGoogleIdToken).toHaveBeenCalledTimes(1);
  expect(teardownEvidence).toHaveBeenCalledWith(
    expect.objectContaining({
      status: "passed",
      recovery: "not-required",
      revoked: false,
    }),
  );

  const restored = controller.updateDriverWorkState(driverId, {
    workState: "offline",
  });
  expect(restored.data).toMatchObject({
    workState: "offline",
    dispatchEligible: false,
  });
  const isolated = harness({ snake: true, registry: controller.listDrivers() });
  await bootstrapMapSessions(env, isolated);
  expect(isolated.evidence.sessions).toMatchObject({
    driver_isolation: {
      status: "passed",
      work_state: "offline",
      dispatch_eligible: false,
    },
  });
  expect(emit).not.toHaveBeenCalled();
});
