import { Server } from "node:net";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { JSDOM } from "jsdom";
import { PassengerEmbed } from "../../../apps/referral-embed-web/components/passenger-embed";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../../../apps/referral-embed-web/app/api/referral/session/route";
import { GET as notification } from "../../../apps/referral-embed-web/app/api/referral/notification-navigation/route";
import { middleware } from "../../../apps/referral-embed-web/middleware";
import {
  getReferralEmbedSession,
  toPublicReferralEmbedSession,
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

const publicOrigin = "https://referral.example.test";
const entryHost = "app.fabrikam-living.example";
const embedPath = `/embed/yuhe-residence?entryHost=${entryHost}`;
const internalOrigin = "http://0.0.0.0:3014";
const pending: ServerReferralEmbedSession = {
  handoffId: "controlled-handoff",
  partnerEntrySlug: "yuhe-residence",
  entryHost,
  drtsPassengerId: "controlled-passenger",
  identityActive: false,
  consent: { requiredScopes: [], bundleVersion: null, grantedAt: null },
  identity: {
    actorType: "referral_passenger",
    actorId: "controlled-passenger",
    realm: "partner",
    authMode: "jwt_bearer",
    roleFamilies: ["partner"],
    roles: ["partner"],
    scopes: ["partner:book"],
    tenantId: "controlled-tenant",
    partnerId: "controlled-partner",
    partnerProgramId: "controlled-program",
    partnerEntrySlug: "yuhe-residence",
    drtsPassengerId: "controlled-passenger",
  },
};
const active: ServerReferralEmbedSession = {
  ...pending,
  identityActive: true,
  accessToken: "controlled-issuer-response-token",
  tokenType: "Bearer",
  sessionId: "controlled-session",
  expiresAt: "2030-01-01T00:00:00.000Z",
  consent: {
    requiredScopes: [],
    bundleVersion: "controlled-explicit-consent",
    grantedAt: "2026-10-20T00:00:00.000Z",
  },
};

function request(
  options: {
    host?: string | null;
    origin?: string | null;
    headers?: Record<string, string>;
    form?: URLSearchParams;
    url?: string;
  } = {},
) {
  const headers = new Headers({
    host: "referral.example.test",
    origin: publicOrigin,
    "content-type": options.form
      ? "application/x-www-form-urlencoded"
      : "application/json",
    ...options.headers,
  });
  if (options.host === null) headers.delete("host");
  else if (options.host !== undefined) headers.set("host", options.host);
  if (options.origin === null) headers.delete("origin");
  else if (options.origin !== undefined) headers.set("origin", options.origin);
  return new NextRequest(
    options.url ?? `${internalOrigin}/api/referral/session`,
    {
      method: "POST",
      headers,
      body:
        options.form ??
        JSON.stringify({
          action: "demo-bootstrap",
          entrySlug: "yuhe-residence",
          entryHost,
        }),
    },
  );
}
function navigation(headers: Record<string, string> = {}) {
  return middleware(
    new NextRequest(`${internalOrigin}${embedPath}`, {
      headers: {
        host: "referral.example.test",
        referer: `${publicOrigin}${embedPath}`,
        ...headers,
      },
    }),
  );
}
function consentForm(returnTo = `${embedPath}&screen=book`) {
  return new URLSearchParams({
    action: "grant-consent",
    handoffId: pending.handoffId,
    entrySlug: pending.partnerEntrySlug,
    entryHost,
    returnTo,
  });
}

describe("actual Referral handlers behind Cloud Run HTTPS termination", () => {
  beforeEach(() => {
    vi.spyOn(Server.prototype, "listen").mockImplementation(() => {
      throw new Error("origin regression forbids listening sockets");
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        throw new Error("unexpected external transport");
      }),
    );
    vi.stubEnv("K_SERVICE", "referral-cloud-run");
    vi.stubEnv("DRTS_ENV", "development");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("REFERRAL_EMBED_DEMO", "true");
    vi.stubEnv(
      "REFERRAL_EMBED_SESSION_SECRET",
      "controlled-cookie-signing-key",
    );
    vi.stubEnv("REFERRAL_EMBED_ALLOWED_HOSTS", entryHost);
    ports.jar.clear();
    ports.options.clear();
    ports.entry.mockReset().mockResolvedValue({ entryHost });
    ports.issue
      .mockReset()
      .mockResolvedValue({ artifact: "controlled-handoff-artifact" });
    ports.consume.mockReset().mockResolvedValue(pending);
    ports.consent.mockReset().mockResolvedValue(active);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("allows the public browser POST with an internal Next request URL", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.session.identityActive).toBe(false);
    expect(body.nextPath).toContain("state=consent");
    expect(body.session).not.toHaveProperty("accessToken");
    expect(ports.issue).toHaveBeenCalledWith(
      expect.objectContaining({ consentBundle: null }),
    );
    expect(ports.consent).not.toHaveBeenCalled();
    expect(ports.jar.has("drts_referral_embed_bearer")).toBe(false);
    expect((await getReferralEmbedSession())?.handoffId).toBe(
      pending.handoffId,
    );
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    expect(ports.options.get("drts_referral_embed_session")).toMatchObject({
      httpOnly: true,
      secure: true,
    });
  });

  it("allows first same-site Referer navigation without a cookie hint", () => {
    const response = navigation();
    expect(response.status).toBe(200);
    expect(response.headers.get("X-DRTS-Embed-Decision")).toBe("allowed");
    expect(response.headers.get("Content-Security-Policy")).toContain(
      `frame-ancestors https://${entryHost}`,
    );
    expect(response.headers.get("X-DRTS-PostMessage-Allowed-Origins")).toBe(
      `https://${entryHost}`,
    );
    expect(ports.jar.size).toBe(0);
  });

  function nativeConsentPage(session: ServerReferralEmbedSession) {
    return new JSDOM(
      renderToString(
        createElement(PassengerEmbed, {
          context: {
            entry: {
              entrySlug: session.partnerEntrySlug,
              displayName: "合成合作入口",
              entryHost,
              brandingMetadata: {},
            },
            session: toPublicReferralEmbedSession(session),
            state: "consent",
            screen: "book",
            requestedScreen: "book",
            handoff: { apiKey: null, partnerUserRef: null },
            decision: { requestedEntryHost: entryHost, block: false },
            accent: "#123456",
            strings: {
              appName: "合成社區",
              displayName: "合成合作入口",
              supportPhone: "02-2944-0985",
            },
            issues: [],
            fallbackEntry: null,
          } as never,
        }),
      ),
      { url: `${publicOrigin}${embedPath}` },
    );
  }

  it.each(["first-booking", "notification-return"] as const)(
    "completes the actual native consent POST with a 303 GET destination for %s",
    async (flow) => {
      const original = {
        ...pending,
        ...(flow === "notification-return"
          ? {
              navigationContext: {
                orderId: "own-original-order",
                screen: "trip" as const,
              },
            }
          : {}),
      };
      await writeReferralEmbedSession(original);
      const page = nativeConsentPage(original);
      try {
        const form = page.window.document.querySelector("form")!;
        const submit = [...form.querySelectorAll("button")].find(
          (button) => button.textContent === "同意並開始",
        )!;
        expect(form.method).toBe("post");
        expect(new URL(form.action).pathname).toBe("/api/referral/session");
        expect(submit.type).toBe("submit");
        const fields = new page.window.FormData(form);
        const body = new URLSearchParams();
        for (const [name, value] of fields.entries()) {
          expect(typeof value).toBe("string");
          body.append(name, String(value));
        }
        expect(body.get("action")).toBe("grant-consent");
        expect(body.get("handoffId")).toBe(original.handoffId);
        const response = await POST(request({ form: body }));
        // 303 completes a native POST by opening Location with GET; a 307
        // would forward this same grant-consent POST body to the page instead.
        expect(response.status).toBe(303);
        const destination = new URL(response.headers.get("location")!);
        expect(destination.origin).toBe(publicOrigin);
        expect(destination.pathname).toBe("/embed/yuhe-residence");
        expect(destination.searchParams.get("screen")).toBe(
          flow === "notification-return" ? "trip" : "book",
        );
        expect(destination.searchParams.get("orderId")).toBe(
          flow === "notification-return" ? "own-original-order" : null,
        );
        expect(ports.consent).toHaveBeenCalledOnce();
        expect((await getReferralEmbedSession())?.identityActive).toBe(true);
      } finally {
        page.window.close();
      }
    },
  );

  it("retains a GET-opening 303 after the existing host exchange form", async () => {
    ports.consume.mockResolvedValue(active);
    const form = new URLSearchParams({
      action: "exchange",
      artifact: "original-host-artifact",
      entrySlug: pending.partnerEntrySlug,
      entryHost,
      returnTo: `${embedPath}&screen=book`,
    });
    const response = await POST(request({ form }));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      `${publicOrigin}${embedPath}&screen=book`,
    );
    expect(ports.consume).toHaveBeenCalledOnce();
    expect(ports.consent).not.toHaveBeenCalled();
  });

  it("keeps JSON consent completion as its original 200 data response", async () => {
    await writeReferralEmbedSession(pending);
    const response = await POST(
      new NextRequest(`${internalOrigin}/api/referral/session`, {
        method: "POST",
        headers: {
          host: "referral.example.test",
          origin: publicOrigin,
          "content-type": "application/json",
        },
        body: JSON.stringify(Object.fromEntries(consentForm())),
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect((await response.json()).session.identityActive).toBe(true);
    expect(ports.consent).toHaveBeenCalledOnce();
  });

  it("keeps the actual 暫不使用 action on fallback without granting consent", async () => {
    await writeReferralEmbedSession(pending);
    const page = nativeConsentPage(pending);
    try {
      const decline = [...page.window.document.querySelectorAll("a")].find(
        (link) => link.textContent === "暫不使用",
      )!;
      let destination: URL | null = null;
      // Navigation is the external IO seam; execute the actual native link click.
      decline.addEventListener("click", (event) => {
        event.preventDefault();
        destination = new URL(decline.href);
      });
      decline.click();
      expect(destination!.searchParams.get("state")).toBe("fallback");
      expect(ports.consent).not.toHaveBeenCalled();
      expect((await getReferralEmbedSession())?.identityActive).toBe(false);
      expect(ports.jar.has("drts_referral_embed_bearer")).toBe(false);
    } finally {
      page.window.close();
    }
  });

  it("returns explicit consent to the public HTTPS path with its signed cookie", async () => {
    await writeReferralEmbedSession(pending);
    const response = await POST(request({ form: consentForm() }));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      `${publicOrigin}${embedPath}&screen=book`,
    );
    expect(ports.consent).toHaveBeenCalledWith(
      expect.objectContaining({ handoffId: pending.handoffId }),
    );
    expect((await getReferralEmbedSession())?.sessionId).toBe(active.sessionId);
    expect(ports.options.get("drts_referral_embed_bearer")).toMatchObject({
      httpOnly: true,
      secure: true,
    });
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
  });

  it.each(["https://foreign.example/path", "//foreign.example/path"])(
    "confines form returnTo %s",
    async (returnTo) => {
      await writeReferralEmbedSession(pending);
      const response = await POST(request({ form: consentForm(returnTo) }));
      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe(`${publicOrigin}/`);
    },
  );

  it("redirects an owned notification handoff to the public origin", async () => {
    ports.consume.mockResolvedValue({
      ...active,
      navigationContext: { orderId: "owned-order", screen: "trip" },
    });
    const response = await notification(
      new NextRequest(
        `${internalOrigin}/api/referral/notification-navigation?artifact=controlled&entrySlug=yuhe-residence`,
        { headers: { host: "referral.example.test" } },
      ),
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      `${publicOrigin}/embed/yuhe-residence?screen=trip&orderId=owned-order`,
    );
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
  });

  it.each([
    "https://foreign.example",
    "null",
    "http://referral.example.test",
    "https://referral.example.test/path",
  ])(
    "rejects browser Origin %s before any session mutation",
    async (origin) => {
      await writeReferralEmbedSession(pending);
      const original = new Map(ports.jar);
      const response = await POST(request({ origin }));
      expect(response.status).toBe(403);
      expect(ports.jar).toEqual(original);
      expect(ports.entry).not.toHaveBeenCalled();
      expect(ports.issue).not.toHaveBeenCalled();
      expect(ports.consent).not.toHaveBeenCalled();
    },
  );

  it("ignores forged forwarded/provenance headers instead of trusting them", async () => {
    const headers = {
      "x-forwarded-host": "foreign.example",
      "x-forwarded-proto": "https",
      forwarded: "host=foreign.example;proto=https",
      "x-drts-runtime-origin": "https://foreign.example",
    };
    const response = await POST(
      request({ origin: "https://foreign.example", headers }),
    );
    expect(response.status).toBe(403);
    expect(ports.entry).not.toHaveBeenCalled();
    expect(
      navigation({ ...headers, referer: "https://foreign.example/a" }).status,
    ).toBe(403);
    expect(navigation(headers).status).toBe(200);
  });

  it.each([
    null,
    "referral.example.test,foreign.example",
    "user@referral.example.test",
    "referral.example.test/path",
    "referral.example.test:0",
    "referral.example.test:65536",
    "referral.example.test:abc",
    "referral..example.test",
  ])(
    "rejects invalid Cloud Run authority %s even without Origin",
    async (host) => {
      const response = await POST(request({ host, origin: null }));
      expect(response.status).toBe(403);
      expect(ports.entry).not.toHaveBeenCalled();
      expect(ports.jar.size).toBe(0);
      const headers = new Headers({ referer: publicOrigin });
      if (host !== null) headers.set("host", host);
      const page = middleware(
        new NextRequest(`${internalOrigin}${embedPath}`, { headers }),
      );
      expect(page.status).toBe(403);
    },
  );

  it("retains a valid canonical public port", async () => {
    const response = await POST(
      request({
        host: "referral.example.test:8443",
        origin: "https://referral.example.test:8443",
      }),
    );
    expect(response.status).toBe(200);
  });

  it("rejects duplicate Host header values before issuing a session", async () => {
    const incoming = request({ origin: null });
    incoming.headers.append("host", "foreign.example");
    expect((await POST(incoming)).status).toBe(403);
    expect(ports.entry).not.toHaveBeenCalled();
    expect(ports.jar.size).toBe(0);
  });

  it("preserves an absolute same-public-origin consent return", async () => {
    await writeReferralEmbedSession(pending);
    const target = `${publicOrigin}${embedPath}&screen=book`;
    const response = await POST(request({ form: consentForm(target) }));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(target);
  });

  it("retains authorized parent navigation and rejects foreign parent or entry", () => {
    expect(navigation({ referer: `https://${entryHost}/app` }).status).toBe(
      200,
    );
    expect(navigation({ referer: "https://foreign.example/app" }).status).toBe(
      403,
    );
    const response = middleware(
      new NextRequest(
        `${internalOrigin}/embed/yuhe-residence?entryHost=foreign.example`,
        { headers: { host: "referral.example.test", referer: publicOrigin } },
      ),
    );
    expect(response.status).toBe(403);
    expect(response.headers.get("X-DRTS-Embed-Block-Reason")).toBe(
      "entry_host_not_authorized",
    );
  });

  it("keeps non-Cloud request URL semantics despite forged Host/forwarding", async () => {
    vi.stubEnv("K_SERVICE", "");
    const response = await POST(
      request({
        url: "http://localhost:3014/api/referral/session",
        origin: "http://localhost:3014",
        host: "foreign.example",
        headers: { "x-forwarded-proto": "https" },
      }),
    );
    expect(response.status).toBe(200);
    expect(
      (
        await POST(
          request({
            origin: publicOrigin,
            url: "http://localhost:3014/api/referral/session",
          }),
        )
      ).status,
    ).toBe(403);
  });
});
