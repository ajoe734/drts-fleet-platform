import { afterEach, describe, expect, it, vi } from "vitest";
import {
  pollCapacityResources,
  runWithCapacityPolling,
} from "../../../../tools/system-remediation/ops-capacity/observations.mjs";

afterEach(() => vi.useRealTimers());
describe("capacity actual SQL observation and lifecycle cleanup", () => {
  it("uses exact distinct report/order IDs and actual queued/running status", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ count: 50 }] })
      .mockResolvedValueOnce({ rows: [{ count: 500 }] });
    expect(
      await pollCapacityResources({ query }, ["order-1", "order-1"], ["job-1"]),
    ).toEqual({ report: 50, dispatchable: 500 });
    expect(query.mock.calls[0]![0]).toContain("'queued', 'running'");
    expect(query.mock.calls[0]![1]).toEqual([["job-1"]]);
    expect(query.mock.calls[1]![1]).toEqual([["order-1"]]);
  });

  it("a formal SQL poll error fails the producer wrapper even if production returns success", async () => {
    const query = vi.fn().mockRejectedValue(new Error("report query failed"));
    await expect(
      runWithCapacityPolling(
        async () => "success",
        async () => {
          await pollCapacityResources({ query }, ["order-1"], ["job-1"]);
        },
      ),
    ).rejects.toThrow("report query failed");
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("joins a pending actual SQL poll after producer throws and leaves no poll running", async () => {
    vi.useFakeTimers();
    let release: ((value: { rows: { count: number }[] }) => void) | undefined;
    const query = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      )
      .mockResolvedValue({ rows: [{ count: 0 }] });
    let settled = false;
    const result = runWithCapacityPolling(
      async () => {
        throw new Error("producer failed");
      },
      async () => {
        await pollCapacityResources({ query }, ["order-1"], []);
      },
    ).catch((error: Error) => {
      settled = true;
      return error;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    release!({ rows: [{ count: 0 }] });
    expect((await result).message).toBe("producer failed");
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(10000);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("retains both producer and SQL errors", async () => {
    const producer = new Error("producer failed");
    const sql = new Error("SQL failed");
    await expect(
      runWithCapacityPolling(
        async () => {
          throw producer;
        },
        async () => {
          throw sql;
        },
      ),
    ).rejects.toMatchObject({ errors: [producer, sql] });
  });
});
