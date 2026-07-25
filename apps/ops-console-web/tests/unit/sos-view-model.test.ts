import { describe, expect, it } from "vitest";
import type { IncidentRecord } from "@drts/contracts";
import {
  buildDriverNameMap,
  buildSosQueueRows,
  collectUnreportedSosIncidentIds,
  buildVehiclePlateMap,
  getSosSupplementText,
  isSosIncident,
} from "../../lib/sos-view-model";

function buildIncident(
  overrides: Partial<IncidentRecord> = {},
): IncidentRecord {
  return {
    incidentId: "inc-1",
    title: "Traffic accident SOS-20260720100002-A1B2C3",
    description:
      "Driver SOS SOS-20260720100002-A1B2C3 submitted from the driver app.",
    category: "traffic",
    severity: "critical",
    status: "open",
    relatedOrderId: "ZX-240720-0186",
    relatedVehicleId: "veh-1",
    relatedDriverId: "drv-1",
    relatedComplaintCaseNo: null,
    reportedBy: "drv-1",
    assignedTo: null,
    escalationTarget: null,
    sourceDispatchExceptionOrderId: null,
    occurredAt: "2026-07-20T10:00:00.000Z",
    location: "信義區松仁路 100 號附近",
    resolutionNote: null,
    serviceRecoveryActions: [],
    createdAt: "2026-07-20T10:00:02.000Z",
    updatedAt: "2026-07-20T10:00:02.000Z",
    ...overrides,
  };
}

describe("sos-view-model", () => {
  it("collects each newly rendered SOS incident once", () => {
    const rows = buildSosQueueRows(
      [buildIncident(), buildIncident({ incidentId: "inc_0215" })],
      { nowMs: Date.parse("2026-07-20T09:01:00.000Z") },
    );

    expect(collectUnreportedSosIncidentIds(rows, new Set(["inc-1"]))).toEqual([
      "inc_0215",
    ]);
  });

  it("detects only SOS incidents by event number", () => {
    expect(isSosIncident(buildIncident())).toBe(true);
    expect(
      isSosIncident(
        buildIncident({
          title: "General traffic incident",
          description: "A non-SOS traffic incident.",
        }),
      ),
    ).toBe(false);
  });

  it("sorts critical pending incidents first and enriches driver/plate labels", () => {
    const rows = buildSosQueueRows(
      [
        buildIncident({
          incidentId: "inc-closed",
          title: "Security incident SOS-20260720100507-D4E5F6",
          category: "safety",
          severity: "high",
          status: "closed",
          relatedDriverId: "drv-2",
          relatedVehicleId: "veh-2",
        }),
        buildIncident(),
      ],
      {
        nowMs: new Date("2026-07-20T10:05:00.000Z").getTime(),
        driverNamesById: buildDriverNameMap([
          {
            driverId: "drv-1",
            name: "吳明翰",
            supportedServiceBuckets: ["standard_taxi"],
            workState: "available",
            licensesValid: true,
            lifecycleStatus: "active",
            eligibilityBlockedReasons: [],
            dispatchEligible: true,
            createdAt: "2026-07-20T00:00:00.000Z",
            updatedAt: "2026-07-20T00:00:00.000Z",
            activatedAt: "2026-07-20T00:00:00.000Z",
            suspendedAt: null,
            retiredAt: null,
            profileUpdatedAt: null,
            deviceBindings: [],
          },
        ]),
        platesByVehicleId: buildVehiclePlateMap([
          {
            vehicleId: "veh-1",
            plateNo: "BKR-2208",
            operatingArea: "Taipei",
            supportedServiceBuckets: ["standard_taxi"],
            dispatchableFlag: true,
            exclusivityApproved: true,
            insuranceStatus: "valid",
            updatedAt: "2026-07-20T00:00:00.000Z",
            supplyLifecycle: {
              contract: {
                contractId: null,
                lifecycleStatus: "active",
                startAt: null,
                endAt: null,
                updatedAt: null,
              },
              insurance: {
                policyId: null,
                lifecycleStatus: "active",
                startAt: null,
                endAt: null,
                updatedAt: null,
              },
              exclusivity: {
                lifecycleStatus: "active",
                declarationStatus: "submitted",
                declarationFileId: null,
                reviewStatus: "approved",
                providerName: null,
                effectiveStart: null,
                effectiveEnd: null,
                reviewedAt: null,
                updatedAt: null,
              },
              dispatch: {
                eligible: true,
                blockedReasons: [],
                evaluatedAt: "2026-07-20T00:00:00.000Z",
              },
              offboarding: {
                status: "none",
                reason: null,
                requestedAt: null,
                effectiveAt: null,
                completedAt: null,
                requestedBy: null,
                debrandingRequired: false,
                debrandingStatus: "not_required",
                debrandingDueAt: null,
                debrandingCompletedAt: null,
                debrandingTicketId: null,
                notes: null,
              },
              lastTrace: null,
            },
          },
        ]),
      },
    );

    expect(rows[0]?.eventNo).toBe("SOS-20260720100002-A1B2C3");
    expect(rows[0]?.isCriticalAlert).toBe(true);
    expect(rows[0]?.driverLabel).toBe("吳明翰");
    expect(rows[0]?.plateLabel).toBe("BKR-2208");
    expect(rows[0]?.severityLabel).toBe("重大");
    expect(rows[0]?.waitLabel).toBe("05:00");
    expect(rows[1]?.statusLabel).toBe("已結案");
  });
});

// S3-VERIFY-001 regression guard.
//
// The Ops SOS queue is gated on `isSosIncident`, which recognises an incident
// only by matching the event number embedded in its title/description. That
// makes the pattern a cross-service contract with the API, but nothing used to
// pin it: the fixtures above were hand-written in a shape the API never emits
// (`SOS-20260720-0012`), so the view model and its test agreed with each other
// while both disagreed with production, and the queue rendered empty for every
// real incident.
//
// These cases derive the event number the same way the API does, so a change to
// either side breaks the test instead of silently emptying the queue.
describe("SOS event number contract with the API generator", () => {
  // Mirrors `nextEventNo` in
  // apps/api/src/modules/driver-sos/driver-sos.service.ts:
  //   const compact = now.replace(/\D/g, "").slice(0, 14);
  //   return `SOS-${compact}-${randomUUID().slice(0, 6).toUpperCase()}`;
  function apiEventNo(nowIso: string, uuid: string) {
    const compact = nowIso.replace(/\D/g, "").slice(0, 14);
    return `SOS-${compact}-${uuid.slice(0, 6).toUpperCase()}`;
  }

  it("recognises an event number built exactly as the API builds it", () => {
    const eventNo = apiEventNo(
      "2026-07-25T12:27:16.482Z",
      "f67b15ec-1a2b-4c3d-8e9f-0a1b2c3d4e5f",
    );
    expect(eventNo).toBe("SOS-20260725122716-F67B15");

    expect(
      isSosIncident({
        title: `Security incident ${eventNo}`,
        description: `Driver SOS ${eventNo} submitted from the driver app.`,
      }),
    ).toBe(true);
  });

  it("treats the API's boilerplate description as generated, not as an operator note", () => {
    const eventNo = apiEventNo(
      "2026-07-25T12:27:16.482Z",
      "f67b15ec-1a2b-4c3d-8e9f-0a1b2c3d4e5f",
    );
    const rows = buildSosQueueRows(
      [
        buildIncident({
          incidentId: "INC-000001",
          title: `Security incident ${eventNo}`,
          description: `Driver SOS ${eventNo} submitted from the driver app.`,
        }),
      ],
      { nowMs: Date.parse("2026-07-25T12:30:00.000Z") },
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.eventNo).toBe(eventNo);

    // The API's own boilerplate must not surface as a driver-written
    // supplement. With the old pattern this string failed the
    // generated-description check and was shown to Ops as if it were a note.
    expect(
      getSosSupplementText({
        description: `Driver SOS ${eventNo} submitted from the driver app.`,
      }),
    ).toBeNull();
    expect(
      getSosSupplementText({ description: "駕駛補充：車輛被追撞。" }),
    ).toBe("駕駛補充：車輛被追撞。");
  });

  it("does not recognise the legacy shape the API never emitted", () => {
    expect(
      isSosIncident({
        title: "Traffic accident SOS-20260720-0012",
        description: "no event number here",
      }),
    ).toBe(false);
  });
});
