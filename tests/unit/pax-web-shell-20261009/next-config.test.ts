import { describe, it, expect } from "vitest";
import nextConfig from "../../../apps/passenger-app-web/next.config.ts";

describe("next.config.ts security headers", () => {
  it("applies security headers to all routes", async () => {
    if (typeof nextConfig.headers === "function") {
      const headersList = await nextConfig.headers();
      const allRouteHeaders = headersList.find((h: any) => h.source === "/:path*");
      expect(allRouteHeaders).toBeDefined();
      
      const headers = Object.fromEntries(allRouteHeaders!.headers.map((h: any) => [h.key, h.value]));
      expect(headers["X-Content-Type-Options"]).toBe("nosniff");
      expect(headers["X-Frame-Options"]).toBe("DENY");
      expect(headers["Strict-Transport-Security"]).toContain("max-age=31536000");
      expect(headers["Content-Security-Policy"]).toContain("default-src 'self'");
    }
  });
});
