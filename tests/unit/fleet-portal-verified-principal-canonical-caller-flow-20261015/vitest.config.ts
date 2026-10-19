import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
import rootConfig from "../../../vitest.config";
export default defineConfig({
  ...rootConfig,
  resolve: {
    ...rootConfig.resolve,
    alias: {
      ...rootConfig.resolve?.alias,
      "server-only": resolve(__dirname, "server-only.ts"),
      "@/lib/i18n": resolve(
        __dirname,
        "../../../apps/fleet-partner-portal-web/lib/i18n.tsx",
      ),
      "@": resolve(__dirname, "../../../apps/fleet-partner-portal-web"),
    },
  },
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
