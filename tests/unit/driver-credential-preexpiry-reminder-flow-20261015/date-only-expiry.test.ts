import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { DriverProfileService } from "../../../apps/api/src/modules/driver-profile/driver-profile.service";
import { RegulatoryRegistryRepository, PREEXPIRY_CREDENTIAL_FIELDS } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.repository";
import { RegulatoryRegistryService } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { ReminderSqlTransport } from "./sql-transport";

const driverId = "drv-demo-001";
const day = "2026-11-23";
function setup(field: string, expiry = day) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime("2026-11-23T12:00:00.000Z");
  vi.stubEnv("REGULATORY_ALERT_RECIPIENT_EMAIL", "approved-registry@example.test");
  const db = new ReminderSqlTransport();
  const repository = new RegulatoryRegistryRepository(db as never);
  const audit = new AuditNotificationService();
  const service = new RegulatoryRegistryService({ publishSupplyLifecycleUpdated() {} } as never, audit, new DriverProfileService(audit), repository);
  const driver = service.listDrivers().find(d => d.driverId === driverId)!;
  db.drivers.set(driverId, {
    ...driver,
    licenseExpiry: "2099-01-01T00:00:00.000Z",
    professionalDriverLicenseExpiry: "2099-01-01T00:00:00.000Z",
    taxiDriverRegistrationExpiry: "2099-01-01T00:00:00.000Z",
    [field]: expiry,
  });
  return { db, repository, service };
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe.each(Object.entries(PREEXPIRY_CREDENTIAL_FIELDS))("R14 scheduler/reminder source %s", (credential, field) => {
  it("creates expiry only at next UTC midnight and retains the original fingerprint and source readback", async () => {
    const { service, db } = setup(field);
    for (const asOf of ["2026-11-23T00:00:00.000Z", "2026-11-23T12:00:00.000Z", "2026-11-23T23:59:59.999Z"]) {
      expect((await service.reconcileExpiredCredentials({ asOf })).expiredEventsCreated).toBe(0);
    }
    const asOf = "2026-11-24T00:00:00.000Z";
    expect((await service.reconcileExpiredCredentials({ asOf })).expiredEventsCreated).toBe(1);
    const event = [...db.events.values()].find(e => e.credential_type === credential)!;
    const scope = event.scope;
    expect(event.source_fingerprint).toBe(createHash("sha256").update(JSON.stringify(["credential-expiry/v1", scope, "driver", driverId, field, Date.parse(day)])).digest("hex"));
    expect(new Date(event.source_expiry_at!).toISOString()).toBe(`${day}T00:00:00.000Z`);
    const replay = await service.reconcileExpiredCredentials({ asOf });
    expect(replay.expiredEventsCreated).toBe(0);
    expect([...db.events.values()].filter(e => e.credential_type === credential)).toHaveLength(1);
  });

  it("uses the same cutoff for T30/T7 and keeps pending reminders valid through the final service-day millisecond", async () => {
    const { service, db, repository } = setup(field);
    await service.reconcileExpiredCredentials({ asOf: "2026-10-24T23:59:59.999Z" });
    expect(db.events.size).toBe(0);
    await service.reconcileExpiredCredentials({ asOf: "2026-10-25T00:00:00.000Z" });
    expect([...db.events.values()].map(e => e.credential_type)).toEqual([`preexpiry:${credential}:30`]);
    await service.reconcileExpiredCredentials({ asOf: "2026-11-17T00:00:00.000Z" });
    expect(db.events.size).toBe(2);
    const intent = [...db.intents.values()][0]!;
    expect((await repository.recordExpiryDeliveryOutcome(intent, { deliveryStatus: "pending" }, Date.parse("2026-11-23T23:59:59.999Z")))?.delivery_status).toBe("pending");
    expect((await repository.recordExpiryDeliveryOutcome(intent, { deliveryStatus: "pending" }, Date.parse("2026-11-24T00:00:00.000Z")))?.delivery_status).toBe("superseded");
  });

  it("supersedes an expired alert when normal renewal is valid through today", async () => {
    const { service, db } = setup(field, "2026-11-22");
    await service.reconcileExpiredCredentials({ asOf: "2026-11-23T12:00:00.000Z" });
    const event = [...db.events.values()].find(e => e.credential_type === credential)!;
    expect(event.status).toBe("pending");
    await service.updateDriverLicenses(driverId, { [field]: day });
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(db.events.get(event.event_id)?.status).toBe("superseded");
  });
});
