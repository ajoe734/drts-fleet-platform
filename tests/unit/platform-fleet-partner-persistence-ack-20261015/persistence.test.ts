import { describe, expect, it, vi } from "vitest";
import type { CreateFleetPartnerCommand } from "@drts/contracts";

import type { DatabaseService } from "../../../apps/api/src/common/db";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { BillingSettlementService } from "../../../apps/api/src/modules/billing-settlement/billing-settlement.service";
import { FleetPartnerController } from "../../../apps/api/src/modules/fleet-partner/fleet-partner.controller";
import { FleetPartnerRepository } from "../../../apps/api/src/modules/fleet-partner/fleet-partner.repository";
import { FleetPartnerService } from "../../../apps/api/src/modules/fleet-partner/fleet-partner.service";

const partnerId = "fleet-demo-001";
const createCommand: CreateFleetPartnerCommand = {
  legalName: " ACK Fleet Ltd. ",
  displayName: " ACK Fleet ",
  businessRegistrationNo: " ack-registration ",
  contactName: " Fleet contact ",
  contactPhone: " 555-0100 ",
  partnershipType: "fleet_management",
};
const affiliationCommand = {
  fleetPartnerId: partnerId,
  affiliationType: "contracted_under" as const,
  effectiveFrom: "2026-10-15T00:00:00.000Z",
  effectiveUntil: null,
  driverGroupId: " ack-group ",
};

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function makeService(repository?: FleetPartnerRepository) {
  const audit = new AuditNotificationService();
  const service = new FleetPartnerService(
    new BillingSettlementService(audit),
    {} as ConstructorParameters<typeof FleetPartnerService>[1],
    {} as ConstructorParameters<typeof FleetPartnerService>[2],
    repository,
  );
  const controller = new FleetPartnerController(
    service,
    {} as ConstructorParameters<typeof FleetPartnerController>[1],
    {} as ConstructorParameters<typeof FleetPartnerController>[2],
    {} as ConstructorParameters<typeof FleetPartnerController>[3],
    {} as ConstructorParameters<typeof FleetPartnerController>[4],
  );
  return { service, controller, audit };
}

// Only DatabaseService's SQL transport is simulated: no SQL schema or query
// behavior is reimplemented. The real repository selects/awaits writes and
// parses loadState; the real service and controller produce the response.
async function fixture() {
  const records = new Map<string, Map<string, unknown>>();
  let nextWrite: ReturnType<typeof deferred> | undefined;
  const query = vi.fn(async (sql: string, values?: readonly unknown[]) => {
    const insertTable = /INSERT INTO\s+(\S+)/.exec(sql)?.[1];
    if (insertTable) {
      const gate = nextWrite;
      nextWrite = undefined;
      if (gate) await gate.promise;
      const rows = records.get(insertTable) ?? new Map<string, unknown>();
      rows.set(String(values![0]), JSON.parse(String(values!.at(-1))));
      records.set(insertTable, rows);
    }
    const selectTable = /FROM\s+(\S+)/.exec(sql)?.[1];
    return {
      rows: [...(records.get(selectTable ?? "")?.values() ?? [])].map(
        (record) => ({ record }),
      ),
      rowCount: 1,
    };
  });
  const repository = new FleetPartnerRepository({
    isEnabled: () => true,
    query,
  } as unknown as DatabaseService);
  const report = vi
    .spyOn(repository, "reportPersistenceFailure")
    .mockImplementation(() => {});
  const services = makeService(repository);
  await services.service.onModuleInit();
  query.mockClear();
  return {
    ...services,
    repository,
    query,
    report,
    delay() {
      nextWrite = deferred();
      return nextWrite;
    },
    async restart() {
      const restarted = makeService(repository).service;
      await restarted.onModuleInit();
      return restarted;
    },
  };
}

function readback(service: FleetPartnerService) {
  const partners = service
    .listFleetPartners()
    .sort((a, b) => a.fleetPartnerId.localeCompare(b.fleetPartnerId));
  return {
    partners,
    affiliations: partners
      .flatMap((partner) =>
        service.listFleetPartnerDrivers(partner.fleetPartnerId),
      )
      .sort((a, b) => a.affiliationId.localeCompare(b.affiliationId)),
  };
}

const mutations = [
  {
    name: "create",
    table: "admin.phase1_fleet_partners",
    expected: { displayName: "ACK Fleet", active: true },
    service: (f: Awaited<ReturnType<typeof fixture>>) =>
      f.service.createFleetPartner(createCommand),
    controller: (f: Awaited<ReturnType<typeof fixture>>) =>
      f.controller.createFleetPartner(createCommand, "req-ack"),
  },
  {
    name: "edit",
    table: "admin.phase1_fleet_partners",
    expected: { displayName: "ACK edited", contactName: "ACK contact" },
    service: (f: Awaited<ReturnType<typeof fixture>>) =>
      f.service.updateFleetPartner(partnerId, {
        displayName: " ACK edited ",
        contactName: " ACK contact ",
      }),
    controller: (f: Awaited<ReturnType<typeof fixture>>) =>
      f.controller.updateFleetPartner(
        partnerId,
        { displayName: " ACK edited ", contactName: " ACK contact " },
        "req-ack",
      ),
  },
  {
    name: "disable",
    table: "admin.phase1_fleet_partners",
    expected: { fleetPartnerId: partnerId, active: false },
    service: (f: Awaited<ReturnType<typeof fixture>>) =>
      f.service.updateFleetPartner(partnerId, { active: false }),
    controller: (f: Awaited<ReturnType<typeof fixture>>) =>
      f.controller.updateFleetPartner(partnerId, { active: false }, "req-ack"),
  },
  {
    name: "affiliation",
    table: "admin.phase1_driver_fleet_affiliations",
    expected: { driverId: "ack-driver", driverGroupId: "ack-group" },
    service: (f: Awaited<ReturnType<typeof fixture>>) =>
      f.service.createDriverFleetAffiliation(
        " ack-driver ",
        affiliationCommand,
      ),
    controller: (f: Awaited<ReturnType<typeof fixture>>) =>
      f.controller.createDriverFleetAffiliation(
        " ack-driver ",
        affiliationCommand,
        "req-ack",
      ),
  },
];

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

describe.each(mutations)("canonical ACK: $name", (mutation) => {
  for (const entry of ["service", "controller"] as const) {
    it(`${entry} remains pending with prior readback until the actual SQL write resolves`, async () => {
      const f = await fixture();
      const before = readback(f.service);
      const recordAudit = vi.spyOn(f.audit, "recordAuditLog");
      const gate = f.delay();
      let settled = false;
      const call = Promise.resolve()
        .then(() => mutation[entry](f))
        .then((result) => {
          settled = true;
          return result;
        });
      try {
        await tick();
        expect(f.query).toHaveBeenCalledWith(
          expect.stringContaining(`INSERT INTO ${mutation.table}`),
          expect.any(Array),
        );
        expect(settled).toBe(false);
        expect(readback(f.service)).toEqual(before);
        expect(readback(await f.restart())).toEqual(before);
        expect(recordAudit).not.toHaveBeenCalled();
      } finally {
        gate.resolve();
        await call;
      }
      const response = await call;
      if (entry === "controller") {
        expect(response).toMatchObject({
          data: mutation.expected,
          meta: { requestId: "req-ack" },
        });
        expect("data" in response && response.data).not.toBeInstanceOf(Promise);
      } else {
        expect(response).toMatchObject(mutation.expected);
      }
      expect(readback(f.service)).not.toEqual(before);
      expect(readback(await f.restart())).toEqual(readback(f.service));
    });

    it(`${entry} propagates SQL rejection, retains prior readback, and allows retry`, async () => {
      const f = await fixture();
      const before = readback(f.service);
      const recordAudit = vi.spyOn(f.audit, "recordAuditLog");
      const error = new Error(`canonical ${mutation.name} rejected`);
      const gate = f.delay();
      // Observe both outcomes immediately, including the original broken path.
      const call = Promise.resolve()
        .then(() => mutation[entry](f))
        .then(
          (value) => ({ value }),
          (reason: unknown) => ({ reason }),
        );
      await tick();
      gate.reject(error);
      expect(await call).toEqual({ reason: error });
      expect(readback(f.service)).toEqual(before);
      expect(readback(await f.restart())).toEqual(before);
      expect(recordAudit).not.toHaveBeenCalled();

      await mutation[entry](f);
      expect(readback(f.service)).not.toEqual(before);
      expect(readback(await f.restart())).toEqual(readback(f.service));
    });
  }
});
