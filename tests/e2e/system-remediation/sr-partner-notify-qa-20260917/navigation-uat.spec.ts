import { test, expect } from "@playwright/test";
import { PartnerFixture } from "./partner-fixture";
import {
  EMBED_ORIGIN,
  NavigationFixture,
  type ConsumePath,
} from "./navigation-fixture";

// Keep handoffs and real cookies out of uploaded artifacts. Browser assertions,
// screenshots, and redacted HTTP/PG evidence remain mandatory.
test.use({ trace: "off" });

test.describe("Hosted navigation and session boundaries", () => {
  let fixture: PartnerFixture;
  test.beforeAll(async () => {
    test.setTimeout(90_000);
    fixture = new PartnerFixture();
    await fixture.start();
  });
  test.afterAll(async () => {
    await fixture?.close();
  });
  // Handoffs and cookies are credentials. Keep the real browser, screenshots,
  // and redacted HTTP/PG evidence; never upload their raw network traces.
  const paths: ConsumePath[] = ["navigation", "json", "form"];

  test("C221 NAV: Resolve issues fresh single-use handoff and HttpOnly session to the latest ride", async ({
    page,
  }) => {
    const entry = fixture.entries[0]!;
    const orderId = await fixture.createRide(entry);
    const navFixture = new NavigationFixture(fixture);
    const nav = await navFixture.issue(entry, orderId);
    const cookie = await navFixture.land(page, nav);
    expect(
      await page.evaluate(() =>
        document.cookie.includes("drts_referral_embed_session"),
      ),
    ).toBe(false);
    expect((await navFixture.persisted(nav)).consumed_at).not.toBeNull();
    const fresh = await navFixture.issue(entry, orderId);
    expect(fresh.handoff.handoffId).not.toBe(nav.handoff.handoffId);
    expect(fresh.handoff.artifact !== nav.handoff.artifact).toBe(true);
    expect(
      (await navFixture.consume(page.context(), nav, "navigation")).status(),
    ).toBe(403);
    expect(
      (await navFixture.cookie(page.context())).value === cookie.value,
    ).toBe(true);
    expect((await navFixture.active(page.context())).trip.orderId).toBe(
      orderId,
    );
    await test.info().attach("navigation-current-ride", {
      contentType: "image/png",
      body: await page.screenshot(),
    });
    const cancelResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/referral/cancel/${orderId}`) &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: /^取消行程/ }).click();
    expect((await cancelResponse).status()).toBe(200);
    await expect
      .poll(
        async () =>
          (
            await fixture.db.query(
              "SELECT status FROM ops.phase1_owned_orders WHERE order_id=$1",
              [orderId],
            )
          ).rows[0]?.status,
      )
      .toBe("cancelled");
    await expect(page.getByText("行程已取消", { exact: true })).toBeVisible();
    // A handoff issued before cancellation still points at the old trip screen.
    // The page must read current authority rather than resurrect the old ride.
    const staleLink = await navFixture.consume(
      page.context(),
      fresh,
      "navigation",
    );
    expect(staleLink.status()).toBe(307);
    await page.goto(staleLink.headers().location!);
    await expect(
      page.getByText("行程已結束或更新", { exact: true }),
    ).toBeVisible();
    const current = await navFixture.issue(entry, orderId);
    const currentLink = await navFixture.consume(
      page.context(),
      current,
      "navigation",
    );
    expect(currentLink.status()).toBe(307);
    expect(
      new URL(currentLink.headers().location!).searchParams.get("screen"),
    ).toBe("cancelled");
    await page.goto(currentLink.headers().location!);
    await expect(page.getByText("行程已取消", { exact: true })).toBeVisible();
    await test.info().attach("navigation-latest-cancelled-ride", {
      contentType: "image/png",
      body: await page.screenshot(),
    });
    await test.info().attach("navigation-session-evidence", {
      contentType: "application/json",
      body: JSON.stringify({
        candidate_sha: process.env.CANDIDATE_SHA,
        orderId,
        handoff: await navFixture.persisted(nav),
        freshHandoff: await navFixture.persisted(fresh),
        cookieAttributes: {
          httpOnly: cookie.httpOnly,
          secure: cookie.secure,
          sameSite: cookie.sameSite,
        },
        replayStatus: 403,
        latestState:
          "cancelled; pre-cancel handoff renders updated state; fresh resolve selects cancelled screen",
        boundary:
          "real hosted browser/BFF/session/PG; partner login is controlled, native launch not executed",
      }),
    });
  });

  test("C222 NAV: Wrong entry and subject cannot resolve or read a ride", async ({
    page,
  }) => {
    const navFixture = new NavigationFixture(fixture);
    const entry = fixture.entries[0]!;
    const orderId = await fixture.createRide(entry);
    const own = await navFixture.issue(entry, orderId);
    await navFixture.establish(page.context(), own);
    expect((await navFixture.active(page.context())).trip.orderId).toBe(
      orderId,
    );
    const ownHistory = await page
      .context()
      .request.get(`${EMBED_ORIGIN}/api/referral/history/${orderId}`);
    expect(ownHistory.status()).toBe(200);
    expect(await ownHistory.json()).toMatchObject({
      ok: true,
      data: { orderId },
    });
    const foreign = fixture.entries[1]!;
    const foreignOrder = await fixture.createRide(foreign);
    const statuses: number[] = [];
    for (const [actor, ride, subject, key] of [
      [foreign, orderId, foreign.partnerUserRef, foreign.apiKey],
      [entry, orderId, `${entry.partnerUserRef}-wrong`, entry.apiKey],
      [entry, orderId, entry.partnerUserRef, foreign.apiKey],
      [
        fixture.entries[2]!,
        orderId,
        fixture.entries[2]!.partnerUserRef,
        fixture.entries[2]!.apiKey,
      ],
    ] as const) {
      const refused = await fixture.resolveNavigation(
        actor,
        ride,
        subject,
        key,
      );
      statuses.push(refused.status);
      expect(refused.envelope.error?.code).toBe("FORBIDDEN");
    }
    expect(statuses).toEqual([403, 403, 403, 403]);
    const foreignNav = await navFixture.issue(foreign, foreignOrder);
    const priorCookie = await navFixture.cookie(page.context());
    const consumes = [];
    for (const via of paths)
      consumes.push(
        (await navFixture.consume(page.context(), foreignNav, via)).status(),
      );
    expect(consumes).toEqual([403, 400, 400]);
    expect(
      (await navFixture.cookie(page.context())).value === priorCookie.value,
    ).toBe(true);
    expect((await navFixture.persisted(foreignNav)).consumed_at).toBeNull();
    const foreignPage = await page.goto(
      `${EMBED_ORIGIN}/embed/${foreign.entry.entrySlug}?screen=trip&orderId=${foreignOrder}`,
    );
    expect(foreignPage?.status()).toBe(403);
    // Both read surfaces must refuse a foreign order, rather than fabricating
    // an authorized-looking status for a supplied order ID.
    const reads = [];
    for (const surface of ["receipt", "history"]) {
      const response = await page
        .context()
        .request.get(`${EMBED_ORIGIN}/api/referral/${surface}/${foreignOrder}`);
      const body = await response.json();
      reads.push({
        surface,
        status: response.status(),
        ok: body.ok,
        returnedOrder: body.data?.orderId ?? null,
      });
    }
    // FIX-HISTORY deliberately returns 404 when the authenticated history
    // list contains no matching order; missing sessions still return 400.
    const unknownHistory = await page
      .context()
      .request.get(`${EMBED_ORIGIN}/api/referral/history/${orderId}-unknown`);
    expect(unknownHistory.status()).toBe(404);
    expect(await unknownHistory.json()).toMatchObject({ ok: false });
    await page.context().clearCookies();
    const unauthenticatedHistory = await page
      .context()
      .request.get(`${EMBED_ORIGIN}/api/referral/history/${orderId}`);
    expect(unauthenticatedHistory.status()).toBe(400);
    expect(await unauthenticatedHistory.json()).toMatchObject({ ok: false });
    await test.info().attach("navigation-cross-scope", {
      contentType: "application/json",
      body: JSON.stringify({
        candidate_sha: process.env.CANDIDATE_SHA,
        orderId,
        foreignOrder,
        statuses,
        consumes,
        reads,
        ownHistoryStatus: ownHistory.status(),
        unknownHistoryStatus: unknownHistory.status(),
        unauthenticatedHistoryStatus: unauthenticatedHistory.status(),
      }),
    });
    expect(reads).toEqual([
      { surface: "receipt", status: 400, ok: false, returnedOrder: null },
      { surface: "history", status: 404, ok: false, returnedOrder: null },
    ]);
  });

  test("C223 NAV: Logout and account switch invalidate the previous ride session", async ({
    page,
  }) => {
    const navFixture = new NavigationFixture(fixture);
    const entry = fixture.entries[0]!;
    const alternate = {
      ...entry,
      partnerUserRef: `${entry.partnerUserRef}-account-switch`,
    };
    const orderId = await fixture.createRide(entry);
    const otherOrderId = await fixture.createRide(alternate);
    const first = await navFixture.issue(entry, orderId);
    await navFixture.establish(page.context(), first);
    const stale = await navFixture.issue(entry, orderId);
    const other = await navFixture.issue(alternate, otherOrderId);
    for (const via of paths) {
      expect(
        (await navFixture.consume(page.context(), other, via)).status(),
      ).toBe(via === "navigation" ? 403 : 400);
    }
    expect((await navFixture.active(page.context())).trip.orderId).toBe(
      orderId,
    );
    expect((await navFixture.persisted(other)).consumed_at).toBeNull();
    // External boundary: a partner logout discards its WebView cookie jar.
    // This is not a claim of native logout integration or server-side cookie revocation.
    await page.context().clearCookies();
    expect(
      (
        await page.context().request.get(`${EMBED_ORIGIN}/api/referral/active`)
      ).status(),
    ).toBe(400);
    expect(
      (await navFixture.consume(page.context(), first, "navigation")).status(),
    ).toBe(403);
    expect(
      (await page.context().cookies(EMBED_ORIGIN)).some(
        (c) => c.name === "drts_referral_embed_session",
      ),
    ).toBe(false);
    await navFixture.land(page, other);
    const switched = await navFixture.cookie(page.context());
    for (const via of paths) {
      expect(
        (await navFixture.consume(page.context(), stale, via)).status(),
      ).toBe(via === "navigation" ? 403 : 400);
    }
    expect(
      (await navFixture.cookie(page.context())).value === switched.value,
    ).toBe(true);
    expect((await navFixture.persisted(stale)).consumed_at).toBeNull();
    expect((await navFixture.active(page.context())).trip.orderId).toBe(
      otherOrderId,
    );
    await test.info().attach("account-switch-current-ride", {
      contentType: "image/png",
      body: await page.screenshot(),
    });
    await test.info().attach("account-switch-boundary", {
      contentType: "application/json",
      body: JSON.stringify({
        candidate_sha: process.env.CANDIDATE_SHA,
        orderId,
        otherOrderId,
        boundary:
          "partner logout modeled by discarding real browser cookies; real BFF refuses consumed handoff and wrong current subject on all three paths; native lifecycle/server cookie revocation not verified",
      }),
    });
  });

  test("C224 NAV: ReturnTo and every handoff consumption path reject replay", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    // The real consumer uses OPEN_ROUTE_RATE_LIMIT (30 requests/minute).
    // Earlier negative cases share its caller bucket. Start a new natural
    // window before issuing these 120-second handoffs; keep every refusal
    // assertion strict so throttling can never count as replay protection.
    await new Promise((resolve) => setTimeout(resolve, 61_000));
    const navFixture = new NavigationFixture(fixture);
    const entry = fixture.entries[0]!;
    const orderId = await fixture.createRide(entry);
    const rows = [];
    for (const via of paths) {
      await page.context().clearCookies();
      const nav = await navFixture.issue(entry, orderId);
      const response = await navFixture.consume(
        page.context(),
        nav,
        via,
        "//untrusted.invalid/stolen",
      );
      expect(response.status()).toBe(via === "json" ? 200 : 307);
      if (via !== "json") {
        const destination = new URL(response.headers().location!);
        expect(destination.origin).toBe(EMBED_ORIGIN);
        if (via === "form") expect(destination.pathname).toBe("/");
      }
      expect((await navFixture.persisted(nav)).consumed_at).not.toBeNull();
      const statuses = [];
      for (const replay of paths)
        statuses.push(
          (await navFixture.consume(page.context(), nav, replay)).status(),
        );
      expect(statuses).toEqual([403, 400, 400]);
      // The protected API consumer is independently reachable; it must share
      // the durable replay ledger used by both BFF handlers.
      const direct = await fetch(
        `${process.env.DRTS_UAT_API_URL}/api/partner/ingress/referral-embed-handoff/consume`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-drts-referral-handoff-key":
              process.env.DRTS_REFERRAL_EMBED_HANDOFF_KEY!,
          },
          body: JSON.stringify({
            artifact: nav.handoff.artifact,
            entrySlug: entry.entry.entrySlug,
            entryHost: entry.entry.entryHost,
          }),
        },
      );
      expect(direct.status).toBe(409);
      rows.push({
        via,
        handoffId: nav.handoff.handoffId,
        statuses,
        directStatus: direct.status,
      });
    }
    const safe = await navFixture.issue(entry, orderId);
    const returnTo = `/embed/${entry.entry.entrySlug}?screen=trip&orderId=${orderId}`;
    const form = await navFixture.consume(
      page.context(),
      safe,
      "form",
      returnTo,
    );
    expect(form.status()).toBe(307);
    expect(form.headers().location).toBe(`${EMBED_ORIGIN}${returnTo}`);
    await navFixture.activate(page.context(), safe);
    await page.goto(form.headers().location!);
    await expect(page.getByText(orderId, { exact: false })).toBeVisible();
    const expired = await navFixture.issue(entry, orderId);
    await page.context().clearCookies();
    await new Promise((resolve) =>
      setTimeout(
        resolve,
        Math.max(0, Date.parse(expired.handoff.expiresAt) - Date.now()) + 1_000,
      ),
    );
    for (const via of paths)
      expect(
        (await navFixture.consume(page.context(), expired, via)).status(),
      ).toBe(via === "navigation" ? 403 : 400);
    expect((await navFixture.persisted(expired)).consumed_at).toBeNull();
    await test.info().attach("handoff-consumption-matrix", {
      contentType: "application/json",
      body: JSON.stringify({
        candidate_sha: process.env.CANDIDATE_SHA,
        orderId,
        rows,
        pacing: "natural61s before issuance; production rate limits unchanged",
        expiry: "natural120s",
        returnTo: "same origin preserved; external origin refused",
      }),
    });
  });
});
