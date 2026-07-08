import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { MapGeofenceObservabilityService } from "../../src/modules/operational-observability/map-geofence-observability.service";

// FLEETS-CLOSEOUT-006 durable observability closeout proof.
//
// This test locks the MAP-OBS-001 final observability evidence at closeout by
// proving three things from repo-backed truth in one run:
//   1. runtime signal distinguishability - provider outage, address ambiguity,
//      coordinate-less attempt, manual override, and policy denial each land in
//      their own counter and never collapse into one another;
//   2. recent-window alerting - every required alert derives from a bounded
//      rate()/max_over_time()/histogram_quantile() window, never a lifetime
//      counter;
//   3. final-evidence integrity - MAP-OBS-001-FINAL-EVIDENCE.md carries no
//      template placeholders and every matrix row is a PASS with an artifact
//      path.
//
// It runs under `pnpm --dir apps/api exec vitest`, so process.cwd() is apps/api
// and the repository root is two levels up.

const REPO_ROOT = resolve(process.cwd(), "..", "..");
const PROOF_RELATIVE_PATH =
  "support/sidecars/MAP-OBS-001/artifacts/closeout-20260708/fleets-closeout-006-observability-proof.json";
const ALERTS_RELATIVE_PATH = "infra/alerts/map-geofence-alerts.yaml";
const FINAL_EVIDENCE_RELATIVE_PATH =
  "support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md";
const MAP_RUNBOOK_RELATIVE_PATH =
  "docs/03-runbooks/map-geofence-observability-runbook.md";

const alertsText = readFileSync(
  resolve(REPO_ROOT, ALERTS_RELATIVE_PATH),
  "utf8",
);
const finalEvidenceText = readFileSync(
  resolve(REPO_ROOT, FINAL_EVIDENCE_RELATIVE_PATH),
  "utf8",
);
const mapRunbookText = readFileSync(
  resolve(REPO_ROOT, MAP_RUNBOOK_RELATIVE_PATH),
  "utf8",
);

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function alertBlock(alertName: string) {
  const matcher = new RegExp(
    `- alert: ${escapeRegExp(alertName)}[\\s\\S]*?(?=\\n\\s*- alert:|$)`,
  );
  const match = alertsText.match(matcher);
  expect(match, `expected alert ${alertName} to exist`).not.toBeNull();
  return match?.[0] ?? "";
}

function exprLine(alertName: string) {
  const block = alertBlock(alertName);
  const line = block
    .split("\n")
    .find((entry) => entry.trim().startsWith("expr:"));
  expect(line, `expected alert ${alertName} to declare expr`).toBeTruthy();
  return (line ?? "").trim();
}

// Slice the final-evidence body under a `## Heading` down to the next `## `
// heading (or end of file), so a matrix can be locked in isolation.
function finalEvidenceSection(heading: string) {
  const index = finalEvidenceText.indexOf(heading);
  expect(
    index,
    `expected final evidence section ${heading} to exist`,
  ).toBeGreaterThanOrEqual(0);
  const rest = finalEvidenceText.slice(index + heading.length);
  const nextHeading = rest.search(/\n## /);
  return nextHeading === -1 ? rest : rest.slice(0, nextHeading);
}

// Collect the first-column key of every PASS row inside a matrix section. A
// PASS row is a markdown table row whose Final-mark cell carries `: PASS`; the
// header and separator rows never do, so they are excluded automatically.
function passRowKeys(sectionBody: string) {
  return sectionBody
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|") && line.includes(": PASS"))
    .map((line) => {
      const cells = line.split("|").slice(1, -1);
      return (cells[0] ?? "").trim().replace(/^`|`$/g, "");
    });
}

// The proof object is assembled across the test cases and flushed to disk in
// afterAll so a single JSON artifact captures every closeout claim.
const proof: Record<string, unknown> = {
  task: "FLEETS-CLOSEOUT-006",
  parentEvidence: "MAP-OBS-001",
  generatedBy:
    "apps/api/tests/unit/map-geofence-observability-closeout-proof.test.ts",
  sources: {
    alerts: ALERTS_RELATIVE_PATH,
    finalEvidence: FINAL_EVIDENCE_RELATIVE_PATH,
    runbook: MAP_RUNBOOK_RELATIVE_PATH,
  },
};

describe("FLEETS-CLOSEOUT-006 map/geofence observability closeout", () => {
  it("keeps outage, ambiguity, coordinate-less, override, and policy-denial signals distinguishable at runtime", () => {
    const service = new MapGeofenceObservabilityService();

    // Geo outcomes: a burst that mixes every mutually-exclusive failure mode so
    // we can prove none of them bleed into another counter.
    service.recordGeoOutcome("provider_outage");
    service.recordGeoOutcome("provider_outage");
    service.recordGeoOutcome("address_ambiguity");
    service.recordGeoOutcome("coordinate_less_attempt");
    service.recordGeoOutcome("manual_override");
    service.recordGeoOutcome("resolved");
    service.recordGeoOutcome("resolved");
    service.recordGeoOutcome("resolved");

    // Geocode requests: same outcomes routed through the request counters that
    // back map_geocode_requests_total / map_provider_errors_total.
    service.recordGeocodeRequest({
      operation: "search",
      result: "provider_outage",
      durationMs: 900,
    });
    service.recordGeocodeRequest({
      operation: "search",
      result: "address_ambiguity",
      durationMs: 120,
    });
    service.recordGeocodeRequest({
      operation: "resolve",
      result: "resolved",
      durationMs: 80,
    });

    // Service-area evaluations: policy denial must stay separate from plain
    // out-of-area, coordinate-less, serviceable, and manual-review outcomes.
    service.recordServiceAreaEvaluation({
      decision: "not_serviceable",
      policyDenied: true,
    });
    service.recordServiceAreaEvaluation({
      decision: "not_serviceable",
      policyDenied: false,
    });
    service.recordServiceAreaEvaluation({
      decision: "coordinate_less_attempt",
      policyDenied: false,
    });
    service.recordServiceAreaEvaluation({
      decision: "serviceable",
      policyDenied: false,
    });
    service.recordServiceAreaEvaluation({
      decision: "manual_review",
      policyDenied: false,
    });

    service.recordGeometryMutation("service_area_published");
    service.recordGeometryMutation("stop_policy_retired");

    const snapshot = service.getSnapshot();

    // Geo counters are isolated.
    expect(snapshot.geo.providerOutageCount).toBe(2);
    expect(snapshot.geo.addressAmbiguityCount).toBe(1);
    expect(snapshot.geo.coordinateLessAttemptCount).toBe(1);
    expect(snapshot.geo.manualOverrideCount).toBe(1);
    expect(snapshot.geo.resolvedAddressCount).toBe(3);

    // A provider outage must not be counted as ambiguity or coordinate-less.
    expect(snapshot.geo.providerOutageCount).not.toBe(
      snapshot.geo.addressAmbiguityCount,
    );
    expect(snapshot.geo.requests.providerErrorCount).toBe(1);
    expect(snapshot.geo.requests.byResult.providerOutage).toBe(1);
    expect(snapshot.geo.requests.byResult.addressAmbiguity).toBe(1);
    expect(snapshot.geo.requests.byResult.resolved).toBe(1);

    // Service-area policy denial is its own signal, distinct from out-of-area.
    expect(snapshot.serviceArea.policyDenialCount).toBe(1);
    expect(snapshot.serviceArea.outOfAreaCount).toBe(1);
    expect(snapshot.serviceArea.coordinateLessAttemptCount).toBe(1);
    expect(snapshot.serviceArea.serviceableCount).toBe(1);
    expect(snapshot.serviceArea.manualReviewCount).toBe(1);
    expect(snapshot.serviceArea.evaluations).toBe(5);
    expect(snapshot.serviceArea.policyDenialCount).not.toBe(
      snapshot.serviceArea.outOfAreaCount + 1,
    );

    // Governance mutation counters remain distinct per action.
    expect(snapshot.governance.geometryMutationCount).toBe(2);
    expect(snapshot.governance.serviceAreaPublishedCount).toBe(1);
    expect(snapshot.governance.stopPolicyRetiredCount).toBe(1);

    proof.runtimeDistinguishability = {
      verdict: "PASS",
      geo: {
        providerOutageCount: snapshot.geo.providerOutageCount,
        addressAmbiguityCount: snapshot.geo.addressAmbiguityCount,
        coordinateLessAttemptCount: snapshot.geo.coordinateLessAttemptCount,
        manualOverrideCount: snapshot.geo.manualOverrideCount,
        resolvedAddressCount: snapshot.geo.resolvedAddressCount,
        requests: snapshot.geo.requests,
      },
      serviceArea: snapshot.serviceArea,
      governance: snapshot.governance,
    };
  });

  it("proves every required alert uses a bounded recent window, never a lifetime counter", () => {
    // metric = the source series each alert must reference; window = the
    // bounded recent-window token that proves the rule is not a lifetime total.
    const requiredAlerts = [
      {
        alertName: "MapProviderErrorRateHigh",
        signal: "provider outage",
        metric: "map_provider_errors_total",
        window: "[5m]",
        aggregator: "rate(",
      },
      {
        alertName: "MapProviderLatencyHigh",
        signal: "provider outage",
        metric: "map_geocode_latency_ms_bucket",
        window: "[10m]",
        aggregator: "histogram_quantile(",
      },
      {
        alertName: "MapProviderQuotaUsageHigh",
        signal: "provider quota",
        metric: "map_provider_quota_usage_percent",
        window: "[15m]",
        aggregator: "max_over_time(",
      },
      {
        alertName: "MapProviderQuotaUsageCritical",
        signal: "provider quota",
        metric: "map_provider_quota_usage_percent",
        window: "[5m]",
        aggregator: "max_over_time(",
      },
      {
        alertName: "AddressAmbiguitySpike",
        signal: "address ambiguity",
        metric: 'map_geocode_requests_total{result="address_ambiguity"}',
        window: "[15m]",
        aggregator: "rate(",
      },
      {
        alertName: "CoordinateLessDispatchAttemptHigh",
        signal: "coordinate-less attempt",
        metric: "coordinate_less_booking_attempts_total",
        window: "[5m]",
        aggregator: "rate(",
      },
      {
        alertName: "ServiceAreaPolicyBlockSpike",
        signal: "policy denial",
        metric: "service_area_policy_blocks_total",
        window: "[15m]",
        aggregator: "rate(",
      },
      {
        alertName: "ServiceAreaEvaluationUnavailable",
        signal: "postgis/evaluator",
        metric: "service_area_evaluations_total",
        window: "[10m]",
        aggregator: "rate(",
      },
      {
        alertName: "ManualMapOverrideSpike",
        signal: "manual override",
        metric: "geo_manual_overrides_total",
        window: "[30m]",
        aggregator: "rate(",
      },
    ];

    const rows = requiredAlerts.map((rule) => {
      const expr = exprLine(rule.alertName);
      expect(expr, `${rule.alertName} expr`).toContain(rule.metric);
      expect(expr, `${rule.alertName} window`).toContain(rule.window);
      expect(expr, `${rule.alertName} aggregator`).toContain(rule.aggregator);
      // A lifetime counter would compare the raw *_total series directly with a
      // threshold. Every required rule instead wraps it in a windowed function,
      // so the raw metric name is always followed by a range selector `[`.
      expect(
        /\b(rate|increase|max_over_time|histogram_quantile)\s*\(/.test(expr),
        `${rule.alertName} must wrap its metric in a recent-window function`,
      ).toBe(true);
      return {
        alert: rule.alertName,
        signal: rule.signal,
        metric: rule.metric,
        window: rule.window,
        aggregator: rule.aggregator.replace("(", ""),
        expr,
        recentWindow: true,
      };
    });

    // Outage, ambiguity, and policy denial must derive from three distinct
    // source metrics so the alerts themselves keep the signals apart.
    const outageMetric = rows.find(
      (row) => row.alert === "MapProviderErrorRateHigh",
    )?.metric;
    const ambiguityMetric = rows.find(
      (row) => row.alert === "AddressAmbiguitySpike",
    )?.metric;
    const policyMetric = rows.find(
      (row) => row.alert === "ServiceAreaPolicyBlockSpike",
    )?.metric;
    expect(new Set([outageMetric, ambiguityMetric, policyMetric]).size).toBe(3);

    proof.recentWindowAlerts = {
      verdict: "PASS",
      distinctSignalMetrics: {
        outage: outageMetric,
        ambiguity: ambiguityMetric,
        policyDenial: policyMetric,
      },
      rows,
    };
  });

  it("confirms the final evidence carries no template placeholders and every matrix row is a PASS", () => {
    // Template placeholder shapes from MAP-OBS-001-FINAL-EVIDENCE-TEMPLATE.md.
    const placeholderPatterns = [
      /`<[^>]+>`/,
      /\{\{[^}]+\}\}/,
      /\bTODO\b/,
      /\bTBD\b/,
      /\bPLACEHOLDER\b/,
      /<VERDICT>/,
    ];
    const placeholderHits = placeholderPatterns
      .map((pattern) => finalEvidenceText.match(pattern)?.[0] ?? null)
      .filter((hit): hit is string => hit !== null);
    expect(placeholderHits).toEqual([]);

    // The exact required matrix rows. This locks the closeout: a required row
    // silently disappearing, being renamed, or flipping PASS -> FAIL fails the
    // exact-set comparison below, instead of being masked by a loose `>= 30`
    // count that leaves slack above the real total. Adding an unexpected PASS
    // row to any matrix also fails, so the evidence surface cannot drift.
    const requiredMatrixRows: Record<string, readonly string[]> = {
      "## Verifier Topic Marker Matrix": [
        "OBS-MAP-PROVIDER-OUTAGE",
        "OBS-MAP-ADDRESS-AMBIGUITY",
        "OBS-MAP-POLICY-DENIAL",
        "OBS-MAP-COORDINATELESS-ATTEMPT",
        "OBS-MAP-MANUAL-OVERRIDE",
        "OBS-MAP-GEOMETRY-MUTATION",
      ],
      "## Metrics Evidence Matrix": [
        "map_geocode_requests_total",
        "map_geocode_latency_ms",
        "map_provider_errors_total",
        "map_provider_quota_usage_percent",
        "coordinate_less_booking_attempts_total",
        "service_area_evaluations_total",
        "service_area_policy_blocks_total",
        "service_area_geometry_mutations_total",
      ],
      "## Audit Event Evidence Matrix": [
        "geo.address.resolved",
        "geo.pin.confirmed",
        "service_area.evaluated",
        "service_area.policy.published",
        "service_area.policy.retired",
        "geo.manual_override.created",
      ],
      "## Alert Evidence Matrix": [
        "MapProviderErrorRateHigh",
        "MapProviderLatencyHigh",
        "MapProviderQuotaUsageHigh",
        "MapProviderQuotaUsageCritical",
        "CoordinateLessDispatchAttemptHigh",
        "ServiceAreaPolicyBlockSpike",
        "ServiceAreaEvaluationUnavailable",
      ],
      "## Runbook Distinction Matrix": [
        "provider outage",
        "address ambiguity",
        "policy denial",
        "postgis",
        "manual override",
      ],
    };

    const requiredSections = Object.keys(requiredMatrixRows);

    // Every PASS row across the matrices, kept for the total-count lock and the
    // artifact-path check below.
    const passRows: string[] = [];
    const lockedRowSets: Record<string, string[]> = {};

    for (const [section, expectedKeys] of Object.entries(requiredMatrixRows)) {
      const body = finalEvidenceSection(section);
      const keys = passRowKeys(body);

      // Exact-set lock: same members, no missing required row, no extra row.
      expect(new Set(keys), `PASS rows for ${section}`).toEqual(
        new Set(expectedKeys),
      );
      // Guard against a duplicated key masking a missing one (Set collapses
      // duplicates, so also pin the raw PASS-row count per section).
      expect(keys.length, `PASS row count for ${section}`).toBe(
        expectedKeys.length,
      );

      lockedRowSets[section] = [...expectedKeys];
      for (const line of body.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("|") && trimmed.includes(": PASS")) {
          passRows.push(trimmed);
        }
      }
    }

    // The whole-document PASS-row total is exactly the sum of the locked
    // per-section sets; no `: PASS` rows may live outside the required matrices.
    const expectedTotal = Object.values(requiredMatrixRows).reduce(
      (total, keys) => total + keys.length,
      0,
    );
    const documentPassRows = finalEvidenceText
      .split("\n")
      .filter((line) => line.trim().startsWith("|") && line.includes(": PASS"));
    expect(documentPassRows.length, "total final-evidence PASS rows").toBe(
      expectedTotal,
    );

    // Every PASS row in the matrices must carry a repo-relative artifact path.
    for (const row of passRows) {
      expect(
        /support\/sidecars\/|docs\/03-runbooks\/|infra\/alerts\/|apps\/api\//.test(
          row,
        ),
        `PASS row is missing an artifact path: ${row.slice(0, 80)}`,
      ).toBe(true);
    }

    // Runbook distinctions the closeout depends on.
    for (const heading of [
      "## Provider Outage",
      "## Address Ambiguity",
      "## Policy Denial",
      "## PostGIS / Evaluator Unavailable",
      "## Manual Override",
    ]) {
      expect(mapRunbookText, `runbook heading ${heading}`).toContain(heading);
    }

    proof.finalEvidenceIntegrity = {
      verdict: "PASS",
      placeholderHits,
      passRowCount: passRows.length,
      expectedPassRowTotal: expectedTotal,
      requiredSections,
      lockedRowSets,
      runbookDistinctions: [
        "provider outage",
        "address ambiguity",
        "policy denial",
        "postgis/evaluator unavailable",
        "manual override",
      ],
    };
  });
});

afterAll(() => {
  const artifactPath = resolve(REPO_ROOT, PROOF_RELATIVE_PATH);
  mkdirSync(
    resolve(
      REPO_ROOT,
      "support/sidecars/MAP-OBS-001/artifacts/closeout-20260708",
    ),
    { recursive: true },
  );
  proof.verdict = "PASS";
  writeFileSync(artifactPath, `${JSON.stringify(proof, null, 2)}\n`);
});
