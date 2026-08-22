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
    expect(fleetJourney.route).toBe(
      "/supply/submissions/{{fleetSubmissionId}}",
    );
    expect(fleetJourney.setup).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "/control-plane-proxy/fleet-partner/supply-submissions/drivers",
          capture: expect.objectContaining({
            fleetSubmissionId: "data.submission.submission_id",
          }),
        }),
        expect.objectContaining({
          path: expect.stringContaining("documents/confirm"),
          method: "POST",
        }),
      ]),
    );

    for (const op of fleetJourney.operations) {
      expect(op.kind).toBe("request");
      expect(op.responseKind).toBe("json");
      expect(op.resultIdPath).toBe("data.submission.submission_id");
      expect(op.readback.url).toBe(
        "/control-plane-proxy/fleet-partner/supply-submissions/{resultId}",
      );
      expect(op.readback.idPath).toBe("data.submission.submission_id");
      expect(op.readback.statePath).toBe("data.submission.status");
      expect(["submitted", "withdrawn"]).toContain(op.readback.expectedState);
    }

    const adminJourney = manifest.journeys.find(
      (j: { id: string }) => j.id === "admin-review-approve-readback",
    );
    expect(adminJourney).toBeDefined();
    expect(adminJourney.route).toBe("/supply-review/{{adminSubmissionId}}");
    const approveOp = adminJourney.operations[0];
    expect(approveOp.kind).toBe("request");
    expect(approveOp.responseKind).toBe("json");
    expect(approveOp.resultIdPath).toBe("data.submission_id");
    expect(approveOp.before).toEqual([
      {
        kind: "click",
        control: "[data-drt-operation='admin-start-review']",
      },
    ]);
    expect(approveOp.readback.url).toBe(
      "/control-plane-proxy/admin/supply-review/submissions/{resultId}",
    );
    expect(approveOp.readback.idPath).toBe("data.submission.submission_id");
    expect(approveOp.readback.statePath).toBe("data.submission.status");
    expect(approveOp.readback.expectedState).toBe("approved");

    const tenantJourney = manifest.journeys.find(
      (j: { id: string }) => j.id === "tenant-ops-dispatch-intent",
    );
    expect(tenantJourney?.route).toBe("/bookings?q={{tenantBookingId}}");
    expect(tenantJourney?.environmentVariables).toEqual({
      dispatchSessionToken: "DRTS_OPERATIONAL_DISPATCH_SESSION_TOKEN",
    });
    expect(tenantJourney?.browserSession).toEqual({
      cookieName: "drts_tenant_session",
      tokenEnv: "DRTS_OPERATIONAL_TENANT_SESSION_TOKEN",
      templateVariable: "tenantSessionToken",
    });
    expect(tenantJourney?.setup).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          baseUrlEnv: "DRTS_DEV_API_BASE_URL",
          path: "/api/tenant/bookings",
          headers: expect.objectContaining({
            authorization: "Bearer {{tenantSessionToken}}",
            "x-tenant-id": "10000000-0000-0000-0000-000000000201",
            "idempotency-key": "operational-create-{{runId}}",
          }),
          capture: { tenantBookingId: "data.booking_id" },
        }),
        expect.objectContaining({
          baseUrlEnv: "DRTS_DEV_API_BASE_URL",
          path: expect.stringContaining("dispatch-timeout"),
          headers: expect.objectContaining({
            authorization: "Bearer {{dispatchSessionToken}}",
            "x-tenant-id": "10000000-0000-0000-0000-000000000201",
            "idempotency-key": "operational-dispatch-timeout-{{runId}}",
          }),
        }),
      ]),
    );
    expect(tenantJourney?.operations).toEqual([
      expect.objectContaining({
        kind: "intent",
        control: "[data-drt-intent='tenant-open-dispatch']",
        targetBaseUrlEnv: "DRTS_DEV_OPS_CONSOLE_BASE_URL",
        expectedPathPattern: "^/dispatch/[^/?#]+$",
      }),
    ]);

    const referralJourney = manifest.journeys.find(
      (journey: { id: string }) =>
        journey.id === "referral-create-read-cancel-rate-receipt",
    );
    expect(referralJourney).toBeDefined();
    expect(
      referralJourney.operations.map(
        (operation: { readback: { expectedState: string } }) =>
          operation.readback.expectedState,
      ),
    ).toEqual(["created", "cancelled", "cancelled", "cancelled"]);
    expect(referralJourney.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "request",
          name: "create",
          resultIdQueryParam: "orderId",
        }),
        expect.objectContaining({
          kind: "navigation",
          name: "receipt",
          expectedPath: "/embed/yuhe-residence",
          expectedQuery: { screen: "receipt", orderId: "{resultId}" },
        }),
      ]),
    );

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
