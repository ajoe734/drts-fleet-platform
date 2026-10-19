import { describe, expect, it } from "vitest";
import type { IncidentRecord } from "@drts/contracts";
import {
  applyCanonicalSosDuty,
  getSosSupplementText,
  buildDriverNameMap,
  buildSosQueueRows,
  collectUnreportedSosIncidentIds,
  buildVehiclePlateMap,
  isSosIncident,
} from "../../lib/sos-view-model";

function buildIncident(
  overrides: Partial<IncidentRecord> = {},
): IncidentRecord {
  return {
    incidentId: "inc-1",
    title: "Traffic accident SOS-20260720-0012",
    description: "Driver SOS SOS-20260720-0012 submitted from the driver app.",
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

  it("recognizes the actual API event number and retains legacy numbers without treating generated text as a supplement", () => {
    const eventNo = "SOS-20261019030159-A12F90";
    const actual = buildIncident({
      title: `Traffic accident ${eventNo}`,
      description: `Driver SOS ${eventNo} submitted from the driver app.`,
    });
    expect(isSosIncident(actual)).toBe(true);
    expect(buildSosQueueRows([actual], { nowMs: Date.now() })[0]?.eventNo).toBe(
      eventNo,
    );
    expect(getSosSupplementText(actual)).toBeNull();
    expect(isSosIncident(buildIncident())).toBe(true);
  });

  it("uses actual canonical duty ownership independently of an Incident assignment", () => {
    const pending = applyCanonicalSosDuty(
      buildIncident({ assignedTo: "generic-owner" }),
      {
        status: "submitted",
        dutyAcknowledgement: {
          acknowledgedAt: null,
          acknowledgedByActorId: null,
        },
      },
    );
    expect(pending.assignedTo).toBeNull();
    const acknowledged = applyCanonicalSosDuty(pending, {
      status: "investigating",
      dutyAcknowledgement: {
        acknowledgedAt: "2026-10-19T00:00:00.000Z",
        acknowledgedByActorId: "canonical-owner",
      },
    });
    expect(acknowledged.assignedTo).toBe("canonical-owner");
    expect(acknowledged.status).toBe("investigating");
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
          title: "Security incident SOS-20260720-0007",
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
            createdAt: "2026-07-01T00:00:00.000Z",
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

    expect(rows[0]?.eventNo).toBe("SOS-20260720-0012");
    expect(rows[0]?.isCriticalAlert).toBe(true);
    expect(rows[0]?.driverLabel).toBe("吳明翰");
    expect(rows[0]?.plateLabel).toBe("BKR-2208");
    expect(rows[0]?.severityLabel).toBe("重大");
    expect(rows[0]?.waitLabel).toBe("05:00");
    expect(rows[1]?.statusLabel).toBe("已結案");
  });
});
