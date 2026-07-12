import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const workspaceRoot = process.cwd();
const alertsPath = path.resolve(
  workspaceRoot,
  "infra/alerts/map-geofence-alerts.yaml",
);
const mapRunbookPath = path.resolve(
  workspaceRoot,
  "docs/03-runbooks/map-geofence-observability-runbook.md",
);
const alertRunbookPath = path.resolve(
  workspaceRoot,
  "docs/03-runbooks/operational-observability-alert-runbook.md",
);

const alertsText = readFileSync(alertsPath, "utf8");
const mapRunbookText = readFileSync(mapRunbookPath, "utf8");
const alertRunbookText = readFileSync(alertRunbookPath, "utf8");

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

describe("map geofence alert rules", () => {
  it("defines required recent-window rules with the expected source metrics", () => {
    const expectedRules = [
      {
        alertName: "MapProviderErrorRateHigh",
        metric: "map_provider_errors_total",
        window: "[5m]",
      },
      {
        alertName: "MapProviderLatencyHigh",
        metric: "map_geocode_latency_ms_bucket",
        window: "[10m]",
      },
      {
        alertName: "MapProviderQuotaUsageHigh",
        metric: "map_provider_quota_usage_percent",
        window: "[15m]",
      },
      {
        alertName: "MapProviderQuotaUsageCritical",
        metric: "map_provider_quota_usage_percent",
        window: "[5m]",
      },
      {
        alertName: "CoordinateLessDispatchAttemptHigh",
        metric: "coordinate_less_booking_attempts_total",
        window: "[5m]",
      },
      {
        alertName: "ServiceAreaPolicyBlockSpike",
        metric: "service_area_policy_blocks_total",
        window: "[15m]",
      },
      {
        alertName: "ServiceAreaEvaluationUnavailable",
        metric: "service_area_evaluations_total",
        window: "[10m]",
      },
    ];

    for (const rule of expectedRules) {
      const block = alertBlock(rule.alertName);
      expect(block).toContain(`expr:`);
      expect(block).toContain(rule.metric);
      expect(block).toContain(rule.window);
      expect(block).toContain("for:");
      expect(block).toContain("runbook:");
    }
  });
});

describe("map geofence observability runbooks", () => {
  it("distinguishes outage, ambiguity, policy denial, postgis, and manual override topics", () => {
    expect(mapRunbookText).toContain("## Provider Outage");
    expect(mapRunbookText).toContain("## Address Ambiguity");
    expect(mapRunbookText).toContain("## Policy Denial");
    expect(mapRunbookText).toContain("## PostGIS / Evaluator Unavailable");
    expect(mapRunbookText).toContain("## Manual Override");
    expect(mapRunbookText).toContain(
      "Do not classify evaluator/PostGIS failure as address ambiguity or provider outage.",
    );
    expect(mapRunbookText).toContain(
      "Distinguish stop-policy denial from provider outage and from plain out-of-area results.",
    );
  });

  it("cross-links the operational alert runbook to the dedicated map/geofence rule set", () => {
    expect(alertRunbookText).toContain("infra/alerts/map-geofence-alerts.yaml");
    expect(alertRunbookText).toContain("MapProviderLatencyHigh");
    expect(alertRunbookText).toContain("MapProviderQuotaUsageCritical");
    expect(alertRunbookText).toContain("ServiceAreaEvaluationUnavailable");
  });
});
