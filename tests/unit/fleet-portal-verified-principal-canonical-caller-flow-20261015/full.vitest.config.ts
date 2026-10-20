import { defineConfig } from "vitest/config";
import taskConfig from "./vitest.config";
import regressionConfig from "./regression.vitest.config";
export default defineConfig({
  ...taskConfig,
  test: {
    ...taskConfig.test,
    include: [
      ...new Set([
        ...(taskConfig.test?.include ?? []),
        ...(regressionConfig.test?.include ?? []),
      ]),
    ],
  },
});
