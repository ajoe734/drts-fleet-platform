import { execFile, execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { test, expect } from "@playwright/test";
import { UatEvidenceRecorder } from "../shared/evidence-recorder";

// Local PostgreSQL and HTTP acceptance; deployed authentication remains separate.
test("SR-QA-WEBHOOK-001: controlled HTTP service regression", async () => {
  test.setTimeout(90_000);
  const recorder = new UatEvidenceRecorder({
    taskId: "SR-QA-WEBHOOK-001",
    baseSha: execFileSync("git", ["rev-parse", "origin/dev"], {
      encoding: "utf8",
    }).trim(),
  });
  const artifactPath = path.resolve(
    __dirname,
    process.env.DRTS_WEBHOOK_LIVE === "1"
      ? "evidence-live-unavailable.json"
      : "evidence-sr-qa-webhook-001.json",
  );
  try {
    if (process.env.DRTS_WEBHOOK_LIVE === "1") {
      throw new Error(
        "Live acceptance unavailable: deployed authenticated API, OS process restart, C113/C114 providers and C115 scheduler evidence have not been collected.",
      );
    }
    const result = await new Promise<{ stdout: string; stderr: string }>(
      (resolve, reject) => {
        execFile(
          "pnpm",
          [
            "exec",
            "vitest",
            "run",
            "tests/unit/system-remediation/sr-qa-webhook-001/sr-qa-webhook-001.test.ts",
          ],
          { cwd: process.cwd(), timeout: 25_000 },
          (error, stdout, stderr) =>
            error
              ? reject(new Error(`${stdout}\n${stderr}`))
              : resolve({ stdout, stderr }),
        );
      },
    );
    const resourceLine = result.stdout
      .split("\n")
      .find((line) => line.startsWith("SR-QA-WEBHOOK-001 timeout resources "));
    expect(
      resourceLine,
      "real timeout run must emit its resource IDs",
    ).toBeDefined();
    const resource = JSON.parse(
      resourceLine!.slice("SR-QA-WEBHOOK-001 timeout resources ".length),
    );
    recorder.recordResourceId("webhook", resource.webhookId, {
      tenantId: resource.tenantId,
    });
    recorder.recordResourceId("delivery", resource.deliveryId, {
      webhookId: resource.webhookId,
    });
    recorder.recordConsole("info", result.stdout);
    const dbEvidencePath = path.resolve(__dirname, "evidence-postgres.json");
    const dbOutput = execFileSync(
      "bash",
      ["tests/unit/system-remediation/sr-qa-webhook-001/run-postgres.sh"],
      {
        cwd: process.cwd(),
        timeout: 60_000,
        encoding: "utf8",
        env: { ...process.env, DRTS_WEBHOOK_DB_EVIDENCE: dbEvidencePath },
      },
    );
    const dbEvidence = JSON.parse(readFileSync(dbEvidencePath, "utf8"));
    expect(dbEvidence.evidence).toHaveLength(2);
    for (const entry of dbEvidence.evidence) {
      recorder.recordResourceId(
        "postgres_acceptance",
        entry.resource.tenantId,
        entry.resource,
      );
    }
    recorder.recordConsole("info", dbOutput);

    recorder.recordConsole(
      "info",
      "Local PostgreSQL key readback and automatic webhook retry after service reinitialization passed. Timeout uses a test-injected deadline; deployed API and OS process restart remain unverified.",
    );
    recorder.recordLiveLimitation(
      "C111-C112",
      "Authenticated HTTP API, OS process restart and default transport timeout remain unverified. Local DB readback, service reinitialization, automatic retry and outbox deduplication passed.",
    );
    recorder.recordLiveLimitation(
      "C113",
      "ERP/SSO/bank sandbox mapping, permissions, retransmission and reconciliation remain unverified; fixture ledger tests are local smoke only.",
    );
    recorder.recordLiveLimitation(
      "C114",
      "Real geocoding/routes/ETA, quota failures and stale location remain unverified; MockGeoProvider is local smoke only.",
    );
    recorder.recordLiveLimitation(
      "C115",
      "Persistent scheduler deployment, backlog, restart and catch-up remain unverified; callback fixtures are local smoke only.",
    );
    recorder.finalize("passed");
  } catch (error) {
    recorder.recordError(error instanceof Error ? error : String(error));
    recorder.finalize("failed");
    throw error;
  } finally {
    recorder.saveToFile(artifactPath);
  }
});
