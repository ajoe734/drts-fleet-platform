import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReferralEmbedHandoffRepository } from "../../../../apps/api/src/modules/tenant-partner/referral-embed-handoff.repository";
import { TenantPartnerService } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.service";

// This suite is the BFF "production path" regression the Codex reviewer
// asked for on top of embed-session-route.test.ts (BFF-only, embed-api fully
// mocked) and consent-replay-guards.test.ts (service-only, no BFF/cookie
// layer): here the mocked HTTP bridge (embed-api.ts, the only thing this repo
// lets us mock without also mocking the authority we are testing) delegates
// straight into a real TenantPartnerService + ReferralEmbedHandoffRepository
// (fallback/in-memory, the same class used against Postgres), and the cookie
// layer (embed-partner-session.ts, including its real HMAC sign/verify and
// 8h TTL) is exercised unmocked against an in-memory `next/headers` jar. Only
// Next's cookie store, the wall clock, and the HTTP bridge are test doubles;
// nothing about the authorization decision itself is faked.

const cookieJar = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: () => ({
    get: (name: string) => {
      const value = cookieJar.get(name);
      return value === undefined ? undefined : { value };
    },
    set: (name: string, value: string) => {
      cookieJar.set(name, value);
    },
    delete: (name: string) => {
      cookieJar.delete(name);
    },
  }),
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: any, init: any) => new Response(JSON.stringify(body), init),
    redirect: (url: URL) => {
      const res = new Response(null, { status: 307 });
      res.headers.set("Location", url.toString());
      return res;
    },
  },
}));

type ServiceHarness = { service: TenantPartnerService | null };
const harness: ServiceHarness = { service: null };

function toBridgeError(err: unknown): Error {
  if (err && typeof err === "object" && "message" in err) {
    const status =
      typeof (err as any).getStatus === "function"
        ? (err as any).getStatus()
        : ((err as any).status ?? 500);
    const bridgeError = new Error(String((err as any).message)) as Error & {
      status: number;
      code: string;
    };
    bridgeError.status = status;
    bridgeError.code = (err as any).code ?? "EMBED_AUTHORITY_REQUEST_FAILED";
    return bridgeError;
  }
  return err instanceof Error ? err : new Error(String(err));
}

vi.mock("../../../../apps/referral-embed-web/lib/embed-api", () => ({
  getPartnerEntry: async (entrySlug: string) => {
    if (!harness.service) throw new Error("harness service not configured");
    try {
      return await harness.service.getPartnerEntry(entrySlug);
    } catch (err) {
      throw toBridgeError(err);
    }
  },
  consumeReferralEmbedHandoffArtifact: async (command: any) => {
    if (!harness.service) throw new Error("harness service not configured");
    try {
      return await harness.service.consumeReferralEmbedHandoffArtifact(command);
    } catch (err) {
      throw toBridgeError(err);
    }
  },
  recordReferralEmbedConsent: async (command: any) => {
    if (!harness.service) throw new Error("harness service not configured");
    try {
      return await harness.service.recordReferralEmbedConsent(command);
    } catch (err) {
      throw toBridgeError(err);
    }
  },
}));

import { GET } from "../../../../apps/referral-embed-web/app/api/referral/notification-navigation/route";
import { POST } from "../../../../apps/referral-embed-web/app/api/referral/session/route";

const ENTRY_A = {
  entrySlug: "demo-slug-a",
  entryHost: "entry-a.example.com",
  status: "active" as const,
  tenantId: "tenant-a",
  partnerId: "partner-a",
  activeFlag: true,
  authMode: "partner_api_key" as const,
};

const ENTRY_B = {
  entrySlug: "demo-slug-b",
  entryHost: "entry-b.example.com",
  status: "active" as const,
  tenantId: "tenant-b",
  partnerId: "partner-b",
  activeFlag: true,
  authMode: "partner_api_key" as const,
};

function buildService(
  entries: Record<string, unknown>[],
  linkStatusByPassenger: Record<string, "active" | "revoked" | null>,
  handoffRepo: ReferralEmbedHandoffRepository,
) {
  const linkRepo = {
    findByDrtsPassengerId: async (_entrySlug: string, drtsPassengerId: string) => {
      const status = linkStatusByPassenger[drtsPassengerId] ?? "active";
      return status === null ? null : { status, drtsPassengerId };
    },
  };
  const tenantPartnerRepo = {
    loadState: async () => ({ partnerEntries: entries }),
  };
  const auditNotificationService = { recordAuditLog: () => {} };
  return new TenantPartnerService(
    auditNotificationService as any,
    tenantPartnerRepo as any,
    undefined,
    undefined,
    undefined,
    linkRepo as any,
    handoffRepo,
  );
}

async function issueHandoff(
  handoffRepo: ReferralEmbedHandoffRepository,
  overrides: Partial<Parameters<ReferralEmbedHandoffRepository["issue"]>[0]>,
) {
  return handoffRepo.issue({
    artifact: overrides.artifact ?? `artifact-${Math.random()}`,
    entrySlug: overrides.entrySlug ?? ENTRY_A.entrySlug,
    entryHost: overrides.entryHost ?? ENTRY_A.entryHost,
    partnerUserRef: overrides.partnerUserRef ?? "partner-user-1",
    drtsPassengerId: overrides.drtsPassengerId ?? "pass-1",
    tenantId: overrides.tenantId ?? ENTRY_A.tenantId,
    partnerId: overrides.partnerId ?? ENTRY_A.partnerId,
    partnerProgramId: overrides.partnerProgramId ?? null,
    consentRequired: overrides.consentRequired ?? true,
    consentBundleVersion: overrides.consentBundleVersion ?? null,
    consentGrantedAt: overrides.consentGrantedAt ?? null,
    issuedAt: overrides.issuedAt ?? new Date().toISOString(),
    expiresAt:
      overrides.expiresAt ?? new Date(Date.now() + 120_000).toISOString(),
  });
}

function decodeCookie(): { drtsPassengerId: string; partnerEntrySlug: string; identityActive: boolean; consent: { bundleVersion: string | null } } | null {
  const raw = cookieJar.get("drts_referral_embed_session");
  if (!raw) return null;
  const [body] = raw.split(".");
  if (!body) return null;
  return JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
}

describe("SR-PARTNER-NOTIFY-NAV-20260917 BFF production-path regression", () => {
  let handoffRepo: ReferralEmbedHandoffRepository;

  beforeEach(() => {
    process.env.REFERRAL_EMBED_SESSION_SECRET = "test-secret";
    cookieJar.clear();
    handoffRepo = new ReferralEmbedHandoffRepository();
  });

  afterEach(() => {
    vi.useRealTimers();
    harness.service = null;
    delete process.env.REFERRAL_EMBED_SESSION_SECRET;
  });

  // The mocked `next/headers` cookies() above is a single shared jar (the
  // same simplification `embed-partner-session.test.ts` uses), standing in
  // for "one browser, one cookie jar" rather than per-request cookie
  // headers: session state carries forward across sequential GET/POST calls
  // in a test exactly as it would across sequential requests from the same
  // browser, without needing a Next.js request-scoped cookie store.
  function getRequest(params: Record<string, string>) {
    const url = new URL("https://entry-a.example.com/api/referral/notification-navigation");
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return new Request(url);
  }

  describe("GET /api/referral/notification-navigation", () => {
    it("consumes a fresh handoff, sets an HttpOnly session cookie, and redirects to the navigation screen", async () => {
      harness.service = buildService([ENTRY_A], {}, handoffRepo);
      await harness.service.onModuleInit();
      const handoff = await issueHandoff(handoffRepo, {
        artifact: "art-positive",
      });

      const res = await GET(
        getRequest({ artifact: "art-positive", entrySlug: ENTRY_A.entrySlug }),
      );
      expect(res.status).toBe(307);
      expect(res.headers.get("Location")).toContain(`/embed/${ENTRY_A.entrySlug}`);

      const cookie = decodeCookie();
      expect(cookie?.drtsPassengerId).toBe("pass-1");
      expect(cookie?.partnerEntrySlug).toBe(ENTRY_A.entrySlug);

      // The handoff is single-use: replaying the same artifact must not
      // succeed a second time even though it is unrelated to this test's
      // main assertion.
      const replay = await handoffRepo.consume({
        artifact: "art-positive",
        entrySlug: ENTRY_A.entrySlug,
        entryHost: ENTRY_A.entryHost,
      });
      expect(replay.outcome).toBe("replayed");
      void handoff;
    });

    it("rejects a cross-entry consume when the caller's cookie belongs to a different partner entry, for the *same* passenger, leaving that cookie and the new handoff untouched", async () => {
      harness.service = buildService([ENTRY_A, ENTRY_B], {}, handoffRepo);
      await harness.service.onModuleInit();

      // Establish a real, cookie-store-backed session for entry B first,
      // using the *same* drtsPassengerId ("pass-1", issueHandoff's default)
      // that the entry-A handoff below will carry. Keeping the subject fixed
      // and varying only entrySlug isolates the entry-mismatch branch of the
      // repository's `currentPartnerEntrySlug` guard from the separate
      // cross-subject case above/below, which instead holds entry fixed and
      // varies drtsPassengerId.
      await issueHandoff(handoffRepo, {
        artifact: "art-entry-b",
        entrySlug: ENTRY_B.entrySlug,
        entryHost: ENTRY_B.entryHost,
        tenantId: ENTRY_B.tenantId,
        partnerId: ENTRY_B.partnerId,
      });
      const bootstrap = await GET(
        getRequest({ artifact: "art-entry-b", entrySlug: ENTRY_B.entrySlug }),
      );
      expect(bootstrap.status).toBe(307);
      const cookieAfterB = cookieJar.get("drts_referral_embed_session");
      expect(cookieAfterB).toBeTruthy();
      expect(decodeCookie()?.drtsPassengerId).toBe("pass-1");

      // Now try to consume a fresh entry-A handoff (same passenger, "pass-1")
      // while presenting entry B's cookie: the BFF forwards the cookie's
      // partnerEntrySlug as currentPartnerEntrySlug, and the repository must
      // reject the cross-entry mismatch instead of switching the caller into
      // entry A, even though the subject identity is unchanged.
      await issueHandoff(handoffRepo, { artifact: "art-entry-a" });
      const res = await GET(
        getRequest({ artifact: "art-entry-a", entrySlug: ENTRY_A.entrySlug }),
      );
      expect(res.status).toBe(403);
      expect(cookieJar.get("drts_referral_embed_session")).toBe(cookieAfterB);

      // The rejected handoff must still be usable by its rightful caller
      // (proves the mismatch did not burn it via a partial commit).
      const rightfulConsume = await handoffRepo.consume({
        artifact: "art-entry-a",
        entrySlug: ENTRY_A.entrySlug,
        entryHost: ENTRY_A.entryHost,
      });
      expect(rightfulConsume.outcome).toBe("consumed");
    });

    it("rejects a cross-subject consume when the caller's cookie belongs to a different passenger at the same entry, leaving that cookie and the new handoff untouched", async () => {
      harness.service = buildService([ENTRY_A], {}, handoffRepo);
      await harness.service.onModuleInit();

      await issueHandoff(handoffRepo, {
        artifact: "art-subject-2",
        drtsPassengerId: "pass-2",
      });
      const bootstrap = await GET(
        getRequest({ artifact: "art-subject-2", entrySlug: ENTRY_A.entrySlug }),
      );
      expect(bootstrap.status).toBe(307);
      const cookieForPass2 = cookieJar.get("drts_referral_embed_session");

      await issueHandoff(handoffRepo, {
        artifact: "art-subject-1",
        drtsPassengerId: "pass-1",
      });
      const res = await GET(
        getRequest({ artifact: "art-subject-1", entrySlug: ENTRY_A.entrySlug }),
      );
      expect(res.status).toBe(403);
      expect(cookieJar.get("drts_referral_embed_session")).toBe(cookieForPass2);

      const rightfulConsume = await handoffRepo.consume({
        artifact: "art-subject-1",
        entrySlug: ENTRY_A.entrySlug,
        entryHost: ENTRY_A.entryHost,
      });
      expect(rightfulConsume.outcome).toBe("consumed");
    });

    it("rejects replaying an already-consumed artifact without granting a session to the replaying caller", async () => {
      harness.service = buildService([ENTRY_A], {}, handoffRepo);
      await harness.service.onModuleInit();
      await issueHandoff(handoffRepo, { artifact: "art-replay" });

      const first = await GET(
        getRequest({ artifact: "art-replay", entrySlug: ENTRY_A.entrySlug }),
      );
      expect(first.status).toBe(307);
      cookieJar.clear();

      const second = await GET(
        getRequest({ artifact: "art-replay", entrySlug: ENTRY_A.entrySlug }),
      );
      expect(second.status).toBe(403);
      expect(cookieJar.has("drts_referral_embed_session")).toBe(false);
    });

    it("rejects consuming an expired handoff artifact", async () => {
      harness.service = buildService([ENTRY_A], {}, handoffRepo);
      await harness.service.onModuleInit();

      const now = Date.now();
      vi.useFakeTimers();
      vi.setSystemTime(now);
      await issueHandoff(handoffRepo, {
        artifact: "art-expired",
        issuedAt: new Date(now).toISOString(),
        expiresAt: new Date(now + 120_000).toISOString(),
      });
      vi.setSystemTime(now + 121_000);

      const res = await GET(
        getRequest({ artifact: "art-expired", entrySlug: ENTRY_A.entrySlug }),
      );
      expect(res.status).toBe(403);
      expect(cookieJar.has("drts_referral_embed_session")).toBe(false);
    });
  });

  // The GET handler above and this POST `action: "exchange"` handler both
  // resolve to the same consumeReferralEmbedHandoffArtifact() call with the
  // same current*-forwarding guard, but they are two independently reachable
  // entry points (a plain link vs. a JS/form-submitted request), so the
  // cross-entry/cross-subject/invalid rejections need their own production-
  // path coverage here rather than being assumed from the GET cases.
  describe("POST /api/referral/session (exchange, JSON and form)", () => {
    it("rejects a JSON exchange for a different partner entry when the caller's cookie belongs to the same passenger at another entry, leaving that cookie and the new handoff untouched", async () => {
      harness.service = buildService([ENTRY_A, ENTRY_B], {}, handoffRepo);
      await harness.service.onModuleInit();

      await issueHandoff(handoffRepo, {
        artifact: "art-post-exchange-entry-b",
        entrySlug: ENTRY_B.entrySlug,
        entryHost: ENTRY_B.entryHost,
        tenantId: ENTRY_B.tenantId,
        partnerId: ENTRY_B.partnerId,
      });
      const bootstrap = await GET(
        getRequest({
          artifact: "art-post-exchange-entry-b",
          entrySlug: ENTRY_B.entrySlug,
        }),
      );
      expect(bootstrap.status).toBe(307);
      const cookieAfterB = cookieJar.get("drts_referral_embed_session");
      expect(cookieAfterB).toBeTruthy();

      await issueHandoff(handoffRepo, { artifact: "art-post-exchange-entry-a" });
      const req = new Request("https://entry-a.example.com/api/referral/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "exchange",
          artifact: "art-post-exchange-entry-a",
          entrySlug: ENTRY_A.entrySlug,
          entryHost: ENTRY_A.entryHost,
        }),
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      expect(cookieJar.get("drts_referral_embed_session")).toBe(cookieAfterB);

      const rightfulConsume = await handoffRepo.consume({
        artifact: "art-post-exchange-entry-a",
        entrySlug: ENTRY_A.entrySlug,
        entryHost: ENTRY_A.entryHost,
      });
      expect(rightfulConsume.outcome).toBe("consumed");
    });

    it("rejects a form exchange for a different passenger when the caller's cookie belongs to another subject at the same entry, leaving that cookie and the new handoff untouched", async () => {
      harness.service = buildService([ENTRY_A], {}, handoffRepo);
      await harness.service.onModuleInit();

      await issueHandoff(handoffRepo, {
        artifact: "art-post-exchange-subject-2",
        drtsPassengerId: "pass-2",
      });
      const bootstrap = await GET(
        getRequest({
          artifact: "art-post-exchange-subject-2",
          entrySlug: ENTRY_A.entrySlug,
        }),
      );
      expect(bootstrap.status).toBe(307);
      const cookieForPass2 = cookieJar.get("drts_referral_embed_session");
      expect(cookieForPass2).toBeTruthy();

      await issueHandoff(handoffRepo, {
        artifact: "art-post-exchange-subject-1",
        drtsPassengerId: "pass-1",
      });
      const formData = new FormData();
      formData.append("artifact", "art-post-exchange-subject-1");
      formData.append("entrySlug", ENTRY_A.entrySlug);
      formData.append("entryHost", ENTRY_A.entryHost);
      const req = new Request("https://entry-a.example.com/api/referral/session", {
        method: "POST",
        body: formData,
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      expect(cookieJar.get("drts_referral_embed_session")).toBe(cookieForPass2);

      const rightfulConsume = await handoffRepo.consume({
        artifact: "art-post-exchange-subject-1",
        entrySlug: ENTRY_A.entrySlug,
        entryHost: ENTRY_A.entryHost,
      });
      expect(rightfulConsume.outcome).toBe("consumed");
    });

    it("rejects a JSON exchange for a nonexistent artifact without clearing an existing session, and a subsequent legitimate exchange for a different handoff still succeeds", async () => {
      harness.service = buildService([ENTRY_A], {}, handoffRepo);
      await harness.service.onModuleInit();

      await issueHandoff(handoffRepo, { artifact: "art-post-exchange-legit-first" });
      const bootstrap = await GET(
        getRequest({
          artifact: "art-post-exchange-legit-first",
          entrySlug: ENTRY_A.entrySlug,
        }),
      );
      expect(bootstrap.status).toBe(307);
      const cookieBeforeInvalid = cookieJar.get("drts_referral_embed_session");
      expect(cookieBeforeInvalid).toBeTruthy();

      const invalidReq = new Request(
        "https://entry-a.example.com/api/referral/session",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "exchange",
            artifact: "art-does-not-exist",
            entrySlug: ENTRY_A.entrySlug,
            entryHost: ENTRY_A.entryHost,
          }),
        },
      );
      const invalidRes = await POST(invalidReq);
      expect(invalidRes.status).toBe(400);
      expect(cookieJar.get("drts_referral_embed_session")).toBe(cookieBeforeInvalid);

      await issueHandoff(handoffRepo, { artifact: "art-post-exchange-legit-second" });
      const followupReq = new Request(
        "https://entry-a.example.com/api/referral/session",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "exchange",
            artifact: "art-post-exchange-legit-second",
            entrySlug: ENTRY_A.entrySlug,
            entryHost: ENTRY_A.entryHost,
          }),
        },
      );
      const followupRes = await POST(followupReq);
      expect(followupRes.status).toBe(307);
      expect(decodeCookie()?.drtsPassengerId).toBe("pass-1");
    });
  });

  describe("POST /api/referral/session (grant-consent, JSON and form)", () => {
    async function consumeToCookie(
      artifact: string,
      overrides: Partial<Parameters<typeof issueHandoff>[1]> = {},
    ) {
      const handoff = await issueHandoff(handoffRepo, { artifact, ...overrides });
      const res = await GET(
        getRequest({ artifact, entrySlug: overrides.entrySlug ?? ENTRY_A.entrySlug }),
      );
      expect(res.status).toBe(307);
      const cookie = cookieJar.get("drts_referral_embed_session");
      if (!cookie) throw new Error("expected a session cookie after consume");
      return { handoff, cookie };
    }

    it("rejects grant-consent once the real signed cookie has aged past the 8-hour TTL, without invoking consent recording", async () => {
      harness.service = buildService([ENTRY_A], {}, handoffRepo);
      await harness.service.onModuleInit();

      const now = Date.now();
      vi.useFakeTimers();
      vi.setSystemTime(now);
      const { handoff } = await consumeToCookie("art-ttl");
      vi.setSystemTime(now + 8 * 60 * 60 * 1000 + 1000);

      const req = new Request("https://entry-a.example.com/api/referral/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "grant-consent",
          handoffId: handoff.handoffId,
          entrySlug: ENTRY_A.entrySlug,
          entryHost: ENTRY_A.entryHost,
        }),
      });
      const res = await POST(req);
      expect(res.status).toBe(400);

      const ledger = await handoffRepo.findLatestConsent(
        ENTRY_A.entrySlug,
        "pass-1",
      );
      expect(ledger).toBeNull();
    });

    it("rejects grant-consent when the linked identity has been revoked between consume and consent, leaving the pending-consent cookie and the ledger unchanged", async () => {
      const linkStatus: Record<string, "active" | "revoked" | null> = {
        "pass-1": "active",
      };
      harness.service = buildService([ENTRY_A], linkStatus, handoffRepo);
      await harness.service.onModuleInit();

      const { handoff, cookie } = await consumeToCookie("art-revoked");
      const preCookie = decodeCookie();
      expect(preCookie?.identityActive).toBe(false);

      linkStatus["pass-1"] = "revoked";

      const req = new Request("https://entry-a.example.com/api/referral/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "grant-consent",
          handoffId: handoff.handoffId,
          entrySlug: ENTRY_A.entrySlug,
          entryHost: ENTRY_A.entryHost,
        }),
      });
      const res = await POST(req);
      expect(res.status).toBe(400);

      expect(cookieJar.get("drts_referral_embed_session")).toBe(cookie);
      const postCookie = decodeCookie();
      expect(postCookie?.identityActive).toBe(false);
      expect(postCookie?.consent.bundleVersion).toBeNull();

      const ledger = await handoffRepo.findLatestConsent(
        ENTRY_A.entrySlug,
        "pass-1",
      );
      expect(ledger).toBeNull();
    });

    it("rejects grant-consent for a cross-entry entrySlug in the request body even though the cookie and handoffId match", async () => {
      harness.service = buildService([ENTRY_A, ENTRY_B], {}, handoffRepo);
      await harness.service.onModuleInit();

      const { handoff, cookie } = await consumeToCookie("art-cross-entry-consent");

      const req = new Request("https://entry-a.example.com/api/referral/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "grant-consent",
          handoffId: handoff.handoffId,
          entrySlug: ENTRY_B.entrySlug,
          entryHost: ENTRY_B.entryHost,
        }),
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      expect(cookieJar.get("drts_referral_embed_session")).toBe(cookie);

      const ledgerA = await handoffRepo.findLatestConsent(
        ENTRY_A.entrySlug,
        "pass-1",
      );
      const ledgerB = await handoffRepo.findLatestConsent(
        ENTRY_B.entrySlug,
        "pass-1",
      );
      expect(ledgerA).toBeNull();
      expect(ledgerB).toBeNull();
    });

    it("grants consent via the real service (form submit) when the cookie, handoffId, and entrySlug all match, and treats a resubmission as an idempotent replay", async () => {
      harness.service = buildService([ENTRY_A], {}, handoffRepo);
      await harness.service.onModuleInit();

      const { handoff } = await consumeToCookie("art-form-consent");

      const buildForm = () => {
        const formData = new FormData();
        formData.append("action", "grant-consent");
        formData.append("handoffId", handoff.handoffId);
        formData.append("entrySlug", ENTRY_A.entrySlug);
        formData.append("entryHost", ENTRY_A.entryHost);
        return formData;
      };

      const firstReq = new Request("https://entry-a.example.com/api/referral/session", {
        method: "POST",
        body: buildForm(),
      });
      const firstRes = await POST(firstReq);
      expect(firstRes.status).toBe(307);
      const cookieAfterGrant = cookieJar.get("drts_referral_embed_session");
      expect(cookieAfterGrant).toBeTruthy();
      expect(decodeCookie()?.identityActive).toBe(true);

      const ledgerAfterFirst = await handoffRepo.findLatestConsent(
        ENTRY_A.entrySlug,
        "pass-1",
      );
      expect(ledgerAfterFirst).not.toBeNull();

      const secondReq = new Request("https://entry-a.example.com/api/referral/session", {
        method: "POST",
        body: buildForm(),
      });
      const secondRes = await POST(secondReq);
      expect(secondRes.status).toBe(307);

      const ledgerAfterSecond = await handoffRepo.findLatestConsent(
        ENTRY_A.entrySlug,
        "pass-1",
      );
      expect(ledgerAfterSecond?.consentId).toBe(ledgerAfterFirst?.consentId);
    });
  });
});
