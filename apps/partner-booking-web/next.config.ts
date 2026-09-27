import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_PRIVATE_DIST_DIR || ".next",
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  transpilePackages: ["@drts/ui-tokens", "@drts/ui-web"],
};

export default nextConfig;
