#!/usr/bin/env node
// Offline stand-in for `gcloud` used only by
// tests/unit/sr-mail-scheduler-provision-20261001.test.ts to exercise
// infra/gcp/dev/scheduler/confirm-job-attempt.sh's completion-decision logic
// without any live GCP calls. It emulates just enough of `gcloud scheduler
// jobs run` and `gcloud logging read` to drive that script's branches:
// reading a small fixture of synthetic log records (set via
// FAKE_GCLOUD_FIXTURE) and applying the same job_id/route/timestamp filters
// the real Cloud Logging query in confirm-job-attempt.sh expresses, so a
// stale or wrong-job fixture record is excluded exactly as the live filter
// would exclude it.

import { appendFileSync, readFileSync } from "node:fs";

const args = process.argv.slice(2);

const fixturePath = process.env.FAKE_GCLOUD_FIXTURE;
const fixture = fixturePath
  ? JSON.parse(readFileSync(fixturePath, "utf8"))
  : { records: [] };

const callLogPath = process.env.FAKE_GCLOUD_CALL_LOG;
if (callLogPath) {
  appendFileSync(callLogPath, `${JSON.stringify(args)}\n`);
}

if (args[0] === "scheduler" && args[1] === "jobs" && args[2] === "run") {
  process.exit(0);
}

if (args[0] === "logging" && args[1] === "read") {
  const filter = args[2] || "";
  const isSchedulerQuery = filter.includes("cloud_scheduler_job");
  const isRunQuery = filter.includes("cloud_run_revision");
  const minTimestamp = filter.match(/timestamp>="([^"]+)"/)?.[1] ?? null;
  const jobId = filter.match(/resource\.labels\.job_id="([^"]+)"/)?.[1] ?? null;
  const routeSubstring =
    filter.match(/httpRequest\.requestUrl=~"([^"]+)"/)?.[1] ?? null;

  const records = Array.isArray(fixture.records) ? fixture.records : [];
  const candidates = records.filter((record) => {
    if (isSchedulerQuery && record.type !== "scheduler") return false;
    if (isRunQuery && record.type !== "run") return false;
    if (jobId && record.jobId !== jobId) return false;
    if (
      routeSubstring &&
      record.requestUrl &&
      !record.requestUrl.includes(routeSubstring)
    ) {
      return false;
    }
    if (minTimestamp && record.timestamp < minTimestamp) return false;
    return true;
  });

  if (candidates.length === 0) {
    process.exit(0);
  }
  const record = candidates[0];
  if (record.type === "scheduler") {
    process.stdout.write(`${record.timestamp}\t${record.statusCode ?? ""}\n`);
  } else {
    process.stdout.write(`${record.timestamp}\t${record.httpStatus}\n`);
  }
  process.exit(0);
}

process.exit(1);
