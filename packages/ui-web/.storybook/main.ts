import type { StorybookConfig } from "@storybook/nextjs-vite";

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
};

export default config;
