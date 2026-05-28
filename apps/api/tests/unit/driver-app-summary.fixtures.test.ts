import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PLATFORM_CODES } from "@drts/contracts";
import { describe, expect, it } from "vitest";

function readFixture(name: string) {
  return JSON.parse(
    readFileSync(
      join(process.cwd(), "tests", "fixtures", "driver-app", name),
      "utf8",
    ),
  ) as Record<string, unknown>;
}

describe("driver app summary fixtures", () => {
  it("keeps the workspace summary fixture aligned with the endpoint contract", () => {
    const fixture = readFixture("driver-workspace-summary.fixture.json");

    expect(fixture).toEqual(
      expect.objectContaining({
        driverId: expect.any(String),
        taskCounts: expect.objectContaining({
          total: expect.any(Number),
        }),
        taskCountsByState: expect.arrayContaining([
          expect.objectContaining({
            state: "action_required",
            count: expect.any(Number),
          }),
        ]),
        outstandingInstructionCount: expect.any(Number),
        refresh: expect.objectContaining({
          generatedAt: expect.any(String),
          staleAfterMs: expect.any(Number),
          dataFreshness: expect.stringMatching(
            /^(fresh|stale|degraded|unknown)$/,
          ),
          source: expect.stringMatching(/^(live|cache|sandbox|static)$/),
        }),
      }),
    );
  });

  it("keeps the platform presence summary fixture aligned with the endpoint contract", () => {
    const fixture = readFixture(
      "driver-platform-presence-summary.fixture.json",
    );
    const bindings = fixture.bindings;

    expect(Array.isArray(bindings)).toBe(true);
    expect(bindings).toHaveLength(PLATFORM_CODES.length);
    expect(bindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          platformCode: "grab_taiwan",
          bindingState: "reauth_required",
          outstandingInstructionCount: expect.any(Number),
        }),
      ]),
    );
    expect(fixture).toEqual(
      expect.objectContaining({
        driverId: expect.any(String),
        instructions: expect.any(Array),
        suppressions: expect.any(Array),
        health: expect.objectContaining({
          status: expect.stringMatching(/^(healthy|degraded|down)$/),
          degradedServices: expect.any(Array),
          lastCheckedAt: expect.any(String),
        }),
        refresh: expect.objectContaining({
          generatedAt: expect.any(String),
          staleAfterMs: expect.any(Number),
          dataFreshness: expect.stringMatching(
            /^(fresh|stale|degraded|unknown)$/,
          ),
          source: expect.stringMatching(/^(live|cache|sandbox|static)$/),
        }),
      }),
    );
  });
});
