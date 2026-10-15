import path from "node:path";
import { defineConfig, mergeConfig } from "vitest/config";
import base from "../../../vitest.config";

// The root suite defaults @ to the tenant app. This caller is the Ops app.
export default mergeConfig(base, defineConfig({
  resolve: { alias: {
    "@/lib/i18n": path.resolve(__dirname, "../../../apps/ops-console-web/lib/i18n.tsx"),
    "@": path.resolve(__dirname, "../../../apps/ops-console-web"),
  } },
  test: { include: ["tests/unit/report-job-artifact-dataflow-20261015/ops-download.test.tsx"] },
}));
