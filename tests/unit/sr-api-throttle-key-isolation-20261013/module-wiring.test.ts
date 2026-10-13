import type {
  DynamicModule,
  Provider,
} from "../../../apps/api/node_modules/@nestjs/common";
import { expect, it } from "vitest";
import { apiRequire, production } from "./production-loader";

const { AppModule } = production<
  typeof import("../../../apps/api/src/app.module")
>("apps/api/src/app.module.ts");

it("actual AppModule registers one repaired storage and preserves its guard chain", () => {
  const { KeyScopedThrottlerStorage } = production<
    typeof import("../../../apps/api/src/common/throttling/key-scoped-throttler.storage")
  >("apps/api/src/common/throttling/key-scoped-throttler.storage.ts");
  const { BootstrapThrottlerGuard } = production<
    typeof import("../../../apps/api/src/common/throttling/bootstrap-throttler.guard")
  >("apps/api/src/common/throttling/bootstrap-throttler.guard.ts");
  const { ThrottlerModule, getOptionsToken, getStorageToken } = apiRequire(
    "@nestjs/throttler",
  ) as typeof import("../../../apps/api/node_modules/@nestjs/throttler");
  const { APP_GUARD } = apiRequire(
    "@nestjs/core",
  ) as typeof import("../../../apps/api/node_modules/@nestjs/core");
  const imports = Reflect.getMetadata("imports", AppModule) as Array<
    DynamicModule | object
  >;
  const modules = imports.filter(
    (item): item is DynamicModule =>
      "module" in item && item.module === ThrottlerModule,
  );
  expect(modules).toHaveLength(1);
  const optionsProvider = modules[0]?.providers?.find(
    (item) =>
      typeof item === "object" &&
      "provide" in item &&
      item.provide === getOptionsToken(),
  );
  if (
    !optionsProvider ||
    typeof optionsProvider !== "object" ||
    !("useValue" in optionsProvider)
  )
    throw new Error("Missing options binding");
  const options = optionsProvider.useValue as {
    storage: unknown;
    throttlers: unknown;
  };
  expect(options.storage).toBeInstanceOf(KeyScopedThrottlerStorage);
  expect(options.throttlers).toEqual([
    { ttl: 60000, limit: 60, blockDuration: 300000 },
  ]);

  // Exercise the dependency's real provider factory, not a copied DI rule.
  const providers = modules[0]?.providers ?? [];
  const storageProvider = providers.find(
    (item) =>
      typeof item === "object" &&
      "provide" in item &&
      item.provide === getStorageToken(),
  );
  if (
    !storageProvider ||
    typeof storageProvider !== "object" ||
    !("useFactory" in storageProvider)
  )
    throw new Error("Missing storage provider");
  expect(storageProvider.useFactory(options)).toBe(options.storage);

  const appProviders = Reflect.getMetadata(
    "providers",
    AppModule,
  ) as Provider[];
  const guardChain = appProviders
    .filter(
      (item) =>
        typeof item === "object" &&
        "provide" in item &&
        item.provide === APP_GUARD,
    )
    .map((item) =>
      typeof item === "object" && "useClass" in item
        ? item.useClass
        : undefined,
    );
  expect(guardChain.map((guard) => guard?.name)).toEqual([
    "BootstrapAuthGuard",
    "BootstrapThrottlerGuard",
    "FeatureGateGuard",
  ]);
  expect(guardChain[1]).toBe(BootstrapThrottlerGuard);
});
