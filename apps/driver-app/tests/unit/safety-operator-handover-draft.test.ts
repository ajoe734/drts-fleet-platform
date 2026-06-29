import { describe, expect, it } from "vitest";

import {
  buildSafetyOperatorQueuedShiftHandover,
  describeSafetyOperatorQueuedShiftHandover,
  parseSafetyOperatorQueuedShiftHandover,
  resolveSafetyOperatorShiftHandoverCommand,
  selectSafetyOperatorHandoverTakeoverLinkage,
} from "@/lib/safety-operator-handover-draft";
import type { SafetyOperatorQueueEntry } from "@/lib/safety-operator-offline-queue";

describe("safety operator shift handover queue payload", () => {
  it("resolves synced takeover report ids from pending clientGeneratedIds", () => {
    const queued = buildSafetyOperatorQueuedShiftHandover(
      {
        assignmentId: "assignment-1",
        shiftId: "shift-1",
        safetyOperatorId: "so-1",
        vehicleId: "AV-7720",
        orderId: "order-1",
        closeoutStatus: "handoff",
        takeoverReportIds: [],
        incidentId: "incident-1",
        evidenceArtifactIds: ["artifact-1"],
        notes: "handover",
      },
      ["takeover-001"],
    );
    const queueEntries: SafetyOperatorQueueEntry[] = [
      {
        id: "queue-1",
        clientGeneratedId: "takeover-001",
        kind: "takeover_report",
        status: "synced",
        createdAt: "2026-06-29T05:00:00.000Z",
        updatedAt: "2026-06-29T05:00:30.000Z",
        syncedAt: "2026-06-29T05:00:30.000Z",
        errorMessage: null,
        duplicateAccepted: false,
        payload: {},
        receipt: { reportId: "report-001" },
      },
    ];

    const resolved = resolveSafetyOperatorShiftHandoverCommand(
      queued,
      queueEntries,
    );

    expect(resolved.command.takeoverReportIds).toEqual(["report-001"]);
    expect(resolved.unresolvedPendingTakeoverIds).toEqual([]);
  });

  it("keeps unresolved takeover references until the queued takeover is synced", () => {
    const queued = buildSafetyOperatorQueuedShiftHandover(
      {
        assignmentId: "assignment-1",
        shiftId: "shift-1",
        safetyOperatorId: "so-1",
        vehicleId: "AV-7720",
        orderId: "order-1",
        closeoutStatus: "handoff",
        takeoverReportIds: [],
        incidentId: "incident-1",
        evidenceArtifactIds: ["artifact-1"],
        notes: "handover",
      },
      ["takeover-queued"],
    );

    const resolved = resolveSafetyOperatorShiftHandoverCommand(queued, []);

    expect(resolved.command.takeoverReportIds).toEqual([]);
    expect(resolved.unresolvedPendingTakeoverIds).toEqual(["takeover-queued"]);
  });

  it("upgrades legacy queued handover payloads without pending takeover metadata", () => {
    const parsed = parseSafetyOperatorQueuedShiftHandover({
      assignmentId: "assignment-1",
      shiftId: "shift-1",
      safetyOperatorId: "so-1",
      vehicleId: "AV-7720",
      orderId: "order-1",
      closeoutStatus: "handoff",
      takeoverReportIds: ["report-001"],
      incidentId: "incident-1",
      evidenceArtifactIds: ["artifact-1"],
      notes: "legacy handover",
    });

    expect(parsed.command.takeoverReportIds).toEqual(["report-001"]);
    expect(parsed.pendingTakeoverClientGeneratedIds).toEqual([]);
  });

  it("describes queued handovers with pending takeover linkage", () => {
    const detail = describeSafetyOperatorQueuedShiftHandover(
      buildSafetyOperatorQueuedShiftHandover(
        {
          assignmentId: "assignment-1",
          shiftId: "shift-1",
          safetyOperatorId: "so-1",
          vehicleId: "AV-7720",
          orderId: "order-1",
          closeoutStatus: "handoff",
          takeoverReportIds: ["report-001"],
          incidentId: "incident-1",
          evidenceArtifactIds: ["artifact-1"],
          notes: "legacy handover",
        },
        ["takeover-queued"],
      ),
    );

    expect(detail.summary).toBe("handoff · takeover 1 + pending 1");
    expect(detail.detail).toContain("takeover-queued");
  });

  it("does not fall back to an older synced report when a newer takeover is still queued", () => {
    const linkage = selectSafetyOperatorHandoverTakeoverLinkage(
      [
        {
          id: "queue-1",
          clientGeneratedId: "takeover-synced",
          kind: "takeover_report",
          status: "synced",
          createdAt: "2026-06-29T05:00:00.000Z",
          updatedAt: "2026-06-29T05:00:30.000Z",
          syncedAt: "2026-06-29T05:00:30.000Z",
          errorMessage: null,
          duplicateAccepted: false,
          payload: {},
          receipt: { reportId: "report-older" },
        },
        {
          id: "queue-2",
          clientGeneratedId: "takeover-queued",
          kind: "takeover_report",
          status: "queued",
          createdAt: "2026-06-29T05:02:00.000Z",
          updatedAt: "2026-06-29T05:02:00.000Z",
          syncedAt: null,
          errorMessage: null,
          duplicateAccepted: false,
          payload: {},
          receipt: null,
        },
      ],
      "report-older",
    );

    expect(linkage.takeoverReportIds).toEqual([]);
    expect(linkage.pendingTakeoverClientGeneratedIds).toEqual([
      "takeover-queued",
    ]);
  });

  it("prefers the newest takeover entry by updatedAt instead of input order", () => {
    const linkage = selectSafetyOperatorHandoverTakeoverLinkage(
      [
        {
          id: "queue-1",
          clientGeneratedId: "takeover-synced",
          kind: "takeover_report",
          status: "synced",
          createdAt: "2026-06-29T05:00:00.000Z",
          updatedAt: "2026-06-29T05:01:00.000Z",
          syncedAt: "2026-06-29T05:01:00.000Z",
          errorMessage: null,
          duplicateAccepted: false,
          payload: {},
          receipt: { reportId: "report-older" },
        },
        {
          id: "queue-2",
          clientGeneratedId: "takeover-pending",
          kind: "takeover_report",
          status: "failed",
          createdAt: "2026-06-29T05:02:00.000Z",
          updatedAt: "2026-06-29T05:03:00.000Z",
          syncedAt: null,
          errorMessage: "timeout",
          duplicateAccepted: false,
          payload: {},
          receipt: null,
        },
      ],
      "report-older",
    );

    expect(linkage.takeoverReportIds).toEqual([]);
    expect(linkage.pendingTakeoverClientGeneratedIds).toEqual([
      "takeover-pending",
    ]);
  });

  it("falls back to the recent synced report only when no queued takeover exists", () => {
    const linkage = selectSafetyOperatorHandoverTakeoverLinkage(
      [],
      "report-recent",
    );

    expect(linkage.takeoverReportIds).toEqual(["report-recent"]);
    expect(linkage.pendingTakeoverClientGeneratedIds).toEqual([]);
  });
});
