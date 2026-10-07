import baseConfig from "./packages/eslint-config/base.mjs";
import { controllerAsyncConfig } from "./apps/api/eslint.config.mjs";

export default [
  ...baseConfig,
  { ...controllerAsyncConfig, files: ["apps/api/src/**/*.controller.ts"] },
];
