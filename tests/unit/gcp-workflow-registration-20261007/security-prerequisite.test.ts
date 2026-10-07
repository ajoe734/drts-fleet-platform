import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

// Resolve through the real API -> OpenClaw -> GenAI dependency graph, not a
// separately installed SDK or a hard-coded pnpm store path. Importing this
// library does not start the application, an MCP server or any HTTP server.
const apiRequire = createRequire(resolve("apps/api/package.json"));
const openclawRequire = createRequire(apiRequire.resolve("openclaw"));
const aiRequire = createRequire(openclawRequire.resolve("@openclaw/ai"));
const genaiRequire = createRequire(aiRequire.resolve("@google/genai"));
const sdk = genaiRequire("@modelcontextprotocol/sdk/client/auth.js");

const trusted = "https://trusted-auth.example.invalid";
const foreign = "https://foreign-auth.example.invalid";
const resource = "https://resource.example.invalid";

function provider(discoveredIssuer: string, boundIssuer = trusted) {
  return {
    clientMetadata: { scope: "test-only" },
    discoveryState: async () => ({
      authorizationServerUrl: discoveredIssuer,
      resourceMetadata: { resource },
      authorizationServerMetadata: {
        issuer: discoveredIssuer,
        token_endpoint: `${discoveredIssuer}/token`,
        token_endpoint_auth_methods_supported: ["client_secret_basic"],
        grant_types_supported: ["client_credentials"],
      },
    }),
    clientInformation: async () => ({
      client_id: "synthetic-client",
      client_secret: "synthetic-secret-not-a-real-credential",
      issuer: boundIssuer,
    }),
    prepareTokenRequest: async () =>
      new URLSearchParams({ grant_type: "client_credentials" }),
    tokens: async () => undefined,
    saveTokens: vi.fn(),
  };
}

function mockFetch() {
  // Every HTTP request is captured in-memory; no external service is called.
  return vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    expect(new URL(String(url)).hostname).toMatch(/\.example\.invalid$/);
    expect(init?.method).toBe("POST");
    return Response.json({
      access_token: "synthetic-token-not-a-real-credential",
      token_type: "Bearer",
      expires_in: 60,
    });
  });
}

describe("workflow registration security prerequisite", () => {
  it("pins the four advisory repairs without touching the security gate", () => {
    const manifest = JSON.parse(readFileSync("package.json", "utf8"));
    expect(manifest.pnpm.overrides).toMatchObject({
      "@modelcontextprotocol/sdk@<1.31.0": "1.31.0",
      "js-yaml@3.15.2>argparse": "2.0.1",
      "proxy-addr@<2.0.8": "2.0.8",
      "source-map-js@<1.2.2": "1.2.2",
    });
    const lock = readFileSync("pnpm-lock.yaml", "utf8");
    for (const vulnerable of [
      "@modelcontextprotocol/sdk@1.30.0",
      "argparse@1.0.10",
      "sprintf-js@1.0.3",
      "proxy-addr@2.0.7",
      "source-map-js@1.2.1",
    ]) {
      expect(lock).not.toContain(vulnerable);
    }
    expect(lock).toContain("@modelcontextprotocol/sdk@1.31.0");
  });

  it("does not send issuer-bound client credentials to an MCP-selected foreign server", async () => {
    const fetchFn = mockFetch();
    await expect(
      sdk.auth(provider(foreign), { serverUrl: resource, fetchFn }),
    ).rejects.toThrow(/bound to authorization server.*not presented/);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("also rejects foreign-server credential reuse in direct token exchange", async () => {
    const fetchFn = mockFetch();
    await expect(
      sdk.fetchToken(provider(foreign), foreign, {
        metadata: { token_endpoint: `${foreign}/token` },
        fetchFn,
      }),
    ).rejects.toThrow(/bound to authorization server.*not presented/);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("preserves authorized token exchange and stamps saved tokens with the actual issuer", async () => {
    const fetchFn = mockFetch();
    const configured = provider(trusted, `${trusted}/`);
    await expect(
      sdk.auth(configured, { serverUrl: resource, fetchFn }),
    ).resolves.toBe("AUTHORIZED");
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(String(fetchFn.mock.calls[0]?.[0])).toBe(`${trusted}/token`);
    expect(configured.saveTokens).toHaveBeenCalledWith(
      expect.objectContaining({ issuer: trusted, token_type: "Bearer" }),
    );
  });
});
