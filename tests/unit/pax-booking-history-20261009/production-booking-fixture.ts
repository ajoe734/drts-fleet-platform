import { PassengerPushDevicesService } from "../../../apps/api/src/modules/passenger-push-devices/passenger-push-devices.service";
import { MultiTaxiService } from "../../../apps/api/src/modules/multi-taxi/multi-taxi.service";
import { MultiTaxiRepository } from "../../../apps/api/src/modules/multi-taxi/multi-taxi.repository";
import { OwnedMobilityService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { OwnedMobilityRepository } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.repository";
import { PassengerBookingService } from "../../../apps/api/src/modules/passenger-app/booking/passenger-booking.service";
import { PassengerBookingRepository } from "../../../apps/api/src/modules/passenger-app/booking/passenger-booking.repository";
import { PassengerBookingController } from "../../../apps/api/src/modules/passenger-app/booking/passenger-booking.controller";
import { PassengerFareRepository } from "../../../apps/api/src/modules/passenger-app/fare/passenger-fare.repository";
import { estimateFare } from "../../../apps/api/src/modules/passenger-app/fare/fare.engine";
import { tariff } from "../pax-fare-quote-20261009/fixture";
import type {
  CreatePassengerRideCommand,
  OwnedOrderRecord,
} from "@drts/contracts";
import type { DatabaseService } from "../../../apps/api/src/common/db/database.service";

export const NOW = Date.parse("2026-10-10T13:00:00Z");
export const QUOTE_ID = "22222222-2222-4222-8222-222222222222";
export const OWNER = "pax-booking-test";
export const PAYMENT_METHOD_ID = "33333333-3333-4333-8333-333333333333";
export type Fault =
  | "order"
  | "token"
  | "history"
  | "connect"
  | "commit"
  | "lost_commit_reply"
  | "rollback"
  | "cancel_connect"
  | "cancel_write";

// Only database responses and account/quote/audit/event boundaries are fixtures.
// All booking, mobility and access-token business logic and repository SQL are
// production implementations. This is NOT a PostgreSQL acceptance simulator.
export function createProductionBookingFixture(
  faults: Fault[] = [],
  leadMinutes = 20,
) {
  const state = {
    order: null as OwnedOrderRecord | null,
    token: null as unknown[] | null,
    history: null as unknown[] | null,
  };
  let pending: typeof state | null = null;
  const calls: {
    sql: string;
    values: readonly unknown[];
    transactional: boolean;
  }[] = [];
  const published: OwnedOrderRecord[] = [];
  // External SQL response boundary, not a PostgreSQL engine simulation. These
  // are the owned active/unexpired V0115 lookup rows; negative tests can model
  // the database returning no matching row or an unsettled obligation.
  const paymentPrerequisites = {
    activeMethodRows: [{ payment_method_id: PAYMENT_METHOD_ID }],
    unpaidRows: [] as { unpaid: number }[],
  };
  const release: boolean[] = [];
  const historyObservations: {
    memory: number;
    published: number;
    durable: boolean;
  }[] = [];
  let historyGate: Promise<void> | undefined;
  const query = async (
    sql: string,
    values: readonly unknown[] = [],
    transactional = false,
  ) => {
    const text = sql.trim().replace(/\s+/g, " ");
    calls.push({ sql: text, values, transactional });
    if (text.includes("FROM reg.multi_taxi_operating_authorizations"))
      return {
        rows: [
          {
            authorization_id: "11111111-1111-4111-8111-111111111111",
            operator_id: "operator-unit",
            authority_code: "TEST",
            business_plan_version: "test",
            status: "approved",
            service_area_codes: ["TPE"],
            active_fare_version_id: "test",
            effective_from: "2026-01-01T00:00:00Z",
            effective_until: "2027-01-01T00:00:00Z",
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
          },
        ],
        rowCount: 1,
      };
    if (text === "BEGIN") pending = structuredClone(state);
    if (text === "COMMIT") {
      if (faults.includes("commit")) throw new Error("injected commit failure");
      Object.assign(state, pending);
      pending = null;
      if (faults.includes("lost_commit_reply"))
        throw new Error("injected lost commit reply");
    }
    if (text === "ROLLBACK") {
      pending = null;
      if (faults.includes("rollback"))
        throw new Error("injected rollback failure");
    }
    if (text.startsWith("SELECT status FROM passenger.accounts"))
      return {
        rows:
          values[0] === account.drtsPassengerId
            ? [{ status: account.status }]
            : [],
        rowCount: 1,
      };
    if (text.startsWith("SELECT payment_method_id FROM passenger.psp_tokens"))
      return {
        rows:
          values[0] === PAYMENT_METHOD_ID &&
          values[1] === account.drtsPassengerId
            ? paymentPrerequisites.activeMethodRows
            : [],
        rowCount: paymentPrerequisites.activeMethodRows.length,
      };
    if (text.startsWith("SELECT 1 FROM passenger.booking_histories h"))
      return {
        rows:
          values[0] === account.drtsPassengerId && values[1] === "booking"
            ? paymentPrerequisites.unpaidRows
            : [],
        rowCount: paymentPrerequisites.unpaidRows.length,
      };
    const target = transactional && pending ? pending : state;
    if (text.startsWith("INSERT INTO ops.phase1_owned_orders")) {
      const order = JSON.parse(values[14] as string);
      if (
        faults.includes("order") ||
        (faults.includes("cancel_write") && order.status === "cancelled")
      )
        throw new Error("injected order failure");
      target.order = order;
    }
    if (text.startsWith("INSERT INTO ops.passenger_ride_access_tokens")) {
      if (faults.includes("token")) throw new Error("injected token failure");
      target.token = [...values];
    }
    if (text.startsWith("INSERT INTO passenger.booking_histories")) {
      historyObservations.push({
        memory: owned.listOrders().length,
        published: published.length,
        durable: state.order !== null,
      });
      if (historyGate) await historyGate;
      if (faults.includes("history"))
        throw new Error("injected history failure");
      target.history = [...values];
    }
    if (
      text.startsWith(
        "SELECT record, aggregate_version FROM ops.phase1_owned_orders",
      )
    ) {
      return {
        rows: state.order
          ? [{ record: structuredClone(state.order), aggregate_version: 1 }]
          : [],
        rowCount: 1,
      };
    }
    if (text.includes("SELECT count(*) FROM ops.phase1_dispatch_assignments"))
      return { rows: [{ count: "0" }], rowCount: 1 };
    if (text.includes("FROM passenger.fare_quote_snapshots"))
      return { rows: [], rowCount: 0 };
    if (
      text.includes("SELECT drts_passenger_id") &&
      text.includes("FROM passenger.booking_histories")
    ) {
      return {
        rows:
          state.history && state.history[1] === values[0]
            ? [{ drts_passenger_id: state.history[0] }]
            : [],
        rowCount: 1,
      };
    }
    return { rows: [], rowCount: 1 };
  };
  const database = {
    isEnabled: () => true,
    query: (sql: string, values?: readonly unknown[]) => query(sql, values),
    connect: async () => {
      if (
        faults.includes("connect") ||
        (faults.includes("cancel_connect") && state.order)
      )
        throw new Error("injected connect failure");
      return {
        query: (sql: string, values?: readonly unknown[]) =>
          query(sql, values, true),
        release: (destroy = false) => {
          if (destroy) pending = null;
          release.push(destroy);
        },
      };
    },
  } as unknown as DatabaseService;
  const multiRepository = new MultiTaxiRepository(database);
  const ownedRepository = new OwnedMobilityRepository(
    database,
    multiRepository,
  );
  const owned = new OwnedMobilityService(
    {} as never,
    { recordAuditLog() {} } as never,
    {} as never,
    {} as never,
    {
      publishOrderCreated(order: OwnedOrderRecord) {
        published.push(order);
      },
      publishOrderUpdated() {},
    } as never,
    ownedRepository,
  );
  const multi = new MultiTaxiService(owned, multiRepository);
  const account = {
    drtsPassengerId: OWNER,
    status: "active",
    displayName: "Account Name",
    contactPhone: "0912345678",
    contactPhoneVerified: false,
    verifiedPhone: null as string | null,
  };
  const command: CreatePassengerRideCommand = {
    scheduledAt: new Date(NOW + leadMinutes * 60000).toISOString(),
    origin: { lat: 25.04, lng: 121.51, address: "Origin Address" },
    destination: { lat: 25.06, lng: 121.55, address: "Destination Address" },
    paymentMethodId: PAYMENT_METHOD_ID,
    fareSnapshotId: QUOTE_ID,
    passengerConfirmedAt: new Date(NOW - 1000).toISOString(),
  };
  const route = {
    provider: "unit-geo-port",
    distanceMeters: 1251,
    durationSeconds: 600,
    encodedPolyline: "unit-original-route",
    generatedAt: new Date(NOW - 2000).toISOString(),
  };
  const snapshot = {
    ...estimateFare(tariff, { ...route, scheduledAt: command.scheduledAt }),
    ...command,
    fareSnapshotId: QUOTE_ID,
    route,
    tariffSnapshot: tariff,
    createdAt: new Date(NOW - 2000).toISOString(),
    drtsPassengerId: OWNER,
    expiresAt: new Date(NOW + 600000).toISOString(),
  };
  const fare = { findOwnedSnapshot: async () => snapshot };
  const accountRepository = {
    transaction: async (cb: (tx: unknown) => unknown) =>
      cb({ lockAccount: async () => account }),
  };
  const bookingRepository = new PassengerBookingRepository(database);
  const service = new PassengerBookingService(
    bookingRepository,
    multi,
    fare as never,
    accountRepository as never,
    undefined,
    {
      resolveActiveDevices: async () => [],
    } as unknown as PassengerPushDevicesService,
  );
  return {
    state,
    calls,
    published,
    release,
    historyObservations,
    database,
    owned,
    multi,
    account,
    paymentPrerequisites,
    accountRepository,
    snapshot,
    bookingRepository,
    service,
    command,
    controller: new PassengerBookingController(service, multi),
    fareRepository: new PassengerFareRepository(database),
    holdHistory: (gate: Promise<void>) => {
      historyGate = gate;
    },
  };
}
