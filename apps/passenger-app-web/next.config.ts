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
    "@drts/passenger-client",
  ],
  webpack(config) {
    // Workspace packages author ESM .js specifiers and compile to dist for
    // Node/native consumers; this app bundles their TypeScript source.
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js"],
    };
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "@drts/contracts": path.join(__dirname, "../../packages/contracts/src"),
      "@drts/ui-tokens": path.join(__dirname, "../../packages/ui-tokens/src"),
      "@drts/passenger-client": path.join(
        __dirname,
        "../../packages/passenger-client/src",
      ),
    };

    return config;
  },
  async headers() {
    const candidateSha =
      process.env.DRTS_CANDIDATE_SHA?.trim() || "unconfigured";
    const contentSecurityPolicy =
      "default-src 'self'; connect-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';";
    const paymentMethodsContentSecurityPolicy =
      "default-src 'self'; " +
      "connect-src 'self' https://ecpg-stage.ecpay.com.tw https://ecpg.ecpay.com.tw; " +
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://code.jquery.com https://ecpg-stage.ecpay.com.tw https://ecpg.ecpay.com.tw; " +
      "style-src 'self' 'unsafe-inline' https://ecpg-stage.ecpay.com.tw https://ecpg.ecpay.com.tw; " +
      "img-src 'self' data: https://ecpg-stage.ecpay.com.tw https://ecpg.ecpay.com.tw; " +
      "frame-src 'self' https://ecpg-stage.ecpay.com.tw https://ecpg.ecpay.com.tw https://payment-stage.ecpay.com.tw https://payment.ecpay.com.tw; " +
      "form-action 'self' https://ecpg-stage.ecpay.com.tw https://ecpg.ecpay.com.tw https://payment-stage.ecpay.com.tw https://payment.ecpay.com.tw;";
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "x-drts-candidate-sha",
            value: candidateSha,
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy,
          },
        ],
      },
      {
        source: "/account/payment-methods",
        headers: [
          {
            key: "Content-Security-Policy",
            value: paymentMethodsContentSecurityPolicy,
          },
        ],
      },
      {
        source: "/account/payment-methods/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: paymentMethodsContentSecurityPolicy,
          },
        ],
      },
      {
        source: "/api/passenger-app/payment-methods/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: paymentMethodsContentSecurityPolicy,
          },
        ],
      },
      {
        source: "/review-driver/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
          {
            key: "Content-Security-Policy",
            // Expo's SQLite runtime wraps its same-origin worker in a Blob
            // under cross-origin isolation. Keep this allowance on the Driver
            // mount, after the ordinary Passenger policy in Next's rule order.
            value: `${contentSecurityPolicy} worker-src 'self' blob:;`,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
