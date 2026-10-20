import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  PaymentPostgresHarness,
  hostedPaymentEnabled,
} from "../pax-qa-20261009/payment-postgres-harness";
import { services, approvalRecords } from "./fixture";

// Original hosted-only DB harness; never open PG or a product socket on this VM.
describe.skipIf(!hostedPaymentEnabled)(
  "normal approved supply pair native transaction",
  () => {
    const h = new PaymentPostgresHarness();
    beforeAll(() => h.open(), 240000);
    beforeEach(() => h.reset(), 30000);
    afterEach(() => vi.restoreAllMocks());
    afterAll(() => h.close(), 30000);

    async function actor() {
      const database = h.peerDatabase(),
        f = services(database),
        records = approvalRecords(f.registry);
      await f.submissions.persistChanges({
        submissions: [records.driver, records.vehicle],
        vehicleDrafts: [records.draft],
      });
      await f.registryRepository.persistChangesWithExecutor(database, {
        drivers: [
          f.registry
            .listDrivers()
            .find((d) => d.driverId === records.driverId)!,
        ],
      });
      return {
        ...f,
        database,
        ...records,
        approve: () =>
          f.review.approveSubmission(
            records.vehicle.submissionId,
            { expectedRevisionNo: 2, reasonCode: "all_documents_valid" },
            "unit-reviewer",
          ),
      };
    }

    it("commits the same canonical pair with null unknown ETA and authoritative approved status", async () => {
      const f = await actor();
      const approved = await f.approve();
      const result = await h.pool!.query(
        `SELECT p.vehicle_id, p.driver_id, p.eta_minutes, p.record,
      (SELECT status FROM fleet.supply_submissions WHERE submission_id=$1) AS status,
      (SELECT count(*)::int FROM fleet.supply_review_events WHERE submission_id=$1 AND event_type='approved') AS approvals
      FROM reg.phase1_registry_supply_pairs p WHERE pair_id=$2`,
        [
          f.vehicle.submissionId,
          `${approved.canonicalVehicleId}::${f.driverId}`,
        ],
      );
      expect(result.rows).toEqual([
        {
          vehicle_id: approved.canonicalVehicleId,
          driver_id: f.driverId,
          eta_minutes: null,
          record: {
            vehicleId: approved.canonicalVehicleId,
            driverId: f.driverId,
            etaMinutes: null,
          },
          status: "approved",
          approvals: 1,
        },
      ]);
      const peer = services(h.peerDatabase());
      await peer.registry.prepareDispatchSupply("standard_taxi");
      expect(peer.registry.listSupplyPairs()).toContainEqual({
        vehicleId: approved.canonicalVehicleId,
        driverId: f.driverId,
        etaMinutes: null,
      });
    });

    it("rolls pair, vehicle and approval back on a later actual review-event write failure", async () => {
      const f = await actor(),
        before = f.registry.listSupplyPairs();
      const connect = f.database.connect.bind(f.database);
      vi.spyOn(f.database, "connect").mockImplementation(async () => {
        const client = await connect(),
          query = client.query.bind(client);
        client.query = (async (...args: any[]) => {
          if (
            String(args[0]).includes("INSERT INTO fleet.supply_review_events")
          )
            throw new Error("controlled event transport failure");
          return (query as any)(...args);
        }) as typeof client.query;
        return client;
      });
      await expect(f.approve()).rejects.toThrow(
        "controlled event transport failure",
      );
      const attemptedVehicle = f.registry
        .listVehicles()
        .find((v) => v.plateNo === f.draft.plateNo)!;
      const result = await h.pool!.query(
        `SELECT status,
      (SELECT count(*)::int FROM reg.phase1_registry_supply_pairs WHERE vehicle_id=$3) AS pairs,
      (SELECT count(*)::int FROM reg.phase1_registry_vehicles WHERE vehicle_id=$3) AS vehicles,
      (SELECT count(*)::int FROM reg.phase1_registry_drivers WHERE driver_id=$2) AS drivers
      FROM fleet.supply_submissions WHERE submission_id=$1`,
        [f.vehicle.submissionId, f.driverId, attemptedVehicle.vehicleId],
      );
      expect(result.rows).toEqual([
        { status: "in_review", pairs: 0, vehicles: 0, drivers: 1 },
      ]);
      expect(f.registry.listSupplyPairs()).toEqual(before);
    });
  },
);
