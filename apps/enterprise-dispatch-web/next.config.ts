import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  distDir: process.env.NEXT_DIST_DIR?.trim() || ".next",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  transpilePackages: ["@drts/ui-web"],
};

export default nextConfig;
