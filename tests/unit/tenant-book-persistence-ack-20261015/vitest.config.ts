import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
import rootConfig from "../../../vitest.config";

export default defineConfig({
  ...rootConfig,
  test: {
    ...rootConfig.test,
    include: [
      resolve(
        __dirname,
        "../../../apps/api/tests/unit/tenant-partner.service.test.ts",
      ),
      resolve(
        __dirname,
        "../../../apps/api/tests/unit/tenant-partner.controller.test.ts",
      ),
      resolve(
        __dirname,
        "../../../apps/api/tests/unit/tenant-partner.repository.test.ts",
      ),
      resolve(__dirname, "*.test.ts"),
    ],
  },
});
