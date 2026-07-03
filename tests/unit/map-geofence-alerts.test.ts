import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// MAP-OBS-001: validate the map/geofence production alert rules so that the
// required recent-window alert coverage is asserted by an executable check and
// not only by prose evidence. The alert file is authored as Prometheus rule
// YAML; we assert on its textual contract to avoid pulling a YAML parser into
// the root workspace.
const alertsPath = path.resolve(
  __dirname,
  "../../infra/alerts/map-geofence-alerts.yaml",
);
const alertsText = readFileSync(alertsPath, "utf8");

const requiredAlertRules = [
  "MapProviderErrorRateHigh",
  "MapProviderLatencyHigh",
  "MapProviderQuotaUsageHigh",
  "MapProviderQuotaUsageCritical",
  "CoordinateLessDispatchAttemptHigh",
  "ServiceAreaPolicyBlockSpike",
  "ServiceAreaEvaluationUnavailable",
];

describe("map-geofence alert rules", () => {
  it("declares every required alert rule", () => {
    for (const rule of requiredAlertRules) {
      expect(alertsText).toContain(`alert: ${rule}`);
    }
  });

  it("wires provider error, latency, and quota alerts to the required metrics", () => {
    expect(alertsText).toContain("map_provider_errors_total");
    expect(alertsText).toContain("map_geocode_latency_ms_bucket");
    expect(alertsText).toMatch(/map_provider_quota_usage_percent\)[^\n]*>= 80/);
    expect(alertsText).toMatch(/map_provider_quota_usage_percent\)[^\n]*>= 95/);
  });

  it("keeps recent-window (rate over a range) semantics so historical counters do not latch alerts", () => {
    // Provider error, coordinate-less, policy-block, and evaluation-error
    // alerts must all fire on a trailing rate() window rather than a lifetime
    // counter comparison, so a burst clears once the window empties.
    expect(alertsText).toMatch(
      /rate\(map_provider_errors_total\{retryable="true"\}\[5m\]\)/,
    );
    expect(alertsText).toMatch(
      /rate\(coordinate_less_booking_attempts_total\[5m\]\)/,
    );
    expect(alertsText).toMatch(
      /rate\(service_area_policy_blocks_total\[15m\]\)/,
    );
    expect(alertsText).toMatch(
      /rate\(service_area_evaluations_total\{result="error"\}\[5m\]\)/,
    );
  });

  it("separates provider outage, address ambiguity, and policy denial signals", () => {
    expect(alertsText).toContain(
      'map_geocode_requests_total{result="address_ambiguity"}',
    );
    expect(alertsText).toContain("map_provider_fail_closed");
    expect(alertsText).toContain("service_area_policy_blocks_total");
  });
});
