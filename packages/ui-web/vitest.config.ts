import { defineConfig } from "vitest/config";
import rootConfig from "../../vitest.config";

export default defineConfig({
  ...rootConfig,
  test: {
    ...rootConfig.test,
    include: [
      ...(rootConfig.test?.include ?? []),
      "src/management-theme-context.test.tsx",
    ],
  },
});
