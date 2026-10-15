import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
import rootConfig from "../../../vitest.config";
export default defineConfig({
  ...rootConfig,
  test: {
    ...rootConfig.test,
    include: [
      resolve(__dirname, "*.test.ts"),
      resolve(
        __dirname,
        "../../../apps/api/tests/unit/fleet-partner.controller.test.ts",
      ),
    ],
  },
});
