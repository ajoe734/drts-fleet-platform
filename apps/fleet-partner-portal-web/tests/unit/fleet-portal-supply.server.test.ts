import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

import {
  loadSupplyDashboard,
  loadSupplyDocuments,
  loadSupplySubmissionDetail,
  loadSupplySubmissions,
} from "../../lib/fleet-portal-supply.server";
import { isEditableStatus } from "../../lib/fleet-portal-supply";

describe("fleet portal supply loaders", () => {
  const originalEnv = process.env.DRTS_FLEET_PARTNER_ID;

  beforeEach(() => {
    process.env.DRTS_FLEET_PARTNER_ID = "fleet-demo-001";
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.DRTS_FLEET_PARTNER_ID = originalEnv;
    } else {
      delete process.env.DRTS_FLEET_PARTNER_ID;
    }
  });

  it("builds fallback dashboard groups with expiring and not-ready lanes", async () => {
    const result = await loadSupplyDashboard();

    expect(result.source).toBe("fallback");
    expect(result.groups.draft.length).toBeGreaterThan(0);
    expect(result.groups.review.length).toBeGreaterThan(0);
    expect(result.groups.revision.length).toBeGreaterThan(0);
    expect(result.groups.approved.length).toBeGreaterThan(0);
    expect(result.groups.expiring.length).toBeGreaterThan(0);
    expect(result.groups.not_ready[0]?.reasons?.length).toBeGreaterThan(0);
  });

  it("keeps pre-approval submissions out of canonical ids in detail", async () => {
    const result = await loadSupplySubmissionDetail("sub_s38");

    expect(result?.detail.submission.status).toBe("submitted");
    expect(result?.detail.submission.canonicalDriverId).toBeNull();
    expect(result?.detail.driverDraft?.name).toBe("蔡明憲");
  });

  it("aggregates documents with submission metadata", async () => {
    const result = await loadSupplyDocuments();

    expect(result.source).toBe("fallback");
    expect(result.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          submissionId: "sub_s39",
          submissionType: "vehicle_onboarding",
          subject: expect.objectContaining({ title: "KAB-7720" }),
        }),
      ]),
    );
  });

  it("lists fallback submission rows", async () => {
    const result = await loadSupplySubmissions();

    expect(result.source).toBe("fallback");
    expect(
      result.rows.some((row) => row.submission.submissionId === "sub_r33"),
    ).toBe(true);
  });

  it("considers draft, needs_revision, and withdrawn as editable statuses", () => {
    expect(isEditableStatus("draft")).toBe(true);
    expect(isEditableStatus("needs_revision")).toBe(true);
    expect(isEditableStatus("withdrawn")).toBe(true);
    expect(isEditableStatus("submitted")).toBe(false);
    expect(isEditableStatus("approved")).toBe(false);
  });
});
