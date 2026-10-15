import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createUiModuleLoader } from "../system-remediation/sr-wire-001/ui-module-loader";
const appRoot = resolve("apps/bank-console-web");
const identity = {
  accessToken: "server-only",
  tenantId: "verified-issuer",
  scopes: ["tenant:read", "tenant:write"],
  userId: "real-member",
  roleCodes: ["tenant_admin"],
};
const directory = {
  tenantId: "verified-issuer",
  users: [],
  roles: [],
  canManageUsers: true,
  data: { users: [] },
};
const getIdentity = vi.fn(async () => identity);
const read = vi.fn(async () => directory);
class BankUserApiError extends Error {}
const sourcePath = "apps/bank-console-web/app/users/page.tsx";
function page() {
  const identityModule = { getBankUserIdentity: getIdentity, BankUserApiError };
  const dataModule = { loadBankUsersData: read };
  const demoModule = {
    resolveLocale: () => "en",
    resolveBankDemoTenant: () => ({
      tenantId: "query-selected-other-bank",
      code: "other",
      template: { tokens: { dark: { surface: {} } } },
    }),
  };
  const load = createUiModuleLoader(appRoot, {
    react: React,
    "next/link": {
      __esModule: true,
      default: ({
        children,
        href,
      }: {
        children: React.ReactNode;
        href: string;
      }) => React.createElement("a", { href }, children),
    },
    "next/headers": {
      cookies: async () => ({ get: () => ({ value: "display-admin-cookie" }) }),
    },
    "../../lib/bank-user-identity": identityModule,
    "../../lib/bank-dev-read-models": dataModule,
    "@/lib/bank-dev-read-models": dataModule,
    "../../lib/demo-tenants": demoModule,
    "@/lib/demo-tenants": demoModule,
    "./users-management": {
      __esModule: true,
      default: () => React.createElement("div", null, "verified-directory"),
    },
    "@/lib/session": {
      BANK_CONSOLE_SESSION_COOKIE: "display",
      BANK_CONSOLE_ROLE_COOKIE: "role",
      resolveServerSessionRole: () => ({ role: "bank_program_admin" }),
      getBankConsoleSession: () => ({ role: "bank_program_admin" }),
    },
  });
  let path = resolve(sourcePath);
  if (process.env.BANK_USERS_PAGE_REF) {
    mkdirSync(".local/bank-user-management-flow-20261015", { recursive: true });
    path = resolve(
      ".local/bank-user-management-flow-20261015/old-users-page.tsx",
    );
    writeFileSync(
      path,
      execFileSync("git", [
        "show",
        `${process.env.BANK_USERS_PAGE_REF}:${sourcePath}`,
      ]),
    );
  }
  return load<{
    default(props: {
      searchParams: Promise<{ bank: string; role: string }>;
    }): Promise<React.ReactElement>;
  }>(path).default;
}
beforeEach(() => {
  vi.clearAllMocks();
  getIdentity.mockResolvedValue(identity);
});
describe("Bank users page actual authority caller regression", () => {
  it("loads only the verified identity, independently of bank/admin display selectors", async () => {
    const Page = page();
    const element = await Page({
      searchParams: Promise.resolve({
        bank: "other",
        role: "bank_program_admin",
      }),
    });
    expect(read).toHaveBeenCalledExactlyOnceWith(identity);
    expect(renderToStaticMarkup(element)).toContain("verified-directory");
    expect(renderToStaticMarkup(element)).not.toContain("server-only");
  });
  it("display-admin selectors cannot read any users when the principal is missing", async () => {
    getIdentity.mockRejectedValue(new BankUserApiError("No tenant session"));
    const Page = page();
    const element = await Page({
      searchParams: Promise.resolve({
        bank: "other",
        role: "bank_program_admin",
      }),
    });
    expect(read).not.toHaveBeenCalled();
    expect(renderToStaticMarkup(element)).toContain(
      "/api/auth/tenant/login?return_url=%2Fusers",
    );
    expect(renderToStaticMarkup(element)).not.toContain("verified-directory");
  });
});
