import { describe, expect, it } from "vitest";
import { loginReturnPath } from "../../lib/login-return-path";
import { translations } from "../../lib/translations";

describe("fleet /login", () => {
  it.each([
    ["/supply/submissions?status=draft", "/supply/submissions?status=draft"],
    ["/", "/"],
    [undefined, "/"],
    ["", "/"],
    ["//evil.example.test/x", "/"],
    ["https://evil.example.test/", "/"],
    ["/\\evil.example.test", "/"],
    ["supply", "/"],
  ])("returns %j as %j", (raw, expected) => {
    expect(loginReturnPath(raw)).toBe(expected);
  });

  it("has every sign-in string in both languages", () => {
    const keys = [
      "login.title",
      "login.subtitle",
      "login.google",
      "login.error.title",
      "login.securityNote",
    ];
    for (const locale of ["zh", "en"] as const) {
      for (const key of keys) expect(translations[locale][key]).toBeTruthy();
    }
    expect(translations.zh["login.google"]).toBe("使用 Google 登入");
  });
});
