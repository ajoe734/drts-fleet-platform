import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  realReadDeliveryReceipt,
  type DeliveryReceipt,
  type MailRunnerConfig,
} from "./mail-acceptance-runner";
import { observeInvitationMailbox } from "./mailbox-observer";
import type { UatEvidenceRecorder } from "../shared";

type Attempt = {
  attempt_id: string;
  outcome: string;
  retryable: boolean;
  started_at: string;
  finished_at: string;
};
function attempts(receipt: DeliveryReceipt) {
  assert(
    Array.isArray(receipt.readback?.attempts),
    "No durable retry attempts",
  );
  return receipt.readback.attempts as Attempt[];
}
export function assertQueuedRetry(receipt: DeliveryReceipt) {
  const last = attempts(receipt).at(-1);
  const due = Date.parse(String(receipt.readback?.next_attempt_at));
  assert(
    receipt.status === "queued" &&
      last?.outcome === "failed" &&
      last.retryable === true &&
      last.attempt_id &&
      Number.isFinite(due) &&
      due > Date.parse(last.finished_at),
    "Need an actual queued retryable failure; an already-sent or permanent failure is not a retry observation",
  );
  return due;
}
export function assertBackgroundTransition(
  before: DeliveryReceipt,
  after: DeliveryReceipt,
) {
  const due = assertQueuedRetry(before);
  const previous = attempts(before);
  const next = attempts(after);
  const success = next.at(-1);
  assert(
    after.status === "sent" &&
      after.providerMessageId &&
      success?.outcome === "sent" &&
      next.length > previous.length &&
      Date.parse(success.started_at) >= due &&
      previous.every(
        (entry, index) =>
          entry.attempt_id === next[index]?.attempt_id &&
          entry.outcome === next[index]?.outcome,
      ),
    "No durable, due-time background retry transition",
  );
}

type SchedulerLog = {
  insertId?: string;
  timestamp?: string;
  resource?: { labels?: Record<string, string> };
  jsonPayload?: { "@type"?: string; status?: string };
  httpRequest?: { status?: number };
};
export function schedulerCorroboration(
  logs: unknown,
  start: string,
  end: string,
) {
  assert(Array.isArray(logs), "Missing Scheduler completion logs");
  const matches = (logs as SchedulerLog[]).filter((entry) => {
    const labels = entry.resource?.labels;
    const status = entry.jsonPayload?.status;
    const timestamp = Date.parse(entry.timestamp ?? "");
    // A failure wins over the HTTP field. Cloud Run requests/OPTIONS and
    // Scheduler AttemptStarted do not prove completion.
    return (
      entry.insertId &&
      labels?.job_id === "drts-dev-mail-outbox-drain" &&
      labels.location === "us-central1" &&
      labels.project_id === "drts-dev-devcc-20260825" &&
      entry.jsonPayload?.["@type"] ===
        "type.googleapis.com/google.cloud.scheduler.logging.AttemptFinished" &&
      timestamp >= Date.parse(start) &&
      timestamp <= Date.parse(end) &&
      (status === "OK" ||
        (!status &&
          (entry.httpRequest?.status ?? 0) >= 200 &&
          (entry.httpRequest?.status ?? 0) < 300))
    );
  });
  assert(
    matches.length > 0,
    "No successful same-window Scheduler AttemptFinished evidence",
  );
  return matches.map((row) => ({
    insert_id: row.insertId,
    timestamp: row.timestamp,
    job_id: row.resource!.labels!.job_id,
    status: row.jsonPayload!.status ?? null,
    http_status: row.httpRequest?.status ?? null,
  }));
}

/** Observe only: never call drain, change SMTP settings, or synthesize failures.
 * The before/after receipts prove background work; Scheduler completion logs
 * corroborate availability in the same interval, not a per-delivery trace.
 */
export async function observeBackgroundRetry(
  config: MailRunnerConfig,
  deliveryId: string,
  recorder: UatEvidenceRecorder,
) {
  assert(
    /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(deliveryId),
    "Invalid retry delivery ID",
  );
  const started = new Date().toISOString();
  const before = await realReadDeliveryReceipt(config, deliveryId, recorder);
  assertQueuedRetry(before);
  recorder.recordResourceId("retry_before", deliveryId, before.readback);
  const deadline = Date.now() + 300_000;
  let after = before;
  while (Date.now() < deadline && after.status === "queued") {
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    after = await realReadDeliveryReceipt(config, deliveryId, recorder);
  }
  recorder.recordResourceId("retry_after", deliveryId, after.readback);
  assertBackgroundTransition(before, after);
  const observation = await observeInvitationMailbox(config, deliveryId);
  recorder.recordResourceId("retry_mailbox", deliveryId, observation);
  // Allow logging ingestion to settle without triggering any job ourselves.
  const end = new Date(Date.now() + 60_000).toISOString();
  for (let attempt = 0; attempt < 6; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    const filter =
      'resource.type="cloud_scheduler_job" AND resource.labels.job_id="drts-dev-mail-outbox-drain" AND resource.labels.location="us-central1" AND timestamp>="' +
      started +
      '" AND timestamp<="' +
      end +
      '"';
    const { stdout } = await promisify(execFile)(
      "gcloud",
      [
        "logging",
        "read",
        filter,
        "--project=drts-dev-devcc-20260825",
        "--format=json",
        "--limit=30",
      ],
      { timeout: 20_000, maxBuffer: 1_048_576 },
    );
    try {
      const logs = schedulerCorroboration(JSON.parse(stdout), started, end);
      recorder.recordResourceId("retry_scheduler_corroboration", deliveryId, {
        started_at: started,
        end_at: end,
        completions: logs,
      });
      return true;
    } catch {
      if (attempt === 5)
        throw new Error(
          "Scheduler corroboration unavailable; background retry remains incomplete",
        );
    }
  }
  return false;
}
