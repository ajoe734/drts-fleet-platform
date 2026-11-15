import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
      "@drts/contracts": path.resolve(
        __dirname,
        "../../packages/contracts/src/index.ts",
      ),
      "@drts/ui-tokens": path.resolve(
        __dirname,
        "../../packages/ui-tokens/src/index.ts",
      ),
      "@drts/ui-web/client": path.resolve(
        __dirname,
        "../../packages/ui-web/src/client.tsx",
      ),
      "@drts/ui-web": path.resolve(
        __dirname,
        "../../packages/ui-web/src/index.tsx",
      ),
      "@drts/tenant-auth/credential-handlers": path.resolve(
        __dirname,
        "../../packages/tenant-auth/src/credential-handlers.ts",
      ),
      "@drts/tenant-auth/constants": path.resolve(
        __dirname,
        "../../packages/tenant-auth/src/constants.ts",
      ),
      "@drts/tenant-auth/session": path.resolve(
        __dirname,
        "../../packages/tenant-auth/src/session.ts",
      ),
      "@drts/tenant-auth/api-fetch": path.resolve(
        __dirname,
        "../../packages/tenant-auth/src/api-fetch.ts",
      ),
      "@drts/tenant-auth": path.resolve(
        __dirname,
        "../../packages/tenant-auth/src/route-handlers.ts",
      ),
      "@drts/agency-auth/constants": path.resolve(
        __dirname,
        "../../packages/agency-auth/src/constants.ts",
      ),
      "@drts/agency-auth/agency-api": path.resolve(
        __dirname,
        "../../packages/agency-auth/src/agency-api.ts",
      ),
      "@drts/agency-auth/verified-agency-session.server": path.resolve(
        __dirname,
        "../../packages/agency-auth/src/verified-agency-session.server.ts",
      ),
      "@drts/agency-auth": path.resolve(
        __dirname,
        "../../packages/agency-auth/src/route-handlers.ts",
      ),
    },
  },
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts"],
  },
});
