import { Injectable } from "@nestjs/common";
import type {
  ComplaintCaseRecord,
  CrossAppResourceLink,
  DriverRegistryRecord,
  ForwardedOrderRecord,
  IncidentRecord,
  OwnedOrderRecord,
  SearchResultRecord,
  ShiftRecord,
  VehicleRegistryRecord,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import { ComplaintService } from "../complaint/complaint.service";
import { DriverProfileService } from "../driver-profile/driver-profile.service";
import { ForwarderService } from "../forwarder/forwarder.service";
import { IncidentService } from "../incident/incident.service";
import { OwnedMobilityService } from "../owned-mobility/owned-mobility.service";
import { RegulatoryRegistryService } from "../regulatory-registry/regulatory-registry.service";
import { ShiftAttendanceService } from "../shift-attendance/shift-attendance.service";
import {
  OPS_SEARCH_CATEGORIES,
  type OpsSearchCategory,
  type OpsSearchResponse,
  type SearchResultGroup,
} from "./search.types";

type SearchFieldValue = string | string[] | null | undefined;
type SearchFields = Record<string, SearchFieldValue>;

type SearchCandidate = {
  result: Omit<SearchResultRecord, "matchedFields">;
  fields: SearchFields;
  updatedAt?: string | null;
};

type MatchedCandidate = {
  score: number;
  updatedAt: number;
  item: SearchResultRecord;
};

const SEARCH_APP = "ops-console" as const;
const SEARCH_CATEGORY_SET = new Set<OpsSearchCategory>(OPS_SEARCH_CATEGORIES);

function compareMatchedCandidate(
  left: MatchedCandidate,
  right: MatchedCandidate,
) {
  if (right.score !== left.score) {
    return right.score - left.score;
  }

  if (right.updatedAt !== left.updatedAt) {
    return right.updatedAt - left.updatedAt;
  }

  return left.item.primaryLabel.localeCompare(right.item.primaryLabel);
}

@Injectable()
export class SearchService {
  constructor(
    private readonly ownedMobilityService: OwnedMobilityService,
    private readonly forwarderService: ForwarderService,
    private readonly regulatoryRegistryService: RegulatoryRegistryService,
    private readonly driverProfileService: DriverProfileService,
    private readonly shiftAttendanceService: ShiftAttendanceService,
    private readonly complaintService: ComplaintService,
    private readonly incidentService: IncidentService,
  ) {}

  searchOps(
    query: string,
    requestedTypes?: string | string[],
  ): OpsSearchResponse {
    const normalizedQuery = this.normalizeQuery(query);
    const types = this.resolveTypes(requestedTypes);
    const tokens = this.tokenize(normalizedQuery);

    const orders = this.ownedMobilityService.listOrders();
    const orderById = new Map(orders.map((order) => [order.orderId, order]));
    const activeShiftIndexes = this.buildActiveShiftIndexes(
      this.shiftAttendanceService.listShifts(),
    );

    const candidateMap: Record<OpsSearchCategory, SearchCandidate[]> = {
      orders: this.buildOrderCandidates(orders),
      dispatch: this.buildDispatchCandidates(
        orderById,
        this.ownedMobilityService.listDispatchJobs(),
        this.forwarderService.listOrders(),
      ),
      drivers: this.buildDriverCandidates(
        this.regulatoryRegistryService.listDrivers(),
        activeShiftIndexes.activeShiftByDriverId,
      ),
      vehicles: this.buildVehicleCandidates(
        this.regulatoryRegistryService.listVehicles(),
        activeShiftIndexes.activeShiftByVehicleId,
      ),
      complaints: this.buildComplaintCandidates(
        this.complaintService.listComplaintCases(),
      ),
      incidents: this.buildIncidentCandidates(
        this.incidentService.listIncidents(),
      ),
    };

    const groups = types
      .map((category) =>
        this.buildGroup(
          category,
          candidateMap[category],
          normalizedQuery,
          tokens,
        ),
      )
      .filter((group): group is SearchResultGroup => group !== null);

    return {
      query: normalizedQuery,
      types,
      groups,
      totalResults: groups.reduce((sum, group) => sum + group.items.length, 0),
    };
  }

  private buildGroup(
    category: OpsSearchCategory,
    candidates: SearchCandidate[],
    normalizedQuery: string,
    tokens: string[],
  ): SearchResultGroup | null {
    const matched: MatchedCandidate[] = [];
    for (const candidate of candidates) {
      const match = this.matchFields(normalizedQuery, tokens, candidate.fields);
      if (!match) {
        continue;
      }

      matched.push({
        score: match.score,
        updatedAt: this.parseTimestamp(candidate.updatedAt),
        item: {
          ...candidate.result,
          matchedFields: match.matchedFields,
        },
      });
    }

    matched.sort(compareMatchedCandidate);

    if (matched.length === 0) {
      return null;
    }

    return {
      category,
      items: matched.map((candidate) => candidate.item),
    };
  }

  private buildOrderCandidates(orders: OwnedOrderRecord[]): SearchCandidate[] {
    return orders.map((order) => ({
      result: {
        category: "orders",
        resourceType: "owned_order",
        resourceId: order.orderId,
        primaryLabel: order.orderNo,
        secondaryLabel: this.joinParts([
          order.passenger.name,
          `${order.pickup.address} -> ${order.dropoff.address}`,
          order.status,
        ]),
        link: this.buildLink(
          `/dispatch/${order.orderId}`,
          "owned_order",
          order.orderId,
          `Open order ${order.orderNo}`,
        ),
      },
      fields: {
        orderNo: order.orderNo,
        orderId: order.orderId,
        passengerName: order.passenger.name,
        passengerPhone: order.passenger.phone,
        pickupAddress: order.pickup.address,
        dropoffAddress: order.dropoff.address,
        bookingId: order.bookingId,
        callId: order.callId,
        notes: order.notes,
        status: order.status,
        serviceBucket: order.serviceBucket,
      },
      updatedAt: order.updatedAt,
    }));
  }

  private buildDispatchCandidates(
    orderById: Map<string, OwnedOrderRecord>,
    dispatchJobs: ReturnType<OwnedMobilityService["listDispatchJobs"]>,
    forwardedOrders: ForwardedOrderRecord[],
  ): SearchCandidate[] {
    const dispatchJobCandidates: SearchCandidate[] = dispatchJobs.map((job) => {
      const order = orderById.get(job.orderId);
      return {
        result: {
          category: "dispatch",
          resourceType: "dispatch_job",
          resourceId: job.dispatchJobId,
          primaryLabel: job.dispatchJobId,
          secondaryLabel: this.joinParts([
            order?.orderNo ?? job.orderId,
            job.status,
            job.latestEtaMinutes !== null
              ? `${job.latestEtaMinutes} min ETA`
              : null,
          ]),
          link: this.buildLink(
            `/dispatch/${job.orderId}`,
            "dispatch_job",
            job.dispatchJobId,
            `Open dispatch job ${job.dispatchJobId}`,
          ),
        },
        fields: {
          dispatchJobId: job.dispatchJobId,
          orderId: job.orderId,
          orderNo: order?.orderNo,
          passengerName: order?.passenger.name,
          status: job.status,
        },
        updatedAt: job.updatedAt,
      };
    });

    const forwardedCandidates: SearchCandidate[] = forwardedOrders.map(
      (order) => ({
        result: {
          category: "dispatch",
          resourceType: "forwarded_order",
          resourceId: order.mirrorOrderId,
          primaryLabel: order.mirrorOrderId,
          secondaryLabel: this.joinParts([
            order.platformCode,
            order.externalOrderId,
            order.status,
          ]),
          link: this.buildLink(
            `/dispatch/${order.mirrorOrderId}`,
            "forwarded_order",
            order.mirrorOrderId,
            `Open forwarded order ${order.mirrorOrderId}`,
          ),
        },
        fields: {
          mirrorOrderId: order.mirrorOrderId,
          externalOrderId: order.externalOrderId,
          platformCode: order.platformCode,
          status: order.status,
          acceptedDriverId: order.acceptedDriverId,
          lastNativeStatus: order.lastNativeStatus,
        },
        updatedAt: order.updatedAt,
      }),
    );

    return [...dispatchJobCandidates, ...forwardedCandidates];
  }

  private buildDriverCandidates(
    drivers: DriverRegistryRecord[],
    activeShiftByDriverId: Map<string, ShiftRecord>,
  ): SearchCandidate[] {
    return drivers.map((driver) => {
      const profile = this.driverProfileService.findProfileForDriver(
        driver.driverId,
      );
      const activeShift = activeShiftByDriverId.get(driver.driverId);
      const name = profile?.name ?? driver.name;

      return {
        result: {
          category: "drivers",
          resourceType: "driver",
          resourceId: driver.driverId,
          primaryLabel: name,
          secondaryLabel: this.joinParts([
            driver.driverId,
            driver.workState,
            activeShift?.vehicleId,
          ]),
          link: this.buildLink(
            `/drivers/${driver.driverId}`,
            "driver",
            driver.driverId,
            `Open driver ${name}`,
          ),
        },
        fields: {
          driverId: driver.driverId,
          name,
          phone: profile?.phone,
          email: profile?.email,
          workState: driver.workState,
          vehicleId: activeShift?.vehicleId,
        },
        updatedAt: this.latestTimestamp(driver.updatedAt, profile?.updatedAt),
      };
    });
  }

  private buildVehicleCandidates(
    vehicles: VehicleRegistryRecord[],
    activeShiftByVehicleId: Map<string, ShiftRecord>,
  ): SearchCandidate[] {
    return vehicles.map((vehicle) => {
      const activeShift = activeShiftByVehicleId.get(vehicle.vehicleId);
      return {
        result: {
          category: "vehicles",
          resourceType: "vehicle",
          resourceId: vehicle.vehicleId,
          primaryLabel: vehicle.plateNo,
          secondaryLabel: this.joinParts([
            vehicle.vehicleId,
            vehicle.operatingArea,
            activeShift?.driverId,
          ]),
          link: this.buildLink(
            `/vehicles/${vehicle.vehicleId}`,
            "vehicle",
            vehicle.vehicleId,
            `Open vehicle ${vehicle.plateNo}`,
          ),
        },
        fields: {
          plateNo: vehicle.plateNo,
          vehicleId: vehicle.vehicleId,
          operatingArea: vehicle.operatingArea,
          currentDriverId: activeShift?.driverId,
          serviceBuckets: vehicle.supportedServiceBuckets,
          insuranceStatus: vehicle.insuranceStatus,
        },
        updatedAt: vehicle.updatedAt,
      };
    });
  }

  private buildComplaintCandidates(
    complaints: ComplaintCaseRecord[],
  ): SearchCandidate[] {
    return complaints.map((complaint) => ({
      result: {
        category: "complaints",
        resourceType: "complaint_case",
        resourceId: complaint.caseNo,
        primaryLabel: complaint.caseNo,
        secondaryLabel: this.joinParts([
          complaint.category,
          complaint.status,
          this.truncate(complaint.description, 48),
        ]),
        link: this.buildLink(
          `/complaints/${complaint.caseNo}`,
          "complaint_case",
          complaint.caseNo,
          `Open complaint ${complaint.caseNo}`,
        ),
      },
      fields: {
        caseNo: complaint.caseNo,
        category: complaint.category,
        status: complaint.status,
        description: complaint.description,
        relatedOrderId: complaint.relatedOrderId,
        assigneeId: complaint.assigneeId,
      },
      updatedAt: complaint.updatedAt,
    }));
  }

  private buildIncidentCandidates(
    incidents: IncidentRecord[],
  ): SearchCandidate[] {
    return incidents.map((incident) => ({
      result: {
        category: "incidents",
        resourceType: "incident",
        resourceId: incident.incidentId,
        primaryLabel: incident.title,
        secondaryLabel: this.joinParts([
          incident.incidentId,
          incident.severity,
          incident.status,
        ]),
        link: this.buildLink(
          `/incidents/${incident.incidentId}`,
          "incident",
          incident.incidentId,
          `Open incident ${incident.incidentId}`,
        ),
      },
      fields: {
        incidentId: incident.incidentId,
        title: incident.title,
        description: incident.description,
        category: incident.category,
        severity: incident.severity,
        status: incident.status,
        relatedOrderId: incident.relatedOrderId,
        relatedVehicleId: incident.relatedVehicleId,
        relatedDriverId: incident.relatedDriverId,
        reportedBy: incident.reportedBy,
        assignedTo: incident.assignedTo,
      },
      updatedAt: incident.updatedAt,
    }));
  }

  private buildActiveShiftIndexes(shifts: ShiftRecord[]) {
    const activeShiftByDriverId = new Map<string, ShiftRecord>();
    const activeShiftByVehicleId = new Map<string, ShiftRecord>();

    for (const shift of shifts) {
      if (shift.status !== "active") {
        continue;
      }

      const currentDriverShift = activeShiftByDriverId.get(shift.driverId);
      if (
        !currentDriverShift ||
        this.parseTimestamp(shift.clockedInAt) >
          this.parseTimestamp(currentDriverShift.clockedInAt)
      ) {
        activeShiftByDriverId.set(shift.driverId, shift);
      }

      if (!shift.vehicleId) {
        continue;
      }

      const currentVehicleShift = activeShiftByVehicleId.get(shift.vehicleId);
      if (
        !currentVehicleShift ||
        this.parseTimestamp(shift.clockedInAt) >
          this.parseTimestamp(currentVehicleShift.clockedInAt)
      ) {
        activeShiftByVehicleId.set(shift.vehicleId, shift);
      }
    }

    return {
      activeShiftByDriverId,
      activeShiftByVehicleId,
    };
  }

  private resolveTypes(requestedTypes?: string | string[]) {
    const rawValues = Array.isArray(requestedTypes)
      ? requestedTypes
      : requestedTypes
        ? [requestedTypes]
        : [];
    const parsed = rawValues
      .flatMap((value) => value.split(","))
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);

    if (parsed.length === 0) {
      return [...OPS_SEARCH_CATEGORIES];
    }

    const invalidTypes = parsed.filter(
      (value): value is string =>
        !SEARCH_CATEGORY_SET.has(value as OpsSearchCategory),
    );
    if (invalidTypes.length > 0) {
      throw new ApiRequestError(
        400,
        "INVALID_SEARCH_TYPES",
        "Search types must be one or more supported ops categories.",
        {
          invalidTypes,
          allowedTypes: OPS_SEARCH_CATEGORIES,
        },
      );
    }

    return [...new Set(parsed as OpsSearchCategory[])];
  }

  private normalizeQuery(query: string) {
    const normalized = query.trim().replace(/\s+/g, " ");
    if (!normalized) {
      throw new ApiRequestError(
        400,
        "SEARCH_QUERY_REQUIRED",
        "q is required for ops search.",
      );
    }

    return normalized;
  }

  private tokenize(query: string) {
    return this.normalizeText(query).split(" ").filter(Boolean);
  }

  private matchFields(
    normalizedQuery: string,
    tokens: string[],
    fields: SearchFields,
  ) {
    const queryText = this.normalizeText(normalizedQuery);
    const normalizedFieldEntries = Object.entries(fields).flatMap(
      ([field, value]) =>
        this.fieldValues(value)
          .map((item) => this.normalizeText(item))
          .filter(Boolean)
          .map((item) => [field, item] as const),
    );

    if (
      normalizedFieldEntries.length === 0 ||
      !tokens.every((token) =>
        normalizedFieldEntries.some(([, value]) => value.includes(token)),
      )
    ) {
      return null;
    }

    const matchedFields: string[] = [];
    let score = 0;

    for (const [field, value] of normalizedFieldEntries) {
      if (!tokens.some((token) => value.includes(token))) {
        continue;
      }

      if (!matchedFields.includes(field)) {
        matchedFields.push(field);
      }

      if (value === queryText) {
        score += 120;
      } else if (value.startsWith(queryText)) {
        score += 60;
      } else if (value.includes(queryText)) {
        score += 25;
      } else {
        score += 10;
      }
    }

    return {
      matchedFields,
      score: score + matchedFields.length,
    };
  }

  private buildLink(
    route: string,
    resourceType: string,
    resourceId: string,
    label: string,
  ): CrossAppResourceLink {
    return {
      targetApp: SEARCH_APP,
      route,
      resourceType,
      resourceId,
      openMode: "same_tab",
      label,
    };
  }

  private fieldValues(value: SearchFieldValue): string[] {
    if (Array.isArray(value)) {
      return value.filter((item): item is string => Boolean(item));
    }

    if (!value) {
      return [];
    }

    return [value];
  }

  private joinParts(parts: Array<string | null | undefined>) {
    return parts.filter((part): part is string => Boolean(part)).join(" · ");
  }

  private latestTimestamp(
    ...timestamps: Array<string | null | undefined>
  ): string | null {
    const valid = timestamps
      .map((value) => (value ? this.parseTimestamp(value) : Number.NaN))
      .filter((value) => Number.isFinite(value));

    if (valid.length === 0) {
      return null;
    }

    return new Date(Math.max(...valid)).toISOString();
  }

  private parseTimestamp(value?: string | null) {
    if (!value) {
      return 0;
    }

    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private truncate(value: string, maxLength: number) {
    if (value.length <= maxLength) {
      return value;
    }

    return `${value.slice(0, maxLength - 1).trimEnd()}…`;
  }

  private normalizeText(value: string) {
    return value
      .toLowerCase()
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
}
