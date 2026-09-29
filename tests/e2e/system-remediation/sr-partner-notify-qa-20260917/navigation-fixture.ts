import { expect, type BrowserContext, type Page } from "@playwright/test";
import type {
  ReferralEmbedHandoffArtifact,
  ReferralEmbedSession,
} from "@drts/contracts";
import type { PartnerFixture, PartnerFixtureEntry } from "./partner-fixture";

// Next's production session cookie remains Secure. The browser and Playwright
// permit Secure cookies on localhost, not arbitrary HTTP IP origins.
export const EMBED_ORIGIN = "http://localhost:3002";
const COOKIE = "drts_referral_embed_session";
export type ConsumePath = "navigation" | "json" | "form";
export interface Navigation {
  handoff: ReferralEmbedHandoffArtifact;
  destination: string;
  entry: PartnerFixtureEntry;
  orderId: string;
}

/** Real BFF/cookie/browser boundary. Use only in the trace-disabled NAV group:
 * temporary handoffs and HttpOnly cookies must not enter uploaded traces. */
export class NavigationFixture {
  constructor(private readonly partner: PartnerFixture) {}

  async issue(
    entry: PartnerFixtureEntry,
    orderId: string,
  ): Promise<Navigation> {
    const resolved = await this.partner.resolveNavigation(entry, orderId);
    expect(resolved.status).toBe(201);
    const { handoffArtifact: handoff, destinationUrl } = resolved.envelope.data;
    expect(handoff.tokenType).toBe("SingleUse");
    expect(handoff.expiresIn).toBe("120s");
    const url = new URL(destinationUrl);
    expect(url.origin).toBe(EMBED_ORIGIN);
    expect(url.pathname).toBe("/api/referral/notification-navigation");
    expect(url.searchParams.get("artifact") === handoff.artifact).toBe(true);
    const nav = { handoff, destination: destinationUrl, entry, orderId };
    expect((await this.persisted(nav)).consumed_at).toBeNull();
    return nav;
  }

  async persisted(nav: Navigation) {
    const rows = (
      await this.partner.db.query(
        `SELECT handoff_id, entry_slug, drts_passenger_id, consumed_at, issued_at, expires_at
       FROM admin.phase1_referral_embed_handoffs WHERE handoff_id=$1`,
        [nav.handoff.handoffId],
      )
    ).rows;
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(
      new Date(row.expires_at).getTime() - new Date(row.issued_at).getTime(),
    ).toBe(120_000);
    return row;
  }

  async consume(
    context: BrowserContext,
    nav: Navigation,
    via: ConsumePath,
    returnTo = "/",
  ) {
    if (via === "navigation") {
      return context.request.get(nav.destination, { maxRedirects: 0 });
    }
    const command = {
      action: "exchange",
      artifact: nav.handoff.artifact,
      entrySlug: nav.entry.entry.entrySlug,
      entryHost: nav.entry.entry.entryHost!,
      returnTo,
    };
    return context.request.post(`${EMBED_ORIGIN}/api/referral/session`, {
      ...(via === "json" ? { data: command } : { form: command }),
      maxRedirects: 0,
    });
  }

  async activate(context: BrowserContext, nav: Navigation) {
    await this.cookie(context);
    const response = await context.request.post(
      `${EMBED_ORIGIN}/api/referral/session`,
      {
        data: {
          action: "grant-consent",
          handoffId: nav.handoff.handoffId,
          entrySlug: nav.entry.entry.entrySlug,
          entryHost: nav.entry.entry.entryHost,
        },
      },
    );
    const envelope = await response.json();
    expect(response.status(), envelope.message ?? "BFF consent grant").toBe(
      200,
    );
    expect(envelope.ok).toBe(true);
    const session = envelope.session as ReferralEmbedSession;
    expect(session.identityActive).toBe(true);
    expect(session.drtsPassengerId).toBe(nav.handoff.drtsPassengerId);
    expect(session.navigationContext).toEqual({
      orderId: nav.orderId,
      screen: "trip",
    });
    return session;
  }

  async establish(context: BrowserContext, nav: Navigation) {
    const response = await this.consume(context, nav, "json");
    expect(response.status()).toBe(200);
    expect((await response.json()).ok).toBe(true);
    await this.activate(context, nav);
  }

  async cookie(context: BrowserContext) {
    const cookie = (await context.cookies(EMBED_ORIGIN)).find(
      (c) => c.name === COOKIE,
    );
    expect(Boolean(cookie)).toBe(true);
    // Assert attributes without exposing the credential on assertion failure.
    expect(cookie!.httpOnly).toBe(true);
    expect(cookie!.sameSite).toBe("Lax");
    expect(cookie!.path).toBe("/");
    return cookie!;
  }

  async active(context: BrowserContext) {
    const response = await context.request.get(
      `${EMBED_ORIGIN}/api/referral/active`,
    );
    expect(response.status()).toBe(200);
    const envelope = await response.json();
    expect(envelope.ok).toBe(true);
    return envelope.data;
  }

  async land(page: Page, nav: Navigation) {
    // Real browser follows the single-use link and receives the BFF cookie.
    // Do not retain a failing goto error containing a live artifact URL.
    let response;
    try {
      response = await page.goto(nav.destination);
    } catch {
      throw new Error("Browser handoff navigation did not complete");
    }
    expect(response?.status()).toBe(200);
    const url = new URL(page.url());
    expect(url.pathname).toBe(`/embed/${nav.entry.entry.entrySlug}`);
    expect(url.searchParams.get("artifact")).toBeNull();
    expect(url.searchParams.get("orderId")).toBe(nav.orderId);
    expect(url.searchParams.get("screen")).toBe("trip");
    await this.activate(page.context(), nav);
    await page.reload();
    expect((await this.active(page.context())).trip.orderId).toBe(nav.orderId);
    await expect(page.getByText(nav.orderId, { exact: false })).toBeVisible();
    return this.cookie(page.context());
  }
}
