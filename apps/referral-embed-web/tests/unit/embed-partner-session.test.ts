import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

import { cookies } from "next/headers";
import {
  getReferralEmbedSession,
  writeReferralEmbedSession,
} from "../../lib/embed-partner-session";

describe("embed-partner-session", () => {
  beforeEach(() => {
    process.env.REFERRAL_EMBED_SESSION_SECRET = "test-secret";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects cookies older than 8 hours", async () => {
    let storedCookie = "";
    vi.mocked(cookies).mockReturnValue({
      set: (name: string, value: string) => {
        storedCookie = value;
      },
      get: () => ({ value: storedCookie }),
    } as any);

    // Mock Date.now to issue a cookie
    const now = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(now);

    await writeReferralEmbedSession({
      identityActive: true,
      partnerEntrySlug: "yuhe",
      drtsPassengerId: "pax1",
      handoffId: "test",
      entryHost: "test.com",
      consent: {} as any,
      identity: {} as any,
    });

    // Advance by 8 hours - 1 second
    vi.setSystemTime(now + 8 * 60 * 60 * 1000 - 1000);
    let session = await getReferralEmbedSession();
    expect(session).not.toBeNull();
    expect(session?.drtsPassengerId).toBe("pax1");

    // Advance past 8 hours
    vi.setSystemTime(now + 8 * 60 * 60 * 1000 + 1000);
    session = await getReferralEmbedSession();
    expect(session).toBeNull();

    vi.useRealTimers();
  });
});
