import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("operational browser journeys manifest guard", () => {
  it("keeps the source evidence document independent of a candidate SHA", () => {
    const evidencePath = path.join(
      process.cwd(),
      "docs/04-uat/s1f-uix-001-cross-surface-acceptance-evidence.md",
    );
    const evidence = readFileSync(evidencePath, "utf8");

    expect(evidence).toContain(
      "Candidate SHA: recorded only by the post-deploy workflow artifact",
    );
    expect(evidence).not.toMatch(/Candidate SHA: `?[0-9a-f]{40}/);
    expect(evidence).not.toMatch(/operational-browser-evidence-[0-9a-f]{40}/);
  });

  it("conforms to the declared operation contract", () => {
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
      expect(op.kind).toBe("request");
      expect(op.responseKind).toBe("json");
      expect(op.resultIdPath).toBe("data.submission.submissionId");
      expect(op.readback.url).toBe(
        "/control-plane-proxy/fleet-partner/supply-submissions/{resultId}",
      );
      expect(op.readback.idPath).toBe("data.submission.submissionId");
      expect(op.readback.statePath).toBe("data.submission.status");
      expect(["submitted", "withdrawn"]).toContain(op.readback.expectedState);
    }

    const adminJourney = manifest.journeys.find(
      (j: { id: string }) => j.id === "admin-review-approve-readback",
    );
    expect(adminJourney).toBeDefined();
    const approveOp = adminJourney.operations[0];
    expect(approveOp.kind).toBe("request");
    expect(approveOp.responseKind).toBe("json");
    expect(approveOp.resultIdPath).toBe("data.submissionId");
    expect(approveOp.readback.url).toBe(
      "/control-plane-proxy/admin/supply-review/submissions/{resultId}",
    );
    expect(approveOp.readback.idPath).toBe("data.submission.submissionId");
    expect(approveOp.readback.statePath).toBe("data.submission.status");
    expect(approveOp.readback.expectedState).toBe("approved");

    const tenantJourney = manifest.journeys.find(
      (j: { id: string }) => j.id === "tenant-ops-dispatch-intent",
    );
    expect(tenantJourney?.operations).toEqual([
      expect.objectContaining({
        kind: "intent",
        control: "[data-drt-intent='tenant-open-dispatch']",
        targetBaseUrlEnv: "DRTS_DEV_OPS_CONSOLE_BASE_URL",
        expectedPathPattern: "^/dispatch/[^/?#]+$",
      }),
    ]);

    for (const id of [
      "bank-statement-download",
      "channel-statement-download",
    ]) {
      const operation = manifest.journeys.find(
        (journey: { id: string }) => journey.id === id,
      )?.operations[0];
      expect(operation).toEqual(
        expect.objectContaining({ kind: "request", responseKind: "download" }),
      );
      expect(operation.expectedContentTypeIncludes).toBeTruthy();
    }
  });
});
