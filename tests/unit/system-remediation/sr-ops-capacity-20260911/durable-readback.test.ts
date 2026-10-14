import { describe, expect, it, vi } from "vitest";
import {
  readBackOwnedOrders,
  readBackReportJobs,
} from "../../../../tools/system-remediation/ops-capacity/durable-readback.mjs";

const createdAt = "2026-10-12T00:00:00.000Z";
const attemptAt = "2026-10-12T00:00:01.000Z";
const trace = (
  eventType: string,
  details: Record<string, unknown>,
  at = createdAt,
) => ({
  traceId: "trace-1",
  orderId: "order-1",
  eventType,
  createdAt: at,
  details,
});
const order = (record: Record<string, unknown>, traces: unknown[] = []) => ({
  order_id: "order-1",
  status: "ready_for_dispatch",
  order_created_at: createdAt,
  record: {
    orderId: "order-1",
    status: "ready_for_dispatch",
    createdAt,
    orderSource: "app",
    complianceFlags: [],
    ...record,
  },
  compliance_flags: record.complianceFlags ?? [],
  ready_transition_at: null,
  traces,
  attempts: [],
  first_attempt_at: attemptAt,
  first_attempt_id: "attempt-1",
  first_attempt_job_id: "job-1",
  assignment_count: 0,
});
// Only the external SQL result is mocked. The production collector's mapper runs.
const poolFor = (row: Record<string, unknown>) => ({
  query: vi.fn().mockResolvedValue({ rows: [row] }),
});

describe("capacity durable authority mapper", () => {
  it("measures qualified voice creation only with the correlated committed command/audit evidence", async () => {
    const raw = order({
      orderSource: "phone",
      voiceIntentId: "voice-1",
      recordingId: "rec-1",
      recordingEvidenceRef: "checkpoint-1",
      customerConfirmationId: "confirmation-1",
    });
    const [verified] = await readBackOwnedOrders(
      poolFor({ ...raw, voice_creation_verified: true }),
      ["order-1"],
    );
    expect(verified?.readySource).toBe("voice.booking.created");
    expect(verified?.lagMs).toBe(1000);
    const [unknown] = await readBackOwnedOrders(
      poolFor({ ...raw, voice_creation_verified: false }),
      ["order-1"],
    );
    expect(unknown?.readyAt).toBeNull();
    expect(unknown?.hasAttempt).toBe(true);
  });
  it("measures a phone order created ready with its bound recording", async () => {
    const pool = poolFor(
      order(
        {
          orderSource: "phone",
          callId: "call-1",
          recordingId: "rec-1",
          complianceFlags: ["recording_bound"],
        },
        [
          trace("callcenter.order_created", {
            callId: "call-1",
            recordingId: "rec-1",
            recordingPending: false,
          }),
        ],
      ),
    );
    const [row] = await readBackOwnedOrders(pool, ["order-1"]);
    expect(row?.lagMs).toBe(1000);
    expect(row?.readySource).toBe("callcenter.order_created");
    expect(row?.hasAttempt).toBe(true);
  });

  it("uses the actual recording gate transition instead of order creation", async () => {
    const pool = poolFor(
      order(
        {
          orderSource: "phone",
          callId: "call-1",
          recordingId: "rec-1",
          complianceFlags: ["recording_bound"],
        },
        [
          trace("callcenter.order_created", {
            callId: "call-1",
            recordingId: null,
            recordingPending: true,
          }),
          {
            ...trace(
              "callcenter.recording_bound",
              { callId: "call-1", recordingId: "rec-1" },
              "2026-10-12T00:00:00.500Z",
            ),
            traceId: "trace-2",
          },
        ],
      ),
    );
    const [row] = await readBackOwnedOrders(pool, ["order-1"]);
    expect(row?.lagMs).toBe(500);
  });

  it("keeps an actual attempt when legacy readiness authority is missing", async () => {
    const [row] = await readBackOwnedOrders(
      poolFor(
        order({
          orderSource: "phone",
          recordingId: "rec-1",
          complianceFlags: ["recording_bound"],
        }),
      ),
      ["order-1"],
    );
    expect(row?.hasAttempt).toBe(true);
    expect(row?.readyAt).toBeNull();
    expect(row?.lagMs).toBeNull();
  });

  it("keeps missing attempts missing, even with known direct-ready authority", async () => {
    const [row] = await readBackOwnedOrders(
      poolFor({
        ...order({}, [trace("order.ready_for_dispatch", {})]),
        first_attempt_at: null,
        first_attempt_id: null,
        first_attempt_job_id: null,
      }),
      ["order-1"],
    );
    expect(row?.hasAttempt).toBe(false);
    expect(row?.readyAt).toBe(createdAt);
    expect(row?.lagMs).toBeNull();
  });

  it("does not treat unversioned phone recording flags as voice authority", async () => {
    const [row] = await readBackOwnedOrders(
      poolFor(
        order(
          {
            orderSource: "phone",
            voiceIntentId: "voice-1",
            recordingId: "rec-1",
            complianceFlags: ["recording_bound"],
          },
          [
            trace("callcenter.recording_bound", {
              recordingId: "rec-1",
            }),
          ],
        ),
      ),
      ["order-1"],
    );
    expect(row?.readyAt).toBeNull();
    expect(row?.hasAttempt).toBe(true);
  });

  it("report readback never backfills a missing first start from updated_at", async () => {
    const [row] = await readBackReportJobs(
      poolFor({
        job_id: "job-1",
        status: "completed",
        created_at: createdAt,
        updated_at: attemptAt,
        started_at: null,
      }),
      ["job-1"],
    );
    expect(row?.queueLagMs).toBeNull();
  });

  it("propagates actual query failure for both collectors", async () => {
    const pool = {
      query: vi.fn().mockRejectedValue(new Error("SQL read failed")),
    };
    await expect(readBackOwnedOrders(pool, ["order-1"])).rejects.toThrow(
      "SQL read failed",
    );
    await expect(readBackReportJobs(pool, ["job-1"])).rejects.toThrow(
      "SQL read failed",
    );
  });
});
