import { afterEach, describe, expect, it, beforeEach } from "vitest";
import {
  decodeStateEnvelope,
  encodeStateEnvelope,
  generateCsrfToken,
  resolveBrowserOrigin,
  sanitizeReturnPath,
  verifyCsrfToken,
  verifySameOrigin,
} from "@/lib/auth/session";

describe("Tenant Auth Session Utilities", () => {
  beforeEach(() => {
    process.env.BFF_STATE_SECRET = "test-bff-state-secret-32-chars-long-123456";
  });

  describe("encodeStateEnvelope and decodeStateEnvelope", () => {
    it("encodes and decodes signed state envelope", () => {
      const payload = {
        stateToken: "random-state-token-12345",
        returnUrl: "/bookings?view=urgent",
        codeVerifier: "verifier-xyz",
      };

      const encoded = encodeStateEnvelope(payload);
      expect(encoded).toContain(".");

      const decoded = decodeStateEnvelope(encoded);
      expect(decoded).not.toBeNull();
      expect(decoded?.stateToken).toBe("random-state-token-12345");
      expect(decoded?.returnUrl).toBe("/bookings?view=urgent");
      expect(decoded?.codeVerifier).toBe("verifier-xyz");
      expect(typeof decoded?.issuedAt).toBe("number");
    });

    it("rejects unsigned raw JSON state envelopes (no unsigned fallback)", () => {
      const rawJson = JSON.stringify({
        stateToken: "untrusted-state-token",
        returnUrl: "/settings",
      });

      // An unsigned raw JSON must be rejected immediately with null
      expect(decodeStateEnvelope(rawJson)).toBeNull();
    });

    it("rejects tampered state envelope", () => {
      const payload = {
        stateToken: "state-token-1",
        returnUrl: "/bookings",
      };

      const encoded = encodeStateEnvelope(payload);
      const [dataB64, hmac] = encoded.split(".");
      const tampered = `${dataB64}.tampered${hmac?.slice(8) ?? ""}`;

      expect(decodeStateEnvelope(tampered)).toBeNull();
    });

    it("rejects expired state envelope (> 600s)", () => {
      const payload = {
        stateToken: "state-token-old",
        returnUrl: "/settings",
        issuedAt: Date.now() - 650 * 1000, // 650s ago
      };

      const encoded = encodeStateEnvelope(payload);
      expect(decodeStateEnvelope(encoded)).toBeNull();
    });

    it("returns null for malformed or empty inputs", () => {
      expect(decodeStateEnvelope("")).toBeNull();
      expect(decodeStateEnvelope(undefined)).toBeNull();
      expect(decodeStateEnvelope("not-a-valid-envelope")).toBeNull();
      expect(decodeStateEnvelope("a.b.c")).toBeNull();
    });

    it("fails closed when no secret is configured", () => {
      const originalSecret = process.env.BFF_STATE_SECRET;
      const originalAuthSecret = process.env.AUTH_COOKIE_SECRET;
      const originalInternalKey = process.env.DRTS_INTERNAL_KEY;

      delete process.env.BFF_STATE_SECRET;
      delete process.env.AUTH_COOKIE_SECRET;
      delete process.env.DRTS_INTERNAL_KEY;

      try {
        expect(() =>
          encodeStateEnvelope({
            stateToken: "token-1",
            returnUrl: "/",
          }),
        ).toThrow("BFF state secret is not configured");

        expect(decodeStateEnvelope("some.envelope")).toBeNull();
      } finally {
        if (originalSecret) process.env.BFF_STATE_SECRET = originalSecret;
        if (originalAuthSecret)
          process.env.AUTH_COOKIE_SECRET = originalAuthSecret;
        if (originalInternalKey)
          process.env.DRTS_INTERNAL_KEY = originalInternalKey;
      }
    });

    it("throws error when encoding with empty or missing stateToken", () => {
      expect(() =>
        encodeStateEnvelope({
          stateToken: "",
          returnUrl: "/",
        }),
      ).toThrow("OIDC state payload requires a valid non-empty stateToken");

      expect(() =>
        encodeStateEnvelope({
          stateToken: "   ",
          returnUrl: "/",
        }),
      ).toThrow("OIDC state payload requires a valid non-empty stateToken");
    });
  });

  describe("sanitizeReturnPath", () => {
    it("preserves valid relative paths", () => {
      expect(sanitizeReturnPath("/")).toBe("/");
      expect(sanitizeReturnPath("/bookings")).toBe("/bookings");
      expect(sanitizeReturnPath("/settings?tab=security#keys")).toBe(
        "/settings?tab=security#keys",
      );
    });

    it("sanitizes open redirects to root", () => {
      expect(sanitizeReturnPath("https://evil.com")).toBe("/");
      expect(sanitizeReturnPath("http://evil.com/steal")).toBe("/");
      expect(sanitizeReturnPath("//evil.com")).toBe("/");
      expect(sanitizeReturnPath("/\\evil.com")).toBe("/");
      expect(sanitizeReturnPath(null)).toBe("/");
      expect(sanitizeReturnPath("")).toBe("/");
    });
  });

  describe("verifyCsrfToken", () => {
    it("accepts identical tokens", () => {
      const token = generateCsrfToken();
      expect(verifyCsrfToken(token, token)).toBe(true);
    });

    it("rejects mismatched or missing tokens", () => {
      const token1 = generateCsrfToken();
      const token2 = generateCsrfToken();
      expect(verifyCsrfToken(token1, token2)).toBe(false);
      expect(verifyCsrfToken(token1, undefined)).toBe(false);
      expect(verifyCsrfToken(undefined, token2)).toBe(false);
      expect(verifyCsrfToken("", "")).toBe(false);
    });
  });

  describe("verifySameOrigin", () => {
    it("accepts matching Origin header", () => {
      const req = new Request("http://localhost:3004/api/bookings", {
        headers: {
          origin: "http://localhost:3004",
        },
      });
      expect(verifySameOrigin(req)).toBe(true);
    });

    it("accepts matching Referer header when Origin is absent", () => {
      const req = new Request("http://localhost:3004/api/bookings", {
        headers: {
          referer: "http://localhost:3004/bookings",
        },
      });
      expect(verifySameOrigin(req)).toBe(true);
    });

    it("rejects cross-origin Origin header", () => {
      const req = new Request("http://localhost:3004/api/bookings", {
        headers: {
          origin: "http://attacker.com",
        },
      });
      expect(verifySameOrigin(req)).toBe(false);
    });

    it("rejects when both Origin and Referer are absent", () => {
      const req = new Request("http://localhost:3004/api/bookings");
      expect(verifySameOrigin(req)).toBe(false);
    });
  });

  // On Cloud Run, Next standalone's request URL is its bind address
  // (0.0.0.0:PORT, or 127.0.0.1:PORT behind the loopback wrapper).
  describe("resolveBrowserOrigin", () => {
    const host = "drts-dev-tenant-console-web-xyz.a.run.app";
    const publicOrigin = `https://${host}`;
    afterEach(() => {
      delete process.env.K_SERVICE;
      delete process.env.DRTS_RUNTIME_ORIGIN_HEADER;
    });

    it("keeps request.url outside Cloud Run, ignoring Host and provenance", () => {
      const req = new Request("http://localhost:3004/x", {
        headers: { host, "x-drts-runtime-origin": publicOrigin },
      });
      expect(resolveBrowserOrigin(req)).toBe("http://localhost:3004");
    });

    it("uses https with Host on Cloud Run instead of the bind address", () => {
      process.env.K_SERVICE = "drts-dev-enterprise-dispatch-web";
      const req = new Request("https://0.0.0.0:3010/x", {
        headers: { host, "x-drts-runtime-origin": "https://forged.test" },
      });
      expect(resolveBrowserOrigin(req)).toBe(publicOrigin);
      const browserPost = (origin: string) =>
        verifySameOrigin(
          new Request("https://0.0.0.0:3010/x", {
            method: "POST",
            headers: { host, origin },
          }),
        );
      expect(browserPost(publicOrigin)).toBe(true);
      expect(browserPost("https://attacker.example.test")).toBe(false);
    });

    it.each(["evil.test/path", "user@evil.test", "evil.test:443", ""])(
      "falls back to request.url for an unusable Host %j",
      (badHost) => {
        process.env.K_SERVICE = "svc";
        const req = new Request("https://0.0.0.0:3010/x", {
          headers: badHost ? { host: badHost } : {},
        });
        expect(resolveBrowserOrigin(req)).toBe("https://0.0.0.0:3010");
      },
    );

    it("uses the loopback wrapper's provenance only when the wrapper says so", () => {
      process.env.K_SERVICE = "drts-dev-tenant-console-web";
      process.env.DRTS_RUNTIME_ORIGIN_HEADER = "1";
      const wrapped = (provenance: string) =>
        new Request("http://127.0.0.1:3104/x", {
          headers: {
            host: "127.0.0.1:3104",
            "x-drts-runtime-origin": provenance,
          },
        });
      expect(resolveBrowserOrigin(wrapped(publicOrigin))).toBe(publicOrigin);
      expect(
        verifySameOrigin(
          new Request("http://127.0.0.1:3104/x", {
            method: "POST",
            headers: {
              host: "127.0.0.1:3104",
              origin: publicOrigin,
              "x-drts-runtime-origin": publicOrigin,
            },
          }),
        ),
      ).toBe(true);
      // Not an exact origin: fall back to Host rather than trust it.
      expect(resolveBrowserOrigin(wrapped(`${publicOrigin}/path`))).toBe(
        "https://127.0.0.1:3104",
      );
      process.env.DRTS_RUNTIME_ORIGIN_HEADER = "0";
      expect(resolveBrowserOrigin(wrapped(publicOrigin))).toBe(
        "https://127.0.0.1:3104",
      );
    });
  });
});
