export type FallbackEntry = {
  url: string;
  hostLabel: string;
};

const STANDALONE_FALLBACK_URL_ENV = "REFERRAL_EMBED_STANDALONE_URL";

// The fallback screen only makes sense if it can actually leave this host — a
// destination that resolves back to the current embed host would recreate the
// same dead loop (fallback -> embed -> blocked -> fallback) it exists to fix.
export function resolveStandaloneFallbackEntry(input: {
  entrySlug: string;
  entryHost: string | null;
  currentHost: string;
}): FallbackEntry | null {
  const raw = process.env[STANDALONE_FALLBACK_URL_ENV]?.trim();
  if (!raw) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return null;
  }

  if (parsed.host.toLowerCase() === input.currentHost.toLowerCase()) {
    return null;
  }

  parsed.searchParams.set("ref_source", "referral_embed_fallback");
  parsed.searchParams.set("ref_entry_slug", input.entrySlug);
  if (input.entryHost) {
    parsed.searchParams.set("ref_entry_host", input.entryHost);
  }

  return { url: parsed.toString(), hostLabel: parsed.host };
}
