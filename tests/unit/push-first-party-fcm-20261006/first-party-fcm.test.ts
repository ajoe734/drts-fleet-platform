import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MultiTaxiModule } from "../../../apps/api/src/modules/multi-taxi/multi-taxi.module";
import { MultiTaxiRepository } from "../../../apps/api/src/modules/multi-taxi/multi-taxi.repository";
import { PassengerPushDevicesService } from "../../../apps/api/src/modules/passenger-push-devices/passenger-push-devices.service";
import { FcmFirstPartyPushProvider } from "../../../apps/api/src/modules/multi-taxi/fcm-push.provider";
import {
  FIRST_PARTY_PUSH_PROVIDER,
  FirstPartyNotificationTransport,
} from "../../../apps/api/src/modules/multi-taxi/first-party-notification.transport";
const apiRequire = createRequire(
  new URL("../../../apps/api/package.json", import.meta.url),
);
const { Module } = apiRequire("@nestjs/common");
const { NestFactory } = apiRequire("@nestjs/core");
@Module({})
class CompositionTestModule {}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("production first-party Nest provider composition (no server)", () => {
  it.each([undefined, "false", "true"])(
    "resolves production registrations with flag %s and zero HTTP",
    async (enabled) => {
      vi.stubEnv("PASSENGER_PUSH_FIRST_PARTY_ENABLED", enabled);
      vi.stubEnv("PASSENGER_PUSH_FCM_PROJECT_ID", "synthetic-project");
      const network = vi.fn(() => {
        throw new Error("Unexpected network");
      });
      vi.stubGlobal("fetch", network);
      // Use actual module registrations; replace only repository/device external boundaries.
      const registrations = Reflect.getMetadata(
        "providers",
        MultiTaxiModule,
      ).filter((p: any) =>
        [
          FcmFirstPartyPushProvider,
          FirstPartyNotificationTransport,
          FIRST_PARTY_PUSH_PROVIDER,
        ].includes(p.provide ?? p),
      );
      const app = await NestFactory.createApplicationContext(
        {
          module: CompositionTestModule,
          providers: [
            ...registrations,
            { provide: MultiTaxiRepository, useValue: {} },
            { provide: PassengerPushDevicesService, useValue: {} },
          ],
        },
        { logger: false, abortOnError: false },
      );
      try {
        expect(app.get(FIRST_PARTY_PUSH_PROVIDER)).toBeInstanceOf(
          FcmFirstPartyPushProvider,
        );
        expect(app.get(FirstPartyNotificationTransport)).toBeInstanceOf(
          FirstPartyNotificationTransport,
        );
        expect(app.get(FIRST_PARTY_PUSH_PROVIDER).isConfigured()).toBe(
          enabled === "true",
        );
        if (enabled !== "true")
          await expect(
            app
              .get(FirstPartyNotificationTransport)
              .send({ message: {}, context: {} }),
          ).rejects.toMatchObject({
            failure: { failureReason: "configuration_blocked" },
          });
        expect(network).not.toHaveBeenCalled();
      } finally {
        await app.close();
      }
    },
  );
});
