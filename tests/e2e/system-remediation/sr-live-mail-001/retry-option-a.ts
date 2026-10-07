import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { DeliveryReceipt, MailRunnerConfig } from "./mail-acceptance-runner";
import { schedulerCorroboration } from "./retry-profile";
import type { UatEvidenceRecorder } from "../shared";

const repository = "ajoe734/drts-fleet-platform";
const project = "drts-dev-devcc-20260825";
const region = "us-central1";
const drainPath = "/api/internal/scheduled-tasks/mail-outbox/drain";
const retrySuite = "tests/unit/system-remediation/sr-mail-retry-schedule-20261001/sr-mail-retry-schedule-20261001.test.ts";
const postgresSuite = "tests/integration/system-remediation/sr-mail-retry-schedule-20261001/postgres-outbox-concurrency.integration.test.ts";

// Immutable, already merged dependency evidence. These are historical test
// executions, never represented as SMTP failures observed on the live target.
export const retryTestSources = [
  { sha: "2ff9fc641727f838602be852dfd3833649e07fc6", merge: "52aab7a14d4ff1d4801fe7890b257d589aceab9b", run: 36877528664,
    job: 110420985211, suites: [retrySuite, postgresSuite, "tests/unit/system-remediation/sr-notify-001/notification-delivery.test.ts"] },
  { sha: "f65ff86d55721f7ad86fed64b7d6483882ea10fc", merge: "a5bc50654e43e7e4d9fcbf75b8a4f93ad5521760", run: 36952519280,
    job: 110668455916, suites: [retrySuite, postgresSuite, "tests/unit/sr-mail-scheduler-provision-20261001.test.ts"] },
] as const;

type Command = (file: string, args: string[]) => Promise<string>;
const command: Command = async (file, args) => {
  const { stdout } = await promisify(execFile)(file, args, {
    timeout: 30_000, maxBuffer: 32 * 1024 * 1024,
  });
  return stdout;
};

export function verifiedTestLog(log: string, suites: readonly string[]) {
  // gh may render ESC as the printable ^[ sequence when saving a log.
  const lines = log.replace(/(?:\u001b|\^\[)\[[0-9;]*m/g, "").split("\n");
  return suites.map((suite) => {
    const line = lines.find((entry) => entry.includes(`✓ ${suite} (`));
    const result = line?.slice(line.indexOf(`✓ ${suite} (`) + suite.length + 3);
    const count = result?.match(/^\(([1-9][0-9]*) tests?\)\s/);
    assert(count, "Dependency suite missing, failed or skipped");
    return { path: suite, passed: Number(count[1]) };
  });
}

type RunLog = {
  insertId?: string; timestamp?: string;
  resource?: { type?: string; labels?: Record<string, string> };
  httpRequest?: { status?: number; requestMethod?: string; requestUrl?: string };
};
export function verifiedRunLogs(logs: unknown, revision: string, origin: string, start: string, end: string) {
  assert(Array.isArray(logs), "Missing Cloud Run request logs");
  const matches = (logs as RunLog[]).filter((row) =>
    row.insertId && row.resource?.type === "cloud_run_revision" &&
    row.resource.labels?.project_id === project &&
    row.resource.labels.location === region &&
    row.resource.labels.service_name === "drts-dev-api" &&
    row.resource.labels.revision_name === revision &&
    row.httpRequest?.status === 201 && row.httpRequest.requestMethod === "POST" &&
    row.httpRequest.requestUrl === new URL(drainPath, origin).href &&
    Date.parse(row.timestamp ?? "") >= Date.parse(start) &&
    Date.parse(row.timestamp ?? "") <= Date.parse(end));
  assert(matches.length, "No same-candidate Cloud Run drain 201 evidence");
  return matches.map((row) => ({ insert_id: row.insertId, timestamp: row.timestamp, revision, status: 201 }));
}

/** User option A, 2026-10-05: historical tests + live scheduler availability +
 * live permanent-failure tracking. This deliberately does NOT prove a live
 * retryable SMTP failure. All commands are read-only; there is no drain call.
 */
export async function observeDisclosedRetry(
  config: MailRunnerConfig, negativeId: string, negative: DeliveryReceipt,
  recorder: UatEvidenceRecorder, run: Command = command,
) {
  assert(/^[a-f0-9-]{36}$/.test(negativeId), "Invalid permanent failure delivery ID");
  const attempts = negative.readback?.attempts;
  assert(negative.status === "failed" && !negative.providerMessageId &&
    negative.errorCode === "SMTP_RECIPIENT_NOT_ALLOWLISTED" &&
    negative.readback?.delivery_id === negativeId && negative.readback?.tenant_id === config.tenantId &&
    Array.isArray(attempts) && attempts.length === 1 &&
    attempts[0].outcome === "failed" && attempts[0].retryable === false &&
    attempts[0].error_code === "SMTP_RECIPIENT_NOT_ALLOWLISTED" &&
    attempts[0].acknowledgement === null, "Missing durable non-retryable live failure");

  const tests = [];
  for (const source of retryTestSources) {
    await run("git", ["merge-base", "--is-ancestor", source.sha, config.candidateSha]);
    await run("git", ["merge-base", "--is-ancestor", source.merge, config.candidateSha]);
    const metadata = JSON.parse(await run("gh", ["api", `repos/${repository}/actions/runs/${source.run}`]));
    assert(metadata.head_sha === source.sha && metadata.status === "completed" && metadata.conclusion === "success", "Dependency candidate CI is not successful");
    const job = JSON.parse(await run("gh", ["api", `repos/${repository}/actions/jobs/${source.job}`]));
    assert(job.run_id === source.run && job.head_sha === source.sha && job.status === "completed" && job.conclusion === "success", "Dependency test job mismatch");
    const log = await run("gh", ["api", `repos/${repository}/actions/jobs/${source.job}/logs"]);
    tests.push({ candidate_sha: source.sha, merge_sha: source.merge,
      job_url: `https://github.com/${repository}/actions/runs/${source.run}/job/${source.job}`,
      suites: verifiedTestLog(log, source.suites) });
  }

  const cloud = async (...args: string[]) => JSON.parse(await run("gcloud", [...args, `--project=${project}`, "--format=json"]));
  const service = await cloud("run", "services", "describe", "drts-dev-api", `--region=${region}`);
  const traffic = service.status?.traffic;
  assert(Array.isArray(traffic) && traffic.length === 1 && traffic[0].percent === 100, "Ambiguous retry target revision");
  const revision = traffic[0].revisionName;
  assert(typeof revision === "string" && /^drts-dev-api-[a-z0-9-]+$/.test(revision), "Invalid revision");
  const deployment = await cloud("run", "revisions", "describe", revision, `--region=${region}`);
  const environment = deployment.spec?.containers?.[0]?.env;
  assert(Array.isArray(environment) && environment.some((entry: {name: string; value?: string}) => entry.name === "DRTS_CANDIDATE_SHA" && entry.value === config.candidateSha), "Retry revision candidate mismatch");
  const created = Date.parse(deployment.metadata?.creationTimestamp);
  assert(Number.isFinite(created), "Missing revision creation time");
  const end = new Date().toISOString();
  const start = new Date(Math.max(created, Date.parse(end) - 15 * 60_000)).toISOString();
  const window = `timestamp>="${start}" AND timestamp<="${end}"`;
  const scheduler = schedulerCorroboration(await cloud("logging", "read", `resource.type="cloud_scheduler_job" AND resource.labels.job_id="drts-dev-mail-outbox-drain" AND ${window}`, "--limit=100"), start, end);
  const requests = verifiedRunLogs(await cloud("logging", "read", `resource.type="cloud_run_revision" AND resource.labels.revision_name="${revision}" AND httpRequest.status=201 AND ${window}`, "--limit=1000"), revision, config.apiOrigin, start, end);
  recorder.recordResourceId("retry_option_a", negativeId, {
    candidate_sha: config.candidateSha, mode: "historical_tests_plus_live_scheduler",
    live_retryable_failure_observed: false, fault_injection_performed: false,
    tests, started_at: start, ended_at: end, scheduler, cloud_run: requests,
    permanent_failure_delivery_id: negativeId,
  });
  recorder.recordLiveLimitation("live retryable SMTP failure", "Not observed or injected. User option A (2026-10-05) accepts historical unit/Postgres tests, live Scheduler completions and same-candidate Cloud Run 201s, plus live non-retryable failure tracking; scheduler availability is not a per-delivery retry trace.");
  return true;
}
