import { describe, expect, it, vi } from "vitest";
import { runCoverage } from "../../../e2e/system-remediation/sr-live-map-001/coverage-runner";
import { assertAllowedUrl, validateCoverageInputs, validateLiveMapGate } from "../../../e2e/system-remediation/sr-live-map-001/live-map-config";
import { baselineService, expectedServiceDecision, SERVICE_CASES } from "../../../e2e/system-remediation/sr-live-map-001/service-area-cases";

const env = {
  GITHUB_ACTIONS: "true", RUNNER_ENVIRONMENT: "github-hosted",
  DRTS_CANDIDATE_SHA: "a".repeat(40), WORKFLOW_SHA: "a".repeat(40),
  DRTS_LIVE_MAP_TEST_AUTHORIZED: "true",
  DRTS_LIVE_MAP_ALLOWED_TARGETS: "https://ops.example.test,https://api.example.test,https://maps.googleapis.com",
  DRTS_LIVE_MAP_TEST_ORIGIN: "https://ops.example.test",
  DRTS_LIVE_MAP_API_ORIGIN: "https://api.example.test",
  DRTS_LIVE_MAP_TEST_DRIVER_ID: "live-map-isolated",
  DRTS_LIVE_MAP_DRIVER_SESSION_TOKEN: "test-driver-secret",
  DRTS_LIVE_MAP_OBSERVER_SESSION_TOKEN: "test-observer-secret",
  GOOGLE_MAPS_GEOCODING_API_KEY: "test-google-secret",
};

describe("live map authorization boundary", () => {
  it("accepts an explicit hosted candidate and allowlisted targets", () => {
    expect(validateCoverageInputs(env).driverId).toBe("live-map-isolated");
  });
  it.each([
    ["DRTS_LIVE_MAP_TEST_AUTHORIZED", undefined], ["DRTS_LIVE_MAP_TEST_AUTHORIZED", " true "],
    ["GITHUB_ACTIONS", "false"], ["RUNNER_ENVIRONMENT", "self-hosted"],
    ["WORKFLOW_SHA", "b".repeat(40)], ["DRTS_CANDIDATE_SHA", "a"],
    ["DRTS_LIVE_MAP_API_ORIGIN", "https://elsewhere.test"],
    ["DRTS_LIVE_MAP_TEST_ORIGIN", "https://elsewhere.test"],
    ["DRTS_LIVE_MAP_TEST_ORIGIN", "https://user:secret@ops.example.test"],
    ["DRTS_LIVE_MAP_API_ORIGIN", "https://api.example.test/api"],
    ["DRTS_LIVE_MAP_ALLOWED_TARGETS", "https://ops.example.test,https://api.example.test"],
    ["DRTS_LIVE_MAP_DRIVER_SESSION_TOKEN", ""], ["DRTS_LIVE_MAP_OBSERVER_SESSION_TOKEN", ""],
    ["DRTS_LIVE_MAP_TEST_DRIVER_ID", "real-duty-driver"],
  ])("rejects %s=%s before making requests", async (key, value) => {
    const fetch = vi.fn();
    await expect(runCoverage({ ...env, [key!]: value }, { fetch, now: Date.now, sleep: vi.fn(), save: vi.fn() })).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("browser gate has no legacy ungated baseURL fallback", () => {
    expect(() => validateLiveMapGate({ LIVE_GOOGLE_MAP_BASE_URL: env.DRTS_LIVE_MAP_TEST_ORIGIN })).toThrow();
    expect(() => assertAllowedUrl("https://ops.example.test.evil.test/x", [env.DRTS_LIVE_MAP_TEST_ORIGIN])).toThrow();
  });
});

// Only HTTP/time boundaries are simulated below. No test starts Nest, a server,
// Chromium or any live call. Production service-area evaluation is not mocked.
function harness(options: { realm?: string; actor?: string; workState?: string; wrongDecision?: boolean; locationState?: string } = {}) {
  const service = baselineService();
  let clock = Date.parse("2026-09-30T05:00:00Z");
  let current: { eventId: string; recordedAt: string; accuracyM: number; [key: string]: unknown } | null = null;
  let receivedAt = "";
  const snapshots: unknown[] = [];
  const writes: Array<Record<string, unknown>> = [];
  const points = [
    { lat: 25.0347, lng: 121.5218 }, { lat: 25.0797, lng: 121.2342 },
    { lat: 24.8017, lng: 120.9717 }, { lat: 24.8017, lng: 120.9717 },
    { lat: 25.0478, lng: 121.517 },
  ];
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    expect(init?.redirect).toBe("error");
    const url = new URL(String(input));
    const reply = (data: unknown) => Response.json({ data });
    if (url.origin === "https://maps.googleapis.com") {
      const index = SERVICE_CASES.findIndex((scenario) => scenario.address === url.searchParams.get("address"));
      return Response.json({ status: "OK", results: [{ geometry: { location: points[index] }, formatted_address: "Public landmark address" }] });
    }
    if (url.pathname.endsWith("auth/session")) return reply({ active: true, identity: { realm: options.realm ?? "driver", actorType: "driver_user", actorId: options.actor ?? env.DRTS_LIVE_MAP_TEST_DRIVER_ID } });
    if (url.pathname.endsWith("regulatory-registry/drivers")) return reply({ items: [{ driverId: env.DRTS_LIVE_MAP_TEST_DRIVER_ID, workState: options.workState ?? "offline", dispatchEligible: false }] });
    if (url.pathname.endsWith("driver/tasks")) return reply({ items: [] });
    if (url.pathname.endsWith("service-area/evaluate")) {
      const result = service.evaluate(JSON.parse(String(init?.body)));
      return reply(options.wrongDecision ? { ...result, decision: "manual_review" } : result);
    }
    if (url.pathname.endsWith("location-heartbeats/batch")) {
      const item = JSON.parse(String(init?.body)).items[0];
      expect(item.recordedAt).toBe(new Date(clock).toISOString());
      expect(item.workState).toBe("offline");
      writes.push(item);
      current = item;
      receivedAt = new Date(clock).toISOString();
      return reply({ items: [{ eventId: item.eventId, accepted: true, duplicate: false, currentLocationUpdated: true, serverReceivedAt: receivedAt }] });
    }
    if (url.pathname.endsWith("tracking-status")) return reply({
      driverId: env.DRTS_LIVE_MAP_TEST_DRIVER_ID,
      locationFreshness: !current ? "missing" : options.locationState ?? (clock - Date.parse(receivedAt) > 90_000 ? "stale" : current.accuracyM > 100 ? "low_accuracy" : "fresh"),
      currentLocation: current ? { ...current, updatedAt: receivedAt } : null,
      currentTaskId: null, currentVehicleId: null, trackingState: current ? "offline" : null,
      lastEventId: current?.eventId ?? null,
    });
    throw new Error(`Unexpected fake HTTP boundary: ${url.pathname}`);
  });
  const deps = { fetch, now: () => clock, sleep: vi.fn(async (ms: number) => { clock += ms; }), save: (evidence: unknown) => snapshots.push(structuredClone(evidence)) };
  return { deps, snapshots, writes };
}

describe("C114 coverage orchestration", () => {
  it("derives all intended decisions from the real evaluator and V0049", () => {
    const service = baselineService();
    expect(() => expectedServiceDecision(service, SERVICE_CASES[0]!, { lat: 25.0478, lng: 121.517 })).toThrow(/geocode does not cover/);
    expect(() => expectedServiceDecision(service, SERVICE_CASES[1]!, { lat: 24.8, lng: 120.97 })).toThrow();
  });
  it("records all live boundary results, waits >90s, and restores fresh accurate offline telemetry", async () => {
    const { deps, writes } = harness();
    const result = await runCoverage(env, deps);
    expect(result.status).toBe("passed");
    expect(result.service_area).toHaveLength(5);
    expect(result.location).toHaveLength(4);
    expect(deps.sleep.mock.calls.reduce((total, [ms]) => total + ms, 0)).toBe(95_000);
    expect(writes.map((item) => item.accuracyM)).toEqual([10, 150, 10]);
    const serialized = JSON.stringify(result);
    for (const secret of [env.DRTS_LIVE_MAP_DRIVER_SESSION_TOKEN, env.DRTS_LIVE_MAP_OBSERVER_SESSION_TOKEN, env.GOOGLE_MAPS_GEOCODING_API_KEY]) expect(serialized).not.toContain(secret);
  });
  it.each([{ realm: "system" }, { actor: "live-map-other" }, { workState: "available" }])("does not write or bill Google when isolation fails: %j", async (options) => {
    const { deps, writes } = harness(options);
    await expect(runCoverage(env, deps)).rejects.toThrow();
    expect(writes).toEqual([]);
    expect(deps.fetch.mock.calls.every(([url]) => !String(url).includes("googleapis"))).toBe(true);
  });
  it("a product decision mismatch fails and preserves actual and expected evidence", async () => {
    const { deps, snapshots, writes } = harness({ wrongDecision: true });
    await expect(runCoverage(env, deps)).rejects.toThrow();
    expect(writes).toEqual([]);
    expect(snapshots.at(-1)).toMatchObject({ status: "failed", service_area: [{ actual: { decision: "manual_review" }, expected: { decision: "serviceable" } }] });
  });
  it("an incorrect observed freshness fails instead of becoming a partial pass", async () => {
    const { deps, snapshots } = harness({ locationState: "missing" });
    await expect(runCoverage(env, deps)).rejects.toThrow();
    expect(snapshots.at(-1)).toMatchObject({ status: "failed" });
  });
});
