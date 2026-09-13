import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

// Commands are argv arrays, never shell text. No resource discovery or mutation.
const [output, baseSha, candidateSha, project, region, service] = process.argv.slice(2);
const execute = (command, args) => {
  const result = spawnSync(command, args, {
    encoding: "utf8", timeout: 30_000, maxBuffer: 2 * 1024 * 1024,
    env: { ...process.env, CLOUDSDK_CORE_DISABLE_PROMPTS: "1" },
  });
  return {
    command: [command, ...args], observedAt: new Date().toISOString(),
    exitCode: result.status, signal: result.signal,
    stdout: result.stdout ?? "", stderr: result.stderr ?? "",
    error: result.error?.message ?? null,
  };
};
const sources = [
  "docs/02-architecture/phase1-operational-workload-sla-degradation-baseline-20260430.md",
  "docs/03-runbooks/operational-sla-degradation-runbook.md",
  "docs/03-runbooks/production-deploy-rail-spec-20260519.md",
  ".github/workflows/deploy-dev.yml",
];
const receipt = {
  taskId: "SR-OPS-PROOF-001", kind: "read_only_inventory",
  observedAt: new Date().toISOString(), baseSha, candidateSha,
  sources: sources.map((path) => ({
    path, sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
  })),
  localTools: ["node", "psql", "pg_restore"].map((tool) => execute(tool, ["--version"])),
  deployment: { state: "not_requested", resource: null, observation: null },
  liveNotPerformed: ["cloud_backup_read", "cloud_restore", "production_load",
    "physical_device_validation", "application_health", "rollback_exercise"],
};
let failed = false;
if (project || region || service) {
  if (![project, region, service].every((value) => /^[a-z][a-z0-9-]{0,62}$/.test(value ?? ""))) {
    receipt.deployment.state = "invalid_resource_arguments";
    failed = true;
  } else {
    receipt.deployment.resource = { project, region, service };
    // Select only status/identity; never export container env or secret mappings.
    const observation = execute("gcloud", ["run", "services", "describe", service,
      "--project", project, "--region", region, "--platform", "managed",
      "--format=json(metadata.name,metadata.generation,status)"]);
    receipt.deployment.observation = observation;
    receipt.deployment.state = "query_failed";
    if (observation.exitCode === 0 && !observation.error) {
      try {
        const data = JSON.parse(observation.stdout);
        const status = data.status;
        if (data.metadata?.name !== service || !status ||
            !Array.isArray(status.conditions) || !Array.isArray(status.traffic) ||
            typeof status.latestReadyRevisionName !== "string") {
          throw new Error("Cloud Run response lacks service identity/revision/conditions/traffic");
        }
        receipt.deployment.state = "observed";
        receipt.deployment.ready = status.conditions.find((item) => item.type === "Ready")?.status === "True"
          && data.metadata.generation != null
          && String(status.observedGeneration) === String(data.metadata.generation)
          && status.latestCreatedRevisionName === status.latestReadyRevisionName;
        receipt.deployment.latestReadyRevision = status.latestReadyRevisionName;
        receipt.deployment.traffic = status.traffic;
        // Revision names and Ready are observations, not immutable source/health proof.
        receipt.deployment.sourceSha = null;
        receipt.deployment.sourceShaState = "requires_image_build_provenance";
      } catch (error) {
        receipt.deployment.state = "invalid_response";
        observation.error = error.message;
      }
    }
    failed = receipt.deployment.state !== "observed" || !receipt.deployment.ready;
  }
} else {
  receipt.liveNotPerformed.push("cloud_deployment_read");
}
writeFileSync(output, `${JSON.stringify(receipt, null, 2)}\n`);
process.exitCode = failed ? 1 : 0;
