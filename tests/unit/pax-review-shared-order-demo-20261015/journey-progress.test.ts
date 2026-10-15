import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { createJourneyProgress } from "../../e2e/pax-review-shared-order/progress";

test("the real hosted journal persists an unfinished phase and safe response facts before cancellation", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pax-journey-progress-"));
  const file = join(dir, "results", "safe-progress.json");
  const read = () => JSON.parse(readFileSync(file, "utf8"));
  try {
    const progress = createJourneyProgress(file);
    await progress.step("Ops prepare", async () => {
      expect(read().stages).toEqual([
        { name: "Ops prepare", state: "started" },
      ]);
      progress.response(
        "ops",
        "POST",
        "https://outer-secret:secret@ops.invalid/control-plane-proxy/ops/review-demo/prepare?token=secret#secret",
        200,
      );
      progress.response(
        "driver",
        "GET",
        "https://driver.invalid/assets/private.js?token=secret",
        200,
      );
      expect(read().responses).toEqual([
        {
          role: "ops",
          method: "POST",
          path: "/control-plane-proxy/ops/review-demo/prepare",
          status: 200,
        },
      ]);
      // This read occurs before step completion; no teardown/report is needed.
      expect(read().stages[0].state).toBe("started");
    });
    expect(read().stages[0].state).toBe("passed");
    const failure = new Error("credential-secret");
    await expect(
      progress.step("Driver registration", async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(read().stages[1]).toEqual({
      name: "Driver registration",
      state: "failed",
    });
    expect(readFileSync(file, "utf8")).not.toContain("secret");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
