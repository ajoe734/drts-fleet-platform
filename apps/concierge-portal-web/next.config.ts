import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  compress: false,
  transpilePackages: ["@drts/api-client", "@drts/contracts", "@drts/ui-tokens"],
  outputFileTracingRoot: path.join(__dirname, "../../"),
  turbopack: {
    root: path.join(__dirname, "../../"),
  },
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@drts/api-client": path.join(__dirname, "../../packages/api-client/src"),
      "@drts/contracts": path.join(__dirname, "../../packages/contracts/src"),
      "@drts/ui-tokens": path.join(__dirname, "../../packages/ui-tokens/src"),
    };
    return config;
  },
};

export default nextConfig;
