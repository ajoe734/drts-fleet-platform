#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const __dirname = path.dirname(scriptPath);
const defaultWorkspaceRoot = path.resolve(__dirname, "..");
const defaultStatusRoot = path.resolve(
  process.env.AI_STATUS_ROOT ||
    process.env.ORCH_STATUS_ROOT ||
    defaultWorkspaceRoot,
);

const helperTasks = [
  {
    id: "MAP-QA-002-SIDECAR-PLAN",
    artifact: "support/sidecars/MAP-QA-002/MAP-QA-002-SIDECAR-PLAN.md",
  },
  {
    id: "MAP-REL-001-SIDECAR-GATE-AUDIT",
    artifact:
      "support/sidecars/MAP-REL-001/MAP-REL-001-GATE-EVIDENCE-TRACKER.md",
  },
  {
    id: "MAP-GAP-COVERAGE-SIDECAR",
    artifact: "support/sidecars/MAP-REL-001/MAP-GAP-TO-TASK-COVERAGE-MATRIX.md",
  },
];

const foundationTasks = [
  "MAP-PROD-000",
  "MAP-INFRA-001",
  "MAP-BE-004",
  "MAP-BE-006",
  "MAP-FE-OPS-001",
];

const gates = [
  {
    id: "Gate A",
    label: "Gate A: Callcenter safe to dispatch",
    tasks: [
      "MAP-BE-001",
      "MAP-BE-002",
      "MAP-BE-003",
      "MAP-BE-005",
      "MAP-UI-001",
      "MAP-FE-CALL-001",
      "MAP-QA-001",
      "MAP-QA-002",
      "MAP-OBS-001",
    ],
    scenarios: [
      "E2E-MAP-001",
      "E2E-MAP-002",
      "E2E-MAP-003",
      "E2E-MAP-005",
      "E2E-MAP-006",
    ],
    observability: [
      "geo.pin.confirmed",
      "service_area.evaluated",
      "coordinate_less_booking_attempts_total",
      "service_area_evaluations_total",
    ],
  },
  {
    id: "Gate B",
    label: "Gate B: Governance safe to publish",
    tasks: [
      "MAP-UI-002",
      "MAP-UI-002-HARDEN-001",
      "MAP-UI-002-INTEGRATE-001",
      "MAP-FE-ADM-001",
      "MAP-QA-002",
      "MAP-OBS-001",
    ],
    scenarios: ["E2E-MAP-002"],
    observability: [
      "service_area.policy.published",
      "service_area.policy.retired",
      "service_area_geometry_mutations_total",
    ],
  },
  {
    id: "Gate C",
    label: "Gate C: Ops safe to operate",
    tasks: ["MAP-BE-003", "MAP-BE-005", "MAP-QA-002"],
    scenarios: ["E2E-MAP-001", "E2E-MAP-006"],
    observability: [
      "service_area_evaluations_total",
      "service_area_policy_blocks_total",
      "stale",
      "no-location",
    ],
  },
  {
    id: "Gate D",
    label: "Gate D: Driver safe to navigate",
    tasks: ["MAP-MOB-DRV-001", "MAP-BE-003", "MAP-BE-005", "MAP-QA-002"],
    scenarios: ["E2E-MAP-007"],
    observability: ["driver", "heartbeat", "policy denial"],
  },
  {
    id: "Gate E",
    label: "Gate E: Degraded safe",
    tasks: [
      "MAP-QA-001",
      "MAP-QA-002",
      "MAP-OBS-001",
      "MAP-FE-TEN-001",
      "MAP-FE-CON-001",
      "MAP-FE-CALL-001",
    ],
    scenarios: ["E2E-MAP-003", "E2E-MAP-004", "E2E-MAP-005", "E2E-MAP-007"],
    observability: [
      "map_provider_errors_total",
      "map_geocode_latency_ms",
      "map_provider_quota_usage_percent",
      "coordinate_less_booking_attempts_total",
      "geo.manual_override.created",
      "provider outage",
      "address ambiguity",
      "policy denial",
    ],
  },
];

const e2eScenarios = [
  "E2E-MAP-001",
  "E2E-MAP-002",
  "E2E-MAP-003",
  "E2E-MAP-004",
  "E2E-MAP-005",
  "E2E-MAP-006",
  "E2E-MAP-007",
];

const qaCommandMarkers = [
  {
    marker: "pnpm --filter @drts/shared-test-fixtures typecheck",
    acceptedVerdicts: ["pass"],
  },
  {
    marker: "pnpm --filter @drts/shared-test-fixtures test",
    acceptedVerdicts: ["pass"],
  },
  {
    marker: "pnpm --filter @drts/shared-test-fixtures lint",
    acceptedVerdicts: ["pass"],
  },
  { marker: "pnpm --filter @drts/api test", acceptedVerdicts: ["pass"] },
  { marker: "pnpm --filter @drts/ui-web test", acceptedVerdicts: ["pass"] },
  {
    marker: "pnpm --filter @drts/ops-console-web typecheck",
    acceptedVerdicts: ["pass"],
  },
  {
    marker: "pnpm --filter @drts/platform-admin-web typecheck",
    acceptedVerdicts: ["pass"],
  },
  {
    marker: "pnpm --filter @drts/driver-app test",
    acceptedVerdicts: ["pass", "external-gated"],
  },
  {
    marker:
      "pnpm exec playwright test -c playwright.map-geofence-harness.config.ts",
    acceptedVerdicts: ["pass"],
  },
  { marker: "pnpm test:e2e", acceptedVerdicts: ["pass", "substituted"] },
];

const qaAssertionMarkers = [
  "pickup/dropoff coordinates",
  "coordinate provenance",
  "service-area decision snapshot",
  "policy/version IDs",
  "Backend blocks no-pickup/not-serviceable",
  "Policy publish/retire audit",
  "Provider outage",
  "coordinate-less attempt",
  "manual override",
  "geometry mutation",
];

const observabilityMetrics = [
  "map_geocode_requests_total",
  "map_geocode_latency_ms",
  "map_provider_errors_total",
  "map_provider_quota_usage_percent",
  "coordinate_less_booking_attempts_total",
  "service_area_evaluations_total",
  "service_area_policy_blocks_total",
  "service_area_geometry_mutations_total",
];

const observabilityAuditEvents = [
  "geo.address.resolved",
  "geo.pin.confirmed",
  "service_area.evaluated",
  "service_area.policy.published",
  "service_area.policy.retired",
  "geo.manual_override.created",
];

const observabilityAlerts = [
  "MapProviderErrorRateHigh",
  "MapProviderLatencyHigh",
  "MapProviderQuotaUsageHigh",
  "MapProviderQuotaUsageCritical",
  "CoordinateLessDispatchAttemptHigh",
  "ServiceAreaPolicyBlockSpike",
  "ServiceAreaEvaluationUnavailable",
];

const observabilityRunbookTopics = [
  "provider outage",
  "address ambiguity",
  "policy denial",
  "postgis",
  "manual override",
];

const gapIds = Array.from(
  { length: 13 },
  (_value, index) => `MAP-GAP-${String(index + 1).padStart(3, "0")}`,
);

const relEvidenceMarkers = [
  "Gate A",
  "Gate B",
  "Gate C",
  "Gate D",
  "Gate E",
  "rollout",
  "rollback",
  "postgis",
  "provider",
  "quota",
  "mock provider",
  "smoke",
  "MAP-QA-002",
  "MAP-OBS-001",
  ...gapIds,
];

const defaultPaths = {
  statusFile: "ai-status.json",
  qaEvidence: "support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE.md",
  obsEvidence: "support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md",
  relEvidence: "support/sidecars/MAP-REL-001/MAP-REL-001-FINAL-EVIDENCE.md",
  verifierDoc:
    "support/sidecars/MAP-REL-001/MAP-PRODUCTION-READINESS-VERIFIER.md",
};

let options;
try {
  options = parseArgs(process.argv.slice(2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n\n`);
  printUsage();
  process.exit(2);
}
const workspaceRoot = resolveFromRoot(
  defaultWorkspaceRoot,
  options.root ?? ".",
);
const statusFile = resolveInputPath(
  defaultStatusRoot,
  options.statusFile || defaultPaths.statusFile,
);
const qaEvidencePath = resolveInputPath(
  workspaceRoot,
  options.qaEvidence || defaultPaths.qaEvidence,
);
const obsEvidencePath = resolveInputPath(
  workspaceRoot,
  options.obsEvidence || defaultPaths.obsEvidence,
);
const relEvidencePath = resolveInputPath(
  workspaceRoot,
  options.relEvidence || defaultPaths.relEvidence,
);
const verifierDocPath = resolveInputPath(
  workspaceRoot,
  options.verifierDoc || defaultPaths.verifierDoc,
);

if (options.help) {
  printUsage();
  process.exit(0);
}

let state;
try {
  state = loadJson(statusFile);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(2);
}
const taskMap = new Map(
  (state.tasks || [])
    .filter((task) => task && typeof task === "object")
    .map((task) => [String(task.id || ""), task]),
);
const archivedTaskIds = new Set(
  (state.archived_task_ids || []).map((taskId) => String(taskId)),
);

const report = {
  script: relativeToRoot(workspaceRoot, scriptPath),
  workspaceRoot,
  statusRoot: defaultStatusRoot,
  statusFile: relativeToRoot(defaultStatusRoot, statusFile),
  evidence: {
    qa: relativeToRoot(workspaceRoot, qaEvidencePath),
    obs: relativeToRoot(workspaceRoot, obsEvidencePath),
    rel: relativeToRoot(workspaceRoot, relEvidencePath),
    verifierDoc: relativeToRoot(workspaceRoot, verifierDocPath),
  },
  sections: [],
};

const helperSection = makeSection("Helper Context");
for (const helper of helperTasks) {
  const task = taskMap.get(helper.id);
  if (!task) {
    if (archivedTaskIds.has(helper.id)) {
      addOk(helperSection, `${helper.id} is archived as done.`);
    } else {
      addFailure(helperSection, `${helper.id} is missing from ai-status.json.`);
      continue;
    }
  } else if (task.status !== "done") {
    addFailure(
      helperSection,
      `${helper.id} must be done; current status is ${task.status}.`,
    );
  } else {
    addOk(helperSection, `${helper.id} is done.`);
  }

  const artifactPath = resolveInputPath(workspaceRoot, helper.artifact);
  if (existsSync(artifactPath)) {
    addOk(
      helperSection,
      `Helper artifact exists: ${relativeToRoot(workspaceRoot, artifactPath)}.`,
    );
  } else {
    addWarning(
      helperSection,
      `Helper artifact is not present in this worktree: ${relativeToRoot(workspaceRoot, artifactPath)}.`,
    );
  }
}
report.sections.push(helperSection);

const foundationSection = makeSection("Foundation Tasks");
for (const taskId of foundationTasks) {
  checkTaskDone(foundationSection, taskMap, taskId);
}
report.sections.push(foundationSection);

const evidenceSection = makeSection("Final Evidence Files");
const qaEvidence = checkEvidenceFile(
  evidenceSection,
  qaEvidencePath,
  workspaceRoot,
  "MAP-QA-002 final evidence",
);
const obsEvidence = checkEvidenceFile(
  evidenceSection,
  obsEvidencePath,
  workspaceRoot,
  "MAP-OBS-001 final evidence",
);
const relEvidence = checkEvidenceFile(
  evidenceSection,
  relEvidencePath,
  workspaceRoot,
  "MAP-REL-001 final evidence",
);
const verifierDoc = checkEvidenceFile(
  evidenceSection,
  verifierDocPath,
  workspaceRoot,
  "MAP production readiness verifier support doc",
);

if (relEvidence.exists) {
  for (const marker of relEvidenceMarkers) {
    if (!includesMarker(relEvidence.text, marker)) {
      addFailure(
        evidenceSection,
        `REL evidence is missing marker ${formatMarker(marker)}.`,
      );
    }
  }
  for (const gate of gates) {
    if (!includesPassingMarker(relEvidence.text, gate.id)) {
      addFailure(
        evidenceSection,
        `REL evidence is missing explicit PASS verdict for ${formatMarker(gate.id)}.`,
      );
    }
  }
  if (
    !["pass", "fail", "external-gated"].some((marker) =>
      includesMarker(relEvidence.text, marker),
    )
  ) {
    addFailure(
      evidenceSection,
      "REL evidence must record explicit gate verdicts such as pass, fail, or external-gated.",
    );
  }
}

if (verifierDoc.exists) {
  const requiredVerifierMarkers = [
    "not production evidence by itself",
    "MAP-QA-002",
    "MAP-OBS-001",
    "MAP-REL-001",
    "node scripts/verify-map-geofence-production-readiness.mjs",
  ];
  for (const marker of requiredVerifierMarkers) {
    if (!includesMarker(verifierDoc.text, marker)) {
      addFailure(
        evidenceSection,
        `Verifier support doc is missing marker ${formatMarker(marker)}.`,
      );
    }
  }
}
report.sections.push(evidenceSection);

const e2eSection = makeSection("E2E Coverage");
checkTaskDone(e2eSection, taskMap, "MAP-QA-002");
if (qaEvidence.exists) {
  for (const scenario of e2eScenarios) {
    if (!includesFinalMarkPassingMarker(qaEvidence.text, scenario)) {
      addFailure(
        e2eSection,
        `QA evidence is missing explicit PASS marker for ${formatMarker(scenario)}.`,
      );
    } else {
      addOk(e2eSection, `QA evidence marks ${scenario} as PASS.`);
    }
  }
  for (const command of qaCommandMarkers) {
    if (
      !includesTableRowAcceptedVerdictMarker(
        qaEvidence.text,
        command.marker,
        command.acceptedVerdicts,
      )
    ) {
      addFailure(
        e2eSection,
        `QA evidence is missing accepted result for command ${formatMarker(command.marker)}.`,
      );
    } else {
      addOk(
        e2eSection,
        `QA evidence includes accepted result for command ${command.marker}.`,
      );
    }
  }
  for (const marker of qaAssertionMarkers) {
    if (!includesPassingMarker(qaEvidence.text, marker)) {
      addFailure(
        e2eSection,
        `QA evidence is missing explicit PASS marker for assertion ${formatMarker(marker)}.`,
      );
    } else {
      addOk(e2eSection, `QA evidence marks assertion ${marker} as PASS.`);
    }
  }
}
report.sections.push(e2eSection);

const obsSection = makeSection("Observability Coverage");
checkTaskDone(obsSection, taskMap, "MAP-OBS-001");
if (obsEvidence.exists) {
  for (const marker of observabilityMetrics) {
    if (!includesPassingMarker(obsEvidence.text, marker)) {
      addFailure(
        obsSection,
        `OBS evidence is missing explicit PASS marker for metric ${formatMarker(marker)}.`,
      );
    } else {
      addOk(obsSection, `OBS evidence marks metric ${marker} as PASS.`);
    }
  }
  for (const marker of observabilityAuditEvents) {
    if (!includesPassingMarker(obsEvidence.text, marker)) {
      addFailure(
        obsSection,
        `OBS evidence is missing explicit PASS marker for audit event ${formatMarker(marker)}.`,
      );
    } else {
      addOk(obsSection, `OBS evidence marks audit event ${marker} as PASS.`);
    }
  }
  for (const marker of observabilityAlerts) {
    if (!includesPassingMarker(obsEvidence.text, marker)) {
      addFailure(
        obsSection,
        `OBS evidence is missing explicit PASS marker for alert ${formatMarker(marker)}.`,
      );
    } else {
      addOk(obsSection, `OBS evidence marks alert ${marker} as PASS.`);
    }
  }
  for (const marker of observabilityRunbookTopics) {
    if (!includesPassingMarker(obsEvidence.text, marker)) {
      addFailure(
        obsSection,
        `OBS evidence is missing explicit PASS marker for runbook distinction ${formatMarker(marker)}.`,
      );
    } else {
      addOk(obsSection, `OBS evidence marks runbook topic ${marker} as PASS.`);
    }
  }
}
report.sections.push(obsSection);

for (const gate of gates) {
  const gateSection = makeSection(gate.label);
  for (const taskId of gate.tasks) {
    checkTaskDone(gateSection, taskMap, taskId);
  }

  if (qaEvidence.exists) {
    for (const scenario of gate.scenarios) {
      if (!includesFinalMarkPassingMarker(qaEvidence.text, scenario)) {
        addFailure(
          gateSection,
          `${gate.id} requires explicit QA PASS evidence for ${formatMarker(scenario)}.`,
        );
      } else {
        addOk(gateSection, `${gate.id} has QA PASS evidence for ${scenario}.`);
      }
    }
  }

  if (obsEvidence.exists) {
    for (const marker of gate.observability) {
      if (!includesPassingMarker(obsEvidence.text, marker)) {
        addFailure(
          gateSection,
          `${gate.id} is missing observability PASS marker ${formatMarker(marker)}.`,
        );
      } else {
        addOk(
          gateSection,
          `${gate.id} observability marks ${formatMarker(marker)} as PASS.`,
        );
      }
    }
  }

  if (relEvidence.exists) {
    if (!includesPassingMarker(relEvidence.text, gate.id)) {
      addFailure(
        gateSection,
        `REL evidence is missing explicit PASS verdict for ${gate.id}.`,
      );
    } else {
      addOk(gateSection, `REL evidence marks ${gate.id} as PASS.`);
    }
  }

  report.sections.push(gateSection);
}

const doNotClaimSection = makeSection("Do-Not-Claim Verdict");
const failureCount = countChecks(report.sections, "fail");
if (failureCount > 0) {
  addFailure(
    doNotClaimSection,
    `Readiness is blocked by ${failureCount} failing check(s). Do not claim map/geofence production ready.`,
  );
} else {
  addOk(
    doNotClaimSection,
    "All configured checks passed. This verifier is still only a fail-closed checklist and not production evidence by itself.",
  );
}
report.sections.push(doNotClaimSection);

report.summary = {
  ok: countChecks(report.sections, "ok"),
  warnings: countChecks(report.sections, "warn"),
  failures: failureCount,
  verdict: failureCount > 0 ? "fail" : "pass",
};

if (options.json) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  printReport(report);
}

process.exit(report.summary.failures > 0 ? 1 : 0);

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--help":
      case "-h":
        parsed.help = true;
        break;
      case "--json":
        parsed.json = true;
        break;
      case "--root":
      case "--status-file":
      case "--qa-evidence":
      case "--obs-evidence":
      case "--rel-evidence":
      case "--verifier-doc": {
        const value = argv[index + 1];
        if (!value) {
          throw new Error(`Missing value for ${arg}.`);
        }
        parsed[
          arg
            .slice(2)
            .replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase())
        ] = value;
        index += 1;
        break;
      }
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return parsed;
}

function printUsage() {
  process.stdout
    .write(`Usage: node scripts/verify-map-geofence-production-readiness.mjs [options]

Options:
  --root <path>          Override workspace root for support artifacts. Defaults to the current repo worktree.
  --status-file <path>   Override ai-status.json path. Defaults to AI_STATUS_ROOT / ORCH_STATUS_ROOT / workspace root.
  --qa-evidence <path>   Override MAP-QA-002 final evidence path.
  --obs-evidence <path>  Override MAP-OBS-001 final evidence path.
  --rel-evidence <path>  Override MAP-REL-001 final evidence path.
  --verifier-doc <path>  Override verifier support doc path.
  --json                 Print machine-readable JSON output.
  --help, -h             Show this help text.
`);
}

function makeSection(name) {
  return { name, checks: [] };
}

function addOk(section, message) {
  section.checks.push({ level: "ok", message });
}

function addWarning(section, message) {
  section.checks.push({ level: "warn", message });
}

function addFailure(section, message) {
  section.checks.push({ level: "fail", message });
}

function checkTaskDone(section, taskMapValue, taskId) {
  const task = taskMapValue.get(taskId);
  if (!task) {
    if (archivedTaskIds.has(taskId)) {
      addOk(section, `${taskId} is archived as done.`);
      return true;
    }
    addFailure(section, `${taskId} is missing from ai-status.json.`);
    return false;
  }
  if (task.status !== "done") {
    addFailure(
      section,
      `${taskId} must be done for production readiness; current status is ${task.status}.`,
    );
    return false;
  }
  addOk(section, `${taskId} is done.`);
  return true;
}

function checkEvidenceFile(section, filePath, rootDirValue, label) {
  if (!existsSync(filePath)) {
    addFailure(
      section,
      `${label} is missing: ${relativeToRoot(rootDirValue, filePath)}.`,
    );
    return { exists: false, text: "" };
  }
  addOk(section, `${label} exists: ${relativeToRoot(rootDirValue, filePath)}.`);
  return { exists: true, text: readFileSync(filePath, "utf8") };
}

function countChecks(sections, level) {
  return sections
    .flatMap((section) => section.checks)
    .filter((check) => check.level === level).length;
}

function printReport(reportValue) {
  const verdict = reportValue.summary.verdict.toUpperCase();
  process.stdout.write("MAP/Geofence Production Readiness Verifier\n");
  process.stdout.write(`Workspace root: ${reportValue.workspaceRoot}\n`);
  process.stdout.write(`Status root: ${reportValue.statusRoot}\n`);
  process.stdout.write(`Status file: ${reportValue.statusFile}\n`);
  process.stdout.write(`Verdict: ${verdict}\n`);
  process.stdout.write("\n");

  for (const section of reportValue.sections) {
    process.stdout.write(`${section.name}\n`);
    if (section.checks.length === 0) {
      process.stdout.write("  [warn] No checks recorded.\n");
      continue;
    }
    for (const check of section.checks) {
      process.stdout.write(`  [${check.level}] ${check.message}\n`);
    }
    process.stdout.write("\n");
  }

  process.stdout.write(
    `Summary: ${reportValue.summary.ok} ok, ${reportValue.summary.warnings} warnings, ${reportValue.summary.failures} failures.\n`,
  );
}

function includesMarker(text, marker) {
  return normalize(text).includes(normalize(marker));
}

function includesPassingMarker(text, marker) {
  return includesAcceptedVerdictMarker(text, marker, ["pass"]);
}

function includesFinalMarkPassingMarker(text, marker) {
  const finalMarkRegex = new RegExp(
    `${escapeRegExp(marker)}\\s*(?:\`)?\\s*:`,
    "i",
  );
  return String(text || "")
    .split(/\r?\n/)
    .some(
      (line) =>
        finalMarkRegex.test(line) &&
        !/<\s*(pass|result|verdict)\b/i.test(line) &&
        /(^|[:|\s,\-])pass(\s|[|,\-.]|$)/i.test(line),
    );
}

function includesTableRowAcceptedVerdictMarker(text, marker, verdicts) {
  return String(text || "")
    .split(/\r?\n/)
    .some(
      (line) =>
        line.trimStart().startsWith("|") &&
        includesAcceptedVerdictMarker(line, marker, verdicts),
    );
}

function includesAcceptedVerdictMarker(text, marker, verdicts) {
  const verdictPattern = verdicts.map(escapeRegExp).join("|");
  const verdictRegex = new RegExp(
    `(^|[:|\\s,\\-])(${verdictPattern})(\\s|[|,\\-.]|$)`,
    "i",
  );
  return String(text || "")
    .split(/\r?\n/)
    .some(
      (line) =>
        includesMarker(line, marker) &&
        !/<\s*(pass|result|verdict)\b/i.test(line) &&
        verdictRegex.test(line),
    );
}

function normalize(value) {
  return String(value || "").toLowerCase();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatMarker(marker) {
  return `\`${marker}\``;
}

function loadJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "unknown JSON parse failure";
    throw new Error(`Unable to read ${filePath}: ${reason}`);
  }
}

function resolveInputPath(rootDirValue, inputPath) {
  return path.isAbsolute(inputPath)
    ? path.normalize(inputPath)
    : path.resolve(rootDirValue, inputPath);
}

function resolveFromRoot(rootDirValue, inputPath) {
  return path.isAbsolute(inputPath)
    ? path.normalize(inputPath)
    : path.resolve(rootDirValue, inputPath);
}

function relativeToRoot(rootDirValue, filePath) {
  const relativePath = path.relative(rootDirValue, filePath);
  if (!relativePath || relativePath.startsWith("..")) {
    return filePath;
  }
  return relativePath;
}
