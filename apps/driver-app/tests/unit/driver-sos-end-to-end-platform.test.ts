import { describe, expect, it, vi } from "vitest";
import type {
  SubmitDriverSosEventCommand,
  SubmitDriverSosEventResult,
} from "@drts/contracts";

vi.mock("expo-secure-store", () => ({
  deleteItemAsync: vi.fn(),
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
}));

import {
  buildDriverSosSubmitCommand,
  createDriverSosActiveCase,
  formatSosDescription,
  getSituationLabel,
  mapSituationToDriverSosEventType,
  markDriverSosCaseFailed,
  markDriverSosCaseSubmitted,
  type SosSituationId,
} from "@/lib/driver-sos-outbox";

describe("DRV-SOS-001 End-to-End Platform Reporting & Idempotency", () => {
  it("builds a complete typed command with situation, driver, vehicle, location, and unique clientEventId", () => {
    const situation: SosSituationId = "traffic_collision";
    const situationLabel = getSituationLabel(situation);
    const eventType = mapSituationToDriverSosEventType(situation);

    const description = formatSosDescription({
      situationLabel,
      details: "在路口與機車發生擦撞，需立即派員處理",
      platformContext: {
        platformLabel: "DRTS 自營",
        platformCode: "drts",
        mirrorOrderId: "order-101",
        externalOrderId: null,
        nativeStatusLabel: "已接單",
      },
    });

    const activeCase = createDriverSosActiveCase({
      situation,
      eventType,
      severity: "major",
      description,
      driverId: "drv-555",
      vehicleId: "veh-888",
      plateNo: "TDC-8888",
      attachments: [],
      originalTriggeredAt: "2026-08-30T10:00:00.000Z",
      offlineAtTrigger: false,
      location: {
        lat: 25.033,
        lng: 121.564,
        accuracyM: 5,
        recordedAt: "2026-08-30T09:59:58.000Z",
        reverseGeocodedAddress: null,
        geocodeProvider: null,
      },
      orderId: "order-101",
      taskId: "task-202",
    });

    const command = buildDriverSosSubmitCommand(activeCase);

    expect(command).toEqual({
      clientEventId: activeCase.clientEventId,
      driverId: "drv-555",
      vehicleId: "veh-888",
      plateNo: "TDC-8888",
      orderId: "order-101",
      taskId: "task-202",
      eventType: "traffic_accident",
      severity: "major",
      description,
      location: {
        lat: 25.033,
        lng: 121.564,
        accuracyM: 5,
        recordedAt: "2026-08-30T09:59:58.000Z",
        reverseGeocodedAddress: null,
        geocodeProvider: null,
      },
      originalTriggeredAt: "2026-08-30T10:00:00.000Z",
      offlineAtTrigger: false,
    });
  });

  it("handles platform server response and honors duplicate replay idempotently", () => {
    const activeCase = createDriverSosActiveCase({
      situation: "medical_emergency",
      description: "乘客身體不適，請求醫療救援",
      attachments: [],
      offlineAtTrigger: false,
      location: null,
      orderId: "order-999",
      taskId: "task-999",
    });

    const initialResult: SubmitDriverSosEventResult = {
      event: {
        sosEventId: "sos-db-1",
        clientEventId: activeCase.clientEventId,
        eventNo: "SOS-20260830-0099",
        incidentId: "inc_med_01",
        driverId: "drv-1",
        vehicleId: null,
        plateNo: null,
        orderId: "order-999",
        taskId: "task-999",
        status: "submitted",
        eventType: "passenger_medical",
        severity: "major",
        description: "乘客身體不適，請求醫療救援",
        location: null,
        originalTriggeredAt: activeCase.originalTriggeredAt,
        serverReceivedAt: "2026-08-30T10:00:02.000Z",
        fleetReportConfirmedAt: "2026-08-30T10:00:02.000Z",
        offlineAtTrigger: false,
        falseAlarm: { dismissed: false, dismissedAt: null, dismissedByDriverId: null, note: null },
        dutyAcknowledgement: { acknowledgedAt: null, acknowledgedByActorId: null },
        createdAt: "2026-08-30T10:00:02.000Z",
        updatedAt: "2026-08-30T10:00:02.000Z",
      },
      receipt: {
        sosEventId: "sos-db-1",
        incidentId: "inc_med_01",
        clientEventId: activeCase.clientEventId,
        eventNo: "SOS-20260830-0099",
        duplicate: false,
        serverReceivedAt: "2026-08-30T10:00:02.000Z",
        fleetReportConfirmedAt: "2026-08-30T10:00:02.000Z",
      },
    };

    const firstSubmission = markDriverSosCaseSubmitted(activeCase, initialResult);
    expect(firstSubmission.syncState).toBe("submitted");
    expect(firstSubmission.receipt?.eventNo).toBe("SOS-20260830-0099");
    expect(firstSubmission.timeline[1]?.title).toBe("已送達安全值班");

    const replayResult: SubmitDriverSosEventResult = {
      ...initialResult,
      receipt: {
        ...initialResult.receipt,
        duplicate: true,
      },
    };

    const replayedSubmission = markDriverSosCaseSubmitted(activeCase, replayResult);
    expect(replayedSubmission.syncState).toBe("submitted");
    expect(replayedSubmission.receipt?.eventNo).toBe("SOS-20260830-0099");
    expect(replayedSubmission.timeline[1]?.title).toBe("伺服器已確認既有 SOS");
  });

  it("handles offline state honestly without falsely declaring success before ACK", () => {
    const activeCase = createDriverSosActiveCase({
      situation: "route_threat",
      description: "遭遇路線威脅",
      attachments: [],
      offlineAtTrigger: true,
      location: null,
      orderId: null,
      taskId: null,
    });

    expect(activeCase.syncState).toBe("pending");
    expect(activeCase.receipt).toBeNull();

    const failed = markDriverSosCaseFailed(activeCase, "網路連線中斷");
    expect(failed.syncState).toBe("failed_retryable");
    expect(failed.receipt).toBeNull();
    expect(failed.lastError).toBe("網路連線中斷");
  });
});
