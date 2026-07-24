import { describe, expect, it, vi } from "vitest";

import { DriverSosVerificationRepository } from "../../src/modules/driver-sos/driver-sos-verification.repository";

describe("DriverSosVerificationRepository alert latency summary", () => {
  it("maps persisted percentile and target-rate evidence", async () => {
    const query = vi.fn(async () => ({
      rows: [
        {
          sample_count: 20,
          within_target_count: 19,
          p50_latency_ms: "1250.5",
          p95_latency_ms: "4875",
          max_latency_ms: "6300",
        },
      ],
    }));
    const repository = new DriverSosVerificationRepository({
      isEnabled: () => true,
      query,
    } as never);

    await expect(
      repository.summarizeAlertLatency(
        "2026-07-01T00:00:00.000Z",
        "2026-07-31T23:59:59.999Z",
        5_000,
      ),
    ).resolves.toEqual({
      from: "2026-07-01T00:00:00.000Z",
      to: "2026-07-31T23:59:59.999Z",
      targetLatencyMs: 5_000,
      sampleCount: 20,
      withinTargetCount: 19,
      withinTargetRate: 0.95,
      p50LatencyMs: 1250.5,
      p95LatencyMs: 4875,
      maxLatencyMs: 6300,
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("percentile_cont(0.95)"),
      ["2026-07-01T00:00:00.000Z", "2026-07-31T23:59:59.999Z", 5_000],
    );
  });

  it("returns an explicit empty summary when persistence is unavailable", async () => {
    const repository = new DriverSosVerificationRepository();

    await expect(
      repository.summarizeAlertLatency(null, null, 5_000),
    ).resolves.toEqual({
      from: null,
      to: null,
      targetLatencyMs: 5_000,
      sampleCount: 0,
      withinTargetCount: 0,
      withinTargetRate: null,
      p50LatencyMs: null,
      p95LatencyMs: null,
      maxLatencyMs: null,
    });
  });
});
