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
  async rewrites() {
    // Signed links are console-relative. The existing proxy selects the API
    // origin at runtime and adds its /api prefix without changing the query.
    return [
      {
        source: "/downloads/:kind/:subjectId",
        destination: "/control-plane-proxy/downloads/:kind/:subjectId",
      },
    ];
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
