import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "../../../apps/fleet-partner-portal-web"),
      "@drts/ui-web": path.resolve(
        __dirname,
        "../../../packages/ui-web/src/index.tsx",
      ),
      react: path.resolve(__dirname, "../../../node_modules/react"),
      "react-dom": path.resolve(__dirname, "../../../node_modules/react-dom"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
  },
});
