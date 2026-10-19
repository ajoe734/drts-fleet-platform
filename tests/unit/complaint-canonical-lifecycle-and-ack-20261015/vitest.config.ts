import path from "node:path";
import { defineConfig, mergeConfig } from "vitest/config";
import base from "../../../vitest.config";

// The root suite defaults @ to the tenant app. This caller is the Ops app.
const config = mergeConfig(
  base,
  defineConfig({
    resolve: {
      alias: {
        "@/lib/i18n": path.resolve(
          __dirname,
          "../../../apps/ops-console-web/lib/i18n.tsx",
        ),
        "@/components/ops-assistant": path.resolve(
          __dirname,
          "../../../apps/ops-console-web/components/ops-assistant/index.ts",
        ),
        "@": path.resolve(__dirname, "../../../apps/ops-console-web"),
      },
    },
  }),
);

config.test = {
  ...config.test,
  include: [
    "tests/unit/complaint-canonical-lifecycle-and-ack-20261015/complaint-ops-ui-actions.test.tsx",
  ],
};
export default config;
