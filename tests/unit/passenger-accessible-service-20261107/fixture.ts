import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { vi } from "vitest";
import type {
  OwnedOrderRecord,
  PassengerServiceSelection,
  VehicleForm,
} from "@drts/contracts";
import type { DatabaseService } from "../../../apps/api/src/common/db/database.service";
import { PassengerJwtService } from "../../../apps/api/src/common/auth/passenger-jwt.service";
import { PassengerAccountService } from "../../../apps/api/src/modules/passenger-app/account/passenger-account.service";
import { PassengerBookingService } from "../../../apps/api/src/modules/passenger-app/booking/passenger-booking.service";
import { PassengerFareRepository } from "../../../apps/api/src/modules/passenger-app/fare/passenger-fare.repository";
import { PassengerFareService } from "../../../apps/api/src/modules/passenger-app/fare/passenger-fare.service";
import type { FareQuoteSnapshot } from "../../../apps/api/src/modules/passenger-app/fare/fare.types";
import { PassengerPushDevicesService } from "../../../apps/api/src/modules/passenger-push-devices/passenger-push-devices.service";
import { GeoService } from "../../../apps/api/src/modules/geo/geo.service";
import { ServiceAreaService } from "../../../apps/api/src/modules/service-area/service-area.service";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { DriverProfileService } from "../../../apps/api/src/modules/driver-profile/driver-profile.service";
import { CallcenterService } from "../../../apps/api/src/modules/callcenter/callcenter.service";
import { OpsDispatchEventsService } from "../../../apps/api/src/common/ops-dispatch-events.service";
import { OwnedMobilityTaskEventsService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility-task-events.service";
import { RegulatoryRegistryRepository } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.repository";
import { RegulatoryRegistryService } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { VehicleEligibilityService } from "../../../apps/api/src/modules/vehicle-eligibility/vehicle-eligibility.service";
import { VehicleEligibilityRepository } from "../../../apps/api/src/modules/vehicle-eligibility/vehicle-eligibility.repository";
import { ServiceProductService } from "../../../apps/api/src/modules/service-product/service-product.service";
import { ServiceProductRepository } from "../../../apps/api/src/modules/service-product/service-product.repository";
import { OwnedMobilityRepository } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.repository";
import { OwnedMobilityService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { MultiTaxiRepository } from "../../../apps/api/src/modules/multi-taxi/multi-taxi.repository";
import { ForwarderService } from "../../../apps/api/src/modules/forwarder/forwarder.service";
import { MemoryPassengerStore } from "../pax-account-session-20261009/memory-store";
import { tariff } from "../pax-fare-quote-20261009/fixture";
import { ReferralSqlPort } from "../referral-embed-verified-session-canonical-journey-20261015/domain-fixture";
import {
  createProductionBookingFixture,
  NOW,
  type Fault,
} from "../pax-booking-history-20261009/production-booking-fixture";

export { NOW };
export const VEHICLE = "veh-demo-001";
export const DRIVER = "drv-demo-001";
const at = new Date(NOW).toISOString();

/** SQL/geo response boundaries only. Account, fare, engine, booking, transaction
 * callback, canonical mobility, token and history code are production modules.
 * These rows are explicit SIM inputs; they do not certify PG or physical equipment. */
export async function bookingFixture(faults: Fault[] = []) {
  const f = createProductionBookingFixture(faults, 20);
  const accounts = new PassengerAccountService(
    new MemoryPassengerStore(),
    new PassengerJwtService(),
  );
  const account = await accounts.findOrCreateByIdentity(
    "google",
    "synthetic-accessible-owner",
  );
  const session = await accounts.issueSession(account.drtsPassengerId);
  const identity = await accounts.authenticateAccessToken(session.accessToken);
  f.account.drtsPassengerId = account.drtsPassengerId;
  const snapshots = new Map<string, Record<string, unknown>>();
  const fareCalls: { sql: string; values: readonly unknown[] }[] = [];
  const originalQuery = f.database.query.bind(f.database);
  vi.spyOn(f.database, "query").mockImplementation(async (sql, values = []) => {
    const text = sql.replace(/\s+/g, " ").trim();
    if (text.includes("FROM passenger.fare_versions"))
      return {
        rows: [
          {
            version: tariff.version,
            effective_at: tariff.effectiveAt,
            effective_until: null,
            base_fare: tariff.baseFare,
            base_distance_meters: tariff.baseDistanceMeters,
            distance_rate: tariff.distanceRate,
            distance_increment_meters: tariff.distanceIncrementMeters,
            delay_rate: tariff.delayRate,
            delay_increment_seconds: tariff.delayIncrementSeconds,
            night_surcharge_amount: tariff.nightSurchargeAmount,
            night_window_start: tariff.nightSurchargeWindowStart,
            night_window_end: tariff.nightSurchargeWindowEnd,
            additional_fees: tariff.additionalFees,
            distance_rounding: tariff.distanceRounding,
            delay_rounding: tariff.delayRounding,
            total_rounding: tariff.totalRounding,
            total_increment: tariff.totalIncrement,
            night_application: tariff.nightApplication,
            source_reference: tariff.sourceReference,
          },
        ],
      } as never;
    if (text.startsWith("INSERT INTO passenger.fare_quote_snapshots")) {
      fareCalls.push({ sql: text, values: structuredClone(values) });
      const columns = /fare_quote_snapshots\s*\(([^)]+)\)/
        .exec(text)![1]!
        .split(",")
        .map((x) => x.trim());
      const row: Record<string, unknown> = {};
      columns.forEach((column, index) => {
        row[column] = [
          "route",
          "tariff_snapshot",
          "breakdown",
          "service_area_evaluation",
          "service_selection",
        ].includes(column)
          ? JSON.parse(String(values[index]))
          : values[index];
      });
      if (snapshots.has(String(values[0])))
        throw new Error(
          "Immutable quote fixture refuses duplicate snapshot ID",
        );
      snapshots.set(String(values[0]), row);
      return { rows: [], rowCount: 1 } as never;
    }
    if (text.includes("FROM passenger.fare_quote_snapshots")) {
      const row = snapshots.get(String(values[0]));
      return {
        rows:
          row?.drts_passenger_id === values[1] ? [structuredClone(row)] : [],
        rowCount: row ? 1 : 0,
      } as never;
    }
    if (
      text.includes("FROM passenger.booking_histories") &&
      text.includes("fare_snapshot_id")
    ) {
      return {
        rows: f.state.history
          ? [
              {
                drts_passenger_id: f.state.history[0],
                fare_snapshot_id: f.state.history[2],
                passenger_confirmed_at: f.state.history[3],
              },
            ]
          : [],
      } as never;
    }
    return originalQuery(sql, values);
  });
  const fareRepository = new PassengerFareRepository(f.database);
  const provider = {
    route: vi.fn(async () => ({
      provider: "synthetic-geo-port",
      distanceMeters: 3250,
      durationSeconds: 800,
      encodedPolyline: "unit-polyline",
      generatedAt: at,
    })),
  };
  const fares = new PassengerFareService(
    fareRepository,
    accounts,
    new GeoService(provider as never),
    new ServiceAreaService(),
  );
  const body = {
    originLat: 25.04,
    originLng: 121.55,
    destinationLat: 25.05,
    destinationLng: 121.58,
    scheduledAt: f.command.scheduledAt,
  };
  const booking = new PassengerBookingService(
    f.bookingRepository,
    f.multi,
    fareRepository,
    f.accountRepository as never,
    undefined,
    {
      resolveActiveDevices: async () => [],
    } as unknown as PassengerPushDevicesService,
  );
  async function ordinarySnapshot() {
    const q = await fares.quote(identity, body);
    if (q.serviceAreaResult !== "serviceable")
      throw new Error("Existing ordinary fare fixture must be serviceable");
    const snapshot = await fareRepository.findOwnedSnapshot(
      q.fareSnapshotId,
      account.drtsPassengerId,
    );
    if (!snapshot)
      throw new Error("Existing quote must be owned and persisted");
    return snapshot;
  }
  // Pre-existing immutable quote row isolates create/dispatch regressions from
  // quote-parser failures on the unfixed product. It is a new INSERT, not UPDATE.
  async function persistedQuote(selection?: PassengerServiceSelection) {
    const ordinary = await ordinarySnapshot();
    if (!selection) return ordinary;
    const selected: FareQuoteSnapshot = {
      ...ordinary,
      fareSnapshotId: randomUUID(),
      serviceSelection: { ...selection },
    };
    await fareRepository.insertSnapshot(selected);
    return selected;
  }
  const commandFor = (snapshot: FareQuoteSnapshot) => ({
    ...f.command,
    fareSnapshotId: snapshot.fareSnapshotId,
    origin: { ...snapshot.origin, address: "Synthetic pickup" },
    destination: { ...snapshot.destination, address: "Synthetic dropoff" },
  });
  return {
    ...f,
    account,
    identity,
    accounts,
    booking,
    fares,
    fareRepository,
    fareCalls,
    snapshots,
    body,
    persistedQuote,
    commandFor,
  };
}

/** Cold actual repository read, then actual Ops dispatch/assignment services.
 * Only the storage response port extends the existing SQL unit harness. */
function externalSqlReadGate(label: string) {
  let entered = false;
  let released = false;
  let unblock!: () => void;
  const blocked = new Promise<void>((resolve) => {
    unblock = resolve;
  });
  return {
    async waitUntilEntered() {
      for (let turn = 0; turn < 1000; turn += 1) {
        if (entered) return;
        await Promise.resolve();
      }
      throw new Error(`External SQL gate not reached: ${label}`);
    },
    release() {
      if (released) return;
      released = true;
      unblock();
    },
    async pause() {
      entered = true;
      await blocked;
    },
  };
}

export async function dispatchFixture(
  booked: OwnedOrderRecord,
  quote: FareQuoteSnapshot,
) {
  const sql = new ReferralSqlPort();
  sql
    .table("ops.phase1_owned_orders")
    .set(booked.orderId, structuredClone(booked));
  const forms = new Map<string, VehicleForm | null>([[VEHICLE, "accessible"]]);
  let nextCandidateFormRead: ReturnType<typeof externalSqlReadGate> | null =
    null;
  let nextAssignmentAuthorizationRead: ReturnType<
    typeof externalSqlReadGate
  > | null = null;
  function holdNextCandidateFormRead() {
    const gate = externalSqlReadGate("candidate vehicle-form SELECT");
    nextCandidateFormRead = gate;
    return gate;
  }
  function holdNextAssignmentAuthorizationRead() {
    const gate = externalSqlReadGate("assignment authorized-vehicle SELECT");
    nextAssignmentAuthorizationRead = gate;
    return gate;
  }
  const calls: {
    sql: string;
    values: readonly unknown[];
    transaction: boolean;
  }[] = [];
  const audit = new AuditNotificationService();
  const events = new OpsDispatchEventsService(new EventEmitter() as never);
  const registry = new RegulatoryRegistryService(
    events,
    audit,
    new DriverProfileService(audit),
  );
  const seed = {
    vehicles: registry.listVehicles(),
    drivers: registry.listDrivers(),
    pairs: registry.listSupplyPairs(),
    contracts: registry.listContracts(),
    policies: registry.listPolicies(),
    exclusivities: registry.listExclusivities(),
  };
  registry.registerFleetPartnerOperatorMapping("partner-demo-001", [
    "operator-unit",
  ]);
  const result = (rows: unknown[] = []) => ({
    rows: structuredClone(rows),
    rowCount: rows.length,
  });
  const row = {
    fare_snapshot_id: quote.fareSnapshotId,
    drts_passenger_id: quote.drtsPassengerId,
    fare_version: quote.fareVersion,
    origin_lat: quote.origin.lat,
    origin_lng: quote.origin.lng,
    destination_lat: quote.destination.lat,
    destination_lng: quote.destination.lng,
    scheduled_at: quote.scheduledAt,
    route: quote.route,
    tariff_snapshot: quote.tariffSnapshot,
    breakdown: quote.breakdown,
    service_area_evaluation: quote.serviceAreaEvaluation,
    estimated_min: quote.estimatedMin,
    estimated_max: quote.estimatedMax,
    created_at: quote.createdAt,
    expires_at: quote.expiresAt,
    service_selection: quote.serviceSelection ?? null,
  };
  async function wire(
    text: string,
    values: readonly unknown[],
    transaction: boolean,
    fallback: () => Promise<unknown>,
  ): Promise<unknown> {
    const s = text.replace(/\s+/g, " ").trim();
    calls.push({ sql: s, values: structuredClone(values), transaction });
    // Native catalog/matrix rows are external SIM prerequisites. Real product
    // and eligibility services read and amend them through their repositories.
    if (s.startsWith("LOCK TABLE admin.phase1_vehicle_eligibility_matrix "))
      return result();
    if (
      s.includes(" AS configured") &&
      s.includes("admin.phase1_vehicle_eligibility_matrix")
    ) {
      const matrix = [
        ...sql.table("admin.phase1_vehicle_eligibility_matrix").values(),
      ];
      return result([
        {
          configured: matrix.length > 0,
          records: matrix.filter((record) =>
            (values[0] as string[]).includes(record.licenseType),
          ),
        },
      ]);
    }
    const prerequisiteTable =
      /FROM (ops\.phase1_service_products|ops\.runtime_profile_service_product_policies|admin\.phase1_vehicle_eligibility_matrix)/.exec(
        s,
      )?.[1];
    if (prerequisiteTable && s.startsWith("SELECT")) {
      let records = [...sql.table(prerequisiteTable).values()];
      if (prerequisiteTable === "ops.phase1_service_products" && values.length)
        records = records.filter(
          (record) =>
            (s.includes("service_product_type = $1")
              ? record.serviceProductType
              : record.serviceProductId) === values[0],
        );
      if (
        prerequisiteTable === "ops.runtime_profile_service_product_policies" &&
        values.length
      )
        records = records.filter(
          (record) =>
            record.runtimeProfileCode === values[0] &&
            record.serviceProductCode === values[1],
        );
      return result(records.map((record) => ({ record })));
    }
    if (s.startsWith("WITH selected AS")) {
      const reply = result(
        (values[0] as string[]).map((id) => ({
          vehicle_id: id,
          canonical_vehicle_id: forms.has(id) ? id : null,
          vehicle_form: forms.get(id) ?? null,
          snapshot_vehicle_form: null,
        })),
      );
      const gate = transaction ? null : nextCandidateFormRead;
      if (gate) {
        nextCandidateFormRead = null;
        await gate.pause();
      }
      return reply;
    }
    // The native assignment statement supersedes older disclosures even when
    // its unique assignment/version insert is a retry that does nothing.
    if (
      s.startsWith(
        "WITH superseded AS ( UPDATE ops.passenger_dispatch_disclosure_snapshots ",
      )
    ) {
      const snapshots = sql.table(
        "ops.passenger_dispatch_disclosure_snapshots",
      );
      const incoming = JSON.parse(String(values[5]));
      const duplicate = [...snapshots.values()].some(
        (record) =>
          record.assignmentId === values[3] &&
          record.assignmentVersion === values[4],
      );
      const snapshotId = String(values[0]);
      if (!duplicate && snapshots.has(snapshotId))
        throw Object.assign(new Error("Duplicate disclosure snapshot ID"), {
          code: "23505",
        });
      for (const [id, record] of snapshots) {
        if (
          record.orderId === values[1] &&
          record.supersededAt === null &&
          record.assignmentVersion < Number(values[4])
        )
          snapshots.set(id, { ...record, supersededAt: String(values[7]) });
      }
      if (!duplicate) snapshots.set(snapshotId, incoming);
      return { ...result(), rowCount: duplicate ? 0 : 1 };
    }
    if (s.includes("FROM reg.vehicles")) {
      const reply = result(
        (values[0] as string[]).flatMap((id) =>
          forms.has(id)
            ? [{ vehicle_id: id, vehicle_form: forms.get(id) }]
            : [],
        ),
      );
      const gate = transaction ? null : nextCandidateFormRead;
      if (gate) {
        nextCandidateFormRead = null;
        await gate.pause();
      }
      return reply;
    }
    if (s.startsWith("WITH vehicles AS MATERIALIZED")) {
      const vehicles = seed.vehicles.filter((v) =>
        v.supportedServiceBuckets.some((bucket) => bucket === values[0]),
      );
      const vehicleIds = new Set(vehicles.map((v) => v.vehicleId));
      const pairs = seed.pairs.filter((p) => vehicleIds.has(p.vehicleId));
      const driverIds = new Set(pairs.map((p) => p.driverId));
      return result([
        {
          vehicles: vehicles.map((record) => ({
            record,
            canonical_vehicle_id: forms.has(record.vehicleId)
              ? record.vehicleId
              : null,
            license_class:
              record.licenseType === "multi_purpose_taxi"
                ? "multi_taxi"
                : "taxi",
            vehicle_form: forms.get(record.vehicleId) ?? null,
          })),
          drivers: seed.drivers
            .filter((d) => driverIds.has(d.driverId))
            .map((record) => ({ record })),
          pairs: pairs.map((record) => ({ record })),
          contracts: seed.contracts
            .filter((c) => vehicleIds.has(c.vehicleId))
            .map((record) => ({ record })),
          policies: seed.policies
            .filter((p) => vehicleIds.has(p.vehicleId))
            .map((record) => ({ record })),
          exclusivities: seed.exclusivities
            .filter((e) => vehicleIds.has(e.vehicleId))
            .map((record) => ({ record })),
          disclosures: [
            {
              vehicle_id: VEHICLE,
              make: "SYNTHETIC",
              model: "SIM accessible vehicle",
              model_year: 2025,
              door_count: 4,
              color: "yellow",
              status: "complete",
              missing_field_codes: [],
              verified_by_actor_id: "synthetic-reviewer",
              verified_at: at,
              source_submission_id: null,
              version: 1,
              updated_at: at,
            },
          ],
          credentials: [
            {
              driver_id: DRIVER,
              registration_no: "SIM-001",
              registration_area: "unit",
              effective_from: "2026-01-01",
              effective_until: "2099-01-01",
              status: "verified_active",
              masked_display: "SI***01",
              verified_by_actor_id: "synthetic-reviewer",
              verified_at: at,
              source_submission_id: null,
              version: 1,
              updated_at: at,
            },
          ],
          locations: [
            {
              driver_id: DRIVER,
              lat: 25.04,
              lng: 121.55,
              accuracy_m: 5,
              recorded_at: at,
              updated_at: at,
            },
          ],
        },
      ]);
    }
    if (
      s.includes("FROM ops.phase1_driver_matching_suppressions") ||
      s.includes("FROM admin.phase1_fleet_partners")
    )
      return result();
    if (s.includes("FROM reg.multi_taxi_operating_authorizations"))
      return result([{ operator_id: "operator-unit" }]);
    if (s.includes("FROM reg.multi_taxi_authorized_vehicles")) {
      const gate = transaction ? nextAssignmentAuthorizationRead : null;
      if (gate) {
        nextAssignmentAuthorizationRead = null;
        await gate.pause();
      }
      return result([
        {
          allowed:
            values[0] === booked.operatingAuthorizationId &&
            values[1] === VEHICLE,
        },
      ]);
    }
    if (s.startsWith("INSERT INTO ops.driver_rating_summaries"))
      return result([
        {
          driver_id: values[0],
          display_state: "new_driver",
          average_rating: null,
          rating_count: 0,
          last_rated_at: null,
          aggregate_version: 1,
          calculated_at: values[1],
        },
      ]);
    if (s.includes("FROM passenger.booking_histories"))
      return result(
        values[0] === booked.orderId
          ? [
              {
                fare_snapshot_id: quote.fareSnapshotId,
                drts_passenger_id: quote.drtsPassengerId,
                passenger_confirmed_at: at,
              },
            ]
          : [],
      );
    if (s.includes("FROM passenger.fare_quote_snapshots"))
      return result(
        row.drts_passenger_id === values[1] &&
          row.fare_snapshot_id === values[0]
          ? [row]
          : [],
      );
    if (s.startsWith("SELECT driver_id FROM reg.phase1_registry_drivers"))
      return result(
        seed.drivers
          .filter((d) => d.driverId === values[0])
          .map((d) => ({ driver_id: d.driverId })),
      );
    if (s.includes("FROM ops.consumer_notification_outbox")) return result();
    const extraTable =
      /FROM (ops\.phase1_dispatch_attempts|ops\.passenger_dispatch_disclosure_snapshots)/.exec(
        s,
      )?.[1];
    if (extraTable && s.startsWith("SELECT")) {
      const records = [...sql.table(extraTable).values()].filter(
        (record) =>
          !s.includes("order_id = $1") || record.orderId === values[0],
      );
      return result(records.map((record) => ({ record })));
    }
    return fallback();
  }
  const database = {
    isEnabled: () => true,
    query: (text: string, values: readonly unknown[] = []) =>
      wire(text, values, false, () => sql.query(text, values)),
    connect: async () => {
      const client = await sql.connect();
      return {
        query: (text: string, values: readonly unknown[] = []) =>
          wire(text, values, true, () => client.query(text, values)),
        release: client.release,
      };
    },
  } as unknown as DatabaseService; // External SQL transport only.
  const registryRepository = new RegulatoryRegistryRepository(database);
  Reflect.set(registry, "regulatoryRegistryRepository", registryRepository);
  await registry.prepareDispatchSupply("standard_taxi");
  const productRepository = new ServiceProductRepository(database);
  const products = new ServiceProductService(audit, productRepository);
  const reservation =
    products.getRuntimeServiceProductByType("taxi_reservation");
  if (!reservation)
    throw new Error("Fixture requires the native reservation master");
  await productRepository.persistChanges({
    records: [{ ...reservation, active: true }],
    runtimePolicies: [
      {
        runtimeProfileCode: "multi_taxi_direct",
        serviceProductCode: "taxi_reservation",
        active: true,
        effectiveFrom: "2026-01-01T00:00:00.000Z",
        effectiveUntil: null,
        createdAt: at,
        updatedAt: at,
      },
    ],
  });
  await products.prepareRuntimeProfileServiceProduct(
    "multi_taxi_direct",
    "taxi_reservation",
  );
  const eligibility = new VehicleEligibilityService(
    registry,
    audit,
    new VehicleEligibilityRepository(database),
    products,
  );
  await eligibility.enableServiceProductForSupply(
    "taxi_reservation",
    [VEHICLE],
    {
      actorId: "SIM-accessible-service-fixture",
      actorType: "system",
      tenantId: null,
    },
  );
  const owned = new OwnedMobilityService(
    registry,
    audit,
    new CallcenterService(audit),
    new OwnedMobilityTaskEventsService(new EventEmitter() as never),
    events,
    new OwnedMobilityRepository(database, new MultiTaxiRepository(database)),
    undefined,
    eligibility,
    products,
  );
  await owned.onModuleInit(); // No application bootstrap, listener or scheduler.
  const forwarder = new ForwarderService(
    registry,
    audit,
    [],
    undefined,
    owned,
    eligibility,
  );
  return {
    sql,
    forms,
    holdNextCandidateFormRead,
    holdNextAssignmentAuthorizationRead,
    calls,
    database,
    registryRepository,
    registry,
    products,
    eligibility,
    owned,
    forwarder,
  };
}
