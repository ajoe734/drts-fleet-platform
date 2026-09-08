import { execFile, execFileSync } from "node:child_process";
import * as path from "node:path";
import { test, expect } from "@playwright/test";
import { UatEvidenceRecorder } from "../shared";

// This runner verifies local services. It is not deployed API or DB acceptance.
test("SR-QA-WEBHOOK-001: controlled HTTP service regression", async () => {
  const recorder = new UatEvidenceRecorder({
    taskId: "SR-QA-WEBHOOK-001",
    baseSha: execFileSync("git", ["rev-parse", "origin/dev"], {
      encoding: "utf8",
    }).trim(),
  });
  const artifactPath = path.resolve(
    __dirname,
    "evidence-sr-qa-webhook-001.json",
  );
  try {
    if (process.env.DRTS_WEBHOOK_LIVE === "1") {
      throw new Error(
        "Live acceptance unavailable: deployed authenticated API, PostgreSQL restart, C113/C114 providers and C115 scheduler evidence have not been collected.",
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
    recorder.recordConsole(
      "info",
      "Local in-memory service readback; timeout uses a test-injected fetch deadline. No deployed API or PostgreSQL acceptance.",
    );
    recorder.recordLiveLimitation(
      "C111-C112",
      "Authenticated HTTP API, DB readback/restart deduplication, automatic retry worker and default transport timeout remain unverified.",
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
