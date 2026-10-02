import { describe, expect, it } from "vitest";
import {
  assertQueuedRetry,
  assertBackgroundTransition,
  schedulerCorroboration,
} from "../../../e2e/system-remediation/sr-live-mail-001/retry-profile";
import type { DeliveryReceipt } from "../../../e2e/system-remediation/sr-live-mail-001/mail-acceptance-runner";
import { deepToSnakeCase } from "../../../../apps/api/src/common/snake-case.interceptor";
import type { MailDeliveryReceiptView } from "../../../../packages/contracts/src/index";

const first = {
  attemptId: "attempt-1",
  attemptNo: 1,
  startedAt: "2026-10-02T01:00:00Z",
  finishedAt: "2026-10-02T01:00:01Z",
  outcome: "failed" as const,
  errorCode: "SMTP_TRANSIENT_FAILURE",
  retryable: true,
  acknowledgement: null,
};
const next = {
  ...first,
  attemptId: "attempt-2",
  attemptNo: 2,
  startedAt: "2026-10-02T01:01:00Z",
  finishedAt: "2026-10-02T01:01:01Z",
  outcome: "sent" as const,
  errorCode: null,
  retryable: false,
  acknowledgement: {
    provider: "smtp",
    providerMessageId: "gmail-queue-id",
    response: "masked",
    acceptedAt: "2026-10-02T01:01:01Z",
  },
};
function receipts(): [DeliveryReceipt, DeliveryReceipt] {
  const before: MailDeliveryReceiptView = {
    deliveryId: "delivery-1",
    tenantId: "tenant-1",
    status: "queued",
    queuedAt: "2026-10-02T01:00:00Z",
    sentAt: null,
    nextAttemptAt: "2026-10-02T01:00:31Z",
    attempts: [first],
  };
  const after: MailDeliveryReceiptView = {
    ...before,
    status: "sent",
    sentAt: "2026-10-02T01:01:01Z",
    nextAttemptAt: null,
    attempts: [first, next],
  };
  return [before, after].map((value) => ({
    status: value.status,
    providerMessageId:
      value.attempts.at(-1)?.acknowledgement?.providerMessageId ?? null,
    attempts: value.attempts.length,
    lastOutcome: value.attempts.at(-1)!.outcome,
    errorCode: value.attempts.at(-1)!.errorCode,
    readback: deepToSnakeCase(value) as Record<string, unknown>,
  })) as [DeliveryReceipt, DeliveryReceipt];
}
describe("background retry requires actual receipt progression", () => {
  it("accepts a real wire-shaped queued failure followed by a successful new attempt after its due time", () => {
    const [before, after] = receipts();
    expect(() => assertBackgroundTransition(before, after)).not.toThrow();
  });
  it("does not turn permanent allowlist rejection or an already-sent record into retry evidence", () => {
    const [before, after] = receipts();
    expect(() => assertQueuedRetry(after)).toThrow(/actual queued/);
    expect(() => assertQueuedRetry({ ...before, status: "failed" })).toThrow();
    const permanent = structuredClone(before);
    (
      permanent.readback!.attempts as Array<{ retryable: boolean }>
    )[0]!.retryable = false;
    expect(() => assertQueuedRetry(permanent)).toThrow();
  });
  it("rejects reused attempts, missing acknowledgements and attempts earlier than next_attempt_at", () => {
    const [before, after] = receipts();
    expect(() =>
      assertBackgroundTransition(before, { ...after, providerMessageId: null }),
    ).toThrow();
    expect(() => assertBackgroundTransition(before, before)).toThrow();
    const early = structuredClone(after);
    (early.readback!.attempts as Array<{ started_at: string }>)[1]!.started_at =
      "2026-10-02T01:00:02Z";
    expect(() => assertBackgroundTransition(before, early)).toThrow();
  });
});
const start = "2026-10-02T01:00:00Z";
const end = "2026-10-02T01:03:00Z";
const completion = {
  insertId: "log-actual",
  timestamp: "2026-10-02T01:01:02Z",
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
  httpRequest: { status: 201 },
};
describe("scheduler completion is corroboration, never fabricated success", () => {
  it("records a successful matching job completion", () => {
    expect(schedulerCorroboration([completion], start, end)).toMatchObject([
      { insert_id: "log-actual", status: "OK" },
    ]);
  });
  it.each([
    { ...completion, timestamp: "2026-10-01T01:00:00Z" },
    {
      ...completion,
      jsonPayload: { ...completion.jsonPayload, status: "UNAUTHENTICATED" },
    },
    {
      ...completion,
      jsonPayload: {
        ...completion.jsonPayload,
        "@type":
          "type.googleapis.com/google.cloud.scheduler.logging.AttemptStarted",
      },
    },
    {
      ...completion,
      resource: {
        labels: { ...completion.resource.labels, job_id: "other-job" },
      },
    },
  ])("rejects stale, failed, wrong-job and start-only logs", (log) => {
    expect(() => schedulerCorroboration([log], start, end)).toThrow();
  });
});
