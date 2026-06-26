import type { NextConfig } from "next";
import path from "path";

const baseSecurityHeaders = [
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
];

const frameDenyHeader = {
  key: "X-Frame-Options",
  value: "DENY",
};

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: [
    "community.example.test",
    "app.yuhe-living.com.tw",
    "app-stg.yuhe-living.com.tw",
  ],
  compress: false,
  outputFileTracingRoot: path.join(__dirname, "../../"),
  async headers() {
    return [
      {
        source: "/embed/:path*",
        headers: baseSecurityHeaders,
      },
      {
        source: "/((?!embed(?:/|$)).*)",
        headers: [...baseSecurityHeaders, frameDenyHeader],
      },
    ];
  },
};

export default nextConfig;
