import { mergeConfig, defineConfig } from "vitest/config";
import path from "node:path";
import { createRequire } from "node:module";
import base from "../../../vitest.config";

const driverRequire = createRequire(
  path.resolve(import.meta.dirname, "../../../apps/driver-app/package.json"),
);

const config = mergeConfig(
  base,
  defineConfig({
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "../../../apps/driver-app"),
        ...Object.fromEntries(
          [
            "expo-constants",
            "expo-secure-store",
            "expo-location",
            "expo-task-manager",
          ].map((name) => [name, driverRequire.resolve(name)]),
        ),
      },
    },
    test: {
      include: [
        "tests/unit/pax-review-shared-order-demo-20261015/driver-*.spec.ts",
      ],
      environment: "jsdom",
    },
  }),
);
// mergeConfig concatenates arrays; keep this a finite socket-free check.
config.test!.include = [
  "tests/unit/pax-review-shared-order-demo-20261015/driver-*.spec.ts",
];
export default config;
