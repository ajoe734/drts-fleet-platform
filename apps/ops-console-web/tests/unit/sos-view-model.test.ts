import { describe, expect, it } from "vitest";
import type { IncidentRecord, IncidentTimelineEntry } from "@drts/contracts";
import {
  DEFAULT_SOS_QUEUE_FILTERS,
  applyCanonicalSosDuty,
  filterSosQueueRows,
  formatSosTimestamp,
  getSosSeverityLabel,
  getSosStatusKey,
  getSosStatusMeta,
  getSosSupplementText,
  getSosTimelineTitle,
  getSosTypeLabel,
  hasActiveSosQueueFilters,
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

  it("localizes status, severity, type, timeline, and timestamps in English and Traditional Chinese while preserving canonical state and raw data", () => {
    const nowMs = new Date("2026-07-20T10:05:00.000Z").getTime();
    const pendingIncident = buildIncident();
    const ackedIncident = buildIncident({
      incidentId: "inc-acked",
      assignedTo: "ops-duty-1",
      category: "passenger_injury",
      severity: "high",
    });
    const investigatingIncident = buildIncident({
      incidentId: "inc-inv",
      status: "investigating",
      assignedTo: "ops-duty-1",
      category: "driver_injury",
      severity: "medium",
    });
    const falseAlarmIncident = buildIncident({
      incidentId: "inc-false",
      status: "resolved",
      assignedTo: "ops-duty-1",
      resolutionNote: "Driver confirmed false alarm",
      category: "vehicle_damage",
      severity: "low",
    });
    const resolvedIncident = buildIncident({
      incidentId: "inc-resolved",
      status: "resolved",
      assignedTo: "ops-duty-1",
      resolutionNote: "Handled on scene",
      category: "safety",
      severity: "low",
    });
    const closedIncident = buildIncident({
      incidentId: "inc-closed",
      status: "closed",
      assignedTo: "ops-duty-1",
    });

    expect(getSosStatusMeta(pendingIncident, "en")).toEqual({
      label: "Awaiting acknowledgement",
      tone: "danger",
      isPending: true,
      isAcked: false,
      isClosed: false,
    });
    expect(getSosStatusMeta(pendingIncident, "zh").label).toBe("待確認");
    expect(getSosStatusMeta(ackedIncident, "en").label).toBe("Acknowledged");
    expect(getSosStatusMeta(investigatingIncident, "en").label).toBe(
      "Investigating",
    );
    expect(getSosStatusMeta(falseAlarmIncident, "en").label).toBe(
      "Driver reported an accidental trigger",
    );
    expect(getSosStatusMeta(resolvedIncident, "en").label).toBe("Resolved");
    expect(getSosStatusMeta(closedIncident, "en").label).toBe("Closed");

    expect(getSosSeverityLabel("critical", "en")).toBe("Critical");
    expect(getSosSeverityLabel("high", "en")).toBe("High");
    expect(getSosSeverityLabel("medium", "en")).toBe("Medium");
    expect(getSosSeverityLabel("low", "en")).toBe("Low");

    expect(getSosTypeLabel(pendingIncident, "en")).toBe("Traffic accident");
    expect(getSosTypeLabel(ackedIncident, "en")).toBe(
      "Passenger medical emergency",
    );
    expect(getSosTypeLabel(investigatingIncident, "en")).toBe("Driver injury");
    expect(getSosTypeLabel(resolvedIncident, "en")).toBe("Safety incident");
    expect(getSosTypeLabel(falseAlarmIncident, "en")).toBe("Vehicle damage");

    const enRows = buildSosQueueRows([pendingIncident, closedIncident], {
      nowMs,
      locale: "en",
    });
    expect(enRows[0]?.id).toBe("inc-1");
    expect(enRows[0]?.eventNo).toBe("SOS-20260720-0012");
    expect(enRows[0]?.statusLabel).toBe("Awaiting acknowledgement");
    expect(enRows[0]?.typeLabel).toBe("Traffic accident");
    expect(enRows[0]?.severityLabel).toBe("Critical");
    expect(enRows[0]?.orderLabel).toBe("ZX-240720-0186");
    expect(enRows[0]?.locationLabel).toBe("信義區松仁路 100 號附近");
    expect(enRows[0]?.isCriticalAlert).toBe(true);
    expect(enRows[1]?.statusLabel).toBe("Closed");

    const makeEntry = (action: string, note = ""): IncidentTimelineEntry => ({
      entryId: "tl-1",
      incidentId: "inc-1",
      action,
      actor: "ops-duty-1",
      note,
      createdAt: "2026-07-20T10:01:00.000Z",
    });
    expect(getSosTimelineTitle(makeEntry("incident_created"), "en")).toBe(
      "Report received",
    );
    expect(getSosTimelineTitle(makeEntry("incident_assigned"), "en")).toBe(
      "Duty operator acknowledged",
    );
    expect(
      getSosTimelineTitle(
        makeEntry("status_changed", "Status changed to investigating"),
        "en",
      ),
    ).toBe("Investigation started");
    expect(
      getSosTimelineTitle(
        makeEntry("status_changed", "Status changed to closed"),
        "en",
      ),
    ).toBe("Closed");
    expect(
      getSosTimelineTitle(makeEntry("status_changed", "Updated note"), "en"),
    ).toBe("Status updated");
    expect(
      getSosTimelineTitle(makeEntry("provider_raw_webhook_code"), "en"),
    ).toBe("provider_raw_webhook_code");

    expect(
      formatSosTimestamp(
        "2026-07-20T10:00:00.000Z",
        { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" },
        "en",
      ),
    ).toContain("Jul");
  });

  it("derives stable status keys from exact getSosStatusMeta predicates and filters queue rows by status, severity, and trimmed case-insensitive keyword across raw IDs, driver name, plate, and location without matching localized labels", () => {
    const nowMs = new Date("2026-07-20T10:10:00.000Z").getTime();
    const pendingCrit = buildIncident({
      incidentId: "inc-pending-crit",
      title: "Traffic accident SOS-20260720-0001",
      description:
        "Driver SOS SOS-20260720-0001 submitted from the driver app.",
      severity: "critical",
      status: "open",
      assignedTo: null,
      relatedDriverId: "drv-101",
      relatedVehicleId: "veh-101",
      relatedOrderId: "ZX-240720-0101",
      location: "信義區松仁路 100 號附近",
      occurredAt: "2026-07-20T10:05:00.000Z",
    });
    const ackedHigh = buildIncident({
      incidentId: "inc-acked-high",
      title: "Passenger medical SOS-20260720-0002",
      description:
        "Driver SOS SOS-20260720-0002 submitted from the driver app.",
      category: "passenger_injury",
      severity: "high",
      status: "open",
      assignedTo: "ops-duty-1",
      relatedDriverId: "drv-102",
      relatedVehicleId: "veh-102",
      relatedOrderId: "ZX-240720-0102",
      location: "大安區忠孝東路四段 45 號",
      occurredAt: "2026-07-20T10:04:00.000Z",
    });
    const invMedium = buildIncident({
      incidentId: "inc-inv-med",
      title: "Driver injury SOS-20260720-0003",
      description:
        "Driver SOS SOS-20260720-0003 submitted from the driver app.",
      category: "driver_injury",
      severity: "medium",
      status: "investigating",
      assignedTo: "ops-duty-2",
      relatedDriverId: "drv-103",
      relatedVehicleId: "veh-103",
      relatedOrderId: "ZX-240720-0103",
      location: "中山區南京東路三段 12 號",
      occurredAt: "2026-07-20T10:03:00.000Z",
    });
    const falseAlarmLow = buildIncident({
      incidentId: "inc-false-low",
      title: "Vehicle damage SOS-20260720-0004",
      description:
        "Driver SOS SOS-20260720-0004 submitted from the driver app.",
      category: "vehicle_damage",
      severity: "low",
      status: "resolved",
      assignedTo: "ops-duty-3",
      resolutionNote: "Driver confirmed FALSE ALARM on phone",
      relatedDriverId: "drv-104",
      relatedVehicleId: "veh-104",
      relatedOrderId: "ZX-240720-0104",
      location: "松山區民生東路五段 88 號",
      occurredAt: "2026-07-20T10:02:00.000Z",
    });
    const resolvedLow = buildIncident({
      incidentId: "inc-resolved-low",
      title: "Safety incident SOS-20260720-0005",
      description:
        "Driver SOS SOS-20260720-0005 submitted from the driver app.",
      category: "safety",
      severity: "low",
      status: "resolved",
      assignedTo: "ops-duty-4",
      resolutionNote: "Assisted driver and passenger on scene",
      relatedDriverId: "drv-105",
      relatedVehicleId: "veh-105",
      relatedOrderId: "ZX-240720-0105",
      location: "內湖區瑞光路 258 號",
      occurredAt: "2026-07-20T10:01:00.000Z",
    });
    const closedHigh = buildIncident({
      incidentId: "inc-closed-high",
      title: "Traffic accident SOS-20260720-0006",
      description:
        "Driver SOS SOS-20260720-0006 submitted from the driver app.",
      category: "traffic",
      severity: "high",
      status: "closed",
      assignedTo: "ops-duty-5",
      relatedDriverId: "drv-106",
      relatedVehicleId: "veh-106",
      relatedOrderId: "ZX-240720-0106",
      location: "南港區經貿二路 188 號",
      occurredAt: "2026-07-20T10:00:00.000Z",
    });

    expect(getSosStatusKey(pendingCrit)).toBe("pending");
    expect(getSosStatusKey(ackedHigh)).toBe("acknowledged");
    expect(getSosStatusKey(invMedium)).toBe("investigating");
    expect(getSosStatusKey(falseAlarmLow)).toBe("falseAlarm");
    expect(getSosStatusKey(resolvedLow)).toBe("resolved");
    expect(getSosStatusKey(closedHigh)).toBe("closed");

    const allIncidents = [
      closedHigh,
      resolvedLow,
      falseAlarmLow,
      invMedium,
      ackedHigh,
      pendingCrit,
    ];
    const driverNamesById = new Map([
      ["drv-101", "吳明翰"],
      ["drv-102", "林佳穎"],
      ["drv-103", "陳建宏"],
      ["drv-104", "張雅婷"],
      ["drv-105", "黃志豪"],
      ["drv-106", "李冠宇"],
    ]);
    const platesByVehicleId = new Map([
      ["veh-101", "BKR-2208"],
      ["veh-102", "TPE-9981"],
      ["veh-103", "KLM-5512"],
      ["veh-104", "ABC-1104"],
      ["veh-105", "DEF-1105"],
      ["veh-106", "GHI-1106"],
    ]);

    const zhRows = buildSosQueueRows(allIncidents, {
      nowMs,
      driverNamesById,
      platesByVehicleId,
      locale: "zh",
    });
    const enRows = buildSosQueueRows(allIncidents, {
      nowMs,
      driverNamesById,
      platesByVehicleId,
      locale: "en",
    });

    const expectedOrder = [
      "inc-pending-crit",
      "inc-acked-high",
      "inc-inv-med",
      "inc-false-low",
      "inc-resolved-low",
      "inc-closed-high",
    ];
    expect(zhRows.map((row) => row.id)).toEqual(expectedOrder);

    // Default and whitespace-only filters preserve all rows and original sorted order
    expect(hasActiveSosQueueFilters(DEFAULT_SOS_QUEUE_FILTERS)).toBe(false);
    expect(
      hasActiveSosQueueFilters({
        status: "all",
        severity: "all",
        keyword: "   ",
      }),
    ).toBe(false);
    expect(hasActiveSosQueueFilters({ status: "pending" })).toBe(true);
    expect(hasActiveSosQueueFilters({ severity: "critical" })).toBe(true);
    expect(hasActiveSosQueueFilters({ keyword: "BKR" })).toBe(true);

    expect(
      filterSosQueueRows(zhRows, DEFAULT_SOS_QUEUE_FILTERS).map((r) => r.id),
    ).toEqual(expectedOrder);
    expect(
      filterSosQueueRows(zhRows, {
        status: "all",
        severity: "all",
        keyword: "   ",
      }).map((r) => r.id),
    ).toEqual(expectedOrder);

    // Each status option
    expect(
      filterSosQueueRows(zhRows, { status: "pending" }).map((r) => r.id),
    ).toEqual(["inc-pending-crit"]);
    expect(
      filterSosQueueRows(zhRows, { status: "acknowledged" }).map((r) => r.id),
    ).toEqual(["inc-acked-high"]);
    expect(
      filterSosQueueRows(zhRows, { status: "investigating" }).map((r) => r.id),
    ).toEqual(["inc-inv-med"]);
    expect(
      filterSosQueueRows(zhRows, { status: "falseAlarm" }).map((r) => r.id),
    ).toEqual(["inc-false-low"]);
    expect(
      filterSosQueueRows(zhRows, { status: "resolved" }).map((r) => r.id),
    ).toEqual(["inc-resolved-low"]);
    expect(
      filterSosQueueRows(zhRows, { status: "closed" }).map((r) => r.id),
    ).toEqual(["inc-closed-high"]);

    // Each severity option
    expect(
      filterSosQueueRows(zhRows, { severity: "critical" }).map((r) => r.id),
    ).toEqual(["inc-pending-crit"]);
    expect(
      filterSosQueueRows(zhRows, { severity: "high" }).map((r) => r.id),
    ).toEqual(["inc-acked-high", "inc-closed-high"]);
    expect(
      filterSosQueueRows(zhRows, { severity: "medium" }).map((r) => r.id),
    ).toEqual(["inc-inv-med"]);
    expect(
      filterSosQueueRows(zhRows, { severity: "low" }).map((r) => r.id),
    ).toEqual(["inc-false-low", "inc-resolved-low"]);

    // AND combination (status + severity + keyword)
    expect(
      filterSosQueueRows(zhRows, {
        status: "resolved",
        severity: "low",
        keyword: "  def-1105 ",
      }).map((r) => r.id),
    ).toEqual(["inc-resolved-low"]);
    expect(
      filterSosQueueRows(zhRows, {
        status: "falseAlarm",
        severity: "low",
        keyword: "def-1105",
      }),
    ).toEqual([]);

    // Case-insensitive keyword matching across eventNo, incidentId, relatedOrderId, relatedDriverId, relatedVehicleId, driver name, plate, and location
    expect(
      filterSosQueueRows(zhRows, { keyword: "sos-20260720-0003" }).map(
        (r) => r.id,
      ),
    ).toEqual(["inc-inv-med"]);
    expect(
      filterSosQueueRows(zhRows, { keyword: "INC-ACKED-HIGH" }).map(
        (r) => r.id,
      ),
    ).toEqual(["inc-acked-high"]);
    expect(
      filterSosQueueRows(zhRows, { keyword: "zx-240720-0106" }).map(
        (r) => r.id,
      ),
    ).toEqual(["inc-closed-high"]);
    expect(
      filterSosQueueRows(zhRows, { keyword: "DRV-104" }).map((r) => r.id),
    ).toEqual(["inc-false-low"]);
    expect(
      filterSosQueueRows(zhRows, { keyword: "veh-105" }).map((r) => r.id),
    ).toEqual(["inc-resolved-low"]);
    expect(
      filterSosQueueRows(zhRows, { keyword: "林佳穎" }).map((r) => r.id),
    ).toEqual(["inc-acked-high"]);
    expect(
      filterSosQueueRows(zhRows, { keyword: "bkr-2208" }).map((r) => r.id),
    ).toEqual(["inc-pending-crit"]);
    expect(
      filterSosQueueRows(zhRows, { keyword: "瑞光路 258" }).map((r) => r.id),
    ).toEqual(["inc-resolved-low"]);

    // Localized status/severity/type labels are NOT used as search keys; locale changes do not alter result identities
    expect(filterSosQueueRows(zhRows, { keyword: "待確認" })).toEqual([]);
    expect(
      filterSosQueueRows(enRows, { keyword: "Awaiting acknowledgement" }),
    ).toEqual([]);
    expect(filterSosQueueRows(zhRows, { keyword: "重大" })).toEqual([]);
    expect(filterSosQueueRows(enRows, { keyword: "Critical" })).toEqual([]);
    expect(filterSosQueueRows(zhRows, { keyword: "交通事故" })).toEqual([]);
    expect(filterSosQueueRows(enRows, { keyword: "Traffic accident" })).toEqual(
      [],
    );

    const combinedFilter = {
      status: "acknowledged" as const,
      severity: "high" as const,
      keyword: "tpe-9981",
    };
    expect(filterSosQueueRows(zhRows, combinedFilter).map((r) => r.id)).toEqual(
      filterSosQueueRows(enRows, combinedFilter).map((r) => r.id),
    );
  });
});
