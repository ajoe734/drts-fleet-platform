import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("operational browser journeys manifest guard", () => {
  it("conforms to supply submission API envelope and status contract", () => {
    const manifestPath = path.join(
      process.cwd(),
      "tests/e2e/fixtures/operational-browser-journeys.json",
    );
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

    const fleetJourney = manifest.journeys.find(
      (j: { id: string }) => j.id === "fleet-submit-read-withdraw-resubmit",
    );
    expect(fleetJourney).toBeDefined();

    for (const op of fleetJourney.operations) {
      expect(op.resultIdPath).toBe("data.submission.submissionId");
      expect(op.readbackUrl).toBe(
        "/control-plane-proxy/fleet-partner/supply-submissions/{resultId}",
      );
      expect(op.readbackIdPath).toBe("data.submission.submissionId");
      expect(op.readbackStatePath).toBe("data.submission.status");
      expect(["submitted", "withdrawn"]).toContain(op.expectedReadbackState);
    }

    const adminJourney = manifest.journeys.find(
      (j: { id: string }) => j.id === "admin-review-approve-readback",
    );
    expect(adminJourney).toBeDefined();
    const approveOp = adminJourney.operations[0];
    expect(approveOp.resultIdPath).toBe("data.submissionId");
    expect(approveOp.readbackUrl).toBe(
      "/control-plane-proxy/admin/supply-review/submissions/{resultId}",
    );
    expect(approveOp.readbackIdPath).toBe("data.submission.submissionId");
    expect(approveOp.readbackStatePath).toBe("data.submission.status");
    expect(approveOp.expectedReadbackState).toBe("approved");
  });
});
