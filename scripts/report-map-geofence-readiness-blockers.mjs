#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const finalEvidencePath = path.join(
  repoRoot,
  "support/sidecars/MAP-REL-001/MAP-REL-001-FINAL-EVIDENCE.md",
);
const manifestPath = path.join(
  repoRoot,
  "support/sidecars/MAP-REL-001/MAP-FLEETS-EXECUTION-MANIFEST-20260701.json",
);
const gapDocPath = path.join(
  repoRoot,
  "docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260701.md",
);
const outputJsonPath = path.join(
  repoRoot,
  "support/sidecars/MAP-REL-001/artifacts/readiness-blocker-report.json",
);
const outputMdPath = path.join(
  repoRoot,
  "support/sidecars/MAP-REL-001/MAP-REL-001-READINESS-BLOCKER-REPORT.md",
);
const geoModulePath = path.join(
  repoRoot,
  "apps/api/src/modules/geo/geo.module.ts",
);
const externalGeoProviderPath = path.join(
  repoRoot,
  "apps/api/src/modules/geo/external-geo.provider.ts",
);
const geoProviderConfigPath = path.join(
  repoRoot,
  "apps/api/src/modules/geo/geo-provider-config.service.ts",
);
const providerPreflightPath = path.join(
  repoRoot,
  "scripts/check-map-provider-config.sh",
);

const finalEvidence = fs.readFileSync(finalEvidencePath, "utf8");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const gapDoc = fs.readFileSync(gapDocPath, "utf8");
const geoModule = fs.readFileSync(geoModulePath, "utf8");
const externalGeoProvider = fs.readFileSync(externalGeoProviderPath, "utf8");
const geoProviderConfig = fs.readFileSync(geoProviderConfigPath, "utf8");
const providerPreflight = fs.readFileSync(providerPreflightPath, "utf8");
const driverEvidencePath = path.join(
  repoRoot,
  "support/sidecars/MAP-MOB-DRV-001/MAP-MOB-DRV-001-FINAL-EVIDENCE.md",
);
const driverEvidence = fs.readFileSync(driverEvidencePath, "utf8");
const driverFallbackArtifactPath = path.join(
  repoRoot,
  "support/sidecars/MAP-MOB-DRV-001/artifacts/mobile-simulator-fallback-20260704.json",
);
const driverTask = JSON.parse(
  execFileSync("python3", ["scripts/ai_status.py", "show", "MAP-MOB-DRV-001"], {
    cwd: repoRoot,
    encoding: "utf8",
  }),
);

function hasPlaceholder(text) {
  return /<[^>\n]+>|{{|}}|\bREPLACE_ME\b|\bTODO\b|\bTBD\b/i.test(text);
}

const blockers = [];
const checks = [];
const canonicalGovernanceRoutes = [
  "apps/platform-admin-web/app/service-area-governance/page.tsx",
  "apps/platform-admin-web/app/service-area-governance/service-areas/[serviceAreaId]/page.tsx",
  "apps/platform-admin-web/app/service-area-governance/stop-policies/[stopPolicyId]/page.tsx",
];

for (const gate of ["Gate A", "Gate B", "Gate C", "Gate D", "Gate E"]) {
  const pass = new RegExp(`\\|\\s*\`${gate}\`\\s*\\|\\s*PASS\\s*\\|`).test(
    finalEvidence,
  );
  checks.push({ id: gate, pass });
  if (!pass) blockers.push(`${gate} is not marked PASS in final evidence.`);
}

for (const item of manifest.productionEvidence) {
  const rowPass =
    item.status === "PASS" &&
    new RegExp(`\\|\\s*\`${item.id}\`\\s*\\|\\s*PASS\\s*\\|`).test(finalEvidence);
  checks.push({ id: item.id, pass: rowPass });
  if (!rowPass) {
    blockers.push(`${item.id} is not closed with PASS in final evidence.`);
  }
  for (const artifact of item.artifacts) {
    if (!fs.existsSync(path.join(repoRoot, artifact))) {
      blockers.push(`${item.id} artifact missing: ${artifact}`);
    }
  }
}

const gateBRoutePublicationPass = canonicalGovernanceRoutes.every((routePath) =>
  fs.existsSync(path.join(repoRoot, routePath)),
);
checks.push({ id: "gate-b-canonical-route-publication", pass: gateBRoutePublicationPass });
if (!gateBRoutePublicationPass) {
  blockers.push(
    `Gate B lacks canonical /service-area-governance repo publication: expected ${canonicalGovernanceRoutes.join(", ")}.`,
  );
}

const driverAcceptanceAllowsFallback = driverTask.acceptance.some((item) =>
  item.includes("documented simulator fallback"),
);
const gateDMobileUatPass =
  fs.existsSync(driverFallbackArtifactPath) &&
  driverAcceptanceAllowsFallback &&
  driverTask.status === "done" &&
  driverEvidence.includes("documented simulator fallback");
checks.push({ id: "gate-d-mobile-uat", pass: gateDMobileUatPass });
if (!gateDMobileUatPass) {
  blockers.push(
    "Gate D lacks accepted documented simulator fallback or device UAT evidence in support/sidecars/MAP-MOB-DRV-001.",
  );
}

const geoRuntimeProviderReady =
  geoModule.includes("health.mode === \"external\" ? externalProvider : mockProvider") &&
  externalGeoProvider.includes("class ExternalGeoProvider") &&
  externalGeoProvider.includes("https://maps.googleapis.com/maps/api/geocode/json") &&
  geoProviderConfig.includes("External geo provider adapter is wired for runtime geocode and reverse-geocode requests.");
checks.push({ id: "geo-runtime-provider-ready", pass: geoRuntimeProviderReady });
if (!geoRuntimeProviderReady) {
  blockers.push(
    "Geo runtime is not provider-ready: expected external provider wiring in GeoModule plus a concrete ExternalGeoProvider adapter and pass-state config health.",
  );
}

const providerEnvAligned =
  providerPreflight.includes("MAP_PROVIDER_MODE") &&
  !providerPreflight.includes("MAP_PROVIDER_BACKEND") &&
  providerPreflight.includes("MAP_PROVIDER_SERVER_KEY");
checks.push({ id: "provider-env-alignment", pass: providerEnvAligned });
if (!providerEnvAligned) {
  blockers.push(
    "Provider preflight still diverges from the geofence runtime contract; expected MAP_PROVIDER_MODE plus MAP_PROVIDER_SERVER_KEY handling.",
  );
}

const prereqChecks = [
  {
    id: "provider-prereqs",
    pass:
      finalEvidence.includes("Provider And PostGIS Prerequisites") &&
      !/\|\s*`FLEETS-MAP-008`\s*\|\s*PASS\s*\|/.test(finalEvidence) &&
      finalEvidence.includes("Geo runtime is still mock-only"),
  },
  {
    id: "rollout-rollback",
    pass:
      finalEvidence.includes("Rollout And Rollback") &&
      finalEvidence.includes("Rollback path uses boundary/policy retire plus flag disable"),
  },
  {
    id: "gap-closeout",
    pass:
      gapDoc.includes("Release Closeout Status For `MAP-REL-001`") &&
      gapDoc.includes("No gap row remains") &&
      gapDoc.includes("unassigned in this release closeout view.") &&
      Array.from({ length: 13 }, (_, index) =>
        `MAP-GAP-${String(index + 1).padStart(3, "0")}`,
      ).every((id) => gapDoc.includes(id)),
  },
  {
    id: "placeholder-free",
    pass: !hasPlaceholder(finalEvidence) && !hasPlaceholder(gapDoc),
  },
];

for (const check of prereqChecks) {
  checks.push(check);
  if (!check.pass) {
    blockers.push(`${check.id} check failed.`);
  }
}

const report = {
  taskId: "MAP-REL-001",
  verifier: "report-map-geofence-readiness-blockers",
  status: blockers.length === 0 ? "PASS" : "FAIL",
  branch: execFileSync("git", ["branch", "--show-current"], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim(),
  head: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim(),
  blockers,
  checks,
};

const lines = [
  "# MAP-REL-001 Readiness Blocker Report",
  "",
  `- Task: \`MAP-REL-001\``,
  `- Branch: \`${report.branch}\``,
  `- Head: \`${report.head}\``,
  `- Verifier: \`${report.verifier}\``,
  `- Verdict: \`${report.status}\``,
  "",
  "## Checks",
  "",
  "| Check | Result |",
  "| --- | --- |",
  ...checks.map((check) => `| \`${check.id}\` | ${check.pass ? "PASS" : "FAIL"} |`),
  "",
  "## Blockers",
  "",
  blockers.length === 0
    ? "No readiness blockers remain in the repo-backed release evidence set."
    : blockers.map((blocker) => `- ${blocker}`).join("\n"),
  "",
];

fs.mkdirSync(path.dirname(outputJsonPath), { recursive: true });
fs.writeFileSync(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(outputMdPath, `${lines.join("\n")}\n`);

if (report.status !== "PASS") {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(report, null, 2));
