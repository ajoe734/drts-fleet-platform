import type { Preview } from "@storybook/nextjs-vite";

const preview: Preview = {
  globalTypes: {
    density: {
      description: "Management density",
      toolbar: {
        title: "Density",
        icon: "sidebaralt",
        items: [
          { value: "comfortable", title: "Comfortable" },
          { value: "compact", title: "Compact" },
        ],
      },
    },
    dark: {
      description: "Management dark mode",
      toolbar: {
        title: "Mode",
        icon: "mirror",
        items: [
          { value: false, title: "Light" },
          { value: true, title: "Dark" },
        ],
      },
    },
  },
  initialGlobals: {
    density: "comfortable",
    dark: false,
  },
  parameters: {
    layout: "fullscreen",
    nextjs: {
      appDirectory: true,
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      default: "workspace",
      values: [
        { name: "workspace", value: "#f4f6fb" },
        { name: "paper", value: "#ffffff" },
        { name: "slate", value: "#0f172a" },
      ],
    },
  },
};

export default preview;
