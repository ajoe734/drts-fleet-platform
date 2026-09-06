import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveStandaloneFallbackEntry } from "../../../../apps/referral-embed-web/lib/embed-fallback-entry";

// SR-REFERRAL-001 (R07 / C021): the referral embed's fallback screen used to
// "recover" by linking back into the same /embed/<entrySlug> route via
// buildHref(context, { state: "fallback" }) — never actually leaving the
// embed host. A resident whose handoff failed would click "前往獨立叫車網站"
// and land right back on the same blocked embed, sometimes tripping the
// entry-host allowlist into a 403. resolveStandaloneFallbackEntry() is the
// fix: it only ever returns a destination that (a) is a real configured
// absolute URL and (b) resolves to a different host than the embed itself,
// so the loop this finding describes cannot recur.
describe("SR-REFERRAL-001: referral embed fallback entry resolution", () => {
  const ORIGINAL_ENV = process.env.REFERRAL_EMBED_STANDALONE_URL;

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) {
      delete process.env.REFERRAL_EMBED_STANDALONE_URL;
    } else {
      process.env.REFERRAL_EMBED_STANDALONE_URL = ORIGINAL_ENV;
    }
    vi.unstubAllEnvs();
  });

  it("returns null (no fake fallback) when no standalone URL is configured", () => {
    delete process.env.REFERRAL_EMBED_STANDALONE_URL;

    const entry = resolveStandaloneFallbackEntry({
      entrySlug: "yuhe-residence",
      entryHost: "app.yuhe-living.com.tw",
      currentHost: "refer.smarttransport.tw",
    });

    expect(entry).toBeNull();
  });

  it("returns a real external destination with source attribution when configured on a different host", () => {
    process.env.REFERRAL_EMBED_STANDALONE_URL = "https://ride.drts.com.tw/book";

    const entry = resolveStandaloneFallbackEntry({
      entrySlug: "yuhe-residence",
      entryHost: "app.yuhe-living.com.tw",
      currentHost: "refer.smarttransport.tw",
    });

    expect(entry).not.toBeNull();
    expect(entry?.hostLabel).toBe("ride.drts.com.tw");

    const url = new URL(entry!.url);
    expect(url.host).toBe("ride.drts.com.tw");
    expect(url.pathname).toBe("/book");
    expect(url.searchParams.get("ref_source")).toBe("referral_embed_fallback");
    expect(url.searchParams.get("ref_entry_slug")).toBe("yuhe-residence");
    expect(url.searchParams.get("ref_entry_host")).toBe(
      "app.yuhe-living.com.tw",
    );
  });

  it("refuses a same-host configuration so it cannot recreate the fallback -> embed -> blocked loop", () => {
    process.env.REFERRAL_EMBED_STANDALONE_URL =
      "https://refer.smarttransport.tw/embed/yuhe-residence?state=fallback";

    const entry = resolveStandaloneFallbackEntry({
      entrySlug: "yuhe-residence",
      entryHost: "app.yuhe-living.com.tw",
      currentHost: "refer.smarttransport.tw",
    });

    expect(entry).toBeNull();
  });

  it("is case-insensitive when comparing the configured host against the current host", () => {
    process.env.REFERRAL_EMBED_STANDALONE_URL = "https://REFER.smarttransport.tw/embed/x";

    const entry = resolveStandaloneFallbackEntry({
      entrySlug: "yuhe-residence",
      entryHost: null,
      currentHost: "refer.smarttransport.tw",
    });

    expect(entry).toBeNull();
  });

  it("rejects non-http(s) schemes", () => {
    process.env.REFERRAL_EMBED_STANDALONE_URL = "javascript:alert(1)";

    const entry = resolveStandaloneFallbackEntry({
      entrySlug: "yuhe-residence",
      entryHost: null,
      currentHost: "refer.smarttransport.tw",
    });

    expect(entry).toBeNull();
  });

  it("rejects an unparseable configured value instead of throwing", () => {
    process.env.REFERRAL_EMBED_STANDALONE_URL = "not a url";

    expect(() =>
      resolveStandaloneFallbackEntry({
        entrySlug: "yuhe-residence",
        entryHost: null,
        currentHost: "refer.smarttransport.tw",
      }),
    ).not.toThrow();

    const entry = resolveStandaloneFallbackEntry({
      entrySlug: "yuhe-residence",
      entryHost: null,
      currentHost: "refer.smarttransport.tw",
    });
    expect(entry).toBeNull();
  });

  it("omits ref_entry_host when no entry host is known", () => {
    process.env.REFERRAL_EMBED_STANDALONE_URL = "https://ride.drts.com.tw/book";

    const entry = resolveStandaloneFallbackEntry({
      entrySlug: "yuhe-residence",
      entryHost: null,
      currentHost: "refer.smarttransport.tw",
    });

    expect(entry).not.toBeNull();
    const url = new URL(entry!.url);
    expect(url.searchParams.has("ref_entry_host")).toBe(false);
  });
});
