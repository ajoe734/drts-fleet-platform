import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  output: "standalone",
  distDir: process.env.NEXT_DIST_DIR?.trim() || ".next",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  transpilePackages: ["@drts/agency-auth", "@drts/tenant-auth", "@drts/ui-web"],
  async rewrites() {
    // Signed controlled-download links are console-relative. This rewrite
    // sends them to the runtime proxy, which forwards to the API's
    // /api/downloads without touching the query (the signature lives there).
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
          { key: "x-drts-candidate-sha", value: candidateSha },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
