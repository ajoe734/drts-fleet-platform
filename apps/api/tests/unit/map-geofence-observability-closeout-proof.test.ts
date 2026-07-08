import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, it } from "vitest";

const workspaceRoot = path.resolve(process.cwd(), "..", "..");
const finalEvidenceRelativePath =
  "support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md";
const automatedEvidenceRelativePath =
  "support/sidecars/MAP-OBS-001/MAP-OBS-001-AUTOMATED-EVIDENCE-20260701.md";
const alertsRelativePath = "infra/alerts/map-geofence-alerts.yaml";
const mapRunbookRelativePath =
  "docs/03-runbooks/map-geofence-observability-runbook.md";
const operationalRunbookRelativePath =
  "docs/03-runbooks/operational-observability-alert-runbook.md";
const apiReadmeRelativePath = "apps/api/README.md";
const proofRelativePath =
  "support/sidecars/MAP-OBS-001/artifacts/closeout-20260708/fleets-closeout-006-observability-proof.json";

const finalEvidencePath = path.resolve(
  workspaceRoot,
  finalEvidenceRelativePath,
);
const automatedEvidencePath = path.resolve(
  workspaceRoot,
  automatedEvidenceRelativePath,
);
const alertsPath = path.resolve(workspaceRoot, alertsRelativePath);
const mapRunbookPath = path.resolve(workspaceRoot, mapRunbookRelativePath);
const operationalRunbookPath = path.resolve(
  workspaceRoot,
  operationalRunbookRelativePath,
);
const apiReadmePath = path.resolve(workspaceRoot, apiReadmeRelativePath);

const finalEvidenceText = readFileSync(finalEvidencePath, "utf8");
const automatedEvidenceText = readFileSync(automatedEvidencePath, "utf8");
const alertsText = readFileSync(alertsPath, "utf8");
const mapRunbookText = readFileSync(mapRunbookPath, "utf8");
const operationalRunbookText = readFileSync(operationalRunbookPath, "utf8");
const apiReadmeText = readFileSync(apiReadmePath, "utf8");
const finalEvidenceBranchHeadMatch = finalEvidenceText.match(
  /Implementation branch\/SHA:\s+`([^`]+)`/,
);

if (!finalEvidenceBranchHeadMatch) {
  throw new Error("Final evidence must declare an implementation branch/SHA");
}

const finalEvidenceBranchHead = finalEvidenceBranchHeadMatch[1];

const requiredMetrics = [
  "map_geocode_requests_total",
  "map_geocode_latency_ms",
  "map_provider_errors_total",
  "map_provider_quota_usage_percent",
  "coordinate_less_booking_attempts_total",
  "service_area_evaluations_total",
  "service_area_policy_blocks_total",
  "service_area_geometry_mutations_total",
] as const;

const requiredAuditEvents = [
  "geo.address.resolved",
  "geo.pin.confirmed",
  "service_area.evaluated",
  "service_area.policy.published",
  "service_area.policy.retired",
  "geo.manual_override.created",
] as const;

const requiredAlerts = [
  {
    name: "MapProviderErrorRateHigh",
    metric: "map_provider_errors_total",
    window: "[5m]",
  },
  {
    name: "MapProviderLatencyHigh",
    metric: "map_geocode_latency_ms_bucket",
    window: "[10m]",
  },
  {
    name: "MapProviderQuotaUsageHigh",
    metric: "map_provider_quota_usage_percent",
    window: "[15m]",
  },
  {
    name: "MapProviderQuotaUsageCritical",
    metric: "map_provider_quota_usage_percent",
    window: "[5m]",
  },
  {
    name: "MapProviderOutageFailClosed",
    metric: 'map_provider_fail_closed{status="unhealthy"}',
    window: null,
  },
  {
    name: "AddressAmbiguitySpike",
    metric: 'map_geocode_requests_total{result="address_ambiguity"}',
    window: "[15m]",
  },
  {
    name: "CoordinateLessDispatchAttemptHigh",
    metric: "coordinate_less_booking_attempts_total",
    window: "[5m]",
  },
  {
    name: "ServiceAreaPolicyBlockSpike",
    metric: "service_area_policy_blocks_total",
    window: "[15m]",
  },
  {
    name: "ServiceAreaEvaluationUnavailable",
    metric:
      'service_area_evaluations_total{decision=~"manual_review|not_serviceable",reason_code=~"EVALUATOR_UNAVAILABLE|POSTGIS_UNAVAILABLE"}',
    window: "[10m]",
  },
  {
    name: "ManualMapOverrideSpike",
    metric: "geo_manual_overrides_total",
    window: "[30m]",
  },
  {
    name: "ServiceAreaGeometryMutationUnexpected",
    metric: 'service_area_geometry_mutations_total{status!="approved"}',
    window: "[10m]",
  },
] as const;

const runbookDistinctions = [
  {
    key: "provider_outage",
    title: "Provider Outage",
    finalEvidenceNeedle: "provider outage / OBS-MAP-PROVIDER-OUTAGE: PASS",
    runbookNeedle: "## Provider Outage",
  },
  {
    key: "address_ambiguity",
    title: "Address Ambiguity",
    finalEvidenceNeedle: "address ambiguity / OBS-MAP-ADDRESS-AMBIGUITY: PASS",
    runbookNeedle: "## Address Ambiguity",
  },
  {
    key: "policy_denial",
    title: "Policy Denial",
    finalEvidenceNeedle: "policy denial / OBS-MAP-POLICY-DENIAL: PASS",
    runbookNeedle: "## Policy Denial",
  },
  {
    key: "postgis_evaluator",
    title: "PostGIS / Evaluator Unavailable",
    finalEvidenceNeedle: "postgis: PASS",
    runbookNeedle: "## PostGIS / Evaluator Unavailable",
  },
  {
    key: "manual_override",
    title: "Manual Override",
    finalEvidenceNeedle: "manual override / OBS-MAP-MANUAL-OVERRIDE: PASS",
    runbookNeedle: "## Manual Override",
  },
  {
    key: "geometry_mutation",
    title: "Geometry Mutation",
    finalEvidenceNeedle: "geometry mutation / OBS-MAP-GEOMETRY-MUTATION: PASS",
    runbookNeedle: "## Geometry Mutation",
  },
  {
    key: "geometry_rollback",
    title: "Geometry Rollback",
    finalEvidenceNeedle: "geometry rollback / OBS-MAP-GEOMETRY-MUTATION: PASS",
    runbookNeedle:
      "verify `service_area.stop_policy.published` or `service_area.stop_policy.retired`",
  },
] as const;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getSection(markdown: string, heading: string) {
  const sectionMatch = markdown.match(
    new RegExp(`## ${escapeRegExp(heading)}\\n([\\s\\S]*?)(?:\\n## |$)`),
  );

  if (!sectionMatch) {
    throw new Error(`Missing section: ${heading}`);
  }

  return sectionMatch[1];
}

function expectPassRow(sectionText: string, rowKey: string) {
  const rowMatch = sectionText.match(
    new RegExp("^\\|\\s+`" + escapeRegExp(rowKey) + "`\\s+\\|.*$", "m"),
  );

  expect(rowMatch, `Missing row for ${rowKey}`).not.toBeNull();
  expect(rowMatch?.[0]).toContain("PASS");
}

it("writes observability closeout proof for FLEETS-CLOSEOUT-006", () => {
  expect(finalEvidenceText).not.toMatch(/TODO|TBD|{{|<placeholder|PLACEHOLDER/);
  expect(finalEvidenceText).toContain("## Metrics Evidence Matrix");
  expect(finalEvidenceText).toContain("## Audit Event Evidence Matrix");
  expect(finalEvidenceText).toContain("## Alert Evidence Matrix");
  expect(finalEvidenceText).toContain("## Runbook Distinction Matrix");

  const metricsSection = getSection(
    finalEvidenceText,
    "Metrics Evidence Matrix",
  );
  const auditSection = getSection(
    finalEvidenceText,
    "Audit Event Evidence Matrix",
  );
  const alertsSection = getSection(finalEvidenceText, "Alert Evidence Matrix");
  const runbookSection = getSection(
    finalEvidenceText,
    "Runbook Distinction Matrix",
  );

  for (const metric of requiredMetrics) {
    expectPassRow(metricsSection, metric);
  }

  for (const auditEvent of requiredAuditEvents) {
    expectPassRow(auditSection, auditEvent);
  }

  for (const alert of requiredAlerts) {
    expectPassRow(alertsSection, alert.name);
    expect(alertsText).toContain(`- alert: ${alert.name}`);
    expect(alertsText).toContain(alert.metric);
    if (alert.window !== null) {
      expect(alertsText).toContain(alert.window);
    }
  }

  expect(alertsText).not.toContain("increase(map_provider_errors_total[1d])");
  expect(alertsText).not.toContain(
    "increase(service_area_policy_blocks_total[1d])",
  );

  for (const distinction of runbookDistinctions) {
    expect(runbookSection).toContain(distinction.finalEvidenceNeedle);
    expect(mapRunbookText).toContain(distinction.runbookNeedle);
  }

  expect(mapRunbookText).toContain(
    "Do not classify evaluator/PostGIS failure as address ambiguity or provider outage.",
  );
  expect(mapRunbookText).toContain(
    "Distinguish stop-policy denial from provider outage and from plain out-of-area results.",
  );
  expect(operationalRunbookText).toContain("MapProviderErrorRateHigh");
  expect(operationalRunbookText).toContain("ServiceAreaEvaluationUnavailable");
  expect(automatedEvidenceText).toContain("git diff --check");
  expect(apiReadmeText).toContain("staging / production");
  expect(apiReadmeText).toContain("MAP_PROVIDER_BACKEND=google");
  expect(finalEvidenceText).toContain(
    "Grafana/dashboard panels and live parser validation",
  );
  expect(finalEvidenceText).toContain("staged/UAT traffic");

  const artifactPath = path.resolve(workspaceRoot, proofRelativePath);
  mkdirSync(path.dirname(artifactPath), { recursive: true });
  writeFileSync(
    artifactPath,
    JSON.stringify(
      {
        taskId: "FLEETS-CLOSEOUT-006",
        verdict: "PASS",
        closeoutDate: "2026-07-08",
        branchHead: finalEvidenceBranchHead,
        evidenceAnchors: {
          finalEvidence: finalEvidenceRelativePath,
          automatedEvidence: automatedEvidenceRelativePath,
          alerts: alertsRelativePath,
          mapRunbook: mapRunbookRelativePath,
          operationalRunbook: operationalRunbookRelativePath,
          proofTest:
            "apps/api/tests/unit/map-geofence-observability-closeout-proof.test.ts",
        },
        acceptance: {
          placeholderScan: {
            status: "PASS",
            artifact: finalEvidenceRelativePath,
          },
          metrics: requiredMetrics.map((metric) => ({
            metric,
            status: "PASS",
            artifact: finalEvidenceRelativePath,
          })),
          auditEvents: requiredAuditEvents.map((auditEvent) => ({
            auditEvent,
            status: "PASS",
            artifact: finalEvidenceRelativePath,
          })),
          alerts: requiredAlerts.map((alert) => ({
            alertName: alert.name,
            status: "PASS",
            sourceMetric: alert.metric,
            recentWindow: alert.window,
            artifacts: [alertsRelativePath, finalEvidenceRelativePath],
          })),
          runbookDistinctions: runbookDistinctions.map((distinction) => ({
            topic: distinction.title,
            status: "PASS",
            artifact: finalEvidenceRelativePath,
            runbook: mapRunbookRelativePath,
            inference:
              distinction.key === "geometry_rollback"
                ? "geometry rollback is evidenced by publish/retire audit coverage and the runbook's retire-path checks"
                : undefined,
          })),
          dashboardAndStageLinks: {
            status: "EXTERNAL_GATED",
            dashboard: {
              note: "repo-backed final evidence keeps dashboard/live parser validation external-gated",
              artifact: finalEvidenceRelativePath,
            },
            stagedTraffic: {
              note: "repo-backed final evidence keeps staged/UAT traffic external-gated",
              artifact: finalEvidenceRelativePath,
            },
            stagingRuntimeConfig: {
              note: "API README documents staging/production map-provider key requirements",
              artifact: apiReadmeRelativePath,
            },
          },
        },
      },
      null,
      2,
    ),
  );
});
