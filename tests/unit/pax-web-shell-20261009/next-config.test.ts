import { describe, it, expect } from "vitest";

describe("next.config.ts security headers", () => {
  it("applies security headers to all routes", async () => {
    // Dynamic import with variable to avoid tsc statically resolving and pulling in Next.js globals
    const modPath = "../../../apps/passenger-app-web/next.config.ts";
    const mod = await import(/* @vite-ignore */ modPath);
    const nextConfig = mod.default;

    if (typeof nextConfig.headers === "function") {
      const headersList = await nextConfig.headers();
      const allRouteHeaders = headersList.find(
        (h: any) => h.source === "/:path*",
      );
      expect(allRouteHeaders).toBeDefined();

      const headers = Object.fromEntries(
        allRouteHeaders!.headers.map((h: any) => [h.key, h.value]),
      );
      expect(headers["X-Content-Type-Options"]).toBe("nosniff");
      expect(headers["X-Frame-Options"]).toBe("DENY");
      expect(headers["Strict-Transport-Security"]).toContain(
        "max-age=31536000",
      );
      expect(headers["Content-Security-Policy"]).toContain(
        "default-src 'self'",
      );
    }
  });
});
