import { afterEach, describe, expect, it, vi } from "vitest";
import { JwtAuthService } from "../../../apps/api/src/common/auth/jwt-auth.service";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { DriverDeviceSessionRepository } from "../../../apps/api/src/modules/auth/driver-device-session.repository";
import { DriverProfileRepository } from "../../../apps/api/src/modules/driver-profile/driver-profile.repository";
import { DriverProfileService } from "../../../apps/api/src/modules/driver-profile/driver-profile.service";
import { RegulatoryRegistryRepository } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.repository";
import { RegulatoryRegistryService } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";

const {
  DriverDeviceSessionService,
}: typeof import("../../../apps/api/src/modules/auth/driver-device-session.service") =
  await import(
    process.env.PAX_REVIEW_SESSION_SOURCE ??
      "../../../apps/api/src/modules/auth/driver-device-session.service"
  );

afterEach(() => vi.unstubAllEnvs());

/** Only the external DB wire is controlled: retain and reread the actual
 * production INSERT payloads. All registry/profile/session logic is real.
 * Invitation storage is the existing disconnected repository, not PG evidence.
 */
function peers() {
  vi.stubEnv(
    "JWT_SECRET",
    "synthetic-unit-driver-session-secret-at-least-32-characters",
  );
  const drivers = new Map<string, unknown>();
  const profiles = new Map<string, unknown>();
  let readError: Error | undefined;
  let writeError: Error | undefined;
  const database = {
    isEnabled: () => true,
    query: async (sql: string, values: unknown[] = []) => {
      if (sql.includes("INSERT INTO reg.phase1_registry_drivers")) {
        if (writeError) throw writeError;
        drivers.set(values[0] as string, JSON.parse(values[5] as string));
      }
      if (sql.includes("INSERT INTO ops.phase1_driver_profiles"))
        profiles.set(values[0] as string, JSON.parse(values[2] as string));
      if (sql.trimStart().startsWith("SELECT record")) {
        if (readError) throw readError;
        const store = sql.includes("reg.phase1_registry_drivers")
          ? drivers
          : profiles;
        const record = store.get(values[0] as string);
        return { rows: record ? [{ record: structuredClone(record) }] : [] };
      }
      return { rows: [] };
    },
  };
  const invitations = new DriverDeviceSessionRepository();
  const make = () => {
    const audit = new AuditNotificationService();
    const profile = new DriverProfileService(
      audit,
      new DriverProfileRepository(database as never),
    );
    const registry = new RegulatoryRegistryService(
      { publishSupplyLifecycleUpdated() {} } as never,
      audit,
      profile,
      new RegulatoryRegistryRepository(database as never),
    );
    const session = new DriverDeviceSessionService(
      new JwtAuthService(),
      profile,
      invitations,
      registry,
    );
    return { registry, profile, session };
  };
  // Both consumers exist before the real driver/profile writer is invoked.
  return {
    a: make(),
    b: make(),
    drivers,
    profiles,
    failReads: (error: Error) => {
      readError = error;
    },
    failWrites: (error: Error) => {
      writeError = error;
    },
  };
}

async function create(
  p: ReturnType<typeof peers>,
  lifecycleStatus: "active" | "suspended" = "active",
) {
  await p.a.registry.createDriver({
    driverId: "pax-review-peer-driver",
    name: "Synthetic rehearsal driver",
    phone: "0900000010",
    lifecycleStatus,
    licensesValid: true,
    licenseExpiry: "2099-01-01T00:00:00.000Z",
    professionalDriverLicenseExpiry: "2099-01-01T00:00:00.000Z",
    taxiDriverRegistrationExpiry: "2099-01-01T00:00:00.000Z",
    supportedServiceBuckets: ["standard_taxi"],
  });
  return p.a.session.issueRegistrationInvitation({
    driverId: "pax-review-peer-driver",
  });
}

describe("dynamic persisted driver authority across preexisting consumers", () => {
  it("registers on the peer after A creates/invites, preserving A's profile", async () => {
    const p = peers();
    await Promise.all([p.a.session.onModuleInit(), p.b.session.onModuleInit()]);
    expect(
      p.b.registry
        .listDrivers()
        .some((d) => d.driverId === "pax-review-peer-driver"),
    ).toBe(false);
    const invitation = await create(p);
    const registered = await p.b.session.register({
      registrationCode: invitation.registrationCode,
      deviceId: "review-peer-device",
    });
    expect(registered.driverId).toBe("pax-review-peer-driver");
    await p.b.session.assertSessionAccessAllowed(
      registered.bindingId,
      registered.deviceId,
      registered.driverId,
      "/driver/tasks",
    );
    await p.b.profile.prepareProfileAuthority(registered.driverId);
    expect(p.profiles.get(registered.driverId)).toMatchObject({
      name: "Synthetic rehearsal driver",
      phone: "0900000010",
      deviceBindings: [
        expect.objectContaining({ bindingId: registered.bindingId }),
      ],
    });
  });

  it("retains the original suspended-driver rejection for a newly committed driver", async () => {
    const p = peers();
    const invitation = await create(p, "suspended");
    await expect(
      p.b.session.register({
        registrationCode: invitation.registrationCode,
        deviceId: "review-suspended-device",
      }),
    ).rejects.toMatchObject({ code: "DRIVER_AUTH_SUSPENDED" });
  });

  it("does not revive a warm driver after deletion or a failed database read", async () => {
    const p = peers();
    await create(p);
    await p.b.registry.prepareDriverAuthority("pax-review-peer-driver");
    p.drivers.clear();
    await expect(
      p.b.registry.prepareDriverAuthority("pax-review-peer-driver"),
    ).rejects.toMatchObject({ code: "DRIVER_NOT_FOUND" });
    const failure = new Error("driver authority unavailable");
    p.failReads(failure);
    await expect(
      p.b.registry.prepareDriverAuthority("pax-review-peer-driver"),
    ).rejects.toBe(failure);
  });

  it("awaits the real work-state save and propagates its failure instead of acknowledging the settled queue", async () => {
    const p = peers();
    await create(p);
    const id = "pax-review-peer-driver";
    await p.b.registry.updateDriverWorkStateFromPersistence(id, {
      workState: "available",
    });
    expect(p.drivers.get(id)).toMatchObject({ workState: "available" });
    const failure = new Error("work-state write rejected");
    p.failWrites(failure);
    await expect(
      p.b.registry.updateDriverWorkStateFromPersistence(id, {
        workState: "offline",
      }),
    ).rejects.toBe(failure);
    expect(p.drivers.get(id)).toMatchObject({ workState: "available" });
  });
});
