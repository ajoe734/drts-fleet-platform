import { expect, it, vi } from "vitest";
import { deepToSnakeCase } from "../../../../apps/api/src/common/snake-case.interceptor";
import { bootstrapMapSessions } from "../../../e2e/system-remediation/sr-live-map-001/session-bootstrap";

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

// External HTTP and Secret Manager boundaries only. The separate production
// session-contract probe documents why real dev issuance is currently blocked.
function harness(
  options: {
    snake?: boolean;
    healthSha?: string;
    backend?: string;
    status?: number;
    wrongScope?: boolean;
    wrongRealm?: boolean;
    expiresIn?: string;
    headerSha?: string;
  } = {},
) {
  let subject: {
    realm: string;
    actorType: string;
    actorId: string;
    scopes: string[];
  };
  const readInternalKey = vi.fn(() => "internal-test-secret");
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
    if (url.pathname === "/api/auth/token") {
      const headers = new Headers(init?.headers);
      expect(headers.get("x-drts-internal-key")).toBe("internal-test-secret");
      expect(init?.body).toBe("{}");
      subject = {
        realm: headers.get("x-realm")!,
        actorType: headers.get("x-actor-type")!,
        actorId: headers.get("x-actor-id")!,
        scopes: headers.get("x-scopes")!.split(","),
      };
      expect(subject).toEqual(
        subject.realm === "driver"
          ? {
              realm: "driver",
              actorType: "driver_user",
              actorId: "drv-demo-002",
              scopes: ["driver:read"],
            }
          : {
              realm: "ops",
              actorType: "ops_user",
              actorId: "live-map-observer",
              scopes: ["regulatory:read"],
            },
      );
      expect(mask).toHaveBeenCalledWith("internal-test-secret");
      return reply({
        token: `${subject.realm}-test-secret`,
        expiresIn: options.expiresIn ?? "8h",
      });
    }
    if (url.pathname === "/api/auth/session") {
      expect(mask).toHaveBeenCalledWith(`${subject.realm}-test-secret`);
      expect(new Headers(init?.headers).get("authorization")).toBe(
        `Bearer ${subject.realm}-test-secret`,
      );
      return reply(
        {
          data: {
            active: true,
            identity: {
              ...subject,
              ...(options.wrongScope ? { scopes: ["*"] } : {}),
              ...(options.wrongRealm ? { realm: "system" } : {}),
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
    readInternalKey,
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
    expect(deps.fetch).toHaveBeenCalledTimes(5);
    expect(deps.exportSession.mock.calls).toEqual([
      ["DRTS_LIVE_MAP_DRIVER_SESSION_TOKEN", "driver-test-secret"],
      ["DRTS_LIVE_MAP_OBSERVER_SESSION_TOKEN", "ops-test-secret"],
    ]);
    expect(deps.evidence.sessions).toMatchObject({
      status: "passed",
      candidate_sha: sha,
    });
    expect(JSON.stringify(deps.evidence)).not.toContain("test-secret");
  },
);

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
  expect(deps.readInternalKey).not.toHaveBeenCalled();
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
  expect(deps.readInternalKey).not.toHaveBeenCalled();
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
  deps.readInternalKey.mockImplementation(() => {
    throw new Error("internal-test-secret");
  });
  await expect(bootstrapMapSessions(env, deps)).rejects.toThrow(
    "Map session bootstrap failed at internal-key; no credential details retained",
  );
  expect(JSON.stringify(deps.evidence)).not.toContain("test-secret");
});
