import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  // Cloud Run + IAP already sit behind a proxying edge. Let the edge own
  // compression so browsers do not receive a decompressed body with a stale
  // `content-encoding: gzip` header.
  compress: false,
  outputFileTracingRoot: path.join(__dirname, "../../"),
  transpilePackages: ["@drts/shared-types", "@drts/ui-web"],
  webpack(config) {
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "@drts/api-client$": path.join(
        __dirname,
        "../../packages/api-client/src/index.ts",
      ),
      "@drts/ui-web$": path.join(
        __dirname,
        "../../packages/ui-web/src/index.tsx",
      ),
      "@drts/ui-web/client$": path.join(
        __dirname,
        "../../packages/ui-web/src/client.tsx",
      ),
    };

    return config;
  },
};

export default nextConfig;
