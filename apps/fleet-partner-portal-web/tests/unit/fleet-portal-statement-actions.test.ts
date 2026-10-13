import { describe, expect, it } from "vitest";
import type { FleetPartnerStatementRecord } from "@drts/contracts";
import { mapStatementDecision } from "../../lib/fleet-portal-statement-actions";

describe("fleet portal server decision mapping", () => {
  it("defaults older server records to unreviewed without a fabricated note or case", () => {
    expect(mapStatementDecision({} as FleetPartnerStatementRecord)).toEqual({
      decisionStatus: "unreviewed",
      confirmedAt: null,
      confirmedBy: null,
      confirmNote: null,
      disputedAt: null,
      disputedBy: null,
      disputeReason: null,
      disputeCaseId: null,
    });
  });
  it("preserves the authoritative note, actor, timestamp and linked case", () => {
    const fields = {
      decisionStatus: "disputed" as const,
      disputedAt: "2026-10-13T08:00:00Z",
      disputedBy: "reviewer-27",
      disputeReason: "Actual discrepancy",
      disputeCaseId: "case-27",
    };
    expect(
      mapStatementDecision(fields as FleetPartnerStatementRecord),
    ).toMatchObject(fields);
  });
});
