import type { StorybookConfig } from "@storybook/nextjs-vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mergeConfig } from "vite";

const storybookDir = path.dirname(fileURLToPath(import.meta.url));

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  staticDirs: [
    {
      from: "../../../docs/05-ui/drts-design-canvas",
      to: "/drts-design-canvas",
    },
  ],
  framework: {
    name: "@storybook/nextjs-vite",
    options: {},
  },
  viteFinal: async (config) =>
    mergeConfig(config, {
      resolve: {
        alias: {
          "@drts/ui-tokens": path.resolve(
            storybookDir,
            "../../ui-tokens/src/index.ts",
          ),
        },
      },
    }),
};

export default config;
