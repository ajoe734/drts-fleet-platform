import { describe, expect, it, vi } from "vitest";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { DriverProfileService } from "../../../apps/api/src/modules/driver-profile/driver-profile.service";
import { DriverProfileRepository } from "../../../apps/api/src/modules/driver-profile/driver-profile.repository";
import { RegulatoryRegistryRepository } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.repository";
import { RegulatoryRegistryService } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { PaymentMethodRepository } from "../../../apps/api/src/modules/passenger-app/payment/payment-method.repository";
import { PaymentMethodService } from "../../../apps/api/src/modules/passenger-app/payment/payment-method.service";

const driverId = "drv-demo-001";
const methodId = "ABCDEF01-1111-4111-8111-111111111111";

// SQL transport fixtures only: real profile/registry/payment repositories and
// services perform every read. These checks are not PostgreSQL acceptance.
function registryPeer() {
  const base = new DriverProfileService(
    new AuditNotificationService(),
  ).getProfileForDriver(driverId);
  let surname: string | null = "歐陽";
  let masked: string | null = "••••1357";
  let registrationNo = "external-fixture-only";
  let failure: Error | undefined;
  const query = vi.fn(async (sql: string, values: unknown[]) => {
    if (failure) throw failure;
    expect(values).toEqual([driverId]);
    if (sql.includes("ops.phase1_driver_profiles")) {
      return {
        rows:
          surname === null
            ? []
            : [
                {
                  record: {
                    ...base,
                    driverId,
                    driverSurname: surname,
                    updatedAt: "2026-10-15T01:02:03.000Z",
                  },
                },
              ],
      };
    }
    if (sql.includes("reg.driver_public_registration_credentials")) {
      return {
        rows:
          masked === null
            ? []
            : [
                {
                  driver_id: driverId,
                  registration_no: registrationNo,
                  registration_area: "unit",
                  effective_from: "2026-01-01",
                  effective_until: "2099-01-01",
                  status: "verified_active",
                  masked_display: masked,
                  verified_by_actor_id: "unit",
                  verified_at: "2026-10-15T01:02:03.000Z",
                  source_submission_id: null,
                  version: 1,
                  updated_at: "2026-10-15T01:02:03.000Z",
                },
              ],
      };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  const database = { isEnabled: () => true, query };
  const audit = new AuditNotificationService();
  const profiles = new DriverProfileService(
    audit,
    new DriverProfileRepository(database as never),
  );
  const registry = new RegulatoryRegistryService(
    {} as never,
    audit,
    profiles,
    new RegulatoryRegistryRepository(database as never),
  );
  return {
    registry,
    query,
    update: (
      nextSurname: string | null,
      nextMasked: string | null,
      nextRegistrationNo = "external-fixture-only",
    ) => {
      surname = nextSurname;
      masked = nextMasked;
      registrationNo = nextRegistrationNo;
    },
    fail: () => {
      failure = new Error("unit database unavailable");
    },
  };
}

describe("completion receipt authority readers", () => {
  it.each([
    ["REG-***-6789", "UNIT-123456789", "••••6789"],
    ["演練 SIM-***", "SIMULATED-ONLY", null],
    ["bad-display", "UNIT-REG-12", "••••12"],
  ])(
    "projects only actual registration digits when public display %s is not E04-shaped",
    async (display, registration, expected) => {
      const peer = registryPeer();
      peer.update("歐陽", display, registration!);
      expect(
        (await peer.registry.getDriverCompletionReceiptIdentity(driverId))
          .driverRegistrationMasked,
      ).toBe(expected);
    },
  );

  it("reads this driver's latest declared surname and public credential across peer updates", async () => {
    const peer = registryPeer();
    // Startup getters still expose the legacy credential. The completion port
    // must ignore that cache and return only the targeted persisted metadata.
    const initial =
      await peer.registry.getDriverCompletionReceiptIdentity(driverId);
    expect(initial).toEqual({
      surname: {
        driverSurname: "歐陽",
        driverSurnameSource: "driver_profile_declared",
        driverSurnameProfileUpdatedAt: "2026-10-15T01:02:03.000Z",
      },
      driverRegistrationMasked: "••••1357",
    });
    peer.update("司馬", "****2468");
    expect(
      await peer.registry.getDriverCompletionReceiptIdentity(driverId),
    ).toMatchObject({
      surname: { driverSurname: "司馬" },
      driverRegistrationMasked: "****2468",
    });
    // A captured object is detached from later profile changes.
    expect(initial.surname?.driverSurname).toBe("歐陽");
    expect(initial.driverRegistrationMasked).toBe("••••1357");
  });

  it("does not replace missing PG rows with an earlier profile or startup credential", async () => {
    const peer = registryPeer();
    await peer.registry.getDriverCompletionReceiptIdentity(driverId);
    peer.update(null, null);
    expect(
      await peer.registry.getDriverCompletionReceiptIdentity(driverId),
    ).toEqual({
      surname: null,
      driverRegistrationMasked: null,
    });
  });

  it("propagates a failed authority read instead of returning cached identity", async () => {
    const peer = registryPeer();
    await peer.registry.getDriverCompletionReceiptIdentity(driverId);
    peer.fail();
    await expect(
      peer.registry.getDriverCompletionReceiptIdentity(driverId),
    ).rejects.toThrow("unit database unavailable");
  });

  it("reads only the same owner's selected UUID metadata without a cipher or provider", async () => {
    const query = vi.fn(async (_sql: string, values: unknown[]) => ({
      rows:
        values[0] === "owner" && values[1] === methodId.toLowerCase()
          ? [{ card_type: "VISA", last4: "1234" }]
          : [],
    }));
    const service = new PaymentMethodService(
      new PaymentMethodRepository({ query } as never),
      {} as never,
    );
    expect(await service.getReceiptDisplay("owner", methodId)).toBe(
      "VISA ••••1234",
    );
    expect(await service.getReceiptDisplay("other", methodId)).toBeNull();
    expect(
      await service.getReceiptDisplay(
        "owner",
        "22222222-2222-4222-8222-222222222222",
      ),
    ).toBeNull();
    expect(query.mock.calls[0]![1]).toEqual(["owner", methodId.toLowerCase()]);
    expect(query.mock.calls[0]![0]).not.toMatch(
      /token_envelope|encrypted|FOR UPDATE|SELECT \*/i,
    );
  });

  it.each([null, undefined, "provider_opaque_token", "", 1234])(
    "keeps missing/legacy payment reference %s absent",
    async (ref) => {
      const query = vi.fn();
      const service = new PaymentMethodService(
        new PaymentMethodRepository({ query } as never),
        {} as never,
      );
      expect(await service.getReceiptDisplay("owner", ref)).toBeNull();
      expect(query).not.toHaveBeenCalled();
    },
  );

  it("does not turn malformed persisted card metadata into a receipt display", async () => {
    const service = new PaymentMethodService(
      new PaymentMethodRepository({
        query: async () => ({
          rows: [{ card_type: "VISA", last4: "12345678" }],
        }),
      } as never),
      {} as never,
    );
    expect(await service.getReceiptDisplay("owner", methodId)).toBeNull();
  });
});
