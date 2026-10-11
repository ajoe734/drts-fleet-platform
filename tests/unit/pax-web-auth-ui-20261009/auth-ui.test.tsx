// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import React from "react";
import LoginPage from "../../../apps/passenger-app-web/app/login/page";
import AccountPage from "../../../apps/passenger-app-web/app/account/page";

describe("Auth UI - Extended", () => {
  let fetchMock: any;

  beforeEach(() => {
    fetchMock = vi.fn().mockImplementation((url, options) => {
      const opts = options || {};
      const method = opts.method || "GET";
      const body = opts.body ? JSON.parse(opts.body) : undefined;

      if (url.includes("/api/passenger-app/auth/providers")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: {
              providers: ["phone", "email", "google", "facebook", "line"],
            },
          }),
        });
      }
      if (url.includes("/api/passenger-app/auth/otp/request")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: { success: true, challenge: "chal-123" },
          }),
        });
      }
      if (url.includes("/api/passenger-app/auth/otp/verify")) {
        if (body && body.code === "000000") {
          return Promise.resolve({
            ok: false,
            status: 400,
            json: async () => ({ data: { message: "Wrong code" } }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ data: { result: "logged_in" } }),
        });
      }
      if (url.includes("/api/passenger-app/auth/oauth/start")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ data: { authUrl: "http://oauth" } }),
        });
      }
      if (url.includes("/api/passenger-app/me/identities")) {
        if (method === "DELETE") {
          return Promise.resolve({
            ok: true,
            json: async () => ({ data: { success: true } }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: {
              identities: [
                { identityId: "id1", provider: "phone", subject: "0911" },
              ],
            },
          }),
        });
      }
      if (url.includes("/api/passenger-app/me")) {
        if (method === "PATCH") {
          return Promise.resolve({
            ok: true,
            json: async () => ({ data: { success: true } }),
          });
        }
        if (method === "DELETE") {
          return Promise.resolve({
            ok: true,
            json: async () => ({ data: { success: true } }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: {
              account: {
                drtsPassengerId: "pax-1",
                displayName: "Tester",
                contactPhone: "0911",
                contactPhoneVerified: false,
                termsVersion: "v1",
                privacyVersion: "v1",
              },
            },
          }),
        });
      }
      return Promise.reject(new Error("unmocked url: " + url));
    });
    global.fetch = fetchMock;
    globalThis.fetch = fetchMock;
    window.fetch = fetchMock;

    delete (window as any).location;
    window.location = { href: "", origin: "http://localhost" } as any;
  });

  afterEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    vi.useRealTimers();
  });

  it("handles successful phone OTP flow", async () => {
    render(<LoginPage />);
    await waitFor(() =>
      expect(screen.getByPlaceholderText("手機號碼")).toBeDefined(),
    );

    const phoneInput = screen.getByPlaceholderText("手機號碼");
    fireEvent.change(phoneInput, { target: { value: "0912345678" } });

    const loginBtn = screen.getByText("使用手機登入");
    fireEvent.click(loginBtn);

    await waitFor(() =>
      expect(screen.getByText("已發送驗證碼至 0912345678")).toBeDefined(),
    );

    const codeInput = screen.getByPlaceholderText("6位數驗證碼");
    fireEvent.change(codeInput, { target: { value: "123456" } });

    const verifyBtn = screen.getByText("驗證並登入");
    fireEvent.click(verifyBtn);

    await waitFor(() => expect(window.location.href).toBe("/"));
  });

  it("shows error on wrong otp code", async () => {
    render(<LoginPage />);
    await waitFor(() =>
      expect(screen.getByPlaceholderText("手機號碼")).toBeDefined(),
    );

    fireEvent.change(screen.getByPlaceholderText("手機號碼"), {
      target: { value: "0912345678" },
    });
    fireEvent.click(screen.getByText("使用手機登入"));

    await waitFor(() =>
      expect(screen.getByText("已發送驗證碼至 0912345678")).toBeDefined(),
    );

    fireEvent.change(screen.getByPlaceholderText("6位數驗證碼"), {
      target: { value: "000000" },
    });
    fireEvent.click(screen.getByText("驗證並登入"));

    await waitFor(() => expect(screen.getByText(/驗證碼錯誤/)).toBeDefined());
  });

  it("shows contact verification and linking options in account page", async () => {
    render(<AccountPage />);
    await waitFor(() => {
      expect(screen.getByText(/Tester/)).toBeDefined();
      expect(screen.getByText("去驗證")).toBeDefined();
      expect(screen.getByText("綁定 Google")).toBeDefined();
      expect(screen.getByPlaceholderText("綁定 Email")).toBeDefined();
    });
  });

  it("handles zero parameter deleteAccount correctly", async () => {
    render(<AccountPage />);
    await waitFor(() => expect(screen.getByText("刪除帳號")).toBeDefined());
    fireEvent.click(screen.getByText("刪除帳號"));
    await waitFor(() =>
      expect(screen.getByText("確定要刪除帳號嗎？")).toBeDefined(),
    );
    fireEvent.click(screen.getByText("確認刪除"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/passenger-app/me"),
        expect.objectContaining({ method: "DELETE" }),
      );
      const callArgs = fetchMock.mock.calls.find(
        (c: any) => c[0].includes("me") && c[1]?.method === "DELETE",
      );
      expect(callArgs[1].body).toBeUndefined();
    });
  });

  it("handles consent required flow", async () => {
    // Override the generic mock for this test
    const localFetchMock = vi.fn().mockImplementation((url, options) => {
      const opts = options || {};
      const method = opts.method || "GET";
      if (url.includes("/api/passenger-app/auth/providers"))
        return Promise.resolve({
          ok: true,
          json: async () => ({ data: { providers: ["phone", "email"] } }),
        });
      if (url.includes("/api/passenger-app/auth/otp/request"))
        return Promise.resolve({
          ok: true,
          json: async () => ({ data: { success: true, challenge: "chal" } }),
        });
      if (url.includes("/api/passenger-app/auth/otp/verify"))
        return Promise.resolve({
          ok: true,
          json: async () => ({ data: { result: "logged_in" } }),
        });
      if (url.includes("/api/passenger-app/me")) {
        if (method === "PATCH")
          return Promise.resolve({
            ok: true,
            json: async () => ({ data: { success: true } }),
          });
        return Promise.resolve({
          ok: true,
          json: async () => ({ data: { account: { termsVersion: "v1" } } }),
        }); // Missing privacyVersion
      }
      return Promise.reject(new Error("unmocked: " + url));
    });
    window.fetch = localFetchMock;

    render(<LoginPage />);
    await waitFor(() =>
      expect(screen.getByPlaceholderText("手機號碼")).toBeDefined(),
    );
    fireEvent.change(screen.getByPlaceholderText("手機號碼"), {
      target: { value: "0911" },
    });
    fireEvent.click(screen.getByText("使用手機登入"));
    await waitFor(() =>
      expect(screen.getByPlaceholderText("6位數驗證碼")).toBeDefined(),
    );
    fireEvent.change(screen.getByPlaceholderText("6位數驗證碼"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByText("驗證並登入"));
    await waitFor(() => expect(screen.getByText(/我同意/)).toBeDefined());

    // Check consent flow
    fireEvent.click(screen.getByText("同意並繼續"));
    await waitFor(() =>
      expect(screen.getByText("請勾選同意條款與隱私權政策")).toBeDefined(),
    );

    fireEvent.click(screen.getByLabelText(/我同意/));
    fireEvent.click(screen.getByText("同意並繼續"));
    await waitFor(() => expect(window.location.href).toBe("/"));

    // Restore global mock
    window.fetch = fetchMock;
  });

  it("handles OTP cooldown state persistence", async () => {
    // Initial load with active cooldown
    sessionStorage.setItem(
      "otp_login_state",
      JSON.stringify({
        challenge: "chal-persist",
        provider: "phone",
        target: "0988",
        timestamp: Date.now() - 59000, // 59s elapsed, 1s left
      }),
    );

    render(<LoginPage />);
    await waitFor(() =>
      expect(screen.getByText(/已發送驗證碼至 0988/)).toBeDefined(),
    );

    // countdown is active
    expect(screen.getByText(/重送驗證碼/)).toBeDefined();

    // wait for 1+ sec so it expires
    await new Promise((r) => setTimeout(r, 1500));

    await waitFor(() => expect(screen.getByText("重新發送")).toBeDefined());
  });
});
