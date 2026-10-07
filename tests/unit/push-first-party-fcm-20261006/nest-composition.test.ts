import { createRequire } from "node:module";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MultiTaxiModule } from "../../../apps/api/src/modules/multi-taxi/multi-taxi.module";
import { MultiTaxiRepository } from "../../../apps/api/src/modules/multi-taxi/multi-taxi.repository";
import { PassengerPushDevicesService } from "../../../apps/api/src/modules/passenger-push-devices/passenger-push-devices.service";
import { FcmFirstPartyPushProvider } from "../../../apps/api/src/modules/multi-taxi/fcm-push.provider";
import { FIRST_PARTY_PUSH_PROVIDER, FirstPartyNotificationTransport } from "../../../apps/api/src/modules/multi-taxi/first-party-notification.transport";
import type { PassengerPushTransportRequest } from "../../../apps/api/src/modules/multi-taxi/passenger-push.adapter";

// Real Nest DI for an isolated unit-only module, never the product AppModule.
// There are no controllers, timers, lifecycle workers, DB or HTTP listeners.
// External boundaries below throw on any access. No new dependency is needed.
const apiRequire = createRequire(resolve("apps/api/package.json"));
const { Module } = apiRequire("@nestjs/common") as {
  Module(metadata: { providers: unknown[] }): ClassDecorator;
};
const { NestFactory } = apiRequire("@nestjs/core") as {
  NestFactory: { createApplicationContext(module: unknown, options: { logger: false; abortOnError: false }):
    Promise<{ get<T>(token: unknown): T; close(): Promise<void> }> };
};
const metadata = Reflect as typeof Reflect & { getMetadata(key: string, target: unknown): unknown };

function productionProviders() {
  const providers = metadata.getMetadata("providers", MultiTaxiModule);
  if (!Array.isArray(providers)) throw new Error("Missing actual module provider metadata");
  return providers.filter(p => p === FirstPartyNotificationTransport ||
    (p && typeof p === "object" && [FcmFirstPartyPushProvider, FIRST_PARTY_PUSH_PROVIDER].includes(p.provide)));
}

describe("production first-party Nest provider composition", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  it.each([false, true])("compiles actual production DI with enabled=%s, no network or DB", async enabled => {
    vi.stubEnv("PASSENGER_PUSH_FIRST_PARTY_ENABLED", String(enabled));
    vi.stubEnv("PASSENGER_PUSH_FCM_PROJECT_ID", "test-project");
    const network = vi.fn(() => { throw new Error("External network prohibited"); });
    vi.stubGlobal("fetch", network);
    const repoCall = vi.fn(() => { throw new Error("DB access prohibited"); });
    const devicesCall = vi.fn(() => { throw new Error("Device access prohibited"); });
    class DiUnitModule {}
    Module({ providers: [
      ...productionProviders(),
      { provide: MultiTaxiRepository, useValue: { findFirstPartyNotificationContextAndTokens: repoCall } },
      { provide: PassengerPushDevicesService, useValue: { resolveActiveDevices: devicesCall } },
    ] })(DiUnitModule);
    const module = await NestFactory.createApplicationContext(DiUnitModule, { logger: false, abortOnError: false });
    try {
      const concrete = module.get<FcmFirstPartyPushProvider>(FcmFirstPartyPushProvider);
      expect(module.get(FIRST_PARTY_PUSH_PROVIDER)).toBe(concrete);
      expect(concrete.isConfigured()).toBe(enabled);
      const transport = module.get<FirstPartyNotificationTransport>(FirstPartyNotificationTransport);
      expect(transport).toBeInstanceOf(FirstPartyNotificationTransport);
      if (!enabled) {
        await expect(transport.send({
          message: { attemptCount: 1 }, context: { fenceToken: 1 },
        } as PassengerPushTransportRequest)).rejects.toMatchObject({
          failure: { failureReason: "configuration_blocked", retryDisposition: "configuration_blocked" },
        });
      }
      expect(network).not.toHaveBeenCalled();
      expect(repoCall).not.toHaveBeenCalled();
      expect(devicesCall).not.toHaveBeenCalled();
    } finally {
      await module.close();
    }
  });
});
