import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  // Cloud Run + IAP already sit behind a proxying edge. Let the edge own
  // compression so browsers do not receive a decompressed body with a stale
  // `content-encoding: gzip` header.
  compress: false,
  outputFileTracingRoot: path.join(__dirname, "../../"),
  transpilePackages: ["@drts/shared-types", "@drts/ui-tokens", "@drts/ui-web"],
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
