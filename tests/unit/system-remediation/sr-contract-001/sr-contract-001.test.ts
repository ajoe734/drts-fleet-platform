import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ApiClient,
  createHostClient,
  createDriverLeaveRequest,
  listDriverLeaveRequests,
  getAcademyCourses,
  getHostOwnedVehicles,
} from "../../../../packages/api-client/src";
import {
  DRIVER_LEAVE_TYPES,
  DRIVER_LEAVE_STATUSES,
  MAX_PAST_APPLICATION_GRACE_MS,
  TRAINING_STATUSES,
  ACADEMY_MODULE_TYPES,
  ACADEMY_COURSE_CATEGORIES,
  HOST_VEHICLE_MAINTENANCE_STATUSES,
  HOST_VEHICLE_CASE_CATEGORIES,
  HOST_VEHICLE_CASE_STATUSES,
  SYSTEM_REMEDIATION_ERROR_CODES,
  IMPLEMENTED_REPORT_OUTPUT_FORMATS,
  type DriverLeaveRecord,
  type CreateDriverLeaveCommand,
  type AcademyCourseDetail,
  type FleetTrainingView,
  type HostVehicleSummary,
  type HostVehicleEarningsSummary,
  type ContractOperationalViewRecord,
} from "@drts/contracts";

describe("SR-CONTRACT-001: System Remediation Contracts & Allocation", () => {
  const repoRoot = path.resolve(__dirname, "../../../..");

  // ==========================================================================
  // 1. Schema Allocation Invariant Tests
  // ==========================================================================
  describe("Schema Allocation Invariants (schema-allocation.json)", () => {
    const allocationPath = path.join(
      repoRoot,
      "docs/04-uat/system-remediation-20260906/schema-allocation.json",
    );

    it("exists and defines valid wave schema allocation", () => {
      expect(fs.existsSync(allocationPath)).toBe(true);
      const content = JSON.parse(fs.readFileSync(allocationPath, "utf8"));

      expect(content.wave_id).toBe("system-remediation-20260906");
      expect(content.task_id).toBe("SR-CONTRACT-001");
      expect(content.last_canonical_migration_before_allocation.version).toBe(
        "V0093",
      );
      expect(content.last_canonical_migration_before_allocation.filename).toBe(
        "V0093__voice_retention_and_legal_hold.sql",
      );
    });

    it("allocates discrete sequential migration files starting at V0094 without UV conflict", () => {
      const content = JSON.parse(fs.readFileSync(allocationPath, "utf8"));
      const allocations = content.allocations;

      expect(allocations).toHaveLength(3);

      const leaveAlloc = allocations.find(
        (a: any) => a.task_id === "SR-LEAVE-BE-001",
      );
      expect(leaveAlloc).toBeDefined();
      expect(leaveAlloc.version).toBe("V0094");
      expect(leaveAlloc.migration_filename).toBe("V0094__sr_driver_leave.sql");
      expect(leaveAlloc.domain).toBe("driver_leave");
      expect(leaveAlloc.target_schema).toBe("ops");

      const acadAlloc = allocations.find(
        (a: any) => a.task_id === "SR-ACADEMY-BE-001",
      );
      expect(acadAlloc).toBeDefined();
      expect(acadAlloc.version).toBe("V0095");
      expect(acadAlloc.migration_filename).toBe("V0095__sr_driver_academy.sql");
      expect(acadAlloc.domain).toBe("driver_academy");
      expect(acadAlloc.target_schema).toBe("reg");

      const hostAlloc = allocations.find(
        (a: any) => a.task_id === "SR-HOST-BE-001",
      );
      expect(hostAlloc).toBeDefined();
      expect(hostAlloc.version).toBe("V0096");
      expect(hostAlloc.migration_filename).toBe(
        "V0096__sr_host_vehicle_access.sql",
      );
      expect(hostAlloc.domain).toBe("host_vehicle_access");

      // Verify no duplicate versions
      const versions = allocations.map((a: any) => a.version);
      expect(new Set(versions).size).toBe(versions.length);

      // Verify migrations directory on disk
      const migrationsDir = path.join(repoRoot, "infra/migrations");
      expect(
        fs.existsSync(
          path.join(migrationsDir, "V0093__voice_retention_and_legal_hold.sql"),
        ),
      ).toBe(true);
      // Ensure V0094-V0096 are not yet checked into dev
      expect(
        fs.existsSync(path.join(migrationsDir, "V0094__sr_driver_leave.sql")),
      ).toBe(false);
      expect(
        fs.existsSync(path.join(migrationsDir, "V0095__sr_driver_academy.sql")),
      ).toBe(false);
      expect(
        fs.existsSync(
          path.join(migrationsDir, "V0096__sr_host_vehicle_access.sql"),
        ),
      ).toBe(false);
    });

    it("records boundary invariants and governance rules", () => {
      const content = JSON.parse(fs.readFileSync(allocationPath, "utf8"));
      expect(content.boundary_invariants.anti_collision_rule).toContain(
        "V0086 through V0093",
      );
      expect(content.boundary_invariants.root_module_wiring_rule).toContain(
        "SR-WIRE-001",
      );
      expect(content.boundary_invariants.interface_consumption_rule).toContain(
        "@drts/contracts",
      );
      expect(content.boundary_invariants.authoritative_model_rule).toContain(
        "FX_FLEET_TRAINING",
      );
      expect(content.boundary_invariants.financial_policy_hold_rule).toContain(
        "pending_policy",
      );
    });
  });

  // ==========================================================================
  // 2. @drts/contracts Leaf Type & Invariant Tests
  // ==========================================================================
  describe("@drts/contracts Type Invariants & Enums", () => {
    it("exports all required leave types and statuses", () => {
      expect(DRIVER_LEAVE_TYPES).toEqual([
        "annual",
        "sick",
        "personal",
        "bereavement",
        "emergency",
      ]);
      expect(DRIVER_LEAVE_STATUSES).toEqual([
        "pending",
        "approved",
        "rejected",
        "withdrawn",
      ]);
      expect(MAX_PAST_APPLICATION_GRACE_MS).toBe(15 * 60 * 1000);
    });

    it("exports all required academy training statuses and categories", () => {
      expect(TRAINING_STATUSES).toEqual([
        "not_started",
        "in_progress",
        "passed",
        "failed",
        "expired",
      ]);
      expect(ACADEMY_MODULE_TYPES).toEqual(["video", "sop", "article"]);
      expect(ACADEMY_COURSE_CATEGORIES).toEqual([
        "compliance",
        "service_quality",
        "safety",
        "operations",
      ]);
    });

    it("exports all required host vehicle maintenance and case enums", () => {
      expect(HOST_VEHICLE_MAINTENANCE_STATUSES).toEqual([
        "scheduled",
        "in_progress",
        "completed",
        "cancelled",
        "overdue",
      ]);
      expect(HOST_VEHICLE_CASE_CATEGORIES).toEqual([
        "vehicle_condition",
        "accident",
        "equipment",
        "service_feedback",
      ]);
      expect(HOST_VEHICLE_CASE_STATUSES).toEqual([
        "open",
        "investigating",
        "resolved",
        "closed",
      ]);
    });

    it("exports error codes covering all three families plus N14", () => {
      expect(SYSTEM_REMEDIATION_ERROR_CODES.LEAVE_INVALID_TIME_RANGE).toBe(
        "LEAVE_INVALID_TIME_RANGE",
      );
      expect(SYSTEM_REMEDIATION_ERROR_CODES.LEAVE_OVERLAPPING_REQUEST).toBe(
        "LEAVE_OVERLAPPING_REQUEST",
      );
      expect(SYSTEM_REMEDIATION_ERROR_CODES.DRIVER_ON_LEAVE).toBe(
        "DRIVER_ON_LEAVE",
      );
      expect(
        SYSTEM_REMEDIATION_ERROR_CODES.QUIZ_INCOMPLETE_OR_DUPLICATE_SUBMISSION,
      ).toBe("QUIZ_INCOMPLETE_OR_DUPLICATE_SUBMISSION");
      expect(SYSTEM_REMEDIATION_ERROR_CODES.COURSE_VERSION_STALE).toBe(
        "COURSE_VERSION_STALE",
      );
      expect(
        SYSTEM_REMEDIATION_ERROR_CODES.ACADEMY_FORBIDDEN_FLEET_ACCESS,
      ).toBe("ACADEMY_FORBIDDEN_FLEET_ACCESS");
      expect(SYSTEM_REMEDIATION_ERROR_CODES.HOST_UNAUTHORIZED).toBe(
        "HOST_UNAUTHORIZED",
      );
      expect(SYSTEM_REMEDIATION_ERROR_CODES.HOST_VEHICLE_NOT_FOUND).toBe(
        "HOST_VEHICLE_NOT_FOUND",
      );
      expect(SYSTEM_REMEDIATION_ERROR_CODES.HOST_MUTATION_NOT_SUPPORTED).toBe(
        "HOST_MUTATION_NOT_SUPPORTED",
      );
      expect(
        SYSTEM_REMEDIATION_ERROR_CODES.CONTRACT_OPERATIONAL_VIEW_NOT_FOUND,
      ).toBe("CONTRACT_OPERATIONAL_VIEW_NOT_FOUND");
    });

    it("preserves SR-REPORT-001 implemented report formats without CSV-only regression", () => {
      expect(IMPLEMENTED_REPORT_OUTPUT_FORMATS).toEqual(["csv", "xlsx", "pdf"]);
    });

    it("validates structural typing of DriverLeaveRecord", () => {
      const record: DriverLeaveRecord = {
        leaveId: "lv-001",
        driverId: "drv-001",
        leaveType: "annual",
        startTime: "2026-09-10T08:00:00.000Z",
        endTime: "2026-09-10T17:00:00.000Z",
        reason: "Vacation",
        status: "pending",
        reviewedByPrincipalId: null,
        reviewedAt: null,
        reviewNotes: null,
        impactedShiftIds: [],
        createdAt: "2026-09-09T22:00:00.000Z",
        updatedAt: "2026-09-09T22:00:00.000Z",
      };
      expect(record.leaveType).toBe("annual");
      expect(record.status).toBe("pending");
    });

    it("validates structural typing of AcademyCourseDetail", () => {
      const course: AcademyCourseDetail = {
        courseId: "crs-001",
        courseCode: "platform_basics",
        title: "Platform Basics",
        category: "compliance",
        isRequired: true,
        validityDays: 365,
        passingScore: 80,
        version: 1,
        modulesCount: 1,
        description: "Orientation course",
        modules: [
          {
            moduleId: "mod-001",
            title: "Safety SOP",
            type: "sop",
            contentUrl: "https://example.test/sop.pdf",
            durationMinutes: 15,
          },
        ],
        questions: [
          {
            questionId: "q1",
            prompt: "What is the speed limit in depots?",
            options: [
              { optionId: "opt-a", text: "20 km/h" },
              { optionId: "opt-b", text: "50 km/h" },
            ],
          },
        ],
      };
      expect(course.isRequired).toBe(true);
      expect(course.modules).toHaveLength(1);
      expect(course.questions[0].options).toHaveLength(2);
    });

    it("validates HostVehicleEarningsSummary with null financial split invariants", () => {
      const earnings: HostVehicleEarningsSummary = {
        vehicleId: "veh-001",
        period: "2026-08",
        currency: "TWD",
        grossRevenue: 50000,
        platformFee: 7500,
        fleetCommission: null, // invariant: pending policy
        netEarnings: null, // invariant: pending policy
        tripsCount: 120,
        operatingDays: 22,
        settlementStatus: "pending_policy",
      };
      expect(earnings.fleetCommission).toBeNull();
      expect(earnings.netEarnings).toBeNull();
      expect(earnings.settlementStatus).toBe("pending_policy");
    });

    it("validates HostVehicleSummary masked VIN format", () => {
      const vehicle: HostVehicleSummary = {
        vehicleId: "veh-001",
        plateNo: "ABC-1234",
        vinMasked: "1HGCR2F83HA******",
        vehicleForm: "sedan",
        licenseClass: "multi_taxi",
        energyType: "electric",
        currentStatus: "active",
        operatingFleetName: "Metro Fleet",
        contractPeriod: {
          startAt: "2026-01-01T00:00:00Z",
          endAt: "2026-12-31T23:59:59Z",
          status: "active",
        },
      };
      expect(vehicle.vinMasked.endsWith("******")).toBe(true);
      expect(vehicle.contractPeriod?.status).toBe("active");
    });

    it("validates ContractOperationalViewRecord mapping structure", () => {
      const record: ContractOperationalViewRecord = {
        contractId: "ct-001",
        modifiableWindow: { leadTimeMinutes: 120, cutoffMinutes: 30 },
        proofRequirements: {
          requiredDocuments: ["invoice", "delivery_receipt"],
          signatureRequired: true,
          digitalProofAllowed: true,
        },
        waitingRule: { gracePeriodMinutes: 10, chargeableIntervalMinutes: 5 },
        noShowRule: { thresholdMinutes: 15, feeApplicable: true },
        slaProfile: {
          profileId: "sla-vip",
          targetResponseMinutes: 5,
          pickupWindowMinutes: 15,
        },
        effectiveVersion: {
          versionNumber: 2,
          versionTag: "v2.1",
          effectiveFrom: "2026-01-01T00:00:00Z",
          effectiveTo: null,
        },
        authMode: { mode: "oauth2_client_credentials" },
        dataStatus: {
          modifiableWindow: "available",
          proofRequirements: "available",
          waitingRule: "available",
          noShowRule: "available",
          slaProfile: "available",
          effectiveVersion: "available",
          authMode: "available",
        },
      };
      expect(record.dataStatus.modifiableWindow).toBe("available");
      expect(record.waitingRule?.gracePeriodMinutes).toBe(10);
    });
  });

  // ==========================================================================
  // 3. @drts/api-client Typed Methods & URL Verification Tests
  // ==========================================================================
  describe("@drts/api-client Typed Methods & Transport", () => {
    function createMockClient(
      responder: (input: {
        url: string;
        method: string;
        headers: Headers;
        body?: string;
      }) => {
        status: number;
        body: any;
      },
    ): ApiClient {
      const client = new ApiClient({
        baseUrl: "https://api.drts.test",
        defaultHeaders: {
          Authorization: "Bearer mock-token",
        },
      });

      // Stub fetch
      globalThis.fetch = async (
        input: RequestInfo | URL,
        init?: RequestInit,
      ) => {
        const url = typeof input === "string" ? input : input.toString();
        const method = init?.method ?? "GET";
        const headers = new Headers(init?.headers);
        const body = init?.body as string | undefined;

        const response = responder({ url, method, headers, body });
        return new Response(JSON.stringify(response.body), {
          status: response.status,
          headers: { "Content-Type": "application/json" },
        });
      };

      return client;
    }

    // Family 1: Driver Leave
    it("createDriverLeave dispatches POST /api/driver-leave/requests and unwraps data", async () => {
      let intercepted: any;
      const client = createMockClient((req) => {
        intercepted = req;
        return {
          status: 201,
          body: {
            data: {
              leave_id: "lv-101",
              driver_id: "drv-001",
              leave_type: "sick",
              start_time: "2026-09-10T08:00:00.000Z",
              end_time: "2026-09-10T12:00:00.000Z",
              reason: "Fever",
              status: "pending",
              impacted_shift_ids: [],
              created_at: "2026-09-09T22:00:00.000Z",
              updated_at: "2026-09-09T22:00:00.000Z",
            },
            meta: { requestId: "req-1", timestamp: "2026-09-09T22:00:00.000Z" },
          },
        };
      });

      const cmd: CreateDriverLeaveCommand = {
        leaveType: "sick",
        startTime: "2026-09-10T08:00:00.000Z",
        endTime: "2026-09-10T12:00:00.000Z",
        reason: "Fever",
      };

      const result = await client.createDriverLeave(cmd);
      expect(intercepted.method).toBe("POST");
      expect(intercepted.url).toBe(
        "https://api.drts.test/api/driver-leave/requests",
      );
      expect(JSON.parse(intercepted.body)).toEqual(cmd);
      expect(result.leaveId).toBe("lv-101");
      expect(result.leaveType).toBe("sick");
    });

    it("listDriverLeaves serializes query filter and handles list envelope", async () => {
      let interceptedUrl = "";
      const client = createMockClient((req) => {
        interceptedUrl = req.url;
        return {
          status: 200,
          body: {
            data: {
              items: [
                {
                  leave_id: "lv-101",
                  driver_id: "drv-001",
                  leave_type: "annual",
                  start_time: "2026-09-10T08:00:00.000Z",
                  end_time: "2026-09-10T17:00:00.000Z",
                  reason: "Holiday",
                  status: "approved",
                  impacted_shift_ids: ["sh-1"],
                  created_at: "2026-09-09T22:00:00.000Z",
                  updated_at: "2026-09-09T22:00:00.000Z",
                },
              ],
              page_info: {
                page: 1,
                page_size: 20,
                total_items: 1,
                total_pages: 1,
              },
            },
            meta: { requestId: "req-2", timestamp: "2026-09-09T22:00:00.000Z" },
          },
        };
      });

      const res = await client.listDriverLeaves({
        driverId: "drv-001",
        status: "approved",
        page: 1,
        pageSize: 20,
      });

      expect(interceptedUrl).toContain("driverId=drv-001");
      expect(interceptedUrl).toContain("status=approved");
      expect(interceptedUrl).toContain("page=1");
      expect(interceptedUrl).toContain("pageSize=20");
      expect(res.items).toHaveLength(1);
      expect(res.items[0].leaveId).toBe("lv-101");
    });

    it("withdrawDriverLeave and reviewDriverLeave invoke proper sub-routes", async () => {
      const calls: string[] = [];
      const client = createMockClient((req) => {
        calls.push(`${req.method} ${req.url}`);
        return {
          status: 200,
          body: {
            data: {
              leave_id: "lv-101",
              driver_id: "drv-001",
              status: req.url.includes("withdraw") ? "withdrawn" : "approved",
              impacted_shift_ids: req.url.includes("review") ? ["sh-1"] : [],
            },
            meta: { requestId: "req-3", timestamp: "2026-09-09T22:00:00.000Z" },
          },
        };
      });

      const withdrawn = await client.withdrawDriverLeave("lv-101", {
        reason: "Changed plans",
      });
      expect(withdrawn.status).toBe("withdrawn");
      expect(calls[0]).toBe(
        "POST https://api.drts.test/api/driver-leave/requests/lv-101/withdraw",
      );

      const reviewed = await client.reviewDriverLeave("lv-101", {
        decision: "approve",
        reviewNotes: "Approved by manager",
      });
      expect(reviewed.status).toBe("approved");
      expect(calls[1]).toBe(
        "POST https://api.drts.test/api/driver-leave/requests/lv-101/review",
      );
    });

    // Family 2: Driver Academy
    it("academy methods (listCourses, getCourse, submitQuiz, getAttempt, fleetSummary) route accurately", async () => {
      const client = createMockClient((req) => {
        if (req.url.endsWith("/courses")) {
          return {
            status: 200,
            body: {
              data: {
                items: [
                  {
                    course_id: "crs-1",
                    course_code: "basics",
                    title: "Basics",
                  },
                ],
                page_info: {
                  page: 1,
                  page_size: 20,
                  total_items: 1,
                  total_pages: 1,
                },
              },
              meta: { requestId: "r", timestamp: "t" },
            },
          };
        }
        if (req.url.includes("/quiz/submit")) {
          return {
            status: 200,
            body: {
              data: {
                attempt_id: "att-1",
                course_id: "crs-1",
                course_version: 1,
                score: 100,
                passed: true,
                attempted_at: "2026-09-09T22:00:00Z",
              },
              meta: { requestId: "r", timestamp: "t" },
            },
          };
        }
        if (req.url.includes("/training/summary")) {
          return {
            status: 200,
            body: {
              data: {
                fleet_partner_id: "fp-1",
                rows: [
                  {
                    course: "Basics",
                    en: "basics",
                    completed: 10,
                    total: 10,
                    pct: 100,
                  },
                ],
                summary: {
                  completion_pct: "100%",
                  pending_headcount: "0",
                  overdue_incomplete: 0,
                },
                source: "authoritative",
              },
              meta: { requestId: "r", timestamp: "t" },
            },
          };
        }
        return {
          status: 200,
          body: { data: {}, meta: { requestId: "r", timestamp: "t" } },
        };
      });

      const courses = await client.listAcademyCourses();
      expect(courses.items[0].courseId).toBe("crs-1");

      const quizRes = await client.submitQuiz("crs-1", {
        courseVersion: 1,
        answers: [{ questionId: "q1", selectedOptionId: "o1" }],
      });
      expect(quizRes.attemptId).toBe("att-1");
      expect(quizRes.passed).toBe(true);

      const fleetSummary = await client.getFleetTrainingSummary();
      expect(fleetSummary.summary.completionPct).toBe("100%");
      expect(fleetSummary.source).toBe("authoritative");
    });

    // Family 3: Host Vehicles
    it("host vehicle projection methods route correctly", async () => {
      const client = createMockClient((req) => {
        if (req.url.endsWith("/api/host/vehicles")) {
          return {
            status: 200,
            body: {
              data: {
                items: [
                  {
                    vehicle_id: "veh-1",
                    plate_no: "ABC-1234",
                    vin_masked: "1HGCR2F83HA******",
                    vehicle_form: "sedan",
                  },
                ],
                page_info: {
                  page: 1,
                  page_size: 20,
                  total_items: 1,
                  total_pages: 1,
                },
              },
              meta: { requestId: "r", timestamp: "t" },
            },
          };
        }
        if (req.url.includes("/earnings")) {
          return {
            status: 200,
            body: {
              data: {
                vehicle_id: "veh-1",
                period: "2026-08",
                currency: "TWD",
                gross_revenue: 80000,
                platform_fee: 12000,
                fleet_commission: null,
                net_earnings: null,
                trips_count: 150,
                operating_days: 25,
                settlement_status: "pending_policy",
              },
              meta: { requestId: "r", timestamp: "t" },
            },
          };
        }
        return {
          status: 200,
          body: {
            data: {
              items: [],
              page_info: {
                page: 1,
                page_size: 20,
                total_items: 0,
                total_pages: 0,
              },
            },
            meta: { requestId: "r", timestamp: "t" },
          },
        };
      });

      const vehicles = await client.listHostVehicles();
      expect(vehicles.items[0].vehicleId).toBe("veh-1");
      expect(vehicles.items[0].vinMasked).toBe("1HGCR2F83HA******");

      const earnings = await client.getHostVehicleEarnings("veh-1", {
        month: "2026-08",
      });
      expect(earnings.grossRevenue).toBe(80000);
      expect(earnings.fleetCommission).toBeNull();
      expect(earnings.settlementStatus).toBe("pending_policy");

      const maintenance = await client.listHostVehicleMaintenance("veh-1");
      expect(maintenance.items).toEqual([]);

      const trips = await client.listHostVehicleTrips("veh-1");
      expect(trips.items).toEqual([]);

      const cases = await client.listHostVehicleCases("veh-1");
      expect(cases.items).toEqual([]);
    });

    it("createHostClient configures partner realm and actor headers", () => {
      const hostClient = createHostClient(
        "https://api.drts.test",
        "partner-host-001",
      );
      expect((hostClient as any).defaultHeaders["x-realm"]).toBe("partner");
      expect((hostClient as any).defaultHeaders["x-partner-id"]).toBe(
        "partner-host-001",
      );
      expect((hostClient as any).defaultHeaders["x-actor-type"]).toBe(
        "ops_user",
      );
    });

    it("functional adapters execute properly on ApiClient instance", async () => {
      const client = createMockClient(() => ({
        status: 200,
        body: {
          data: {
            items: [
              {
                vehicle_id: "veh-1",
                plate_no: "TDC-8888",
                vin_masked: "1HG******",
              },
            ],
            page_info: {
              page: 1,
              page_size: 20,
              total_items: 1,
              total_pages: 1,
            },
          },
          meta: { requestId: "r", timestamp: "t" },
        },
      }));

      const res = await getHostOwnedVehicles(client);
      expect(res.items[0].vehicleId).toBe("veh-1");
    });
  });

  // ==========================================================================
  // 4. OpenAPI Specification Alignment Tests
  // ==========================================================================
  describe("OpenAPI Spec Alignment (openapi-spec.yaml)", () => {
    const openapiPath = path.join(repoRoot, "docs/04-api/openapi-spec.yaml");

    it("openapi-spec.yaml exists and contains all required system-remediation paths", () => {
      expect(fs.existsSync(openapiPath)).toBe(true);
      const content = fs.readFileSync(openapiPath, "utf8");

      const requiredPaths = [
        "/api/driver-leave/requests",
        "/api/driver-leave/requests/{leaveId}/withdraw",
        "/api/driver-leave/requests/{leaveId}/review",
        "/api/driver-academy/courses",
        "/api/driver-academy/courses/{courseId}",
        "/api/driver-academy/courses/{courseId}/quiz/submit",
        "/api/driver-academy/records",
        "/api/driver-academy/courses/{courseId}/attempts/{attemptId}",
        "/api/fleet-partner/training/summary",
        "/api/fleet-partner/training/roster",
        "/api/fleet-partner/training/drivers/{driverId}/attempts/{attemptId}",
        "/api/host/vehicles",
        "/api/host/vehicles/{vehicleId}/earnings",
        "/api/host/vehicles/{vehicleId}/maintenance",
        "/api/host/vehicles/{vehicleId}/trips",
        "/api/host/vehicles/{vehicleId}/cases",
      ];

      for (const p of requiredPaths) {
        expect(content).toContain(p + ":");
      }
    });

    it("contains all required tags", () => {
      const content = fs.readFileSync(openapiPath, "utf8");
      expect(content).toContain("name: DriverLeave");
      expect(content).toContain("name: DriverAcademy");
      expect(content).toContain("name: FleetPartnerTraining");
      expect(content).toContain("name: HostVehicles");
    });

    it("contains all schemas for system-remediation envelopes and data structures", () => {
      const content = fs.readFileSync(openapiPath, "utf8");
      const requiredSchemas = [
        "DriverLeaveType:",
        "DriverLeaveStatus:",
        "DriverLeaveRecord:",
        "CreateDriverLeaveCommand:",
        "WithdrawDriverLeaveCommand:",
        "ReviewDriverLeaveCommand:",
        "DriverLeaveEnvelope:",
        "DriverLeaveListEnvelope:",
        "TrainingStatus:",
        "AcademyModuleType:",
        "AcademyModule:",
        "AcademyCourseSummary:",
        "AcademyCourseDetail:",
        "QuizSubmissionCommand:",
        "QuizResultRecord:",
        "DriverQuizAttemptDetail:",
        "DriverTrainingRecord:",
        "FleetTrainingView:",
        "FleetDriverRosterItem:",
        "HostVehicleSummary:",
        "HostVehicleEarningsSummary:",
        "HostVehicleMaintenanceItem:",
        "HostVehicleTripItem:",
        "HostVehicleCaseItem:",
        "ContractOperationalTerms:",
        "ContractOperationalViewRecord:",
      ];

      for (const s of requiredSchemas) {
        expect(content).toContain(s);
      }
    });
  });
});
