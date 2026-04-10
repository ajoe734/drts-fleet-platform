import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@drts/shared-types", "@drts/ui-web"],
};

export default nextConfig;
