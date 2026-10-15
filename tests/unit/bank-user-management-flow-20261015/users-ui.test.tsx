// @vitest-environment jsdom
import * as React from "react";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import * as constants from "../../../packages/tenant-auth/src/constants";
import type { BankUserDirectory } from "../../../apps/bank-console-web/lib/users-data";
import { createUiModuleLoader } from "../system-remediation/sr-wire-001/ui-module-loader";
const appRoot = resolve("apps/bank-console-web");
const load = createUiModuleLoader(appRoot, {
  react: React,
  "@drts/tenant-auth/constants": constants,
});
const UsersManagement = load<{
  default: React.ComponentType<{ initial: BankUserDirectory; locale: "en" }>;
}>(resolve(appRoot, "app/users/users-management.tsx")).default;
const initial: BankUserDirectory = {
  tenantId: "verified-issuer",
  canManageUsers: true,
  roles: [
    {
      roleCode: "tenant_admin",
      displayName: "Tenant Admin",
      description: "Admin",
      assignable: true,
    },
    {
      roleCode: "tenant_viewer",
      displayName: "Tenant Viewer",
      description: "Viewer",
      assignable: true,
    },
    {
      roleCode: "tenant_finance_admin",
      displayName: "Finance",
      description: "Finance",
      assignable: true,
    },
  ],
  users: [
    {
      userId: "canonical-user-123",
      tenantId: "verified-issuer",
      name: "Real Staff",
      email: "staff@original.example",
      roleCode: "tenant_viewer",
      role: "bank_ops_viewer",
      status: "active",
      lastActivity: "2026-10-15T10:00:00Z",
    },
  ],
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function mount(data = initial) {
  document.cookie = `${constants.TENANT_CSRF_COOKIE_NAME}=ui-csrf; path=/`;
  return render(<UsersManagement initial={data} locale="en" />);
}

describe("Bank staff management real component events", () => {
  it("submits an invite with canonical role, CSRF and actual entered email, then renders only confirmed readback", async () => {
    let complete!: (response: Response) => void;
    const fetcher = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          complete = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetcher);
    mount();
    const form = screen.getByRole("form", { name: "Invite user" });
    fireEvent.change(within(form).getByLabelText("Name"), {
      target: { value: "New Staff" },
    });
    fireEvent.change(within(form).getByLabelText("Email"), {
      target: { value: "new@actual.example" },
    });
    fireEvent.change(within(form).getByRole("combobox"), {
      target: { value: "tenant_viewer" },
    });
    fireEvent.submit(form);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/users");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      action: "invite",
      email: "new@actual.example",
      displayName: "New Staff",
      roleCode: "tenant_viewer",
    });
    expect(new Headers(init.headers).get("x-csrf-token")).toBe("ui-csrf");
    expect(
      (within(form).getByRole("button") as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.queryByText("new@actual.example")).toBeNull();
    expect(screen.queryByText("Updated state confirmed.")).toBeNull();
    complete(
      Response.json({
        data: {
          ...initial,
          users: [
            ...initial.users,
            {
              ...initial.users[0],
              userId: "server-invited-id",
              email: "new@actual.example",
              status: "invited",
            },
          ],
        },
      }),
    );
    await screen.findByText("new@actual.example");
    expect(screen.getByText("Updated state confirmed.")).toBeTruthy();
    expect(screen.getByText("staff@original.example")).toBeTruthy();
  });
  it("role form and lifecycle buttons send canonical userId and render active/suspended readback", async () => {
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      const input = JSON.parse(String(init.body));
      const updated = {
        ...initial.users[0],
        ...(input.action === "role"
          ? { roleCode: input.roleCode }
          : { status: input.status }),
      };
      return Response.json({ data: { ...initial, users: [updated] } });
    });
    vi.stubGlobal("fetch", fetcher);
    mount();
    const form = screen.getByRole("form", {
      name: "Change role: staff@original.example",
    });
    fireEvent.change(within(form).getByRole("combobox"), {
      target: { value: "tenant_finance_admin" },
    });
    fireEvent.submit(form);
    await screen.findByText("tenant_finance_admin", {
      selector: ".role-pill-code",
    });
    expect(JSON.parse(String(fetcher.mock.calls[0]![1].body))).toEqual({
      action: "role",
      userId: "canonical-user-123",
      roleCode: "tenant_finance_admin",
    });
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "Suspend" }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole("button", { name: "Suspend" }));
    await screen.findByText("Suspended", { selector: ".table-status" });
    expect(JSON.parse(String(fetcher.mock.calls[1]![1].body))).toEqual({
      action: "status",
      userId: "canonical-user-123",
      status: "suspended",
    });
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Reactivate",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole("button", { name: "Reactivate" }));
    await screen.findByText("Active", { selector: ".table-status" });
    expect(JSON.parse(String(fetcher.mock.calls[2]![1].body))).toEqual({
      action: "status",
      userId: "canonical-user-123",
      status: "active",
    });
  });
  it("read-only users and pending invitations cannot invoke forbidden controls", () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    mount({ ...initial, canManageUsers: false });
    expect(
      (
        screen.getByRole("button", {
          name: "Invite member",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    const button = screen.getByRole("button", { name: "Suspend" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button);
    expect(fetcher).not.toHaveBeenCalled();
    cleanup();
    mount({ ...initial, users: [{ ...initial.users[0]!, status: "invited" }] });
    expect(
      (screen.getByRole("button", { name: "Suspend" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
  it("session denial clears previously visible users and preserves the backend error without success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { error: { code: "JWT_INVALID", message: "Session was revoked" } },
          { status: 401 },
        ),
      ),
    );
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Suspend" }));
    await screen.findByText("JWT_INVALID: Session was revoked");
    expect(screen.queryByText("staff@original.example")).toBeNull();
    expect(
      screen
        .getByRole("link", { name: "Sign in with tenant account" })
        .getAttribute("href"),
    ).toBe("/api/auth/tenant/login?return_url=%2Fusers");
    expect(screen.queryByText("Updated state confirmed.")).toBeNull();
  });
});
