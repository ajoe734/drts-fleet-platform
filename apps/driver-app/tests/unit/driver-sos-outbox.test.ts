import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("expo-secure-store", () => ({
  deleteItemAsync: vi.fn(),
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
}));

import {
  buildDriverSosSubmitCommand,
  applyDriverSosAttachmentSyncResult,
  createDriverSosActiveCase,
  markDriverSosCaseFailed,
  markDriverSosCaseSubmitted,
  queueDriverSosSupplement,
  type DriverSosAttachmentDraft,
} from "@/lib/driver-sos-outbox";

describe("driver-sos-outbox", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-20T09:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createAttachment(id: string): DriverSosAttachmentDraft {
    return {
      id,
      uri: `file:///tmp/${id}.jpg`,
      fileName: `${id}.jpg`,
      mimeType: "image/jpeg",
      fileSize: 1024,
      addedAt: "2026-07-20T09:00:00.000Z",
      uploadState: "local",
      serverAttachmentId: null,
      scanStatus: null,
      lastError: null,
    };
  }

  it("creates a pending SOS case and submit payload", () => {
    const activeCase = createDriverSosActiveCase({
      eventType: "security_incident",
      description: "乘客情緒激動，要求立即支援。",
      attachments: [createAttachment("att-1")],
      originalTriggeredAt: "2026-07-20T09:00:00.000Z",
      offlineAtTrigger: true,
      location: {
        lat: 25.0418,
        lng: 121.5652,
        accuracyM: 8,
        recordedAt: "2026-07-20T08:59:52.000Z",
        reverseGeocodedAddress: null,
        geocodeProvider: null,
      },
      orderId: "mirror-001",
      taskId: "task-001",
    });

    expect(activeCase.syncState).toBe("pending");
    expect(activeCase.clientEventId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(activeCase.timeline[0]?.kind).toBe("attachment_added");
    expect(activeCase.timeline[1]?.kind).toBe("sos_local_triggered");

    expect(buildDriverSosSubmitCommand(activeCase)).toEqual({
      clientEventId: activeCase.clientEventId,
      orderId: "mirror-001",
      taskId: "task-001",
      eventType: "security_incident",
      severity: "major",
      description: "乘客情緒激動，要求立即支援。",
      location: {
        lat: 25.0418,
        lng: 121.5652,
        accuracyM: 8,
        recordedAt: "2026-07-20T08:59:52.000Z",
        reverseGeocodedAddress: null,
        geocodeProvider: null,
      },
      originalTriggeredAt: "2026-07-20T09:00:00.000Z",
      offlineAtTrigger: true,
    });
  });

  it("records a submitted receipt and incident correlation", () => {
    const activeCase = createDriverSosActiveCase({
      eventType: "traffic_accident",
      description: "",
      attachments: [],
      originalTriggeredAt: "2026-07-20T09:00:00.000Z",
      offlineAtTrigger: false,
      location: null,
      orderId: null,
      taskId: null,
    });

    const submitted = markDriverSosCaseSubmitted(activeCase, {
      event: {
        sosEventId: "sos-event-1",
        clientEventId: activeCase.clientEventId,
        eventNo: "SOS-20260720-001",
        incidentId: "inc_0214",
        driverId: "driver-1",
        vehicleId: null,
        plateNo: null,
        orderId: null,
        taskId: null,
        status: "submitted",
        eventType: "traffic_accident",
        severity: "major",
        description: null,
        location: null,
        originalTriggeredAt: "2026-07-20T09:00:00.000Z",
        serverReceivedAt: "2026-07-20T09:00:05.000Z",
        fleetReportConfirmedAt: "2026-07-20T09:00:05.000Z",
        offlineAtTrigger: false,
        falseAlarm: {
          dismissed: false,
          dismissedAt: null,
          dismissedByDriverId: null,
          note: null,
        },
        dutyAcknowledgement: {
          acknowledgedAt: null,
          acknowledgedByActorId: null,
        },
        createdAt: "2026-07-20T09:00:05.000Z",
        updatedAt: "2026-07-20T09:00:05.000Z",
      },
      receipt: {
        sosEventId: "sos-event-1",
        incidentId: "inc_0214",
        clientEventId: activeCase.clientEventId,
        eventNo: "SOS-20260720-001",
        duplicate: false,
        serverReceivedAt: "2026-07-20T09:00:05.000Z",
        fleetReportConfirmedAt: "2026-07-20T09:00:05.000Z",
      },
    });

    expect(submitted.syncState).toBe("submitted");
    expect(submitted.incidentId).toBe("inc_0214");
    expect(submitted.receipt?.eventNo).toBe("SOS-20260720-001");
    expect(submitted.timeline[0]?.kind).toBe("incident_created");
    expect(submitted.timeline[1]?.kind).toBe("fleet_report_confirmed");
  });

  it("keeps a submitted SOS while unavailable attachments remain retryable", () => {
    const activeCase = createDriverSosActiveCase({
      eventType: "other",
      description: "",
      attachments: [createAttachment("att-unavailable")],
      originalTriggeredAt: "2026-07-20T09:00:00.000Z",
      offlineAtTrigger: false,
      location: null,
      orderId: null,
      taskId: null,
    });

    const updated = applyDriverSosAttachmentSyncResult(activeCase, [
      {
        ...activeCase.attachments[0]!,
        uploadState: "unavailable",
        lastError: "No attachment storage provider is configured.",
      },
    ]);

    expect(updated.syncState).toBe("attachment_pending");
    expect(updated.timeline[0]?.kind).toBe("attachment_sync_pending");
    expect(updated.attachments[0]?.lastError).toContain("storage provider");
  });

  it("marks failures as retryable and preserves supplemental notes", () => {
    const activeCase = createDriverSosActiveCase({
      eventType: "other",
      description: "車輛故障",
      attachments: [],
      originalTriggeredAt: "2026-07-20T09:00:00.000Z",
      offlineAtTrigger: false,
      location: null,
      orderId: null,
      taskId: null,
    });

    const failed = markDriverSosCaseFailed(activeCase, "Network unavailable");
    expect(failed.syncState).toBe("failed_retryable");
    expect(failed.attemptCount).toBe(1);
    expect(failed.lastError).toContain("Network unavailable");
    expect(failed.timeline[0]?.kind).toBe("sync_failed");

    const supplemented = queueDriverSosSupplement(failed, {
      note: "已改撥 119，等待拖吊。",
      attachments: [createAttachment("att-2")],
    });

    expect(supplemented.supplements).toHaveLength(1);
    expect(supplemented.supplements[0]?.state).toBe("attachment_pending");
    expect(supplemented.timeline[0]?.kind).toBe("supplement_added");
  });
});
