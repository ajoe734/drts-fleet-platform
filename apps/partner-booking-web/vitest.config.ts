import path from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
      "@drts/contracts": path.resolve(
        __dirname,
        "../../packages/contracts/src/index.ts",
      ),
      "@drts/api-client": path.resolve(
        __dirname,
        "../../packages/api-client/src/index.ts",
      ),
      "@drts/ui-web": path.resolve(
        __dirname,
        "../../packages/ui-web/src/index.tsx",
      ),
      "@drts/ui-web/partner-booking": path.resolve(
        __dirname,
        "../../packages/ui-web/src/partner-booking-funnel.tsx",
      ),
      "@drts/ui-tokens": path.resolve(
        __dirname,
        "../../packages/ui-tokens/src/index.ts",
      ),
    },
  },
  test: {
    environment: "node",
    include: [
      "tests/integration/**/*.test.ts",
      "tests/integration/**/*.test.tsx",
    ],
  },
});
