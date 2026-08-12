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
  webpack(config) {
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "@drts/contracts": path.join(__dirname, "../../packages/contracts/src"),
      "@drts/ui-tokens": path.join(__dirname, "../../packages/ui-tokens/src"),
    };

    return config;
  },
  async headers() {
    const candidateSha =
      process.env.DRTS_CANDIDATE_SHA?.trim() || "unconfigured";
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "x-drts-candidate-sha",
            value: candidateSha,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
