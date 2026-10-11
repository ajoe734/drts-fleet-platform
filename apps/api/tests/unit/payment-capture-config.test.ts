import "reflect-metadata";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Provider } from "@nestjs/common";
import { MODULE_METADATA } from "@nestjs/common/constants";
import { NestContainer } from "@nestjs/core/injector/container";
import { Injector } from "@nestjs/core/injector/injector";
import { Module } from "@nestjs/core/injector/module";
import { PaymentChargeRepository } from "../../src/modules/passenger-app/payment/payment-charge.repository";
import { PaymentChargeService } from "../../src/modules/passenger-app/payment/payment-charge.service";
import { PAYMENT_RUNTIME } from "../../src/modules/passenger-app/payment/payment-method.service";
import { PAYMENT_CAPTURE_POLICY } from "../../src/modules/passenger-app/payment/payment-capture.policy";
import type { StoredCharge } from "../../src/modules/passenger-app/payment/payment-charge.repository";
import type { PaymentRuntime } from "../../src/modules/passenger-app/payment/payment-runtime.config";
import { FakePaymentProvider } from "../../src/modules/passenger-app/payment/fake-payment-provider";

const source = process.env.PAX_PAYMENT_PASSENGER_MODULE_SOURCE;
const {
  PassengerAppModule,
}: typeof import("../../src/modules/passenger-app/passenger-app.module") =
  source
    ? await import(source)
    : await import("../../src/modules/passenger-app/passenger-app.module");

// Synthetic financial schedule only; never a approved product configuration.
const policy = {
  retryDelaysMs: [17],
  retryDefinitiveDeclines: false,
  unknownReadbackDelaysMs: [29],
};
const providerEnv = {
  DRTS_ENV: "test",
  PSP_PROVIDER: "fake",
  PSP_MERCHANT_ID: "synthetic_merchant",
  PSP_API_KEY: "synthetic_key",
  PSP_SANDBOX: "true",
  PSP_TOKEN_ENCRYPTION_KEY_NAME: JSON.stringify({
    activeKeyId: "synthetic",
    keys: { synthetic: Buffer.alloc(32, 7).toString("base64") },
  }),
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function resolve(env: Record<string, string | undefined>) {
  for (const name of [
    "PAX_PAYMENT_CAPTURE_ENABLED",
    "PAX_PAYMENT_CAPTURE_POLICY",
    ...Object.keys(providerEnv),
  ])
    vi.stubEnv(name, env[name]);
  // Resolve the ACTUAL module's factory registrations using Nest's injector.
  // No application bootstrap, HTTP server, DB, worker or network is started.
  const module = new Module(PassengerAppModule, new NestContainer());
  const registrations: Provider[] = Reflect.getMetadata(
    MODULE_METADATA.PROVIDERS,
    PassengerAppModule,
  );
  for (const token of [PAYMENT_RUNTIME, PAYMENT_CAPTURE_POLICY]) {
    const registration = registrations.find(
      (p) => typeof p === "object" && "provide" in p && p.provide === token,
    );
    if (!registration) throw new Error("payment_factory_not_registered");
    module.addProvider(registration);
  }
  const session = {
    load: vi.fn(),
    begin: vi.fn(async (charge: StoredCharge) => ({
      ...charge,
      attemptCount: charge.attemptCount + 1,
      operationId: "synthetic_operation",
    })),
    finish: vi.fn(),
  };
  const repository = {
    withOrder: vi.fn(
      async (_id: string, work: (s: typeof session) => Promise<void>) =>
        work(session),
    ),
  };
  module.addProvider({
    provide: PaymentChargeRepository,
    useValue: repository,
  });
  module.addProvider(PaymentChargeService);
  const injector = new Injector();
  const runtime = module.getProviderByKey<PaymentRuntime>(PAYMENT_RUNTIME);
  await injector.loadProvider(runtime, module);
  const chargeState: StoredCharge = {
    orderId: "00000000-0000-4000-8000-000000000021",
    paymentId: "pax-payment:00000000-0000-4000-8000-000000000021",
    passengerId: "synthetic_config_owner",
    methodId: "00000000-0000-4000-8000-000000000022",
    key: "pax:capture:synthetic_config_order",
    amountMinor: 123,
    status: "failed",
    attemptCount: 0,
    readbackCount: 0,
    nextOperation: "capture",
    retryAt: null,
    operationId: null,
    provider: "fake",
    tokenEnvelope:
      runtime.instance.cipher?.encrypt(
        `synthetic_token_${"a".repeat(64)}`,
        "synthetic_config_owner",
        "00000000-0000-4000-8000-000000000022",
      ) ?? null,
    methodActive: true,
    providerCaptureRef: null,
    lastError: "unavailable",
  };
  session.load.mockResolvedValue(chargeState);
  const configured = module.getProviderByKey(PAYMENT_CAPTURE_POLICY);
  await injector.loadProvider(configured, module);
  const charge =
    module.getProviderByKey<PaymentChargeService>(PaymentChargeService);
  // Vitest does not emit design:paramtypes; retain the production repository
  // dependency here, while the two @Inject tokens use real decorator metadata.
  Reflect.defineMetadata(
    "design:paramtypes",
    [PaymentChargeRepository, Object, Object],
    PaymentChargeService,
  );
  await injector.loadProvider(charge, module);
  return {
    service: charge.instance,
    runtime: runtime.instance,
    configured: configured.instance,
    repository,
    session,
  };
}

describe("actual PassengerAppModule payment policy factory and service injection", () => {
  it("resolves an explicitly enabled synthetic policy through the real module factories and Nest injector", async () => {
    const f = await resolve({
      ...providerEnv,
      PAX_PAYMENT_CAPTURE_ENABLED: "true",
      PAX_PAYMENT_CAPTURE_POLICY: JSON.stringify(policy),
    });
    expect(f.configured).toEqual(policy);
    expect(Object.isFrozen(f.configured)).toBe(true);
    expect(f.service.isCaptureConfigured()).toBe(true);
    const capture = vi.spyOn(f.runtime.provider, "capture");
    await f.service.processOrder("00000000-0000-4000-8000-000000000021");
    expect(f.repository.withOrder).toHaveBeenCalledOnce();
    expect(capture).toHaveBeenCalledExactlyOnceWith({
      idempotencyKey: "pax:capture:synthetic_config_order",
      token: `synthetic_token_${"a".repeat(64)}`,
      amountMinor: 123,
      currency: "TWD",
    });
    expect(f.session.finish).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "captured" }),
    );
  });

  it.each([undefined, "false"])(
    "%s switch injects disabled policy even when a provider and policy are present",
    async (enabled) => {
      const f = await resolve({
        ...providerEnv,
        PAX_PAYMENT_CAPTURE_ENABLED: enabled,
        PAX_PAYMENT_CAPTURE_POLICY: JSON.stringify(policy),
      });
      expect(f.configured).toBeNull();
      expect(f.service.isCaptureConfigured()).toBe(false);
      const capture = vi.spyOn(f.runtime.provider, "capture");
      await f.service.processOrder("00000000-0000-4000-8000-000000000021");
      expect(f.session.load).toHaveBeenCalledOnce();
      expect(f.session.begin).not.toHaveBeenCalled();
      expect(capture).not.toHaveBeenCalled();
    },
  );

  it("defaults to disabled without provider secrets or numerical decisions", async () => {
    const f = await resolve({});
    expect(f.service.isCaptureConfigured()).toBe(false);
    expect(f.configured).toBeNull();
    expect(f.runtime.provider.available).toBe(false);
  });

  it.each([
    undefined,
    "",
    "synthetic_private_not_json",
    "null",
    "{}",
    JSON.stringify({ ...policy, retryDefinitiveDeclines: "false" }),
    JSON.stringify({ ...policy, extra: 1 }),
  ])(
    "enabled configuration rejects policy %s before service or money operations",
    async (input) => {
      await expect(
        resolve({
          ...providerEnv,
          PAX_PAYMENT_CAPTURE_ENABLED: "true",
          PAX_PAYMENT_CAPTURE_POLICY: input,
        }),
      ).rejects.toThrow("payment_capture_configuration_invalid");
    },
  );

  it.each([
    ["retryDelaysMs", Number.MAX_SAFE_INTEGER],
    ["unknownReadbackDelaysMs", Number.MAX_SAFE_INTEGER],
    ["retryDelaysMs", 8_640_000_000_000_000],
    ["unknownReadbackDelaysMs", 8_640_000_000_000_000],
  ])(
    "rejects an unrepresentable %s deadline (%s) in the actual module before money operations",
    async (field, delay) => {
      const capture = vi.spyOn(FakePaymentProvider.prototype, "capture");
      const readCapture = vi.spyOn(
        FakePaymentProvider.prototype,
        "readCapture",
      );
      await expect(
        resolve({
          ...providerEnv,
          PAX_PAYMENT_CAPTURE_ENABLED: "true",
          PAX_PAYMENT_CAPTURE_POLICY: JSON.stringify({
            ...policy,
            [field]: [delay],
          }),
        }).then(() => undefined),
      ).rejects.toThrow("payment_capture_configuration_invalid");
      expect(capture).not.toHaveBeenCalled();
      expect(readCapture).not.toHaveBeenCalled();
    },
  );

  it.each(["", "yes", "1", "synthetic_private_flag"])(
    "rejects unsupported switch %s",
    async (enabled) => {
      await expect(
        resolve({
          ...providerEnv,
          PAX_PAYMENT_CAPTURE_ENABLED: enabled,
          PAX_PAYMENT_CAPTURE_POLICY: JSON.stringify(policy),
        }),
      ).rejects.toThrow("payment_capture_configuration_invalid");
    },
  );

  it.each(["PSP_API_KEY", "PSP_TOKEN_ENCRYPTION_KEY_NAME"])(
    "enabled execution refuses an unavailable runtime missing %s",
    async (name) => {
      await expect(
        resolve({
          ...providerEnv,
          [name]: undefined,
          PAX_PAYMENT_CAPTURE_ENABLED: "true",
          PAX_PAYMENT_CAPTURE_POLICY: JSON.stringify(policy),
        }),
      ).rejects.toThrow("payment_capture_configuration_unavailable");
    },
  );
});
