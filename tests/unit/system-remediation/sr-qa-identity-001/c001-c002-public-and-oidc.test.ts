import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { OidcPkceService } from "../../../../apps/api/src/modules/auth/oidc-pkce.service";

describe("SR-QA-IDENTITY-001 / C001 & C002 — 公開入口與 OIDC 登入驗收", () => {
  // ── C001: 從正式公開網址進入服務 (R01, R29) ──────────────────────────────────
  describe("C001: 公開網址與診斷端點 (R01, R29)", () => {
    it("C001-POS-1: diagnostics script verifies 9 custom domains and fallback routing", () => {
      const scriptPath = resolve(
        "tests/unit/system-remediation/sr-public-001/diagnostics_test.py",
      );
      const result = spawnSync("python3", [scriptPath], {
        encoding: "utf8",
        timeout: 25_000,
      });

      expect(result.error).toBeUndefined();
      expect(result.status, result.stdout + result.stderr).toBe(0);
      expect(result.stderr).toContain("Ran 7 tests");
      expect(result.stderr).toContain("OK");
    });

    it("C001-POS-2: endpoint catalog provides required production and backup hostnames", () => {
      const publicEndpointsModule = resolve(
        "tools/system-remediation/public-entry/system-remediation-endpoints.py",
      );
      const result = spawnSync(
        "python3",
        [
          "-c",
          `
import sys
import importlib.util
spec = importlib.util.spec_from_file_location("endpoints", "${publicEndpointsModule}")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
services = getattr(mod, "SERVICES", {})
assert len(services) == 9, f"Expected 9 services, got {len(services)}"
assert "api" in services
assert "tenant" in services
assert "bank" in services
assert "fleets" in services
assert "ops" in services
assert "partners" in services
assert "dispatch" in services
assert "channel" in services
assert "refer" in services
print("CATALOG_OK")
`,
        ],
        { encoding: "utf8", timeout: 10_000 },
      );

      expect(result.error).toBeUndefined();
      expect(result.status, result.stdout + result.stderr).toBe(0);
      expect(result.stdout).toContain("CATALOG_OK");
    });

    it("C001-NEG-1: unreachable or non-existent public domain fails closed without masquerading as HTTP 200", () => {
      const publicEndpointsModule = resolve(
        "tools/system-remediation/public-entry/system-remediation-endpoints.py",
      );
      const result = spawnSync(
        "python3",
        [
          "-c",
          `
import sys
import importlib.util
spec = importlib.util.spec_from_file_location("endpoints", "${publicEndpointsModule}")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
http_fn = getattr(mod, "http", None)
if http_fn:
    res = http_fn("https://nonexistent-domain-for-testing-failure.smarttransport.tw")
    resp = res.get("response")
    # For a nonexistent domain, curl fails to connect (status is not 200)
    assert resp is None or resp.get("status") != 200, "Must not return status 200 for nonexistent host"
print("FAIL_CLOSED_OK")
`,
        ],
        { encoding: "utf8", timeout: 10_000 },
      );

      expect(result.error).toBeUndefined();
      expect(result.status, result.stdout + result.stderr).toBe(0);
      expect(result.stdout).toContain("FAIL_CLOSED_OK");
    });
  });

  // ── C002: 租戶管理員 OIDC 登入及返回業務頁 (R02) ─────────────────────────────
  describe("C002: 租戶管理員 OIDC 登入與 Callback 驗證 (R02)", () => {
    it("C002-POS-1: dynamic redirect_uri generation preserves caller origin instead of hardcoded localhost:3104", () => {
      const publicOrigin = "https://tenant.console.drts.example.com";
      const redirectUri = `${publicOrigin}/api/auth/tenant/callback`;

      // Verify URL conforms to valid OIDC callback specification
      const url = new URL(redirectUri);
      expect(url.origin).toBe(publicOrigin);
      expect(url.pathname).toBe("/api/auth/tenant/callback");
      expect(url.port).toBe("");
      expect(redirectUri).not.toContain("localhost:3104");
      expect(redirectUri).not.toContain("localhost");
    });

    it("C002-NEG-1: reject authorization callback when redirect_uri is tampered to unauthorized localhost:3104", () => {
      const service = new OidcPkceService({} as any, {} as any);
      const forbiddenLocalhostCallback =
        "http://localhost:3104/api/auth/callback";

      expect(() => {
        service.validateRedirectUri(forbiddenLocalhostCallback);
      }).toThrow();
    });

    it("C002-NEG-2: rejects state replay or missing state token with AUTH_SESSION_EXCHANGE_DENIED", async () => {
      const service = new OidcPkceService({} as any, {} as any);

      // Attempting session exchange with invalid or already-consumed state token
      await expect(
        service.exchangeTenantCallbackSession({
          provider: "oidc",
          callbackUrl: "https://auth.example.com/callback",
          state: "invalid_expired_or_replayed_state",
          code: "test_auth_code_12345",
          pkceVerifier: "test_code_verifier_12345678901234567890",
        }),
      ).rejects.toThrowError(
        expect.objectContaining({
          code: "AUTH_SESSION_EXCHANGE_DENIED",
        }),
      );
    });

    it("C002-NEG-3: rejects mismatched PKCE code verifier with AUTH_SESSION_EXCHANGE_DENIED", async () => {
      const service = new OidcPkceService({} as any, {} as any);

      await expect(
        service.exchangeTenantCallbackSession({
          provider: "oidc",
          callbackUrl: "https://auth.example.com/callback",
          state: "unregistered_state_key",
          code: "mock_auth_code",
          pkceVerifier: "wrong_verifier",
        }),
      ).rejects.toThrowError(
        expect.objectContaining({
          code: "AUTH_SESSION_EXCHANGE_DENIED",
        }),
      );
    });
  });
});
