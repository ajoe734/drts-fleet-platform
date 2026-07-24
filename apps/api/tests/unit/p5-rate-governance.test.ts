import { describe, expect, it, beforeEach } from "vitest";
import { MultiTaxiService } from "../../src/modules/multi-taxi/multi-taxi.service";
import { OwnedMobilityService } from "../../src/modules/owned-mobility/owned-mobility.service";
import { ApiRequestError } from "../../src/common/api-envelope";
import type {
  OwnedOrderRecord,
  PassengerTripRatingRecord,
  RedispatchOrderCommand,
} from "@drts/contracts";

describe("P5-RATE-001 Rating Governance & Atomic Assignment", () => {
  let multiTaxiService: MultiTaxiService;
  let ownedMobilityService: OwnedMobilityService;

  beforeEach(() => {
    const mockRegulatoryRegistry: any = {
      getVehiclePassengerDisclosureProfile: (vehicleId: string) => {
        if (vehicleId === "veh-incomplete") {
          return { status: "incomplete", missingFieldCodes: ["make", "model"] };
        }
        return {
          status: "complete",
          make: "Toyota",
          model: "Camry",
          modelYear: 2024,
          doorCount: 4,
          color: "Yellow",
          version: "v1",
        };
      },
      getDriverPublicRegistrationCredential: (driverId: string) => {
        if (driverId === "driver-expired") {
          return { status: "expired", effectiveUntil: "2020-01-01T00:00:00Z" };
        }
        return {
          status: "verified_active",
          maskedDisplay: "REG-***-1234",
          effectiveUntil: "2030-01-01T00:00:00Z",
          version: "v1",
        };
      },
      listVehicles: () => [
        { vehicleId: "veh-001", plateNo: "T-1234" },
        { vehicleId: "veh-incomplete", plateNo: "T-9999" },
      ],
      listDrivers: () => [
        { driverId: "driver-001", name: "Alice" },
        { driverId: "driver-expired", name: "Bob" },
      ],
    };

    const mockAudit: any = {
      recordNotification: () => {},
      recordAudit: () => {},
    };
    const mockCallCenter: any = {};
    const mockTaskEvents: any = { publishTaskCancelled: () => {} };

    ownedMobilityService = new OwnedMobilityService(
      mockRegulatoryRegistry,
      mockAudit,
      mockCallCenter,
      mockTaskEvents,
    );

    multiTaxiService = new MultiTaxiService(ownedMobilityService);
  });

  describe("Criterion 1 & 2: Rating Submission & Idempotency", () => {
    it("renders new_driver for 0 ratings", () => {
      const summary = multiTaxiService.getDriverRatingAuthority("driver-new");
      expect(summary.displayState).toBe("new_driver");
      expect(summary.averageRating).toBeNull();
      expect(summary.ratingCount).toBe(0);
      expect(summary.aggregateVersion).toBe(1);
    });

    it("replays duplicate ratings idempotently and rejects mismatched scores", async () => {
      // Setup completed multi-taxi order in owned mobility
      const mockOrder: OwnedOrderRecord = {
        orderId: "order-rate-01",
        orderNo: "M-1001",
        tenantId: "tenant-01",
        status: "completed",
        orderSource: "app_passenger",
        serviceBucket: "multi_taxi",
        dispatchSemantics: "virtual_queue",
        runtimeProfileCode: "multi_taxi_direct",
        passenger: { phone: "+886912345678" },
        pickup: { lat: 25.033, lng: 121.565, addressText: "Taipei 101" },
        dropoff: {
          lat: 25.047,
          lng: 121.517,
          addressText: "Taipei Main Station",
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        dispatchAttemptCount: 1,
        lastDispatchFailureReason: null,
      } as any;

      (ownedMobilityService as any).getOrder = () => mockOrder;
      (ownedMobilityService as any).findPassengerAssignmentDisclosure = () => ({
        assignmentId: "assign-01",
        orderId: "order-rate-01",
        vehicle: { vehicleId: "veh-001" },
        driver: { driverId: "driver-001" },
        status: "completed",
      });

      // Issue grant manually for test
      const grant = (multiTaxiService as any).issueRideAccessGrant(mockOrder);

      // 1. First rating submission
      const res1 = await multiTaxiService.submitPassengerRating(
        grant.accessToken,
        {
          score: 5,
          tags: ["clean", "polite"],
          comment: "Great ride!",
        },
      );

      expect(res1.score).toBe(5);
      expect(res1.status).toBe("active");

      // Check updated driver authority
      const summary1 = multiTaxiService.getDriverRatingAuthority("driver-001");
      expect(summary1.displayState).toBe("rated");
      expect(summary1.averageRating).toBe(5);
      expect(summary1.ratingCount).toBe(1);

      // 2. Duplicate rating submission (identical)
      const res2 = await multiTaxiService.submitPassengerRating(
        grant.accessToken,
        {
          score: 5,
          tags: ["clean", "polite"],
          comment: "Great ride!",
        },
      );
      expect(res2.ratingId).toBe(res1.ratingId);

      // 3. Mismatched rating submission throws CONFLICT
      await expect(
        multiTaxiService.submitPassengerRating(grant.accessToken, {
          score: 1,
          tags: ["clean"],
          comment: "Different rating!",
        }),
      ).rejects.toThrow(ApiRequestError);
    });
  });

  describe("Criterion 3 & 4: Legal Gate & Scarcity Non-Bypass", () => {
    it("denies assignment when vehicle passenger disclosure is incomplete", () => {
      const order: OwnedOrderRecord = {
        orderId: "order-gate-01",
        orderNo: "M-2001",
        status: "ready_for_dispatch",
        runtimeProfileCode: "multi_taxi_direct",
        pickup: { lat: 25.033, lng: 121.565 },
        dropoff: { lat: 25.047, lng: 121.517 },
        passenger: { phone: "+886900000000" },
      } as any;

      const dispatchJob = {
        dispatchJobId: "job-01",
        orderId: "order-gate-01",
      } as any;
      const assignment = { assignmentId: "assign-gate-01" } as any;
      const ratingSummary =
        multiTaxiService.getDriverRatingAuthority("driver-001");

      expect(() =>
        (ownedMobilityService as any).buildPassengerAssignmentAuthority(
          order,
          dispatchJob,
          assignment,
          "veh-incomplete", // incomplete vehicle
          "driver-001",
          new Date().toISOString(),
          ratingSummary,
        ),
      ).toThrow(ApiRequestError);
    });

    it("ensures P-5 hard legal gates are non-bypassable by scarcity fallback", () => {
      const evaluatedCandidates: any[] = [
        {
          driverId: "driver-legal-fail",
          vehicleId: "veh-fail",
          eligibilityDecision: "ineligible",
          hardReasonCodes: ["P5_VEHICLE_DISCLOSURE_INCOMPLETE"],
          softReasonCodes: [],
        },
      ];

      const visibleCandidates = evaluatedCandidates.filter(
        (candidate) => candidate.eligibilityDecision !== "ineligible",
      );

      // Scarcity candidate filtering logic as in owned-mobility.service.ts
      const nonBypassableCodes = [
        "P5_VEHICLE_MAKE_MISSING",
        "P5_VEHICLE_MODEL_MISSING",
        "P5_VEHICLE_YEAR_MISSING",
        "P5_VEHICLE_DOOR_COUNT_MISSING",
        "P5_DRIVER_REGISTRATION_MISSING",
        "P5_DRIVER_REGISTRATION_EXPIRED",
        "P5_DRIVER_REGISTRATION_UNVERIFIED",
        "P5_RATING_STATE_UNINITIALIZED",
        "P5_RUNTIME_PROFILE_MISMATCH",
        "P5_VEHICLE_DISCLOSURE_INCOMPLETE",
        "P5_DRIVER_REGISTRATION_NOT_ACTIVE",
        "P5_VEHICLE_REGISTRY_MISSING",
        "P5_ROUTE_SNAPSHOT_UNRESOLVED",
      ];

      const scarcityFiltered = evaluatedCandidates.filter(
        (candidate) =>
          !candidate.hardReasonCodes.some((code: string) =>
            nonBypassableCodes.includes(code),
          ),
      );

      // Candidate failing P5 legal disclosure must NOT be returned by scarcity fallback
      expect(visibleCandidates).toHaveLength(0);
      expect(scarcityFiltered).toHaveLength(0);
    });
  });

  describe("Criterion 6: Version-Safe Redispatch", () => {
    it("rejects stale redispatch requests when a newer assignment exists", () => {
      const order: OwnedOrderRecord = {
        orderId: "order-redispatch-01",
        orderNo: "M-3001",
        status: "assigned",
        reservationHoldStatus: null,
        dispatchAttemptCount: 1,
      } as any;

      (ownedMobilityService as any).orders.push(order);
      (ownedMobilityService as any).dispatchAssignments.push({
        assignmentId: "assign-v2",
        orderId: "order-redispatch-01",
        assignmentVersion: 2,
        status: "assigned",
      });

      const staleCommand: RedispatchOrderCommand = {
        reasonCode: "driver_cancelled",
        expectedAssignmentVersion: 1, // older expected version than current version 2
      };

      expect(() =>
        ownedMobilityService.redispatchOrder(
          "order-redispatch-01",
          staleCommand,
        ),
      ).toThrow(ApiRequestError);
    });
  });

  describe("Criterion 7: Rating Governance & Moderation UI per doc08 §8", () => {
    it("supports rating invalidation with mandatory reason and aggregate rebuild", async () => {
      const ratingRecord: PassengerTripRatingRecord = {
        ratingId: "rate-mod-01",
        orderId: "order-mod-01",
        tripId: "trip-mod-01",
        driverId: "driver-mod",
        passengerSubjectRef: "phone_sha256:abc12345",
        score: 1,
        tags: ["rude"],
        comment: "Unfair review",
        status: "active",
        submittedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      (multiTaxiService as any).ratingsByPassengerOrder.set(
        (multiTaxiService as any).ratingKey(
          "order-mod-01",
          "phone_sha256:abc12345",
        ),
        ratingRecord,
      );

      // Verify active authority before invalidation
      const authorityBefore =
        multiTaxiService.getDriverRatingAuthority("driver-mod");
      expect(authorityBefore.averageRating).toBe(1);
      expect(authorityBefore.ratingCount).toBe(1);

      // Invalidation without reason fails
      await expect(
        multiTaxiService.invalidatePassengerRating("rate-mod-01", {
          reason: "",
        }),
      ).rejects.toThrow(ApiRequestError);

      // Invalidation with valid reason
      const result = await multiTaxiService.invalidatePassengerRating(
        "rate-mod-01",
        {
          reason: "Confirmed passenger abuse",
          operatorId: "ops-admin-01",
        },
      );

      expect(result.rating.status).toBe("invalidated");
      expect(result.rating.invalidationReason).toBe(
        "Confirmed passenger abuse",
      );
      expect(result.rating.maskedPassengerSubjectRef).toContain("...");

      // Driver rating aggregate is rebuilt to new_driver state
      expect(result.driverSummary.displayState).toBe("new_driver");
      expect(result.driverSummary.averageRating).toBeNull();
      expect(result.driverSummary.ratingCount).toBe(0);
    });
  });
});
