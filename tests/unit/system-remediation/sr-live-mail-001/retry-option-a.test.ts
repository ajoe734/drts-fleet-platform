import { describe, expect, it, vi } from "vitest";
import {
  observeDisclosedRetry,
  retryTestSources,
  verifiedTestLog,
  verifiedRunLogs,
} from "../../../e2e/system-remediation/sr-live-mail-001/retry-option-a";
import type {
  DeliveryReceipt,
  MailRunnerConfig,
} from "../../../e2e/system-remediation/sr-live-mail-001/mail-acceptance-runner";
import { UatEvidenceRecorder } from "../../../e2e/system-remediation/shared";

const sha = "a".repeat(40);
const origin = "https://api.mail-test.org";
const id = "5155c156-0000-0000-0000-000000000001";
const config = {
  candidateSha: sha,
  tenantId: "tenant-1",
  apiOrigin: origin,
} as MailRunnerConfig;
const revision = "drts-dev-api-00001-abc";
function negative(): DeliveryReceipt {
  return {
    status: "failed",
    providerMessageId: null,
    attempts: 1,
    lastOutcome: "failed",
    errorCode: "SMTP_RECIPIENT_NOT_ALLOWLISTED",
    readback: {
      delivery_id: id,
      tenant_id: config.tenantId,
      attempts: [
        {
          outcome: "failed",
          retryable: false,
          error_code: "SMTP_RECIPIENT_NOT_ALLOWLISTED",
          acknowledgement: null,
        },
      ],
    },
  };
}
function cloudLog() {
  return {
    insertId: "run-log",
    timestamp: new Date().toISOString(),
    resource: {
      type: "cloud_run_revision",
      labels: {
        project_id: "drts-dev-devcc-20260825",
        location: "us-central1",
        service_name: "drts-dev-api",
        revision_name: revision,
      },
    },
    httpRequest: {
      status: 201,
      requestMethod: "POST",
      requestUrl: origin + "/api/internal/scheduled-tasks/mail-outbox/drain",
    },
  };
}
function fixture() {
  const recorder = new UatEvidenceRecorder({
    taskId: "sr-live-mail-001",
    baseSha: sha,
  });
  const run = vi.fn(async (file: string, args: string[]) => {
    if (file === "git") return "";
    if (file === "gh") {
      const path = args[1]!;
      const source = retryTestSources.find(
        (row) =>
          path.includes(String(row.run)) || path.includes(String(row.job)),
      )!;
      if (path.endsWith("/logs"))
        return source.suites
          .map((suite) => `✓ ${suite} (2 tests) 10ms`)
          .join("\n");
      return JSON.stringify({
        head_sha: source.sha,
        run_id: source.run,
        status: "completed",
        conclusion: "success",
      });
    }
    if (args[1] === "services")
      return JSON.stringify({
        status: { traffic: [{ percent: 100, revisionName: revision }] },
      });
    if (args[1] === "revisions")
      return JSON.stringify({
        metadata: {
          creationTimestamp: new Date(Date.now() - 60_000).toISOString(),
        },
        spec: {
          containers: [{ env: [{ name: "DRTS_CANDIDATE_SHA", value: sha }] }],
        },
      });
    if (args[2]!.includes("cloud_scheduler_job"))
      return JSON.stringify([
        {
          insertId: "scheduler-log",
          timestamp: new Date(Date.now() - 1000).toISOString(),
          resource: {
            labels: {
              project_id: "drts-dev-devcc-20260825",
              location: "us-central1",
              job_id: "drts-dev-mail-outbox-drain",
            },
          },
          jsonPayload: {
            "@type":
              "type.googleapis.com/google.cloud.scheduler.logging.AttemptFinished",
            status: "OK",
          },
        },
      ]);
    const row = cloudLog();
    row.timestamp = new Date(Date.now() - 1000).toISOString();
    return JSON.stringify([row]);
  });
  return { run, recorder };
}
describe("user-authorized retry option A", () => {
  it("retrieves pinned tests and same-candidate live logs, discloses the limitation and never mutates infrastructure", async () => {
    const { run, recorder } = fixture();
    await expect(
      observeDisclosedRetry(config, id, negative(), recorder, run),
    ).resolves.toBe(true);
    const evidence = JSON.stringify(recorder.finalize("failed"));
    expect(evidence).toContain('"live_retryable_failure_observed":false');
    expect(evidence).toContain("historical_tests_plus_live_scheduler");
    expect(evidence).toContain("scheduler-log");
    expect(evidence).toContain("run-log");
    expect(evidence).toContain(
      "No live retryable SMTP failure was observed or injected",
    );
    expect(recorder.finalize("failed").unimplementedLiveSurfaces).toEqual([]);
    expect(
      run.mock.calls.every(
        ([file, args]) =>
          file !== "gcloud" ||
          ["describe", "read"].includes(args[1]!) ||
          args[2] === "describe",
      ),
    ).toBe(true);
  });
  it.each(["tenant", "retryable", "ack", "two-attempts"])(
    "rejects invalid live permanent failure: %s",
    async (kind) => {
      const receipt = negative();
      const attempts = receipt.readback!.attempts as Record<string, unknown>[];
      if (kind === "tenant") receipt.readback!.tenant_id = "other";
      if (kind === "retryable") attempts[0]!.retryable = true;
      if (kind === "ack")
        attempts[0]!.acknowledgement = { provider_message_id: "bad" };
      if (kind === "two-attempts") attempts.push({ ...attempts[0] });
      const { run, recorder } = fixture();
      await expect(
        observeDisclosedRetry(config, id, receipt, recorder, run),
      ).rejects.toThrow();
      expect(run).not.toHaveBeenCalled();
    },
  );
  it.each([
    "ancestry",
    "ci-sha",
    "ci-failed",
    "test-skipped",
    "revision",
    "split-traffic",
    "logs",
  ])(
    "fails closed for unavailable or mismatched evidence: %s",
    async (kind) => {
      const { run: good, recorder } = fixture();
      const run = async (file: string, args: string[]) => {
        if (kind === "ancestry" && file === "git")
          throw new Error("not ancestor");
        const value = await good(file, args);
        if (kind === "ci-sha" && file === "gh" && !args[1]!.endsWith("/logs"))
          return value.replace(/"head_sha":"[a-f0-9]+"/, '"head_sha":"wrong"');
        if (kind === "ci-failed" && file === "gh")
          return value.replace('"success"', '"failure"');
        if (kind === "test-skipped" && args[1]?.endsWith("/logs"))
          return value.replace("✓", "↓");
        if (kind === "revision" && args[1] === "revisions")
          return value.replace(sha, "b".repeat(40));
        if (kind === "split-traffic" && args[1] === "services")
          return value.replace("100", "50");
        if (kind === "logs" && file === "gcloud" && args[0] === "logging")
          return "[]";
        return value;
      };
      await expect(
        observeDisclosedRetry(config, id, negative(), recorder, run),
      ).rejects.toThrow();
      expect(JSON.stringify(recorder.finalize("failed"))).not.toContain(
        '"retry_option_a"',
      );
    },
  );
  it("accepts ANSI output but rejects skipped tests inside a nominally green suite", () => {
    expect(
      verifiedTestLog("\u001b[32m✓\u001b[39m suite.ts (2 tests) 10ms", [
        "suite.ts",
      ]),
    ).toEqual([{ path: "suite.ts", passed: 2 }]);
    expect(() =>
      verifiedTestLog("✓ suite.ts (2 tests | 1 skipped) 10ms", ["suite.ts"]),
    ).toThrow();
  });
  it.each(["revision", "method", "status", "path", "stale", "project"])(
    "rejects unrelated Cloud Run evidence: %s",
    (kind) => {
      const row = cloudLog();
      if (kind === "revision") row.resource.labels.revision_name = "other";
      if (kind === "project") row.resource.labels.project_id = "other";
      if (kind === "method") row.httpRequest.requestMethod = "OPTIONS";
      if (kind === "status") row.httpRequest.status = 200;
      if (kind === "path") row.httpRequest.requestUrl = origin + "/health";
      if (kind === "stale") row.timestamp = "2020-01-01T00:00:00Z";
      expect(() =>
        verifiedRunLogs(
          [row],
          revision,
          origin,
          new Date(Date.now() - 60_000).toISOString(),
          new Date(Date.now() + 1000).toISOString(),
        ),
      ).toThrow();
    },
  );
});
