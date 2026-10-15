import { mergeConfig, defineConfig } from "vitest/config";
import path from "node:path";
import base from "../../../vitest.config";

const config = mergeConfig(
  base,
  defineConfig({
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "../../../apps/driver-app"),
      },
    },
    test: {
      include: [
        "tests/unit/pax-review-shared-order-demo-20261015/driver-*.test.ts",
      ],
      environment: "jsdom",
    },
  }),
);
// mergeConfig concatenates arrays; keep this a finite socket-free check.
config.test!.include = [
  "tests/unit/pax-review-shared-order-demo-20261015/driver-*.test.ts",
];
export default config;
