// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import React from "react";
import LoginPage from "../../../apps/passenger-app-web/app/login/page";
import AccountPage from "../../../apps/passenger-app-web/app/account/page";

describe("Auth UI", () => {
  let fetchMock: any;

  beforeEach(() => {
    fetchMock = vi.fn().mockImplementation((url) => {
      if (url.includes("/api/passenger-app/auth/providers")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ data: { providers: ["phone", "google"] } }),
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
        if (url.endsWith("id1")) {
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
                {
                  identityId: "id2",
                  provider: "google",
                  subject: "user@g.com",
                },
              ],
            },
          }),
        });
      }
      if (url.includes("/api/passenger-app/me")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: {
              account: {
                drtsPassengerId: "pax-1",
                displayName: "Tester",
                contactPhone: "0911",
                contactPhoneVerified: true,
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

    // Also mock window.location.href setter for redirects
    delete (window as any).location;
    window.location = { href: "", origin: "http://localhost" } as any;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Login Methods", () => {
    it("shows enabled login methods correctly", async () => {
      render(<LoginPage />);
      await waitFor(() => {
        expect(screen.getByPlaceholderText("手機號碼")).toBeDefined();
      });
    });

    it("handles successful phone OTP flow", async () => {
      render(<LoginPage />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText("手機號碼")).toBeDefined();
      });

      fireEvent.change(screen.getByPlaceholderText("手機號碼"), {
        target: { value: "0912345678" },
      });
      fireEvent.click(screen.getByText("使用手機登入"));

      await waitFor(() => {
        expect(screen.getByText("已發送驗證碼至 0912345678")).toBeDefined();
      });

      fireEvent.change(screen.getByPlaceholderText("6位數驗證碼"), {
        target: { value: "123456" },
      });
      fireEvent.click(screen.getByText("驗證並登入"));

      await waitFor(() => {
        expect(window.location.href).toBe("/");
      });
    });
  });

  describe("Account Management", () => {
    it("renders profile and identities", async () => {
      render(<AccountPage />);
      await waitFor(() => {
        expect(screen.getByText(/Tester/)).toBeDefined();
        expect(screen.getAllByText(/0911/).length).toBeGreaterThan(0);
        expect(screen.getByText(/\(已驗證\)/)).toBeDefined();
        expect(screen.getByText(/user@g\.com/)).toBeDefined();
      });
    });

    it("handles unlink identity", async () => {
      render(<AccountPage />);
      await waitFor(() => {
        expect(screen.getAllByText("解除綁定").length).toBe(2);
      });

      fireEvent.click(screen.getAllByText("解除綁定")[0]);
      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining("/identities/id1"),
          expect.objectContaining({ method: "DELETE" }),
        );
      });
    });

    it("shows delete confirmation and executes delete", async () => {
      render(<AccountPage />);
      await waitFor(() => {
        expect(screen.getByText("刪除帳號")).toBeDefined();
      });

      fireEvent.click(screen.getByText("刪除帳號"));
      await waitFor(() => {
        expect(screen.getByText("確定要刪除帳號嗎？")).toBeDefined();
      });

      fireEvent.click(screen.getByText("確認刪除"));
      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining("/api/passenger-app/me"),
          expect.objectContaining({ method: "DELETE" }),
        );
      });
    });
  });
});
