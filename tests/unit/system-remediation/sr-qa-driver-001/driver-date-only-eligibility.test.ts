import { afterEach, describe, expect, it, vi } from "vitest";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { DriverProfileService } from "../../../../apps/api/src/modules/driver-profile/driver-profile.service";
import { RegulatoryRegistryRepository } from "../../../../apps/api/src/modules/regulatory-registry/regulatory-registry.repository";
import { RegulatoryRegistryService } from "../../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { CommandSqlTransport } from "../../registry-contract-insurance-exclusivity-canonical-ack-flow-20261015/sql-transport";

const driverId = "drv-demo-001";
const fields = [
  "licenseExpiry",
  "professionalDriverLicenseExpiry",
  "taxiDriverRegistrationExpiry",
] as const;

function setup() {
  const db = new CommandSqlTransport();
  const audit = new AuditNotificationService();
  const repository = new RegulatoryRegistryRepository(db as never);
  const service = new RegulatoryRegistryService(
    {
      publishDriverLocationUpdated() {},
      publishSupplyLifecycleUpdated() {},
    } as never,
    audit,
    new DriverProfileService(audit),
    repository,
  );
  db.seed({
    drivers: service.listDrivers(),
    vehicles: service.listVehicles(),
    supplyPairs: service.listSupplyPairs(),
    contracts: service.listContracts(),
    policies: service.listPolicies(),
    exclusivities: service.listExclusivities(),
  });
  db.enabled = true;
  return { service, repository };
}

afterEach(() => vi.useRealTimers());

describe.each(fields)("R14 UTC inclusive service day: %s", (field) => {
  it.each([
    ["2026-11-22T23:59:59.999Z", true],
    ["2026-11-23T00:00:00.000Z", true],
    ["2026-11-23T12:00:00.000Z", true],
    ["2026-11-23T23:59:59.999Z", true],
    ["2026-11-24T00:00:00.000Z", false],
  ] as const)("normal update/readback/auth/candidates at %s", async (at, valid) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(at);
    const { service, repository } = setup();
    await service.updateDriverLicenses(driverId, { [field]: "2026-11-23" });
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect((await repository.loadState()).drivers.find(d => d.driverId === driverId)?.[field]).toBe("2026-11-23");
    const row = service.listDrivers().find(d => d.driverId === driverId)!;
    expect(row[field]).toBe("2026-11-23");
    expect(row.licensesValid).toBe(valid);
    expect(row.dispatchEligible).toBe(valid);
    expect(service.getEligibleCandidates("standard_taxi").some(c => c.driverId === driverId)).toBe(valid);
    if (valid) expect(() => service.assertDriverAuthEligible(driverId)).not.toThrow();
    else expect(() => service.assertDriverAuthEligible(driverId)).toThrowError(expect.objectContaining({ code: "DRIVER_CERT_INVALID" }));
  });

  it.each(["2026-11-23T12:00:00.000Z", "2026-11-23T20:00:00.000+08:00"])("preserves the exact timestamp boundary %s", async (expiry) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.parse(expiry) - 1);
    const { service } = setup();
    await service.updateDriverLicenses(driverId, { [field]: expiry });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(() => service.assertDriverAuthEligible(driverId)).not.toThrow();
    vi.setSystemTime(Date.parse(expiry));
    expect(() => service.assertDriverAuthEligible(driverId)).toThrowError(expect.objectContaining({ code: "DRIVER_CERT_INVALID" }));
    expect(service.getEligibleCandidates("standard_taxi").some(c => c.driverId === driverId)).toBe(false);
  });
});

it.each(["licenses_invalid", "lifecycle_suspended"])("does not restore a manually disabled driver: %s", async (reason) => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime("2026-11-23T12:00:00.000Z");
  const { service } = setup();
  await service.updateDriverLicenses(driverId, {
    licenseExpiry: "2026-11-23",
    professionalDriverLicenseExpiry: "2026-11-23",
    taxiDriverRegistrationExpiry: "2026-11-23",
    licensesValid: reason !== "licenses_invalid",
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  if (reason === "lifecycle_suspended") await service.updateDriverLifecycle(driverId, { lifecycleStatus: "suspended" });
  expect(service.listDrivers().find(d => d.driverId === driverId)?.eligibilityBlockedReasons).toContain(reason);
  expect(() => service.assertDriverAuthEligible(driverId)).toThrow();
  expect(service.getEligibleCandidates("standard_taxi").some(c => c.driverId === driverId)).toBe(false);
});
