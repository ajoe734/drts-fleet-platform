import { ResponseCookies } from "next/dist/compiled/@edge-runtime/cookies";
import { describe, expect, it, vi } from "vitest";
import { adoptReferralSession } from "../../e2e/owned-referral-business-journey/protocol";

const target = "https://referral.example.test";
const metadata = "drts_referral_embed_session";
const bearer = "drts_referral_embed_bearer";
function serverHeaders() {
  const headers = new Headers();
  const jar = new ResponseCookies(headers);
  jar.set(metadata, "synthetic-metadata", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60,
    path: "/",
  });
  return { headers, jar };
}
function port() {
  return {
    clearCookies: vi.fn(async () => undefined),
    addCookies: vi.fn(async () => undefined),
  };
}

describe("actual server cookie issuance wire", () => {
  it("accepts Next's real pending bearer deletion via Expires without Max-Age", async () => {
    const { headers, jar } = serverHeaders();
    jar.delete(bearer);
    const context = port();
    const deletion = headers
      .getSetCookie()
      .find((x) => x.startsWith(`${bearer}=`));
    expect(deletion).toContain("Expires=Thu, 01 Jan 1970");
    expect(deletion).not.toContain("Max-Age");
    await adoptReferralSession(context, headers, target);
    expect(context.clearCookies).toHaveBeenCalledExactlyOnceWith({
      name: bearer,
      domain: "referral.example.test",
    });
    expect(context.addCookies).toHaveBeenCalledTimes(1);
  });
  it("adopts both live HttpOnly Secure cookies with the actual lifetime", async () => {
    const { headers, jar } = serverHeaders();
    jar.set(bearer, "synthetic-bearer", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 60,
      path: "/",
    });
    const context = port();
    await adoptReferralSession(context, headers, target);
    expect(context.addCookies.mock.calls).toHaveLength(2);
    expect(context.clearCookies).not.toHaveBeenCalled();
  });
  it("accepts an explicit zero Max-Age deletion and rejects ambiguous or future empty values", async () => {
    const { headers } = serverHeaders();
    headers.append("Set-Cookie", `${bearer}=; Max-Age=0; Path=/`);
    const context = port();
    await adoptReferralSession(context, headers, target);
    expect(context.clearCookies).toHaveBeenCalledTimes(1);
    for (const suffix of [
      "",
      "; Expires=Thu, 01 Jan 2099 00:00:00 GMT",
      "; Max-Age=60; Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    ]) {
      const h = serverHeaders().headers;
      h.append("Set-Cookie", `${bearer}=${suffix}`);
      await expect(adoptReferralSession(port(), h, target)).rejects.toThrow(
        "only explicit pending-bearer deletion",
      );
    }
  });
  it("rejects metadata deletion and missing metadata ACK", async () => {
    const h = new Headers();
    h.append("Set-Cookie", `${metadata}=; Max-Age=0`);
    await expect(adoptReferralSession(port(), h, target)).rejects.toThrow(
      "only explicit pending-bearer deletion",
    );
    await expect(
      adoptReferralSession(port(), new Headers(), target),
    ).rejects.toThrow("cookie issuance ACK");
  });
  it("preserves the actual active cookie security and host boundaries", async () => {
    for (const flags of [
      "Secure; SameSite=Lax",
      "HttpOnly; SameSite=Lax",
      "HttpOnly; Secure; SameSite=None",
      "HttpOnly; Secure; SameSite=Lax; Domain=foreign.test",
      "HttpOnly; Secure; SameSite=Lax; Max-Age=-1",
    ]) {
      const { headers } = serverHeaders();
      headers.append("Set-Cookie", `${bearer}=synthetic; ${flags}`);
      await expect(
        adoptReferralSession(port(), headers, target),
      ).rejects.toThrow();
    }
  });
});
