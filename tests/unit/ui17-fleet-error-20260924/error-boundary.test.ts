import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import FleetPortalError from "../../../apps/fleet-partner-portal-web/app/error";
import "@testing-library/jest-dom";

// Mock fetch
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
  })
) as jest.Mock;

describe("FleetPortalError", () => {
  const mockReset = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    delete (window as any).location;
    window.location = { href: "" } as any;
  });

  it("renders generic error and handles reset", () => {
    const error = new Error("Some generic error");
    render(FleetPortalError({ error, reset: mockReset }) as any);

    expect(screen.getByText("頁面發生錯誤")).toBeInTheDocument();
    expect(screen.getByText("這個頁面暫時無法顯示")).toBeInTheDocument();
    
    // retry button
    const retryBtn = screen.getByText("重試");
    fireEvent.click(retryBtn);
    expect(mockReset).toHaveBeenCalled();
  });

  it("renders scope error and handles logout", async () => {
    const error = new Error("Missing fleet scope configuration");
    render(FleetPortalError({ error, reset: mockReset }) as any);

    expect(screen.getByText("缺少車隊身分")).toBeInTheDocument();
    expect(screen.getByText("無法辨識您所屬的車隊")).toBeInTheDocument();

    const logoutBtn = screen.getByText("登出");
    fireEvent.click(logoutBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/auth/logout", { method: "POST" });
      expect(window.location.href).toBe("/");
    });
  });
});
