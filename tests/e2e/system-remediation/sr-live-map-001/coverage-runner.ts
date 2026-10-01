import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  DriverLocationHeartbeatBatchResponse,
  DriverRegistryRecord,
  DriverTrackingStatus,
  GeoPoint,
  ServiceAreaEvaluationResult,
} from "@drts/contracts";
import {
  assertAllowedUrl,
  validateCoverageInputs,
  writeEvidence,
  type LiveEnv,
} from "./live-map-config";
import { verifyLiveDeployment } from "./deployment-check";
import { MAP_DRIVER_SCOPES, MAP_OBSERVER_ID } from "./session-bootstrap";
import { normalizeApiResponse } from "./wire-response";
import {
  baselineService,
  decisionProjection,
  expectedServiceDecision,
  SERVICE_CASES,
} from "./service-area-cases";

type Evidence = {
  candidate_sha: string;
  deployed_sha: string;
  status: "failed" | "passed";
  deployment?: unknown;
  started_at: string;
  api_origin: string;
  service_area: unknown[];
  location: unknown[];
  stage: string;
  failure?: string;
};
type Deps = {
  fetch: typeof fetch;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  save: (evidence: Evidence) => void;
};

export async function runCoverage(env: LiveEnv, deps: Deps) {
  // Validate everything before any network, including credential presence.
  const config = validateCoverageInputs(env);
  const evidence: Evidence = {
    candidate_sha: config.candidateSha,
    deployed_sha: "",
    status: "failed",
    started_at: new Date(deps.now()).toISOString(),
    api_origin: config.apiOrigin,
    service_area: [],
    location: [],
    stage: "deployment-health",
  };
  const request = async <T>(
    url: string,
    init: RequestInit = {},
  ): Promise<T> => {
    assertAllowedUrl(url, config.allowedTargets);
    let response: Response;
    try {
      response = await deps.fetch(url, {
        ...init,
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new Error(
        "Live map HTTP request failed (URL and credentials withheld)",
      );
    }
    assert(response.ok, `Live map HTTP status ${response.status}`);
    if (new URL(url).origin === config.apiOrigin) {
      assert.equal(
        response.headers.get("x-drts-candidate-sha"),
        config.deployedSha,
        "API deployment SHA drift",
      );
    }
    return (await response.json()) as T;
  };
  const api = async <T>(
    path: string,
    token: string,
    body?: unknown,
  ): Promise<T> => {
    const raw = await request<unknown>(`${config.apiOrigin}/api/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = normalizeApiResponse(raw) as { data: T };
    assert(result.data !== undefined, "API success envelope required");
    return result.data;
  };
  const tracking = () =>
    api<DriverTrackingStatus>(
      `driver/tracking-status?driverId=${encodeURIComponent(config.driverId)}`,
      config.driverToken,
    );
  const checkIsolation = async () => {
    const { items } = await api<{ items: DriverRegistryRecord[] }>(
      "regulatory-registry/drivers",
      config.observerToken,
    );
    const driver = items.find((item) => item.driverId === config.driverId);
    assert(
      driver &&
        driver.workState === "offline" &&
        driver.dispatchEligible === false,
      "Dedicated test driver must be offline and non-dispatchable",
    );
    const tasks = await api<{ items: unknown[] }>(
      "driver/tasks",
      config.driverToken,
    );
    assert.deepEqual(
      tasks.items,
      [],
      "Dedicated test driver must have no tasks",
    );
    const state = await tracking();
    assert.equal(state.driverId, config.driverId);
    assert.equal(state.currentTaskId, null);
    assert.equal(state.currentVehicleId, null);
    assert(
      state.trackingState === null || state.trackingState === "offline",
      "Driver must not be on duty",
    );
  };
  try {
    const deployment = await verifyLiveDeployment(env, deps.fetch, (health) => {
      evidence.deployment = health;
      deps.save(evidence);
    });
    evidence.deployed_sha = deployment.deployed_sha;
    evidence.stage = "driver-session-and-isolation";
    const observer = await api<{
      active: boolean;
      identity: {
        realm: string;
        actorId: string;
        actorType: string;
        scopes: string[];
      };
    }>("auth/session", config.observerToken);
    assert(
      observer.active &&
        observer.identity.realm === "ops" &&
        observer.identity.actorType === "ops_observer",
    );
    assert.equal(observer.identity.actorId, MAP_OBSERVER_ID);
    assert.deepEqual(observer.identity.scopes, ["regulatory:read"]);
    const session = await api<{
      active: boolean;
      identity: {
        realm: string;
        actorId: string;
        actorType: string;
        scopes: string[];
      };
    }>("auth/session", config.driverToken);
    assert(
      session.active &&
        session.identity.realm === "driver" &&
        session.identity.actorType === "driver_user",
      "A real driver realm session is required",
    );
    assert.equal(
      session.identity.actorId,
      config.driverId,
      "Driver session subject mismatch",
    );
    assert.deepEqual([...session.identity.scopes].sort(), MAP_DRIVER_SCOPES);
    await checkIsolation();

    const service = baselineService();
    const geocodes = new Map<
      string,
      { point: GeoPoint; formattedAddress: string }
    >();
    for (const scenario of SERVICE_CASES) {
      evidence.stage = `service-area:${scenario.id}`;
      let geocode = geocodes.get(scenario.address);
      if (!geocode) {
        const url = new URL(
          "https://maps.googleapis.com/maps/api/geocode/json",
        );
        url.search = new URLSearchParams({
          address: scenario.address,
          language: "zh-TW",
          region: "tw",
          key: config.geocodingKey,
        }).toString();
        const payload = await request<{
          status: string;
          results: Array<{
            geometry: { location: GeoPoint };
            formatted_address: string;
          }>;
        }>(url.toString());
        assert.equal(
          payload.status,
          "OK",
          "Real Google geocoding must succeed",
        );
        assert(payload.results.length > 0, "Geocoding returned no result");
        geocode = {
          point: payload.results[0]!.geometry.location,
          formattedAddress: payload.results[0]!.formatted_address,
        };
        geocodes.set(scenario.address, geocode);
      }
      const expected = expectedServiceDecision(
        service,
        scenario,
        geocode.point,
      );
      const actual = await api<ServiceAreaEvaluationResult>(
        "service-area/evaluate",
        config.driverToken,
        {
          serviceProductType: scenario.product,
          pickup: geocode.point,
        },
      );
      evidence.service_area.push({
        case: scenario.id,
        address: scenario.address,
        ...geocode,
        basis: scenario.basis,
        expected,
        actual,
      });
      deps.save(evidence);
      assert.deepEqual(
        decisionProjection(actual),
        decisionProjection(expected),
        `${scenario.id}: live decision differs from V0049 production evaluation`,
      );
    }

    let sequence = 0;
    const deviceId = `live-map-${randomUUID()}`;
    const heartbeat = async (accuracyM: number) => {
      await checkIsolation();
      const eventId = randomUUID();
      const recordedAt = new Date(deps.now()).toISOString(); // Never backdate.
      const ack = await api<DriverLocationHeartbeatBatchResponse>(
        "driver/location-heartbeats/batch",
        config.driverToken,
        {
          items: [
            {
              eventId,
              deviceId,
              driverId: config.driverId,
              vehicleId: null,
              taskId: null,
              sequenceNo: ++sequence,
              recordedAt,
              lat: 25.0347,
              lng: 121.5218,
              accuracyM,
              workState: "offline",
              appState: "foreground",
              transportMode: "foreground",
              networkType: "wifi",
            },
          ],
        },
      );
      assert.equal(ack.items.length, 1);
      assert.equal(ack.items[0]?.eventId, eventId);
      assert.equal(ack.items[0]?.accepted, true);
      assert.equal(ack.items[0]?.duplicate, false);
      assert.equal(
        ack.items[0]?.currentLocationUpdated,
        true,
        "Heartbeat must update live location",
      );
      return { eventId, recordedAt, accuracyM, ack };
    };
    const observe = async (
      kind: "fresh" | "stale" | "low_accuracy",
      sent: Awaited<ReturnType<typeof heartbeat>>,
      waitedMs = 0,
    ) => {
      const actual = await tracking();
      evidence.location.push({
        case: kind,
        sent,
        observed_at: new Date(deps.now()).toISOString(),
        waited_ms: waitedMs,
        actual,
      });
      deps.save(evidence);
      assert.equal(actual.driverId, config.driverId);
      assert.equal(
        actual.lastEventId,
        sent.eventId,
        "Another writer changed isolated driver telemetry",
      );
      assert.equal(actual.currentLocation?.recordedAt, sent.recordedAt);
      assert.equal(actual.currentLocation?.accuracyM, sent.accuracyM);
      assert.equal(actual.locationFreshness, kind);
      assert.equal(actual.trackingState, "offline");
      assert.equal(actual.currentTaskId, null);
      assert.equal(actual.currentVehicleId, null);
    };
    const fresh = await heartbeat(10);
    evidence.stage = "location:fresh";
    await observe("fresh", fresh);
    const waitStarted = deps.now();
    // Tracking freshness uses server updatedAt, so wait after the acknowledged
    // upload. Split into bounded sleeps; no forged timestamps or clock override.
    while (deps.now() - waitStarted < 95_000) {
      await deps.sleep(Math.min(30_000, 95_000 - (deps.now() - waitStarted)));
    }
    evidence.stage = "location:stale";
    await observe("stale", fresh, deps.now() - waitStarted);
    try {
      evidence.stage = "location:low-accuracy";
      const inaccurate = await heartbeat(150);
      await observe("low_accuracy", inaccurate);
    } finally {
      // Restore a fresh accurate sample even when the low-accuracy assertion
      // fails. Driver remains offline; never change work state or issue alerts.
      const restored = await heartbeat(10);
      await observe("fresh", restored);
    }
    evidence.status = "passed";
    evidence.stage = "complete";
  } catch {
    // Do not serialize assertion actual/expected or provider errors: session
    // identities and provider errors may contain credentials or personal data.
    evidence.failure = `Live coverage failed at ${evidence.stage}; inspect recorded case evidence`;
    throw new Error(evidence.failure);
  } finally {
    deps.save(evidence);
  }
  return evidence;
}

async function main() {
  // A preflight mode is used before the old billed provider smoke and Chromium.
  if (process.argv.includes("--preflight")) {
    validateCoverageInputs(process.env);
    baselineService();
    console.log("Live map preflight passed");
    return;
  }
  await runCoverage(process.env, {
    fetch,
    now: Date.now,
    sleep: (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms)),
    save: (evidence) =>
      writeEvidence(
        ".artifacts/live-map-acceptance/evidence-coverage.json",
        evidence,
      ),
  });
  console.log("Live service-area and location coverage passed");
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "Live map coverage failed",
    );
    process.exitCode = 1;
  });
}
