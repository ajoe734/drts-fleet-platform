#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const GATES = [
  {
    id: "A",
    title: "Callcenter safe to dispatch",
    tasks: [
      "MAP-BE-001",
      "MAP-BE-002",
      "MAP-BE-003",
      "MAP-BE-004",
      "MAP-BE-005",
      "MAP-UI-001",
      "MAP-FE-CALL-001",
      "MAP-FE-OPS-001",
      "MAP-QA-001",
      "MAP-QA-002",
      "MAP-OBS-001",
    ],
  },
  {
    id: "B",
    title: "Governance safe to publish",
    tasks: [
      "MAP-BE-006",
      "MAP-UI-002",
      "MAP-UI-002-HARDEN-001",
      "MAP-UI-002-INTEGRATE-001",
      "MAP-FE-ADM-001",
      "MAP-FE-CALL-001",
      "MAP-QA-002",
      "MAP-OBS-001",
    ],
  },
  {
    id: "C",
    title: "Ops safe to operate",
    tasks: [
      "MAP-BE-003",
      "MAP-BE-005",
      "MAP-FE-OPS-001",
      "MAP-QA-001",
      "MAP-QA-002",
    ],
  },
  {
    id: "D",
    title: "Driver safe to navigate",
    tasks: ["MAP-BE-003", "MAP-BE-005", "MAP-MOB-DRV-001", "MAP-QA-002"],
  },
  {
    id: "E",
    title: "Degraded safe",
    tasks: [
      "MAP-INFRA-001",
      "MAP-UI-001",
      "MAP-BE-004",
      "MAP-BE-005",
      "MAP-FE-CALL-001",
      "MAP-FE-TEN-001",
      "MAP-FE-CON-001",
      "MAP-QA-001",
      "MAP-QA-002",
      "MAP-OBS-001",
    ],
  },
];

const REQUIRED_EVIDENCE = [
  {
    id: "qa-final-evidence",
    path: "support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE.md",
    marks: [
      "E2E-MAP-001",
      "E2E-MAP-002",
      "E2E-MAP-003",
      "E2E-MAP-004",
      "E2E-MAP-005",
      "E2E-MAP-006",
      "E2E-MAP-007",
    ],
  },
  {
    id: "obs-final-evidence",
    path: "support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md",
    marks: [
      "OBS-MAP-PROVIDER-OUTAGE",
      "OBS-MAP-ADDRESS-AMBIGUITY",
      "OBS-MAP-POLICY-DENIAL",
      "OBS-MAP-COORDINATELESS-ATTEMPT",
      "OBS-MAP-MANUAL-OVERRIDE",
      "OBS-MAP-GEOMETRY-MUTATION",
    ],
  },
  {
    id: "rel-final-evidence",
    path: "support/sidecars/MAP-REL-001/MAP-REL-001-FINAL-EVIDENCE.md",
    marks: ["Gate A", "Gate B", "Gate C", "Gate D", "Gate E"],
  },
];

const REQUIRED_COMMANDS = [
  "pnpm --filter @drts/api test",
  "pnpm --filter @drts/ui-web test",
  "pnpm --filter @drts/ops-console-web typecheck",
  "pnpm --filter @drts/platform-admin-web typecheck",
  "pnpm --filter @drts/driver-app test",
  "pnpm exec playwright test -c playwright.map-geofence-harness.config.ts",
  "pnpm test:e2e",
];

function parseArgs(argv) {
  const options = {
    json: false,
    root: process.cwd(),
    statusFile: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--root") {
      options.root = argv[++index];
    } else if (arg === "--status-file") {
      options.statusFile = argv[++index];
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  options.root = path.resolve(options.root);
  options.statusFile = path.resolve(
    options.statusFile ?? path.join(options.root, "ai-status.json"),
  );
  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/verify-map-geofence-production-readiness.mjs [options]

Options:
  --root <path>         Repository root to inspect. Defaults to cwd.
  --status-file <path>  ai-status.json path. Defaults to <root>/ai-status.json.
  --json                Emit machine-readable JSON.

The verifier fails closed unless Gate A-E tasks are done and final QA/OBS/REL
evidence files contain explicit PASS marks for required E2E scenarios, observability
topics, release gates, and command families.`);
}

function readStatus(statusFile) {
  const raw = fs.readFileSync(statusFile, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed.tasks)) {
    throw new Error(`Invalid status file: ${statusFile} does not contain tasks[]`);
  }
  return parsed.tasks;
}

function fileContent(root, relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    return null;
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function markHasPass(content, mark) {
  const escaped = mark.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`${escaped}[^\\n]*(PASS|Pass|pass)`).test(content);
}

function evaluateTasks(tasks) {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const gateResults = GATES.map((gate) => {
    const taskResults = gate.tasks.map((taskId) => {
      const task = byId.get(taskId);
      return {
        taskId,
        status: task?.status ?? "missing",
        pass: task?.status === "done",
      };
    });

    return {
      gate: `Gate ${gate.id}`,
      title: gate.title,
      pass: taskResults.every((task) => task.pass),
      tasks: taskResults,
    };
  });

  return gateResults;
}

function evaluateEvidence(root) {
  return REQUIRED_EVIDENCE.map((evidence) => {
    const content = fileContent(root, evidence.path);
    if (content === null) {
      return {
        id: evidence.id,
        path: evidence.path,
        pass: false,
        missingFile: true,
        missingPassMarks: evidence.marks,
      };
    }

    const missingPassMarks = evidence.marks.filter(
      (mark) => !markHasPass(content, mark),
    );
    return {
      id: evidence.id,
      path: evidence.path,
      pass: missingPassMarks.length === 0,
      missingFile: false,
      missingPassMarks,
    };
  });
}

function evaluateCommands(root) {
  const combinedEvidence = REQUIRED_EVIDENCE.map((evidence) =>
    fileContent(root, evidence.path),
  )
    .filter(Boolean)
    .join("\n");

  const missingCommands = REQUIRED_COMMANDS.filter(
    (command) => !combinedEvidence.includes(command),
  );

  return {
    pass: missingCommands.length === 0,
    missingCommands,
  };
}

function renderText(report) {
  const lines = [];
  lines.push("Map/geofence production readiness audit");
  lines.push(`Status: ${report.pass ? "PASS" : "FAIL"}`);
  lines.push("");
  lines.push("Gate task status:");

  for (const gate of report.gates) {
    lines.push(
      `- ${gate.gate} ${gate.title}: ${gate.pass ? "PASS" : "FAIL"}`,
    );
    for (const task of gate.tasks.filter((item) => !item.pass)) {
      lines.push(`  - ${task.taskId}: ${task.status}`);
    }
  }

  lines.push("");
  lines.push("Final evidence files:");
  for (const evidence of report.evidence) {
    lines.push(`- ${evidence.path}: ${evidence.pass ? "PASS" : "FAIL"}`);
    if (evidence.missingFile) {
      lines.push("  - file is missing");
    }
    for (const mark of evidence.missingPassMarks) {
      lines.push(`  - missing explicit PASS mark: ${mark}`);
    }
  }

  lines.push("");
  lines.push(`Command evidence: ${report.commands.pass ? "PASS" : "FAIL"}`);
  for (const command of report.commands.missingCommands) {
    lines.push(`  - missing command evidence: ${command}`);
  }

  lines.push("");
  lines.push(
    report.pass
      ? "Production-ready claim is allowed by this verifier, subject to human review of linked artifacts."
      : "Production-ready claim is blocked. Do not claim Gate A-E pass until every FAIL above is resolved.",
  );
  return lines.join("\n");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const tasks = readStatus(options.statusFile);
  const gates = evaluateTasks(tasks);
  const evidence = evaluateEvidence(options.root);
  const commands = evaluateCommands(options.root);

  const report = {
    pass:
      gates.every((gate) => gate.pass) &&
      evidence.every((item) => item.pass) &&
      commands.pass,
    root: options.root,
    statusFile: options.statusFile,
    gates,
    evidence,
    commands,
  };

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(renderText(report));
  }

  process.exit(report.pass ? 0 : 1);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}
