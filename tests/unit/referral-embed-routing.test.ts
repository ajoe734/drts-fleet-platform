import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getPartnerEntry,
  isPublicPartnerEntryNotFoundError,
  type EmbedAuthorityError,
} from "../../apps/referral-embed-web/lib/embed-api";

function buildAuthorityError(
  status: number,
  code: string,
): EmbedAuthorityError {
  return Object.assign(new Error(code), {
    name: "EmbedAuthorityError",
    status,
    code,
    details: undefined,
    retryable: status >= 500,
  });
}

describe("referral embed route error classification", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    "PARTNER_ENTRY_NOT_FOUND",
    "PARTNER_ENTRY_REVOKED",
    "PARTNER_ENTRY_INACTIVE",
  ])("keeps authority-confirmed %s responses as route 404s", (code) => {
    expect(
      isPublicPartnerEntryNotFoundError(buildAuthorityError(404, code)),
    ).toBe(true);
  });

  it("does not disguise gateway or authority failures as missing entries", () => {
    expect(
      isPublicPartnerEntryNotFoundError(
        buildAuthorityError(404, "EMBED_AUTHORITY_REQUEST_FAILED"),
      ),
    ).toBe(false);
    expect(
      isPublicPartnerEntryNotFoundError(
        buildAuthorityError(503, "EMBED_AUTHORITY_UNAVAILABLE"),
      ),
    ).toBe(false);
    expect(isPublicPartnerEntryNotFoundError(new Error("socket closed"))).toBe(
      false,
    );
  });

  it("preserves a genuine partner-entry 404 from the authority envelope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: {
                code: "PARTNER_ENTRY_NOT_FOUND",
                message: "The partner entry could not be found.",
                retryable: false,
              },
            }),
            {
              status: 404,
              headers: { "Content-Type": "application/json" },
            },
          ),
      ),
    );

    await expect(getPartnerEntry("missing-entry")).rejects.toMatchObject({
      status: 404,
      code: "PARTNER_ENTRY_NOT_FOUND",
      retryable: false,
    });
  });

  it("turns authority transport failures into retryable upstream errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("connection refused");
      }),
    );

    await expect(getPartnerEntry("configured-entry")).rejects.toMatchObject({
      status: 503,
      code: "EMBED_AUTHORITY_UNAVAILABLE",
      retryable: true,
    });
  });
});

describe("referral embed static response headers", () => {
  it("does not reintroduce a global X-Frame-Options DENY after middleware", () => {
    const nextConfigSource = readFileSync(
      new URL("../../apps/referral-embed-web/next.config.ts", import.meta.url),
      "utf8",
    );

    expect(nextConfigSource).not.toContain('key: "X-Frame-Options"');
    expect(nextConfigSource).toContain('key: "Referrer-Policy"');
    expect(nextConfigSource).toContain('key: "X-Content-Type-Options"');
  });
});
