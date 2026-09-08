import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const script = resolve(
  __dirname,
  "../../../../tools/system-remediation/ops-proof/ops-proof.sh",
);

describe("SR-OPS-PROOF-001 isolated ops proof harness", () => {
  it("records provenance and explicitly retains live-operation gates", () => {
    const directory = mkdtempSync(resolve(tmpdir(), "ops-proof-"));
    const output = resolve(directory, "inventory.json");
    try {
      execFileSync("bash", [script, "inventory", "--output", output]);
      const evidence = JSON.parse(readFileSync(output, "utf8"));
      expect(evidence.taskId).toBe("SR-OPS-PROOF-001");
      expect(evidence.baseSha).toMatch(/^[a-f0-9]{40}$/);
      expect(evidence.candidateSha).toMatch(/^[a-f0-9]{40}$/);
      expect(evidence.liveNotPerformed).toContain("cloud_restore");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("fails closed before any restore when target is not an isolated loopback database", () => {
    const result = spawnSync(
      "bash",
      [
        script,
        "restore",
        "--snapshot",
        script,
        "--isolated-database-url",
        "postgresql://ops.example.invalid/drts_fleet_platform",
        "--output",
        "/tmp/ops-proof-should-not-exist.json",
      ],
      { encoding: "utf8" },
    );
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("loopback");
  });

  it("requires all three workload families instead of silently omitting one", () => {
    const result = spawnSync(
      "bash",
      [script, "load", "--booking-url", "http://127.0.0.1:9", "--output", "/tmp/nope.json"],
      { encoding: "utf8" },
    );
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("booking, dispatch, and report");
  });

  it("refuses to turn this preparation harness into a cloud load test", () => {
    const result = spawnSync(
      "bash",
      [
        script,
        "load",
        "--booking-url", "https://load.example.invalid/booking",
        "--dispatch-url", "https://load.example.invalid/dispatch",
        "--report-url", "https://load.example.invalid/report",
        "--output", "/tmp/nope.json",
      ],
      { encoding: "utf8" },
    );
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("SR-LIVE-OPS-001");
  });
});
