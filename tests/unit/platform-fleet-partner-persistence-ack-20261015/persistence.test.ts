import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import type { CreateFleetPartnerCommand } from "@drts/contracts";

import { ApiRequestError } from "../../../apps/api/src/common/api-envelope";
import { BootstrapAuthGuard } from "../../../apps/api/src/common/auth/bootstrap-auth.guard";
import type { AuthenticatedRequestLike } from "../../../apps/api/src/common/auth/auth.types";
import type { DatabaseService } from "../../../apps/api/src/common/db";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { BillingSettlementService } from "../../../apps/api/src/modules/billing-settlement/billing-settlement.service";
import { FleetPartnerController } from "../../../apps/api/src/modules/fleet-partner/fleet-partner.controller";
import { FleetPartnerRepository } from "../../../apps/api/src/modules/fleet-partner/fleet-partner.repository";
import { FleetPartnerService } from "../../../apps/api/src/modules/fleet-partner/fleet-partner.service";

const partnerId = "fleet-demo-001";
// Nest is an API package dependency, so resolve it from that workspace.
const { Reflector } = createRequire(
  new URL("../../../apps/api/package.json", import.meta.url),
)("@nestjs/core");
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
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
  let nextWrite:
    | { gate: ReturnType<typeof deferred>; targetId?: string }
    | undefined;
  const query = vi.fn(async (sql: string, values?: readonly unknown[]) => {
    const insertTable = /INSERT INTO\s+(\S+)/.exec(sql)?.[1];
    if (insertTable) {
      const matchesTarget =
        !nextWrite?.targetId ||
        String(values?.[0]) === nextWrite.targetId ||
        String(values?.[1]) === nextWrite.targetId;
      const gate = matchesTarget ? nextWrite?.gate : undefined;
      if (matchesTarget) nextWrite = undefined;
      if (gate) await gate.promise;
      const rows = records.get(insertTable) ?? new Map<string, unknown>();
      rows.set(String(values![0]), JSON.parse(String(values!.at(-1))));
      records.set(insertTable, rows);
    }
    const selectTable = /FROM\s+(\S+)/.exec(sql)?.[1];
    if (sql.includes("WHERE fleet_partner_id = $1")) {
      if (nextWrite && !nextWrite.targetId) {
        nextWrite.targetId = String(values?.[0]);
      }
      const row = records.get(selectTable ?? "")?.get(String(values?.[0]));
      return {
        rows: row ? [{ record: row }] : [],
        rowCount: row ? 1 : 0,
      };
    }
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
      const gate = deferred();
      nextWrite = { gate };
      return gate;
    },
    async restart() {
      const restarted = makeService(repository).service;
      await restarted.onModuleInit();
      return restarted;
    },
  };
}

async function readback(service: FleetPartnerService) {
  const partners = (await service.listFleetPartners()).sort((a, b) =>
    a.fleetPartnerId.localeCompare(b.fleetPartnerId),
  );
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
      const before = await readback(f.service);
      const recordAudit = vi.spyOn(f.audit, "recordAuditLog");
      const gate = f.delay();
      let settled = false;
      const call = Promise.resolve()
        .then(async () => mutation[entry](f))
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
        expect(await readback(f.service)).toEqual(before);
        expect(await readback(await f.restart())).toEqual(before);
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
      expect(await readback(f.service)).not.toEqual(before);
      expect(await readback(await f.restart())).toEqual(
        await readback(f.service),
      );
    });

    it(`${entry} propagates SQL rejection, retains prior readback, and allows retry`, async () => {
      const f = await fixture();
      const before = await readback(f.service);
      const recordAudit = vi.spyOn(f.audit, "recordAuditLog");
      const error = new Error(`canonical ${mutation.name} rejected`);
      const gate = f.delay();
      // Observe both outcomes immediately, including the original broken path.
      const call = Promise.resolve()
        .then(async () => mutation[entry](f))
        .then(
          (value) => ({ value }),
          (reason: unknown) => ({ reason }),
        );
      await tick();
      gate.reject(error);
      expect(await call).toEqual({ reason: error });
      expect(await readback(f.service)).toEqual(before);
      expect(await readback(await f.restart())).toEqual(before);
      expect(recordAudit).not.toHaveBeenCalled();

      await mutation[entry](f);
      expect(await readback(f.service)).not.toEqual(before);
      expect(await readback(await f.restart())).toEqual(
        await readback(f.service),
      );
    });
  }
});

describe("acknowledged updates and recovery", () => {
  it.each([false, true])(
    "serializes partial edits of one partner and releases after rejection=%s while other partners proceed",
    async (rejectFirst) => {
      const f = await fixture();
      const before = await f.service.getFleetPartner(partnerId);
      const gate = f.delay();
      const error = new Error("first edit rejected");
      const first = f.service
        .updateFleetPartner(partnerId, { displayName: "First edit" })
        .then(
          (value) => ({ value }),
          (reason: unknown) => ({ reason }),
        );
      let secondSettled = false;
      const second = f.service
        .updateFleetPartner(partnerId, { contactName: "Second edit" })
        .then((value) => {
          secondSettled = true;
          return value;
        });
      const unrelated = await f.service.createFleetPartner({
        ...createCommand,
        displayName: "Independent partner",
      });
      try {
        await tick();
        expect(secondSettled).toBe(false);
        expect(await f.service.getFleetPartner(partnerId)).toEqual(before);
        expect(
          await f.service.getFleetPartner(unrelated.fleetPartnerId),
        ).toEqual(unrelated);
      } finally {
        if (rejectFirst) gate.reject(error);
        else gate.resolve();
        await first;
        await second;
      }
      if (rejectFirst) expect(await first).toEqual({ reason: error });
      else
        expect(await first).toMatchObject({
          value: { displayName: "First edit" },
        });
      expect(await second).toMatchObject({
        displayName: rejectFirst ? before.displayName : "First edit",
        contactName: "Second edit",
      });
      expect(await f.service.getFleetPartner(unrelated.fleetPartnerId)).toEqual(
        unrelated,
      );
      expect(await readback(await f.restart())).toEqual(
        await readback(f.service),
      );
    },
  );

  it("does not roll back an unrelated acknowledged create or affiliation after a delayed create fails", async () => {
    const f = await fixture();
    const gate = f.delay();
    const error = new Error("create rejected");
    const failed = f.service
      .createFleetPartner(createCommand)
      .catch((reason: unknown) => reason);
    const other = await f.service.createFleetPartner({
      ...createCommand,
      displayName: "Retained partner",
    });
    const affiliation = await f.service.createDriverFleetAffiliation(
      "retained-driver",
      { ...affiliationCommand, fleetPartnerId: other.fleetPartnerId },
    );
    gate.reject(error);
    expect(await failed).toBe(error);
    expect(
      (await f.service.listFleetPartners()).map(
        (partner) => partner.displayName,
      ),
    ).not.toContain("ACK Fleet");
    expect(await f.service.getFleetPartner(other.fleetPartnerId)).toEqual(
      other,
    );
    expect(f.service.listFleetPartnerDrivers(other.fleetPartnerId)).toEqual([
      affiliation,
    ]);
    expect(await readback(await f.restart())).toEqual(
      await readback(f.service),
    );
  });

  it("rejects invalid partial edits without publishing earlier fields or calling SQL", async () => {
    const f = await fixture();
    const before = await readback(f.service);
    f.query.mockClear();
    await expect(
      f.service.updateFleetPartner(partnerId, {
        displayName: "Must not leak",
        contactPhone: " ",
      }),
    ).rejects.toBeInstanceOf(ApiRequestError);
    expect(f.query).not.toHaveBeenCalled();
    expect(await readback(f.service)).toEqual(before);
    await expect(
      f.service.updateFleetPartner(partnerId, { displayName: "Retry" }),
    ).resolves.toMatchObject({ displayName: "Retry" });
    expect(await readback(await f.restart())).toEqual(
      await readback(f.service),
    );
  });
});

describe.each(["absent", "disabled"] as const)(
  "supported %s repository mode",
  (mode) => {
    it("keeps create/edit/soft-disable/reference records and safe envelopes without a DB requirement", async () => {
      const { service, controller } = makeService(
        mode === "disabled" ? new FleetPartnerRepository() : undefined,
      );
      await service.onModuleInit();
      const created = await controller.createFleetPartner(
        createCommand,
        "req-no-db",
      );
      const other = await service.createFleetPartner(createCommand);
      expect(other.fleetPartnerId).not.toBe(created.data.fleetPartnerId);
      expect(created).toMatchObject({
        data: { legalName: "ACK Fleet Ltd.", active: true },
        meta: { requestId: "req-no-db" },
      });
      const updated = await controller.updateFleetPartner(
        created.data.fleetPartnerId,
        {
          legalName: " Updated Ltd. ",
          displayName: " Updated ",
          businessRegistrationNo: " updated-registration ",
          contactName: " Updated contact ",
          contactPhone: " 555-0101 ",
          partnershipType: "vehicle_owner_group",
          active: false,
        },
      );
      expect(updated.data).toMatchObject({
        legalName: "Updated Ltd.",
        displayName: "Updated",
        businessRegistrationNo: "updated-registration",
        contactName: "Updated contact",
        contactPhone: "555-0101",
        partnershipType: "vehicle_owner_group",
        active: false,
      });
      expect(
        await service.getFleetPartner(created.data.fleetPartnerId),
      ).toEqual(updated.data);
      // Existing reference rules require a master, and allow a disabled master.
      const linked = await controller.createDriverFleetAffiliation(
        " no-db-driver ",
        {
          ...affiliationCommand,
          fleetPartnerId: created.data.fleetPartnerId,
        },
      );
      expect(
        service.listFleetPartnerDrivers(created.data.fleetPartnerId),
      ).toEqual([linked.data]);
      expect(
        controller.listFleetPartnerDrivers(created.data.fleetPartnerId).data
          .items,
      ).toEqual([linked.data]);
      expect(await service.getFleetPartner(other.fleetPartnerId)).toEqual(
        other,
      );
      updated.data.displayName = "caller mutation";
      linked.data.driverId = "caller mutation";
      expect(
        (await service.getFleetPartner(created.data.fleetPartnerId))
          .displayName,
      ).toBe("Updated");
      expect(
        service.listFleetPartnerDrivers(created.data.fleetPartnerId)[0]
          ?.driverId,
      ).toBe("no-db-driver");
    });
  },
);

describe("original validation and resource guards", () => {
  it("refuses blank partner fields, missing masters and invalid affiliation dates before SQL", async () => {
    const f = await fixture();
    const before = await readback(f.service);
    f.query.mockClear();
    for (const field of [
      "legalName",
      "displayName",
      "businessRegistrationNo",
      "contactName",
      "contactPhone",
    ]) {
      await expect(
        f.controller.createFleetPartner({ ...createCommand, [field]: " " }),
      ).rejects.toBeInstanceOf(ApiRequestError);
    }
    expect(f.query).not.toHaveBeenCalled();
    await expect(
      f.controller.updateFleetPartner("missing-master", { active: false }),
    ).rejects.toBeInstanceOf(ApiRequestError);
    expect(f.query).not.toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO"),
      expect.anything(),
    );
    f.query.mockClear();
    for (const [driverId, command] of [
      [" ", affiliationCommand],
      ["driver", { ...affiliationCommand, fleetPartnerId: "missing-master" }],
      ["driver", { ...affiliationCommand, effectiveFrom: "invalid-date" }],
      ["driver", { ...affiliationCommand, effectiveUntil: "invalid-date" }],
    ] as const) {
      await expect(
        f.controller.createDriverFleetAffiliation(driverId, command),
      ).rejects.toBeInstanceOf(ApiRequestError);
    }
    expect(f.query).not.toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO"),
      expect.anything(),
    );
    expect(await readback(f.service)).toEqual(before);
  });

  for (const route of [
    {
      method: "POST",
      path: "/api/admin/fleet-partners",
      handler: "createFleetPartner",
    },
    {
      method: "PUT",
      path: `/api/admin/fleet-partners/${partnerId}`,
      handler: "updateFleetPartner",
    },
    {
      method: "POST",
      path: "/api/admin/drivers/driver/fleet-affiliations",
      handler: "createDriverFleetAffiliation",
    },
  ] as const) {
    it(`${route.method} ${route.path} retains actual platform/ops foundation:write guard and tenant/partner/read-only refusals`, async () => {
      // Exercise the real guard with existing development bootstrap identities;
      // live login and deployed role provisioning remain external acceptance.
      vi.stubEnv("DRTS_ENV", "dev");
      vi.stubEnv("NODE_ENV", "test");
      const guard = new BootstrapAuthGuard(new Reflector());
      for (const [realm, actorType, scopes, allowed] of [
        ["platform", "platform_admin", "foundation:write", true],
        ["ops", "ops_user", "foundation:write", true],
        ["platform", "platform_admin", "foundation:read", false],
        ["tenant", "tenant_admin", "foundation:write", false],
        ["partner", "partner_user", "foundation:write", false],
      ] as const) {
        const request: AuthenticatedRequestLike = {
          method: route.method,
          originalUrl: route.path,
          headers: {
            "x-actor-id": "ack-actor",
            "x-actor-type": actorType,
            "x-realm": realm,
            "x-scopes": scopes,
            "x-tenant-id": "other-tenant",
            "x-partner-id": "other-partner",
          },
        };
        const context = {
          switchToHttp: () => ({ getRequest: () => request }),
          getHandler: () => FleetPartnerController.prototype[route.handler],
          getClass: () => FleetPartnerController,
        } as unknown as Parameters<BootstrapAuthGuard["canActivate"]>[0];
        const activation = Promise.resolve().then(() =>
          guard.canActivate(context),
        );
        if (allowed) await expect(activation).resolves.toBe(true);
        else await expect(activation).rejects.toBeInstanceOf(ApiRequestError);
      }
    });
  }
});
