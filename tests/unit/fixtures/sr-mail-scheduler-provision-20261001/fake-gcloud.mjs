#!/usr/bin/env node
// Offline stand-in for `gcloud` used only by
// tests/unit/sr-mail-scheduler-provision-20261001.test.ts to exercise
// infra/gcp/dev/scheduler/confirm-job-attempt.sh's completion-decision logic
// without any live GCP calls. It emulates just enough of `gcloud scheduler
// jobs run` and `gcloud logging read` to drive that script's branches:
// reading a small fixture of synthetic log records (set via
// FAKE_GCLOUD_FIXTURE) and applying the same job_id/location/requestMethod/
// route/timestamp filters the real Cloud Logging query in
// confirm-job-attempt.sh expresses, so a stale, wrong-job, wrong-region, or
// wrong-method fixture record is excluded exactly as the live filter would
// exclude it. Scheduler records expose a scalar `status` field (a
// google.rpc.Code name string, e.g. "OK"/"NOT_FOUND") mirroring the real
// AttemptFinished log's `jsonPayload.status` shape -- not a nested
// `status.code` object, which belongs to the unrelated `Job` REST resource.
//
// R5 fix (SR-MAIL-SCHEDULER-PROVISION-20261001 F2, success-path gap): this
// used to hard-code its output shape per record `type` regardless of the
// `--format=value(...)` string the script under test actually passed, so it
// could not have caught a mismatch between that selector and the real
// `confirm-job-attempt.sh` projection -- it was validating the script's
// *filter* logic, not its *field selection*. It now parses the requested
// `value(...)` field list out of the real `--format` argument and projects
// each field from the matched record generically (`projectField` below), so
// changing the selector in confirm-job-attempt.sh without updating this
// fixture's field map is the only way to get a wrong column out of this
// stand-in -- the same failure mode a live `gcloud logging read` would
// produce.

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
  const location =
    filter.match(/resource\.labels\.location="([^"]+)"/)?.[1] ?? null;
  const requestMethod =
    filter.match(/httpRequest\.requestMethod="([^"]+)"/)?.[1] ?? null;
  const routeSubstring =
    filter.match(/httpRequest\.requestUrl=~"([^"]+)"/)?.[1] ?? null;

  const records = Array.isArray(fixture.records) ? fixture.records : [];
  const candidates = records.filter((record) => {
    if (isSchedulerQuery && record.type !== "scheduler") return false;
    if (isRunQuery && record.type !== "run") return false;
    if (jobId && record.jobId !== jobId) return false;
    if (location && (record.location ?? "us-central1") !== location) {
      return false;
    }
    if (
      requestMethod &&
      (record.httpMethod ?? "POST") !== requestMethod
    ) {
      return false;
    }
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

  // Field map mirrors exactly what each gcloud `value(...)` selector token
  // means against a real AttemptFinished / Cloud Run HTTP request-log
  // record -- `jsonPayload.status` is the Scheduler outcome scalar,
  // `httpRequest.status` is the HTTP response code on either record type.
  const fieldValue = (field) => {
    switch (field) {
      case "timestamp":
        return record.timestamp ?? "";
      case "jsonPayload.status":
        return record.status ?? "";
      case "httpRequest.status":
        return record.httpStatus ?? "";
      default:
        return "";
    }
  };

  const formatArg = args.find((arg) => arg.startsWith("--format="));
  const formatValue = formatArg ? formatArg.slice("--format=".length) : "";
  const fieldListMatch = formatValue.match(/^value\((.*)\)$/);
  const fields = fieldListMatch
    ? fieldListMatch[1].split(",").map((field) => field.trim())
    : ["timestamp"];

  process.stdout.write(`${fields.map(fieldValue).join("\t")}\n`);
  process.exit(0);
}

process.exit(1);
