import "reflect-metadata";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Provider } from "@nestjs/common";
import { MODULE_METADATA } from "@nestjs/common/constants";
import { NestContainer } from "@nestjs/core/injector/container";
import { Injector } from "@nestjs/core/injector/injector";
import { Module } from "@nestjs/core/injector/module";
import { DatabaseService } from "../../src/common/db/database.service";
import { MultiTaxiRepository } from "../../src/modules/multi-taxi/multi-taxi.repository";
import { PassengerAppModule } from "../../src/modules/passenger-app/passenger-app.module";
import { PaymentChargeRepository } from "../../src/modules/passenger-app/payment/payment-charge.repository";
import {
  PAYMENT_RECOVERY_NOTICE_EXPIRY,
  PAYMENT_RECOVERY_NOTICE_OUTBOX,
} from "../../src/modules/passenger-app/payment/payment-recovery-notice.config";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

async function resolve(expiry?: string, enabled?: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-11T12:00:00Z"));
  vi.stubEnv("PAX_PAYMENT_RECOVERY_NOTICE_EXPIRES_AT", expiry);
  vi.stubEnv("PASSENGER_PUSH_FIRST_PARTY_ENABLED", enabled);
  const database = { isEnabled: () => true, query: vi.fn(), connect: vi.fn() };
  // Actual module factories and Nest injector; no application bootstrap or timer.
  const module = new Module(PassengerAppModule, new NestContainer());
  const registrations: Provider[] = Reflect.getMetadata(
    MODULE_METADATA.PROVIDERS,
    PassengerAppModule,
  );
  module.addProvider({ provide: DatabaseService, useValue: database });
  for (const token of [
    PAYMENT_RECOVERY_NOTICE_EXPIRY,
    PAYMENT_RECOVERY_NOTICE_OUTBOX,
  ]) {
    const registration = registrations.find(
      (p) => typeof p === "object" && "provide" in p && p.provide === token,
    );
    if (!registration) throw new Error("notice_factory_not_registered");
    module.addProvider(registration);
  }
  module.addProvider(PaymentChargeRepository);
  // Vitest lacks design:paramtypes. Token decorators remain actual production metadata.
  Reflect.defineMetadata(
    "design:paramtypes",
    [DatabaseService, Object, String],
    PaymentChargeRepository,
  );
  const injector = new Injector();
  for (const token of [
    PAYMENT_RECOVERY_NOTICE_EXPIRY,
    PAYMENT_RECOVERY_NOTICE_OUTBOX,
    PaymentChargeRepository,
  ])
    await injector.loadProvider(module.getProviderByKey(token), module);
  return {
    database,
    repository: module.getProviderByKey<PaymentChargeRepository>(
      PaymentChargeRepository,
    ).instance,
    outbox: module.getProviderByKey<MultiTaxiRepository>(
      PAYMENT_RECOVERY_NOTICE_OUTBOX,
    ).instance,
    expiry: module.getProviderByKey(PAYMENT_RECOVERY_NOTICE_EXPIRY).instance,
  };
}

describe("actual PassengerAppModule recovery-notice factories and repository injection", () => {
  it("binds the actual stateless repository adapter and explicit synthetic deadline", async () => {
    const f = await resolve("2026-10-11T13:00:00Z", "true");
    expect(f.outbox).toBeInstanceOf(MultiTaxiRepository);
    expect(f.expiry).toBe("2026-10-11T13:00:00.000Z");
    expect(f.repository.isRecoveryNoticeConfigured()).toBe(true);
    expect(f.database.query).not.toHaveBeenCalled();
    expect(f.database.connect).not.toHaveBeenCalled();
  });
  it.each([
    [undefined, "true"],
    ["2026-10-11T13:00:00Z", undefined],
    ["2026-10-11T13:00:00Z", "false"],
  ])(
    "missing deadline or disabled channel (%s/%s) exposes disabled state to the worker",
    async (expiry, channel) => {
      const f = await resolve(expiry, channel);
      expect(f.repository.isRecoveryNoticeConfigured()).toBe(false);
      expect(f.database.query).not.toHaveBeenCalled();
      expect(f.database.connect).not.toHaveBeenCalled();
    },
  );
  it("invalid explicit expiry fails the actual module factory before persistence", async () => {
    await expect(resolve("synthetic_invalid_expiry", "true")).rejects.toThrow(
      "payment_recovery_notice_configuration_invalid",
    );
  });
});
