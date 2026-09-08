import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const script = resolve(__dirname, "../../../../tools/system-remediation/ops-proof/ops-proof.sh");
const ready = {
  metadata: { name: "proof-service", generation: 3 },
  status: {
    observedGeneration: 3,
    latestCreatedRevisionName: "proof-service-00003",
    latestReadyRevisionName: "proof-service-00003",
    conditions: [{ type: "Ready", status: "True" }],
    traffic: [{ revisionName: "proof-service-00003", percent: 100 }],
  },
};

describe("read-only deployment observation", () => {
  it.each([
    [JSON.stringify(ready), 0, "observed", 0],
    [JSON.stringify({ ...ready, status: { ...ready.status, observedGeneration: 2 } }), 0, "observed", 1],
    [JSON.stringify({ ...ready, status: { ...ready.status, latestCreatedRevisionName: "proof-service-00004" } }), 0, "observed", 1],
    [JSON.stringify({ ...ready, metadata: { name: "wrong-service" } }), 0, "invalid_response", 1],
    ["{}", 0, "invalid_response", 1],
    ["not JSON", 0, "invalid_response", 1],
    ["permission denied", 1, "query_failed", 1],
  ])("records query result without inventing source or health proof: %s", (raw, code, state, exit) => {
    const directory = mkdtempSync(resolve(tmpdir(), "ops-inventory-"));
    try {
      // Command spy only; this test does not observe any real cloud service.
      writeFileSync(resolve(directory, "response"), raw);
      writeFileSync(resolve(directory, "gcloud"),
        `#!/bin/sh\ncat '${directory}/response'\nexit ${code}\n`, { mode: 0o755 });
      const output = resolve(directory, "inventory.json");
      const result = spawnSync("bash", [script, "inventory", "--output", output,
        "--project", "proof-project", "--region", "asia-east1", "--service", "proof-service"], {
        encoding: "utf8", env: { ...process.env, PATH: `${directory}:${process.env.PATH}` },
      });
      expect(result.status).toBe(exit);
      const evidence = JSON.parse(readFileSync(output, "utf8"));
      expect(evidence.deployment.state).toBe(state);
      expect(evidence.deployment.observation.stdout).toBe(raw);
      expect(evidence.deployment.observation.exitCode).toBe(code);
      expect(evidence.deployment.observation.command).toEqual([
        "gcloud", "run", "services", "describe", "proof-service", "--project", "proof-project",
        "--region", "asia-east1", "--platform", "managed",
        "--format=json(metadata.name,metadata.generation,status)",
      ]);
      expect(evidence.liveNotPerformed).toContain("application_health");
      expect(evidence.liveNotPerformed).toContain("rollback_exercise");
      if (state === "observed") {
        expect(evidence.deployment.sourceSha).toBeNull();
        expect(evidence.deployment.ready).toBe(exit === 0);
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
