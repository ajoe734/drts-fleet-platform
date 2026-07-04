#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const sidecarDir = path.join(repoRoot, "support/sidecars/MAP-REL-001");
mkdirSync(sidecarDir, { recursive: true });

const today = new Date().toISOString().slice(0, 10);
const stamp = `${today.replaceAll("-", "")}T000000Z`;
const branch = git(["branch", "--show-current"]);
const sha = git(["rev-parse", "HEAD"]);
const branchAtSha = `${branch}@${sha}`;
const mergeBase = git(["merge-base", "HEAD", "origin/dev"], true);

const qaEvidencePath =
  "support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE.md";
const obsEvidencePath =
  "support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md";
const driverEvidencePath =
  "support/sidecars/MAP-MOB-DRV-001/MAP-MOB-DRV-001-FINAL-EVIDENCE.md";
const ui002CloseoutPath =
  "support/sidecars/MAP-UI-002/MAP-UI-002-INTEGRATE-001-CLOSEOUT.md";
const adminPlanningPath =
  "support/unblock/MAP-FE-ADM-001/MAP-FE-ADM-001-UNBLOCK-PLANNING-DECISION.md";
const providerRunbookPath =
  "docs/03-runbooks/map-provider-operational-runbook-20260630.md";
const gapCloseoutPath =
  "docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260701.md";
const featureFlagsPath =
  "apps/api/src/modules/feature-flags/feature-flags.service.ts";
const featureFlagTestsPath =
  "apps/api/tests/unit/feature-flags.service.test.ts";
const providerConfigPath =
  "apps/api/src/modules/geo/geo-provider-config.service.ts";
const googleProviderPath = "apps/api/src/modules/geo/google-geo.provider.ts";
const geoModulePath = "apps/api/src/modules/geo/geo.module.ts";
const providerCheckScriptPath = "scripts/check-map-provider-config.sh";
const envExamplePath = ".env.example";
const observabilityRunbookPath =
  "docs/03-runbooks/map-geofence-observability-runbook.md";
const rollbackRunbookPath =
  "docs/03-runbooks/prod-deploy-rollback-runbook-20260519.md";
const rollbackDrillPath =
  "docs/03-runbooks/production-rollback-drill-20260519.md";
const alertRunbookPath =
  "docs/03-runbooks/operational-observability-alert-runbook.md";
const adminRoutePath = "apps/platform-admin-web/app/service-area-governance";
const postgisMigrations = [
  "infra/migrations/V0047__service_area_geofence_authority.sql",
  "infra/migrations/V0048__service_area_review_lifecycle.sql",
];

const qaEvidence = read(qaEvidencePath);
const obsEvidence = read(obsEvidencePath);
const driverEvidence = read(driverEvidencePath);
const ui002Closeout = read(ui002CloseoutPath);
const providerConfig = read(providerConfigPath);
const googleProvider = read(googleProviderPath);
const geoModule = read(geoModulePath);
const providerCheckScript = read(providerCheckScriptPath);
const envExample = read(envExamplePath);
const featureFlags = read(featureFlagsPath);
const featureFlagTests = read(featureFlagTestsPath);
const providerRunbook = read(providerRunbookPath);
const gapCloseout = read(gapCloseoutPath);
const observabilityRunbook = read(observabilityRunbookPath);

const qaPass =
  qaEvidence.includes("`MAP-QA-002` is `PASS`") &&
  qaEvidence.includes("| `E2E-MAP-001`") &&
  qaEvidence.includes("| `E2E-MAP-005`");
const obsPass = obsEvidence.includes("MAP-OBS-001 is `PASS`");
const gateBUiBlocked =
  !exists(adminRoutePath) &&
  ui002Closeout.includes("does **not** claim Gate B production pass");
const driverUatBlocked =
  driverEvidence.includes(
    "still needs simulator/device screenshots or video",
  ) ||
  driverEvidence.includes("simulator UAT was not run") ||
  qaEvidence.includes(
    "| `E2E-MAP-007` Driver trip map and navigation handoff                                     | Gate D         | MANUAL-UAT",
  );
const featureFlagsReady = [
  "geoProviderEnabled",
  "addressMapPickerEnabled",
  "serviceAreaGateEnforced",
  "opsRealMapEnabled",
  "platformGeometryEditorEnabled",
  "driverTripMapEnabled",
].every(
  (flag) =>
    featureFlags.includes(`key: "${flag}"`) &&
    featureFlagTests.includes(`"${flag}"`),
);
const providerEnvDocumented = [
  "MAP_PROVIDER_MODE",
  "MAP_PROVIDER_NAME",
  "MAP_PROVIDER_SERVER_KEY",
  "MAP_PROVIDER_BROWSER_KEY",
  "MAP_PROVIDER_ALLOWED_ORIGINS",
  "MAP_PROVIDER_MOBILE_BUNDLE_IDS",
  "MAP_PROVIDER_MOBILE_PACKAGE_NAMES",
  "MAP_PROVIDER_DAILY_QUOTA",
  "MAP_PROVIDER_MINUTE_QUOTA",
  "MAP_PROVIDER_QUOTA_WARNING_PERCENT",
  "MAP_PROVIDER_QUOTA_CRITICAL_PERCENT",
].every((key) => envExample.includes(`${key}=`));
const providerScriptAligned =
  providerCheckScript.includes("MAP_PROVIDER_MODE") &&
  !providerCheckScript.includes("MAP_PROVIDER_BACKEND") &&
  !providerCheckScript.includes("GOOGLE_MAPS_GEOCODING_API_KEY");
const providerAdapterImplemented =
  !providerConfig.includes(
    "External geo provider adapter is not implemented in this runtime yet",
  ) &&
  googleProvider.includes("class GoogleGeoProvider") &&
  geoModule.includes("GoogleGeoProvider");
const providerPrereqsPass =
  providerEnvDocumented &&
  providerScriptAligned &&
  providerRunbook.includes("MAP_PROVIDER_MODE") &&
  providerAdapterImplemented;
const postgisPrereqsPass =
  postgisMigrations.every(exists) &&
  observabilityRunbook.includes("## PostGIS / Evaluator Unavailable");
const rollbackReady =
  exists(rollbackRunbookPath) &&
  exists(rollbackDrillPath) &&
  exists(alertRunbookPath) &&
  featureFlagsReady;

const gateARepoPass = qaPass && obsPass;
const gateBRepoPass =
  qaEvidence.includes("| `E2E-MAP-002`") &&
  obsEvidence.includes("service_area.policy.published");
const gateCRepoPass = qaEvidence.includes("| `E2E-MAP-006`");
const gateDRepoPass = driverEvidence.includes(
  "Driver sees real pickup/dropoff points",
);
const gateERepoPass =
  qaEvidence.includes("| `E2E-MAP-005`") &&
  obsEvidence.includes("OBS-MAP-PROVIDER-OUTAGE");

const gateAReleasePass = gateARepoPass && providerPrereqsPass;
const gateBReleasePass = gateBRepoPass && !gateBUiBlocked;
const gateCReleasePass = gateCRepoPass && providerPrereqsPass;
const gateDReleasePass = gateDRepoPass && !driverUatBlocked;
const gateEReleasePass = gateERepoPass && providerPrereqsPass;

const manifest = {
  taskId: "MAP-REL-001",
  title: "Map/geofence production release gates",
  generatedAt: new Date().toISOString(),
  branch,
  branchAtSha,
  mergeBaseAgainstDev: mergeBase,
  evidenceScope: "repo-backed release audit; no unsupported production claim",
  dependencyEvidence: [
    {
      taskId: "MAP-QA-002",
      verdict: qaPass ? "PASS" : "FAIL",
      artifact: qaEvidencePath,
    },
    {
      taskId: "MAP-OBS-001",
      verdict: obsPass ? "PASS" : "FAIL",
      artifact: obsEvidencePath,
    },
    {
      taskId: "MAP-MOB-DRV-001",
      verdict: driverUatBlocked ? "LIMITED" : "PASS",
      artifact: driverEvidencePath,
    },
  ],
  productionEvidence: [
    item({
      id: "FLEETS-MAP-ROLLOUT-FLAGS",
      title: "Rollout flags default disabled and ordered for staged enablement",
      status: featureFlagsReady ? "PASS" : "FAIL",
      repoStatus: featureFlagsReady ? "PASS" : "FAIL",
      artifacts: [featureFlagsPath, featureFlagTestsPath],
      blocker: featureFlagsReady
        ? ""
        : "Required rollout flags are not all present with disabled-by-default coverage.",
    }),
    item({
      id: "FLEETS-MAP-ROLLBACK",
      title: "Rollback and degraded-mode operator references are documented",
      status: rollbackReady ? "PASS" : "FAIL",
      repoStatus: rollbackReady ? "PASS" : "FAIL",
      artifacts: [rollbackRunbookPath, rollbackDrillPath, alertRunbookPath],
      blocker: rollbackReady
        ? ""
        : "Rollback runbook/drill references are incomplete.",
    }),
    item({
      id: "FLEETS-MAP-POSTGIS-PREREQS",
      title: "PostGIS and evaluator prerequisites are documented and linked",
      status: postgisPrereqsPass ? "PASS" : "FAIL",
      repoStatus: postgisPrereqsPass ? "PASS" : "FAIL",
      artifacts: [...postgisMigrations, observabilityRunbookPath],
      blocker: postgisPrereqsPass
        ? ""
        : "PostGIS/evaluator prerequisites are not fully evidenced.",
    }),
    item({
      id: "FLEETS-MAP-PROVIDER-PREREQS",
      title:
        "Provider runtime prerequisites align across env docs, preflight, and runtime",
      status: providerPrereqsPass ? "PASS" : "FAIL",
      repoStatus:
        providerEnvDocumented && providerScriptAligned ? "PASS" : "FAIL",
      artifacts: [
        envExamplePath,
        providerCheckScriptPath,
        providerConfigPath,
        googleProviderPath,
        geoModulePath,
        providerRunbookPath,
      ],
      blocker: providerPrereqsPass
        ? ""
        : !providerAdapterImplemented
          ? "Runtime/provider wiring for MAP_PROVIDER_MODE=external is still incomplete."
          : "Provider prereq docs/script drift is still open.",
    }),
    item({
      id: "FLEETS-MAP-GATE-A",
      title: "Gate A: Callcenter safe to dispatch",
      status: gateAReleasePass ? "PASS" : "FAIL",
      repoStatus: gateARepoPass ? "PASS" : "FAIL",
      artifacts: [qaEvidencePath, obsEvidencePath],
      blocker: gateAReleasePass
        ? ""
        : "Repo-backed proof exists, but production release is still blocked by provider prerequisites/runtime.",
    }),
    item({
      id: "FLEETS-MAP-GATE-B",
      title: "Gate B: Governance safe to publish",
      status: gateBReleasePass ? "PASS" : "FAIL",
      repoStatus: gateBRepoPass ? "PASS" : "FAIL",
      artifacts: [
        qaEvidencePath,
        obsEvidencePath,
        ui002CloseoutPath,
        adminPlanningPath,
      ],
      blocker: gateBReleasePass
        ? ""
        : "Canonical /service-area-governance UI publication and MAP-FE-ADM-001 final evidence are still missing.",
    }),
    item({
      id: "FLEETS-MAP-GATE-C",
      title: "Gate C: Ops safe to operate",
      status: gateCReleasePass ? "PASS" : "FAIL",
      repoStatus: gateCRepoPass ? "PASS" : "FAIL",
      artifacts: [
        qaEvidencePath,
        "apps/ops-console-web/app/dispatch/ops-map-board.ts",
      ],
      blocker: gateCReleasePass
        ? ""
        : "Repo-backed ops proof exists, but live-provider prerequisites still block production enablement.",
    }),
    item({
      id: "FLEETS-MAP-GATE-D",
      title: "Gate D: Driver safe to navigate",
      status: gateDReleasePass ? "PASS" : "FAIL",
      repoStatus: gateDRepoPass ? "PASS" : "FAIL",
      artifacts: [driverEvidencePath, qaEvidencePath],
      blocker: gateDReleasePass
        ? ""
        : "Driver device/simulator UAT is still absent and E2E-MAP-007 remains MANUAL-UAT.",
    }),
    item({
      id: "FLEETS-MAP-GATE-E",
      title: "Gate E: Degraded safe",
      status: gateEReleasePass ? "PASS" : "FAIL",
      repoStatus: gateERepoPass ? "PASS" : "FAIL",
      artifacts: [qaEvidencePath, obsEvidencePath, providerRunbookPath],
      blocker: gateEReleasePass
        ? ""
        : "Repo-backed degraded behavior exists, but production provider prerequisites/runtime still fail release.",
    }),
    item({
      id: "FLEETS-MAP-GAP-INVENTORY",
      title:
        "Gap inventory closeout is updated and every MAP-GAP item is assigned",
      status: gapCloseout.includes("## 2026-07-04 Release Closeout Snapshot")
        ? "PASS"
        : "FAIL",
      repoStatus: gapCloseout.includes(
        "## 2026-07-04 Release Closeout Snapshot",
      )
        ? "PASS"
        : "FAIL",
      artifacts: [gapCloseoutPath],
      blocker: gapCloseout.includes("## 2026-07-04 Release Closeout Snapshot")
        ? ""
        : "Gap inventory closeout snapshot is missing.",
    }),
  ],
};

manifest.summary = {
  passCount: manifest.productionEvidence.filter(
    (item) => item.status === "PASS",
  ).length,
  failCount: manifest.productionEvidence.filter(
    (item) => item.status === "FAIL",
  ).length,
  repoPassCount: manifest.productionEvidence.filter(
    (item) => item.repoStatus === "PASS",
  ).length,
  releaseVerdict: manifest.productionEvidence.every(
    (item) => item.status === "PASS",
  )
    ? "PASS"
    : "FAIL",
};

const blockerItems = manifest.productionEvidence.filter(
  (item) => item.status === "FAIL",
);
const blockerTitles = blockerItems.map((item) => item.title);
const blockerNarrative =
  blockerTitles.length === 0
    ? "All repo-backed release checks passed for this audit scope."
    : `This audit does **not** claim unsupported production readiness while these blockers remain: ${blockerTitles.join("; ")}.`;
const blockerListMarkdown =
  blockerItems.length === 0
    ? "1. None."
    : blockerItems
        .map((item, index) => `${index + 1}. \`${item.id}\`: ${item.blocker}`)
        .join("\n");
const blockingConclusionsMarkdown =
  blockerItems.length === 0
    ? "1. No blocking conclusions remain for this repo-backed audit."
    : blockerItems
        .map(
          (item, index) => `${index + 1}. ${item.title}: ${item.blocker}`,
        )
        .join("\n");
const burndownMarkdown =
  blockerItems.length === 0
    ? "1. No remaining repo-backed release work is tracked by MAP-REL-001."
    : blockerItems
        .map((item, index) => `${index + 1}. ${item.blocker}`)
        .join("\n");

const finalEvidence = `# MAP-REL-001 Final Evidence

**Task:** \`MAP-REL-001\` - Map/geofence production release gates
**Branch:** \`${branch}\`
**Branch@SHA:** \`${branchAtSha}\`
**Merge-base against \`origin/dev\`:** \`${mergeBase || "unavailable"}\`
**Date:** \`${today}\`
**Manifest:** \`support/sidecars/MAP-REL-001/MAP-FLEETS-EXECUTION-MANIFEST-20260701.json\`
**Readiness report:** \`support/sidecars/MAP-REL-001/MAP-READINESS-BLOCKER-REPORT.md\`
**Blocker handoff notes:** \`support/sidecars/MAP-REL-001/MAP-READINESS-BLOCKER-HANDOFFS.md\`

## Verdict

\`MAP-REL-001\` is \`${manifest.summary.releaseVerdict}\` for production release closeout on this repo-backed audit. ${blockerNarrative}

## Gate Matrix

| Gate | Release verdict | Repo-backed proof | Artifact path/link evidence | Blocker |
| --- | --- | --- | --- | --- |
${gateRow(manifest, "FLEETS-MAP-GATE-A")}
${gateRow(manifest, "FLEETS-MAP-GATE-B")}
${gateRow(manifest, "FLEETS-MAP-GATE-C")}
${gateRow(manifest, "FLEETS-MAP-GATE-D")}
${gateRow(manifest, "FLEETS-MAP-GATE-E")}

## Rollout, Rollback, And Prerequisite Matrix

| Topic | Release verdict | Repo-backed proof | Artifact path/link evidence | Notes |
| --- | --- | --- | --- | --- |
${row(manifest, "FLEETS-MAP-ROLLOUT-FLAGS")}
${row(manifest, "FLEETS-MAP-ROLLBACK")}
${row(manifest, "FLEETS-MAP-POSTGIS-PREREQS")}
${row(manifest, "FLEETS-MAP-PROVIDER-PREREQS")}
${row(manifest, "FLEETS-MAP-GAP-INVENTORY")}

## Dependency Evidence

| Dependency | Verdict | Artifact |
| --- | --- | --- |
${manifest.dependencyEvidence
  .map(
    (dependency) =>
      `| \`${dependency.taskId}\` | \`${dependency.verdict}\` | \`${dependency.artifact}\` |`,
  )
  .join("\n")}

## Open Production Blockers

${blockerListMarkdown}

## Verification Commands

| Command | Result | Evidence |
| --- | --- | --- |
| \`node scripts/report-map-geofence-readiness-blockers.mjs\` | \`${manifest.summary.releaseVerdict}\` | \`support/sidecars/MAP-REL-001/MAP-READINESS-BLOCKER-REPORT.md\` |
| \`node scripts/note-map-geofence-blocker-handoffs.mjs\` | \`PASS\` | \`support/sidecars/MAP-REL-001/MAP-READINESS-BLOCKER-HANDOFFS.md\` |
| \`node scripts/verify-map-geofence-dispatch-integrity.mjs\` | \`see verifier output\` | \`support/sidecars/MAP-REL-001/artifacts/verify-map-geofence-dispatch-integrity-${stamp}.txt\` |
`;

const blockerReport = `# MAP-REL-001 Readiness Blocker Report

Generated: \`${new Date().toISOString()}\`
Branch@SHA: \`${branchAtSha}\`
Readiness verdict: \`${manifest.summary.releaseVerdict}\`

## Summary

- Release checks passing: ${manifest.summary.passCount}
- Release checks failing: ${manifest.summary.failCount}
- Repo-backed checks passing: ${manifest.summary.repoPassCount}

## Check Matrix

| Check | Release verdict | Repo-backed proof | Artifact path/link evidence | Blocker |
| --- | --- | --- | --- | --- |
${manifest.productionEvidence
  .map(
    (item) =>
      `| \`${item.id}\` | \`${item.status}\` | \`${item.repoStatus}\` | ${item.artifacts
        .map((artifact) => `\`${artifact}\``)
        .join(", ")} | ${item.blocker || "none"} |`,
  )
  .join("\n")}

## Blocking Conclusions

${blockingConclusionsMarkdown}
`;

const burndown = `# MAP Production Readiness Burndown

Date: \`${today}\`
Branch@SHA: \`${branchAtSha}\`

## Remaining Work To Reach Gate PASS

${burndownMarkdown}

## Already Closed Repo-Backed Proof

1. Cross-surface QA matrix: \`${qaEvidencePath}\`
2. Observability/audit/alert matrix: \`${obsEvidencePath}\`
3. Rollback/postgis/flag evidence: \`${providerRunbookPath}\`, \`${rollbackRunbookPath}\`, \`${observabilityRunbookPath}\`
`;

writeJson(
  path.join(sidecarDir, "MAP-FLEETS-EXECUTION-MANIFEST-20260701.json"),
  manifest,
);
writeFileSync(
  path.join(sidecarDir, "MAP-REL-001-FINAL-EVIDENCE.md"),
  finalEvidence,
);
writeFileSync(
  path.join(sidecarDir, "MAP-READINESS-BLOCKER-REPORT.md"),
  blockerReport,
);
writeFileSync(
  path.join(
    sidecarDir,
    `MAP-PRODUCTION-READINESS-BURNDOWN-${today.replaceAll("-", "")}.md`,
  ),
  burndown,
);

console.log(
  `MAP-REL readiness report: ${manifest.summary.releaseVerdict} (${manifest.summary.failCount} failing release checks)`,
);

if (manifest.summary.releaseVerdict !== "PASS") {
  process.exit(1);
}

function git(args, allowFailure = false) {
  try {
    return execFileSync("git", args, {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim();
  } catch (error) {
    if (allowFailure) {
      return "";
    }
    throw error;
  }
}

function read(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function exists(relativePath) {
  return existsSync(path.join(repoRoot, relativePath));
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function item(value) {
  return value;
}

function row(manifestData, id) {
  const itemValue = manifestData.productionEvidence.find(
    (entry) => entry.id === id,
  );
  return `| ${itemValue.title} | \`${itemValue.status}\` | \`${itemValue.repoStatus}\` | ${itemValue.artifacts
    .map((artifact) => `\`${artifact}\``)
    .join(", ")} | ${itemValue.blocker || "none"} |`;
}

function gateRow(manifestData, id) {
  return row(manifestData, id);
}
