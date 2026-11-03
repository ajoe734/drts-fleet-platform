import { readFileSync } from "node:fs";
import { Server } from "node:net";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  materializeString,
  materializeValue,
} from "../../e2e/operational-document-upload";
import { POST } from "../../../apps/referral-embed-web/app/api/referral/session/route";
import { middleware } from "../../../apps/referral-embed-web/middleware";
import {
  getReferralEmbedSession,
  writeReferralEmbedSession,
  type ServerReferralEmbedSession,
} from "../../../apps/referral-embed-web/lib/embed-partner-session";

const ports = vi.hoisted(() => ({
  jar: new Map<string, string>(),
  options: new Map<string, Record<string, unknown>>(),
  entry: vi.fn(),
  issue: vi.fn(),
  consume: vi.fn(),
  consent: vi.fn(),
}));
vi.mock(
  "../../../apps/referral-embed-web/node_modules/next/headers.js",
  () => ({
    cookies: async () => ({
      get: (name: string) => {
        const value = ports.jar.get(name);
        return value ? { value } : undefined;
      },
      set: (name: string, value: string, options: Record<string, unknown>) => {
        ports.jar.set(name, value);
        ports.options.set(name, options);
      },
      delete: (name: string) => ports.jar.delete(name),
    }),
  }),
);
vi.mock("../../../apps/referral-embed-web/lib/embed-api", async (original) => ({
  ...(await original<
    typeof import("../../../apps/referral-embed-web/lib/embed-api")
  >()),
  getPartnerEntry: ports.entry,
  issueReferralEmbedHandoffArtifact: ports.issue,
  consumeReferralEmbedHandoffArtifact: ports.consume,
  recordReferralEmbedConsent: ports.consent,
}));

const entrySlug = "yuhe-residence";
// Controlled current registry response; deployment supplies real host data at runtime.
const canonicalHost = "registered.partner.example.test";
const staleHost = "app.fabrikam-living.example";
const publicOrigin = "https://referral.example.test";
const internalOrigin = "http://0.0.0.0:3014";
const pending: ServerReferralEmbedSession = {
  handoffId: "synthetic-canonical-host-handoff",
  partnerEntrySlug: entrySlug,
  entryHost: canonicalHost,
  drtsPassengerId: "synthetic-canonical-host-passenger",
  identityActive: false,
  consent: { requiredScopes: [], bundleVersion: null, grantedAt: null },
  identity: {
    actorType: "referral_passenger",
    actorId: "synthetic-canonical-host-passenger",
    realm: "partner",
    authMode: "jwt_bearer",
    roleFamilies: ["partner"],
    roles: ["partner"],
    scopes: ["partner:book"],
    tenantId: "synthetic-canonical-host-tenant",
    partnerId: "synthetic-canonical-host-partner",
    partnerProgramId: "synthetic-canonical-host-program",
    partnerEntrySlug: entrySlug,
    drtsPassengerId: "synthetic-canonical-host-passenger",
  },
};
const active: ServerReferralEmbedSession = {
  ...pending,
  identityActive: true,
  accessToken: "synthetic-issuer-response-not-a-real-token",
  tokenType: "Bearer",
  sessionId: "synthetic-canonical-host-session",
  expiresAt: "2030-01-01T00:00:00.000Z",
  consent: {
    requiredScopes: [],
    bundleVersion: "synthetic-explicit-consent",
    grantedAt: "2026-10-20T00:00:00.000Z",
  },
};

function deployedAllowedHosts(): string {
  const workflow = readFileSync(
    path.join(process.cwd(), ".github/workflows/deploy-dev.yml"),
    "utf8",
  );
  const step = workflow
    .split("- name: Deploy — referral-embed-web")[1]
    ?.split("\n      - name:")[0];
  const value = step?.match(/REFERRAL_EMBED_ALLOWED_HOSTS=([^,"]+)/)?.[1];
  if (!value) throw new Error("Actual referral deployment allowlist required");
  return value.replace(
    "${{ steps.referral_entry_host.outputs.host }}",
    canonicalHost,
  );
}
function referralJourney() {
  const manifest = JSON.parse(
    readFileSync(
      path.join(
        process.cwd(),
        "tests/e2e/fixtures/operational-browser-journeys.json",
      ),
      "utf8",
    ),
  ) as {
    journeys: {
      id: string;
      route: string;
      environmentVariables?: Record<string, string>;
      setup: {
        path: string;
        method: string;
        body: { action: string; entrySlug: string; entryHost: string };
      }[];
    }[];
  };
  const journey = manifest.journeys.find(
    ({ id }) => id === "referral-create-read-cancel-receipt",
  );
  const setup = journey?.setup[0];
  if (!journey || !setup) throw new Error("Original referral setup required");
  return { journey, setup };
}
function request(body: object | URLSearchParams, origin = publicOrigin) {
  return new NextRequest(`${internalOrigin}/api/referral/session`, {
    method: "POST",
    headers: {
      host: new URL(publicOrigin).host,
      origin,
      "content-type":
        body instanceof URLSearchParams
          ? "application/x-www-form-urlencoded"
          : "application/json",
    },
    body: body instanceof URLSearchParams ? body : JSON.stringify(body),
  });
}
function navigation(
  host: string,
  referer = `${publicOrigin}/embed/${entrySlug}`,
) {
  return middleware(
    new NextRequest(
      `${internalOrigin}/embed/${entrySlug}?entryHost=${encodeURIComponent(host)}`,
      { headers: { host: new URL(publicOrigin).host, referer } },
    ),
  );
}

describe("current canonical Referral entry deployment and original setup", () => {
  beforeEach(() => {
    vi.spyOn(Server.prototype, "listen").mockImplementation(() => {
      throw new Error(
        "Canonical entry host regression forbids listening sockets",
      );
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        throw new Error("Unexpected external transport");
      }),
    );
    vi.stubEnv("K_SERVICE", "synthetic-referral-cloud-run");
    vi.stubEnv("DRTS_ENV", "development");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("REFERRAL_EMBED_DEMO", "true");
    vi.stubEnv(
      "REFERRAL_EMBED_SESSION_SECRET",
      "synthetic-cookie-signing-secret",
    );
    vi.stubEnv("REFERRAL_EMBED_ALLOWED_HOSTS", deployedAllowedHosts());
    vi.stubEnv("DRTS_OPERATIONAL_REFERRAL_ENTRY_HOST", canonicalHost);
    ports.jar.clear();
    ports.options.clear();
    ports.entry.mockReset().mockResolvedValue({ entryHost: canonicalHost });
    ports.issue
      .mockReset()
      .mockResolvedValue({ artifact: "synthetic-artifact" });
    ports.consume.mockReset().mockResolvedValue(pending);
    ports.consent.mockReset().mockResolvedValue(active);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it.each([
    `${publicOrigin}/embed/${entrySlug}`,
    `https://${canonicalHost}/app`,
  ])(
    "allows the registered canonical Start host with real middleware and source %s",
    (referer) => {
      const response = navigation(canonicalHost, referer);
      expect(response.status).toBe(200);
      expect(response.headers.get("X-DRTS-Embed-Decision")).toBe("allowed");
      expect(response.headers.get("Content-Security-Policy")).toContain(
        `frame-ancestors https://${canonicalHost}`,
      );
      expect(response.headers.get("X-Frame-Options")).toBeNull();
    },
  );

  it("executes the actual original manifest bootstrap then requires explicit consent before active cookies", async () => {
    const { journey, setup } = referralJourney();
    const variables: Record<string, string> = {};
    for (const [key, name] of Object.entries(
      journey.environmentVariables ?? {},
    )) {
      const value = process.env[name];
      if (!value) throw new Error("Missing runtime manifest variable");
      variables[key] = value;
    }
    const command = materializeValue(setup.body, variables);
    if (!command || typeof command !== "object" || Array.isArray(command))
      throw new Error("Manifest bootstrap object required");
    const route = materializeString(journey.route, variables);
    const response = await POST(request(command));
    expect(response.status).toBe(200);
    expect(setup.path).toBe("/api/referral/session");
    expect(setup.method).toBe("POST");
    const body = await response.json();
    expect(body.session.identityActive).toBe(false);
    expect(body.session).not.toHaveProperty("accessToken");
    expect(body.session).not.toHaveProperty("sessionId");
    expect(body.nextPath).toBe(route);
    expect(ports.entry).toHaveBeenCalledWith(entrySlug);
    expect(ports.issue).toHaveBeenCalledWith({
      entrySlug,
      entryHost: canonicalHost,
      partnerUserRef: expect.stringMatching(
        new RegExp(`^referral-demo-${entrySlug}-[0-9a-f-]{36}$`),
      ),
      consentBundle: null,
    });
    expect(ports.consume).toHaveBeenCalledWith({
      artifact: "synthetic-artifact",
      entrySlug,
      entryHost: canonicalHost,
    });
    expect(ports.consent).not.toHaveBeenCalled();
    expect(ports.jar.has("drts_referral_embed_bearer")).toBe(false);
    expect((await getReferralEmbedSession())?.identityActive).toBe(false);
    expect(
      navigation(
        new URL(route, publicOrigin).searchParams.get("entryHost") ?? "",
      ).status,
    ).toBe(200);

    const form = new URLSearchParams({
      action: "grant-consent",
      handoffId: pending.handoffId,
      entrySlug,
      entryHost: canonicalHost,
      returnTo: `/embed/${entrySlug}?state=handoff&screen=book`,
    });
    const consent = await POST(request(form));
    expect(consent.status).toBe(303);
    expect(consent.headers.get("location")).toBe(
      `${publicOrigin}/embed/${entrySlug}?state=handoff&screen=book`,
    );
    expect(ports.consent).toHaveBeenCalledOnce();
    expect((await getReferralEmbedSession())?.sessionId).toBe(active.sessionId);
    expect(ports.options.get("drts_referral_embed_bearer")).toMatchObject({
      httpOnly: true,
      secure: true,
    });
    expect(consent.headers.get("cache-control")).toBe("no-store, max-age=0");
  });

  it("keeps a direct canonical browser bootstrap pending instead of silently granting consent", async () => {
    const response = await POST(
      request({
        action: "demo-bootstrap",
        entrySlug,
        entryHost: canonicalHost,
      }),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).session.identityActive).toBe(false);
    expect(ports.consent).not.toHaveBeenCalled();
    expect(ports.jar.has("drts_referral_embed_bearer")).toBe(false);
  });

  it("retains explicit demonstration hosts without treating them as this registered entry", async () => {
    expect(navigation(staleHost).status).toBe(200);
    const response = await POST(
      request({ action: "demo-bootstrap", entrySlug, entryHost: staleHost }),
    );
    expect(response.status).toBe(403);
    expect(ports.issue).not.toHaveBeenCalled();
    expect(ports.consume).not.toHaveBeenCalled();
    expect(ports.consent).not.toHaveBeenCalled();
    expect(ports.jar.size).toBe(0);
  });

  it("denies an unlisted foreign host in middleware and canonical bootstrap before any handoff", async () => {
    const response = navigation("foreign.example.test");
    expect(response.status).toBe(403);
    expect(response.headers.get("X-DRTS-Embed-Block-Reason")).toBe(
      "entry_host_not_authorized",
    );
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(
      (
        await POST(
          request({
            action: "demo-bootstrap",
            entrySlug,
            entryHost: "foreign.example.test",
          }),
        )
      ).status,
    ).toBe(403);
    expect(ports.issue).not.toHaveBeenCalled();
    expect(ports.consume).not.toHaveBeenCalled();
    expect(ports.consent).not.toHaveBeenCalled();
    expect(ports.jar.size).toBe(0);
  });

  it("does not let the newly allowed canonical host authorize a cross-origin session POST", async () => {
    const response = await POST(
      request(
        { action: "demo-bootstrap", entrySlug, entryHost: canonicalHost },
        `https://${canonicalHost}`,
      ),
    );
    expect(response.status).toBe(403);
    expect(ports.entry).not.toHaveBeenCalled();
    expect(ports.issue).not.toHaveBeenCalled();
    expect(ports.jar.size).toBe(0);
  });

  it("preserves signed own cookies when a stale entry-host request is rejected", async () => {
    await writeReferralEmbedSession(active);
    const original = [...ports.jar.entries()];
    const response = await POST(
      request({ action: "demo-bootstrap", entrySlug, entryHost: staleHost }),
    );
    expect(response.status).toBe(403);
    expect([...ports.jar.entries()]).toEqual(original);
    expect((await getReferralEmbedSession())?.sessionId).toBe(active.sessionId);
    expect(ports.issue).not.toHaveBeenCalled();
    expect(ports.consume).not.toHaveBeenCalled();
    expect(ports.consent).not.toHaveBeenCalled();
  });
});
