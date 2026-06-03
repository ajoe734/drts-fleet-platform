import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  compress: false,
  outputFileTracingRoot: path.join(__dirname, "../../"),
  transpilePackages: [
    "@drts/contracts",
    "@drts/shared-types",
    "@drts/ui-tokens",
    "@drts/ui-web",
  ],
  // No custom webpack() alias: Next 16 defaults to Turbopack and a webpack-only
  // config breaks the build. @drts/contracts and @drts/ui-tokens already resolve
  // from their package `src` exports (see UI-BASELINE-001), so transpilePackages
  // alone is enough — same as apps/platform-admin-web.
};

export default nextConfig;
