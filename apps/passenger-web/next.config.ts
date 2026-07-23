import type { NextConfig } from "next";
import path from "path";

if (
  process.env.NODE_ENV === "production" &&
  process.env.NEXT_PUBLIC_PASSENGER_RIDE_DATA_MODE === "fixture"
) {
  throw new Error(
    "PASSENGER_PRODUCTION_FIXTURE_FORBIDDEN: production must use live passenger authority.",
  );
}

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  output: "standalone",
  distDir: process.env.NEXT_DIST_DIR?.trim() || ".next",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  transpilePackages: ["@drts/ui-web"],
};

export default nextConfig;
