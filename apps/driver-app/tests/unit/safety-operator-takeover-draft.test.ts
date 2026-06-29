import { describe, expect, it } from "vitest";

import {
  applySafetyOperatorTakeoverCorrection,
  buildSafetyOperatorQueuedTakeoverReport,
  createSafetyOperatorTakeoverDraftAudit,
  parseSafetyOperatorQueuedTakeoverReport,
} from "@/lib/safety-operator-takeover-draft";

describe("safety operator takeover draft audit", () => {
  it("preserves original system time and appends corrections", () => {
    const draft = createSafetyOperatorTakeoverDraftAudit(
      "2026-06-28T09:18:00.000Z",
    );

    const corrected = applySafetyOperatorTakeoverCorrection(
      draft,
      "2026-06-28T09:19:30.000Z",
      "2026-06-28T09:20:00.000Z",
    );

    expect(corrected.originalSystemOccurredAt).toBe(
      "2026-06-28T09:18:00.000Z",
    );
    expect(corrected.correctedOccurredAt).toBe("2026-06-28T09:19:30.000Z");
    expect(corrected.corrections).toEqual([
      {
        editedAt: "2026-06-28T09:20:00.000Z",
        previousOccurredAt: "2026-06-28T09:18:00.000Z",
        nextOccurredAt: "2026-06-28T09:19:30.000Z",
      },
    ]);
  });

  it("returns the same draft when the occurredAt value does not change", () => {
    const draft = createSafetyOperatorTakeoverDraftAudit(
      "2026-06-28T09:18:00.000Z",
    );

    const unchanged = applySafetyOperatorTakeoverCorrection(
      draft,
      "2026-06-28T09:18:00.000Z",
    );

    expect(unchanged).toBe(draft);
  });

  it("wraps queued takeover payloads with draft audit metadata", () => {
    const draft = createSafetyOperatorTakeoverDraftAudit(
      "2026-06-28T09:18:00.000Z",
    );
    const corrected = applySafetyOperatorTakeoverCorrection(
      draft,
      "2026-06-28T09:19:30.000Z",
      "2026-06-28T09:20:00.000Z",
    );
    const payload = buildSafetyOperatorQueuedTakeoverReport(
      {
        clientGeneratedReportId: "takeover-001",
        safetyOperatorId: "so-1",
        vehicleId: "AV-7720",
        orderId: "order-1",
        sandboxProgramId: "sandbox-1",
        shiftId: "shift-1",
        assignmentId: "assignment-1",
        correlationId: "corr-1",
        trigger: "safety_operator",
        reasonCode: "obstacle",
        disposition: "continued_manual",
        fsdResumed: false,
        bookmarkId: "bookmark-1",
        incidentId: "incident-1",
        evidenceArtifactIds: ["artifact-1"],
        notes: "queued takeover",
        occurredAt: corrected.correctedOccurredAt,
      },
      corrected,
    );

    expect(parseSafetyOperatorQueuedTakeoverReport(payload)).toEqual(payload);
  });

  it("upgrades legacy queued takeover payloads without explicit audit metadata", () => {
    const parsed = parseSafetyOperatorQueuedTakeoverReport({
      clientGeneratedReportId: "legacy-001",
      safetyOperatorId: "so-1",
      vehicleId: "AV-7720",
      orderId: "order-1",
      sandboxProgramId: "sandbox-1",
      shiftId: "shift-1",
      assignmentId: "assignment-1",
      correlationId: "corr-1",
      trigger: "safety_operator",
      reasonCode: "obstacle",
      disposition: "continued_manual",
      fsdResumed: false,
      bookmarkId: "bookmark-1",
      incidentId: "incident-1",
      evidenceArtifactIds: ["artifact-1"],
      notes: "legacy payload",
      occurredAt: "2026-06-28T09:18:00.000Z",
    });

    expect(parsed.command.clientGeneratedReportId).toBe("legacy-001");
    expect(parsed.draftAudit.originalSystemOccurredAt).toBe(
      "2026-06-28T09:18:00.000Z",
    );
    expect(parsed.draftAudit.correctedOccurredAt).toBe(
      "2026-06-28T09:18:00.000Z",
    );
    expect(parsed.draftAudit.corrections).toEqual([]);
  });
});
