import { vi } from "vitest";
import type { PassengerServiceSelection, VehicleForm } from "@drts/contracts";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { DriverProfileService } from "../../../apps/api/src/modules/driver-profile/driver-profile.service";
import { DriverProfileRepository } from "../../../apps/api/src/modules/driver-profile/driver-profile.repository";
import { FleetPartnerService } from "../../../apps/api/src/modules/fleet-partner/fleet-partner.service";
import { FleetPartnerRepository } from "../../../apps/api/src/modules/fleet-partner/fleet-partner.repository";
import { GeoService } from "../../../apps/api/src/modules/geo/geo.service";
import { PassengerTrialTripService } from "../../../apps/api/src/modules/passenger-app/review-demo/passenger-trial-trip.service";
import { PassengerTrialTripController } from "../../../apps/api/src/modules/passenger-app/review-demo/passenger-trial-trip.controller";
import {
  ReviewSupplyService,
  REVIEW_AUTHORIZATION_ID,
  REVIEW_OPERATOR_ID,
} from "../../../apps/api/src/modules/passenger-app/review-demo/review-supply.service";
import {
  bookingFixture,
  dispatchFixture,
  NOW,
  VEHICLE,
} from "../passenger-accessible-service-20261107/fixture";

export { NOW };
type Row = Record<string, unknown>;
const at = () => new Date().toISOString();
const reply = (rows: unknown[] = []) => ({
  rows: structuredClone(rows),
  rowCount: rows.length,
});
const nativeJson =
  /^(reg\.phase1_registry_\w+|ops\.phase1_driver_profiles|ops\.phase1_service_products|ops\.runtime_profile_service_product_policies|admin\.phase1_fleet_partners|admin\.phase1_vehicle_eligibility_matrix)$/;

/** Only SQL/clock/geo boundary data is simulated. No registry, eligibility,
 * booking, controller, engine or mobility method is replaced. The external
 * store keeps actual INSERT JSON plus normalized rows as separate authorities.
 * No listener, PostgreSQL, physical car or provider acceptance is claimed. */
export async function simSupplyFixture(selection?: PassengerServiceSelection) {
  const booking = await bookingFixture();
  const originalBookingQuery = vi
    .mocked(booking.database.query)
    .getMockImplementation()!
    .bind(booking.database);
  const originalBookingConnect = booking.database.connect.bind(
    booking.database,
  );
  const reviewAuthorization = (value: unknown) => {
    const result = value as { rows: Row[]; rowCount?: number };
    return {
      ...result,
      rows: result.rows.map((row) => ({
        ...row,
        authorization_id: REVIEW_AUTHORIZATION_ID,
        operator_id: REVIEW_OPERATOR_ID,
      })),
    };
  };
  vi.spyOn(booking.database, "query").mockImplementation(
    async (sql, values) => {
      const result = await originalBookingQuery(sql, values);
      return (
        sql.includes("FROM reg.multi_taxi_operating_authorizations")
          ? reviewAuthorization(result)
          : result
      ) as never;
    },
  );
  vi.spyOn(booking.database, "connect").mockImplementation(async () => {
    const client = await originalBookingConnect();
    const query = client.query.bind(client);
    return {
      ...client,
      query: async (sql: string, values: unknown[] = []) => {
        const result = await query(sql, values);
        return sql.includes("FROM reg.multi_taxi_operating_authorizations")
          ? reviewAuthorization(result)
          : result;
      },
    } as never;
  });
  const quote = await booking.persistedQuote(selection);
  const created = await booking.booking.createRide(
    booking.account.drtsPassengerId,
    booking.commandFor(quote),
  );
  const order = booking.state.order;
  if (!order || order.orderId !== created.ride.order.orderId)
    throw new Error("Actual booking must persist the same canonical order");
  const d = await dispatchFixture(order, quote);
  const canonicalForms = new Map<string, VehicleForm | null>([
    [VEHICLE, "sedan"],
  ]);
  const normalized = new Map<string, Map<string, Row>>();
  const calls: {
    sql: string;
    values: readonly unknown[];
    transaction: boolean;
  }[] = [];
  const rows = (table: string) => [...d.sql.table(table).values()] as Row[];
  const raw = (table: string) => {
    if (!normalized.has(table)) normalized.set(table, new Map());
    return normalized.get(table)!;
  };
  raw("reg.multi_taxi_operating_authorizations").set(REVIEW_AUTHORIZATION_ID, {
    authorization_id: REVIEW_AUTHORIZATION_ID,
    operator_id: REVIEW_OPERATOR_ID,
    authority_code: "SIMULATED-REVIEW",
    business_plan_version: "review-v1",
    status: "approved",
    service_area_codes: ["TAIPEI_CORE"],
    active_fare_version_id: "taipei-20230401",
    effective_from: "2026-01-01T00:00:00.000Z",
    effective_until: "2099-01-01T00:00:00.000Z",
    created_at: at(),
    updated_at: at(),
  });
  d.sql.table("admin.phase1_fleet_partners").set("SIM-review-fleet", {
    fleetPartnerId: "SIM-review-fleet",
    active: true,
    multiTaxiOperatorIds: [REVIEW_OPERATOR_ID],
    legalName: "SIM fleet",
    displayName: "SIM fleet",
    createdAt: at(),
    updatedAt: at(),
  });
  const joinedVehicle = (record: Row, sql: string) => ({
    record: structuredClone(record),
    ...(sql.includes("canonical_vehicle_id")
      ? {
          canonical_vehicle_id: canonicalForms.has(String(record.vehicleId))
            ? record.vehicleId
            : null,
        }
      : {}),
    license_class:
      record.licenseType === "multi_purpose_taxi" ? "multi_taxi" : "taxi",
    vehicle_form: canonicalForms.get(String(record.vehicleId)) ?? null,
  });
  const fallbackQuery = d.database.query.bind(d.database);
  const fallbackConnect = d.database.connect.bind(d.database);
  let clearFormOnNextSelectedTransaction: string | null = null;
  const selectedTransactionFormRemovals: string[] = [];
  function removeFormAtNextSelectedTransaction(vehicleId: string) {
    clearFormOnNextSelectedTransaction = vehicleId;
  }
  async function wire(
    text: string,
    values: readonly unknown[],
    transaction: boolean,
    fallback: () => Promise<unknown>,
  ) {
    const sql = text.replace(/\s+/g, " ").trim();
    calls.push({ sql, values: structuredClone(values), transaction });
    if (
      sql.startsWith("SELECT jsonb_build_object(") &&
      sql.includes("AS record FROM ops.phase1_owned_orders o WHERE")
    ) {
      const key = String(values[0]);
      let orderId: unknown;
      if (sql.includes("WHERE o.order_id = $1")) orderId = key;
      else if (sql.includes("FROM ops.phase1_driver_tasks WHERE task_id = $1"))
        orderId = d.sql.table("ops.phase1_driver_tasks").get(key)?.orderId;
      else if (
        sql.includes("FROM ops.phase1_dispatch_jobs WHERE dispatch_job_id = $1")
      )
        orderId = d.sql.table("ops.phase1_dispatch_jobs").get(key)?.orderId;
      else throw new Error("Unsupported unit order-context selector");
      const order = d.sql.table("ops.phase1_owned_orders").get(String(orderId));
      if (!order) return reply();
      const sameOrder = (table: string, fields: readonly string[]) =>
        rows(table)
          .filter((record) => record.orderId === order.orderId)
          .sort((left, right) => {
            for (const field of fields) {
              const a = left[field];
              const b = right[field];
              if (a === b || (a == null && b == null)) continue;
              if (a == null) return -1;
              if (b == null) return 1;
              return typeof a === "number" && typeof b === "number"
                ? b - a
                : String(b).localeCompare(String(a));
            }
            return 0;
          });
      return reply([
        {
          record: {
            orders: [order],
            dispatchJobs: sameOrder("ops.phase1_dispatch_jobs", [
              "updatedAt",
              "createdAt",
            ]),
            dispatchAttempts: sameOrder("ops.phase1_dispatch_attempts", [
              "sequence",
              "createdAt",
            ]),
            dispatchAssignments: sameOrder("ops.phase1_dispatch_assignments", [
              "updatedAt",
              "createdAt",
            ]),
            driverTasks: sameOrder("ops.phase1_driver_tasks", [
              "updatedAt",
              "createdAt",
            ]),
            dispatchTraceLogs: sameOrder("ops.phase1_dispatch_trace_logs", [
              "createdAt",
            ]),
            passengerDisclosureSnapshots: sameOrder(
              "ops.passenger_dispatch_disclosure_snapshots",
              ["assignmentVersion", "createdAt"],
            ),
          },
        },
      ]);
    }
    if (sql.startsWith("WITH selected AS")) {
      if (transaction && clearFormOnNextSelectedTransaction) {
        const vehicleId = clearFormOnNextSelectedTransaction;
        clearFormOnNextSelectedTransaction = null;
        selectedTransactionFormRemovals.push(vehicleId);
        const record = d.sql
          .table("reg.phase1_registry_vehicles")
          .get(vehicleId);
        if (!record)
          throw new Error("External SQL mutation needs prepared supply");
        d.sql
          .table("reg.phase1_registry_vehicles")
          .set(vehicleId, { ...record, vehicleForm: null });
      }
      return reply(
        (values[0] as string[]).map((id) => ({
          vehicle_id: id,
          canonical_vehicle_id: canonicalForms.has(id) ? id : null,
          vehicle_form: canonicalForms.get(id) ?? null,
          snapshot_vehicle_form:
            d.sql.table("reg.phase1_registry_vehicles").get(id)?.vehicleForm ??
            null,
        })),
      );
    }
    if (
      sql.includes("FROM reg.vehicles") &&
      !sql.startsWith("WITH vehicles AS")
    ) {
      const ids = Array.isArray(values[0])
        ? (values[0] as string[])
        : [...canonicalForms.keys()];
      return reply(
        ids
          .filter((id) => canonicalForms.has(id))
          .map((id) => ({
            vehicle_id: id,
            license_class: "taxi",
            vehicle_form: canonicalForms.get(id),
          })),
      );
    }
    if (sql.startsWith("WITH vehicles AS MATERIALIZED")) {
      const vehicles = rows("reg.phase1_registry_vehicles").filter((record) =>
        (record.supportedServiceBuckets as string[]).includes(
          String(values[0]),
        ),
      );
      const vehicleIds = new Set(vehicles.map((record) => record.vehicleId));
      const pairs = rows("reg.phase1_registry_supply_pairs").filter((record) =>
        vehicleIds.has(record.vehicleId),
      );
      const driverIds = new Set(pairs.map((record) => record.driverId));
      const vehicleRows = (table: string) =>
        rows(table)
          .filter((record) => vehicleIds.has(record.vehicleId))
          .map((record) => ({ record }));
      return reply([
        {
          vehicles: vehicles.map((record) => joinedVehicle(record, sql)),
          drivers: rows("reg.phase1_registry_drivers")
            .filter((record) => driverIds.has(record.driverId))
            .map((record) => ({ record })),
          pairs: pairs.map((record) => ({ record })),
          contracts: vehicleRows("reg.phase1_registry_contracts"),
          policies: vehicleRows("reg.phase1_registry_policies"),
          exclusivities: vehicleRows("reg.phase1_registry_exclusivities"),
          disclosures: [
            ...raw("reg.vehicle_passenger_disclosure_profiles").values(),
          ].filter((record) => vehicleIds.has(record.vehicle_id)),
          credentials: [
            ...raw("reg.driver_public_registration_credentials").values(),
          ].filter((record) => driverIds.has(record.driver_id)),
          locations: [...raw("ops.phase1_driver_locations").values()].filter(
            (record) => driverIds.has(record.driver_id),
          ),
        },
      ]);
    }
    if (sql.startsWith("SELECT DISTINCT record->>'driverId'")) {
      const tasks = rows("ops.phase1_driver_tasks").filter(
        (task) =>
          (values[0] as string[]).includes(String(task.driverId)) &&
          (values[1] as string[]).includes(String(task.status)),
      );
      return reply(
        [...new Set(tasks.map((task) => task.driverId))].map((driver_id) => ({
          driver_id,
        })),
      );
    }
    if (
      sql.includes("FROM ops.phase1_driver_tasks") &&
      sql.includes("updated_at < now()")
    ) {
      return reply(
        rows("ops.phase1_driver_tasks")
          .filter(
            (task) =>
              (values[0] as string[]).includes(String(task.driverId)) &&
              (values[1] as string[]).includes(String(task.status)) &&
              Date.parse(String(task.updatedAt)) <
                Date.now() - Number(values[2]),
          )
          .map((record) => ({ record })),
      );
    }
    if (sql.startsWith("SELECT * FROM reg.multi_taxi_authorized_vehicles "))
      return reply([...raw("reg.multi_taxi_authorized_vehicles").values()]);
    if (
      sql.includes("FROM reg.multi_taxi_authorized_vehicles") &&
      sql.includes(" AS allowed")
    )
      return reply([
        {
          allowed: [...raw("reg.multi_taxi_authorized_vehicles").values()].some(
            (record) =>
              record.authorization_id === values[0] &&
              record.vehicle_id === values[1] &&
              record.status === "active",
          ),
        },
      ]);
    const inserted = /INSERT INTO ([\w.]+)\s*\(([^)]+)\)/.exec(sql);
    if (inserted && nativeJson.test(inserted[1]!)) {
      d.sql
        .table(inserted[1]!)
        .set(String(values[0]), JSON.parse(String(values.at(-1))));
      return reply();
    }
    if (
      inserted &&
      [
        "reg.multi_taxi_operating_authorizations",
        "reg.multi_taxi_authorized_vehicles",
        "reg.vehicle_passenger_disclosure_profiles",
        "reg.driver_public_registration_credentials",
        "ops.phase1_driver_locations",
        "telemetry.driver_location_events",
      ].includes(inserted[1]!)
    ) {
      const table = inserted[1]!;
      const columns = inserted[2]!.split(",").map((column) => column.trim());
      const record = Object.fromEntries(
        columns.map((column, index) => [
          column,
          column === "received_at" || column === "updated_at"
            ? at()
            : column === "missing_field_codes" ||
                column === "service_area_codes"
              ? JSON.parse(String(values[index]))
              : values[index],
        ]),
      );
      if (table === "ops.phase1_driver_locations")
        Object.assign(record, { updated_at: at() });
      if (table === "telemetry.driver_location_events")
        Object.assign(record, { received_at: at() });
      raw(table).set(String(values[0]), record);
      return reply([record]);
    }
    if (
      sql.includes(" AS configured") &&
      sql.includes("admin.phase1_vehicle_eligibility_matrix")
    ) {
      const matrix = rows("admin.phase1_vehicle_eligibility_matrix");
      return reply([
        {
          configured: matrix.length > 0,
          records: matrix.filter((record) =>
            (values[0] as string[]).includes(String(record.licenseType)),
          ),
        },
      ]);
    }
    const table = /FROM ([\w.]+)/.exec(sql)?.[1];
    if (table && sql.startsWith("SELECT") && nativeJson.test(table)) {
      let records = rows(table);
      if (sql.includes("multiTaxiOperatorIds"))
        records = records.filter((record) =>
          (record.multiTaxiOperatorIds as string[] | undefined)?.includes(
            JSON.parse(String(values[0]))[0],
          ),
        );
      else if (values.length && sql.includes("WHERE"))
        records = records.filter((record) =>
          table === "ops.phase1_service_products"
            ? (sql.includes("service_product_type")
                ? record.serviceProductType
                : record.serviceProductId) === values[0]
            : table.includes("drivers") || table.includes("profiles")
              ? record.driverId === values[0]
              : table.includes("vehicles")
                ? record.vehicleId === values[0]
                : true,
        );
      return reply(
        records.map((record) =>
          sql.startsWith("SELECT driver_id")
            ? { driver_id: record.driverId }
            : { record },
        ),
      );
    }
    if (table && sql.startsWith("SELECT") && normalized.has(table)) {
      let records = [...raw(table).values()];
      if (values.length && sql.includes("WHERE driver_id = $1"))
        records = records.filter((record) => record.driver_id === values[0]);
      if (values.length && sql.includes("WHERE vehicle_id = $1"))
        records = records.filter((record) => record.vehicle_id === values[0]);
      if (values.length && sql.includes("WHERE authorization_id = $1"))
        records = records.filter(
          (record) => record.authorization_id === values[0],
        );
      return reply(records);
    }
    return fallback();
  }
  vi.spyOn(d.database, "query").mockImplementation(
    (text, values = []) =>
      wire(text, values, false, () => fallbackQuery(text, values)) as never,
  );
  vi.spyOn(d.database, "connect").mockImplementation(async () => {
    const client = await fallbackConnect();
    return {
      ...client,
      query: (text: string, values: unknown[] = []) =>
        wire(text, values, true, () => client.query(text, values)),
    } as never;
  });
  await d.registryRepository.persistChanges({
    vehicles: d.registry
      .listVehicles()
      .map((vehicle) => ({ ...vehicle, vehicleForm: "sedan" })),
    drivers: d.registry.listDrivers(),
    supplyPairs: d.registry.listSupplyPairs(),
    contracts: d.registry.listContracts(),
    policies: d.registry.listPolicies(),
    exclusivities: d.registry.listExclusivities(),
  });
  await d.registry.prepareDispatchSupply("standard_taxi");
  d.registry.registerFleetPartnerOperatorMapping("partner-demo-001", [
    REVIEW_OPERATOR_ID,
  ]);
  const audit = new AuditNotificationService();
  const profiles = new DriverProfileService(
    audit,
    new DriverProfileRepository(d.database),
  );
  Reflect.set(d.registry, "driverProfileService", profiles);
  const products = d.products;
  const eligibility = d.eligibility;
  const fleets = new FleetPartnerService(
    {} as never,
    {} as never,
    d.registry,
    new FleetPartnerRepository(d.database),
  );
  const review = new ReviewSupplyService(
    d.database,
    d.registry,
    booking.multi,
    products,
    eligibility,
    fleets,
    profiles,
  );
  const trial = new PassengerTrialTripService(
    d.owned,
    d.registry,
    d.registryRepository,
    eligibility,
    booking.fareRepository,
    new GeoService({
      route: async () => ({
        provider: "SIM-unit-route",
        distanceMeters: 3250,
        durationSeconds: 800,
        encodedPolyline: "SIM-polyline",
        generatedAt: at(),
      }),
    } as never),
    d.database,
    booking.accounts,
    profiles,
    review,
  );
  const controller = new PassengerTrialTripController(trial);
  return {
    ...d,
    booking,
    quote,
    order,
    canonicalForms,
    raw,
    rows,
    calls,
    review,
    trial,
    controller,
    profiles,
    products,
    eligibility,
    removeFormAtNextSelectedTransaction,
    selectedTransactionFormRemovals,
  };
}
