import { describe, expect, it } from "vitest";
import { estimateFare } from "../../../apps/api/src/modules/passenger-app/fare/fare.engine";
import { tariff } from "./fixture";

describe("F-TARIFF-01: production engine, original explicit ceil test rules", () => {
  it.each([
    [0, 0, "2026-10-10T15:00:00Z", 105, 105],
    [3250, 0, "2026-10-10T15:00:00Z", 155, 155],
    [0, 60.01, "2026-10-10T04:00:00Z", 85, 95],
  ])(
    "%sm/%ss at %s => [%s, %s]",
    (distanceMeters, durationSeconds, scheduledAt, min, max) => {
      const result = estimateFare(tariff, {
        distanceMeters,
        durationSeconds,
        scheduledAt,
      });
      expect([result.estimatedMin, result.estimatedMax]).toEqual([min, max]);
    },
  );
});
