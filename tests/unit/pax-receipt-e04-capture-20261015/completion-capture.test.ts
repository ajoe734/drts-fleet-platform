import { afterEach, describe, expect, it, vi } from "vitest";
import type { FleetPartnerRecord } from "@drts/contracts";
import type { OwnedMobilityMultiTaxiTripCompletedEvent } from "../../../apps/api/src/modules/owned-mobility/owned-mobility-events";
import { FleetPartnerRepository } from "../../../apps/api/src/modules/fleet-partner/fleet-partner.repository";
import { FleetPartnerService } from "../../../apps/api/src/modules/fleet-partner/fleet-partner.service";
import { RegulatoryRegistryRepository } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.repository";
import { PaymentMethodRepository } from "../../../apps/api/src/modules/passenger-app/payment/payment-method.repository";
import { PaymentMethodService } from "../../../apps/api/src/modules/passenger-app/payment/payment-method.service";
import { CertificateSupportRepository } from "../../../apps/api/src/modules/certificate-support/certificate-support.repository";
import { CertificateSupportService } from "../../../apps/api/src/modules/certificate-support/certificate-support.service";
import { MultiTaxiRepository } from "../../../apps/api/src/modules/multi-taxi/multi-taxi.repository";
import { mapNativePassengerCertificate } from "../../../packages/passenger-client/src/ride/native-presentation";
import { command, setup } from "./completion-fixture";

const owner = "drts_passenger_11111111-1111-4111-8111-111111111111";
const method = "11111111-2222-4333-8444-555555555555";
const authorization = "22222222-2222-4333-8444-555555555555";
const legalName = "Unit synthetic operator（合成・非正式）";
afterEach(() => vi.unstubAllEnvs());

// Only SQL transport rows are fixtures. Native services/repositories perform
// the authority reads, completion, outbox serialization, receipt write and map.
async function fixture(transactional: boolean) {
  vi.stubEnv("MULTI_TAXI_CERTIFICATE_SERVICE_PHONE", "02-2944-0985");
  const ctx = await setup(transactional);
  const masters = new Map<string, FleetPartnerRecord>();
  let cardOwner = owner;
  let last4 = "0042";
  let mask: string | null = "••••9001";
  let operatorId: string | null = "unit-authority-operator";
  let receipt: Record<string, unknown> | undefined;
  let failWrite = false;
  let holdWrite: Promise<void> | undefined;
  let entered: (() => void) | undefined;
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    if (sql.includes("INSERT INTO admin.phase1_fleet_partners")) {
      entered?.();
      await holdWrite;
      if (failWrite) throw new Error("fixture rejected master write");
      masters.set(String(values[0]), JSON.parse(String(values.at(-1))));
      return { rows: [] };
    }
    if (sql.includes("FROM admin.phase1_fleet_partners")) {
      if (sql.includes("WHERE fleet_partner_id = $1")) {
        const record = masters.get(String(values[0]));
        return { rows: record ? [{ record: structuredClone(record) }] : [] };
      }
      const ids = JSON.parse(String(values[0])) as string[];
      return {
        rows: [...masters.values()]
          .filter((p) => ids.some((id) => p.multiTaxiOperatorIds?.includes(id)))
          .map((record) => ({ record: structuredClone(record) })),
      };
    }
    if (sql.includes("FROM reg.multi_taxi_operating_authorizations")) {
      return {
        rows:
          values[0] === authorization && operatorId
            ? [{ operator_id: operatorId }]
            : [],
      };
    }
    if (sql.includes("FROM reg.driver_public_registration_credentials")) {
      return {
        rows:
          values[0] === ctx.driverId && mask
            ? [
                {
                  driver_id: ctx.driverId,
                  registration_no: "SIMULATED-9001",
                  registration_area: "unit",
                  effective_from: "2026-01-01",
                  effective_until: "2099-01-01",
                  status: "verified_active",
                  masked_display: mask,
                  verified_by_actor_id: "synthetic",
                  verified_at: "2026-01-01",
                  version: 1,
                  updated_at: "2026-01-01",
                },
              ]
            : [],
      };
    }
    if (sql.includes("FROM passenger.psp_tokens")) {
      return {
        rows:
          values[0] === cardOwner && values[1] === method
            ? [{ card_type: "SYNTHETIC", last4 }]
            : [],
      };
    }
    if (sql.includes("INSERT INTO reporting.multi_taxi_electronic_receipts")) {
      receipt ??= {
        receipt_id: values[0],
        order_id: values[1],
        receipt_no: values[2],
        receipt_version: 1,
        is_current: true,
        amount_minor: values[3],
        currency: values[4],
        issued_at: values[5],
        record: JSON.parse(String(values[6])),
      };
      return { rows: [] };
    }
    if (sql.includes("FROM reporting.multi_taxi_electronic_receipts"))
      return {
        rows:
          receipt && [receipt.order_id, receipt.receipt_id].includes(values[0])
            ? [structuredClone(receipt)]
            : [],
      };
    throw new Error(`Unexpected source/receipt SQL: ${sql}`);
  });
  const database = { isEnabled: () => true, query };
  const fleets = new FleetPartnerService(
    {} as never,
    ctx.service,
    ctx.registry,
    new FleetPartnerRepository(database as never),
  );
  const registryStore = new RegulatoryRegistryRepository(database as never);
  Reflect.set(ctx.registry, "regulatoryRegistryRepository", registryStore);
  Reflect.set(ctx.service, "receiptRegistryRepository", registryStore);
  Reflect.set(
    ctx.service,
    "receiptFleetRepository",
    new FleetPartnerRepository(database as never),
  );
  Reflect.set(
    ctx.service,
    "receiptPaymentMethods",
    new PaymentMethodService(
      new PaymentMethodRepository(database as never),
      {} as never,
    ),
  );
  // Unit context selection only; actual booking/PG association is hosted below.
  ctx.storedOrder.passenger = {
    ...(ctx.storedOrder.passenger as object),
    passengerId: owner,
  };
  ctx.storedOrder.operatingAuthorizationId = authorization;
  ctx.storedOrder.paymentMethodTokenRef = method;
  if (transactional) {
    const repository = Reflect.get(ctx.service, "ownedMobilityRepository");
    await repository.persistChanges({ orders: [ctx.storedOrder] });
  }
  const partner = await fleets.createFleetPartner({
    legalName,
    displayName: "A different label",
    businessRegistrationNo: "SYNTHETIC",
    contactName: "unit",
    contactPhone: "synthetic",
    partnershipType: "business_dispatch_fleet",
    multiTaxiOperatorIds: ["unit-authority-operator"],
  });
  await ctx.setSurname("歐陽");
  const certificates = new CertificateSupportService(
    new CertificateSupportRepository(database as never),
  );
  const receipts = new MultiTaxiRepository(database as never);
  return {
    ...ctx,
    query,
    fleets,
    partner,
    certificates,
    receipts,
    masters,
    event: () =>
      ctx.event() as unknown as OwnedMobilityMultiTaxiTripCompletedEvent,
    changeCardOwner: () => {
      cardOwner = "another-passenger";
    },
    changeMasters: async () => {
      await fleets.updateFleetPartner(partner.fleetPartnerId, {
        legalName: "Later legal name",
      });
      await ctx.setSurname("司馬");
      mask = "••••9002";
      last4 = "9999";
    },
    noCredential: () => {
      mask = null;
    },
    noAuthority: () => {
      operatorId = null;
    },
    rejectWrite: () => {
      failWrite = true;
    },
    holdWrite: () => {
      let release!: () => void;
      const ready = new Promise<void>((resolve) => {
        entered = resolve;
      });
      holdWrite = new Promise<void>((resolve) => {
        release = resolve;
      });
      return { ready, release };
    },
  };
}

describe.each([false, true])(
  "E04 actual completion (transactional=%s; SQL transport only)",
  (transactional) => {
    it("captures authority→explicit Fleet, surname, masked credential and selected owner's method through writer/readback; later masters and replay preserve snapshot", async () => {
      const f = await fixture(transactional);
      const result = await f.service.completeDriverTask(
        f.taskId,
        command,
        "e04-completion",
      );
      const event = f.event();
      expect(event.e04Snapshot).toEqual({
        fleetOperatorName: legalName,
        driverSurname: "歐陽",
        driverRegistrationMasked: "••••9001",
        paymentMethodDisplay: "SYNTHETIC ••••0042",
        fareBreakdown: command.actualFareBreakdown,
      });
      expect(event).toMatchObject({
        orderId: f.storedOrder.orderId,
        tripId: f.taskId,
        actualFareBreakdown: command.actualFareBreakdown,
        plateNo: expect.any(String),
        pickupAt: "2026-04-10T09:10:00Z",
        dropoffAt: command.completedAt,
        travelDurationSeconds: 2100,
        distanceMeters: 22400,
      });
      if (transactional)
        expect(
          f.taskSql.outbox.find(
            (r) => r.effectType === "multi_taxi_certificate",
          )?.payload,
        ).toMatchObject({ event });
      await f.certificates.writeCompletedTrip(event);
      const raw = await f.receipts.findElectronicReceipt(event.orderId);
      expect(raw?.record.e04Snapshot).toEqual(event.e04Snapshot);
      expect(mapNativePassengerCertificate(raw, true).state).toBe("available");
      const before = await f.certificates.getPassengerView(
        raw!.receiptId,
        event.orderId,
      );
      const html = await f.certificates.getPassengerArtifact(
        raw!.receiptId,
        event.orderId,
        "html",
      );
      expect(html.buffer.toString()).toContain(legalName);
      await f.changeMasters();
      expect(
        await f.service.completeDriverTask(f.taskId, command, "e04-completion"),
      ).toEqual(result);
      await f.certificates.writeCompletedTrip(event);
      expect(
        await f.certificates.getPassengerView(raw!.receiptId, event.orderId),
      ).toEqual(before);
      expect(
        mapNativePassengerCertificate(
          await f.receipts.findElectronicReceipt(event.orderId),
          true,
        ),
      ).toEqual(mapNativePassengerCertificate(raw, true));
      await expect(
        f.certificates.getPassengerView(raw!.receiptId, "another-order"),
      ).rejects.toMatchObject({ code: "CERTIFICATE_NOT_FOUND" });
      // Same method UUID must always be looked up with this trip's passenger.
      expect(
        f.query.mock.calls
          .filter(([sql]) => sql.includes("FROM passenger.psp_tokens"))
          .map(([, values]) => values),
      ).toEqual([[owner, method]]);
    });

    it.each([
      "card owner",
      "credential",
      "authorization",
      "Fleet mapping",
      "ambiguous mapping",
      "actual fare",
    ])("retains missing-fields behavior with missing %s", async (missing) => {
      const f = await fixture(transactional);
      if (missing === "card owner") f.changeCardOwner();
      if (missing === "credential") f.noCredential();
      if (missing === "authorization") f.noAuthority();
      if (missing === "Fleet mapping")
        await f.fleets.updateFleetPartner(f.partner.fleetPartnerId, {
          multiTaxiOperatorIds: [],
        });
      if (missing === "ambiguous mapping")
        f.masters.set("second", { ...f.partner, fleetPartnerId: "second" });
      const input = { ...command };
      if (missing === "actual fare") delete input.actualFareBreakdown;
      await f.service.completeDriverTask(f.taskId, input);
      expect(f.event()).not.toHaveProperty("e04Snapshot");
      await f.certificates.writeCompletedTrip(f.event());
      const raw = await f.receipts.findElectronicReceipt(f.event().orderId);
      expect(mapNativePassengerCertificate(raw, true)).toMatchObject({
        state: "error",
        errorCode: "PASSENGER_RECEIPT_LEGAL_FIELDS_MISSING",
      });
      await expect(
        f.certificates.getPassengerView(raw!.receiptId, f.event().orderId),
      ).rejects.toMatchObject({ code: "PASSENGER_E04_NOT_READY" });
    });
  },
);

it("Fleet explicit mapping is detached and becomes visible only after write ACK; failed writes retain prior mapping", async () => {
  const f = await fixture(false);
  f.partner.multiTaxiOperatorIds!.push("cannot-mutate-master");
  expect(
    (await f.fleets.getFleetPartner(f.partner.fleetPartnerId))
      .multiTaxiOperatorIds,
  ).toEqual(["unit-authority-operator"]);
  const gate = f.holdWrite();
  const update = f.fleets.updateFleetPartner(f.partner.fleetPartnerId, {
    multiTaxiOperatorIds: ["new-operator"],
  });
  await gate.ready;
  expect(
    (await f.fleets.getFleetPartner(f.partner.fleetPartnerId))
      .multiTaxiOperatorIds,
  ).toEqual(["unit-authority-operator"]);
  gate.release();
  await update;
  expect(
    (await f.fleets.findFleetPartnerForMultiTaxiOperator("new-operator"))
      ?.fleetPartnerId,
  ).toBe(f.partner.fleetPartnerId);
  f.rejectWrite();
  await expect(
    f.fleets.updateFleetPartner(f.partner.fleetPartnerId, {
      multiTaxiOperatorIds: ["rejected-operator"],
    }),
  ).rejects.toBeDefined();
  expect(
    (await f.fleets.getFleetPartner(f.partner.fleetPartnerId))
      .multiTaxiOperatorIds,
  ).toEqual(["new-operator"]);
});
