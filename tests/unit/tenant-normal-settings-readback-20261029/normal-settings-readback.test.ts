import { writeFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { TenantPartnerService } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import { TenantPartnerController } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.controller";
import { persistenceHarness } from "../tenant-rules-sla-webhook-durable-flow-20261015/persistence-harness";
const tenantId = "SIM-C028-normal-settings";
const services: TenantPartnerService[] = [];
afterEach(() => {
  for (const s of services.splice(0)) s.onModuleDestroy();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
function instance(p: ReturnType<typeof persistenceHarness>) {
  const service = new TenantPartnerService(
    new AuditNotificationService(),
    p.repository,
  );
  services.push(service);
  return {
    service,
    controller: new TenantPartnerController(
      service,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    ),
  };
}
async function replicas() {
  vi.useFakeTimers();
  vi.setSystemTime("2026-10-29T00:00:00Z");
  const p = persistenceHarness();
  const a = instance(p);
  await a.controller.updateSlaProfile(
    {
      waitThresholdMin: 11,
      arrivalThresholdMin: 19,
      completionThresholdMin: 91,
    },
    null,
    tenantId,
    "SIM-admin-before",
  );
  const b = instance(p);
  await b.service.onModuleInit();
  return { p, a, b };
}
async function update(x: Awaited<ReturnType<typeof replicas>>) {
  vi.setSystemTime("2026-10-29T00:01:00Z");
  await x.a.controller.updateSlaProfile(
    {
      waitThresholdMin: 33,
      arrivalThresholdMin: 44,
      completionThresholdMin: 95,
    },
    null,
    tenantId,
    "SIM-admin-after",
  );
  const canonical = (await x.p.repository.loadState()).slaProfiles.find(
    (p) => p.tenantId === tenantId,
  );
  expect(canonical).toMatchObject({
    waitThresholdMin: 33,
    arrivalThresholdMin: 44,
  });
  return canonical;
}
describe("C028 normal Tenant settings warm reader; original SQL boundary SIM", () => {
  it("B normal /tenant/sla used by Settings reads A normal committed POST without restart", async () => {
    const x = await replicas();
    const canonical = await update(x);
    const got = await x.b.controller.getSlaProfile(
      tenantId,
      "SIM-get-settings",
    );
    if (process.env.C028_OBSERVATION)
      writeFileSync(
        process.env.C028_OBSERVATION,
        JSON.stringify(
          { endpoint: "/tenant/sla", canonical, response: got },
          null,
          2,
        ) + "\n",
      );
    expect(got.data).toEqual(canonical);
  });
  it("B normal /tenant/sla/view used by SLA page reads A normal committed POST without restart", async () => {
    const x = await replicas();
    const canonical = await update(x);
    const got = await x.b.controller.getSlaProfileView(
      tenantId,
      "SIM-get-sla-view",
    );
    if (process.env.C028_VIEW_OBSERVATION)
      writeFileSync(
        process.env.C028_VIEW_OBSERVATION,
        JSON.stringify(
          { endpoint: "/tenant/sla/view", canonical, response: got },
          null,
          2,
        ) + "\n",
      );
    expect(got.data.profile).toEqual(canonical);
    expect(got.data.emptyState).toBeNull();
  });
  it("keeps credit for the existing normal platform list canonical-update branch", async () => {
    vi.useFakeTimers();
    const p = persistenceHarness();
    const a = instance(p);
    const entry = (
      await a.controller.createPlatformPartnerEntry({
        tenantId,
        partnerCode: "SIM_C028",
        partnerType: "enterprise_partner",
        programId: "SIM-program-before",
        entrySlug: "sim-c028-settings",
        displayName: "SIM C028",
        businessDispatchSubtype: "credit_card_airport_transfer",
        authMode: "partner_api_key",
        eligibilityMode: "none",
      })
    ).data;
    const b = instance(p);
    await b.service.onModuleInit();
    const updated = (
      await a.controller.updatePlatformPartnerEntry(entry.entrySlug, {
        programId: "SIM-program-after",
      })
    ).data;
    const list = await b.controller.listPlatformPartnerEntries();
    expect(
      list.data.items.find((e) => e.entrySlug === entry.entrySlug),
    ).toEqual(updated);
  });
  it("pins the original distinct absent-SLA responses: view null/not_provisioned and raw default10/15/90", async () => {
    vi.useFakeTimers();
    const p = persistenceHarness();
    const b = instance(p);
    const id = "SIM-C028-no-profile";
    const view = await b.controller.getSlaProfileView(id);
    expect(view.data.profile).toBeNull();
    expect(view.data.emptyState?.reason).toBe("not_provisioned");
    const raw = await b.controller.getSlaProfile(id);
    expect(raw.data).toMatchObject({
      tenantId: id,
      waitThresholdMin: 10,
      arrivalThresholdMin: 15,
      completionThresholdMin: 90,
    });
    expect(
      (await p.repository.loadState()).slaProfiles.some(
        (p) => p.tenantId === id,
      ),
    ).toBe(false);
  });
  it("canonical read failures reject both normal GETs instead of default or not_provisioned success", async () => {
    const x = await replicas();
    x.p.rejectReadbacks();
    await expect(x.b.controller.getSlaProfile(tenantId)).rejects.toThrow(
      "canonical readback unavailable",
    );
    await expect(x.b.controller.getSlaProfileView(tenantId)).rejects.toThrow(
      "canonical readback unavailable",
    );
    expect(x.b.service.getSlaProfile(tenantId)).toMatchObject({
      waitThresholdMin: 11,
      arrivalThresholdMin: 19,
    });
  });
  it("preserves the original pending-write readback outcome before any new canonical query", async () => {
    const x = await replicas();
    x.p.failInsert(1);
    x.p.rejectReadbacks();
    await expect(
      x.b.controller.updateSlaProfile({ waitThresholdMin: 55 }, null, tenantId),
    ).rejects.toThrow("SQL rejected");
    x.p.query.mockClear();
    await expect(x.b.controller.getSlaProfile(tenantId)).rejects.toMatchObject({
      code: "TENANT_CONFIGURATION_READBACK_PENDING",
    });
    await expect(
      x.b.controller.getSlaProfileView(tenantId),
    ).rejects.toMatchObject({ code: "TENANT_CONFIGURATION_READBACK_PENDING" });
    expect(x.p.query).not.toHaveBeenCalled();
  });
  it.each(["raw", "view"] as const)(
    "a delayed %s GET cannot overwrite B normal concurrent profile update",
    async (kind) => {
      const x = await replicas();
      let release!: () => void, entered!: () => void;
      const released = new Promise<void>((r) => {
          release = r;
        }),
        started = new Promise<void>((r) => {
          entered = r;
        });
      const original = x.p.repository.findSlaProfile.bind(x.p.repository);
      let held = true;
      vi.spyOn(x.p.repository, "findSlaProfile").mockImplementation(
        async (id) => {
          const snapshot = await original(id);
          if (held) {
            held = false;
            entered();
            await released;
          }
          return snapshot;
        },
      );
      const old =
        kind === "raw"
          ? x.b.controller.getSlaProfile(tenantId).then((r) => r.data)
          : x.b.controller
              .getSlaProfileView(tenantId)
              .then((r) => r.data.profile);
      await started;
      try {
        await x.b.controller.updateSlaProfile(
          { waitThresholdMin: 61, arrivalThresholdMin: 62 },
          null,
          tenantId,
          "SIM-B-current",
        );
      } finally {
        release();
      }
      expect(await old).toMatchObject({
        waitThresholdMin: 11,
        arrivalThresholdMin: 19,
      });
      expect(x.b.service.getSlaProfile(tenantId)).toMatchObject({
        waitThresholdMin: 61,
        arrivalThresholdMin: 62,
      });
      expect(
        (await x.b.controller.getSlaProfileView(tenantId)).data.profile,
      ).toMatchObject({ waitThresholdMin: 61, arrivalThresholdMin: 62 });
    },
  );
  it("retains known local-version metadata but does not label a new remote timestamp with the old local actor", async () => {
    const x = await replicas();
    vi.setSystemTime("2026-10-29T00:02:00Z");
    await x.b.controller.updateSlaProfile(
      {
        waitThresholdMin: 20,
        arrivalThresholdMin: 21,
        completionThresholdMin: 92,
      },
      null,
      tenantId,
      "SIM-B-known",
    );
    x.b.service.recalculateSlaBookings(
      tenantId,
      { reason: "SIM existing accepted recalculation request" },
      "SIM-B-known",
    );
    const legacy = x.b.service.getSlaProfileView(tenantId);
    const known = (await x.b.controller.getSlaProfileView(tenantId)).data;
    expect(known.updatedBy).toBe("SIM-B-known");
    expect(known.updatedBy).toBe(legacy.updatedBy);
    expect(known.lastRecalculationAt).toBe(legacy.lastRecalculationAt);
    expect(known.lastRecalculationAt).not.toBeNull();
    vi.setSystemTime("2026-10-29T00:03:00Z");
    await x.a.controller.updateSlaProfile(
      {
        waitThresholdMin: 20,
        arrivalThresholdMin: 21,
        completionThresholdMin: 92,
      },
      null,
      tenantId,
      "SIM-A-later",
    );
    const remote = (await x.b.controller.getSlaProfileView(tenantId)).data;
    expect(remote.profile?.updatedAt).toBe("2026-10-29T00:03:00.000Z");
    expect(remote.updatedBy).toBeNull();
    expect(remote.lastRecalculationAt).toBeNull();
  });
  it("equal timestamps alone cannot reuse local actor metadata when canonical values changed", async () => {
    const x = await replicas();
    vi.setSystemTime("2026-10-29T00:02:00Z");
    await x.b.controller.updateSlaProfile(
      {
        waitThresholdMin: 20,
        arrivalThresholdMin: 21,
        completionThresholdMin: 92,
      },
      null,
      tenantId,
      "SIM-B-local",
    );
    const before = x.b.service.getSlaProfileView(tenantId);
    expect(before.updatedBy).toBe("SIM-B-local");
    await x.a.controller.updateSlaProfile(
      {
        waitThresholdMin: 70,
        arrivalThresholdMin: 71,
        completionThresholdMin: 93,
      },
      null,
      tenantId,
      "SIM-A-same-millisecond",
    );
    const remote = (await x.b.controller.getSlaProfileView(tenantId)).data;
    expect(remote.profile?.updatedAt).toBe(before.profile?.updatedAt);
    expect(remote.profile?.waitThresholdMin).toBe(70);
    expect(remote.updatedBy).toBeNull();
    expect(remote.lastRecalculationAt).toBeNull();
  });
  it("keeps original tenant-header/scope outcomes and never reads another tenant profile as the selected tenant", async () => {
    const x = await replicas();
    await update(x);
    for (const read of [
      () => x.b.controller.getSlaProfile(),
      () => x.b.controller.getSlaProfileView("   "),
    ])
      await expect(read()).rejects.toMatchObject({
        status: 400,
        code: "TENANT_ID_REQUIRED",
      });
    const id = "SIM-C028-other";
    expect((await x.b.controller.getSlaProfile(id)).data).toMatchObject({
      tenantId: id,
      waitThresholdMin: 10,
      arrivalThresholdMin: 15,
    });
    expect(
      (await x.b.controller.getSlaProfileView(id)).data.profile,
    ).toBeNull();
    x.p.query.mockClear();
    await expect(
      x.b.controller.updateSlaProfile(
        { waitThresholdMin: 99 },
        {
          realm: "tenant",
          actorId: "SIM-other-actor",
          actorType: "tenant_user",
          tenantId: id,
          roles: [],
          scopes: [],
        } as never,
        tenantId,
      ),
    ).rejects.toMatchObject({ status: 403, code: "TENANT_SCOPE_MISMATCH" });
    expect(x.p.query).not.toHaveBeenCalled();
  });
  it("keeps no-DB legacy synchronous getters, metadata, actions and links", async () => {
    vi.useFakeTimers();
    vi.setSystemTime("2026-10-29T00:00:00Z");
    const service = new TenantPartnerService(new AuditNotificationService());
    services.push(service);
    const c = new TenantPartnerController(
      service,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    expect(service.getSlaProfileView(tenantId).profile).toBeNull();
    expect((await c.getSlaProfileView(tenantId)).data.profile).toBeNull();
    const raw = service.getSlaProfile(tenantId);
    expect(raw).toMatchObject({
      waitThresholdMin: 10,
      arrivalThresholdMin: 15,
      completionThresholdMin: 90,
    });
    expect((await c.getSlaProfile(tenantId)).data).toEqual(raw);
    service.updateSlaProfile(
      tenantId,
      { waitThresholdMin: 9 },
      "SIM-noDB-local",
    );
    const legacy = service.getSlaProfileView(tenantId);
    expect(legacy.updatedBy).toBe("SIM-noDB-local");
    expect((await c.getSlaProfileView(tenantId)).data).toEqual(legacy);
  });
});
