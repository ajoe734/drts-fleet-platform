import { afterEach, describe, expect, it, vi } from "vitest";
import { collectReportCompletions } from "../../../../tools/system-remediation/ops-capacity/durable-readback.mjs";

const raw = (status: string, startedAt: string | null = null) => ({
  job_id: "report-1",
  status,
  created_at: new Date(0).toISOString(),
  updated_at: new Date(Date.now()).toISOString(),
  started_at: startedAt,
});
afterEach(() => vi.useRealTimers());
describe("actual async report completion SQL collector", () => {
  it("joins real start/completion observations after arrivals and leaves no timer", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [raw("queued")] })
      .mockResolvedValueOnce({
        rows: [raw("running", new Date(1000).toISOString())],
      })
      .mockResolvedValueOnce({
        rows: [raw("completed", new Date(1000).toISOString())],
      });
    const result = collectReportCompletions({ query }, ["report-1"]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await result).toMatchObject([
      { status: "completed", queueLagMs: 1000 },
    ]);
    expect(query).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each(["start", "completion"])(
    "preserves missing %s at its original SLO boundary",
    async (boundary) => {
      vi.useFakeTimers();
      const limit = boundary === "start" ? 300000 : 1800000;
      vi.setSystemTime(limit - 1000);
      const query = vi
        .fn()
        .mockResolvedValue({
          rows: [
            raw(
              boundary === "start" ? "queued" : "running",
              boundary === "start" ? null : new Date(1000).toISOString(),
            ),
          ],
        });
      let finished = false;
      const result = collectReportCompletions({ query }, ["report-1"]).then(
        (rows) => {
          finished = true;
          return rows;
        },
      );
      await vi.advanceTimersByTimeAsync(999);
      expect(finished).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect((await result)[0]?.status).toBe(
        boundary === "start" ? "queued" : "running",
      );
      expect(vi.getTimerCount()).toBe(0);
    },
  );
  it("returns raw failed jobs and propagates query/missing-row failures", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [raw("failed")] });
    expect(
      await collectReportCompletions({ query }, ["report-1"]),
    ).toMatchObject([{ status: "failed" }]);
    query.mockResolvedValue({ rows: [] });
    await expect(
      collectReportCompletions({ query }, ["report-1"]),
    ).rejects.toThrow("Missing durably accepted");
    query.mockRejectedValue(new Error("SQL completion read failed"));
    await expect(
      collectReportCompletions({ query }, ["report-1"]),
    ).rejects.toThrow("SQL completion read failed");
  });
});
